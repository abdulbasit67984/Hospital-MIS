import {
  z,
} from 'zod';

import {
  patientAddressTypeValues,
  patientAlertSeverityValues,
  patientAlertTypeValues,
  patientAlertVisibilityValues,
  patientContactPurposeValues,
  patientContactTypeValues,
} from '@hospital-mis/database';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Expected a valid MongoDB ObjectId',
  );

const optionalNullableText = (
  maxLength: number,
) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .optional();

const reasonSchema = z
  .string()
  .trim()
  .min(3)
  .max(1_000);

const isoDateTimeSchema = z
  .string()
  .datetime({
    offset:
      true,
  });

export const addPatientContactBodySchema =
  z.object({
    contactType: z.enum(
      patientContactTypeValues,
    ),

    purpose: z.enum(
      patientContactPurposeValues,
    ),

    value: z
      .string()
      .trim()
      .min(3)
      .max(254),

    contactName:
      optionalNullableText(240),

    relationshipToPatient:
      optionalNullableText(160),

    relatedGuardianId:
      objectIdSchema
        .nullable()
        .optional(),

    isPrimary: z
      .boolean()
      .default(false),

    isEmergencyContact: z
      .boolean()
      .default(false),

    consentToContact: z
      .boolean()
      .default(true),

    reason:
      reasonSchema.optional(),
  });

export const updatePatientContactBodySchema =
  z
    .object({
      contactType: z
        .enum(
          patientContactTypeValues,
        )
        .optional(),

      purpose: z
        .enum(
          patientContactPurposeValues,
        )
        .optional(),

      value: z
        .string()
        .trim()
        .min(3)
        .max(254)
        .optional(),

      contactName:
        optionalNullableText(240),

      relationshipToPatient:
        optionalNullableText(160),

      relatedGuardianId:
        objectIdSchema
          .nullable()
          .optional(),

      isPrimary: z
        .boolean()
        .optional(),

      isEmergencyContact: z
        .boolean()
        .optional(),

      consentToContact: z
        .boolean()
        .optional(),

      expectedVersion: z
        .number()
        .int()
        .min(0),

      reason:
        reasonSchema,
    })
    .superRefine(
      (value, context) => {
        const mutableFields = [
          value.contactType,
          value.purpose,
          value.value,
          value.contactName,
          value.relationshipToPatient,
          value.relatedGuardianId,
          value.isPrimary,
          value.isEmergencyContact,
          value.consentToContact,
        ];

        if (
          mutableFields.every(
            (field) =>
              field === undefined,
          )
        ) {
          context.addIssue({
            code:
              'custom',
            path:
              [],
            message:
              'At least one contact field must be updated',
          });
        }

        if (
          value.contactType !== undefined &&
          value.value === undefined
        ) {
          context.addIssue({
            code:
              'custom',
            path: [
              'value',
            ],
            message:
              'Changing contact type requires a replacement contact value',
          });
        }
      },
    );

export const verifyPatientContactBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason:
      reasonSchema,
  });

export const deactivatePatientContactBodySchema =
  verifyPatientContactBodySchema;

export const addPatientAddressBodySchema =
  z
    .object({
      addressType: z.enum(
        patientAddressTypeValues,
      ),

      line1: z
        .string()
        .trim()
        .min(1)
        .max(200),

      line2:
        optionalNullableText(200),

      landmark:
        optionalNullableText(200),

      city: z
        .string()
        .trim()
        .min(1)
        .max(120),

      district:
        optionalNullableText(120),

      province:
        optionalNullableText(120),

      postalCode:
        optionalNullableText(30),

      countryCode: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/u)
        .default('PK'),

      isPrimary: z
        .boolean()
        .default(false),

      validFrom:
        isoDateTimeSchema
          .nullable()
          .optional(),

      validTo:
        isoDateTimeSchema
          .nullable()
          .optional(),

      reason:
        reasonSchema.optional(),
    })
    .superRefine(
      (value, context) => {
        if (
          value.validFrom !== undefined &&
          value.validFrom !== null &&
          value.validTo !== undefined &&
          value.validTo !== null &&
          new Date(
            value.validTo,
          ).getTime() <=
            new Date(
              value.validFrom,
            ).getTime()
        ) {
          context.addIssue({
            code:
              'custom',
            path: [
              'validTo',
            ],
            message:
              'Address validity end must be after validFrom',
          });
        }
      },
    );

export const updatePatientAddressBodySchema =
  z
    .object({
      addressType: z
        .enum(
          patientAddressTypeValues,
        )
        .optional(),

      line1: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional(),

      line2:
        optionalNullableText(200),

      landmark:
        optionalNullableText(200),

      city: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional(),

      district:
        optionalNullableText(120),

      province:
        optionalNullableText(120),

      postalCode:
        optionalNullableText(30),

      countryCode: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/u)
        .optional(),

      isPrimary: z
        .boolean()
        .optional(),

      validFrom:
        isoDateTimeSchema
          .nullable()
          .optional(),

      validTo:
        isoDateTimeSchema
          .nullable()
          .optional(),

      expectedVersion: z
        .number()
        .int()
        .min(0),

      reason:
        reasonSchema,
    })
    .superRefine(
      (value, context) => {
        const mutableFields = [
          value.addressType,
          value.line1,
          value.line2,
          value.landmark,
          value.city,
          value.district,
          value.province,
          value.postalCode,
          value.countryCode,
          value.isPrimary,
          value.validFrom,
          value.validTo,
        ];

        if (
          mutableFields.every(
            (field) =>
              field === undefined,
          )
        ) {
          context.addIssue({
            code:
              'custom',
            path:
              [],
            message:
              'At least one address field must be updated',
          });
        }

        if (
          value.validFrom !== undefined &&
          value.validFrom !== null &&
          value.validTo !== undefined &&
          value.validTo !== null &&
          new Date(
            value.validTo,
          ).getTime() <=
            new Date(
              value.validFrom,
            ).getTime()
        ) {
          context.addIssue({
            code:
              'custom',
            path: [
              'validTo',
            ],
            message:
              'Address validity end must be after validFrom',
          });
        }
      },
    );

export const deactivatePatientAddressBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason:
      reasonSchema,
  });

export const createPatientAlertBodySchema =
  z
    .object({
      alertType: z.enum(
        patientAlertTypeValues,
      ),

      severity: z.enum(
        patientAlertSeverityValues,
      ),

      visibility: z.enum(
        patientAlertVisibilityValues,
      ),

      title: z
        .string()
        .trim()
        .min(1)
        .max(200),

      details: z
        .string()
        .trim()
        .min(1)
        .max(4_000),

      effectiveFrom:
        isoDateTimeSchema.optional(),

      effectiveTo:
        isoDateTimeSchema
          .nullable()
          .optional(),

      reason:
        reasonSchema.optional(),
    })
    .superRefine(
      (value, context) => {
        if (
          value.effectiveFrom !== undefined &&
          value.effectiveTo !== undefined &&
          value.effectiveTo !== null &&
          new Date(
            value.effectiveTo,
          ).getTime() <=
            new Date(
              value.effectiveFrom,
            ).getTime()
        ) {
          context.addIssue({
            code:
              'custom',
            path: [
              'effectiveTo',
            ],
            message:
              'Alert expiry must be after effectiveFrom',
          });
        }
      },
    );

export const resolvePatientAlertBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    resolutionReason: z
      .string()
      .trim()
      .min(3)
      .max(1_000),
  });

export const endPatientGuardianBodySchema =
  z.object({
    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason:
      reasonSchema,
  });

export type AddPatientContactBody =
  z.infer<
    typeof addPatientContactBodySchema
  >;

export type UpdatePatientContactBody =
  z.infer<
    typeof updatePatientContactBodySchema
  >;

export type VerifyPatientContactBody =
  z.infer<
    typeof verifyPatientContactBodySchema
  >;

export type AddPatientAddressBody =
  z.infer<
    typeof addPatientAddressBodySchema
  >;

export type UpdatePatientAddressBody =
  z.infer<
    typeof updatePatientAddressBodySchema
  >;

export type CreatePatientAlertBody =
  z.infer<
    typeof createPatientAlertBodySchema
  >;

export type ResolvePatientAlertBody =
  z.infer<
    typeof resolvePatientAlertBodySchema
  >;

export type EndPatientGuardianBody =
  z.infer<
    typeof endPatientGuardianBodySchema
  >;