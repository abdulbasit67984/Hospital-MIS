import type {
  LaboratoryBillingStatus,
  LaboratoryCatalogStatus,
  LaboratoryOrderItemStatus,
  LaboratoryOrderStatus,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import type {
  LaboratoryActorContext,
  LaboratoryCatalogSearchQuery,
  LaboratoryClinicalContext,
  LaboratoryOrderListQuery,
} from './laboratory.types.js';

import type {
  EncryptedLaboratorySnapshotRecord,
  LaboratoryCriticalResultCommunicationRecord,
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryOrderStatusHistoryRecord,
  LaboratoryResultRecord,
  LaboratoryResultVersionRecord,
  LaboratorySpecimenRecord,
  LaboratorySpecimenStatusHistoryRecord,
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from './laboratory.persistence.types.js';

export type LaboratoryCategoryPersistenceUpdate = Partial<
  Pick<
    LaboratoryTestCategoryRecord,
    | 'name'
    | 'normalizedName'
    | 'description'
    | 'displayOrder'
    | 'updatedBy'
  >
>;

export type LaboratoryTestPersistenceUpdate = Partial<
  Pick<
    LaboratoryTestRecord,
    | 'name'
    | 'normalizedName'
    | 'aliases'
    | 'normalizedAliases'
    | 'categoryId'
    | 'categoryCodeSnapshot'
    | 'categoryNameSnapshot'
    | 'description'
    | 'methodCode'
    | 'methodName'
    | 'requiresSpecimen'
    | 'specimenRequirements'
    | 'components'
    | 'routineTurnaroundMinutes'
    | 'urgentTurnaroundMinutes'
    | 'statTurnaroundMinutes'
    | 'availableDepartmentIds'
    | 'orderable'
    | 'requiresResultValidation'
    | 'requiresResultVerification'
    | 'criticalNotificationRequired'
    | 'chargeCatalogItemId'
    | 'effectiveFrom'
    | 'effectiveThrough'
    | 'updatedBy'
  >
>;

export type LaboratoryOrderLifecyclePersistenceUpdate = Partial<
  Pick<
    LaboratoryOrderRecord,
    | 'status'
    | 'acceptedAt'
    | 'acceptedBy'
    | 'collectionCompletedAt'
    | 'processingStartedAt'
    | 'completedAt'
    | 'verifiedAt'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'itemCount'
    | 'activeItemCount'
    | 'collectedItemCount'
    | 'completedItemCount'
    | 'verifiedItemCount'
    | 'rejectedItemCount'
    | 'criticalResultCount'
    | 'lastStatusChangedAt'
    | 'lastStatusChangedBy'
    | 'updatedBy'
  >
>;

export type LaboratoryOrderItemLifecyclePersistenceUpdate = Partial<
  Pick<
    LaboratoryOrderItemRecord,
    | 'status'
    | 'activeSpecimenId'
    | 'specimenCount'
    | 'recollectionCount'
    | 'resultId'
    | 'acceptedAt'
    | 'acceptedBy'
    | 'processingStartedAt'
    | 'completedAt'
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

export type LaboratorySpecimenLifecyclePersistenceUpdate = Partial<
  Pick<
    LaboratorySpecimenRecord,
    | 'status'
    | 'labelPrintCount'
    | 'labelPrintedAt'
    | 'labelPrintedBy'
    | 'collectedVolume'
    | 'collectedVolumeUnitCode'
    | 'collectionMethod'
    | 'collectionSite'
    | 'collectedAt'
    | 'collectedBy'
    | 'collectorStaffId'
    | 'receivedAt'
    | 'receivedBy'
    | 'processingStartedAt'
    | 'processingStartedBy'
    | 'completedAt'
    | 'completedBy'
    | 'rejectedAt'
    | 'rejectedBy'
    | 'rejectionReasonCode'
    | 'rejectionReason'
    | 'recollectionRequestedAt'
    | 'recollectionRequestedBy'
    | 'recollectionReason'
    | 'replacementSpecimenId'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'lastStatusChangedAt'
    | 'lastStatusChangedBy'
    | 'updatedBy'
  >
>;

export type LaboratoryResultLifecyclePersistenceUpdate = Partial<
  Pick<
    LaboratoryResultRecord,
    | 'status'
    | 'components'
    | 'overallFlag'
    | 'criticalComponentCount'
    | 'unresolvedCriticalComponentCount'
    | 'conclusion'
    | 'technicalNotes'
    | 'enteredAt'
    | 'enteredBy'
    | 'technicianStaffId'
    | 'validatedAt'
    | 'validatedBy'
    | 'validatorStaffId'
    | 'verifiedAt'
    | 'verifiedBy'
    | 'verifierStaffId'
    | 'currentVersion'
    | 'latestVersionId'
    | 'correctedAt'
    | 'correctedBy'
    | 'correctionReason'
    | 'supersedesResultVersionId'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'publicationStatus'
    | 'publishedAt'
    | 'publishedBy'
    | 'withdrawnAt'
    | 'withdrawnBy'
    | 'withdrawalReason'
    | 'updatedBy'
  >
>;

export interface ProtectedLaboratorySnapshot {
  encryptedValue: EncryptedLaboratorySnapshotRecord;
  valueHash: string;
}

export interface LaboratorySnapshotCryptoPort {
  protect(
    value: unknown,
    associatedData: string,
  ): ProtectedLaboratorySnapshot;

  unprotect<T>(
    encryptedValue: EncryptedLaboratorySnapshotRecord,
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
    encryptedValue: EncryptedLaboratorySnapshotRecord,
  ): boolean;
}

export interface LaboratoryTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface LaboratoryTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation: LaboratoryTransactionCompensation,
  ): Promise<void>;
}

export interface LaboratoryTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;

  execute(
    context: LaboratoryTransactionContext,
  ): Promise<T>;
}

export interface LaboratoryTransactionManagerPort {
  execute<T>(
    request: LaboratoryTransactionRequest<T>,
  ): Promise<T>;
}

export interface LaboratoryAuditEntry {
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

export interface LaboratoryAuditPort {
  append(entry: LaboratoryAuditEntry): Promise<void>;
}

export interface LaboratoryOutboxMessage {
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

export interface LaboratoryOutboxPort {
  enqueue(message: LaboratoryOutboxMessage): Promise<void>;
}

export interface LaboratoryRealtimeMessage {
  eventType: string;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  orderId?: string;
  specimenId?: string;
  resultId?: string;
  payload: Record<string, unknown>;
}

export interface LaboratoryRealtimePort {
  publish(message: LaboratoryRealtimeMessage): Promise<void>;
}

export interface LaboratoryClockPort {
  now(): Date;
}

export interface LaboratorySequenceAllocation {
  key: string;
  value: number;
}

export interface LaboratorySequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<LaboratorySequenceAllocation>;
}

export interface CanonicalLaboratoryPatientResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  redirected: boolean;
  mergeChain: readonly string[];
}

export interface LaboratoryCanonicalPatientPort {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalLaboratoryPatientResolution>;
}

export interface LaboratoryClinicalContextPort {
  resolveActiveEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<LaboratoryClinicalContext>;
}

export interface LaboratoryCatalogRepositoryPort {
  findCategoryById(
    facilityId: string,
    categoryId: string,
  ): Promise<LaboratoryTestCategoryRecord | null>;

  findTestById(
    facilityId: string,
    testId: string,
  ): Promise<LaboratoryTestRecord | null>;

  findTestsByIds(
    facilityId: string,
    testIds: readonly string[],
  ): Promise<LaboratoryTestRecord[]>;

  searchTests(
    facilityId: string,
    query: LaboratoryCatalogSearchQuery,
  ): Promise<{
    items: LaboratoryTestRecord[];
    total: number;
  }>;

  createCategory(
    input: Omit<
      LaboratoryTestCategoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryTestCategoryRecord>;

  updateCategory(
    facilityId: string,
    categoryId: string,
    expectedVersion: number,
    update: LaboratoryCategoryPersistenceUpdate,
  ): Promise<LaboratoryTestCategoryRecord | null>;

  changeCategoryStatus(
    facilityId: string,
    categoryId: string,
    expectedVersion: number,
    status: LaboratoryCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<LaboratoryTestCategoryRecord | null>;

  createTest(
    input: Omit<
      LaboratoryTestRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryTestRecord>;

  updateTest(
    facilityId: string,
    testId: string,
    expectedVersion: number,
    update: LaboratoryTestPersistenceUpdate,
  ): Promise<LaboratoryTestRecord | null>;

  changeTestStatus(
    facilityId: string,
    testId: string,
    expectedVersion: number,
    status: LaboratoryCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<LaboratoryTestRecord | null>;
}

export interface LaboratoryOrderRepositoryPort {
  findById(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderRecord | null>;

  findByNumber(
    facilityId: string,
    orderNumber: string,
  ): Promise<LaboratoryOrderRecord | null>;

  list(
    facilityId: string,
    query: LaboratoryOrderListQuery,
  ): Promise<{
    items: LaboratoryOrderRecord[];
    total: number;
  }>;

  listItems(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderItemRecord[]>;

  findItemById(
    facilityId: string,
    orderItemId: string,
  ): Promise<LaboratoryOrderItemRecord | null>;

  listHistory(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderStatusHistoryRecord[]>;

  create(
    order: Omit<
      LaboratoryOrderRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    items: ReadonlyArray<
      Omit<
        LaboratoryOrderItemRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    order: LaboratoryOrderRecord;
    items: LaboratoryOrderItemRecord[];
  }>;

  transitionStatus(
    facilityId: string,
    orderId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryOrderStatus[],
    update: LaboratoryOrderLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderRecord | null>;

  transitionItemsForOrder(
    facilityId: string,
    orderId: string,
    fromStatuses: readonly LaboratoryOrderItemStatus[],
    update: LaboratoryOrderItemLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderItemRecord[]>;

  transitionItem(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryOrderItemStatus[],
    update: LaboratoryOrderItemLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderItemRecord | null>;

  updateItemBilling(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    billingStatus: LaboratoryBillingStatus,
    accountChargeId: string | null,
    actorUserId: string,
  ): Promise<LaboratoryOrderItemRecord | null>;

  appendHistory(
    history: Omit<
      LaboratoryOrderStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryOrderStatusHistoryRecord>;
}

export interface LaboratorySpecimenRepositoryPort {
  findById(
    facilityId: string,
    specimenId: string,
  ): Promise<LaboratorySpecimenRecord | null>;

  listForOrder(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratorySpecimenRecord[]>;

  listForOrderItem(
    facilityId: string,
    orderItemId: string,
  ): Promise<LaboratorySpecimenRecord[]>;

  listHistory(
    facilityId: string,
    specimenId: string,
  ): Promise<LaboratorySpecimenStatusHistoryRecord[]>;

  create(
    specimen: Omit<
      LaboratorySpecimenRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratorySpecimenRecord>;

  transitionStatus(
    facilityId: string,
    specimenId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratorySpecimenStatus[],
    update: LaboratorySpecimenLifecyclePersistenceUpdate,
  ): Promise<LaboratorySpecimenRecord | null>;

  linkReplacement(
    facilityId: string,
    specimenId: string,
    expectedVersion: number,
    replacementSpecimenId: string,
    actorUserId: string,
  ): Promise<LaboratorySpecimenRecord | null>;

  appendHistory(
    history: Omit<
      LaboratorySpecimenStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratorySpecimenStatusHistoryRecord>;
}

export interface LaboratoryResultRepositoryPort {
  findById(
    facilityId: string,
    resultId: string,
  ): Promise<LaboratoryResultRecord | null>;

  findByOrderItemId(
    facilityId: string,
    orderItemId: string,
  ): Promise<LaboratoryResultRecord | null>;

  create(
    result: Omit<
      LaboratoryResultRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryResultRecord>;

  transitionStatus(
    facilityId: string,
    resultId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryResultStatus[],
    update: LaboratoryResultLifecyclePersistenceUpdate,
  ): Promise<LaboratoryResultRecord | null>;

  transitionPublication(
    facilityId: string,
    resultId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryResultPublicationStatus[],
    update: LaboratoryResultLifecyclePersistenceUpdate,
  ): Promise<LaboratoryResultRecord | null>;

  appendVersion(
    version: Omit<
      LaboratoryResultVersionRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryResultVersionRecord>;

  appendCriticalCommunication(
    communication: Omit<
      LaboratoryCriticalResultCommunicationRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryCriticalResultCommunicationRecord>;
}

export type LaboratoryAccessAction =
  | 'CATALOG_READ'
  | 'CATALOG_MANAGE'
  | 'ORDER_READ'
  | 'ORDER_CREATE'
  | 'ORDER_MANAGE'
  | 'ORDER_CANCEL'
  | 'SPECIMEN_READ'
  | 'SPECIMEN_COLLECT'
  | 'SPECIMEN_RECEIVE'
  | 'SPECIMEN_REJECT'
  | 'RESULT_READ'
  | 'RESULT_ENTER'
  | 'RESULT_VALIDATE'
  | 'RESULT_VERIFY'
  | 'RESULT_AMEND'
  | 'RESULT_PUBLISH'
  | 'RESULT_PRINT'
  | 'CRITICAL_NOTIFY'
  | 'CRITICAL_ACKNOWLEDGE';

export type LaboratoryAccessMode =
  | 'CATALOG'
  | 'ASSIGNED_CLINICIAN'
  | 'LABORATORY_OPERATIONAL'
  | 'MEDICAL_RECORDS'
  | 'BREAK_GLASS'
  | 'DENIED';

export interface LaboratoryAccessRequest {
  actor: LaboratoryActorContext;
  action: LaboratoryAccessAction;
  clinicalContext?: LaboratoryClinicalContext;
  order?: LaboratoryOrderRecord;
  result?: LaboratoryResultRecord;
}

export interface LaboratoryAccessDecision {
  allowed: boolean;
  accessMode: LaboratoryAccessMode;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface LaboratoryAccessPolicyPort {
  authorize(
    request: LaboratoryAccessRequest,
  ): Promise<LaboratoryAccessDecision>;
}

export interface LaboratoryReportDocument {
  mediaType: 'application/pdf';
  filename: string;
  bytes: Uint8Array;
  contentHash: string;
}

export interface LaboratoryReportRendererPort {
  render(input: {
    order: LaboratoryOrderRecord;
    items: readonly LaboratoryOrderItemRecord[];
    results: readonly LaboratoryResultRecord[];
    locale: string;
    timezone: string;
  }): Promise<LaboratoryReportDocument>;
}