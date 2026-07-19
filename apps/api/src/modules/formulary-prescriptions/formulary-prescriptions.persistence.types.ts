import type {
  Types,
} from 'mongoose';

import type {
  FormularyItemStatus,
  FormularyRestrictionType,
  MedicineCatalogStatus,
  MedicineFormCategory,
  MedicineInteractionCheckStatus,
  MedicineRouteCode,
  PrescriptionChangeType,
  PrescriptionDurationUnit,
  PrescriptionFrequencyKind,
  PrescriptionItemStatus,
  PrescriptionStatus,
  PrescriptionStatusChangeSource,
  PrescriptionWarningSeverity,
  PrescriptionWarningStatus,
  PrescriptionWarningType,
  ProviderSignatureMethod,
  UnitOfMeasureDimension,
} from '@hospital-mis/database';

export interface EncryptedPrescriptionSnapshotRecord {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface FormularyPersistenceMetadata {
  facilityId: Types.ObjectId;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicineRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  medicineCode: string;
  genericName: string;
  normalizedGenericName: string;
  brandNames: Array<{
    name: string;
    normalizedName: string;
    manufacturerName: string | null;
    status: MedicineCatalogStatus;
  }>;
  synonyms: string[];
  therapeuticClass: string | null;
  atcCode: string | null;
  description: string | null;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface MedicineFormRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  normalizedName: string;
  category: MedicineFormCategory;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface MedicineRouteRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  code: MedicineRouteCode;
  name: string;
  normalizedName: string;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface UnitOfMeasureRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  normalizedName: string;
  symbol: string;
  dimension: UnitOfMeasureDimension;
  decimalScale: number;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface MedicineStrengthRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  medicineId: Types.ObjectId;
  medicineFormId: Types.ObjectId;
  displayText: string;
  normalizedDisplayText: string;
  numeratorValue: Types.Decimal128;
  numeratorUnitId: Types.ObjectId;
  denominatorValue: Types.Decimal128 | null;
  denominatorUnitId: Types.ObjectId | null;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface PrescriptionFrequencyRecord
  extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  code: string;
  name: string;
  normalizedName: string;
  kind: PrescriptionFrequencyKind;
  timesPerDay: number | null;
  intervalMinutes: number | null;
  defaultAdministrationTimes: string[];
  allowsAsNeeded: boolean;
  maxAdministrationsPerDay: number | null;
  patientInstructionTemplate: string | null;
  status: MedicineCatalogStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface FormularyItemRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  formularyCode: string;
  medicineId: Types.ObjectId;
  medicineFormId: Types.ObjectId;
  medicineStrengthId: Types.ObjectId;
  brandName: string | null;
  normalizedBrandName: string | null;
  allowedRouteIds: Types.ObjectId[];
  defaultRouteId: Types.ObjectId;
  doseUnitId: Types.ObjectId;
  quantityUnitId: Types.ObjectId;
  inventoryItemId: Types.ObjectId | null;
  stockTracked: boolean;
  restrictionType: FormularyRestrictionType;
  restrictedDepartmentIds: Types.ObjectId[];
  minimumAgeYears: number | null;
  maximumAgeYears: number | null;
  highAlert: boolean;
  controlledMedicine: boolean;
  prescribingNotes: string | null;
  searchText: string;
  activeSelectionKey: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  status: FormularyItemStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  transactionId: string;
  correlationId: string;
}

export interface PrescriptionRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  prescriptionNumber: string;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  canonicalRedirected: boolean;
  encounterId: Types.ObjectId;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  queueTokenId: Types.ObjectId | null;
  departmentId: Types.ObjectId;
  clinicId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  prescriberProviderId: Types.ObjectId;
  status: PrescriptionStatus;
  revisionNumber: number;
  rootPrescriptionId: Types.ObjectId;
  supersedesPrescriptionId: Types.ObjectId | null;
  supersededByPrescriptionId: Types.ObjectId | null;
  replacementReason: string | null;
  draftedAt: Date;
  issuedAt: Date | null;
  expiresAt: Date | null;
  signedBy: Types.ObjectId | null;
  signatureMethod: ProviderSignatureMethod | null;
  signatureDigest: string | null;
  lockedAt: Date | null;
  lockedBy: Types.ObjectId | null;
  issuedSnapshotHash: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  interactionCheckStatus: MedicineInteractionCheckStatus;
  interactionCheckProvider: string | null;
  interactionCheckedAt: Date | null;
  itemCount: number;
  activeItemCount: number;
  dispensedItemCount: number;
  safetyWarningCount: number;
  unresolvedBlockingWarningCount: number;
  printRevision: number;
  lastPrintedAt: Date | null;
  lastPrintedBy: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
}

export interface PrescriptionItemRecord extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  formularyItemId: Types.ObjectId;
  medicineId: Types.ObjectId;
  medicineFormId: Types.ObjectId;
  medicineStrengthId: Types.ObjectId;
  selectedBrandName: string | null;
  genericNameSnapshot: string;
  medicineFormSnapshot: string;
  medicineStrengthSnapshot: string;
  dose: Types.Decimal128;
  doseUnitId: Types.ObjectId;
  doseUnitSnapshot: string;
  routeId: Types.ObjectId;
  routeSnapshot: string;
  frequencyId: Types.ObjectId;
  frequencySnapshot: string;
  durationValue: Types.Decimal128 | null;
  durationUnit: PrescriptionDurationUnit;
  quantity: Types.Decimal128;
  quantityUnitId: Types.ObjectId;
  quantityUnitSnapshot: string;
  instructions: string | null;
  asNeeded: boolean;
  asNeededReason: string | null;
  startDate: string;
  endDate: string | null;
  status: PrescriptionItemStatus;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  dispensedQuantity: Types.Decimal128;
  lastDispensedAt: Date | null;
  lastDispensationId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
}

export interface PrescriptionSafetyWarningRecord
  extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  prescriptionItemId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  warningFingerprint: string;
  warningType: PrescriptionWarningType;
  severity: PrescriptionWarningSeverity;
  status: PrescriptionWarningStatus;
  warningCode: string;
  message: string;
  patientAllergyId: Types.ObjectId | null;
  conflictingPrescriptionId: Types.ObjectId | null;
  conflictingPrescriptionItemId: Types.ObjectId | null;
  externalReferenceId: string | null;
  detectedAt: Date;
  detectedBy: Types.ObjectId;
  acknowledgedAt: Date | null;
  acknowledgedBy: Types.ObjectId | null;
  acknowledgementReason: string | null;
  overriddenAt: Date | null;
  overriddenBy: Types.ObjectId | null;
  overrideReason: string | null;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
  resolutionReason: string | null;
  transactionId: string;
  correlationId: string;
}

export interface PrescriptionStatusHistoryRecord
  extends FormularyPersistenceMetadata {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  patientId: Types.ObjectId;
  sequence: number;
  fromStatus: PrescriptionStatus | null;
  toStatus: PrescriptionStatus;
  changeType: PrescriptionChangeType;
  changeSource: PrescriptionStatusChangeSource;
  reason: string | null;
  encryptedSnapshot: EncryptedPrescriptionSnapshotRecord;
  snapshotHash: string;
  signedBy: Types.ObjectId | null;
  signatureMethod: ProviderSignatureMethod | null;
  signatureDigest: string | null;
  occurredAt: Date;
  changedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
}