import type {
  AdmissionRecord,
  AdmissionRecommendationRecord,
  BedRateRecord,
  BedRecord,
  RoomRecord,
  WardRecord,
} from './inpatient.persistence.types.js';

function id(
  value:
    {
      toHexString():
        string;
    } |
    null,
): string | null {
  return (
    value?.toHexString() ??
    null
  );
}

function ids(
  values:
    readonly {
      toHexString():
        string;
    }[],
): string[] {
  return values.map(
    (value) =>
      value.toHexString(),
  );
}

export interface WardSummaryView {
  id:
    string;

  wardCode:
    string;

  name:
    string;

  wardType:
    string;

  departmentId:
    string;

  servicePointId:
    string | null;

  nursingStationCode:
    string | null;

  status:
    string;

  displayOrder:
    number;

  version:
    number;

  updatedAt:
    string;
}

export interface WardOperationalView
extends WardSummaryView {
  permittedSexes:
    readonly string[];

  minimumAgeYears:
    number | null;

  maximumAgeYears:
    number | null;

  specialtyCodes:
    readonly string[];

  isolationCapabilities:
    readonly string[];

  infectionControlTags:
    readonly string[];

  negativePressureCapable:
    boolean;

  cohortingAllowed:
    boolean;

  description:
    string | null;
}

export interface RoomSummaryView {
  id:
    string;

  wardId:
    string;

  roomCode:
    string;

  roomNumber:
    string;

  name:
    string;

  roomType:
    string;

  roomClass:
    string;

  capacity:
    number;

  floorCode:
    string | null;

  status:
    string;

  displayOrder:
    number;

  version:
    number;

  updatedAt:
    string;
}

export interface RoomOperationalView
extends RoomSummaryView {
  departmentId:
    string;

  servicePointId:
    string | null;

  permittedSexes:
    readonly string[];

  minimumAgeYears:
    number | null;

  maximumAgeYears:
    number | null;

  specialtyCodes:
    readonly string[];

  isolationCapabilities:
    readonly string[];

  infectionControlTags:
    readonly string[];

  negativePressureCapable:
    boolean;

  cohortingAllowed:
    boolean;

  description:
    string | null;
}

export interface BedStatusView {
  id:
    string;

  wardId:
    string;

  roomId:
    string;

  bedCode:
    string;

  bedNumber:
    string;

  label:
    string;

  bedCategory:
    string;

  catalogStatus:
    string;

  operationalStatus:
    string;

  operationalStatusChangedAt:
    string;

  operationalStatusReasonCode:
    string;

  lastReleasedAt:
    string | null;

  turnaroundRequiredAfterRelease:
    boolean;

  maintenanceReference:
    string | null;

  displayOrder:
    number;

  version:
    number;

  updatedAt:
    string;
}

export interface BedOperationalView
extends BedStatusView {
  departmentId:
    string;

  servicePointId:
    string | null;

  permittedSexes:
    readonly string[];

  minimumAgeYears:
    number | null;

  maximumAgeYears:
    number | null;

  specialtyCodes:
    readonly string[];

  isolationCapabilities:
    readonly string[];

  infectionControlTags:
    readonly string[];

  negativePressureCapable:
    boolean;

  cohortingAllowed:
    boolean;

  currentAdmissionId:
    string | null;

  currentAssignmentId:
    string | null;

  activeHoldId:
    string | null;
}

export interface BedRateView {
  id:
    string;

  rateCode:
    string;

  name:
    string;

  scope:
    string;

  scopeReferenceId:
    string | null;

  scopeCode:
    string | null;

  currencyCode:
    string;

  amount:
    string;

  chargingPolicy: {
    policyCode:
      string;

    billingUnit:
      string;

    partialDayPolicy:
      string;

    sameDayDischargePolicy:
      string;

    transferChargingPolicy:
      string;

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
  };

  effectiveFrom:
    string;

  effectiveThrough:
    string | null;

  status:
    string;

  currentVersion:
    number;

  latestVersionId:
    string | null;

  version:
    number;
}

export interface AdmissionRecommendationSummaryView {
  id:
    string;

  recommendationNumber:
    string;

  patientId:
    string;

  encounterId:
    string;

  admissionType:
    string;

  priority:
    string;

  requestedWardTypes:
    readonly string[];

  requestedSpecialtyCodes:
    readonly string[];

  requestedIsolationCapabilities:
    readonly string[];

  expectedLengthOfStayDays:
    number | null;

  requestedAdmissionAt:
    string | null;

  recommendedAt:
    string;

  expiresAt:
    string | null;

  status:
    string;

  admissionId:
    string | null;

  orderingProviderStaffId:
    string;

  orderingDepartmentId:
    string;

  version:
    number;

  updatedAt:
    string;
}

export interface AdmissionRecommendationClinicalView
extends AdmissionRecommendationSummaryView {
  requestedPatientId:
    string;

  canonicalRedirected:
    boolean;

  registrationId:
    string | null;

  opdVisitId:
    string | null;

  queueTokenId:
    string | null;

  orderingProviderUserId:
    string;

  orderingServicePointId:
    string | null;

  clinicalIndication:
    string;

  diagnosisSnapshots:
    readonly {
      diagnosisId:
        string | null;

      diagnosisCode:
        string;

      diagnosisSystem:
        string;

      diagnosisDisplay:
        string;

      primary:
        boolean;
    }[];

  patientCoverageId:
    string | null;

  preauthorizationId:
    string | null;

  treatmentPackageId:
    string | null;

  attachmentIds:
    readonly string[];
}

export interface AdmissionSummaryView {
  id:
    string;

  admissionNumber:
    string;

  patientId:
    string;

  encounterId:
    string;

  admissionType:
    string;

  priority:
    string;

  status:
    string;

  isActive:
    boolean;

  requestedAt:
    string;

  acceptedAt:
    string | null;

  admittedAt:
    string | null;

  clinicallyDischargedAt:
    string | null;

  financiallyClearedAt:
    string | null;

  dischargedAt:
    string | null;

  attendingConsultantStaffId:
    string;

  admittingDepartmentId:
    string;

  currentWardId:
    string | null;

  currentRoomId:
    string | null;

  currentBedId:
    string | null;

  currentBedAssignmentId:
    string | null;

  currentBedAssignedAt:
    string | null;

  version:
    number;

  updatedAt:
    string;
}

export interface AdmissionClinicalView
extends AdmissionSummaryView {
  admissionRecommendationId:
    string | null;

  requestedPatientId:
    string;

  canonicalRedirected:
    boolean;

  registrationId:
    string | null;

  opdVisitId:
    string | null;

  queueTokenId:
    string | null;

  admittingServicePointId:
    string | null;

  attendingConsultantUserId:
    string;

  careTeam:
    readonly {
      userId:
        string;

      staffId:
        string;

      roleCode:
        string;

      isPrimary:
        boolean;

      assignedAt:
        string;

      endedAt:
        string | null;
    }[];

  clinicalIndicationSnapshot:
    string;

  diagnosisSnapshots:
    readonly {
      diagnosisId:
        string | null;

      diagnosisCode:
        string;

      diagnosisSystem:
        string;

      diagnosisDisplay:
        string;

      primary:
        boolean;
    }[];

  guardianSnapshot: {
    sourceId:
      string | null;

    relationshipCode:
      string;

    displayName:
      string;

    primaryPhoneMasked:
      string;

    alternatePhoneMasked:
      string | null;
  } | null;

  emergencyContactSnapshot: {
    sourceId:
      string | null;

    relationshipCode:
      string;

    displayName:
      string;

    primaryPhoneMasked:
      string;

    alternatePhoneMasked:
      string | null;
  } | null;

  payerOrganizationId:
    string | null;

  panelProgramId:
    string | null;

  panelPlanId:
    string | null;

  patientCoverageId:
    string | null;

  preauthorizationId:
    string | null;

  treatmentPackageId:
    string | null;

  depositRequirementReference:
    string | null;

  authorizationRequirementReference:
    string | null;

  billingAccountReference:
    string | null;

  dischargeId:
    string | null;
}

export function toWardSummaryView(
  record:
    WardRecord,
): WardSummaryView {
  return {
    id:
      record._id.toHexString(),

    wardCode:
      record.wardCode,

    name:
      record.name,

    wardType:
      record.wardType,

    departmentId:
      record
        .departmentId
        .toHexString(),

    servicePointId:
      id(
        record.servicePointId,
      ),

    nursingStationCode:
      record.nursingStationCode,

    status:
      record.status,

    displayOrder:
      record.displayOrder,

    version:
      record.version,

    updatedAt:
      record
        .updatedAt
        .toISOString(),
  };
}

export function toWardOperationalView(
  record:
    WardRecord,
): WardOperationalView {
  return {
    ...toWardSummaryView(
      record,
    ),

    permittedSexes:
      record.permittedSexes,

    minimumAgeYears:
      record.minimumAgeYears,

    maximumAgeYears:
      record.maximumAgeYears,

    specialtyCodes:
      record.specialtyCodes,

    isolationCapabilities:
      record.isolationCapabilities,

    infectionControlTags:
      record.infectionControlTags,

    negativePressureCapable:
      record.negativePressureCapable,

    cohortingAllowed:
      record.cohortingAllowed,

    description:
      record.description,
  };
}

export function toRoomSummaryView(
  record:
    RoomRecord,
): RoomSummaryView {
  return {
    id:
      record._id.toHexString(),

    wardId:
      record
        .wardId
        .toHexString(),

    roomCode:
      record.roomCode,

    roomNumber:
      record.roomNumber,

    name:
      record.name,

    roomType:
      record.roomType,

    roomClass:
      record.roomClass,

    capacity:
      record.capacity,

    floorCode:
      record.floorCode,

    status:
      record.status,

    displayOrder:
      record.displayOrder,

    version:
      record.version,

    updatedAt:
      record
        .updatedAt
        .toISOString(),
  };
}

export function toRoomOperationalView(
  record:
    RoomRecord,
): RoomOperationalView {
  return {
    ...toRoomSummaryView(
      record,
    ),

    departmentId:
      record
        .departmentId
        .toHexString(),

    servicePointId:
      id(
        record.servicePointId,
      ),

    permittedSexes:
      record.permittedSexes,

    minimumAgeYears:
      record.minimumAgeYears,

    maximumAgeYears:
      record.maximumAgeYears,

    specialtyCodes:
      record.specialtyCodes,

    isolationCapabilities:
      record.isolationCapabilities,

    infectionControlTags:
      record.infectionControlTags,

    negativePressureCapable:
      record.negativePressureCapable,

    cohortingAllowed:
      record.cohortingAllowed,

    description:
      record.description,
  };
}

export function toBedStatusView(
  record:
    BedRecord,
): BedStatusView {
  return {
    id:
      record._id.toHexString(),

    wardId:
      record
        .wardId
        .toHexString(),

    roomId:
      record
        .roomId
        .toHexString(),

    bedCode:
      record.bedCode,

    bedNumber:
      record.bedNumber,

    label:
      record.label,

    bedCategory:
      record.bedCategory,

    catalogStatus:
      record.status,

    operationalStatus:
      record.operationalStatus,

    operationalStatusChangedAt:
      record
        .operationalStatusChangedAt
        .toISOString(),

    operationalStatusReasonCode:
      record
        .operationalStatusReasonCode,

    lastReleasedAt:
      record
        .lastReleasedAt
        ?.toISOString() ??
      null,

    turnaroundRequiredAfterRelease:
      record
        .turnaroundRequiredAfterRelease,

    maintenanceReference:
      record.maintenanceReference,

    displayOrder:
      record.displayOrder,

    version:
      record.version,

    updatedAt:
      record
        .updatedAt
        .toISOString(),
  };
}

export function toBedOperationalView(
  record:
    BedRecord,
): BedOperationalView {
  return {
    ...toBedStatusView(
      record,
    ),

    departmentId:
      record
        .departmentId
        .toHexString(),

    servicePointId:
      id(
        record.servicePointId,
      ),

    permittedSexes:
      record.permittedSexes,

    minimumAgeYears:
      record.minimumAgeYears,

    maximumAgeYears:
      record.maximumAgeYears,

    specialtyCodes:
      record.specialtyCodes,

    isolationCapabilities:
      record.isolationCapabilities,

    infectionControlTags:
      record.infectionControlTags,

    negativePressureCapable:
      record.negativePressureCapable,

    cohortingAllowed:
      record.cohortingAllowed,

    currentAdmissionId:
      id(
        record.currentAdmissionId,
      ),

    currentAssignmentId:
      id(
        record.currentAssignmentId,
      ),

    activeHoldId:
      id(
        record.activeHoldId,
      ),
  };
}

export function toBedRateView(
  record:
    BedRateRecord,
): BedRateView {
  return {
    id:
      record._id.toHexString(),

    rateCode:
      record.rateCode,

    name:
      record.name,

    scope:
      record.scope,

    scopeReferenceId:
      id(
        record.scopeReferenceId,
      ),

    scopeCode:
      record.scopeCode,

    currencyCode:
      record.currencyCode,

    amount:
      record.amount.toString(),

    chargingPolicy: {
      ...record.chargingPolicy,
    },

    effectiveFrom:
      record
        .effectiveFrom
        .toISOString(),

    effectiveThrough:
      record
        .effectiveThrough
        ?.toISOString() ??
      null,

    status:
      record.status,

    currentVersion:
      record.currentVersion,

    latestVersionId:
      id(
        record.latestVersionId,
      ),

    version:
      record.version,
  };
}

export function toAdmissionRecommendationSummaryView(
  record:
    AdmissionRecommendationRecord,
): AdmissionRecommendationSummaryView {
  return {
    id:
      record._id.toHexString(),

    recommendationNumber:
      record.recommendationNumber,

    patientId:
      record
        .patientId
        .toHexString(),

    encounterId:
      record
        .encounterId
        .toHexString(),

    admissionType:
      record.admissionType,

    priority:
      record.priority,

    requestedWardTypes:
      record.requestedWardTypes,

    requestedSpecialtyCodes:
      record.requestedSpecialtyCodes,

    requestedIsolationCapabilities:
      record
        .requestedIsolationCapabilities,

    expectedLengthOfStayDays:
      record
        .expectedLengthOfStayDays,

    requestedAdmissionAt:
      record
        .requestedAdmissionAt
        ?.toISOString() ??
      null,

    recommendedAt:
      record
        .recommendedAt
        .toISOString(),

    expiresAt:
      record
        .expiresAt
        ?.toISOString() ??
      null,

    status:
      record.status,

    admissionId:
      id(
        record.admissionId,
      ),

    orderingProviderStaffId:
      record
        .orderingProviderStaffId
        .toHexString(),

    orderingDepartmentId:
      record
        .orderingDepartmentId
        .toHexString(),

    version:
      record.version,

    updatedAt:
      record
        .updatedAt
        .toISOString(),
  };
}

export function toAdmissionRecommendationClinicalView(
  record:
    AdmissionRecommendationRecord,
): AdmissionRecommendationClinicalView {
  return {
    ...toAdmissionRecommendationSummaryView(
      record,
    ),

    requestedPatientId:
      record
        .requestedPatientId
        .toHexString(),

    canonicalRedirected:
      record.canonicalRedirected,

    registrationId:
      id(
        record.registrationId,
      ),

    opdVisitId:
      id(
        record.opdVisitId,
      ),

    queueTokenId:
      id(
        record.queueTokenId,
      ),

    orderingProviderUserId:
      record
        .orderingProviderUserId
        .toHexString(),

    orderingServicePointId:
      id(
        record
          .orderingServicePointId,
      ),

    clinicalIndication:
      record.clinicalIndication,

    diagnosisSnapshots:
      record
        .diagnosisSnapshots
        .map(
          (diagnosis) => ({
            diagnosisId:
              id(
                diagnosis
                  .diagnosisId,
              ),

            diagnosisCode:
              diagnosis
                .diagnosisCode,

            diagnosisSystem:
              diagnosis
                .diagnosisSystem,

            diagnosisDisplay:
              diagnosis
                .diagnosisDisplay,

            primary:
              diagnosis.primary,
          }),
        ),

    patientCoverageId:
      id(
        record.patientCoverageId,
      ),

    preauthorizationId:
      id(
        record.preauthorizationId,
      ),

    treatmentPackageId:
      id(
        record.treatmentPackageId,
      ),

    attachmentIds:
      ids(
        record.attachmentIds,
      ),
  };
}

export function toAdmissionSummaryView(
  record:
    AdmissionRecord,
): AdmissionSummaryView {
  return {
    id:
      record._id.toHexString(),

    admissionNumber:
      record.admissionNumber,

    patientId:
      record
        .patientId
        .toHexString(),

    encounterId:
      record
        .encounterId
        .toHexString(),

    admissionType:
      record.admissionType,

    priority:
      record.priority,

    status:
      record.status,

    isActive:
      record.isActive,

    requestedAt:
      record
        .requestedAt
        .toISOString(),

    acceptedAt:
      record
        .acceptedAt
        ?.toISOString() ??
      null,

    admittedAt:
      record
        .admittedAt
        ?.toISOString() ??
      null,

    clinicallyDischargedAt:
      record
        .clinicallyDischargedAt
        ?.toISOString() ??
      null,

    financiallyClearedAt:
      record
        .financiallyClearedAt
        ?.toISOString() ??
      null,

    dischargedAt:
      record
        .dischargedAt
        ?.toISOString() ??
      null,

    attendingConsultantStaffId:
      record
        .attendingConsultantStaffId
        .toHexString(),

    admittingDepartmentId:
      record
        .admittingDepartmentId
        .toHexString(),

    currentWardId:
      id(
        record.currentWardId,
      ),

    currentRoomId:
      id(
        record.currentRoomId,
      ),

    currentBedId:
      id(
        record.currentBedId,
      ),

    currentBedAssignmentId:
      id(
        record
          .currentBedAssignmentId,
      ),

    currentBedAssignedAt:
      record
        .currentBedAssignedAt
        ?.toISOString() ??
      null,

    version:
      record.version,

    updatedAt:
      record
        .updatedAt
        .toISOString(),
  };
}

function contactSnapshot(
  value:
    AdmissionRecord[
      'guardianSnapshot'
    ],
): AdmissionClinicalView[
  'guardianSnapshot'
] {
  return value === null
    ? null
    : {
        sourceId:
          id(
            value.sourceId,
          ),

        relationshipCode:
          value.relationshipCode,

        displayName:
          value.displayName,

        primaryPhoneMasked:
          value.primaryPhoneMasked,

        alternatePhoneMasked:
          value
            .alternatePhoneMasked,
      };
}

export function toAdmissionClinicalView(
  record:
    AdmissionRecord,
): AdmissionClinicalView {
  return {
    ...toAdmissionSummaryView(
      record,
    ),

    admissionRecommendationId:
      id(
        record
          .admissionRecommendationId,
      ),

    requestedPatientId:
      record
        .requestedPatientId
        .toHexString(),

    canonicalRedirected:
      record.canonicalRedirected,

    registrationId:
      id(
        record.registrationId,
      ),

    opdVisitId:
      id(
        record.opdVisitId,
      ),

    queueTokenId:
      id(
        record.queueTokenId,
      ),

    admittingServicePointId:
      id(
        record
          .admittingServicePointId,
      ),

    attendingConsultantUserId:
      record
        .attendingConsultantUserId
        .toHexString(),

    careTeam:
      record.careTeam.map(
        (member) => ({
          userId:
            member
              .userId
              .toHexString(),

          staffId:
            member
              .staffId
              .toHexString(),

          roleCode:
            member.roleCode,

          isPrimary:
            member.isPrimary,

          assignedAt:
            member
              .assignedAt
              .toISOString(),

          endedAt:
            member
              .endedAt
              ?.toISOString() ??
            null,
        }),
      ),

    clinicalIndicationSnapshot:
      record
        .clinicalIndicationSnapshot,

    diagnosisSnapshots:
      record
        .diagnosisSnapshots
        .map(
          (diagnosis) => ({
            diagnosisId:
              id(
                diagnosis
                  .diagnosisId,
              ),

            diagnosisCode:
              diagnosis
                .diagnosisCode,

            diagnosisSystem:
              diagnosis
                .diagnosisSystem,

            diagnosisDisplay:
              diagnosis
                .diagnosisDisplay,

            primary:
              diagnosis.primary,
          }),
        ),

    guardianSnapshot:
      contactSnapshot(
        record.guardianSnapshot,
      ),

    emergencyContactSnapshot:
      contactSnapshot(
        record
          .emergencyContactSnapshot,
      ),

    payerOrganizationId:
      id(
        record.payerOrganizationId,
      ),

    panelProgramId:
      id(
        record.panelProgramId,
      ),

    panelPlanId:
      id(
        record.panelPlanId,
      ),

    patientCoverageId:
      id(
        record.patientCoverageId,
      ),

    preauthorizationId:
      id(
        record.preauthorizationId,
      ),

    treatmentPackageId:
      id(
        record.treatmentPackageId,
      ),

    depositRequirementReference:
      record
        .depositRequirementReference,

    authorizationRequirementReference:
      record
        .authorizationRequirementReference,

    billingAccountReference:
      record
        .billingAccountReference,

    dischargeId:
      id(
        record.dischargeId,
      ),
  };
}