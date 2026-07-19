import type {
  LaboratorySnapshotCryptoPort,
  LaboratoryTransactionCompensation,
} from './laboratory.ports.js';

import type {
  LaboratoryResultRecord,
} from './laboratory.persistence.types.js';

import {
  laboratoryRestoreAssociatedData,
} from './laboratory.normalization.js';

import {
  LABORATORY_RESULT_COMPENSATION_TYPES,
  type LaboratoryResultCompensatableCollection,
} from './laboratory-result.transaction.constants.js';

export interface LaboratoryResultRestorePayload {
  collection:
    LaboratoryResultCompensatableCollection;

  entityId:
    string;

  expectedPostVersion:
    number;

  transactionId:
    string;

  associatedData:
    string;

  encryptedSnapshot:
    ReturnType<
      LaboratorySnapshotCryptoPort[
        'protect'
      ]
    >['encryptedValue'];

  snapshotHash:
    string;
}

export function deleteCreatedLaboratoryResultRecordCompensation(
  key:
    string,

  collection:
    LaboratoryResultCompensatableCollection,

  entityId:
    string,

  transactionId:
    string,
): LaboratoryTransactionCompensation {
  return {
    key,

    type:
      LABORATORY_RESULT_COMPENSATION_TYPES
        .DELETE_CREATED_RECORD,

    payload: {
      collection,

      entityId,

      transactionId,
    },
  };
}

export function protectLaboratoryResultRestorePayload(
  input: Readonly<{
    facilityId:
      string;

    collection:
      LaboratoryResultCompensatableCollection;

    entityId:
      string;

    expectedPostVersion:
      number;

    transactionId:
      string;

    snapshot:
      unknown;

    snapshotCrypto:
      LaboratorySnapshotCryptoPort;
  }>,
): LaboratoryResultRestorePayload {
  const associatedData =
    laboratoryRestoreAssociatedData(
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
      protectedValue.encryptedValue,

    snapshotHash:
      protectedValue.valueHash,
  };
}

export function restoreLaboratoryResultRecordCompensation(
  key:
    string,

  payload:
    LaboratoryResultRestorePayload,
): LaboratoryTransactionCompensation {
  return {
    key,

    type:
      LABORATORY_RESULT_COMPENSATION_TYPES
        .RESTORE_ENCRYPTED_RECORD,

    payload,
  };
}

function id(
  value:
    | {
        toHexString():
          string;
      }
    | null,
): string | null {
  return value
    ?.toHexString() ??
    null;
}

function date(
  value:
    Date | null,
): string | null {
  return value
    ?.toISOString() ??
    null;
}

export function laboratoryResultRestoreSnapshot(
  result:
    LaboratoryResultRecord,
): Record<string, unknown> {
  return {
    status:
      result.status,

    specimenId:
      id(
        result.specimenId,
      ),

    components:
      result.components,

    overallFlag:
      result.overallFlag,

    criticalComponentCount:
      result.criticalComponentCount,

    unresolvedCriticalComponentCount:
      result.unresolvedCriticalComponentCount,

    conclusion:
      result.conclusion,

    technicalNotes:
      result.technicalNotes,

    enteredAt:
      date(
        result.enteredAt,
      ),

    enteredBy:
      id(
        result.enteredBy,
      ),

    technicianStaffId:
      id(
        result.technicianStaffId,
      ),

    validatedAt:
      date(
        result.validatedAt,
      ),

    validatedBy:
      id(
        result.validatedBy,
      ),

    validatorStaffId:
      id(
        result.validatorStaffId,
      ),

    verifiedAt:
      date(
        result.verifiedAt,
      ),

    verifiedBy:
      id(
        result.verifiedBy,
      ),

    verifierStaffId:
      id(
        result.verifierStaffId,
      ),

    currentVersion:
      result.currentVersion,

    latestVersionId:
      id(
        result.latestVersionId,
      ),

    correctedAt:
      date(
        result.correctedAt,
      ),

    correctedBy:
      id(
        result.correctedBy,
      ),

    correctionReason:
      result.correctionReason,

    supersedesResultVersionId:
      id(
        result.supersedesResultVersionId,
      ),

    cancelledAt:
      date(
        result.cancelledAt,
      ),

    cancelledBy:
      id(
        result.cancelledBy,
      ),

    cancellationReason:
      result.cancellationReason,

    publicationStatus:
      result.publicationStatus,

    publishedAt:
      date(
        result.publishedAt,
      ),

    publishedBy:
      id(
        result.publishedBy,
      ),

    withdrawnAt:
      date(
        result.withdrawnAt,
      ),

    withdrawnBy:
      id(
        result.withdrawnBy,
      ),

    withdrawalReason:
      result.withdrawalReason,

    updatedBy:
      result
        .updatedBy
        .toHexString(),

    updatedAt:
      result
        .updatedAt
        .toISOString(),

    version:
      result.version,
  };
}