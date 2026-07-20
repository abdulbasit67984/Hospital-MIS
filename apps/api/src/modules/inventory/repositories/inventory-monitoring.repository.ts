import {
  Types,
} from 'mongoose';

import {
  ReorderRuleModel,
  StockBalanceModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  InventoryMonitoringQuery,
  InventoryValuationQuery,
  NearExpiryInventoryQuery,
  StockReconciliationQuery,
} from '../inventory-control.contracts.js';

import type {
  InventoryControlPage,
  InventoryMonitoringRepositoryPort,
} from '../inventory-control.ports.js';

import type {
  InventoryValuationRecord,
  LowStockMonitoringRecord,
  NearExpiryMonitoringRecord,
  StockReconciliationRecord,
} from '../inventory-control.persistence.types.js';

interface FacetResult<T> {
  items: T[];
  total: Array<{
    count: number;
  }>;
}

function pagination(
  page: number,
  pageSize: number,
): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 100));

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

function pageResult<T>(
  facet: FacetResult<T> | undefined,
  page: number,
  pageSize: number,
): InventoryControlPage<T> {
  const totalItems = facet?.total[0]?.count ?? 0;

  return {
    items: facet?.items ?? [],
    page,
    pageSize,
    totalItems,
    totalPages:
      totalItems === 0
        ? 0
        : Math.ceil(totalItems / pageSize),
  };
}

export class InventoryMonitoringRepository
implements InventoryMonitoringRepositoryPort {
  public async listLowStock(
    facilityId: string,
    query: InventoryMonitoringQuery,
  ): Promise<InventoryControlPage<LowStockMonitoringRecord>> {
    const { page, pageSize, skip } = pagination(
      query.page,
      query.pageSize,
    );

    const match: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      active: true,
    };

    if (query.locationId !== undefined) {
      match['locationId'] = toObjectId(query.locationId, 'locationId');
    }

    if (query.itemId !== undefined) {
      match['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    const pipeline: Record<string, unknown>[] = [
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'stockBalances',
          let: {
            locationId: '$locationId',
            itemId: '$itemId',
            facilityId: '$facilityId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$facilityId', '$$facilityId'],
                    },
                    {
                      $eq: ['$storeLocationId', '$$locationId'],
                    },
                    {
                      $eq: ['$itemId', '$$itemId'],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                availableQuantity: {
                  $sum: '$availableQuantity',
                },
                onHandQuantity: {
                  $sum: '$onHandQuantity',
                },
              },
            },
          ],
          as: 'balance',
        },
      },
      {
        $set: {
          balance: {
            $ifNull: [
              {
                $first: '$balance',
              },
              {
                availableQuantity: Types.Decimal128.fromString('0'),
                onHandQuantity: Types.Decimal128.fromString('0'),
              },
            ],
          },
        },
      },
      {
        $match: {
          $expr: {
            $lte: [
              '$balance.availableQuantity',
              '$reorderLevel',
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'inventoryItems',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      {
        $unwind: '$item',
      },
      {
        $match: {
          'item.facilityId': toObjectId(facilityId, 'facilityId'),
          'item.status': 'ACTIVE',
          ...(query.categoryId === undefined
            ? {}
            : {
                'item.categoryId': toObjectId(
                  query.categoryId,
                  'categoryId',
                ),
              }),
        },
      },
      {
        $set: {
          severity: {
            $switch: {
              branches: [
                {
                  case: {
                    $lte: [
                      '$balance.availableQuantity',
                      '$criticalStockLevel',
                    ],
                  },
                  then: 'CRITICAL',
                },
                {
                  case: {
                    $lte: [
                      '$balance.availableQuantity',
                      '$minimumStockLevel',
                    ],
                  },
                  then: 'LOW',
                },
              ],
              default: 'REORDER',
            },
          },
        },
      },
      {
        $sort: {
          severity: 1,
          'balance.availableQuantity': 1,
          'item.name': 1,
          itemId: 1,
        },
      },
      {
        $project: {
          _id: 0,
          locationId: 1,
          itemId: 1,
          itemCode: '$item.itemCode',
          itemName: '$item.name',
          availableQuantity: '$balance.availableQuantity',
          onHandQuantity: '$balance.onHandQuantity',
          criticalStockLevel: 1,
          minimumStockLevel: 1,
          reorderLevel: 1,
          maximumStockLevel: 1,
          severity: 1,
          preferredSupplierId: 1,
        },
      },
      {
        $facet: {
          items: [
            {
              $skip: skip,
            },
            {
              $limit: pageSize,
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ];

    const [facet] = await ReorderRuleModel.aggregate<
      FacetResult<LowStockMonitoringRecord>
    >(pipeline).exec();

    return pageResult(facet, page, pageSize);
  }

  public async listNearExpiry(
    facilityId: string,
    query: NearExpiryInventoryQuery,
  ): Promise<InventoryControlPage<NearExpiryMonitoringRecord>> {
    const { page, pageSize, skip } = pagination(
      query.page,
      query.pageSize,
    );
    const now = new Date();
    const expiresBefore = new Date(
      now.getTime() + query.expiresWithinDays * 86_400_000,
    );

    const match: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      batchId: {
        $type: 'objectId',
      },
    };

    if (query.locationId !== undefined) {
      match['storeLocationId'] = toObjectId(query.locationId, 'locationId');
    }

    if (query.itemId !== undefined) {
      match['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    const [facet] = await StockBalanceModel.aggregate<
      FacetResult<NearExpiryMonitoringRecord>
    >([
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'inventoryBatches',
          localField: 'batchId',
          foreignField: '_id',
          as: 'batch',
        },
      },
      {
        $unwind: '$batch',
      },
      {
        $match: {
          'batch.facilityId': toObjectId(facilityId, 'facilityId'),
          'batch.expiryDate': {
            $gt: now,
            $lte: expiresBefore,
          },
          ...(query.includeQuarantined === true
            ? {}
            : {
                'batch.status': 'ACTIVE',
              }),
        },
      },
      {
        $lookup: {
          from: 'inventoryItems',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      {
        $unwind: '$item',
      },
      {
        $match: {
          'item.facilityId': toObjectId(facilityId, 'facilityId'),
          ...(query.categoryId === undefined
            ? {}
            : {
                'item.categoryId': toObjectId(
                  query.categoryId,
                  'categoryId',
                ),
              }),
        },
      },
      {
        $set: {
          daysToExpiry: {
            $ceil: {
              $divide: [
                {
                  $subtract: [
                    '$batch.expiryDate',
                    now,
                  ],
                },
                86_400_000,
              ],
            },
          },
        },
      },
      {
        $sort: {
          'batch.expiryDate': 1,
          'item.name': 1,
          storeLocationId: 1,
          batchId: 1,
        },
      },
      {
        $project: {
          _id: 0,
          locationId: '$storeLocationId',
          itemId: 1,
          batchId: 1,
          itemCode: '$item.itemCode',
          itemName: '$item.name',
          manufacturerBatchNumber: '$batch.manufacturerBatchNumber',
          expiryDate: '$batch.expiryDate',
          daysToExpiry: 1,
          availableQuantity: 1,
          reservedQuantity: 1,
          quarantinedQuantity: 1,
          status: '$batch.status',
        },
      },
      {
        $facet: {
          items: [
            {
              $skip: skip,
            },
            {
              $limit: pageSize,
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]).exec();

    return pageResult(facet, page, pageSize);
  }

  public async listValuation(
    facilityId: string,
    query: InventoryValuationQuery,
  ): Promise<InventoryControlPage<InventoryValuationRecord>> {
    const { page, pageSize, skip } = pagination(
      query.page,
      query.pageSize,
    );

    const match: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.locationId !== undefined) {
      match['storeLocationId'] = toObjectId(query.locationId, 'locationId');
    }

    if (query.itemId !== undefined) {
      match['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    const quantityExpression =
      query.includeRestricted === true
        ? '$onHandQuantity'
        : '$availableQuantity';

    const [facet] = await StockBalanceModel.aggregate<
      FacetResult<InventoryValuationRecord>
    >([
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'inventoryBatches',
          localField: 'batchId',
          foreignField: '_id',
          as: 'batch',
        },
      },
      {
        $set: {
          batch: {
            $first: '$batch',
          },
        },
      },
      {
        $lookup: {
          from: 'inventoryItems',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      {
        $unwind: '$item',
      },
      {
        $match: {
          'item.facilityId': toObjectId(facilityId, 'facilityId'),
          ...(query.categoryId === undefined
            ? {}
            : {
                'item.categoryId': toObjectId(
                  query.categoryId,
                  'categoryId',
                ),
              }),
        },
      },
      {
        $set: {
          valuationQuantity: quantityExpression,
          unitCost: {
            $ifNull: [
              '$batch.costPrice',
              Types.Decimal128.fromString('0'),
            ],
          },
          currency: {
            $ifNull: [
              '$batch.currency',
              'PKR',
            ],
          },
        },
      },
      {
        $match: {
          valuationQuantity: {
            $gt: Types.Decimal128.fromString('0'),
          },
        },
      },
      {
        $set: {
          extendedValue: {
            $multiply: [
              '$valuationQuantity',
              '$unitCost',
            ],
          },
        },
      },
      {
        $sort: {
          storeLocationId: 1,
          'item.name': 1,
          batchId: 1,
        },
      },
      {
        $project: {
          _id: 0,
          locationId: '$storeLocationId',
          itemId: 1,
          batchId: 1,
          itemCode: '$item.itemCode',
          itemName: '$item.name',
          quantity: '$valuationQuantity',
          unitCost: 1,
          currency: 1,
          extendedValue: 1,
        },
      },
      {
        $facet: {
          items: [
            {
              $skip: skip,
            },
            {
              $limit: pageSize,
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]).exec();

    return pageResult(facet, page, pageSize);
  }

  public async listReconciliation(
    facilityId: string,
    query: StockReconciliationQuery,
  ): Promise<InventoryControlPage<StockReconciliationRecord>> {
    const { page, pageSize, skip } = pagination(
      query.page,
      query.pageSize,
    );

    const match: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.locationId !== undefined) {
      match['storeLocationId'] = toObjectId(query.locationId, 'locationId');
    }

    if (query.itemId !== undefined) {
      match['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    const [facet] = await StockBalanceModel.aggregate<
      FacetResult<StockReconciliationRecord>
    >([
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'stockMovements',
          let: {
            facilityId: '$facilityId',
            locationId: '$storeLocationId',
            itemId: '$itemId',
            batchId: '$batchId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$facilityId', '$$facilityId'],
                    },
                    {
                      $eq: ['$storeLocationId', '$$locationId'],
                    },
                    {
                      $eq: ['$itemId', '$$itemId'],
                    },
                    {
                      $eq: ['$batchId', '$$batchId'],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                ledgerOnHandQuantity: {
                  $sum: '$onHandDelta',
                },
                movementCount: {
                  $sum: 1,
                },
                lastLedgerSequence: {
                  $max: '$ledgerSequence',
                },
              },
            },
          ],
          as: 'ledger',
        },
      },
      {
        $set: {
          ledger: {
            $ifNull: [
              {
                $first: '$ledger',
              },
              {
                ledgerOnHandQuantity: Types.Decimal128.fromString('0'),
                movementCount: 0,
                lastLedgerSequence: 0,
              },
            ],
          },
        },
      },
      {
        $set: {
          differenceQuantity: {
            $subtract: [
              '$onHandQuantity',
              '$ledger.ledgerOnHandQuantity',
            ],
          },
        },
      },
      {
        $set: {
          reconciled: {
            $and: [
              {
                $eq: [
                  '$differenceQuantity',
                  Types.Decimal128.fromString('0'),
                ],
              },
              {
                $eq: [
                  '$lastLedgerSequence',
                  '$ledger.lastLedgerSequence',
                ],
              },
            ],
          },
        },
      },
      ...(query.onlyMismatches === true
        ? [
            {
              $match: {
                reconciled: false,
              },
            },
          ]
        : []),
      {
        $sort: {
          reconciled: 1,
          storeLocationId: 1,
          itemId: 1,
          batchId: 1,
        },
      },
      {
        $project: {
          _id: 0,
          locationId: '$storeLocationId',
          itemId: 1,
          batchId: 1,
          projectedOnHandQuantity: '$onHandQuantity',
          ledgerOnHandQuantity: '$ledger.ledgerOnHandQuantity',
          differenceQuantity: 1,
          lastLedgerSequence: 1,
          movementCount: '$ledger.movementCount',
          reconciled: 1,
        },
      },
      {
        $facet: {
          items: [
            {
              $skip: skip,
            },
            {
              $limit: pageSize,
            },
          ],
          total: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]).exec();

    return pageResult(facet, page, pageSize);
  }
}