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

export const inventoryQuantityBucketValues = [
  'AVAILABLE',
  'RESERVED',
  'QUARANTINED',
  'DAMAGED',
  'EXPIRED',
] as const;

export const stockAdjustmentTypeValues = [
  'MANUAL_CORRECTION',
  'COUNT_RECONCILIATION',
  'BREAKAGE',
  'WASTAGE',
  'DAMAGE',
  'EXPIRY_WRITE_OFF',
  'THEFT_LOSS',
  'QUARANTINE',
  'QUARANTINE_RELEASE',
  'RECALL',
  'OTHER',
] as const;

export const stockAdjustmentStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'REVERSED',
  'CANCELLED',
] as const;

export const stockAdjustmentDirectionValues = [
  'INCREASE',
  'DECREASE',
] as const;

export const physicalStockCountScopeValues = [
  'FULL_LOCATION',
  'CATEGORY',
  'SELECTED_ITEMS',
] as const;

export const physicalStockCountStatusValues = [
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'CANCELLED',
] as const;

export const physicalStockCountItemStatusValues = [
  'UNCOUNTED',
  'COUNTED',
  'RECOUNT_REQUIRED',
  'VARIANCE_ACCEPTED',
] as const;

export const productRecallStatusValues = [
  'DRAFT',
  'ACTIVE',
  'CLOSED',
  'CANCELLED',
] as const;

export const productRecallActionValues = [
  'QUARANTINE',
  'BLOCK',
  'RETURN_TO_SUPPLIER',
  'DESTROY',
] as const;

export const productRecallItemStatusValues = [
  'PENDING',
  'NO_STOCK',
  'AFFECTED',
  'ACTIONED',
  'CLOSED',
] as const;

export type InventoryQuantityBucket =
  (typeof inventoryQuantityBucketValues)[number];

export type StockAdjustmentType =
  (typeof stockAdjustmentTypeValues)[number];

export type StockAdjustmentStatus =
  (typeof stockAdjustmentStatusValues)[number];

export type PhysicalStockCountScope =
  (typeof physicalStockCountScopeValues)[number];

export type PhysicalStockCountStatus =
  (typeof physicalStockCountStatusValues)[number];

export type ProductRecallStatus =
  (typeof productRecallStatusValues)[number];

const nullableObjectId = {
  type: Schema.Types.ObjectId,
  default: null,
} as const;

const signedDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const;

const attachmentIdsField = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const;

const stockAdjustmentLineSchema = new Schema(
  {
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
      ...nullableObjectId,
      immutable: true,
    },

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    bucket: {
      type: String,
      required: true,
      immutable: true,
      enum: inventoryQuantityBucketValues,
    },

    direction: {
      type: String,
      required: true,
      immutable: true,
      enum: stockAdjustmentDirectionValues,
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

    reasonCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },

    notes: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    _id: true,
    strict: true,
  },
);

stockAdjustmentLineSchema.pre(
  'validate',
  function validateStockAdjustmentLine() {
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
          'Adjustment on-hand delta must reconcile to its classified bucket deltas',
        );
      }

      const direction = String(this.get('direction'));
      const comparison = compareInventoryDecimals(
        this.get('onHandDelta'),
        '0',
      );

      if (
        (direction === 'INCREASE' && comparison <= 0) ||
        (direction === 'DECREASE' && comparison >= 0)
      ) {
        this.invalidate(
          'direction',
          'Adjustment direction must match the signed on-hand delta',
        );
      }
    } catch (error) {
      this.invalidate(
        'onHandDelta',
        error instanceof Error
          ? error.message
          : 'Adjustment deltas must be valid decimals',
      );
    }
  },
);

export const stockAdjustmentSchema = new Schema(
  {
    ...inventoryCommonFields,

    adjustmentNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    locationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    adjustmentType: {
      type: String,
      required: true,
      immutable: true,
      enum: stockAdjustmentTypeValues,
    },

    requestedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    approvedByStaffId: nullableObjectId,
    postedByStaffId: nullableObjectId,
    rejectedByStaffId: nullableObjectId,
    cancelledByStaffId: nullableObjectId,
    reversedByStaffId: nullableObjectId,

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 5_000,
      select: false,
    },

    status: {
      type: String,
      required: true,
      enum: stockAdjustmentStatusValues,
      default: 'DRAFT',
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    totalAbsoluteStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    lines: {
      type: [stockAdjustmentLineSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) =>
          value.length >= 1 && value.length <= 500,
        message: 'Stock adjustments require between one and 500 lines',
      },
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    postedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
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

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    sourceType: {
      type: String,
      required: true,
      immutable: true,
      enum: [
        'MANUAL',
        'PHYSICAL_STOCK_COUNT',
        'PRODUCT_RECALL',
        'EXPIRY_JOB',
      ],
      default: 'MANUAL',
    },

    sourceId: {
      ...nullableObjectId,
      immutable: true,
    },

    stockPostingTransactionId: {
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

    attachmentIds: attachmentIdsField,
  },
  {
    collection: 'stockAdjustments',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

stockAdjustmentSchema.pre(
  'validate',
  function validateStockAdjustment() {
    validatePositiveInventoryDecimal(
      this,
      'totalAbsoluteStockQuantity',
      this.get('totalAbsoluteStockQuantity'),
    );

    const lines = this.get('lines') as Array<{
      quantity: unknown;
    }>;

    const total = sumInventoryDecimals(
      lines.map((line) => line.quantity),
    );

    if (
      !decimalPartsEqual(
        total,
        inventoryDecimalParts(
          this.get('totalAbsoluteStockQuantity'),
          'totalAbsoluteStockQuantity',
        ),
      )
    ) {
      this.invalidate(
        'totalAbsoluteStockQuantity',
        'Adjustment total must reconcile exactly to line quantities',
      );
    }

    if (Number(this.get('lineCount')) !== lines.length) {
      this.invalidate(
        'lineCount',
        'Adjustment line count must match embedded lines',
      );
    }

    const status = String(this.get('status'));

    if (
      ['SUBMITTED', 'APPROVED', 'POSTED'].includes(status) &&
      this.get('submittedAt') == null
    ) {
      this.invalidate(
        'status',
        'Submitted adjustments require a submission timestamp',
      );
    }

    if (
      ['APPROVED', 'POSTED'].includes(status) &&
      (
        this.get('approvedAt') == null ||
        this.get('approvedByStaffId') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved adjustments require maker-checker attribution and reason',
      );
    }

    if (
      status === 'POSTED' &&
      (
        this.get('postedAt') == null ||
        this.get('postedByStaffId') == null ||
        this.get('stockPostingTransactionId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Posted adjustments require stock-posting attribution',
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
        'Rejected adjustments require attribution and reason',
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
        'Reversed adjustments require reversal attribution and transaction traceability',
      );
    }

    if (
      this.get('approvedByStaffId') != null &&
      String(this.get('approvedByStaffId')) ===
        String(this.get('requestedByStaffId'))
    ) {
      this.invalidate(
        'approvedByStaffId',
        'Adjustment maker and approver must be different staff members',
      );
    }
  },
);

stockAdjustmentSchema.index(
  {
    facilityId: 1,
    adjustmentNumber: 1,
  },
  {
    name: 'uq_stock_adjustments_number',
    unique: true,
  },
);

stockAdjustmentSchema.index(
  {
    facilityId: 1,
    locationId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_stock_adjustments_location_worklist',
  },
);

stockAdjustmentSchema.index(
  {
    facilityId: 1,
    sourceType: 1,
    sourceId: 1,
  },
  {
    name: 'ix_stock_adjustments_source',
  },
);

export const physicalStockCountSchema = new Schema(
  {
    ...inventoryCommonFields,

    countNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    locationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    scope: {
      type: String,
      required: true,
      immutable: true,
      enum: physicalStockCountScopeValues,
    },

    categoryId: {
      ...nullableObjectId,
      immutable: true,
    },

    requestedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    assignedToStaffId: nullableObjectId,
    submittedByStaffId: nullableObjectId,
    approvedByStaffId: nullableObjectId,
    rejectedByStaffId: nullableObjectId,
    cancelledByStaffId: nullableObjectId,
    postedByStaffId: nullableObjectId,

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 5_000,
      select: false,
    },

    status: {
      type: String,
      required: true,
      enum: physicalStockCountStatusValues,
      default: 'DRAFT',
    },

    snapshotAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    snapshotLedgerSequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 10_000,
    },

    countedLineCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    varianceLineCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    expectedTotalQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    actualTotalQuantity: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    absoluteVarianceQuantity: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    postedAt: {
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

    generatedAdjustmentId: nullableObjectId,
    attachmentIds: attachmentIdsField,
  },
  {
    collection: 'physicalStockCounts',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

physicalStockCountSchema.pre(
  'validate',
  function validatePhysicalCount() {
    validateNonNegativeInventoryDecimal(
      this,
      'expectedTotalQuantity',
      this.get('expectedTotalQuantity'),
    );

    for (
      const field of [
        'actualTotalQuantity',
        'absoluteVarianceQuantity',
      ] as const
    ) {
      if (this.get(field) != null) {
        validateNonNegativeInventoryDecimal(
          this,
          field,
          this.get(field),
        );
      }
    }

    if (
      this.get('scope') === 'CATEGORY' &&
      this.get('categoryId') == null
    ) {
      this.invalidate(
        'categoryId',
        'Category-scoped stock counts require a category identifier',
      );
    }

    const status = String(this.get('status'));

    if (
      ['IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'POSTED'].includes(status) &&
      this.get('startedAt') == null
    ) {
      this.invalidate(
        'status',
        'Started stock counts require a start timestamp',
      );
    }

    if (
      ['SUBMITTED', 'APPROVED', 'POSTED'].includes(status) &&
      (
        this.get('submittedAt') == null ||
        this.get('submittedByStaffId') == null ||
        this.get('countedLineCount') !== this.get('lineCount')
      )
    ) {
      this.invalidate(
        'status',
        'Submitted stock counts require every line to be counted and submission attribution',
      );
    }

    if (
      ['APPROVED', 'POSTED'].includes(status) &&
      (
        this.get('approvedAt') == null ||
        this.get('approvedByStaffId') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved stock counts require maker-checker attribution and reason',
      );
    }

    if (
      status === 'POSTED' &&
      (
        this.get('postedAt') == null ||
        this.get('postedByStaffId') == null ||
        (
          Number(this.get('varianceLineCount')) > 0 &&
          this.get('generatedAdjustmentId') == null
        )
      )
    ) {
      this.invalidate(
        'status',
        'Posted stock counts require posting attribution and a generated adjustment when variances exist',
      );
    }

    if (
      this.get('approvedByStaffId') != null &&
      String(this.get('approvedByStaffId')) ===
        String(this.get('requestedByStaffId'))
    ) {
      this.invalidate(
        'approvedByStaffId',
        'Stock-count maker and approver must be different staff members',
      );
    }
  },
);

physicalStockCountSchema.index(
  {
    facilityId: 1,
    countNumber: 1,
  },
  {
    name: 'uq_physical_stock_counts_number',
    unique: true,
  },
);

physicalStockCountSchema.index(
  {
    facilityId: 1,
    locationId: 1,
    status: 1,
    snapshotAt: -1,
  },
  {
    name: 'ix_physical_stock_counts_location_worklist',
  },
);

export const physicalStockCountItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    physicalStockCountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 10_000,
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

    stockUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    bucket: {
      type: String,
      required: true,
      immutable: true,
      enum: inventoryQuantityBucketValues,
    },

    expectedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    actualQuantity: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    varianceQuantity: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    status: {
      type: String,
      required: true,
      enum: physicalStockCountItemStatusValues,
      default: 'UNCOUNTED',
    },

    countedAt: {
      type: Date,
      default: null,
    },

    countedByStaffId: nullableObjectId,

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'physicalStockCountItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

physicalStockCountItemSchema.pre(
  'validate',
  function validatePhysicalCountItem() {
    validateNonNegativeInventoryDecimal(
      this,
      'expectedQuantity',
      this.get('expectedQuantity'),
    );

    if (this.get('actualQuantity') != null) {
      validateNonNegativeInventoryDecimal(
        this,
        'actualQuantity',
        this.get('actualQuantity'),
      );
    }

    if (
      this.get('status') !== 'UNCOUNTED' &&
      (
        this.get('actualQuantity') == null ||
        this.get('varianceQuantity') == null ||
        this.get('countedAt') == null ||
        this.get('countedByStaffId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Counted stock lines require actual quantity, variance, and staff attribution',
      );
    }
  },
);

physicalStockCountItemSchema.index(
  {
    facilityId: 1,
    physicalStockCountId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_physical_stock_count_items_line',
    unique: true,
  },
);

physicalStockCountItemSchema.index(
  {
    facilityId: 1,
    physicalStockCountId: 1,
    itemId: 1,
    batchId: 1,
    bucket: 1,
  },
  {
    name: 'uq_physical_stock_count_items_target',
    unique: true,
  },
);

export const productRecallSchema = new Schema(
  {
    ...inventoryCommonFields,

    recallNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    externalReference: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },

    title: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 500,
    },

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 5_000,
      select: false,
    },

    action: {
      type: String,
      required: true,
      immutable: true,
      enum: productRecallActionValues,
    },

    initiatedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    activatedByStaffId: nullableObjectId,
    closedByStaffId: nullableObjectId,
    cancelledByStaffId: nullableObjectId,

    status: {
      type: String,
      required: true,
      enum: productRecallStatusValues,
      default: 'DRAFT',
    },

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5_000,
    },

    affectedBatchCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    affectedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    closeReason: {
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
    collection: 'productRecalls',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

productRecallSchema.pre(
  'validate',
  function validateProductRecall() {
    validateNonNegativeInventoryDecimal(
      this,
      'affectedStockQuantity',
      this.get('affectedStockQuantity'),
    );

    const status = String(this.get('status'));

    if (
      ['ACTIVE', 'CLOSED'].includes(status) &&
      (
        this.get('activatedAt') == null ||
        this.get('activatedByStaffId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Active recalls require activation attribution',
      );
    }

    if (
      status === 'CLOSED' &&
      (
        this.get('closedAt') == null ||
        this.get('closedByStaffId') == null ||
        this.get('closeReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Closed recalls require closure attribution and reason',
      );
    }

    if (
      status === 'CANCELLED' &&
      (
        this.get('cancelledAt') == null ||
        this.get('cancelledByStaffId') == null ||
        this.get('closeReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled recalls require attribution and reason',
      );
    }

    if (
      this.get('activatedByStaffId') != null &&
      String(this.get('activatedByStaffId')) ===
        String(this.get('initiatedByStaffId'))
    ) {
      this.invalidate(
        'activatedByStaffId',
        'Recall initiator and activator must be different staff members',
      );
    }
  },
);

productRecallSchema.index(
  {
    facilityId: 1,
    recallNumber: 1,
  },
  {
    name: 'uq_product_recalls_number',
    unique: true,
  },
);

productRecallSchema.index(
  {
    facilityId: 1,
    externalReference: 1,
  },
  {
    name: 'uq_product_recalls_external_reference',
    unique: true,
  },
);

productRecallSchema.index(
  {
    facilityId: 1,
    status: 1,
    activatedAt: -1,
  },
  {
    name: 'ix_product_recalls_worklist',
  },
);

export const productRecallItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    productRecallId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 5_000,
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

    status: {
      type: String,
      required: true,
      enum: productRecallItemStatusValues,
      default: 'PENDING',
    },

    affectedOnHandQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    quarantinedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    actionedAt: {
      type: Date,
      default: null,
    },

    actionedByStaffId: nullableObjectId,

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    collection: 'productRecallItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

productRecallItemSchema.pre(
  'validate',
  function validateProductRecallItem() {
    for (
      const field of [
        'affectedOnHandQuantity',
        'quarantinedQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      ['ACTIONED', 'CLOSED'].includes(String(this.get('status'))) &&
      (
        this.get('actionedAt') == null ||
        this.get('actionedByStaffId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Actioned recall lines require staff attribution',
      );
    }
  },
);

productRecallItemSchema.index(
  {
    facilityId: 1,
    productRecallId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_product_recall_items_line',
    unique: true,
  },
);

productRecallItemSchema.index(
  {
    facilityId: 1,
    productRecallId: 1,
    batchId: 1,
  },
  {
    name: 'uq_product_recall_items_batch',
    unique: true,
  },
);

export const reorderRuleSchema = new Schema(
  {
    ...inventoryCommonFields,

    locationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    minimumStockLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    reorderLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    maximumStockLevel: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    safetyStockLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    criticalStockLevel: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    preferredSupplierId: nullableObjectId,

    active: {
      type: Boolean,
      required: true,
      default: true,
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
    collection: 'reorderRules',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

reorderRuleSchema.pre(
  'validate',
  function validateReorderRule() {
    for (
      const field of [
        'minimumStockLevel',
        'reorderLevel',
        'safetyStockLevel',
        'criticalStockLevel',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (this.get('maximumStockLevel') != null) {
      validateNonNegativeInventoryDecimal(
        this,
        'maximumStockLevel',
        this.get('maximumStockLevel'),
      );
    }

    if (
      compareInventoryDecimals(
        this.get('criticalStockLevel'),
        this.get('safetyStockLevel'),
      ) > 0
    ) {
      this.invalidate(
        'criticalStockLevel',
        'Critical stock level cannot exceed safety stock level',
      );
    }

    if (
      compareInventoryDecimals(
        this.get('safetyStockLevel'),
        this.get('minimumStockLevel'),
      ) > 0
    ) {
      this.invalidate(
        'safetyStockLevel',
        'Safety stock level cannot exceed minimum stock level',
      );
    }

    if (
      compareInventoryDecimals(
        this.get('minimumStockLevel'),
        this.get('reorderLevel'),
      ) > 0
    ) {
      this.invalidate(
        'minimumStockLevel',
        'Minimum stock level cannot exceed reorder level',
      );
    }

    if (
      this.get('maximumStockLevel') != null &&
      compareInventoryDecimals(
        this.get('reorderLevel'),
        this.get('maximumStockLevel'),
      ) > 0
    ) {
      this.invalidate(
        'maximumStockLevel',
        'Maximum stock level cannot be lower than reorder level',
      );
    }
  },
);

reorderRuleSchema.index(
  {
    facilityId: 1,
    locationId: 1,
    itemId: 1,
  },
  {
    name: 'uq_reorder_rules_location_item',
    unique: true,
  },
);

reorderRuleSchema.index(
  {
    facilityId: 1,
    active: 1,
    locationId: 1,
    reorderLevel: 1,
  },
  {
    name: 'ix_reorder_rules_monitoring',
  },
);

export type StockAdjustment =
  InferSchemaType<typeof stockAdjustmentSchema>;

export type PhysicalStockCount =
  InferSchemaType<typeof physicalStockCountSchema>;

export type PhysicalStockCountItem =
  InferSchemaType<typeof physicalStockCountItemSchema>;

export type ProductRecall =
  InferSchemaType<typeof productRecallSchema>;

export type ProductRecallItem =
  InferSchemaType<typeof productRecallItemSchema>;

export type ReorderRule =
  InferSchemaType<typeof reorderRuleSchema>;

export const StockAdjustmentModel =
  (mongoose.models['stockAdjustments'] as
    | Model<StockAdjustment>
    | undefined) ??
  mongoose.model<StockAdjustment>(
    'stockAdjustments',
    stockAdjustmentSchema,
    'stockAdjustments',
  );

export const PhysicalStockCountModel =
  (mongoose.models['physicalStockCounts'] as
    | Model<PhysicalStockCount>
    | undefined) ??
  mongoose.model<PhysicalStockCount>(
    'physicalStockCounts',
    physicalStockCountSchema,
    'physicalStockCounts',
  );

export const PhysicalStockCountItemModel =
  (mongoose.models['physicalStockCountItems'] as
    | Model<PhysicalStockCountItem>
    | undefined) ??
  mongoose.model<PhysicalStockCountItem>(
    'physicalStockCountItems',
    physicalStockCountItemSchema,
    'physicalStockCountItems',
  );

export const ProductRecallModel =
  (mongoose.models['productRecalls'] as
    | Model<ProductRecall>
    | undefined) ??
  mongoose.model<ProductRecall>(
    'productRecalls',
    productRecallSchema,
    'productRecalls',
  );

export const ProductRecallItemModel =
  (mongoose.models['productRecallItems'] as
    | Model<ProductRecallItem>
    | undefined) ??
  mongoose.model<ProductRecallItem>(
    'productRecallItems',
    productRecallItemSchema,
    'productRecallItems',
  );

export const ReorderRuleModel =
  (mongoose.models['reorderRules'] as
    | Model<ReorderRule>
    | undefined) ??
  mongoose.model<ReorderRule>(
    'reorderRules',
    reorderRuleSchema,
    'reorderRules',
  );