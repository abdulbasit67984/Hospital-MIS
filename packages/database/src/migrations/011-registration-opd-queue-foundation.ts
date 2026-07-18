import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  opdClinicSchema,
  servicePointSchema,
} from '../models/opd-context.model.js';

import {
  opdVisitSchema,
} from '../models/opd-visit.model.js';

import {
  queueDefinitionSchema,
  queueStatusHistorySchema,
  queueTokenSchema,
  serviceCounterSchema,
} from '../models/queue.model.js';

import {
  clinicStatusValues,
  opdVisitStatusValues,
  queueDefinitionStatusValues,
  queueEntryStatusValues,
  queuePriorityClassValues,
  queuePublicDisplayModeValues,
  queueResetPolicyValues,
  queueSpecialCategoryValues,
  queueStatusChangeSourceValues,
  queueTransferReasonValues,
  registrationModeValues,
  registrationSourceValues,
  registrationStatusValues,
  serviceCounterStatusValues,
  serviceCounterTypeValues,
  servicePointStatusValues,
  servicePointTypeValues,
  triagePriorityValues,
  visitTypeValues,
} from '../models/registration-queue.types.js';

import {
  registrationSchema,
} from '../models/registration.model.js';

import type {
  Migration,
} from './types.js';

export const registrationQueueCollections = [
  'opdClinics',
  'servicePoints',
  'serviceCounters',
  'registrations',
  'opdVisits',
  'queueDefinitions',
  'queueTokens',
  'queueStatusHistories',
] as const;

type RegistrationQueueCollection =
  (typeof registrationQueueCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const string = {
  bsonType: 'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const boolean = {
  bsonType: 'bool',
} as const;

const number = {
  bsonType: 'number',
} as const;

const mutableProperties = {
  _id: objectId,
  facilityId: objectId,
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
};

function typedValidator(
  required:
    readonly string[],
  properties:
    Record<string, unknown>,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType:
        'object',

      required: [
        ...required,
      ],

      properties,

      additionalProperties:
        true,
    },
  };
}

export const registrationQueueValidators:
  Record<
    RegistrationQueueCollection,
    Record<string, unknown>
  > = {
    opdClinics:
      typedValidator(
        [
          'facilityId',
          'departmentId',
          'code',
          'name',
          'status',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          departmentId:
            objectId,

          code:
            string,

          name:
            string,

          description:
            nullableString,

          location:
            nullableString,

          defaultProviderId:
            nullableObjectId,

          status: {
            bsonType:
              'string',

            enum: [
              ...clinicStatusValues,
            ],
          },

          deactivatedAt:
            nullableDate,

          deactivatedBy:
            nullableObjectId,

          deactivationReason:
            nullableString,
        },
      ),

    servicePoints:
      typedValidator(
        [
          'facilityId',
          'departmentId',
          'code',
          'name',
          'servicePointType',
          'allowsWalkIn',
          'allowsAppointment',
          'allowsReferral',
          'allowsEmergency',
          'status',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          departmentId:
            objectId,

          clinicId:
            nullableObjectId,

          code:
            string,

          name:
            string,

          servicePointType: {
            bsonType:
              'string',

            enum: [
              ...servicePointTypeValues,
            ],
          },

          location:
            nullableString,

          defaultProviderId:
            nullableObjectId,

          allowsWalkIn:
            boolean,

          allowsAppointment:
            boolean,

          allowsReferral:
            boolean,

          allowsEmergency:
            boolean,

          status: {
            bsonType:
              'string',

            enum: [
              ...servicePointStatusValues,
            ],
          },

          deactivatedAt:
            nullableDate,

          deactivatedBy:
            nullableObjectId,

          deactivationReason:
            nullableString,
        },
      ),

    serviceCounters:
      typedValidator(
        [
          'facilityId',
          'departmentId',
          'code',
          'name',
          'counterType',
          'queueDefinitionIds',
          'status',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          departmentId:
            objectId,

          clinicId:
            nullableObjectId,

          servicePointId:
            nullableObjectId,

          code:
            string,

          name:
            string,

          counterType: {
            bsonType:
              'string',

            enum: [
              ...serviceCounterTypeValues,
            ],
          },

          queueDefinitionIds: {
            bsonType:
              'array',

            maxItems:
              100,

            uniqueItems:
              true,

            items:
              objectId,
          },

          status: {
            bsonType:
              'string',

            enum: [
              ...serviceCounterStatusValues,
            ],
          },

          activeUserId:
            nullableObjectId,

          activeProviderId:
            nullableObjectId,

          openedAt:
            nullableDate,

          closedAt:
            nullableDate,

          statusReason:
            nullableString,
        },
      ),

    registrations:
      typedValidator(
        [
          'facilityId',
          'registrationNumber',
          'patientId',
          'requestedPatientId',
          'canonicalRedirected',
          'registrationMode',
          'registrationSource',
          'visitType',
          'status',
          'serviceDate',
          'arrivedAt',
          'departmentId',
          'transactionId',
          'correlationId',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          registrationNumber:
            string,

          patientId:
            objectId,

          requestedPatientId:
            objectId,

          canonicalRedirected:
            boolean,

          registrationMode: {
            bsonType:
              'string',

            enum: [
              ...registrationModeValues,
            ],
          },

          registrationSource: {
            bsonType:
              'string',

            enum: [
              ...registrationSourceValues,
            ],
          },

          visitType: {
            bsonType:
              'string',

            enum: [
              ...visitTypeValues,
            ],
          },

          status: {
            bsonType:
              'string',

            enum: [
              ...registrationStatusValues,
            ],
          },

          serviceDate: {
            bsonType:
              'string',

            pattern:
              '^\\d{4}-\\d{2}-\\d{2}$',
          },

          arrivedAt:
            date,

          checkedInAt:
            nullableDate,

          appointmentId:
            nullableObjectId,

          referralId:
            nullableObjectId,

          referralReference:
            nullableString,

          emergencyCaseId:
            nullableObjectId,

          departmentId:
            objectId,

          clinicId:
            nullableObjectId,

          servicePointId:
            nullableObjectId,

          assignedProviderId:
            nullableObjectId,

          registrationNotes:
            nullableString,

          cancelledAt:
            nullableDate,

          cancelledBy:
            nullableObjectId,

          cancellationReason:
            nullableString,

          supersedesRegistrationId:
            nullableObjectId,

          supersededByRegistrationId:
            nullableObjectId,

          correctionReason:
            nullableString,

          transactionId:
            string,

          correlationId:
            string,
        },
      ),

    opdVisits:
      typedValidator(
        [
          'facilityId',
          'visitNumber',
          'registrationId',
          'patientId',
          'requestedPatientId',
          'canonicalRedirected',
          'serviceDate',
          'visitType',
          'registrationSource',
          'status',
          'departmentId',
          'arrivedAt',
          'transactionId',
          'correlationId',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          visitNumber:
            string,

          registrationId:
            objectId,

          patientId:
            objectId,

          requestedPatientId:
            objectId,

          canonicalRedirected:
            boolean,

          serviceDate: {
            bsonType:
              'string',

            pattern:
              '^\\d{4}-\\d{2}-\\d{2}$',
          },

          visitType: {
            bsonType:
              'string',

            enum: [
              ...visitTypeValues,
            ],
          },

          registrationSource: {
            bsonType:
              'string',

            enum: [
              ...registrationSourceValues,
            ],
          },

          status: {
            bsonType:
              'string',

            enum: [
              ...opdVisitStatusValues,
            ],
          },

          departmentId:
            objectId,

          clinicId:
            nullableObjectId,

          servicePointId:
            nullableObjectId,

          assignedProviderId:
            nullableObjectId,

          assignedCounterId:
            nullableObjectId,

          currentQueueTokenId:
            nullableObjectId,

          activeVisitKey:
            nullableString,

          arrivedAt:
            date,

          checkedInAt:
            nullableDate,

          queuedAt:
            nullableDate,

          serviceStartedAt:
            nullableDate,

          completedAt:
            nullableDate,

          cancelledAt:
            nullableDate,

          cancelledBy:
            nullableObjectId,

          cancellationReason:
            nullableString,

          noShowAt:
            nullableDate,

          noShowMarkedBy:
            nullableObjectId,

          supersedesVisitId:
            nullableObjectId,

          supersededByVisitId:
            nullableObjectId,

          correctionReason:
            nullableString,

          transactionId:
            string,

          correlationId:
            string,
        },
      ),

    queueDefinitions:
      typedValidator(
        [
          'facilityId',
          'departmentId',
          'code',
          'name',
          'displayLabel',
          'tokenPrefix',
          'resetPolicy',
          'timezone',
          'estimatedServiceMinutes',
          'maximumRecallCount',
          'allowPriority',
          'allowEmergencyOverride',
          'publicDisplayEnabled',
          'publicDisplayMode',
          'status',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          departmentId:
            objectId,

          clinicId:
            nullableObjectId,

          servicePointId:
            nullableObjectId,

          providerId:
            nullableObjectId,

          code:
            string,

          name:
            string,

          displayLabel:
            string,

          tokenPrefix:
            string,

          resetPolicy: {
            bsonType:
              'string',

            enum: [
              ...queueResetPolicyValues,
            ],
          },

          timezone:
            string,

          estimatedServiceMinutes: {
            ...number,
            minimum:
              1,
          },

          maximumRecallCount: {
            ...number,
            minimum:
              0,
          },

          allowPriority:
            boolean,

          allowEmergencyOverride:
            boolean,

          publicDisplayEnabled:
            boolean,

          publicDisplayMode: {
            bsonType:
              'string',

            enum: [
              ...queuePublicDisplayModeValues,
            ],
          },

          status: {
            bsonType:
              'string',

            enum: [
              ...queueDefinitionStatusValues,
            ],
          },

          deactivatedAt:
            nullableDate,

          deactivatedBy:
            nullableObjectId,

          deactivationReason:
            nullableString,
        },
      ),

    queueTokens:
      typedValidator(
        [
          'facilityId',
          'queueEntryId',
          'registrationId',
          'opdVisitId',
          'patientId',
          'queueDefinitionId',
          'serviceDate',
          'tokenNumber',
          'tokenPrefix',
          'tokenLabel',
          'status',
          'priorityClass',
          'priorityScore',
          'triagePriority',
          'emergencyOverride',
          'specialCategories',
          'queuedAt',
          'skipCount',
          'recallCount',
          'transferCount',
          'lastStatusChangedAt',
          'lastStatusChangedBy',
          'transactionId',
          'correlationId',
          'schemaVersion',
          'version',
          'createdBy',
          'updatedBy',
          'createdAt',
          'updatedAt',
        ],
        {
          ...mutableProperties,

          queueEntryId:
            string,

          registrationId:
            objectId,

          opdVisitId:
            objectId,

          patientId:
            objectId,

          queueDefinitionId:
            objectId,

          serviceDate: {
            bsonType:
              'string',

            pattern:
              '^\\d{4}-\\d{2}-\\d{2}$',
          },

          tokenNumber: {
            ...number,
            minimum:
              1,
          },

          tokenPrefix:
            string,

          tokenLabel:
            string,

          status: {
            bsonType:
              'string',

            enum: [
              ...queueEntryStatusValues,
            ],
          },

          priorityClass: {
            bsonType:
              'string',

            enum: [
              ...queuePriorityClassValues,
            ],
          },

          priorityScore: {
            ...number,
            minimum:
              0,
          },

          triagePriority: {
            bsonType:
              'string',

            enum: [
              ...triagePriorityValues,
            ],
          },

          emergencyOverride:
            boolean,

          emergencyOverrideReason:
            nullableString,

          specialCategories: {
            bsonType:
              'array',

            maxItems:
              10,

            uniqueItems:
              true,

            items: {
              bsonType:
                'string',

              enum: [
                ...queueSpecialCategoryValues,
              ],
            },
          },

          assignedProviderId:
            nullableObjectId,

          assignedCounterId:
            nullableObjectId,

          activeEntryKey:
            nullableString,

          queuedAt:
            date,

          calledAt:
            nullableDate,

          servingAt:
            nullableDate,

          skippedAt:
            nullableDate,

          transferredAt:
            nullableDate,

          completedAt:
            nullableDate,

          cancelledAt:
            nullableDate,

          noShowAt:
            nullableDate,

          skipCount: {
            ...number,
            minimum:
              0,
          },

          recallCount: {
            ...number,
            minimum:
              0,
          },

          transferCount: {
            ...number,
            minimum:
              0,
          },

          estimatedWaitMinutes: {
            bsonType: [
              'number',
              'null',
            ],

            minimum:
              0,
          },

          estimatedServiceAt:
            nullableDate,

          transferredFromQueueTokenId:
            nullableObjectId,

          transferredToQueueTokenId:
            nullableObjectId,

          transferReason: {
            bsonType: [
              'string',
              'null',
            ],

            enum: [
              ...queueTransferReasonValues,
              null,
            ],
          },

          statusReason:
            nullableString,

          lastStatusChangedAt:
            date,

          lastStatusChangedBy:
            objectId,

          transactionId:
            string,

          correlationId:
            string,
        },
      ),

    queueStatusHistories:
      typedValidator(
        [
          'facilityId',
          'queueTokenId',
          'queueEntryId',
          'opdVisitId',
          'patientId',
          'sequence',
          'toStatus',
          'queueDefinitionId',
          'changeSource',
          'occurredAt',
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
        {
          ...mutableProperties,

          queueTokenId:
            objectId,

          queueEntryId:
            string,

          opdVisitId:
            objectId,

          patientId:
            objectId,

          sequence: {
            ...number,
            minimum:
              1,
          },

          fromStatus: {
            bsonType: [
              'string',
              'null',
            ],

            enum: [
              ...queueEntryStatusValues,
              null,
            ],
          },

          toStatus: {
            bsonType:
              'string',

            enum: [
              ...queueEntryStatusValues,
            ],
          },

          queueDefinitionId:
            objectId,

          destinationQueueDefinitionId:
            nullableObjectId,

          providerId:
            nullableObjectId,

          destinationProviderId:
            nullableObjectId,

          counterId:
            nullableObjectId,

          destinationCounterId:
            nullableObjectId,

          changeSource: {
            bsonType:
              'string',

            enum: [
              ...queueStatusChangeSourceValues,
            ],
          },

          transferReason: {
            bsonType: [
              'string',
              'null',
            ],

            enum: [
              ...queueTransferReasonValues,
              null,
            ],
          },

          reason:
            nullableString,

          occurredAt:
            date,

          changedBy:
            objectId,

          transactionId:
            string,

          correlationId:
            string,
        },
      ),
  };

const schemaIndexes = {
  opdClinics:
    opdClinicSchema.indexes(),

  servicePoints:
    servicePointSchema.indexes(),

  serviceCounters:
    serviceCounterSchema.indexes(),

  registrations:
    registrationSchema.indexes(),

  opdVisits:
    opdVisitSchema.indexes(),

  queueDefinitions:
    queueDefinitionSchema.indexes(),

  queueTokens:
    queueTokenSchema.indexes(),

  queueStatusHistories:
    queueStatusHistorySchema.indexes(),
} as const;

async function ensureCollections(
  database: Db,
): Promise<void> {
  const existing =
    new Set(
      (
        await database
          .listCollections(
            {},
            {
              nameOnly:
                true,
            },
          )
          .toArray()
      ).map(
        (collection) =>
          collection.name,
      ),
    );

  for (
    const name of
    registrationQueueCollections
  ) {
    if (
      !existing.has(name)
    ) {
      await database
        .createCollection(
          name,
        );
    }
  }
}

async function removeLegacyIndexes(
  database: Db,
): Promise<void> {
  for (
    const name of
    registrationQueueCollections
  ) {
    const indexes =
      await database
        .collection(name)
        .indexes();

    if (
      indexes.some(
        (index) =>
          index.name !== '_id_',
      )
    ) {
      await database
        .collection(name)
        .dropIndexes();
    }
  }
}

async function enforceSchemas(
  database: Db,
): Promise<void> {
  for (
    const name of
    registrationQueueCollections
  ) {
    await database.command({
      collMod:
        name,

      validator:
        registrationQueueValidators[
          name
        ],

      validationLevel:
        'strict',

      validationAction:
        'error',
    });

    const indexes =
      schemaIndexes[
        name
      ];

    if (
      indexes.length > 0
    ) {
      await database
        .collection(name)
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
}

export const registrationOpdQueueFoundation:
  Migration = {
    id:
      '011-registration-opd-queue-foundation',

    description:
      'Create typed OPD registration, visit, clinic, service point, counter, queue, token, and immutable queue history persistence',

    async up(database) {
      await ensureCollections(
        database,
      );

      await removeLegacyIndexes(
        database,
      );

      await enforceSchemas(
        database,
      );
    },
  };