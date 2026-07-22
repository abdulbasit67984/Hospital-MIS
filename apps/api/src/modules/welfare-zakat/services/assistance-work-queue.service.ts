import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  AssignAssistanceWorkItemInput,
  EscalateAssistanceWorkItemInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceEscalationTargetRequiredError,
  AssistanceVersionConflictError,
  AssistanceWorkItemNotFoundError,
} from '../welfare-zakat.errors.js';
import {
  safeWelfareZakatRealtimePayload,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceWorkQueueRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEncryptionPort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type { AssistanceWorkItemRecord } from '../welfare-zakat.persistence.types.js';
import {
  projectAssistanceWorkItem,
} from '../welfare-zakat.projections.js';

export interface AssistanceWorkQueueServiceDependencies {
  workQueue: AssistanceWorkQueueRepositoryPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  encryption: WelfareZakatEncryptionPort;
}

export class AssistanceWorkQueueService {
  public constructor(
    private readonly dependencies: AssistanceWorkQueueServiceDependencies,
  ) {}

  public async get(actor: WelfareZakatActorContext, workItemId: string) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const item = await this.dependencies.workQueue.findById(actor.facilityId, workItemId);
    if (item === null) throw new AssistanceWorkItemNotFoundError();
    return projectAssistanceWorkItem(item);
  }

  public async list(actor: WelfareZakatActorContext, query: WelfareZakatListQuery) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const { records, total } = await this.dependencies.workQueue.list(actor.facilityId, query);
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectAssistanceWorkItem),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async assign(
    actor: WelfareZakatActorContext,
    workItemId: string,
    idempotencyKey: string,
    input: AssignAssistanceWorkItemInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.ASSIGN);
    return this.dependencies.transactionManager.execute({
      transactionType: 'ASSIGN_ASSISTANCE_WORK_ITEM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:work-item:${actor.facilityId}:${workItemId}`],
      idempotencyPayload: input,
      journalPayload: { workItemId, assignedToUserId: input.assignedToUserId },
      execute: async (transaction) => {
        const before = await this.dependencies.workQueue.findById(actor.facilityId, workItemId, transaction.session);
        if (before === null) throw new AssistanceWorkItemNotFoundError();
        const updated = await this.dependencies.workQueue.assign({ actor, workItemId, input, transaction });
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_WORK_ITEM_ASSIGNED', entityType: 'AssistanceWorkItem', entityId: workItemId, reason: input.reason, before: projectAssistanceWorkItem(before), after: projectAssistanceWorkItem(updated), transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueue(actor, updated, before.status, transaction.transactionId, transaction.session);
        return projectAssistanceWorkItem(updated);
      },
    });
  }

  public async escalate(
    actor: WelfareZakatActorContext,
    workItemId: string,
    idempotencyKey: string,
    input: EscalateAssistanceWorkItemInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.ESCALATE);
    if (input.escalatedToUserId == null) {
      throw new AssistanceEscalationTargetRequiredError();
    }
    const reasonEncrypted = await this.dependencies.encryption.encrypt(input.reason.trim());
    return this.dependencies.transactionManager.execute({
      transactionType: 'ESCALATE_ASSISTANCE_WORK_ITEM',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:work-item:${actor.facilityId}:${workItemId}`],
      idempotencyPayload: input,
      journalPayload: { workItemId, escalationLevel: input.escalationLevel },
      execute: async (transaction) => {
        const before = await this.dependencies.workQueue.findById(actor.facilityId, workItemId, transaction.session);
        if (before === null) throw new AssistanceWorkItemNotFoundError();
        const updated = await this.dependencies.workQueue.escalate({ actor, workItemId, input, reasonEncrypted, escalatedAt: this.dependencies.clock.now(), transaction });
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_WORK_ITEM_ESCALATED', entityType: 'AssistanceWorkItem', entityId: workItemId, reason: input.reason, before: projectAssistanceWorkItem(before), after: projectAssistanceWorkItem(updated), transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueue(actor, updated, before.status, transaction.transactionId, transaction.session);
        return projectAssistanceWorkItem(updated);
      },
    });
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string) {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, permission, resourceFacilityId: actor.facilityId });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }

  private async enqueue(
    actor: WelfareZakatActorContext,
    item: AssistanceWorkItemRecord,
    previousStatus: string,
    transactionId: string,
    session: Parameters<WelfareZakatOutboxPort['enqueue']>[0]['session'],
  ) {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'welfare_zakat.work_item.changed',
      aggregateType: 'AssistanceWorkItem',
      aggregateId: item._id.toHexString(),
      payload: safeWelfareZakatRealtimePayload({ applicationId: item.applicationId.toHexString(), status: item.status, previousStatus, version: item.version, eventAt: this.dependencies.clock.now().toISOString() }),
      correlationId: actor.correlationId,
      transactionId,
      session,
    });
  }
}
