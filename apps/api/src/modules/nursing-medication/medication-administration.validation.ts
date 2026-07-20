import {
  z,
} from 'zod';

import {
  medicationAdministrationRouteValues,
  medicationAdministrationSourceValues,
  medicationDoseStatusValues,
  medicationScheduleStatusValues,
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

const patientConfirmationSchema =
  z
    .object({
      patientId:
        nursingObjectIdSchema,

      mrn: z
        .string()
        .trim()
        .min(3)
        .max(120),

      birthDate: z
        .string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/u,
          'Expected YYYY-MM-DD',
        )
        .nullable(),
    })
    .strict();

const independentDoubleCheckSchema =
  z
    .object({
      performedByUserId:
        nursingObjectIdSchema,

      performedByStaffId:
        nursingObjectIdSchema,

      confirmedAt:
        nursingIsoDateTimeSchema,

      confirmationMethod: z.enum([
        'BARCODE_AND_VISUAL',
        'TWO_PERSON_VISUAL',
        'ELECTRONIC_COSIGN',
      ]),
    })
    .strict();

export const createMedicationAdministrationScheduleBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      prescriptionId:
        nursingObjectIdSchema
          .nullable()
          .optional(),

      prescriptionItemId:
        nursingObjectIdSchema
          .nullable()
          .optional(),

      source:
        z.enum(
          medicationAdministrationSourceValues,
        ),

      medicineId:
        nursingObjectIdSchema,

      formularyItemId:
        nursingObjectIdSchema
          .nullable()
          .optional(),

      medicineDisplay: z
        .string()
        .trim()
        .min(1)
        .max(500),

      prescribedDose:
        nursingDecimalStringSchema,

      doseUnitCode: z
        .string()
        .trim()
        .min(1)
        .max(80),

      route:
        z.enum(
          medicationAdministrationRouteValues,
        ),

      frequencyCode: z
        .string()
        .trim()
        .min(1)
        .max(80),

      scheduledTimes: z
        .array(
          nursingIsoDateTimeSchema,
        )
        .max(2_000)
        .default([]),

      prn: z
        .boolean()
        .default(false),

      prnIndication:
        nullableText(
          3,
          1_000,
        ),

      startAt:
        nursingIsoDateTimeSchema,

      endAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      orderedByUserId:
        nursingObjectIdSchema,

      orderedByStaffId:
        nursingObjectIdSchema,
    })
    .strict()
    .superRefine(
      (
        input,
        context,
      ) => {
        if (
          input.source ===
            'PRESCRIPTION' &&
          (
            input.prescriptionId == null ||
            input.prescriptionItemId == null
          )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'prescriptionItemId',
            ],

            message:
              'Prescription schedules require prescription and prescription-item references',
          });
        }

        if (
          input.source !==
            'PRESCRIPTION' &&
          (
            input.prescriptionId != null ||
            input.prescriptionItemId != null
          )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'prescriptionId',
            ],

            message:
              'Prescription references are only valid for prescription-sourced schedules',
          });
        }

        if (
          !input.prn &&
          input.scheduledTimes.length ===
            0
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'scheduledTimes',
            ],

            message:
              'Non-PRN schedules require at least one scheduled time',
          });
        }

        if (
          input.prn &&
          input.prnIndication == null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'prnIndication',
            ],

            message:
              'PRN medication schedules require an indication',
          });
        }

        const startAt =
          new Date(
            input.startAt,
          );

        const endAt =
          input.endAt == null
            ? null
            : new Date(
                input.endAt,
              );

        if (
          endAt != null &&
          endAt <= startAt
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'endAt',
            ],

            message:
              'Schedule end time must follow start time',
          });
        }

        const uniqueTimes =
          new Set(
            input.scheduledTimes,
          );

        if (
          uniqueTimes.size !==
          input.scheduledTimes.length
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'scheduledTimes',
            ],

            message:
              'Scheduled medication times must be unique',
          });
        }

        for (
          const value of
          input.scheduledTimes
        ) {
          const scheduledAt =
            new Date(
              value,
            );

          if (
            scheduledAt < startAt ||
            (
              endAt != null &&
              scheduledAt > endAt
            )
          ) {
            context.addIssue({
              code:
                'custom',

              path: [
                'scheduledTimes',
              ],

              message:
                'Each scheduled time must fall within the schedule interval',
            });
            break;
          }
        }
      },
    );

export const changeMedicationAdministrationScheduleStatusBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      status:
        z.enum(
          medicationScheduleStatusValues,
        ),

      reason:
        nullableText(
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
              'Holding or cancelling a medication schedule requires a reason',
          });
        }
      },
    );

const medicationAdministrationObjectSchema =
  z
    .object({
      expectedScheduleVersion:
        nursingExpectedVersionSchema,

      scheduledAt:
        nursingIsoDateTimeSchema,

      status:
        z
          .enum(
            medicationDoseStatusValues,
          )
          .refine(
            (value) =>
              ![
                'SCHEDULED',
                'DUE',
              ].includes(
                value,
              ),
            {
              message:
                'A dose outcome must be final, delayed, or cancelled',
            },
          ),

      patientConfirmation:
        patientConfirmationSchema,

      medicationBarcode:
        nullableText(
          2,
          300,
        ),

      indicationConfirmed:
        z
          .boolean()
          .optional(),

      administeredDose:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      administeredRoute:
        z
          .enum(
            medicationAdministrationRouteValues,
          )
          .nullable()
          .optional(),

      administeredAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      varianceReason:
        nullableText(
          5,
          2_000,
        ),

      reasonCode:
        nullableText(
          1,
          100,
        ),

      reason:
        nullableText(
          3,
          2_000,
        ),

      notes:
        nullableText(
          1,
          5_000,
        ),

      delayedUntil:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      independentDoubleCheck:
        independentDoubleCheckSchema
          .nullable()
          .optional(),
    })
    .strict();

function validateDoseOutcome(
  input:
    z.infer<
      typeof medicationAdministrationObjectSchema
    >,

  context:
    z.RefinementCtx,
): void {
  if (
    input.status ===
      'ADMINISTERED' &&
    (
      input.administeredDose == null ||
      input.administeredRoute == null
    )
  ) {
    context.addIssue({
      code:
        'custom',

      message:
        'Administered doses require dose and route confirmation',
    });
  }

  if (
    [
      'OMITTED',
      'REFUSED',
      'DELAYED',
      'CANCELLED',
    ].includes(
      input.status,
    ) &&
    (
      input.reasonCode == null ||
      input.reason == null
    )
  ) {
    context.addIssue({
      code:
        'custom',

      path: [
        'reason',
      ],

      message:
        'Non-administered outcomes require a coded reason and narrative',
    });
  }

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
        'Delayed doses require a revised due time',
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
        'delayedUntil is only valid for delayed doses',
    });
  }
}

export const recordMedicationAdministrationBodySchema =
  medicationAdministrationObjectSchema
    .superRefine(
      validateDoseOutcome,
    );

export const correctMedicationAdministrationBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        medicationAdministrationObjectSchema
          .superRefine(
            validateDoseOutcome,
          ),
    })
    .strict();

export const enterMedicationAdministrationInErrorBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const medicationDueBoardQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      dueUntil:
        nursingIsoDateTimeSchema,

      includeHeld: z
        .enum([
          'true',
          'false',
        ])
        .default('false')
        .transform(
          (value) =>
            value ===
            'true',
        ),

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
    .strict()
    .refine(
      (value) =>
        value.admissionId != null ||
        value.wardId != null,
      {
        message:
          'The MAR due board requires admissionId or wardId',
      },
    );

export const medicationAdministrationHistoryQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      medicationScheduleId:
        nursingObjectIdSchema.optional(),

      status:
        z
          .enum(
            medicationDoseStatusValues,
          )
          .optional(),

      scheduledFrom:
        nursingIsoDateTimeSchema.optional(),

      scheduledTo:
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
        .max(200)
        .default(50),
    })
    .strict();

export const medicationComplianceQuerySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      from:
        nursingIsoDateTimeSchema,

      to:
        nursingIsoDateTimeSchema,
    })
    .strict()
    .refine(
      (value) =>
        new Date(
          value.from,
        ) <
        new Date(
          value.to,
        ),
      {
        message:
          'Compliance start must precede end',
      },
    );