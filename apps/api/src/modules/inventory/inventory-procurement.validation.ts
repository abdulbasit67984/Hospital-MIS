import Decimal from 'decimal.js';

import {
  z,
} from 'zod';

import {
  goodsReceiptInspectionStatusValues,
  purchaseInvoiceStatusValues,
  purchaseRequisitionPriorityValues,
  supplierReturnConditionValues,
  supplierReturnReasonValues,
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
  .array(
    inventoryObjectIdSchema,
  )
  .max(50)
  .default([])
  .refine(
    (values) =>
      new Set(
        values.map(
          (value) =>
            value.toLowerCase(),
        ),
      ).size === values.length,

    'Attachment IDs must be unique',
  );

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform(
    (value) =>
      value.toUpperCase(),
  )
  .default('PKR');

const requisitionLineSchema = z
  .object({
    itemId:
      inventoryObjectIdSchema,

    requestedUnitId:
      inventoryObjectIdSchema,

    requestedQuantity:
      inventoryPositiveDecimalStringSchema,

    estimatedUnitCost:
      inventoryNonNegativeDecimalStringSchema,

    estimatedTaxAmount:
      inventoryNonNegativeDecimalStringSchema
        .default('0'),

    estimatedDiscountAmount:
      inventoryNonNegativeDecimalStringSchema
        .default('0'),

    preferredSupplierId:
      inventoryObjectIdSchema
        .nullable()
        .optional(),

    notes:
      nullableText(
        1,
        2_000,
      ),
  })
  .strict();

export const createPurchaseRequisitionBodySchema =
  z
    .object({
      requestingDepartmentId:
        inventoryObjectIdSchema,

      requestingLocationId:
        inventoryObjectIdSchema,

      priority:
        z
          .enum(
            purchaseRequisitionPriorityValues,
          )
          .default('ROUTINE'),

      needByDate:
        inventoryIsoDateTimeSchema
          .nullable()
          .optional(),

      justification:
        z
          .string()
          .trim()
          .min(5)
          .max(5_000),

      notes:
        nullableText(
          1,
          5_000,
        ),

      currency:
        currencySchema,

      attachmentIds:
        attachmentIdsSchema,

      lines:
        z
          .array(
            requisitionLineSchema,
          )
          .min(1)
          .max(500),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const itemIds =
          value.lines.map(
            (line) =>
              line.itemId.toLowerCase(),
          );

        if (
          new Set(
            itemIds,
          ).size !==
          itemIds.length
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lines'],

            message:
              'A requisition can contain each inventory item only once',
          });
        }

        if (
          value.needByDate != null &&
          new Date(
            value.needByDate,
          ).getTime() <=
            Date.now()
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'needByDate',
            ],

            message:
              'Need-by date must be in the future',
          });
        }
      },
    );

export const submitPurchaseRequisitionBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      reason:
        inventoryReasonSchema,
    })
    .strict();

const requisitionDecisionLineSchema =
  z
    .object({
      requisitionItemId:
        inventoryObjectIdSchema,

      approvedStockQuantity:
        inventoryNonNegativeDecimalStringSchema,

      decision:
        z.enum([
          'APPROVED',
          'REJECTED',
        ]),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.decision ===
            'APPROVED' &&
          new Decimal(
            value.approvedStockQuantity,
          ).lte(0)
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'approvedStockQuantity',
            ],

            message:
              'Approved requisition lines require a quantity greater than zero',
          });
        }

        if (
          value.decision ===
            'REJECTED' &&
          !new Decimal(
            value.approvedStockQuantity,
          ).eq(0)
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'approvedStockQuantity',
            ],

            message:
              'Rejected requisition lines must have zero approved quantity',
          });
        }
      },
    );

export const decidePurchaseRequisitionBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      decision:
        z.enum([
          'APPROVED',
          'REJECTED',
        ]),

      reason:
        inventoryReasonSchema,

      lines:
        z
          .array(
            requisitionDecisionLineSchema,
          )
          .min(1)
          .max(500)
          .optional(),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.decision ===
            'APPROVED' &&
          value.lines === undefined
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lines'],

            message:
              'Approval requires line-level decisions',
          });
        }

        if (
          value.lines !==
            undefined &&
          new Set(
            value.lines.map(
              (line) =>
                line.requisitionItemId.toLowerCase(),
            ),
          ).size !==
            value.lines.length
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lines'],

            message:
              'Requisition decision lines must be unique',
          });
        }
      },
    );

const purchaseOrderLineSchema =
  z
    .object({
      requisitionItemId:
        inventoryObjectIdSchema,

      purchaseUnitId:
        inventoryObjectIdSchema,

      orderedQuantity:
        inventoryPositiveDecimalStringSchema,

      unitCost:
        inventoryNonNegativeDecimalStringSchema,

      taxAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      discountAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      overReceiptTolerancePercent:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      notes:
        nullableText(
          1,
          2_000,
        ),
    })
    .strict()
    .refine(
      (value) =>
        new Decimal(
          value.overReceiptTolerancePercent,
        ).lte(100),

      {
        path: [
          'overReceiptTolerancePercent',
        ],

        message:
          'Over-receipt tolerance cannot exceed 100 percent',
      },
    );

export const createPurchaseOrderBodySchema =
  z
    .object({
      requisitionId:
        inventoryObjectIdSchema,

      supplierId:
        inventoryObjectIdSchema,

      deliveryLocationId:
        inventoryObjectIdSchema,

      expectedDeliveryDate:
        inventoryIsoDateTimeSchema,

      currency:
        currencySchema,

      termsAndConditions:
        nullableText(
          1,
          10_000,
        ),

      notes:
        nullableText(
          1,
          5_000,
        ),

      attachmentIds:
        attachmentIdsSchema,

      lines:
        z
          .array(
            purchaseOrderLineSchema,
          )
          .min(1)
          .max(500),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          new Date(
            value.expectedDeliveryDate,
          ).getTime() <=
          Date.now()
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'expectedDeliveryDate',
            ],

            message:
              'Expected delivery date must be in the future',
          });
        }

        if (
          new Set(
            value.lines.map(
              (line) =>
                line.requisitionItemId.toLowerCase(),
            ),
          ).size !==
            value.lines.length
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lines'],

            message:
              'Purchase-order requisition lines must be unique',
          });
        }
      },
    );

export const acknowledgePurchaseOrderBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      acknowledgementStatus:
        z.enum([
          'ACCEPTED',
          'ACCEPTED_WITH_CHANGES',
          'REJECTED',
        ]),

      acknowledgementReference:
        z
          .string()
          .trim()
          .min(1)
          .max(200),

      acknowledgedBy:
        nullableText(
          1,
          300,
        ),

      acknowledgementNotes:
        nullableText(
          1,
          2_000,
        ),

      revisedExpectedDeliveryDate:
        inventoryIsoDateTimeSchema
          .nullable()
          .optional(),
    })
    .strict();

export const cancelPurchaseOrderBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      reason:
        inventoryReasonSchema,
    })
    .strict();

const goodsReceiptLineSchema =
  z
    .object({
      purchaseOrderItemId:
        inventoryObjectIdSchema,

      receivedUnitId:
        inventoryObjectIdSchema,

      receivedQuantity:
        inventoryPositiveDecimalStringSchema,

      acceptedStockQuantity:
        inventoryNonNegativeDecimalStringSchema,

      rejectedStockQuantity:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      damagedStockQuantity:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      quarantinedStockQuantity:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      manufacturerName:
        nullableText(
          1,
          300,
        ),

      manufacturerBatchNumber:
        z
          .string()
          .trim()
          .min(1)
          .max(200),

      manufactureDate:
        inventoryIsoDateTimeSchema
          .nullable()
          .optional(),

      expiryDate:
        inventoryIsoDateTimeSchema
          .nullable()
          .optional(),

      unitCost:
        inventoryNonNegativeDecimalStringSchema,

      taxAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      discountAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      inspectionNotes:
        nullableText(
          1,
          2_000,
        ),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        const classified =
          new Decimal(
            value.acceptedStockQuantity,
          )
            .plus(
              value.rejectedStockQuantity,
            )
            .plus(
              value.damagedStockQuantity,
            )
            .plus(
              value.quarantinedStockQuantity,
            );

        if (
          classified.lte(0)
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'acceptedStockQuantity',
            ],

            message:
              'Receipt classification must contain a positive stock quantity',
          });
        }

        if (
          value.manufactureDate !=
            null &&
          value.expiryDate !=
            null &&
          new Date(
            value.manufactureDate,
          ) >=
            new Date(
              value.expiryDate,
            )
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'expiryDate',
            ],

            message:
              'Expiry date must be later than manufacture date',
          });
        }
      },
    );

const purchaseInvoiceSchema =
  z
    .object({
      supplierInvoiceNumber:
        z
          .string()
          .trim()
          .min(1)
          .max(150),

      invoiceDate:
        inventoryIsoDateTimeSchema,

      dueDate:
        inventoryIsoDateTimeSchema
          .nullable()
          .optional(),

      currency:
        currencySchema,

      subtotal:
        inventoryNonNegativeDecimalStringSchema,

      taxAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      discountAmount:
        inventoryNonNegativeDecimalStringSchema
          .default('0'),

      netAmount:
        inventoryNonNegativeDecimalStringSchema,

      status:
        z
          .enum(
            purchaseInvoiceStatusValues,
          )
          .default(
            'REGISTERED',
          ),

      discrepancyReason:
        nullableText(
          5,
          2_000,
        ),

      attachmentIds:
        attachmentIdsSchema,
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.status ===
            'DISPUTED' &&
          value.discrepancyReason ==
            null
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'discrepancyReason',
            ],

            message:
              'Disputed invoices require a discrepancy reason',
          });
        }

        if (
          value.dueDate !=
            null &&
          new Date(
            value.dueDate,
          ) <
            new Date(
              value.invoiceDate,
            )
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'dueDate',
            ],

            message:
              'Invoice due date cannot precede invoice date',
          });
        }

        const calculatedNet =
          new Decimal(
            value.subtotal,
          )
            .plus(
              value.taxAmount,
            )
            .minus(
              value.discountAmount,
            );

        if (
          calculatedNet.isNegative() ||
          !calculatedNet.eq(
            value.netAmount,
          )
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'netAmount',
            ],

            message:
              'Invoice net amount must equal subtotal plus tax minus discount',
          });
        }
      },
    );

export const receiveGoodsBodySchema =
  z
    .object({
      purchaseOrderId:
        inventoryObjectIdSchema,

      receivingLocationId:
        inventoryObjectIdSchema,

      receivedAt:
        inventoryIsoDateTimeSchema
          .optional(),

      supplierDeliveryReference:
        nullableText(
          1,
          200,
        ),

      notes:
        nullableText(
          1,
          5_000,
        ),

      attachmentIds:
        attachmentIdsSchema,

      inspectionStatus:
        z.enum(
          goodsReceiptInspectionStatusValues,
        ),

      purchaseInvoice:
        purchaseInvoiceSchema
          .optional(),

      lines:
        z
          .array(
            goodsReceiptLineSchema,
          )
          .min(1)
          .max(500),
    })
    .strict()
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          new Set(
            value.lines.map(
              (line) =>
                line.purchaseOrderItemId.toLowerCase(),
            ),
          ).size !==
            value.lines.length
        ) {
          context.addIssue({
            code: 'custom',
            path: ['lines'],

            message:
              'A receipt can contain each purchase-order line only once',
          });
        }

        if (
          value.inspectionStatus ===
            'FAILED' &&
          value.lines.some(
            (line) =>
              new Decimal(
                line.acceptedStockQuantity,
              ).gt(0),
          )
        ) {
          context.addIssue({
            code: 'custom',

            path: [
              'inspectionStatus',
            ],

            message:
              'A failed inspection cannot accept stock',
          });
        }
      },
    );

export const enterGoodsReceiptInErrorBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      reason:
        inventoryReasonSchema,
    })
    .strict();

const supplierReturnLineSchema =
  z
    .object({
      goodsReceiptItemId:
        inventoryObjectIdSchema,

      returnStockQuantity:
        inventoryPositiveDecimalStringSchema,

      reasonCode:
        z.enum(
          supplierReturnReasonValues,
        ),

      condition:
        z.enum(
          supplierReturnConditionValues,
        ),

      notes:
        nullableText(
          1,
          2_000,
        ),
    })
    .strict();

export const initiateSupplierReturnBodySchema =
  z
    .object({
      goodsReceiptId:
        inventoryObjectIdSchema,

      sourceLocationId:
        inventoryObjectIdSchema,

      reason:
        inventoryReasonSchema,

      attachmentIds:
        attachmentIdsSchema,

      lines:
        z
          .array(
            supplierReturnLineSchema,
          )
          .min(1)
          .max(500),
    })
    .strict()
    .refine(
      (value) =>
        new Set(
          value.lines.map(
            (line) =>
              line.goodsReceiptItemId.toLowerCase(),
          ),
        ).size ===
        value.lines.length,

      {
        path: ['lines'],

        message:
          'Supplier-return receipt lines must be unique',
      },
    );

export const approveSupplierReturnBodySchema =
  z
    .object({
      expectedVersion:
        inventoryExpectedVersionSchema,

      reason:
        inventoryReasonSchema,
    })
    .strict();