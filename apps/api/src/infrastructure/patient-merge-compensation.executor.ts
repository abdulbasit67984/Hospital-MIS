import {
  nativeDatabase,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  PatientTransactionCompensation,
} from '../modules/patient/patient.ports.js';

import {
  PATIENT_COMPENSATION_TYPES,
} from '../modules/patient/patient.transaction.constants.js';

import type {
  PatientCompensationExecutorPort,
} from './patient-compensation.executor.js';

function asString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function asVersion(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      'expectedVersion must be a non-negative safe integer',
    );
  }

  return value;
}

export class PatientMergeCompensationExecutor
implements PatientCompensationExecutorPort {
  public constructor(
    private readonly delegate:
      PatientCompensationExecutorPort,
  ) {}

  public async execute(
    compensation:
      PatientTransactionCompensation,
  ): Promise<void> {
    if (
      compensation.type !==
      PATIENT_COMPENSATION_TYPES
        .DELETE_CREATED_PATIENT_MERGE
    ) {
      await this.delegate.execute(
        compensation,
      );

      return;
    }

    const entityId =
      asString(
        compensation.payload[
          'entityId'
        ],
        'entityId',
      );

    const expectedVersion =
      asVersion(
        compensation.payload[
          'expectedVersion'
        ],
      );

    const mergeId =
      toObjectId(
        entityId,
        'entityId',
      );

    const collection =
      nativeDatabase()
        .collection(
          'patientMerges',
        );

    const current =
      await collection.findOne(
        {
          _id:
            mergeId,
        },
        {
          projection: {
            version:
              1,
          },
        },
      );

    if (current === null) {
      return;
    }

    if (
      current['version'] !==
      expectedVersion
    ) {
      throw new ConflictError(
        'Patient merge history changed before compensation could remove it',
      );
    }

    const deleted =
      await collection.deleteOne({
        _id:
          mergeId,

        version:
          expectedVersion,
      });

    if (
      deleted.deletedCount !== 1
    ) {
      throw new ConflictError(
        'Patient merge history could not be removed during compensation',
      );
    }
  }
}