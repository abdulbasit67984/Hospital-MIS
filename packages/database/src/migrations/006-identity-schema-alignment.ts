import type {
  Db,
  Document,
  IndexDescription,
} from 'mongodb';
import {
  ObjectId,
} from 'mongodb';

import {
  permissionSchema,
} from '../models/permission.model.js';
import {
  rolePermissionSchema,
} from '../models/role-permission.model.js';
import {
  roleSchema,
} from '../models/role.model.js';
import {
  staffSchema,
} from '../models/staff.model.js';
import {
  userRoleSchema,
} from '../models/user-role.model.js';
import {
  userSchema,
} from '../models/user.model.js';
import type {
  Migration,
} from './types.js';

export const identitySchemaAlignmentCollections = [
  'users',
  'staff',
  'roles',
  'permissions',
  'userRoles',
  'rolePermissions',
] as const;

type IdentitySchemaAlignmentCollection =
  (typeof identitySchemaAlignmentCollections)[number];

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

const commonProperties = {
  _id: objectId,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdAt: date,
  updatedAt: date,
};

export const identitySchemaAlignmentValidators:
  Record<
    IdentitySchemaAlignmentCollection,
    Record<string, unknown>
  > = {
    users: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'publicId',
          'username',
          'normalizedUsername',
          'displayName',
          'passwordHash',
          'status',
          'mustChangePassword',
          'failedLoginCount',
          'passwordChangedAt',
          'tokenVersion',
          'permissionVersion',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          facilityId: nullableObjectId,
          publicId: string,
          staffId: nullableObjectId,
          username: string,
          normalizedUsername: string,
          email: nullableString,
          normalizedEmail: nullableString,
          displayName: string,
          passwordHash: string,
          status: {
            bsonType: 'string',
            enum: [
              'ACTIVE',
              'INACTIVE',
              'LOCKED',
              'SUSPENDED',
              'DISABLED',
            ],
          },
          mustChangePassword: boolean,
          failedLoginCount: {
            ...number,
            minimum: 0,
          },
          lockedUntil: nullableDate,
          lastLoginAt: nullableDate,
          passwordChangedAt: date,
          tokenVersion: {
            ...number,
            minimum: 0,
          },
          permissionVersion: {
            ...number,
            minimum: 0,
          },
          createdBy: nullableObjectId,
          updatedBy: nullableObjectId,
          disabledAt: nullableDate,
          disabledBy: nullableObjectId,
          disabledReason: nullableString,
        },
        additionalProperties: true,
      },
    },

    staff: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'facilityId',
          'employeeNumber',
          'firstName',
          'lastName',
          'displayName',
          'employmentStatus',
          'isClinical',
          'isActive',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          facilityId: objectId,
          departmentId: nullableObjectId,
          employeeNumber: string,
          firstName: string,
          middleName: nullableString,
          lastName: string,
          displayName: string,
          cnic: nullableString,
          phone: nullableString,
          email: nullableString,
          designation: nullableString,
          professionalType: nullableString,
          professionalRegistrationNumber:
            nullableString,
          joiningDate: nullableDate,
          employmentStatus: {
            bsonType: 'string',
            enum: [
              'ACTIVE',
              'INACTIVE',
              'ON_LEAVE',
              'SUSPENDED',
              'TERMINATED',
            ],
          },
          isClinical: boolean,
          isActive: boolean,
          createdBy: nullableObjectId,
          updatedBy: nullableObjectId,
        },
        additionalProperties: true,
      },
    },

    roles: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'code',
          'name',
          'scope',
          'isSystem',
          'isActive',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          facilityId: nullableObjectId,
          code: string,
          name: string,
          description: nullableString,
          scope: {
            bsonType: 'string',
            enum: [
              'GLOBAL',
              'FACILITY',
            ],
          },
          isSystem: boolean,
          isActive: boolean,
          createdBy: nullableObjectId,
          updatedBy: nullableObjectId,
        },
        additionalProperties: true,
      },
    },

    permissions: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'code',
          'name',
          'module',
          'sensitivity',
          'isSystem',
          'isActive',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          code: string,
          name: string,
          module: string,
          description: nullableString,
          sensitivity: {
            bsonType: 'string',
            enum: [
              'STANDARD',
              'SENSITIVE',
              'HIGHLY_SENSITIVE',
            ],
          },
          isSystem: boolean,
          isActive: boolean,
        },
        additionalProperties: true,
      },
    },

    userRoles: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'userId',
          'roleId',
          'assignedBy',
          'assignedAt',
          'isActive',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          userId: objectId,
          roleId: objectId,
          facilityId: nullableObjectId,
          assignedBy: objectId,
          assignedAt: date,
          expiresAt: nullableDate,
          isActive: boolean,
          revokedAt: nullableDate,
          revokedBy: nullableObjectId,
          revocationReason: nullableString,
        },
        additionalProperties: true,
      },
    },

    rolePermissions: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'roleId',
          'permissionId',
          'grantedBy',
          'grantedAt',
          'schemaVersion',
          'version',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          ...commonProperties,
          roleId: objectId,
          permissionId: objectId,
          grantedBy: objectId,
          grantedAt: date,
        },
        additionalProperties: true,
      },
    },
  };

const schemaIndexes = {
  users: userSchema.indexes(),
  staff: staffSchema.indexes(),
  roles: roleSchema.indexes(),
  permissions: permissionSchema.indexes(),
  userRoles: userRoleSchema.indexes(),
  rolePermissions:
    rolePermissionSchema.indexes(),
};

function isObjectId(
  value: unknown,
): value is ObjectId {
  return value instanceof ObjectId;
}

function asString(
  value: unknown,
): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function asBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean'
    ? value
    : fallback;
}

function asDate(
  value: unknown,
  fallback: Date,
): Date {
  return value instanceof Date &&
    !Number.isNaN(value.getTime())
    ? value
    : fallback;
}

function normalizePermissionCode(
  document: Document,
): string {
  const source =
    asString(document['code']) ??
    asString(document['key']);

  if (source === null) {
    throw new Error(
      `Permission ${String(document['_id'])} has no code or key`,
    );
  }

  return source
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
}

function humanizePermissionCode(
  code: string,
): string {
  return code
    .split(/[._-]+/u)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(' ');
}

function normalizeRoleCode(
  document: Document,
): string {
  const source =
    asString(document['code']) ??
    asString(document['normalizedCode']);

  if (source === null) {
    throw new Error(
      `Role ${String(document['_id'])} has no code`,
    );
  }

  const normalized = source
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  if (normalized.length === 0) {
    throw new Error(
      `Role ${String(document['_id'])} has an invalid code`,
    );
  }

  return normalized;
}

async function ensureCollections(
  database: Db,
): Promise<void> {
  const existing = new Set(
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
      (collection) => collection.name,
    ),
  );

  for (
    const name of
    identitySchemaAlignmentCollections
  ) {
    if (!existing.has(name)) {
      await database.createCollection(
        name,
      );
    }
  }
}

async function relaxValidation(
  database: Db,
): Promise<void> {
  for (
    const name of
    identitySchemaAlignmentCollections
  ) {
    await database.command({
      collMod: name,
      validator: {},
      validationLevel: 'moderate',
      validationAction: 'warn',
    });
  }
}

async function dropLegacyIndexes(
  database: Db,
): Promise<void> {
  for (
    const name of
    identitySchemaAlignmentCollections
  ) {
    const indexes =
      await database
        .collection(name)
        .indexes();

    const removableNames = indexes
      .map((index) => index.name)
      .filter(
        (name): name is string =>
          typeof name === 'string' &&
          name !== '_id_',
      );

    if (removableNames.length > 0) {
      await database
        .collection(name)
        .dropIndexes();
    }
  }
}

async function migrateUsers(
  database: Db,
  now: Date,
): Promise<void> {
  const users = database.collection(
    'users',
  );

  const documents =
    await users.find({}).toArray();

  for (const document of documents) {
    const username =
      asString(document['username']);

    if (username === null) {
      throw new Error(
        `User ${String(document['_id'])} has no username`,
      );
    }

    const failedLoginCountValue =
      typeof document['failedLoginCount'] ===
        'number'
        ? document['failedLoginCount']
        : typeof document[
              'failedLoginAttempts'
            ] === 'number'
          ? document[
              'failedLoginAttempts'
            ]
          : 0;

    await users.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          publicId:
            asString(document['publicId']) ??
            `USR-${String(document['_id'])}`,
          username,
          normalizedUsername:
            asString(
              document[
                'normalizedUsername'
              ],
            ) ??
            username
              .normalize('NFKC')
              .toLocaleLowerCase('en-US'),
          displayName:
            asString(document['displayName']) ??
            username,
          status:
            asString(document['status']) ??
            'ACTIVE',
          mustChangePassword:
            asBoolean(
              document[
                'mustChangePassword'
              ],
              true,
            ),
          failedLoginCount:
            Math.max(
              0,
              failedLoginCountValue,
            ),
          passwordChangedAt:
            asDate(
              document[
                'passwordChangedAt'
              ],
              now,
            ),
          tokenVersion:
            typeof document[
              'tokenVersion'
            ] === 'number'
              ? document[
                  'tokenVersion'
                ]
              : 0,
          permissionVersion:
            typeof document[
              'permissionVersion'
            ] === 'number'
              ? document[
                  'permissionVersion'
                ]
              : 0,
          schemaVersion:
            typeof document[
              'schemaVersion'
            ] === 'number'
              ? document[
                  'schemaVersion'
                ]
              : 1,
          version:
            typeof document['version'] ===
              'number'
              ? document['version']
              : 0,
          createdAt: asDate(
            document['createdAt'],
            now,
          ),
          updatedAt: now,
        },
        $unset: {
          failedLoginAttempts: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migrateRoles(
  database: Db,
  now: Date,
): Promise<void> {
  const roles = database.collection(
    'roles',
  );

  const documents =
    await roles.find({}).toArray();

  for (const document of documents) {
    const code =
      normalizeRoleCode(document);
    const facilityId = isObjectId(
      document['facilityId'],
    )
      ? document['facilityId']
      : null;
    const scope =
      document['scope'] === 'GLOBAL' ||
      document['scope'] === 'FACILITY'
        ? document['scope']
        : facilityId === null
          ? 'GLOBAL'
          : 'FACILITY';

    await roles.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId:
            scope === 'GLOBAL'
              ? null
              : facilityId,
          code,
          name:
            asString(document['name']) ??
            code
              .split('_')
              .map(
                (part) =>
                  part.charAt(0) +
                  part
                    .slice(1)
                    .toLocaleLowerCase(
                      'en-US',
                    ),
              )
              .join(' '),
          description:
            asString(
              document['description'],
            ),
          scope,
          isSystem:
            typeof document['isSystem'] ===
              'boolean'
              ? document['isSystem']
              : asBoolean(
                  document[
                    'systemRole'
                  ],
                  false,
                ),
          isActive:
            typeof document['isActive'] ===
              'boolean'
              ? document['isActive']
              : asBoolean(
                  document['active'],
                  true,
                ),
          schemaVersion:
            typeof document[
              'schemaVersion'
            ] === 'number'
              ? document[
                  'schemaVersion'
                ]
              : 1,
          version:
            typeof document['version'] ===
              'number'
              ? document['version']
              : 0,
          createdAt: asDate(
            document['createdAt'],
            now,
          ),
          updatedAt: now,
        },
        $unset: {
          publicId: '',
          normalizedCode: '',
          systemRole: '',
          active: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migratePermissions(
  database: Db,
  now: Date,
): Promise<void> {
  const permissions =
    database.collection(
      'permissions',
    );
  const rolePermissions =
    database.collection(
      'rolePermissions',
    );

  const documents =
    await permissions.find({}).toArray();
  const groups = new Map<
    string,
    Document[]
  >();

  for (const document of documents) {
    const code =
      normalizePermissionCode(
        document,
      );
    const group = groups.get(code) ?? [];
    group.push(document);
    groups.set(code, group);
  }

  for (const [code, group] of groups) {
    group.sort((left, right) => {
      const leftGlobal =
        left['facilityId'] == null
          ? 0
          : 1;
      const rightGlobal =
        right['facilityId'] == null
          ? 0
          : 1;

      if (leftGlobal !== rightGlobal) {
        return leftGlobal - rightGlobal;
      }

      return String(left['_id']).localeCompare(
        String(right['_id']),
      );
    });

    const canonical = group[0];

    if (canonical === undefined) {
      continue;
    }

    for (const duplicate of group.slice(1)) {
      await rolePermissions.updateMany(
        {
          permissionId:
            duplicate['_id'],
        },
        {
          $set: {
            permissionId:
              canonical['_id'],
          },
        },
        {
          bypassDocumentValidation: true,
        },
      );

      await permissions.deleteOne({
        _id: duplicate['_id'],
      });
    }

    const name =
      asString(canonical['name']) ??
      humanizePermissionCode(code);

    await permissions.updateOne(
      {
        _id: canonical['_id'],
      },
      {
        $set: {
          code,
          name,
          module:
            asString(canonical['module']) ??
            code.split('.')[0] ??
            'unknown',
          description:
            asString(
              canonical['description'],
            ),
          sensitivity:
            canonical['sensitivity'] ===
              'SENSITIVE' ||
            canonical['sensitivity'] ===
              'HIGHLY_SENSITIVE'
              ? canonical['sensitivity']
              : 'STANDARD',
          isSystem:
            typeof canonical[
              'isSystem'
            ] === 'boolean'
              ? canonical['isSystem']
              : canonical['source'] ===
                  'SYSTEM',
          isActive:
            typeof canonical[
              'isActive'
            ] === 'boolean'
              ? canonical['isActive']
              : asBoolean(
                  canonical['active'],
                  true,
                ),
          schemaVersion:
            typeof canonical[
              'schemaVersion'
            ] === 'number'
              ? canonical[
                  'schemaVersion'
                ]
              : 1,
          version:
            typeof canonical['version'] ===
              'number'
              ? canonical['version']
              : 0,
          createdAt: asDate(
            canonical['createdAt'],
            now,
          ),
          updatedAt: now,
        },
        $unset: {
          facilityId: '',
          publicId: '',
          key: '',
          source: '',
          active: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migrateUserRoles(
  database: Db,
  now: Date,
): Promise<void> {
  const userRoles =
    database.collection('userRoles');
  const documents =
    await userRoles.find({}).toArray();

  for (const document of documents) {
    const userId = document['userId'];
    const assignedBy = isObjectId(
      document['assignedBy'],
    )
      ? document['assignedBy']
      : userId;

    if (
      !isObjectId(userId) ||
      !isObjectId(document['roleId']) ||
      !isObjectId(assignedBy)
    ) {
      throw new Error(
        `User-role ${String(document['_id'])} has invalid references`,
      );
    }

    const isActive =
      typeof document['isActive'] ===
        'boolean'
        ? document['isActive']
        : asBoolean(
            document['active'],
            true,
          );

    await userRoles.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          facilityId: isObjectId(
            document['facilityId'],
          )
            ? document['facilityId']
            : null,
          assignedBy,
          assignedAt: asDate(
            document['assignedAt'],
            asDate(
              document['createdAt'],
              now,
            ),
          ),
          expiresAt:
            document['expiresAt'] instanceof
            Date
              ? document['expiresAt']
              : null,
          isActive,
          revokedAt:
            document['revokedAt'] instanceof
            Date
              ? document['revokedAt']
              : null,
          revokedBy: isObjectId(
            document['revokedBy'],
          )
            ? document['revokedBy']
            : null,
          revocationReason:
            asString(
              document[
                'revocationReason'
              ],
            ) ??
            asString(
              document['revokeReason'],
            ),
          schemaVersion:
            typeof document[
              'schemaVersion'
            ] === 'number'
              ? document[
                  'schemaVersion'
                ]
              : 1,
          version:
            typeof document['version'] ===
              'number'
              ? document['version']
              : 0,
          createdAt: asDate(
            document['createdAt'],
            now,
          ),
          updatedAt: now,
        },
        $unset: {
          active: '',
          revokeReason: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function migrateRolePermissions(
  database: Db,
  now: Date,
): Promise<void> {
  const rolePermissions =
    database.collection(
      'rolePermissions',
    );
  const users = database.collection(
    'users',
  );
  const fallbackActor =
    await users.findOne(
      {},
      {
        projection: {
          _id: 1,
        },
      },
    );

  const documents =
    await rolePermissions
      .find({})
      .sort({
        createdAt: 1,
        _id: 1,
      })
      .toArray();
  const retainedKeys =
    new Set<string>();

  for (const document of documents) {
    const roleId = document['roleId'];
    const permissionId =
      document['permissionId'];

    if (
      !isObjectId(roleId) ||
      !isObjectId(permissionId)
    ) {
      throw new Error(
        `Role-permission ${String(document['_id'])} has invalid references`,
      );
    }

    const key =
      `${roleId.toHexString()}:` +
      permissionId.toHexString();

    if (retainedKeys.has(key)) {
      await rolePermissions.deleteOne({
        _id: document['_id'],
      });
      continue;
    }

    retainedKeys.add(key);

    const grantedBy = isObjectId(
      document['grantedBy'],
    )
      ? document['grantedBy']
      : isObjectId(document['assignedBy'])
        ? document['assignedBy']
        : isObjectId(fallbackActor?.['_id'])
          ? fallbackActor['_id']
          : roleId;

    await rolePermissions.updateOne(
      {
        _id: document['_id'],
      },
      {
        $set: {
          roleId,
          permissionId,
          grantedBy,
          grantedAt: asDate(
            document['grantedAt'],
            asDate(
              document['assignedAt'],
              asDate(
                document['createdAt'],
                now,
              ),
            ),
          ),
          schemaVersion:
            typeof document[
              'schemaVersion'
            ] === 'number'
              ? document[
                  'schemaVersion'
                ]
              : 1,
          version:
            typeof document['version'] ===
              'number'
              ? document['version']
              : 0,
          createdAt: asDate(
            document['createdAt'],
            now,
          ),
          updatedAt: now,
        },
        $unset: {
          facilityId: '',
          permissionKey: '',
          active: '',
          assignedAt: '',
          assignedBy: '',
          revokedAt: '',
          revokedBy: '',
        },
      },
      {
        bypassDocumentValidation: true,
      },
    );
  }
}

async function applyValidators(
  database: Db,
): Promise<void> {
  for (
    const name of
    identitySchemaAlignmentCollections
  ) {
    await database.command({
      collMod: name,
      validator:
        identitySchemaAlignmentValidators[
          name
        ],
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
}

async function createIndexes(
  database: Db,
): Promise<void> {
  for (
    const name of
    identitySchemaAlignmentCollections
  ) {
    const indexes =
      schemaIndexes[name];

    if (indexes.length === 0) {
      continue;
    }

    const descriptions:
      IndexDescription[] =
      indexes.map(
        ([keys, options]) => ({
          key: keys,
          ...options,
        }) as IndexDescription,
      );

    await database
      .collection(name)
      .createIndexes(descriptions);
  }
}

export const identitySchemaAlignment:
  Migration = {
    id:
      '006-identity-schema-alignment',

    description:
      'Align Phase 3 authentication and access-control records with the Phase 4 identity domain',

    async up(database) {
      const now = new Date();

      await ensureCollections(database);
      await relaxValidation(database);
      await dropLegacyIndexes(database);
      await migrateUsers(database, now);
      await migrateRoles(database, now);
      await migratePermissions(
        database,
        now,
      );
      await migrateUserRoles(
        database,
        now,
      );
      await migrateRolePermissions(
        database,
        now,
      );
      await applyValidators(database);
      await createIndexes(database);
    },
  };