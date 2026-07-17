import type {
  FacilityConfigurationConfig,
} from '@hospital-mis/config/facility-configuration';

import {
  createObjectId,
  toObjectId,
  type DatabaseObjectId,
  type Db,
} from '@hospital-mis/database';

import {
  SensitiveSettingCryptoService,
} from '../../infrastructure/sensitive-setting-crypto.service.js';

import {
  DEPARTMENT_STATUS,
  DEPARTMENT_TYPE,
  FACILITY_STATUS,
  FACILITY_TYPE,
  SETTING_CATEGORY,
  SETTING_CHANGE_SOURCE,
  SETTING_CHANGE_TYPE,
  SETTING_DATA_TYPE,
  SETTING_SCOPE,
  type DepartmentType,
  type SettingCategory,
  type SettingDataType,
  type SettingScope,
} from './facility.constants.js';

type SeedDocument =
  Record<string, unknown> & {
    _id:
      DatabaseObjectId;
  };

type FacilitySeedDocument =
  SeedDocument & {
    code:
      string;

    name:
      string;
  };

type DepartmentSeedDocument =
  SeedDocument & {
    facilityId:
      DatabaseObjectId;

    code:
      string;

    name:
      string;
  };

type DefinitionSeedDocument =
  SeedDocument & {
    key:
      string;

    category:
      SettingCategory;

    dataType:
      SettingDataType;

    allowedScopes:
      SettingScope[];

    isSensitive:
      boolean;

    isActive:
      boolean;
  };

type SystemSettingSeedDocument =
  SeedDocument & {
    definitionId:
      DatabaseObjectId;

    key:
      string;

    scope:
      SettingScope;

    facilityId:
      DatabaseObjectId | null;

    value:
      unknown;

    encryptedValue:
      unknown;

    valueHash:
      string | null;

    isSensitive:
      boolean;

    revision:
      number;

    isActive:
      boolean;

    version:
      number;
  };

interface DepartmentSeed {
  code:
    string;

  name:
    string;

  description:
    string;

  departmentType:
    DepartmentType;

  isClinical:
    boolean;

  parentCode:
    string | null;

  location:
    string | null;

  costCenterCode:
    string | null;
}

interface SettingDefinitionSeed {
  key:
    string;

  category:
    SettingCategory;

  dataType:
    SettingDataType;

  allowedScopes:
    SettingScope[];

  defaultValue:
    unknown;

  label:
    string;

  description:
    string;

  validation:
    Record<string, unknown>;

  isSensitive:
    boolean;

  isMutable:
    boolean;

  isActive:
    boolean;

  cacheTtlSeconds:
    number;
}

interface SystemSettingSeed {
  key:
    string;

  scope:
    SettingScope;

  facilityScoped:
    boolean;

  value:
    unknown;
}

export interface FacilityConfigurationSeedOptions {
  database:
    Db;

  configuration:
    FacilityConfigurationConfig;

  facilityId?:
    string;

  actorUserId?:
    string | null;

  facilityCode?:
    string;

  facilityName?:
    string;

  legalName?:
    string | null;

  keyPrefix?:
    string;

  smsApiKey?:
    string;

  now?:
    Date;
}

export interface FacilityConfigurationSeedResult {
  facility: {
    id:
      string;

    code:
      string;

    name:
      string;
  };

  departments: {
    total:
      number;

    idsByCode:
      Record<string, string>;
  };

  definitions: {
    total:
      number;

    keyPrefix:
      string;
  };

  settings: {
    total:
      number;

    created:
      number;

    updated:
      number;

    unchanged:
      number;

    sensitiveConfigured:
      boolean;
  };
}

function normalizeFacilityCode(
  value:
    string,
): string {
  const normalized =
    value
      .trim()
      .toLocaleUpperCase(
        'en-US',
      );

  if (
    !/^[A-Z][A-Z0-9_-]{1,39}$/u.test(
      normalized,
    )
  ) {
    throw new TypeError(
      'Seed facility code must contain 2 to 40 uppercase letters, numbers, underscores, or hyphens',
    );
  }

  return normalized;
}

function normalizeKeyPrefix(
  value:
    string | undefined,
): string {
  if (
    value ===
    undefined ||
    value.trim().length ===
    0
  ) {
    return '';
  }

  const normalized =
    value
      .trim()
      .toLocaleLowerCase(
        'en-US',
      )
      .replace(
        /^\.+|\.+$/gu,
        '',
      );

  if (
    !/^[a-z][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/u.test(
      normalized,
    )
  ) {
    throw new TypeError(
      'Setting key prefix must be a valid lowercase dot-delimited namespace',
    );
  }

  return `${normalized}.`;
}

function settingKey(
  prefix:
    string,

  key:
    string,
): string {
  return `${prefix}${key}`;
}

function validation(
  overrides:
    Partial<
      Record<
        | 'required'
        | 'minLength'
        | 'maxLength'
        | 'pattern'
        | 'minimum'
        | 'maximum'
        | 'allowedValues'
        | 'jsonSchema',
        unknown
      >
    > = {},
): Record<string, unknown> {
  return {
    required:
      false,

    minLength:
      null,

    maxLength:
      null,

    pattern:
      null,

    minimum:
      null,

    maximum:
      null,

    allowedValues:
      [],

    jsonSchema:
      null,

    ...overrides,
  };
}

function departmentSeeds():
  readonly DepartmentSeed[] {
  return [
    {
      code:
        'CLINICAL',

      name:
        'Clinical Services',

      description:
        'Parent department for patient-facing clinical services.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        null,

      location:
        null,

      costCenterCode:
        'CLINICAL',
    },
    {
      code:
        'OPD',

      name:
        'Outpatient Department',

      description:
        'General and specialist outpatient consultations.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        'Ground Floor',

      costCenterCode:
        'OPD',
    },
    {
      code:
        'EMERGENCY',

      name:
        'Emergency Department',

      description:
        'Emergency assessment, stabilization, and urgent care.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        'Emergency Block',

      costCenterCode:
        'ER',
    },
    {
      code:
        'MEDICINE',

      name:
        'Internal Medicine',

      description:
        'Adult medicine consultations and inpatient care.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        null,

      costCenterCode:
        'MED',
    },
    {
      code:
        'SURGERY',

      name:
        'General Surgery',

      description:
        'Surgical consultations, procedures, and inpatient care.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        null,

      costCenterCode:
        'SURG',
    },
    {
      code:
        'PEDIATRICS',

      name:
        'Pediatrics',

      description:
        'Child health outpatient and inpatient services.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        null,

      costCenterCode:
        'PEDS',
    },
    {
      code:
        'GYNECOLOGY',

      name:
        'Obstetrics and Gynecology',

      description:
        'Obstetric, maternity, and gynecological services.',

      departmentType:
        DEPARTMENT_TYPE.CLINICAL,

      isClinical:
        true,

      parentCode:
        'CLINICAL',

      location:
        null,

      costCenterCode:
        'OBGYN',
    },
    {
      code:
        'DIAGNOSTICS',

      name:
        'Diagnostic Services',

      description:
        'Parent department for laboratory and imaging services.',

      departmentType:
        DEPARTMENT_TYPE.DIAGNOSTIC,

      isClinical:
        true,

      parentCode:
        null,

      location:
        null,

      costCenterCode:
        'DIAG',
    },
    {
      code:
        'LAB',

      name:
        'Laboratory',

      description:
        'Clinical pathology, sample processing, and results.',

      departmentType:
        DEPARTMENT_TYPE.DIAGNOSTIC,

      isClinical:
        true,

      parentCode:
        'DIAGNOSTICS',

      location:
        'Diagnostic Block',

      costCenterCode:
        'LAB',
    },
    {
      code:
        'RADIOLOGY',

      name:
        'Radiology',

      description:
        'Imaging orders, procedures, reporting, and verification.',

      departmentType:
        DEPARTMENT_TYPE.DIAGNOSTIC,

      isClinical:
        true,

      parentCode:
        'DIAGNOSTICS',

      location:
        'Diagnostic Block',

      costCenterCode:
        'RAD',
    },
    {
      code:
        'PHARMACY',

      name:
        'Pharmacy',

      description:
        'Formulary, dispensing, stock control, and patient returns.',

      departmentType:
        DEPARTMENT_TYPE.PHARMACY,

      isClinical:
        false,

      parentCode:
        null,

      location:
        'Ground Floor',

      costCenterCode:
        'PHARM',
    },
    {
      code:
        'FINANCE',

      name:
        'Finance and Billing',

      description:
        'Patient billing, collections, claims, and financial reporting.',

      departmentType:
        DEPARTMENT_TYPE.FINANCIAL,

      isClinical:
        false,

      parentCode:
        null,

      location:
        'Administration Block',

      costCenterCode:
        'FIN',
    },
    {
      code:
        'ADMIN',

      name:
        'Administration',

      description:
        'Hospital administration, human resources, and governance.',

      departmentType:
        DEPARTMENT_TYPE.ADMINISTRATIVE,

      isClinical:
        false,

      parentCode:
        null,

      location:
        'Administration Block',

      costCenterCode:
        'ADMIN',
    },
  ];
}

function definitionSeeds(
  prefix:
    string,
): readonly SettingDefinitionSeed[] {
  return [
    {
      key:
        settingKey(
          prefix,
          'facility.identity.display_name',
        ),

      category:
        SETTING_CATEGORY.FACILITY_IDENTITY,

      dataType:
        SETTING_DATA_TYPE.STRING,

      allowedScopes: [
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        null,

      label:
        'Facility display name',

      description:
        'Localized operational display name used by facility-facing interfaces.',

      validation:
        validation({
          required:
            true,

          minLength:
            2,

          maxLength:
            200,
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'regional.timezone',
        ),

      category:
        SETTING_CATEGORY.REGIONAL,

      dataType:
        SETTING_DATA_TYPE.TIMEZONE,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'Asia/Karachi',

      label:
        'Timezone',

      description:
        'IANA timezone used when displaying UTC timestamps.',

      validation:
        validation({
          required:
            true,
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        600,
    },
    {
      key:
        settingKey(
          prefix,
          'regional.currency',
        ),

      category:
        SETTING_CATEGORY.REGIONAL,

      dataType:
        SETTING_DATA_TYPE.CURRENCY,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'PKR',

      label:
        'Currency',

      description:
        'ISO 4217 currency used for facility financial operations.',

      validation:
        validation({
          required:
            true,

          minLength:
            3,

          maxLength:
            3,

          pattern:
            '^[A-Z]{3}$',
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        600,
    },
    {
      key:
        settingKey(
          prefix,
          'localization.default_locale',
        ),

      category:
        SETTING_CATEGORY.LOCALIZATION,

      dataType:
        SETTING_DATA_TYPE.LOCALE,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'en-PK',

      label:
        'Default locale',

      description:
        'Default BCP 47 locale for localized user interfaces and reports.',

      validation:
        validation({
          required:
            true,
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        600,
    },
    {
      key:
        settingKey(
          prefix,
          'localization.supported_locales',
        ),

      category:
        SETTING_CATEGORY.LOCALIZATION,

      dataType:
        SETTING_DATA_TYPE.JSON,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue: [
        'en-PK',
        'ur-PK',
      ],

      label:
        'Supported locales',

      description:
        'Ordered list of locales available to users.',

      validation:
        validation({
          required:
            true,

          jsonSchema: {
            type:
              'array',

            minItems:
              1,

            uniqueItems:
              true,

            items: {
              type:
                'string',
            },
          },
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        600,
    },
    {
      key:
        settingKey(
          prefix,
          'numbering.patient_identifier_prefix',
        ),

      category:
        SETTING_CATEGORY.NUMBERING,

      dataType:
        SETTING_DATA_TYPE.STRING,

      allowedScopes: [
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'MRN',

      label:
        'Patient identifier prefix',

      description:
        'Prefix used by future patient medical-record-number sequences.',

      validation:
        validation({
          required:
            true,

          minLength:
            2,

          maxLength:
            12,

          pattern:
            '^[A-Z][A-Z0-9_-]*$',
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'numbering.visit_identifier_prefix',
        ),

      category:
        SETTING_CATEGORY.NUMBERING,

      dataType:
        SETTING_DATA_TYPE.STRING,

      allowedScopes: [
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'VISIT',

      label:
        'Visit identifier prefix',

      description:
        'Prefix used by future OPD and IPD visit-number sequences.',

      validation:
        validation({
          required:
            true,

          minLength:
            2,

          maxLength:
            12,

          pattern:
            '^[A-Z][A-Z0-9_-]*$',
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'operations.default_opd_visit_type',
        ),

      category:
        SETTING_CATEGORY.OPERATIONS,

      dataType:
        SETTING_DATA_TYPE.ENUM,

      allowedScopes: [
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'GENERAL',

      label:
        'Default OPD visit type',

      description:
        'Default visit classification used when registration does not provide one.',

      validation:
        validation({
          required:
            true,

          allowedValues: [
            'GENERAL',
            'SPECIALIST',
            'FOLLOW_UP',
          ],
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'operations.default_ipd_visit_type',
        ),

      category:
        SETTING_CATEGORY.OPERATIONS,

      dataType:
        SETTING_DATA_TYPE.ENUM,

      allowedScopes: [
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'INPATIENT',

      label:
        'Default IPD visit type',

      description:
        'Default classification for admitted inpatient episodes.',

      validation:
        validation({
          required:
            true,

          allowedValues: [
            'INPATIENT',
            'DAY_CARE',
            'OBSERVATION',
          ],
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'security.session_idle_timeout_minutes',
        ),

      category:
        SETTING_CATEGORY.SECURITY,

      dataType:
        SETTING_DATA_TYPE.INTEGER,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        30,

      label:
        'Session idle timeout',

      description:
        'Maximum permitted inactive session duration in minutes.',

      validation:
        validation({
          required:
            true,

          minimum:
            5,

          maximum:
            720,
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        120,
    },
    {
      key:
        settingKey(
          prefix,
          'notifications.sms.sender_id',
        ),

      category:
        SETTING_CATEGORY.NOTIFICATIONS,

      dataType:
        SETTING_DATA_TYPE.STRING,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        'HMIS',

      label:
        'SMS sender ID',

      description:
        'Configured sender identity for approved SMS notifications.',

      validation:
        validation({
          required:
            true,

          minLength:
            2,

          maxLength:
            20,
        }),

      isSensitive:
        false,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        300,
    },
    {
      key:
        settingKey(
          prefix,
          'integrations.sms.api_key',
        ),

      category:
        SETTING_CATEGORY.INTEGRATIONS,

      dataType:
        SETTING_DATA_TYPE.SECRET,

      allowedScopes: [
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ],

      defaultValue:
        null,

      label:
        'SMS API key',

      description:
        'Encrypted credential used by the configured SMS transport.',

      validation:
        validation({
          required:
            true,

          minLength:
            8,

          maxLength:
            500,
        }),

      isSensitive:
        true,

      isMutable:
        true,

      isActive:
        true,

      cacheTtlSeconds:
        60,
    },
  ];
}

function baseSettingSeeds(
  prefix:
    string,

  facilityName:
    string,
): readonly SystemSettingSeed[] {
  return [
    {
      key:
        settingKey(
          prefix,
          'regional.timezone',
        ),

      scope:
        SETTING_SCOPE.GLOBAL,

      facilityScoped:
        false,

      value:
        'Asia/Karachi',
    },
    {
      key:
        settingKey(
          prefix,
          'regional.currency',
        ),

      scope:
        SETTING_SCOPE.GLOBAL,

      facilityScoped:
        false,

      value:
        'PKR',
    },
    {
      key:
        settingKey(
          prefix,
          'localization.default_locale',
        ),

      scope:
        SETTING_SCOPE.GLOBAL,

      facilityScoped:
        false,

      value:
        'en-PK',
    },
    {
      key:
        settingKey(
          prefix,
          'localization.supported_locales',
        ),

      scope:
        SETTING_SCOPE.GLOBAL,

      facilityScoped:
        false,

      value: [
        'en-PK',
        'ur-PK',
      ],
    },
    {
      key:
        settingKey(
          prefix,
          'security.session_idle_timeout_minutes',
        ),

      scope:
        SETTING_SCOPE.GLOBAL,

      facilityScoped:
        false,

      value:
        30,
    },
    {
      key:
        settingKey(
          prefix,
          'facility.identity.display_name',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        facilityName,
    },
    {
      key:
        settingKey(
          prefix,
          'numbering.patient_identifier_prefix',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        'MRN',
    },
    {
      key:
        settingKey(
          prefix,
          'numbering.visit_identifier_prefix',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        'VISIT',
    },
    {
      key:
        settingKey(
          prefix,
          'operations.default_opd_visit_type',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        'GENERAL',
    },
    {
      key:
        settingKey(
          prefix,
          'operations.default_ipd_visit_type',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        'INPATIENT',
    },
    {
      key:
        settingKey(
          prefix,
          'notifications.sms.sender_id',
        ),

      scope:
        SETTING_SCOPE.FACILITY,

      facilityScoped:
        true,

      value:
        'HMIS',
    },
  ];
}

function associatedData(
  input: Readonly<{
    key:
      string;

    scope:
      SettingScope;

    facilityId:
      string | null;
  }>,
): string {
  return [
    'hospital-mis',
    'system-setting',
    input.key,
    input.scope,
    input.facilityId ??
      'global',
  ].join(':');
}

async function upsertSetting(
  input: Readonly<{
    database:
      Db;

    crypto:
      SensitiveSettingCryptoService;

    definition:
      DefinitionSeedDocument;

    seed:
      SystemSettingSeed;

    facilityId:
      DatabaseObjectId;

    actorUserId:
      DatabaseObjectId | null;

    changedAt:
      Date;

    correlationId:
      string;
  }>,
): Promise<
  | 'CREATED'
  | 'UPDATED'
  | 'UNCHANGED'
> {
  const facilityId =
    input.seed.facilityScoped
      ? input.facilityId
      : null;

  const facilityIdString =
    facilityId?.toHexString() ??
    null;

  const data =
    associatedData({
      key:
        input.seed.key,

      scope:
        input.seed.scope,

      facilityId:
        facilityIdString,
    });

  const protectedValue =
    input.definition.isSensitive
      ? input.crypto.protect(
          input.seed.value,
          data,
        )
      : null;

  const valueHash =
    protectedValue?.valueHash ??
    input.crypto.hash(
      input.seed.value,
      data,
    );

  const settings =
    input.database
      .collection<
        SystemSettingSeedDocument
      >(
        'systemSettings',
      );

  const existing =
    await settings.findOne({
      key:
        input.seed.key,

      scope:
        input.seed.scope,

      facilityId,
    });

  if (
    existing !==
      null &&
    existing.valueHash ===
      valueHash &&
    existing.isActive
  ) {
    return 'UNCHANGED';
  }

  const value =
    input.definition.isSensitive
      ? null
      : input.seed.value;

  const encryptedValue =
    protectedValue
      ?.encryptedValue ??
    null;

  let persisted:
    SystemSettingSeedDocument;

  let changeType:
    | typeof SETTING_CHANGE_TYPE.CREATED
    | typeof SETTING_CHANGE_TYPE.UPDATED
    | typeof SETTING_CHANGE_TYPE.REACTIVATED;

  if (
    existing ===
    null
  ) {
    persisted = {
      _id:
        createObjectId(),

      definitionId:
        input.definition._id,

      key:
        input.seed.key,

      scope:
        input.seed.scope,

      facilityId,

      value,
      encryptedValue,
      valueHash,

      isSensitive:
        input.definition.isSensitive,

      revision:
        1,

      isActive:
        true,

      schemaVersion:
        1,

      version:
        0,

      createdBy:
        input.actorUserId,

      updatedBy:
        input.actorUserId,

      createdAt:
        input.changedAt,

      updatedAt:
        input.changedAt,
    };

    await settings.insertOne(
      persisted,
    );

    changeType =
      SETTING_CHANGE_TYPE.CREATED;
  } else {
    const nextRevision =
      existing.revision +
      1;

    const updated =
      await settings.findOneAndUpdate(
        {
          _id:
            existing._id,

          version:
            existing.version,

          revision:
            existing.revision,
        },
        {
          $set: {
            value,
            encryptedValue,
            valueHash,

            isSensitive:
              input.definition
                .isSensitive,

            isActive:
              true,

            revision:
              nextRevision,

            updatedBy:
              input.actorUserId,

            updatedAt:
              input.changedAt,
          },

          $inc: {
            version:
              1,
          },
        },
        {
          returnDocument:
            'after',
        },
      );

    if (
      updated ===
      null
    ) {
      throw new Error(
        `Concurrent setting seed update detected for ${input.seed.key}`,
      );
    }

    persisted =
      updated;

    changeType =
      existing.isActive
        ? SETTING_CHANGE_TYPE.UPDATED
        : SETTING_CHANGE_TYPE.REACTIVATED;
  }

  await input.database
    .collection(
      'systemSettingVersions',
    )
    .updateOne(
      {
        settingId:
          persisted._id,

        revision:
          persisted.revision,
      },
      {
        $setOnInsert: {
          _id:
            createObjectId(),

          settingId:
            persisted._id,

          definitionId:
            input.definition._id,

          key:
            persisted.key,

          scope:
            persisted.scope,

          facilityId:
            persisted.facilityId,

          revision:
            persisted.revision,

          changeType,

          changeSource:
            SETTING_CHANGE_SOURCE.SYSTEM,

          value:
            persisted.value,

          encryptedValue:
            persisted.encryptedValue,

          valueHash:
            persisted.valueHash,

          isSensitive:
            persisted.isSensitive,

          isActive:
            persisted.isActive,

          changedBy:
            input.actorUserId,

          changeReason:
            'Baseline facility and configuration seed',

          correlationId:
            input.correlationId,

          changedAt:
            input.changedAt,

          schemaVersion:
            1,

          createdAt:
            input.changedAt,
        },
      },
      {
        upsert:
          true,
      },
    );

  return existing ===
    null
    ? 'CREATED'
    : 'UPDATED';
}

export async function seedFacilityConfiguration(
  options:
    FacilityConfigurationSeedOptions,
): Promise<FacilityConfigurationSeedResult> {
  const now =
    options.now ??
    new Date();

  const actorUserId =
    options.actorUserId ===
      undefined ||
    options.actorUserId ===
      null
      ? null
      : toObjectId(
          options.actorUserId,
          'actorUserId',
        );

  const requestedFacilityId =
    options.facilityId ===
      undefined
      ? createObjectId()
      : toObjectId(
          options.facilityId,
          'facilityId',
        );

  const facilityCode =
    normalizeFacilityCode(
      options.facilityCode ??
        'MAIN',
    );

  const facilityName =
    options.facilityName
      ?.trim() ??
    'Main Hospital';

  const legalName =
    options.legalName ===
      undefined
      ? 'Main Hospital Limited'
      : options.legalName;

  const keyPrefix =
    normalizeKeyPrefix(
      options.keyPrefix,
    );

  const facilities =
    options.database
      .collection<
        FacilitySeedDocument
      >(
        'facilities',
      );

  const facility =
    await facilities
      .findOneAndUpdate(
        {
          code:
            facilityCode,
        },
        {
          $set: {
            name:
              facilityName,

            legalName,

            facilityType:
              FACILITY_TYPE.HOSPITAL,

            parentFacilityId:
              null,

            identifiers: [
              {
                type:
                  'INTERNAL_CODE',

                value:
                  facilityCode,

                normalizedValue:
                  facilityCode,

                issuingAuthority:
                  'Hospital MIS',

                isPrimary:
                  true,
              },
            ],

            timezone:
              'Asia/Karachi',

            currency:
              'PKR',

            locale:
              'en-PK',

            supportedLocales: [
              'en-PK',
              'ur-PK',
            ],

            address: {
              line1:
                null,

              line2:
                null,

              city:
                'Lahore',

              district:
                'Lahore',

              province:
                'Punjab',

              postalCode:
                null,

              countryCode:
                'PK',
            },

            contact: {
              primaryPhone:
                null,

              secondaryPhone:
                null,

              email:
                null,

              website:
                null,

              emergencyPhone:
                null,
            },

            updatedBy:
              actorUserId,

            updatedAt:
              now,
          },

          $setOnInsert: {
            _id:
              requestedFacilityId,

            status:
              FACILITY_STATUS.ACTIVE,

            allowsAuthentication:
              true,

            deactivatedAt:
              null,

            deactivatedBy:
              null,

            deactivationReason:
              null,

            schemaVersion:
              1,

            version:
              0,

            createdBy:
              actorUserId,

            createdAt:
              now,
          },
        },
        {
          upsert:
            true,

          returnDocument:
            'after',
        },
      );

  if (
    facility ===
    null
  ) {
    throw new Error(
      'Facility seed could not create or load the primary facility',
    );
  }

  const departments =
    options.database
      .collection<
        DepartmentSeedDocument
      >(
        'departments',
      );

  const idsByCode =
    new Map<
      string,
      DatabaseObjectId
    >();

  for (
    const seed of
    departmentSeeds()
  ) {
    if (
      seed.parentCode !==
      null &&
      !idsByCode.has(
        seed.parentCode,
      )
    ) {
      throw new Error(
        `Department seed parent ${seed.parentCode} must appear before ${seed.code}`,
      );
    }

    const parentDepartmentId =
      seed.parentCode ===
      null
        ? null
        : idsByCode.get(
            seed.parentCode,
          )!;

    const department =
      await departments
        .findOneAndUpdate(
          {
            facilityId:
              facility._id,

            code:
              seed.code,
          },
          {
            $set: {
              parentDepartmentId,

              managerStaffId:
                null,

              name:
                seed.name,

              description:
                seed.description,

              departmentType:
                seed.departmentType,

              isClinical:
                seed.isClinical,

              location:
                seed.location,

              costCenterCode:
                seed.costCenterCode,

              contact: {
                phone:
                  null,

                extension:
                  null,

                email:
                  null,
              },

              updatedBy:
                actorUserId,

              updatedAt:
                now,
            },

            $setOnInsert: {
              _id:
                createObjectId(),

              facilityId:
                facility._id,

              code:
                seed.code,

              status:
                DEPARTMENT_STATUS.ACTIVE,

              deactivatedAt:
                null,

              deactivatedBy:
                null,

              deactivationReason:
                null,

              schemaVersion:
                1,

              version:
                0,

              createdBy:
                actorUserId,

              createdAt:
                now,
            },
          },
          {
            upsert:
              true,

            returnDocument:
              'after',
          },
        );

    if (
      department ===
      null
    ) {
      throw new Error(
        `Department seed could not create ${seed.code}`,
      );
    }

    idsByCode.set(
      seed.code,
      department._id,
    );
  }

  const definitions =
    options.database
      .collection<
        DefinitionSeedDocument
      >(
        'settingDefinitions',
      );

  const definitionsByKey =
    new Map<
      string,
      DefinitionSeedDocument
    >();

  const configuredDefinitions =
    definitionSeeds(
      keyPrefix,
    );

  for (
    const seed of
    configuredDefinitions
  ) {
    const definition =
      await definitions
        .findOneAndUpdate(
          {
            key:
              seed.key,
          },
          {
            $set: {
              category:
                seed.category,

              allowedScopes:
                seed.allowedScopes,

              defaultValue:
                seed.isSensitive
                  ? null
                  : seed.defaultValue,

              labels: [
                {
                  locale:
                    'en-PK',

                  label:
                    seed.label,

                  description:
                    seed.description,
                },
              ],

              validation:
                seed.validation,

              isMutable:
                seed.isMutable,

              isActive:
                seed.isActive,

              cacheTtlSeconds:
                seed.cacheTtlSeconds,

              updatedBy:
                actorUserId,

              updatedAt:
                now,
            },

            $setOnInsert: {
              _id:
                createObjectId(),

              key:
                seed.key,

              dataType:
                seed.dataType,

              isSensitive:
                seed.isSensitive,

              schemaVersion:
                1,

              version:
                0,

              createdBy:
                actorUserId,

              createdAt:
                now,
            },
          },
          {
            upsert:
              true,

            returnDocument:
              'after',
          },
        );

    if (
      definition ===
      null
    ) {
      throw new Error(
        `Setting definition seed could not create ${seed.key}`,
      );
    }

    if (
      definition.dataType !==
        seed.dataType ||
      definition.isSensitive !==
        seed.isSensitive
    ) {
      throw new Error(
        `Immutable definition fields do not match the baseline for ${seed.key}`,
      );
    }

    definitionsByKey.set(
      seed.key,
      definition,
    );
  }

  const crypto =
    new SensitiveSettingCryptoService({
      activeKeyVersion:
        options.configuration
          .activeEncryptionKeyVersion,

      keys:
        options.configuration
          .encryptionKeys,

      hashSecret:
        options.configuration
          .hashSecret,
    });

  const settings = [
    ...baseSettingSeeds(
      keyPrefix,
      facilityName,
    ),

    ...(
      options.smsApiKey ===
      undefined
        ? []
        : [
            {
              key:
                settingKey(
                  keyPrefix,
                  'integrations.sms.api_key',
                ),

              scope:
                SETTING_SCOPE.FACILITY,

              facilityScoped:
                true,

              value:
                options.smsApiKey,
            } satisfies SystemSettingSeed,
          ]
    ),
  ];

  const correlationId = [
    'facility-configuration-seed',
    keyPrefix.length ===
      0
      ? facilityCode.toLocaleLowerCase(
          'en-US',
        )
      : keyPrefix.replace(
          /\.$/u,
          '',
        ),
  ].join(':');

  let created =
    0;

  let updated =
    0;

  let unchanged =
    0;

  for (
    const seed of
    settings
  ) {
    const definition =
      definitionsByKey.get(
        seed.key,
      );

    if (
      definition ===
      undefined
    ) {
      throw new Error(
        `Setting seed references missing definition ${seed.key}`,
      );
    }

    const result =
      await upsertSetting({
        database:
          options.database,

        crypto,
        definition,
        seed,

        facilityId:
          facility._id,

        actorUserId,

        changedAt:
          now,

        correlationId,
      });

    if (
      result ===
      'CREATED'
    ) {
      created += 1;
    } else if (
      result ===
      'UPDATED'
    ) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return {
    facility: {
      id:
        facility._id.toHexString(),

      code:
        facility.code,

      name:
        facility.name,
    },

    departments: {
      total:
        idsByCode.size,

      idsByCode:
        Object.fromEntries(
          [
            ...idsByCode.entries(),
          ].map(
            (
              [
                code,
                id,
              ],
            ) => [
              code,
              id.toHexString(),
            ],
          ),
        ),
    },

    definitions: {
      total:
        configuredDefinitions.length,

      keyPrefix,
    },

    settings: {
      total:
        settings.length,

      created,
      updated,
      unchanged,

      sensitiveConfigured:
        options.smsApiKey !==
        undefined,
    },
  };
}