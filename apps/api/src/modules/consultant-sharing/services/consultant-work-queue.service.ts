import type { ConsultantSharingActorContext } from '../consultant-sharing.contracts.js';
import {
  ConsultantAgreementConflictError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionContext,
  ConsultantSharingTransactionManagerPort,
  ConsultantWorkItemView,
  ConsultantWorkQueueRepositoryPort,
} from '../consultant-sharing.ports.js';

export type ConsultantWorkTarget = Readonly<{
  agreementId?: string | null;
  agreementRuleId?: string | null;
  revenueEntryId?: string | null;
  adjustmentId?: string | null;
  reversalId?: string | null;
  settlementId?: string | null;
  settlementPaymentId?: string | null;
  disputeId?: string | null;
}>;

export interface CreateConsultantWorkItemInput {
  target: ConsultantWorkTarget;
  workQueueType: string;
  assignedToUserId?: string | null;
  priority?: number;
  followUpAt?: string | null;
  deadlineAt?: string | null;
  reason: string;
}

export interface ConsultantWorkQueueServiceDependencies {
  workQueue: ConsultantWorkQueueRepositoryPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  encryption: ConsultantEncryptionPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function assertSingleTarget(target: ConsultantWorkTarget): void {
  const count = Object.values(target).filter((value) => value != null).length;
  if (count !== 1) {
    throw new ConsultantAgreementConflictError('Consultant work item must reference exactly one target');
  }
}

export class ConsultantWorkQueueService {
  public constructor(
    private readonly dependencies: ConsultantWorkQueueServiceDependencies,
  ) {}

  public async listMine(actor: ConsultantSharingActorContext, page = 1, pageSize = 25) {
    await this.requireAccess(actor, 'READ');
    return this.dependencies.workQueue.listAssigned({
      facilityId: actor.facilityId,
      assignedToUserId: actor.userId,
      page,
      pageSize,
    });
  }

  public async create(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: CreateConsultantWorkItemInput,
  ): Promise<ConsultantWorkItemView> {
    await this.requireAccess(actor, 'ASSIGN');
    assertSingleTarget(input.target);
    const requestHash = stableConsultantSharingPayloadHash(input);
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_WORK_ITEM_CREATE', actor, idempotencyKey, requestHash,
      operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
        const now = this.dependencies.clock.now();
        const created = await this.dependencies.workQueue.create({
          actor,
          target: input.target,
          workQueueType: input.workQueueType,
          assignedToUserId: input.assignedToUserId ?? null,
          priority: input.priority ?? 50,
          followUpAt: input.followUpAt == null ? null : new Date(input.followUpAt),
          deadlineAt: input.deadlineAt == null ? null : new Date(input.deadlineAt),
          reasonEncrypted: await this.dependencies.encryption.encrypt(input.reason),
          occurredAt: now,
          transaction,
        });
        await this.recordMutation(actor, created, 'CONSULTANT_WORK_ITEM_CREATED', 'consultant.work-item.created', input.reason, now, transaction);
        return created;
      }),
    });
  }

  public async assign(
    actor: ConsultantSharingActorContext,
    workItemId: string,
    expectedVersion: number,
    assignedToUserId: string,
    followUpAt: string | null,
    idempotencyKey: string,
  ): Promise<ConsultantWorkItemView> {
    await this.requireAccess(actor, 'ASSIGN');
    return this.withItemLock(actor, workItemId, idempotencyKey, { expectedVersion, assignedToUserId, followUpAt }, async (transaction, now) => {
      const updated = await this.dependencies.workQueue.assign({
        actor, workItemId, expectedVersion, assignedToUserId,
        followUpAt: followUpAt == null ? null : new Date(followUpAt), occurredAt: now, transaction,
      });
      if (updated == null) throw new ConsultantSharingConcurrencyError();
      await this.recordMutation(actor, updated, 'CONSULTANT_WORK_ITEM_ASSIGNED', 'consultant.work-item.assigned', undefined, now, transaction);
      return updated;
    });
  }

  public async escalate(
    actor: ConsultantSharingActorContext,
    workItemId: string,
    expectedVersion: number,
    escalatedToUserId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<ConsultantWorkItemView> {
    await this.requireAccess(actor, 'ESCALATE');
    return this.withItemLock(actor, workItemId, idempotencyKey, { expectedVersion, escalatedToUserId, reason }, async (transaction, now) => {
      const updated = await this.dependencies.workQueue.escalate({
        actor, workItemId, expectedVersion, escalatedToUserId,
        reasonEncrypted: await this.dependencies.encryption.encrypt(reason), occurredAt: now, transaction,
      });
      if (updated == null) throw new ConsultantSharingConcurrencyError();
      await this.recordMutation(actor, updated, 'CONSULTANT_WORK_ITEM_ESCALATED', 'consultant.work-item.escalated', reason, now, transaction);
      return updated;
    });
  }

  private async withItemLock<T>(
    actor: ConsultantSharingActorContext,
    workItemId: string,
    idempotencyKey: string,
    payload: Readonly<Record<string, unknown>>,
    operation: (transaction: ConsultantSharingTransactionContext, now: Date) => Promise<T>,
  ): Promise<T> {
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_WORK_ITEM_MUTATION', actor, idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ workItemId, payload }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-work-item:${actor.facilityId}:${workItemId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 30_000,
        operation: () => this.dependencies.transactions.withTransaction((transaction) => operation(transaction, this.dependencies.clock.now())),
      }),
    });
  }

  private async recordMutation(
    actor: ConsultantSharingActorContext,
    workItem: ConsultantWorkItemView,
    action: string,
    eventType: string,
    reason: string | undefined,
    occurredAt: Date,
    transaction: ConsultantSharingTransactionContext,
  ): Promise<void> {
    await this.dependencies.audit.record({ actor, action, entityType: 'ConsultantWorkItem', entityId: workItem.id, after: { status: workItem.status, assignedToUserId: workItem.assignedToUserId, escalationLevel: workItem.escalationLevel, version: workItem.version }, reason, transaction });
    await this.dependencies.outbox.publish({ aggregateType: 'ConsultantWorkItem', aggregateId: workItem.id, eventType, payload: { workItemId: workItem.id, status: workItem.status, version: workItem.version }, correlationId: actor.correlationId, occurredAt, transaction });
  }

  private async requireAccess(actor: ConsultantSharingActorContext, action: 'READ' | 'ASSIGN' | 'ESCALATE'): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action, resourceFacilityId: actor.facilityId });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
  }
}