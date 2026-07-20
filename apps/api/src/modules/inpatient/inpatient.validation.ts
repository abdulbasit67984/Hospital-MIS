import {
  z,
} from 'zod';

import {
  admissionPriorityValues,
  admissionStatusValues,
  admissionTypeValues,
  bedBillingUnitValues,
  bedCategoryValues,
  bedRateScopeValues,
  inpatientBedStatusValues,
  inpatientCatalogStatusValues,
  isolationCapabilityValues,
  partialDayPolicyValues,
  patientSexRestrictionValues,
  roomClassValues,
  roomTypeValues,
  sameDayDischargePolicyValues,
  transferChargingPolicyValues,
  wardTypeValues,
} from '@hospital-mis/database';

import {
  DEFAULT_INPATIENT_PAGE_SIZE,
  INPATIENT_ADMISSION_SORT_FIELDS,
  INPATIENT_LOCATION_SORT_FIELDS,
  MAX_INPATIENT_PAGE_SIZE,
} from './inpatient.constants.js';

export const inpatientObjectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

export const inpatientExpectedVersionSchema =
  z
    .number()
    .int()
    .min(0);

export const inpatientReasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(5_000);

export const inpatientIsoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

export const inpatientMoneyStringSchema =
  z
    .string()
    .trim()
    .regex(
      /^\d{1,16}(?:\.\d{1,4})?$/u,
      'Expected a non-negative decimal amount with no more than four decimal places',
    );

const idempotencyKeySchema =
  z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(
      /^[A-Za-z0-9._:/-]+$/u,
      'Idempotency key contains unsupported characters',
    );

export const inpatientMutationHeadersSchema =
  z
    .object({
      'idempotency-key':
        idempotencyKeySchema,

      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const inpatientReadHeadersSchema =
  z
    .object({
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const inpatientEntityParamsSchema =
  z
    .object({
      wardId:
        inpatientObjectIdSchema.optional(),

      roomId:
        inpatientObjectIdSchema.optional(),

      bedId:
        inpatientObjectIdSchema.optional(),

      bedRateId:
        inpatientObjectIdSchema.optional(),

      recommendationId:
        inpatientObjectIdSchema.optional(),

      admissionId:
        inpatientObjectIdSchema.optional(),

      patientId:
        inpatientObjectIdSchema.optional(),

      encounterId:
        inpatientObjectIdSchema.optional(),
    })
    .strict();

const nullableText = (
  minimumLength:
    number,

  maximumLength:
    number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .nullable()
    .optional();

const queryBooleanSchema =
  z.preprocess(
    (value) => {
      if (
        value === true ||
        value === 'true' ||
        value === '1'
      ) {
        return true;
      }

      if (
        value === false ||
        value === 'false' ||
        value === '0'
      ) {
        return false;
      }

      return value;
    },

    z.boolean(),
  );

const pageSchema =
  z
    .coerce
    .number()
    .int()
    .min(1)
    .default(1);

const pageSizeSchema =
  z
    .coerce
    .number()
    .int()
    .min(1)
    .max(
      MAX_INPATIENT_PAGE_SIZE,
    )
    .default(
      DEFAULT_INPATIENT_PAGE_SIZE,
    );

const codeSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(100);

const specialtyCodesSchema =
  z
    .array(codeSchema)
    .max(100)
    .default([])
    .superRefine(
      (
        values,
        context,
      ) => {
        const normalized =
          values.map(
            (value) =>
              value
                .trim()
                .toUpperCase(),
          );

        if (
          new Set(normalized).size !==
          normalized.length
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Specialty codes must be unique',
          });
        }
      },
    );

const infectionControlTagsSchema =
  z
    .array(codeSchema)
    .max(100)
    .default([])
    .superRefine(
      (
        values,
        context,
      ) => {
        const normalized =
          values.map(
            (value) =>
              value
                .trim()
                .toUpperCase(),
          );

        if (
          new Set(normalized).size !==
          normalized.length
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Infection-control tags must be unique',
          });
        }
      },
    );

const locationRestrictionFields = {
  permittedSexes:
    z
      .array(
        z.enum(
          patientSexRestrictionValues,
        ),
      )
      .min(1)
      .max(
        patientSexRestrictionValues.length,
      ),

  minimumAgeYears:
    z
      .number()
      .int()
      .min(0)
      .max(150)
      .nullable()
      .optional(),

  maximumAgeYears:
    z
      .number()
      .int()
      .min(0)
      .max(150)
      .nullable()
      .optional(),

  specialtyCodes:
    specialtyCodesSchema.optional(),

  isolationCapabilities:
    z
      .array(
        z.enum(
          isolationCapabilityValues,
        ),
      )
      .min(1)
      .max(
        isolationCapabilityValues.length,
      )
      .optional(),

  infectionControlTags:
    infectionControlTagsSchema.optional(),

  negativePressureCapable:
    z.boolean().optional(),

  cohortingAllowed:
    z.boolean().optional(),
} as const;

const optionalLocationRestrictionFields = {
  permittedSexes:
    locationRestrictionFields
      .permittedSexes
      .optional(),

  minimumAgeYears:
    locationRestrictionFields
      .minimumAgeYears
      .optional(),

  maximumAgeYears:
    locationRestrictionFields
      .maximumAgeYears
      .optional(),

  specialtyCodes:
    locationRestrictionFields
      .specialtyCodes
      .optional(),

  isolationCapabilities:
    locationRestrictionFields
      .isolationCapabilities
      .optional(),

  infectionControlTags:
    locationRestrictionFields
      .infectionControlTags
      .optional(),

  negativePressureCapable:
    locationRestrictionFields
      .negativePressureCapable
      .optional(),

  cohortingAllowed:
    locationRestrictionFields
      .cohortingAllowed
      .optional(),
} as const;

function refineLocationRestrictions(
  value: {
    permittedSexes?:
      readonly string[];

    minimumAgeYears?:
      number | null;

    maximumAgeYears?:
      number | null;

    isolationCapabilities?:
      readonly string[];

    negativePressureCapable?:
      boolean;
  },

  context:
    z.RefinementCtx,
): void {
  if (
    value.minimumAgeYears != null &&
    value.maximumAgeYears != null &&
    value.minimumAgeYears >
      value.maximumAgeYears
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['maximumAgeYears'],

      message:
        'Maximum age cannot be lower than minimum age',
    });
  }

  if (
    value.permittedSexes !==
      undefined &&
    new Set(
      value.permittedSexes,
    ).size !==
      value.permittedSexes.length
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['permittedSexes'],

      message:
        'Permitted sexes must be unique',
    });
  }

  if (
    value.isolationCapabilities !==
      undefined &&
    new Set(
      value.isolationCapabilities,
    ).size !==
      value
        .isolationCapabilities
        .length
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['isolationCapabilities'],

      message:
        'Isolation capabilities must be unique',
    });
  }

  if (
    value
      .negativePressureCapable ===
      true &&
    !value
      .isolationCapabilities
      ?.includes(
        'NEGATIVE_PRESSURE',
      )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['isolationCapabilities'],

      message:
        'Negative-pressure locations must include NEGATIVE_PRESSURE capability',
    });
  }
}

export const createWardBodySchema =
  z
    .object({
      wardCode:
        codeSchema
          .min(2)
          .max(80),

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(300),

      wardType:
        z.enum(
          wardTypeValues,
        ),

      departmentId:
        inpatientObjectIdSchema,

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      nursingStationCode:
        nullableText(
          1,
          80,
        ),

      description:
        nullableText(
          2,
          5_000,
        ),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .default(0),

      ...locationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const updateWardBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(300)
          .optional(),

      wardType:
        z
          .enum(
            wardTypeValues,
          )
          .optional(),

      departmentId:
        inpatientObjectIdSchema
          .optional(),

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      nursingStationCode:
        nullableText(
          1,
          80,
        ),

      description:
        nullableText(
          2,
          5_000,
        ),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .optional(),

      ...optionalLocationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const createRoomBodySchema =
  z
    .object({
      wardId:
        inpatientObjectIdSchema,

      departmentId:
        inpatientObjectIdSchema,

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      roomCode:
        codeSchema.max(80),

      roomNumber:
        codeSchema.max(80),

      name:
        z
          .string()
          .trim()
          .min(1)
          .max(300),

      roomType:
        z.enum(
          roomTypeValues,
        ),

      roomClass:
        z.enum(
          roomClassValues,
        ),

      capacity:
        z
          .number()
          .int()
          .min(1)
          .max(500),

      floorCode:
        nullableText(
          1,
          80,
        ),

      description:
        nullableText(
          2,
          5_000,
        ),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .default(0),

      ...locationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const updateRoomBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      departmentId:
        inpatientObjectIdSchema
          .optional(),

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      roomNumber:
        codeSchema
          .max(80)
          .optional(),

      name:
        z
          .string()
          .trim()
          .min(1)
          .max(300)
          .optional(),

      roomType:
        z
          .enum(
            roomTypeValues,
          )
          .optional(),

      roomClass:
        z
          .enum(
            roomClassValues,
          )
          .optional(),

      capacity:
        z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional(),

      floorCode:
        nullableText(
          1,
          80,
        ),

      description:
        nullableText(
          2,
          5_000,
        ),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .optional(),

      ...optionalLocationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const createBedBodySchema =
  z
    .object({
      wardId:
        inpatientObjectIdSchema,

      roomId:
        inpatientObjectIdSchema,

      departmentId:
        inpatientObjectIdSchema,

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      bedCode:
        codeSchema.max(100),

      bedNumber:
        codeSchema.max(80),

      label:
        z
          .string()
          .trim()
          .min(1)
          .max(300),

      bedCategory:
        z.enum(
          bedCategoryValues,
        ),

      turnaroundRequiredAfterRelease:
        z
          .boolean()
          .default(true),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .default(0),

      ...locationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const updateBedBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      departmentId:
        inpatientObjectIdSchema
          .optional(),

      servicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      bedNumber:
        codeSchema
          .max(80)
          .optional(),

      label:
        z
          .string()
          .trim()
          .min(1)
          .max(300)
          .optional(),

      bedCategory:
        z
          .enum(
            bedCategoryValues,
          )
          .optional(),

      turnaroundRequiredAfterRelease:
        z
          .boolean()
          .optional(),

      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .optional(),

      ...optionalLocationRestrictionFields,
    })
    .strict()
    .superRefine(
      refineLocationRestrictions,
    );

export const changeInpatientCatalogStatusBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      status:
        z.enum(
          inpatientCatalogStatusValues,
        ),

      reason:
        inpatientReasonSchema,
    })
    .strict();

export const changeBedOperationalStatusBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      status:
        z.enum(
          inpatientBedStatusValues,
        ),

      reasonCode:
        codeSchema,

      reason:
        nullableText(
          3,
          5_000,
        ),

      maintenanceReference:
        nullableText(
          1,
          200,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.status ===
            'MAINTENANCE' &&
          value
            .maintenanceReference ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'maintenanceReference',
              ],

            message:
              'Maintenance status requires a maintenance reference',
          });
        }

        if (
          value.status !==
            'MAINTENANCE' &&
          value
            .maintenanceReference !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'maintenanceReference',
              ],

            message:
              'Only maintenance status may define a maintenance reference',
          });
        }
      },
    );

export const bedChargingPolicySchema =
  z
    .object({
      policyCode:
        codeSchema,

      billingUnit:
        z.enum(
          bedBillingUnitValues,
        ),

      partialDayPolicy:
        z.enum(
          partialDayPolicyValues,
        ),

      sameDayDischargePolicy:
        z.enum(
          sameDayDischargePolicyValues,
        ),

      transferChargingPolicy:
        z.enum(
          transferChargingPolicyValues,
        ),

      roundingIncrementMinutes:
        z
          .number()
          .int()
          .min(1)
          .max(1_440)
          .nullable()
          .optional(),

      minimumChargeMinutes:
        z
          .number()
          .int()
          .min(0)
          .max(525_600)
          .default(0),

      dayBoundaryTimezone:
        z
          .string()
          .trim()
          .min(3)
          .max(100)
          .default(
            'Asia/Karachi',
          ),

      dayBoundaryHour:
        z
          .number()
          .int()
          .min(0)
          .max(23)
          .default(0),

      gracePeriodMinutes:
        z
          .number()
          .int()
          .min(0)
          .max(1_440)
          .default(0),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.partialDayPolicy ===
            'ROUND_TO_INCREMENT' &&
          value
            .roundingIncrementMinutes ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'roundingIncrementMinutes',
              ],

            message:
              'ROUND_TO_INCREMENT requires a rounding increment',
          });
        }

        if (
          value.partialDayPolicy !==
            'ROUND_TO_INCREMENT' &&
          value
            .roundingIncrementMinutes !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'roundingIncrementMinutes',
              ],

            message:
              'Only ROUND_TO_INCREMENT may define a rounding increment',
          });
        }
      },
    );

function refineEffectivePeriod(
  value: {
    effectiveFrom:
      string;

    effectiveThrough?:
      string | null;
  },

  context:
    z.RefinementCtx,
): void {
  if (
    value.effectiveThrough != null &&
    new Date(
      value.effectiveThrough,
    ) <=
      new Date(
        value.effectiveFrom,
      )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['effectiveThrough'],

      message:
        'Effective-through time must follow effective-from time',
    });
  }
}

export const createBedRateBodySchema =
  z
    .object({
      rateCode:
        codeSchema,

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(300),

      scope:
        z.enum(
          bedRateScopeValues,
        ),

      scopeReferenceId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      scopeCode:
        nullableText(
          1,
          100,
        ),

      currencyCode:
        z
          .string()
          .trim()
          .length(3)
          .default('PKR'),

      amount:
        inpatientMoneyStringSchema,

      chargingPolicy:
        bedChargingPolicySchema,

      chargeCatalogItemId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      priceListId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      payerOrganizationId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      panelPlanId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      treatmentPackageId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      effectiveFrom:
        inpatientIsoDateTimeSchema,

      effectiveThrough:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const objectScoped =
          [
            'WARD',
            'ROOM',
            'BED',
          ].includes(
            value.scope,
          );

        if (
          objectScoped &&
          value.scopeReferenceId ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'scopeReferenceId',
              ],

            message:
              'Ward, room, and bed rates require a scope reference',
          });
        }

        if (
          value.scope ===
            'BED_CATEGORY' &&
          value.scopeCode == null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['scopeCode'],

            message:
              'Bed-category rates require a scope code',
          });
        }

        if (
          value.scope !==
            'BED_CATEGORY' &&
          value.scopeCode != null
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['scopeCode'],

            message:
              'Only bed-category rates may define a scope code',
          });
        }

        refineEffectivePeriod(
          value,
          context,
        );
      },
    );

export const activateBedRateBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      reason:
        nullableText(
          5,
          2_000,
        ),
    })
    .strict();

export const supersedeBedRateBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      replacement:
        createBedRateBodySchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();

const diagnosisSnapshotSchema =
  z
    .object({
      diagnosisId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      diagnosisCode:
        codeSchema,

      diagnosisSystem:
        codeSchema.max(80),

      diagnosisDisplay:
        z
          .string()
          .trim()
          .min(1)
          .max(1_000),

      primary:
        z
          .boolean()
          .default(false),
    })
    .strict();

export const createAdmissionRecommendationBodySchema =
  z
    .object({
      encounterId:
        inpatientObjectIdSchema,

      orderingProviderStaffId:
        inpatientObjectIdSchema,

      admissionType:
        z.enum(
          admissionTypeValues,
        ),

      priority:
        z
          .enum(
            admissionPriorityValues,
          )
          .default('ROUTINE'),

      requestedWardTypes:
        z
          .array(
            z.enum(
              wardTypeValues,
            ),
          )
          .max(
            wardTypeValues.length,
          )
          .default([]),

      requestedSpecialtyCodes:
        specialtyCodesSchema,

      requestedIsolationCapabilities:
        z
          .array(
            z.enum(
              isolationCapabilityValues,
            ),
          )
          .max(
            isolationCapabilityValues.length,
          )
          .default([]),

      clinicalIndication:
        z
          .string()
          .trim()
          .min(3)
          .max(50_000),

      diagnosisSnapshots:
        z
          .array(
            diagnosisSnapshotSchema,
          )
          .max(100)
          .default([]),

      expectedLengthOfStayDays:
        z
          .number()
          .int()
          .min(0)
          .max(10_000)
          .nullable()
          .optional(),

      requestedAdmissionAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      expiresAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      patientCoverageId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      preauthorizationId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      treatmentPackageId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      attachmentIds:
        z
          .array(
            inpatientObjectIdSchema,
          )
          .max(100)
          .default([]),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value
            .diagnosisSnapshots
            .filter(
              (diagnosis) =>
                diagnosis.primary,
            )
            .length > 1
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'diagnosisSnapshots',
              ],

            message:
              'Only one diagnosis snapshot may be marked primary',
          });
        }

        if (
          new Set(
            value.requestedWardTypes,
          ).size !==
            value
              .requestedWardTypes
              .length
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'requestedWardTypes',
              ],

            message:
              'Requested ward types must be unique',
          });
        }

        if (
          new Set(
            value
              .requestedIsolationCapabilities,
          ).size !==
            value
              .requestedIsolationCapabilities
              .length
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              [
                'requestedIsolationCapabilities',
              ],

            message:
              'Requested isolation capabilities must be unique',
          });
        }

        if (
          value
            .requestedAdmissionAt !=
            null &&
          value.expiresAt != null &&
          new Date(
            value.expiresAt,
          ) <=
            new Date(
              value
                .requestedAdmissionAt,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['expiresAt'],

            message:
              'Recommendation expiry must follow the requested admission time',
          });
        }
      },
    );

export const acceptAdmissionRecommendationBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,
    })
    .strict();

export const rejectAdmissionRecommendationBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();

export const cancelAdmissionRecommendationBodySchema =
  rejectAdmissionRecommendationBodySchema;

const admissionContactSnapshotSchema =
  z
    .object({
      sourceId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      relationshipCode:
        codeSchema.max(80),

      displayName:
        z
          .string()
          .trim()
          .min(1)
          .max(300),

      primaryPhoneMasked:
        z
          .string()
          .trim()
          .min(3)
          .max(100),

      alternatePhoneMasked:
        nullableText(
          3,
          100,
        ),
    })
    .strict();

const careTeamMemberSchema =
  z
    .object({
      userId:
        inpatientObjectIdSchema,

      staffId:
        inpatientObjectIdSchema,

      roleCode:
        codeSchema.max(80),

      isPrimary:
        z
          .boolean()
          .default(false),
    })
    .strict();

export const createAdmissionBodySchema =
  z
    .object({
      admissionRecommendationId:
        inpatientObjectIdSchema,

      admittingDepartmentId:
        inpatientObjectIdSchema,

      admittingServicePointId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      attendingConsultantUserId:
        inpatientObjectIdSchema,

      attendingConsultantStaffId:
        inpatientObjectIdSchema,

      careTeam:
        z
          .array(
            careTeamMemberSchema,
          )
          .max(100)
          .default([]),

      guardianSnapshot:
        admissionContactSnapshotSchema
          .nullable()
          .optional(),

      emergencyContactSnapshot:
        admissionContactSnapshotSchema
          .nullable()
          .optional(),

      payerOrganizationId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      panelProgramId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      panelPlanId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      patientCoverageId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      preauthorizationId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      treatmentPackageId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      depositRequirementReference:
        nullableText(
          1,
          200,
        ),

      authorizationRequirementReference:
        nullableText(
          1,
          200,
        ),

      billingAccountReference:
        nullableText(
          1,
          200,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const activeKeys =
          value.careTeam.map(
            (member) =>
              `${member.staffId}:${member.roleCode
                .trim()
                .toUpperCase()}`,
          );

        if (
          new Set(
            activeKeys,
          ).size !==
            activeKeys.length
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['careTeam'],

            message:
              'Care-team staff-role assignments must be unique',
          });
        }

        const primaryConsultants =
          value.careTeam.filter(
            (member) =>
              member.isPrimary &&
              member.roleCode
                .trim()
                .toUpperCase() ===
                'ATTENDING_CONSULTANT',
          );

        if (
          primaryConsultants.length >
          1
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['careTeam'],

            message:
              'Only one care-team member may be the primary attending consultant',
          });
        }
      },
    );

export const acceptAdmissionBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,
    })
    .strict();

export const cancelAdmissionBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,
    })
    .strict();

export const inpatientLocationListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      search:
        z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional(),

      wardId:
        inpatientObjectIdSchema
          .optional(),

      roomId:
        inpatientObjectIdSchema
          .optional(),

      departmentId:
        inpatientObjectIdSchema
          .optional(),

      servicePointId:
        inpatientObjectIdSchema
          .optional(),

      status:
        z
          .enum(
            inpatientCatalogStatusValues,
          )
          .optional(),

      bedStatus:
        z
          .enum(
            inpatientBedStatusValues,
          )
          .optional(),

      wardType:
        z
          .enum(
            wardTypeValues,
          )
          .optional(),

      roomType:
        z
          .enum(
            roomTypeValues,
          )
          .optional(),

      roomClass:
        z
          .enum(
            roomClassValues,
          )
          .optional(),

      bedCategory:
        z
          .enum(
            bedCategoryValues,
          )
          .optional(),

      specialtyCode:
        codeSchema.optional(),

      sortBy:
        z
          .enum(
            INPATIENT_LOCATION_SORT_FIELDS,
          )
          .default(
            'displayOrder',
          ),

      sortDirection:
        z
          .enum([
            'asc',
            'desc',
          ])
          .default('asc'),
    })
    .strict();

export const inpatientAdmissionListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      patientId:
        inpatientObjectIdSchema
          .optional(),

      encounterId:
        inpatientObjectIdSchema
          .optional(),

      departmentId:
        inpatientObjectIdSchema
          .optional(),

      wardId:
        inpatientObjectIdSchema
          .optional(),

      attendingConsultantStaffId:
        inpatientObjectIdSchema
          .optional(),

      status:
        z
          .enum(
            admissionStatusValues,
          )
          .optional(),

      admissionType:
        z
          .enum(
            admissionTypeValues,
          )
          .optional(),

      priority:
        z
          .enum(
            admissionPriorityValues,
          )
          .optional(),

      activeOnly:
        queryBooleanSchema
          .optional(),

      requestedFrom:
        inpatientIsoDateTimeSchema
          .optional(),

      requestedTo:
        inpatientIsoDateTimeSchema
          .optional(),

      admittedFrom:
        inpatientIsoDateTimeSchema
          .optional(),

      admittedTo:
        inpatientIsoDateTimeSchema
          .optional(),

      sortBy:
        z
          .enum(
            INPATIENT_ADMISSION_SORT_FIELDS,
          )
          .default(
            'requestedAt',
          ),

      sortDirection:
        z
          .enum([
            'asc',
            'desc',
          ])
          .default('desc'),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.requestedFrom !==
            undefined &&
          value.requestedTo !==
            undefined &&
          new Date(
            value.requestedTo,
          ) <
            new Date(
              value.requestedFrom,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['requestedTo'],

            message:
              'Requested-to time cannot precede requested-from time',
          });
        }

        if (
          value.admittedFrom !==
            undefined &&
          value.admittedTo !==
            undefined &&
          new Date(
            value.admittedTo,
          ) <
            new Date(
              value.admittedFrom,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path:
              ['admittedTo'],

            message:
              'Admitted-to time cannot precede admitted-from time',
          });
        }
      },
    );