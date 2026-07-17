import {
  z,
} from 'zod';

import {
  DEPARTMENT_SORT_FIELDS,
  DEPARTMENT_STATUS,
  DEPARTMENT_TYPE,
  FACILITY_SORT_FIELDS,
  FACILITY_STATUS,
  FACILITY_TYPE,
  MAX_FACILITY_PAGE_SIZE,
  SETTING_CATEGORY,
  SETTING_DATA_TYPE,
  SETTING_DEFINITION_SORT_FIELDS,
  SETTING_SCOPE,
  SYSTEM_SETTING_SORT_FIELDS,
} from './facility.constants.js';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Expected a valid MongoDB ObjectId',
  );

const optionalNullableText = (
  maxLength: number,
) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .optional();

const queryBooleanSchema =
  z.preprocess(
    (rawValue) => {
      const value =
        Array.isArray(
          rawValue,
        )
          ? rawValue[0]
          : rawValue;

      if (
        value === true ||
        value === false
      ) {
        return value;
      }

      if (
        typeof value ===
        'string'
      ) {
        const normalized =
          value
            .trim()
            .toLocaleLowerCase(
              'en-US',
            );

        if (
          normalized ===
            'true' ||
          normalized ===
            '1'
        ) {
          return true;
        }

        if (
          normalized ===
            'false' ||
          normalized ===
            '0'
        ) {
          return false;
        }
      }

      return value;
    },
    z.boolean(),
  );

const nullableObjectIdQuerySchema =
  z.preprocess(
    (rawValue) => {
      const value =
        Array.isArray(
          rawValue,
        )
          ? rawValue[0]
          : rawValue;

      if (
        value === '' ||
        value === 'null'
      ) {
        return null;
      }

      return value;
    },
    z.union([
      objectIdSchema,
      z.null(),
    ]),
  );

const paginationFields = {
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(
      MAX_FACILITY_PAGE_SIZE,
    )
    .default(20),
};

const sortDirectionSchema =
  z
    .enum([
      'asc',
      'desc',
    ])
    .default('asc');

const facilityIdentifierSchema =
  z.object({
    type: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(
        /^[A-Za-z][A-Za-z0-9_]*$/,
      ),

    value: z
      .string()
      .trim()
      .min(1)
      .max(160),

    issuingAuthority:
      optionalNullableText(
        160,
      ),

    isPrimary: z
      .boolean()
      .default(false),
  });

const facilityAddressSchema =
  z.object({
    line1: z
      .string()
      .trim()
      .max(200)
      .nullable(),

    line2: z
      .string()
      .trim()
      .max(200)
      .nullable(),

    city: z
      .string()
      .trim()
      .max(120)
      .nullable(),

    district: z
      .string()
      .trim()
      .max(120)
      .nullable(),

    province: z
      .string()
      .trim()
      .max(120)
      .nullable(),

    postalCode: z
      .string()
      .trim()
      .max(30)
      .nullable(),

    countryCode: z
      .string()
      .trim()
      .length(2)
      .regex(
        /^[A-Za-z]{2}$/,
      ),
  });

const facilityContactSchema =
  z.object({
    primaryPhone: z
      .string()
      .trim()
      .max(30)
      .nullable(),

    secondaryPhone: z
      .string()
      .trim()
      .max(30)
      .nullable(),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .nullable(),

    website: z
      .string()
      .trim()
      .url()
      .max(500)
      .nullable(),

    emergencyPhone: z
      .string()
      .trim()
      .max(30)
      .nullable(),
  });

const departmentContactSchema =
  z.object({
    phone: z
      .string()
      .trim()
      .max(30)
      .nullable(),

    extension: z
      .string()
      .trim()
      .max(20)
      .nullable(),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .nullable(),
  });

const localizedLabelSchema =
  z.object({
    locale: z
      .string()
      .trim()
      .min(2)
      .max(35),

    label: z
      .string()
      .trim()
      .min(1)
      .max(160),

    description: z
      .string()
      .trim()
      .max(1000)
      .nullable(),
  });

const settingValidationRulesSchema =
  z
    .object({
      required:
        z.boolean(),

      minLength: z
        .number()
        .int()
        .min(0)
        .nullable(),

      maxLength: z
        .number()
        .int()
        .min(0)
        .nullable(),

      pattern: z
        .string()
        .max(1000)
        .nullable(),

      minimum: z
        .string()
        .trim()
        .max(100)
        .nullable(),

      maximum: z
        .string()
        .trim()
        .max(100)
        .nullable(),

      allowedValues:
        z.array(
          z.unknown(),
        ),

      jsonSchema: z
        .record(
          z.string(),
          z.unknown(),
        )
        .nullable(),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.minLength !==
            null &&
          value.maxLength !==
            null &&
          value.minLength >
            value.maxLength
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'maxLength',
            ],
            message:
              'maxLength must be greater than or equal to minLength',
          });
        }

        if (
          value.pattern !==
          null
        ) {
          try {
            new RegExp(
              value.pattern,
            );
          } catch {
            context.addIssue({
              code: 'custom',
              path: [
                'pattern',
              ],
              message:
                'pattern must be a valid regular expression',
            });
          }
        }
      },
    );

function validateFacilityIdentifiers(
  identifiers:
    readonly {
      isPrimary:
        boolean;
    }[],
  context:
    z.RefinementCtx,
): void {
  const primaryCount =
    identifiers.filter(
      (identifier) =>
        identifier.isPrimary,
    ).length;

  if (
    primaryCount > 1
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'identifiers',
      ],
      message:
        'Only one facility identifier may be primary',
    });
  }
}

function validateLocaleMembership(
  locale: string,
  supportedLocales:
    readonly string[],
  context:
    z.RefinementCtx,
): void {
  if (
    !supportedLocales.includes(
      locale,
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'supportedLocales',
      ],
      message:
        'supportedLocales must contain the primary locale',
    });
  }
}

function validateUniqueLabels(
  labels:
    readonly {
      locale:
        string;
    }[],
  context:
    z.RefinementCtx,
): void {
  const locales =
    labels.map(
      (label) =>
        label.locale,
    );

  if (
    new Set(
      locales,
    ).size !==
    locales.length
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'labels',
      ],
      message:
        'Localized labels must use unique locales',
    });
  }
}

function validateUniqueScopes(
  scopes:
    readonly string[],
  context:
    z.RefinementCtx,
): void {
  if (
    new Set(
      scopes,
    ).size !==
    scopes.length
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'allowedScopes',
      ],
      message:
        'allowedScopes cannot contain duplicate values',
    });
  }
}

const createFacilityObjectSchema =
  z.object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(
        /^[A-Za-z][A-Za-z0-9_-]*$/,
      ),

    name: z
      .string()
      .trim()
      .min(2)
      .max(200),

    legalName:
      optionalNullableText(
        240,
      ),

    facilityType: z.enum([
      FACILITY_TYPE.HOSPITAL,
      FACILITY_TYPE.BRANCH,
      FACILITY_TYPE.CLINIC,
      FACILITY_TYPE.DIAGNOSTIC_CENTER,
      FACILITY_TYPE.PHARMACY,
      FACILITY_TYPE.OTHER,
    ]),

    parentFacilityId:
      objectIdSchema
        .nullable()
        .optional(),

    identifiers: z
      .array(
        facilityIdentifierSchema,
      )
      .max(20)
      .default([]),

    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100),

    currency: z
      .string()
      .trim()
      .length(3)
      .regex(
        /^[A-Za-z]{3}$/,
      ),

    locale: z
      .string()
      .trim()
      .min(2)
      .max(35),

    supportedLocales: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(35),
      )
      .min(1)
      .max(50),

    address:
      facilityAddressSchema,

    contact:
      facilityContactSchema,

    allowsAuthentication:
      z.boolean(),
  });

export const createFacilityBodySchema =
  createFacilityObjectSchema
    .superRefine(
      (
        value,
        context,
      ) => {
        validateFacilityIdentifiers(
          value.identifiers,
          context,
        );

        validateLocaleMembership(
          value.locale,
          value.supportedLocales,
          context,
        );
      },
    );

export const updateFacilityBodySchema =
  createFacilityObjectSchema
    .omit({
      code: true,
      facilityType: true,
    })
    .partial()
    .extend({
      expectedVersion: z
        .number()
        .int()
        .min(0),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.identifiers !==
          undefined
        ) {
          validateFacilityIdentifiers(
            value.identifiers,
            context,
          );
        }

        if (
          value.locale !==
            undefined &&
          value.supportedLocales !==
            undefined
        ) {
          validateLocaleMembership(
            value.locale,
            value.supportedLocales,
            context,
          );
        }
      },
    );

const createSettingDefinitionObjectSchema =
  z.object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(
        /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/,
      ),

    category: z.enum([
      SETTING_CATEGORY.FACILITY_IDENTITY,
      SETTING_CATEGORY.REGIONAL,
      SETTING_CATEGORY.LOCALIZATION,
      SETTING_CATEGORY.OPERATIONS,
      SETTING_CATEGORY.NUMBERING,
      SETTING_CATEGORY.BILLING,
      SETTING_CATEGORY.SECURITY,
      SETTING_CATEGORY.INTEGRATIONS,
      SETTING_CATEGORY.NOTIFICATIONS,
      SETTING_CATEGORY.REPORTING,
      SETTING_CATEGORY.OTHER,
    ]),

    dataType: z.enum([
      SETTING_DATA_TYPE.STRING,
      SETTING_DATA_TYPE.INTEGER,
      SETTING_DATA_TYPE.NUMBER,
      SETTING_DATA_TYPE.DECIMAL,
      SETTING_DATA_TYPE.BOOLEAN,
      SETTING_DATA_TYPE.DATE,
      SETTING_DATA_TYPE.DATETIME,
      SETTING_DATA_TYPE.TIMEZONE,
      SETTING_DATA_TYPE.CURRENCY,
      SETTING_DATA_TYPE.LOCALE,
      SETTING_DATA_TYPE.ENUM,
      SETTING_DATA_TYPE.JSON,
      SETTING_DATA_TYPE.SECRET,
    ]),

    allowedScopes: z
      .array(
        z.enum([
          SETTING_SCOPE.GLOBAL,
          SETTING_SCOPE.FACILITY,
        ]),
      )
      .min(1)
      .max(2),

    defaultValue:
      z.unknown()
        .optional(),

    labels: z
      .array(
        localizedLabelSchema,
      )
      .min(1)
      .max(50),

    validation:
      settingValidationRulesSchema,

    isSensitive:
      z.boolean(),

    isMutable:
      z.boolean(),

    isActive:
      z.boolean(),

    cacheTtlSeconds: z
      .number()
      .int()
      .min(0)
      .max(86_400),
  });

export const createSettingDefinitionBodySchema =
  createSettingDefinitionObjectSchema
    .superRefine(
      (
        value,
        context,
      ) => {
        validateUniqueScopes(
          value.allowedScopes,
          context,
        );

        validateUniqueLabels(
          value.labels,
          context,
        );

        if (
          value.dataType ===
            SETTING_DATA_TYPE.SECRET &&
          !value.isSensitive
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'isSensitive',
            ],
            message:
              'SECRET definitions must be sensitive',
          });
        }

        if (
          value.isSensitive &&
          value.defaultValue !==
            undefined &&
          value.defaultValue !==
            null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'defaultValue',
            ],
            message:
              'Sensitive definitions cannot contain plaintext default values',
          });
        }
      },
    );

export const updateSettingDefinitionBodySchema =
  createSettingDefinitionObjectSchema
    .omit({
      key: true,
      dataType: true,
      isSensitive: true,
    })
    .partial()
    .extend({
      expectedVersion: z
        .number()
        .int()
        .min(0),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.allowedScopes !==
          undefined
        ) {
          validateUniqueScopes(
            value.allowedScopes,
            context,
          );
        }

        if (
          value.labels !==
          undefined
        ) {
          validateUniqueLabels(
            value.labels,
            context,
          );
        }
      },
    );

export const facilityIdParamsSchema =
  z.object({
    facilityId:
      objectIdSchema,
  });

export const departmentIdParamsSchema =
  z.object({
    facilityId:
      objectIdSchema,

    departmentId:
      objectIdSchema,
  });

export const settingKeyParamsSchema =
  z.object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(
        /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/,
      ),
  });

export const settingIdParamsSchema =
  z.object({
    settingId:
      objectIdSchema,
  });

export const facilityListQuerySchema =
  z.object({
    ...paginationFields,

    search: z
      .string()
      .trim()
      .max(100)
      .optional(),

    parentFacilityId:
      nullableObjectIdQuerySchema
        .optional(),

    facilityType: z
      .enum([
        FACILITY_TYPE.HOSPITAL,
        FACILITY_TYPE.BRANCH,
        FACILITY_TYPE.CLINIC,
        FACILITY_TYPE.DIAGNOSTIC_CENTER,
        FACILITY_TYPE.PHARMACY,
        FACILITY_TYPE.OTHER,
      ])
      .optional(),

    status: z
      .enum([
        FACILITY_STATUS.ACTIVE,
        FACILITY_STATUS.INACTIVE,
      ])
      .optional(),

    allowsAuthentication:
      queryBooleanSchema
        .optional(),

    sortBy: z
      .enum(
        FACILITY_SORT_FIELDS,
      )
      .default('name'),

    sortDirection:
      sortDirectionSchema,
  });

export const facilityStatusBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason: z
      .string()
      .trim()
      .min(3)
      .max(500),
  });

export const departmentListQuerySchema =
  z.object({
    ...paginationFields,

    search: z
      .string()
      .trim()
      .max(100)
      .optional(),

    parentDepartmentId:
      nullableObjectIdQuerySchema
        .optional(),

    departmentType: z
      .enum([
        DEPARTMENT_TYPE.CLINICAL,
        DEPARTMENT_TYPE.DIAGNOSTIC,
        DEPARTMENT_TYPE.ADMINISTRATIVE,
        DEPARTMENT_TYPE.FINANCIAL,
        DEPARTMENT_TYPE.PHARMACY,
        DEPARTMENT_TYPE.SUPPORT,
        DEPARTMENT_TYPE.OTHER,
      ])
      .optional(),

    status: z
      .enum([
        DEPARTMENT_STATUS.ACTIVE,
        DEPARTMENT_STATUS.INACTIVE,
      ])
      .optional(),

    isClinical:
      queryBooleanSchema
        .optional(),

    sortBy: z
      .enum(
        DEPARTMENT_SORT_FIELDS,
      )
      .default('name'),

    sortDirection:
      sortDirectionSchema,
  });

export const createDepartmentBodySchema =
  z.object({
    parentDepartmentId:
      objectIdSchema
        .nullable()
        .optional(),

    managerStaffId:
      objectIdSchema
        .nullable()
        .optional(),

    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(
        /^[A-Za-z][A-Za-z0-9_-]*$/,
      ),

    name: z
      .string()
      .trim()
      .min(2)
      .max(160),

    description:
      optionalNullableText(
        1000,
      ),

    departmentType: z.enum([
      DEPARTMENT_TYPE.CLINICAL,
      DEPARTMENT_TYPE.DIAGNOSTIC,
      DEPARTMENT_TYPE.ADMINISTRATIVE,
      DEPARTMENT_TYPE.FINANCIAL,
      DEPARTMENT_TYPE.PHARMACY,
      DEPARTMENT_TYPE.SUPPORT,
      DEPARTMENT_TYPE.OTHER,
    ]),

    isClinical:
      z.boolean(),

    location:
      optionalNullableText(
        200,
      ),

    costCenterCode:
      optionalNullableText(
        60,
      ),

    contact:
      departmentContactSchema,
  });

export const updateDepartmentBodySchema =
  createDepartmentBodySchema
    .omit({
      code: true,
    })
    .partial()
    .extend({
      expectedVersion: z
        .number()
        .int()
        .min(0),
    });

export const departmentStatusBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason: z
      .string()
      .trim()
      .min(3)
      .max(500),
  });

export const settingDefinitionListQuerySchema =
  z.object({
    ...paginationFields,

    search: z
      .string()
      .trim()
      .max(100)
      .optional(),

    category: z
      .enum([
        SETTING_CATEGORY.FACILITY_IDENTITY,
        SETTING_CATEGORY.REGIONAL,
        SETTING_CATEGORY.LOCALIZATION,
        SETTING_CATEGORY.OPERATIONS,
        SETTING_CATEGORY.NUMBERING,
        SETTING_CATEGORY.BILLING,
        SETTING_CATEGORY.SECURITY,
        SETTING_CATEGORY.INTEGRATIONS,
        SETTING_CATEGORY.NOTIFICATIONS,
        SETTING_CATEGORY.REPORTING,
        SETTING_CATEGORY.OTHER,
      ])
      .optional(),

    dataType: z
      .enum([
        SETTING_DATA_TYPE.STRING,
        SETTING_DATA_TYPE.INTEGER,
        SETTING_DATA_TYPE.NUMBER,
        SETTING_DATA_TYPE.DECIMAL,
        SETTING_DATA_TYPE.BOOLEAN,
        SETTING_DATA_TYPE.DATE,
        SETTING_DATA_TYPE.DATETIME,
        SETTING_DATA_TYPE.TIMEZONE,
        SETTING_DATA_TYPE.CURRENCY,
        SETTING_DATA_TYPE.LOCALE,
        SETTING_DATA_TYPE.ENUM,
        SETTING_DATA_TYPE.JSON,
        SETTING_DATA_TYPE.SECRET,
      ])
      .optional(),

    scope: z
      .enum([
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ])
      .optional(),

    activeOnly:
      queryBooleanSchema
        .default(true),

    sortBy: z
      .enum(
        SETTING_DEFINITION_SORT_FIELDS,
      )
      .default('key'),

    sortDirection:
      sortDirectionSchema,
  });

export const systemSettingListQuerySchema =
  z.object({
    ...paginationFields,

    facilityId:
      nullableObjectIdQuerySchema
        .optional(),

    scope: z
      .enum([
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ])
      .optional(),

    category: z
      .enum([
        SETTING_CATEGORY.FACILITY_IDENTITY,
        SETTING_CATEGORY.REGIONAL,
        SETTING_CATEGORY.LOCALIZATION,
        SETTING_CATEGORY.OPERATIONS,
        SETTING_CATEGORY.NUMBERING,
        SETTING_CATEGORY.BILLING,
        SETTING_CATEGORY.SECURITY,
        SETTING_CATEGORY.INTEGRATIONS,
        SETTING_CATEGORY.NOTIFICATIONS,
        SETTING_CATEGORY.REPORTING,
        SETTING_CATEGORY.OTHER,
      ])
      .optional(),

    search: z
      .string()
      .trim()
      .max(100)
      .optional(),

    activeOnly:
      queryBooleanSchema
        .default(true),

    sortBy: z
      .enum(
        SYSTEM_SETTING_SORT_FIELDS,
      )
      .default('key'),

    sortDirection:
      sortDirectionSchema,
  });

export const upsertSystemSettingBodySchema =
  z
    .object({
      scope: z.enum([
        SETTING_SCOPE.GLOBAL,
        SETTING_SCOPE.FACILITY,
      ]),

      facilityId:
        objectIdSchema
          .nullable(),

      value:
        z.unknown(),

      expectedVersion: z
        .number()
        .int()
        .min(0)
        .nullable(),

      expectedRevision: z
        .number()
        .int()
        .min(1)
        .nullable(),

      reason: z
        .string()
        .trim()
        .min(3)
        .max(1000),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.scope ===
            SETTING_SCOPE.GLOBAL &&
          value.facilityId !==
            null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'facilityId',
            ],
            message:
              'Global settings must not specify facilityId',
          });
        }

        if (
          value.scope ===
            SETTING_SCOPE.FACILITY &&
          value.facilityId ===
            null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'facilityId',
            ],
            message:
              'Facility settings require facilityId',
          });
        }

        const hasExpectedVersion =
          value.expectedVersion !==
          null;

        const hasExpectedRevision =
          value.expectedRevision !==
          null;

        if (
          hasExpectedVersion !==
          hasExpectedRevision
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'expectedVersion',
            ],
            message:
              'expectedVersion and expectedRevision must be supplied together',
          });
        }
      },
    );

export const settingHistoryQuerySchema =
  z.object({
    ...paginationFields,

    sortDirection: z
      .enum([
        'asc',
        'desc',
      ])
      .default('desc'),
  });

export const facilityMutationHeadersSchema =
  z
    .object({
      'idempotency-key':
        z.preprocess(
          (rawValue) =>
            Array.isArray(
              rawValue,
            )
              ? rawValue[0]
              : rawValue,
          z
            .string()
            .trim()
            .min(8)
            .max(200)
            .regex(
              /^[A-Za-z0-9._:-]+$/,
            ),
        ),
    })
    .passthrough();