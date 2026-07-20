import type {
  InventoryBatchStatus,
} from '@hospital-mis/database';

import type {
  InventoryBatchRecord,
} from './inventory.persistence.types.js';

import type {
  InventoryAccessPolicyPort,
  InventoryCatalogRepositoryPort,
  InventoryClockPort,
  InventoryContextPort,
  InventoryUnitConversionPort,
} from './inventory.ports.js';

import type {
  AcknowledgePurchaseOrderInput,
  CreatePurchaseOrderInput,
  CreatePurchaseRequisitionInput,
  DecidePurchaseRequisitionInput,
  EnterGoodsReceiptInErrorInput,
  InitiateSupplierReturnInput,
  ProcurementCommandContext,
  ReceiveGoodsInput,
} from './inventory-procurement.contracts.js';

import type {
  CreatedGoodsReceiptAggregate,
  CreatedPurchaseOrderAggregate,
  CreatedRequisitionAggregate,
  CreatedSupplierReturnAggregate,
  GoodsReceiptItemRecord,
  GoodsReceiptRecord,
  InventoryMongoSession,
  ProcurementApprovalHistoryRecord,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionItemRecord,
  PurchaseRequisitionRecord,
  SupplierReturnItemRecord,
  SupplierReturnRecord,
} from './inventory-procurement.persistence.types.js';

export interface InventoryProcurementTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface InventoryProcurementTransactionContext {
  transactionId: string;
  idempotencyKey: string;

  checkpoint(
    state: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  registerCompensation(
    compensation:
      InventoryProcurementTransactionCompensation,
  ): Promise<void>;
}

export interface InventoryProcurementTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;

  execute(
    context:
      InventoryProcurementTransactionContext,
  ): Promise<T>;
}

export interface InventoryProcurementTransactionManagerPort {
  execute<T>(
    request:
      InventoryProcurementTransactionRequest<T>,
  ): Promise<T>;
}

export interface InventoryProcurementAuditEntry {
  transactionId: string;
  deduplicationKey: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  actorStaffId: string;
  facilityId: string;
  correlationId: string;
  occurredAt: Date;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface InventoryProcurementAuditPort {
  append(
    entry:
      InventoryProcurementAuditEntry,
  ): Promise<void>;
}

export interface InventoryProcurementOutboxMessage {
  transactionId: string;
  deduplicationKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string;
  actorStaffId: string;
  facilityId: string;
  correlationId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface InventoryProcurementOutboxPort {
  enqueue(
    message:
      InventoryProcurementOutboxMessage,
  ): Promise<void>;
}

export interface InventoryProcurementRealtimeMessage {
  eventType: string;
  facilityId: string;
  locationId?: string;
  supplierId?: string;
  requisitionId?: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  supplierReturnId?: string;
  payload: Record<string, unknown>;
}

export interface InventoryProcurementRealtimePort {
  publish(
    message:
      InventoryProcurementRealtimeMessage,
  ): Promise<void>;
}

export interface InventoryProcurementSequenceAllocation {
  key: string;
  value: number;
  facilityCode: string;
}

export interface InventoryProcurementSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<
    InventoryProcurementSequenceAllocation
  >;
}

export interface InventoryProcurementApprovalLimitPort {
  resolveLimit(
    input: Readonly<{
      facilityId: string;
      actorUserId: string;
      actorStaffId: string;
      roleKeys: readonly string[];

      documentType:
        'PURCHASE_REQUISITION';

      currency: string;
      amount: string;
      occurredAt: Date;
    }>,
  ): Promise<string | null>;
}

export interface InventoryProcurementAttachmentPort {
  assertAvailable(
    facilityId: string,
    attachmentIds:
      readonly string[],
  ): Promise<void>;
}

export interface ReceiptStockPostingLine {
  goodsReceiptItemId: string;
  itemId: string;
  batchId: string;
  locationId: string;
  acceptedStockQuantity: string;
  quarantinedStockQuantity: string;
  damagedStockQuantity: string;
  unitCost: string;
  currency: string;
}

export interface SupplierReturnStockPostingLine {
  supplierReturnItemId: string;
  itemId: string;
  batchId: string;
  locationId: string;
  quantity: string;
  reasonCode: string;
  condition: string;
}

export interface InventoryReceiptStockPostingPort {
  postGoodsReceipt(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      goodsReceiptId: string;
      occurredAt: Date;

      lines:
        readonly ReceiptStockPostingLine[];
    }>,

    session:
      InventoryMongoSession,
  ): Promise<void>;

  reverseGoodsReceipt(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      goodsReceiptId: string;
      occurredAt: Date;
      reason: string;
    }>,

    session:
      InventoryMongoSession,
  ): Promise<void>;

  postSupplierReturn(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      supplierReturnId: string;
      occurredAt: Date;

      lines:
        readonly SupplierReturnStockPostingLine[];
    }>,

    session:
      InventoryMongoSession,
  ): Promise<void>;
}

export interface InventoryProcurementRepositoryPort {
  withTransaction<T>(
    work: (
      session:
        InventoryMongoSession,
    ) => Promise<T>,
  ): Promise<T>;

  findRequisition(
    facilityId: string,
    requisitionId: string,
    session?:
      InventoryMongoSession,
  ): Promise<
    PurchaseRequisitionRecord | null
  >;

  findRequisitionItems(
    facilityId: string,
    requisitionId: string,
    session?:
      InventoryMongoSession,
  ): Promise<
    PurchaseRequisitionItemRecord[]
  >;

  createRequisitionAggregate(
    input:
      CreatePurchaseRequisitionInput,

    prepared: Readonly<{
      requisitionNumber: string;
      requestedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;

      lineData:
        readonly {
          itemId: string;
          requestedUnitId: string;
          requestedQuantity: string;
          requestedUnitToStockFactor: string;
          requestedStockQuantity: string;
          estimatedUnitCost: string;
          estimatedTaxAmount: string;
          estimatedDiscountAmount: string;
          estimatedLineTotal: string;
          preferredSupplierId: string | null;
          notes: string | null;
        }[];
    }>,

    actorUserId: string,
    facilityId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    CreatedRequisitionAggregate
  >;

  submitRequisition(
    facilityId: string,
    requisitionId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    transactionId: string,
    correlationId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    PurchaseRequisitionRecord | null
  >;

  decideRequisition(
    facilityId: string,

    requisition:
      PurchaseRequisitionRecord,

    items:
      readonly PurchaseRequisitionItemRecord[],

    input:
      DecidePurchaseRequisitionInput,

    actorUserId: string,
    actorStaffId: string,

    actorApprovalLimit:
      string | null,

    occurredAt: Date,
    transactionId: string,
    correlationId: string,

    session:
      InventoryMongoSession,
  ): Promise<{
    requisition:
      PurchaseRequisitionRecord | null;

    history:
      ProcurementApprovalHistoryRecord;
  }>;

  createPurchaseOrderAggregate(
    input:
      CreatePurchaseOrderInput,

    prepared: Readonly<{
      purchaseOrderNumber: string;
      orderedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;

      lineData:
        readonly {
          requisitionItem:
            PurchaseRequisitionItemRecord;

          purchaseUnitId: string;
          purchaseUnitToStockFactor: string;
          orderedQuantity: string;
          orderedStockQuantity: string;
          unitCost: string;
          taxAmount: string;
          discountAmount: string;
          lineTotal: string;
          overReceiptTolerancePercent: string;
          notes: string | null;
        }[];
    }>,

    actorUserId: string,
    facilityId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    CreatedPurchaseOrderAggregate
  >;

  findPurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    PurchaseOrderRecord | null
  >;

  findPurchaseOrderItems(
    facilityId: string,
    purchaseOrderId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    PurchaseOrderItemRecord[]
  >;

  countReceiptsForOrder(
    facilityId: string,
    purchaseOrderId: string,

    session?:
      InventoryMongoSession,
  ): Promise<number>;

  acknowledgePurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,

    input:
      AcknowledgePurchaseOrderInput,

    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,

    session:
      InventoryMongoSession,
  ): Promise<
    PurchaseOrderRecord | null
  >;

  cancelPurchaseOrder(
    facilityId: string,
    purchaseOrderId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,

    session:
      InventoryMongoSession,
  ): Promise<
    PurchaseOrderRecord | null
  >;

  findInventoryBatchByNumber(
    facilityId: string,
    itemId: string,
    manufacturerBatchNumber: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    InventoryBatchRecord | null
  >;

  createGoodsReceiptAggregate(
    input:
      ReceiveGoodsInput,

    prepared: Readonly<{
      goodsReceiptNumber: string;

      purchaseInvoiceReference:
        string | null;

      receivedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;

      purchaseOrder:
        PurchaseOrderRecord;

      subtotal: string;
      taxAmount: string;
      discountAmount: string;
      netAmount: string;
      totalReceivedStockQuantity: string;
      totalAcceptedStockQuantity: string;
      totalRejectedStockQuantity: string;
      totalDamagedStockQuantity: string;
      totalQuarantinedStockQuantity: string;

      lineData:
        readonly {
          purchaseOrderItem:
            PurchaseOrderItemRecord;

          inventoryBatchId: string;
          createInventoryBatch: boolean;

          batchStatus:
            InventoryBatchStatus;

          receivedUnitToStockFactor: string;
          receivedStockQuantity: string;
          acceptedStockQuantity: string;
          rejectedStockQuantity: string;
          damagedStockQuantity: string;
          quarantinedStockQuantity: string;
          lineTotal: string;
        }[];
    }>,

    actorUserId: string,
    facilityId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    CreatedGoodsReceiptAggregate
  >;

  markGoodsReceiptPosted(
    facilityId: string,
    goodsReceiptId: string,
    expectedVersion: number,
    stockPostingTransactionId: string,
    actorUserId: string,
    occurredAt: Date,

    session:
      InventoryMongoSession,
  ): Promise<
    GoodsReceiptRecord | null
  >;

  findGoodsReceipt(
    facilityId: string,
    goodsReceiptId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    GoodsReceiptRecord | null
  >;

  findGoodsReceiptItems(
    facilityId: string,
    goodsReceiptId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    GoodsReceiptItemRecord[]
  >;

  countActiveSupplierReturnsForReceipt(
    facilityId: string,
    goodsReceiptId: string,

    session?:
      InventoryMongoSession,
  ): Promise<number>;

  sumPreviouslyReturnedQuantity(
    facilityId: string,
    goodsReceiptItemId: string,

    session?:
      InventoryMongoSession,
  ): Promise<string>;

  enterGoodsReceiptInError(
    facilityId: string,
    goodsReceiptId: string,

    input:
      EnterGoodsReceiptInErrorInput,

    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    transactionId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    GoodsReceiptRecord | null
  >;

  createSupplierReturnAggregate(
    input:
      InitiateSupplierReturnInput,

    prepared: Readonly<{
      supplierReturnNumber: string;
      supplierId: string;
      initiatedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      totalStockQuantity: string;

      lineData:
        readonly {
          receiptItem:
            GoodsReceiptItemRecord;

          returnStockQuantity: string;
          reasonCode: string;
          condition: string;
          notes: string | null;
        }[];
    }>,

    actorUserId: string,
    facilityId: string,

    session:
      InventoryMongoSession,
  ): Promise<
    CreatedSupplierReturnAggregate
  >;

  findSupplierReturn(
    facilityId: string,
    supplierReturnId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    SupplierReturnRecord | null
  >;

  findSupplierReturnItems(
    facilityId: string,
    supplierReturnId: string,

    session?:
      InventoryMongoSession,
  ): Promise<
    SupplierReturnItemRecord[]
  >;

  approveSupplierReturn(
    facilityId: string,
    supplierReturnId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,

    session:
      InventoryMongoSession,
  ): Promise<
    SupplierReturnRecord | null
  >;
}

export interface InventoryProcurementDependencies {
  catalog:
    InventoryCatalogRepositoryPort;

  context:
    InventoryContextPort;

  accessPolicy:
    InventoryAccessPolicyPort;

  unitConversion:
    InventoryUnitConversionPort;

  repository:
    InventoryProcurementRepositoryPort;

  transactionManager:
    InventoryProcurementTransactionManagerPort;

  audit:
    InventoryProcurementAuditPort;

  outbox:
    InventoryProcurementOutboxPort;

  realtime:
    InventoryProcurementRealtimePort;

  sequence:
    InventoryProcurementSequencePort;

  approvalLimits:
    InventoryProcurementApprovalLimitPort;

  attachments:
    InventoryProcurementAttachmentPort;

  stockPosting:
    InventoryReceiptStockPostingPort;

  clock:
    InventoryClockPort;
}

export type ProcurementCommandResult<T> =
  Promise<T>;

export type ProcurementCommand =
  ProcurementCommandContext;