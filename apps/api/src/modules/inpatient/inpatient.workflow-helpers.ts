import {
  INPATIENT_LOCK_NAMESPACE,
} from './inpatient.constants.js';

import type {
  AdmissionRecommendationRecord,
  AdmissionRecord,
  BedRateRecord,
  BedRecord,
  RoomRecord,
  WardRecord,
} from './inpatient.persistence.types.js';

export function inpatientLockKey(
  namespace:
    string,

  facilityId:
    string,

  ...parts:
    readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map(
      (
        value,
      ) =>
        value
          .trim()
          .toLowerCase(),
    )
    .join(':');
}

export function wardCreateLockKeys(
  facilityId:
    string,

  wardCode:
    string,

  normalizedName:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      'code',
      wardCode,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      'name',
      normalizedName,
    ),
  ];
}

export function wardMutationLockKeys(
  facilityId:
    string,

  wardId:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      wardId,
    ),
  ];
}

export function roomCreateLockKeys(
  facilityId:
    string,

  wardId:
    string,

  roomCode:
    string,

  roomNumber:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      wardId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ROOM,
      facilityId,
      wardId,
      'code',
      roomCode,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ROOM,
      facilityId,
      wardId,
      'number',
      roomNumber,
    ),
  ];
}

export function roomMutationLockKeys(
  facilityId:
    string,

  wardId:
    string,

  roomId:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      wardId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ROOM,
      facilityId,
      roomId,
    ),
  ];
}

export function bedCreateLockKeys(
  facilityId:
    string,

  wardId:
    string,

  roomId:
    string,

  bedCode:
    string,

  bedNumber:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      wardId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ROOM,
      facilityId,
      roomId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED,
      facilityId,
      'code',
      bedCode,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED,
      facilityId,
      roomId,
      'number',
      bedNumber,
    ),
  ];
}

export function bedMutationLockKeys(
  facilityId:
    string,

  wardId:
    string,

  roomId:
    string,

  bedId:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.WARD,
      facilityId,
      wardId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ROOM,
      facilityId,
      roomId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED,
      facilityId,
      bedId,
    ),
  ];
}

export function bedRateCreateLockKeys(
  facilityId:
    string,

  rateCode:
    string,

  scopeKey:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED_RATE_SCOPE,
      facilityId,
      'code',
      rateCode,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED_RATE_SCOPE,
      facilityId,
      scopeKey,
    ),
  ];
}

export function bedRateMutationLockKeys(
  facilityId:
    string,

  bedRate:
    Pick<
      BedRateRecord,
      '_id' |
      'scopeKey'
    >,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED_RATE_SCOPE,
      facilityId,
      bedRate.scopeKey,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.BED_RATE_SCOPE,
      facilityId,
      bedRate
        ._id
        .toHexString(),
    ),
  ];
}

export function recommendationCreateLockKeys(
  facilityId:
    string,

  patientId:
    string,

  encounterId:
    string,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.PATIENT_ADMISSION,
      facilityId,
      patientId,
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ADMISSION_RECOMMENDATION,
      facilityId,
      'encounter',
      encounterId,
    ),
  ];
}

export function recommendationMutationLockKeys(
  facilityId:
    string,

  recommendation:
    Pick<
      AdmissionRecommendationRecord,
      '_id' |
      'patientId' |
      'encounterId'
    >,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.PATIENT_ADMISSION,
      facilityId,
      recommendation
        .patientId
        .toHexString(),
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ADMISSION_RECOMMENDATION,
      facilityId,
      recommendation
        ._id
        .toHexString(),
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ADMISSION_RECOMMENDATION,
      facilityId,
      'encounter',
      recommendation
        .encounterId
        .toHexString(),
    ),
  ];
}

export function admissionMutationLockKeys(
  facilityId:
    string,

  admission:
    Pick<
      AdmissionRecord,
      '_id' |
      'patientId'
    >,
): string[] {
  return [
    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.PATIENT_ADMISSION,
      facilityId,
      admission
        .patientId
        .toHexString(),
    ),

    inpatientLockKey(
      INPATIENT_LOCK_NAMESPACE.ADMISSION,
      facilityId,
      admission
        ._id
        .toHexString(),
    ),
  ];
}

export function safeWardSnapshot(
  record:
    WardRecord,
): Record<string, unknown> {
  return {
    wardId:
      record._id.toHexString(),

    wardCode:
      record.wardCode,

    name:
      record.name,

    wardType:
      record.wardType,

    departmentId:
      record.departmentId.toHexString(),

    servicePointId:
      record.servicePointId?.toHexString() ??
      null,

    status:
      record.status,

    specialtyCodes:
      record.specialtyCodes,

    isolationCapabilities:
      record.isolationCapabilities,

    displayOrder:
      record.displayOrder,

    version:
      record.version,
  };
}

export function safeRoomSnapshot(
  record:
    RoomRecord,
): Record<string, unknown> {
  return {
    roomId:
      record._id.toHexString(),

    wardId:
      record.wardId.toHexString(),

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

    status:
      record.status,

    displayOrder:
      record.displayOrder,

    version:
      record.version,
  };
}

export function safeBedSnapshot(
  record:
    BedRecord,
): Record<string, unknown> {
  return {
    bedId:
      record._id.toHexString(),

    wardId:
      record.wardId.toHexString(),

    roomId:
      record.roomId.toHexString(),

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

    currentAdmissionId:
      record.currentAdmissionId?.toHexString() ??
      null,

    activeHoldId:
      record.activeHoldId?.toHexString() ??
      null,

    version:
      record.version,
  };
}

export function safeBedRateSnapshot(
  record:
    BedRateRecord,
): Record<string, unknown> {
  return {
    bedRateId:
      record._id.toHexString(),

    rateCode:
      record.rateCode,

    name:
      record.name,

    scope:
      record.scope,

    scopeReferenceId:
      record.scopeReferenceId?.toHexString() ??
      null,

    scopeCode:
      record.scopeCode,

    currencyCode:
      record.currencyCode,

    amount:
      record.amount.toString(),

    status:
      record.status,

    currentVersion:
      record.currentVersion,

    effectiveFrom:
      record.effectiveFrom.toISOString(),

    effectiveThrough:
      record.effectiveThrough?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function safeAdmissionRecommendationSnapshot(
  record:
    AdmissionRecommendationRecord,
): Record<string, unknown> {
  return {
    recommendationId:
      record._id.toHexString(),

    recommendationNumber:
      record.recommendationNumber,

    patientId:
      record.patientId.toHexString(),

    encounterId:
      record.encounterId.toHexString(),

    admissionType:
      record.admissionType,

    priority:
      record.priority,

    requestedWardTypes:
      record.requestedWardTypes,

    requestedSpecialtyCodes:
      record.requestedSpecialtyCodes,

    requestedIsolationCapabilities:
      record.requestedIsolationCapabilities,

    orderingProviderStaffId:
      record.orderingProviderStaffId.toHexString(),

    orderingDepartmentId:
      record.orderingDepartmentId.toHexString(),

    recommendedAt:
      record.recommendedAt.toISOString(),

    expiresAt:
      record.expiresAt?.toISOString() ??
      null,

    status:
      record.status,

    admissionId:
      record.admissionId?.toHexString() ??
      null,

    version:
      record.version,
  };
}

export function safeAdmissionSnapshot(
  record:
    AdmissionRecord,
): Record<string, unknown> {
  return {
    admissionId:
      record._id.toHexString(),

    admissionNumber:
      record.admissionNumber,

    admissionRecommendationId:
      record.admissionRecommendationId?.toHexString() ??
      null,

    patientId:
      record.patientId.toHexString(),

    encounterId:
      record.encounterId.toHexString(),

    admissionType:
      record.admissionType,

    priority:
      record.priority,

    status:
      record.status,

    isActive:
      record.isActive,

    admittingDepartmentId:
      record.admittingDepartmentId.toHexString(),

    attendingConsultantStaffId:
      record.attendingConsultantStaffId.toHexString(),

    currentWardId:
      record.currentWardId?.toHexString() ??
      null,

    currentRoomId:
      record.currentRoomId?.toHexString() ??
      null,

    currentBedId:
      record.currentBedId?.toHexString() ??
      null,

    requestedAt:
      record.requestedAt.toISOString(),

    acceptedAt:
      record.acceptedAt?.toISOString() ??
      null,

    admittedAt:
      record.admittedAt?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function safeInpatientJournalPayload(
  operation:
    string,

  payload:
    Record<string, unknown>,
): Record<string, unknown> {
  return {
    module:
      'INPATIENT',

    operation,

    ...payload,
  };
}