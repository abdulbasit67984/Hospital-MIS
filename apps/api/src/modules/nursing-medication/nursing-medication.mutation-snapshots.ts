import type {
  NursingAssessmentRecord,
  NursingCarePlanRecord,
  NursingTaskRecord,
} from './nursing-medication.persistence.types.js';

import {
  nursingRestoreAssociatedData,
} from './nursing-medication.normalization.js';

import {
  NURSING_MEDICATION_COMPENSATION_TYPES,
  type NursingMedicationCompensatableCollection,
} from './nursing-medication.transaction.constants.js';

import type {
  NursingMedicationEncryptedValue,
  NursingMedicationSnapshotCryptoPort,
  NursingMedicationTransactionCompensation,
} from './nursing-medication.workflow-ports.js';

export interface NursingDeleteCreatedRecordPayload {
  facilityId: string;
  collection: NursingMedicationCompensatableCollection;
  entityId: string;
  expectedVersion: number | null;
  transactionId: string;
}

export interface NursingRestoreEncryptedRecordPayload {
  facilityId: string;
  collection: NursingMedicationCompensatableCollection;
  entityId: string;
  expectedPostVersion: number;
  transactionId: string;
  associatedData: string;
  encryptedSnapshot: NursingMedicationEncryptedValue;
  snapshotHash: string;
}

export interface NursingRestoreSnapshot {
  version: number;
  updatedBy: unknown;
  updatedAt: Date;
  values: Record<string, unknown>;
}

export function deleteCreatedNursingRecordCompensation(
  key: string,
  payload: NursingDeleteCreatedRecordPayload,
): NursingMedicationTransactionCompensation {
  return {
    key,
    type:
      NURSING_MEDICATION_COMPENSATION_TYPES.DELETE_CREATED_RECORD,
    payload: {
      ...payload,
    },
  };
}

export function restoreNursingRecordCompensation(
  key: string,
  payload: NursingRestoreEncryptedRecordPayload,
): NursingMedicationTransactionCompensation {
  return {
    key,
    type:
      NURSING_MEDICATION_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD,
    payload: {
      ...payload,
    },
  };
}

export function protectNursingRestorePayload(
  input: Readonly<{
    facilityId: string;
    collection: NursingMedicationCompensatableCollection;
    entityId: string;
    expectedPostVersion: number;
    transactionId: string;
    snapshot: NursingRestoreSnapshot;
    snapshotCrypto: NursingMedicationSnapshotCryptoPort;
  }>,
): NursingRestoreEncryptedRecordPayload {
  const associatedData =
    nursingRestoreAssociatedData(
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
      protectedValue.encryptedValue,
    snapshotHash:
      protectedValue.valueHash,
  };
}

export function nursingAssessmentRestoreSnapshot(
  record: NursingAssessmentRecord,
): NursingRestoreSnapshot {
  return {
    version:
      record.version,
    updatedBy:
      record.updatedBy,
    updatedAt:
      record.updatedAt,
    values: {
      status:
        record.status,
      signedAt:
        record.signedAt,
      signedByUserId:
        record.signedByUserId,
      signedByStaffId:
        record.signedByStaffId,
      supersededByAssessmentId:
        record.supersededByAssessmentId,
      correctionReason:
        record.correctionReason,
      enteredInErrorAt:
        record.enteredInErrorAt,
      enteredInErrorByUserId:
        record.enteredInErrorByUserId,
      enteredInErrorByStaffId:
        record.enteredInErrorByStaffId,
      enteredInErrorReason:
        record.enteredInErrorReason,
    },
  };
}

export function nursingCarePlanRestoreSnapshot(
  record: NursingCarePlanRecord,
): NursingRestoreSnapshot {
  return {
    version:
      record.version,
    updatedBy:
      record.updatedBy,
    updatedAt:
      record.updatedAt,
    values: {
      status:
        record.status,
      problems:
        record.problems,
      assignedNurseStaffId:
        record.assignedNurseStaffId,
      assignedTeamCode:
        record.assignedTeamCode,
      targetCompletionAt:
        record.targetCompletionAt,
      nextReviewAt:
        record.nextReviewAt,
      lastReviewedAt:
        record.lastReviewedAt,
      lastReviewedByStaffId:
        record.lastReviewedByStaffId,
      outcomeEvaluation:
        record.outcomeEvaluation,
      completedAt:
        record.completedAt,
      completedByStaffId:
        record.completedByStaffId,
      cancellationReason:
        record.cancellationReason,
      revisionNumber:
        record.revisionNumber,
      supersededByCarePlanId:
        record.supersededByCarePlanId,
      correctionReason:
        record.correctionReason,
    },
  };
}

export function nursingTaskRestoreSnapshot(
  record: NursingTaskRecord,
): NursingRestoreSnapshot {
  return {
    version:
      record.version,
    updatedBy:
      record.updatedBy,
    updatedAt:
      record.updatedAt,
    values: {
      status:
        record.status,
      assignedStaffId:
        record.assignedStaffId,
      assignedTeamCode:
        record.assignedTeamCode,
      dueAt:
        record.dueAt,
      carriedForwardToTaskId:
        record.carriedForwardToTaskId,
      startedAt:
        record.startedAt,
      completedAt:
        record.completedAt,
      completedByUserId:
        record.completedByUserId,
      completedByStaffId:
        record.completedByStaffId,
      dispositionReasonCode:
        record.dispositionReasonCode,
      dispositionReason:
        record.dispositionReason,
      escalatedAt:
        record.escalatedAt,
      escalatedToStaffId:
        record.escalatedToStaffId,
      escalationReason:
        record.escalationReason,
    },
  };
}