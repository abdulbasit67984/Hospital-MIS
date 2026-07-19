import {
  z,
} from 'zod';

import {
  formularyItemStatusValues,
  formularyRestrictionTypeValues,
  medicineCatalogStatusValues,
  medicineFormCategoryValues,
  medicineRouteCodeValues,
  prescriptionDurationUnitValues,
  prescriptionFrequencyKindValues,
  prescriptionStatusValues,
  providerSignatureMethodValues,
  unitOfMeasureDimensionValues,
} from '@hospital-mis/database';

import {
  DEFAULT_FORMULARY_PAGE_SIZE,
  DEFAULT_PRESCRIPTION_PAGE_SIZE,
  FORMULARY_SORT_FIELDS,
  MAX_FORMULARY_PAGE_SIZE,
  MAX_PRESCRIPTION_PAGE_SIZE,
  PRESCRIPTION_SORT_FIELDS,
} from './formulary-prescriptions.constants.js';

import {
  isPositiveDecimalString,
  normalizeDecimalString,
  normalizeOptionalSearchText,
} from './formulary-prescriptions.normalization.js';

export const formularyPrescriptionObjectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

export const formularyPrescriptionExpectedVersionSchema =
  z
    .number()
    .int()
    .min(0);

export const formularyPrescriptionReasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(2_000);

export const formularyPrescriptionIsoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

export const formularyPrescriptionServiceDateSchema =
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/u,
      'Expected a date in YYYY-MM-DD format',
    )
    .refine(
      (value) => {
        const parsed = new Date(
          `${value}T00:00:00.000Z`,
        );

        return (
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value
        );
      },
      'Expected a valid calendar date',
    );

const nullableText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .nullable()
    .optional();

const optionalText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .optional();

const positiveDecimalSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(
      isPositiveDecimalString,
      'Expected a positive decimal value',
    )
    .transform((value) =>
      normalizeDecimalString(value),
    );

const optionalNullablePositiveDecimalSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(
      isPositiveDecimalString,
      'Expected a positive decimal value',
    )
    .transform((value) =>
      normalizeDecimalString(value),
    )
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
  z.coerce
    .number()
    .int()
    .min(1);

const formularyPageSizeSchema =
  z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FORMULARY_PAGE_SIZE);

const prescriptionPageSizeSchema =
  z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PRESCRIPTION_PAGE_SIZE);

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

export const formularyPrescriptionMutationHeadersSchema =
  z
    .object({
      'idempotency-key': idempotencyKeySchema,
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const formularyPrescriptionReadHeadersSchema =
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

export const formularyPrescriptionEntityParamsSchema =
  z
    .object({
      medicineId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      medicineFormId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      medicineRouteId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      unitOfMeasureId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      medicineStrengthId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      prescriptionFrequencyId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      formularyItemId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      prescriptionId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      prescriptionItemId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      warningId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      patientId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      encounterId:
        formularyPrescriptionObjectIdSchema
          .optional(),
    })
    .strict();

const medicineBrandSchema =
  z
    .object({
      name:
        z
          .string()
          .trim()
          .min(2)
          .max(300),

      manufacturerName:
        nullableText(
          2,
          300,
        ),

      status:
        z
          .enum(
            medicineCatalogStatusValues,
          )
          .default('ACTIVE'),
    })
    .strict();

export const createMedicineBodySchema =
  z
    .object({
      medicineCode:
        z
          .string()
          .trim()
          .min(2)
          .max(80),

      genericName:
        z
          .string()
          .trim()
          .min(2)
          .max(500),

      brandNames:
        z
          .array(
            medicineBrandSchema,
          )
          .max(100)
          .default([]),

      synonyms:
        z
          .array(
            z
              .string()
              .trim()
              .min(2)
              .max(300),
          )
          .max(100)
          .default([]),

      therapeuticClass:
        nullableText(
          2,
          300,
        ),

      atcCode:
        nullableText(
          1,
          30,
        ),

      description:
        nullableText(
          2,
          5_000,
        ),
    })
    .strict();

export const updateMedicineBodySchema =
  createMedicineBodySchema
    .omit({
      medicineCode: true,
    })
    .partial()
    .extend({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,
    })
    .strict();

export const changeMedicineStatusBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      status:
        z.enum(
          medicineCatalogStatusValues,
        ),

      reason:
        formularyPrescriptionReasonSchema,
    })
    .strict();

export const createMedicineFormBodySchema =
  z
    .object({
      code:
        z
          .string()
          .trim()
          .min(2)
          .max(50),

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(200),

      category:
        z.enum(
          medicineFormCategoryValues,
        ),
    })
    .strict();

export const updateMedicineFormBodySchema =
  createMedicineFormBodySchema
    .omit({
      code: true,
    })
    .partial()
    .extend({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,
    })
    .strict();

export const createMedicineRouteBodySchema =
  z
    .object({
      code:
        z.enum(
          medicineRouteCodeValues,
        ),

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(150),
    })
    .strict();

export const updateMedicineRouteBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(150),
    })
    .strict();

export const createUnitOfMeasureBodySchema =
  z
    .object({
      code:
        z
          .string()
          .trim()
          .min(1)
          .max(30),

      name:
        z
          .string()
          .trim()
          .min(1)
          .max(150),

      symbol:
        z
          .string()
          .trim()
          .min(1)
          .max(30),

      dimension:
        z.enum(
          unitOfMeasureDimensionValues,
        ),

      decimalScale:
        z
          .number()
          .int()
          .min(0)
          .max(6)
          .default(3),
    })
    .strict();

export const updateUnitOfMeasureBodySchema =
  createUnitOfMeasureBodySchema
    .omit({
      code: true,
    })
    .partial()
    .extend({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,
    })
    .strict();

export const createMedicineStrengthBodySchema =
  z
    .object({
      medicineId:
        formularyPrescriptionObjectIdSchema,

      medicineFormId:
        formularyPrescriptionObjectIdSchema,

      displayText:
        z
          .string()
          .trim()
          .min(1)
          .max(150),

      numeratorValue:
        positiveDecimalSchema,

      numeratorUnitId:
        formularyPrescriptionObjectIdSchema,

      denominatorValue:
        optionalNullablePositiveDecimalSchema,

      denominatorUnitId:
        formularyPrescriptionObjectIdSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const denominatorValuePresent =
          value.denominatorValue != null;

        const denominatorUnitPresent =
          value.denominatorUnitId != null;

        if (
          denominatorValuePresent !==
          denominatorUnitPresent
        ) {
          context.addIssue({
            code: 'custom',
            path: ['denominatorValue'],
            message:
              'Denominator value and unit must either both be provided or both be omitted',
          });
        }
      },
    );

export const updateMedicineStrengthBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      displayText:
        optionalText(
          1,
          150,
        ),

      numeratorValue:
        positiveDecimalSchema
          .optional(),

      denominatorValue:
        optionalNullablePositiveDecimalSchema,

      denominatorUnitId:
        formularyPrescriptionObjectIdSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const explicitlyUpdatesDenominatorValue =
          Object.prototype.hasOwnProperty.call(
            value,
            'denominatorValue',
          );

        const explicitlyUpdatesDenominatorUnit =
          Object.prototype.hasOwnProperty.call(
            value,
            'denominatorUnitId',
          );

        if (
          explicitlyUpdatesDenominatorValue !==
          explicitlyUpdatesDenominatorUnit
        ) {
          context.addIssue({
            code: 'custom',
            path: ['denominatorValue'],
            message:
              'Denominator value and unit must be updated together',
          });
        }

        if (
          value.denominatorValue == null &&
          value.denominatorUnitId != null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['denominatorUnitId'],
            message:
              'A denominator unit requires a denominator value',
          });
        }
      },
    );

export const createPrescriptionFrequencyBodySchema =
  z
    .object({
      code:
        z
          .string()
          .trim()
          .min(1)
          .max(50),

      name:
        z
          .string()
          .trim()
          .min(2)
          .max(200),

      kind:
        z.enum(
          prescriptionFrequencyKindValues,
        ),

      timesPerDay:
        z
          .number()
          .int()
          .min(1)
          .max(48)
          .nullable()
          .optional(),

      intervalMinutes:
        z
          .number()
          .int()
          .min(1)
          .max(43_200)
          .nullable()
          .optional(),

      defaultAdministrationTimes:
        z
          .array(
            z
              .string()
              .regex(
                /^([01]\d|2[0-3]):[0-5]\d$/u,
                'Expected a 24-hour HH:mm time',
              ),
          )
          .max(48)
          .default([]),

      allowsAsNeeded:
        z
          .boolean()
          .default(false),

      maxAdministrationsPerDay:
        z
          .number()
          .int()
          .min(1)
          .max(48)
          .nullable()
          .optional(),

      patientInstructionTemplate:
        nullableText(
          2,
          2_000,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.kind === 'SCHEDULED' &&
          value.timesPerDay == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['timesPerDay'],
            message:
              'Scheduled frequencies require timesPerDay',
          });
        }

        if (
          value.kind === 'INTERVAL' &&
          value.intervalMinutes == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['intervalMinutes'],
            message:
              'Interval frequencies require intervalMinutes',
          });
        }

        if (
          value.kind === 'AS_NEEDED' &&
          !value.allowsAsNeeded
        ) {
          context.addIssue({
            code: 'custom',
            path: ['allowsAsNeeded'],
            message:
              'As-needed frequencies must allow as-needed administration',
          });
        }

        if (
          value.timesPerDay != null &&
          value.defaultAdministrationTimes.length > 0 &&
          value.defaultAdministrationTimes.length !==
            value.timesPerDay
        ) {
          context.addIssue({
            code: 'custom',
            path: ['defaultAdministrationTimes'],
            message:
              'Administration-time count must match timesPerDay',
          });
        }
      },
    );

export const updatePrescriptionFrequencyBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      name:
        optionalText(
          2,
          200,
        ),

      kind:
        z
          .enum(
            prescriptionFrequencyKindValues,
          )
          .optional(),

      timesPerDay:
        z
          .number()
          .int()
          .min(1)
          .max(48)
          .nullable()
          .optional(),

      intervalMinutes:
        z
          .number()
          .int()
          .min(1)
          .max(43_200)
          .nullable()
          .optional(),

      defaultAdministrationTimes:
        z
          .array(
            z
              .string()
              .regex(
                /^([01]\d|2[0-3]):[0-5]\d$/u,
                'Expected a 24-hour HH:mm time',
              ),
          )
          .max(48)
          .optional(),

      allowsAsNeeded:
        z
          .boolean()
          .optional(),

      maxAdministrationsPerDay:
        z
          .number()
          .int()
          .min(1)
          .max(48)
          .nullable()
          .optional(),

      patientInstructionTemplate:
        nullableText(
          2,
          2_000,
        ),
    })
    .strict();

export const changeCatalogStatusBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      status:
        z.enum(
          medicineCatalogStatusValues,
        ),

      reason:
        formularyPrescriptionReasonSchema,
    })
    .strict();

export const createFormularyItemBodySchema =
  z
    .object({
      formularyCode:
        z
          .string()
          .trim()
          .min(2)
          .max(80),

      medicineId:
        formularyPrescriptionObjectIdSchema,

      medicineFormId:
        formularyPrescriptionObjectIdSchema,

      medicineStrengthId:
        formularyPrescriptionObjectIdSchema,

      brandName:
        nullableText(
          2,
          300,
        ),

      allowedRouteIds:
        z
          .array(
            formularyPrescriptionObjectIdSchema,
          )
          .min(1)
          .max(50),

      defaultRouteId:
        formularyPrescriptionObjectIdSchema,

      doseUnitId:
        formularyPrescriptionObjectIdSchema,

      quantityUnitId:
        formularyPrescriptionObjectIdSchema,

      inventoryItemId:
        formularyPrescriptionObjectIdSchema
          .nullable()
          .optional(),

      stockTracked:
        z
          .boolean()
          .default(false),

      restrictionType:
        z
          .enum(
            formularyRestrictionTypeValues,
          )
          .default('NONE'),

      restrictedDepartmentIds:
        z
          .array(
            formularyPrescriptionObjectIdSchema,
          )
          .max(100)
          .default([]),

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

      highAlert:
        z
          .boolean()
          .default(false),

      controlledMedicine:
        z
          .boolean()
          .default(false),

      prescribingNotes:
        nullableText(
          2,
          5_000,
        ),

      effectiveFrom:
        formularyPrescriptionIsoDateTimeSchema
          .optional(),

      effectiveUntil:
        formularyPrescriptionIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          !value.allowedRouteIds.includes(
            value.defaultRouteId,
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: ['defaultRouteId'],
            message:
              'Default route must be included in allowedRouteIds',
          });
        }

        if (
          value.stockTracked &&
          value.inventoryItemId == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['inventoryItemId'],
            message:
              'Stock-tracked formulary items require an inventory item',
          });
        }

        if (
          value.restrictionType ===
            'DEPARTMENT_ONLY' &&
          value.restrictedDepartmentIds.length === 0
        ) {
          context.addIssue({
            code: 'custom',
            path: ['restrictedDepartmentIds'],
            message:
              'Department-only formulary items require at least one department',
          });
        }

        if (
          value.minimumAgeYears != null &&
          value.maximumAgeYears != null &&
          value.maximumAgeYears <
            value.minimumAgeYears
        ) {
          context.addIssue({
            code: 'custom',
            path: ['maximumAgeYears'],
            message:
              'Maximum age cannot be lower than minimum age',
          });
        }

        if (
          value.effectiveFrom != null &&
          value.effectiveUntil != null &&
          new Date(value.effectiveUntil) <=
            new Date(value.effectiveFrom)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['effectiveUntil'],
            message:
              'Effective-until timestamp must be later than effective-from',
          });
        }
      },
    );

export const updateFormularyItemBodySchema =
  createFormularyItemBodySchema
    .omit({
      formularyCode: true,
      medicineId: true,
      medicineFormId: true,
      medicineStrengthId: true,
    })
    .partial()
    .extend({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,
    })
    .strict();

export const changeFormularyItemStatusBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      status:
        z.enum(
          formularyItemStatusValues,
        ),

      reason:
        formularyPrescriptionReasonSchema,
    })
    .strict();

export const formularySearchQuerySchema =
  z
    .object({
      page:
        pageSchema
          .default(1),

      pageSize:
        formularyPageSizeSchema
          .default(
            DEFAULT_FORMULARY_PAGE_SIZE,
          ),

      sortBy:
        z
          .enum(
            FORMULARY_SORT_FIELDS,
          )
          .default('genericName'),

      sortDirection:
        z
          .enum([
            'asc',
            'desc',
          ])
          .default('asc'),

      search:
        z
          .string()
          .trim()
          .max(300)
          .optional()
          .transform(
            normalizeOptionalSearchText,
          ),

      status:
        z
          .enum(
            formularyItemStatusValues,
          )
          .optional(),

      medicineId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      medicineFormId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      routeId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      departmentId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      includeStock:
        queryBooleanSchema
          .default(false),
    })
    .strict();

export const prescriptionItemBodySchema =
  z
    .object({
      formularyItemId:
        formularyPrescriptionObjectIdSchema,

      selectedBrandName:
        nullableText(
          2,
          300,
        ),

      dose:
        positiveDecimalSchema,

      doseUnitId:
        formularyPrescriptionObjectIdSchema,

      routeId:
        formularyPrescriptionObjectIdSchema,

      frequencyId:
        formularyPrescriptionObjectIdSchema,

      durationValue:
        optionalNullablePositiveDecimalSchema,

      durationUnit:
        z.enum(
          prescriptionDurationUnitValues,
        ),

      quantity:
        positiveDecimalSchema,

      quantityUnitId:
        formularyPrescriptionObjectIdSchema,

      instructions:
        nullableText(
          2,
          5_000,
        ),

      asNeeded:
        z
          .boolean()
          .default(false),

      asNeededReason:
        nullableText(
          5,
          1_000,
        ),

      startDate:
        formularyPrescriptionServiceDateSchema,

      endDate:
        formularyPrescriptionServiceDateSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const requiresDurationValue =
          ![
            'UNTIL_FINISHED',
            'AS_NEEDED',
          ].includes(
            value.durationUnit,
          );

        if (
          requiresDurationValue &&
          value.durationValue == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['durationValue'],
            message:
              'The selected duration unit requires a duration value',
          });
        }

        if (
          value.asNeeded &&
          value.asNeededReason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['asNeededReason'],
            message:
              'As-needed prescribing requires a clinical reason',
          });
        }

        if (
          !value.asNeeded &&
          value.asNeededReason != null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['asNeededReason'],
            message:
              'Scheduled items cannot include an as-needed reason',
          });
        }

        if (
          value.endDate != null &&
          value.endDate <
            value.startDate
        ) {
          context.addIssue({
            code: 'custom',
            path: ['endDate'],
            message:
              'End date cannot precede start date',
          });
        }
      },
    );

export const createPrescriptionDraftBodySchema =
  z
    .object({
      encounterId:
        formularyPrescriptionObjectIdSchema,

      patientId:
        formularyPrescriptionObjectIdSchema,

      prescriberProviderId:
        formularyPrescriptionObjectIdSchema,

      items:
        z
          .array(
            prescriptionItemBodySchema,
          )
          .min(1)
          .max(100),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const seen =
          new Set<string>();

        value.items.forEach(
          (
            item,
            index,
          ) => {
            const key = [
              item.formularyItemId,
              item.routeId,
              item.frequencyId,
              item.dose,
              item.doseUnitId,
            ].join(':');

            if (seen.has(key)) {
              context.addIssue({
                code: 'custom',
                path: [
                  'items',
                  index,
                  'formularyItemId',
                ],
                message:
                  'Duplicate prescription item selection',
              });
            }

            seen.add(key);
          },
        );
      },
    );

export const updatePrescriptionDraftBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      items:
        z
          .array(
            prescriptionItemBodySchema,
          )
          .min(1)
          .max(100),
    })
    .strict();

const warningAcknowledgementSchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      reason:
        formularyPrescriptionReasonSchema,

      override:
        z.boolean(),
    })
    .strict();

export const issuePrescriptionBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      expiresAt:
        formularyPrescriptionIsoDateTimeSchema
          .nullable()
          .optional(),

      signatureMethod:
        z.enum(
          providerSignatureMethodValues,
        ),

      signatureDigest:
        z
          .string()
          .trim()
          .min(32)
          .max(256),

      warningAcknowledgements:
        z
          .record(
            formularyPrescriptionObjectIdSchema,
            warningAcknowledgementSchema,
          )
          .default({}),
    })
    .strict();

export const cancelPrescriptionBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      reason:
        formularyPrescriptionReasonSchema,
    })
    .strict();

export const replacePrescriptionBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      reason:
        formularyPrescriptionReasonSchema,

      items:
        z
          .array(
            prescriptionItemBodySchema,
          )
          .min(1)
          .max(100),

      signatureMethod:
        z.enum(
          providerSignatureMethodValues,
        ),

      signatureDigest:
        z
          .string()
          .trim()
          .min(32)
          .max(256),

      expiresAt:
        formularyPrescriptionIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict();

export const acknowledgePrescriptionWarningBodySchema =
  warningAcknowledgementSchema;

export const printPrescriptionBodySchema =
  z
    .object({
      expectedVersion:
        formularyPrescriptionExpectedVersionSchema,

      locale:
        z
          .string()
          .trim()
          .min(2)
          .max(35)
          .default('en-PK'),

      timezone:
        z
          .string()
          .trim()
          .min(3)
          .max(100)
          .default('Asia/Karachi'),
    })
    .strict();

export const prescriptionListQuerySchema =
  z
    .object({
      page:
        pageSchema
          .default(1),

      pageSize:
        prescriptionPageSizeSchema
          .default(
            DEFAULT_PRESCRIPTION_PAGE_SIZE,
          ),

      sortBy:
        z
          .enum(
            PRESCRIPTION_SORT_FIELDS,
          )
          .default('draftedAt'),

      sortDirection:
        z
          .enum([
            'asc',
            'desc',
          ])
          .default('desc'),

      patientId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      encounterId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      prescriberProviderId:
        formularyPrescriptionObjectIdSchema
          .optional(),

      status:
        z
          .enum(
            prescriptionStatusValues,
          )
          .optional(),

      issuedFrom:
        formularyPrescriptionIsoDateTimeSchema
          .optional(),

      issuedTo:
        formularyPrescriptionIsoDateTimeSchema
          .optional(),

      includeItems:
        queryBooleanSchema
          .default(false),

      includeWarnings:
        queryBooleanSchema
          .default(false),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.issuedFrom != null &&
          value.issuedTo != null &&
          new Date(value.issuedTo) <
            new Date(value.issuedFrom)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['issuedTo'],
            message:
              'issuedTo cannot precede issuedFrom',
          });
        }
      },
    );

export type CreateMedicineBody =
  z.infer<
    typeof createMedicineBodySchema
  >;

export type UpdateMedicineBody =
  z.infer<
    typeof updateMedicineBodySchema
  >;

export type CreateMedicineFormBody =
  z.infer<
    typeof createMedicineFormBodySchema
  >;

export type UpdateMedicineFormBody =
  z.infer<
    typeof updateMedicineFormBodySchema
  >;

export type CreateMedicineRouteBody =
  z.infer<
    typeof createMedicineRouteBodySchema
  >;

export type UpdateMedicineRouteBody =
  z.infer<
    typeof updateMedicineRouteBodySchema
  >;

export type CreateUnitOfMeasureBody =
  z.infer<
    typeof createUnitOfMeasureBodySchema
  >;

export type UpdateUnitOfMeasureBody =
  z.infer<
    typeof updateUnitOfMeasureBodySchema
  >;

export type CreateMedicineStrengthBody =
  z.infer<
    typeof createMedicineStrengthBodySchema
  >;

export type UpdateMedicineStrengthBody =
  z.infer<
    typeof updateMedicineStrengthBodySchema
  >;

export type CreatePrescriptionFrequencyBody =
  z.infer<
    typeof createPrescriptionFrequencyBodySchema
  >;

export type UpdatePrescriptionFrequencyBody =
  z.infer<
    typeof updatePrescriptionFrequencyBodySchema
  >;

export type CreateFormularyItemBody =
  z.infer<
    typeof createFormularyItemBodySchema
  >;

export type UpdateFormularyItemBody =
  z.infer<
    typeof updateFormularyItemBodySchema
  >;

export type CreatePrescriptionDraftBody =
  z.infer<
    typeof createPrescriptionDraftBodySchema
  >;

export type UpdatePrescriptionDraftBody =
  z.infer<
    typeof updatePrescriptionDraftBodySchema
  >;

export type IssuePrescriptionBody =
  z.infer<
    typeof issuePrescriptionBodySchema
  >;

export type CancelPrescriptionBody =
  z.infer<
    typeof cancelPrescriptionBodySchema
  >;

export type ReplacePrescriptionBody =
  z.infer<
    typeof replacePrescriptionBodySchema
  >;

export type PrescriptionListRouteQuery =
  z.infer<
    typeof prescriptionListQuerySchema
  >;

export type FormularySearchRouteQuery =
  z.infer<
    typeof formularySearchQuerySchema
  >;