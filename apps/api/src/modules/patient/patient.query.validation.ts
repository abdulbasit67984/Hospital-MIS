import {
  z,
} from 'zod';

import {
  guardianStatusValues,
  patientSexAtBirthValues,
  patientStatusValues,
} from '@hospital-mis/database';

import {
  patientSearchModeValues,
} from './patient.query.types.js';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

const queryBoolean = z.preprocess(
  (rawValue) => {
    const value = Array.isArray(rawValue)
      ? rawValue[0]
      : rawValue;

    if (
      value === true ||
      value === false
    ) {
      return value;
    }

    if (
      typeof value === 'string'
    ) {
      const normalized = value
        .trim()
        .toLocaleLowerCase('en-US');

      if (
        normalized === 'true' ||
        normalized === '1'
      ) {
        return true;
      }

      if (
        normalized === 'false' ||
        normalized === '0'
      ) {
        return false;
      }
    }

    return value;
  },
  z.boolean(),
);

const paginationFields = {
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
};

export const patientIdParamsSchema =
  z.object({
    patientId:
      objectIdSchema,
  });

export const guardianIdParamsSchema =
  z.object({
    guardianId:
      objectIdSchema,
  });

export const patientSearchQuerySchema =
  z
    .object({
      term: z
        .string()
        .trim()
        .min(2)
        .max(160),

      mode: z
        .enum(
          patientSearchModeValues,
        )
        .default('AUTO'),

      status: z
        .enum(
          patientStatusValues,
        )
        .optional(),

      sexAtBirth: z
        .enum(
          patientSexAtBirthValues,
        )
        .optional(),

      isMinor:
        queryBoolean.optional(),

      duplicateReviewRequired:
        queryBoolean.optional(),

      includeMerged:
        queryBoolean.default(false),

      ...paginationFields,
    })
    .superRefine(
      (value, context) => {
        const digits =
          value.term.replace(/\D/gu, '');

        if (
          (
            value.mode === 'CNIC' ||
            value.mode === 'B_FORM' ||
            value.mode === 'GUARDIAN_CNIC'
          ) &&
          digits.length !== 13
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'term',
            ],

            message:
              'CNIC and B-Form searches require exactly 13 digits',
          });
        }

        if (
          value.mode === 'NAME' &&
          value.term
            .normalize('NFKC')
            .trim()
            .length < 2
        ) {
          context.addIssue({
            code:
              'custom',

            path: [
              'term',
            ],

            message:
              'Patient name search requires at least two characters',
          });
        }
      },
    );

export const patientProfileQuerySchema =
  z.object({
    includeInactiveContacts:
      queryBoolean.default(false),

    includeInactiveAddresses:
      queryBoolean.default(false),

    includeInactiveGuardians:
      queryBoolean.default(false),

    includeResolvedAlerts:
      queryBoolean.default(false),
  });

export const guardianSearchQuerySchema =
  z.object({
    term: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .optional(),

    status: z
      .enum(
        guardianStatusValues,
      )
      .optional(),

    ...paginationFields,
  });

export const guardianProfileQuerySchema =
  z.object({
    includeInactiveRelationships:
      queryBoolean.default(false),
  });

export const patientRegistrationSlipQuerySchema =
  z.object({
    generatedAt: z
      .string()
      .datetime({
        offset:
          true,
      })
      .optional(),
  });

export type PatientSearchHttpQuery =
  z.infer<
    typeof patientSearchQuerySchema
  >;

export type PatientProfileHttpQuery =
  z.infer<
    typeof patientProfileQuerySchema
  >;

export type GuardianSearchHttpQuery =
  z.infer<
    typeof guardianSearchQuerySchema
  >;

export type GuardianProfileHttpQuery =
  z.infer<
    typeof guardianProfileQuerySchema
  >;