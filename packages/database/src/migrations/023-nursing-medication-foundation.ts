import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  IntakeOutputEntryModel,
  NursingAssessmentModel,
  NursingAssessmentVersionModel,
  NursingCarePlanModel,
  NursingCarePlanVersionModel,
  NursingDeviceModel,
  NursingDeviceObservationModel,
  NursingTaskModel,
} from '../models/nursing-medication.model.js';

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

const commonProperties = {
  _id: objectId,
  facilityId: objectId,
  admissionId: objectId,
  patientId: objectId,
  encounterId: objectId,
  wardId: objectId,
  roomId: nullableObjectId,
  bedId: nullableObjectId,
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
  createdBy: objectId,
  createdAt: {
    bsonType: 'date',
  },
} as const;

const mutableProperties = {
  ...commonProperties,
  idempotencyKey: {
    bsonType: 'string',
  },
  version: {
    bsonType: 'number',
    minimum: 0,
  },
  updatedBy: objectId,
  updatedAt: {
    bsonType: 'date',
  },
} as const;

const mutableRequiredFields = [
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

const immutableRequiredFields = [
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'createdBy',
  'createdAt',
] as const;

export const nursingMedicationCollections = [
  'nursingAssessments',
  'nursingAssessmentVersions',
  'nursingCarePlans',
  'nursingCarePlanVersions',
  'nursingTasks',
  'intakeOutputEntries',
  'nursingDevices',
  'nursingDeviceObservations',
] as const;

export type NursingMedicationCollectionName =
  (typeof nursingMedicationCollections)[number];

export const nursingMedicationValidators = {
  nursingAssessments: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...mutableRequiredFields,
        'assessmentNumber',
        'assessmentType',
        'sections',
        'overallRiskLevel',
        'requiresEscalation',
        'assessedAt',
        'recordedAt',
        'assessedByUserId',
        'assessedByStaffId',
        'status',
        'revisionNumber',
        'rootAssessmentId',
      ],
      properties: {
        ...mutableProperties,
        assessmentNumber: {
          bsonType: 'string',
        },
        assessmentType: {
          bsonType: 'string',
        },
        templateCode: nullableString,
        templateVersion: {
          bsonType: [
            'number',
            'null',
          ],
        },
        sections: {
          bsonType: 'array',
        },
        summary: nullableString,
        overallRiskLevel: {
          bsonType: 'string',
        },
        requiresEscalation: {
          bsonType: 'bool',
        },
        escalationReason: nullableString,
        assessedAt: {
          bsonType: 'date',
        },
        recordedAt: {
          bsonType: 'date',
        },
        backdatedEntryReason: nullableString,
        assessedByUserId: objectId,
        assessedByStaffId: objectId,
        status: {
          bsonType: 'string',
        },
        signedAt: nullableDate,
        signedByUserId: nullableObjectId,
        signedByStaffId: nullableObjectId,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        rootAssessmentId: objectId,
        supersedesAssessmentId:
          nullableObjectId,
        supersededByAssessmentId:
          nullableObjectId,
        correctionReason: nullableString,
        enteredInErrorAt: nullableDate,
        enteredInErrorByUserId:
          nullableObjectId,
        enteredInErrorByStaffId:
          nullableObjectId,
        enteredInErrorReason:
          nullableString,
      },
    },
  },

  nursingAssessmentVersions: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...immutableRequiredFields,
        'nursingAssessmentId',
        'rootAssessmentId',
        'revisionNumber',
        'snapshot',
        'capturedAt',
        'capturedByUserId',
        'capturedByStaffId',
        'reason',
      ],
      properties: {
        ...commonProperties,
        nursingAssessmentId: objectId,
        rootAssessmentId: objectId,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        snapshot: {
          bsonType: 'object',
        },
        capturedAt: {
          bsonType: 'date',
        },
        capturedByUserId: objectId,
        capturedByStaffId: objectId,
        reason: {
          bsonType: 'string',
        },
      },
    },
  },

  nursingCarePlans: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...mutableRequiredFields,
        'carePlanNumber',
        'title',
        'status',
        'problems',
        'startedAt',
        'revisionNumber',
        'rootCarePlanId',
      ],
      properties: {
        ...mutableProperties,
        carePlanNumber: {
          bsonType: 'string',
        },
        title: {
          bsonType: 'string',
        },
        status: {
          bsonType: 'string',
        },
        problems: {
          bsonType: 'array',
        },
        assignedNurseStaffId:
          nullableObjectId,
        assignedTeamCode: nullableString,
        startedAt: {
          bsonType: 'date',
        },
        targetCompletionAt: nullableDate,
        nextReviewAt: nullableDate,
        lastReviewedAt: nullableDate,
        lastReviewedByStaffId:
          nullableObjectId,
        outcomeEvaluation: nullableString,
        completedAt: nullableDate,
        completedByStaffId:
          nullableObjectId,
        cancellationReason:
          nullableString,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        rootCarePlanId: objectId,
        supersedesCarePlanId:
          nullableObjectId,
        supersededByCarePlanId:
          nullableObjectId,
        correctionReason: nullableString,
      },
    },
  },

  nursingCarePlanVersions: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...immutableRequiredFields,
        'nursingCarePlanId',
        'rootCarePlanId',
        'revisionNumber',
        'snapshot',
        'capturedAt',
        'capturedByUserId',
        'capturedByStaffId',
        'reason',
      ],
      properties: {
        ...commonProperties,
        nursingCarePlanId: objectId,
        rootCarePlanId: objectId,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        snapshot: {
          bsonType: 'object',
        },
        capturedAt: {
          bsonType: 'date',
        },
        capturedByUserId: objectId,
        capturedByStaffId: objectId,
        reason: {
          bsonType: 'string',
        },
      },
    },
  },

  nursingTasks: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...mutableRequiredFields,
        'taskNumber',
        'sourceType',
        'title',
        'priority',
        'status',
        'dueAt',
      ],
      properties: {
        ...mutableProperties,
        taskNumber: {
          bsonType: 'string',
        },
        sourceType: {
          bsonType: 'string',
        },
        sourceRecordId: nullableObjectId,
        carePlanId: nullableObjectId,
        carePlanInterventionId:
          nullableObjectId,
        title: {
          bsonType: 'string',
        },
        instructions: nullableString,
        priority: {
          bsonType: 'string',
        },
        status: {
          bsonType: 'string',
        },
        assignedStaffId: nullableObjectId,
        assignedTeamCode: nullableString,
        scheduledAt: nullableDate,
        dueAt: {
          bsonType: 'date',
        },
        recurrenceKey: nullableString,
        carriedForwardFromTaskId:
          nullableObjectId,
        carriedForwardToTaskId:
          nullableObjectId,
        startedAt: nullableDate,
        completedAt: nullableDate,
        completedByUserId:
          nullableObjectId,
        completedByStaffId:
          nullableObjectId,
        dispositionReasonCode:
          nullableString,
        dispositionReason: nullableString,
        escalatedAt: nullableDate,
        escalatedToStaffId:
          nullableObjectId,
        escalationReason: nullableString,
      },
    },
  },

  intakeOutputEntries: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...mutableRequiredFields,
        'entryNumber',
        'direction',
        'category',
        'volumeMillilitres',
        'originalQuantity',
        'originalUnitCode',
        'conversionFactorToMillilitres',
        'occurredAt',
        'recordedAt',
        'shiftCode',
        'recordedByUserId',
        'recordedByStaffId',
        'status',
        'rootEntryId',
        'revisionNumber',
      ],
      properties: {
        ...mutableProperties,
        entryNumber: {
          bsonType: 'string',
        },
        direction: {
          bsonType: 'string',
        },
        category: {
          bsonType: 'string',
        },
        sourceDescription: nullableString,
        volumeMillilitres: {
          bsonType: 'decimal',
        },
        originalQuantity: {
          bsonType: 'decimal',
        },
        originalUnitCode: {
          bsonType: 'string',
        },
        conversionFactorToMillilitres: {
          bsonType: 'decimal',
        },
        occurredAt: {
          bsonType: 'date',
        },
        recordedAt: {
          bsonType: 'date',
        },
        shiftCode: {
          bsonType: 'string',
        },
        recordedByUserId: objectId,
        recordedByStaffId: objectId,
        status: {
          bsonType: 'string',
        },
        rootEntryId: objectId,
        revisionNumber: {
          bsonType: 'number',
          minimum: 1,
        },
        supersedesEntryId:
          nullableObjectId,
        supersededByEntryId:
          nullableObjectId,
        correctionReason: nullableString,
        enteredInErrorAt: nullableDate,
        enteredInErrorByUserId:
          nullableObjectId,
        enteredInErrorByStaffId:
          nullableObjectId,
        enteredInErrorReason:
          nullableString,
      },
    },
  },

  nursingDevices: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...mutableRequiredFields,
        'deviceNumber',
        'deviceType',
        'deviceName',
        'anatomicalSite',
        'status',
      ],
      properties: {
        ...mutableProperties,
        deviceNumber: {
          bsonType: 'string',
        },
        deviceType: {
          bsonType: 'string',
        },
        deviceName: {
          bsonType: 'string',
        },
        anatomicalSite: {
          bsonType: 'string',
        },
        laterality: nullableString,
        woundDetails: {
          bsonType: [
            'object',
            'null',
          ],
        },
        insertedAt: nullableDate,
        insertedByStaffId:
          nullableObjectId,
        status: {
          bsonType: 'string',
        },
        removedAt: nullableDate,
        removedByStaffId:
          nullableObjectId,
        removalReason: nullableString,
      },
    },
  },

  nursingDeviceObservations: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...immutableRequiredFields,
        'nursingDeviceId',
        'observationNumber',
        'observationType',
        'observedAt',
        'recordedAt',
        'observedByUserId',
        'observedByStaffId',
        'infectionIndicators',
        'findings',
        'requiresEscalation',
      ],
      properties: {
        ...commonProperties,
        nursingDeviceId: objectId,
        observationNumber: {
          bsonType: 'string',
        },
        observationType: {
          bsonType: 'string',
        },
        observedAt: {
          bsonType: 'date',
        },
        recordedAt: {
          bsonType: 'date',
        },
        observedByUserId: objectId,
        observedByStaffId: objectId,
        siteCondition: nullableString,
        dressingType: nullableString,
        outputMillilitres: {
          bsonType: [
            'decimal',
            'null',
          ],
        },
        infectionIndicators: {
          bsonType: 'array',
        },
        findings: {
          bsonType: 'object',
        },
        narrative: nullableString,
        requiresEscalation: {
          bsonType: 'bool',
        },
        escalationReason: nullableString,
      },
    },
  },
} as const;

const models = {
  nursingAssessments:
    NursingAssessmentModel,
  nursingAssessmentVersions:
    NursingAssessmentVersionModel,
  nursingCarePlans:
    NursingCarePlanModel,
  nursingCarePlanVersions:
    NursingCarePlanVersionModel,
  nursingTasks:
    NursingTaskModel,
  intakeOutputEntries:
    IntakeOutputEntryModel,
  nursingDevices:
    NursingDeviceModel,
  nursingDeviceObservations:
    NursingDeviceObservationModel,
} as const;

async function ensureCollection(
  database: Db,
  name: NursingMedicationCollectionName,
): Promise<void> {
  const exists = (
    await database
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

  const validator =
    nursingMedicationValidators[name];

  if (exists) {
    await database.command({
      collMod: name,
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(
      name,
      {
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  }

  const collection =
    database.collection(name);

  const existingIndexes =
    await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(
        index.name,
      );
    }
  }

  const indexes =
    models[name].schema.indexes() as
      IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(
      indexes,
    );
  }
}

export const nursingMedicationFoundation:
  Migration = {
    id:
      '023-nursing-medication-foundation',

    description:
      'Add normalized nursing assessments, care plans, tasks, intake-output entries, wounds, lines, drains, devices, and immutable observation history',

    async up(database) {
      for (
        const collectionName of
        nursingMedicationCollections
      ) {
        await ensureCollection(
          database,
          collectionName,
        );
      }
    },
  };