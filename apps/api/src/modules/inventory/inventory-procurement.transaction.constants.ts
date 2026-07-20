import type {
  GoodsReceiptRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionRecord,
  SupplierReturnRecord,
} from './inventory-procurement.persistence.types.js';

export const INVENTORY_PROCUREMENT_TRANSACTION_STATES = {
  CONTEXT_VALIDATED:
    'CONTEXT_VALIDATED',

  ACCESS_AUTHORIZED:
    'ACCESS_AUTHORIZED',

  REFERENCES_VALIDATED:
    'REFERENCES_VALIDATED',

  NUMBER_ALLOCATED:
    'NUMBER_ALLOCATED',

  AGGREGATE_CREATED:
    'AGGREGATE_CREATED',

  LIFECYCLE_CHANGED:
    'LIFECYCLE_CHANGED',

  APPROVAL_HISTORY_APPENDED:
    'APPROVAL_HISTORY_APPENDED',

  BATCHES_CREATED:
    'BATCHES_CREATED',

  STOCK_POSTED:
    'STOCK_POSTED',

  COMPENSATION_REGISTERED:
    'COMPENSATION_REGISTERED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',
} as const;

export const INVENTORY_PROCUREMENT_TRANSACTION_TYPES = {
  CREATE_REQUISITION:
    'inventory.procurement.requisition.create',

  SUBMIT_REQUISITION:
    'inventory.procurement.requisition.submit',

  DECIDE_REQUISITION:
    'inventory.procurement.requisition.decide',

  CREATE_PURCHASE_ORDER:
    'inventory.procurement.purchase_order.create',

  ACKNOWLEDGE_PURCHASE_ORDER:
    'inventory.procurement.purchase_order.acknowledge',

  CANCEL_PURCHASE_ORDER:
    'inventory.procurement.purchase_order.cancel',

  RECEIVE_GOODS:
    'inventory.procurement.goods_receipt.receive',

  ENTER_RECEIPT_IN_ERROR:
    'inventory.procurement.goods_receipt.entered_in_error',

  INITIATE_SUPPLIER_RETURN:
    'inventory.procurement.supplier_return.initiate',

  APPROVE_SUPPLIER_RETURN:
    'inventory.procurement.supplier_return.approve',
} as const;

export const INVENTORY_PROCUREMENT_AUDIT_ACTIONS = {
  REQUISITION_CREATED:
    'inventory.requisition.created',

  REQUISITION_SUBMITTED:
    'inventory.requisition.submitted',

  REQUISITION_APPROVED:
    'inventory.requisition.approved',

  REQUISITION_REJECTED:
    'inventory.requisition.rejected',

  PURCHASE_ORDER_CREATED:
    'inventory.purchase_order.created',

  PURCHASE_ORDER_ACKNOWLEDGED:
    'inventory.purchase_order.acknowledged',

  PURCHASE_ORDER_CANCELLED:
    'inventory.purchase_order.cancelled',

  GOODS_RECEIPT_POSTED:
    'inventory.goods_receipt.posted',

  GOODS_RECEIPT_ENTERED_IN_ERROR:
    'inventory.goods_receipt.entered_in_error',

  SUPPLIER_RETURN_INITIATED:
    'inventory.supplier_return.initiated',

  SUPPLIER_RETURN_APPROVED:
    'inventory.supplier_return.approved',
} as const;

export const INVENTORY_PROCUREMENT_OUTBOX_EVENTS = {
  REQUISITION_CREATED:
    'inventory.requisition.created.v1',

  REQUISITION_SUBMITTED:
    'inventory.requisition.submitted.v1',

  REQUISITION_APPROVED:
    'inventory.requisition.approved.v1',

  REQUISITION_REJECTED:
    'inventory.requisition.rejected.v1',

  PURCHASE_ORDER_CREATED:
    'inventory.purchase_order.created.v1',

  PURCHASE_ORDER_ACKNOWLEDGED:
    'inventory.purchase_order.acknowledged.v1',

  PURCHASE_ORDER_CANCELLED:
    'inventory.purchase_order.cancelled.v1',

  GOODS_RECEIPT_POSTED:
    'inventory.goods_receipt.posted.v1',

  GOODS_RECEIPT_REVERSED:
    'inventory.goods_receipt.reversed.v1',

  SUPPLIER_RETURN_INITIATED:
    'inventory.supplier_return.initiated.v1',

  SUPPLIER_RETURN_APPROVED:
    'inventory.supplier_return.approved.v1',
} as const;

export const INVENTORY_PROCUREMENT_REALTIME_EVENTS = {
  REQUISITION_WORKLIST_CHANGED:
    'inventory.requisition_worklist.changed',

  PURCHASE_ORDER_WORKLIST_CHANGED:
    'inventory.purchase_order_worklist.changed',

  RECEIVING_WORKLIST_CHANGED:
    'inventory.receiving_worklist.changed',

  SUPPLIER_RETURN_WORKLIST_CHANGED:
    'inventory.supplier_return_worklist.changed',

  STOCK_CHANGED:
    'inventory.stock.changed',
} as const;

export const INVENTORY_PROCUREMENT_COMPENSATION_TYPES = {
  DELETE_CREATED_AGGREGATE:
    'inventory.procurement.aggregate.delete-created',

  RESTORE_DOCUMENT_VERSION:
    'inventory.procurement.document.restore-version',

  REVERSE_STOCK_POSTING:
    'inventory.procurement.stock.reverse-posting',
} as const;

export const INVENTORY_PROCUREMENT_SEQUENCE_KEYS = {
  REQUISITION:
    'inventory.purchase-requisition',

  PURCHASE_ORDER:
    'inventory.purchase-order',

  GOODS_RECEIPT:
    'inventory.goods-receipt',

  PURCHASE_INVOICE:
    'inventory.purchase-invoice',

  SUPPLIER_RETURN:
    'inventory.supplier-return',
} as const;

export function procurementLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map(
      (value) =>
        value
          .normalize('NFKC')
          .trim()
          .toLowerCase(),
    )
    .join(':');
}

export function procurementDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [
    transactionId,
    action,
    entityId,
  ].join(':');
}

export function formatProcurementDocumentNumber(
  prefix:
    | 'PR'
    | 'PO'
    | 'GRN'
    | 'PINV'
    | 'SRET',

  facilityCode: string,
  occurredAt: Date,
  value: number,
): string {
  return [
    facilityCode
      .trim()
      .toUpperCase(),

    prefix,

    occurredAt
      .getUTCFullYear(),

    String(value)
      .padStart(
        8,
        '0',
      ),
  ].join('-');
}

export function safeRequisitionSnapshot(
  record:
    PurchaseRequisitionRecord,
): Record<string, unknown> {
  return {
    requisitionId:
      record._id.toHexString(),

    requisitionNumber:
      record.requisitionNumber,

    requestingDepartmentId:
      record.requestingDepartmentId.toHexString(),

    requestingLocationId:
      record.requestingLocationId.toHexString(),

    requestedByStaffId:
      record.requestedByStaffId.toHexString(),

    priority:
      record.priority,

    currency:
      record.currency,

    estimatedNetAmount:
      record.estimatedNetAmount.toString(),

    lineCount:
      record.lineCount,

    status:
      record.status,

    version:
      record.version,
  };
}

export function safePurchaseOrderSnapshot(
  record:
    PurchaseOrderRecord,
): Record<string, unknown> {
  return {
    purchaseOrderId:
      record._id.toHexString(),

    purchaseOrderNumber:
      record.purchaseOrderNumber,

    requisitionId:
      record.purchaseRequisitionId.toHexString(),

    supplierId:
      record.supplierId.toHexString(),

    deliveryLocationId:
      record.deliveryLocationId.toHexString(),

    currency:
      record.currency,

    netAmount:
      record.netAmount.toString(),

    lineCount:
      record.lineCount,

    openLineCount:
      record.openLineCount,

    status:
      record.status,

    expectedDeliveryDate:
      record.expectedDeliveryDate.toISOString(),

    version:
      record.version,
  };
}

export function safeGoodsReceiptSnapshot(
  record:
    GoodsReceiptRecord,
): Record<string, unknown> {
  return {
    goodsReceiptId:
      record._id.toHexString(),

    goodsReceiptNumber:
      record.goodsReceiptNumber,

    purchaseOrderId:
      record.purchaseOrderId.toHexString(),

    supplierId:
      record.supplierId.toHexString(),

    receivingLocationId:
      record.receivingLocationId.toHexString(),

    inspectionStatus:
      record.inspectionStatus,

    status:
      record.status,

    totalReceivedStockQuantity:
      record.totalReceivedStockQuantity.toString(),

    totalAcceptedStockQuantity:
      record.totalAcceptedStockQuantity.toString(),

    totalQuarantinedStockQuantity:
      record.totalQuarantinedStockQuantity.toString(),

    lineCount:
      record.lineCount,

    version:
      record.version,
  };
}

export function safeSupplierReturnSnapshot(
  record:
    SupplierReturnRecord,
): Record<string, unknown> {
  return {
    supplierReturnId:
      record._id.toHexString(),

    supplierReturnNumber:
      record.supplierReturnNumber,

    supplierId:
      record.supplierId.toHexString(),

    goodsReceiptId:
      record.goodsReceiptId.toHexString(),

    sourceLocationId:
      record.sourceLocationId.toHexString(),

    status:
      record.status,

    lineCount:
      record.lineCount,

    totalStockQuantity:
      record.totalStockQuantity.toString(),

    version:
      record.version,
  };
}