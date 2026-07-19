import {
  z,
} from 'zod';

import {
  laboratoryCatalogStatusValues,
  laboratoryCommunicationChannelValues,
  laboratoryCommunicationRecipientTypeValues,
  laboratoryCriticalCommunicationTypeValues,
  laboratoryOrderPriorityValues,
  laboratoryOrderStatusValues,
  laboratoryReferenceRangeKindValues,
  laboratoryReferenceSexValues,
  laboratoryResultFlagValues,
  laboratoryResultPublicationStatusValues,
  laboratoryResultValueTypeValues,
  laboratorySpecimenCollectionMethodValues,
} from '@hospital-mis/database';

import {
  DEFAULT_LABORATORY_PAGE_SIZE,
  LABORATORY_CATALOG_SORT_FIELDS,
  LABORATORY_ORDER_SORT_FIELDS,
  MAX_LABORATORY_PAGE_SIZE,
} from './laboratory.constants.js';

export const laboratoryObjectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

export const laboratoryExpectedVersionSchema =
  z
    .number()
    .int()
    .min(0);

export const laboratoryReasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(2_000);

export const laboratoryIsoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

const nullableText = (
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

const optionalText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .optional();

const decimalStringSchema =
  z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u,
      'Expected a decimal value',
    );

const nonNegativeDecimalStringSchema =
  decimalStringSchema.refine(
    (value) => Number(value) >= 0,
    'Expected a non-negative decimal value',
  );

const queryBooleanSchema =
  z.preprocess(
    (value) => {
      if (
        value === true ||
        value === 'true' ||
        value === '1'
      ) {
        return true;
      }

      if (
        value === false ||
        value === 'false' ||
        value === '0'
      ) {
        return false;
      }

      return value;
    },
    z.boolean(),
  );

const pageSchema =
  z.coerce
    .number()
    .int()
    .min(1);

const pageSizeSchema =
  z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LABORATORY_PAGE_SIZE);

const idempotencyKeySchema =
  z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(
      /^[A-Za-z0-9._:/-]+$/u,
      'Idempotency key contains unsupported characters',
    );

export const laboratoryMutationHeadersSchema =
  z
    .object({
      'idempotency-key': idempotencyKeySchema,
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const laboratoryReadHeadersSchema =
  z
    .object({
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const laboratoryEntityParamsSchema =
  z
    .object({
      categoryId: laboratoryObjectIdSchema.optional(),
      testId: laboratoryObjectIdSchema.optional(),
      orderId: laboratoryObjectIdSchema.optional(),
      orderItemId: laboratoryObjectIdSchema.optional(),
      specimenId: laboratoryObjectIdSchema.optional(),
      resultId: laboratoryObjectIdSchema.optional(),
      resultVersionId: laboratoryObjectIdSchema.optional(),
      communicationId: laboratoryObjectIdSchema.optional(),
      patientId: laboratoryObjectIdSchema.optional(),
      encounterId: laboratoryObjectIdSchema.optional(),
    })
    .strict();

export const createLaboratoryCategoryBodySchema =
  z
    .object({
      categoryCode:
        z
          .string()
          .trim()
          .min(2)
          .max(80),
      name:
        z
          .string()
          .trim()
          .min(2)
          .max(300),
      description: nullableText(2, 5_000),
      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .default(0),
    })
    .strict();

export const updateLaboratoryCategoryBodySchema =
  createLaboratoryCategoryBodySchema
    .omit({
      categoryCode: true,
    })
    .partial()
    .extend({
      expectedVersion: laboratoryExpectedVersionSchema,
    })
    .strict();

export const changeLaboratoryCatalogStatusBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      status: z.enum(laboratoryCatalogStatusValues),
      reason: laboratoryReasonSchema,
    })
    .strict();

const specimenRequirementSchema =
  z
    .object({
      requirementCode:
        z
          .string()
          .trim()
          .min(1)
          .max(80),
      specimenTypeCode:
        z
          .string()
          .trim()
          .min(1)
          .max(80),
      specimenTypeName:
        z
          .string()
          .trim()
          .min(1)
          .max(300),
      containerCode: nullableText(1, 80),
      containerName: nullableText(1, 300),
      minimumVolume:
        nonNegativeDecimalStringSchema
          .nullable()
          .optional(),
      volumeUnitCode: nullableText(1, 40),
      fastingRequired: z.boolean().default(false),
      collectionInstructions: nullableText(2, 5_000),
      handlingInstructions: nullableText(2, 5_000),
      maximumTransportMinutes:
        z
          .number()
          .int()
          .min(1)
          .max(43_200)
          .nullable()
          .optional(),
      preferred: z.boolean().default(false),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.minimumVolume == null) !==
        (value.volumeUnitCode == null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['minimumVolume'],
          message:
            'Minimum specimen volume and its unit must be provided together',
        });
      }
    });

const codedReferenceValueSchema =
  z
    .object({
      code:
        z
          .string()
          .trim()
          .min(1)
          .max(200),
      display:
        z
          .string()
          .trim()
          .min(1)
          .max(500),
      codingSystem: nullableText(1, 300),
      normal: z.boolean().default(true),
    })
    .strict();

const referenceRangeSchema =
  z
    .object({
      rangeCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),
      kind: z.enum(laboratoryReferenceRangeKindValues),
      sex: z.enum(laboratoryReferenceSexValues).default('ANY'),
      minimumAgeDays:
        z
          .number()
          .int()
          .min(0)
          .max(54_750)
          .nullable()
          .optional(),
      maximumAgeDays:
        z
          .number()
          .int()
          .min(0)
          .max(54_750)
          .nullable()
          .optional(),
      lowerBound: decimalStringSchema.nullable().optional(),
      upperBound: decimalStringSchema.nullable().optional(),
      criticalLowerBound: decimalStringSchema.nullable().optional(),
      criticalUpperBound: decimalStringSchema.nullable().optional(),
      textualReference: nullableText(1, 2_000),
      codedValues:
        z
          .array(codedReferenceValueSchema)
          .max(500)
          .default([]),
      notes: nullableText(1, 2_000),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.minimumAgeDays != null &&
        value.maximumAgeDays != null &&
        value.minimumAgeDays > value.maximumAgeDays
      ) {
        context.addIssue({
          code: 'custom',
          path: ['maximumAgeDays'],
          message:
            'Maximum reference age cannot be lower than minimum reference age',
        });
      }

      if (value.kind === 'NUMERIC_INTERVAL') {
        if (value.lowerBound == null && value.upperBound == null) {
          context.addIssue({
            code: 'custom',
            path: ['lowerBound'],
            message:
              'Numeric reference ranges require a lower or upper bound',
          });
        }

        if (
          value.lowerBound != null &&
          value.upperBound != null &&
          Number(value.lowerBound) > Number(value.upperBound)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['upperBound'],
            message:
              'Reference range upper bound cannot be lower than its lower bound',
          });
        }

        if (
          value.textualReference != null ||
          value.codedValues.length > 0
        ) {
          context.addIssue({
            code: 'custom',
            path: ['kind'],
            message:
              'Numeric reference ranges cannot contain textual or coded alternatives',
          });
        }
      }

      if (
        value.kind === 'TEXTUAL' &&
        value.textualReference == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['textualReference'],
          message:
            'Textual reference ranges require reference text',
        });
      }

      if (
        value.kind === 'CODED_SET' &&
        value.codedValues.length === 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['codedValues'],
          message:
            'Coded reference ranges require at least one allowed value',
        });
      }
    });

const resultComponentDefinitionSchema =
  z
    .object({
      componentCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),
      name:
        z
          .string()
          .trim()
          .min(1)
          .max(500),
      valueType: z.enum(laboratoryResultValueTypeValues),
      unitCode: nullableText(1, 100),
      unitName: nullableText(1, 300),
      decimalScale:
        z
          .number()
          .int()
          .min(0)
          .max(12)
          .default(2),
      referenceRanges:
        z
          .array(referenceRangeSchema)
          .max(500)
          .default([]),
      required: z.boolean().default(true),
      displayOrder:
        z
          .number()
          .int()
          .min(0)
          .max(100_000)
          .default(0),
      structuredSchemaKey: nullableText(1, 200),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.valueType === 'STRUCTURED' &&
        value.structuredSchemaKey == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['structuredSchemaKey'],
          message:
            'Structured components require a registered schema key',
        });
      }

      if (
        value.valueType !== 'STRUCTURED' &&
        value.structuredSchemaKey != null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['structuredSchemaKey'],
          message:
            'Only structured components may define a schema key',
        });
      }
    });

const laboratoryTestFields = {
  name:
    z
      .string()
      .trim()
      .min(2)
      .max(500),
  aliases:
    z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(300),
      )
      .max(100)
      .default([]),
  categoryId: laboratoryObjectIdSchema,
  description: nullableText(2, 10_000),
  methodCode: nullableText(1, 100),
  methodName: nullableText(1, 500),
  requiresSpecimen: z.boolean().default(true),
  specimenRequirements:
    z
      .array(specimenRequirementSchema)
      .max(100)
      .default([]),
  components:
    z
      .array(resultComponentDefinitionSchema)
      .min(1)
      .max(500),
  routineTurnaroundMinutes:
    z
      .number()
      .int()
      .min(1)
      .max(43_200),
  urgentTurnaroundMinutes:
    z
      .number()
      .int()
      .min(1)
      .max(43_200)
      .nullable()
      .optional(),
  statTurnaroundMinutes:
    z
      .number()
      .int()
      .min(1)
      .max(43_200)
      .nullable()
      .optional(),
  availableDepartmentIds:
    z
      .array(laboratoryObjectIdSchema)
      .max(500)
      .default([]),
  orderable: z.boolean().default(true),
  requiresResultValidation: z.boolean().default(true),
  requiresResultVerification: z.boolean().default(true),
  criticalNotificationRequired: z.boolean().default(true),
  chargeCatalogItemId: laboratoryObjectIdSchema.nullable().optional(),
  effectiveFrom: laboratoryIsoDateTimeSchema.optional(),
  effectiveThrough: laboratoryIsoDateTimeSchema.nullable().optional(),
} as const;

function refineTestDefinition(
  value: {
    requiresSpecimen?: boolean;
    specimenRequirements?: readonly { preferred?: boolean }[];
    components?: readonly { componentCode: string }[];
    effectiveFrom?: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.requiresSpecimen === true &&
    value.specimenRequirements !== undefined &&
    value.specimenRequirements.length === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['specimenRequirements'],
      message:
        'Specimen-based Laboratory tests require at least one specimen requirement',
    });
  }

  if (
    value.requiresSpecimen === false &&
    value.specimenRequirements !== undefined &&
    value.specimenRequirements.length > 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['specimenRequirements'],
      message:
        'Tests without specimens cannot retain specimen requirements',
    });
  }

  const preferredCount =
    value.specimenRequirements?.filter(
      (requirement) => requirement.preferred === true,
    ).length ?? 0;

  if (preferredCount > 1) {
    context.addIssue({
      code: 'custom',
      path: ['specimenRequirements'],
      message:
        'A Laboratory test may define only one preferred specimen requirement',
    });
  }

  const componentCodes =
    value.components?.map(
      (component) => component.componentCode.trim().toUpperCase(),
    ) ?? [];

  if (new Set(componentCodes).size !== componentCodes.length) {
    context.addIssue({
      code: 'custom',
      path: ['components'],
      message:
        'Laboratory result component codes must be unique within a test',
    });
  }

  if (
    value.effectiveFrom !== undefined &&
    value.effectiveThrough != null &&
    new Date(value.effectiveThrough) < new Date(value.effectiveFrom)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['effectiveThrough'],
      message:
        'Effective-through time cannot precede effective-from time',
    });
  }
}

export const createLaboratoryTestBodySchema =
  z
    .object({
      testCode:
        z
          .string()
          .trim()
          .min(2)
          .max(100),
      ...laboratoryTestFields,
    })
    .strict()
    .superRefine(refineTestDefinition);

export const updateLaboratoryTestBodySchema =
  z
    .object(laboratoryTestFields)
    .partial()
    .extend({
      expectedVersion: laboratoryExpectedVersionSchema,
    })
    .strict()
    .superRefine(refineTestDefinition);

export const laboratoryCatalogSearchQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_LABORATORY_PAGE_SIZE),
      search:
        z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional(),
      categoryId: laboratoryObjectIdSchema.optional(),
      departmentId: laboratoryObjectIdSchema.optional(),
      status: z.enum(laboratoryCatalogStatusValues).optional(),
      orderable: queryBooleanSchema.optional(),
      effectiveAt: laboratoryIsoDateTimeSchema.optional(),
      sortBy: z.enum(LABORATORY_CATALOG_SORT_FIELDS).default('name'),
      sortDirection: z.enum(['asc', 'desc']).default('asc'),
    })
    .strict();

export const createLaboratoryOrderBodySchema =
  z
    .object({
      encounterId: laboratoryObjectIdSchema,
      priority: z.enum(laboratoryOrderPriorityValues).default('ROUTINE'),
      clinicalIndication:
        z
          .string()
          .trim()
          .min(2)
          .max(5_000),
      orderingNotes: nullableText(2, 10_000),
      testIds:
        z
          .array(laboratoryObjectIdSchema)
          .min(1)
          .max(100),
    })
    .strict()
    .superRefine((value, context) => {
      if (new Set(value.testIds).size !== value.testIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['testIds'],
          message:
            'A Laboratory order cannot contain duplicate standardized tests',
        });
      }
    });

export const acceptLaboratoryOrderBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
    })
    .strict();

export const cancelLaboratoryOrderBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      reason: laboratoryReasonSchema,
    })
    .strict();

export const laboratoryOrderListQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_LABORATORY_PAGE_SIZE),
      patientId: laboratoryObjectIdSchema.optional(),
      encounterId: laboratoryObjectIdSchema.optional(),
      orderingProviderId: laboratoryObjectIdSchema.optional(),
      departmentId: laboratoryObjectIdSchema.optional(),
      status: z.enum(laboratoryOrderStatusValues).optional(),
      priority: z.enum(laboratoryOrderPriorityValues).optional(),
      orderedFrom: laboratoryIsoDateTimeSchema.optional(),
      orderedTo: laboratoryIsoDateTimeSchema.optional(),
      sortBy: z.enum(LABORATORY_ORDER_SORT_FIELDS).default('orderedAt'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.orderedFrom !== undefined &&
        value.orderedTo !== undefined &&
        new Date(value.orderedFrom) > new Date(value.orderedTo)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['orderedTo'],
          message:
            'Ordered-to time cannot precede ordered-from time',
        });
      }
    });

export const printLaboratorySpecimenLabelBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
    })
    .strict();

export const collectLaboratorySpecimenBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      collectionMethod: z.enum(laboratorySpecimenCollectionMethodValues),
      collectorStaffId: laboratoryObjectIdSchema,
      collectedAt: laboratoryIsoDateTimeSchema,
      collectedVolume:
        nonNegativeDecimalStringSchema
          .nullable()
          .optional(),
      collectedVolumeUnitCode: nullableText(1, 40),
      collectionSite: nullableText(1, 500),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.collectedVolume == null) !==
        (value.collectedVolumeUnitCode == null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['collectedVolume'],
          message:
            'Collected volume and unit must be provided together',
        });
      }
    });

export const receiveLaboratorySpecimenBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      receivedAt: laboratoryIsoDateTimeSchema,
    })
    .strict();

export const rejectLaboratorySpecimenBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      reasonCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),
      reason: laboratoryReasonSchema,
      requestRecollection: z.boolean().default(false),
    })
    .strict();

const resultFlagSchema =
  z.enum(laboratoryResultFlagValues).default('NOT_APPLICABLE');

const resultValueBase = {
  componentCode:
    z
      .string()
      .trim()
      .min(1)
      .max(100),
  flag: resultFlagSchema,
  interpretation: nullableText(1, 5_000),
} as const;

const numericResultValueSchema =
  z
    .object({
      ...resultValueBase,
      valueType: z.literal('NUMERIC'),
      numericValue: decimalStringSchema,
      unitCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),
      unitName:
        z
          .string()
          .trim()
          .min(1)
          .max(300),
    })
    .strict();

const textResultValueSchema =
  z
    .object({
      ...resultValueBase,
      valueType: z.literal('TEXT'),
      textValue:
        z
          .string()
          .trim()
          .min(1)
          .max(100_000),
    })
    .strict();

const codedResultValueSchema =
  z
    .object({
      ...resultValueBase,
      valueType: z.literal('CODED'),
      codedValue:
        z
          .object({
            code:
              z
                .string()
                .trim()
                .min(1)
                .max(200),
            display:
              z
                .string()
                .trim()
                .min(1)
                .max(500),
            codingSystem: nullableText(1, 300),
          })
          .strict(),
    })
    .strict();

const qualitativeResultValueSchema =
  z
    .object({
      ...resultValueBase,
      valueType: z.literal('QUALITATIVE'),
      qualitativeValue:
        z
          .string()
          .trim()
          .min(1)
          .max(500),
    })
    .strict();

const structuredResultValueSchema =
  z
    .object({
      ...resultValueBase,
      valueType: z.literal('STRUCTURED'),
      structuredValue:
        z.record(
          z.string(),
          z.unknown(),
        ),
    })
    .strict();

const laboratoryResultValueSchema =
  z.discriminatedUnion(
    'valueType',
    [
      numericResultValueSchema,
      textResultValueSchema,
      codedResultValueSchema,
      qualitativeResultValueSchema,
      structuredResultValueSchema,
    ],
  );

function refineResultComponents(
  value: {
    components: readonly { componentCode: string }[];
  },
  context: z.RefinementCtx,
): void {
  const componentCodes =
    value.components.map(
      (component) => component.componentCode.trim().toUpperCase(),
    );

  if (new Set(componentCodes).size !== componentCodes.length) {
    context.addIssue({
      code: 'custom',
      path: ['components'],
      message:
        'A Laboratory result cannot contain duplicate component codes',
    });
  }
}

export const enterLaboratoryResultBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema.optional(),
      labOrderItemId: laboratoryObjectIdSchema,
      specimenId: laboratoryObjectIdSchema.nullable().optional(),
      technicianStaffId: laboratoryObjectIdSchema,
      components:
        z
          .array(laboratoryResultValueSchema)
          .min(1)
          .max(500),
      conclusion: nullableText(1, 20_000),
      technicalNotes: nullableText(1, 20_000),
    })
    .strict()
    .superRefine(refineResultComponents);

export const validateLaboratoryResultBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      validatorStaffId: laboratoryObjectIdSchema,
    })
    .strict();

export const verifyLaboratoryResultBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      verifierStaffId: laboratoryObjectIdSchema,
    })
    .strict();

export const correctLaboratoryResultBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      technicianStaffId: laboratoryObjectIdSchema,
      validatorStaffId: laboratoryObjectIdSchema,
      verifierStaffId: laboratoryObjectIdSchema,
      components:
        z
          .array(laboratoryResultValueSchema)
          .min(1)
          .max(500),
      conclusion: nullableText(1, 20_000),
      technicalNotes: nullableText(1, 20_000),
      reason: laboratoryReasonSchema,
    })
    .strict()
    .superRefine(refineResultComponents);

export const changeLaboratoryPublicationBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      publicationStatus:
        z.enum(laboratoryResultPublicationStatusValues),
      reason: optionalText(5, 2_000),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.publicationStatus === 'WITHDRAWN' &&
        value.reason === undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['reason'],
          message:
            'Withdrawing a Laboratory result requires a reason',
        });
      }
    });

export const recordCriticalResultCommunicationBodySchema =
  z
    .object({
      expectedVersion: laboratoryExpectedVersionSchema,
      componentCode:
        z
          .string()
          .trim()
          .min(1)
          .max(100),
      communicationType:
        z.enum(laboratoryCriticalCommunicationTypeValues),
      channel:
        z.enum(laboratoryCommunicationChannelValues),
      recipientType:
        z.enum(laboratoryCommunicationRecipientTypeValues),
      recipientUserId: laboratoryObjectIdSchema.nullable().optional(),
      recipientStaffId: laboratoryObjectIdSchema.nullable().optional(),
      recipientDisplay:
        z
          .string()
          .trim()
          .min(1)
          .max(500),
      communicationNotes: nullableText(1, 2_000),
      acknowledgedAt: laboratoryIsoDateTimeSchema.nullable().optional(),
      acknowledgedBy: laboratoryObjectIdSchema.nullable().optional(),
      acknowledgementNotes: nullableText(1, 2_000),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.communicationType === 'ACKNOWLEDGED') {
        if (
          value.acknowledgedAt == null ||
          value.acknowledgedBy == null
        ) {
          context.addIssue({
            code: 'custom',
            path: ['acknowledgedAt'],
            message:
              'Critical-result acknowledgement requires time and actor attribution',
          });
        }
      } else if (
        value.acknowledgedAt != null ||
        value.acknowledgedBy != null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['communicationType'],
          message:
            'Only acknowledgement records may include acknowledgement attribution',
        });
      }

      if (
        [
          'ORDERING_PROVIDER',
          'ON_CALL_PROVIDER',
          'NURSE',
        ].includes(value.recipientType) &&
        value.recipientUserId == null &&
        value.recipientStaffId == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['recipientStaffId'],
          message:
            'Internal recipients require a user or staff reference',
        });
      }
    });