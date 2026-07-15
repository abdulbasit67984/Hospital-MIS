import type {
  IndexDescription,
} from 'mongodb';

import {
  accessControlSchemas,
  type AccessControlModelName,
} from '../models/access-control.js';

import type {
  Migration,
} from './types.js';

const collections:
  readonly AccessControlModelName[] = [
    'roles',
    'permissions',
    'userRoles',
    'rolePermissions',
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

const boolean = {
  bsonType: 'bool',
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
    AccessControlModelName,
    Record<string, unknown>
  > = {
    roles: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'publicId',
          'code',
          'normalizedCode',
          'name',
          'systemRole',
          'active',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,
          publicId: string,
          code: string,
          normalizedCode: string,
          name: string,
          description: string,
          systemRole: boolean,
          active: boolean,
          createdBy: objectId,
          updatedBy: objectId,
        },

        additionalProperties: true,
      },
    },

    permissions: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'publicId',
          'key',
          'module',
          'description',
          'sensitivity',
          'source',
          'active',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,
          publicId: string,
          key: string,
          module: string,
          description: string,

          sensitivity: {
            bsonType: 'string',

            enum: [
              'STANDARD',
              'SENSITIVE',
              'HIGHLY_SENSITIVE',
            ],
          },

          source: {
            bsonType: 'string',

            enum: [
              'SYSTEM',
              'CUSTOM',
            ],
          },

          active: boolean,
        },

        additionalProperties: true,
      },
    },

    userRoles: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'userId',
          'roleId',
          'active',
          'assignedAt',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,
          userId: objectId,
          roleId: objectId,
          active: boolean,
          assignedAt: date,
          assignedBy: objectId,
          revokedAt: date,
          revokedBy: objectId,
          revokeReason: string,
        },

        additionalProperties: true,
      },
    },

    rolePermissions: {
      $jsonSchema: {
        bsonType: 'object',

        required: [
          'facilityId',
          'roleId',
          'permissionId',
          'permissionKey',
          'active',
          'assignedAt',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          ...commonProperties,
          roleId: objectId,
          permissionId: objectId,
          permissionKey: string,
          active: boolean,
          assignedAt: date,
          assignedBy: objectId,
          revokedAt: date,
          revokedBy: objectId,
        },

        additionalProperties: true,
      },
    },
  };

export const accessControlFoundation:
  Migration = {
    id:
      '003-access-control-foundation',

    description:
      'Add explicit roles, permissions, user-role and role-permission schemas',

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

      for (const name of collections) {
        if (
          existingCollections.has(name)
        ) {
          await database.command({
            collMod: name,
            validator: validators[name],
            validationLevel: 'strict',
            validationAction: 'error',
          });
        } else {
          await database.createCollection(
            name,
            {
              validator: validators[name],
              validationLevel: 'strict',
              validationAction: 'error',
            },
          );
        }

        const indexes =
          accessControlSchemas[
            name
          ].indexes();

        if (indexes.length === 0) {
          continue;
        }

        const descriptions:
          IndexDescription[] =
          indexes.map(
            ([keys, options]) => ({
              key: keys,
              ...options,
            }),
          );

        await database
          .collection(name)
          .createIndexes(
            descriptions,
          );
      }
    },
  };