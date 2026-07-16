import type {
  IdentityActorContext,
  ObjectIdString,
} from './identity.types.js';

export interface IdentityTransactionCompensation {
  /**
   * Unique within one application transaction.
   *
   * Repeated registration of the same key must be idempotent.
   */
  key: string;

  /**
   * Maps to a registered Phase 3 compensation handler.
   */
  type: string;

  /**
   * Must remain JSON serializable because it is persisted for recovery.
   */
  payload: Record<string, unknown>;
}

export interface IdentityTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: IdentityTransactionCompensation,
  ): Promise<void>;
}

export interface IdentityTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: ObjectIdString;
  facilityId?: ObjectIdString | null;
  lockKeys: string[];
  payload: Record<string, unknown>;

  execute(
    context: IdentityTransactionContext,
  ): Promise<T>;
}

export interface IdentityTransactionManagerPort {
  execute<T>(
    request: IdentityTransactionRequest<T>,
  ): Promise<T>;
}

export interface IdentityAuditEntry {
  transactionId: string;
  deduplicationKey: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  facilityId?: string | null;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface IdentityAuditPort {
  append(entry: IdentityAuditEntry): Promise<void>;
}

export interface IdentityOutboxMessage {
  transactionId: string;
  deduplicationKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string;
  facilityId?: string | null;
  correlationId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface IdentityOutboxPort {
  enqueue(message: IdentityOutboxMessage): Promise<void>;
}

export interface IdentityClockPort {
  now(): Date;
}

export interface IdentityIdGeneratorPort {
  generate(): string;
}

export interface IdentityPasswordHasherPort {
  hash(plainTextPassword: string): Promise<string>;

  verify?(
    passwordHash: string,
    plainTextPassword: string,
  ): Promise<boolean>;
}

export interface RevokeUserSessionsRequest {
  userId: string;
  revokedBy: string;
  reason: string;

  /**
   * Used by the session repository as a durable deduplication key.
   */
  transactionId: string;

  /**
   * Optional session that should remain active.
   */
  excludeSessionId?: string;
}

export interface RevokeUserSessionsResult {
  revokedSessionCount: number;
}

/**
 * Adapter this to the Phase 3 session service or session repository.
 *
 * The implementation must be idempotent for the same transactionId.
 */
export interface IdentitySessionRevocationPort {
  revokeAllForUser(
    request: RevokeUserSessionsRequest,
  ): Promise<RevokeUserSessionsResult>;
}

export interface IdentityMutationDependencies {
  transactionManager: IdentityTransactionManagerPort;
  audit: IdentityAuditPort;
  outbox: IdentityOutboxPort;
  clock: IdentityClockPort;
  idGenerator: IdentityIdGeneratorPort;
}

export interface IdentityUserMutationDependencies
  extends IdentityMutationDependencies {
  passwordHasher: IdentityPasswordHasherPort;
  sessions: IdentitySessionRevocationPort;
}

export function buildAuditActorFields(
  actor: IdentityActorContext,
): Pick<
  IdentityAuditEntry,
  | 'actorUserId'
  | 'facilityId'
  | 'correlationId'
  | 'ipAddress'
  | 'userAgent'
> {
  return {
    actorUserId: actor.userId,
    facilityId: actor.facilityId ?? null,
    correlationId: actor.correlationId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  };
}