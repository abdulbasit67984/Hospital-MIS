import type {
  Db,
  IndexDescription,
} from 'mongodb';

import type {
  Migration,
} from './types.js';

type InfrastructureCollection = {
  name: string;
  validator:
    Record<string, unknown>;
  indexes:
    readonly IndexDescription[];
};

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

const commonProperties = {
  _id: objectId,
  facilityId: objectId,

  schemaVersion: {
    bsonType: 'number',
    minimum: 1,
  },

  version: {
    bsonType: 'number',
    minimum: 0,
  },

  createdAt: date,
  updatedAt: date,
};

const infrastructureCollections:
  readonly InfrastructureCollection[] = [
    {
      name:
        'numberSequences',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'key',
            'currentValue',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            key:
              string,

            currentValue: {
              bsonType:
                'number',

              minimum:
                0,
            },
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            facilityId: 1,
            key: 1,
          },

          name:
            'uq_sequence_facility_key',

          unique:
            true,
        },
      ],
    },

    {
      name:
        'idempotencyKeys',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'scope',
            'key',
            'requestHash',
            'status',
            'ownerId',
            'expiresAt',
            'purgeAt',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            scope:
              string,

            key:
              string,

            requestHash:
              string,

            status: {
              bsonType:
                'string',

              enum: [
                'IN_PROGRESS',
                'COMPLETED',
                'FAILED',
              ],
            },

            ownerId:
              string,

            responseSnapshot: {},
            errorSnapshot: {},

            completedAt:
              date,

            failedAt:
              date,

            expiresAt:
              date,

            purgeAt:
              date,
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            facilityId: 1,
            scope: 1,
            key: 1,
          },

          name:
            'uq_idempotency_scope_key',

          unique:
            true,
        },

        {
          key: {
            status: 1,
            expiresAt: 1,
          },

          name:
            'ix_idempotency_status_expiry',
        },

        {
          key: {
            purgeAt: 1,
          },

          name:
            'ttl_idempotency_purge',

          expireAfterSeconds:
            0,
        },
      ],
    },

    {
      name:
        'operationLocks',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'resourceType',
            'resourceKey',
            'ownerId',
            'leaseToken',
            'leaseExpiresAt',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            resourceType:
              string,

            resourceKey:
              string,

            ownerId:
              string,

            leaseToken:
              string,

            leaseExpiresAt:
              date,
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            facilityId: 1,
            resourceType: 1,
            resourceKey: 1,
          },

          name:
            'uq_operation_lock_resource',

          unique:
            true,
        },

        {
          key: {
            leaseExpiresAt: 1,
          },

          name:
            'ttl_operation_lock_expiry',

          expireAfterSeconds:
            0,
        },
      ],
    },

    {
      name:
        'applicationTransactions',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'transactionId',
            'transactionType',
            'idempotencyKey',
            'correlationId',
            'initiatedBy',
            'status',
            'retryCount',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            transactionId:
              string,

            transactionType:
              string,

            idempotencyKey:
              string,

            correlationId:
              string,

            initiatedBy:
              objectId,

            status: {
              bsonType:
                'string',

              enum: [
                'PENDING',
                'IN_PROGRESS',
                'COMPENSATING',
                'COMPENSATED',
                'COMPLETED',
                'FAILED',
                'RECOVERY_REQUIRED',
                'MANUALLY_RESOLVED',
              ],
            },

            contextSnapshot: {},
            relatedEntities: {},
            errorDetails: {},

            retryCount: {
              ...number,
              minimum: 0,
            },

            completionTimestamp:
              date,

            recoveryStatus:
              string,
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            transactionId: 1,
          },

          name:
            'uq_application_transaction_id',

          unique:
            true,
        },

        {
          key: {
            facilityId: 1,
            transactionType: 1,
            idempotencyKey: 1,
          },

          name:
            'uq_application_transaction_idempotency',

          unique:
            true,
        },

        {
          key: {
            status: 1,
            updatedAt: 1,
          },

          name:
            'ix_application_transaction_recovery',
        },

        {
          key: {
            facilityId: 1,
            correlationId: 1,
          },

          name:
            'ix_application_transaction_correlation',
        },
      ],
    },

    {
      name:
        'applicationTransactionSteps',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'transactionId',
            'sequence',
            'name',
            'status',
            'attemptCount',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            transactionId:
              string,

            sequence: {
              ...number,
              minimum: 0,
            },

            name:
              string,

            status: {
              bsonType:
                'string',

              enum: [
                'PENDING',
                'EXECUTING',
                'EXECUTED',
                'VERIFIED',
                'FAILED',
                'COMPENSATING',
                'COMPENSATED',
                'COMPENSATION_FAILED',
                'SKIPPED',
              ],
            },

            attemptCount: {
              ...number,
              minimum: 0,
            },

            executedAt:
              date,

            verifiedAt:
              date,

            compensatedAt:
              date,

            errorDetails: {},
            compensationErrorDetails: {},
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            transactionId: 1,
            sequence: 1,
          },

          name:
            'uq_application_transaction_step_sequence',

          unique:
            true,
        },

        {
          key: {
            transactionId: 1,
            status: 1,
          },

          name:
            'ix_application_transaction_step_status',
        },
      ],
    },

    {
      name:
        'outboxEvents',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'eventId',
            'transactionId',
            'eventType',
            'aggregateType',
            'aggregateId',
            'payload',
            'status',
            'availableAt',
            'attemptCount',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            eventId:
              string,

            transactionId:
              string,

            eventType:
              string,

            aggregateType:
              string,

            aggregateId:
              string,

            payload: {},

            status: {
              bsonType:
                'string',

              enum: [
                'BLOCKED',
                'PENDING',
                'PROCESSING',
                'PUBLISHED',
                'FAILED',
                'DEAD_LETTER',
              ],
            },

            availableAt:
              date,

            leaseOwner:
              string,

            leaseToken:
              string,

            leaseExpiresAt:
              date,

            attemptCount: {
              ...number,
              minimum: 0,
            },

            publishedAt:
              date,

            lastError: {},
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            eventId: 1,
          },

          name:
            'uq_outbox_event_id',

          unique:
            true,
        },

        {
          key: {
            status: 1,
            availableAt: 1,
            createdAt: 1,
          },

          name:
            'ix_outbox_dispatch',
        },

        {
          key: {
            transactionId: 1,
            status: 1,
          },

          name:
            'ix_outbox_transaction_status',
        },

        {
          key: {
            leaseExpiresAt: 1,
          },

          name:
            'ix_outbox_lease_expiry',
        },
      ],
    },

    {
      name:
        'backgroundJobs',

      validator: {
        $jsonSchema: {
          bsonType:
            'object',

          required: [
            'facilityId',
            'jobId',
            'jobType',
            'payload',
            'status',
            'priority',
            'runAt',
            'attemptCount',
            'maxAttempts',
            'schemaVersion',
            'version',
            'createdAt',
            'updatedAt',
          ],

          properties: {
            ...commonProperties,

            jobId:
              string,

            jobType:
              string,

            payload: {},

            status: {
              bsonType:
                'string',

              enum: [
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'FAILED',
                'DEAD_LETTER',
                'CANCELLED',
              ],
            },

            priority:
              number,

            runAt:
              date,

            leaseOwner:
              string,

            leaseToken:
              string,

            leaseExpiresAt:
              date,

            attemptCount: {
              ...number,
              minimum: 0,
            },

            maxAttempts: {
              ...number,
              minimum: 1,
            },

            completedAt:
              date,

            lastError: {},
          },

          additionalProperties:
            true,
        },
      },

      indexes: [
        {
          key: {
            jobId: 1,
          },

          name:
            'uq_background_job_id',

          unique:
            true,
        },

        {
          key: {
            status: 1,
            runAt: 1,
            priority: -1,
            createdAt: 1,
          },

          name:
            'ix_background_job_dispatch',
        },

        {
          key: {
            leaseExpiresAt: 1,
          },

          name:
            'ix_background_job_lease_expiry',
        },

        {
          key: {
            facilityId: 1,
            jobType: 1,
            status: 1,
            createdAt: -1,
          },

          name:
            'ix_background_job_facility_type',
        },
      ],
    },
  ];

async function ensureCollection(
  database: Db,
  specification:
    InfrastructureCollection,
  existing:
    Set<string>,
): Promise<void> {
  if (
    existing.has(
      specification.name,
    )
  ) {
    await database.command({
      collMod:
        specification.name,

      validator:
        specification.validator,

      validationLevel:
        'strict',

      validationAction:
        'error',
    });
  } else {
    await database.createCollection(
      specification.name,
      {
        validator:
          specification.validator,

        validationLevel:
          'strict',

        validationAction:
          'error',
      },
    );
  }

  await database
    .collection(
      specification.name,
    )
    .createIndexes([
      ...specification.indexes,
    ]);
}

export const operationalInfrastructure:
  Migration = {
    id:
      '005-operational-infrastructure',

    description:
      'Add standalone MongoDB transaction journals, locks, idempotency, sequences, outbox and background jobs',

    async up(
      database,
    ) {
      const existing =
        new Set(
          (
            await database
              .listCollections(
                {},
                {
                  nameOnly: true,
                },
              )
              .toArray()
          ).map(
            (collection) =>
              collection.name,
          ),
        );

      for (
        const specification of
        infrastructureCollections
      ) {
        await ensureCollection(
          database,
          specification,
          existing,
        );
      }
    },
  };