import type {
  CanonicalPatientRegistrationResolution,
  RegistrationQueueActorContext,
} from './registration-queue.types.js';

export interface RegistrationQueueEncryptedSnapshot {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface ProtectedRegistrationQueueSnapshot {
  encryptedValue: RegistrationQueueEncryptedSnapshot;
  valueHash: string;
}

export interface RegistrationQueueSnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedRegistrationQueueSnapshot;

  unprotect<T>(
    encryptedValue: RegistrationQueueEncryptedSnapshot,
    associatedData: string,
  ): T;

  hash(
    value: unknown,
    associatedData: string,
  ): string;

  matchesHash(
    value: unknown,
    associatedData: string,
    expectedHash: string,
  ): boolean;

  needsRotation(
    encryptedValue: RegistrationQueueEncryptedSnapshot,
  ): boolean;
}

export interface RegistrationQueueTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface RegistrationQueueTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: RegistrationQueueTransactionCompensation,
  ): Promise<void>;
}

export interface RegistrationQueueTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];

  /**
   * Used only for calculating the idempotency request hash.
   * It must never be copied to transaction journals, audit
   * records, logs, outbox events, or shared caches.
   */
  idempotencyPayload: unknown;

  /**
   * Safe operational metadata that may be persisted in the
   * durable application-transaction journal.
   */
  journalPayload: Record<string, unknown>;

  execute(
    context: RegistrationQueueTransactionContext,
  ): Promise<T>;
}

export interface RegistrationQueueTransactionManagerPort {
  execute<T>(
    request: RegistrationQueueTransactionRequest<T>,
  ): Promise<T>;
}

export interface RegistrationQueueAuditEntry {
  transactionId: string;
  deduplicationKey: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  reason?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface RegistrationQueueAuditPort {
  append(
    entry: RegistrationQueueAuditEntry,
  ): Promise<void>;
}

export interface RegistrationQueueOutboxMessage {
  transactionId: string;
  deduplicationKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface RegistrationQueueOutboxPort {
  enqueue(
    message: RegistrationQueueOutboxMessage,
  ): Promise<void>;
}

export interface RegistrationQueueRealtimeMessage {
  eventType: string;
  facilityId: string;
  queueDefinitionId?: string;
  serviceDate?: string;
  payload: Record<string, unknown>;
}

export interface RegistrationQueueRealtimePort {
  publish(
    message: RegistrationQueueRealtimeMessage,
  ): Promise<void>;
}

export interface RegistrationQueueClockPort {
  now(): Date;
}

export interface RegistrationQueueSequenceAllocation {
  key: string;
  value: number;
}

export interface RegistrationQueueSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<RegistrationQueueSequenceAllocation>;
}

export interface RegistrationQueueCanonicalPatientPort {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPatientRegistrationResolution>;
}

export interface RegistrationQueueMutationDependencies {
  transactionManager: RegistrationQueueTransactionManagerPort;
  audit: RegistrationQueueAuditPort;
  outbox: RegistrationQueueOutboxPort;
  realtime: RegistrationQueueRealtimePort;
  clock: RegistrationQueueClockPort;
  snapshotCrypto?: RegistrationQueueSnapshotCryptoPort;
}

export function buildRegistrationQueueAuditActorFields(
  actor: RegistrationQueueActorContext,
): Pick<
  RegistrationQueueAuditEntry,
  | 'actorUserId'
  | 'facilityId'
  | 'correlationId'
  | 'ipAddress'
  | 'userAgent'
> {
  return {
    actorUserId:
      actor.userId,

    facilityId:
      actor.facilityId,

    correlationId:
      actor.correlationId,

    ...(actor.ipAddress === undefined
      ? {}
      : {
          ipAddress:
            actor.ipAddress,
        }),

    ...(actor.userAgent === undefined
      ? {}
      : {
          userAgent:
            actor.userAgent,
        }),
  };
}