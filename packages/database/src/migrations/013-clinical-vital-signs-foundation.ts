import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  clinicalConfidentialityValues,
} from '../models/clinical-emr.types.js';

import {
  VitalSignModel,
  vitalSignBodyPositionValues,
  vitalSignSourceValues,
  vitalSignStatusValues,
  vitalSignTemperatureSiteValues,
} from '../models/vital-sign.model.js';

import type {
  Migration,
} from './types.js';

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const nullableNumber = {
  bsonType: [
    'number',
    'null',
  ],
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

export const clinicalVitalSignsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'facilityId',
      'encounterId',
      'patientId',
      'observerProviderId',
      'source',
      'measuredAt',
      'recordedAt',
      'bodyPosition',
      'temperatureSite',
      'confidentiality',
      'status',
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
      encounterId: objectId,
      patientId: objectId,
      admissionId: nullableObjectId,
      sourceClinicalNoteId: nullableObjectId,
      observerProviderId: objectId,
      source: {
        bsonType: 'string',
        enum: [...vitalSignSourceValues],
      },
      deviceIdentifier: nullableString,
      measuredAt: {
        bsonType: 'date',
      },
      recordedAt: {
        bsonType: 'date',
      },
      bodyPosition: {
        bsonType: 'string',
        enum: [...vitalSignBodyPositionValues],
      },
      temperatureCelsius: nullableDecimal,
      temperatureSite: {
        bsonType: 'string',
        enum: [...vitalSignTemperatureSiteValues],
      },
      pulsePerMinute: nullableNumber,
      respiratoryRatePerMinute: nullableNumber,
      systolicBloodPressureMmHg: nullableNumber,
      diastolicBloodPressureMmHg: nullableNumber,
      oxygenSaturationPercent: nullableDecimal,
      bloodGlucoseMgDl: nullableDecimal,
      painScore: nullableNumber,
      weightKg: nullableDecimal,
      heightCm: nullableDecimal,
      bmi: nullableDecimal,
      oxygenDeliveryMethod: nullableString,
      oxygenFlowLitresPerMinute: nullableDecimal,
      notes: nullableString,
      confidentiality: {
        bsonType: 'string',
        enum: [...clinicalConfidentialityValues],
      },
      restrictionReason: nullableString,
      status: {
        bsonType: 'string',
        enum: [...vitalSignStatusValues],
      },
      correctedAt: nullableDate,
      correctedBy: nullableObjectId,
      correctionReason: nullableString,
      supersedesVitalSignId: nullableObjectId,
      supersededByVitalSignId: nullableObjectId,
      enteredInErrorAt: nullableDate,
      enteredInErrorBy: nullableObjectId,
      enteredInErrorReason: nullableString,
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
      createdBy: objectId,
      updatedBy: objectId,
      createdAt: {
        bsonType: 'date',
      },
      updatedAt: {
        bsonType: 'date',
      },
    },
  },
} as const;

async function ensureVitalSignsCollection(
  db: Db,
): Promise<void> {
  const name = 'vitalSigns';
  const exists = (
    await db
      .listCollections(
        {
          name,
        },
        {
          nameOnly: true,
        },
      )
      .toArray()
  ).length > 0;

  if (!exists) {
    await db.createCollection(name, {
      validator: clinicalVitalSignsValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.command({
      collMod: name,
      validator: clinicalVitalSignsValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection = db.collection(name);
  const existingIndexes = await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    VitalSignModel.schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const clinicalVitalSignsFoundation: Migration = {
  id: '013-clinical-vital-signs-foundation',
  description:
    'Replace generic vital-sign storage with append-only encounter measurement persistence and safe correction constraints',

  async up(db) {
    await ensureVitalSignsCollection(db);
  },
};