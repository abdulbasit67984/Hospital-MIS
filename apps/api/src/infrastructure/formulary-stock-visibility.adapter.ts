import Decimal from 'decimal.js';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  FormularyStockVisibilityPort,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import type {
  FormularyStockView,
} from '../modules/formulary-prescriptions/formulary-prescriptions.types.js';

interface StockAggregateRecord {
  _id: {
    toHexString(): string;
  };

  availableQuantity: {
    toString(): string;
  };

  asOf: Date | null;
}

interface InventoryItemProjection {
  _id: {
    toHexString(): string;
  };

  stockUnitId: {
    toHexString(): string;
  };

  reorderLevel: {
    toString(): string;
  };

  status: 'ACTIVE' | 'INACTIVE';
}

interface UnitProjection {
  _id: {
    toHexString(): string;
  };

  symbol: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function uniqueObjectIdStrings(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.map((value) => value.toLowerCase()),
    ),
  ];
}

function safeLowStock(
  availableQuantity: string,
  reorderLevel: string,
): boolean | null {
  try {
    const available = new Decimal(availableQuantity);
    const reorder = new Decimal(reorderLevel);

    if (
      !available.isFinite() ||
      !reorder.isFinite() ||
      reorder.isNegative()
    ) {
      return null;
    }

    return available.lte(reorder);
  } catch {
    return null;
  }
}

export class MongoFormularyStockVisibilityAdapter
implements FormularyStockVisibilityPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async read(
    facilityId: string,
    inventoryItemIds: readonly string[],
  ): Promise<ReadonlyMap<string, FormularyStockView>> {
    const uniqueIds = uniqueObjectIdStrings(inventoryItemIds);

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const facilityObjectId = toObjectId(
      facilityId,
      'facilityId',
    );

    const itemObjectIds = uniqueIds.map((inventoryItemId) =>
      toObjectId(
        inventoryItemId,
        'inventoryItemIds',
      ),
    );

    const [balances, inventoryItems] = await Promise.all([
      this.database
        .collection('stockBalances')
        .aggregate<StockAggregateRecord>([
          {
            $match: {
              facilityId: facilityObjectId,
              itemId: {
                $in: itemObjectIds,
              },
            },
          },
          {
            $group: {
              _id: '$itemId',
              availableQuantity: {
                $sum: '$availableQuantity',
              },
              asOf: {
                $max: '$updatedAt',
              },
            },
          },
        ])
        .toArray(),

      this.database
        .collection<InventoryItemProjection>('inventoryItems')
        .find({
          facilityId: facilityObjectId,
          _id: {
            $in: itemObjectIds,
          },
        })
        .project({
          _id: 1,
          stockUnitId: 1,
          reorderLevel: 1,
          status: 1,
        })
        .toArray(),
    ]);

    const unitIds = [
      ...new Set(
        inventoryItems.map((item) =>
          item.stockUnitId.toHexString(),
        ),
      ),
    ];

    const units = unitIds.length === 0
      ? []
      : await this.database
          .collection<UnitProjection>('unitsOfMeasure')
          .find({
            facilityId: facilityObjectId,
            _id: {
              $in: unitIds.map((unitId) =>
                toObjectId(unitId, 'stockUnitIds'),
              ),
            },
          })
          .project({
            _id: 1,
            symbol: 1,
            status: 1,
          })
          .toArray();

    const balanceByItemId = new Map(
      balances.map((balance) => [
        balance._id.toHexString(),
        balance,
      ]),
    );

    const inventoryItemById = new Map(
      inventoryItems.map((item) => [
        item._id.toHexString(),
        item,
      ]),
    );

    const unitById = new Map(
      units.map((unit) => [
        unit._id.toHexString(),
        unit,
      ]),
    );

    const result = new Map<string, FormularyStockView>();

    for (const inventoryItemId of uniqueIds) {
      const balance = balanceByItemId.get(inventoryItemId);
      const inventoryItem = inventoryItemById.get(inventoryItemId);
      const availableQuantity = balance?.availableQuantity.toString() ?? '0';
      const unit = inventoryItem === undefined
        ? undefined
        : unitById.get(inventoryItem.stockUnitId.toHexString());
      const visible = inventoryItem?.status === 'ACTIVE';

      result.set(inventoryItemId, {
        visible,
        inventoryItemId: visible
          ? inventoryItemId
          : null,
        availableQuantity: visible
          ? availableQuantity
          : null,
        unit:
          visible && unit?.status === 'ACTIVE'
            ? unit.symbol
            : null,
        lowStock:
          visible && inventoryItem !== undefined
            ? safeLowStock(
                availableQuantity,
                inventoryItem.reorderLevel.toString(),
              )
            : null,
        asOf:
          visible
            ? balance?.asOf?.toISOString() ?? null
            : null,
      });
    }

    return result;
  }
}