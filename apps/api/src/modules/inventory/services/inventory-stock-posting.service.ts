import Decimal from 'decimal.js';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  InventoryReceiptStockPostingPort,
  ReceiptStockPostingLine,
  SupplierReturnStockPostingLine,
} from '../inventory-procurement.ports.js';

import type {
  InventoryCatalogRepositoryPort,
  InventoryStockQueryRepositoryPort,
} from '../inventory.ports.js';

import type {
  InventoryFefoAllocationPort,
  InventoryStockLedgerRepositoryPort,
  InventoryStockPostingPort,
} from '../inventory-stock.ports.js';

import type {
  InventoryStockMongoSession,
  StockLedgerEntryInput,
  StockMovementRecord,
} from '../inventory-stock.persistence.types.js';

import {
  normalizeInventoryDecimal,
} from '../inventory.normalization.js';

function normalized(value: Decimal | string): string {
  return normalizeInventoryDecimal(
    value instanceof Decimal
      ? value.toFixed()
      : value,
    8,
  );
}

function negate(value: unknown): string {
  return normalized(
    new Decimal(String(value)).negated(),
  );
}

function operationKey(
  transactionId: string,
  sourceType: string,
  sourceId: string,
  sourceLineId: string | null,
  movementType: string,
  suffix: string,
): string {
  return [
    transactionId,
    sourceType,
    sourceId,
    sourceLineId ?? 'header',
    movementType,
    suffix,
  ]
    .map((value) => value.toLowerCase())
    .join(':');
}

function positive(value: string): boolean {
  return new Decimal(value).gt(0);
}

export class InventoryStockPostingService
implements InventoryStockPostingPort, InventoryReceiptStockPostingPort {
  public constructor(
    private readonly repository: InventoryStockLedgerRepositoryPort,
    private readonly catalog: InventoryCatalogRepositoryPort,
  ) {}

  public post(
    entries: readonly StockLedgerEntryInput[],
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]> {
    return this.repository.postLedgerEntries(
      entries,
      session,
    );
  }

  public async reverseSourceMovements(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      sourceType: string;
      sourceId: string;
      reason: string;
      occurredAt: Date;
    }>,
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]> {
    const movements =
      await this.repository.findMovementsBySource(
        input.facilityId,
        input.sourceType,
        input.sourceId,
        session,
      );

    const reversible = movements.filter(
      (movement) =>
        movement.movementType !== 'REVERSAL' &&
        movement.movementType !== 'DISPENSING_REVERSAL' &&
        movement.movementType !== 'TRANSFER_REVERSAL',
    );

    if (reversible.length === 0) {
      throw new ConflictError(
        'No posted stock movements were found for reversal',
      );
    }

    return this.post(
      reversible.map(
        (movement): StockLedgerEntryInput => ({
          facilityId: input.facilityId,
          transactionId: input.transactionId,
          correlationId: input.correlationId,
          actorUserId: input.actorUserId,
          actorStaffId: input.actorStaffId,
          itemId: movement.itemId.toHexString(),
          batchId:
            movement.batchId?.toHexString() ?? null,
          locationId:
            movement.storeLocationId.toHexString(),
          stockUnitId:
            movement.stockUnitId.toHexString(),
          movementType: 'REVERSAL',
          sourceType: 'MANUAL_REVERSAL',
          sourceId: movement.sourceId.toHexString(),
          sourceLineId: movement._id.toHexString(),
          reversalOfMovementId:
            movement._id.toHexString(),
          operationKey: operationKey(
            input.transactionId,
            'MANUAL_REVERSAL',
            movement.sourceId.toHexString(),
            movement._id.toHexString(),
            'REVERSAL',
            movement.operationKey,
          ),
          quantity: movement.quantity.toString(),
          onHandDelta: negate(movement.onHandDelta),
          availableDelta: negate(
            movement.availableDelta,
          ),
          reservedDelta: negate(
            movement.reservedDelta,
          ),
          quarantinedDelta: negate(
            movement.quarantinedDelta,
          ),
          damagedDelta: negate(
            movement.damagedDelta,
          ),
          expiredDelta: negate(
            movement.expiredDelta,
          ),
          inTransitDelta: negate(
            movement.inTransitDelta,
          ),
          unitCost:
            movement.unitCost?.toString() ?? null,
          currency: movement.currency,
          reason: input.reason,
          metadata: {
            reversedMovementNumber:
              movement.movementNumber,
            originalSourceType:
              movement.sourceType,
          },
          occurredAt: input.occurredAt,
          allowNegativeStock: false,
        }),
      ),
      session,
    );
  }

  public async postGoodsReceipt(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      goodsReceiptId: string;
      occurredAt: Date;
      lines: readonly ReceiptStockPostingLine[];
    }>,
    session: InventoryStockMongoSession,
  ): Promise<void> {
    const entries: StockLedgerEntryInput[] = [];

    for (const line of input.lines) {
      const item = await this.catalog.findItemById(
        input.facilityId,
        line.itemId,
        true,
      );

      if (item === null) {
        throw new ResourceNotFoundError(
          'Goods-receipt inventory item was not found',
        );
      }

      const common = {
        facilityId: input.facilityId,
        transactionId: input.transactionId,
        correlationId: input.correlationId,
        actorUserId: input.actorUserId,
        actorStaffId: input.actorStaffId,
        itemId: line.itemId,
        batchId: line.batchId,
        locationId: line.locationId,
        stockUnitId: item.stockUnitId.toHexString(),
        sourceType: 'GOODS_RECEIPT' as const,
        sourceId: input.goodsReceiptId,
        sourceLineId: line.goodsReceiptItemId,
        unitCost: line.unitCost,
        currency: line.currency,
        occurredAt: input.occurredAt,
        allowNegativeStock: false,
      };

      if (positive(line.acceptedStockQuantity)) {
        entries.push({
          ...common,
          movementType: 'GOODS_RECEIPT',
          operationKey: operationKey(
            input.transactionId,
            'GOODS_RECEIPT',
            input.goodsReceiptId,
            line.goodsReceiptItemId,
            'GOODS_RECEIPT',
            'accepted',
          ),
          quantity: line.acceptedStockQuantity,
          onHandDelta: line.acceptedStockQuantity,
          availableDelta: line.acceptedStockQuantity,
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: '0',
          inTransitDelta: '0',
          reason: 'Accepted goods receipt stock',
        });
      }

      if (positive(line.quarantinedStockQuantity)) {
        entries.push({
          ...common,
          movementType: 'QUARANTINE',
          operationKey: operationKey(
            input.transactionId,
            'GOODS_RECEIPT',
            input.goodsReceiptId,
            line.goodsReceiptItemId,
            'QUARANTINE',
            'receipt',
          ),
          quantity: line.quarantinedStockQuantity,
          onHandDelta: line.quarantinedStockQuantity,
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta:
            line.quarantinedStockQuantity,
          damagedDelta: '0',
          expiredDelta: '0',
          inTransitDelta: '0',
          reason: 'Goods receipt stock placed in quarantine',
        });
      }

      if (positive(line.damagedStockQuantity)) {
        entries.push({
          ...common,
          movementType: 'BREAKAGE',
          operationKey: operationKey(
            input.transactionId,
            'GOODS_RECEIPT',
            input.goodsReceiptId,
            line.goodsReceiptItemId,
            'BREAKAGE',
            'receipt-damaged',
          ),
          quantity: line.damagedStockQuantity,
          onHandDelta: line.damagedStockQuantity,
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: line.damagedStockQuantity,
          expiredDelta: '0',
          inTransitDelta: '0',
          reason: 'Damaged stock recorded during goods receipt',
        });
      }
    }

    if (entries.length > 0) {
      await this.post(entries, session);
    }
  }

  public async reverseGoodsReceipt(
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
    session: InventoryStockMongoSession,
  ): Promise<void> {
    await this.reverseSourceMovements(
      {
        ...input,
        sourceType: 'GOODS_RECEIPT',
        sourceId: input.goodsReceiptId,
      },
      session,
    );
  }

  public async postSupplierReturn(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      supplierReturnId: string;
      occurredAt: Date;
      lines: readonly SupplierReturnStockPostingLine[];
    }>,
    session: InventoryStockMongoSession,
  ): Promise<void> {
    const entries: StockLedgerEntryInput[] = [];

    for (const line of input.lines) {
      const item = await this.catalog.findItemById(
        input.facilityId,
        line.itemId,
        true,
      );

      if (item === null) {
        throw new ResourceNotFoundError(
          'Supplier-return inventory item was not found',
        );
      }

      const quantity = line.quantity;
      const common = {
        facilityId: input.facilityId,
        transactionId: input.transactionId,
        correlationId: input.correlationId,
        actorUserId: input.actorUserId,
        actorStaffId: input.actorStaffId,
        itemId: line.itemId,
        batchId: line.batchId,
        locationId: line.locationId,
        stockUnitId: item.stockUnitId.toHexString(),
        sourceType: 'SUPPLIER_RETURN' as const,
        sourceId: input.supplierReturnId,
        sourceLineId: line.supplierReturnItemId,
        operationKey: operationKey(
          input.transactionId,
          'SUPPLIER_RETURN',
          input.supplierReturnId,
          line.supplierReturnItemId,
          'SUPPLIER_RETURN',
          line.condition,
        ),
        quantity,
        inTransitDelta: '0',
        occurredAt: input.occurredAt,
        reason: `${line.reasonCode}: ${line.condition}`,
        allowNegativeStock: false,
      };

      if (line.reasonCode === 'REJECTED_ON_RECEIPT') {
        entries.push({
          ...common,
          movementType: 'SUPPLIER_RETURN_REJECTED',
          onHandDelta: '0',
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: '0',
        });
        continue;
      }

      if (
        [
          'QUARANTINED',
          'RECALLED',
        ].includes(line.condition)
      ) {
        entries.push({
          ...common,
          movementType: 'SUPPLIER_RETURN',
          onHandDelta: normalized(
            new Decimal(quantity).negated(),
          ),
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta: normalized(
            new Decimal(quantity).negated(),
          ),
          damagedDelta: '0',
          expiredDelta: '0',
        });
        continue;
      }

      if (line.condition === 'DAMAGED') {
        entries.push({
          ...common,
          movementType: 'SUPPLIER_RETURN',
          onHandDelta: normalized(
            new Decimal(quantity).negated(),
          ),
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: normalized(
            new Decimal(quantity).negated(),
          ),
          expiredDelta: '0',
        });
        continue;
      }

      if (line.condition === 'EXPIRED') {
        entries.push({
          ...common,
          movementType: 'SUPPLIER_RETURN',
          onHandDelta: normalized(
            new Decimal(quantity).negated(),
          ),
          availableDelta: '0',
          reservedDelta: '0',
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: normalized(
            new Decimal(quantity).negated(),
          ),
        });
        continue;
      }

      entries.push({
        ...common,
        movementType: 'SUPPLIER_RETURN',
        onHandDelta: normalized(
          new Decimal(quantity).negated(),
        ),
        availableDelta: normalized(
          new Decimal(quantity).negated(),
        ),
        reservedDelta: '0',
        quarantinedDelta: '0',
        damagedDelta: '0',
        expiredDelta: '0',
      });
    }

    if (entries.length > 0) {
      await this.post(entries, session);
    }
  }
}

export class InventoryFefoAllocationService
implements InventoryFefoAllocationPort {
  public constructor(
    private readonly catalog: InventoryCatalogRepositoryPort,
    private readonly stockQueries: InventoryStockQueryRepositoryPort,
  ) {}

  public async allocate(
    input: Readonly<{
      facilityId: string;
      locationId: string;
      itemId: string;
      stockQuantity: string;
      at: Date;
    }>,
  ): Promise<readonly {
    batchId: string | null;
    stockQuantity: string;
  }[]> {
    const item = await this.catalog.findItemById(
      input.facilityId,
      input.itemId,
      false,
    );

    if (item === null || item.status !== 'ACTIVE') {
      throw new ResourceNotFoundError(
        'An active inventory item was not found for stock allocation',
      );
    }

    const requested = new Decimal(
      input.stockQuantity,
    );

    if (!requested.isFinite() || requested.lte(0)) {
      throw new ConflictError(
        'Stock allocation quantity must be greater than zero',
      );
    }

    if (!item.batchTrackingRequired) {
      const balance = await this.stockQueries.findBalance(
        input.facilityId,
        input.locationId,
        input.itemId,
        null,
      );

      const available = new Decimal(
        balance?.availableQuantity.toString() ?? '0',
      );

      if (available.lt(requested)) {
        throw new ConflictError(
          'Insufficient available stock for allocation',
        );
      }

      return [
        {
          batchId: null,
          stockQuantity: normalized(requested),
        },
      ];
    }

    const batches =
      await this.stockQueries.listEligibleFefoBatches(
        input.facilityId,
        input.locationId,
        input.itemId,
        input.at,
        1_000,
      );

    let remaining = requested;
    const allocations: Array<{
      batchId: string;
      stockQuantity: string;
    }> = [];

    for (const batch of batches) {
      if (remaining.lte(0)) {
        break;
      }

      const available = new Decimal(
        batch.availableQuantity.toString(),
      );
      const quantity = Decimal.min(
        available,
        remaining,
      );

      if (quantity.lte(0)) {
        continue;
      }

      allocations.push({
        batchId: batch.batchId.toHexString(),
        stockQuantity: normalized(quantity),
      });

      remaining = remaining.minus(quantity);
    }

    if (remaining.gt(0)) {
      throw new ConflictError(
        'Insufficient eligible FEFO stock for allocation',
      );
    }

    return allocations;
  }
}