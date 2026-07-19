import type {
  FormularyItemStatus,
  FormularyRestrictionType,
  MedicineCatalogStatus,
  MedicineFormCategory,
  MedicineInteractionCheckStatus,
  MedicineRouteCode,
  PrescriptionDurationUnit,
  PrescriptionFrequencyKind,
  PrescriptionItemStatus,
  PrescriptionStatus,
  PrescriptionWarningSeverity,
  PrescriptionWarningStatus,
  PrescriptionWarningType,
  ProviderSignatureMethod,
  UnitOfMeasureDimension,
} from '@hospital-mis/database';

import type {
  FormularySortField,
  PrescriptionSortField,
} from './formulary-prescriptions.constants.js';

export type FormularyPrescriptionObjectIdString = string;
export type FormularyPrescriptionSortDirection = 'asc' | 'desc';

export interface FormularyPrescriptionActorContext {
  userId: FormularyPrescriptionObjectIdString;
  facilityId: FormularyPrescriptionObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface MedicineBrandInput {
  name: string;
  manufacturerName?: string | null;
  status?: MedicineCatalogStatus;
}

export interface CreateMedicineInput {
  medicineCode: string;
  genericName: string;
  brandNames?: readonly MedicineBrandInput[];
  synonyms?: readonly string[];
  therapeuticClass?: string | null;
  atcCode?: string | null;
  description?: string | null;
}

export interface UpdateMedicineInput {
  expectedVersion: number;
  genericName?: string;
  brandNames?: readonly MedicineBrandInput[];
  synonyms?: readonly string[];
  therapeuticClass?: string | null;
  atcCode?: string | null;
  description?: string | null;
}

export interface ChangeCatalogStatusInput {
  expectedVersion: number;
  status: MedicineCatalogStatus;
  reason: string;
}

export interface CreateMedicineFormInput {
  code: string;
  name: string;
  category: MedicineFormCategory;
}

export interface UpdateMedicineFormInput {
  expectedVersion: number;
  name?: string;
  category?: MedicineFormCategory;
}

export interface CreateMedicineRouteInput {
  code: MedicineRouteCode;
  name: string;
}

export interface UpdateMedicineRouteInput {
  expectedVersion: number;
  name: string;
}

export interface CreateUnitOfMeasureInput {
  code: string;
  name: string;
  symbol: string;
  dimension: UnitOfMeasureDimension;
  decimalScale?: number;
}

export interface UpdateUnitOfMeasureInput {
  expectedVersion: number;
  name?: string;
  symbol?: string;
  dimension?: UnitOfMeasureDimension;
  decimalScale?: number;
}

export interface CreateMedicineStrengthInput {
  medicineId: FormularyPrescriptionObjectIdString;
  medicineFormId: FormularyPrescriptionObjectIdString;
  displayText: string;
  numeratorValue: string;
  numeratorUnitId: FormularyPrescriptionObjectIdString;
  denominatorValue?: string | null;
  denominatorUnitId?: FormularyPrescriptionObjectIdString | null;
}

export interface UpdateMedicineStrengthInput {
  expectedVersion: number;
  displayText?: string;
  numeratorValue?: string;
  denominatorValue?: string | null;
}

export interface CreatePrescriptionFrequencyInput {
  code: string;
  name: string;
  kind: PrescriptionFrequencyKind;
  timesPerDay?: number | null;
  intervalMinutes?: number | null;
  defaultAdministrationTimes?: readonly string[];
  allowsAsNeeded?: boolean;
  maxAdministrationsPerDay?: number | null;
  patientInstructionTemplate?: string | null;
}

export interface UpdatePrescriptionFrequencyInput {
  expectedVersion: number;
  name?: string;
  kind?: PrescriptionFrequencyKind;
  timesPerDay?: number | null;
  intervalMinutes?: number | null;
  defaultAdministrationTimes?: readonly string[];
  allowsAsNeeded?: boolean;
  maxAdministrationsPerDay?: number | null;
  patientInstructionTemplate?: string | null;
}

export interface CreateFormularyItemInput {
  formularyCode: string;
  medicineId: FormularyPrescriptionObjectIdString;
  medicineFormId: FormularyPrescriptionObjectIdString;
  medicineStrengthId: FormularyPrescriptionObjectIdString;
  brandName?: string | null;
  allowedRouteIds: readonly FormularyPrescriptionObjectIdString[];
  defaultRouteId: FormularyPrescriptionObjectIdString;
  doseUnitId: FormularyPrescriptionObjectIdString;
  quantityUnitId: FormularyPrescriptionObjectIdString;
  inventoryItemId?: FormularyPrescriptionObjectIdString | null;
  stockTracked?: boolean;
  restrictionType?: FormularyRestrictionType;
  restrictedDepartmentIds?: readonly FormularyPrescriptionObjectIdString[];
  minimumAgeYears?: number | null;
  maximumAgeYears?: number | null;
  highAlert?: boolean;
  controlledMedicine?: boolean;
  prescribingNotes?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}

export interface UpdateFormularyItemInput {
  expectedVersion: number;
  brandName?: string | null;
  allowedRouteIds?: readonly FormularyPrescriptionObjectIdString[];
  defaultRouteId?: FormularyPrescriptionObjectIdString;
  inventoryItemId?: FormularyPrescriptionObjectIdString | null;
  stockTracked?: boolean;
  restrictionType?: FormularyRestrictionType;
  restrictedDepartmentIds?: readonly FormularyPrescriptionObjectIdString[];
  minimumAgeYears?: number | null;
  maximumAgeYears?: number | null;
  highAlert?: boolean;
  controlledMedicine?: boolean;
  prescribingNotes?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}

export interface ChangeFormularyItemStatusInput {
  expectedVersion: number;
  status: FormularyItemStatus;
  reason: string;
}

export interface FormularySearchQuery {
  page: number;
  pageSize: number;
  sortBy: FormularySortField;
  sortDirection: FormularyPrescriptionSortDirection;
  search?: string;
  status?: FormularyItemStatus;
  medicineId?: FormularyPrescriptionObjectIdString;
  medicineFormId?: FormularyPrescriptionObjectIdString;
  routeId?: FormularyPrescriptionObjectIdString;
  departmentId?: FormularyPrescriptionObjectIdString;
  includeStock?: boolean;
}

export interface PrescriptionItemInput {
  formularyItemId: FormularyPrescriptionObjectIdString;
  selectedBrandName?: string | null;
  dose: string;
  doseUnitId: FormularyPrescriptionObjectIdString;
  routeId: FormularyPrescriptionObjectIdString;
  frequencyId: FormularyPrescriptionObjectIdString;
  durationValue?: string | null;
  durationUnit: PrescriptionDurationUnit;
  quantity: string;
  quantityUnitId: FormularyPrescriptionObjectIdString;
  instructions?: string | null;
  asNeeded?: boolean;
  asNeededReason?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface CreatePrescriptionDraftInput {
  encounterId: FormularyPrescriptionObjectIdString;
  patientId: FormularyPrescriptionObjectIdString;
  prescriberProviderId: FormularyPrescriptionObjectIdString;
  items: readonly PrescriptionItemInput[];
}

export interface UpdatePrescriptionDraftInput {
  expectedVersion: number;
  items: readonly PrescriptionItemInput[];
}

export interface AcknowledgePrescriptionWarningInput {
  expectedVersion: number;
  reason: string;
  override: boolean;
}

export interface IssuePrescriptionInput {
  expectedVersion: number;
  expiresAt?: string | null;
  signatureMethod: ProviderSignatureMethod;
  signatureDigest: string;
  warningAcknowledgements?: Readonly<
    Record<FormularyPrescriptionObjectIdString, AcknowledgePrescriptionWarningInput>
  >;
}

export interface CancelPrescriptionInput {
  expectedVersion: number;
  reason: string;
}

export interface ReplacePrescriptionInput {
  expectedVersion: number;
  reason: string;
  items: readonly PrescriptionItemInput[];
  signatureMethod: ProviderSignatureMethod;
  signatureDigest: string;
  expiresAt?: string | null;
}

export interface PrintPrescriptionInput {
  expectedVersion: number;
  locale?: string;
  timezone?: string;
}

export interface PrescriptionListQuery {
  page: number;
  pageSize: number;
  sortBy: PrescriptionSortField;
  sortDirection: FormularyPrescriptionSortDirection;
  patientId?: FormularyPrescriptionObjectIdString;
  encounterId?: FormularyPrescriptionObjectIdString;
  prescriberProviderId?: FormularyPrescriptionObjectIdString;
  status?: PrescriptionStatus;
  issuedFrom?: string;
  issuedTo?: string;
  includeItems?: boolean;
  includeWarnings?: boolean;
}

export interface MedicineBrandView {
  name: string;
  manufacturerName: string | null;
  status: MedicineCatalogStatus;
}

export interface FormularyItemView {
  id: FormularyPrescriptionObjectIdString;
  facilityId: FormularyPrescriptionObjectIdString;
  formularyCode: string;
  medicineId: FormularyPrescriptionObjectIdString;
  genericName: string;
  brandName: string | null;
  medicineFormId: FormularyPrescriptionObjectIdString;
  form: string;
  medicineStrengthId: FormularyPrescriptionObjectIdString;
  strength: string;
  allowedRoutes: readonly {
    id: FormularyPrescriptionObjectIdString;
    code: MedicineRouteCode;
    name: string;
  }[];
  defaultRouteId: FormularyPrescriptionObjectIdString;
  doseUnitId: FormularyPrescriptionObjectIdString;
  doseUnit: string;
  quantityUnitId: FormularyPrescriptionObjectIdString;
  quantityUnit: string;
  inventoryItemId: FormularyPrescriptionObjectIdString | null;
  stockTracked: boolean;
  restrictionType: FormularyRestrictionType;
  restrictedDepartmentIds: readonly FormularyPrescriptionObjectIdString[];
  minimumAgeYears: number | null;
  maximumAgeYears: number | null;
  highAlert: boolean;
  controlledMedicine: boolean;
  status: FormularyItemStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  version: number;
  updatedAt: string;
  stock?: FormularyStockView;
}

export interface FormularyStockView {
  visible: boolean;
  inventoryItemId: FormularyPrescriptionObjectIdString | null;
  availableQuantity: string | null;
  unit: string | null;
  lowStock: boolean | null;
  asOf: string | null;
}

export interface PrescriptionSafetyWarningView {
  id: FormularyPrescriptionObjectIdString;
  prescriptionItemId: FormularyPrescriptionObjectIdString | null;
  warningType: PrescriptionWarningType;
  severity: PrescriptionWarningSeverity;
  status: PrescriptionWarningStatus;
  warningCode: string;
  message: string;
  patientAllergyId: FormularyPrescriptionObjectIdString | null;
  conflictingPrescriptionId: FormularyPrescriptionObjectIdString | null;
  conflictingPrescriptionItemId: FormularyPrescriptionObjectIdString | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: FormularyPrescriptionObjectIdString | null;
}

export interface PrescriptionItemView {
  id: FormularyPrescriptionObjectIdString;
  sequence: number;
  formularyItemId: FormularyPrescriptionObjectIdString;
  medicineId: FormularyPrescriptionObjectIdString;
  genericName: string;
  brandName: string | null;
  form: string;
  strength: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  durationValue: string | null;
  durationUnit: PrescriptionDurationUnit;
  quantity: string;
  quantityUnit: string;
  instructions: string | null;
  asNeeded: boolean;
  asNeededReason: string | null;
  startDate: string;
  endDate: string | null;
  status: PrescriptionItemStatus;
  dispensedQuantity: string;
  remainingQuantity: string;
  lastDispensedAt: string | null;
  lastDispensationId: FormularyPrescriptionObjectIdString | null;
}

export interface PrescriptionView {
  id: FormularyPrescriptionObjectIdString;
  facilityId: FormularyPrescriptionObjectIdString;
  prescriptionNumber: string;
  patientId: FormularyPrescriptionObjectIdString;
  requestedPatientId: FormularyPrescriptionObjectIdString;
  canonicalRedirected: boolean;
  encounterId: FormularyPrescriptionObjectIdString;
  registrationId: FormularyPrescriptionObjectIdString | null;
  opdVisitId: FormularyPrescriptionObjectIdString | null;
  queueTokenId: FormularyPrescriptionObjectIdString | null;
  departmentId: FormularyPrescriptionObjectIdString;
  clinicId: FormularyPrescriptionObjectIdString | null;
  servicePointId: FormularyPrescriptionObjectIdString | null;
  prescriberProviderId: FormularyPrescriptionObjectIdString;
  status: PrescriptionStatus;
  revisionNumber: number;
  rootPrescriptionId: FormularyPrescriptionObjectIdString;
  supersedesPrescriptionId: FormularyPrescriptionObjectIdString | null;
  supersededByPrescriptionId: FormularyPrescriptionObjectIdString | null;
  draftedAt: string;
  issuedAt: string | null;
  expiresAt: string | null;
  signedBy: FormularyPrescriptionObjectIdString | null;
  interactionCheckStatus: MedicineInteractionCheckStatus;
  itemCount: number;
  activeItemCount: number;
  dispensedItemCount: number;
  safetyWarningCount: number;
  unresolvedBlockingWarningCount: number;
  printRevision: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  items?: readonly PrescriptionItemView[];
  warnings?: readonly PrescriptionSafetyWarningView[];
}

export interface PrescriptionHistoryEntryView {
  id: FormularyPrescriptionObjectIdString;
  sequence: number;
  fromStatus: PrescriptionStatus | null;
  toStatus: PrescriptionStatus;
  changeType: string;
  changeSource: string;
  reason: string | null;
  occurredAt: string;
  changedBy: FormularyPrescriptionObjectIdString;
}

export interface PrescriptionClinicalContext {
  facilityId: FormularyPrescriptionObjectIdString;
  encounterId: FormularyPrescriptionObjectIdString;
  encounterStatus: string;
  patientId: FormularyPrescriptionObjectIdString;
  requestedPatientId: FormularyPrescriptionObjectIdString;
  canonicalRedirected: boolean;
  registrationId: FormularyPrescriptionObjectIdString | null;
  opdVisitId: FormularyPrescriptionObjectIdString | null;
  queueTokenId: FormularyPrescriptionObjectIdString | null;
  departmentId: FormularyPrescriptionObjectIdString;
  clinicId: FormularyPrescriptionObjectIdString | null;
  servicePointId: FormularyPrescriptionObjectIdString | null;
  primaryProviderId: FormularyPrescriptionObjectIdString;
  assignedProviderIds: readonly FormularyPrescriptionObjectIdString[];
  confidentiality: string;
  active: boolean;
}