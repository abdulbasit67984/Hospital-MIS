import type {
  ControlledMedicineDiscrepancyStatus,
  DispensationContext,
  DispensationItemStatus,
  DispensationPriority,
  DispensationStatus,
  DispensationSubstitutionType,
  PatientReturnDisposition,
  PharmacyAcknowledgementMethod,
  PharmacyCounsellingStatus,
  PharmacyReviewAction,
  PharmacyReviewOutcome,
  PharmacySafetyAlertDisposition,
  PharmacySafetyAlertSeverity,
  PharmacySafetyAlertType,
  ReturnedMedicineIntegrity,
  ReturnedMedicineSealStatus,
} from '@hospital-mis/database';

import type {
  PharmacyDispensingSortField,
} from './pharmacy-dispensing.constants.js';

export type PharmacyObjectIdString = string;
export type PharmacySortDirection = 'asc' | 'desc';

export interface PharmacyDispensingActorContext {
  userId: PharmacyObjectIdString;
  facilityId: PharmacyObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface PharmacyActorStaffContext {
  userId: PharmacyObjectIdString;
  staffId: PharmacyObjectIdString;
  facilityId: PharmacyObjectIdString;
  departmentId: PharmacyObjectIdString | null;
  displayName: string;
  professionalType: string | null;
}

export interface PharmacyLocationContext {
  locationId: PharmacyObjectIdString;
  facilityId: PharmacyObjectIdString;
  locationCode: string;
  name: string;
  locationType: string;
  departmentId: PharmacyObjectIdString | null;
  wardId: PharmacyObjectIdString | null;
  servicePointId: PharmacyObjectIdString | null;
  supportsDispensing: boolean;
  allowsControlledMedicine: boolean;
  status: string;
}

export interface PharmacyOperationalContext {
  actor: PharmacyActorStaffContext;
  location: PharmacyLocationContext;
}

export interface CreateDispensationIntakeItemInput {
  prescriptionItemId: PharmacyObjectIdString;
  requestedQuantity?: string;
}

export interface CreateDispensationIntakeInput {
  prescriptionId: PharmacyObjectIdString;
  expectedPrescriptionVersion: number;
  context: DispensationContext;
  pharmacyLocationId: PharmacyObjectIdString;
  priority?: DispensationPriority;
  admissionId?: PharmacyObjectIdString | null;
  wardId?: PharmacyObjectIdString | null;
  expiresAt?: string;
  items?: readonly CreateDispensationIntakeItemInput[];
}

export interface PharmacyReviewAlertDecisionInput {
  alertFingerprint: string;
  disposition: PharmacySafetyAlertDisposition;
  reason?: string;
}

export interface VerifyDispensationInput {
  expectedVersion: number;
  action?: Extract<
    PharmacyReviewAction,
    'VERIFIED' | 'SECOND_CHECK_APPROVED' | 'CONTROLLED_MEDICINE_AUTHORIZED'
  >;
  outcome: PharmacyReviewOutcome;
  alertDecisions?: readonly PharmacyReviewAlertDecisionInput[];
  reason?: string;
}

export interface HoldDispensationInput {
  expectedVersion: number;
  reason: string;
}

export interface ReleaseDispensationInput {
  expectedVersion: number;
  reason: string;
}

export interface RejectDispensationInput {
  expectedVersion: number;
  reason: string;
}

export interface ProposeDispensationSubstitutionInput {
  expectedItemVersion: number;
  substitutionType: DispensationSubstitutionType;
  proposedFormularyItemId: PharmacyObjectIdString;
  reason: string;
}

export interface DecideDispensationSubstitutionInput {
  expectedVersion: number;
  decision: 'AUTHORIZE' | 'REJECT';
  reason: string;
  prescriberAuthorizationProviderId?: PharmacyObjectIdString | null;
}

export interface ReserveDispensationItemInput {
  dispensationItemId: PharmacyObjectIdString;
  requestedQuantity: string;
}

export interface ReserveDispensationStockInput {
  expectedVersion: number;
  reservationMinutes?: number;
  items: readonly ReserveDispensationItemInput[];
}

export interface DispenseAllocationInput {
  allocationId: PharmacyObjectIdString;
  stockQuantity: string;
  scannedBarcode?: string | null;
}

export interface DispenseItemInput {
  dispensationItemId: PharmacyObjectIdString;
  expectedVersion: number;
  quantity: string;
  quantityUnitId: PharmacyObjectIdString;
  allocations: readonly DispenseAllocationInput[];
}

export interface CompleteDispensationInput {
  expectedVersion: number;
  items: readonly DispenseItemInput[];
  witnessStaffId?: PharmacyObjectIdString | null;
  priceOverrideReason?: string | null;
  counsellingRequired?: boolean;
}

export interface CreatePatientReturnItemInput {
  originalDispensationItemId: PharmacyObjectIdString;
  originalAllocationId?: PharmacyObjectIdString | null;
  quantity: string;
  sealStatus: ReturnedMedicineSealStatus;
  storageIntegrity: ReturnedMedicineIntegrity;
  coldChainIntegrity: ReturnedMedicineIntegrity;
  contaminationRisk: 'NONE_IDENTIFIED' | 'POSSIBLE' | 'CONFIRMED' | 'UNKNOWN';
  requestedDisposition?: PatientReturnDisposition;
}

export interface CreatePatientReturnInput {
  originalDispensationId: PharmacyObjectIdString;
  receivingStockLocationId: PharmacyObjectIdString;
  reason: string;
  witnessStaffId?: PharmacyObjectIdString | null;
  items: readonly CreatePatientReturnItemInput[];
}

export interface CreateDispensationReversalInput {
  expectedDispensationVersion: number;
  reason: string;
  witnessStaffId?: PharmacyObjectIdString | null;
  dispensationItemIds?: readonly PharmacyObjectIdString[];
}

export interface PrintDispensingLabelInput {
  expectedLabelVersion?: number;
  printerIdentifier?: string | null;
  workstationIdentifier?: string | null;
  reason?: 'INITIAL' | 'REPRINT' | 'CORRECTION';
}

export interface RecordPharmacyCounsellingInput {
  dispensationItemIds?: readonly PharmacyObjectIdString[];
  status: PharmacyCounsellingStatus;
  topics?: readonly string[];
  languageCode: string;
  interpreterUsed?: boolean;
  interpreterStaffId?: PharmacyObjectIdString | null;
  interpreterName?: string | null;
  counselledPerson?: 'PATIENT' | 'CAREGIVER' | 'BOTH';
  caregiverName?: string | null;
  acknowledgementMethod?: PharmacyAcknowledgementMethod | null;
  acknowledgementAttachmentId?: PharmacyObjectIdString | null;
  declinedReason?: string | null;
  unableReason?: string | null;
  notes?: string | null;
  attachmentIds?: readonly PharmacyObjectIdString[];
}

export interface PharmacyDispensationListQuery {
  page?: number;
  pageSize?: number;
  status?: readonly DispensationStatus[];
  context?: readonly DispensationContext[];
  priority?: readonly DispensationPriority[];
  pharmacyLocationId?: PharmacyObjectIdString;
  patientId?: PharmacyObjectIdString;
  prescriptionId?: PharmacyObjectIdString;
  admissionId?: PharmacyObjectIdString;
  controlledMedicine?: boolean;
  from?: string;
  to?: string;
  search?: string;
  sortBy?: PharmacyDispensingSortField;
  sortDirection?: PharmacySortDirection;
}

export interface PharmacyDispensationItemListQuery {
  status?: readonly DispensationItemStatus[];
  controlledMedicine?: boolean;
  highAlertMedicine?: boolean;
}

export interface PharmacyControlledRegisterListQuery {
  page?: number;
  pageSize?: number;
  pharmacyLocationId?: PharmacyObjectIdString;
  inventoryItemId?: PharmacyObjectIdString;
  batchId?: PharmacyObjectIdString;
  patientId?: PharmacyObjectIdString;
  discrepancyStatus?: ControlledMedicineDiscrepancyStatus;
  from?: string;
  to?: string;
}

export interface PharmacySafetyAlertView {
  fingerprint: string;
  type: PharmacySafetyAlertType;
  severity: PharmacySafetyAlertSeverity;
  disposition: PharmacySafetyAlertDisposition;
  code: string;
  message: string;
  detectedAt: string;
  acknowledgementReason: string | null;
}

export interface PharmacyAllocationView {
  allocationId: PharmacyObjectIdString;
  reservationItemId: PharmacyObjectIdString;
  inventoryBatchId: PharmacyObjectIdString | null;
  batchNumber: string | null;
  expiryDate: string | null;
  stockUnitId: PharmacyObjectIdString;
  reservedStockQuantity: string;
  consumedStockQuantity: string;
  releasedStockQuantity: string;
  returnedStockQuantity: string;
  status: string;
}

export interface PharmacyDispensationItemView {
  id: PharmacyObjectIdString;
  lineNumber: number;
  prescriptionItemId: PharmacyObjectIdString;
  prescribedFormularyItemId: PharmacyObjectIdString;
  prescribedMedicineId: PharmacyObjectIdString;
  prescribedMedicine: string;
  prescribedStrength: string;
  prescribedForm: string;
  prescribedRoute: string;
  prescribedFrequency: string;
  prescribedQuantity: string;
  prescribedQuantityUnitId: PharmacyObjectIdString;
  requestedQuantity: string;
  approvedQuantity: string;
  reservedQuantity: string;
  dispensedQuantity: string;
  returnedQuantity: string;
  actualFormularyItemId: PharmacyObjectIdString | null;
  actualInventoryItemId: PharmacyObjectIdString | null;
  actualMedicine: string | null;
  actualStrength: string | null;
  actualForm: string | null;
  controlledMedicine: boolean;
  highAlertMedicine: boolean;
  safetyAlerts: readonly PharmacySafetyAlertView[];
  allocations: readonly PharmacyAllocationView[];
  unitSellingPrice: string;
  grossAmount: string;
  discountAmount: string;
  taxAmount: string;
  netAmount: string;
  currency: string;
  status: DispensationItemStatus;
  version: number;
  verifiedAt: string | null;
  dispensedAt: string | null;
}

export interface PharmacyDispensationView {
  id: PharmacyObjectIdString;
  dispensationNumber: string;
  prescriptionId: PharmacyObjectIdString;
  prescriptionNumber: string;
  prescriptionRevisionNumber: number;
  prescriptionVersion: number;
  patientId: PharmacyObjectIdString;
  encounterId: PharmacyObjectIdString | null;
  admissionId: PharmacyObjectIdString | null;
  wardId: PharmacyObjectIdString | null;
  departmentId: PharmacyObjectIdString | null;
  servicePointId: PharmacyObjectIdString | null;
  prescriberProviderId: PharmacyObjectIdString;
  pharmacyLocationId: PharmacyObjectIdString;
  sourceStockLocationId: PharmacyObjectIdString;
  context: DispensationContext;
  priority: DispensationPriority;
  status: DispensationStatus;
  controlledMedicine: boolean;
  highAlertMedicine: boolean;
  secondCheckRequired: boolean;
  witnessRequired: boolean;
  stockReservationId: PharmacyObjectIdString | null;
  lineCount: number;
  verifiedLineCount: number;
  completedLineCount: number;
  queuedAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  firstDispensedAt: string | null;
  completedAt: string | null;
  grossAmount: string;
  discountAmount: string;
  taxAmount: string;
  netAmount: string;
  currency: string;
  version: number;
  items?: readonly PharmacyDispensationItemView[];
}

export interface PharmacyPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PharmacyPricingRequest {
  facilityId: PharmacyObjectIdString;
  patientId: PharmacyObjectIdString;
  prescriptionId: PharmacyObjectIdString;
  dispensationId: PharmacyObjectIdString;
  dispensationItemId: PharmacyObjectIdString;
  formularyItemId: PharmacyObjectIdString;
  inventoryItemId: PharmacyObjectIdString;
  inventoryBatchId: PharmacyObjectIdString | null;
  stockQuantity: string;
  currency: string;
  context: DispensationContext;
  admissionId: PharmacyObjectIdString | null;
  occurredAt: Date;
}

export interface PharmacyPricingResult {
  unitSellingPrice: string;
  grossAmount: string;
  discountAmount: string;
  taxAmount: string;
  netAmount: string;
  currency: string;
  pricingSource: string;
  authoritativeRecordId: PharmacyObjectIdString | null;
  priceOverrideRequired: boolean;
}

export interface PharmacySafetyEvaluationRequest {
  facilityId: PharmacyObjectIdString;
  patientId: PharmacyObjectIdString;
  encounterId: PharmacyObjectIdString | null;
  admissionId: PharmacyObjectIdString | null;
  prescriptionId: PharmacyObjectIdString;
  prescriptionItemIds: readonly PharmacyObjectIdString[];
  evaluatedAt: Date;
}

export interface PharmacySafetyFinding {
  fingerprint: string;
  type: PharmacySafetyAlertType;
  severity: PharmacySafetyAlertSeverity;
  disposition: PharmacySafetyAlertDisposition;
  code: string;
  message: string;
  prescriptionItemId: PharmacyObjectIdString | null;
  sourceEntityType: string | null;
  sourceEntityId: PharmacyObjectIdString | null;
}