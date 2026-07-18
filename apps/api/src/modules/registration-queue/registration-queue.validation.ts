import {
  z,
} from 'zod';

import {
  opdVisitStatusValues,
  queueEntryStatusValues,
  queuePriorityClassValues,
  queueSpecialCategoryValues,
  queueStatusChangeSourceValues,
  queueTransferReasonValues,
  registrationModeValues,
  registrationSourceValues,
  registrationStatusValues,
  triagePriorityValues,
  visitTypeValues,
} from '@hospital-mis/database';

import {
  DEFAULT_REGISTRATION_QUEUE_PAGE_SIZE,
  MAX_REGISTRATION_QUEUE_PAGE_SIZE,
  OPD_VISIT_SORT_FIELDS,
  QUEUE_ENTRY_SORT_FIELDS,
  REGISTRATION_SORT_FIELDS,
} from './registration-queue.constants.js';

const objectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

const serviceDateSchema =
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/u,
      'Expected a service date in YYYY-MM-DD format',
    )
    .refine(
      (value) => {
        const date =
          new Date(
            `${value}T00:00:00.000Z`,
          );

        return (
          !Number.isNaN(
            date.getTime(),
          ) &&
          date
            .toISOString()
            .slice(
              0,
              10,
            ) === value
        );
      },
      'Expected a valid calendar date',
    );

const isoDateTimeSchema =
  z
    .string()
    .datetime({
      offset:
        true,
    });

const nullableObjectIdSchema =
  objectIdSchema
    .nullable()
    .optional();

const optionalNullableText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(
      minimumLength,
    )
    .max(
      maximumLength,
    )
    .nullable()
    .optional();

const reasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(1_000);

const paginationSchema =
  z.object({
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
        .max(
          MAX_REGISTRATION_QUEUE_PAGE_SIZE,
        )
        .default(
          DEFAULT_REGISTRATION_QUEUE_PAGE_SIZE,
        ),

    sortDirection:
      z
        .enum([
          'asc',
          'desc',
        ])
        .default(
          'desc',
        ),
  });

const optionalBooleanQuerySchema =
  z
    .union([
      z.boolean(),

      z
        .enum([
          'true',
          'false',
        ])
        .transform(
          (value) =>
            value === 'true',
        ),
    ])
    .optional();

export const registrationContextSchema =
  z.object({
    departmentId:
      objectIdSchema,

    clinicId:
      nullableObjectIdSchema,

    servicePointId:
      nullableObjectIdSchema,

    assignedProviderId:
      nullableObjectIdSchema,

    assignedCounterId:
      nullableObjectIdSchema,
  });

export const createRegistrationBodySchema =
  z
    .object({
      patientId:
        objectIdSchema,

      registrationMode:
        z.enum(
          registrationModeValues,
        ),

      registrationSource:
        z.enum(
          registrationSourceValues,
        ),

      visitType:
        z.enum(
          visitTypeValues,
        ),

      serviceDate:
        serviceDateSchema,

      arrivedAt:
        isoDateTimeSchema
          .optional(),

      checkedInAt:
        isoDateTimeSchema
          .nullable()
          .optional(),

      appointmentId:
        nullableObjectIdSchema,

      referralId:
        nullableObjectIdSchema,

      referralReference:
        optionalNullableText(
          1,
          160,
        ),

      emergencyCaseId:
        nullableObjectIdSchema,

      departmentId:
        objectIdSchema,

      clinicId:
        nullableObjectIdSchema,

      servicePointId:
        nullableObjectIdSchema,

      assignedProviderId:
        nullableObjectIdSchema,

      assignedCounterId:
        nullableObjectIdSchema,

      registrationNotes:
        optionalNullableText(
          1,
          2_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.registrationSource ===
            'APPOINTMENT' &&
          value.appointmentId ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'appointmentId',
            ],

            message:
              'Appointment registration requires appointmentId',
          });
        }

        if (
          value.registrationSource !==
            'APPOINTMENT' &&
          value.appointmentId !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'appointmentId',
            ],

            message:
              'appointmentId is only valid for appointment registration',
          });
        }

        if (
          value.registrationSource ===
            'REFERRAL' &&
          value.referralId ==
            null &&
          value.referralReference ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'referralId',
            ],

            message:
              'Referral registration requires referralId or referralReference',
          });
        }

        if (
          value.registrationSource ===
            'EMERGENCY' &&
          value.visitType !==
            'EMERGENCY'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'visitType',
            ],

            message:
              'Emergency registration requires EMERGENCY visit type',
          });
        }

        if (
          value.registrationSource ===
            'FOLLOW_UP' &&
          value.visitType !==
            'FOLLOW_UP'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'visitType',
            ],

            message:
              'Follow-up registration source requires FOLLOW_UP visit type',
          });
        }

        if (
          value.visitType ===
            'FOLLOW_UP' &&
          value.registrationMode !==
            'RETURNING_PATIENT'
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'registrationMode',
            ],

            message:
              'Follow-up visits require RETURNING_PATIENT registration mode',
          });
        }

        if (
          value.arrivedAt !==
            undefined &&
          value.checkedInAt !==
            undefined &&
          value.checkedInAt !==
            null &&
          new Date(
            value.checkedInAt,
          ).getTime() <
            new Date(
              value.arrivedAt,
            ).getTime()
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'checkedInAt',
            ],

            message:
              'Check-in cannot occur before arrival',
          });
        }
      },
    );

export const createQueueEntryBodySchema =
  z
    .object({
      queueDefinitionId:
        objectIdSchema,

      assignedProviderId:
        nullableObjectIdSchema,

      assignedCounterId:
        nullableObjectIdSchema,

      priorityClass:
        z
          .enum(
            queuePriorityClassValues,
          )
          .default(
            'ROUTINE',
          ),

      triagePriority:
        z
          .enum(
            triagePriorityValues,
          )
          .default(
            'NOT_TRIAGED',
          ),

      emergencyOverride:
        z
          .boolean()
          .default(
            false,
          ),

      emergencyOverrideReason:
        optionalNullableText(
          5,
          1_000,
        ),

      specialCategories:
        z
          .array(
            z.enum(
              queueSpecialCategoryValues,
            ),
          )
          .max(10)
          .default([])
          .refine(
            (values) =>
              new Set(
                values,
              ).size ===
              values.length,
            'Queue special categories must be unique',
          ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.emergencyOverride &&
          value.emergencyOverrideReason ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'emergencyOverrideReason',
            ],

            message:
              'Emergency override requires a documented reason',
          });
        }

        if (
          !value.emergencyOverride &&
          value.emergencyOverrideReason !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'emergencyOverrideReason',
            ],

            message:
              'Emergency override reason is only valid when override is enabled',
          });
        }
      },
    );

export const registerOpdVisitBodySchema =
  z.object({
    registration:
      createRegistrationBodySchema,

    queue:
      createQueueEntryBodySchema
        .nullable()
        .optional(),
  });

export const cancelRegistrationBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    reason:
      reasonSchema,
  });

export const cancelOpdVisitBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    reason:
      reasonSchema,
  });

export const markOpdVisitNoShowBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    reason:
      reasonSchema,
  });

export const correctOpdVisitBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    reason:
      reasonSchema,

    replacement:
      createRegistrationBodySchema,

    queue:
      createQueueEntryBodySchema
        .nullable()
        .optional(),
  });

export const updateQueueAssignmentBodySchema =
  z
    .object({
      expectedVersion:
        z
          .number()
          .int()
          .min(0),

      assignedProviderId:
        nullableObjectIdSchema,

      assignedCounterId:
        nullableObjectIdSchema,

      reason:
        reasonSchema,
    })
    .refine(
      (value) =>
        value.assignedProviderId !==
          undefined ||
        value.assignedCounterId !==
          undefined,
      {
        message:
          'At least one assignment must be provided',

        path: [
          'assignedProviderId',
        ],
      },
    );

export const updateQueuePriorityBodySchema =
  z
    .object({
      expectedVersion:
        z
          .number()
          .int()
          .min(0),

      priorityClass:
        z.enum(
          queuePriorityClassValues,
        ),

      triagePriority:
        z.enum(
          triagePriorityValues,
        ),

      emergencyOverride:
        z.boolean(),

      emergencyOverrideReason:
        optionalNullableText(
          5,
          1_000,
        ),

      specialCategories:
        z
          .array(
            z.enum(
              queueSpecialCategoryValues,
            ),
          )
          .max(10)
          .refine(
            (values) =>
              new Set(
                values,
              ).size ===
              values.length,
            'Queue special categories must be unique',
          ),

      reason:
        reasonSchema,
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.emergencyOverride &&
          value.emergencyOverrideReason ==
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'emergencyOverrideReason',
            ],

            message:
              'Emergency override requires a documented reason',
          });
        }

        if (
          !value.emergencyOverride &&
          value.emergencyOverrideReason !=
            null
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'emergencyOverrideReason',
            ],

            message:
              'Emergency override reason is only valid when override is enabled',
          });
        }
      },
    );

const queueStatusWithoutTransferValues = [
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const changeQueueStatusBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    status:
      z.enum(
        queueStatusWithoutTransferValues,
      ),

    reason:
      optionalNullableText(
        5,
        1_000,
      ),

    counterId:
      nullableObjectIdSchema,

    providerId:
      nullableObjectIdSchema,

    changeSource:
      z.enum(
        queueStatusChangeSourceValues,
      ),
  });

export const transferQueueEntryBodySchema =
  z.object({
    expectedVersion:
      z
        .number()
        .int()
        .min(0),

    destinationQueueDefinitionId:
      objectIdSchema,

    destinationProviderId:
      nullableObjectIdSchema,

    destinationCounterId:
      nullableObjectIdSchema,

    transferReason:
      z.enum(
        queueTransferReasonValues,
      ),

    reason:
      reasonSchema,
  });

export const registrationListQuerySchema =
  paginationSchema
    .extend({
      sortBy:
        z
          .enum(
            REGISTRATION_SORT_FIELDS,
          )
          .default(
            'arrivedAt',
          ),

      patientId:
        objectIdSchema
          .optional(),

      serviceDateFrom:
        serviceDateSchema
          .optional(),

      serviceDateTo:
        serviceDateSchema
          .optional(),

      status:
        z
          .enum(
            registrationStatusValues,
          )
          .optional(),

      registrationSource:
        z
          .enum(
            registrationSourceValues,
          )
          .optional(),

      visitType:
        z
          .enum(
            visitTypeValues,
          )
          .optional(),

      departmentId:
        objectIdSchema
          .optional(),

      clinicId:
        objectIdSchema
          .optional(),

      servicePointId:
        objectIdSchema
          .optional(),

      assignedProviderId:
        objectIdSchema
          .optional(),
    })
    .refine(
      (value) =>
        value.serviceDateFrom ===
          undefined ||
        value.serviceDateTo ===
          undefined ||
        value.serviceDateFrom <=
          value.serviceDateTo,
      {
        message:
          'serviceDateFrom must not be after serviceDateTo',

        path: [
          'serviceDateTo',
        ],
      },
    );

export const opdVisitListQuerySchema =
  paginationSchema
    .extend({
      sortBy:
        z
          .enum(
            OPD_VISIT_SORT_FIELDS,
          )
          .default(
            'arrivedAt',
          ),

      patientId:
        objectIdSchema
          .optional(),

      serviceDateFrom:
        serviceDateSchema
          .optional(),

      serviceDateTo:
        serviceDateSchema
          .optional(),

      status:
        z
          .enum(
            opdVisitStatusValues,
          )
          .optional(),

      registrationSource:
        z
          .enum(
            registrationSourceValues,
          )
          .optional(),

      visitType:
        z
          .enum(
            visitTypeValues,
          )
          .optional(),

      departmentId:
        objectIdSchema
          .optional(),

      clinicId:
        objectIdSchema
          .optional(),

      servicePointId:
        objectIdSchema
          .optional(),

      assignedProviderId:
        objectIdSchema
          .optional(),

      assignedCounterId:
        objectIdSchema
          .optional(),
    })
    .refine(
      (value) =>
        value.serviceDateFrom ===
          undefined ||
        value.serviceDateTo ===
          undefined ||
        value.serviceDateFrom <=
          value.serviceDateTo,
      {
        message:
          'serviceDateFrom must not be after serviceDateTo',

        path: [
          'serviceDateTo',
        ],
      },
    );

export const queueEntryListQuerySchema =
  paginationSchema.extend({
    sortBy:
      z
        .enum(
          QUEUE_ENTRY_SORT_FIELDS,
        )
        .default(
          'queuedAt',
        ),

    serviceDate:
      serviceDateSchema,

    queueDefinitionId:
      objectIdSchema
        .optional(),

    status:
      z
        .enum(
          queueEntryStatusValues,
        )
        .optional(),

    assignedProviderId:
      objectIdSchema
        .optional(),

    assignedCounterId:
      objectIdSchema
        .optional(),

    patientId:
      objectIdSchema
        .optional(),

    priorityClass:
      z
        .enum(
          queuePriorityClassValues,
        )
        .optional(),

    triagePriority:
      z
        .enum(
          triagePriorityValues,
        )
        .optional(),

    emergencyOverride:
      optionalBooleanQuerySchema,
  });

export const registrationIdParamsSchema =
  z.object({
    registrationId:
      objectIdSchema,
  });

export const opdVisitIdParamsSchema =
  z.object({
    visitId:
      objectIdSchema,
  });

export const queueEntryIdParamsSchema =
  z.object({
    queueEntryId:
      z
        .string()
        .uuid(),
  });

export const queueDefinitionIdParamsSchema =
  z.object({
    queueDefinitionId:
      objectIdSchema,
  });

export type CreateRegistrationBody =
  z.infer<
    typeof createRegistrationBodySchema
  >;

export type CreateQueueEntryBody =
  z.infer<
    typeof createQueueEntryBodySchema
  >;

export type RegisterOpdVisitBody =
  z.infer<
    typeof registerOpdVisitBodySchema
  >;

export type CancelRegistrationBody =
  z.infer<
    typeof cancelRegistrationBodySchema
  >;

export type CancelOpdVisitBody =
  z.infer<
    typeof cancelOpdVisitBodySchema
  >;

export type MarkOpdVisitNoShowBody =
  z.infer<
    typeof markOpdVisitNoShowBodySchema
  >;

export type CorrectOpdVisitBody =
  z.infer<
    typeof correctOpdVisitBodySchema
  >;

export type UpdateQueueAssignmentBody =
  z.infer<
    typeof updateQueueAssignmentBodySchema
  >;

export type UpdateQueuePriorityBody =
  z.infer<
    typeof updateQueuePriorityBodySchema
  >;

export type ChangeQueueStatusBody =
  z.infer<
    typeof changeQueueStatusBodySchema
  >;

export type TransferQueueEntryBody =
  z.infer<
    typeof transferQueueEntryBodySchema
  >;

export type RegistrationListHttpQuery =
  z.infer<
    typeof registrationListQuerySchema
  >;

export type OpdVisitListHttpQuery =
  z.infer<
    typeof opdVisitListQuerySchema
  >;

export type QueueEntryListHttpQuery =
  z.infer<
    typeof queueEntryListQuerySchema
  >;