import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const FACILITY_TYPE = {
  HOSPITAL:
    'HOSPITAL',

  BRANCH:
    'BRANCH',

  CLINIC:
    'CLINIC',

  DIAGNOSTIC_CENTER:
    'DIAGNOSTIC_CENTER',

  PHARMACY:
    'PHARMACY',

  OTHER:
    'OTHER',
} as const;

export type FacilityType =
  (typeof FACILITY_TYPE)[keyof typeof FACILITY_TYPE];

export const FACILITY_STATUS = {
  ACTIVE:
    'ACTIVE',

  INACTIVE:
    'INACTIVE',
} as const;

export type FacilityStatus =
  (typeof FACILITY_STATUS)[keyof typeof FACILITY_STATUS];

export const DEPARTMENT_TYPE = {
  CLINICAL:
    'CLINICAL',

  DIAGNOSTIC:
    'DIAGNOSTIC',

  ADMINISTRATIVE:
    'ADMINISTRATIVE',

  FINANCIAL:
    'FINANCIAL',

  PHARMACY:
    'PHARMACY',

  SUPPORT:
    'SUPPORT',

  OTHER:
    'OTHER',
} as const;

export type DepartmentType =
  (typeof DEPARTMENT_TYPE)[keyof typeof DEPARTMENT_TYPE];

export const DEPARTMENT_STATUS = {
  ACTIVE:
    'ACTIVE',

  INACTIVE:
    'INACTIVE',
} as const;

export type DepartmentStatus =
  (typeof DEPARTMENT_STATUS)[keyof typeof DEPARTMENT_STATUS];

export const SETTING_SCOPE = {
  GLOBAL:
    'GLOBAL',

  FACILITY:
    'FACILITY',
} as const;

export type SettingScope =
  (typeof SETTING_SCOPE)[keyof typeof SETTING_SCOPE];

export const SETTING_CATEGORY = {
  FACILITY_IDENTITY:
    'FACILITY_IDENTITY',

  REGIONAL:
    'REGIONAL',

  LOCALIZATION:
    'LOCALIZATION',

  OPERATIONS:
    'OPERATIONS',

  NUMBERING:
    'NUMBERING',

  BILLING:
    'BILLING',

  SECURITY:
    'SECURITY',

  INTEGRATIONS:
    'INTEGRATIONS',

  NOTIFICATIONS:
    'NOTIFICATIONS',

  REPORTING:
    'REPORTING',

  OTHER:
    'OTHER',
} as const;

export type SettingCategory =
  (typeof SETTING_CATEGORY)[keyof typeof SETTING_CATEGORY];

export const SETTING_DATA_TYPE = {
  STRING:
    'STRING',

  INTEGER:
    'INTEGER',

  NUMBER:
    'NUMBER',

  DECIMAL:
    'DECIMAL',

  BOOLEAN:
    'BOOLEAN',

  DATE:
    'DATE',

  DATETIME:
    'DATETIME',

  TIMEZONE:
    'TIMEZONE',

  CURRENCY:
    'CURRENCY',

  LOCALE:
    'LOCALE',

  ENUM:
    'ENUM',

  JSON:
    'JSON',

  SECRET:
    'SECRET',
} as const;

export type SettingDataType =
  (typeof SETTING_DATA_TYPE)[keyof typeof SETTING_DATA_TYPE];

export const SETTING_CHANGE_TYPE = {
  CREATED:
    'CREATED',

  UPDATED:
    'UPDATED',

  DEACTIVATED:
    'DEACTIVATED',

  REACTIVATED:
    'REACTIVATED',

  MIGRATED:
    'MIGRATED',
} as const;

export type SettingChangeType =
  (typeof SETTING_CHANGE_TYPE)[keyof typeof SETTING_CHANGE_TYPE];

export const SETTING_CHANGE_SOURCE = {
  USER:
    'USER',

  SYSTEM:
    'SYSTEM',

  MIGRATION:
    'MIGRATION',
} as const;

export type SettingChangeSource =
  (typeof SETTING_CHANGE_SOURCE)[keyof typeof SETTING_CHANGE_SOURCE];

export const FACILITY_PERMISSION_KEYS = {
  FACILITY_READ:
    'facilities.read',

  FACILITY_CREATE:
    'facilities.create',

  FACILITY_UPDATE:
    'facilities.update',

  FACILITY_ACTIVATE:
    'facilities.activate',

  FACILITY_DEACTIVATE:
    'facilities.deactivate',

  FACILITY_MANAGE_ALL:
    'facilities.manage_all',

  DEPARTMENT_READ:
    'departments.read',

  DEPARTMENT_CREATE:
    'departments.create',

  DEPARTMENT_UPDATE:
    'departments.update',

  DEPARTMENT_ACTIVATE:
    'departments.activate',

  DEPARTMENT_DEACTIVATE:
    'departments.deactivate',

  CONFIGURATION_DEFINITIONS_READ:
    'configuration.definitions.read',

  CONFIGURATION_READ:
    'configuration.read',

  CONFIGURATION_MANAGE:
    'configuration.manage',

  CONFIGURATION_MANAGE_GLOBAL:
    'configuration.manage_global',

  CONFIGURATION_MANAGE_SENSITIVE:
    'configuration.manage_sensitive',

  CONFIGURATION_READ_HISTORY:
    'configuration.read_history',
} as const satisfies Record<
  string,
  PermissionKey
>;

export type FacilityPermissionKey =
  (typeof FACILITY_PERMISSION_KEYS)[keyof typeof FACILITY_PERMISSION_KEYS];

export const FACILITY_SORT_FIELDS = [
  'code',
  'name',
  'facilityType',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const DEPARTMENT_SORT_FIELDS = [
  'code',
  'name',
  'departmentType',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const SETTING_DEFINITION_SORT_FIELDS = [
  'key',
  'category',
  'dataType',
  'createdAt',
  'updatedAt',
] as const;

export const SYSTEM_SETTING_SORT_FIELDS = [
  'key',
  'scope',
  'revision',
  'createdAt',
  'updatedAt',
] as const;

export const MAX_FACILITY_PAGE_SIZE =
  100;

export const DEFAULT_FACILITY_PAGE_SIZE =
  20;

export const CONFIGURATION_CACHE_NAMESPACE =
  'facility-configuration';

export const CONFIGURATION_CACHE_KEYS = {
  facility(
    facilityId:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:facility:${facilityId}`;
  },

  facilityByCode(
    code:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:facility-code:${code}`;
  },

  department(
    departmentId:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:department:${departmentId}`;
  },

  facilityDepartments(
    facilityId:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:departments:${facilityId}`;
  },

  definition(
    key:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:definition:${key}`;
  },

  effectiveSetting(
    facilityId:
      string,

    key:
      string,
  ): string {
    return `${CONFIGURATION_CACHE_NAMESPACE}:effective-setting:${facilityId}:${key}`;
  },

  settingScope(
    scope:
      SettingScope,

    facilityId:
      string | null,

    key:
      string,
  ): string {
    return [
      CONFIGURATION_CACHE_NAMESPACE,
      'setting',
      scope,
      facilityId ??
        'global',
      key,
    ].join(':');
  },
} as const;