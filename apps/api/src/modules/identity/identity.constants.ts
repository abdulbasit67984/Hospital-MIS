import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const USER_STATUS = {
  ACTIVE:
    'ACTIVE',

  INACTIVE:
    'INACTIVE',

  LOCKED:
    'LOCKED',

  SUSPENDED:
    'SUSPENDED',

  DISABLED:
    'DISABLED',
} as const;

export type UserStatus =
  (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const STAFF_EMPLOYMENT_STATUS = {
  ACTIVE:
    'ACTIVE',

  INACTIVE:
    'INACTIVE',

  ON_LEAVE:
    'ON_LEAVE',

  SUSPENDED:
    'SUSPENDED',

  TERMINATED:
    'TERMINATED',
} as const;

export type StaffEmploymentStatus =
  (typeof STAFF_EMPLOYMENT_STATUS)[keyof typeof STAFF_EMPLOYMENT_STATUS];

export const ROLE_SCOPE = {
  GLOBAL:
    'GLOBAL',

  FACILITY:
    'FACILITY',
} as const;

export type RoleScope =
  (typeof ROLE_SCOPE)[keyof typeof ROLE_SCOPE];

export const IDENTITY_PERMISSION_KEYS = {
  PERMISSIONS_READ:
    'identity.permissions.read',

  ROLES_READ:
    'identity.roles.read',

  ROLES_CREATE:
    'identity.roles.create',

  ROLES_UPDATE:
    'identity.roles.update',

  ROLES_DEACTIVATE:
    'identity.roles.deactivate',

  ROLES_ASSIGN_PERMISSIONS:
    'identity.roles.assign_permissions',

  STAFF_READ:
    'identity.staff.read',

  STAFF_CREATE:
    'identity.staff.create',

  STAFF_UPDATE:
    'identity.staff.update',

  STAFF_CHANGE_STATUS:
    'identity.staff.change_status',

  USERS_READ:
    'identity.users.read',

  USERS_CREATE:
    'identity.users.create',

  USERS_UPDATE:
    'identity.users.update',

  USERS_CHANGE_STATUS:
    'identity.users.change_status',

  USERS_ASSIGN_ROLES:
    'identity.users.assign_roles',

  USERS_RESET_PASSWORD:
    'identity.users.reset_password',

  USERS_REVOKE_SESSIONS:
    'identity.users.revoke_sessions',
} as const satisfies Record<
  string,
  PermissionKey
>;

export type IdentityPermissionKey =
  (typeof IDENTITY_PERMISSION_KEYS)[keyof typeof IDENTITY_PERMISSION_KEYS];

export const IDENTITY_AUDIT_ACTIONS = {
  ROLE_CREATED:
    'identity.role.created',

  ROLE_UPDATED:
    'identity.role.updated',

  ROLE_STATUS_CHANGED:
    'identity.role.status_changed',

  ROLE_PERMISSIONS_CHANGED:
    'identity.role.permissions_changed',

  STAFF_CREATED:
    'identity.staff.created',

  STAFF_UPDATED:
    'identity.staff.updated',

  STAFF_STATUS_CHANGED:
    'identity.staff.status_changed',

  USER_CREATED:
    'identity.user.created',

  USER_UPDATED:
    'identity.user.updated',

  USER_STATUS_CHANGED:
    'identity.user.status_changed',

  USER_ROLES_CHANGED:
    'identity.user.roles_changed',

  USER_PASSWORD_RESET:
    'identity.user.password_reset',

  USER_SESSIONS_REVOKED:
    'identity.user.sessions_revoked',
} as const;

export const IDENTITY_OUTBOX_EVENTS = {
  ROLE_CREATED:
    'identity.role.created.v1',

  ROLE_UPDATED:
    'identity.role.updated.v1',

  ROLE_PERMISSIONS_CHANGED:
    'identity.role.permissions_changed.v1',

  STAFF_CREATED:
    'identity.staff.created.v1',

  STAFF_UPDATED:
    'identity.staff.updated.v1',

  STAFF_STATUS_CHANGED:
    'identity.staff.status_changed.v1',

  USER_CREATED:
    'identity.user.created.v1',

  USER_UPDATED:
    'identity.user.updated.v1',

  USER_STATUS_CHANGED:
    'identity.user.status_changed.v1',

  USER_ROLES_CHANGED:
    'identity.user.roles_changed.v1',

  USER_PASSWORD_RESET:
    'identity.user.password_reset.v1',

  USER_SESSIONS_REVOKED:
    'identity.user.sessions_revoked.v1',
} as const;

export const IDENTITY_TRANSACTION_TYPES = {
  CREATE_ROLE:
    'IDENTITY_CREATE_ROLE',

  UPDATE_ROLE_PERMISSIONS:
    'IDENTITY_UPDATE_ROLE_PERMISSIONS',

  CREATE_STAFF_USER:
    'IDENTITY_CREATE_STAFF_USER',

  ASSIGN_USER_ROLES:
    'IDENTITY_ASSIGN_USER_ROLES',
} as const;

export const ROLE_SORT_FIELDS = [
  'code',
  'name',
  'scope',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;

export const STAFF_SORT_FIELDS = [
  'employeeNumber',
  'displayName',
  'designation',
  'employmentStatus',
  'joiningDate',
  'createdAt',
  'updatedAt',
] as const;

export const USER_SORT_FIELDS = [
  'username',
  'email',
  'status',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
] as const;

export const PERMISSION_SORT_FIELDS = [
  'module',
  'code',
  'name',
  'createdAt',
] as const;

export const DEFAULT_IDENTITY_PAGE_SIZE =
  20;

export const MAX_IDENTITY_PAGE_SIZE =
  100;