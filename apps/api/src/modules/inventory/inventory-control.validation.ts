import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  inventoryQuantityBucketValues,
  physicalStockCountScopeValues,
  productRecallActionValues,
  stockAdjustmentTypeValues,
} from '@hospital-mis/database';

import {
  inventoryExpectedVersionSchema,
  inventoryIsoDateTimeSchema,
  inventoryNonNegativeDecimalStringSchema,
  inventoryObjectIdSchema,
  inventoryPositiveDecimalStringSchema,
  inventoryReasonSchema,
} from './inventory.validation.js';

const nullableText = (
  minimum: number,
  maximum: number,
) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .nullable()
    .optional();

const attachmentIdsSchema = z
  .array(inventoryObjectIdSchema)
  .max(50)
  .default([])
  .refine(
    (values) =>
      new Set(values.map((value) => value.toLowerCase())).size ===
      values.length,
    'Attachment IDs must be unique',
  );

const adjustmentLineSchema = z
  .object({
    itemId: inventoryObjectIdSchema,
    batchId: inventoryObjectIdSchema.nullable().optional(),
    bucket: z.enum(inventoryQuantityBucketValues),
    direction: z.enum([
      'INCREASE',
      'DECREASE',
    ]),
    quantity: inventoryPositiveDecimalStringSchema,
    reasonCode: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[A-Za-z0-9._/-]+$/u),
    unitCost: inventoryNonNegativeDecimalStringSchema.nullable().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    notes: nullableText(1, 2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.unitCost != null && value.currency == null) {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Costed adjustment lines require a currency',
      });
    }
  });

export const createStockAdjustmentBodySchema = z
  .object({
    locationId: inventoryObjectIdSchema,
    adjustmentType: z.enum(stockAdjustmentTypeValues),
    reason: inventoryReasonSchema,
    attachmentIds: attachmentIdsSchema,
    lines: z
      .array(adjustmentLineSchema)
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const targets = value.lines.map((line) =>
      [
        line.itemId.toLowerCase(),
        line.batchId?.toLowerCase() ?? 'none',
        line.bucket,
      ].join(':'),
    );

    if (new Set(targets).size !== targets.length) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message:
          'An adjustment cannot contain duplicate item, batch, and bucket targets',
      });
    }

  });

export const submitInventoryControlBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const decideInventoryControlBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    decision: z.enum([
      'APPROVE',
      'REJECT',
    ]),
    reason: inventoryReasonSchema,
  })
  .strict();

export const reverseStockAdjustmentBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

const countTargetSchema = z
  .object({
    itemId: inventoryObjectIdSchema,
    batchId: inventoryObjectIdSchema.nullable().optional(),
    bucket: z.enum(inventoryQuantityBucketValues),
  })
  .strict();

export const createPhysicalStockCountBodySchema = z
  .object({
    locationId: inventoryObjectIdSchema,
    scope: z.enum(physicalStockCountScopeValues),
    categoryId: inventoryObjectIdSchema.nullable().optional(),
    assignedToStaffId: inventoryObjectIdSchema.nullable().optional(),
    reason: inventoryReasonSchema,
    attachmentIds: attachmentIdsSchema,
    targets: z
      .array(countTargetSchema)
      .min(1)
      .max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'CATEGORY' && value.categoryId == null) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Category-scoped counts require a category ID',
      });
    }

    if (value.scope !== 'CATEGORY' && value.categoryId != null) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Category ID is allowed only for category-scoped counts',
      });
    }

    const targets = value.targets.map((target) =>
      [
        target.itemId.toLowerCase(),
        target.batchId?.toLowerCase() ?? 'none',
        target.bucket,
      ].join(':'),
    );

    if (new Set(targets).size !== targets.length) {
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Physical-count targets must be unique',
      });
    }
  });

export const recordPhysicalStockCountLineBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    actualQuantity: inventoryNonNegativeDecimalStringSchema,
    notes: nullableText(1, 2_000),
  })
  .strict();

const recallBatchSchema = z
  .object({
    itemId: inventoryObjectIdSchema,
    batchId: inventoryObjectIdSchema,
    notes: nullableText(1, 2_000),
  })
  .strict();

export const createProductRecallBodySchema = z
  .object({
    externalReference: z
      .string()
      .trim()
      .min(2)
      .max(200),
    title: z
      .string()
      .trim()
      .min(3)
      .max(500),
    reason: inventoryReasonSchema,
    action: z.enum(productRecallActionValues),
    attachmentIds: attachmentIdsSchema,
    batches: z
      .array(recallBatchSchema)
      .min(1)
      .max(5_000),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.batches.map((entry) => entry.batchId.toLowerCase()))
        .size === value.batches.length,
    {
      path: ['batches'],
      message: 'Recall batches must be unique',
    },
  );

export const activateProductRecallBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const closeProductRecallBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const upsertReorderRuleBodySchema = z
  .object({
    locationId: inventoryObjectIdSchema,
    itemId: inventoryObjectIdSchema,
    expectedVersion: inventoryExpectedVersionSchema.optional(),
    minimumStockLevel: inventoryNonNegativeDecimalStringSchema,
    reorderLevel: inventoryNonNegativeDecimalStringSchema,
    maximumStockLevel:
      inventoryNonNegativeDecimalStringSchema.nullable().optional(),
    safetyStockLevel: inventoryNonNegativeDecimalStringSchema,
    criticalStockLevel: inventoryNonNegativeDecimalStringSchema,
    preferredSupplierId: inventoryObjectIdSchema.nullable().optional(),
    active: z.boolean().default(true),
    notes: nullableText(1, 2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const critical = new Decimal(value.criticalStockLevel);
    const safety = new Decimal(value.safetyStockLevel);
    const minimum = new Decimal(value.minimumStockLevel);
    const reorder = new Decimal(value.reorderLevel);

    if (critical.gt(safety)) {
      context.addIssue({
        code: 'custom',
        path: ['criticalStockLevel'],
        message: 'Critical stock level cannot exceed safety stock level',
      });
    }

    if (safety.gt(minimum)) {
      context.addIssue({
        code: 'custom',
        path: ['safetyStockLevel'],
        message: 'Safety stock level cannot exceed minimum stock level',
      });
    }

    if (minimum.gt(reorder)) {
      context.addIssue({
        code: 'custom',
        path: ['minimumStockLevel'],
        message: 'Minimum stock level cannot exceed reorder level',
      });
    }

    if (
      value.maximumStockLevel != null &&
      reorder.gt(value.maximumStockLevel)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumStockLevel'],
        message: 'Maximum stock level cannot be lower than reorder level',
      });
    }
  });

export const inventoryMonitoringQuerySchema = z
  .object({
    locationId: inventoryObjectIdSchema.optional(),
    itemId: inventoryObjectIdSchema.optional(),
    categoryId: inventoryObjectIdSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const nearExpiryInventoryQuerySchema =
  inventoryMonitoringQuerySchema
    .extend({
      expiresWithinDays: z.coerce.number().int().min(1).max(3_650).default(90),
      includeQuarantined: z
        .union([
          z.boolean(),
          z.enum(['true', 'false']).transform((value) => value === 'true'),
        ])
        .optional(),
    })
    .strict();

export const inventoryValuationQuerySchema =
  inventoryMonitoringQuerySchema
    .extend({
      includeRestricted: z
        .union([
          z.boolean(),
          z.enum(['true', 'false']).transform((value) => value === 'true'),
        ])
        .optional(),
    })
    .strict();

export const stockReconciliationQuerySchema =
  inventoryMonitoringQuerySchema
    .extend({
      onlyMismatches: z
        .union([
          z.boolean(),
          z.enum(['true', 'false']).transform((value) => value === 'true'),
        ])
        .optional(),
    })
    .strict();

export const runInventoryRestrictionSweepBodySchema = z
  .object({
    facilityId: inventoryObjectIdSchema,
    batchLimit: z.number().int().min(1).max(5_000).default(500),
    occurredAt: inventoryIsoDateTimeSchema.optional(),
  })
  .strict();