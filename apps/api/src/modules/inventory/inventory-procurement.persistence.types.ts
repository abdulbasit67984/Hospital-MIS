import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  GoodsReceiptInspectionStatus,
  GoodsReceiptStatus,
  ProcurementApprovalDecision,
  ProcurementDocumentType,
  PurchaseInvoiceStatus,
  PurchaseOrderStatus,
  PurchaseRequisitionPriority,
  PurchaseRequisitionStatus,
  SupplierReturnStatus,
} from '@hospital-mis/database';

export type InventoryMongoSession =
  ClientSession;

export interface ProcurementMetadataRecord {
  facilityId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseRequisitionRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  requisitionNumber: string;
  requestingDepartmentId: Types.ObjectId;
  requestingLocationId: Types.ObjectId;
  requestedByStaffId: Types.ObjectId;
  priority: PurchaseRequisitionPriority;
  needByDate: Date | null;
  justification: string;
  notes: string | null;
  currency: string;
  estimatedSubtotal: Types.Decimal128;
  estimatedTaxAmount: Types.Decimal128;
  estimatedDiscountAmount: Types.Decimal128;
  estimatedNetAmount: Types.Decimal128;
  lineCount: number;
  status: PurchaseRequisitionStatus;
  submittedAt: Date | null;
  submittedByStaffId: Types.ObjectId | null;
  decidedAt: Date | null;
  decidedByStaffId: Types.ObjectId | null;
  decisionReason: string | null;
  convertedPurchaseOrderIds: Types.ObjectId[];
  cancelledAt: Date | null;
  cancelledByStaffId: Types.ObjectId | null;
  cancellationReason: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface PurchaseRequisitionItemRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  purchaseRequisitionId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  requestedUnitId: Types.ObjectId;
  requestedQuantity: Types.Decimal128;
  requestedUnitToStockFactor: Types.Decimal128;
  requestedStockQuantity: Types.Decimal128;
  approvedStockQuantity: Types.Decimal128 | null;
  orderedStockQuantity: Types.Decimal128;
  estimatedUnitCost: Types.Decimal128;
  estimatedTaxAmount: Types.Decimal128;
  estimatedDiscountAmount: Types.Decimal128;
  estimatedLineTotal: Types.Decimal128;
  preferredSupplierId: Types.ObjectId | null;

  status:
    | 'REQUESTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'ORDERED'
    | 'CANCELLED';

  notes: string | null;
}

export interface ProcurementApprovalHistoryRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  documentType: ProcurementDocumentType;
  documentId: Types.ObjectId;
  sequence: number;
  decision: ProcurementApprovalDecision;
  actorStaffId: Types.ObjectId;
  amountAtDecision: Types.Decimal128;
  actorApprovalLimit: Types.Decimal128 | null;
  reason: string;
  documentVersion: number;
  decidedAt: Date;
}

export interface PurchaseOrderRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  purchaseOrderNumber: string;
  purchaseRequisitionId: Types.ObjectId;
  supplierId: Types.ObjectId;
  deliveryLocationId: Types.ObjectId;
  orderedByStaffId: Types.ObjectId;
  currency: string;
  subtotal: Types.Decimal128;
  taxAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  lineCount: number;
  openLineCount: number;
  status: PurchaseOrderStatus;
  orderedAt: Date;
  expectedDeliveryDate: Date;

  supplierAcknowledgementStatus:
    | 'PENDING'
    | 'ACCEPTED'
    | 'ACCEPTED_WITH_CHANGES'
    | 'REJECTED';

  supplierAcknowledgementReference:
    string | null;

  supplierAcknowledgedAt:
    Date | null;

  supplierAcknowledgedBy:
    string | null;

  supplierAcknowledgementNotes:
    string | null;

  termsAndConditions:
    string | null;

  notes: string | null;
  cancelledAt: Date | null;
  cancelledByStaffId: Types.ObjectId | null;
  cancellationReason: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface PurchaseOrderItemRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  purchaseOrderId: Types.ObjectId;
  purchaseRequisitionItemId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  purchaseUnitId: Types.ObjectId;
  purchaseUnitToStockFactor: Types.Decimal128;
  orderedQuantity: Types.Decimal128;
  orderedStockQuantity: Types.Decimal128;
  unitCost: Types.Decimal128;
  taxAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  lineTotal: Types.Decimal128;
  receivedStockQuantity: Types.Decimal128;
  acceptedStockQuantity: Types.Decimal128;
  rejectedStockQuantity: Types.Decimal128;
  damagedStockQuantity: Types.Decimal128;
  quarantinedStockQuantity: Types.Decimal128;
  overReceiptTolerancePercent: Types.Decimal128;

  status:
    | 'OPEN'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CANCELLED';

  notes: string | null;
}

export interface GoodsReceiptRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  goodsReceiptNumber: string;
  purchaseOrderId: Types.ObjectId;
  supplierId: Types.ObjectId;
  receivingLocationId: Types.ObjectId;
  receivedByStaffId: Types.ObjectId;
  inspectedByStaffId: Types.ObjectId | null;
  receivedAt: Date;
  inspectedAt: Date | null;
  supplierDeliveryReference: string | null;
  supplierInvoiceNumber: string | null;
  purchaseInvoiceId: Types.ObjectId | null;
  currency: string;
  subtotal: Types.Decimal128;
  taxAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  totalReceivedStockQuantity: Types.Decimal128;
  totalAcceptedStockQuantity: Types.Decimal128;
  totalRejectedStockQuantity: Types.Decimal128;
  totalDamagedStockQuantity: Types.Decimal128;
  totalQuarantinedStockQuantity: Types.Decimal128;
  lineCount: number;
  inspectionStatus: GoodsReceiptInspectionStatus;
  status: GoodsReceiptStatus;
  notes: string | null;
  correctionOfGoodsReceiptId: Types.ObjectId | null;
  correctedByGoodsReceiptId: Types.ObjectId | null;
  enteredInErrorAt: Date | null;
  enteredInErrorByStaffId: Types.ObjectId | null;
  enteredInErrorReason: string | null;
  stockPostingTransactionId: string | null;
  postedAt: Date | null;
  attachmentIds: Types.ObjectId[];
}

export interface GoodsReceiptItemRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  goodsReceiptId: Types.ObjectId;
  purchaseOrderItemId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  receivedUnitId: Types.ObjectId;
  receivedUnitToStockFactor: Types.Decimal128;
  receivedQuantity: Types.Decimal128;
  receivedStockQuantity: Types.Decimal128;
  acceptedStockQuantity: Types.Decimal128;
  rejectedStockQuantity: Types.Decimal128;
  damagedStockQuantity: Types.Decimal128;
  quarantinedStockQuantity: Types.Decimal128;
  manufacturerName: string | null;
  manufacturerBatchNumber: string;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  unitCost: Types.Decimal128;
  taxAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  lineTotal: Types.Decimal128;
  inventoryBatchId: Types.ObjectId;
  inspectionNotes: string | null;
}

export interface PurchaseInvoiceRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  internalInvoiceReference: string;
  supplierInvoiceNumber: string;
  normalizedSupplierInvoiceNumber: string;
  supplierId: Types.ObjectId;
  purchaseOrderId: Types.ObjectId;
  goodsReceiptId: Types.ObjectId | null;
  invoiceDate: Date;
  dueDate: Date | null;
  currency: string;
  subtotal: Types.Decimal128;
  taxAmount: Types.Decimal128;
  discountAmount: Types.Decimal128;
  netAmount: Types.Decimal128;
  status: PurchaseInvoiceStatus;
  discrepancyReason: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface SupplierReturnRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  supplierReturnNumber: string;
  supplierId: Types.ObjectId;
  goodsReceiptId: Types.ObjectId;
  sourceLocationId: Types.ObjectId;
  initiatedByStaffId: Types.ObjectId;
  approvedByStaffId: Types.ObjectId | null;
  approvedAt: Date | null;
  status: SupplierReturnStatus;
  reason: string;
  lineCount: number;
  totalStockQuantity: Types.Decimal128;
  dispatchedAt: Date | null;
  dispatchedByStaffId: Types.ObjectId | null;
  supplierAcknowledgementReference: string | null;
  acknowledgedAt: Date | null;
  cancelledAt: Date | null;
  cancelledByStaffId: Types.ObjectId | null;
  cancellationReason: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface SupplierReturnItemRecord
extends ProcurementMetadataRecord {
  _id: Types.ObjectId;
  supplierReturnId: Types.ObjectId;
  goodsReceiptItemId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId;
  returnStockQuantity: Types.Decimal128;
  reasonCode: string;
  condition: string;
  notes: string | null;
}

export interface CreatedRequisitionAggregate {
  requisition: PurchaseRequisitionRecord;

  items:
    PurchaseRequisitionItemRecord[];
}

export interface CreatedPurchaseOrderAggregate {
  purchaseOrder: PurchaseOrderRecord;

  items:
    PurchaseOrderItemRecord[];
}

export interface CreatedGoodsReceiptAggregate {
  goodsReceipt: GoodsReceiptRecord;

  items:
    GoodsReceiptItemRecord[];

  purchaseInvoice:
    PurchaseInvoiceRecord | null;
}

export interface CreatedSupplierReturnAggregate {
  supplierReturn: SupplierReturnRecord;

  items:
    SupplierReturnItemRecord[];
}