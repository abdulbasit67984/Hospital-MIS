import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  GoodsReceiptModel,
  ProcurementApprovalHistoryModel,
  PurchaseOrderModel,
  PurchaseRequisitionModel,
  goodsReceiptSchema,
  procurementApprovalHistorySchema,
  purchaseOrderSchema,
  purchaseRequisitionSchema,
} from '@hospital-mis/database';

import {
  inventoryProcurementReceiving,
  inventoryProcurementReceivingCollections,
  inventoryProcurementReceivingValidators,
} from '@hospital-mis/database';

import {
  createPurchaseRequisitionBodySchema,
  decidePurchaseRequisitionBodySchema,
  receiveGoodsBodySchema,
} from '../inventory-procurement.validation.js';

import type {
  InventoryProcurementDependencies,
  InventoryProcurementTransactionRequest,
} from '../inventory-procurement.ports.js';

import type {
  GoodsReceiptRecord,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
} from '../inventory-procurement.persistence.types.js';

import type {
  InventoryItemRecord,
} from '../inventory.persistence.types.js';

import {
  InventoryProcurementService,
} from '../services/inventory-procurement.service.js';

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function indexNames(schema: import('mongoose').Schema): string[] {
  return schema.indexes().flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

function purchaseOrderRecord(): PurchaseOrderRecord {
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId: objectId(),
    transactionId: 'tx-po',
    correlationId: 'corr-po',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    purchaseOrderNumber: 'HOSP-PO-2026-00000001',
    purchaseRequisitionId: objectId(),
    supplierId: objectId(),
    deliveryLocationId: objectId(),
    orderedByStaffId: objectId(),
    currency: 'PKR',
    subtotal: Types.Decimal128.fromString('100'),
    taxAmount: Types.Decimal128.fromString('0'),
    discountAmount: Types.Decimal128.fromString('0'),
    netAmount: Types.Decimal128.fromString('100'),
    lineCount: 1,
    openLineCount: 1,
    status: 'ACKNOWLEDGED',
    orderedAt: occurredAt,
    expectedDeliveryDate: new Date('2026-07-25T00:00:00.000Z'),
    supplierAcknowledgementStatus: 'ACCEPTED',
    supplierAcknowledgementReference: 'ACK-1',
    supplierAcknowledgedAt: occurredAt,
    supplierAcknowledgedBy: null,
    supplierAcknowledgementNotes: null,
    termsAndConditions: null,
    notes: null,
    cancelledAt: null,
    cancelledByStaffId: null,
    cancellationReason: null,
    attachmentIds: [],
  };
}

function purchaseOrderItemRecord(order: PurchaseOrderRecord): PurchaseOrderItemRecord {
  const actorId = objectId();

  return {
    _id: objectId(),
    facilityId: order.facilityId,
    transactionId: 'tx-po-item',
    correlationId: 'corr-po-item',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    purchaseOrderId: order._id,
    purchaseRequisitionItemId: objectId(),
    lineNumber: 1,
    itemId: objectId(),
    purchaseUnitId: objectId(),
    purchaseUnitToStockFactor: Types.Decimal128.fromString('1'),
    orderedQuantity: Types.Decimal128.fromString('10'),
    orderedStockQuantity: Types.Decimal128.fromString('10'),
    unitCost: Types.Decimal128.fromString('10'),
    taxAmount: Types.Decimal128.fromString('0'),
    discountAmount: Types.Decimal128.fromString('0'),
    lineTotal: Types.Decimal128.fromString('100'),
    receivedStockQuantity: Types.Decimal128.fromString('0'),
    acceptedStockQuantity: Types.Decimal128.fromString('0'),
    rejectedStockQuantity: Types.Decimal128.fromString('0'),
    damagedStockQuantity: Types.Decimal128.fromString('0'),
    quarantinedStockQuantity: Types.Decimal128.fromString('0'),
    overReceiptTolerancePercent: Types.Decimal128.fromString('0'),
    status: 'OPEN',
    notes: null,
  };
}

describe('inventory procurement and receiving Batch 3', () => {
  it('registers migration 025 and strict procurement collections', () => {
    expect(inventoryProcurementReceiving.id).toBe(
      '025-inventory-procurement-receiving',
    );

    expect(inventoryProcurementReceivingCollections).toEqual(
      expect.arrayContaining([
        'purchaseRequisitions',
        'purchaseRequisitionItems',
        'procurementApprovalHistories',
        'purchaseOrders',
        'goodsReceipts',
        'purchaseInvoices',
        'supplierReturns',
      ]),
    );

    for (const collection of inventoryProcurementReceivingCollections) {
      expect(inventoryProcurementReceivingValidators[collection]).toHaveProperty(
        '$jsonSchema.properties.facilityId.bsonType',
        'objectId',
      );
    }
  });

  it('uses dedicated schemas and facility-safe document-number indexes', () => {
    expect(PurchaseRequisitionModel.schema).toBe(purchaseRequisitionSchema);
    expect(PurchaseOrderModel.schema).toBe(purchaseOrderSchema);
    expect(GoodsReceiptModel.schema).toBe(goodsReceiptSchema);
    expect(ProcurementApprovalHistoryModel.schema).toBe(
      procurementApprovalHistorySchema,
    );

    expect(indexNames(purchaseRequisitionSchema)).toContain(
      'uq_purchase_requisitions_number',
    );
    expect(indexNames(purchaseOrderSchema)).toContain(
      'uq_purchase_orders_number',
    );
    expect(indexNames(goodsReceiptSchema)).toContain(
      'uq_goods_receipts_number',
    );
    expect(indexNames(procurementApprovalHistorySchema)).toContain(
      'uq_procurement_approval_history_sequence',
    );
  });

  it('validates approval decisions, unique lines, and receipt inspection rules', () => {
    const itemId = objectId().toHexString();
    const unitId = objectId().toHexString();

    expect(
      createPurchaseRequisitionBodySchema.safeParse({
        requestingDepartmentId: objectId().toHexString(),
        requestingLocationId: objectId().toHexString(),
        justification: 'Routine monthly procurement',
        lines: [
          {
            itemId,
            requestedUnitId: unitId,
            requestedQuantity: '10',
            estimatedUnitCost: '20',
          },
          {
            itemId,
            requestedUnitId: unitId,
            requestedQuantity: '5',
            estimatedUnitCost: '20',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      decidePurchaseRequisitionBodySchema.safeParse({
        expectedVersion: 1,
        decision: 'APPROVED',
        reason: 'Approved within delegated authority',
      }).success,
    ).toBe(false);

    expect(
      decidePurchaseRequisitionBodySchema.safeParse({
        expectedVersion: 1,
        decision: 'REJECTED',
        reason: 'Rejected because budget is unavailable',
        actorApprovalLimit: '999999999',
      }).success,
    ).toBe(false);

    expect(
      receiveGoodsBodySchema.safeParse({
        purchaseOrderId: objectId().toHexString(),
        receivingLocationId: objectId().toHexString(),
        inspectionStatus: 'FAILED',
        lines: [
          {
            purchaseOrderItemId: objectId().toHexString(),
            receivedUnitId: unitId,
            receivedQuantity: '2',
            acceptedStockQuantity: '2',
            manufacturerBatchNumber: 'B-1',
            unitCost: '20',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires maker-checker attribution for approved requisitions', async () => {
    const actorId = objectId();
    const requisition = new PurchaseRequisitionModel({
      facilityId: objectId(),
      transactionId: 'tx-pr',
      correlationId: 'corr-pr',
      schemaVersion: 1,
      version: 1,
      createdBy: actorId,
      updatedBy: actorId,
      requisitionNumber: 'HOSP-PR-2026-00000001',
      requestingDepartmentId: objectId(),
      requestingLocationId: objectId(),
      requestedByStaffId: objectId(),
      priority: 'ROUTINE',
      needByDate: null,
      justification: 'Routine procurement',
      notes: null,
      currency: 'PKR',
      estimatedSubtotal: '100',
      estimatedTaxAmount: '0',
      estimatedDiscountAmount: '0',
      estimatedNetAmount: '100',
      lineCount: 1,
      status: 'APPROVED',
      submittedAt: new Date(),
      submittedByStaffId: objectId(),
      decidedAt: null,
      decidedByStaffId: null,
      decisionReason: null,
      convertedPurchaseOrderIds: [],
      cancelledAt: null,
      cancelledByStaffId: null,
      cancellationReason: null,
      attachmentIds: [],
    });

    await expect(requisition.validate()).rejects.toThrow(/maker-checker attribution/iu);
  });

  it('rolls back receipt orchestration before audit and outbox when stock posting fails', async () => {
    const order = purchaseOrderRecord();
    const orderItem = purchaseOrderItemRecord(order);
    const unitId = orderItem.purchaseUnitId;
    const item = {
      _id: orderItem.itemId,
      facilityId: order.facilityId,
      status: 'ACTIVE',
      controlledMedicine: false,
      expiryTrackingRequired: true,
      allowFractionalStock: false,
      stockUnitId: unitId,
      purchaseUnitId: unitId,
      purchaseUnitToStockFactor: Types.Decimal128.fromString('1'),
      issueUnitId: unitId,
      issueUnitToStockFactor: Types.Decimal128.fromString('1'),
      unitConversions: [],
    } as unknown as InventoryItemRecord;

    const auditAppend = vi.fn();
    const outboxEnqueue = vi.fn();
    const realtimePublish = vi.fn();
    const postGoodsReceipt = vi.fn().mockRejectedValue(new Error('stock posting failed'));

    const dependencies = {
      catalog: {
        findItemById: vi.fn().mockResolvedValue(item),
      },
      context: {
        resolveOperationalLocation: vi.fn().mockResolvedValue({
          actor: {
            userId: '507f1f77bcf86cd799439011',
            staffId: '507f1f77bcf86cd799439012',
            facilityId: order.facilityId.toHexString(),
            departmentId: null,
            displayName: 'Receiving User',
            professionalType: 'PHARMACIST',
          },
          location: {
            locationId: order.deliveryLocationId.toHexString(),
            facilityId: order.facilityId.toHexString(),
            locationCode: 'PHARM',
            name: 'Main Pharmacy',
            locationType: 'PHARMACY',
            parentLocationId: null,
            ancestorLocationIds: [],
            departmentId: null,
            wardId: null,
            servicePointId: null,
            managerStaffId: null,
            supportsDispensing: true,
            allowsControlledMedicine: true,
            allowsGeneralStock: true,
            status: 'ACTIVE',
          },
        }),
      },
      accessPolicy: {
        authorize: vi.fn().mockResolvedValue({
          allowed: true,
          accessMode: 'FACILITY_INVENTORY',
          includeCost: true,
          minimumNecessaryFields: [],
          auditSensitiveRead: false,
        }),
      },
      unitConversion: {
        toStockUnit: vi.fn().mockReturnValue('10'),
      },
      repository: {
        findPurchaseOrder: vi.fn().mockResolvedValue(order),
        findPurchaseOrderItems: vi.fn().mockResolvedValue([orderItem]),
        findInventoryBatchByNumber: vi.fn().mockResolvedValue(null),
        withTransaction: async (work: (session: object) => Promise<unknown>) => work({}),
        createGoodsReceiptAggregate: vi.fn().mockResolvedValue({
          goodsReceipt: {
            _id: objectId(),
            version: 0,
          },
          items: [
            {
              _id: objectId(),
              itemId: orderItem.itemId,
              inventoryBatchId: objectId(),
              acceptedStockQuantity: Types.Decimal128.fromString('10'),
              quarantinedStockQuantity: Types.Decimal128.fromString('0'),
              damagedStockQuantity: Types.Decimal128.fromString('0'),
              unitCost: Types.Decimal128.fromString('10'),
            },
          ],
          purchaseInvoice: null,
        }),
      },
      transactionManager: {
        execute: async <T>(request: InventoryProcurementTransactionRequest<T>) =>
          request.execute({
            transactionId: 'tx-receipt',
            idempotencyKey: request.idempotencyKey,
            checkpoint: vi.fn().mockResolvedValue(undefined),
            registerCompensation: vi.fn().mockResolvedValue(undefined),
          }),
      },
      audit: { append: auditAppend },
      outbox: { enqueue: outboxEnqueue },
      realtime: { publish: realtimePublish },
      sequence: {
        next: vi.fn().mockResolvedValue({
          key: 'inventory.goods-receipt',
          value: 1,
          facilityCode: 'HOSP',
        }),
      },
      attachments: {
        assertAvailable: vi.fn().mockResolvedValue(undefined),
      },
      stockPosting: {
        postGoodsReceipt,
      },
      clock: {
        now: () => new Date('2026-07-20T10:00:00.000Z'),
      },
    } as unknown as InventoryProcurementDependencies;

    const service = new InventoryProcurementService(dependencies);

    await expect(
      service.receiveGoods(
        {
          actor: {
            userId: '507f1f77bcf86cd799439011',
            facilityId: order.facilityId.toHexString(),
            correlationId: 'corr-receipt',
            roleKeys: ['PHARMACIST'],
            permissionKeys: [
              'inventory.receive',
              'inventory.view_cost',
            ],
          },
          idempotencyKey: 'receipt-idempotency-1',
        },
        {
          purchaseOrderId: order._id.toHexString(),
          receivingLocationId: order.deliveryLocationId.toHexString(),
          inspectionStatus: 'PASSED',
          lines: [
            {
              purchaseOrderItemId: orderItem._id.toHexString(),
              receivedUnitId: unitId.toHexString(),
              receivedQuantity: '10',
              acceptedStockQuantity: '10',
              manufacturerBatchNumber: 'BATCH-1',
              expiryDate: '2027-07-20T00:00:00.000Z',
              unitCost: '10',
            },
          ],
        },
      ),
    ).rejects.toThrow('stock posting failed');

    expect(postGoodsReceipt).toHaveBeenCalledTimes(1);
    expect(auditAppend).not.toHaveBeenCalled();
    expect(outboxEnqueue).not.toHaveBeenCalled();
    expect(realtimePublish).not.toHaveBeenCalled();
  });
});