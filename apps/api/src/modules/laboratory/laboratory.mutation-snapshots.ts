import type {
  LaboratorySnapshotCryptoPort,
  LaboratoryTransactionCompensation,
} from './laboratory.ports.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from './laboratory.persistence.types.js';

import type {
  LaboratoryCompensatableCollection,
} from './laboratory.transaction.constants.js';

import {
  LABORATORY_COMPENSATION_TYPES,
} from './laboratory.transaction.constants.js';

import {
  laboratoryRestoreAssociatedData,
} from './laboratory.normalization.js';

export interface LaboratoryDeleteCreatedRecordPayload {
  collection:
    LaboratoryCompensatableCollection;

  entityId:
    string;

  transactionId:
    string;
}

export interface LaboratoryDeleteCreatedRecordSetPayload {
  collection:
    LaboratoryCompensatableCollection;

  entityIds:
    string[];

  transactionId:
    string;
}

export interface LaboratoryRestoreEncryptedRecordPayload {
  collection:
    LaboratoryCompensatableCollection;

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

export function deleteCreatedLaboratoryRecordCompensation(
  key: string,
  payload:
    LaboratoryDeleteCreatedRecordPayload,
): LaboratoryTransactionCompensation {
  return {
    key,

    type:
      LABORATORY_COMPENSATION_TYPES
        .DELETE_CREATED_RECORD,

    payload,
  };
}

export function deleteCreatedLaboratoryRecordSetCompensation(
  key: string,
  payload:
    LaboratoryDeleteCreatedRecordSetPayload,
): LaboratoryTransactionCompensation {
  return {
    key,

    type:
      LABORATORY_COMPENSATION_TYPES
        .DELETE_CREATED_RECORD_SET,

    payload,
  };
}

export function restoreLaboratoryRecordCompensation(
  key: string,
  payload:
    LaboratoryRestoreEncryptedRecordPayload,
): LaboratoryTransactionCompensation {
  return {
    key,

    type:
      LABORATORY_COMPENSATION_TYPES
        .RESTORE_ENCRYPTED_RECORD,

    payload,
  };
}

export function protectLaboratoryRestorePayload(
  input: Readonly<{
    facilityId: string;

    collection:
      LaboratoryCompensatableCollection;

    entityId: string;

    expectedPostVersion: number;

    transactionId: string;

    snapshot: unknown;

    snapshotCrypto:
      LaboratorySnapshotCryptoPort;
  }>,
): LaboratoryRestoreEncryptedRecordPayload {
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

export function laboratoryCategoryRestoreSnapshot(
  record:
    LaboratoryTestCategoryRecord,
): Record<string, unknown> {
  return {
    name:
      record.name,

    normalizedName:
      record.normalizedName,

    description:
      record.description,

    displayOrder:
      record.displayOrder,

    status:
      record.status,

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

export function laboratoryTestRestoreSnapshot(
  record:
    LaboratoryTestRecord,
): Record<string, unknown> {
  return {
    name:
      record.name,

    normalizedName:
      record.normalizedName,

    aliases:
      record.aliases,

    normalizedAliases:
      record.normalizedAliases,

    categoryId:
      record.categoryId,

    categoryCodeSnapshot:
      record.categoryCodeSnapshot,

    categoryNameSnapshot:
      record.categoryNameSnapshot,

    description:
      record.description,

    methodCode:
      record.methodCode,

    methodName:
      record.methodName,

    requiresSpecimen:
      record.requiresSpecimen,

    specimenRequirements:
      record.specimenRequirements,

    components:
      record.components,

    routineTurnaroundMinutes:
      record.routineTurnaroundMinutes,

    urgentTurnaroundMinutes:
      record.urgentTurnaroundMinutes,

    statTurnaroundMinutes:
      record.statTurnaroundMinutes,

    availableDepartmentIds:
      record.availableDepartmentIds,

    orderable:
      record.orderable,

    requiresResultValidation:
      record.requiresResultValidation,

    requiresResultVerification:
      record.requiresResultVerification,

    criticalNotificationRequired:
      record.criticalNotificationRequired,

    chargeCatalogItemId:
      record.chargeCatalogItemId,

    effectiveFrom:
      record.effectiveFrom,

    effectiveThrough:
      record.effectiveThrough,

    status:
      record.status,

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

export function laboratoryOrderRestoreSnapshot(
  record:
    LaboratoryOrderRecord,
): Record<string, unknown> {
  return {
    status:
      record.status,

    acceptedAt:
      record.acceptedAt,

    acceptedBy:
      record.acceptedBy,

    collectionCompletedAt:
      record.collectionCompletedAt,

    processingStartedAt:
      record.processingStartedAt,

    completedAt:
      record.completedAt,

    verifiedAt:
      record.verifiedAt,

    cancelledAt:
      record.cancelledAt,

    cancelledBy:
      record.cancelledBy,

    cancellationReason:
      record.cancellationReason,

    itemCount:
      record.itemCount,

    activeItemCount:
      record.activeItemCount,

    collectedItemCount:
      record.collectedItemCount,

    completedItemCount:
      record.completedItemCount,

    verifiedItemCount:
      record.verifiedItemCount,

    rejectedItemCount:
      record.rejectedItemCount,

    criticalResultCount:
      record.criticalResultCount,

    lastStatusChangedAt:
      record.lastStatusChangedAt,

    lastStatusChangedBy:
      record.lastStatusChangedBy,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}

export function laboratoryOrderItemRestoreSnapshot(
  record:
    LaboratoryOrderItemRecord,
): Record<string, unknown> {
  return {
    status:
      record.status,

    activeSpecimenId:
      record.activeSpecimenId,

    specimenCount:
      record.specimenCount,

    recollectionCount:
      record.recollectionCount,

    resultId:
      record.resultId,

    acceptedAt:
      record.acceptedAt,

    acceptedBy:
      record.acceptedBy,

    processingStartedAt:
      record.processingStartedAt,

    completedAt:
      record.completedAt,

    verifiedAt:
      record.verifiedAt,

    rejectedAt:
      record.rejectedAt,

    rejectedBy:
      record.rejectedBy,

    rejectionReasonCode:
      record.rejectionReasonCode,

    rejectionReason:
      record.rejectionReason,

    cancelledAt:
      record.cancelledAt,

    cancelledBy:
      record.cancelledBy,

    cancellationReason:
      record.cancellationReason,

    accountChargeId:
      record.accountChargeId,

    billingStatus:
      record.billingStatus,

    billingFailureCode:
      record.billingFailureCode,

    updatedBy:
      record.updatedBy,

    updatedAt:
      record.updatedAt,

    version:
      record.version,
  };
}