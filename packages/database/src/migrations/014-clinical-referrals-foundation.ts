import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  ClinicalReferralModel,
  clinicalReferralChangeTypeValues,
  clinicalReferralPriorityValues,
  clinicalReferralStatusValues,
  clinicalReferralTypeValues,
} from '../models/clinical-referral.model.js';

import type {
  Migration,
} from './types.js';

const collectionName =
  'clinicalReferrals' as const;

export const clinicalReferralValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      '_id',
      'facilityId',
      'referralNumber',
      'referralVersion',
      'patientId',
      'sourceEncounterId',
      'requestingProviderId',
      'referralType',
      'priority',
      'status',
      'changeType',
      'target',
      'reason',
      'requestedAt',
      'changedAt',
      'changedBy',
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
      _id: {
        bsonType: 'objectId',
      },
      facilityId: {
        bsonType: 'objectId',
      },
      referralNumber: {
        bsonType: 'string',
        minLength: 3,
        maxLength: 120,
      },
      referralVersion: {
        bsonType: 'number',
        minimum: 1,
      },
      previousVersionId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },
      patientId: {
        bsonType: 'objectId',
      },
      sourceEncounterId: {
        bsonType: 'objectId',
      },
      sourceClinicalNoteId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },
      requestingProviderId: {
        bsonType: 'objectId',
      },
      assignedProviderId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },
      referralType: {
        bsonType: 'string',
        enum: [
          ...clinicalReferralTypeValues,
        ],
      },
      priority: {
        bsonType: 'string',
        enum: [
          ...clinicalReferralPriorityValues,
        ],
      },
      status: {
        bsonType: 'string',
        enum: [
          ...clinicalReferralStatusValues,
        ],
      },
      changeType: {
        bsonType: 'string',
        enum: [
          ...clinicalReferralChangeTypeValues,
        ],
      },
      target: {
        bsonType: 'object',
        required: [],
        additionalProperties: false,
        properties: {
          facilityId: {
            bsonType: [
              'objectId',
              'null',
            ],
          },
          departmentId: {
            bsonType: [
              'objectId',
              'null',
            ],
          },
          clinicId: {
            bsonType: [
              'objectId',
              'null',
            ],
          },
          servicePointId: {
            bsonType: [
              'objectId',
              'null',
            ],
          },
          providerId: {
            bsonType: [
              'objectId',
              'null',
            ],
          },
          externalOrganization: {
            bsonType: [
              'string',
              'null',
            ],
          },
          externalProviderName: {
            bsonType: [
              'string',
              'null',
            ],
          },
        },
      },
      reason: {
        bsonType: 'string',
        minLength: 3,
        maxLength: 10_000,
      },
      clinicalQuestion: {
        bsonType: [
          'string',
          'null',
        ],
      },
      responseSummary: {
        bsonType: [
          'string',
          'null',
        ],
      },
      decisionReason: {
        bsonType: [
          'string',
          'null',
        ],
      },
      requestedAt: {
        bsonType: 'date',
      },
      acceptedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },
      startedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },
      completedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },
      declinedAt: {
        bsonType: [
          'date',
          'null',
        ],
      },
      cancelledAt: {
        bsonType: [
          'date',
          'null',
        ],
      },
      changedAt: {
        bsonType: 'date',
      },
      changedBy: {
        bsonType: 'objectId',
      },
      correctionReason: {
        bsonType: [
          'string',
          'null',
        ],
      },
      replacesVersionId: {
        bsonType: [
          'objectId',
          'null',
        ],
      },
      transactionId: {
        bsonType: 'string',
      },
      correlationId: {
        bsonType: 'string',
      },
      schemaVersion: {
        bsonType: 'number',
        minimum: 1,
      },
      version: {
        bsonType: 'number',
        minimum: 0,
      },
      createdBy: {
        bsonType: 'objectId',
      },
      updatedBy: {
        bsonType: 'objectId',
      },
      createdAt: {
        bsonType: 'date',
      },
      updatedAt: {
        bsonType: 'date',
      },
    },
  },
} as const;

async function ensureCollection(
  database: Db,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections(
          {
            name: collectionName,
          },
          {
            nameOnly: true,
          },
        )
        .toArray()
    ).length > 0;

  if (!exists) {
    await database.createCollection(
      collectionName,
      {
        validator: clinicalReferralValidator,
        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  } else {
    await database.command({
      collMod: collectionName,
      validator: clinicalReferralValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection =
    database.collection(collectionName);

  const existingIndexes =
    await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    ClinicalReferralModel.schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const clinicalReferralsFoundation: Migration = {
  id: '014-clinical-referrals-foundation',
  description:
    'Create append-only clinical referral and consultation request persistence',

  async up(database) {
    const spec =
      collectionSpecs.find(
        (candidate) => candidate.name === collectionName,
      );

    if (
      spec === undefined ||
      spec.domain !== 'clinical' ||
      spec.retention !== 'immutable'
    ) {
      throw new Error(
        'clinicalReferrals must be cataloged as immutable clinical data',
      );
    }

    await ensureCollection(database);
  },
};