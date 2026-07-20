import {
  z,
} from 'zod';

import {
  medicationAdministrationRouteValues,
  medicationDoseStatusValues,
  medicationScheduleStatusValues,
} from '@hospital-mis/database';

import {
  medicationAdministrationRiskValues,
} from './nursing-mar.contracts.js';

import {
  nursingDecimalStringSchema,
  nursingExpectedVersionSchema,
  nursingIsoDateTimeSchema,
  nursingObjectIdSchema,
  nursingReasonSchema,
} from './nursing-medication.validation.js';

const optionalText = (
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

const positiveDecimalSchema =
  nursingDecimalStringSchema.refine(
    (value) =>
      Number(value) > 0,
    'Medication dose must be greater than zero',
  );

export const medicationSafetyCheckSchema =
  z
    .object({
      scannedPatientIdentifier:
        optionalText(
          1,
          300,
        ),

      scannedMedicineIdentifier:
        optionalText(
          1,
          300,
        ),

      confirmedPatientId:
        nursingObjectIdSchema,

      confirmedMedicineId:
        nursingObjectIdSchema,

      confirmedDose:
        positiveDecimalSchema,

      confirmedDoseUnitCode: z
        .string()
        .trim()
        .min(1)
        .max(80),

      confirmedRoute: z.enum(
        medicationAdministrationRouteValues,
      ),

      confirmedScheduledAt:
        nursingIsoDateTimeSchema,

      allergyOverrideReason:
        optionalText(
          10,
          2_000,
        ),

      timingOverrideReason:
        optionalText(
          10,
          2_000,
        ),

      doseOverrideReason:
        optionalText(
          10,
          2_000,
        ),

      routeOverrideReason:
        optionalText(
          10,
          2_000,
        ),
    })
    .strict();

export const medicationWitnessSchema =
  z
    .object({
      witnessUserId:
        nursingObjectIdSchema,

      witnessStaffId:
        nursingObjectIdSchema,

      witnessedAt:
        nursingIsoDateTimeSchema,

      witnessStatement: z
        .string()
        .trim()
        .min(10)
        .max(2_000),
    })
    .strict();

export const administerScheduledMedicationBodySchema =
  z
    .object({
      expectedScheduleVersion:
        nursingExpectedVersionSchema,

      scheduledAt:
        nursingIsoDateTimeSchema,

      administeredDose:
        positiveDecimalSchema,

      administeredRoute:
        z.enum(
          medicationAdministrationRouteValues,
        ),

      administeredAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      notes:
        optionalText(
          1,
          5_000,
        ),

      safetyCheck:
        medicationSafetyCheckSchema,

      risk: z
        .enum(
          medicationAdministrationRiskValues,
        )
        .default('STANDARD'),

      witness:
        medicationWitnessSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          input.safetyCheck
            .confirmedDose !==
          input.administeredDose
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'safetyCheck',
              'confirmedDose',
            ],

            message:
              'Confirmed dose must match administered dose',
          });
        }

        if (
          input.safetyCheck
            .confirmedRoute !==
          input.administeredRoute
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'safetyCheck',
              'confirmedRoute',
            ],

            message:
              'Confirmed route must match administered route',
          });
        }

        if (
          input.safetyCheck
            .confirmedScheduledAt !==
          input.scheduledAt
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'safetyCheck',
              'confirmedScheduledAt',
            ],

            message:
              'Confirmed administration time must match the scheduled dose time',
          });
        }

        if (
          [
            'HIGH_ALERT',
            'CONTROLLED',
            'CYTOTOXIC',
            'INSULIN',
            'ANTICOAGULANT',
          ].includes(
            input.risk,
          ) &&
          input.witness == null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'witness',
            ],

            message:
              `${input.risk} medication requires an independent witness`,
          });
        }
      },
    );

export const recordMedicationExceptionBodySchema =
  z
    .object({
      expectedScheduleVersion:
        nursingExpectedVersionSchema,

      scheduledAt:
        nursingIsoDateTimeSchema,

      status: z
        .enum(
          medicationDoseStatusValues,
        )
        .refine(
          (
            status,
          ) =>
            [
              'OMITTED',
              'REFUSED',
              'DELAYED',
              'CANCELLED',
            ].includes(
              status,
            ),
          'Medication exception requires omitted, refused, delayed, or cancelled status',
        ),

      reasonCode: z
        .string()
        .trim()
        .min(1)
        .max(100),

      reason:
        nursingReasonSchema,

      delayedUntil:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      notes:
        optionalText(
          1,
          5_000,
        ),
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          input.status ===
            'DELAYED' &&
          input.delayedUntil == null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'delayedUntil',
            ],

            message:
              'Delayed medication doses require delayedUntil',
          });
        }

        if (
          input.status !==
            'DELAYED' &&
          input.delayedUntil != null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'delayedUntil',
            ],

            message:
              'delayedUntil is only valid for delayed medication doses',
          });
        }
      },
    );

export const correctMedicationAdministrationBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        z.union([
          administerScheduledMedicationBodySchema,
          recordMedicationExceptionBodySchema,
        ]),
    })
    .strict();

export const markMedicationAdministrationEnteredInErrorBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const updateMedicationScheduleStatusBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      status: z.enum(
        medicationScheduleStatusValues,
      ),

      reason:
        optionalText(
          5,
          2_000,
        ),
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          [
            'HELD',
            'CANCELLED',
          ].includes(
            input.status,
          ) &&
          input.reason == null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'reason',
            ],

            message:
              `${input.status} medication schedules require a reason`,
          });
        }
      },
    );

export const recordPrnEffectivenessBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        nursingExpectedVersionSchema,

      assessedAt:
        nursingIsoDateTimeSchema,

      effectiveness: z.enum([
        'EFFECTIVE',
        'PARTIALLY_EFFECTIVE',
        'INEFFECTIVE',
        'NOT_ASSESSABLE',
      ]),

      response: z
        .string()
        .trim()
        .min(3)
        .max(5_000),

      followUpRequired: z
        .boolean()
        .default(false),

      followUpDueAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          input.followUpRequired &&
          input.followUpDueAt == null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'followUpDueAt',
            ],

            message:
              'Required PRN follow-up must include followUpDueAt',
          });
        }
      },
    );

export const nursingMarWorklistQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      status: z
        .enum(
          medicationScheduleStatusValues,
        )
        .optional(),

      dueFrom:
        nursingIsoDateTimeSchema.optional(),

      dueTo:
        nursingIsoDateTimeSchema.optional(),

      overdueAt:
        nursingIsoDateTimeSchema.optional(),

      includePrn:
        z.coerce
          .boolean()
          .default(true),

      page:
        z.coerce
          .number()
          .int()
          .min(1)
          .default(1),

      pageSize:
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25),
    })
    .strict();

export const nursingMarAdministrationQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      medicationScheduleId:
        nursingObjectIdSchema.optional(),

      medicineId:
        nursingObjectIdSchema.optional(),

      status: z
        .enum(
          medicationDoseStatusValues,
        )
        .optional(),

      scheduledFrom:
        nursingIsoDateTimeSchema.optional(),

      scheduledTo:
        nursingIsoDateTimeSchema.optional(),

      page:
        z.coerce
          .number()
          .int()
          .min(1)
          .default(1),

      pageSize:
        z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50),
    })
    .strict();