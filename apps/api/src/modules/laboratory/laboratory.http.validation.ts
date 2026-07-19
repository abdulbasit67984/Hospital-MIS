import {
  z,
} from 'zod';

const objectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'A valid MongoDB object identifier is required',
  );

const expectedVersionSchema = z
  .number()
  .int()
  .min(0);

const optionalNullableText = z
  .string()
  .trim()
  .max(4_000)
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
  .max(100)
  .default(25);

export const laboratoryEntityIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const laboratoryOrderIdParamsSchema = z.object({
  orderId: objectIdSchema,
});

export const laboratoryOrderItemIdParamsSchema = z.object({
  orderItemId: objectIdSchema,
});

export const laboratorySpecimenIdParamsSchema = z.object({
  specimenId: objectIdSchema,
});

export const laboratoryResultIdParamsSchema = z.object({
  resultId: objectIdSchema,
});

export const laboratoryPatientIdParamsSchema = z.object({
  patientId: objectIdSchema,
});

export const laboratoryEncounterIdParamsSchema = z.object({
  encounterId: objectIdSchema,
});

export const laboratoryCatalogQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  categoryId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  status: z.enum([
    'ACTIVE',
    'INACTIVE',
  ]).optional(),
  orderable: z
    .enum([
      'true',
      'false',
    ])
    .transform((value) => value === 'true')
    .optional(),
  effectiveAt: z.string().datetime().optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: z
    .enum([
      'name',
      'testCode',
      'createdAt',
      'updatedAt',
    ])
    .default('name'),
  sortDirection: z
    .enum([
      'asc',
      'desc',
    ])
    .default('asc'),
});

export const laboratoryOrderQuerySchema = z.object({
  patientId: objectIdSchema.optional(),
  encounterId: objectIdSchema.optional(),
  orderingProviderId: objectIdSchema.optional(),
  departmentId: objectIdSchema.optional(),
  status: z
    .enum([
      'ORDERED',
      'ACCEPTED',
      'PARTIALLY_COLLECTED',
      'SAMPLE_COLLECTED',
      'IN_PROGRESS',
      'PARTIALLY_COMPLETED',
      'COMPLETED',
      'VERIFIED',
      'RECOLLECTION_REQUIRED',
      'CANCELLED',
    ])
    .optional(),
  priority: z
    .enum([
      'ROUTINE',
      'URGENT',
      'STAT',
    ])
    .optional(),
  orderedFrom: z.string().datetime().optional(),
  orderedTo: z.string().datetime().optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: z
    .enum([
      'orderedAt',
      'priority',
      'status',
      'createdAt',
      'updatedAt',
    ])
    .default('orderedAt'),
  sortDirection: z
    .enum([
      'asc',
      'desc',
    ])
    .default('desc'),
});

export const createLaboratoryCategoryHttpSchema = z.object({
  categoryCode: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: optionalNullableText,
  displayOrder: z.number().int().min(0).default(0),
});

export const updateLaboratoryCategoryHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  description: optionalNullableText,
  displayOrder: z.number().int().min(0).optional(),
});

export const changeLaboratoryCatalogStatusHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  status: z.enum([
    'ACTIVE',
    'INACTIVE',
  ]),
  reason: z.string().trim().min(3).max(500),
});

const referenceRangeSchema = z.object({
  rangeCode: z.string().trim().min(1).max(50),
  kind: z.enum([
    'NUMERIC',
    'TEXTUAL',
    'CODED',
  ]),
  sex: z
    .enum([
      'ANY',
      'MALE',
      'FEMALE',
      'OTHER',
      'UNKNOWN',
    ])
    .default('ANY'),
  minimumAgeDays: z.number().int().min(0).nullable().optional(),
  maximumAgeDays: z.number().int().min(0).nullable().optional(),
  lowerBound: z.string().nullable().optional(),
  upperBound: z.string().nullable().optional(),
  criticalLowerBound: z.string().nullable().optional(),
  criticalUpperBound: z.string().nullable().optional(),
  textualReference: optionalNullableText,
  codedValues: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(100),
        display: z.string().trim().min(1).max(200),
        codingSystem: z.string().trim().max(200).nullable().optional(),
        normal: z.boolean().default(true),
      }),
    )
    .default([]),
  notes: optionalNullableText,
});

const resultComponentDefinitionSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  valueType: z.enum([
    'NUMERIC',
    'TEXT',
    'CODED',
    'QUALITATIVE',
    'STRUCTURED',
  ]),
  unitCode: z.string().trim().max(50).nullable().optional(),
  unitName: z.string().trim().max(100).nullable().optional(),
  decimalScale: z.number().int().min(0).max(12).default(2),
  referenceRanges: z.array(referenceRangeSchema).default([]),
  required: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
  structuredSchemaKey: z.string().trim().max(200).nullable().optional(),
});

const specimenRequirementSchema = z.object({
  requirementCode: z.string().trim().min(1).max(50),
  specimenTypeCode: z.string().trim().min(1).max(50),
  specimenTypeName: z.string().trim().min(1).max(200),
  containerCode: z.string().trim().max(50).nullable().optional(),
  containerName: z.string().trim().max(200).nullable().optional(),
  minimumVolume: z.string().nullable().optional(),
  volumeUnitCode: z.string().trim().max(50).nullable().optional(),
  fastingRequired: z.boolean().default(false),
  collectionInstructions: optionalNullableText,
  handlingInstructions: optionalNullableText,
  maximumTransportMinutes: z.number().int().min(1).nullable().optional(),
  preferred: z.boolean().default(false),
});

export const createLaboratoryTestHttpSchema = z.object({
  testCode: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  categoryId: objectIdSchema,
  description: optionalNullableText,
  methodCode: z.string().trim().max(50).nullable().optional(),
  methodName: z.string().trim().max(200).nullable().optional(),
  requiresSpecimen: z.boolean().default(true),
  specimenRequirements: z.array(specimenRequirementSchema).default([]),
  components: z.array(resultComponentDefinitionSchema).min(1),
  routineTurnaroundMinutes: z.number().int().min(1),
  urgentTurnaroundMinutes: z.number().int().min(1).nullable().optional(),
  statTurnaroundMinutes: z.number().int().min(1).nullable().optional(),
  availableDepartmentIds: z.array(objectIdSchema).default([]),
  orderable: z.boolean().default(true),
  requiresResultValidation: z.boolean().default(true),
  requiresResultVerification: z.boolean().default(true),
  criticalNotificationRequired: z.boolean().default(true),
  chargeCatalogItemId: objectIdSchema.nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveThrough: z.string().datetime().nullable().optional(),
});

export const updateLaboratoryTestHttpSchema =
  createLaboratoryTestHttpSchema
    .partial()
    .extend({
      expectedVersion: expectedVersionSchema,
    });

export const createLaboratoryOrderHttpSchema = z.object({
  encounterId: objectIdSchema,
  priority: z.enum([
    'ROUTINE',
    'URGENT',
    'STAT',
  ]),
  clinicalIndication: z.string().trim().min(3).max(4_000),
  orderingNotes: optionalNullableText,
  testIds: z.array(objectIdSchema).min(1).max(100),
});

export const acceptLaboratoryOrderHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
});

export const cancelLaboratoryOrderHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reason: z.string().trim().min(3).max(1_000),
});

export const accessionLaboratorySpecimenHttpSchema = z.object({
  orderItemId: objectIdSchema,
  requirementCode: z.string().trim().min(1).max(50),
});

export const printLaboratorySpecimenLabelHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
});

export const collectLaboratorySpecimenHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  collectedVolume: z.string().nullable().optional(),
  collectedVolumeUnitCode: z.string().trim().max(50).nullable().optional(),
  collectionMethod: z.string().trim().min(1).max(100),
  collectionSite: z.string().trim().max(200).nullable().optional(),
  collectorStaffId: objectIdSchema,
  collectedAt: z.string().datetime(),
});

export const receiveLaboratorySpecimenHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  receivedAt: z.string().datetime(),
});

export const rejectLaboratorySpecimenHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reasonCode: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(2_000),
  requestRecollection: z.boolean().default(false),
});

const numericResultValueSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  valueType: z.literal('NUMERIC'),
  numericValue: z.string().min(1),
  unitCode: z.string().trim().min(1).max(50),
  unitName: z.string().trim().min(1).max(100),
  flag: z.string().optional(),
  interpretation: optionalNullableText,
});

const textResultValueSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  valueType: z.literal('TEXT'),
  textValue: z.string().trim().min(1).max(10_000),
  flag: z.string().optional(),
  interpretation: optionalNullableText,
});

const codedResultValueSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  valueType: z.literal('CODED'),
  codedValue: z.object({
    code: z.string().trim().min(1).max(100),
    display: z.string().trim().min(1).max(200),
    codingSystem: z.string().trim().max(200).nullable().optional(),
  }),
  flag: z.string().optional(),
  interpretation: optionalNullableText,
});

const qualitativeResultValueSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  valueType: z.literal('QUALITATIVE'),
  qualitativeValue: z.string().trim().min(1).max(1_000),
  flag: z.string().optional(),
  interpretation: optionalNullableText,
});

const structuredResultValueSchema = z.object({
  componentCode: z.string().trim().min(1).max(50),
  valueType: z.literal('STRUCTURED'),
  structuredValue: z.unknown(),
  flag: z.string().optional(),
  interpretation: optionalNullableText,
});

const resultValueSchema = z.discriminatedUnion(
  'valueType',
  [
    numericResultValueSchema,
    textResultValueSchema,
    codedResultValueSchema,
    qualitativeResultValueSchema,
    structuredResultValueSchema,
  ],
);

export const enterLaboratoryResultHttpSchema = z.object({
  labOrderItemId: objectIdSchema,
  specimenId: objectIdSchema.nullable().optional(),
  technicianStaffId: objectIdSchema,
  expectedVersion: expectedVersionSchema.optional(),
  components: z.array(resultValueSchema).min(1).max(500),
  conclusion: optionalNullableText,
  technicalNotes: optionalNullableText,
});

export const validateLaboratoryResultHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  validatorStaffId: objectIdSchema,
});

export const verifyLaboratoryResultHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  verifierStaffId: objectIdSchema,
});

export const correctLaboratoryResultHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  technicianStaffId: objectIdSchema,
  validatorStaffId: objectIdSchema,
  verifierStaffId: objectIdSchema,
  components: z.array(resultValueSchema).min(1).max(500),
  conclusion: optionalNullableText,
  technicalNotes: optionalNullableText,
  reason: z.string().trim().min(5).max(2_000),
});

export const changeLaboratoryResultPublicationHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  publicationStatus: z.enum([
    'PUBLISHED',
    'WITHDRAWN',
  ]),
  reason: z.string().trim().min(3).max(2_000).optional(),
});

export const criticalResultCommunicationHttpSchema = z.object({
  expectedVersion: expectedVersionSchema,
  componentCode: z.string().trim().min(1).max(50),
  communicationType: z.enum([
    'ATTEMPTED',
    'NOTIFIED',
    'ESCALATED',
    'ACKNOWLEDGED',
  ]),
  channel: z.enum([
    'IN_PERSON',
    'PHONE',
    'SECURE_MESSAGE',
    'PAGER',
    'OTHER',
  ]),
  recipientType: z.enum([
    'ORDERING_PROVIDER',
    'ON_CALL_PROVIDER',
    'NURSE',
    'PATIENT',
    'GUARDIAN',
    'OTHER',
  ]),
  recipientUserId: objectIdSchema.nullable().optional(),
  recipientStaffId: objectIdSchema.nullable().optional(),
  recipientDisplay: z.string().trim().min(1).max(300),
  communicationNotes: optionalNullableText,
  acknowledgedAt: z.string().datetime().nullable().optional(),
  acknowledgedBy: objectIdSchema.nullable().optional(),
  acknowledgementNotes: optionalNullableText,
});

export const laboratoryHistoryQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});