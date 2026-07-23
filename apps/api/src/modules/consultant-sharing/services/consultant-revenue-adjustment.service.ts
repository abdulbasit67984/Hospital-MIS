import Decimal from 'decimal.js';

import type {
  ConsultantRevenueEntryView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantRevenueEntryNotFoundError,
  ConsultantRevenueReconciliationError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import type {
  ConsultantFinancialChangeReference,
  ConsultantRevenueAdjustmentView,
  ConsultantRevenueReversalView,
} from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantApprovalPort,
  ConsultantAttachmentPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantFinancialAdjustmentLedgerPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantRevenueAdjustmentRepositoryPort,
  ConsultantRevenueEntryRepositoryPort,
  ConsultantRevenueReversalRepositoryPort,
  ConsultantSequencePort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export interface RequestConsultantAdjustmentInput {
  revenueEntryId: string;
  settlementId?: string | null;
  disputeId?: string | null;
  eligibleRevenueDelta: string;
  consultantShareDelta: string;
  hospitalShareDelta: string;
  taxWithholdingDelta?: string;
  deductionDelta?: string;
  reasonCode: string;
  reason: string;
  attachmentIds?: readonly string[];
  approvalRequestId: string;
}

export interface RequestConsultantReversalInput {
  revenueEntryId: string;
  source: ConsultantFinancialChangeReference;
  attachmentIds?: readonly string[];
  approvalRequestId: string;
}

export interface ConsultantRevenueAdjustmentServiceDependencies {
  revenueEntries: ConsultantRevenueEntryRepositoryPort;
  adjustments: ConsultantRevenueAdjustmentRepositoryPort;
  reversals: ConsultantRevenueReversalRepositoryPort;
  approval: ConsultantApprovalPort;
  ledger: ConsultantFinancialAdjustmentLedgerPort;
  attachments: ConsultantAttachmentPort;
  sequence: ConsultantSequencePort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function signedMoney(field: string, value: Decimal.Value): Decimal {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite()) throw new ConsultantRevenueReconciliationError(`${field} must be a finite decimal`);
  return parsed;
}

function validateAdjustment(input: RequestConsultantAdjustmentInput): Readonly<{
  eligibleRevenueDelta: string;
  consultantShareDelta: string;
  hospitalShareDelta: string;
  taxWithholdingDelta: string;
  deductionDelta: string;
  netPayableDelta: string;
}> {
  const eligible = signedMoney('eligibleRevenueDelta', input.eligibleRevenueDelta);
  const consultant = signedMoney('consultantShareDelta', input.consultantShareDelta);
  const hospital = signedMoney('hospitalShareDelta', input.hospitalShareDelta);
  const withholding = signedMoney('taxWithholdingDelta', input.taxWithholdingDelta ?? '0');
  const deduction = signedMoney('deductionDelta', input.deductionDelta ?? '0');
  if (!consultant.plus(hospital).equals(eligible)) {
    throw new ConsultantRevenueReconciliationError('Adjustment consultant and hospital deltas must equal the eligible-revenue delta');
  }
  if (consultant.isZero() && hospital.isZero() && withholding.isZero() && deduction.isZero()) {
    throw new ConsultantRevenueReconciliationError('A zero-value consultant adjustment is not permitted');
  }
  const net = consultant.minus(withholding).minus(deduction);
  return {
    eligibleRevenueDelta: eligible.toFixed(2),
    consultantShareDelta: consultant.toFixed(2),
    hospitalShareDelta: hospital.toFixed(2),
    taxWithholdingDelta: withholding.toFixed(2),
    deductionDelta: deduction.toFixed(2),
    netPayableDelta: net.toFixed(2),
  };
}

export class ConsultantRevenueAdjustmentService {
  public constructor(private readonly dependencies: ConsultantRevenueAdjustmentServiceDependencies) {}

  public async requestAdjustment(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: RequestConsultantAdjustmentInput,
  ): Promise<ConsultantRevenueAdjustmentView> {
    await this.assertAllowed(actor, 'ADJUSTMENT_REQUEST');
    const normalized = validateAdjustment(input);
    const attachmentIds = input.attachmentIds ?? [];
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds,
    });
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_REVENUE_ADJUSTMENT_REQUEST',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ input, normalized }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-adjustment:${actor.facilityId}:${input.revenueEntryId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const revenueEntry = await this.requireRevenueEntry(actor, input.revenueEntryId, transaction);
          if (revenueEntry.status === 'REVERSED' || revenueEntry.status === 'CANCELLED') {
            throw new ConsultantRevenueReconciliationError('Reversed or cancelled consultant revenue cannot be adjusted');
          }
          const now = this.dependencies.clock.now();
          const adjustmentNumber = await this.dependencies.sequence.next({
            facilityId: actor.facilityId,
            sequenceKey: 'CONSULTANT_ADJUSTMENT_NUMBER',
            occurredAt: now,
            transaction,
          });
          const adjustment = await this.dependencies.adjustments.create({
            actor,
            adjustmentNumber,
            revenueEntry,
            settlementId: input.settlementId ?? revenueEntry.settlementId,
            disputeId: input.disputeId ?? null,
            ...normalized,
            reasonCode: input.reasonCode,
            reason: input.reason,
            attachmentIds,
            approvalRequestId: input.approvalRequestId,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'ADJUSTMENT', facilityId: actor.facilityId, idempotencyKey }),
            requestedAt: now,
            transaction,
          });
          await this.dependencies.audit.record({
            actor,
            action: 'CONSULTANT_REVENUE_ADJUSTMENT_REQUESTED',
            entityType: 'ConsultantRevenueAdjustment',
            entityId: adjustment.id,
            after: { revenueEntryId: revenueEntry.id, status: adjustment.status, consultantShareDelta: adjustment.consultantShareDelta },
            reason: input.reason,
            transaction,
          });
          await this.dependencies.outbox.publish({
            aggregateType: 'ConsultantRevenueAdjustment',
            aggregateId: adjustment.id,
            eventType: 'consultant.revenue.adjustment.requested',
            payload: { adjustmentId: adjustment.id, status: adjustment.status, revenueEntryId: revenueEntry.id },
            correlationId: actor.correlationId,
            occurredAt: now,
            transaction,
          });
          return adjustment;
        }),
      }),
    });
  }

  public async approveAndPostAdjustment(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    adjustmentId: string,
  ): Promise<Readonly<{ adjustment: ConsultantRevenueAdjustmentView; entry: ConsultantRevenueEntryView }>> {
    await this.assertAllowed(actor, 'ADJUSTMENT_APPROVE');
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_REVENUE_ADJUSTMENT_POST',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ adjustmentId }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-adjustment-post:${actor.facilityId}:${adjustmentId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const adjustment = await this.dependencies.adjustments.findById({ facilityId: actor.facilityId, adjustmentId, transaction });
          if (adjustment == null) throw new ConsultantRevenueEntryNotFoundError();
          await this.dependencies.approval.requireApproved({
            actor,
            approvalRequestId: adjustment.approvalRequestId,
            action: 'CONSULTANT_REVENUE_ADJUSTMENT',
            entityType: 'ConsultantRevenueAdjustment',
            entityId: adjustmentId,
            amount: new Decimal(adjustment.consultantShareDelta).abs().toFixed(2),
            makerUserId: adjustment.makerUserId,
            transaction,
          });
          const now = this.dependencies.clock.now();
          const approved = adjustment.status === 'APPROVED' || adjustment.status === 'POSTED'
            ? adjustment
            : await this.dependencies.adjustments.approve({ actor, adjustmentId, checkerUserId: actor.userId, approvedAt: now, transaction });
          if (approved == null) throw new ConsultantSharingConcurrencyError();
          if (approved.status === 'POSTED' && approved.postedRevenueEntryId != null) {
            const existing = await this.requireRevenueEntry(actor, approved.postedRevenueEntryId, transaction);
            return { adjustment: approved, entry: existing };
          }
          const result = await this.dependencies.adjustments.postApprovedEntry({ actor, adjustmentId, occurredAt: now, transaction });
          if (!new Decimal(result.adjustment.consultantShareDelta).isZero()) {
            await this.dependencies.ledger.postRevenueAdjustment({
              actor,
              sourceRevenueEntryId: adjustment.revenueEntryId,
              adjustmentId,
              consultantId: result.entry.consultantId,
              consultantShareDelta: result.adjustment.consultantShareDelta,
              hospitalShareDelta: result.adjustment.hospitalShareDelta,
              currency: 'PKR',
              occurredAt: now,
              transaction,
            });
          }
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_REVENUE_ADJUSTMENT_POSTED', entityType: 'ConsultantRevenueAdjustment', entityId: adjustmentId, after: { status: result.adjustment.status, postedRevenueEntryId: result.entry.id }, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantRevenueAdjustment', aggregateId: adjustmentId, eventType: 'consultant.revenue.adjustment.posted', payload: { adjustmentId, revenueEntryId: result.entry.id, status: result.adjustment.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return result;
        }),
      }),
    });
  }

  public async requestReversal(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: RequestConsultantReversalInput,
  ): Promise<ConsultantRevenueReversalView> {
    await this.assertAllowed(actor, 'REVERSAL_REQUEST');
    const attachmentIds = input.attachmentIds ?? [];
    await this.dependencies.attachments.assertAttachmentIdsUsable({ facilityId: actor.facilityId, actorUserId: actor.userId, attachmentIds });
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_REVENUE_REVERSAL_REQUEST',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-reversal:${actor.facilityId}:${input.revenueEntryId}:${input.source.sourceFinancialEventId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const revenueEntry = await this.requireRevenueEntry(actor, input.revenueEntryId, transaction);
          if (revenueEntry.status === 'REVERSED') throw new ConsultantRevenueReconciliationError('Consultant revenue entry has already been reversed');
          const now = this.dependencies.clock.now();
          const reversalNumber = await this.dependencies.sequence.next({ facilityId: actor.facilityId, sequenceKey: 'CONSULTANT_REVERSAL_NUMBER', occurredAt: now, transaction });
          const reversal = await this.dependencies.reversals.create({
            actor,
            reversalNumber,
            revenueEntry,
            source: { ...input.source, sourceRecordId: revenueEntry.id, consultantId: revenueEntry.consultantId, invoiceLineId: revenueEntry.invoiceLineId },
            attachmentIds,
            approvalRequestId: input.approvalRequestId,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'REVERSAL', facilityId: actor.facilityId, idempotencyKey }),
            requestedAt: now,
            transaction,
          });
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_REVENUE_REVERSAL_REQUESTED', entityType: 'ConsultantRevenueReversal', entityId: reversal.id, after: { revenueEntryId: revenueEntry.id, status: reversal.status }, reason: input.source.reason, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantRevenueReversal', aggregateId: reversal.id, eventType: 'consultant.revenue.reversal.requested', payload: { reversalId: reversal.id, revenueEntryId: revenueEntry.id, status: reversal.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return reversal;
        }),
      }),
    });
  }

  public async approveAndPostReversal(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    reversalId: string,
  ): Promise<Readonly<{ reversal: ConsultantRevenueReversalView; entry: ConsultantRevenueEntryView }>> {
    await this.assertAllowed(actor, 'REVERSAL_APPROVE');
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_REVENUE_REVERSAL_POST',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ reversalId }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-reversal-post:${actor.facilityId}:${reversalId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const reversal = await this.dependencies.reversals.findById({ facilityId: actor.facilityId, reversalId, transaction });
          if (reversal == null) throw new ConsultantRevenueEntryNotFoundError();
          await this.dependencies.approval.requireApproved({ actor, approvalRequestId: reversal.approvalRequestId, action: 'CONSULTANT_REVENUE_REVERSAL', entityType: 'ConsultantRevenueReversal', entityId: reversalId, amount: reversal.netPayableAmount, makerUserId: reversal.makerUserId, transaction });
          const now = this.dependencies.clock.now();
          const approved = reversal.status === 'APPROVED' || reversal.status === 'POSTED'
            ? reversal
            : await this.dependencies.reversals.approve({ actor, reversalId, checkerUserId: actor.userId, approvedAt: now, transaction });
          if (approved == null) throw new ConsultantSharingConcurrencyError();
          if (approved.status === 'POSTED' && approved.reversalRevenueEntryId != null) {
            const existing = await this.requireRevenueEntry(actor, approved.reversalRevenueEntryId, transaction);
            return { reversal: approved, entry: existing };
          }
          const result = await this.dependencies.reversals.postApprovedEntry({ actor, reversalId, occurredAt: now, transaction });
          await this.dependencies.ledger.postRevenueReversal({ actor, sourceRevenueEntryId: result.reversal.revenueEntryId, reversalRevenueEntryId: result.entry.id, consultantId: result.entry.consultantId, consultantShareAmount: result.reversal.consultantShareAmount, hospitalShareAmount: result.reversal.hospitalShareAmount, currency: 'PKR', occurredAt: now, transaction });
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_REVENUE_REVERSAL_POSTED', entityType: 'ConsultantRevenueReversal', entityId: reversalId, after: { status: result.reversal.status, reversalRevenueEntryId: result.entry.id }, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantRevenueReversal', aggregateId: reversalId, eventType: 'consultant.revenue.reversal.posted', payload: { reversalId, revenueEntryId: result.entry.id, status: result.reversal.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return result;
        }),
      }),
    });
  }

  private async assertAllowed(actor: ConsultantSharingActorContext, action: 'ADJUSTMENT_REQUEST' | 'ADJUSTMENT_APPROVE' | 'REVERSAL_REQUEST' | 'REVERSAL_APPROVE'): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action, resourceFacilityId: actor.facilityId, sensitiveFinancialAction: action.endsWith('APPROVE') });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
  }

  private async requireRevenueEntry(actor: ConsultantSharingActorContext, revenueEntryId: string, transaction: Parameters<ConsultantRevenueEntryRepositoryPort['findById']>[0]['transaction']): Promise<ConsultantRevenueEntryView> {
    const entry = await this.dependencies.revenueEntries.findById({ facilityId: actor.facilityId, revenueEntryId, transaction });
    if (entry == null) throw new ConsultantRevenueEntryNotFoundError();
    return entry;
  }

}