import mongoose from 'mongoose';

import {
  baseSchema,
  objectId,
} from './common.js';

export const permissionSensitivityLevels = [
  'STANDARD',
  'SENSITIVE',
  'HIGHLY_SENSITIVE',
] as const;

const roleSchema = baseSchema(
  {
    publicId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedCode: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    systemRole: {
      type: Boolean,
      required: true,
      default: false,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },

    createdBy: {
      type: objectId,
    },

    updatedBy: {
      type: objectId,
    },
  },
  {
    collection: 'roles',
  },
);

roleSchema.index(
  {
    facilityId: 1,
    publicId: 1,
  },
  {
    unique: true,
  },
);

roleSchema.index(
  {
    facilityId: 1,
    normalizedCode: 1,
  },
  {
    unique: true,
  },
);

roleSchema.index({
  facilityId: 1,
  active: 1,
  name: 1,
});

const permissionSchema = baseSchema(
  {
    publicId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    key: {
      type: String,
      required: true,
      trim: true,
    },

    module: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    sensitivity: {
      type: String,
      required: true,
      enum: permissionSensitivityLevels,
    },

    source: {
      type: String,
      required: true,
      enum: [
        'SYSTEM',
        'CUSTOM',
      ],
      default: 'SYSTEM',
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    collection: 'permissions',
  },
);

permissionSchema.index(
  {
    facilityId: 1,
    publicId: 1,
  },
  {
    unique: true,
  },
);

permissionSchema.index(
  {
    facilityId: 1,
    key: 1,
  },
  {
    unique: true,
  },
);

permissionSchema.index({
  facilityId: 1,
  module: 1,
  active: 1,
});

const userRoleSchema = baseSchema(
  {
    userId: {
      type: objectId,
      required: true,
      immutable: true,
    },

    roleId: {
      type: objectId,
      required: true,
      immutable: true,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },

    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    assignedBy: {
      type: objectId,
    },

    revokedAt: {
      type: Date,
    },

    revokedBy: {
      type: objectId,
    },

    revokeReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    collection: 'userRoles',
  },
);

userRoleSchema.index(
  {
    facilityId: 1,
    userId: 1,
    roleId: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      active: true,
    },
  },
);

userRoleSchema.index({
  facilityId: 1,
  userId: 1,
  active: 1,
});

userRoleSchema.index({
  facilityId: 1,
  roleId: 1,
  active: 1,
});

const rolePermissionSchema = baseSchema(
  {
    roleId: {
      type: objectId,
      required: true,
      immutable: true,
    },

    permissionId: {
      type: objectId,
      required: true,
      immutable: true,
    },

    permissionKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },

    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    assignedBy: {
      type: objectId,
    },

    revokedAt: {
      type: Date,
    },

    revokedBy: {
      type: objectId,
    },
  },
  {
    collection: 'rolePermissions',
  },
);

rolePermissionSchema.index(
  {
    facilityId: 1,
    roleId: 1,
    permissionKey: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      active: true,
    },
  },
);

rolePermissionSchema.index({
  facilityId: 1,
  roleId: 1,
  active: 1,
});

rolePermissionSchema.index({
  facilityId: 1,
  permissionKey: 1,
  active: 1,
});

export const accessControlSchemas = {
  roles: roleSchema,
  permissions: permissionSchema,
  userRoles: userRoleSchema,
  rolePermissions: rolePermissionSchema,
} as const;

export type AccessControlModelName =
  keyof typeof accessControlSchemas;

export function registerAccessControlModels(
  connection:
    mongoose.Connection =
      mongoose.connection,
) {
  return Object.fromEntries(
    Object.entries(
      accessControlSchemas,
    ).map(([name, schema]) => [
      name,

      connection.models[name] ??
        connection.model(
          name,
          schema,
          name,
        ),
    ]),
  );
}