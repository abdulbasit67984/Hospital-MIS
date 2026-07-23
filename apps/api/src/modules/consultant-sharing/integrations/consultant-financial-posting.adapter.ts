import Decimal from 'decimal.js';

import {
  FinancialLedgerAccountModel,
  FinancialLedgerEntryModel,
  FinancialLedgerTransactionModel,
  createObjectId,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import { ConsultantRevenueReconciliationError } from '../consultant-sharing.errors.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantFinancialAdjustmentLedgerPort,
  ConsultantFinancialLedgerPort,
  ConsultantPayoutPort,
  ConsultantSharingTransactionContext,
} from '../consultant-sharing.ports.js';

export interface ConsultantLedgerPostingConfiguration {
  consultantLiabilityAccountCode: string;
  hospitalRevenueAccountCode: string;
  consultantSettlementClearingAccountCode: string;
  consultantPayoutClearingAccountCode: string;
  consultantTaxWithholdingAccountCode: string;
  consultantDeductionClearingAccountCode: string;
}

export interface ConsultantPaymentExecutionGateway {
  execute(input: Readonly<{
    facilityId: string;
    settlementId: string;
    consultantId: string;
    amount: string;
    paymentMethodId: string;
    paymentReference: string;
    cashierShiftId: string | null;
    approvalRequestId: string;
    operationKey: string;
    actorUserId: string;
    correlationId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    paymentId: string;
    status: string;
    amount: string;
    occurredAt: string;
  }>>;

  reverse(input: Readonly<{
    facilityId: string;
    settlementId: string;
    consultantId: string;
    paymentId: string;
    amount: string;
    reason: string;
    approvalRequestId: string;
    operationKey: string;
    actorUserId: string;
    correlationId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    paymentReversalId: string;
    status: string;
    amount: string;
    occurredAt: string;
  }>>;
}

interface LedgerLine {
  accountCode: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  description: string;
}

interface PostLedgerInput {
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  operationKey: string;
  currency: string;
  occurredAt: Date;
  description: string;
  lines: readonly LedgerLine[];
  transaction: ConsultantSharingTransactionContext;
  patientId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
}

function amount(value: Decimal.Value): string {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new ConsultantRevenueReconciliationError('Ledger posting amounts must be finite and non-negative');
  }
  return parsed.toFixed(2);
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

export class MongoConsultantFinancialPostingAdapter
implements
  ConsultantFinancialLedgerPort,
  ConsultantFinancialAdjustmentLedgerPort,
  ConsultantPayoutPort {
  public constructor(
    private readonly configuration: ConsultantLedgerPostingConfiguration,
    private readonly paymentGateway: ConsultantPaymentExecutionGateway,
  ) {}

  public async postConsultantLiability(
    input: Parameters<ConsultantFinancialLedgerPort['postConsultantLiability']>[0],
  ): Promise<Readonly<{ ledgerEntryId: string }>> {
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_REVENUE_ENTRY',
      sourceEntityId: input.revenueEntryId,
      operationKey: `consultant-liability:${input.revenueEntryId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Recognize consultant liability and hospital retained revenue',
      invoiceId: input.invoiceId,
      lines: [
        {
          accountCode: this.configuration.hospitalRevenueAccountCode,
          direction: 'DEBIT',
          amount: input.consultantShare,
          description: 'Consultant share transferred from hospital revenue',
        },
        {
          accountCode: this.configuration.consultantLiabilityAccountCode,
          direction: 'CREDIT',
          amount: input.consultantShare,
          description: 'Consultant liability recognized',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerEntryId: result.entryIds[1] ?? result.entryIds[0] ?? '' };
  }

  public async postSettlement(
    input: Parameters<ConsultantFinancialLedgerPort['postSettlement']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string; ledgerEntryIds: readonly string[] }>> {
    const totalDeductions = new Decimal(input.totalDeductions);
    const taxWithholding = new Decimal(input.taxWithholding);
    const otherDeductions = totalDeductions.minus(taxWithholding);
    if (otherDeductions.isNegative()) {
      throw new ConsultantRevenueReconciliationError('Settlement tax withholding cannot exceed total deductions');
    }
    const grossLiability = new Decimal(input.netPayable).plus(totalDeductions);
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_SETTLEMENT',
      sourceEntityId: input.settlementId,
      operationKey: `consultant-settlement:${input.settlementId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Lock consultant settlement payable and approved deductions',
      lines: [
        {
          accountCode: this.configuration.consultantLiabilityAccountCode,
          direction: 'DEBIT',
          amount: grossLiability.toFixed(2),
          description: 'Consultant liability moved to settlement and deduction clearing',
        },
        {
          accountCode: this.configuration.consultantSettlementClearingAccountCode,
          direction: 'CREDIT',
          amount: input.netPayable,
          description: 'Approved consultant settlement payable',
        },
        {
          accountCode: this.configuration.consultantTaxWithholdingAccountCode,
          direction: 'CREDIT',
          amount: taxWithholding.toFixed(2),
          description: 'Consultant tax withholding payable',
        },
        {
          accountCode: this.configuration.consultantDeductionClearingAccountCode,
          direction: 'CREDIT',
          amount: otherDeductions.toFixed(2),
          description: 'Consultant approved deduction clearing',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId, ledgerEntryIds: result.entryIds };
  }

  public async reverseSettlement(
    input: Parameters<ConsultantFinancialLedgerPort['reverseSettlement']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string; ledgerEntryIds: readonly string[] }>> {
    const totalDeductions = new Decimal(input.totalDeductions);
    const taxWithholding = new Decimal(input.taxWithholding);
    const otherDeductions = totalDeductions.minus(taxWithholding);
    if (otherDeductions.isNegative()) {
      throw new ConsultantRevenueReconciliationError('Settlement tax withholding cannot exceed total deductions');
    }
    const grossLiability = new Decimal(input.netPayable).plus(totalDeductions);
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_SETTLEMENT_REVERSAL',
      sourceEntityId: input.settlementId,
      operationKey: `consultant-settlement-reversal:${input.settlementId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: `Reverse consultant settlement: ${input.reason}`,
      lines: [
        {
          accountCode: this.configuration.consultantSettlementClearingAccountCode,
          direction: 'DEBIT',
          amount: input.netPayable,
          description: 'Approved consultant settlement clearing reversed',
        },
        {
          accountCode: this.configuration.consultantTaxWithholdingAccountCode,
          direction: 'DEBIT',
          amount: taxWithholding.toFixed(2),
          description: 'Consultant tax withholding reversed',
        },
        {
          accountCode: this.configuration.consultantDeductionClearingAccountCode,
          direction: 'DEBIT',
          amount: otherDeductions.toFixed(2),
          description: 'Consultant approved deductions reversed',
        },
        {
          accountCode: this.configuration.consultantLiabilityAccountCode,
          direction: 'CREDIT',
          amount: grossLiability.toFixed(2),
          description: 'Consultant liability restored after settlement reversal',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId, ledgerEntryIds: result.entryIds };
  }

  public async postRevenueAdjustment(
    input: Parameters<ConsultantFinancialAdjustmentLedgerPort['postRevenueAdjustment']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string }>> {
    const delta = new Decimal(input.consultantShareDelta);
    const absolute = amount(delta.abs());
    const positive = delta.greaterThanOrEqualTo(0);
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_REVENUE_ADJUSTMENT',
      sourceEntityId: input.adjustmentId,
      operationKey: `consultant-adjustment:${input.adjustmentId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Consultant revenue delta adjustment',
      lines: [
        {
          accountCode: this.configuration.hospitalRevenueAccountCode,
          direction: positive ? 'DEBIT' : 'CREDIT',
          amount: absolute,
          description: 'Hospital revenue adjustment',
        },
        {
          accountCode: this.configuration.consultantLiabilityAccountCode,
          direction: positive ? 'CREDIT' : 'DEBIT',
          amount: absolute,
          description: 'Consultant liability adjustment',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId };
  }

  public async postRevenueReversal(
    input: Parameters<ConsultantFinancialAdjustmentLedgerPort['postRevenueReversal']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string }>> {
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_REVENUE_REVERSAL',
      sourceEntityId: input.reversalRevenueEntryId,
      operationKey: `consultant-reversal:${input.reversalRevenueEntryId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Reverse consultant liability recognition',
      lines: [
        {
          accountCode: this.configuration.consultantLiabilityAccountCode,
          direction: 'DEBIT',
          amount: input.consultantShareAmount,
          description: 'Consultant liability reversed',
        },
        {
          accountCode: this.configuration.hospitalRevenueAccountCode,
          direction: 'CREDIT',
          amount: input.consultantShareAmount,
          description: 'Hospital revenue restored',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId };
  }

  public async postPayout(
    input: Parameters<ConsultantFinancialAdjustmentLedgerPort['postPayout']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string }>> {
    const otherDeductions = new Decimal(input.otherDeductionAmount);
    const credits = new Decimal(input.netDisbursedAmount)
      .plus(input.taxWithholdingAmount)
      .plus(otherDeductions);
    if (!credits.equals(input.amount)) {
      throw new ConsultantRevenueReconciliationError('Consultant payout disbursement and deductions must equal the approved payout amount');
    }
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_PAYOUT',
      sourceEntityId: input.settlementPaymentId,
      operationKey: `consultant-payout-ledger:${input.settlementPaymentId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Post consultant settlement payout and deductions',
      paymentId: input.paymentId,
      lines: [
        {
          accountCode: this.configuration.consultantSettlementClearingAccountCode,
          direction: 'DEBIT',
          amount: input.amount,
          description: 'Approved consultant settlement cleared',
        },
        {
          accountCode: this.configuration.consultantPayoutClearingAccountCode,
          direction: 'CREDIT',
          amount: input.netDisbursedAmount,
          description: 'Consultant net payout clearing',
        },
        {
          accountCode: this.configuration.consultantTaxWithholdingAccountCode,
          direction: 'CREDIT',
          amount: input.taxWithholdingAmount,
          description: 'Consultant payout tax withholding',
        },
        {
          accountCode: this.configuration.consultantDeductionClearingAccountCode,
          direction: 'CREDIT',
          amount: otherDeductions.toFixed(2),
          description: 'Consultant payout deductions and recoveries',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId };
  }

  public async postPayoutReversal(
    input: Parameters<ConsultantFinancialAdjustmentLedgerPort['postPayoutReversal']>[0],
  ): Promise<Readonly<{ ledgerTransactionId: string }>> {
    const otherDeductions = new Decimal(input.otherDeductionAmount);
    const debits = new Decimal(input.netDisbursedAmount)
      .plus(input.taxWithholdingAmount)
      .plus(otherDeductions);
    if (!debits.equals(input.amount)) {
      throw new ConsultantRevenueReconciliationError('Payout-reversal components must equal the original approved payout amount');
    }
    const result = await this.postBalanced({
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      sourceEntityType: 'CONSULTANT_PAYOUT_REVERSAL',
      sourceEntityId: input.originalSettlementPaymentId,
      operationKey: `consultant-payout-reversal-ledger:${input.paymentReversalId}`,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: 'Reverse consultant settlement payout and deductions',
      paymentId: input.paymentReversalId,
      lines: [
        {
          accountCode: this.configuration.consultantPayoutClearingAccountCode,
          direction: 'DEBIT',
          amount: input.netDisbursedAmount,
          description: 'Consultant net payout clearing reversed',
        },
        {
          accountCode: this.configuration.consultantTaxWithholdingAccountCode,
          direction: 'DEBIT',
          amount: input.taxWithholdingAmount,
          description: 'Consultant payout tax withholding reversed',
        },
        {
          accountCode: this.configuration.consultantDeductionClearingAccountCode,
          direction: 'DEBIT',
          amount: otherDeductions.toFixed(2),
          description: 'Consultant payout deductions and recoveries reversed',
        },
        {
          accountCode: this.configuration.consultantSettlementClearingAccountCode,
          direction: 'CREDIT',
          amount: input.amount,
          description: 'Consultant settlement payable restored',
        },
      ],
      transaction: input.transaction,
    });
    return { ledgerTransactionId: result.transactionId };
  }

  public async createPayout(
    input: Parameters<ConsultantPayoutPort['createPayout']>[0],
  ): ReturnType<ConsultantPayoutPort['createPayout']> {
    return this.paymentGateway.execute({
      facilityId: input.actor.facilityId,
      settlementId: input.settlementId,
      consultantId: input.consultantId,
      amount: amount(input.amount),
      paymentMethodId: input.paymentMethodId,
      paymentReference: input.paymentReference,
      cashierShiftId: input.cashierShiftId,
      approvalRequestId: input.approvalRequestId,
      operationKey: input.operationKey,
      actorUserId: input.actor.userId,
      correlationId: input.actor.correlationId,
      transaction: input.transaction,
    });
  }

  public async reversePayout(
    input: Parameters<ConsultantPayoutPort['reversePayout']>[0],
  ): ReturnType<ConsultantPayoutPort['reversePayout']> {
    return this.paymentGateway.reverse({
      facilityId: input.actor.facilityId,
      settlementId: input.settlementId,
      consultantId: input.consultantId,
      paymentId: input.paymentId,
      amount: amount(input.amount),
      reason: input.reason,
      approvalRequestId: input.approvalRequestId,
      operationKey: input.operationKey,
      actorUserId: input.actor.userId,
      correlationId: input.actor.correlationId,
      transaction: input.transaction,
    });
  }

  private async postBalanced(input: PostLedgerInput): Promise<Readonly<{
    transactionId: string;
    entryIds: readonly string[];
  }>> {
    const normalizedLines = input.lines
      .map((line) => ({ ...line, accountCode: normalizeCode(line.accountCode), amount: amount(line.amount) }))
      .filter((line) => new Decimal(line.amount).greaterThan(0));
    if (normalizedLines.length < 2) {
      throw new ConsultantRevenueReconciliationError('Balanced consultant ledger posting requires at least two non-zero lines');
    }
    const debit = normalizedLines
      .filter((line) => line.direction === 'DEBIT')
      .reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
    const credit = normalizedLines
      .filter((line) => line.direction === 'CREDIT')
      .reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
    if (!debit.equals(credit)) {
      throw new ConsultantRevenueReconciliationError('Consultant ledger transaction is not balanced');
    }

    const accountCodes = [...new Set(normalizedLines.map((line) => line.accountCode))];
    const accounts = await FinancialLedgerAccountModel.find({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      accountCode: { $in: accountCodes },
      active: true,
      allowDirectPosting: true,
    })
      .session(input.transaction.session as never)
      .lean()
      .exec();
    const byCode = new Map(accounts.map((account) => [account.accountCode, account]));
    for (const code of accountCodes) {
      if (!byCode.has(code)) {
        throw new ConsultantRevenueReconciliationError(`Consultant ledger account ${code} is not active for direct posting`);
      }
    }

    const transactionId = createObjectId();
    const operationHash = stableConsultantSharingPayloadHash({
      facilityId: input.facilityId,
      operationKey: input.operationKey,
    });
    const common = {
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      transactionId: input.transaction.transactionId,
      correlationId: input.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: toObjectId(input.actorUserId, 'createdBy'),
      updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
    };
    await FinancialLedgerTransactionModel.create([{
      _id: transactionId,
      ...common,
      operationKey: input.operationKey,
      journalNumber: `CS-${operationHash.slice(0, 24).toUpperCase()}`,
      sourceModule: 'CONSULTANT_SHARING',
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: toObjectId(input.sourceEntityId, 'sourceEntityId'),
      patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
      patientAccountId: null,
      invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
      paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
      cashShiftId: null,
      cashCounterId: null,
      currency: normalizeCode(input.currency),
      totalDebit: decimalStringToDecimal128(debit.toFixed(2)),
      totalCredit: decimalStringToDecimal128(credit.toFixed(2)),
      entryCount: normalizedLines.length,
      status: 'POSTED',
      postedAt: input.occurredAt,
      postedBy: toObjectId(input.actorUserId, 'postedBy'),
      description: input.description,
      reversalOfTransactionId: null,
      reversedByTransactionId: null,
      reversalReason: null,
      closedPeriodCode: null,
    }], { session: input.transaction.session as never });

    const entries = normalizedLines.map((line, index) => ({
      _id: createObjectId(),
      ...common,
      ledgerTransactionId: transactionId,
      lineNumber: index + 1,
      ledgerAccountId: (byCode.get(line.accountCode) as { _id: unknown })._id,
      ledgerAccountCodeSnapshot: line.accountCode,
      direction: line.direction,
      amount: decimalStringToDecimal128(line.amount),
      currency: normalizeCode(input.currency),
      patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
      patientAccountId: null,
      invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
      paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
      departmentId: null,
      serviceLineCode: 'CONSULTANT_SHARING',
      chargeCatalogItemId: null,
      description: line.description,
      postedAt: input.occurredAt,
    }));
    await FinancialLedgerEntryModel.create(entries, { session: input.transaction.session as never });
    return {
      transactionId: transactionId.toHexString(),
      entryIds: entries.map((entry) => entry._id.toHexString()),
    };
  }
}
