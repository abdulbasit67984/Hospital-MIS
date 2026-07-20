import type {
  InpatientTransactionCompensation,
} from './inpatient.ports.js';

import type {
  AdmissionRecommendationRecord,
  AdmissionRecord,
  BedRateRecord,
  BedRecord,
  RoomRecord,
  WardRecord,
} from './inpatient.persistence.types.js';

import {
  inpatientRestoreAssociatedData,
} from './inpatient.normalization.js';

import {
  INPATIENT_COMPENSATION_TYPES,
  type InpatientCompensatableCollection,
} from './inpatient.transaction.constants.js';

export interface InpatientEncryptedValue {
  algorithm:
    string;

  keyId:
    string;

  initializationVector:
    string;

  authenticationTag:
    string;

  ciphertext:
    string;
}

export interface InpatientSnapshotProtection {
  encryptedValue:
    InpatientEncryptedValue;

  valueHash:
    string;
}

export interface InpatientSnapshotCryptoPort {
  protect(
    value:
      unknown,

    associatedData:
      string,
  ): InpatientSnapshotProtection;
}

export interface InpatientDeleteCreatedRecordPayload {
  facilityId:
    string;

  collection:
    InpatientCompensatableCollection;

  entityId:
    string;

  transactionId:
    string;
}

export interface InpatientRestoreEncryptedRecordPayload {
  facilityId:
    string;

  collection:
    InpatientCompensatableCollection;

  entityId:
    string;

  expectedPostVersion:
    number;

  transactionId:
    string;

  associatedData:
    string;

  encryptedSnapshot:
    InpatientEncryptedValue;

  snapshotHash:
    string;
}

export function deleteCreatedInpatientRecordCompensation(
  key:
    string,

  payload:
    InpatientDeleteCreatedRecordPayload,
): InpatientTransactionCompensation {
  return {
    key,

    type:
      INPATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_RECORD,

    payload: {
      ...payload,
    },
  };
}

export function restoreInpatientRecordCompensation(
  key:
    string,

  payload:
    InpatientRestoreEncryptedRecordPayload,
): InpatientTransactionCompensation {
  return {
    key,

    type:
      INPATIENT_COMPENSATION_TYPES
        .RESTORE_ENCRYPTED_RECORD,

    payload: {
      ...payload,
    },
  };
}

export function protectInpatientRestorePayload(
  input:
    Readonly<{
      facilityId:
        string;

      collection:
        InpatientCompensatableCollection;

      entityId:
        string;

      expectedPostVersion:
        number;

      transactionId:
        string;

      snapshot:
        unknown;

      snapshotCrypto:
        InpatientSnapshotCryptoPort;
    }>,
): InpatientRestoreEncryptedRecordPayload {
  const associatedData =
    inpatientRestoreAssociatedData(
      input.facilityId,
      input.collection,
      input.entityId,
      input.expectedPostVersion,
    );

  const protectedValue =
    input.snapshotCrypto.protect(
      input.snapshot,
      associatedData,
    );

  return {
    facilityId:
      input.facilityId,

    collection:
      input.collection,

    entityId:
      input.entityId,

    expectedPostVersion:
      input.expectedPostVersion,

    transactionId:
      input.transactionId,

    associatedData,

    encryptedSnapshot:
      protectedValue
        .encryptedValue,

    snapshotHash:
      protectedValue.valueHash,
  };
}

export function wardRestoreSnapshot(
  record:
    WardRecord,
): Record<string, unknown> {
  return {
    name:
      record.name,

    normalizedName:
      record.normalizedName,

    wardType:
      record.wardType,

    departmentId:
      record.departmentId,

    servicePointId:
      record.servicePointId,

    nursingStationCode:
      record.nursingStationCode,

    description:
      record.description,

    displayOrder:
      record.displayOrder,

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

    status:
      record.status,

    activatedAt:
      record.activatedAt,

    activatedBy:
      record.activatedBy,

    deactivatedAt:
      record.deactivatedAt,

    deactivatedBy:
      record.deactivatedBy,

    deactivationReason:
      record.deactivationReason,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function roomRestoreSnapshot(
  record:
    RoomRecord,
): Record<string, unknown> {
  return {
    departmentId:
      record.departmentId,

    servicePointId:
      record.servicePointId,

    roomNumber:
      record.roomNumber,

    name:
      record.name,

    normalizedName:
      record.normalizedName,

    roomType:
      record.roomType,

    roomClass:
      record.roomClass,

    capacity:
      record.capacity,

    floorCode:
      record.floorCode,

    description:
      record.description,

    displayOrder:
      record.displayOrder,

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

    status:
      record.status,

    activatedAt:
      record.activatedAt,

    activatedBy:
      record.activatedBy,

    deactivatedAt:
      record.deactivatedAt,

    deactivatedBy:
      record.deactivatedBy,

    deactivationReason:
      record.deactivationReason,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function bedRestoreSnapshot(
  record:
    BedRecord,
): Record<string, unknown> {
  return {
    departmentId:
      record.departmentId,

    servicePointId:
      record.servicePointId,

    bedNumber:
      record.bedNumber,

    label:
      record.label,

    normalizedLabel:
      record.normalizedLabel,

    bedCategory:
      record.bedCategory,

    turnaroundRequiredAfterRelease:
      record
        .turnaroundRequiredAfterRelease,

    displayOrder:
      record.displayOrder,

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

    status:
      record.status,

    activatedAt:
      record.activatedAt,

    activatedBy:
      record.activatedBy,

    deactivatedAt:
      record.deactivatedAt,

    deactivatedBy:
      record.deactivatedBy,

    deactivationReason:
      record.deactivationReason,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function bedRateRestoreSnapshot(
  record:
    BedRateRecord,
): Record<string, unknown> {
  return {
    status:
      record.status,

    currentVersion:
      record.currentVersion,

    latestVersionId:
      record.latestVersionId,

    activatedAt:
      record.activatedAt,

    activatedBy:
      record.activatedBy,

    supersededAt:
      record.supersededAt,

    supersededBy:
      record.supersededBy,

    supersededByRateId:
      record.supersededByRateId,

    cancelledAt:
      record.cancelledAt,

    cancelledBy:
      record.cancelledBy,

    cancellationReason:
      record.cancellationReason,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function admissionRecommendationRestoreSnapshot(
  record:
    AdmissionRecommendationRecord,
): Record<string, unknown> {
  return {
    status:
      record.status,

    acceptedAt:
      record.acceptedAt,

    acceptedBy:
      record.acceptedBy,

    acceptedByStaffId:
      record.acceptedByStaffId,

    rejectedAt:
      record.rejectedAt,

    rejectedBy:
      record.rejectedBy,

    rejectedByStaffId:
      record.rejectedByStaffId,

    rejectionReason:
      record.rejectionReason,

    cancelledAt:
      record.cancelledAt,

    cancelledBy:
      record.cancelledBy,

    cancelledByStaffId:
      record.cancelledByStaffId,

    cancellationReason:
      record.cancellationReason,

    admissionId:
      record.admissionId,

    convertedAt:
      record.convertedAt,

    convertedBy:
      record.convertedBy,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function admissionRestoreSnapshot(
  record:
    AdmissionRecord,
): Record<string, unknown> {
  return {
    status:
      record.status,

    isActive:
      record.isActive,

    acceptedAt:
      record.acceptedAt,

    acceptedBy:
      record.acceptedBy,

    acceptedByStaffId:
      record.acceptedByStaffId,

    admittedAt:
      record.admittedAt,

    admittedBy:
      record.admittedBy,

    admittedByStaffId:
      record.admittedByStaffId,

    clinicallyDischargedAt:
      record.clinicallyDischargedAt,

    financiallyClearedAt:
      record.financiallyClearedAt,

    dischargedAt:
      record.dischargedAt,

    cancelledAt:
      record.cancelledAt,

    cancelledBy:
      record.cancelledBy,

    cancelledByStaffId:
      record.cancelledByStaffId,

    cancellationReason:
      record.cancellationReason,

    currentWardId:
      record.currentWardId,

    currentRoomId:
      record.currentRoomId,

    currentBedId:
      record.currentBedId,

    currentBedAssignmentId:
      record.currentBedAssignmentId,

    currentBedAssignedAt:
      record.currentBedAssignedAt,

    currentStatusSequence:
      record.currentStatusSequence,

    latestStatusHistoryId:
      record.latestStatusHistoryId,

    dischargeId:
      record.dischargeId,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}