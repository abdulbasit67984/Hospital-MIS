import {
  z,
} from 'zod';

import {
  clinicalConfidentialityValues,
  vitalSignBodyPositionValues,
  vitalSignSourceValues,
  vitalSignStatusValues,
  vitalSignTemperatureSiteValues,
  wardHandoverStatusValues,
  wardHandoverTypeValues,
} from '@hospital-mis/database';

import {
  nursingDecimalStringSchema,
  nursingExpectedVersionSchema,
  nursingIsoDateTimeSchema,
  nursingObjectIdSchema,
  nursingReasonSchema,
} from './nursing-medication.validation.js';

const nullableText = (
  minimum: number,
  maximum: number,
) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .nullable()
    .optional();

const measurementFields = [
  'temperatureCelsius',
  'pulsePerMinute',
  'respiratoryRatePerMinute',
  'systolicBloodPressureMmHg',
  'diastolicBloodPressureMmHg',
  'oxygenSaturationPercent',
  'bloodGlucoseMgDl',
  'painScore',
  'weightKg',
  'heightCm',
] as const;

const nursingVitalMeasurementObjectSchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      measuredAt:
        nursingIsoDateTimeSchema,

      source: z
        .enum(
          vitalSignSourceValues,
        )
        .default('MANUAL'),

      deviceIdentifier:
        nullableText(
          2,
          200,
        ),

      bodyPosition: z
        .enum(
          vitalSignBodyPositionValues,
        )
        .default('UNSPECIFIED'),

      temperatureCelsius:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      temperatureSite: z
        .enum(
          vitalSignTemperatureSiteValues,
        )
        .default('UNSPECIFIED'),

      pulsePerMinute: z
        .number()
        .int()
        .min(0)
        .max(400)
        .nullable()
        .optional(),

      respiratoryRatePerMinute: z
        .number()
        .int()
        .min(0)
        .max(150)
        .nullable()
        .optional(),

      systolicBloodPressureMmHg: z
        .number()
        .int()
        .min(20)
        .max(350)
        .nullable()
        .optional(),

      diastolicBloodPressureMmHg: z
        .number()
        .int()
        .min(10)
        .max(250)
        .nullable()
        .optional(),

      oxygenSaturationPercent:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      bloodGlucoseMgDl:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      painScore: z
        .number()
        .int()
        .min(0)
        .max(10)
        .nullable()
        .optional(),

      weightKg:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      heightCm:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      oxygenDeliveryMethod:
        nullableText(
          1,
          200,
        ),

      oxygenFlowLitresPerMinute:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      notes:
        nullableText(
          1,
          5_000,
        ),

      confidentiality: z
        .enum(
          clinicalConfidentialityValues,
        )
        .default('ROUTINE'),

      restrictionReason:
        nullableText(
          5,
          1_000,
        ),

      backdatedEntryReason:
        nullableText(
          5,
          2_000,
        ),
    })
    .strict();

type VitalInput =
  z.infer<
    typeof nursingVitalMeasurementObjectSchema
  >;

function validateVitalInput(
  input: VitalInput,
  context: z.RefinementCtx,
): void {
  if (
    measurementFields.every(
      (field) =>
        input[field] == null,
    )
  ) {
    context.addIssue({
      code: 'custom',
      message:
        'At least one vital-sign measurement is required',
    });
  }

  if (
    (
      input.systolicBloodPressureMmHg ==
      null
    ) !==
    (
      input.diastolicBloodPressureMmHg ==
      null
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'systolicBloodPressureMmHg',
      ],
      message:
        'Systolic and diastolic blood pressure must be recorded together',
    });
  }

  if (
    input.systolicBloodPressureMmHg !=
      null &&
    input.diastolicBloodPressureMmHg !=
      null &&
    input.systolicBloodPressureMmHg <=
      input.diastolicBloodPressureMmHg
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'systolicBloodPressureMmHg',
      ],
      message:
        'Systolic pressure must exceed diastolic pressure',
    });
  }

  if (
    input.source ===
      'DEVICE' &&
    input.deviceIdentifier == null
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'deviceIdentifier',
      ],
      message:
        'Device-originated observations require deviceIdentifier',
    });
  }

  if (
    input.source !==
      'DEVICE' &&
    input.deviceIdentifier != null
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'deviceIdentifier',
      ],
      message:
        'deviceIdentifier is only valid for device-originated observations',
    });
  }

  if (
    input.confidentiality !==
      'ROUTINE' &&
    input.restrictionReason == null
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'restrictionReason',
      ],
      message:
        'Restricted observations require a minimum-necessary reason',
    });
  }
}

export const nursingVitalMeasurementBodySchema =
  nursingVitalMeasurementObjectSchema
    .superRefine(
      validateVitalInput,
    );

export const correctNursingVitalObservationBodySchema =
  nursingVitalMeasurementObjectSchema
    .extend({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .superRefine(
      validateVitalInput,
    );

export const enterNursingVitalObservationInErrorBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const nursingVitalTrendQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      measuredFrom:
        nursingIsoDateTimeSchema.optional(),

      measuredTo:
        nursingIsoDateTimeSchema.optional(),

      status: z
        .enum(
          vitalSignStatusValues,
        )
        .optional(),

      page: z.coerce
        .number()
        .int()
        .min(1)
        .default(1),

      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50),
    })
    .strict();

const handoverReplacementSchema =
  z
    .object({
      handoverType:
        z.enum(
          wardHandoverTypeValues,
        ),

      shiftCode: z
        .string()
        .trim()
        .min(1)
        .max(80),

      summary: z
        .string()
        .trim()
        .min(1)
        .max(50_000),

      activeConcerns: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(2_000),
        )
        .max(100)
        .default([]),

      pendingTasks: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(2_000),
        )
        .max(100)
        .default([]),

      medicationConcerns: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(2_000),
        )
        .max(100)
        .default([]),

      safetyConcerns: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(2_000),
        )
        .max(100)
        .default([]),

      toNurseUserId:
        nursingObjectIdSchema,

      toNurseStaffId:
        nursingObjectIdSchema,

      handedOverAt:
        nursingIsoDateTimeSchema,
    })
    .strict();

export const correctWardHandoverBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        handoverReplacementSchema,
    })
    .strict();

export const enterWardHandoverInErrorBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const wardHandoverListQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      toNurseStaffId:
        nursingObjectIdSchema.optional(),

      status: z
        .enum(
          wardHandoverStatusValues,
        )
        .optional(),

      handedOverFrom:
        nursingIsoDateTimeSchema.optional(),

      handedOverTo:
        nursingIsoDateTimeSchema.optional(),

      page: z.coerce
        .number()
        .int()
        .min(1)
        .default(1),

      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25),
    })
    .strict();