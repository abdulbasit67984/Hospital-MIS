import type { IdentityActorContext } from '../identity.types.js';

export interface IdentityCommandContext extends IdentityActorContext {
  idempotencyKey: string;
}

export interface IdentityAuditEnvelope {
  action: string;
  entityType: string;
  entityId: string;
  facilityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface IdentityOutboxEnvelope {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  facilityId?: string | null;
  payload: Record<string, unknown>;
}

export interface IdentityMutationStep<TContext extends object> {
  name: string;

  /**
   * Mutates the transaction context with the durable result of this step.
   */
  execute(context: TContext): Promise<void>;

  /**
   * Reverses this domain step when a subsequent domain step fails.
   *
   * Audit and outbox recovery occurs after all domain steps complete and
   * should not cause completed domain steps to be compensated.
   */
  compensate?(context: TContext): Promise<void>;
}

export interface IdentityMutationRequest<
  TContext extends object,
  TResult,
> {
  transactionType: string;
  idempotencyKey: string;
  actor: IdentityActorContext;
  lockKeys: string[];
  context: TContext;
  steps: IdentityMutationStep<TContext>[];

  buildAudit(
    context: TContext,
  ): IdentityAuditEnvelope | IdentityAuditEnvelope[] | null;

  buildOutbox(
    context: TContext,
  ): IdentityOutboxEnvelope | IdentityOutboxEnvelope[] | null;

  buildResult(context: TContext): TResult;
}