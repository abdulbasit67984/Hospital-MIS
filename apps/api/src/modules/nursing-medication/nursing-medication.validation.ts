import {
  z,
} from 'zod';

import {
  intakeOutputCategoryValues,
  intakeOutputDirectionValues,
  intakeOutputEntryStatusValues,
  nursingAssessmentRiskLevelValues,
  nursingAssessmentStatusValues,
  nursingAssessmentTypeValues,
  nursingCarePlanGoalStatusValues,
  nursingCarePlanProblemStatusValues,
  nursingCarePlanStatusValues,
  nursingDeviceObservationTypeValues,
  nursingDeviceStatusValues,
  nursingDeviceTypeValues,
  nursingInterventionFrequencyTypeValues,
  nursingTaskPriorityValues,
  nursingTaskSourceTypeValues,
  nursingTaskStatusValues,
  woundClassificationValues,
} from '@hospital-mis/database';

import {
  DEFAULT_NURSING_MEDICATION_PAGE_SIZE,
  INTAKE_OUTPUT_SORT_FIELDS,
  MAX_NURSING_MEDICATION_PAGE_SIZE,
  NURSING_ASSESSMENT_SORT_FIELDS,
  NURSING_CARE_PLAN_SORT_FIELDS,
  NURSING_DEVICE_SORT_FIELDS,
  NURSING_TASK_SORT_FIELDS,
} from './nursing-medication.constants.js';

export const nursingObjectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

export const nursingExpectedVersionSchema = z
  .number()
  .int()
  .min(0);

export const nursingIsoDateTimeSchema = z
  .string()
  .datetime({
    offset: true,
  });

export const nursingReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(5_000);

export const nursingDecimalStringSchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(?:\.\d{1,4})?$/u,
    'Expected a non-negative decimal with no more than four decimal places',
  );

const positiveDecimalStringSchema =
  nursingDecimalStringSchema.refine(
    (value) => Number(value) > 0,
    'Expected a decimal value greater than zero',
  );

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

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100);

const optionalObjectIdSchema =
  nursingObjectIdSchema
    .nullable()
    .optional();

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_NURSING_MEDICATION_PAGE_SIZE)
  .default(
    DEFAULT_NURSING_MEDICATION_PAGE_SIZE,
  );

export const nursingMutationHeadersSchema = z
  .object({
    'idempotency-key': z
      .string()
      .trim()
      .min(8)
      .max(200)
      .regex(
        /^[A-Za-z0-9._:/-]+$/u,
        'Idempotency key contains unsupported characters',
      ),

    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const nursingReadHeadersSchema = z
  .object({
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const nursingEntityParamsSchema = z
  .object({
    admissionId:
      nursingObjectIdSchema.optional(),

    assessmentId:
      nursingObjectIdSchema.optional(),

    carePlanId:
      nursingObjectIdSchema.optional(),

    taskId:
      nursingObjectIdSchema.optional(),

    entryId:
      nursingObjectIdSchema.optional(),

    deviceId:
      nursingObjectIdSchema.optional(),

    observationId:
      nursingObjectIdSchema.optional(),
  })
  .strict();

const assessmentSectionSchema = z
  .object({
    sectionCode: codeSchema,

    sectionLabel: z
      .string()
      .trim()
      .min(1)
      .max(200),

    values: z.record(
      z.string(),
      z.unknown(),
    ),

    narrative:
      nullableText(1, 10_000),

    riskLevel: z
      .enum(
        nursingAssessmentRiskLevelValues,
      )
      .default('NOT_ASSESSED'),

    score:
      nursingDecimalStringSchema
        .nullable()
        .optional(),
  })
  .strict();

export const createNursingAssessmentBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      assessmentType: z.enum(
        nursingAssessmentTypeValues,
      ),

      templateCode:
        nullableText(1, 100),

      templateVersion: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional(),

      sections: z
        .array(assessmentSectionSchema)
        .min(1)
        .max(100),

      summary:
        nullableText(1, 20_000),

      overallRiskLevel: z
        .enum(
          nursingAssessmentRiskLevelValues,
        )
        .default('NOT_ASSESSED'),

      requiresEscalation: z
        .boolean()
        .default(false),

      escalationReason:
        nullableText(5, 2_000),

      assessedAt:
        nursingIsoDateTimeSchema,

      backdatedEntryReason:
        nullableText(5, 2_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.assessmentType ===
            'CUSTOM' &&
          input.templateCode == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'templateCode',
            ],
            message:
              'Custom assessments require a template code',
          });
        }

        if (
          input.assessmentType !==
            'CUSTOM' &&
          input.templateCode != null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'templateCode',
            ],
            message:
              'Template code is only accepted for custom assessments',
          });
        }

        if (
          input.requiresEscalation &&
          input.escalationReason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'escalationReason',
            ],
            message:
              'Escalated assessments require a reason',
          });
        }

        const codes =
          input.sections.map(
            (section) =>
              section.sectionCode
                .trim()
                .toUpperCase(),
          );

        if (
          new Set(codes).size !==
          codes.length
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'sections',
            ],
            message:
              'Assessment section codes must be unique',
          });
        }
      },
    );

export const signNursingAssessmentBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,
    })
    .strict();

export const correctNursingAssessmentBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        createNursingAssessmentBodySchema.omit({
          admissionId: true,
        }),
    })
    .strict();

export const markNursingAssessmentEnteredInErrorBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

const carePlanGoalSchema = z
  .object({
    goalId:
      optionalObjectIdSchema,

    description: z
      .string()
      .trim()
      .min(2)
      .max(5_000),

    expectedOutcome: z
      .string()
      .trim()
      .min(2)
      .max(5_000),

    targetDate:
      nursingIsoDateTimeSchema
        .nullable()
        .optional(),

    status: z
      .enum(
        nursingCarePlanGoalStatusValues,
      )
      .default('PLANNED'),

    evaluation:
      nullableText(1, 5_000),
  })
  .strict();

const interventionFrequencySchema =
  z
    .object({
      type: z.enum(
        nursingInterventionFrequencyTypeValues,
      ),

      intervalMinutes: z
        .number()
        .int()
        .min(1)
        .max(525_600)
        .nullable()
        .optional(),

      timesOfDay: z
        .array(
          z
            .string()
            .regex(
              /^([01]\d|2[0-3]):[0-5]\d$/u,
            ),
        )
        .max(24)
        .default([]),

      shiftCodes: z
        .array(codeSchema)
        .max(20)
        .default([]),

      instruction:
        nullableText(1, 1_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.type ===
            'INTERVAL' &&
          input.intervalMinutes == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'intervalMinutes',
            ],
            message:
              'Interval frequency requires intervalMinutes',
          });
        }

        if (
          input.type ===
            'SHIFT' &&
          input.shiftCodes.length === 0
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'shiftCodes',
            ],
            message:
              'Shift frequency requires at least one shift code',
          });
        }

        if (
          input.type ===
            'CUSTOM' &&
          input.instruction == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'instruction',
            ],
            message:
              'Custom frequency requires an instruction',
          });
        }
      },
    );

const carePlanInterventionSchema =
  z
    .object({
      interventionId:
        optionalObjectIdSchema,

      description: z
        .string()
        .trim()
        .min(2)
        .max(5_000),

      frequency:
        interventionFrequencySchema,

      assignedStaffId:
        optionalObjectIdSchema,

      assignedTeamCode:
        nullableText(1, 100),

      startsAt:
        nursingIsoDateTimeSchema,

      endsAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      active: z
        .boolean()
        .default(true),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.endsAt != null &&
          Date.parse(
            input.endsAt,
          ) <=
            Date.parse(
              input.startsAt,
            )
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'endsAt',
            ],
            message:
              'Intervention end time must be after its start time',
          });
        }
      },
    );

const carePlanProblemSchema = z
  .object({
    problemId:
      optionalObjectIdSchema,

    problemCode:
      nullableText(1, 100),

    description: z
      .string()
      .trim()
      .min(2)
      .max(5_000),

    identifiedAt:
      nursingIsoDateTimeSchema,

    sourceAssessmentId:
      optionalObjectIdSchema,

    status: z
      .enum(
        nursingCarePlanProblemStatusValues,
      )
      .default('ACTIVE'),

    goals: z
      .array(carePlanGoalSchema)
      .max(100)
      .default([]),

    interventions: z
      .array(
        carePlanInterventionSchema,
      )
      .max(100)
      .default([]),
  })
  .strict();

export const createNursingCarePlanBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      title: z
        .string()
        .trim()
        .min(2)
        .max(300),

      problems: z
        .array(
          carePlanProblemSchema,
        )
        .min(1)
        .max(100),

      assignedNurseStaffId:
        optionalObjectIdSchema,

      assignedTeamCode:
        nullableText(1, 100),

      startedAt:
        nursingIsoDateTimeSchema,

      targetCompletionAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      nextReviewAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict()
    .superRefine(
      (input, context) => {
        const startedAt =
          Date.parse(
            input.startedAt,
          );

        if (
          input.targetCompletionAt !=
            null &&
          Date.parse(
            input.targetCompletionAt,
          ) < startedAt
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'targetCompletionAt',
            ],
            message:
              'Target completion cannot precede care-plan start',
          });
        }

        if (
          input.nextReviewAt !=
            null &&
          Date.parse(
            input.nextReviewAt,
          ) < startedAt
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'nextReviewAt',
            ],
            message:
              'Next review cannot precede care-plan start',
          });
        }
      },
    );

export const reviewNursingCarePlanBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      problems: z
        .array(
          carePlanProblemSchema,
        )
        .min(1)
        .max(100),

      outcomeEvaluation:
        nullableText(1, 10_000),

      nextReviewAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict();

export const completeNursingCarePlanBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      outcomeEvaluation: z
        .string()
        .trim()
        .min(2)
        .max(10_000),
    })
    .strict();

export const cancelNursingCarePlanBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const correctNursingCarePlanBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        createNursingCarePlanBodySchema.omit({
          admissionId: true,
        }),
    })
    .strict();

export const createNursingTaskBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      sourceType: z.enum(
        nursingTaskSourceTypeValues,
      ),

      sourceRecordId:
        optionalObjectIdSchema,

      carePlanId:
        optionalObjectIdSchema,

      carePlanInterventionId:
        optionalObjectIdSchema,

      title: z
        .string()
        .trim()
        .min(2)
        .max(300),

      instructions:
        nullableText(1, 10_000),

      priority: z
        .enum(
          nursingTaskPriorityValues,
        )
        .default('ROUTINE'),

      assignedStaffId:
        optionalObjectIdSchema,

      assignedTeamCode:
        nullableText(1, 100),

      scheduledAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      dueAt:
        nursingIsoDateTimeSchema,

      recurrenceKey:
        nullableText(1, 300),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.scheduledAt !=
            null &&
          Date.parse(
            input.dueAt,
          ) <
            Date.parse(
              input.scheduledAt,
            )
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'dueAt',
            ],
            message:
              'Task due time cannot precede scheduled time',
          });
        }

        if (
          input.sourceType ===
            'CARE_PLAN' &&
          input.carePlanId == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'carePlanId',
            ],
            message:
              'Care-plan tasks require a carePlanId',
          });
        }
      },
    );

export const changeNursingTaskStatusBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      status: z
        .enum(
          nursingTaskStatusValues,
        )
        .exclude([
          'PENDING',
        ]),

      dispositionReasonCode:
        nullableText(1, 100),

      dispositionReason:
        nullableText(5, 2_000),

      delayedUntil:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      escalatedToStaffId:
        optionalObjectIdSchema,

      escalationReason:
        nullableText(5, 2_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          [
            'OMITTED',
            'DELAYED',
            'REFUSED',
            'CANCELLED',
          ].includes(
            input.status,
          ) &&
          input.dispositionReason ==
            null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'dispositionReason',
            ],
            message:
              `${input.status} tasks require a disposition reason`,
          });
        }

        if (
          input.status ===
            'DELAYED' &&
          input.delayedUntil == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'delayedUntil',
            ],
            message:
              'Delayed tasks require delayedUntil',
          });
        }

        if (
          input.status ===
            'ESCALATED' &&
          input.escalationReason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'escalationReason',
            ],
            message:
              'Escalated tasks require an escalation reason',
          });
        }
      },
    );

export const carryForwardNursingTaskBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      dueAt:
        nursingIsoDateTimeSchema,

      assignedStaffId:
        optionalObjectIdSchema,

      assignedTeamCode:
        nullableText(1, 100),

      reason:
        nursingReasonSchema,
    })
    .strict();

export const recordIntakeOutputBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      direction: z.enum(
        intakeOutputDirectionValues,
      ),

      category: z.enum(
        intakeOutputCategoryValues,
      ),

      sourceDescription:
        nullableText(1, 1_000),

      quantity:
        positiveDecimalStringSchema,

      unitCode:
        codeSchema,

      conversionFactorToMillilitres:
        positiveDecimalStringSchema,

      occurredAt:
        nursingIsoDateTimeSchema,

      shiftCode:
        codeSchema,

      backdatedEntryReason:
        nullableText(5, 2_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        const intakeCategories = [
          'ORAL',
          'ENTERAL',
          'INTRAVENOUS',
          'BLOOD_PRODUCT',
          'OTHER',
        ];

        const outputCategories = [
          'URINE',
          'DRAIN',
          'VOMIT',
          'STOOL',
          'OTHER',
        ];

        const allowed =
          input.direction ===
          'INTAKE'
            ? intakeCategories
            : outputCategories;

        if (
          !allowed.includes(
            input.category,
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'category',
            ],
            message:
              `${input.category} is not valid for ${input.direction}`,
          });
        }
      },
    );

export const correctIntakeOutputBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,

      replacement:
        recordIntakeOutputBodySchema.omit({
          admissionId: true,
        }),
    })
    .strict();

export const markIntakeOutputEnteredInErrorBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

const woundDetailsSchema = z
  .object({
    classification: z.enum(
      woundClassificationValues,
    ),

    anatomicalLocation:
      nullableText(1, 500),

    stageOrGrade:
      nullableText(1, 100),

    lengthCm:
      nursingDecimalStringSchema
        .nullable()
        .optional(),

    widthCm:
      nursingDecimalStringSchema
        .nullable()
        .optional(),

    depthCm:
      nursingDecimalStringSchema
        .nullable()
        .optional(),

    dressingType:
      nullableText(1, 500),
  })
  .strict();

export const createNursingDeviceBodySchema =
  z
    .object({
      admissionId:
        nursingObjectIdSchema,

      deviceType: z.enum(
        nursingDeviceTypeValues,
      ),

      deviceName: z
        .string()
        .trim()
        .min(2)
        .max(300),

      anatomicalSite: z
        .string()
        .trim()
        .min(2)
        .max(500),

      laterality:
        nullableText(1, 50),

      woundDetails:
        woundDetailsSchema
          .nullable()
          .optional(),

      insertedAt:
        nursingIsoDateTimeSchema
          .nullable()
          .optional(),

      insertedByStaffId:
        optionalObjectIdSchema,

      backdatedEntryReason:
        nullableText(5, 2_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.deviceType ===
            'WOUND' &&
          input.woundDetails == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'woundDetails',
            ],
            message:
              'Wound records require woundDetails',
          });
        }

        if (
          input.deviceType !==
            'WOUND' &&
          input.woundDetails != null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'woundDetails',
            ],
            message:
              'Wound details are only valid for wound records',
          });
        }
      },
    );

export const recordNursingDeviceObservationBodySchema =
  z
    .object({
      observationType: z.enum(
        nursingDeviceObservationTypeValues,
      ),

      observedAt:
        nursingIsoDateTimeSchema,

      siteCondition:
        nullableText(1, 5_000),

      dressingType:
        nullableText(1, 500),

      outputMillilitres:
        nursingDecimalStringSchema
          .nullable()
          .optional(),

      infectionIndicators: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(300),
        )
        .max(100)
        .default([]),

      findings: z
        .record(
          z.string(),
          z.unknown(),
        )
        .default({}),

      narrative:
        nullableText(1, 10_000),

      requiresEscalation: z
        .boolean()
        .default(false),

      escalationReason:
        nullableText(5, 2_000),

      backdatedEntryReason:
        nullableText(5, 2_000),
    })
    .strict()
    .superRefine(
      (input, context) => {
        if (
          input.requiresEscalation &&
          input.escalationReason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'escalationReason',
            ],
            message:
              'Escalated device observations require a reason',
          });
        }
      },
    );

export const removeNursingDeviceBodySchema =
  z
    .object({
      expectedVersion:
        nursingExpectedVersionSchema,

      removedAt:
        nursingIsoDateTimeSchema,

      reason:
        nursingReasonSchema,
    })
    .strict();

export const nursingAssessmentListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      assessmentType: z
        .enum(
          nursingAssessmentTypeValues,
        )
        .optional(),

      status: z
        .enum(
          nursingAssessmentStatusValues,
        )
        .optional(),

      riskLevel: z
        .enum(
          nursingAssessmentRiskLevelValues,
        )
        .optional(),

      assessedFrom:
        nursingIsoDateTimeSchema.optional(),

      assessedTo:
        nursingIsoDateTimeSchema.optional(),

      sortBy: z
        .enum(
          NURSING_ASSESSMENT_SORT_FIELDS,
        )
        .default('assessedAt'),

      sortDirection: z
        .enum([
          'asc',
          'desc',
        ])
        .default('desc'),
    })
    .strict();

export const nursingCarePlanListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      assignedNurseStaffId:
        nursingObjectIdSchema.optional(),

      status: z
        .enum(
          nursingCarePlanStatusValues,
        )
        .optional(),

      reviewDueBefore:
        nursingIsoDateTimeSchema.optional(),

      sortBy: z
        .enum(
          NURSING_CARE_PLAN_SORT_FIELDS,
        )
        .default('startedAt'),

      sortDirection: z
        .enum([
          'asc',
          'desc',
        ])
        .default('desc'),
    })
    .strict();

export const nursingTaskListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      assignedStaffId:
        nursingObjectIdSchema.optional(),

      sourceType: z
        .enum(
          nursingTaskSourceTypeValues,
        )
        .optional(),

      status: z
        .enum(
          nursingTaskStatusValues,
        )
        .optional(),

      priority: z
        .enum(
          nursingTaskPriorityValues,
        )
        .optional(),

      dueFrom:
        nursingIsoDateTimeSchema.optional(),

      dueTo:
        nursingIsoDateTimeSchema.optional(),

      overdueAt:
        nursingIsoDateTimeSchema.optional(),

      sortBy: z
        .enum(
          NURSING_TASK_SORT_FIELDS,
        )
        .default('dueAt'),

      sortDirection: z
        .enum([
          'asc',
          'desc',
        ])
        .default('asc'),
    })
    .strict();

export const intakeOutputListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      shiftCode:
        codeSchema.optional(),

      direction: z
        .enum(
          intakeOutputDirectionValues,
        )
        .optional(),

      category: z
        .enum(
          intakeOutputCategoryValues,
        )
        .optional(),

      status: z
        .enum(
          intakeOutputEntryStatusValues,
        )
        .optional(),

      occurredFrom:
        nursingIsoDateTimeSchema.optional(),

      occurredTo:
        nursingIsoDateTimeSchema.optional(),

      sortBy: z
        .enum(
          INTAKE_OUTPUT_SORT_FIELDS,
        )
        .default('occurredAt'),

      sortDirection: z
        .enum([
          'asc',
          'desc',
        ])
        .default('desc'),
    })
    .strict();

export const nursingDeviceListQuerySchema =
  z
    .object({
      page:
        pageSchema,

      pageSize:
        pageSizeSchema,

      admissionId:
        nursingObjectIdSchema.optional(),

      patientId:
        nursingObjectIdSchema.optional(),

      wardId:
        nursingObjectIdSchema.optional(),

      deviceType: z
        .enum(
          nursingDeviceTypeValues,
        )
        .optional(),

      status: z
        .enum(
          nursingDeviceStatusValues,
        )
        .optional(),

      sortBy: z
        .enum(
          NURSING_DEVICE_SORT_FIELDS,
        )
        .default('createdAt'),

      sortDirection: z
        .enum([
          'asc',
          'desc',
        ])
        .default('desc'),
    })
    .strict();