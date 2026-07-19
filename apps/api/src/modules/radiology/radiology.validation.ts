import {
  z,
} from 'zod';

import {
  radiologyCatalogStatusValues,
  radiologyContrastRequirementValues,
  radiologyContrastRouteValues,
  radiologyLateralityRequirementValues,
  radiologyLateralityValues,
  radiologyModalityTypeValues,
  radiologyOrderPriorityValues,
  radiologyOrderStatusValues,
  radiologySafetyRequirementValues,
} from '@hospital-mis/database';

import {
  DEFAULT_RADIOLOGY_PAGE_SIZE,
  MAX_RADIOLOGY_PAGE_SIZE,
  RADIOLOGY_CATALOG_SORT_FIELDS,
  RADIOLOGY_ORDER_SORT_FIELDS,
} from './radiology.constants.js';

import {
  normalizeRadiologyCode,
  radiologyProcedureSelectionKey,
} from './radiology.normalization.js';

export const radiologyObjectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

export const radiologyExpectedVersionSchema = z
  .number()
  .int()
  .min(0);

export const radiologyReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(2_000);

export const radiologyIsoDateTimeSchema = z
  .string()
  .datetime({
    offset: true,
  });

const nullableText = (
  minimumLength: number,
  maximumLength: number,
) => z
  .string()
  .trim()
  .min(minimumLength)
  .max(maximumLength)
  .nullable()
  .optional();

const queryBooleanSchema = z.preprocess(
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

const pageSchema = z.coerce
  .number()
  .int()
  .min(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_RADIOLOGY_PAGE_SIZE);

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(
    /^[A-Za-z0-9._:/-]+$/u,
    'Idempotency key contains unsupported characters',
  );

export const radiologyMutationHeadersSchema = z
  .object({
    'idempotency-key': idempotencyKeySchema,
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const radiologyReadHeadersSchema = z
  .object({
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const radiologyEntityParamsSchema = z
  .object({
    modalityId: radiologyObjectIdSchema.optional(),
    procedureId: radiologyObjectIdSchema.optional(),
    orderId: radiologyObjectIdSchema.optional(),
    orderItemId: radiologyObjectIdSchema.optional(),
    appointmentId: radiologyObjectIdSchema.optional(),
    studyId: radiologyObjectIdSchema.optional(),
    reportId: radiologyObjectIdSchema.optional(),
    patientId: radiologyObjectIdSchema.optional(),
    encounterId: radiologyObjectIdSchema.optional(),
  })
  .strict();

function refineEffectivePeriod(
  value: {
    effectiveFrom?: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.effectiveFrom !== undefined &&
    value.effectiveThrough != null &&
    new Date(value.effectiveThrough) < new Date(value.effectiveFrom)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['effectiveThrough'],
      message: 'Effective-through time cannot precede effective-from time',
    });
  }
}

const radiologyModalityFields = {
  name: z
    .string()
    .trim()
    .min(2)
    .max(300),
  modalityType: z.enum(radiologyModalityTypeValues),
  dicomModalityCode: z
    .string()
    .trim()
    .min(2)
    .max(16),
  description: nullableText(2, 5_000),
  availableDepartmentIds: z
    .array(radiologyObjectIdSchema)
    .min(1)
    .max(500),
  supportsContrast: z.boolean().default(false),
  supportsPacsIntegration: z.boolean().default(true),
  pacsRoutingCode: nullableText(1, 100),
  orderable: z.boolean().default(true),
  effectiveFrom: radiologyIsoDateTimeSchema.optional(),
  effectiveThrough: radiologyIsoDateTimeSchema.nullable().optional(),
} as const;

function refineModality(
  value: {
    availableDepartmentIds?: readonly string[];
    supportsPacsIntegration?: boolean;
    pacsRoutingCode?: string | null;
    effectiveFrom?: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.availableDepartmentIds !== undefined &&
    new Set(
      value.availableDepartmentIds.map((departmentId) =>
        departmentId.toLowerCase(),
      ),
    ).size !== value.availableDepartmentIds.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['availableDepartmentIds'],
      message: 'Radiology modality departments must be unique',
    });
  }

  if (
    value.supportsPacsIntegration === false &&
    value.pacsRoutingCode != null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['pacsRoutingCode'],
      message: 'A modality without PACS integration cannot define a PACS routing code',
    });
  }

  refineEffectivePeriod(value, context);
}

export const createRadiologyModalityBodySchema = z
  .object({
    modalityCode: z
      .string()
      .trim()
      .min(2)
      .max(80),
    ...radiologyModalityFields,
  })
  .strict()
  .superRefine(refineModality);

export const updateRadiologyModalityBodySchema = z
  .object(radiologyModalityFields)
  .partial()
  .extend({
    expectedVersion: radiologyExpectedVersionSchema,
  })
  .strict()
  .superRefine(refineModality);

export const changeRadiologyCatalogStatusBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
    status: z.enum(radiologyCatalogStatusValues),
    reason: radiologyReasonSchema,
  })
  .strict();

const radiologyBodyRegionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(80),
    name: z
      .string()
      .trim()
      .min(1)
      .max(300),
  })
  .strict();

const procedureFields = {
  name: z
    .string()
    .trim()
    .min(2)
    .max(500),
  aliases: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(500),
    )
    .max(100)
    .default([]),
  description: nullableText(2, 10_000),
  modalityId: radiologyObjectIdSchema,
  bodyRegions: z
    .array(radiologyBodyRegionSchema)
    .min(1)
    .max(100),
  lateralityRequirement: z.enum(radiologyLateralityRequirementValues),
  permittedLateralities: z
    .array(z.enum(radiologyLateralityValues))
    .min(1)
    .max(radiologyLateralityValues.length),
  contrastRequirement: z.enum(radiologyContrastRequirementValues),
  permittedContrastRoutes: z
    .array(z.enum(radiologyContrastRouteValues))
    .max(radiologyContrastRouteValues.length)
    .default([]),
  preparationInstructions: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(5_000),
    )
    .max(100)
    .default([]),
  contraindications: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(5_000),
    )
    .max(100)
    .default([]),
  safetyScreeningRequirements: z
    .array(z.enum(radiologySafetyRequirementValues))
    .max(radiologySafetyRequirementValues.length)
    .default([]),
  expectedDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(1_440),
  routineTurnaroundMinutes: z
    .number()
    .int()
    .min(1)
    .max(43_200),
  urgentTurnaroundMinutes: z
    .number()
    .int()
    .min(1)
    .max(43_200)
    .nullable()
    .optional(),
  statTurnaroundMinutes: z
    .number()
    .int()
    .min(1)
    .max(43_200)
    .nullable()
    .optional(),
  availableDepartmentIds: z
    .array(radiologyObjectIdSchema)
    .min(1)
    .max(500),
  schedulingRequired: z.boolean().default(true),
  requiresTechnician: z.boolean().default(true),
  requiresRadiologist: z.boolean().default(true),
  orderable: z.boolean().default(true),
  chargeCatalogItemId: radiologyObjectIdSchema.nullable().optional(),
  effectiveFrom: radiologyIsoDateTimeSchema.optional(),
  effectiveThrough: radiologyIsoDateTimeSchema.nullable().optional(),
} as const;

function refineProcedure(
  value: {
    bodyRegions?: readonly { code: string }[];
    lateralityRequirement?:
      (typeof radiologyLateralityRequirementValues)[number];
    permittedLateralities?: readonly (
      typeof radiologyLateralityValues
    )[number][];
    contrastRequirement?:
      (typeof radiologyContrastRequirementValues)[number];
    permittedContrastRoutes?: readonly (
      typeof radiologyContrastRouteValues
    )[number][];
    safetyScreeningRequirements?: readonly (
      typeof radiologySafetyRequirementValues
    )[number][];
    routineTurnaroundMinutes?: number;
    urgentTurnaroundMinutes?: number | null;
    statTurnaroundMinutes?: number | null;
    availableDepartmentIds?: readonly string[];
    effectiveFrom?: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (value.bodyRegions !== undefined) {
    const codes = value.bodyRegions.map((region) =>
      normalizeRadiologyCode(region.code),
    );

    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: 'custom',
        path: ['bodyRegions'],
        message: 'Radiology procedure body-region codes must be unique',
      });
    }
  }

  if (value.permittedLateralities !== undefined) {
    if (
      new Set(value.permittedLateralities).size !==
      value.permittedLateralities.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['permittedLateralities'],
        message: 'Permitted lateralities must be unique',
      });
    }

    if (
      value.lateralityRequirement === 'NOT_APPLICABLE' &&
      (
        value.permittedLateralities.length !== 1 ||
        value.permittedLateralities[0] !== 'NOT_APPLICABLE'
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['permittedLateralities'],
        message: 'Non-lateral procedures may only permit NOT_APPLICABLE',
      });
    }

    if (
      value.lateralityRequirement !== undefined &&
      value.lateralityRequirement !== 'NOT_APPLICABLE' &&
      value.permittedLateralities.includes('NOT_APPLICABLE')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['permittedLateralities'],
        message: 'Lateral procedures cannot permit NOT_APPLICABLE',
      });
    }
  }

  if (
    value.contrastRequirement === 'NONE' &&
    (value.permittedContrastRoutes?.length ?? 0) > 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['permittedContrastRoutes'],
      message: 'Non-contrast procedures cannot define contrast routes',
    });
  }

  if (
    value.contrastRequirement !== undefined &&
    value.contrastRequirement !== 'NONE' &&
    (value.permittedContrastRoutes?.length ?? 0) < 1
  ) {
    context.addIssue({
      code: 'custom',
      path: ['permittedContrastRoutes'],
      message: 'Contrast-capable procedures require at least one contrast route',
    });
  }

  if (
    value.contrastRequirement !== undefined &&
    ['REQUIRED', 'CONDITIONAL'].includes(value.contrastRequirement) &&
    !value.safetyScreeningRequirements?.includes('CONTRAST_ALLERGY')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['safetyScreeningRequirements'],
      message: 'Required or conditional contrast procedures require contrast-allergy screening',
    });
  }

  if (
    value.routineTurnaroundMinutes !== undefined &&
    value.urgentTurnaroundMinutes != null &&
    value.urgentTurnaroundMinutes > value.routineTurnaroundMinutes
  ) {
    context.addIssue({
      code: 'custom',
      path: ['urgentTurnaroundMinutes'],
      message: 'Urgent turnaround cannot exceed routine turnaround',
    });
  }

  const statUpperBound =
    value.urgentTurnaroundMinutes ??
    value.routineTurnaroundMinutes;

  if (
    statUpperBound !== undefined &&
    value.statTurnaroundMinutes != null &&
    value.statTurnaroundMinutes > statUpperBound
  ) {
    context.addIssue({
      code: 'custom',
      path: ['statTurnaroundMinutes'],
      message: 'STAT turnaround cannot exceed urgent or routine turnaround',
    });
  }

  if (
    value.availableDepartmentIds !== undefined &&
    new Set(
      value.availableDepartmentIds.map((departmentId) =>
        departmentId.toLowerCase(),
      ),
    ).size !== value.availableDepartmentIds.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['availableDepartmentIds'],
      message: 'Radiology procedure departments must be unique',
    });
  }

  refineEffectivePeriod(value, context);
}

export const createRadiologyProcedureBodySchema = z
  .object({
    procedureCode: z
      .string()
      .trim()
      .min(2)
      .max(100),
    ...procedureFields,
  })
  .strict()
  .superRefine(refineProcedure);

export const updateRadiologyProcedureBodySchema = z
  .object(procedureFields)
  .partial()
  .extend({
    expectedVersion: radiologyExpectedVersionSchema,
  })
  .strict()
  .superRefine(refineProcedure);

export const radiologyCatalogQuerySchema = z
  .object({
    page: pageSchema.default(1),
    pageSize: pageSizeSchema.default(DEFAULT_RADIOLOGY_PAGE_SIZE),
    search: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional(),
    modalityId: radiologyObjectIdSchema.optional(),
    modalityType: z.enum(radiologyModalityTypeValues).optional(),
    bodyRegionCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional(),
    departmentId: radiologyObjectIdSchema.optional(),
    contrastRequirement: z
      .enum(radiologyContrastRequirementValues)
      .optional(),
    status: z.enum(radiologyCatalogStatusValues).optional(),
    orderable: queryBooleanSchema.optional(),
    effectiveAt: radiologyIsoDateTimeSchema.optional(),
    sortBy: z
      .enum(RADIOLOGY_CATALOG_SORT_FIELDS)
      .default('name'),
    sortDirection: z
      .enum(['asc', 'desc'])
      .default('asc'),
  })
  .strict();

const radiologyOrderItemInputSchema = z
  .object({
    procedureId: radiologyObjectIdSchema,
    requestedLaterality: z.enum(radiologyLateralityValues),
    contrastRequested: z.boolean(),
    requestedContrastRoute: z
      .enum(radiologyContrastRouteValues)
      .nullable()
      .optional(),
    specialInstructions: nullableText(1, 5_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.contrastRequested &&
      value.requestedContrastRoute == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['requestedContrastRoute'],
        message: 'Contrast requests require a route',
      });
    }

    if (
      !value.contrastRequested &&
      value.requestedContrastRoute != null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['requestedContrastRoute'],
        message: 'Non-contrast requests cannot include a contrast route',
      });
    }
  });

export const createRadiologyOrderBodySchema = z
  .object({
    encounterId: radiologyObjectIdSchema,
    priority: z.enum(radiologyOrderPriorityValues),
    clinicalIndication: z
      .string()
      .trim()
      .min(2)
      .max(5_000),
    orderingNotes: nullableText(1, 10_000),
    items: z
      .array(radiologyOrderItemInputSchema)
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const selectionKeys = value.items.map(radiologyProcedureSelectionKey);

    if (new Set(selectionKeys).size !== selectionKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Duplicate Radiology procedure, laterality, and contrast selections are not allowed',
      });
    }
  });

export const acceptRadiologyOrderBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
  })
  .strict();

export const rejectRadiologyOrderBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(100),
    reason: radiologyReasonSchema,
  })
  .strict();

export const cancelRadiologyOrderBodySchema = z
  .object({
    expectedVersion: radiologyExpectedVersionSchema,
    reason: radiologyReasonSchema,
  })
  .strict();

export const radiologyOrderListQuerySchema = z
  .object({
    page: pageSchema.default(1),
    pageSize: pageSizeSchema.default(DEFAULT_RADIOLOGY_PAGE_SIZE),
    patientId: radiologyObjectIdSchema.optional(),
    encounterId: radiologyObjectIdSchema.optional(),
    orderingProviderId: radiologyObjectIdSchema.optional(),
    departmentId: radiologyObjectIdSchema.optional(),
    procedureId: radiologyObjectIdSchema.optional(),
    status: z.enum(radiologyOrderStatusValues).optional(),
    priority: z.enum(radiologyOrderPriorityValues).optional(),
    orderedFrom: radiologyIsoDateTimeSchema.optional(),
    orderedTo: radiologyIsoDateTimeSchema.optional(),
    sortBy: z
      .enum(RADIOLOGY_ORDER_SORT_FIELDS)
      .default('orderedAt'),
    sortDirection: z
      .enum(['asc', 'desc'])
      .default('desc'),
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
        message: 'Ordered-to time cannot precede ordered-from time',
      });
    }
  });