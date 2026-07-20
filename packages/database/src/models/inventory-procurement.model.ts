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
  normalizeInventoryText,
  sumInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export const purchaseRequisitionPriorityValues = [
  'ROUTINE',
  'URGENT',
  'EMERGENCY',
] as const;

export const purchaseRequisitionStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'PARTIALLY_CONVERTED',
  'CONVERTED',
] as const;

export const purchaseRequisitionItemStatusValues = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'CANCELLED',
] as const;

export const procurementApprovalDecisionValues = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export const procurementDocumentTypeValues = [
  'PURCHASE_REQUISITION',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
  'SUPPLIER_RETURN',
] as const;

export const purchaseOrderStatusValues = [
  'DRAFT',
  'ISSUED',
  'ACKNOWLEDGED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
  'CLOSED',
] as const;

export const purchaseOrderItemStatusValues = [
  'OPEN',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;

export const supplierAcknowledgementStatusValues = [
  'PENDING',
  'ACCEPTED',
  'ACCEPTED_WITH_CHANGES',
  'REJECTED',
] as const;

export const purchaseInvoiceStatusValues = [
  'REGISTERED',
  'MATCHED',
  'DISPUTED',
  'CANCELLED',
] as const;

export type PurchaseRequisitionPriority =
  (typeof purchaseRequisitionPriorityValues)[number];

export type PurchaseRequisitionStatus =
  (typeof purchaseRequisitionStatusValues)[number];

export type PurchaseOrderStatus =
  (typeof purchaseOrderStatusValues)[number];

export type ProcurementApprovalDecision =
  (typeof procurementApprovalDecisionValues)[number];

export type ProcurementDocumentType =
  (typeof procurementDocumentTypeValues)[number];

export type PurchaseInvoiceStatus =
  (typeof purchaseInvoiceStatusValues)[number];

const attachmentIdsField = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const;

export const purchaseRequisitionSchema = new Schema(
  {
    ...inventoryCommonFields,

    requisitionNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    requestingDepartmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestingLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    priority: {
      type: String,
      required: true,
      enum: purchaseRequisitionPriorityValues,
      default: 'ROUTINE',
    },

    needByDate: {
      type: Date,
      default: null,
    },

    justification: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 5_000,
      select: false,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },

    currency: {
      type: String,
      required: true,
      default: 'PKR',
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    estimatedSubtotal: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedTaxAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedDiscountAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedNetAmount: {
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

    status: {
      type: String,
      required: true,
      enum: purchaseRequisitionStatusValues,
      default: 'DRAFT',
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    submittedByStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    decidedAt: {
      type: Date,
      default: null,
    },

    decidedByStaffId: {
      type: Schema.Types.ObjectId,
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

    convertedPurchaseOrderIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
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
    collection: 'purchaseRequisitions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

purchaseRequisitionSchema.pre(
  'validate',
  function validateRequisition() {
    for (
      const field of [
        'estimatedSubtotal',
        'estimatedTaxAmount',
        'estimatedDiscountAmount',
        'estimatedNetAmount',
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
      [
        'SUBMITTED',
        'APPROVED',
        'REJECTED',
        'PARTIALLY_CONVERTED',
        'CONVERTED',
      ].includes(status) &&
      (
        this.get('submittedAt') == null ||
        this.get('submittedByStaffId') == null
      )
    ) {
      this.invalidate(
        'status',
        'Submitted requisitions require submission attribution',
      );
    }

    if (
      [
        'APPROVED',
        'REJECTED',
      ].includes(status) &&
      (
        this.get('decidedAt') == null ||
        this.get('decidedByStaffId') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Decided requisitions require maker-checker attribution and reason',
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
        'Cancelled requisitions require attribution and reason',
      );
    }

    if (
      [
        'PARTIALLY_CONVERTED',
        'CONVERTED',
      ].includes(status) &&
      (
        this.get(
          'convertedPurchaseOrderIds',
        ) as unknown[]
      ).length === 0
    ) {
      this.invalidate(
        'convertedPurchaseOrderIds',
        'Converted requisitions require at least one purchase order',
      );
    }
  },
);

purchaseRequisitionSchema.index(
  {
    facilityId: 1,
    requisitionNumber: 1,
  },
  {
    name: 'uq_purchase_requisitions_number',
    unique: true,
  },
);

purchaseRequisitionSchema.index(
  {
    facilityId: 1,
    requestingDepartmentId: 1,
    status: 1,
    needByDate: 1,
  },
  {
    name: 'ix_purchase_requisitions_department_worklist',
  },
);

purchaseRequisitionSchema.index(
  {
    facilityId: 1,
    requestedByStaffId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_purchase_requisitions_requester',
  },
);

export const purchaseRequisitionItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    purchaseRequisitionId: {
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

    requestedUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    requestedUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    requestedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    approvedStockQuantity: {
      type: Schema.Types.Decimal128,
      default: null,
    },

    orderedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedUnitCost: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    estimatedTaxAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedDiscountAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    estimatedLineTotal: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    preferredSupplierId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    status: {
      type: String,
      required: true,
      enum: purchaseRequisitionItemStatusValues,
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
    collection: 'purchaseRequisitionItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

purchaseRequisitionItemSchema.pre(
  'validate',
  function validateRequisitionItem() {
    for (
      const field of [
        'requestedQuantity',
        'requestedUnitToStockFactor',
        'requestedStockQuantity',
        'estimatedUnitCost',
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
        'estimatedTaxAmount',
        'estimatedDiscountAmount',
        'estimatedLineTotal',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      this.get(
        'approvedStockQuantity',
      ) != null
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        'approvedStockQuantity',
        this.get(
          'approvedStockQuantity',
        ),
      );
    }

    validateNonNegativeInventoryDecimal(
      this,
      'orderedStockQuantity',
      this.get(
        'orderedStockQuantity',
      ),
    );

    if (
      this.get(
        'approvedStockQuantity',
      ) != null &&
      compareInventoryDecimals(
        this.get(
          'orderedStockQuantity',
        ),
        this.get(
          'approvedStockQuantity',
        ),
      ) > 0
    ) {
      this.invalidate(
        'orderedStockQuantity',
        'Ordered requisition quantity cannot exceed approved quantity',
      );
    }
  },
);

purchaseRequisitionItemSchema.index(
  {
    facilityId: 1,
    purchaseRequisitionId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_purchase_requisition_items_line',
    unique: true,
  },
);

purchaseRequisitionItemSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_purchase_requisition_items_item',
  },
);

export const procurementApprovalHistorySchema = new Schema(
  {
    ...inventoryCommonFields,

    documentType: {
      type: String,
      required: true,
      immutable: true,
      enum: procurementDocumentTypeValues,
    },

    documentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    decision: {
      type: String,
      required: true,
      immutable: true,
      enum: procurementApprovalDecisionValues,
    },

    actorStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    amountAtDecision: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    actorApprovalLimit: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },

    documentVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },

    decidedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'procurementApprovalHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

procurementApprovalHistorySchema.pre(
  'validate',
  function validateApprovalHistory() {
    validateNonNegativeInventoryDecimal(
      this,
      'amountAtDecision',
      this.get('amountAtDecision'),
    );

    if (
      this.get(
        'actorApprovalLimit',
      ) != null
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        'actorApprovalLimit',
        this.get(
          'actorApprovalLimit',
        ),
      );
    }
  },
);

procurementApprovalHistorySchema.index(
  {
    facilityId: 1,
    documentType: 1,
    documentId: 1,
    sequence: 1,
  },
  {
    name: 'uq_procurement_approval_history_sequence',
    unique: true,
  },
);

procurementApprovalHistorySchema.index(
  {
    facilityId: 1,
    actorStaffId: 1,
    decidedAt: -1,
  },
  {
    name: 'ix_procurement_approval_history_actor',
  },
);

export const purchaseOrderSchema = new Schema(
  {
    ...inventoryCommonFields,

    purchaseOrderNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },

    purchaseRequisitionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    supplierId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    deliveryLocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    orderedByStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
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

    lineCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },

    openLineCount: {
      type: Number,
      required: true,
      min: 0,
      max: 500,
    },

    status: {
      type: String,
      required: true,
      enum: purchaseOrderStatusValues,
      default: 'ISSUED',
    },

    orderedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    expectedDeliveryDate: {
      type: Date,
      required: true,
    },

    supplierAcknowledgementStatus: {
      type: String,
      required: true,
      enum: supplierAcknowledgementStatusValues,
      default: 'PENDING',
    },

    supplierAcknowledgementReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    supplierAcknowledgedAt: {
      type: Date,
      default: null,
    },

    supplierAcknowledgedBy: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },

    supplierAcknowledgementNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },

    termsAndConditions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
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
    collection: 'purchaseOrders',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

purchaseOrderSchema.pre(
  'validate',
  function validatePurchaseOrder() {
    for (
      const field of [
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
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
      status === 'CANCELLED' &&
      (
        this.get('cancelledAt') == null ||
        this.get('cancelledByStaffId') == null ||
        this.get('cancellationReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled purchase orders require attribution and reason',
      );
    }

    const acknowledgementStatus =
      String(
        this.get(
          'supplierAcknowledgementStatus',
        ),
      );

    if (
      acknowledgementStatus !== 'PENDING' &&
      (
        this.get(
          'supplierAcknowledgedAt',
        ) == null ||
        this.get(
          'supplierAcknowledgementReference',
        ) == null
      )
    ) {
      this.invalidate(
        'supplierAcknowledgementStatus',
        'Supplier acknowledgements require timestamp and reference',
      );
    }
  },
);

purchaseOrderSchema.index(
  {
    facilityId: 1,
    purchaseOrderNumber: 1,
  },
  {
    name: 'uq_purchase_orders_number',
    unique: true,
  },
);

purchaseOrderSchema.index(
  {
    facilityId: 1,
    supplierId: 1,
    status: 1,
    expectedDeliveryDate: 1,
  },
  {
    name: 'ix_purchase_orders_supplier_delivery',
  },
);

purchaseOrderSchema.index(
  {
    facilityId: 1,
    purchaseRequisitionId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_purchase_orders_requisition',
  },
);

export const purchaseOrderItemSchema = new Schema(
  {
    ...inventoryCommonFields,

    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    purchaseRequisitionItemId: {
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

    purchaseUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    purchaseUnitToStockFactor: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    orderedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },

    orderedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
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

    receivedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    acceptedStockQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
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

    overReceiptTolerancePercent: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    status: {
      type: String,
      required: true,
      enum: purchaseOrderItemStatusValues,
      default: 'OPEN',
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
    collection: 'purchaseOrderItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

purchaseOrderItemSchema.pre(
  'validate',
  function validatePurchaseOrderItem() {
    for (
      const field of [
        'purchaseUnitToStockFactor',
        'orderedQuantity',
        'orderedStockQuantity',
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
        'taxAmount',
        'discountAmount',
        'lineTotal',
        'receivedStockQuantity',
        'acceptedStockQuantity',
        'rejectedStockQuantity',
        'damagedStockQuantity',
        'quarantinedStockQuantity',
        'overReceiptTolerancePercent',
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
          'Purchase-order receipt classifications must reconcile to received quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'receivedStockQuantity',
        error instanceof Error
          ? error.message
          : 'Purchase-order quantities must be valid decimals',
      );
    }
  },
);

purchaseOrderItemSchema.index(
  {
    facilityId: 1,
    purchaseOrderId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_purchase_order_items_line',
    unique: true,
  },
);

purchaseOrderItemSchema.index(
  {
    facilityId: 1,
    itemId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_purchase_order_items_item',
  },
);

export const purchaseInvoiceSchema = new Schema(
  {
    ...inventoryCommonFields,

    internalInvoiceReference: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },

    supplierInvoiceNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 150,
    },

    normalizedSupplierInvoiceNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    supplierId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    goodsReceiptId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    invoiceDate: {
      type: Date,
      required: true,
      immutable: true,
    },

    dueDate: {
      type: Date,
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

    status: {
      type: String,
      required: true,
      enum: purchaseInvoiceStatusValues,
      default: 'REGISTERED',
    },

    discrepancyReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },

    attachmentIds: attachmentIdsField,
  },
  {
    collection: 'purchaseInvoices',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

purchaseInvoiceSchema.pre(
  'validate',
  function validatePurchaseInvoice() {
    this.set(
      'normalizedSupplierInvoiceNumber',
      normalizeInventoryText(
        String(
          this.get(
            'supplierInvoiceNumber',
          ),
        ),
      ),
    );

    for (
      const field of [
        'subtotal',
        'taxAmount',
        'discountAmount',
        'netAmount',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      this.get('status') ===
        'DISPUTED' &&
      this.get(
        'discrepancyReason',
      ) == null
    ) {
      this.invalidate(
        'discrepancyReason',
        'Disputed purchase invoices require a discrepancy reason',
      );
    }
  },
);

purchaseInvoiceSchema.index(
  {
    facilityId: 1,
    internalInvoiceReference: 1,
  },
  {
    name: 'uq_purchase_invoices_internal_reference',
    unique: true,
  },
);

purchaseInvoiceSchema.index(
  {
    facilityId: 1,
    supplierId: 1,
    normalizedSupplierInvoiceNumber: 1,
  },
  {
    name: 'uq_purchase_invoices_supplier_number',
    unique: true,
  },
);

purchaseInvoiceSchema.index(
  {
    facilityId: 1,
    purchaseOrderId: 1,
    status: 1,
  },
  {
    name: 'ix_purchase_invoices_order',
  },
);

export type PurchaseRequisition =
  InferSchemaType<
    typeof purchaseRequisitionSchema
  >;

export type PurchaseRequisitionItem =
  InferSchemaType<
    typeof purchaseRequisitionItemSchema
  >;

export type ProcurementApprovalHistory =
  InferSchemaType<
    typeof procurementApprovalHistorySchema
  >;

export type PurchaseOrder =
  InferSchemaType<
    typeof purchaseOrderSchema
  >;

export type PurchaseOrderItem =
  InferSchemaType<
    typeof purchaseOrderItemSchema
  >;

export type PurchaseInvoice =
  InferSchemaType<
    typeof purchaseInvoiceSchema
  >;

export const PurchaseRequisitionModel =
  (
    mongoose.models[
      'purchaseRequisitions'
    ] as
      | Model<PurchaseRequisition>
      | undefined
  ) ??
  mongoose.model<PurchaseRequisition>(
    'purchaseRequisitions',
    purchaseRequisitionSchema,
    'purchaseRequisitions',
  );

export const PurchaseRequisitionItemModel =
  (
    mongoose.models[
      'purchaseRequisitionItems'
    ] as
      | Model<PurchaseRequisitionItem>
      | undefined
  ) ??
  mongoose.model<PurchaseRequisitionItem>(
    'purchaseRequisitionItems',
    purchaseRequisitionItemSchema,
    'purchaseRequisitionItems',
  );

export const ProcurementApprovalHistoryModel =
  (
    mongoose.models[
      'procurementApprovalHistories'
    ] as
      | Model<ProcurementApprovalHistory>
      | undefined
  ) ??
  mongoose.model<ProcurementApprovalHistory>(
    'procurementApprovalHistories',
    procurementApprovalHistorySchema,
    'procurementApprovalHistories',
  );

export const PurchaseOrderModel =
  (
    mongoose.models[
      'purchaseOrders'
    ] as
      | Model<PurchaseOrder>
      | undefined
  ) ??
  mongoose.model<PurchaseOrder>(
    'purchaseOrders',
    purchaseOrderSchema,
    'purchaseOrders',
  );

export const PurchaseOrderItemModel =
  (
    mongoose.models[
      'purchaseOrderItems'
    ] as
      | Model<PurchaseOrderItem>
      | undefined
  ) ??
  mongoose.model<PurchaseOrderItem>(
    'purchaseOrderItems',
    purchaseOrderItemSchema,
    'purchaseOrderItems',
  );

export const PurchaseInvoiceModel =
  (
    mongoose.models[
      'purchaseInvoices'
    ] as
      | Model<PurchaseInvoice>
      | undefined
  ) ??
  mongoose.model<PurchaseInvoice>(
    'purchaseInvoices',
    purchaseInvoiceSchema,
    'purchaseInvoices',
  );