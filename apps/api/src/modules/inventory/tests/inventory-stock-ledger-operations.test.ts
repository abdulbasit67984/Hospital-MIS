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
  StockBalanceModel,
  StockMovementModel,
  StockReservationModel,
  inventoryStockLedgerOperations,
  inventoryStockLedgerValidators,
  migrations,
  schemaForCollection,
  stockMovementSchema,
  stockReservationSchema,
  stockTransferSchema,
} from '@hospital-mis/database';

import type {
  InventoryItemRecord,
} from '../inventory.persistence.types.js';

import type {
  InventoryStockOperationsDependencies,
} from '../inventory-stock.ports.js';

import type {
  StockMovementRecord,
  StockReservationItemRecord,
  StockReservationRecord,
  StockTransferRecord,
} from '../inventory-stock.persistence.types.js';

import {
  approveStockTransferBodySchema,
  createStockTransferRequestBodySchema,
  receiveStockTransferBodySchema,
  reserveStockBodySchema,
} from '../inventory-stock.validation.js';

import {
  InventoryFefoAllocationService,
  InventoryStockPostingService,
} from '../services/inventory-stock-posting.service.js';

import {
  InventoryStockOperationsService,
} from '../services/inventory-stock-operations.service.js';

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function commonDocumentFields() {
  const actorId = objectId();

  return {
    facilityId: objectId(),
    transactionId: `tx-${objectId().toHexString()}`,
    correlationId: `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function inventoryItem(
  overrides: Partial<InventoryItemRecord> = {},
): InventoryItemRecord {
  const actorId = objectId();
  const stockUnitId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId: objectId(),
    itemCode: 'MED-001',
    name: 'Fictional Medicine',
    normalizedName: 'fictional medicine',
    itemType: 'MEDICATION',
    categoryId: objectId(),
    formularyItemId: objectId(),
    barcode: null,
    manufacturerName: null,
    description: null,
    stockUnitId,
    purchaseUnitId: stockUnitId,
    purchaseUnitToStockFactor: Types.Decimal128.fromString('1'),
    issueUnitId: stockUnitId,
    issueUnitToStockFactor: Types.Decimal128.fromString('1'),
    unitConversions: [],
    allowFractionalStock: false,
    batchTrackingRequired: true,
    expiryTrackingRequired: true,
    storageConditions: ['AMBIENT'],
    minimumStorageTemperatureCelsius: null,
    maximumStorageTemperatureCelsius: null,
    reorderLevel: Types.Decimal128.fromString('20'),
    minimumStockLevel: Types.Decimal128.fromString('10'),
    maximumStockLevel: Types.Decimal128.fromString('500'),
    safetyStockLevel: Types.Decimal128.fromString('5'),
    nearExpiryWarningDays: 90,
    negativeStockAllowed: false,
    controlledMedicine: false,
    highAlert: false,
    highValue: false,
    valuationMethod: 'BATCH_COST',
    preferredSupplierIds: [],
    supplierCatalogueEntries: [],
    searchText: 'med-001 fictional medicine',
    status: 'ACTIVE',
    activatedAt: occurredAt,
    activatedBy: actorId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    transactionId: 'tx-item',
    correlationId: 'corr-item',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  };
}

function stockMovementRecord(
  overrides: Partial<StockMovementRecord> = {},
): StockMovementRecord {
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId: objectId(),
    transactionId: 'tx-ledger',
    correlationId: 'corr-ledger',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    movementNumber: 'MOV-00000001',
    ledgerSequence: 1,
    itemId: objectId(),
    batchId: objectId(),
    storeLocationId: objectId(),
    stockUnitId: objectId(),
    movementType: 'GOODS_RECEIPT',
    direction: 'IN',
    quantity: Types.Decimal128.fromString('1'),
    onHandDelta: Types.Decimal128.fromString('1'),
    availableDelta: Types.Decimal128.fromString('1'),
    reservedDelta: Types.Decimal128.fromString('0'),
    quarantinedDelta: Types.Decimal128.fromString('0'),
    damagedDelta: Types.Decimal128.fromString('0'),
    expiredDelta: Types.Decimal128.fromString('0'),
    inTransitDelta: Types.Decimal128.fromString('0'),
    balanceVersionBefore: 0,
    balanceVersionAfter: 1,
    sourceType: 'GOODS_RECEIPT',
    sourceId: objectId(),
    sourceLineId: objectId(),
    reversalOfMovementId: null,
    operationKey: 'operation:goods-receipt:1',
    actorStaffId: objectId(),
    unitCost: Types.Decimal128.fromString('10'),
    currency: 'PKR',
    negativeStockOverride: false,
    negativeStockOverrideReason: null,
    reason: 'Accepted goods receipt stock',
    metadata: null,
    occurredAt,
    ...overrides,
  };
}

function transferRecord(
  facilityId: Types.ObjectId,
  sourceLocationId: Types.ObjectId,
  reservationId: Types.ObjectId,
): StockTransferRecord {
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId,
    transactionId: 'tx-transfer',
    correlationId: 'corr-transfer',
    schemaVersion: 1,
    version: 2,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    transferNumber: 'FAC-TRF-2026-00000001',
    transferType: 'LOCATION_TRANSFER',
    sourceLocationId,
    destinationLocationId: objectId(),
    requestedByStaffId: actorId,
    approvedByStaffId: actorId,
    rejectedByStaffId: null,
    dispatchedByStaffId: null,
    receivedByStaffId: null,
    cancelledByStaffId: null,
    reversedByStaffId: null,
    reservationId,
    reason: 'Replenishment request',
    notes: null,
    status: 'APPROVED',
    lineCount: 1,
    requestedAt: occurredAt,
    approvedAt: occurredAt,
    rejectedAt: null,
    dispatchedAt: null,
    receivedAt: null,
    cancelledAt: null,
    reversedAt: null,
    decisionReason: 'Approved transfer',
    discrepancyReason: null,
    cancellationReason: null,
    reversalReason: null,
    dispatchTransactionId: null,
    receiptTransactionId: null,
    reversalTransactionId: null,
  };
}

function reservationRecord(
  facilityId: Types.ObjectId,
  locationId: Types.ObjectId,
  reservationId: Types.ObjectId,
): StockReservationRecord {
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: reservationId,
    facilityId,
    transactionId: 'tx-reservation',
    correlationId: 'corr-reservation',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    reservationNumber: 'FAC-RES-2026-00000001',
    sourceType: 'STOCK_TRANSFER',
    sourceId: objectId(),
    sourceLineId: null,
    locationId,
    patientId: null,
    reservedByStaffId: actorId,
    consumedByStaffId: null,
    releasedByStaffId: null,
    reversedByStaffId: null,
    status: 'ACTIVE',
    lineCount: 1,
    reservedAt: occurredAt,
    expiresAt: new Date('2026-07-21T10:00:00.000Z'),
    consumedAt: null,
    releasedAt: null,
    reversedAt: null,
    releaseReason: null,
    reversalReason: null,
    consumptionSourceId: null,
  };
}

function reservationItemRecord(
  reservationId: Types.ObjectId,
): StockReservationItemRecord {
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId: objectId(),
    transactionId: 'tx-reservation-item',
    correlationId: 'corr-reservation-item',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    stockReservationId: reservationId,
    lineNumber: 1,
    itemId: objectId(),
    stockUnitId: objectId(),
    requestedStockQuantity: Types.Decimal128.fromString('3'),
    reservedStockQuantity: Types.Decimal128.fromString('3'),
    consumedStockQuantity: Types.Decimal128.fromString('0'),
    releasedStockQuantity: Types.Decimal128.fromString('0'),
    allocations: [
      {
        _id: objectId(),
        batchId: objectId(),
        reservedStockQuantity: Types.Decimal128.fromString('3'),
        consumedStockQuantity: Types.Decimal128.fromString('0'),
        releasedStockQuantity: Types.Decimal128.fromString('0'),
      },
    ],
    status: 'ACTIVE',
  };
}

describe(
  'inventory stock ledger and operations Batch 4',
  () => {
    it(
      'registers migration 026 and normalized operational schemas',
      () => {
        expect(
          migrations.at(-1),
        ).toBe(
          inventoryStockLedgerOperations,
        );

        expect(
          inventoryStockLedgerOperations.id,
        ).toBe(
          '026-inventory-stock-ledger-operations',
        );

        expect(
          schemaForCollection('stockMovements'),
        ).toBe(stockMovementSchema);

        expect(
          schemaForCollection('stockTransfers'),
        ).toBe(stockTransferSchema);

        expect(
          schemaForCollection('stockReservations'),
        ).toBe(stockReservationSchema);

        expect(
          inventoryStockLedgerValidators,
        ).toHaveProperty(
          'stockReservations.$jsonSchema.properties.facilityId.bsonType',
          'objectId',
        );
      },
    );

    it(
      'rejects a movement whose bucket deltas do not reconcile',
      async () => {
        const movement = new StockMovementModel({
          ...commonDocumentFields(),
          movementNumber: 'MOV-00000001',
          ledgerSequence: 1,
          itemId: objectId(),
          batchId: objectId(),
          storeLocationId: objectId(),
          stockUnitId: objectId(),
          movementType: 'GOODS_RECEIPT',
          direction: 'IN',
          quantity: '10',
          onHandDelta: '10',
          availableDelta: '9',
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: '0',
          inTransitDelta: '0',
          balanceVersionBefore: 0,
          balanceVersionAfter: 1,
          sourceType: 'GOODS_RECEIPT',
          sourceId: objectId(),
          sourceLineId: objectId(),
          reversalOfMovementId: null,
          operationKey: 'tx:receipt:line:accepted',
          actorStaffId: objectId(),
          unitCost: '10',
          currency: 'PKR',
          negativeStockOverride: false,
          negativeStockOverrideReason: null,
          reason: 'Accepted goods receipt',
          metadata: null,
          occurredAt: new Date(),
        });

        await expect(
          movement.validate(),
        ).rejects.toThrow(
          /must reconcile/iu,
        );
      },
    );

    it(
      'requires explicit attribution for a negative stock override',
      async () => {
        const balance = new StockBalanceModel({
          facilityId: objectId(),
          storeLocationId: objectId(),
          itemId: objectId(),
          batchId: objectId(),
          onHandQuantity: '-1',
          availableQuantity: '-1',
          reservedQuantity: '0',
          quarantinedQuantity: '0',
          damagedQuantity: '0',
          expiredQuantity: '0',
          inTransitQuantity: '0',
          lastMovementId: objectId(),
          lastMovementAt: new Date(),
          lastLedgerSequence: 1,
          lastReconciledAt: null,
          projectionTransactionId: 'tx-negative-stock',
          correlationId: 'corr-negative-stock',
          negativeStockOverride: true,
          negativeStockOverrideReason: null,
          negativeStockAuthorizedBy: null,
          schemaVersion: 1,
          version: 1,
          createdBy: objectId(),
          updatedBy: objectId(),
        });

        await expect(
          balance.validate(),
        ).rejects.toThrow(
          /override.*reason|authorization/iu,
        );
      },
    );

    it(
      'requires consumption source attribution before a reservation becomes consumed',
      async () => {
        const reservation = new StockReservationModel({
          ...commonDocumentFields(),
          reservationNumber: 'FAC-RES-2026-00000001',
          sourceType: 'PRESCRIPTION',
          sourceId: objectId(),
          sourceLineId: objectId(),
          locationId: objectId(),
          patientId: objectId(),
          reservedByStaffId: objectId(),
          consumedByStaffId: objectId(),
          releasedByStaffId: null,
          reversedByStaffId: null,
          status: 'CONSUMED',
          lineCount: 1,
          reservedAt: new Date('2026-07-20T10:00:00.000Z'),
          expiresAt: new Date('2026-07-21T10:00:00.000Z'),
          consumedAt: new Date('2026-07-20T11:00:00.000Z'),
          releasedAt: null,
          reversedAt: null,
          releaseReason: null,
          reversalReason: null,
          consumptionSourceId: null,
        });

        await expect(
          reservation.validate(),
        ).rejects.toThrow(
          /source traceability/iu,
        );
      },
    );

    it(
      'rejects invalid transfer, receipt, and reservation requests',
      () => {
        const locationId = objectId().toHexString();

        expect(
          createStockTransferRequestBodySchema.safeParse({
            transferType: 'LOCATION_TRANSFER',
            sourceLocationId: locationId,
            destinationLocationId: locationId,
            reason: 'Move stock',
            lines: [
              {
                itemId: objectId().toHexString(),
                requestedStockQuantity: '1',
              },
            ],
          }).success,
        ).toBe(false);

        expect(
          approveStockTransferBodySchema.safeParse({
            expectedVersion: 0,
            reason: 'Approve stock transfer',
            reservationExpiresAt: '2026-07-19T00:00:00.000Z',
            lines: [
              {
                transferItemId: objectId().toHexString(),
                approvedStockQuantity: '1',
              },
            ],
          }).success,
        ).toBe(false);

        expect(
          receiveStockTransferBodySchema.safeParse({
            expectedVersion: 2,
            lines: [
              {
                transferItemId: objectId().toHexString(),
                receivedStockQuantity: '0',
              },
            ],
            closeWithDiscrepancy: true,
          }).success,
        ).toBe(false);

        expect(
          reserveStockBodySchema.safeParse({
            sourceType: 'PRESCRIPTION',
            sourceId: objectId().toHexString(),
            locationId,
            expiresAt: '2026-07-21T00:00:00.000Z',
            lines: [
              {
                itemId: objectId().toHexString(),
                requestedStockQuantity: '0',
              },
            ],
          }).success,
        ).toBe(false);
      },
    );

    it(
      'maps receipt classifications into separate immutable ledger entries',
      async () => {
        const item = inventoryItem();
        const posted: unknown[][] = [];

        const repository = {
          postLedgerEntries: vi.fn(async (entries: unknown[]) => {
            posted.push(entries);
            return [];
          }),
          findMovementsBySource: vi.fn(async () => []),
          findMovementByOperationKey: vi.fn(async () => null),
          withTransaction: vi.fn(),
        };

        const catalog = {
          findItemById: vi.fn(async () => item),
        };

        const service = new InventoryStockPostingService(
          repository as never,
          catalog as never,
        );

        await service.postGoodsReceipt(
          {
            facilityId: item.facilityId.toHexString(),
            transactionId: 'tx-receipt-posting',
            correlationId: 'corr-receipt-posting',
            actorUserId: objectId().toHexString(),
            actorStaffId: objectId().toHexString(),
            goodsReceiptId: objectId().toHexString(),
            occurredAt: new Date('2026-07-20T10:00:00.000Z'),
            lines: [
              {
                goodsReceiptItemId: objectId().toHexString(),
                itemId: item._id.toHexString(),
                batchId: objectId().toHexString(),
                locationId: objectId().toHexString(),
                acceptedStockQuantity: '8',
                quarantinedStockQuantity: '1',
                damagedStockQuantity: '1',
                unitCost: '12.50',
                currency: 'PKR',
              },
            ],
          },
          {} as never,
        );

        const entries = posted[0] as Array<{
          movementType: string;
          onHandDelta: string;
          availableDelta: string;
          quarantinedDelta: string;
          damagedDelta: string;
        }>;

        expect(entries).toHaveLength(3);
        expect(entries.map((entry) => entry.movementType)).toEqual([
          'GOODS_RECEIPT',
          'QUARANTINE',
          'BREAKAGE',
        ]);
        expect(entries[0]).toMatchObject({
          onHandDelta: '8',
          availableDelta: '8',
        });
        expect(entries[1]).toMatchObject({
          onHandDelta: '1',
          quarantinedDelta: '1',
        });
        expect(entries[2]).toMatchObject({
          onHandDelta: '1',
          damagedDelta: '1',
        });
      },
    );

    it(
      'allocates tracked stock in FEFO order and blocks insufficient availability',
      async () => {
        const item = inventoryItem();
        const firstBatchId = objectId();
        const secondBatchId = objectId();

        const allocation = new InventoryFefoAllocationService(
          {
            findItemById: vi.fn(async () => item),
          } as never,
          {
            listEligibleFefoBatches: vi.fn(async () => [
              {
                balanceId: objectId(),
                locationId: objectId(),
                itemId: item._id,
                batchId: firstBatchId,
                availableQuantity: Types.Decimal128.fromString('3'),
                batchNumber: 'B1',
                manufacturerBatchNumber: 'B1',
                expiryDate: new Date('2026-08-01T00:00:00.000Z'),
                costPrice: Types.Decimal128.fromString('10'),
                sellingPrice: Types.Decimal128.fromString('12'),
                currency: 'PKR',
              },
              {
                balanceId: objectId(),
                locationId: objectId(),
                itemId: item._id,
                batchId: secondBatchId,
                availableQuantity: Types.Decimal128.fromString('5'),
                batchNumber: 'B2',
                manufacturerBatchNumber: 'B2',
                expiryDate: new Date('2026-09-01T00:00:00.000Z'),
                costPrice: Types.Decimal128.fromString('10'),
                sellingPrice: Types.Decimal128.fromString('12'),
                currency: 'PKR',
              },
            ]),
          } as never,
        );

        await expect(
          allocation.allocate({
            facilityId: item.facilityId.toHexString(),
            locationId: objectId().toHexString(),
            itemId: item._id.toHexString(),
            stockQuantity: '9',
            at: new Date('2026-07-20T10:00:00.000Z'),
          }),
        ).rejects.toThrow(
          /insufficient available stock/iu,
        );

        await expect(
          allocation.allocate({
            facilityId: item.facilityId.toHexString(),
            locationId: objectId().toHexString(),
            itemId: item._id.toHexString(),
            stockQuantity: '6',
            at: new Date('2026-07-20T10:00:00.000Z'),
          }),
        ).resolves.toEqual([
          {
            batchId: firstBatchId.toHexString(),
            stockQuantity: '3',
          },
          {
            batchId: secondBatchId.toHexString(),
            stockQuantity: '3',
          },
        ]);
      },
    );

    it(
      'does not mutate transfer projections or publish events when dispatch posting fails',
      async () => {
        const facilityId = objectId();
        const sourceLocationId = objectId();
        const reservationId = objectId();
        const transfer = transferRecord(
          facilityId,
          sourceLocationId,
          reservationId,
        );
        const reservation = reservationRecord(
          facilityId,
          sourceLocationId,
          reservationId,
        );
        const reservationItem = reservationItemRecord(reservationId);

        const markReservationConsumed = vi.fn();
        const markTransferDispatched = vi.fn();
        const auditAppend = vi.fn();
        const outboxEnqueue = vi.fn();
        const realtimePublish = vi.fn();

        const dependencies = {
          transactionManager: {
            execute: async (request: {
              idempotencyKey: string;
              execute: (transaction: {
                transactionId: string;
                idempotencyKey: string;
                checkpoint: () => Promise<void>;
                registerCompensation: () => Promise<void>;
              }) => Promise<unknown>;
            }) => request.execute({
              transactionId: 'tx-dispatch-failure',
              idempotencyKey: request.idempotencyKey,
              checkpoint: async () => undefined,
              registerCompensation: async () => undefined,
            }),
          },
          clock: {
            now: () => new Date('2026-07-20T10:00:00.000Z'),
          },
          repository: {
            findTransfer: vi.fn(async () => transfer),
            findReservation: vi.fn(async () => reservation),
            findReservationItems: vi.fn(async () => [reservationItem]),
            withTransaction: async (work: (session: unknown) => Promise<unknown>) => work({}),
            markReservationConsumed,
            markTransferDispatched,
          },
          stockPosting: {
            post: vi.fn(async () => {
              throw new Error('simulated ledger failure');
            }),
          },
          context: {
            resolveOperationalLocation: vi.fn(async () => ({
              actor: {
                userId: objectId().toHexString(),
                staffId: objectId().toHexString(),
                facilityId: facilityId.toHexString(),
                departmentId: null,
                displayName: 'Fictional Store Manager',
                professionalType: 'PHARMACIST',
              },
              location: {
                locationId: sourceLocationId.toHexString(),
                facilityId: facilityId.toHexString(),
                locationCode: 'STORE-1',
                name: 'Central Store',
                locationType: 'CENTRAL_STORE',
                parentLocationId: null,
                ancestorLocationIds: [],
                departmentId: null,
                wardId: null,
                servicePointId: null,
                managerStaffId: null,
                supportsDispensing: false,
                allowsControlledMedicine: true,
                allowsGeneralStock: true,
                status: 'ACTIVE',
              },
            })),
          },
          catalog: {
            findLocationById: vi.fn(async () => ({
              _id: sourceLocationId,
              facilityId,
              locationCode: 'STORE-1',
              name: 'Central Store',
              normalizedName: 'central store',
              locationType: 'CENTRAL_STORE',
              parentLocationId: null,
              ancestorLocationIds: [],
              hierarchyDepth: 0,
              departmentId: null,
              wardId: null,
              servicePointId: null,
              managerStaffId: null,
              storageConditions: ['AMBIENT'],
              supportsDispensing: false,
              allowsControlledMedicine: true,
              allowsGeneralStock: true,
              stockOwnershipCode: 'STORE-1',
              physicalAddress: null,
              contactPhone: null,
              displayOrder: 0,
              status: 'ACTIVE',
              activatedAt: new Date(),
              activatedBy: objectId(),
              deactivatedAt: null,
              deactivatedBy: null,
              deactivationReason: null,
              transactionId: 'tx-location',
              correlationId: 'corr-location',
              schemaVersion: 1,
              version: 0,
              createdBy: objectId(),
              updatedBy: objectId(),
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
          accessPolicy: {
            authorize: vi.fn(async () => ({
              allowed: true,
              accessMode: 'FACILITY_INVENTORY',
              includeCost: false,
              minimumNecessaryFields: [],
              auditSensitiveRead: false,
            })),
          },
          audit: {
            append: auditAppend,
          },
          outbox: {
            enqueue: outboxEnqueue,
          },
          realtime: {
            publish: realtimePublish,
          },
        } as unknown as InventoryStockOperationsDependencies;

        const service = new InventoryStockOperationsService(dependencies);

        await expect(
          service.dispatchStockTransfer(
            {
              actor: {
                userId: objectId().toHexString(),
                facilityId: facilityId.toHexString(),
                correlationId: 'corr-dispatch-failure',
                roleKeys: ['STORE_MANAGER'],
                permissionKeys: ['inventory.transfer'],
              },
              idempotencyKey: 'dispatch-failure-key',
            },
            transfer._id.toHexString(),
            {
              expectedVersion: transfer.version,
              reason: 'Dispatch approved stock transfer',
            },
          ),
        ).rejects.toThrow('simulated ledger failure');

        expect(markReservationConsumed).not.toHaveBeenCalled();
        expect(markTransferDispatched).not.toHaveBeenCalled();
        expect(auditAppend).not.toHaveBeenCalled();
        expect(outboxEnqueue).not.toHaveBeenCalled();
        expect(realtimePublish).not.toHaveBeenCalled();
      },
    );

    it(
      'creates reversible source movement fixtures with exact balance versions',
      () => {
        const movement = stockMovementRecord();

        expect(movement.balanceVersionAfter).toBe(
          movement.balanceVersionBefore + 1,
        );
        expect(movement.direction).toBe('IN');
      },
    );
  },
);