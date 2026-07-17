import type {
  PatientActorContext,
} from './patient.types.js';

export interface PatientEncryptedSnapshot {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface ProtectedPatientSnapshot {
  encryptedValue: PatientEncryptedSnapshot;
  valueHash: string;
}

export interface PatientSensitiveSnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedPatientSnapshot;

  unprotect<T>(
    encryptedValue: PatientEncryptedSnapshot,
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
    encryptedValue: PatientEncryptedSnapshot,
  ): boolean;
}

export interface PatientTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface PatientTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: PatientTransactionCompensation,
  ): Promise<void>;
}

export interface PatientTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];

  /**
   * Used only to calculate the idempotency request hash.
   * Adapters must not persist this value in journals, logs,
   * audits, outbox events, or shared caches.
   */
  idempotencyPayload: unknown;

  /**
   * Safe operational metadata that may be persisted in the
   * application-transaction journal.
   */
  journalPayload: Record<string, unknown>;

  execute(
    context: PatientTransactionContext,
  ): Promise<T>;
}

export interface PatientTransactionManagerPort {
  execute<T>(
    request: PatientTransactionRequest<T>,
  ): Promise<T>;
}

export interface PatientAuditEntry {
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

export interface PatientAuditPort {
  append(
    entry: PatientAuditEntry,
  ): Promise<void>;
}

export interface PatientOutboxMessage {
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

export interface PatientOutboxPort {
  enqueue(
    message: PatientOutboxMessage,
  ): Promise<void>;
}

export interface PatientClockPort {
  now(): Date;
}

export interface PatientMutationDependencies {
  transactionManager: PatientTransactionManagerPort;
  audit: PatientAuditPort;
  outbox: PatientOutboxPort;
  clock: PatientClockPort;
  snapshotCrypto?: PatientSensitiveSnapshotCryptoPort;
}

export function buildPatientAuditActorFields(
  actor: PatientActorContext,
): Pick<
  PatientAuditEntry,
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