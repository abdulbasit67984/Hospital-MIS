import type {
  RadiologyBillingStatus,
  RadiologyCatalogStatus,
  RadiologyOrderItemStatus,
  RadiologyOrderStatus,
  RadiologyPreparationStatus,
  RadiologySafetyScreeningStatus,
} from '@hospital-mis/database';

import type {
  RadiologyActorContext,
  RadiologyCatalogSearchQuery,
  RadiologyClinicalContext,
  RadiologyOrderListQuery,
} from './radiology.types.js';

import type {
  RadiologyModalityRecord,
  RadiologyOrderItemRecord,
  RadiologyOrderItemStatusHistoryRecord,
  RadiologyOrderRecord,
  RadiologyOrderStatusHistoryRecord,
  RadiologyProcedureRecord,
} from './radiology.persistence.types.js';

export interface RadiologyEncryptedSnapshot {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface ProtectedRadiologySnapshot {
  encryptedValue: RadiologyEncryptedSnapshot;
  valueHash: string;
}

export interface RadiologySnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedRadiologySnapshot;

  unprotect<T>(
    encryptedValue: RadiologyEncryptedSnapshot,
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
    encryptedValue: RadiologyEncryptedSnapshot,
  ): boolean;
}

export type RadiologyModalityPersistenceUpdate = Partial<
  Pick<
    RadiologyModalityRecord,
    | 'name'
    | 'normalizedName'
    | 'modalityType'
    | 'dicomModalityCode'
    | 'description'
    | 'availableDepartmentIds'
    | 'supportsContrast'
    | 'supportsPacsIntegration'
    | 'pacsRoutingCode'
    | 'orderable'
    | 'effectiveFrom'
    | 'effectiveThrough'
    | 'updatedBy'
  >
>;

export type RadiologyProcedurePersistenceUpdate = Partial<
  Pick<
    RadiologyProcedureRecord,
    | 'name'
    | 'normalizedName'
    | 'aliases'
    | 'normalizedAliases'
    | 'description'
    | 'modalityId'
    | 'modalityCodeSnapshot'
    | 'modalityNameSnapshot'
    | 'modalityTypeSnapshot'
    | 'dicomModalityCodeSnapshot'
    | 'bodyRegions'
    | 'lateralityRequirement'
    | 'permittedLateralities'
    | 'contrastRequirement'
    | 'permittedContrastRoutes'
    | 'preparationInstructions'
    | 'contraindications'
    | 'safetyScreeningRequirements'
    | 'expectedDurationMinutes'
    | 'routineTurnaroundMinutes'
    | 'urgentTurnaroundMinutes'
    | 'statTurnaroundMinutes'
    | 'availableDepartmentIds'
    | 'schedulingRequired'
    | 'requiresTechnician'
    | 'requiresRadiologist'
    | 'orderable'
    | 'chargeCatalogItemId'
    | 'effectiveFrom'
    | 'effectiveThrough'
    | 'updatedBy'
  >
>;

export type RadiologyOrderLifecyclePersistenceUpdate = Partial<
  Pick<
    RadiologyOrderRecord,
    | 'status'
    | 'acceptedAt'
    | 'acceptedBy'
    | 'scheduledAt'
    | 'checkedInAt'
    | 'examinationStartedAt'
    | 'examinationCompletedAt'
    | 'verifiedAt'
    | 'rejectedAt'
    | 'rejectedBy'
    | 'rejectionReasonCode'
    | 'rejectionReason'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'itemCount'
    | 'activeItemCount'
    | 'scheduledItemCount'
    | 'completedItemCount'
    | 'reportedItemCount'
    | 'verifiedItemCount'
    | 'rejectedItemCount'
    | 'lastStatusChangedAt'
    | 'lastStatusChangedBy'
    | 'updatedBy'
  >
>;

export type RadiologyOrderItemLifecyclePersistenceUpdate = Partial<
  Pick<
    RadiologyOrderItemRecord,
    | 'status'
    | 'preparationStatus'
    | 'safetyScreeningStatus'
    | 'appointmentId'
    | 'imagingStudyId'
    | 'reportId'
    | 'accessionNumber'
    | 'externalStudyIdentifier'
    | 'acceptedAt'
    | 'acceptedBy'
    | 'scheduledAt'
    | 'checkedInAt'
    | 'examinationStartedAt'
    | 'examinationCompletedAt'
    | 'verifiedAt'
    | 'rejectedAt'
    | 'rejectedBy'
    | 'rejectionReasonCode'
    | 'rejectionReason'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'accountChargeId'
    | 'billingStatus'
    | 'billingFailureCode'
    | 'updatedBy'
  >
>;

export interface RadiologyTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface RadiologyTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: RadiologyTransactionCompensation,
  ): Promise<void>;
}

export interface RadiologyTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;

  execute(
    context: RadiologyTransactionContext,
  ): Promise<T>;
}

export interface RadiologyTransactionManagerPort {
  execute<T>(
    request: RadiologyTransactionRequest<T>,
  ): Promise<T>;
}

export interface RadiologyAuditEntry {
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

export interface RadiologyAuditPort {
  append(entry: RadiologyAuditEntry): Promise<void>;
}

export interface RadiologyOutboxMessage {
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

export interface RadiologyOutboxPort {
  enqueue(message: RadiologyOutboxMessage): Promise<void>;
}

export interface RadiologyRealtimeMessage {
  eventType: string;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  orderId?: string;
  orderItemId?: string;
  appointmentId?: string;
  studyId?: string;
  reportId?: string;
  payload: Record<string, unknown>;
}

export interface RadiologyRealtimePort {
  publish(message: RadiologyRealtimeMessage): Promise<void>;
}

export interface RadiologyClockPort {
  now(): Date;
}

export interface RadiologySequenceAllocation {
  key: string;
  value: number;
}

export interface RadiologySequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<RadiologySequenceAllocation>;
}

export interface CanonicalRadiologyPatientResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  redirected: boolean;
  mergeChain: readonly string[];
}

export interface RadiologyCanonicalPatientPort {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalRadiologyPatientResolution>;
}

export interface RadiologyClinicalContextPort {
  resolveActiveEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<RadiologyClinicalContext>;
}

export interface RadiologyCatalogRepositoryPort {
  findModalityById(
    facilityId: string,
    modalityId: string,
  ): Promise<RadiologyModalityRecord | null>;

  findProcedureById(
    facilityId: string,
    procedureId: string,
  ): Promise<RadiologyProcedureRecord | null>;

  findProceduresByIds(
    facilityId: string,
    procedureIds: readonly string[],
  ): Promise<RadiologyProcedureRecord[]>;

  searchProcedures(
    facilityId: string,
    query: RadiologyCatalogSearchQuery,
  ): Promise<{
    items: RadiologyProcedureRecord[];
    total: number;
  }>;

  createModality(
    input: Omit<
      RadiologyModalityRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyModalityRecord>;

  updateModality(
    facilityId: string,
    modalityId: string,
    expectedVersion: number,
    update: RadiologyModalityPersistenceUpdate,
  ): Promise<RadiologyModalityRecord | null>;

  changeModalityStatus(
    facilityId: string,
    modalityId: string,
    expectedVersion: number,
    status: RadiologyCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<RadiologyModalityRecord | null>;

  createProcedure(
    input: Omit<
      RadiologyProcedureRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyProcedureRecord>;

  updateProcedure(
    facilityId: string,
    procedureId: string,
    expectedVersion: number,
    update: RadiologyProcedurePersistenceUpdate,
  ): Promise<RadiologyProcedureRecord | null>;

  changeProcedureStatus(
    facilityId: string,
    procedureId: string,
    expectedVersion: number,
    status: RadiologyCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<RadiologyProcedureRecord | null>;
}

export interface RadiologyOrderRepositoryPort {
  findById(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderRecord | null>;

  findByNumber(
    facilityId: string,
    orderNumber: string,
  ): Promise<RadiologyOrderRecord | null>;

  list(
    facilityId: string,
    query: RadiologyOrderListQuery,
  ): Promise<{
    items: RadiologyOrderRecord[];
    total: number;
  }>;

  listItems(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderItemRecord[]>;

  findItemById(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyOrderItemRecord | null>;

  listHistory(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderStatusHistoryRecord[]>;

  listItemHistory(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyOrderItemStatusHistoryRecord[]>;

  create(
    order: Omit<RadiologyOrderRecord, 'createdAt' | 'updatedAt'>,
    items: ReadonlyArray<
      Omit<RadiologyOrderItemRecord, 'createdAt' | 'updatedAt'>
    >,
    orderHistory: Omit<
      RadiologyOrderStatusHistoryRecord,
      'createdAt' | 'updatedAt'
    >,
    itemHistories: ReadonlyArray<
      Omit<
        RadiologyOrderItemStatusHistoryRecord,
        'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    order: RadiologyOrderRecord;
    items: RadiologyOrderItemRecord[];
  }>;

  transitionStatus(
    facilityId: string,
    orderId: string,
    expectedVersion: number,
    fromStatuses: readonly RadiologyOrderStatus[],
    update: RadiologyOrderLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderRecord | null>;

  transitionItemsForOrder(
    facilityId: string,
    orderId: string,
    fromStatuses: readonly RadiologyOrderItemStatus[],
    update: RadiologyOrderItemLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderItemRecord[]>;

  transitionItem(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    fromStatuses: readonly RadiologyOrderItemStatus[],
    update: RadiologyOrderItemLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderItemRecord | null>;

  updateItemScreening(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    safetyScreeningStatus: RadiologySafetyScreeningStatus,
    preparationStatus: RadiologyPreparationStatus,
    actorUserId: string,
  ): Promise<RadiologyOrderItemRecord | null>;

  updateItemBilling(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    billingStatus: RadiologyBillingStatus,
    accountChargeId: string | null,
    billingFailureCode: string | null,
    actorUserId: string,
  ): Promise<RadiologyOrderItemRecord | null>;

  appendHistory(
    history: Omit<
      RadiologyOrderStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderStatusHistoryRecord>;

  appendItemHistory(
    history: Omit<
      RadiologyOrderItemStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderItemStatusHistoryRecord>;
}

export type RadiologyAccessAction =
  | 'CATALOG_READ'
  | 'CATALOG_MANAGE'
  | 'ORDER_READ'
  | 'ORDER_CREATE'
  | 'ORDER_MANAGE'
  | 'ORDER_CANCEL'
  | 'SCHEDULE_READ'
  | 'SCHEDULE_MANAGE'
  | 'SAFETY_READ'
  | 'SAFETY_MANAGE'
  | 'EXAMINATION_READ'
  | 'EXAMINATION_MANAGE'
  | 'STUDY_READ'
  | 'STUDY_MANAGE'
  | 'REPORT_READ'
  | 'REPORT_ENTER'
  | 'REPORT_REVIEW'
  | 'REPORT_VERIFY'
  | 'REPORT_AMEND'
  | 'REPORT_PUBLISH'
  | 'REPORT_WITHDRAW'
  | 'REPORT_PRINT'
  | 'CRITICAL_NOTIFY'
  | 'CRITICAL_ACKNOWLEDGE';

export type RadiologyAccessMode =
  | 'CATALOG'
  | 'ASSIGNED_CLINICIAN'
  | 'RADIOLOGY_OPERATIONAL'
  | 'MEDICAL_RECORDS'
  | 'BREAK_GLASS'
  | 'DENIED';

export interface RadiologyAccessRequest {
  actor: RadiologyActorContext;
  action: RadiologyAccessAction;
  clinicalContext?: RadiologyClinicalContext;
  order?: RadiologyOrderRecord;
  orderItem?: RadiologyOrderItemRecord;
}

export interface RadiologyAccessDecision {
  allowed: boolean;
  accessMode: RadiologyAccessMode;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface RadiologyAccessPolicyPort {
  requireActiveActorStaffId(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<string>;

  authorize(
    request: RadiologyAccessRequest,
  ): Promise<RadiologyAccessDecision>;
}