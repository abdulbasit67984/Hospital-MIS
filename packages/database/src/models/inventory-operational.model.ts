import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  compareInventoryDecimals,
  decimalPartsEqual,
  inventoryCommonFields,
  inventoryDecimalParts,
  sumInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';


function compareDecimalParts(
  left: Readonly<{ coefficient: bigint; scale: number }>,
  right: Readonly<{ coefficient: bigint; scale: number }>,
): number {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightValue = right.coefficient * 10n ** BigInt(scale - right.scale);

  return leftValue < rightValue
    ? -1
    : leftValue > rightValue
      ? 1
      : 0;
}

export const stockMovementTypeValues = [
  'OPENING_BALANCE',
  'GOODS_RECEIPT',
  'ISSUE',
  'TRANSFER_RESERVATION',
  'TRANSFER_RESERVATION_RELEASE',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIPT',
  'TRANSFER_DISCREPANCY',
  'TRANSFER_REVERSAL',
  'DISPENSING_RESERVATION',
  'DISPENSING',
  'DISPENSING_REVERSAL',
  'PATIENT_RETURN',
  'SUPPLIER_RETURN',
  'SUPPLIER_RETURN_REJECTED',
  'DEPARTMENT_RETURN',
  'ADJUSTMENT',
  'BREAKAGE',
  'WASTAGE',
  'EXPIRY_WRITE_OFF',
  'THEFT_LOSS',
  'QUARANTINE',
  'QUARANTINE_RELEASE',
  'STOCK_COUNT_RECONCILIATION',
  'RESERVATION',
  'RESERVATION_RELEASE',
  'RESERVATION_CONSUME',
  'REVERSAL',
] as const;

export const stockMovementDirectionValues = [
  'IN',
  'OUT',
  'NEUTRAL',
] as const;

export const stockMovementSourceTypeValues = [
  'OPENING_BALANCE',
  'GOODS_RECEIPT',
  'STOCK_TRANSFER',
  'STOCK_RESERVATION',
  'DISPENSATION',
  'PRESCRIPTION',
  'PATIENT_RETURN',
  'SUPPLIER_RETURN',
  'DEPARTMENT_RETURN',
  'STOCK_ADJUSTMENT',
  'PHYSICAL_STOCK_COUNT',
  'PRODUCT_RECALL',
  'EXPIRY_JOB',
  'MANUAL_REVERSAL',
  'OTHER',
] as const;

export const stockTransferTypeValues = [
  'LOCATION_TRANSFER',
  'INTERNAL_REQUEST',
  'DEPARTMENT_ISSUE',
  'PHARMACY_ISSUE',
  'WARD_ISSUE',
] as const;

export const stockTransferStatusValues = [
  'DRAFT',
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'DISCREPANCY',
  'CANCELLED',
  'REVERSED',
] as const;

export const stockTransferItemStatusValues = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'DISCREPANCY',
  'CANCELLED',
  'REVERSED',
] as const;

export const stockReservationSourceTypeValues = [
  'PRESCRIPTION',
  'DISPENSATION',
  'STOCK_TRANSFER',
  'INTERNAL_REQUEST',
  'OTHER',
] as const;

export const stockReservationStatusValues = [
  'ACTIVE',
  'PARTIALLY_CONSUMED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
  'REVERSED',
] as const;

export const stockReservationItemStatusValues = [
  'ACTIVE',
  'PARTIALLY_CONSUMED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
  'REVERSED',
] as const;

export type StockMovementType =
  (typeof stockMovementTypeValues)[number];

export type StockMovementDirection =
  (typeof stockMovementDirectionValues)[number];

export type StockMovementSourceType =
  (typeof stockMovementSourceTypeValues)[number];

export type StockTransferType =
  (typeof stockTransferTypeValues)[number];

export type StockTransferStatus =
  (typeof stockTransferStatusValues)[number];

export type StockReservationSourceType =
  (typeof stockReservationSourceTypeValues)[number];

export type StockReservationStatus =
  (typeof stockReservationStatusValues)[number];

const nullableObjectId = {
  type: Schema.Types.ObjectId,
  default: null,
} as const;

const signedDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const;

export const stockMovementSchema = new Schema(
  {
    ...inventoryCommonFields,

    movementNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 200,
    },

    ledgerSequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    batchId: {
      ...nullableObjectId,
      immutable: true,
    },

    storeLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    movementType: {
      type: String,
      required: true,
      immutable: true,
      enum: stockMovementTypeValues,
    },

    direction: {
      type: String,
      required: true,
      immutable: true,
      enum: stockMovementDirectionValues,
    },

    quantity: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    onHandDelta: {
      ...signedDecimal,
      immutable: true,
    },

    availableDelta: {
      ...signedDecimal,
      immutable: true,
    },

    reservedDelta: {
      ...signedDecimal,
      immutable: true,
    },

    quarantinedDelta: {
      ...signedDecimal,
      immutable: true,
    },

    damagedDelta: {
      ...signedDecimal,
      immutable: true,
    },

    expiredDelta: {
      ...signedDecimal,
      immutable: true,
    },

    inTransitDelta: {
      ...signedDecimal,
      immutable: true,
    },

    balanceVersionBefore: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },

    balanceVersionAfter: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    sourceType: {
      type: String,
      required: true,
      immutable: true,
      enum: stockMovementSourceTypeValues,
    },

    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourceLineId: {
      ...nullableObjectId,
      immutable: true,
    },

    reversalOfMovementId: {
      ...nullableObjectId,
      immutable: true,
    },

    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 500,
    },

    actorStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    unitCost: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },

    currency: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    negativeStockOverride: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },

    negativeStockOverrideReason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    reason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
      select: false,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
      select: false,
    },

    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'stockMovements',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockMovementSchema.pre(
  'validate',
  function validateStockMovement() {
    validatePositiveInventoryDecimal(
      this,
      'quantity',
      this.get('quantity'),
    );

    if (this.get('unitCost') != null) {
      validateNonNegativeInventoryDecimal(
        this,
        'unitCost',
        this.get('unitCost'),
      );
    }

    try {
      const onHand = inventoryDecimalParts(
        this.get('onHandDelta'),
        'onHandDelta',
      );

      const classified = sumInventoryDecimals([
        this.get('availableDelta'),
        this.get('reservedDelta'),
        this.get('quarantinedDelta'),
        this.get('damagedDelta'),
        this.get('expiredDelta'),
      ]);

      if (!decimalPartsEqual(onHand, classified)) {
        this.invalidate(
          'onHandDelta',
          'Stock-movement on-hand delta must reconcile to available, reserved, quarantined, damaged, and expired deltas',
        );
      }

      const direction = String(this.get('direction'));
      const onHandComparison = compareInventoryDecimals(
        this.get('onHandDelta'),
        '0',
      );

      if (
        (onHandComparison > 0 && direction !== 'IN') ||
        (onHandComparison < 0 && direction !== 'OUT') ||
        (onHandComparison === 0 && direction !== 'NEUTRAL')
      ) {
        this.invalidate(
          'direction',
          'Stock-movement direction must match the on-hand delta',
        );
      }

      const deltas = [
        this.get('onHandDelta'),
        this.get('availableDelta'),
        this.get('reservedDelta'),
        this.get('quarantinedDelta'),
        this.get('damagedDelta'),
        this.get('expiredDelta'),
        this.get('inTransitDelta'),
      ];

      const allZero = deltas.every(
        (value) => compareInventoryDecimals(value, '0') === 0,
      );

      if (
        allZero &&
        this.get('movementType') !== 'SUPPLIER_RETURN_REJECTED'
      ) {
        this.invalidate(
          'onHandDelta',
          'Stock movements must change at least one balance bucket',
        );
      }
    } catch (error) {
      this.invalidate(
        'onHandDelta',
        error instanceof Error
          ? error.message
          : 'Stock movement deltas must be valid decimal values',
      );
    }

    if (
      this.get('movementType') === 'REVERSAL' &&
      this.get('reversalOfMovementId') == null
    ) {
      this.invalidate(
        'reversalOfMovementId',
        'Reversal movements require the original movement identifier',
      );
    }

    if (
      this.get('negativeStockOverride') === true &&
      this.get('negativeStockOverrideReason') == null
    ) {
      this.invalidate(
        'negativeStockOverrideReason',
        'Negative-stock overrides require an attributable reason',
      );
    }

    if (
      Number(this.get('balanceVersionAfter')) !==
      Number(this.get('balanceVersionBefore')) + 1
    ) {
      this.invalidate(
        'balanceVersionAfter',
        'Stock-movement balance versions must increase by exactly one',
      );
    }
  },
);

stockMovementSchema.index(
  {
    facilityId: 1,
    operationKey: 1,
  },
  {
    name: 'uq_stock_movements_operation_key',
    unique: true,
  },
);

stockMovementSchema.index(
  {
    facilityId: 1,
    storeLocationId: 1,
    itemId: 1,
    batchId: 1,
    ledgerSequence: 1,
  },
  {
    name: 'uq_stock_movements_balance_sequence',
    unique: true,
  },
);

stockMovementSchema.index(
  {
    facilityId: 1,
    sourceType: 1,
    sourceId: 1,
    sourceLineId: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_stock_movements_source_traceability',
  },
);

stockMovementSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    batchId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_stock_movements_item_batch_history',
  },
);

const transferAllocationSchema = new Schema(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    allocatedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    dispatchedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    receivedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    discrepancyStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },
  },
  {
    _id: true,
    strict: true,
  },
);

transferAllocationSchema.pre(
  'validate',
  function validateTransferAllocation() {
    validatePositiveInventoryDecimal(
      this,
      'allocatedStockQuantity',
      this.get('allocatedStockQuantity'),
    );

    for (
      const field of [
        'dispatchedStockQuantity',
        'receivedStockQuantity',
        'discrepancyStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      compareInventoryDecimals(
        this.get('dispatchedStockQuantity'),
        this.get('allocatedStockQuantity'),
      ) > 0
    ) {
      this.invalidate(
        'dispatchedStockQuantity',
        'Dispatched transfer quantity cannot exceed allocated quantity',
      );
    }

    if (
      compareDecimalParts(
        sumInventoryDecimals([
          this.get('receivedStockQuantity'),
          this.get('discrepancyStockQuantity'),
        ]),
        inventoryDecimalParts(
          this.get('dispatchedStockQuantity'),
          'dispatchedStockQuantity',
        ),
      ) > 0
    ) {
      this.invalidate(
        'receivedStockQuantity',
        'Received and discrepancy quantities cannot exceed dispatched quantity',
      );
    }
  },
);

export const stockTransferSchema = new Schema(
  {
    ...inventoryCommonFields,

    transferNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    transferType: {
      type: String,
      required: true,
      immutable: true,
      enum: stockTransferTypeValues,
    },

    sourceLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    destinationLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    approvedByStaffId: nullableObjectId,
    rejectedByStaffId: nullableObjectId,
    dispatchedByStaffId: nullableObjectId,
    receivedByStaffId: nullableObjectId,
    cancelledByStaffId: nullableObjectId,
    reversedByStaffId: nullableObjectId,

    reservationId: nullableObjectId,

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },

    status: {
      type: String,
      required: true,
      enum: stockTransferStatusValues,
      default: 'REQUESTED',
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    dispatchedAt: {
      type: Date,
      default: null,
    },

    receivedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    decisionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    discrepancyReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    dispatchTransactionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    receiptTransactionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    reversalTransactionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
  },
  {
    collection: 'stockTransfers',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockTransferSchema.pre(
  'validate',
  function validateStockTransfer() {
    if (
      this.get('sourceLocationId') != null &&
      this.get('destinationLocationId') != null &&
      String(this.get('sourceLocationId')) ===
        String(this.get('destinationLocationId'))
    ) {
      this.invalidate(
        'destinationLocationId',
        'Stock-transfer source and destination locations must differ',
      );
    }

    const status = String(this.get('status'));

    if (
      [
        'APPROVED',
        'DISPATCHED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'DISCREPANCY',
      ].includes(status) &&
      (
        this.get('approvedAt') == null ||
        this.get('approvedByStaffId') == null ||
        this.get('reservationId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved stock transfers require approval attribution and reservation traceability',
      );
    }

    if (
      status === 'REJECTED' &&
      (
        this.get('rejectedAt') == null ||
        this.get('rejectedByStaffId') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected stock transfers require attribution and reason',
      );
    }

    if (
      [
        'DISPATCHED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'DISCREPANCY',
      ].includes(status) &&
      (
        this.get('dispatchedAt') == null ||
        this.get('dispatchedByStaffId') == null ||
        this.get('dispatchTransactionId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Dispatched stock transfers require dispatch attribution',
      );
    }

    if (
      ['RECEIVED', 'DISCREPANCY'].includes(status) &&
      (
        this.get('receivedAt') == null ||
        this.get('receivedByStaffId') == null ||
        this.get('receiptTransactionId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Completed transfer receipt requires receiving attribution',
      );
    }

    if (
      status === 'DISCREPANCY' &&
      this.get('discrepancyReason') == null
    ) {
      this.invalidate(
        'discrepancyReason',
        'Transfer discrepancies require a reason',
      );
    }

    if (
      status === 'CANCELLED' &&
      (
        this.get('cancelledAt') == null ||
        this.get('cancelledByStaffId') == null ||
        this.get('cancellationReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled transfers require attribution and reason',
      );
    }

    if (
      status === 'REVERSED' &&
      (
        this.get('reversedAt') == null ||
        this.get('reversedByStaffId') == null ||
        this.get('reversalReason') == null ||
        this.get('reversalTransactionId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Reversed transfers require attribution, reason, and transaction traceability',
      );
    }
  },
);

stockTransferSchema.index(
  {
    facilityId: 1,
    transferNumber: 1,
  },
  {
    name: 'uq_stock_transfers_number',
    unique: true,
  },
);

stockTransferSchema.index(
  {
    facilityId: 1,
    sourceLocationId: 1,
    status: 1,
    requestedAt: -1,
  },
  {
    name: 'ix_stock_transfers_source_worklist',
  },
);

stockTransferSchema.index(
  {
    facilityId: 1,
    destinationLocationId: 1,
    status: 1,
    requestedAt: -1,
  },
  {
    name: 'ix_stock_transfers_destination_worklist',
  },
);

export const stockTransferItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    stockTransferId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 500,
    },

    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    approvedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    dispatchedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    receivedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    discrepancyStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    allocations: {
      type: [transferAllocationSchema],
      required: true,
      default: [],
    },

    status: {
      type: String,
      required: true,
      enum: stockTransferItemStatusValues,
      default: 'REQUESTED',
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'stockTransferItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockTransferItemSchema.pre(
  'validate',
  function validateStockTransferItem() {
    validatePositiveInventoryDecimal(
      this,
      'requestedStockQuantity',
      this.get('requestedStockQuantity'),
    );

    for (
      const field of [
        'approvedStockQuantity',
        'dispatchedStockQuantity',
        'receivedStockQuantity',
        'discrepancyStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      compareInventoryDecimals(
        this.get('approvedStockQuantity'),
        this.get('requestedStockQuantity'),
      ) > 0
    ) {
      this.invalidate(
        'approvedStockQuantity',
        'Approved transfer quantity cannot exceed requested quantity',
      );
    }

    if (
      compareInventoryDecimals(
        this.get('dispatchedStockQuantity'),
        this.get('approvedStockQuantity'),
      ) > 0
    ) {
      this.invalidate(
        'dispatchedStockQuantity',
        'Dispatched transfer quantity cannot exceed approved quantity',
      );
    }

    const allocations = this.get('allocations') as Array<{
      allocatedStockQuantity: unknown;
      dispatchedStockQuantity: unknown;
      receivedStockQuantity: unknown;
      discrepancyStockQuantity: unknown;
    }>;

    if (allocations.length > 0) {
      const allocated = sumInventoryDecimals(
        allocations.map(
          (allocation) => allocation.allocatedStockQuantity,
        ),
      );

      if (
        !decimalPartsEqual(
          allocated,
          inventoryDecimalParts(
            this.get('approvedStockQuantity'),
            'approvedStockQuantity',
          ),
        )
      ) {
        this.invalidate(
          'allocations',
          'Transfer batch allocations must reconcile to approved quantity',
        );
      }
    }
  },
);

stockTransferItemSchema.index(
  {
    facilityId: 1,
    stockTransferId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_stock_transfer_items_line',
    unique: true,
  },
);

stockTransferItemSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_stock_transfer_items_item',
  },
);

const reservationAllocationSchema = new Schema(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    reservedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    consumedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    releasedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },
  },
  {
    _id: true,
    strict: true,
  },
);

reservationAllocationSchema.pre(
  'validate',
  function validateReservationAllocation() {
    validatePositiveInventoryDecimal(
      this,
      'reservedStockQuantity',
      this.get('reservedStockQuantity'),
    );

    for (
      const field of [
        'consumedStockQuantity',
        'releasedStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    const settled = sumInventoryDecimals([
      this.get('consumedStockQuantity'),
      this.get('releasedStockQuantity'),
    ]);

    if (
      compareDecimalParts(
        settled,
        inventoryDecimalParts(
          this.get('reservedStockQuantity'),
          'reservedStockQuantity',
        ),
      ) > 0
    ) {
      this.invalidate(
        'consumedStockQuantity',
        'Consumed and released quantities cannot exceed reserved quantity',
      );
    }
  },
);

export const stockReservationSchema = new Schema(
  {
    ...inventoryCommonFields,

    reservationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    sourceType: {
      type: String,
      required: true,
      immutable: true,
      enum: stockReservationSourceTypeValues,
    },

    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourceLineId: {
      ...nullableObjectId,
      immutable: true,
    },

    locationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    patientId: {
      ...nullableObjectId,
      immutable: true,
    },

    reservedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    consumedByStaffId: nullableObjectId,
    releasedByStaffId: nullableObjectId,
    reversedByStaffId: nullableObjectId,

    status: {
      type: String,
      required: true,
      enum: stockReservationStatusValues,
      default: 'ACTIVE',
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    reservedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    consumedAt: {
      type: Date,
      default: null,
    },

    releasedAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    releaseReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    consumptionSourceId: nullableObjectId,
  },
  {
    collection: 'stockReservations',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockReservationSchema.pre(
  'validate',
  function validateStockReservation() {
    if (
      this.get('expiresAt') != null &&
      this.get('reservedAt') != null &&
      (this.get('expiresAt') as Date) <=
        (this.get('reservedAt') as Date)
    ) {
      this.invalidate(
        'expiresAt',
        'Stock reservation expiry must be later than reservation time',
      );
    }

    const status = String(this.get('status'));

    if (
      ['CONSUMED', 'PARTIALLY_CONSUMED'].includes(status) &&
      (
        this.get('consumedAt') == null ||
        this.get('consumedByStaffId') == null ||
        this.get('consumptionSourceId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Consumed stock reservations require consumption attribution and source traceability',
      );
    }

    if (
      ['RELEASED', 'EXPIRED'].includes(status) &&
      (
        this.get('releasedAt') == null ||
        this.get('releasedByStaffId') == null ||
        this.get('releaseReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Released or expired stock reservations require attribution and reason',
      );
    }

    if (
      status === 'REVERSED' &&
      (
        this.get('reversedAt') == null ||
        this.get('reversedByStaffId') == null ||
        this.get('reversalReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Reversed stock reservations require attribution and reason',
      );
    }
  },
);

stockReservationSchema.index(
  {
    facilityId: 1,
    reservationNumber: 1,
  },
  {
    name: 'uq_stock_reservations_number',
    unique: true,
  },
);

stockReservationSchema.index(
  {
    facilityId: 1,
    sourceType: 1,
    sourceId: 1,
    sourceLineId: 1,
    locationId: 1,
  },
  {
    name: 'uq_stock_reservations_source',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'ACTIVE',
          'PARTIALLY_CONSUMED',
          'CONSUMED',
        ],
      },
    },
  },
);

stockReservationSchema.index(
  {
    facilityId: 1,
    locationId: 1,
    status: 1,
    expiresAt: 1,
  },
  {
    name: 'ix_stock_reservations_expiry_worklist',
  },
);

export const stockReservationItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    stockReservationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 500,
    },

    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    reservedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    consumedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    releasedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    allocations: {
      type: [reservationAllocationSchema],
      required: true,
      default: [],
    },

    status: {
      type: String,
      required: true,
      enum: stockReservationItemStatusValues,
      default: 'ACTIVE',
    },
  },
  {
    collection: 'stockReservationItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockReservationItemSchema.pre(
  'validate',
  function validateStockReservationItem() {
    validatePositiveInventoryDecimal(
      this,
      'requestedStockQuantity',
      this.get('requestedStockQuantity'),
    );

    validatePositiveInventoryDecimal(
      this,
      'reservedStockQuantity',
      this.get('reservedStockQuantity'),
    );

    for (
      const field of [
        'consumedStockQuantity',
        'releasedStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      compareInventoryDecimals(
        this.get('reservedStockQuantity'),
        this.get('requestedStockQuantity'),
      ) > 0
    ) {
      this.invalidate(
        'reservedStockQuantity',
        'Reserved stock quantity cannot exceed requested quantity',
      );
    }

    const allocations = this.get('allocations') as Array<{
      reservedStockQuantity: unknown;
    }>;

    const allocated = sumInventoryDecimals(
      allocations.map(
        (allocation) => allocation.reservedStockQuantity,
      ),
    );

    if (
      !decimalPartsEqual(
        allocated,
        inventoryDecimalParts(
          this.get('reservedStockQuantity'),
          'reservedStockQuantity',
        ),
      )
    ) {
      this.invalidate(
        'allocations',
        'Reservation allocations must reconcile exactly to reserved quantity',
      );
    }
  },
);

stockReservationItemSchema.index(
  {
    facilityId: 1,
    stockReservationId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_stock_reservation_items_line',
    unique: true,
  },
);

stockReservationItemSchema.index(
  {
    facilityId: 1,
    stockReservationId: 1,
    itemId: 1,
  },
  {
    name: 'uq_stock_reservation_items_item',
    unique: true,
  },
);

export type StockMovement =
  InferSchemaType<typeof stockMovementSchema>;

export type StockTransfer =
  InferSchemaType<typeof stockTransferSchema>;

export type StockTransferItem =
  InferSchemaType<typeof stockTransferItemSchema>;

export type StockReservation =
  InferSchemaType<typeof stockReservationSchema>;

export type StockReservationItem =
  InferSchemaType<typeof stockReservationItemSchema>;

export const StockMovementModel =
  (
    mongoose.models[
      'stockMovements'
    ] as Model<StockMovement> | undefined
  ) ??
  mongoose.model<StockMovement>(
    'stockMovements',
    stockMovementSchema,
    'stockMovements',
  );

export const StockTransferModel =
  (
    mongoose.models[
      'stockTransfers'
    ] as Model<StockTransfer> | undefined
  ) ??
  mongoose.model<StockTransfer>(
    'stockTransfers',
    stockTransferSchema,
    'stockTransfers',
  );

export const StockTransferItemModel =
  (
    mongoose.models[
      'stockTransferItems'
    ] as Model<StockTransferItem> | undefined
  ) ??
  mongoose.model<StockTransferItem>(
    'stockTransferItems',
    stockTransferItemSchema,
    'stockTransferItems',
  );

export const StockReservationModel =
  (
    mongoose.models[
      'stockReservations'
    ] as Model<StockReservation> | undefined
  ) ??
  mongoose.model<StockReservation>(
    'stockReservations',
    stockReservationSchema,
    'stockReservations',
  );

export const StockReservationItemModel =
  (
    mongoose.models[
      'stockReservationItems'
    ] as Model<StockReservationItem> | undefined
  ) ??
  mongoose.model<StockReservationItem>(
    'stockReservationItems',
    stockReservationItemSchema,
    'stockReservationItems',
  );