import {
  z,
} from 'zod';

import {
  guardianLegalAuthorityStatusValues,
  guardianRelationshipTypeValues,
  patientAddressTypeValues,
  patientBirthDatePrecisionValues,
  patientContactPurposeValues,
  patientContactTypeValues,
  patientGenderIdentityValues,
  patientGuardianRequirementValues,
  patientRegistrationSourceValues,
  patientSexAtBirthValues,
  patientStatusValues,
} from '@hospital-mis/database';

import {
  DEFAULT_PATIENT_PAGE_SIZE,
  MAX_PATIENT_PAGE_SIZE,
  PATIENT_SORT_FIELDS,
} from './patient.constants.js';

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

const isoDateTimeSchema = z
  .string()
  .datetime({
    offset: true,
  });

const patientLocalizedNameSchema =
  z.object({
    locale: z
      .string()
      .trim()
      .min(2)
      .max(35),

    fullName: z
      .string()
      .trim()
      .min(1)
      .max(300),
  });

export const patientBirthDateSchema =
  z
    .object({
      value: isoDateTimeSchema.nullable(),

      precision: z.enum(
        patientBirthDatePrecisionValues,
      ),

      isApproximate: z.boolean(),

      estimatedAgeYears: z
        .number()
        .int()
        .min(0)
        .max(150)
        .nullable(),

      estimatedAsOfDate:
        isoDateTimeSchema.nullable(),
    })
    .superRefine(
      (value, context) => {
        if (
          value.precision === 'UNKNOWN' &&
          value.value !== null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'value',
            ],
            message:
              'Unknown birth-date precision cannot include a date',
          });
        }

        if (
          value.precision !== 'UNKNOWN' &&
          value.value === null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'value',
            ],
            message:
              'Known birth-date precision requires a date',
          });
        }

        if (
          value.isApproximate &&
          ![
            'APPROXIMATE',
            'MONTH',
            'YEAR',
          ].includes(value.precision)
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'isApproximate',
            ],
            message:
              'Approximate dates must use APPROXIMATE, MONTH, or YEAR precision',
          });
        }

        if (
          value.estimatedAgeYears !== null &&
          value.estimatedAsOfDate === null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'estimatedAsOfDate',
            ],
            message:
              'Estimated age requires the date on which it was estimated',
          });
        }
      },
    );

const patientIdentifierTypeInputValues = [
  'CNIC',
  'B_FORM',
  'PASSPORT',
  'OTHER',
] as const;

const patientIdentifierInputSchema =
  z.object({
    identifierType: z.enum(
      patientIdentifierTypeInputValues,
    ),

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

    issuingAuthority:
      optionalNullableText(160),

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
      (value, context) => {
        if (
          value.validFrom !== undefined &&
          value.validFrom !== null &&
          value.expiresAt !== undefined &&
          value.expiresAt !== null &&
          new Date(value.expiresAt).getTime() <=
            new Date(value.validFrom).getTime()
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'expiresAt',
            ],
            message:
              'Identifier expiry must be after validFrom',
          });
        }
      },
    );

const patientContactInputSchema =
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
  });

const patientAddressInputSchema =
  z.object({
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
  })
    .superRefine(
      (value, context) => {
        if (
          value.validFrom !== undefined &&
          value.validFrom !== null &&
          value.validTo !== undefined &&
          value.validTo !== null &&
          new Date(value.validTo).getTime() <=
            new Date(value.validFrom).getTime()
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'validTo',
            ],
            message:
              'Address validity end must be after validFrom',
          });
        }
      },
    );

export const guardianInputSchema =
  z.object({
    firstName: z
      .string()
      .trim()
      .min(1)
      .max(120),

    middleName:
      optionalNullableText(120),

    lastName:
      optionalNullableText(120),

    localizedNames: z
      .array(
        patientLocalizedNameSchema,
      )
      .max(10)
      .default([]),

    cnic: z
      .string()
      .trim()
      .min(13)
      .max(20),

    dateOfBirth:
      isoDateTimeSchema
        .nullable()
        .optional(),

    sexAtBirth: z
      .enum(
        patientSexAtBirthValues,
      )
      .default('UNKNOWN'),

    genderIdentity: z
      .enum(
        patientGenderIdentityValues,
      )
      .default('NOT_DISCLOSED'),

    phone: z
      .string()
      .trim()
      .max(30)
      .nullable()
      .optional(),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .nullable()
      .optional(),

    address: z
      .object({
        line1:
          optionalNullableText(200),

        line2:
          optionalNullableText(200),

        city:
          optionalNullableText(120),

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
      })
      .optional(),

    preferredLocale: z
      .string()
      .trim()
      .min(2)
      .max(35)
      .default('en-PK'),
  });

const guardianRelationshipInputSchema =
  z.object({
    relationshipType: z.enum(
      guardianRelationshipTypeValues,
    ),

    relationshipDescription:
      optionalNullableText(300),

    isPrimary: z
      .boolean()
      .default(true),

    isEmergencyContact: z
      .boolean()
      .default(true),

    livesWithPatient: z
      .boolean()
      .default(false),

    isFinanciallyResponsible: z
      .boolean()
      .default(false),

    legalAuthorityStatus: z
      .enum(
        guardianLegalAuthorityStatusValues,
      )
      .default('DECLARED'),

    canConsentToTreatment: z
      .boolean()
      .default(true),

    canConsentToDisclosure: z
      .boolean()
      .default(true),

    canReceiveClinicalInformation: z
      .boolean()
      .default(true),

    authorityBasis:
      optionalNullableText(1_000),

    authorityEffectiveFrom:
      isoDateTimeSchema
        .nullable()
        .optional(),

    authorityEffectiveTo:
      isoDateTimeSchema
        .nullable()
        .optional(),

    supportingAttachmentIds: z
      .array(objectIdSchema)
      .max(20)
      .default([]),
  });

export const registerPatientBodySchema =
  z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1)
        .max(120),

      middleName:
        optionalNullableText(120),

      lastName:
        optionalNullableText(120),

      preferredName:
        optionalNullableText(160),

      localizedNames: z
        .array(
          patientLocalizedNameSchema,
        )
        .max(10)
        .default([]),

      birthDate:
        patientBirthDateSchema,

      isMinor:
        z.boolean(),

      sexAtBirth: z.enum(
        patientSexAtBirthValues,
      ),

      genderIdentity: z
        .enum(
          patientGenderIdentityValues,
        )
        .default('NOT_DISCLOSED'),

      genderDescription:
        optionalNullableText(160),

      preferredLocale: z
        .string()
        .trim()
        .min(2)
        .max(35)
        .default('en-PK'),

      nationalityCountryCode: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/u)
        .default('PK'),

      registrationSource: z
        .enum(
          patientRegistrationSourceValues,
        )
        .default('RECEPTION'),

      identifiers: z
        .array(
          patientIdentifierInputSchema,
        )
        .max(10)
        .default([]),

      contacts: z
        .array(
          patientContactInputSchema,
        )
        .max(10)
        .default([]),

      addresses: z
        .array(
          patientAddressInputSchema,
        )
        .max(5)
        .default([]),

      guardian:
        guardianInputSchema.optional(),

      guardianRelationship:
        guardianRelationshipInputSchema.optional(),
    })
    .superRefine(
      (value, context) => {
        const identifierTypes =
          value.identifiers.map(
            (identifier) =>
              identifier.identifierType,
          );

        for (const identifierType of [
          'CNIC',
          'B_FORM',
          'PASSPORT',
        ] as const) {
          if (
            identifierTypes.filter(
              (candidate) =>
                candidate === identifierType,
            ).length > 1
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'identifiers',
              ],
              message:
                `Only one ${identifierType} may be active at registration`,
            });
          }
        }

        if (value.isMinor) {
          if (value.guardian === undefined) {
            context.addIssue({
              code: 'custom',
              path: [
                'guardian',
              ],
              message:
                'Guardian information is required for a minor patient',
            });
          }

          if (
            value.guardianRelationship ===
            undefined
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'guardianRelationship',
              ],
              message:
                'Guardian relationship metadata is required for a minor patient',
            });
          }
        }

        if (
          !value.isMinor &&
          identifierTypes.includes('B_FORM')
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'identifiers',
            ],
            message:
              'B-Form identity is reserved for minor patients',
          });
        }

        if (
          value.genderIdentity === 'OTHER' &&
          (
            value.genderDescription === undefined ||
            value.genderDescription === null ||
            value.genderDescription.trim().length === 0
          )
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'genderDescription',
            ],
            message:
              'Other gender identity requires a description',
          });
        }
      },
    );

export const updatePatientBodySchema =
  z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional(),

      middleName:
        optionalNullableText(120),

      lastName:
        optionalNullableText(120),

      preferredName:
        optionalNullableText(160),

      localizedNames: z
        .array(
          patientLocalizedNameSchema,
        )
        .max(10)
        .optional(),

      birthDate:
        patientBirthDateSchema.optional(),

      isMinor:
        z.boolean().optional(),

      guardianRequirement: z
        .enum(
          patientGuardianRequirementValues,
        )
        .optional(),

      sexAtBirth: z
        .enum(
          patientSexAtBirthValues,
        )
        .optional(),

      genderIdentity: z
        .enum(
          patientGenderIdentityValues,
        )
        .optional(),

      genderDescription:
        optionalNullableText(160),

      preferredLocale: z
        .string()
        .trim()
        .min(2)
        .max(35)
        .optional(),

      nationalityCountryCode: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/u)
        .optional(),

      status: z
        .enum([
          'ACTIVE',
          'INACTIVE',
          'DECEASED',
          'RESTRICTED',
        ])
        .optional(),

      statusReason:
        optionalNullableText(1_000),

      identityReviewRequired:
        z.boolean().optional(),

      duplicateReviewRequired:
        z.boolean().optional(),

      expectedVersion: z
        .number()
        .int()
        .min(0),

      reason: z
        .string()
        .trim()
        .min(3)
        .max(500),
    })
    .superRefine(
      (value, context) => {
        if (
          value.isMinor === true &&
          value.guardianRequirement !== undefined &&
          value.guardianRequirement !== 'REQUIRED'
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'guardianRequirement',
            ],
            message:
              'Minor patients require guardianRequirement REQUIRED',
          });
        }

        if (
          value.isMinor === false &&
          value.guardianRequirement === 'REQUIRED'
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'guardianRequirement',
            ],
            message:
              'Adult patients cannot use the mandatory minor guardian requirement',
          });
        }
      },
    );

export const updateGuardianBodySchema =
  z.object({
    firstName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional(),

    middleName:
      optionalNullableText(120),

    lastName:
      optionalNullableText(120),

    localizedNames: z
      .array(
        patientLocalizedNameSchema,
      )
      .max(10)
      .optional(),

    cnic: z
      .string()
      .trim()
      .min(13)
      .max(20)
      .nullable()
      .optional(),

    dateOfBirth:
      isoDateTimeSchema
        .nullable()
        .optional(),

    sexAtBirth: z
      .enum(
        patientSexAtBirthValues,
      )
      .optional(),

    genderIdentity: z
      .enum(
        patientGenderIdentityValues,
      )
      .optional(),

    phone: z
      .string()
      .trim()
      .max(30)
      .nullable()
      .optional(),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .nullable()
      .optional(),

    address:
      guardianInputSchema.shape.address,

    preferredLocale: z
      .string()
      .trim()
      .min(2)
      .max(35)
      .optional(),

    status: z
      .enum([
        'ACTIVE',
        'INACTIVE',
        'DECEASED',
      ])
      .optional(),

    statusReason:
      optionalNullableText(1_000),

    expectedVersion: z
      .number()
      .int()
      .min(0),

    reason: z
      .string()
      .trim()
      .min(3)
      .max(500),
  });

export const linkGuardianBodySchema =
  guardianRelationshipInputSchema.extend({
    guardianId:
      objectIdSchema,
  });

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

export const patientListQuerySchema =
  z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PATIENT_PAGE_SIZE)
      .default(DEFAULT_PATIENT_PAGE_SIZE),

    sortBy: z
      .enum(PATIENT_SORT_FIELDS)
      .default('registeredAt'),

    sortDirection: z
      .enum([
        'asc',
        'desc',
      ])
      .default('desc'),

    search: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional(),

    status: z
      .enum(patientStatusValues)
      .optional(),

    isMinor: z
      .preprocess(
        (value) => {
          if (
            value === 'true' ||
            value === '1'
          ) {
            return true;
          }

          if (
            value === 'false' ||
            value === '0'
          ) {
            return false;
          }

          return value;
        },
        z.boolean(),
      )
      .optional(),
  });

export const patientSearchQuerySchema =
  patientListQuerySchema.extend({
    mrn: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .optional(),

    cnic: z
      .string()
      .trim()
      .min(13)
      .max(20)
      .optional(),

    bForm: z
      .string()
      .trim()
      .min(13)
      .max(20)
      .optional(),

    guardianCnic: z
      .string()
      .trim()
      .min(13)
      .max(20)
      .optional(),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .optional(),
  });

export const patientDuplicateCheckBodySchema =
  z.object({
    excludePatientId:
      objectIdSchema.optional(),

    firstName: z
      .string()
      .trim()
      .min(1)
      .max(120),

    middleName:
      optionalNullableText(120),

    lastName:
      optionalNullableText(120),

    birthDate:
      patientBirthDateSchema,

    isMinor:
      z.boolean(),

    identifiers: z
      .array(
        patientIdentifierInputSchema,
      )
      .max(10)
      .default([]),

    phones: z
      .array(
        z
          .string()
          .trim()
          .min(7)
          .max(30),
      )
      .max(5)
      .default([]),

    guardianCnic: z
      .string()
      .trim()
      .min(13)
      .max(20)
      .nullable()
      .optional(),
  });

export type RegisterPatientBody =
  z.infer<
    typeof registerPatientBodySchema
  >;

export type UpdatePatientBody =
  z.infer<
    typeof updatePatientBodySchema
  >;

export type GuardianBody =
  z.infer<
    typeof guardianInputSchema
  >;

export type UpdateGuardianBody =
  z.infer<
    typeof updateGuardianBodySchema
  >;

export type LinkGuardianBody =
  z.infer<
    typeof linkGuardianBodySchema
  >;

export type PatientListQueryData =
  z.infer<
    typeof patientListQuerySchema
  >;

export type PatientSearchQueryData =
  z.infer<
    typeof patientSearchQuerySchema
  >;

export type PatientDuplicateCheckBody =
  z.infer<
    typeof patientDuplicateCheckBodySchema
  >;