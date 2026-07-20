import type {
  GoodsReceiptInspectionStatus,
  GoodsReceiptStatus,
  ProcurementApprovalDecision,
  PurchaseInvoiceStatus,
  PurchaseOrderStatus,
  PurchaseRequisitionPriority,
  PurchaseRequisitionStatus,
  SupplierReturnStatus,
} from '@hospital-mis/database';

import type {
  InventoryActorContext,
  InventoryObjectIdString,
} from './inventory.contracts.js';

export interface ProcurementCommandContext {
  actor: InventoryActorContext;
  idempotencyKey: string;
}

export interface PurchaseRequisitionLineInput {
  itemId: InventoryObjectIdString;
  requestedUnitId: InventoryObjectIdString;
  requestedQuantity: string;
  estimatedUnitCost: string;
  estimatedTaxAmount?: string;
  estimatedDiscountAmount?: string;
  preferredSupplierId?: InventoryObjectIdString | null;
  notes?: string | null;
}

export interface CreatePurchaseRequisitionInput {
  requestingDepartmentId: InventoryObjectIdString;
  requestingLocationId: InventoryObjectIdString;
  priority?: PurchaseRequisitionPriority;
  needByDate?: string | null;
  justification: string;
  notes?: string | null;
  currency?: string;
  attachmentIds?: readonly InventoryObjectIdString[];
  lines: readonly PurchaseRequisitionLineInput[];
}

export interface SubmitPurchaseRequisitionInput {
  expectedVersion: number;
  reason: string;
}

export interface DecidePurchaseRequisitionLineInput {
  requisitionItemId: InventoryObjectIdString;
  approvedStockQuantity: string;
  decision:
    | 'APPROVED'
    | 'REJECTED';
}

export interface DecidePurchaseRequisitionInput {
  expectedVersion: number;

  decision: Extract<
    ProcurementApprovalDecision,
    'APPROVED' | 'REJECTED'
  >;

  reason: string;

  lines?:
    readonly DecidePurchaseRequisitionLineInput[];
}

export interface PurchaseOrderLineInput {
  requisitionItemId:
    InventoryObjectIdString;

  purchaseUnitId:
    InventoryObjectIdString;

  orderedQuantity: string;
  unitCost: string;
  taxAmount?: string;
  discountAmount?: string;
  overReceiptTolerancePercent?: string;
  notes?: string | null;
}

export interface CreatePurchaseOrderInput {
  requisitionId:
    InventoryObjectIdString;

  supplierId:
    InventoryObjectIdString;

  deliveryLocationId:
    InventoryObjectIdString;

  expectedDeliveryDate: string;
  currency?: string;
  termsAndConditions?: string | null;
  notes?: string | null;

  attachmentIds?:
    readonly InventoryObjectIdString[];

  lines:
    readonly PurchaseOrderLineInput[];
}

export interface AcknowledgePurchaseOrderInput {
  expectedVersion: number;

  acknowledgementStatus:
    | 'ACCEPTED'
    | 'ACCEPTED_WITH_CHANGES'
    | 'REJECTED';

  acknowledgementReference:
    string;

  acknowledgedBy?: string | null;

  acknowledgementNotes?:
    string | null;

  revisedExpectedDeliveryDate?:
    string | null;
}

export interface CancelPurchaseOrderInput {
  expectedVersion: number;
  reason: string;
}

export interface GoodsReceiptLineInput {
  purchaseOrderItemId:
    InventoryObjectIdString;

  receivedUnitId:
    InventoryObjectIdString;

  receivedQuantity: string;
  acceptedStockQuantity: string;
  rejectedStockQuantity?: string;
  damagedStockQuantity?: string;
  quarantinedStockQuantity?: string;
  manufacturerName?: string | null;
  manufacturerBatchNumber: string;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  unitCost: string;
  taxAmount?: string;
  discountAmount?: string;
  inspectionNotes?: string | null;
}

export interface RegisterPurchaseInvoiceInput {
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency?: string;
  subtotal: string;
  taxAmount?: string;
  discountAmount?: string;
  netAmount: string;
  status?: PurchaseInvoiceStatus;
  discrepancyReason?: string | null;

  attachmentIds?:
    readonly InventoryObjectIdString[];
}

export interface ReceiveGoodsInput {
  purchaseOrderId:
    InventoryObjectIdString;

  receivingLocationId:
    InventoryObjectIdString;

  receivedAt?: string;

  supplierDeliveryReference?:
    string | null;

  notes?: string | null;

  attachmentIds?:
    readonly InventoryObjectIdString[];

  inspectionStatus:
    GoodsReceiptInspectionStatus;

  purchaseInvoice?:
    RegisterPurchaseInvoiceInput;

  lines:
    readonly GoodsReceiptLineInput[];
}

export interface EnterGoodsReceiptInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface SupplierReturnLineInput {
  goodsReceiptItemId:
    InventoryObjectIdString;

  returnStockQuantity: string;

  reasonCode:
    | 'REJECTED_ON_RECEIPT'
    | 'DAMAGED'
    | 'QUALITY_FAILURE'
    | 'RECALL'
    | 'EXPIRED'
    | 'OVER_SUPPLY'
    | 'WRONG_ITEM'
    | 'OTHER';

  condition:
    | 'SEALED'
    | 'UNOPENED'
    | 'DAMAGED'
    | 'QUARANTINED'
    | 'RECALLED'
    | 'EXPIRED';

  notes?: string | null;
}

export interface InitiateSupplierReturnInput {
  goodsReceiptId:
    InventoryObjectIdString;

  sourceLocationId:
    InventoryObjectIdString;

  reason: string;

  attachmentIds?:
    readonly InventoryObjectIdString[];

  lines:
    readonly SupplierReturnLineInput[];
}

export interface ApproveSupplierReturnInput {
  expectedVersion: number;
  reason: string;
}

export interface PurchaseRequisitionResponse {
  id: InventoryObjectIdString;
  requisitionNumber: string;

  requestingDepartmentId:
    InventoryObjectIdString;

  requestingLocationId:
    InventoryObjectIdString;

  requestedByStaffId:
    InventoryObjectIdString;

  priority:
    PurchaseRequisitionPriority;

  needByDate: string | null;
  currency: string;
  estimatedSubtotal: string;
  estimatedTaxAmount: string;
  estimatedDiscountAmount: string;
  estimatedNetAmount: string;
  lineCount: number;

  status:
    PurchaseRequisitionStatus;

  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderResponse {
  id: InventoryObjectIdString;
  purchaseOrderNumber: string;

  purchaseRequisitionId:
    InventoryObjectIdString;

  supplierId:
    InventoryObjectIdString;

  deliveryLocationId:
    InventoryObjectIdString;

  currency: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  netAmount: string;
  lineCount: number;
  openLineCount: number;

  status:
    PurchaseOrderStatus;

  expectedDeliveryDate: string;
  supplierAcknowledgementStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptResponse {
  id: InventoryObjectIdString;
  goodsReceiptNumber: string;

  purchaseOrderId:
    InventoryObjectIdString;

  supplierId:
    InventoryObjectIdString;

  receivingLocationId:
    InventoryObjectIdString;

  receivedByStaffId:
    InventoryObjectIdString;

  receivedAt: string;

  inspectionStatus:
    GoodsReceiptInspectionStatus;

  status:
    GoodsReceiptStatus;

  totalReceivedStockQuantity: string;
  totalAcceptedStockQuantity: string;
  totalRejectedStockQuantity: string;
  totalDamagedStockQuantity: string;
  totalQuarantinedStockQuantity: string;
  lineCount: number;

  purchaseInvoiceId:
    InventoryObjectIdString | null;

  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierReturnResponse {
  id: InventoryObjectIdString;
  supplierReturnNumber: string;

  supplierId:
    InventoryObjectIdString;

  goodsReceiptId:
    InventoryObjectIdString;

  sourceLocationId:
    InventoryObjectIdString;

  initiatedByStaffId:
    InventoryObjectIdString;

  status:
    SupplierReturnStatus;

  lineCount: number;
  totalStockQuantity: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}