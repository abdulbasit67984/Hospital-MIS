import type {
  NursingClockPort,
} from './nursing-medication.ports.js';

export interface NursingMedicationEncryptedValue {
  algorithm: string;
  keyId: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface NursingMedicationProtectedSnapshot {
  encryptedValue: NursingMedicationEncryptedValue;
  valueHash: string;
}

export interface NursingMedicationSnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): NursingMedicationProtectedSnapshot;
}

export interface NursingMedicationTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface NursingMedicationTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: NursingMedicationTransactionCompensation,
  ): Promise<void>;
}

export interface NursingMedicationTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;

  execute(
    context: NursingMedicationTransactionContext,
  ): Promise<T>;
}

export interface NursingMedicationTransactionManagerPort {
  execute<T>(
    request: NursingMedicationTransactionRequest<T>,
  ): Promise<T>;
}

export interface NursingMedicationAuditEntry {
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

export interface NursingMedicationAuditPort {
  append(
    entry: NursingMedicationAuditEntry,
  ): Promise<void>;
}

export interface NursingMedicationOutboxMessage {
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

export interface NursingMedicationOutboxPort {
  enqueue(
    message: NursingMedicationOutboxMessage,
  ): Promise<void>;
}

export interface NursingMedicationRealtimeMessage {
  eventType: string;
  facilityId: string;
  admissionId?: string;
  patientId?: string;
  wardId?: string;
  entityId?: string;
  payload: Record<string, unknown>;
}

export interface NursingMedicationRealtimePort {
  publish(
    message: NursingMedicationRealtimeMessage,
  ): Promise<void>;
}

export interface NursingMedicationSequenceAllocation {
  key: string;
  value: number;
}

export interface NursingMedicationSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<NursingMedicationSequenceAllocation>;
}

export interface NursingMedicationCommandDependencies {
  transactionManager: NursingMedicationTransactionManagerPort;
  audit: NursingMedicationAuditPort;
  outbox: NursingMedicationOutboxPort;
  realtime: NursingMedicationRealtimePort;
  clock: NursingClockPort;
  sequence: NursingMedicationSequencePort;
  snapshotCrypto: NursingMedicationSnapshotCryptoPort;
}