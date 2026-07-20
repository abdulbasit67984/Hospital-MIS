import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  decimalPartsEqual,
  inventoryCommonFields,
  inventoryDecimalParts,
  sumInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export const goodsReceiptStatusValues = [
  'DRAFT',
  'STOCK_POSTING_PENDING',
  'POSTED',
  'ENTERED_IN_ERROR',
  'CORRECTED',
  'CANCELLED',
] as const;

export const goodsReceiptInspectionStatusValues = [
  'PENDING',
  'PASSED',
  'PARTIALLY_ACCEPTED',
  'FAILED',
] as const;

export const supplierReturnStatusValues = [
  'DRAFT',
  'APPROVED',
  'DISPATCHED',
  'ACKNOWLEDGED',
  'CANCELLED',
] as const;

export const supplierReturnReasonValues = [
  'REJECTED_ON_RECEIPT',
  'DAMAGED',
  'QUALITY_FAILURE',
  'RECALL',
  'EXPIRED',
  'OVER_SUPPLY',
  'WRONG_ITEM',
  'OTHER',
] as const;

export const supplierReturnConditionValues = [
  'SEALED',
  'UNOPENED',
  'DAMAGED',
  'QUARANTINED',
  'RECALLED',
  'EXPIRED',
] as const;

export type GoodsReceiptStatus =
  (typeof goodsReceiptStatusValues)[number];

export type GoodsReceiptInspectionStatus =
  (typeof goodsReceiptInspectionStatusValues)[number];

export type SupplierReturnStatus =
  (typeof supplierReturnStatusValues)[number];

const attachmentIdsField = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const;

export const goodsReceiptSchema = new Schema(
  {
    ...inventoryCommonFields,

    goodsReceiptNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    supplierId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    receivingLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    receivedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    inspectedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    receivedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    inspectedAt: {
      type: Date,
      default: null,
    },

    supplierDeliveryReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    supplierInvoiceNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150,
    },

    purchaseInvoiceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    subtotal: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    taxAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    discountAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    netAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    totalReceivedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    totalAcceptedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    totalRejectedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    totalDamagedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    totalQuarantinedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    inspectionStatus: {
      type: String,
      required: true,
      enum: goodsReceiptInspectionStatusValues,
    },

    status: {
      type: String,
      required: true,
      enum: goodsReceiptStatusValues,
      default: 'STOCK_POSTING_PENDING',
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },

    correctionOfGoodsReceiptId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    correctedByGoodsReceiptId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    enteredInErrorAt: {
      type: Date,
      default: null,
    },

    enteredInErrorByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    enteredInErrorReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    stockPostingTransactionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    postedAt: {
      type: Date,
      default: null,
    },

    attachmentIds: attachmentIdsField,
  },
  {
    collection: 'goodsReceipts',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

goodsReceiptSchema.pre(
  'validate',
  function validateGoodsReceipt() {
    for (
      const field of [
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
        'totalReceivedStockQuantity',
        'totalAcceptedStockQuantity',
        'totalRejectedStockQuantity',
        'totalDamagedStockQuantity',
        'totalQuarantinedStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      const received =
        inventoryDecimalParts(
          this.get(
            'totalReceivedStockQuantity',
          ),
          'totalReceivedStockQuantity',
        );

      const classified =
        sumInventoryDecimals([
          this.get(
            'totalAcceptedStockQuantity',
          ),
          this.get(
            'totalRejectedStockQuantity',
          ),
          this.get(
            'totalDamagedStockQuantity',
          ),
          this.get(
            'totalQuarantinedStockQuantity',
          ),
        ]);

      if (
        !decimalPartsEqual(
          received,
          classified,
        )
      ) {
        this.invalidate(
          'totalReceivedStockQuantity',
          'Receipt quantity classifications must reconcile exactly to total received quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'totalReceivedStockQuantity',
        error instanceof Error
          ? error.message
          : 'Receipt totals must be valid decimal values',
      );
    }

    if (
      this.get(
        'inspectionStatus',
      ) !== 'PENDING' &&
      (
        this.get(
          'inspectedAt',
        ) == null ||
        this.get(
          'inspectedByStaffId',
        ) == null
      )
    ) {
      this.invalidate(
        'inspectionStatus',
        'Completed receipt inspections require inspector attribution',
      );
    }

    if (
      this.get('status') ===
        'POSTED' &&
      (
        this.get(
          'stockPostingTransactionId',
        ) == null ||
        this.get(
          'postedAt',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Posted goods receipts require stock-posting attribution',
      );
    }

    if (
      this.get('status') ===
        'ENTERED_IN_ERROR' &&
      (
        this.get(
          'enteredInErrorAt',
        ) == null ||
        this.get(
          'enteredInErrorByStaffId',
        ) == null ||
        this.get(
          'enteredInErrorReason',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Entered-in-error receipts require attribution and reason',
      );
    }
  },
);

goodsReceiptSchema.index(
  {
    facilityId: 1,
    goodsReceiptNumber: 1,
  },
  {
    name: 'uq_goods_receipts_number',
    unique: true,
  },
);

goodsReceiptSchema.index(
  {
    facilityId: 1,
    purchaseOrderId: 1,
    receivedAt: -1,
  },
  {
    name: 'ix_goods_receipts_purchase_order',
  },
);

goodsReceiptSchema.index(
  {
    facilityId: 1,
    receivingLocationId: 1,
    status: 1,
    receivedAt: -1,
  },
  {
    name: 'ix_goods_receipts_location_worklist',
  },
);

export const goodsReceiptItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    goodsReceiptId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    purchaseOrderItemId: {
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

    receivedUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    receivedUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    receivedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    receivedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    acceptedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    rejectedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    damagedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    quarantinedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
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

    manufactureDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    unitCost: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    taxAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    discountAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    lineTotal: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    inventoryBatchId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    inspectionNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'goodsReceiptItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

goodsReceiptItemSchema.pre(
  'validate',
  function validateGoodsReceiptItem() {
    for (
      const field of [
        'receivedUnitToStockFactor',
        'receivedQuantity',
        'receivedStockQuantity',
        'unitCost',
      ] as const
    ) {
      validatePositiveInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    for (
      const field of [
        'acceptedStockQuantity',
        'rejectedStockQuantity',
        'damagedStockQuantity',
        'quarantinedStockQuantity',
        'taxAmount',
        'discountAmount',
        'lineTotal',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      const received =
        inventoryDecimalParts(
          this.get(
            'receivedStockQuantity',
          ),
          'receivedStockQuantity',
        );

      const classified =
        sumInventoryDecimals([
          this.get(
            'acceptedStockQuantity',
          ),
          this.get(
            'rejectedStockQuantity',
          ),
          this.get(
            'damagedStockQuantity',
          ),
          this.get(
            'quarantinedStockQuantity',
          ),
        ]);

      if (
        !decimalPartsEqual(
          received,
          classified,
        )
      ) {
        this.invalidate(
          'receivedStockQuantity',
          'Receipt-line quantity classifications must reconcile exactly to received stock quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'receivedStockQuantity',
        error instanceof Error
          ? error.message
          : 'Receipt-line quantities must be valid decimals',
      );
    }

    const manufactureDate =
      this.get(
        'manufactureDate',
      ) as Date | null;

    const expiryDate =
      this.get(
        'expiryDate',
      ) as Date | null;

    if (
      manufactureDate != null &&
      expiryDate != null &&
      manufactureDate >= expiryDate
    ) {
      this.invalidate(
        'expiryDate',
        'Receipt-item expiry date must be later than manufacture date',
      );
    }
  },
);

goodsReceiptItemSchema.index(
  {
    facilityId: 1,
    goodsReceiptId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_goods_receipt_items_line',
    unique: true,
  },
);

goodsReceiptItemSchema.index(
  {
    facilityId: 1,
    purchaseOrderItemId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_goods_receipt_items_order_item',
  },
);

goodsReceiptItemSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    expiryDate: 1,
  },
  {
    name: 'ix_goods_receipt_items_expiry',
  },
);

export const supplierReturnSchema = new Schema(
  {
    ...inventoryCommonFields,

    supplierReturnNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    supplierId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    goodsReceiptId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourceLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    initiatedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    approvedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      required: true,
      enum: supplierReturnStatusValues,
      default: 'DRAFT',
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    totalStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    dispatchedAt: {
      type: Date,
      default: null,
    },

    dispatchedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    supplierAcknowledgementReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    acknowledgedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    attachmentIds: attachmentIdsField,
  },
  {
    collection: 'supplierReturns',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

supplierReturnSchema.pre(
  'validate',
  function validateSupplierReturn() {
    validatePositiveInventoryDecimal(
      this,
      'totalStockQuantity',
      this.get(
        'totalStockQuantity',
      ),
    );

    const status = String(
      this.get('status'),
    );

    if (
      [
        'APPROVED',
        'DISPATCHED',
        'ACKNOWLEDGED',
      ].includes(status) &&
      (
        this.get(
          'approvedByStaffId',
        ) == null ||
        this.get(
          'approvedAt',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved supplier returns require maker-checker attribution',
      );
    }

    if (
      [
        'DISPATCHED',
        'ACKNOWLEDGED',
      ].includes(status) &&
      (
        this.get(
          'dispatchedAt',
        ) == null ||
        this.get(
          'dispatchedByStaffId',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Dispatched supplier returns require dispatch attribution',
      );
    }

    if (
      status === 'ACKNOWLEDGED' &&
      (
        this.get(
          'acknowledgedAt',
        ) == null ||
        this.get(
          'supplierAcknowledgementReference',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Acknowledged supplier returns require supplier acknowledgement',
      );
    }

    if (
      status === 'CANCELLED' &&
      (
        this.get(
          'cancelledAt',
        ) == null ||
        this.get(
          'cancelledByStaffId',
        ) == null ||
        this.get(
          'cancellationReason',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled supplier returns require attribution and reason',
      );
    }
  },
);

supplierReturnSchema.index(
  {
    facilityId: 1,
    supplierReturnNumber: 1,
  },
  {
    name: 'uq_supplier_returns_number',
    unique: true,
  },
);

supplierReturnSchema.index(
  {
    facilityId: 1,
    supplierId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_supplier_returns_supplier_worklist',
  },
);

export const supplierReturnItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    supplierReturnId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    goodsReceiptItemId: {
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

    batchId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    returnStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    reasonCode: {
      type: String,
      required: true,
      enum: supplierReturnReasonValues,
    },

    condition: {
      type: String,
      required: true,
      enum: supplierReturnConditionValues,
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
    collection: 'supplierReturnItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

supplierReturnItemSchema.pre(
  'validate',
  function validateSupplierReturnItem() {
    validatePositiveInventoryDecimal(
      this,
      'returnStockQuantity',
      this.get(
        'returnStockQuantity',
      ),
    );
  },
);

supplierReturnItemSchema.index(
  {
    facilityId: 1,
    supplierReturnId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_supplier_return_items_line',
    unique: true,
  },
);

supplierReturnItemSchema.index(
  {
    facilityId: 1,
    batchId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_supplier_return_items_batch',
  },
);

export type GoodsReceipt =
  InferSchemaType<
    typeof goodsReceiptSchema
  >;

export type GoodsReceiptItem =
  InferSchemaType<
    typeof goodsReceiptItemSchema
  >;

export type SupplierReturn =
  InferSchemaType<
    typeof supplierReturnSchema
  >;

export type SupplierReturnItem =
  InferSchemaType<
    typeof supplierReturnItemSchema
  >;

export const GoodsReceiptModel =
  (
    mongoose.models[
      'goodsReceipts'
    ] as
      | Model<GoodsReceipt>
      | undefined
  ) ??
  mongoose.model<GoodsReceipt>(
    'goodsReceipts',
    goodsReceiptSchema,
    'goodsReceipts',
  );

export const GoodsReceiptItemModel =
  (
    mongoose.models[
      'goodsReceiptItems'
    ] as
      | Model<GoodsReceiptItem>
      | undefined
  ) ??
  mongoose.model<GoodsReceiptItem>(
    'goodsReceiptItems',
    goodsReceiptItemSchema,
    'goodsReceiptItems',
  );

export const SupplierReturnModel =
  (
    mongoose.models[
      'supplierReturns'
    ] as
      | Model<SupplierReturn>
      | undefined
  ) ??
  mongoose.model<SupplierReturn>(
    'supplierReturns',
    supplierReturnSchema,
    'supplierReturns',
  );

export const SupplierReturnItemModel =
  (
    mongoose.models[
      'supplierReturnItems'
    ] as
      | Model<SupplierReturnItem>
      | undefined
  ) ??
  mongoose.model<SupplierReturnItem>(
    'supplierReturnItems',
    supplierReturnItemSchema,
    'supplierReturnItems',
  );