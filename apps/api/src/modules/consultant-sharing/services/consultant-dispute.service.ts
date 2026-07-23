import Decimal from 'decimal.js';

import {
  CONSULTANT_DISPUTE_NUMBER_SEQUENCE_KEY,
  isConsultantDisputeStatusTransitionAllowed,
} from '../consultant-sharing.constants.js';
import type {
  ConsultantDisputeView,
  ConsultantRevenueEntryView,
  ConsultantSettlementView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantDisputeNotFoundError,
  ConsultantRevenueEntryNotFoundError,
  ConsultantRevenueReconciliationError,
  ConsultantSettlementNotFoundError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantApprovalPort,
  ConsultantAttachmentPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantDisputeHistoryRepositoryPort,
  ConsultantDisputeRepositoryPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantRevenueEntryRepositoryPort,
  ConsultantSequencePort,
  ConsultantSettlementRepositoryPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
  ConsultantWorkQueueRepositoryPort,
} from '../consultant-sharing.ports.js';
import { ConsultantRevenueAdjustmentService } from './consultant-revenue-adjustment.service.js';

export interface OpenConsultantDisputeInput {
  consultantId: string;
  settlementId?: string | null;
  revenueEntryId?: string | null;
  reasonCode: string;
  reason: string;
  evidence?: string | null;
  requestedAdjustmentAmount?: string;
  attachmentIds?: readonly string[];
  assignedToUserId?: string | null;
  followUpAt?: Date | null;
  reviewDeadlineAt?: Date | null;
  resolutionDeadlineAt?: Date | null;
}

export interface TransitionConsultantDisputeInput {
  disputeId: string;
  expectedVersion: number;
  toStatus: ConsultantDisputeView['status'];
  reason: string;
  approvedAdjustmentAmount?: string;
  approvalRequestId?: string | null;
  adjustmentApprovalRequestId?: string | null;
  attachmentIds?: readonly string[];
}

export interface ConsultantDisputeServiceDependencies {
  disputes: ConsultantDisputeRepositoryPort;
  histories: ConsultantDisputeHistoryRepositoryPort;
  revenueEntries: ConsultantRevenueEntryRepositoryPort;
  settlements: ConsultantSettlementRepositoryPort;
  adjustments: ConsultantRevenueAdjustmentService;
  workQueue: ConsultantWorkQueueRepositoryPort;
  approval: ConsultantApprovalPort;
  attachments: ConsultantAttachmentPort;
  encryption: ConsultantEncryptionPort;
  sequence: ConsultantSequencePort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function nonNegativeMoney(field: string, value: Decimal.Value): string {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new ConsultantRevenueReconciliationError(`${field} must be a non-negative decimal`);
  }
  return parsed.toFixed(2);
}

export class ConsultantDisputeService {
  public constructor(private readonly dependencies: ConsultantDisputeServiceDependencies) {}

  public async open(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: OpenConsultantDisputeInput,
  ): Promise<ConsultantDisputeView> {
    await this.assertAllowed(actor, 'DISPUTE_CREATE', false, input.consultantId);
    if ((input.revenueEntryId == null) === (input.settlementId == null)) {
      throw new ConsultantRevenueReconciliationError('A consultant dispute must reference exactly one revenue entry or settlement');
    }
    const attachmentIds = input.attachmentIds ?? [];
    await this.dependencies.attachments.assertAttachmentIdsUsable({ facilityId: actor.facilityId, actorUserId: actor.userId, attachmentIds });
    const requestedAmount = nonNegativeMoney('requestedAdjustmentAmount', input.requestedAdjustmentAmount ?? '0.00');
    const evidenceEncrypted = input.evidence == null || input.evidence.trim() === ''
      ? null
      : await this.dependencies.encryption.encrypt(input.evidence.trim());

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_DISPUTE_OPEN',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ ...input, evidence: input.evidence == null ? null : stableConsultantSharingPayloadHash(input.evidence) }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-dispute-open:${actor.facilityId}:${input.revenueEntryId ?? input.settlementId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const target = await this.requireTarget(actor, input, transaction);
          if (target.consultantId !== input.consultantId) {
            throw new ConsultantRevenueReconciliationError('Dispute consultant does not match the target financial record');
          }
          const now = this.dependencies.clock.now();
          const disputeNumber = await this.dependencies.sequence.next({ facilityId: actor.facilityId, sequenceKey: CONSULTANT_DISPUTE_NUMBER_SEQUENCE_KEY, occurredAt: now, transaction });
          const dispute = await this.dependencies.disputes.create({
            actor,
            disputeNumber,
            consultantId: input.consultantId,
            settlementId: input.settlementId ?? null,
            revenueEntryId: input.revenueEntryId ?? null,
            reasonCode: input.reasonCode,
            reason: input.reason,
            evidenceEncrypted,
            requestedAdjustmentAmount: requestedAmount,
            attachmentIds,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'DISPUTE', facilityId: actor.facilityId, idempotencyKey }),
            assignedToUserId: input.assignedToUserId ?? null,
            followUpAt: input.followUpAt ?? null,
            reviewDeadlineAt: input.reviewDeadlineAt ?? null,
            resolutionDeadlineAt: input.resolutionDeadlineAt ?? null,
            transaction,
          });
          await this.dependencies.histories.append({ actor, dispute, fromStatus: null, toStatus: 'OPEN', reason: input.reason, attachmentIds, approvalRequestId: null, occurredAt: now, transaction });
          await this.dependencies.workQueue.create({ actor, target: { disputeId: dispute.id }, workQueueType: 'DISPUTE_REVIEW', assignedToUserId: input.assignedToUserId ?? null, priority: 100, followUpAt: input.followUpAt ?? null, deadlineAt: input.reviewDeadlineAt ?? null, reasonEncrypted: await this.dependencies.encryption.encrypt(input.reason), occurredAt: now, transaction });
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_DISPUTE_OPENED', entityType: 'ConsultantDispute', entityId: dispute.id, after: { targetType: dispute.targetType, status: dispute.status, consultantId: dispute.consultantId }, reason: input.reason, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantDispute', aggregateId: dispute.id, eventType: 'consultant.dispute.opened', payload: { disputeId: dispute.id, status: dispute.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return dispute;
        }),
      }),
    });
  }

  public async transition(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: TransitionConsultantDisputeInput,
  ): Promise<Readonly<{ dispute: ConsultantDisputeView; adjustmentId: string | null }>> {
    const action = ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'RESOLVED'].includes(input.toStatus)
      ? 'DISPUTE_RESOLVE'
      : 'DISPUTE_REVIEW';
    await this.assertAllowed(actor, action, action === 'DISPUTE_RESOLVE');
    const attachmentIds = input.attachmentIds ?? [];
    await this.dependencies.attachments.assertAttachmentIdsUsable({ facilityId: actor.facilityId, actorUserId: actor.userId, attachmentIds });

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_DISPUTE_TRANSITION',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-dispute-state:${actor.facilityId}:${input.disputeId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 90_000,
        operation: async () => {
          const dispute = await this.dependencies.disputes.findById({ facilityId: actor.facilityId, disputeId: input.disputeId });
          if (dispute == null) throw new ConsultantDisputeNotFoundError();
          if (!isConsultantDisputeStatusTransitionAllowed(dispute.status, input.toStatus)) {
            throw new ConsultantRevenueReconciliationError(`Dispute cannot transition from ${dispute.status} to ${input.toStatus}`);
          }
          const approvedAmount = nonNegativeMoney('approvedAdjustmentAmount', input.approvedAdjustmentAmount ?? '0.00');
          if (['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(input.toStatus)) {
            if (input.approvalRequestId == null) throw new ConsultantRevenueReconciliationError('Dispute decisions require an approval request');
            await this.dependencies.transactions.withTransaction(async (transaction) => {
              await this.dependencies.approval.requireApproved({ actor, approvalRequestId: input.approvalRequestId!, action: 'CONSULTANT_DISPUTE_DECISION', entityType: 'ConsultantDispute', entityId: dispute.id, amount: approvedAmount, makerUserId: dispute.makerUserId, transaction });
            });
          }

          const now = this.dependencies.clock.now();
          const updated = await this.dependencies.transactions.withTransaction(async (transaction) => {
            const changed = await this.dependencies.disputes.changeStatus({ actor, disputeId: dispute.id, expectedVersion: input.expectedVersion, fromStatus: dispute.status, toStatus: input.toStatus, approvedAdjustmentAmount: approvedAmount, reason: input.reason, occurredAt: now, transaction });
            if (changed == null) throw new ConsultantSharingConcurrencyError();
            await this.dependencies.histories.append({ actor, dispute: changed, fromStatus: dispute.status, toStatus: input.toStatus, reason: input.reason, attachmentIds, approvalRequestId: input.approvalRequestId ?? null, occurredAt: now, transaction });
            await this.dependencies.audit.record({ actor, action: `CONSULTANT_DISPUTE_${input.toStatus}`, entityType: 'ConsultantDispute', entityId: changed.id, before: { status: dispute.status }, after: { status: changed.status, approvedAdjustmentAmount: changed.approvedAdjustmentAmount }, reason: input.reason, transaction });
            await this.dependencies.outbox.publish({ aggregateType: 'ConsultantDispute', aggregateId: changed.id, eventType: `consultant.dispute.${input.toStatus.toLowerCase()}`, payload: { disputeId: changed.id, previousStatus: dispute.status, status: changed.status, version: changed.version }, correlationId: actor.correlationId, occurredAt: now, transaction });
            return changed;
          });

          let adjustmentId: string | null = null;
          if (['APPROVED', 'PARTIALLY_APPROVED'].includes(updated.status) && new Decimal(updated.approvedAdjustmentAmount).greaterThan(0)) {
            if (updated.revenueEntryId == null || input.adjustmentApprovalRequestId == null) {
              throw new ConsultantRevenueReconciliationError('Approved revenue-entry disputes require an adjustment approval request');
            }
            const source = await this.dependencies.revenueEntries.findById({ facilityId: actor.facilityId, revenueEntryId: updated.revenueEntryId });
            if (source == null) throw new ConsultantRevenueEntryNotFoundError();
            const ratio = new Decimal(source.eligibleRevenue).isZero()
              ? new Decimal(0)
              : new Decimal(source.consultantShare).div(source.eligibleRevenue);
            const consultantDelta = new Decimal(updated.approvedAdjustmentAmount).mul(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
            const hospitalDelta = new Decimal(updated.approvedAdjustmentAmount).minus(consultantDelta);
            const adjustment = await this.dependencies.adjustments.requestAdjustment(actor, `${idempotencyKey}:dispute-adjustment`, {
              revenueEntryId: source.id,
              settlementId: source.settlementId,
              disputeId: updated.id,
              eligibleRevenueDelta: updated.approvedAdjustmentAmount,
              consultantShareDelta: consultantDelta.toFixed(2),
              hospitalShareDelta: hospitalDelta.toFixed(2),
              reasonCode: updated.reasonCode,
              reason: input.reason,
              attachmentIds,
              approvalRequestId: input.adjustmentApprovalRequestId,
            });
            adjustmentId = adjustment.id;
          }
          return { dispute: updated, adjustmentId };
        },
      }),
    });
  }

  private async requireTarget(
    actor: ConsultantSharingActorContext,
    input: OpenConsultantDisputeInput,
    transaction: Parameters<ConsultantRevenueEntryRepositoryPort['findById']>[0]['transaction'],
  ): Promise<ConsultantRevenueEntryView | ConsultantSettlementView> {
    if (input.revenueEntryId != null) {
      const entry = await this.dependencies.revenueEntries.findById({ facilityId: actor.facilityId, revenueEntryId: input.revenueEntryId, transaction });
      if (entry == null) throw new ConsultantRevenueEntryNotFoundError();
      return entry;
    }
    const settlement = await this.dependencies.settlements.findById({ facilityId: actor.facilityId, settlementId: input.settlementId!, transaction });
    if (settlement == null) throw new ConsultantSettlementNotFoundError();
    return settlement;
  }

  private async assertAllowed(
    actor: ConsultantSharingActorContext,
    action: 'DISPUTE_CREATE' | 'DISPUTE_REVIEW' | 'DISPUTE_RESOLVE',
    sensitiveFinancialAction: boolean,
    consultantId?: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action, resourceFacilityId: actor.facilityId, consultantId, sensitiveFinancialAction });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
  }
}