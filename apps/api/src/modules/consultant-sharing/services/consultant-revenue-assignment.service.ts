import Decimal from 'decimal.js';

import type {
  ConsultantParticipantShare,
  ConsultantRevenueEntryView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantParticipantDuplicateError,
  ConsultantRevenueEntryNotFoundError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantIdentityResolutionPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantRevenueEntryRepositoryPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export interface ConsultantRevenueAssignmentServiceDependencies {
  identities: ConsultantIdentityResolutionPort;
  revenueEntries: ConsultantRevenueEntryRepositoryPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  encryption: ConsultantEncryptionPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

export class ConsultantRevenueAssignmentService {
  public constructor(
    private readonly dependencies: ConsultantRevenueAssignmentServiceDependencies,
  ) {}

  public async validateParticipantAssignments(
    actor: ConsultantSharingActorContext,
    consultantId: string,
    participants: readonly ConsultantParticipantShare[],
  ): Promise<void> {
    await this.requireAccess(actor, 'ASSIGN');
    const seen = new Set<string>();
    for (const participant of participants) {
      const key = `${participant.participantId}:${participant.participantRole}:${participant.customRoleCode ?? ''}`;
      if (seen.has(key)) throw new ConsultantParticipantDuplicateError(participant.participantId);
      seen.add(key);
      const identity = await this.dependencies.identities.resolveConsultant({
        facilityId: actor.facilityId,
        consultantId: participant.participantId,
      });
      if (identity == null || !identity.active) {
        throw new ConsultantSharingAccessDeniedError(
          `Participant consultant ${participant.participantId} is not active in this facility`,
        );
      }
    }
    if (!seen.has(`${consultantId}:PRIMARY_CONSULTANT:`) && participants.length > 0) {
      const total = participants.reduce(
        (sum, participant) => sum.plus(participant.shareAmount),
        new Decimal(0),
      );
      if (total.isNegative()) {
        throw new ConsultantSharingAccessDeniedError('Participant assignments cannot contain negative shares');
      }
    }
  }

  public async hold(
    actor: ConsultantSharingActorContext,
    revenueEntryId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ): Promise<ConsultantRevenueEntryView> {
    return this.changeStatus(actor, revenueEntryId, expectedVersion, idempotencyKey, reason, 'HELD');
  }

  public async release(
    actor: ConsultantSharingActorContext,
    revenueEntryId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ): Promise<ConsultantRevenueEntryView> {
    return this.changeStatus(actor, revenueEntryId, expectedVersion, idempotencyKey, reason, 'POSTED');
  }

  private async changeStatus(
    actor: ConsultantSharingActorContext,
    revenueEntryId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
    targetStatus: 'HELD' | 'POSTED',
  ): Promise<ConsultantRevenueEntryView> {
    await this.requireAccess(actor, 'ADJUSTMENT_REQUEST');
    const requestHash = stableConsultantSharingPayloadHash({ revenueEntryId, expectedVersion, reason, targetStatus });
    return this.dependencies.idempotency.execute({
      scope: `CONSULTANT_REVENUE_${targetStatus}`,
      actor,
      idempotencyKey,
      requestHash,
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-revenue-entry:${actor.facilityId}:${revenueEntryId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 30_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const before = await this.dependencies.revenueEntries.findById({
            facilityId: actor.facilityId,
            revenueEntryId,
            transaction,
          });
          if (before == null) throw new ConsultantRevenueEntryNotFoundError();
          const allowedFrom = targetStatus === 'HELD' ? ['POSTED', 'PENDING'] : ['HELD'];
          if (!allowedFrom.includes(before.status)) {
            throw new ConsultantSharingConcurrencyError();
          }
          const now = this.dependencies.clock.now();
          const encryptedReason = await this.dependencies.encryption.encrypt(reason);
          const updated = await this.dependencies.revenueEntries.markStatus({
            actor,
            revenueEntryId,
            expectedVersion,
            fromStatus: before.status,
            toStatus: targetStatus,
            reason: encryptedReason,
            occurredAt: now,
            transaction,
          });
          if (updated == null) throw new ConsultantSharingConcurrencyError();
          await this.dependencies.audit.record({
            actor,
            action: targetStatus === 'HELD' ? 'CONSULTANT_REVENUE_HELD' : 'CONSULTANT_REVENUE_RELEASED',
            entityType: 'ConsultantRevenueEntry',
            entityId: revenueEntryId,
            before: { status: before.status, version: before.version },
            after: { status: updated.status, version: updated.version },
            reason,
            transaction,
          });
          await this.dependencies.outbox.publish({
            aggregateType: 'ConsultantRevenueEntry',
            aggregateId: revenueEntryId,
            eventType: targetStatus === 'HELD' ? 'consultant.revenue.held' : 'consultant.revenue.released',
            payload: { revenueEntryId, status: updated.status, version: updated.version },
            correlationId: actor.correlationId,
            occurredAt: now,
            transaction,
          });
          return updated;
        }),
      }),
    });
  }

  private async requireAccess(
    actor: ConsultantSharingActorContext,
    action: 'ASSIGN' | 'ADJUSTMENT_REQUEST',
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      action,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: action === 'ADJUSTMENT_REQUEST',
    });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
  }
}