import type {
  AdmissionPriority,
  AdmissionStatus,
  AdmissionType,
  BedBillingUnit,
  BedCategory,
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

import type {
  InpatientAdmissionSortField,
  InpatientLocationSortField,
} from './inpatient.constants.js';

export type InpatientObjectIdString =
  string;

export type InpatientSortDirection =
  | 'asc'
  | 'desc';

export interface InpatientActorContext {
  userId:
    InpatientObjectIdString;

  facilityId:
    InpatientObjectIdString;

  correlationId:
    string;

  roleKeys:
    readonly string[];

  permissionKeys:
    readonly string[];

  ipAddress?:
    string;

  userAgent?:
    string;

  breakGlassReason?:
    string;
}

export interface InpatientLocationRestrictionsInput {
  permittedSexes:
    readonly PatientSexRestriction[];

  minimumAgeYears?:
    number | null;

  maximumAgeYears?:
    number | null;

  specialtyCodes?:
    readonly string[];

  isolationCapabilities?:
    readonly IsolationCapability[];

  infectionControlTags?:
    readonly string[];

  negativePressureCapable?:
    boolean;

  cohortingAllowed?:
    boolean;
}

export interface CreateWardInput
extends InpatientLocationRestrictionsInput {
  wardCode:
    string;

  name:
    string;

  wardType:
    WardType;

  departmentId:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  nursingStationCode?:
    string | null;

  description?:
    string | null;

  displayOrder?:
    number;
}

export interface UpdateWardInput
extends Partial<
  InpatientLocationRestrictionsInput
> {
  expectedVersion:
    number;

  name?:
    string;

  wardType?:
    WardType;

  departmentId?:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  nursingStationCode?:
    string | null;

  description?:
    string | null;

  displayOrder?:
    number;
}

export interface CreateRoomInput
extends InpatientLocationRestrictionsInput {
  wardId:
    InpatientObjectIdString;

  departmentId:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  roomCode:
    string;

  roomNumber:
    string;

  name:
    string;

  roomType:
    RoomType;

  roomClass:
    RoomClass;

  capacity:
    number;

  floorCode?:
    string | null;

  description?:
    string | null;

  displayOrder?:
    number;
}

export interface UpdateRoomInput
extends Partial<
  InpatientLocationRestrictionsInput
> {
  expectedVersion:
    number;

  departmentId?:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  roomNumber?:
    string;

  name?:
    string;

  roomType?:
    RoomType;

  roomClass?:
    RoomClass;

  capacity?:
    number;

  floorCode?:
    string | null;

  description?:
    string | null;

  displayOrder?:
    number;
}

export interface CreateBedInput
extends InpatientLocationRestrictionsInput {
  wardId:
    InpatientObjectIdString;

  roomId:
    InpatientObjectIdString;

  departmentId:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  bedCode:
    string;

  bedNumber:
    string;

  label:
    string;

  bedCategory:
    BedCategory;

  turnaroundRequiredAfterRelease?:
    boolean;

  displayOrder?:
    number;
}

export interface UpdateBedInput
extends Partial<
  InpatientLocationRestrictionsInput
> {
  expectedVersion:
    number;

  departmentId?:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString | null;

  bedNumber?:
    string;

  label?:
    string;

  bedCategory?:
    BedCategory;

  turnaroundRequiredAfterRelease?:
    boolean;

  displayOrder?:
    number;
}

export interface ChangeInpatientCatalogStatusInput {
  expectedVersion:
    number;

  status:
    InpatientCatalogStatus;

  reason:
    string;
}

export interface ChangeBedOperationalStatusInput {
  expectedVersion:
    number;

  status:
    InpatientBedStatus;

  reasonCode:
    string;

  reason?:
    string | null;

  maintenanceReference?:
    string | null;
}

export interface BedChargingPolicyInput {
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

  roundingIncrementMinutes?:
    number | null;

  minimumChargeMinutes?:
    number;

  dayBoundaryTimezone?:
    string;

  dayBoundaryHour?:
    number;

  gracePeriodMinutes?:
    number;
}

export interface CreateBedRateInput {
  rateCode:
    string;

  name:
    string;

  scope:
    BedRateScope;

  scopeReferenceId?:
    InpatientObjectIdString | null;

  scopeCode?:
    string | null;

  currencyCode?:
    string;

  amount:
    string;

  chargingPolicy:
    BedChargingPolicyInput;

  chargeCatalogItemId?:
    InpatientObjectIdString | null;

  priceListId?:
    InpatientObjectIdString | null;

  payerOrganizationId?:
    InpatientObjectIdString | null;

  panelPlanId?:
    InpatientObjectIdString | null;

  treatmentPackageId?:
    InpatientObjectIdString | null;

  effectiveFrom:
    string;

  effectiveThrough?:
    string | null;
}

export interface ActivateBedRateInput {
  expectedVersion:
    number;

  reason?:
    string | null;
}

export interface SupersedeBedRateInput {
  expectedVersion:
    number;

  replacement:
    CreateBedRateInput;

  reason:
    string;
}

export interface AdmissionDiagnosisSnapshotInput {
  diagnosisId?:
    InpatientObjectIdString | null;

  diagnosisCode:
    string;

  diagnosisSystem:
    string;

  diagnosisDisplay:
    string;

  primary?:
    boolean;
}

export interface CreateAdmissionRecommendationInput {
  encounterId:
    InpatientObjectIdString;

  orderingProviderStaffId:
    InpatientObjectIdString;

  admissionType:
    AdmissionType;

  priority:
    AdmissionPriority;

  requestedWardTypes?:
    readonly WardType[];

  requestedSpecialtyCodes?:
    readonly string[];

  requestedIsolationCapabilities?:
    readonly IsolationCapability[];

  clinicalIndication:
    string;

  diagnosisSnapshots?:
    readonly AdmissionDiagnosisSnapshotInput[];

  expectedLengthOfStayDays?:
    number | null;

  requestedAdmissionAt?:
    string | null;

  expiresAt?:
    string | null;

  patientCoverageId?:
    InpatientObjectIdString | null;

  preauthorizationId?:
    InpatientObjectIdString | null;

  treatmentPackageId?:
    InpatientObjectIdString | null;

  attachmentIds?:
    readonly InpatientObjectIdString[];
}

export interface AcceptAdmissionRecommendationInput {
  expectedVersion:
    number;
}

export interface RejectAdmissionRecommendationInput {
  expectedVersion:
    number;

  reason:
    string;
}

export interface CancelAdmissionRecommendationInput {
  expectedVersion:
    number;

  reason:
    string;
}

export interface AdmissionContactSnapshotInput {
  sourceId?:
    InpatientObjectIdString | null;

  relationshipCode:
    string;

  displayName:
    string;

  primaryPhoneMasked:
    string;

  alternatePhoneMasked?:
    string | null;
}

export interface AdmissionCareTeamMemberInput {
  userId:
    InpatientObjectIdString;

  staffId:
    InpatientObjectIdString;

  roleCode:
    string;

  isPrimary?:
    boolean;
}

export interface CreateAdmissionInput {
  admissionRecommendationId:
    InpatientObjectIdString;

  admittingDepartmentId:
    InpatientObjectIdString;

  admittingServicePointId?:
    InpatientObjectIdString | null;

  attendingConsultantUserId:
    InpatientObjectIdString;

  attendingConsultantStaffId:
    InpatientObjectIdString;

  careTeam?:
    readonly AdmissionCareTeamMemberInput[];

  guardianSnapshot?:
    AdmissionContactSnapshotInput | null;

  emergencyContactSnapshot?:
    AdmissionContactSnapshotInput | null;

  payerOrganizationId?:
    InpatientObjectIdString | null;

  panelProgramId?:
    InpatientObjectIdString | null;

  panelPlanId?:
    InpatientObjectIdString | null;

  patientCoverageId?:
    InpatientObjectIdString | null;

  preauthorizationId?:
    InpatientObjectIdString | null;

  treatmentPackageId?:
    InpatientObjectIdString | null;

  depositRequirementReference?:
    string | null;

  authorizationRequirementReference?:
    string | null;

  billingAccountReference?:
    string | null;
}

export interface AcceptAdmissionInput {
  expectedVersion:
    number;
}

export interface CancelAdmissionInput {
  expectedVersion:
    number;

  reason:
    string;
}

export interface InpatientLocationListQuery {
  page:
    number;

  pageSize:
    number;

  search?:
    string;

  wardId?:
    InpatientObjectIdString;

  roomId?:
    InpatientObjectIdString;

  departmentId?:
    InpatientObjectIdString;

  servicePointId?:
    InpatientObjectIdString;

  status?:
    InpatientCatalogStatus;

  bedStatus?:
    InpatientBedStatus;

  wardType?:
    WardType;

  roomType?:
    RoomType;

  roomClass?:
    RoomClass;

  bedCategory?:
    BedCategory;

  specialtyCode?:
    string;

  sortBy:
    InpatientLocationSortField;

  sortDirection:
    InpatientSortDirection;
}

export interface InpatientAdmissionListQuery {
  page:
    number;

  pageSize:
    number;

  patientId?:
    InpatientObjectIdString;

  encounterId?:
    InpatientObjectIdString;

  departmentId?:
    InpatientObjectIdString;

  wardId?:
    InpatientObjectIdString;

  attendingConsultantStaffId?:
    InpatientObjectIdString;

  status?:
    AdmissionStatus;

  admissionType?:
    AdmissionType;

  priority?:
    AdmissionPriority;

  activeOnly?:
    boolean;

  requestedFrom?:
    string;

  requestedTo?:
    string;

  admittedFrom?:
    string;

  admittedTo?:
    string;

  sortBy:
    InpatientAdmissionSortField;

  sortDirection:
    InpatientSortDirection;
}

export interface InpatientPatientContext {
  patientId:
    InpatientObjectIdString;

  requestedPatientId:
    InpatientObjectIdString;

  canonicalRedirected:
    boolean;

  facilityId:
    InpatientObjectIdString;

  status:
    string;

  sexAtBirth:
    PatientSexRestriction;

  ageYears:
    number | null;

  isMinor:
    boolean;
}

export interface InpatientEncounterContext {
  encounterId:
    InpatientObjectIdString;

  facilityId:
    InpatientObjectIdString;

  patientId:
    InpatientObjectIdString;

  requestedPatientId:
    InpatientObjectIdString;

  canonicalRedirected:
    boolean;

  confidentiality:
    string;

  status:
    string;

  registrationId:
    InpatientObjectIdString | null;

  opdVisitId:
    InpatientObjectIdString | null;

  queueTokenId:
    InpatientObjectIdString | null;

  departmentId:
    InpatientObjectIdString;

  clinicId:
    InpatientObjectIdString | null;

  servicePointId:
    InpatientObjectIdString | null;

  primaryProviderStaffId:
    InpatientObjectIdString;

  assignedProviderStaffIds:
    readonly InpatientObjectIdString[];
}

export interface InpatientAdmissionContext {
  patient:
    InpatientPatientContext;

  encounter:
    InpatientEncounterContext;

  orderingProviderStaffId:
    InpatientObjectIdString;

  orderingProviderUserId:
    InpatientObjectIdString;

  departmentId:
    InpatientObjectIdString;

  servicePointId:
    InpatientObjectIdString | null;
}

export interface InpatientBedCompatibilitySubject {
  patientSex:
    PatientSexRestriction;

  ageYears:
    number | null;

  specialtyCodes:
    readonly string[];

  requiredIsolationCapabilities:
    readonly IsolationCapability[];

  infectionControlTags:
    readonly string[];
}

export interface InpatientBedCompatibilityTarget {
  permittedSexes:
    readonly PatientSexRestriction[];

  minimumAgeYears:
    number | null;

  maximumAgeYears:
    number | null;

  specialtyCodes:
    readonly string[];

  isolationCapabilities:
    readonly IsolationCapability[];

  infectionControlTags:
    readonly string[];

  negativePressureCapable:
    boolean;

  cohortingAllowed:
    boolean;
}

export interface InpatientBedCompatibilityResult {
  compatible:
    boolean;

  reasons:
    readonly string[];
}

export interface InpatientNumberAllocation {
  facilityId:
    InpatientObjectIdString;

  year:
    number;

  sequenceKey:
    string;

  sequenceValue:
    number;

  number:
    string;
}

export interface InpatientBedRateResolutionQuery {
  facilityId:
    InpatientObjectIdString;

  wardId:
    InpatientObjectIdString;

  roomId:
    InpatientObjectIdString;

  bedId:
    InpatientObjectIdString;

  bedCategory:
    BedCategory;

  occurredAt:
    Date;

  payerOrganizationId?:
    InpatientObjectIdString | null;

  panelPlanId?:
    InpatientObjectIdString | null;

  treatmentPackageId?:
    InpatientObjectIdString | null;
}

export interface InpatientBedRateResolution {
  bedRateId:
    InpatientObjectIdString;

  versionId:
    InpatientObjectIdString;

  versionNumber:
    number;

  rateCode:
    string;

  status:
    BedRateStatus;

  amount:
    string;

  currencyCode:
    string;

  scope:
    BedRateScope;

  scopeReferenceId:
    InpatientObjectIdString | null;

  scopeCode:
    string | null;

  chargingPolicy:
    BedChargingPolicyInput;
}