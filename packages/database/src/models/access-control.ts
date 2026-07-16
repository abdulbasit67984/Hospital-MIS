import mongoose from 'mongoose';

import {
  PermissionModel,
  permissionSchema,
  permissionSensitivityValues,
} from './permission.model.js';

import {
  RolePermissionModel,
  rolePermissionSchema,
} from './role-permission.model.js';

import {
  RoleModel,
  roleSchema,
} from './role.model.js';

import {
  StaffModel,
  staffSchema,
} from './staff.model.js';

import {
  UserRoleModel,
  userRoleSchema,
} from './user-role.model.js';

export const permissionSensitivityLevels =
  permissionSensitivityValues;

export const accessControlSchemas = {
  staff:
    staffSchema,

  roles:
    roleSchema,

  permissions:
    permissionSchema,

  userRoles:
    userRoleSchema,

  rolePermissions:
    rolePermissionSchema,
} as const;

export const accessControlModels = {
  staff:
    StaffModel,

  roles:
    RoleModel,

  permissions:
    PermissionModel,

  userRoles:
    UserRoleModel,

  rolePermissions:
    RolePermissionModel,
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
    ).map(
      ([
        name,
        schema,
      ]) => [
        name,

        connection.models[
          name
        ] ??
          connection.model(
            name,
            schema,
            name,
          ),
      ],
    ),
  );
}