import type {
  RadiologySnapshotCryptoPort,
  RadiologyTransactionCompensation,
} from './radiology.ports.js';

import type {
  RadiologyModalityRecord,
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
  RadiologyProcedureRecord,
} from './radiology.persistence.types.js';

import {
  radiologyRestoreAssociatedData,
} from './radiology.normalization.js';

import {
  RADIOLOGY_COMPENSATION_TYPES,
  type RadiologyCompensatableCollection,
} from './radiology.transaction.constants.js';

export interface RadiologyDeleteCreatedRecordPayload {
  facilityId: string;
  collection: RadiologyCompensatableCollection;
  entityId: string;
  transactionId: string;
}

export interface RadiologyDeleteCreatedRecordSetPayload {
  facilityId: string;
  collection: RadiologyCompensatableCollection;
  entityIds: string[];
  transactionId: string;
}

export interface RadiologyRestoreEncryptedRecordPayload {
  facilityId: string;
  collection: RadiologyCompensatableCollection;
  entityId: string;
  expectedPostVersion: number;
  transactionId: string;
  associatedData: string;
  encryptedSnapshot: ReturnType<
    RadiologySnapshotCryptoPort['protect']
  >['encryptedValue'];
  snapshotHash: string;
}

export function deleteCreatedRadiologyRecordCompensation(
  key: string,
  payload: RadiologyDeleteCreatedRecordPayload,
): RadiologyTransactionCompensation {
  return {
    key,
    type: RADIOLOGY_COMPENSATION_TYPES.DELETE_CREATED_RECORD,
    payload: { ...payload },
  };
}

export function deleteCreatedRadiologyRecordSetCompensation(
  key: string,
  payload: RadiologyDeleteCreatedRecordSetPayload,
): RadiologyTransactionCompensation {
  return {
    key,
    type: RADIOLOGY_COMPENSATION_TYPES.DELETE_CREATED_RECORD_SET,
    payload: { ...payload },
  };
}

export function restoreRadiologyRecordCompensation(
  key: string,
  payload: RadiologyRestoreEncryptedRecordPayload,
): RadiologyTransactionCompensation {
  return {
    key,
    type: RADIOLOGY_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD,
    payload: { ...payload },
  };
}

export function protectRadiologyRestorePayload(
  input: Readonly<{
    facilityId: string;
    collection: RadiologyCompensatableCollection;
    entityId: string;
    expectedPostVersion: number;
    transactionId: string;
    snapshot: unknown;
    snapshotCrypto: RadiologySnapshotCryptoPort;
  }>,
): RadiologyRestoreEncryptedRecordPayload {
  const associatedData = radiologyRestoreAssociatedData(
    input.facilityId,
    input.collection,
    input.entityId,
    input.expectedPostVersion,
  );

  const protectedValue = input.snapshotCrypto.protect(
    input.snapshot,
    associatedData,
  );

  return {
    facilityId: input.facilityId,
    collection: input.collection,
    entityId: input.entityId,
    expectedPostVersion: input.expectedPostVersion,
    transactionId: input.transactionId,
    associatedData,
    encryptedSnapshot: protectedValue.encryptedValue,
    snapshotHash: protectedValue.valueHash,
  };
}

export function radiologyModalityRestoreSnapshot(
  record: RadiologyModalityRecord,
): Record<string, unknown> {
  return {
    name: record.name,
    normalizedName: record.normalizedName,
    modalityType: record.modalityType,
    dicomModalityCode: record.dicomModalityCode,
    description: record.description,
    availableDepartmentIds: record.availableDepartmentIds,
    supportsContrast: record.supportsContrast,
    supportsPacsIntegration: record.supportsPacsIntegration,
    pacsRoutingCode: record.pacsRoutingCode,
    orderable: record.orderable,
    effectiveFrom: record.effectiveFrom,
    effectiveThrough: record.effectiveThrough,
    status: record.status,
    deactivatedAt: record.deactivatedAt,
    deactivatedBy: record.deactivatedBy,
    deactivationReason: record.deactivationReason,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

export function radiologyProcedureRestoreSnapshot(
  record: RadiologyProcedureRecord,
): Record<string, unknown> {
  return {
    name: record.name,
    normalizedName: record.normalizedName,
    aliases: record.aliases,
    normalizedAliases: record.normalizedAliases,
    description: record.description,
    modalityId: record.modalityId,
    modalityCodeSnapshot: record.modalityCodeSnapshot,
    modalityNameSnapshot: record.modalityNameSnapshot,
    modalityTypeSnapshot: record.modalityTypeSnapshot,
    dicomModalityCodeSnapshot: record.dicomModalityCodeSnapshot,
    bodyRegions: record.bodyRegions,
    lateralityRequirement: record.lateralityRequirement,
    permittedLateralities: record.permittedLateralities,
    contrastRequirement: record.contrastRequirement,
    permittedContrastRoutes: record.permittedContrastRoutes,
    preparationInstructions: record.preparationInstructions,
    contraindications: record.contraindications,
    safetyScreeningRequirements: record.safetyScreeningRequirements,
    expectedDurationMinutes: record.expectedDurationMinutes,
    routineTurnaroundMinutes: record.routineTurnaroundMinutes,
    urgentTurnaroundMinutes: record.urgentTurnaroundMinutes,
    statTurnaroundMinutes: record.statTurnaroundMinutes,
    availableDepartmentIds: record.availableDepartmentIds,
    schedulingRequired: record.schedulingRequired,
    requiresTechnician: record.requiresTechnician,
    requiresRadiologist: record.requiresRadiologist,
    orderable: record.orderable,
    chargeCatalogItemId: record.chargeCatalogItemId,
    effectiveFrom: record.effectiveFrom,
    effectiveThrough: record.effectiveThrough,
    status: record.status,
    deactivatedAt: record.deactivatedAt,
    deactivatedBy: record.deactivatedBy,
    deactivationReason: record.deactivationReason,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

export function radiologyOrderRestoreSnapshot(
  record: RadiologyOrderRecord,
): Record<string, unknown> {
  return {
    status: record.status,
    acceptedAt: record.acceptedAt,
    acceptedBy: record.acceptedBy,
    scheduledAt: record.scheduledAt,
    checkedInAt: record.checkedInAt,
    examinationStartedAt: record.examinationStartedAt,
    examinationCompletedAt: record.examinationCompletedAt,
    verifiedAt: record.verifiedAt,
    rejectedAt: record.rejectedAt,
    rejectedBy: record.rejectedBy,
    rejectionReasonCode: record.rejectionReasonCode,
    rejectionReason: record.rejectionReason,
    cancelledAt: record.cancelledAt,
    cancelledBy: record.cancelledBy,
    cancellationReason: record.cancellationReason,
    itemCount: record.itemCount,
    activeItemCount: record.activeItemCount,
    scheduledItemCount: record.scheduledItemCount,
    completedItemCount: record.completedItemCount,
    reportedItemCount: record.reportedItemCount,
    verifiedItemCount: record.verifiedItemCount,
    rejectedItemCount: record.rejectedItemCount,
    lastStatusChangedAt: record.lastStatusChangedAt,
    lastStatusChangedBy: record.lastStatusChangedBy,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

export function radiologyOrderItemRestoreSnapshot(
  record: RadiologyOrderItemRecord,
): Record<string, unknown> {
  return {
    status: record.status,
    preparationStatus: record.preparationStatus,
    safetyScreeningStatus: record.safetyScreeningStatus,
    appointmentId: record.appointmentId,
    imagingStudyId: record.imagingStudyId,
    reportId: record.reportId,
    accessionNumber: record.accessionNumber,
    externalStudyIdentifier: record.externalStudyIdentifier,
    acceptedAt: record.acceptedAt,
    acceptedBy: record.acceptedBy,
    scheduledAt: record.scheduledAt,
    checkedInAt: record.checkedInAt,
    examinationStartedAt: record.examinationStartedAt,
    examinationCompletedAt: record.examinationCompletedAt,
    verifiedAt: record.verifiedAt,
    rejectedAt: record.rejectedAt,
    rejectedBy: record.rejectedBy,
    rejectionReasonCode: record.rejectionReasonCode,
    rejectionReason: record.rejectionReason,
    cancelledAt: record.cancelledAt,
    cancelledBy: record.cancelledBy,
    cancellationReason: record.cancellationReason,
    accountChargeId: record.accountChargeId,
    billingStatus: record.billingStatus,
    billingFailureCode: record.billingFailureCode,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}