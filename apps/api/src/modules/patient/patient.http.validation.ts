import {
  z,
} from 'zod';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

const reasonSchema = z
  .string()
  .trim()
  .min(3)
  .max(1_000);

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(
    /^[A-Za-z0-9._:-]+$/u,
    'Use letters, numbers, periods, underscores, colons, or hyphens',
  );

const isoDateTimeSchema = z
  .string()
  .datetime({
    offset:
      true,
  });

export const patientMutationHeadersSchema =
  z.object({
    'idempotency-key':
      idempotencyKeySchema,
  });

export const patientReadHeadersSchema =
  z.object({
    'x-patient-access-level': z
      .enum([
        'STANDARD',
        'SENSITIVE',
      ])
      .default('STANDARD'),
  });

export const patientPathParamsSchema =
  z.object({
    patientId:
      objectIdSchema,
  });

export const guardianPathParamsSchema =
  z.object({
    guardianId:
      objectIdSchema,
  });

export const patientIdentifierPathParamsSchema =
  z.object({
    identifierId:
      objectIdSchema,
  });

export const patientGuardianRelationshipPathParamsSchema =
  z.object({
    relationshipId:
      objectIdSchema,
  });

export const patientContactPathParamsSchema =
  z.object({
    contactId:
      objectIdSchema,
  });

export const patientAddressPathParamsSchema =
  z.object({
    addressId:
      objectIdSchema,
  });

export const patientAlertPathParamsSchema =
  z.object({
    alertId:
      objectIdSchema,
  });

export const patientMergePathParamsSchema =
  z.object({
    mergeId: z
      .string()
      .uuid(),
  });

export const addPatientIdentifierBodySchema =
  z
    .object({
      identifierType: z.enum([
        'CNIC',
        'B_FORM',
        'PASSPORT',
        'OTHER',
      ]),

      value: z
        .string()
        .trim()
        .min(1)
        .max(160),

      issuingCountryCode: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/u)
        .default('PK'),

      issuingAuthority: z
        .string()
        .trim()
        .max(160)
        .nullable()
        .optional(),

      isPrimaryIdentity: z
        .boolean()
        .default(false),

      validFrom:
        isoDateTimeSchema
          .nullable()
          .optional(),

      expiresAt:
        isoDateTimeSchema
          .nullable()
          .optional(),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.validFrom !==
            undefined &&
          value.validFrom !==
            null &&
          value.expiresAt !==
            undefined &&
          value.expiresAt !==
            null &&
          new Date(
            value.expiresAt,
          ).getTime() <=
            new Date(
              value.validFrom,
            ).getTime()
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'expiresAt',
            ],

            message:
              'Identifier expiry must be after validFrom',
          });
        }
      },
    );

export const verifyPatientIdentifierBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason:
      reasonSchema,
  });

export const revokePatientIdentifierBodySchema =
  verifyPatientIdentifierBodySchema;

export const verifyPatientGuardianBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason:
      reasonSchema,

    verificationNotes: z
      .string()
      .trim()
      .max(2_000)
      .nullable()
      .optional(),
  });

export type PatientMutationHeaders =
  z.infer<
    typeof patientMutationHeadersSchema
  >;

export type PatientReadHeaders =
  z.infer<
    typeof patientReadHeadersSchema
  >;

export type PatientPathParams =
  z.infer<
    typeof patientPathParamsSchema
  >;

export type GuardianPathParams =
  z.infer<
    typeof guardianPathParamsSchema
  >;

export type PatientIdentifierPathParams =
  z.infer<
    typeof patientIdentifierPathParamsSchema
  >;

export type PatientGuardianRelationshipPathParams =
  z.infer<
    typeof patientGuardianRelationshipPathParamsSchema
  >;

export type PatientContactPathParams =
  z.infer<
    typeof patientContactPathParamsSchema
  >;

export type PatientAddressPathParams =
  z.infer<
    typeof patientAddressPathParamsSchema
  >;

export type PatientAlertPathParams =
  z.infer<
    typeof patientAlertPathParamsSchema
  >;

export type PatientMergePathParams =
  z.infer<
    typeof patientMergePathParamsSchema
  >;

export type AddPatientIdentifierBody =
  z.infer<
    typeof addPatientIdentifierBodySchema
  >;

export type VerifyPatientIdentifierBody =
  z.infer<
    typeof verifyPatientIdentifierBodySchema
  >;

export type VerifyPatientGuardianBody =
  z.infer<
    typeof verifyPatientGuardianBodySchema
  >;