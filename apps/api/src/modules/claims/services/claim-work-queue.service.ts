import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  AssignClaimWorkItemInput,
  ClaimsActorContext,
  ClaimsListQuery,
  EscalateClaimWorkItemInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
  ClaimWorkItemNotFoundError,
} from '../claims.errors.js';

import {
  normalizeOptionalClaimText,
  safeClaimRealtimePayload,
} from '../claims.normalization.js';

import type {
  ClaimsAccessPolicyPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsEncryptionPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

import {
  projectClaimWorkItem,
} from '../claims.projections.js';

export interface ClaimWorkQueueServiceDependencies {
  claims: ClaimsRepositoryPort;
  workQueue: ClaimWorkQueueRepositoryPort;
  accessPolicy: ClaimsAccessPolicyPort;
  transactionManager: ClaimsTransactionManagerPort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
  encryption: ClaimsEncryptionPort;
}

export class ClaimWorkQueueService {
  public constructor(
    private readonly dependencies: ClaimWorkQueueServiceDependencies,
  ) {}

  public async get(
    actor: ClaimsActorContext,
    workItemId: string,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const item = await this.dependencies.workQueue.findById(
      actor.facilityId,
      workItemId,
    );
    if (item === null) {
      throw new ClaimWorkItemNotFoundError();
    }
    return projectClaimWorkItem(item);
  }

  public async list(
    actor: ClaimsActorContext,
    query: ClaimsListQuery,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.READ);
    const { records, totalItems } = await this.dependencies.workQueue.list(
      actor.facilityId,
      query,
    );
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectClaimWorkItem),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async assign(
    actor: ClaimsActorContext,
    workItemId: string,
    idempotencyKey: string,
    input: AssignClaimWorkItemInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.ASSIGN);

    return this.dependencies.transactionManager.execute({
      transactionType: 'ASSIGN_CLAIM_WORK_ITEM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:work-item:${actor.facilityId}:${workItemId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { workItemId, assignedToUserId: input.assignedToUserId },
      execute: async (transaction) => {
        const item = await this.dependencies.workQueue.findById(
          actor.facilityId,
          workItemId,
          transaction.session,
        );
        if (item === null) {
          throw new ClaimWorkItemNotFoundError();
        }
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          item.claimId.toHexString(),
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        const updated = await this.dependencies.workQueue.assign(
          actor.facilityId,
          workItemId,
          input,
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        await this.dependencies.claims.updateStatus(
          actor.facilityId,
          claim._id.toHexString(),
          claim.version,
          {
            assignedToUserId: input.assignedToUserId,
            followUpAt:
              input.followUpAt == null
                ? null
                : new Date(input.followUpAt),
          },
          actor.userId,
          transaction,
        );
        const now = this.dependencies.clock.now();
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_WORK_ITEM_ASSIGNED',
          entityType: 'ClaimWorkItem',
          entityId: workItemId,
          reason: input.reason,
          before: {
            status: item.status,
            assignedToUserId:
              item.assignedToUserId?.toHexString() ?? null,
            version: item.version,
          },
          after: {
            status: updated.status,
            assignedToUserId:
              updated.assignedToUserId?.toHexString() ?? null,
            version: updated.version,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueWorkItemEvent(
          actor,
          updated.claimId.toHexString(),
          updated._id.toHexString(),
          item.status,
          updated.status,
          updated.version,
          now,
          transaction.transactionId,
          transaction.session,
        );
        return projectClaimWorkItem(updated);
      },
    });
  }

  public async escalate(
    actor: ClaimsActorContext,
    workItemId: string,
    idempotencyKey: string,
    input: EscalateClaimWorkItemInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.ESCALATE);
    const normalizedReason = normalizeOptionalClaimText(input.reason)!;
    const reasonEncrypted = await this.dependencies.encryption.encrypt(
      normalizedReason,
    );

    return this.dependencies.transactionManager.execute({
      transactionType: 'ESCALATE_CLAIM_WORK_ITEM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:work-item:${actor.facilityId}:${workItemId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { workItemId, followUpAt: input.followUpAt },
      execute: async (transaction) => {
        const item = await this.dependencies.workQueue.findById(
          actor.facilityId,
          workItemId,
          transaction.session,
        );
        if (item === null) {
          throw new ClaimWorkItemNotFoundError();
        }
        const updated = await this.dependencies.workQueue.escalate(
          actor.facilityId,
          workItemId,
          input,
          actor.userId,
          reasonEncrypted,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        const now = this.dependencies.clock.now();
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_WORK_ITEM_ESCALATED',
          entityType: 'ClaimWorkItem',
          entityId: workItemId,
          reason: input.reason,
          before: {
            status: item.status,
            escalationLevel: item.escalationLevel,
            version: item.version,
          },
          after: {
            status: updated.status,
            escalationLevel: updated.escalationLevel,
            version: updated.version,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueWorkItemEvent(
          actor,
          updated.claimId.toHexString(),
          updated._id.toHexString(),
          item.status,
          updated.status,
          updated.version,
          now,
          transaction.transactionId,
          transaction.session,
        );
        return projectClaimWorkItem(updated);
      },
    });
  }

  public async resolve(
    actor: ClaimsActorContext,
    workItemId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.ASSIGN);

    return this.dependencies.transactionManager.execute({
      transactionType: 'RESOLVE_CLAIM_WORK_ITEM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:work-item:${actor.facilityId}:${workItemId}`,
      ],
      idempotencyPayload: { expectedVersion, reason },
      journalPayload: { workItemId },
      execute: async (transaction) => {
        const item = await this.dependencies.workQueue.findById(
          actor.facilityId,
          workItemId,
          transaction.session,
        );
        if (item === null) {
          throw new ClaimWorkItemNotFoundError();
        }
        const updated = await this.dependencies.workQueue.resolve(
          actor.facilityId,
          workItemId,
          expectedVersion,
          actor.userId,
          transaction,
        );
        if (updated === null) {
          throw new ClaimVersionConflictError();
        }
        const now = this.dependencies.clock.now();
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_WORK_ITEM_RESOLVED',
          entityType: 'ClaimWorkItem',
          entityId: workItemId,
          reason,
          before: { status: item.status, version: item.version },
          after: { status: updated.status, version: updated.version },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueWorkItemEvent(
          actor,
          updated.claimId.toHexString(),
          updated._id.toHexString(),
          item.status,
          updated.status,
          updated.version,
          now,
          transaction.transactionId,
          transaction.session,
        );
        return projectClaimWorkItem(updated);
      },
    });
  }

  private async enqueueWorkItemEvent(
    actor: ClaimsActorContext,
    claimId: string,
    workItemId: string,
    previousStatus: string,
    status: string,
    version: number,
    now: Date,
    transactionId: string,
    session: Parameters<ClaimsOutboxPort['enqueue']>[0]['session'],
  ): Promise<void> {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'claims.work_item.changed',
      aggregateType: 'ClaimWorkItem',
      aggregateId: workItemId,
      payload: {
        ...safeClaimRealtimePayload({
          claimId,
          status,
          previousStatus,
          version,
          eventAt: now.toISOString(),
        }),
        workItemId,
      },
      correlationId: actor.correlationId,
      transactionId,
      session,
    });
  }

  private async requirePermission(
    actor: ClaimsActorContext,
    permission: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}