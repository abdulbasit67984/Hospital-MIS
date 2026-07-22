import Decimal from 'decimal.js';

import {
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  RecordFundInflowInput,
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApprovalRequiredError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceMakerCheckerViolationError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  hashAssistanceSensitiveReference,
  maskAssistanceReference,
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceFundRepositoryPort,
  FundTransactionRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import {
  projectAssistanceFund,
  projectFundBalance,
  projectFundTransaction,
} from '../welfare-zakat.projections.js';

export interface AssistanceDonationServiceDependencies {
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  attachments: WelfareZakatAttachmentPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  sequences: WelfareZakatNumberSequencePort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
  financialLedger: WelfareZakatFinancialLedgerPort;
}

function money(value: string | Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export class AssistanceDonationService {
  public constructor(
    private readonly dependencies: AssistanceDonationServiceDependencies,
  ) {}

  public async recordInflow(
    actor: WelfareZakatActorContext,
    fundId: string,
    idempotencyKey: string,
    input: RecordFundInflowInput,
  ) {
    const permission = input.transactionType === 'DONATION'
      ? WELFARE_ZAKAT_PERMISSION_KEYS.DONATION_RECORD
      : WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSACTION_RECORD;
    await this.requirePermission(actor, permission);
    if (input.approvalRequestId == null) throw new AssistanceApprovalRequiredError();
    const approvalRequestId = input.approvalRequestId;
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: input.attachmentIds ?? [],
    });

    return this.dependencies.transactionManager.execute({
      transactionType: 'RECORD_ASSISTANCE_FUND_INFLOW',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:fund:${actor.facilityId}:${fundId}`],
      idempotencyPayload: input,
      journalPayload: { fundId, transactionType: input.transactionType, amount: input.amount },
      execute: async (transaction) => {
        const fund = await this.dependencies.funds.findById(actor.facilityId, fundId, transaction.session);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (fund.status !== 'ACTIVE') throw new AssistanceFundInactiveError();
        if (fund.createdBy.toHexString() === actor.userId) throw new AssistanceMakerCheckerViolationError();
        if (actor.breakGlassReason != null) throw new AssistanceBreakGlassApprovalBypassError();
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId,
          action: `ASSISTANCE_${input.transactionType}`,
          entityId: fundId,
          amount: input.amount,
          makerUserId: fund.createdBy.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });

        const balances = projectFundBalance(fund);
        const amount = new Decimal(input.amount);
        const updatedBalances = {
          ...balances,
          inflowAmount: money(new Decimal(balances.inflowAmount).plus(amount)),
          ledgerBalance: money(new Decimal(balances.ledgerBalance).plus(amount)),
          availableBalance: money(new Decimal(balances.availableBalance).plus(amount)),
        };
        const updated = await this.dependencies.funds.applyFinancialPosition({
          actor,
          fundId,
          expectedVersion: input.expectedFundVersion,
          balances: updatedBalances,
          transaction,
        });
        if (updated === null) throw new AssistanceVersionConflictError();

        const receivedAt = new Date(input.receivedAt);
        const transactionNumber = await this.dependencies.sequences.next({
          facilityId: actor.facilityId,
          sequenceKey: WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
          effectiveAt: receivedAt,
          actorUserId: actor.userId,
          transaction,
        });
        const operationKey = stableAssistancePayloadHash({
          action: 'RECORD_ASSISTANCE_FUND_INFLOW',
          facilityId: actor.facilityId,
          fundId,
          idempotencyKey,
        });
        const ledgerTransaction = await this.dependencies.fundTransactions.append({
          actor,
          fund,
          transactionNumber,
          operationKey,
          transactionType: input.transactionType,
          direction: 'CREDIT',
          amount: input.amount,
          balanceBefore: balances.ledgerBalance,
          balanceAfter: updatedBalances.ledgerBalance,
          donorReferenceHash: hashAssistanceSensitiveReference(input.donorReference),
          donorReferenceMasked: maskAssistanceReference(input.donorReference),
          donationReferenceHash: hashAssistanceSensitiveReference(input.donationReference),
          receiptReferenceHash: hashAssistanceSensitiveReference(input.receiptReference),
          receiptReferenceMasked: maskAssistanceReference(input.receiptReference),
          fundingSourceReferenceHash: hashAssistanceSensitiveReference(input.fundingSourceReference),
          reason: input.reason,
          attachmentIds: input.attachmentIds ?? [],
          makerUserId: fund.createdBy.toHexString(),
          checkerUserId: actor.userId,
          approvalRequestId,
          occurredAt: receivedAt,
          immutableHash: stableAssistancePayloadHash({
            fundId,
            operationKey,
            transactionType: input.transactionType,
            amount: input.amount,
            balanceAfter: updatedBalances.ledgerBalance,
          }),
          transaction,
        });
        await this.dependencies.financialLedger.postFundFinancialEvent({
          actor,
          fundId,
          eventType: input.transactionType,
          amount: input.amount,
          sourceRecordId: ledgerTransaction._id.toHexString(),
          currency: fund.currency,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_FUND_INFLOW_RECORDED',
          entityType: 'FundTransaction',
          entityId: ledgerTransaction._id.toHexString(),
          reason: input.reason,
          before: { fund: projectAssistanceFund(fund), balance: balances.ledgerBalance },
          after: { transaction: projectFundTransaction(ledgerTransaction), balance: updatedBalances.ledgerBalance },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'welfare_zakat.fund.inflow_recorded',
          aggregateType: 'AssistanceFund',
          aggregateId: fundId,
          payload: safeWelfareZakatRealtimePayload({
            fundId,
            status: updated.status,
            previousStatus: fund.status,
            version: updated.version,
            eventAt: this.dependencies.clock.now().toISOString(),
          }),
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          fund: projectAssistanceFund(updated),
          transaction: projectFundTransaction(ledgerTransaction),
        };
      },
    });
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }
}