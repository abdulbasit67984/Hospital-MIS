import type {
  Types,
} from 'mongoose';

import type {
  AdmissionPriority,
  AdmissionRecommendationStatus,
  AdmissionStatus,
  AdmissionType,
  BedAssignmentStatus,
  BedAssignmentType,
  BedBillingUnit,
  BedCategory,
  BedChargeSegmentStatus,
  BedHoldStatus,
  BedHoldType,
  BedRateScope,
  BedRateStatus,
  InpatientBedStatus,
  InpatientCatalogStatus,
  IsolationCapability,
  PartialDayPolicy,
  PatientSexRestriction,
  RoomClass,
  RoomType,
  SameDayDischargePolicy,
  TransferChargingPolicy,
  WardType,
} from '@hospital-mis/database';

export interface InpatientPersistenceMetadata {
  facilityId:
    Types.ObjectId;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  version:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface InpatientCatalogLifecycleRecord {
  status:
    InpatientCatalogStatus;

  activatedAt:
    Date;

  activatedBy:
    Types.ObjectId;

  deactivatedAt:
    Date | null;

  deactivatedBy:
    Types.ObjectId | null;

  deactivationReason:
    string | null;
}

export interface InpatientLocationRestrictionRecord {
  permittedSexes:
    PatientSexRestriction[];

  minimumAgeYears:
    number | null;

  maximumAgeYears:
    number | null;

  specialtyCodes:
    string[];

  isolationCapabilities:
    IsolationCapability[];

  infectionControlTags:
    string[];

  negativePressureCapable:
    boolean;

  cohortingAllowed:
    boolean;
}

export interface WardRecord
extends
  InpatientPersistenceMetadata,
  InpatientCatalogLifecycleRecord,
  InpatientLocationRestrictionRecord {
  _id:
    Types.ObjectId;

  wardCode:
    string;

  name:
    string;

  normalizedName:
    string;

  wardType:
    WardType;

  departmentId:
    Types.ObjectId;

  servicePointId:
    Types.ObjectId | null;

  nursingStationCode:
    string | null;

  description:
    string | null;

  displayOrder:
    number;
}

export interface RoomRecord
extends
  InpatientPersistenceMetadata,
  InpatientCatalogLifecycleRecord,
  InpatientLocationRestrictionRecord {
  _id:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  departmentId:
    Types.ObjectId;

  servicePointId:
    Types.ObjectId | null;

  roomCode:
    string;

  roomNumber:
    string;

  name:
    string;

  normalizedName:
    string;

  roomType:
    RoomType;

  roomClass:
    RoomClass;

  capacity:
    number;

  floorCode:
    string | null;

  description:
    string | null;

  displayOrder:
    number;
}

export interface BedRecord
extends
  InpatientPersistenceMetadata,
  InpatientCatalogLifecycleRecord,
  InpatientLocationRestrictionRecord {
  _id:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId;

  departmentId:
    Types.ObjectId;

  servicePointId:
    Types.ObjectId | null;

  bedCode:
    string;

  bedNumber:
    string;

  label:
    string;

  normalizedLabel:
    string;

  bedCategory:
    BedCategory;

  operationalStatus:
    InpatientBedStatus;

  operationalStatusChangedAt:
    Date;

  operationalStatusChangedBy:
    Types.ObjectId;

  operationalStatusReasonCode:
    string;

  operationalStatusReason:
    string | null;

  currentAdmissionId:
    Types.ObjectId | null;

  currentAssignmentId:
    Types.ObjectId | null;

  currentPatientId:
    Types.ObjectId | null;

  activeHoldId:
    Types.ObjectId | null;

  lastReleasedAt:
    Date | null;

  turnaroundRequiredAfterRelease:
    boolean;

  maintenanceReference:
    string | null;

  displayOrder:
    number;
}

export interface BedChargingPolicyRecord {
  policyCode:
    string;

  billingUnit:
    BedBillingUnit;

  partialDayPolicy:
    PartialDayPolicy;

  sameDayDischargePolicy:
    SameDayDischargePolicy;

  transferChargingPolicy:
    TransferChargingPolicy;

  roundingIncrementMinutes:
    number | null;

  minimumChargeMinutes:
    number;

  dayBoundaryTimezone:
    string;

  dayBoundaryHour:
    number;

  gracePeriodMinutes:
    number;
}

export interface BedRateRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  rateCode:
    string;

  name:
    string;

  scope:
    BedRateScope;

  scopeKey:
    string;

  scopeReferenceId:
    Types.ObjectId | null;

  scopeCode:
    string | null;

  currencyCode:
    string;

  amount:
    Types.Decimal128;

  chargingPolicy:
    BedChargingPolicyRecord;

  chargeCatalogItemId:
    Types.ObjectId | null;

  priceListId:
    Types.ObjectId | null;

  payerOrganizationId:
    Types.ObjectId | null;

  panelPlanId:
    Types.ObjectId | null;

  treatmentPackageId:
    Types.ObjectId | null;

  effectiveFrom:
    Date;

  effectiveThrough:
    Date | null;

  status:
    BedRateStatus;

  currentVersion:
    number;

  latestVersionId:
    Types.ObjectId | null;

  activatedAt:
    Date | null;

  activatedBy:
    Types.ObjectId | null;

  supersededAt:
    Date | null;

  supersededBy:
    Types.ObjectId | null;

  supersededByRateId:
    Types.ObjectId | null;

  cancelledAt:
    Date | null;

  cancelledBy:
    Types.ObjectId | null;

  cancellationReason:
    string | null;
}

export type BedRateVersionChangeType =
  | 'CREATED'
  | 'ACTIVATED'
  | 'SUPERSEDED'
  | 'CORRECTED'
  | 'CANCELLED'
  | 'RECOVERY';

export interface BedRateVersionRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  bedRateId:
    Types.ObjectId;

  versionNumber:
    number;

  previousVersionId:
    Types.ObjectId | null;

  changeType:
    BedRateVersionChangeType;

  rateCodeSnapshot:
    string;

  nameSnapshot:
    string;

  scopeSnapshot:
    BedRateScope;

  scopeKeySnapshot:
    string;

  scopeReferenceIdSnapshot:
    Types.ObjectId | null;

  scopeCodeSnapshot:
    string | null;

  currencyCodeSnapshot:
    string;

  amountSnapshot:
    Types.Decimal128;

  chargingPolicySnapshot:
    BedChargingPolicyRecord;

  chargeCatalogItemIdSnapshot:
    Types.ObjectId | null;

  priceListIdSnapshot:
    Types.ObjectId | null;

  payerOrganizationIdSnapshot:
    Types.ObjectId | null;

  panelPlanIdSnapshot:
    Types.ObjectId | null;

  treatmentPackageIdSnapshot:
    Types.ObjectId | null;

  effectiveFromSnapshot:
    Date;

  effectiveThroughSnapshot:
    Date | null;

  statusSnapshot:
    BedRateStatus;

  snapshotHash:
    string;

  changeReason:
    string | null;

  recordedAt:
    Date;

  recordedBy:
    Types.ObjectId;
}

export interface AdmissionDiagnosisSnapshotRecord {
  diagnosisId:
    Types.ObjectId | null;

  diagnosisCode:
    string;

  diagnosisSystem:
    string;

  diagnosisDisplay:
    string;

  primary:
    boolean;
}

export interface AdmissionContactSnapshotRecord {
  sourceId:
    Types.ObjectId | null;

  relationshipCode:
    string;

  displayName:
    string;

  primaryPhoneMasked:
    string;

  alternatePhoneMasked:
    string | null;
}

export interface AdmissionCareTeamMemberRecord {
  userId:
    Types.ObjectId;

  staffId:
    Types.ObjectId;

  roleCode:
    string;

  isPrimary:
    boolean;

  assignedAt:
    Date;

  assignedBy:
    Types.ObjectId;

  endedAt:
    Date | null;

  endedBy:
    Types.ObjectId | null;
}

export interface AdmissionRecommendationRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  recommendationNumber:
    string;

  patientId:
    Types.ObjectId;

  requestedPatientId:
    Types.ObjectId;

  canonicalRedirected:
    boolean;

  encounterId:
    Types.ObjectId;

  registrationId:
    Types.ObjectId | null;

  opdVisitId:
    Types.ObjectId | null;

  queueTokenId:
    Types.ObjectId | null;

  orderingProviderUserId:
    Types.ObjectId;

  orderingProviderStaffId:
    Types.ObjectId;

  orderingDepartmentId:
    Types.ObjectId;

  orderingServicePointId:
    Types.ObjectId | null;

  admissionType:
    AdmissionType;

  priority:
    AdmissionPriority;

  requestedWardTypes:
    WardType[];

  requestedSpecialtyCodes:
    string[];

  requestedIsolationCapabilities:
    IsolationCapability[];

  clinicalIndication:
    string;

  diagnosisSnapshots:
    AdmissionDiagnosisSnapshotRecord[];

  expectedLengthOfStayDays:
    number | null;

  requestedAdmissionAt:
    Date | null;

  recommendedAt:
    Date;

  status:
    AdmissionRecommendationStatus;

  acceptedAt:
    Date | null;

  acceptedBy:
    Types.ObjectId | null;

  acceptedByStaffId:
    Types.ObjectId | null;

  rejectedAt:
    Date | null;

  rejectedBy:
    Types.ObjectId | null;

  rejectedByStaffId:
    Types.ObjectId | null;

  rejectionReason:
    string | null;

  cancelledAt:
    Date | null;

  cancelledBy:
    Types.ObjectId | null;

  cancelledByStaffId:
    Types.ObjectId | null;

  cancellationReason:
    string | null;

  expiresAt:
    Date | null;

  admissionId:
    Types.ObjectId | null;

  convertedAt:
    Date | null;

  convertedBy:
    Types.ObjectId | null;

  patientCoverageId:
    Types.ObjectId | null;

  preauthorizationId:
    Types.ObjectId | null;

  treatmentPackageId:
    Types.ObjectId | null;

  attachmentIds:
    Types.ObjectId[];
}

export interface AdmissionRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  admissionNumber:
    string;

  admissionRecommendationId:
    Types.ObjectId | null;

  patientId:
    Types.ObjectId;

  requestedPatientId:
    Types.ObjectId;

  canonicalRedirected:
    boolean;

  encounterId:
    Types.ObjectId;

  registrationId:
    Types.ObjectId | null;

  opdVisitId:
    Types.ObjectId | null;

  queueTokenId:
    Types.ObjectId | null;

  admittingDepartmentId:
    Types.ObjectId;

  admittingServicePointId:
    Types.ObjectId | null;

  admissionType:
    AdmissionType;

  priority:
    AdmissionPriority;

  status:
    AdmissionStatus;

  isActive:
    boolean;

  requestedAt:
    Date;

  acceptedAt:
    Date | null;

  acceptedBy:
    Types.ObjectId | null;

  acceptedByStaffId:
    Types.ObjectId | null;

  admittedAt:
    Date | null;

  admittedBy:
    Types.ObjectId | null;

  admittedByStaffId:
    Types.ObjectId | null;

  clinicallyDischargedAt:
    Date | null;

  financiallyClearedAt:
    Date | null;

  dischargedAt:
    Date | null;

  cancelledAt:
    Date | null;

  cancelledBy:
    Types.ObjectId | null;

  cancelledByStaffId:
    Types.ObjectId | null;

  cancellationReason:
    string | null;

  attendingConsultantUserId:
    Types.ObjectId;

  attendingConsultantStaffId:
    Types.ObjectId;

  careTeam:
    AdmissionCareTeamMemberRecord[];

  clinicalIndicationSnapshot:
    string;

  diagnosisSnapshots:
    AdmissionDiagnosisSnapshotRecord[];

  guardianSnapshot:
    AdmissionContactSnapshotRecord | null;

  emergencyContactSnapshot:
    AdmissionContactSnapshotRecord | null;

  payerOrganizationId:
    Types.ObjectId | null;

  panelProgramId:
    Types.ObjectId | null;

  panelPlanId:
    Types.ObjectId | null;

  patientCoverageId:
    Types.ObjectId | null;

  preauthorizationId:
    Types.ObjectId | null;

  treatmentPackageId:
    Types.ObjectId | null;

  depositRequirementReference:
    string | null;

  authorizationRequirementReference:
    string | null;

  billingAccountReference:
    string | null;

  currentWardId:
    Types.ObjectId | null;

  currentRoomId:
    Types.ObjectId | null;

  currentBedId:
    Types.ObjectId | null;

  currentBedAssignmentId:
    Types.ObjectId | null;

  currentBedAssignedAt:
    Date | null;

  currentStatusSequence:
    number;

  latestStatusHistoryId:
    Types.ObjectId | null;

  dischargeId:
    Types.ObjectId | null;
}

export type AdmissionHistoryChangeType =
  | 'CREATED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'BED_ASSIGNED'
  | 'TRANSFER_STARTED'
  | 'TRANSFER_COMPLETED'
  | 'DISCHARGE_INITIATED'
  | 'CLINICALLY_DISCHARGED'
  | 'FINANCIAL_CLEARANCE_REQUESTED'
  | 'DISCHARGED'
  | 'CANCELLED'
  | 'CORRECTED'
  | 'RECOVERY';

export interface AdmissionStatusHistoryRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  sequence:
    number;

  fromStatus:
    AdmissionStatus | null;

  toStatus:
    AdmissionStatus;

  changeType:
    AdmissionHistoryChangeType;

  reasonCode:
    string;

  reason:
    string | null;

  admissionBedAssignmentId:
    Types.ObjectId | null;

  bedId:
    Types.ObjectId | null;

  dischargeId:
    Types.ObjectId | null;

  occurredAt:
    Date;

  performedBy:
    Types.ObjectId;

  performedByStaffId:
    Types.ObjectId;
}

export interface BedHoldRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  holdNumber:
    string;

  bedId:
    Types.ObjectId;

  roomId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId | null;

  admissionRecommendationId:
    Types.ObjectId | null;

  patientId:
    Types.ObjectId;

  holdType:
    BedHoldType;

  status:
    BedHoldStatus;

  isActive:
    boolean;

  heldAt:
    Date;

  expiresAt:
    Date;

  heldBy:
    Types.ObjectId;

  heldByStaffId:
    Types.ObjectId;

  reasonCode:
    string;

  reason:
    string;

  consumedAt:
    Date | null;

  consumedBy:
    Types.ObjectId | null;

  admissionBedAssignmentId:
    Types.ObjectId | null;

  endedAt:
    Date | null;

  endedBy:
    Types.ObjectId | null;

  endingReason:
    string | null;
}

export type BedReleaseReason =
  | 'TRANSFER'
  | 'DISCHARGE'
  | 'DEATH'
  | 'LEAVE'
  | 'CANCELLATION'
  | 'CORRECTION'
  | 'OTHER';

export interface AdmissionBedAssignmentRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  assignmentNumber:
    string;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  sequence:
    number;

  assignmentType:
    BedAssignmentType;

  status:
    BedAssignmentStatus;

  isActive:
    boolean;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId;

  bedId:
    Types.ObjectId;

  wardCodeSnapshot:
    string;

  wardNameSnapshot:
    string;

  roomCodeSnapshot:
    string;

  roomNumberSnapshot:
    string;

  bedCodeSnapshot:
    string;

  bedNumberSnapshot:
    string;

  bedCategorySnapshot:
    string;

  bedHoldId:
    Types.ObjectId | null;

  previousAssignmentId:
    Types.ObjectId | null;

  assignedAt:
    Date;

  assignedBy:
    Types.ObjectId;

  assignedByStaffId:
    Types.ObjectId;

  releasedAt:
    Date | null;

  releasedBy:
    Types.ObjectId | null;

  releasedByStaffId:
    Types.ObjectId | null;

  releaseReasonCode:
    BedReleaseReason | null;

  releaseReason:
    string | null;

  nextAssignmentId:
    Types.ObjectId | null;

  turnaroundRequired:
    boolean;

  bedChargeSegmentId:
    Types.ObjectId | null;
}

export type BedStatusChangeReason =
  | 'ACTIVATED'
  | 'DEACTIVATED'
  | 'RESERVED'
  | 'RESERVATION_RELEASED'
  | 'OCCUPIED'
  | 'PATIENT_TRANSFERRED'
  | 'PATIENT_DISCHARGED'
  | 'TURNAROUND_STARTED'
  | 'TURNAROUND_COMPLETED'
  | 'MAINTENANCE_STARTED'
  | 'MAINTENANCE_COMPLETED'
  | 'BLOCKED'
  | 'UNBLOCKED'
  | 'CORRECTION'
  | 'RECOVERY';

export interface BedStatusHistoryRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  bedId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId;

  sequence:
    number;

  fromStatus:
    InpatientBedStatus | null;

  toStatus:
    InpatientBedStatus;

  reasonCode:
    BedStatusChangeReason;

  reason:
    string | null;

  admissionId:
    Types.ObjectId | null;

  admissionBedAssignmentId:
    Types.ObjectId | null;

  bedHoldId:
    Types.ObjectId | null;

  maintenanceReference:
    string | null;

  occurredAt:
    Date;

  performedBy:
    Types.ObjectId;

  performedByStaffId:
    Types.ObjectId;
}

export interface BedChargeSegmentRecord
extends InpatientPersistenceMetadata {
  _id:
    Types.ObjectId;

  segmentNumber:
    string;

  admissionId:
    Types.ObjectId;

  admissionBedAssignmentId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  wardId:
    Types.ObjectId;

  roomId:
    Types.ObjectId;

  bedId:
    Types.ObjectId;

  bedRateId:
    Types.ObjectId;

  bedRateVersionId:
    Types.ObjectId;

  bedRateVersionNumber:
    number;

  rateCodeSnapshot:
    string;

  currencyCode:
    string;

  unitRate:
    Types.Decimal128;

  chargingPolicySnapshot:
    BedChargingPolicyRecord;

  startedAt:
    Date;

  endedAt:
    Date | null;

  isOpen:
    boolean;

  billableMinutes:
    number | null;

  quantity:
    Types.Decimal128 | null;

  grossAmount:
    Types.Decimal128 | null;

  status:
    BedChargeSegmentStatus;

  billingRequestId:
    string | null;

  billingChargeReference:
    string | null;

  billedAt:
    Date | null;

  reversalRequestId:
    string | null;

  reversalReference:
    string | null;

  reversedAt:
    Date | null;

  correctionReason:
    string | null;
}