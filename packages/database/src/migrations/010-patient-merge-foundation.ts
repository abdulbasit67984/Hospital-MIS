import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  patientMergeEvidenceCodeValues,
  patientMergeSchema,
  patientMergeStatusValues,
  patientMergeStrategyValues,
} from '../models/patient-merge.model.js';

import {
  patientStatusValues,
} from '../models/patient-guardian.types.js';

import type {
  Migration,
} from './types.js';

export const patientMergeCollections = [
  'patientMerges',
] as const;

const objectId = {
  bsonType: 'objectId',
} as const;

const date = {
  bsonType: 'date',
} as const;

const string = {
  bsonType: 'string',
} as const;

const number = {
  bsonType: 'number',
} as const;

export const patientMergeValidators = {
  patientMerges: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'facilityId',
        'mergeId',
        'sourcePatientId',
        'targetPatientId',
        'sourceEnterprisePatientId',
        'targetEnterprisePatientId',
        'sourcePrimaryMrn',
        'targetPrimaryMrn',
        'evidenceCodes',
        'reason',
        'strategy',
        'status',
        'sourceStatusBefore',
        'targetStatusBefore',
        'sourceVersionBefore',
        'sourceVersionAfter',
        'targetVersionBefore',
        'targetVersionAfter',
        'mergedAt',
        'mergedBy',
        'transactionId',
        'correlationId',
        'schemaVersion',
        'version',
        'createdBy',
        'updatedBy',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        _id: objectId,
        facilityId: objectId,
        mergeId: string,
        sourcePatientId: objectId,
        targetPatientId: objectId,
        sourceEnterprisePatientId: string,
        targetEnterprisePatientId: string,
        sourcePrimaryMrn: string,
        targetPrimaryMrn: string,
        evidenceCodes: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
          items: {
            bsonType: 'string',
            enum: [
              ...patientMergeEvidenceCodeValues,
            ],
          },
        },
        reason: string,
        strategy: {
          bsonType: 'string',
          enum: [
            ...patientMergeStrategyValues,
          ],
        },
        status: {
          bsonType: 'string',
          enum: [
            ...patientMergeStatusValues,
          ],
        },
        sourceStatusBefore: {
          bsonType: 'string',
          enum: [
            ...patientStatusValues,
          ],
        },
        targetStatusBefore: {
          bsonType: 'string',
          enum: [
            ...patientStatusValues,
          ],
        },
        sourceVersionBefore: {
          ...number,
          minimum: 0,
        },
        sourceVersionAfter: {
          ...number,
          minimum: 1,
        },
        targetVersionBefore: {
          ...number,
          minimum: 0,
        },
        targetVersionAfter: {
          ...number,
          minimum: 1,
        },
        mergedAt: date,
        mergedBy: objectId,
        transactionId: string,
        correlationId: string,
        schemaVersion: {
          ...number,
          minimum: 1,
        },
        version: {
          ...number,
          minimum: 0,
        },
        createdBy: objectId,
        updatedBy: objectId,
        createdAt: date,
        updatedAt: date,
      },
      additionalProperties: true,
    },
    $expr: {
      $and: [
        {
          $ne: [
            '$sourcePatientId',
            '$targetPatientId',
          ],
        },
        {
          $eq: [
            '$sourceVersionAfter',
            {
              $add: [
                '$sourceVersionBefore',
                1,
              ],
            },
          ],
        },
        {
          $eq: [
            '$targetVersionAfter',
            {
              $add: [
                '$targetVersionBefore',
                1,
              ],
            },
          ],
        },
      ],
    },
  },
} as const;

async function ensureCollection(
  database: Db,
): Promise<void> {
  const exists =
    await database
      .listCollections(
        {
          name:
            'patientMerges',
        },
        {
          nameOnly:
            true,
        },
      )
      .hasNext();

  if (!exists) {
    await database.createCollection(
      'patientMerges',
    );
  }
}

async function enforceSchema(
  database: Db,
): Promise<void> {
  await database.command({
    collMod:
      'patientMerges',

    validator:
      patientMergeValidators
        .patientMerges,

    validationLevel:
      'strict',

    validationAction:
      'error',
  });

  const indexes =
    patientMergeSchema.indexes();

  if (indexes.length > 0) {
    await database
      .collection(
        'patientMerges',
      )
      .createIndexes(
        indexes.map(
          ([key, options]) => ({
            key,
            ...options,
          }),
        ) as IndexDescription[],
      );
  }
}

export const patientMergeFoundation:
  Migration = {
    id:
      '010-patient-merge-foundation',

    description:
      'Create immutable patient merge history with canonical redirect and concurrency metadata',

    async up(database) {
      await ensureCollection(
        database,
      );

      await enforceSchema(
        database,
      );
    },
  };