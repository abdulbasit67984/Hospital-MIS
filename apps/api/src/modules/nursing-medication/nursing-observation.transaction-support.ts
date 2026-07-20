import type {
  IntakeOutputEntryRecord,
  NursingDeviceRecord,
} from './nursing-medication.persistence.types.js';

import type {
  NursingWardHandoverRecord,
} from './nursing-observation.ports.js';

import type {
  NursingMedicationSnapshotCryptoPort,
  NursingMedicationTransactionCompensation,
} from './nursing-medication.workflow-ports.js';

import {
  nursingRestoreAssociatedData,
} from './nursing-medication.normalization.js';

export const NURSING_OBSERVATION_TRANSACTION_TYPES = {
  RECORD_INTAKE_OUTPUT:
    'NURSING_INTAKE_OUTPUT_RECORD',

  CORRECT_INTAKE_OUTPUT:
    'NURSING_INTAKE_OUTPUT_CORRECT',

  ENTER_INTAKE_OUTPUT_IN_ERROR:
    'NURSING_INTAKE_OUTPUT_ENTERED_IN_ERROR',

  CREATE_DEVICE:
    'NURSING_DEVICE_CREATE',

  RECORD_DEVICE_OBSERVATION:
    'NURSING_DEVICE_OBSERVATION_CREATE',

  REMOVE_DEVICE:
    'NURSING_DEVICE_REMOVE',

  CORRECT_HANDOVER:
    'NURSING_HANDOVER_CORRECT',

  ENTER_HANDOVER_IN_ERROR:
    'NURSING_HANDOVER_ENTERED_IN_ERROR',
} as const;

export const NURSING_OBSERVATION_AUDIT_ACTIONS = {
  INTAKE_OUTPUT_RECORDED:
    'nursing.intake_output.recorded',

  INTAKE_OUTPUT_CORRECTED:
    'nursing.intake_output.corrected',

  INTAKE_OUTPUT_ENTERED_IN_ERROR:
    'nursing.intake_output.entered_in_error',

  DEVICE_CREATED:
    'nursing.device.created',

  DEVICE_OBSERVATION_RECORDED:
    'nursing.device.observation_recorded',

  DEVICE_REMOVED:
    'nursing.device.removed',

  HANDOVER_CORRECTED:
    'nursing.handover.corrected',

  HANDOVER_ENTERED_IN_ERROR:
    'nursing.handover.entered_in_error',

  CRITICAL_OBSERVATION_ESCALATED:
    'nursing.observation.escalated',
} as const;

export const NURSING_OBSERVATION_OUTBOX_EVENTS = {
  INTAKE_OUTPUT_RECORDED:
    'nursing.intake_output.recorded.v1',

  INTAKE_OUTPUT_CORRECTED:
    'nursing.intake_output.corrected.v1',

  INTAKE_OUTPUT_ENTERED_IN_ERROR:
    'nursing.intake_output.entered_in_error.v1',

  DEVICE_CREATED:
    'nursing.device.created.v1',

  DEVICE_OBSERVATION_RECORDED:
    'nursing.device.observation_recorded.v1',

  DEVICE_REMOVED:
    'nursing.device.removed.v1',

  HANDOVER_CORRECTED:
    'nursing.handover.corrected.v1',

  HANDOVER_ENTERED_IN_ERROR:
    'nursing.handover.entered_in_error.v1',

  CRITICAL_OBSERVATION_ESCALATED:
    'nursing.observation.escalated.v1',
} as const;

export const NURSING_OBSERVATION_REALTIME_EVENTS = {
  VITAL_WORKLIST_CHANGED:
    'nursing.vital_worklist.changed',

  INTAKE_OUTPUT_CHANGED:
    'nursing.intake_output.changed',

  DEVICE_WORKLIST_CHANGED:
    'nursing.device_worklist.changed',

  HANDOVER_WORKLIST_CHANGED:
    'nursing.handover_worklist.changed',

  CRITICAL_OBSERVATION:
    'nursing.critical_observation',
} as const;

export type NursingObservationCompensatableCollection =
  | 'intakeOutputEntries'
  | 'nursingDevices'
  | 'nursingDeviceObservations'
  | 'wardHandovers'
  | 'nursingEntryAmendments';

function protect(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  facilityId:
    string,

  collection:
    NursingObservationCompensatableCollection,

  entityId:
    string,

  expectedPostVersion:
    number,

  snapshot:
    unknown,
) {
  const associatedData =
    nursingRestoreAssociatedData(
      facilityId,
      collection,
      entityId,
      expectedPostVersion,
    );

  const protectedValue =
    crypto.protect(
      snapshot,
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

export function deleteCreatedObservationRecord(
  key: string,

  input: Readonly<{
    facilityId: string;
    collection: NursingObservationCompensatableCollection;
    entityId: string;
    expectedVersion: number | null;
    transactionId: string;
  }>,
): NursingMedicationTransactionCompensation {
  return {
    key,

    type:
      'nursing.observation.delete_created',

    payload: {
      ...input,
    },
  };
}

export function restoreIntakeOutputCompensation(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  record:
    IntakeOutputEntryRecord,

  expectedPostVersion:
    number,

  transactionId:
    string,
): NursingMedicationTransactionCompensation {
  const entityId =
    record._id.toHexString();

  return {
    key:
      `restore-intake-output:${entityId}`,

    type:
      'nursing.observation.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection:
        'intakeOutputEntries',

      entityId,

      expectedPostVersion,

      transactionId,

      ...protect(
        crypto,
        record.facilityId.toHexString(),
        'intakeOutputEntries',
        entityId,
        expectedPostVersion,
        {
          version:
            record.version,

          status:
            record.status,

          supersededByEntryId:
            record.supersededByEntryId,

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

          updatedBy:
            record.updatedBy,

          updatedAt:
            record.updatedAt,
        },
      ),
    },
  };
}

export function restoreDeviceCompensation(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  record:
    NursingDeviceRecord,

  expectedPostVersion:
    number,

  transactionId:
    string,
): NursingMedicationTransactionCompensation {
  const entityId =
    record._id.toHexString();

  return {
    key:
      `restore-nursing-device:${entityId}`,

    type:
      'nursing.observation.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection:
        'nursingDevices',

      entityId,

      expectedPostVersion,

      transactionId,

      ...protect(
        crypto,
        record.facilityId.toHexString(),
        'nursingDevices',
        entityId,
        expectedPostVersion,
        {
          version:
            record.version,

          status:
            record.status,

          removedAt:
            record.removedAt,

          removedByStaffId:
            record.removedByStaffId,

          removalReason:
            record.removalReason,

          updatedBy:
            record.updatedBy,

          updatedAt:
            record.updatedAt,
        },
      ),
    },
  };
}

export function restoreHandoverCompensation(
  crypto:
    NursingMedicationSnapshotCryptoPort,

  record:
    NursingWardHandoverRecord,

  expectedPostVersion:
    number,

  transactionId:
    string,
): NursingMedicationTransactionCompensation {
  const entityId =
    record._id.toHexString();

  return {
    key:
      `restore-ward-handover:${entityId}`,

    type:
      'nursing.observation.restore_encrypted',

    payload: {
      facilityId:
        record.facilityId.toHexString(),

      collection:
        'wardHandovers',

      entityId,

      expectedPostVersion,

      transactionId,

      ...protect(
        crypto,
        record.facilityId.toHexString(),
        'wardHandovers',
        entityId,
        expectedPostVersion,
        {
          version:
            record.version,

          status:
            record.status,

          supersededByWardHandoverId:
            record.supersededByWardHandoverId,

          updatedBy:
            record.updatedBy,

          updatedAt:
            record.updatedAt,
        },
      ),
    },
  };
}