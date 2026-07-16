import type {
  IndexDescription,
} from 'mongodb';

import type {
  Migration,
} from './types.js';

const validator = {
  $jsonSchema: {
    bsonType:
      'object',

    required: [
      'transactionId',
      'userId',
      'revokedBy',
      'reason',
      'status',
      'revokedSessionCount',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
    ],

    properties: {
      _id: {
        bsonType:
          'objectId',
      },

      transactionId: {
        bsonType:
          'string',
      },

      userId: {
        bsonType:
          'objectId',
      },

      revokedBy: {
        bsonType:
          'objectId',
      },

      reason: {
        bsonType:
          'string',
      },

      excludeSessionId: {
        bsonType: [
          'string',
          'null',
        ],
      },

      status: {
        bsonType:
          'string',

        enum: [
          'IN_PROGRESS',
          'COMPLETED',
          'FAILED',
        ],
      },

      revokedSessionCount: {
        bsonType:
          'number',

        minimum:
          0,
      },

      lastError:
        {},

      completedAt: {
        bsonType:
          'date',
      },

      schemaVersion: {
        bsonType:
          'number',

        minimum:
          1,
      },

      version: {
        bsonType:
          'number',

        minimum:
          0,
      },

      createdAt: {
        bsonType:
          'date',
      },

      updatedAt: {
        bsonType:
          'date',
      },
    },

    additionalProperties:
      true,
  },
} as const;

const indexes:
  IndexDescription[] = [
    {
      key: {
        transactionId:
          1,
      },

      name:
        'uq_identity_session_revocation_transaction',

      unique:
        true,
    },

    {
      key: {
        userId:
          1,

        createdAt:
          -1,
      },

      name:
        'ix_identity_session_revocation_user_created',
    },

    {
      key: {
        status:
          1,

        updatedAt:
          1,
      },

      name:
        'ix_identity_session_revocation_recovery',
    },
  ];

export const identityRuntimeInfrastructure:
  Migration = {
    id:
      '007-identity-runtime-infrastructure',

    description:
      'Add durable identity session-revocation operations and recovery indexes',

    async up(
      database,
    ) {
      const collectionName =
        'identitySessionRevocations';

      const exists =
        (
          await database
            .listCollections(
              {
                name:
                  collectionName,
              },
              {
                nameOnly:
                  true,
              },
            )
            .toArray()
        ).length > 0;

      if (
        exists
      ) {
        await database.command({
          collMod:
            collectionName,

          validator,

          validationLevel:
            'strict',

          validationAction:
            'error',
        });
      } else {
        await database.createCollection(
          collectionName,
          {
            validator,

            validationLevel:
              'strict',

            validationAction:
              'error',
          },
        );
      }

      await database
        .collection(
          collectionName,
        )
        .createIndexes(
          indexes,
        );

      await database
        .collection(
          'sessions',
        )
        .createIndex(
          {
            identityRevocationTransactionId:
              1,
          },
          {
            name:
              'ix_sessions_identity_revocation_transaction',

            partialFilterExpression: {
              identityRevocationTransactionId: {
                $type:
                  'string',
              },
            },
          },
        );

      await database
        .collection(
          'refreshTokens',
        )
        .createIndex(
          {
            identityRevocationTransactionId:
              1,
          },
          {
            name:
              'ix_refresh_tokens_identity_revocation_transaction',

            partialFilterExpression: {
              identityRevocationTransactionId: {
                $type:
                  'string',
              },
            },
          },
        );
    },
  };