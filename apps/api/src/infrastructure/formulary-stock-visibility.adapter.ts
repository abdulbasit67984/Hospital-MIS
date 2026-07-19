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

  asOf:
    Date | null;
}

interface InventoryItemProjection {
  _id: {
    toHexString(): string;
  };

  unitSymbol?:
    string | null;

  unit?:
    string | null;

  unitOfMeasureSymbol?:
    string | null;
}

export class MongoFormularyStockVisibilityAdapter
implements FormularyStockVisibilityPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async read(
    facilityId:
      string,

    inventoryItemIds:
      readonly string[],
  ): Promise<
    ReadonlyMap<
      string,
      FormularyStockView
    >
  > {
    const uniqueIds =
      [
        ...new Set(
          inventoryItemIds,
        ),
      ];

    if (
      uniqueIds.length ===
      0
    ) {
      return new Map();
    }

    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const itemObjectIds =
      uniqueIds.map(
        (inventoryItemId) =>
          toObjectId(
            inventoryItemId,
            'inventoryItemIds',
          ),
      );

    const [
      balances,
      inventoryItems,
    ] =
      await Promise.all([
        this.database
          .collection(
            'stockBalances',
          )
          .aggregate<StockAggregateRecord>([
            {
              $match: {
                facilityId:
                  facilityObjectId,

                itemId: {
                  $in:
                    itemObjectIds,
                },
              },
            },

            {
              $group: {
                _id:
                  '$itemId',

                availableQuantity: {
                  $sum:
                    '$availableQuantity',
                },

                asOf: {
                  $max:
                    '$updatedAt',
                },
              },
            },
          ])
          .toArray(),

        this.database
          .collection<InventoryItemProjection>(
            'inventoryItems',
          )
          .find({
            facilityId:
              facilityObjectId,

            _id: {
              $in:
                itemObjectIds,
            },
          })
          .project({
            _id:
              1,

            unitSymbol:
              1,

            unit:
              1,

            unitOfMeasureSymbol:
              1,
          })
          .toArray(),
      ]);

    const balanceByItemId =
      new Map(
        balances.map(
          (balance) => [
            balance._id.toHexString(),
            balance,
          ],
        ),
      );

    const inventoryItemById =
      new Map(
        inventoryItems.map(
          (item) => [
            item._id.toHexString(),
            item,
          ],
        ),
      );

    const result =
      new Map<
        string,
        FormularyStockView
      >();

    for (
      const inventoryItemId of
      uniqueIds
    ) {
      const balance =
        balanceByItemId.get(
          inventoryItemId,
        );

      const inventoryItem =
        inventoryItemById.get(
          inventoryItemId,
        );

      result.set(
        inventoryItemId,
        {
          visible:
            true,

          inventoryItemId,

          availableQuantity:
            balance?.availableQuantity
              .toString() ??
            '0',

          unit:
            inventoryItem?.unitSymbol ??
            inventoryItem?.unitOfMeasureSymbol ??
            inventoryItem?.unit ??
            null,

          lowStock:
            null,

          asOf:
            balance?.asOf
              ?.toISOString() ??
            null,
        },
      );
    }

    return result;
  }
}