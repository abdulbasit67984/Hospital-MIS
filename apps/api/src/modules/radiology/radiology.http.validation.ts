import {
  z,
} from 'zod';

import {
  radiologyAppointmentStatusValues,
  radiologyCatalogStatusValues,
  radiologyOrderPriorityValues,
  radiologyOrderStatusValues,
} from '@hospital-mis/database';

import {
  radiologyObjectIdSchema,
} from './radiology.validation.js';

import {
  radiologyOperationsQuerySchema,
} from './radiology-operations.validation.js';

const positiveIntegerFromQuery = (
  defaultValue:
    number,

  maximum:
    number,
) =>
  z.preprocess(
    (
      value,
    ) =>
      value ===
        undefined ||
      value ===
        ''
        ? defaultValue
        : Number(
            value,
          ),

    z
      .number()
      .int()
      .min(
        1,
      )
      .max(
        maximum,
      ),
  );

const optionalIsoDateTime =
  z
    .string()
    .trim()
    .datetime({
      offset:
        true,
    })
    .optional();

export const radiologyEntityIdParamsSchema =
  z
    .object({
      id:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyOrderIdParamsSchema =
  z
    .object({
      orderId:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyAppointmentIdParamsSchema =
  z
    .object({
      appointmentId:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyReportIdParamsSchema =
  z
    .object({
      reportId:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyEncounterIdParamsSchema =
  z
    .object({
      encounterId:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyPatientIdParamsSchema =
  z
    .object({
      patientId:
        radiologyObjectIdSchema,
    })
    .strict();

export const radiologyCatalogQuerySchema =
  z
    .object({
      q:
        z
          .string()
          .trim()
          .max(
            200,
          )
          .optional(),

      modalityId:
        radiologyObjectIdSchema.optional(),

      departmentId:
        radiologyObjectIdSchema.optional(),

      status:
        z
          .enum(
            radiologyCatalogStatusValues,
          )
          .optional(),

      effectiveAt:
        optionalIsoDateTime,

      page:
        positiveIntegerFromQuery(
          1,
          100_000,
        ),

      pageSize:
        positiveIntegerFromQuery(
          25,
          100,
        ),
    })
    .strict();

export const radiologyOrderQuerySchema =
  z
    .object({
      status:
        z
          .enum(
            radiologyOrderStatusValues,
          )
          .optional(),

      priority:
        z
          .enum(
            radiologyOrderPriorityValues,
          )
          .optional(),

      patientId:
        radiologyObjectIdSchema.optional(),

      encounterId:
        radiologyObjectIdSchema.optional(),

      departmentId:
        radiologyObjectIdSchema.optional(),

      orderedFrom:
        optionalIsoDateTime,

      orderedTo:
        optionalIsoDateTime,

      page:
        positiveIntegerFromQuery(
          1,
          100_000,
        ),

      pageSize:
        positiveIntegerFromQuery(
          25,
          100,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.orderedFrom !==
            undefined &&
          value.orderedTo !==
            undefined &&
          new Date(
            value.orderedTo,
          ) <
            new Date(
              value.orderedFrom,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'orderedTo',
            ],

            message:
              'orderedTo cannot precede orderedFrom',
          });
        }
      },
    );

export const radiologyAppointmentQuerySchema =
  radiologyOperationsQuerySchema
    .extend({
      appointmentStatus:
        z
          .enum(
            radiologyAppointmentStatusValues,
          )
          .optional(),

      page:
        positiveIntegerFromQuery(
          1,
          100_000,
        ),

      pageSize:
        positiveIntegerFromQuery(
          25,
          100,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.scheduledFrom !==
            undefined &&
          value.scheduledTo !==
            undefined &&
          new Date(
            value.scheduledTo,
          ) <
            new Date(
              value.scheduledFrom,
            )
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'scheduledTo',
            ],

            message:
              'scheduledTo cannot precede scheduledFrom',
          });
        }
      },
    );

export const radiologyHistoryQuerySchema =
  z
    .object({
      page:
        positiveIntegerFromQuery(
          1,
          100_000,
        ),

      pageSize:
        positiveIntegerFromQuery(
          25,
          100,
        ),
    })
    .strict();

/*
 * Catalog and order workflows perform their complete domain DTO validation.
 * The HTTP boundary still requires a JSON object and rejects primitive or
 * array payloads before invoking those workflows.
 */
export const radiologyWorkflowBodySchema =
  z
    .record(
      z.string(),
      z.unknown(),
    )
    .refine(
      (
        value,
      ) =>
        !Array.isArray(
          value,
        ),

      'Expected a JSON object',
    );

export {
  cancelRadiologyAppointmentBodySchema,
  changeRadiologyResourceStatusBodySchema,
  checkInRadiologyExaminationBodySchema,
  completeRadiologyExaminationBodySchema,
  createRadiologyResourceBodySchema,
  recordRadiologySafetyScreeningBodySchema,
  registerRadiologyImagingStudyBodySchema,
  scheduleRadiologyAppointmentBodySchema,
  startRadiologyExaminationBodySchema,
} from './radiology-operations.validation.js';

export {
  acknowledgeRadiologyCriticalCommunicationBodySchema,
  addRadiologyReportAddendumBodySchema,
  assignRadiologyReportBodySchema,
  changeRadiologyReportPublicationBodySchema,
  correctRadiologyReportBodySchema,
  finalizeRadiologyReportBodySchema,
  recordRadiologyCriticalCommunicationBodySchema,
  renderRadiologyReportBodySchema,
  saveRadiologyReportDraftBodySchema,
  submitRadiologyPreliminaryBodySchema,
} from './radiology-reporting.contracts.js';