import {
  z,
} from 'zod';

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

export const registrationQueueDashboardQuerySchema =
  z.object({
    serviceDate:
      serviceDateSchema,

    queueDefinitionId:
      objectIdSchema
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
  });

export const registrationQueueHistoryQuerySchema =
  z.object({
    includeReason:
      optionalBooleanQuerySchema
        .default(
          false,
        ),
  });

export const registrationQueuePublicDisplayQuerySchema =
  z.object({
    serviceDate:
      serviceDateSchema,

    queueDefinitionId:
      objectIdSchema,

    maximumEntries:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25),
  });

export const registrationQueueConfigurationQuerySchema =
  z.object({
    departmentId:
      objectIdSchema
        .optional(),

    clinicId:
      objectIdSchema
        .optional(),

    servicePointId:
      objectIdSchema
        .optional(),

    includeInactive:
      optionalBooleanQuerySchema
        .default(
          false,
        ),
  });

export const registrationNumberParamsSchema =
  z.object({
    registrationNumber:
      z
        .string()
        .trim()
        .min(3)
        .max(100)
        .transform(
          (value) =>
            value.toLocaleUpperCase(
              'en-US',
            ),
        ),
  });

export const opdVisitNumberParamsSchema =
  z.object({
    visitNumber:
      z
        .string()
        .trim()
        .min(3)
        .max(100)
        .transform(
          (value) =>
            value.toLocaleUpperCase(
              'en-US',
            ),
        ),
  });

export type RegistrationQueueDashboardHttpQuery =
  z.infer<
    typeof registrationQueueDashboardQuerySchema
  >;

export type RegistrationQueueHistoryHttpQuery =
  z.infer<
    typeof registrationQueueHistoryQuerySchema
  >;

export type RegistrationQueuePublicDisplayHttpQuery =
  z.infer<
    typeof registrationQueuePublicDisplayQuerySchema
  >;

export type RegistrationQueueConfigurationHttpQuery =
  z.infer<
    typeof registrationQueueConfigurationQuerySchema
  >;

export type RegistrationNumberParams =
  z.infer<
    typeof registrationNumberParamsSchema
  >;

export type OpdVisitNumberParams =
  z.infer<
    typeof opdVisitNumberParamsSchema
  >;