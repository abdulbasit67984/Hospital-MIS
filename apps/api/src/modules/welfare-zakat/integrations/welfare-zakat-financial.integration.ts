import Decimal from 'decimal.js';

import {
  AssistanceFundModel,
  AssistanceReservationModel,
  ClaimAdjustmentModel,
  ClaimLineModel,
  ClaimModel,
  CreditNoteModel,
  DebitNoteModel,
  FinancialLedgerAccountModel,
  FinancialLedgerEntryModel,
  FinancialLedgerTransactionModel,
  FundReturnModel,
  FundTransactionModel,
  InvoiceFundAllocationModel,
  InvoiceLineModel,
  InvoiceModel,
  PatientAccountModel,
  PaymentModel,
  RefundModel,
  createObjectId,
  decimal128ToString,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import {
  AssistanceFinancialReconciliationError,
  AssistanceInvoiceBalanceExceededError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import { stableAssistancePayloadHash } from '../welfare-zakat.normalization.js';
import type {
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatCoverageClaimsCoordinationPort,
  WelfareZakatFinancialDischargePort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatReconciliationPort,
  WelfareZakatTransactionContext,
} from '../welfare-zakat.ports.js';
import type {
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';

export interface WelfareZakatLedgerPostingRule {
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
}

export interface WelfareZakatFinancialIntegrationConfiguration {
  eventRules: Readonly<Record<string, WelfareZakatLedgerPostingRule>>;
}

const terminalClaimStatuses = new Set([
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'REJECTED',
  'PAID',
  'CLOSED',
  'CANCELLED',
  'REVERSED',
  'VOIDED',
]);

function money(value: Decimal.Value): Decimal {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite()) {
    throw new AssistanceFinancialReconciliationError('Invalid financial amount');
  }
  return parsed;
}

function moneyString(value: Decimal.Value): string {
  return money(value).toFixed(2);
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function serviceCategory(value: string): string {
  const normalized = normalizeCode(value);
  const mappings: Readonly<Record<string, string>> = {
    REGISTRATION: 'REGISTRATION',
    CONSULTATION: 'CONSULTATION',
    ENCOUNTER: 'ENCOUNTER',
    ADMISSION: 'ADMISSION',
    BED: 'BED',
    ROOM: 'BED',
    ICU: 'BED',
    PROCEDURE: 'PROCEDURE',
    SURGERY: 'SURGERY',
    LAB: 'LABORATORY',
    LABORATORY: 'LABORATORY',
    RADIOLOGY: 'RADIOLOGY',
    PHARMACY: 'PHARMACY',
    PACKAGE: 'PACKAGE',
  };
  return mappings[normalized] ?? 'MISCELLANEOUS';
}

function netAllocationAmount(allocation: Readonly<Record<string, unknown>>): Decimal {
  return money(String(allocation['utilizedAmount'] ?? '0'))
    .minus(money(String(allocation['reversedAmount'] ?? '0')))
    .minus(money(String(allocation['refundedAmount'] ?? '0')))
    .minus(money(String(allocation['repaidAmount'] ?? '0')))
    .minus(money(String(allocation['recoveredAmount'] ?? '0')));
}

function lineNetAmount(line: Readonly<Record<string, unknown>>): Decimal {
  return money(String(line['utilizedAmount'] ?? '0'))
    .minus(money(String(line['reversedAmount'] ?? '0')))
    .minus(money(String(line['refundedAmount'] ?? '0')))
    .minus(money(String(line['repaidAmount'] ?? '0')))
    .minus(money(String(line['recoveredAmount'] ?? '0')));
}

type FundReturnSourceField =
  | 'paymentId'
  | 'refundId'
  | 'creditNoteId'
  | 'debitNoteId'
  | 'claimAdjustmentId';

export class MongoWelfareZakatFinancialIntegration
implements
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatCoverageClaimsCoordinationPort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatFinancialDischargePort,
  WelfareZakatReconciliationPort {
  public constructor(
    private readonly configuration: WelfareZakatFinancialIntegrationConfiguration,
  ) {}

  private async assertFundReturnSourceCapacity(input: Readonly<{
    facilityId: ReturnType<typeof toObjectId>;
    sourceField: FundReturnSourceField;
    sourceRecordId: ReturnType<typeof toObjectId>;
    sourceAmount: Decimal.Value;
    requestedAmount: Decimal;
    session: WelfareZakatMongoSession;
  }>): Promise<void> {
    const sourceFilter: Readonly<Record<string, unknown>> = {
      facilityId: input.facilityId,
      [input.sourceField]: input.sourceRecordId,
      reversedAt: null,
    };
    const previousReturns = await FundReturnModel.find(sourceFilter)
      .session(input.session)
      .lean()
      .exec();
    const alreadyReturned = previousReturns.reduce(
      (total, fundReturn) => total.plus(
        money(decimal128ToString(fundReturn.amount)),
      ),
      new Decimal(0),
    );
    const remaining = money(input.sourceAmount).minus(alreadyReturned);
    if (remaining.isNegative() || input.requestedAmount.greaterThan(remaining)) {
      throw new AssistanceFinancialReconciliationError(
        'The authoritative financial source has already been fully or partially returned to assistance funds',
      );
    }
  }

  public async loadAllocationSource(
    input: Parameters<WelfareZakatAuthoritativeBillingPort['loadAllocationSource']>[0],
  ): ReturnType<WelfareZakatAuthoritativeBillingPort['loadAllocationSource']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const patientId = toObjectId(input.patientId, 'patientId');
    const patientAccountId = toObjectId(input.patientAccountId, 'patientAccountId');
    const invoiceId = toObjectId(input.invoiceId, 'invoiceId');
    const lineIds = input.invoiceLineIds.map((id) => toObjectId(id, 'invoiceLineId'));

    const [patientAccount, invoice, lines] = await Promise.all([
      PatientAccountModel.findOne({
        _id: patientAccountId,
        facilityId,
        patientId,
        status: { $in: ['OPEN', 'FINALIZED'] },
      }).session(input.session).lean().exec(),
      InvoiceModel.findOne({
        _id: invoiceId,
        facilityId,
        patientId,
        patientAccountId,
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID'] },
      }).session(input.session).lean().exec(),
      InvoiceLineModel.find({
        facilityId,
        invoiceId,
        patientAccountId,
        ...(lineIds.length === 0 ? {} : { _id: { $in: lineIds } }),
      }).sort({ lineNumber: 1 }).session(input.session).lean().exec(),
    ]);

    if (patientAccount === null || invoice === null) {
      throw new AssistanceFinancialReconciliationError(
        'Patient account or finalized invoice was not found',
      );
    }
    if (lineIds.length > 0 && lines.length !== lineIds.length) {
      throw new AssistanceFinancialReconciliationError(
        'One or more requested invoice lines do not belong to the invoice',
      );
    }

    const claimLines = lines.length === 0
      ? []
      : await ClaimLineModel.find({
          facilityId,
          invoiceLineId: { $in: lines.map((line) => line._id) },
          ...(input.claimId == null
            ? {}
            : { claimId: toObjectId(input.claimId, 'claimId') }),
        })
          .sort({ updatedAt: -1, _id: -1 })
          .session(input.session)
          .lean()
          .exec();
    const claimLineByInvoiceLine = new Map<string, (typeof claimLines)[number]>();
    for (const claimLine of claimLines) {
      const key = claimLine.invoiceLineId.toHexString();
      if (!claimLineByInvoiceLine.has(key)) {
        claimLineByInvoiceLine.set(key, claimLine);
      }
    }

    return {
      patientAccount: {
        id: patientAccount._id.toHexString(),
        patientId: patientAccount.patientId.toHexString(),
        status: patientAccount.status,
        currency: patientAccount.currency,
        patientResponsibilityAmount: decimal128ToString(
          patientAccount.patientResponsibilityTotal,
        ),
        welfareAmount: decimal128ToString(patientAccount.welfareTotal),
        payerResponsibilityAmount: decimal128ToString(
          patientAccount.payerResponsibilityTotal,
        ),
        outstandingAmount: decimal128ToString(patientAccount.outstandingBalance),
      },
      invoice: {
        id: invoice._id.toHexString(),
        patientId: invoice.patientId.toHexString(),
        patientAccountId: invoice.patientAccountId.toHexString(),
        status: invoice.status,
        currency: invoice.currency,
        netAmount: decimal128ToString(invoice.netAmount),
        payerAmount: decimal128ToString(invoice.payerAmount),
        welfareAmount: decimal128ToString(invoice.welfareAmount),
        patientAmount: decimal128ToString(invoice.patientAmount),
        outstandingAmount: decimal128ToString(invoice.outstandingAmount),
        refundableAmount: decimal128ToString(invoice.refundableAmount),
        finalizedAt: invoice.finalizedAt,
      },
      lines: lines.map((line) => {
        const claimLine = claimLineByInvoiceLine.get(line._id.toHexString());
        return {
          invoiceLineId: line._id.toHexString(),
          sourceModule: line.sourceModuleSnapshot,
          sourceRecordId: line.sourceRecordId?.toHexString() ?? null,
          departmentId: line.departmentId?.toHexString() ?? null,
          serviceCategory: serviceCategory(line.categoryCodeSnapshot),
          serviceCode: line.serviceCodeSnapshot,
          netAmount: decimal128ToString(line.netAmount),
          payerAmount: decimal128ToString(line.payerAmount),
          welfareAmount: decimal128ToString(line.welfareAmount),
          patientAmount: decimal128ToString(line.patientAmount),
          outstandingAmount: decimal128ToString(line.patientAmount),
          packageEnrollmentId: line.packageEnrollmentId?.toHexString() ?? null,
          patientCoverageId: line.patientCoverageId?.toHexString() ?? null,
          claimableAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.claimedAmount),
          claimApprovedAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.approvedAmount),
          claimPaidAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.paidAmount),
        };
      }),
    };
  }

  public async assertFundReturnSource(
    input: Parameters<WelfareZakatAuthoritativeBillingPort['assertFundReturnSource']>[0],
  ): ReturnType<WelfareZakatAuthoritativeBillingPort['assertFundReturnSource']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const requestedAmount = money(input.amount);
    const minimumAmount = decimalStringToDecimal128(requestedAmount.toFixed(2));
    const patientAccountId = input.allocation.patientAccountId;
    const invoiceId = input.allocation.invoiceId;

    if (input.returnType === 'REFUND' && input.refundId != null) {
      const refund = await RefundModel.findOne({
        _id: toObjectId(input.refundId, 'refundId'),
        facilityId,
        patientAccountId,
        status: 'POSTED',
        reversedAt: null,
        amount: { $gte: minimumAmount },
        allocationEffects: { $elemMatch: { invoiceId } },
      }).session(input.session).lean().exec();
      if (refund?.postedBy == null) {
        throw new AssistanceFinancialReconciliationError(
          'Posted refund does not reconcile with the assistance allocation',
        );
      }
      await this.assertFundReturnSourceCapacity({
        facilityId,
        sourceField: 'refundId',
        sourceRecordId: refund._id,
        sourceAmount: decimal128ToString(refund.amount),
        requestedAmount,
        session: input.session,
      });
      return {
        makerUserId: refund.postedBy.toHexString(),
        sourceRecordId: refund._id.toHexString(),
      };
    }

    if (input.returnType === 'REFUND' && input.creditNoteId != null) {
      const creditNote = await CreditNoteModel.findOne({
        _id: toObjectId(input.creditNoteId, 'creditNoteId'),
        facilityId,
        patientAccountId,
        invoiceId,
        status: 'POSTED',
        reversedAt: null,
        amount: { $gte: minimumAmount },
      }).session(input.session).lean().exec();
      if (creditNote?.postedBy == null) {
        throw new AssistanceFinancialReconciliationError(
          'Posted credit note does not reconcile with the assistance allocation',
        );
      }
      await this.assertFundReturnSourceCapacity({
        facilityId,
        sourceField: 'creditNoteId',
        sourceRecordId: creditNote._id,
        sourceAmount: decimal128ToString(creditNote.amount),
        requestedAmount,
        session: input.session,
      });
      return {
        makerUserId: creditNote.postedBy.toHexString(),
        sourceRecordId: creditNote._id.toHexString(),
      };
    }

    if (input.returnType === 'REPAYMENT' && input.paymentId != null) {
      const payment = await PaymentModel.findOne({
        _id: toObjectId(input.paymentId, 'paymentId'),
        facilityId,
        patientAccountId,
        status: 'POSTED',
        reversalId: null,
        amount: { $gte: minimumAmount },
      }).session(input.session).lean().exec();
      if (payment?.postedBy == null) {
        throw new AssistanceFinancialReconciliationError(
          'Posted repayment does not reconcile with the assistance allocation',
        );
      }
      await this.assertFundReturnSourceCapacity({
        facilityId,
        sourceField: 'paymentId',
        sourceRecordId: payment._id,
        sourceAmount: decimal128ToString(payment.amount),
        requestedAmount,
        session: input.session,
      });
      return {
        makerUserId: payment.postedBy.toHexString(),
        sourceRecordId: payment._id.toHexString(),
      };
    }

    if (
      (input.returnType === 'REPAYMENT' || input.returnType === 'RECOVERY') &&
      input.debitNoteId != null
    ) {
      const debitNote = await DebitNoteModel.findOne({
        _id: toObjectId(input.debitNoteId, 'debitNoteId'),
        facilityId,
        patientAccountId,
        invoiceId,
        status: 'POSTED',
        reversedAt: null,
        amount: { $gte: minimumAmount },
      }).session(input.session).lean().exec();
      if (debitNote?.postedBy == null) {
        throw new AssistanceFinancialReconciliationError(
          'Posted debit note does not reconcile with the assistance allocation',
        );
      }
      await this.assertFundReturnSourceCapacity({
        facilityId,
        sourceField: 'debitNoteId',
        sourceRecordId: debitNote._id,
        sourceAmount: decimal128ToString(debitNote.amount),
        requestedAmount,
        session: input.session,
      });
      return {
        makerUserId: debitNote.postedBy.toHexString(),
        sourceRecordId: debitNote._id.toHexString(),
      };
    }

    if (input.returnType === 'RECOVERY' && input.claimAdjustmentId != null) {
      if (input.allocation.claimId == null) {
        throw new AssistanceFinancialReconciliationError(
          'Claim recovery requires an allocation linked to a claim',
        );
      }
      const adjustment = await ClaimAdjustmentModel.findOne({
        _id: toObjectId(input.claimAdjustmentId, 'claimAdjustmentId'),
        facilityId,
        claimId: input.allocation.claimId,
        status: 'POSTED',
        reversedAt: null,
        amount: { $gte: minimumAmount },
      }).session(input.session).lean().exec();
      if (adjustment == null) {
        throw new AssistanceFinancialReconciliationError(
          'Posted claim adjustment does not reconcile with the assistance allocation',
        );
      }
      await this.assertFundReturnSourceCapacity({
        facilityId,
        sourceField: 'claimAdjustmentId',
        sourceRecordId: adjustment._id,
        sourceAmount: decimal128ToString(adjustment.amount),
        requestedAmount,
        session: input.session,
      });
      return {
        makerUserId: adjustment.makerUserId.toHexString(),
        sourceRecordId: adjustment._id.toHexString(),
      };
    }

    throw new AssistanceFinancialReconciliationError(
      `A posted authoritative source is required for ${input.returnType}`,
    );
  }

  public async applyAllocation(
    input: Parameters<WelfareZakatAuthoritativeBillingPort['applyAllocation']>[0],
  ): Promise<void> {
    const total = input.lines.reduce(
      (sum, line) => sum.plus(money(line.amount)),
      new Decimal(0),
    );
    if (!total.isPositive()) {
      throw new AssistanceFinancialReconciliationError(
        'Allocation must contain a positive amount',
      );
    }

    const facilityId = toObjectId(input.actor.facilityId, 'facilityId');
    const invoiceId = toObjectId(input.invoiceId, 'invoiceId');
    const patientAccountId = toObjectId(input.patientAccountId, 'patientAccountId');
    for (const line of input.lines) {
      const amount = money(line.amount);
      const updated = await InvoiceLineModel.updateOne(
        {
          _id: toObjectId(line.invoiceLineId, 'invoiceLineId'),
          facilityId,
          invoiceId,
          patientAccountId,
          patientAmount: { $gte: decimalStringToDecimal128(amount.toFixed(2)) },
        },
        {
          $inc: {
            welfareAmount: decimalStringToDecimal128(amount.toFixed(2)),
            patientAmount: decimalStringToDecimal128(amount.negated().toFixed(2)),
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec();
      if (updated.modifiedCount !== 1) {
        throw new AssistanceInvoiceBalanceExceededError();
      }
    }

    const amount = decimalStringToDecimal128(total.toFixed(2));
    const negative = decimalStringToDecimal128(total.negated().toFixed(2));
    const [invoiceUpdate, accountUpdate] = await Promise.all([
      InvoiceModel.updateOne(
        {
          _id: invoiceId,
          facilityId,
          patientAccountId,
          patientAmount: { $gte: amount },
          outstandingAmount: { $gte: amount },
          status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID'] },
        },
        {
          $inc: {
            welfareAmount: amount,
            patientAmount: negative,
            outstandingAmount: negative,
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec(),
      PatientAccountModel.updateOne(
        {
          _id: patientAccountId,
          facilityId,
          patientResponsibilityTotal: { $gte: amount },
          outstandingBalance: { $gte: amount },
        },
        {
          $inc: {
            welfareTotal: amount,
            patientResponsibilityTotal: negative,
            outstandingBalance: negative,
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec(),
    ]);
    if (invoiceUpdate.modifiedCount !== 1 || accountUpdate.modifiedCount !== 1) {
      throw new AssistanceInvoiceBalanceExceededError();
    }
  }

  public async reverseAllocation(
    input: Parameters<WelfareZakatAuthoritativeBillingPort['reverseAllocation']>[0],
  ): Promise<void> {
    const allocation = await InvoiceFundAllocationModel.findOne({
      _id: toObjectId(input.allocationId, 'allocationId'),
      facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
      invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
    }).session(input.transaction.session).lean().exec();
    if (allocation === null) {
      throw new AssistanceFinancialReconciliationError('Allocation was not found');
    }

    const amount = money(input.amount);
    const positive = decimalStringToDecimal128(amount.toFixed(2));
    const negative = decimalStringToDecimal128(amount.negated().toFixed(2));
    let remaining = amount;
    const targetLines: Array<Readonly<{ invoiceLineId: string; amount: string }>> = [];
    if (input.invoiceLineId == null) {
      for (const line of allocation.lines) {
        if (remaining.isZero()) break;
        const available = lineNetAmount(
          line as unknown as Readonly<Record<string, unknown>>,
        );
        if (!available.isPositive()) continue;
        const applied = Decimal.min(remaining, available);
        targetLines.push({
          invoiceLineId: line.invoiceLineId.toHexString(),
          amount: moneyString(applied),
        });
        remaining = remaining.minus(applied);
      }
    } else {
      targetLines.push({ invoiceLineId: input.invoiceLineId, amount: amount.toFixed(2) });
      remaining = new Decimal(0);
    }
    if (!remaining.isZero()) {
      throw new AssistanceFinancialReconciliationError(
        'Allocation does not contain enough active welfare amount to reverse',
      );
    }
    const lineTotal = targetLines.reduce(
      (sum, line) => sum.plus(money(line.amount)),
      new Decimal(0),
    );
    if (!lineTotal.equals(amount)) {
      throw new AssistanceFinancialReconciliationError(
        'Reversal invoice-line distribution does not equal the requested amount',
      );
    }

    for (const line of targetLines) {
      const lineAmount = money(line.amount);
      const linePositive = decimalStringToDecimal128(lineAmount.toFixed(2));
      const lineNegative = decimalStringToDecimal128(lineAmount.negated().toFixed(2));
      const updated = await InvoiceLineModel.updateOne(
        {
          _id: toObjectId(line.invoiceLineId, 'invoiceLineId'),
          facilityId: allocation.facilityId,
          invoiceId: allocation.invoiceId,
          welfareAmount: { $gte: linePositive },
        },
        {
          $inc: {
            welfareAmount: lineNegative,
            patientAmount: linePositive,
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec();
      if (updated.modifiedCount !== 1) {
        throw new AssistanceFinancialReconciliationError(
          'Invoice line does not contain enough welfare responsibility to reverse',
        );
      }
    }

    const [invoiceUpdate, accountUpdate] = await Promise.all([
      InvoiceModel.updateOne(
        {
          _id: allocation.invoiceId,
          facilityId: allocation.facilityId,
          welfareAmount: { $gte: positive },
        },
        {
          $inc: {
            welfareAmount: negative,
            patientAmount: positive,
            outstandingAmount: positive,
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec(),
      PatientAccountModel.updateOne(
        {
          _id: allocation.patientAccountId,
          facilityId: allocation.facilityId,
          welfareTotal: { $gte: positive },
        },
        {
          $inc: {
            welfareTotal: negative,
            patientResponsibilityTotal: positive,
            outstandingBalance: positive,
            version: 1,
          },
          $set: {
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
            updatedAt: new Date(),
          },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec(),
    ]);
    if (invoiceUpdate.modifiedCount !== 1 || accountUpdate.modifiedCount !== 1) {
      throw new AssistanceFinancialReconciliationError(
        'Invoice or patient-account reversal failed reconciliation',
      );
    }
  }

  public async assertAllocationReconciliation(
    input: Parameters<WelfareZakatAuthoritativeBillingPort['assertAllocationReconciliation']>[0],
  ): Promise<void> {
    const result = await this.reconcileAllocation({
      facilityId: input.facilityId,
      allocationId: input.allocationId,
      session: input.session,
    });
    if (!result.reconciled) {
      throw new AssistanceFinancialReconciliationError(result.differences.join('; '));
    }
  }

  public async resolveCoordination(
    input: Parameters<WelfareZakatCoverageClaimsCoordinationPort['resolveCoordination']>[0],
  ): ReturnType<WelfareZakatCoverageClaimsCoordinationPort['resolveCoordination']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const invoiceId = toObjectId(input.invoiceId, 'invoiceId');
    const requestedLineIds = input.invoiceLineIds.map((id) => toObjectId(id, 'invoiceLineId'));
    const [invoiceLines, claims] = await Promise.all([
      InvoiceLineModel.find({
        facilityId,
        invoiceId,
        ...(requestedLineIds.length === 0
          ? {}
          : { _id: { $in: requestedLineIds } }),
      }).session(input.session).lean().exec(),
      ClaimModel.find({ facilityId, invoiceId })
        .sort({ claimVersionNumber: -1, updatedAt: -1 })
        .session(input.session)
        .lean()
        .exec(),
    ]);
    const claimLines = invoiceLines.length === 0
      ? []
      : await ClaimLineModel.find({
          facilityId,
          invoiceLineId: { $in: invoiceLines.map((line) => line._id) },
        }).sort({ updatedAt: -1, _id: -1 }).session(input.session).lean().exec();
    const latestClaimLine = new Map<string, (typeof claimLines)[number]>();
    for (const line of claimLines) {
      const key = line.invoiceLineId.toHexString();
      if (!latestClaimLine.has(key)) {
        latestClaimLine.set(key, line);
      }
    }

    const covered = invoiceLines.some(
      (line) =>
        line.patientCoverageId != null ||
        money(decimal128ToString(line.payerAmount)).isPositive(),
    );
    const sponsorAdjudicationComplete = !covered || (
      claims.length > 0 && claims.every((claim) => terminalClaimStatuses.has(claim.status))
    );
    const blockingReasons = sponsorAdjudicationComplete
      ? []
      : [claims.length === 0
          ? 'SPONSOR_CLAIM_NOT_PREPARED'
          : 'SPONSOR_ADJUDICATION_PENDING'];

    const allocations = await InvoiceFundAllocationModel.find({
      facilityId,
      invoiceId,
      status: {
        $in: [
          'CONFIRMED',
          'PARTIALLY_UTILIZED',
          'UTILIZED',
          'PARTIALLY_REVERSED',
          'RECOVERY_PENDING',
        ],
      },
    }).session(input.session).lean().exec();
    const assistanceByLine = new Map<string, Decimal>();
    for (const allocation of allocations) {
      for (const line of allocation.lines) {
        const key = line.invoiceLineId.toHexString();
        assistanceByLine.set(
          key,
          (assistanceByLine.get(key) ?? new Decimal(0)).plus(
            lineNetAmount(line as unknown as Readonly<Record<string, unknown>>),
          ),
        );
      }
    }

    return {
      sponsorAdjudicationComplete,
      welfareMayApply: sponsorAdjudicationComplete,
      blockingReasons,
      lines: invoiceLines.map((line) => {
        const claimLine = latestClaimLine.get(line._id.toHexString());
        return {
          invoiceLineId: line._id.toHexString(),
          packageAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.packageAmount),
          sponsorAllocatedAmount: decimal128ToString(line.payerAmount),
          claimableAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.claimedAmount),
          claimApprovedAmount: claimLine == null
            ? '0.00'
            : decimal128ToString(claimLine.approvedAmount),
          patientResponsibilityAmount: decimal128ToString(line.patientAmount),
          existingAssistanceAmount: moneyString(
            assistanceByLine.get(line._id.toHexString()) ?? 0,
          ),
          maximumAdditionalAssistanceAmount: decimal128ToString(line.patientAmount),
        };
      }),
    };
  }

  public async postFundFinancialEvent(
    input: Parameters<WelfareZakatFinancialLedgerPort['postFundFinancialEvent']>[0],
  ): Promise<void> {
    const rule = this.configuration.eventRules[input.eventType];
    if (rule === undefined) {
      throw new AssistanceFinancialReconciliationError(
        `No Welfare/Zakat ledger rule is configured for ${input.eventType}`,
      );
    }
    const amount = money(input.amount);
    if (amount.isZero()) {
      return;
    }
    if (amount.isNegative()) {
      throw new AssistanceFinancialReconciliationError(
        'Financial ledger postings cannot contain negative amounts',
      );
    }

    const facilityId = toObjectId(input.actor.facilityId, 'facilityId');
    const operationKey = `${input.transaction.transactionId}:${input.eventType}:${input.sourceRecordId}`;
    const existing = await FinancialLedgerTransactionModel.findOne({
      facilityId,
      operationKey,
    }).session(input.transaction.session).lean().exec();
    if (existing !== null) {
      return;
    }

    const debitCode = normalizeCode(rule.debitAccountCode);
    const creditCode = normalizeCode(rule.creditAccountCode);
    if (debitCode === creditCode) {
      throw new AssistanceFinancialReconciliationError(
        'Welfare/Zakat ledger debit and credit accounts must differ',
      );
    }
    const accounts = await FinancialLedgerAccountModel.find({
      facilityId,
      accountCode: { $in: [debitCode, creditCode] },
      active: true,
      allowDirectPosting: true,
    }).session(input.transaction.session).lean().exec();
    if (accounts.length !== 2) {
      throw new AssistanceFinancialReconciliationError(
        'A configured Welfare/Zakat ledger account is unavailable',
      );
    }
    const byCode = new Map<string, Readonly<{ _id: unknown }>>(
      accounts.map((account): [string, Readonly<{ _id: unknown }>] => [
        account.accountCode,
        account,
      ]),
    );
    const debit = byCode.get(debitCode);
    const credit = byCode.get(creditCode);
    if (debit == null || credit == null) {
      throw new AssistanceFinancialReconciliationError(
        'Welfare/Zakat ledger account resolution failed',
      );
    }

    const ledgerTransactionId = createObjectId();
    const actorId = toObjectId(input.actor.userId, 'postedBy');
    const postedAt = new Date();
    const decimalAmount = decimalStringToDecimal128(amount.toFixed(2));
    const journalHash = stableAssistancePayloadHash({
      facilityId: input.actor.facilityId,
      operationKey,
    }).slice(0, 24).toUpperCase();
    const description = rule.description.trim();

    await FinancialLedgerTransactionModel.create(
      [{
        _id: ledgerTransactionId,
        facilityId,
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorId,
        updatedBy: actorId,
        operationKey,
        journalNumber: `WZK-${journalHash}`,
        sourceModule: 'WELFARE_ZAKAT',
        sourceEntityType: input.eventType,
        sourceEntityId: toObjectId(input.sourceRecordId, 'sourceRecordId'),
        patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
        patientAccountId: input.patientAccountId == null
          ? null
          : toObjectId(input.patientAccountId, 'patientAccountId'),
        invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
        paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
        cashShiftId: null,
        cashCounterId: null,
        currency: input.currency,
        totalDebit: decimalAmount,
        totalCredit: decimalAmount,
        entryCount: 2,
        status: 'POSTED',
        postedAt,
        postedBy: actorId,
        description,
        reversalOfTransactionId: null,
        reversedByTransactionId: null,
        reversalReason: null,
        closedPeriodCode: null,
      }],
      { session: input.transaction.session, ordered: true },
    );

    await FinancialLedgerEntryModel.create(
      [
        {
          facilityId,
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
          ledgerTransactionId,
          lineNumber: 1,
          ledgerAccountId: debit._id,
          ledgerAccountCodeSnapshot: debitCode,
          direction: 'DEBIT',
          amount: decimalAmount,
          currency: input.currency,
          patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
          patientAccountId: input.patientAccountId == null
            ? null
            : toObjectId(input.patientAccountId, 'patientAccountId'),
          invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
          paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
          departmentId: null,
          serviceLineCode: null,
          chargeCatalogItemId: null,
          description,
          postedAt,
        },
        {
          facilityId,
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
          ledgerTransactionId,
          lineNumber: 2,
          ledgerAccountId: credit._id,
          ledgerAccountCodeSnapshot: creditCode,
          direction: 'CREDIT',
          amount: decimalAmount,
          currency: input.currency,
          patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
          patientAccountId: input.patientAccountId == null
            ? null
            : toObjectId(input.patientAccountId, 'patientAccountId'),
          invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
          paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
          departmentId: null,
          serviceLineCode: null,
          chargeCatalogItemId: null,
          description,
          postedAt,
        },
      ],
      { session: input.transaction.session, ordered: true },
    );
  }

  public async refreshClearance(
    input: Parameters<WelfareZakatFinancialDischargePort['refreshClearance']>[0],
  ): Promise<void> {
    const [invoice, account] = await Promise.all([
      InvoiceModel.findOne({
        _id: toObjectId(input.invoiceId, 'invoiceId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        patientAccountId: toObjectId(input.patientAccountId, 'patientAccountId'),
      }).session(input.transaction.session).lean().exec(),
      PatientAccountModel.findOne({
        _id: toObjectId(input.patientAccountId, 'patientAccountId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
      }).session(input.transaction.session).lean().exec(),
    ]);
    if (invoice === null || account === null) {
      throw new AssistanceFinancialReconciliationError(
        'Financial-discharge context was not found',
      );
    }
    if (!invoice.patientId.equals(account.patientId)) {
      throw new AssistanceFinancialReconciliationError(
        'Invoice and patient account do not belong to the same patient',
      );
    }
    const outstanding = money(decimal128ToString(invoice.outstandingAmount));
    let target = invoice.status;
    if (outstanding.isZero() && ['FINALIZED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      target = 'PAID';
    } else if (outstanding.isPositive() && invoice.status === 'PAID') {
      target = money(decimal128ToString(invoice.paymentsAppliedAmount)).isZero()
        ? 'FINALIZED'
        : 'PARTIALLY_PAID';
    }
    if (target === invoice.status) {
      return;
    }
    const updated = await InvoiceModel.updateOne(
      { _id: invoice._id, facilityId: invoice.facilityId, version: invoice.version },
      {
        $set: {
          status: target,
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { session: input.transaction.session, runValidators: true },
    ).exec();
    if (updated.modifiedCount !== 1) {
      throw new AssistanceVersionConflictError();
    }
  }

  public async reconcileFund(
    input: Parameters<WelfareZakatReconciliationPort['reconcileFund']>[0],
  ): ReturnType<WelfareZakatReconciliationPort['reconcileFund']> {
    const facilityId = toObjectId(input.facilityId, 'facilityId');
    const fundId = toObjectId(input.fundId, 'fundId');
    const [fund, transactions, reservations, allocations] = await Promise.all([
      AssistanceFundModel.findOne({ _id: fundId, facilityId })
        .session(input.session).lean().exec(),
      FundTransactionModel.find({ facilityId, fundId, occurredAt: { $lte: input.asOf } })
        .session(input.session).lean().exec(),
      AssistanceReservationModel.find({
        facilityId,
        fundId,
        status: { $in: ['ACTIVE', 'PARTIALLY_CONSUMED'] },
      }).session(input.session).lean().exec(),
      InvoiceFundAllocationModel.find({
        facilityId,
        fundId,
        status: { $in: ['CONFIRMED', 'PARTIALLY_UTILIZED'] },
      }).session(input.session).lean().exec(),
    ]);
    if (fund === null) {
      throw new AssistanceFinancialReconciliationError('Fund was not found');
    }

    let expected = new Decimal(0);
    for (const transaction of transactions) {
      const amount = money(decimal128ToString(transaction.amount));
      if (transaction.direction === 'CREDIT') {
        expected = expected.plus(amount);
      } else if (transaction.direction === 'DEBIT') {
        expected = expected.minus(amount);
      }
    }
    const reserved = reservations.reduce(
      (sum, reservation) =>
        sum.plus(money(decimal128ToString(reservation.remainingAmount))),
      new Decimal(0),
    );
    const committed = allocations.reduce(
      (sum, allocation) =>
        sum.plus(money(decimal128ToString(allocation.remainingAmount))),
      new Decimal(0),
    );
    const actual = money(decimal128ToString(fund.ledgerBalance));
    const actualReserved = money(decimal128ToString(fund.reservedBalance));
    const actualCommitted = money(decimal128ToString(fund.committedBalance));
    const differences: string[] = [];
    if (!expected.equals(actual)) {
      differences.push(`LEDGER_BALANCE expected ${expected.toFixed(2)} actual ${actual.toFixed(2)}`);
    }
    if (!reserved.equals(actualReserved)) {
      differences.push(
        `RESERVED_BALANCE expected ${reserved.toFixed(2)} actual ${actualReserved.toFixed(2)}`,
      );
    }
    if (!committed.equals(actualCommitted)) {
      differences.push(
        `COMMITTED_BALANCE expected ${committed.toFixed(2)} actual ${actualCommitted.toFixed(2)}`,
      );
    }
    return {
      reconciled: differences.length === 0,
      expectedBalance: expected.toFixed(2),
      actualBalance: actual.toFixed(2),
      reservedBalance: reserved.toFixed(2),
      committedBalance: committed.toFixed(2),
      differences,
    };
  }

  public async reconcileAllocation(
    input: Parameters<WelfareZakatReconciliationPort['reconcileAllocation']>[0],
  ): ReturnType<WelfareZakatReconciliationPort['reconcileAllocation']> {
    const allocation = await InvoiceFundAllocationModel.findOne({
      _id: toObjectId(input.allocationId, 'allocationId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
    }).session(input.session).lean().exec();
    if (allocation === null) {
      return { reconciled: false, differences: ['ALLOCATION_NOT_FOUND'] };
    }

    const differences: string[] = [];
    const allocationNet = netAllocationAmount(
      allocation as unknown as Readonly<Record<string, unknown>>,
    );
    const lineNet = allocation.lines.reduce(
      (sum, line) => sum.plus(lineNetAmount(line as unknown as Readonly<Record<string, unknown>>)),
      new Decimal(0),
    );
    if (!allocationNet.equals(lineNet)) {
      differences.push(
        `ALLOCATION_LINE_TOTAL expected ${allocationNet.toFixed(2)} actual ${lineNet.toFixed(2)}`,
      );
    }

    const activeStatuses = [
      'CONFIRMED',
      'PARTIALLY_UTILIZED',
      'UTILIZED',
      'PARTIALLY_REVERSED',
      'RECOVERY_PENDING',
    ] as const;
    const [activeAllocations, activeAccountAllocations, invoice, invoiceLines, patientAccount] =
      await Promise.all([
        InvoiceFundAllocationModel.find({
          facilityId: allocation.facilityId,
          invoiceId: allocation.invoiceId,
          status: { $in: activeStatuses },
        }).session(input.session).lean().exec(),
        InvoiceFundAllocationModel.find({
          facilityId: allocation.facilityId,
          patientAccountId: allocation.patientAccountId,
          status: { $in: activeStatuses },
        }).session(input.session).lean().exec(),
        InvoiceModel.findOne({
          _id: allocation.invoiceId,
          facilityId: allocation.facilityId,
        }).session(input.session).lean().exec(),
        InvoiceLineModel.find({
          facilityId: allocation.facilityId,
          invoiceId: allocation.invoiceId,
        }).session(input.session).lean().exec(),
        PatientAccountModel.findOne({
          _id: allocation.patientAccountId,
          facilityId: allocation.facilityId,
        }).session(input.session).lean().exec(),
      ]);
    const expectedInvoiceWelfare = activeAllocations.reduce(
      (sum, record) => sum.plus(
        netAllocationAmount(record as unknown as Readonly<Record<string, unknown>>),
      ),
      new Decimal(0),
    );
    const expectedLineWelfare = new Map<string, Decimal>();
    for (const record of activeAllocations) {
      for (const line of record.lines) {
        const invoiceLineId = line.invoiceLineId.toHexString();
        expectedLineWelfare.set(
          invoiceLineId,
          (expectedLineWelfare.get(invoiceLineId) ?? new Decimal(0)).plus(
            lineNetAmount(line as unknown as Readonly<Record<string, unknown>>),
          ),
        );
      }
    }
    for (const invoiceLine of invoiceLines) {
      const expected = expectedLineWelfare.get(invoiceLine._id.toHexString())
        ?? new Decimal(0);
      const actual = money(decimal128ToString(invoiceLine.welfareAmount));
      if (!expected.equals(actual)) {
        differences.push(
          `INVOICE_LINE_WELFARE ${invoiceLine._id.toHexString()} expected ${expected.toFixed(2)} actual ${actual.toFixed(2)}`,
        );
      }
    }
    if (invoice === null) {
      differences.push('INVOICE_NOT_FOUND');
    } else {
      const actualInvoiceWelfare = money(decimal128ToString(invoice.welfareAmount));
      if (!expectedInvoiceWelfare.equals(actualInvoiceWelfare)) {
        differences.push(
          `INVOICE_WELFARE expected ${expectedInvoiceWelfare.toFixed(2)} actual ${actualInvoiceWelfare.toFixed(2)}`,
        );
      }
    }
    const expectedAccountWelfare = activeAccountAllocations.reduce(
      (sum, record) => sum.plus(
        netAllocationAmount(record as unknown as Readonly<Record<string, unknown>>),
      ),
      new Decimal(0),
    );
    if (patientAccount === null) {
      differences.push('PATIENT_ACCOUNT_NOT_FOUND');
    } else {
      const actualAccountWelfare = money(
        decimal128ToString(patientAccount.welfareTotal),
      );
      if (!expectedAccountWelfare.equals(actualAccountWelfare)) {
        differences.push(
          `PATIENT_ACCOUNT_WELFARE expected ${expectedAccountWelfare.toFixed(2)} actual ${actualAccountWelfare.toFixed(2)}`,
        );
      }
    }
    return { reconciled: differences.length === 0, differences };
  }
}