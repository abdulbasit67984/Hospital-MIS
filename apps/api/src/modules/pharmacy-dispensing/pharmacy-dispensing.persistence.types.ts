import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  ControlledMedicineDirection,
  ControlledMedicineDiscrepancyStatus,
  ControlledMedicineEntryType,
  DispensationAllocationStatus,
  DispensationContext,
  DispensationItemStatus,
  DispensationPriority,
  DispensationReversalStatus,
  DispensationStatus,
  DispensationStatusChangeSource,
  DispensationSubstitutionStatus,
  DispensationSubstitutionType,
  DispensingLabelPrintReason,
  DispensingLabelStatus,
  PatientReturnDisposition,
  PatientReturnItemStatus,
  PatientReturnStatus,
  PharmacyAcknowledgementMethod,
  PharmacyCounsellingStatus,
  PharmacyFinalizationState,
  PharmacyReviewAction,
  PharmacyReviewOutcome,
  PharmacyReviewScope,
  PharmacySafetyAlertDisposition,
  PharmacySafetyAlertSeverity,
  PharmacySafetyAlertType,
  PharmacySpecialHandling,
  ReturnedMedicineIntegrity,
  ReturnedMedicineSealStatus,
} from '@hospital-mis/database';

export type PharmacyMongoSession = ClientSession;

export interface PharmacyPersistenceMetadata {
  facilityId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PharmacyActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status: string;
}

export interface PharmacyStaffRecord {
  staffId: string;
  facilityId: string;
  departmentId: string | null;
  displayName: string;
  professionalType: string | null;
  employmentStatus: string;
  isActive: boolean;
}

export interface PharmacyPatientRecord {
  patientId: string;
  facilityId: string;
  status: string;
  mrn: string | null;
  displayName: string;
  dateOfBirth: Date | null;
  birthDatePrecision: string;
  estimatedAgeYears: number | null;
  sexAtBirth: string;
}

export interface PharmacyEncounterRecord {
  encounterId: string;
  facilityId: string;
  patientId: string;
  departmentId: string;
  servicePointId: string | null;
  providerId: string;
  status: string;
}

export interface PharmacyAdmissionRecord {
  admissionId: string;
  facilityId: string;
  patientId: string;
  encounterId: string | null;
  wardId: string | null;
  status: string;
}

export interface PharmacyWardRecord {
  wardId: string;
  facilityId: string;
  departmentId: string;
  name: string;
  status: string;
}

export interface PharmacyLocationRecord {
  locationId: string;
  facilityId: string;
  locationCode: string;
  name: string;
  locationType: string;
  departmentId: string | null;
  wardId: string | null;
  servicePointId: string | null;
  supportsDispensing: boolean;
  allowsControlledMedicine: boolean;
  allowsGeneralStock: boolean;
  status: string;
}

export interface PharmacyPrescriptionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  prescriptionNumber: string;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  departmentId: Types.ObjectId;
  servicePointId: Types.ObjectId | null;
  prescriberProviderId: Types.ObjectId;
  status: string;
  revisionNumber: number;
  supersededByPrescriptionId: Types.ObjectId | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  interactionCheckStatus: string;
  unresolvedBlockingWarningCount: number;
  version: number;
}

export interface PharmacyPrescriptionItemRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  sequence: number;
  formularyItemId: Types.ObjectId;
  medicineId: Types.ObjectId;
  medicineFormId: Types.ObjectId;
  medicineStrengthId: Types.ObjectId;
  genericNameSnapshot: string;
  medicineFormSnapshot: string;
  medicineStrengthSnapshot: string;
  routeId: Types.ObjectId;
  routeSnapshot: string;
  frequencyId: Types.ObjectId;
  frequencySnapshot: string;
  quantity: Types.Decimal128;
  quantityUnitId: Types.ObjectId;
  quantityUnitSnapshot: string;
  instructions: string | null;
  status: string;
  dispensedQuantity: Types.Decimal128;
  lastDispensedAt: Date | null;
  lastDispensationId: Types.ObjectId | null;
  version: number;
}

export interface PharmacyPrescriptionWarningRecord {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  prescriptionItemId: Types.ObjectId | null;
  warningType: string;
  severity: string;
  status: string;
  warningCode: string;
  message: string;
  detectedAt: Date;
}

export interface PharmacyFormularyItemRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  medicineId: Types.ObjectId;
  medicineFormId: Types.ObjectId;
  medicineStrengthId: Types.ObjectId;
  quantityUnitId: Types.ObjectId;
  inventoryItemId: Types.ObjectId | null;
  stockTracked: boolean;
  highAlert: boolean;
  controlledMedicine: boolean;
  restrictionType: string;
  status: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}

export interface PharmacyInventoryItemRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  itemCode: string;
  name: string;
  formularyItemId: Types.ObjectId | null;
  stockUnitId: Types.ObjectId;
  issueUnitId: Types.ObjectId;
  allowFractionalStock: boolean;
  batchTrackingRequired: boolean;
  expiryTrackingRequired: boolean;
  controlledMedicine: boolean;
  highAlert: boolean;
  negativeStockAllowed: boolean;
  status: string;
  version: number;
}

export interface PharmacySafetyAlertRecord {
  _id: Types.ObjectId;
  alertFingerprint: string;
  alertType: PharmacySafetyAlertType;
  severity: PharmacySafetyAlertSeverity;
  disposition: PharmacySafetyAlertDisposition;
  code: string;
  message: string;
  sourceEntityType: string | null;
  sourceEntityId: Types.ObjectId | null;
  detectedAt: Date;
  acknowledgedByStaffId: Types.ObjectId | null;
  acknowledgedAt: Date | null;
  acknowledgementReason: string | null;
}

export interface PharmacyDispensationAllocationRecord {
  _id: Types.ObjectId;
  stockReservationItemId: Types.ObjectId;
  stockReservationAllocationId: Types.ObjectId;
  inventoryBatchId: Types.ObjectId | null;
  batchNumberSnapshot: string | null;
  expiryDateSnapshot: Date | null;
  stockUnitId: Types.ObjectId;
  reservedStockQuantity: Types.Decimal128;
  consumedStockQuantity: Types.Decimal128;
  releasedStockQuantity: Types.Decimal128;
  returnedStockQuantity: Types.Decimal128;
  status: DispensationAllocationStatus;
  stockMovementIds: Types.ObjectId[];
  reversalStockMovementIds: Types.ObjectId[];
}

export interface PharmacyDispensationRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationNumber: string;
  creationOperationKey: string;
  prescriptionId: Types.ObjectId;
  prescriptionNumberSnapshot: string;
  prescriptionRevisionNumber: number;
  prescriptionVersion: number;
  patientId: Types.ObjectId;
  requestedPatientId: Types.ObjectId;
  encounterId: Types.ObjectId | null;
  registrationId: Types.ObjectId | null;
  opdVisitId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  wardId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  prescriberProviderId: Types.ObjectId;
  pharmacyLocationId: Types.ObjectId;
  sourceStockLocationId: Types.ObjectId;
  context: DispensationContext;
  priority: DispensationPriority;
  status: DispensationStatus;
  lineCount: number;
  verifiedLineCount: number;
  completedLineCount: number;
  controlledMedicine: boolean;
  highAlertMedicine: boolean;
  secondCheckRequired: boolean;
  witnessRequired: boolean;
  stockReservationId: Types.ObjectId | null;
  queuedAt: Date;
  reviewStartedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByStaffId: Types.ObjectId | null;
  secondCheckedAt: Date | null;
  secondCheckedByStaffId: Types.ObjectId | null;
  firstDispensedAt: Date | null;
  completedAt: Date | null;
  dispensedByStaffId: Types.ObjectId | null;
  heldAt: Date | null;
  heldByStaffId: Types.ObjectId | null;
  holdReason: string | null;
  rejectedAt: Date | null;
  rejectedByStaffId: Types.ObjectId | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancelledByStaffId: Types.ObjectId | null;
  cancellationReason: string | null;
  enteredInErrorAt: Date | null;
  enteredInErrorByStaffId: Types.ObjectId | null;
  enteredInErrorReason: string | null;
  expiredAt: Date | null;
  expiresAt: Date;
  currency: string;
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  billingOperationKey: string | null;
  billingSourceRecordId: Types.ObjectId | null;
  finalizationState: PharmacyFinalizationState;
  finalizationAttemptCount: number;
  finalizationUpdatedAt: Date | null;
  recoveryReason: string | null;
  lastFailureCode: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface PharmacyDispensationItemRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationId: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  prescriptionItemId: Types.ObjectId;
  patientId: Types.ObjectId;
  lineNumber: number;
  prescribedFormularyItemId: Types.ObjectId;
  prescribedMedicineId: Types.ObjectId;
  prescribedMedicineFormId: Types.ObjectId;
  prescribedMedicineStrengthId: Types.ObjectId;
  prescribedRouteId: Types.ObjectId;
  prescribedFrequencyId: Types.ObjectId;
  prescribedMedicineSnapshot: string;
  prescribedStrengthSnapshot: string;
  prescribedFormSnapshot: string;
  prescribedRouteSnapshot: string;
  prescribedFrequencySnapshot: string;
  prescribedInstructionsSnapshot: string | null;
  prescribedQuantity: Types.Decimal128;
  prescribedQuantityUnitId: Types.ObjectId;
  requestedQuantity: Types.Decimal128;
  approvedQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  dispensedQuantity: Types.Decimal128;
  returnedQuantity: Types.Decimal128;
  reversedQuantity: Types.Decimal128;
  dispensedQuantityUnitId: Types.ObjectId | null;
  actualFormularyItemId: Types.ObjectId | null;
  actualMedicineId: Types.ObjectId | null;
  actualMedicineFormId: Types.ObjectId | null;
  actualMedicineStrengthId: Types.ObjectId | null;
  actualInventoryItemId: Types.ObjectId | null;
  actualMedicineSnapshot: string | null;
  actualStrengthSnapshot: string | null;
  actualFormSnapshot: string | null;
  substitutionId: Types.ObjectId | null;
  substitutionApplied: boolean;
  quantityRoundingApplied: boolean;
  quantityRoundingReason: string | null;
  specialHandling: PharmacySpecialHandling[];
  controlledMedicine: boolean;
  highAlertMedicine: boolean;
  safetyAlerts: PharmacySafetyAlertRecord[];
  blockingAlertCount: number;
  allocations: PharmacyDispensationAllocationRecord[];
  unitSellingPrice: Types.Decimal128;
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  pricingSource: string | null;
  priceOverrideApplied: boolean;
  priceOverrideReason: string | null;
  priceOverrideApprovedByStaffId: Types.ObjectId | null;
  status: DispensationItemStatus;
  verifiedByStaffId: Types.ObjectId | null;
  verifiedAt: Date | null;
  dispensedByStaffId: Types.ObjectId | null;
  dispensedAt: Date | null;
  holdReason: string | null;
  rejectionReason: string | null;
}

export interface PharmacyReviewEventRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationId: Types.ObjectId;
  dispensationItemId: Types.ObjectId | null;
  prescriptionId: Types.ObjectId;
  patientId: Types.ObjectId;
  scope: PharmacyReviewScope;
  action: PharmacyReviewAction;
  outcome: PharmacyReviewOutcome;
  reviewerStaffId: Types.ObjectId;
  checkerStaffId: Types.ObjectId | null;
  reason: string | null;
  safetyAlerts: PharmacySafetyAlertRecord[];
  blockingAlertCount: number;
  occurredAt: Date;
}

export interface PharmacyDispensationStatusHistoryRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationId: Types.ObjectId;
  dispensationItemId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  sequence: number;
  fromStatus: string | null;
  toStatus: string;
  changeSource: DispensationStatusChangeSource;
  actorStaffId: Types.ObjectId;
  reason: string | null;
  snapshotHash: string;
  occurredAt: Date;
}

export interface PharmacyDispensationSubstitutionRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationId: Types.ObjectId;
  dispensationItemId: Types.ObjectId;
  prescriptionItemId: Types.ObjectId;
  substitutionType: DispensationSubstitutionType;
  status: DispensationSubstitutionStatus;
  prescribedFormularyItemId: Types.ObjectId;
  prescribedMedicineId: Types.ObjectId;
  proposedFormularyItemId: Types.ObjectId;
  proposedMedicineId: Types.ObjectId;
  proposedInventoryItemId: Types.ObjectId;
  prescribedSnapshot: string;
  proposedSnapshot: string;
  formularyRuleId: Types.ObjectId | null;
  prescriberAuthorizationRequired: boolean;
  prescriberAuthorizedByProviderId: Types.ObjectId | null;
  prescriberAuthorizedAt: Date | null;
  proposedByStaffId: Types.ObjectId;
  proposedAt: Date;
  authorizedByStaffId: Types.ObjectId | null;
  authorizedAt: Date | null;
  rejectedByStaffId: Types.ObjectId | null;
  rejectedAt: Date | null;
  appliedAt: Date | null;
  reason: string;
  decisionReason: string | null;
}

export interface PharmacyControlledRegisterRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  registerNumber: string;
  registerSequence: number;
  operationKey: string;
  entryType: ControlledMedicineEntryType;
  direction: ControlledMedicineDirection;
  pharmacyLocationId: Types.ObjectId;
  stockLocationId: Types.ObjectId;
  patientId: Types.ObjectId | null;
  prescriptionId: Types.ObjectId | null;
  dispensationId: Types.ObjectId | null;
  dispensationItemId: Types.ObjectId | null;
  pharmacistStaffId: Types.ObjectId;
  witnessRequired: boolean;
  witnessStaffId: Types.ObjectId | null;
  inventoryItemId: Types.ObjectId;
  inventoryBatchId: Types.ObjectId | null;
  batchNumberSnapshot: string | null;
  expiryDateSnapshot: Date | null;
  stockUnitId: Types.ObjectId;
  quantity: Types.Decimal128;
  openingBalance: Types.Decimal128;
  closingBalance: Types.Decimal128;
  physicalBalance: Types.Decimal128 | null;
  stockMovementId: Types.ObjectId | null;
  discrepancyStatus: ControlledMedicineDiscrepancyStatus;
  discrepancyQuantity: Types.Decimal128 | null;
  discrepancyReason: string | null;
  escalationReference: string | null;
  reason: string | null;
  occurredAt: Date;
}

export interface PharmacyDispensingLabelRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  labelNumber: string;
  dispensationId: Types.ObjectId;
  dispensationItemId: Types.ObjectId;
  patientId: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  pharmacyLocationId: Types.ObjectId;
  templateCode: string;
  templateVersion: number;
  languageCode: string;
  status: DispensingLabelStatus;
  patientDisplayName: string;
  patientIdentifierSnapshot: string;
  medicineName: string;
  strength: string;
  dosageForm: string;
  quantity: Types.Decimal128;
  quantityUnitLabel: string;
  instructions: string;
  route: string;
  frequency: string;
  duration: string | null;
  storageInstructions: string | null;
  batchNumber: string | null;
  expiryDate: Date | null;
  dispensedAt: Date;
  pharmacyDisplayName: string;
  pharmacistDisplayName: string;
  generatedByStaffId: Types.ObjectId;
  generatedAt: Date;
  printCount: number;
  lastPrintedAt: Date | null;
  medicationGuideAttachmentIds: Types.ObjectId[];
}

export interface PharmacyDispensingLabelPrintRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensingLabelId: Types.ObjectId;
  dispensationId: Types.ObjectId;
  dispensationItemId: Types.ObjectId;
  printSequence: number;
  reason: DispensingLabelPrintReason;
  labelVersion: number;
  printerIdentifier: string | null;
  workstationIdentifier: string | null;
  previousPrintId: Types.ObjectId | null;
  printedByStaffId: Types.ObjectId;
  printedAt: Date;
}

export interface PharmacyCounsellingRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  dispensationId: Types.ObjectId;
  patientId: Types.ObjectId;
  dispensationItemIds: Types.ObjectId[];
  counsellingRequired: boolean;
  status: PharmacyCounsellingStatus;
  topics: string[];
  languageCode: string;
  interpreterUsed: boolean;
  interpreterStaffId: Types.ObjectId | null;
  interpreterName: string | null;
  counselledPerson: string;
  caregiverName: string | null;
  acknowledgementMethod: PharmacyAcknowledgementMethod | null;
  acknowledgementAttachmentId: Types.ObjectId | null;
  completedByStaffId: Types.ObjectId | null;
  completedAt: Date | null;
  declinedReason: string | null;
  unableReason: string | null;
  notes: string | null;
  correctionOfCounsellingRecordId: Types.ObjectId | null;
  attachmentIds: Types.ObjectId[];
}

export interface PharmacyPatientReturnRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  returnNumber: string;
  operationKey: string;
  originalDispensationId: Types.ObjectId;
  patientId: Types.ObjectId;
  admissionId: Types.ObjectId | null;
  wardId: Types.ObjectId | null;
  pharmacyLocationId: Types.ObjectId;
  receivingStockLocationId: Types.ObjectId;
  status: PatientReturnStatus;
  lineCount: number;
  totalReturnedQuantity: Types.Decimal128;
  controlledMedicine: boolean;
  witnessRequired: boolean;
  witnessStaffId: Types.ObjectId | null;
  requestedByStaffId: Types.ObjectId;
  requestedAt: Date;
  reason: string;
  currency: string;
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  finalizationState: PharmacyFinalizationState;
}

export interface PharmacyPatientReturnItemRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  patientReturnId: Types.ObjectId;
  originalDispensationId: Types.ObjectId;
  originalDispensationItemId: Types.ObjectId;
  originalAllocationId: Types.ObjectId | null;
  lineNumber: number;
  inventoryItemId: Types.ObjectId;
  inventoryBatchId: Types.ObjectId | null;
  stockUnitId: Types.ObjectId;
  quantity: Types.Decimal128;
  controlledMedicine: boolean;
  sealStatus: ReturnedMedicineSealStatus;
  storageIntegrity: ReturnedMedicineIntegrity;
  coldChainIntegrity: ReturnedMedicineIntegrity;
  contaminationRisk: string;
  restockEligible: boolean;
  disposition: PatientReturnDisposition;
  dispositionLocationId: Types.ObjectId | null;
  status: PatientReturnItemStatus;
  stockMovementIds: Types.ObjectId[];
}

export interface PharmacyDispensationReversalRecord extends PharmacyPersistenceMetadata {
  _id: Types.ObjectId;
  reversalNumber: string;
  operationKey: string;
  originalDispensationId: Types.ObjectId;
  patientId: Types.ObjectId;
  pharmacyLocationId: Types.ObjectId;
  status: DispensationReversalStatus;
  lineCount: number;
  controlledMedicine: boolean;
  witnessRequired: boolean;
  witnessStaffId: Types.ObjectId | null;
  requestedByStaffId: Types.ObjectId;
  requestedAt: Date;
  reason: string;
  currency: string;
  grossAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  taxAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  finalizationState: PharmacyFinalizationState;
}