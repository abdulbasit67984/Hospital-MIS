import Decimal from 'decimal.js';

import {
  CONSULTANT_SETTLEMENT_NUMBER_SEQUENCE_KEY,
  isConsultantSettlementStatusTransitionAllowed,
} from '../consultant-sharing.constants.js';
import type { ConsultantSettlementPeriodType } from '../consultant-sharing.constants.js';
import type {
  ConsultantRevenueEntryView,
  ConsultantSettlementView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantSettlementInvalidStateTransitionError,
  ConsultantSettlementNotFoundError,
  ConsultantSettlementReconciliationError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { calculateConsultantSettlementTotals } from '../consultant-sharing.financial-math.js';
import type {
  ConsultantSettlementCalculationResult,
  ConsultantSettlementItemInput,
} from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantApprovalPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantFinancialLedgerPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantSequencePort,
  ConsultantSettlementItemRepositoryPort,
  ConsultantSettlementRepositoryPort,
  ConsultantSettlementSourceRepositoryPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export interface CreateConsultantSettlementInput {
  consultantId: string;
  periodType: ConsultantSettlementPeriodType;
  periodFrom: Date;
  periodThrough: Date;
  openingBalance?: string;
  broughtForwardBalance?: string;
  adjustmentAmount?: string;
  taxWithholding?: string;
  otherDeductions?: string;
  advanceRecovery?: string;
  overpaymentRecovery?: string;
}

export interface TransitionConsultantSettlementInput {
  settlementId: string;
  expectedVersion: number;
  toStatus: ConsultantSettlementView['status'];
  reason: string;
  approvalRequestId?: string | null;
}

export interface ConsultantSettlementServiceDependencies {
  settlements: ConsultantSettlementRepositoryPort;
  sources: ConsultantSettlementSourceRepositoryPort;
  items: ConsultantSettlementItemRepositoryPort;
  approval: ConsultantApprovalPort;
  ledger: ConsultantFinancialLedgerPort;
  sequence: ConsultantSequencePort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function signedAmount(entry: ConsultantRevenueEntryView, field: 'eligibleRevenue' | 'consultantShare' | 'hospitalShare' | 'taxWithholdingAmount' | 'deductionAmount'): Decimal {
  const value = new Decimal(entry[field]);
  return entry.entryType === 'REVERSAL' || entry.status === 'REVERSED'
    ? value.negated()
    : value;
}

function sourceItem(entry: ConsultantRevenueEntryView): ConsultantSettlementItemInput {
  const negative = entry.entryType === 'REVERSAL' || entry.status === 'REVERSED';
  const impact = new Decimal(entry.netPayableAmount).mul(negative ? -1 : 1).toFixed(2);
  const itemType: ConsultantSettlementItemInput['itemType'] =
    entry.entryType === 'ADJUSTMENT' ? 'ADJUSTMENT'
      : entry.entryType === 'REFUND' || entry.entryType === 'REVERSAL' ? 'REFUND_DEDUCTION'
        : entry.entryType === 'WELFARE_ZAKAT_ADJUSTMENT' ? 'WELFARE_ZAKAT_ADJUSTMENT'
          : entry.entryType === 'CLAIM_DEPENDENT' ? 'CLAIM_ADJUSTMENT'
            : 'REVENUE';
  return {
    sourceKey: stableConsultantSharingPayloadHash({ revenueEntryId: entry.id, calculationHash: entry.calculationHash }),
    itemType,
    revenueEntryId: entry.id,
    adjustmentId: null,
    reversalId: null,
    invoiceId: entry.invoiceId,
    invoiceLineId: entry.invoiceLineId,
    claimId: null,
    paymentAllocationId: null,
    eligibleRevenue: entry.eligibleRevenue,
    consultantShare: entry.consultantShare,
    hospitalShare: entry.hospitalShare,
    withholdingAmount: entry.taxWithholdingAmount,
    deductionAmount: entry.deductionAmount,
    signedSettlementImpact: impact,
    description: `${entry.entryType} consultant revenue ${entry.id}`,
    sourceOccurredAt: new Date(entry.occurredAt),
  };
}

function totalsFromEntries(
  entries: readonly ConsultantRevenueEntryView[],
  input: CreateConsultantSettlementInput,
) {
  const eligibleRevenue = entries.reduce((sum, entry) => sum.plus(signedAmount(entry, 'eligibleRevenue')), new Decimal(0));
  const consultantShare = entries.reduce((sum, entry) => sum.plus(signedAmount(entry, 'consultantShare')), new Decimal(0));
  const refundDeductions = entries
    .filter((entry) => entry.entryType === 'REFUND' || entry.entryType === 'REVERSAL')
    .reduce((sum, entry) => sum.plus(entry.netPayableAmount), new Decimal(0));
  const creditNoteDeductions = entries
    .filter((entry) => entry.entryType === 'ADJUSTMENT' && new Decimal(entry.netPayableAmount).isNegative())
    .reduce((sum, entry) => sum.plus(new Decimal(entry.netPayableAmount).abs()), new Decimal(0));
  const debitNoteAdditions = entries
    .filter((entry) => entry.entryType === 'ADJUSTMENT' && new Decimal(entry.netPayableAmount).isPositive())
    .reduce((sum, entry) => sum.plus(entry.netPayableAmount), new Decimal(0));
  const claimDeductions = entries
    .filter((entry) => entry.entryType === 'CLAIM_DEPENDENT' && entry.status !== 'POSTED')
    .reduce((sum, entry) => sum.plus(entry.netPayableAmount), new Decimal(0));
  const welfareZakatDeductions = entries
    .filter((entry) => entry.entryType === 'WELFARE_ZAKAT_ADJUSTMENT' && entry.status !== 'POSTED')
    .reduce((sum, entry) => sum.plus(entry.netPayableAmount), new Decimal(0));
  const entryWithholding = entries.reduce((sum, entry) => sum.plus(entry.taxWithholdingAmount), new Decimal(0));
  const entryDeductions = entries.reduce((sum, entry) => sum.plus(entry.deductionAmount), new Decimal(0));
  if (eligibleRevenue.isNegative() || consultantShare.isNegative()) {
    throw new ConsultantSettlementReconciliationError('Settlement period produces a negative authoritative revenue balance');
  }
  return calculateConsultantSettlementTotals({
    openingBalance: input.openingBalance ?? '0.00',
    broughtForwardBalance: input.broughtForwardBalance ?? '0.00',
    eligibleRevenue: eligibleRevenue.toFixed(2),
    consultantShare: consultantShare.toFixed(2),
    adjustments: input.adjustmentAmount ?? '0.00',
    refundDeductions: refundDeductions.toFixed(2),
    creditNoteDeductions: creditNoteDeductions.toFixed(2),
    debitNoteAdditions: debitNoteAdditions.toFixed(2),
    claimDeductions: claimDeductions.toFixed(2),
    welfareZakatDeductions: welfareZakatDeductions.toFixed(2),
    taxWithholding: entryWithholding.plus(input.taxWithholding ?? '0.00').toFixed(2),
    otherDeductions: entryDeductions.plus(input.otherDeductions ?? '0.00').toFixed(2),
    advanceRecovery: input.advanceRecovery ?? '0.00',
    overpaymentRecovery: input.overpaymentRecovery ?? '0.00',
    paidAmount: '0.00',
  });
}

export class ConsultantSettlementService {
  public constructor(private readonly dependencies: ConsultantSettlementServiceDependencies) {}

  public async calculate(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: CreateConsultantSettlementInput,
  ): Promise<ConsultantSettlementCalculationResult> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action: 'SETTLEMENT_CALCULATE', resourceFacilityId: actor.facilityId, consultantId: input.consultantId, sensitiveFinancialAction: false });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
    if (input.periodThrough < input.periodFrom) throw new ConsultantSettlementReconciliationError('Settlement period end cannot precede its start');

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_SETTLEMENT_CALCULATION',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ ...input, periodFrom: input.periodFrom.toISOString(), periodThrough: input.periodThrough.toISOString() }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-settlement:${actor.facilityId}:${input.consultantId}:${input.periodFrom.toISOString()}:${input.periodThrough.toISOString()}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 120_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const sourceEntries = await this.dependencies.sources.listUnsettled({ facilityId: actor.facilityId, consultantId: input.consultantId, periodFrom: input.periodFrom, periodThrough: input.periodThrough, transaction });
          if (sourceEntries.length === 0) throw new ConsultantSettlementReconciliationError('No unsettled consultant revenue exists for the requested period');
          const totals = totalsFromEntries(sourceEntries, input);
          const duplicateKey = stableConsultantSharingPayloadHash({ facilityId: actor.facilityId, consultantId: input.consultantId, periodFrom: input.periodFrom.toISOString(), periodThrough: input.periodThrough.toISOString(), sourceEntries: sourceEntries.map((entry) => entry.id) });
          const existing = await this.dependencies.settlements.findByDuplicateKey({ facilityId: actor.facilityId, duplicateKey, transaction });
          if (existing != null) return { settlement: existing, items: sourceEntries.map(sourceItem), sourceEntries };
          const now = this.dependencies.clock.now();
          const settlementNumber = await this.dependencies.sequence.next({ facilityId: actor.facilityId, sequenceKey: CONSULTANT_SETTLEMENT_NUMBER_SEQUENCE_KEY, occurredAt: now, transaction });
          const settlement = await this.dependencies.settlements.create({ actor, settlementNumber, consultantId: input.consultantId, periodType: input.periodType, periodFrom: input.periodFrom, periodThrough: input.periodThrough, duplicateKey, totals, revenueEntryIds: sourceEntries.map((entry) => entry.id), operationKey: stableConsultantSharingPayloadHash({ scope: 'SETTLEMENT', facilityId: actor.facilityId, idempotencyKey }), transaction });
          const items = sourceEntries.map(sourceItem);
          await this.dependencies.items.appendMany({ actor, settlementId: settlement.id, consultantId: input.consultantId, items, transaction });
          await this.dependencies.sources.reserveForSettlement({ actor, settlementId: settlement.id, revenueEntryIds: sourceEntries.map((entry) => entry.id), transaction });
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_SETTLEMENT_CALCULATED', entityType: 'ConsultantSettlement', entityId: settlement.id, after: { status: settlement.status, revenueEntryCount: sourceEntries.length, netPayable: totals.netPayable }, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantSettlement', aggregateId: settlement.id, eventType: 'consultant.settlement.calculated', payload: { settlementId: settlement.id, status: settlement.status, version: settlement.version }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return { settlement, items, sourceEntries };
        }),
      }),
    });
  }

  public async transition(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: TransitionConsultantSettlementInput,
  ): Promise<ConsultantSettlementView> {
    const action = input.toStatus === 'APPROVED' ? 'SETTLEMENT_APPROVE'
      : input.toStatus === 'SUBMITTED' ? 'SETTLEMENT_SUBMIT'
        : input.toStatus === 'CANCELLED' ? 'SETTLEMENT_CANCEL'
          : input.toStatus === 'REVERSED' ? 'SETTLEMENT_REVERSE'
            : 'SETTLEMENT_CREATE';
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action, resourceFacilityId: actor.facilityId, sensitiveFinancialAction: ['APPROVED', 'CANCELLED', 'REVERSED'].includes(input.toStatus) });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_SETTLEMENT_TRANSITION',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-settlement-state:${actor.facilityId}:${input.settlementId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const settlement = await this.dependencies.settlements.findById({ facilityId: actor.facilityId, settlementId: input.settlementId, transaction });
          if (settlement == null) throw new ConsultantSettlementNotFoundError();
          if (!isConsultantSettlementStatusTransitionAllowed(settlement.status, input.toStatus)) {
            throw new ConsultantSettlementInvalidStateTransitionError(settlement.status, input.toStatus);
          }
          if (
            ['CANCELLED', 'REVERSED'].includes(input.toStatus)
            && new Decimal(settlement.totals.paidAmount).greaterThan(0)
          ) {
            throw new ConsultantSettlementReconciliationError('Paid consultant settlements require payout reversals before settlement cancellation or reversal');
          }
          if (input.toStatus === 'APPROVED') {
            if (input.approvalRequestId == null) throw new ConsultantSettlementReconciliationError('Settlement approval requires an approval request');
            await this.dependencies.approval.requireApproved({ actor, approvalRequestId: input.approvalRequestId, action: 'CONSULTANT_SETTLEMENT_APPROVAL', entityType: 'ConsultantSettlement', entityId: settlement.id, amount: settlement.totals.netPayable, makerUserId: settlement.submittedBy ?? actor.userId, transaction });
          }
          const now = this.dependencies.clock.now();
          const updated = await this.dependencies.settlements.changeStatus({ actor, settlementId: settlement.id, expectedVersion: input.expectedVersion, fromStatus: settlement.status, toStatus: input.toStatus, reason: input.reason, approvalRequestId: input.approvalRequestId ?? null, occurredAt: now, transaction });
          if (updated == null) throw new ConsultantSharingConcurrencyError();
          let finalSettlement = updated;
          if (input.toStatus === 'APPROVED') {
            const ledger = await this.dependencies.ledger.postSettlement({ actor, settlementId: updated.id, consultantId: updated.consultantId, netPayable: updated.totals.netPayable, taxWithholding: updated.totals.taxWithholding, totalDeductions: updated.totals.totalDeductions, currency: updated.currency, occurredAt: now, transaction });
            const attached = await this.dependencies.settlements.attachLedgerTransaction({ actor, settlementId: updated.id, ledgerTransactionId: ledger.ledgerTransactionId, transaction });
            if (attached != null) finalSettlement = attached;
          }
          if (input.toStatus === 'REVERSED') {
            if (settlement.ledgerTransactionId == null) {
              throw new ConsultantSettlementReconciliationError('Approved settlement reversal requires the original settlement ledger transaction');
            }
            await this.dependencies.ledger.reverseSettlement({
              actor,
              settlementId: updated.id,
              consultantId: updated.consultantId,
              originalLedgerTransactionId: settlement.ledgerTransactionId,
              netPayable: updated.totals.netPayable,
              taxWithholding: updated.totals.taxWithholding,
              totalDeductions: updated.totals.totalDeductions,
              currency: updated.currency,
              reason: input.reason,
              occurredAt: now,
              transaction,
            });
          }
          if (input.toStatus === 'CANCELLED' || input.toStatus === 'REVERSED') {
            await this.dependencies.sources.releaseSettlementReservation({ actor, settlementId: updated.id, transaction });
          }
          await this.dependencies.audit.record({ actor, action: `CONSULTANT_SETTLEMENT_${input.toStatus}`, entityType: 'ConsultantSettlement', entityId: updated.id, before: { status: settlement.status }, after: { status: finalSettlement.status }, reason: input.reason, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantSettlement', aggregateId: updated.id, eventType: `consultant.settlement.${input.toStatus.toLowerCase()}`, payload: { settlementId: updated.id, previousStatus: settlement.status, status: finalSettlement.status, version: finalSettlement.version }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return finalSettlement;
        }),
      }),
    });
  }
}