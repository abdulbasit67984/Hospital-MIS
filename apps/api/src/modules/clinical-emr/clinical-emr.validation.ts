import {
  z,
} from 'zod';

import {
  allergyCategoryValues,
  allergyReactionSeverityValues,
  allergySeverityValues,
  allergyVerificationStatusValues,
  clinicalConfidentialityValues,
  clinicalDocumentStatusValues,
  clinicalDocumentTypeValues,
  diagnosisCertaintyValues,
  diagnosisCodeSystemValues,
  encounterCareContextValues,
  encounterDiagnosisRoleValues,
  encounterDiagnosisStatusValues,
  encounterOwnerRoleValues,
  encounterStatusChangeSourceValues,
  encounterStatusValues,
  encounterTypeValues,
  patientAllergyRecordTypeValues,
  patientAllergyStatusValues,
  patientProblemStatusValues,
  providerSignatureMethodValues,
} from '@hospital-mis/database';

import {
  CLINICAL_NOTE_SORT_FIELDS,
  CLINICAL_TIMELINE_SORT_FIELDS,
  DEFAULT_CLINICAL_EMR_PAGE_SIZE,
  ENCOUNTER_SORT_FIELDS,
  MAX_CLINICAL_EMR_PAGE_SIZE,
} from './clinical-emr.constants.js';

const objectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

const nullableObjectIdSchema =
  objectIdSchema
    .nullable()
    .optional();

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
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      },
      'Expected a valid calendar date',
    );

const isoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

const optionalNullableText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .nullable()
    .optional();

const reasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(2_000);

const expectedVersionSchema =
  z
    .number()
    .int()
    .min(0);

const structuredClinicalDataSchema =
  z.union([
    z.record(
      z.string(),
      z.unknown(),
    ),
    z.array(
      z.unknown(),
    ),
  ]);

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
        .max(MAX_CLINICAL_EMR_PAGE_SIZE)
        .default(DEFAULT_CLINICAL_EMR_PAGE_SIZE),

    sortDirection:
      z
        .enum([
          'asc',
          'desc',
        ])
        .default('desc'),
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
          (value) => value === 'true',
        ),
    ])
    .optional();

function validateConfidentialityReason(
  value: Readonly<{
    confidentiality?:
      (typeof clinicalConfidentialityValues)[number];
    restrictionReason?: string | null;
  }>,
  context: z.RefinementCtx,
): void {
  if (
    value.confidentiality !== undefined &&
    value.confidentiality !== 'ROUTINE' &&
    value.restrictionReason == null
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'restrictionReason',
      ],
      message: 'Restricted clinical content requires a minimum-necessary access reason',
    });
  }

  if (
    (
      value.confidentiality === undefined ||
      value.confidentiality === 'ROUTINE'
    ) &&
    value.restrictionReason != null
  ) {
    context.addIssue({
      code: 'custom',
      path: [
        'restrictionReason',
      ],
      message: 'restrictionReason is only valid for restricted clinical content',
    });
  }
}

export const encounterContextBodySchema =
  z
    .object({
      patientId:
        objectIdSchema,

      registrationId:
        nullableObjectIdSchema,

      opdVisitId:
        nullableObjectIdSchema,

      queueTokenId:
        nullableObjectIdSchema,

      emergencyCaseId:
        nullableObjectIdSchema,

      admissionId:
        nullableObjectIdSchema,

      referralId:
        nullableObjectIdSchema,

      encounterType:
        z.enum(encounterTypeValues),

      careContext:
        z.enum(encounterCareContextValues),

      serviceDate:
        serviceDateSchema,

      departmentId:
        objectIdSchema,

      clinicId:
        nullableObjectIdSchema,

      servicePointId:
        nullableObjectIdSchema,

      primaryProviderId:
        objectIdSchema,

      currentOwnerId:
        objectIdSchema.optional(),

      currentOwnerRole:
        z
          .enum(encounterOwnerRoleValues)
          .optional(),

      assignedProviderIds:
        z
          .array(objectIdSchema)
          .max(50)
          .default([])
          .refine(
            (values) =>
              new Set(values).size === values.length,
            'assignedProviderIds must not contain duplicates',
          ),

      confidentiality:
        z
          .enum(clinicalConfidentialityValues)
          .default('ROUTINE'),

      restrictionReason:
        optionalNullableText(
          5,
          1_000,
        ),

      startedAt:
        isoDateTimeSchema.optional(),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        validateConfidentialityReason(
          value,
          context,
        );

        if (value.careContext === 'OPD_VISIT') {
          if (
            value.registrationId == null ||
            value.opdVisitId == null
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'opdVisitId',
              ],
              message: 'OPD encounters require registrationId and opdVisitId',
            });
          }

          if (value.encounterType !== 'OPD') {
            context.addIssue({
              code: 'custom',
              path: [
                'encounterType',
              ],
              message: 'OPD visit context requires OPD encounter type',
            });
          }
        }

        if (value.careContext === 'ADMISSION') {
          if (value.admissionId == null) {
            context.addIssue({
              code: 'custom',
              path: [
                'admissionId',
              ],
              message: 'Admission encounters require admissionId',
            });
          }

          if (
            ![
              'INPATIENT',
              'DAY_CARE',
            ].includes(value.encounterType)
          ) {
            context.addIssue({
              code: 'custom',
              path: [
                'encounterType',
              ],
              message: 'Admission context requires INPATIENT or DAY_CARE encounter type',
            });
          }
        }

        if (value.careContext === 'EMERGENCY_CASE') {
          if (value.emergencyCaseId == null) {
            context.addIssue({
              code: 'custom',
              path: [
                'emergencyCaseId',
              ],
              message: 'Emergency encounters require emergencyCaseId',
            });
          }

          if (value.encounterType !== 'EMERGENCY') {
            context.addIssue({
              code: 'custom',
              path: [
                'encounterType',
              ],
              message: 'Emergency context requires EMERGENCY encounter type',
            });
          }
        }

        if (
          value.careContext === 'REFERRAL' &&
          value.referralId == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'referralId',
            ],
            message: 'Referral encounters require referralId',
          });
        }

        if (
          value.queueTokenId != null &&
          value.opdVisitId == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'queueTokenId',
            ],
            message: 'queueTokenId requires an OPD visit context',
          });
        }
      },
    );

export const createEncounterBodySchema =
  encounterContextBodySchema;

export const changeEncounterStatusBodySchema =
  z
    .object({
      expectedVersion:
        expectedVersionSchema,

      status:
        z.enum(encounterStatusValues),

      changeSource:
        z.enum(encounterStatusChangeSourceValues),

      reason:
        optionalNullableText(
          5,
          1_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          [
            'CANCELLED',
            'CORRECTED',
          ].includes(value.status) &&
          value.reason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'reason',
            ],
            message: `${value.status} encounter transitions require a reason`,
          });
        }
      },
    );

export const reassignEncounterBodySchema =
  z.object({
    expectedVersion:
      expectedVersionSchema,

    currentOwnerId:
      objectIdSchema,

    currentOwnerRole:
      z.enum(encounterOwnerRoleValues),

    assignedProviderIds:
      z
        .array(objectIdSchema)
        .min(1)
        .max(50)
        .refine(
          (values) =>
            new Set(values).size === values.length,
          'assignedProviderIds must not contain duplicates',
        ),

    reason:
      reasonSchema,
  });

export const signEncounterBodySchema =
  z.object({
    expectedVersion:
      expectedVersionSchema,

    signatureMethod:
      z.enum(providerSignatureMethodValues),

    signatureDigest:
      z
        .string()
        .trim()
        .min(32)
        .max(256),
  });

export const correctEncounterBodySchema =
  z.object({
    expectedVersion:
      expectedVersionSchema,

    reason:
      reasonSchema,

    replacement:
      encounterContextBodySchema,
  });

const clinicalDocumentContentSchema =
  z
    .object({
      title:
        optionalNullableText(
          1,
          300,
        ),

      narrativeText:
        optionalNullableText(
          1,
          200_000,
        ),

      structuredData:
        structuredClinicalDataSchema
          .nullable()
          .optional(),

      confidentiality:
        z
          .enum(clinicalConfidentialityValues)
          .default('ROUTINE'),

      restrictionReason:
        optionalNullableText(
          5,
          1_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        validateConfidentialityReason(
          value,
          context,
        );

        if (
          value.narrativeText == null &&
          value.structuredData == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'narrativeText',
            ],
            message: 'Clinical content requires narrativeText, structuredData, or both',
          });
        }
      },
    );

export const createClinicalNoteBodySchema =
  clinicalDocumentContentSchema
    .safeExtend({
      encounterId:
        objectIdSchema,

      documentType:
        z.enum(clinicalDocumentTypeValues),

      authorProviderId:
        objectIdSchema,
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (value.documentType === 'ADDENDUM') {
          context.addIssue({
            code: 'custom',
            path: [
              'documentType',
            ],
            message: 'Use the dedicated addendum operation to create an addendum',
          });
        }
      },
    );

export const updateClinicalNoteBodySchema =
  clinicalDocumentContentSchema
    .safeExtend({
      expectedVersion:
        expectedVersionSchema,
    });

export const finalizeClinicalNoteBodySchema =
  z
    .object({
      expectedVersion:
        expectedVersionSchema,

      signatureMethod:
        z
          .enum(providerSignatureMethodValues)
          .nullable()
          .optional(),

      signatureDigest:
        z
          .string()
          .trim()
          .min(32)
          .max(256)
          .nullable()
          .optional(),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        const hasMethod =
          value.signatureMethod != null;

        const hasDigest =
          value.signatureDigest != null;

        if (hasMethod !== hasDigest) {
          context.addIssue({
            code: 'custom',
            path: [
              'signatureDigest',
            ],
            message: 'signatureMethod and signatureDigest must be provided together',
          });
        }
      },
    );

export const amendClinicalNoteBodySchema =
  clinicalDocumentContentSchema
    .safeExtend({
      expectedVersion:
        expectedVersionSchema,

      reason:
        reasonSchema,
    });

export const correctClinicalNoteBodySchema =
  amendClinicalNoteBodySchema;

export const addClinicalNoteAddendumBodySchema =
  clinicalDocumentContentSchema
    .safeExtend({
      parentNoteId:
        objectIdSchema,

      authorProviderId:
        objectIdSchema,
    });

export const enterClinicalNoteInErrorBodySchema =
  z.object({
    expectedVersion:
      expectedVersionSchema,

    reason:
      reasonSchema,
  });

export const recordEncounterDiagnosisBodySchema =
  z.object({
    encounterId:
      objectIdSchema,

    diagnosisId:
      nullableObjectIdSchema,

    codeSystem:
      z.enum(diagnosisCodeSystemValues),

    code:
      z
        .string()
        .trim()
        .min(1)
        .max(80),

    display:
      z
        .string()
        .trim()
        .min(2)
        .max(500),

    role:
      z.enum(encounterDiagnosisRoleValues),

    certainty:
      z.enum(diagnosisCertaintyValues),

    clinicalNoteId:
      nullableObjectIdSchema,

    onsetDate:
      serviceDateSchema
        .nullable()
        .optional(),

    isChronic:
      z.boolean().default(false),

    presentOnAdmission:
      z.boolean()
        .nullable()
        .optional(),

    evidence:
      optionalNullableText(
        1,
        5_000,
      ),
  });

export const changeEncounterDiagnosisStatusBodySchema =
  z
    .object({
      expectedVersion:
        expectedVersionSchema,

      status:
        z
          .enum(encounterDiagnosisStatusValues)
          .exclude([
            'ACTIVE',
          ]),

      reason:
        reasonSchema,

      resolvedAt:
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
          value.status === 'RESOLVED' &&
          value.resolvedAt == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'resolvedAt',
            ],
            message: 'Resolved diagnoses require resolvedAt',
          });
        }

        if (
          value.status !== 'RESOLVED' &&
          value.resolvedAt != null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'resolvedAt',
            ],
            message: 'resolvedAt is only valid for resolved diagnoses',
          });
        }
      },
    );

export const createPatientProblemBodySchema =
  z.object({
    sourceEncounterId:
      objectIdSchema,

    sourceEncounterDiagnosisId:
      nullableObjectIdSchema,

    diagnosisId:
      nullableObjectIdSchema,

    codeSystem:
      z.enum(diagnosisCodeSystemValues),

    code:
      z
        .string()
        .trim()
        .min(1)
        .max(80),

    display:
      z
        .string()
        .trim()
        .min(2)
        .max(500),

    onsetDate:
      serviceDateSchema
        .nullable()
        .optional(),

    summary:
      optionalNullableText(
        1,
        5_000,
      ),
  });

export const updatePatientProblemBodySchema =
  z
    .object({
      expectedVersion:
        expectedVersionSchema,

      status:
        z.enum(patientProblemStatusValues),

      summary:
        optionalNullableText(
          1,
          5_000,
        ),

      onsetDate:
        serviceDateSchema
          .nullable()
          .optional(),

      resolvedAt:
        isoDateTimeSchema
          .nullable()
          .optional(),

      reason:
        optionalNullableText(
          5,
          2_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.status === 'RESOLVED' &&
          value.resolvedAt == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'resolvedAt',
            ],
            message: 'Resolved problems require resolvedAt',
          });
        }

        if (
          [
            'INACTIVE',
            'ENTERED_IN_ERROR',
          ].includes(value.status) &&
          value.reason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'reason',
            ],
            message: `${value.status} problem transitions require a reason`,
          });
        }
      },
    );

export const allergyReactionBodySchema =
  z.object({
    manifestation:
      z
        .string()
        .trim()
        .min(2)
        .max(500),

    severity:
      z.enum(allergyReactionSeverityValues),

    occurredAt:
      isoDateTimeSchema
        .nullable()
        .optional(),

    notes:
      optionalNullableText(
        1,
        2_000,
      ),
  });

export const recordPatientAllergyBodySchema =
  z
    .object({
      patientId:
        objectIdSchema,

      sourceEncounterId:
        nullableObjectIdSchema,

      clinicalNoteId:
        nullableObjectIdSchema,

      recordType:
        z.enum(patientAllergyRecordTypeValues),

      allergyId:
        nullableObjectIdSchema,

      category:
        z.enum(allergyCategoryValues),

      allergenText:
        z
          .string()
          .trim()
          .min(2)
          .max(500),

      verificationStatus:
        z
          .enum(allergyVerificationStatusValues)
          .default('UNCONFIRMED'),

      severity:
        z
          .enum(allergySeverityValues)
          .default('UNKNOWN'),

      reactions:
        z
          .array(allergyReactionBodySchema)
          .max(100)
          .default([]),

      onsetDate:
        serviceDateSchema
          .nullable()
          .optional(),

      lastReactionAt:
        isoDateTimeSchema
          .nullable()
          .optional(),

      notes:
        optionalNullableText(
          1,
          5_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        const noKnown =
          [
            'NO_KNOWN_ALLERGIES',
            'NO_KNOWN_DRUG_ALLERGIES',
          ].includes(value.recordType);

        if (noKnown) {
          if (value.allergyId != null) {
            context.addIssue({
              code: 'custom',
              path: [
                'allergyId',
              ],
              message: 'No-known-allergy declarations cannot reference an allergen',
            });
          }

          if (value.reactions.length > 0) {
            context.addIssue({
              code: 'custom',
              path: [
                'reactions',
              ],
              message: 'No-known-allergy declarations cannot contain reactions',
            });
          }

          if (value.severity !== 'UNKNOWN') {
            context.addIssue({
              code: 'custom',
              path: [
                'severity',
              ],
              message: 'No-known-allergy declarations require UNKNOWN severity',
            });
          }
        }

        if (
          value.recordType === 'ALLERGY' &&
          value.verificationStatus === 'CONFIRMED' &&
          value.reactions.length === 0 &&
          value.notes == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'reactions',
            ],
            message: 'Confirmed allergy records require a reaction or supporting clinical note',
          });
        }
      },
    );

export const updatePatientAllergyBodySchema =
  z
    .object({
      expectedVersion:
        expectedVersionSchema,

      status:
        z.enum(patientAllergyStatusValues),

      verificationStatus:
        z.enum(allergyVerificationStatusValues),

      severity:
        z.enum(allergySeverityValues),

      reactions:
        z
          .array(allergyReactionBodySchema)
          .max(100),

      onsetDate:
        serviceDateSchema
          .nullable()
          .optional(),

      lastReactionAt:
        isoDateTimeSchema
          .nullable()
          .optional(),

      notes:
        optionalNullableText(
          1,
          5_000,
        ),

      reason:
        optionalNullableText(
          5,
          2_000,
        ),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          [
            'INACTIVE',
            'RESOLVED',
            'ENTERED_IN_ERROR',
          ].includes(value.status) &&
          value.reason == null
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'reason',
            ],
            message: `${value.status} allergy transitions require a reason`,
          });
        }
      },
    );

export const encounterListQuerySchema =
  paginationSchema
    .extend({
      sortBy:
        z
          .enum(ENCOUNTER_SORT_FIELDS)
          .default('startedAt'),

      patientId:
        objectIdSchema.optional(),

      providerId:
        objectIdSchema.optional(),

      departmentId:
        objectIdSchema.optional(),

      clinicId:
        objectIdSchema.optional(),

      servicePointId:
        objectIdSchema.optional(),

      encounterType:
        z
          .enum(encounterTypeValues)
          .optional(),

      careContext:
        z
          .enum(encounterCareContextValues)
          .optional(),

      status:
        z
          .enum(encounterStatusValues)
          .optional(),

      serviceDateFrom:
        serviceDateSchema.optional(),

      serviceDateTo:
        serviceDateSchema.optional(),
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.serviceDateFrom !== undefined &&
          value.serviceDateTo !== undefined &&
          value.serviceDateFrom > value.serviceDateTo
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'serviceDateTo',
            ],
            message: 'serviceDateTo cannot precede serviceDateFrom',
          });
        }
      },
    );

export const clinicalNoteListQuerySchema =
  paginationSchema.extend({
    sortBy:
      z
        .enum(CLINICAL_NOTE_SORT_FIELDS)
        .default('createdAt'),

    encounterId:
      objectIdSchema.optional(),

    patientId:
      objectIdSchema.optional(),

    authorProviderId:
      objectIdSchema.optional(),

    documentType:
      z
        .enum(clinicalDocumentTypeValues)
        .optional(),

    status:
      z
        .enum(clinicalDocumentStatusValues)
        .optional(),

    confidentiality:
      z
        .enum(clinicalConfidentialityValues)
        .optional(),
  });

export const clinicalTimelineQuerySchema =
  paginationSchema
    .extend({
      sortBy:
        z
          .enum(CLINICAL_TIMELINE_SORT_FIELDS)
          .default('occurredAt'),

      patientId:
        objectIdSchema,

      dateFrom:
        isoDateTimeSchema.optional(),

      dateTo:
        isoDateTimeSchema.optional(),

      encounterType:
        z
          .enum(encounterTypeValues)
          .optional(),

      includeEnteredInError:
        optionalBooleanQuerySchema,
    })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.dateFrom !== undefined &&
          value.dateTo !== undefined &&
          value.dateFrom > value.dateTo
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'dateTo',
            ],
            message: 'dateTo cannot precede dateFrom',
          });
        }
      },
    );

export const clinicalEntityIdParamsSchema =
  z.object({
    id:
      objectIdSchema,
  });

export const patientClinicalTimelineParamsSchema =
  z.object({
    patientId:
      objectIdSchema,
  });

export type CreateEncounterBody =
  z.infer<typeof createEncounterBodySchema>;

export type ChangeEncounterStatusBody =
  z.infer<typeof changeEncounterStatusBodySchema>;

export type ReassignEncounterBody =
  z.infer<typeof reassignEncounterBodySchema>;

export type CreateClinicalNoteBody =
  z.infer<typeof createClinicalNoteBodySchema>;

export type UpdateClinicalNoteBody =
  z.infer<typeof updateClinicalNoteBodySchema>;

export type RecordEncounterDiagnosisBody =
  z.infer<typeof recordEncounterDiagnosisBodySchema>;

export type RecordPatientAllergyBody =
  z.infer<typeof recordPatientAllergyBodySchema>;