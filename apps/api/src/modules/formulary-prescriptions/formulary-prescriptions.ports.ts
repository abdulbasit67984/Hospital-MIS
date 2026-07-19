import type {
  FormularyItemStatus,
  MedicineCatalogStatus,
  PrescriptionStatus,
  PrescriptionWarningSeverity,
  PrescriptionWarningType,
} from '@hospital-mis/database';

import type {
  FormularyItemRecord,
  MedicineFormRecord,
  MedicineRecord,
  MedicineRouteRecord,
  MedicineStrengthRecord,
  PrescriptionFrequencyRecord,
  PrescriptionItemRecord,
  PrescriptionRecord,
  PrescriptionSafetyWarningRecord,
  PrescriptionStatusHistoryRecord,
  UnitOfMeasureRecord,
} from './formulary-prescriptions.persistence.types.js';

import type {
  FormularyPrescriptionActorContext,
  FormularySearchQuery,
  FormularyStockView,
  PrescriptionClinicalContext,
  PrescriptionListQuery,
} from './formulary-prescriptions.types.js';

export type FormularyItemPersistenceUpdate = Partial<
  Pick<
    FormularyItemRecord,
    | 'brandName'
    | 'normalizedBrandName'
    | 'allowedRouteIds'
    | 'defaultRouteId'
    | 'doseUnitId'
    | 'quantityUnitId'
    | 'inventoryItemId'
    | 'stockTracked'
    | 'restrictionType'
    | 'restrictedDepartmentIds'
    | 'minimumAgeYears'
    | 'maximumAgeYears'
    | 'highAlert'
    | 'controlledMedicine'
    | 'prescribingNotes'
    | 'searchText'
    | 'activeSelectionKey'
    | 'effectiveFrom'
    | 'effectiveUntil'
    | 'updatedBy'
    | 'version'
  >
>;

export type PrescriptionLifecyclePersistenceUpdate = Partial<
  Pick<
    PrescriptionRecord,
    | 'status'
    | 'supersededByPrescriptionId'
    | 'issuedAt'
    | 'expiresAt'
    | 'signedBy'
    | 'signatureMethod'
    | 'signatureDigest'
    | 'lockedAt'
    | 'lockedBy'
    | 'issuedSnapshotHash'
    | 'cancelledAt'
    | 'cancelledBy'
    | 'cancellationReason'
    | 'interactionCheckStatus'
    | 'interactionCheckProvider'
    | 'interactionCheckedAt'
    | 'itemCount'
    | 'activeItemCount'
    | 'dispensedItemCount'
    | 'safetyWarningCount'
    | 'unresolvedBlockingWarningCount'
    | 'printRevision'
    | 'lastPrintedAt'
    | 'lastPrintedBy'
    | 'updatedBy'
    | 'version'
  >
>;

export interface FormularyPrescriptionEncryptedSnapshot {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface ProtectedPrescriptionSnapshot {
  encryptedValue: FormularyPrescriptionEncryptedSnapshot;
  valueHash: string;
}

export interface FormularyPrescriptionSnapshotCryptoPort {
  protect(value: unknown, associatedData: string): ProtectedPrescriptionSnapshot;
  unprotect<T>(
    encryptedValue: FormularyPrescriptionEncryptedSnapshot,
    associatedData: string,
  ): T;
  hash(value: unknown, associatedData: string): string;
  matchesHash(
    value: unknown,
    associatedData: string,
    expectedHash: string,
  ): boolean;
  needsRotation(encryptedValue: FormularyPrescriptionEncryptedSnapshot): boolean;
}

export interface FormularyPrescriptionTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface FormularyPrescriptionTransactionContext {
  transactionId: string;
  idempotencyKey: string;
  checkpoint(state: string, data?: Record<string, unknown>): Promise<void>;
  registerCompensation(
    compensation: FormularyPrescriptionTransactionCompensation,
  ): Promise<void>;
}

export interface FormularyPrescriptionTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];

  /**
   * Used only for the idempotency request hash. Medicine, allergy, warning,
   * instruction, and prescription content must not be copied into journals,
   * logs, outbox metadata, realtime payloads, or shared caches.
   */
  idempotencyPayload: unknown;

  /** Safe operational identifiers only. */
  journalPayload: Record<string, unknown>;

  execute(context: FormularyPrescriptionTransactionContext): Promise<T>;
}

export interface FormularyPrescriptionTransactionManagerPort {
  execute<T>(request: FormularyPrescriptionTransactionRequest<T>): Promise<T>;
}

export interface FormularyPrescriptionAuditEntry {
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

export interface FormularyPrescriptionAuditPort {
  append(entry: FormularyPrescriptionAuditEntry): Promise<void>;
}

export interface FormularyPrescriptionOutboxMessage {
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

export interface FormularyPrescriptionOutboxPort {
  enqueue(message: FormularyPrescriptionOutboxMessage): Promise<void>;
}

export interface FormularyPrescriptionRealtimeMessage {
  eventType: string;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  prescriptionId?: string;
  providerId?: string;
  payload: Record<string, unknown>;
}

export interface FormularyPrescriptionRealtimePort {
  publish(message: FormularyPrescriptionRealtimeMessage): Promise<void>;
}

export interface FormularyPrescriptionClockPort {
  now(): Date;
}

export interface FormularyPrescriptionSequenceAllocation {
  key: string;
  value: number;
}

export interface FormularyPrescriptionSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<FormularyPrescriptionSequenceAllocation>;
}

export interface CanonicalPrescriptionPatientResolution {
  requestedPatientId: string;
  canonicalPatientId: string;
  redirected: boolean;
  mergeChain: readonly string[];
}

export interface FormularyPrescriptionCanonicalPatientPort {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPrescriptionPatientResolution>;
}

export interface FormularyPrescriptionClinicalContextPort {
  resolveActiveEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<PrescriptionClinicalContext>;
}

export interface FormularyCatalogRepositoryPort {
  findMedicineById(
    facilityId: string,
    medicineId: string,
  ): Promise<MedicineRecord | null>;
  findMedicineFormById(
    facilityId: string,
    medicineFormId: string,
  ): Promise<MedicineFormRecord | null>;
  findMedicineRouteById(
    facilityId: string,
    medicineRouteId: string,
  ): Promise<MedicineRouteRecord | null>;
  findUnitOfMeasureById(
    facilityId: string,
    unitOfMeasureId: string,
  ): Promise<UnitOfMeasureRecord | null>;
  findMedicineStrengthById(
    facilityId: string,
    medicineStrengthId: string,
  ): Promise<MedicineStrengthRecord | null>;
  findPrescriptionFrequencyById(
    facilityId: string,
    prescriptionFrequencyId: string,
  ): Promise<PrescriptionFrequencyRecord | null>;
  findFormularyItemById(
    facilityId: string,
    formularyItemId: string,
  ): Promise<FormularyItemRecord | null>;
  searchFormulary(
    facilityId: string,
    query: FormularySearchQuery,
  ): Promise<{
    items: FormularyItemRecord[];
    total: number;
  }>;
  createFormularyItem(
    input: Omit<FormularyItemRecord, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<FormularyItemRecord>;
  updateFormularyItem(
    facilityId: string,
    formularyItemId: string,
    expectedVersion: number,
    update: FormularyItemPersistenceUpdate,
  ): Promise<FormularyItemRecord | null>;
  changeFormularyItemStatus(
    facilityId: string,
    formularyItemId: string,
    expectedVersion: number,
    status: FormularyItemStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<FormularyItemRecord | null>;
  changeMedicineStatus(
    facilityId: string,
    medicineId: string,
    expectedVersion: number,
    status: MedicineCatalogStatus,
    actorUserId: string,
    reason: string,
    occurredAt: Date,
  ): Promise<MedicineRecord | null>;
}

export interface PrescriptionRepositoryPort {
  findById(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionRecord | null>;
  findByNumber(
    facilityId: string,
    prescriptionNumber: string,
  ): Promise<PrescriptionRecord | null>;
  list(
    facilityId: string,
    query: PrescriptionListQuery,
  ): Promise<{
    items: PrescriptionRecord[];
    total: number;
  }>;
  listItems(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionItemRecord[]>;
  listHistory(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionStatusHistoryRecord[]>;
  create(
    prescription: Omit<PrescriptionRecord, '_id' | 'createdAt' | 'updatedAt'>,
    items: ReadonlyArray<
      Omit<PrescriptionItemRecord, '_id' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<{
    prescription: PrescriptionRecord;
    items: PrescriptionItemRecord[];
  }>;
  replaceDraftItems(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    items: ReadonlyArray<
      Omit<PrescriptionItemRecord, '_id' | 'createdAt' | 'updatedAt'>
    >,
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    occurredAt: Date,
  ): Promise<{
    prescription: PrescriptionRecord;
    items: PrescriptionItemRecord[];
  } | null>;
  transitionStatus(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    fromStatuses: readonly PrescriptionStatus[],
    update: PrescriptionLifecyclePersistenceUpdate,
  ): Promise<PrescriptionRecord | null>;
  linkReplacement(
    facilityId: string,
    supersededPrescriptionId: string,
    replacementPrescriptionId: string,
    expectedVersion: number,
  ): Promise<PrescriptionRecord | null>;
  appendHistory(
    history: Omit<
      PrescriptionStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<PrescriptionStatusHistoryRecord>;
  markPrinted(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    actorUserId: string,
    printedAt: Date,
  ): Promise<PrescriptionRecord | null>;
}

export interface PrescriptionSafetyFinding {
  warningFingerprint: string;
  prescriptionItemId: string | null;
  warningType: PrescriptionWarningType;
  severity: PrescriptionWarningSeverity;
  warningCode: string;
  message: string;
  patientAllergyId: string | null;
  conflictingPrescriptionId: string | null;
  conflictingPrescriptionItemId: string | null;
  externalReferenceId: string | null;
}

export interface PrescriptionSafetyEvaluationRequest {
  actor: FormularyPrescriptionActorContext;
  context: PrescriptionClinicalContext;
  prescriptionId: string;
  items: readonly PrescriptionItemRecord[];
}

export interface PrescriptionSafetyEvaluationPort {
  evaluate(
    request: PrescriptionSafetyEvaluationRequest,
  ): Promise<readonly PrescriptionSafetyFinding[]>;
}

export interface MedicineInteractionCheckResult {
  status: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
  provider: string | null;
  checkedAt: Date;
  findings: readonly PrescriptionSafetyFinding[];
}

export interface MedicineInteractionPort {
  check(
    facilityId: string,
    patientId: string,
    medicineIds: readonly string[],
  ): Promise<MedicineInteractionCheckResult>;
}

export interface PrescriptionSafetyWarningRepositoryPort {
  replaceOpenFindings(
    facilityId: string,
    prescriptionId: string,
    patientId: string,
    encounterId: string,
    findings: readonly PrescriptionSafetyFinding[],
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    detectedAt: Date,
  ): Promise<PrescriptionSafetyWarningRecord[]>;
  listForPrescription(
    facilityId: string,
    prescriptionId: string,
    includeSensitiveMessage: boolean,
  ): Promise<PrescriptionSafetyWarningRecord[]>;
  acknowledge(
    facilityId: string,
    warningId: string,
    expectedVersion: number,
    actorUserId: string,
    reason: string,
    override: boolean,
    occurredAt: Date,
  ): Promise<PrescriptionSafetyWarningRecord | null>;
}

export interface FormularyStockVisibilityPort {
  read(
    facilityId: string,
    inventoryItemIds: readonly string[],
  ): Promise<ReadonlyMap<string, FormularyStockView>>;
}

export interface PrescriptionPrintDocument {
  mediaType: 'application/pdf';
  filename: string;
  bytes: Uint8Array;
  contentHash: string;
}

export interface PrescriptionPrintPort {
  render(input: {
    prescription: PrescriptionRecord;
    items: readonly PrescriptionItemRecord[];
    warnings: readonly PrescriptionSafetyWarningRecord[];
    locale: string;
    timezone: string;
  }): Promise<PrescriptionPrintDocument>;
}