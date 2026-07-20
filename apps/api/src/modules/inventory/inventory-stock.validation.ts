import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  stockReservationSourceTypeValues,
  stockTransferTypeValues,
} from '@hospital-mis/database';

import {
  inventoryExpectedVersionSchema,
  inventoryIsoDateTimeSchema,
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

const uniqueBy = <T>(
  values: readonly T[],
  key: (value: T) => string,
): boolean =>
  new Set(
    values.map(
      (value) => key(value).toLowerCase(),
    ),
  ).size === values.length;

export const createStockTransferRequestBodySchema = z
  .object({
    transferType: z.enum(stockTransferTypeValues),
    sourceLocationId: inventoryObjectIdSchema,
    destinationLocationId: inventoryObjectIdSchema,
    reason: inventoryReasonSchema,
    notes: nullableText(1, 5_000),
    lines: z
      .array(
        z
          .object({
            itemId: inventoryObjectIdSchema,
            requestedStockQuantity: inventoryPositiveDecimalStringSchema,
            notes: nullableText(1, 2_000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine(
    (value, context) => {
      if (
        value.sourceLocationId.toLowerCase() ===
        value.destinationLocationId.toLowerCase()
      ) {
        context.addIssue({
          code: 'custom',
          path: ['destinationLocationId'],
          message: 'Transfer source and destination locations must differ',
        });
      }

      if (
        !uniqueBy(
          value.lines,
          (line) => line.itemId,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'A stock-transfer request can contain each item only once',
        });
      }
    },
  );

export const approveStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
    reservationExpiresAt: inventoryIsoDateTimeSchema,
    lines: z
      .array(
        z
          .object({
            transferItemId: inventoryObjectIdSchema,
            approvedStockQuantity: inventoryPositiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine(
    (value, context) => {
      if (
        new Date(value.reservationExpiresAt).getTime() <= Date.now()
      ) {
        context.addIssue({
          code: 'custom',
          path: ['reservationExpiresAt'],
          message: 'Transfer reservation expiry must be in the future',
        });
      }

      if (
        !uniqueBy(
          value.lines,
          (line) => line.transferItemId,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'Transfer approval lines must be unique',
        });
      }
    },
  );

export const rejectStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const dispatchStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const receiveStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    lines: z
      .array(
        z
          .object({
            transferItemId: inventoryObjectIdSchema,
            batchId: inventoryObjectIdSchema.nullable().optional(),
            receivedStockQuantity: inventoryPositiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
    closeWithDiscrepancy: z.boolean().default(false),
    discrepancyReason: nullableText(5, 2_000),
  })
  .strict()
  .superRefine(
    (value, context) => {
      const keys = value.lines.map(
        (line) =>
          `${line.transferItemId.toLowerCase()}:${line.batchId?.toLowerCase() ?? 'none'}`,
      );

      if (new Set(keys).size !== keys.length) {
        context.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'Transfer receipt lines must be unique by transfer line and batch',
        });
      }

      if (
        value.closeWithDiscrepancy &&
        value.discrepancyReason == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['discrepancyReason'],
          message: 'Closing a transfer with discrepancy requires a reason',
        });
      }

      if (
        !value.closeWithDiscrepancy &&
        value.discrepancyReason != null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['discrepancyReason'],
          message: 'A discrepancy reason is only valid when closing with discrepancy',
        });
      }
    },
  );

export const cancelStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const reverseStockTransferBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const reserveStockBodySchema = z
  .object({
    sourceType: z.enum(stockReservationSourceTypeValues),
    sourceId: inventoryObjectIdSchema,
    sourceLineId: inventoryObjectIdSchema.nullable().optional(),
    locationId: inventoryObjectIdSchema,
    patientId: inventoryObjectIdSchema.nullable().optional(),
    expiresAt: inventoryIsoDateTimeSchema,
    lines: z
      .array(
        z
          .object({
            itemId: inventoryObjectIdSchema,
            requestedStockQuantity: inventoryPositiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine(
    (value, context) => {
      if (new Date(value.expiresAt).getTime() <= Date.now()) {
        context.addIssue({
          code: 'custom',
          path: ['expiresAt'],
          message: 'Stock reservation expiry must be in the future',
        });
      }

      if (!uniqueBy(value.lines, (line) => line.itemId)) {
        context.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'A stock reservation can contain each inventory item only once',
        });
      }

      if (
        value.sourceType === 'PRESCRIPTION' &&
        value.patientId == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['patientId'],
          message: 'Prescription reservations require a patient link',
        });
      }
    },
  );

export const releaseStockReservationBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const consumeDispensingReservationBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    dispensationId: inventoryObjectIdSchema,
    lines: z
      .array(
        z
          .object({
            reservationItemId: inventoryObjectIdSchema,
            stockQuantity: inventoryPositiveDecimalStringSchema,
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (value) =>
      uniqueBy(
        value.lines,
        (line) => line.reservationItemId,
      ),
    {
      path: ['lines'],
      message: 'Dispensing reservation lines must be unique',
    },
  );

export const reverseDispensingBodySchema = z
  .object({
    dispensationId: inventoryObjectIdSchema,
    reason: inventoryReasonSchema,
  })
  .strict();

export const expireReservationsBodySchema = z
  .object({
    facilityId: inventoryObjectIdSchema,
    limit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict();

export const stockQuantityMapSchema = z
  .record(
    inventoryObjectIdSchema,
    inventoryPositiveDecimalStringSchema,
  )
  .refine(
    (value) =>
      Object.values(value).every(
        (quantity) => new Decimal(quantity).gt(0),
      ),
    'All stock quantities must be greater than zero',
  );