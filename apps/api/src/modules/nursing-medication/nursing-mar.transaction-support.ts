import type {
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
} from './nursing-mar.persistence.types.js';

import type {
  NursingMedicationSnapshotCryptoPort,
  NursingMedicationTransactionCompensation,
} from './nursing-medication.workflow-ports.js';

import {
  nursingRestoreAssociatedData,
} from './nursing-medication.normalization.js';

export const NURSING_MAR_TRANSACTION_TYPES = {
  CREATE_SCHEDULE:
    'NURSING_MAR_SCHEDULE_CREATE',

  HOLD_SCHEDULE:
    'NURSING_MAR_SCHEDULE_HOLD',

  RESUME_SCHEDULE:
    'NURSING_MAR_SCHEDULE_RESUME',

  COMPLETE_SCHEDULE:
    'NURSING_MAR_SCHEDULE_COMPLETE',

  CANCEL_SCHEDULE:
    'NURSING_MAR_SCHEDULE_CANCEL',

  ADMINISTER_DOSE:
    'NURSING_MAR_DOSE_ADMINISTER',

  RECORD_DOSE_EXCEPTION:
    'NURSING_MAR_DOSE_EXCEPTION_RECORD',

  CORRECT_ADMINISTRATION:
    'NURSING_MAR_ADMINISTRATION_CORRECT',

  ENTER_ADMINISTRATION_IN_ERROR:
    'NURSING_MAR_ADMINISTRATION_ENTERED_IN_ERROR',
} as const;

export const NURSING_MAR_AUDIT_ACTIONS = {
  SCHEDULE_CREATED:
    'nursing.mar.schedule.created',

  SCHEDULE_HELD:
    'nursing.mar.schedule.held',

  SCHEDULE_RESUMED:
    'nursing.mar.schedule.resumed',

  SCHEDULE_COMPLETED:
    'nursing.mar.schedule.completed',

  SCHEDULE_CANCELLED:
    'nursing.mar.schedule.cancelled',

  DOSE_ADMINISTERED:
    'nursing.mar.dose.administered',

  DOSE_EXCEPTION_RECORDED:
    'nursing.mar.dose.exception_recorded',

  ADMINISTRATION_CORRECTED:
    'nursing.mar.administration.corrected',

  ADMINISTRATION_ENTERED_IN_ERROR:
    'nursing.mar.administration.entered_in_error',
} as const;

export const NURSING_MAR_OUTBOX_EVENTS = {
  SCHEDULE_CREATED:
    'nursing.mar.schedule.created.v1',

  SCHEDULE_HELD:
    'nursing.mar.schedule.held.v1',

  SCHEDULE_RESUMED:
    'nursing.mar.schedule.resumed.v1',

  SCHEDULE_COMPLETED:
    'nursing.mar.schedule.completed.v1',

  SCHEDULE_CANCELLED:
    'nursing.mar.schedule.cancelled.v1',

  DOSE_ADMINISTERED:
    'nursing.mar.dose.administered.v1',

  DOSE_EXCEPTION_RECORDED:
    'nursing.mar.dose.exception_recorded.v1',

  ADMINISTRATION_CORRECTED:
    'nursing.mar.administration.corrected.v1',

  ADMINISTRATION_ENTERED_IN_ERROR:
    'nursing.mar.administration.entered_in_error.v1',
} as const;

export const NURSING_MAR_REALTIME_EVENTS = {
  SCHEDULE_WORKLIST_CHANGED:
    'nursing.mar.schedule_worklist.changed',

  DUE_DOSE_WORKLIST_CHANGED:
    'nursing.mar.due_dose_worklist.changed',

  PATIENT_MAR_CHANGED:
    'nursing.mar.patient_record.changed',
} as const;

export type NursingMarCompensatableCollection =
  | 'medicationSchedules'
  | 'medicationAdministrations'
  | 'medicationAdministrationAmendments';

function protect(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  input: Readonly<{
    facilityId: string;
    collection: NursingMarCompensatableCollection;
    entityId: string;
    expectedPostVersion: number;
    snapshot: unknown;
  }>,
) {
  const associatedData =
    nursingRestoreAssociatedData(
      input.facilityId,
      input.collection,
      input.entityId,
      input.expectedPostVersion,
    );

  const protectedValue =
    crypto.protect(
      input.snapshot,
      associatedData,
    );

  return {
    associatedData,

    encryptedSnapshot:
      protectedValue.encryptedValue,

    snapshotHash:
      protectedValue.valueHash,
  };
}

export function deleteCreatedMarRecord(
  key: string,

  input: Readonly<{
    facilityId: string;
    collection: NursingMarCompensatableCollection;
    entityId: string;
    expectedVersion: number | null;
    transactionId: string;
  }>,
): NursingMedicationTransactionCompensation {
  return {
    key,

    type:
      'nursing.mar.delete_created',

    payload: {
      ...input,
    },
  };
}

export function restoreMedicationScheduleCompensation(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  record:
    MarMedicationScheduleRecord,

  expectedPostVersion:
    number,

  transactionId:
    string,
): NursingMedicationTransactionCompensation {
  const entityId =
    record._id.toHexString();

  return {
    key:
      `restore-medication-schedule:${entityId}`,

    type:
      'nursing.mar.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection:
        'medicationSchedules',

      entityId,

      expectedPostVersion,

      transactionId,

      ...protect(
        crypto,
        {
          facilityId:
            record.facilityId.toHexString(),

          collection:
            'medicationSchedules',

          entityId,

          expectedPostVersion,

          snapshot: {
            version:
              record.version,

            status:
              record.status,

            holdReason:
              record.holdReason,

            endAt:
              record.endAt,

            lastAdministrationAt:
              record.lastAdministrationAt,

            nextScheduledAt:
              record.nextScheduledAt,

            updatedBy:
              record.updatedBy,

            updatedAt:
              record.updatedAt,
          },
        },
      ),
    },
  };
}

export function restoreMedicationAdministrationCompensation(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  record:
    MarMedicationAdministrationRecord,

  expectedPostVersion:
    number,

  transactionId:
    string,
): NursingMedicationTransactionCompensation {
  const entityId =
    record._id.toHexString();

  return {
    key:
      `restore-medication-administration:${entityId}`,

    type:
      'nursing.mar.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection:
        'medicationAdministrations',

      entityId,

      expectedPostVersion,

      transactionId,

      ...protect(
        crypto,
        {
          facilityId:
            record.facilityId.toHexString(),

          collection:
            'medicationAdministrations',

          entityId,

          expectedPostVersion,

          snapshot: {
            version:
              record.version,

            supersededByAdministrationId:
              record.supersededByAdministrationId,

            updatedBy:
              record.updatedBy,

            updatedAt:
              record.updatedAt,
          },
        },
      ),
    },
  };
}