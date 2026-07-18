import type {
  ClinicalConfidentiality,
  ClinicalDocumentType,
  EncounterStatus,
} from '@hospital-mis/database';

import type {
  ClinicalEmrActorContext,
} from './clinical-emr.types.js';

export interface ClinicalEmrEncryptedSnapshot {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface ProtectedClinicalSnapshot {
  encryptedValue: ClinicalEmrEncryptedSnapshot;
  valueHash: string;
}

export interface ClinicalEmrSnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedClinicalSnapshot;

  unprotect<T>(
    encryptedValue: ClinicalEmrEncryptedSnapshot,
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
    encryptedValue: ClinicalEmrEncryptedSnapshot,
  ): boolean;
}

export interface ClinicalEmrTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ClinicalEmrTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: ClinicalEmrTransactionCompensation,
  ): Promise<void>;
}

export interface ClinicalEmrTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];

  /**
   * Used only to calculate the idempotency request hash. Clinical content in this
   * value must never be copied into journals, logs, audit metadata, outbox events,
   * realtime events, notifications, or shared caches.
   */
  idempotencyPayload: unknown;

  /**
   * Safe operational metadata suitable for the durable transaction journal.
   */
  journalPayload: Record<string, unknown>;

  execute(
    context: ClinicalEmrTransactionContext,
  ): Promise<T>;
}

export interface ClinicalEmrTransactionManagerPort {
  execute<T>(
    request: ClinicalEmrTransactionRequest<T>,
  ): Promise<T>;
}

export interface ClinicalEmrAuditEntry {
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

export interface ClinicalEmrAuditPort {
  append(
    entry: ClinicalEmrAuditEntry,
  ): Promise<void>;
}

export interface ClinicalEmrOutboxMessage {
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

export interface ClinicalEmrOutboxPort {
  enqueue(
    message: ClinicalEmrOutboxMessage,
  ): Promise<void>;
}

export interface ClinicalEmrRealtimeMessage {
  eventType: string;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  providerId?: string;
  payload: Record<string, unknown>;
}

export interface ClinicalEmrRealtimePort {
  publish(
    message: ClinicalEmrRealtimeMessage,
  ): Promise<void>;
}

export interface ClinicalEmrClockPort {
  now(): Date;
}

export interface ClinicalEmrSequenceAllocation {
  key: string;
  value: number;
}

export interface ClinicalEmrSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<ClinicalEmrSequenceAllocation>;
}

export interface CanonicalClinicalPatientResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  redirected: boolean;
  mergeChain: readonly string[];
}

export interface ClinicalEmrCanonicalPatientPort {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalClinicalPatientResolution>;
}

export interface ClinicalAccessRequest {
  actor: ClinicalEmrActorContext;
  patientId: string;
  encounterId?: string;
  assignedProviderIds?: readonly string[];
  confidentiality: ClinicalConfidentiality;
  documentType?: ClinicalDocumentType;
  intendedAction:
    | 'READ'
    | 'CREATE'
    | 'UPDATE'
    | 'FINALIZE'
    | 'AMEND'
    | 'CORRECT';
}

export interface ClinicalAccessDecision {
  allowed: boolean;
  accessMode:
    | 'ASSIGNED'
    | 'FACILITY_WIDE'
    | 'BREAK_GLASS'
    | 'DENIED';
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface ClinicalEmrAccessPolicyPort {
  authorize(
    request: ClinicalAccessRequest,
  ): Promise<ClinicalAccessDecision>;
}

export interface EncounterLinkageSnapshot {
  facilityId: string;
  patientId: string;
  registrationId: string | null;
  opdVisitId: string | null;
  queueTokenId: string | null;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  visitStatus: string | null;
  queueStatus: string | null;
}

export interface ClinicalEmrEncounterContextPort {
  resolveFromOpdVisit(
    facilityId: string,
    opdVisitId: string,
  ): Promise<EncounterLinkageSnapshot>;
}


export interface ClinicalEmrOpdLifecycleMutationInput {
  facilityId: string;
  opdVisitId: string;
  queueTokenId: string | null;
  providerId: string;
  occurredAt: Date;
  actorUserId: string;
  transactionId: string;
  correlationId: string;
}

export interface ClinicalEmrOpdLifecycleMutationResult {
  opdVisitId: string;
  visitStatus: string;
  visitVersion: number;
  queueTokenId: string | null;
  queueStatus: string | null;
  queueVersion: number | null;
}

export interface ClinicalEmrOpdLifecyclePort {
  startConsultation(
    input: ClinicalEmrOpdLifecycleMutationInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalEmrOpdLifecycleMutationResult>;

  completeConsultation(
    input: ClinicalEmrOpdLifecycleMutationInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalEmrOpdLifecycleMutationResult>;
}

export interface ClinicalEmrMutationDependencies {
  transactionManager: ClinicalEmrTransactionManagerPort;
  audit: ClinicalEmrAuditPort;
  outbox: ClinicalEmrOutboxPort;
  realtime: ClinicalEmrRealtimePort;
  clock: ClinicalEmrClockPort;
  sequence: ClinicalEmrSequencePort;
  canonicalPatient: ClinicalEmrCanonicalPatientPort;
  accessPolicy: ClinicalEmrAccessPolicyPort;
  snapshotCrypto: ClinicalEmrSnapshotCryptoPort;
  opdLifecycle: ClinicalEmrOpdLifecyclePort;
}

export interface SafeEncounterEventPayload {
  encounterNumber: string;
  encounterStatus: EncounterStatus;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  ownerProviderId: string;
  serviceDate: string;
}

export function buildClinicalEmrAuditActorFields(
  actor: ClinicalEmrActorContext,
): Pick<
  ClinicalEmrAuditEntry,
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