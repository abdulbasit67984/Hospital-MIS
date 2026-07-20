import mongoose, {
  Schema,
  type Model,
} from 'mongoose';

import {
  criticalSchemas,
} from './critical.js';

import {
  inventoryBatchInspectionStatusValues,
  inventoryBatchStatusValues,
  inventoryRecallStatusValues,
} from './inventory.types.js';

import {
  compareInventoryDecimals,
  decimalPartsEqual,
  inventoryDecimalParts,
  normalizeInventoryText,
  sumInventoryDecimals,
  validateNonNegativeInventoryDecimal,
} from './inventory-schema-helpers.js';

export const inventoryBatchSchema =
  criticalSchemas.inventoryBatches;

inventoryBatchSchema.add({
  supplierId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  manufacturerName: {
    type: String,
    default: null,
    trim: true,
    maxlength: 300,
  },

  manufacturerBatchNumber: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  normalizedBatchNumber: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 1,
    maxlength: 200,
  },

  manufactureDate: {
    type: Date,
    default: null,
  },

  expiryDate: {
    type: Date,
    default: null,
  },

  goodsReceiptId: {
    type: Schema.Types.ObjectId,
    default: null,
    immutable: true,
  },

  goodsReceiptItemId: {
    type: Schema.Types.ObjectId,
    default: null,
    immutable: true,
  },

  inspectionStatus: {
    type: String,
    required: true,
    enum: inventoryBatchInspectionStatusValues,
    default: 'NOT_REQUIRED',
  },

  status: {
    type: String,
    required: true,
    enum: inventoryBatchStatusValues,
    default: 'ACTIVE',
  },

  quarantineAt: {
    type: Date,
    default: null,
  },

  quarantinedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  quarantineReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
  },

  releasedFromQuarantineAt: {
    type: Date,
    default: null,
  },

  releasedFromQuarantineBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  quarantineReleaseReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
  },

  recallStatus: {
    type: String,
    required: true,
    enum: inventoryRecallStatusValues,
    default: 'NONE',
  },

  recallReference: {
    type: String,
    default: null,
    trim: true,
    maxlength: 200,
  },

  recalledAt: {
    type: Date,
    default: null,
  },

  recalledBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  recallReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 5_000,
  },

  blockedAt: {
    type: Date,
    default: null,
  },

  blockedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  blockedReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
  },

  enteredInErrorAt: {
    type: Date,
    default: null,
  },

  enteredInErrorBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  enteredInErrorReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
  },

  transactionId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  correlationId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
});

inventoryBatchSchema.pre(
  'validate',
  function validateInventoryBatch() {
    this.set(
      'normalizedBatchNumber',
      normalizeInventoryText(
        String(
          this.get('manufacturerBatchNumber'),
        ),
      ),
    );

    const manufactureDate =
      this.get('manufactureDate') as
        | Date
        | null;

    const expiryDate =
      this.get('expiryDate') as
        | Date
        | null;

    if (
      manufactureDate != null &&
      expiryDate != null &&
      manufactureDate >= expiryDate
    ) {
      this.invalidate(
        'expiryDate',
        'Inventory batch expiry date must be later than manufacture date',
      );
    }

    for (
      const field of [
        'costPrice',
        'sellingPrice',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    const status = String(
      this.get('status'),
    );

    if (
      status === 'ACTIVE' &&
      expiryDate != null &&
      expiryDate.getTime() <= Date.now()
    ) {
      this.invalidate(
        'status',
        'Expired inventory batches cannot remain active',
      );
    }

    if (
      status === 'QUARANTINED' &&
      (
        this.get('quarantineAt') == null ||
        this.get('quarantinedBy') == null ||
        this.get('quarantineReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Quarantined inventory batches require attribution and reason',
      );
    }

    const inspectionStatus = String(
      this.get('inspectionStatus'),
    );

    if (
      [
        'PENDING',
        'FAILED',
      ].includes(inspectionStatus) &&
      status === 'ACTIVE'
    ) {
      this.invalidate(
        'status',
        'Batches pending or failing inspection cannot be active',
      );
    }

    if (
      this.get('releasedFromQuarantineAt') != null &&
      (
        this.get('releasedFromQuarantineBy') == null ||
        this.get('quarantineReleaseReason') == null
      )
    ) {
      this.invalidate(
        'releasedFromQuarantineAt',
        'Quarantine release requires attribution and reason',
      );
    }

    const recallStatus = String(
      this.get('recallStatus'),
    );

    if (recallStatus !== 'NONE') {
      if (
        this.get('recallReference') == null ||
        this.get('recalledAt') == null ||
        this.get('recalledBy') == null ||
        this.get('recallReason') == null
      ) {
        this.invalidate(
          'recallStatus',
          'Recalled inventory batches require reference, attribution, and reason',
        );
      }

      if (
        ![
          'RECALLED',
          'BLOCKED',
          'DEPLETED',
        ].includes(status)
      ) {
        this.invalidate(
          'status',
          'A recalled inventory batch must be recalled, blocked, or depleted',
        );
      }
    }

    if (
      status === 'BLOCKED' &&
      (
        this.get('blockedAt') == null ||
        this.get('blockedBy') == null ||
        this.get('blockedReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Blocked inventory batches require attribution and reason',
      );
    }

    if (
      this.get('enteredInErrorAt') != null &&
      (
        this.get('enteredInErrorBy') == null ||
        this.get('enteredInErrorReason') == null
      )
    ) {
      this.invalidate(
        'enteredInErrorAt',
        'Entered-in-error batches require attribution and reason',
      );
    }
  },
);

inventoryBatchSchema.clearIndexes();

inventoryBatchSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    normalizedBatchNumber: 1,
  },
  {
    name: 'uq_inventory_batches_item_batch',
    unique: true,
  },
);

inventoryBatchSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    status: 1,
    expiryDate: 1,
  },
  {
    name: 'ix_inventory_batches_fefo',
  },
);

inventoryBatchSchema.index(
  {
    facilityId: 1,
    supplierId: 1,
    goodsReceiptId: 1,
  },
  {
    name: 'ix_inventory_batches_receipt_traceability',
  },
);

inventoryBatchSchema.index(
  {
    facilityId: 1,
    recallStatus: 1,
    status: 1,
  },
  {
    name: 'ix_inventory_batches_recall_worklist',
  },
);

export const stockBalanceSchema =
  criticalSchemas.stockBalances;

stockBalanceSchema.add({
  batchId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  onHandQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  availableQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  reservedQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  quarantinedQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  damagedQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  expiredQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  inTransitQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '0',
  },

  negativeStockOverride: {
    type: Boolean,
    required: true,
    default: false,
  },

  negativeStockOverrideReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 2_000,
    select: false,
  },

  negativeStockAuthorizedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  lastMovementId: {
    type: Schema.Types.ObjectId,
    default: null,
  },

  lastMovementAt: {
    type: Date,
    default: null,
  },

  lastLedgerSequence: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },

  lastReconciledAt: {
    type: Date,
    default: null,
  },

  projectionTransactionId: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  correlationId: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
});

stockBalanceSchema.pre(
  'validate',
  function validateStockBalance() {
    for (
      const field of [
        'reservedQuantity',
        'quarantinedQuantity',
        'damagedQuantity',
        'expiredQuantity',
        'inTransitQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      const onHand = inventoryDecimalParts(
        this.get('onHandQuantity'),
        'onHandQuantity',
      );

      const allocated = sumInventoryDecimals([
        this.get('availableQuantity'),
        this.get('reservedQuantity'),
        this.get('quarantinedQuantity'),
        this.get('damagedQuantity'),
        this.get('expiredQuantity'),
      ]);

      if (!decimalPartsEqual(onHand, allocated)) {
        this.invalidate(
          'availableQuantity',
          'Available, reserved, quarantined, damaged, and expired quantities must reconcile exactly to on-hand quantity',
        );
      }

      const hasNegativeOnHand =
        compareInventoryDecimals(
          this.get('onHandQuantity'),
          '0',
        ) < 0;

      const hasNegativeAvailable =
        compareInventoryDecimals(
          this.get('availableQuantity'),
          '0',
        ) < 0;

      if (
        (hasNegativeOnHand || hasNegativeAvailable) &&
        this.get('negativeStockOverride') !== true
      ) {
        this.invalidate(
          'negativeStockOverride',
          'Negative stock requires an explicit authorized override',
        );
      }

      if (
        this.get('negativeStockOverride') === true &&
        (
          this.get('negativeStockOverrideReason') == null ||
          this.get('negativeStockAuthorizedBy') == null
        )
      ) {
        this.invalidate(
          'negativeStockOverrideReason',
          'Negative-stock overrides require attribution and reason',
        );
      }

      if (
        !hasNegativeOnHand &&
        !hasNegativeAvailable &&
        this.get('negativeStockOverride') === true
      ) {
        this.invalidate(
          'negativeStockOverride',
          'A non-negative balance cannot retain a negative-stock override',
        );
      }
    } catch (error) {
      this.invalidate(
        'onHandQuantity',
        error instanceof Error
          ? error.message
          : 'Stock balance quantities must be valid decimal values',
      );
    }

    if (
      this.get('lastMovementId') == null &&
      Number(this.get('lastLedgerSequence')) !== 0
    ) {
      this.invalidate(
        'lastLedgerSequence',
        'A stock balance without a last movement must have ledger sequence zero',
      );
    }

    if (
      this.get('lastMovementId') != null &&
      this.get('lastMovementAt') == null
    ) {
      this.invalidate(
        'lastMovementAt',
        'Stock balances with a last movement require its timestamp',
      );
    }
  },
);

stockBalanceSchema.clearIndexes();

stockBalanceSchema.index(
  {
    facilityId: 1,
    storeLocationId: 1,
    itemId: 1,
    batchId: 1,
  },
  {
    name: 'uq_stock_balances_location_item_batch',
    unique: true,
  },
);

stockBalanceSchema.index(
  {
    facilityId: 1,
    storeLocationId: 1,
    itemId: 1,
    availableQuantity: 1,
  },
  {
    name: 'ix_stock_balances_available',
  },
);

stockBalanceSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    quarantinedQuantity: 1,
    damagedQuantity: 1,
    expiredQuantity: 1,
  },
  {
    name: 'ix_stock_balances_restricted_stock',
  },
);

stockBalanceSchema.index(
  {
    facilityId: 1,
    negativeStockOverride: 1,
    updatedAt: -1,
  },
  {
    name: 'ix_stock_balances_negative_override',
  },
);

stockBalanceSchema.index(
  {
    facilityId: 1,
    lastMovementAt: 1,
    lastLedgerSequence: 1,
  },
  {
    name: 'ix_stock_balances_reconciliation',
  },
);

export interface InventoryBatchDocument {
  facilityId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  supplierId: mongoose.Types.ObjectId | null;
  batchNumber: string;
  manufacturerBatchNumber: string;
  normalizedBatchNumber: string;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  costPrice: mongoose.Types.Decimal128;
  sellingPrice: mongoose.Types.Decimal128;
  currency: string;
  status:
    (typeof inventoryBatchStatusValues)[number];
  inspectionStatus:
    (typeof inventoryBatchInspectionStatusValues)[number];
  recallStatus:
    (typeof inventoryRecallStatusValues)[number];
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockBalanceDocument {
  facilityId: mongoose.Types.ObjectId;
  storeLocationId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  batchId: mongoose.Types.ObjectId | null;
  onHandQuantity: mongoose.Types.Decimal128;
  availableQuantity: mongoose.Types.Decimal128;
  reservedQuantity: mongoose.Types.Decimal128;
  quarantinedQuantity: mongoose.Types.Decimal128;
  damagedQuantity: mongoose.Types.Decimal128;
  expiredQuantity: mongoose.Types.Decimal128;
  inTransitQuantity: mongoose.Types.Decimal128;
  negativeStockOverride: boolean;
  negativeStockOverrideReason: string | null;
  negativeStockAuthorizedBy: mongoose.Types.ObjectId | null;
  lastMovementId: mongoose.Types.ObjectId | null;
  lastMovementAt: Date | null;
  lastLedgerSequence: number;
  projectionTransactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const InventoryBatchModel =
  (
    mongoose.models[
      'inventoryBatches'
    ] as Model<InventoryBatchDocument> | undefined
  ) ??
  mongoose.model<InventoryBatchDocument>(
    'inventoryBatches',
    inventoryBatchSchema,
    'inventoryBatches',
  );

export const StockBalanceModel =
  (
    mongoose.models[
      'stockBalances'
    ] as Model<StockBalanceDocument> | undefined
  ) ??
  mongoose.model<StockBalanceDocument>(
    'stockBalances',
    stockBalanceSchema,
    'stockBalances',
  );