import type {
  IndexDescription,
} from 'mongodb';

import {
  auditSchemas,
  type AuditModelName,
} from '../models/audit.js';

import type {
  Migration,
} from './types.js';

const auditCollections:
  readonly AuditModelName[] = [
    'auditLogs',
    'securityEvents',
  ];

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

const validators:
  Record<
    AuditModelName,
    Record<string, unknown>
  > = {
    auditLogs: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'eventId',
          'actorRoleIds',
          'actorRoleCodes',
          'action',
          'module',
          'entityType',
          'entityId',
          'outcome',
          'sensitivity',
          'correlationId',
          'requestSource',
          'occurredAt',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,

          eventId: string,
          actorId: objectId,

          actorRoleIds: {
            bsonType: 'array',
            items: objectId,
          },

          actorRoleCodes: {
            bsonType: 'array',
            items: string,
          },

          action: string,
          module: string,
          entityType: string,
          entityId: string,
          reason: string,

          beforeSnapshot: {},
          afterSnapshot: {},
          metadata: {},

          outcome: {
            bsonType: 'string',

            enum: [
              'ATTEMPTED',
              'SUCCESS',
              'FAILURE',
              'DENIED',
            ],
          },

          sensitivity: {
            bsonType: 'string',

            enum: [
              'STANDARD',
              'SENSITIVE',
              'HIGHLY_SENSITIVE',
            ],
          },

          correlationId: string,
          transactionId: string,

          requestSource: {
            bsonType: 'string',

            enum: [
              'API',
              'WORKER',
              'SCRIPT',
              'SYSTEM',
            ],
          },

          requestMethod: string,
          requestPath: string,
          responseStatusCode: number,
          ipAddress: string,
          userAgent: string,
          occurredAt: date,
        },

        additionalProperties: true,
      },
    },

    securityEvents: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'eventId',
          'eventType',
          'severity',
          'outcome',
          'correlationId',
          'requestSource',
          'occurredAt',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,

          eventId: string,
          eventType: string,

          severity: {
            bsonType: 'string',

            enum: [
              'INFO',
              'WARNING',
              'HIGH',
              'CRITICAL',
            ],
          },

          outcome: {
            bsonType: 'string',

            enum: [
              'ATTEMPTED',
              'SUCCESS',
              'FAILURE',
              'DENIED',
            ],
          },

          actorId: objectId,
          sessionId: string,
          entityType: string,
          entityId: string,
          correlationId: string,

          requestSource: {
            bsonType: 'string',

            enum: [
              'API',
              'WORKER',
              'SCRIPT',
              'SYSTEM',
            ],
          },

          ipAddress: string,
          userAgent: string,
          details: {},
          occurredAt: date,
        },

        additionalProperties: true,
      },
    },
  };

export const auditFoundation:
  Migration = {
    id:
      '004-audit-foundation',

    description:
      'Add explicit immutable audit and security-event collections',

    async up(database) {
      const existingCollections =
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
        const name of
        auditCollections
      ) {
        if (
          existingCollections.has(name)
        ) {
          await database.command({
            collMod: name,
            validator:
              validators[name],
            validationLevel:
              'strict',
            validationAction:
              'error',
          });
        } else {
          await database.createCollection(
            name,
            {
              validator:
                validators[name],
              validationLevel:
                'strict',
              validationAction:
                'error',
            },
          );
        }

        const indexes =
          auditSchemas[name].indexes();

        const descriptions:
          IndexDescription[] =
          indexes.map(
            ([keys, options]) => ({
              key: keys,
              ...options,
            }),
          );

        if (
          descriptions.length > 0
        ) {
          await database
            .collection(name)
            .createIndexes(
              descriptions,
            );
        }
      }
    },
  };