import {
  z,
} from 'zod';

import {
  medicationAdministrationRouteValues,
  medicationAdministrationSourceValues,
  medicationDoseStatusValues,
  nursingIntakeOutputDirectionValues,
  nursingIntakeOutputRouteValues,
  nursingNoteTypeValues,
  nursingObservationSeverityValues,
  wardHandoverTypeValues,
} from '@hospital-mis/database';

import {
  inpatientExpectedVersionSchema,
  inpatientIsoDateTimeSchema,
  inpatientMoneyStringSchema,
  inpatientObjectIdSchema,
  inpatientReasonSchema,
} from './inpatient.validation.js';

const nullableText = (
  minimum:
    number,

  maximum:
    number,
) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .nullable()
    .optional();

export const recordNursingVitalSignBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      measuredAt:
        inpatientIsoDateTimeSchema,

      bodyPosition:
        z
          .enum([
            'SITTING',
            'SUPINE',
            'STANDING',
            'PRONE',
            'LATERAL',
            'UNSPECIFIED',
          ])
          .default('UNSPECIFIED'),

      temperatureCelsius:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      temperatureSite:
        z
          .enum([
            'ORAL',
            'AXILLARY',
            'TYMPANIC',
            'RECTAL',
            'TEMPORAL',
            'OTHER',
            'UNSPECIFIED',
          ])
          .default('UNSPECIFIED'),

      pulsePerMinute:
        z
          .number()
          .int()
          .min(0)
          .max(400)
          .nullable()
          .optional(),

      respiratoryRatePerMinute:
        z
          .number()
          .int()
          .min(0)
          .max(150)
          .nullable()
          .optional(),

      systolicBloodPressureMmHg:
        z
          .number()
          .int()
          .min(20)
          .max(350)
          .nullable()
          .optional(),

      diastolicBloodPressureMmHg:
        z
          .number()
          .int()
          .min(10)
          .max(250)
          .nullable()
          .optional(),

      oxygenSaturationPercent:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      bloodGlucoseMgDl:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      painScore:
        z
          .number()
          .int()
          .min(0)
          .max(10)
          .nullable()
          .optional(),

      weightKg:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      oxygenDeliveryMethod:
        nullableText(
          1,
          200,
        ),

      oxygenFlowLitresPerMinute:
        inpatientMoneyStringSchema
          .nullable()
          .optional(),

      notes:
        nullableText(
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
        const measurements = [
          input.temperatureCelsius,
          input.pulsePerMinute,
          input.respiratoryRatePerMinute,
          input.systolicBloodPressureMmHg,
          input.diastolicBloodPressureMmHg,
          input.oxygenSaturationPercent,
          input.bloodGlucoseMgDl,
          input.painScore,
          input.weightKg,
        ];

        if (
          measurements.every(
            (value) =>
              value == null,
          )
        ) {
          context.addIssue({
            code:
              'custom',

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
            code:
              'custom',

            path: [
              'systolicBloodPressureMmHg',
            ],

            message:
              'Systolic and diastolic blood pressure must be recorded together',
          });
        }
      },
    );

export const createNursingNoteBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      noteType:
        z.enum(
          nursingNoteTypeValues,
        ),

      observationSeverity:
        z
          .enum(
            nursingObservationSeverityValues,
          )
          .default('ROUTINE'),

      title:
        z
          .string()
          .trim()
          .min(2)
          .max(300),

      content:
        z
          .string()
          .trim()
          .min(1)
          .max(50_000),

      recordedAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      intakeOutput:
        z
          .object({
            direction:
              z.enum(
                nursingIntakeOutputDirectionValues,
              ),

            route:
              z.enum(
                nursingIntakeOutputRouteValues,
              ),

            amountMillilitres:
              inpatientMoneyStringSchema,

            description:
              nullableText(
                1,
                1_000,
              ),
          })
          .strict()
          .nullable()
          .optional(),

      requiresEscalation:
        z
          .boolean()
          .default(false),

      escalationRecipientStaffId:
        inpatientObjectIdSchema
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
          input.noteType ===
            'INTAKE_OUTPUT' &&
          input.intakeOutput ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'intakeOutput',
            ],

            message:
              'Intake/output notes require structured intake/output details',
          });
        }

        if (
          input.noteType !==
            'INTAKE_OUTPUT' &&
          input.intakeOutput !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'intakeOutput',
            ],

            message:
              'Only intake/output notes may include structured intake/output details',
          });
        }

        if (
          input.requiresEscalation &&
          input.escalationRecipientStaffId ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'escalationRecipientStaffId',
            ],

            message:
              'Escalated observations require a recipient',
          });
        }
      },
    );

export const correctNursingNoteBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,

      replacement:
        createNursingNoteBodySchema
          .omit({
            admissionId:
              true,
          }),
    })
    .strict();

export const createMedicationScheduleBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      prescriptionId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      prescriptionItemId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      source:
        z.enum(
          medicationAdministrationSourceValues,
        ),

      medicineId:
        inpatientObjectIdSchema,

      formularyItemId:
        inpatientObjectIdSchema
          .nullable()
          .optional(),

      medicineDisplay:
        z
          .string()
          .trim()
          .min(1)
          .max(500),

      prescribedDose:
        inpatientMoneyStringSchema,

      doseUnitCode:
        z
          .string()
          .trim()
          .min(1)
          .max(80),

      route:
        z.enum(
          medicationAdministrationRouteValues,
        ),

      frequencyCode:
        z
          .string()
          .trim()
          .min(1)
          .max(80),

      scheduledTimes:
        z
          .array(
            inpatientIsoDateTimeSchema,
          )
          .max(1_000)
          .default([]),

      prn:
        z
          .boolean()
          .default(false),

      prnIndication:
        nullableText(
          3,
          1_000,
        ),

      startAt:
        inpatientIsoDateTimeSchema,

      endAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

      orderedByUserId:
        inpatientObjectIdSchema,

      orderedByStaffId:
        inpatientObjectIdSchema,
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
            input.prescriptionId ==
              null ||
            input.prescriptionItemId ==
              null
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
              'Non-PRN medication schedules require at least one scheduled time',
          });
        }

        if (
          input.prn &&
          input.prnIndication ==
            null
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

        if (
          input.endAt != null &&
          new Date(
            input.endAt,
          ) <=
            new Date(
              input.startAt,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'endAt',
            ],

            message:
              'Medication schedule end time must follow its start time',
          });
        }
      },
    );

export const recordMedicationDoseBodySchema =
  z
    .object({
      expectedScheduleVersion:
        inpatientExpectedVersionSchema,

      scheduledAt:
        inpatientIsoDateTimeSchema,

      status:
        z.enum(
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
                'Dose recording requires a final or delayed dose status',
            },
          ),

      administeredDose:
        inpatientMoneyStringSchema
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
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),

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
        inpatientIsoDateTimeSchema
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
          input.status ===
            'ADMINISTERED' &&
          (
            input.administeredDose ==
              null ||
            input.administeredRoute ==
              null ||
            input.administeredAt ==
              null
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              'Administered doses require administered dose, route, and time',
          });
        }

        if (
          [
            'OMITTED',
            'REFUSED',
            'DELAYED',
          ].includes(
            input.status,
          ) &&
          (
            input.reasonCode ==
              null ||
            input.reason ==
              null
          )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'reason',
            ],

            message:
              'Omitted, refused, and delayed doses require a reason',
          });
        }

        if (
          input.status ===
            'DELAYED' &&
          input.delayedUntil ==
            null
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
      },
    );

export const correctMedicationAdministrationBodySchema =
  z
    .object({
      expectedAdministrationVersion:
        inpatientExpectedVersionSchema,

      reason:
        inpatientReasonSchema,

      replacement:
        recordMedicationDoseBodySchema,
    })
    .strict();

export const createWardHandoverBodySchema =
  z
    .object({
      admissionId:
        inpatientObjectIdSchema,

      handoverType:
        z.enum(
          wardHandoverTypeValues,
        ),

      shiftCode:
        z
          .string()
          .trim()
          .min(1)
          .max(80),

      summary:
        z
          .string()
          .trim()
          .min(1)
          .max(50_000),

      activeConcerns:
        z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(2_000),
          )
          .max(100)
          .default([]),

      pendingTasks:
        z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(2_000),
          )
          .max(100)
          .default([]),

      medicationConcerns:
        z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(2_000),
          )
          .max(100)
          .default([]),

      safetyConcerns:
        z
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
        inpatientObjectIdSchema,

      toNurseStaffId:
        inpatientObjectIdSchema,

      handedOverAt:
        inpatientIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict();

export const acknowledgeWardHandoverBodySchema =
  z
    .object({
      expectedVersion:
        inpatientExpectedVersionSchema,
    })
    .strict();