import {
  Types,
  type FilterQuery,
} from 'mongoose';

import {
  InventoryBatchModel,
  StockBalanceModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  InventoryBatchListQuery,
  StockBalanceListQuery,
} from '../inventory.contracts.js';

import type {
  InventoryPage,
  InventoryStockQueryRepositoryPort,
} from '../inventory.ports.js';

import type {
  EligibleFefoBatchRecord,
  InventoryBatchRecord,
  StockBalanceRecord,
  StockBalanceSummaryRecord,
} from '../inventory.persistence.types.js';

import {
  INVENTORY_BATCH_COST_SELECT,
  INVENTORY_BATCH_STANDARD_SELECT,
  STOCK_BALANCE_STANDARD_SELECT,
} from '../inventory.projections.js';

function record<T>(value: unknown): T {
  return value as T;
}

function pagination(
  page: number,
  pageSize: number,
): { page: number; pageSize: number; skip: number } {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): InventoryPage<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

const zero = () => Types.Decimal128.fromString('0');

export class InventoryStockQueryRepository
implements InventoryStockQueryRepositoryPort {
  public async findBatchById(
    facilityId: string,
    batchId: string,
    includeCost = false,
  ): Promise<InventoryBatchRecord | null> {
    return record<InventoryBatchRecord | null>(
      await InventoryBatchModel.findOne({
        _id: toObjectId(batchId, 'batchId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(includeCost ? INVENTORY_BATCH_COST_SELECT : INVENTORY_BATCH_STANDARD_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listBatches(
    facilityId: string,
    query: InventoryBatchListQuery,
    includeCost = false,
  ): Promise<InventoryPage<InventoryBatchRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.itemId !== undefined) {
      filter['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    if (query.supplierId !== undefined) {
      filter['supplierId'] = toObjectId(query.supplierId, 'supplierId');
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.inspectionStatus !== undefined) {
      filter['inspectionStatus'] = query.inspectionStatus;
    }

    if (query.recallStatus !== undefined) {
      filter['recallStatus'] = query.recallStatus;
    }

    const expiryFilter: Record<string, Date> = {};

    if (query.expiresFrom !== undefined) {
      expiryFilter['$gte'] = new Date(query.expiresFrom);
    }

    if (query.expiresTo !== undefined) {
      expiryFilter['$lte'] = new Date(query.expiresTo);
    }

    if (Object.keys(expiryFilter).length > 0) {
      filter['expiryDate'] = expiryFilter;
    } else if (query.includeExpired !== true) {
      filter['$or'] = [
        {
          expiryDate: null,
        },
        {
          expiryDate: {
            $gt: new Date(),
          },
        },
      ];
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      InventoryBatchModel.find(filter)
        .select(includeCost ? INVENTORY_BATCH_COST_SELECT : INVENTORY_BATCH_STANDARD_SELECT)
        .sort({
          [query.sortBy]: direction,
          manufacturerBatchNumber: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),

      InventoryBatchModel.countDocuments(filter).exec(),
    ]);

    return pageResult(
      record<InventoryBatchRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async findBalance(
    facilityId: string,
    locationId: string,
    itemId: string,
    batchId: string | null,
  ): Promise<StockBalanceRecord | null> {
    return record<StockBalanceRecord | null>(
      await StockBalanceModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        storeLocationId: toObjectId(locationId, 'locationId'),
        itemId: toObjectId(itemId, 'itemId'),
        batchId: batchId === null
          ? null
          : toObjectId(batchId, 'batchId'),
      })
        .select(STOCK_BALANCE_STANDARD_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listBalances(
    facilityId: string,
    query: StockBalanceListQuery,
  ): Promise<InventoryPage<StockBalanceRecord>> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.locationId !== undefined) {
      filter['storeLocationId'] = toObjectId(query.locationId, 'locationId');
    }

    if (query.itemId !== undefined) {
      filter['itemId'] = toObjectId(query.itemId, 'itemId');
    }

    if (query.batchId !== undefined) {
      filter['batchId'] = query.batchId === null
        ? null
        : toObjectId(query.batchId, 'batchId');
    }

    if (query.onlyAvailable === true) {
      filter['availableQuantity'] = {
        $gt: Types.Decimal128.fromString('0'),
      };
    }

    if (query.onlyRestricted === true) {
      filter['$or'] = [
        {
          quarantinedQuantity: {
            $gt: Types.Decimal128.fromString('0'),
          },
        },
        {
          damagedQuantity: {
            $gt: Types.Decimal128.fromString('0'),
          },
        },
        {
          expiredQuantity: {
            $gt: Types.Decimal128.fromString('0'),
          },
        },
      ];
    }

    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const direction = query.sortDirection === 'desc' ? -1 : 1;

    const [items, totalItems] = await Promise.all([
      StockBalanceModel.find(filter)
        .select(STOCK_BALANCE_STANDARD_SELECT)
        .sort({
          [query.sortBy]: direction,
          itemId: 1,
          batchId: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),

      StockBalanceModel.countDocuments(filter).exec(),
    ]);

    return pageResult(
      record<StockBalanceRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async summarizeItemStock(
    facilityId: string,
    itemId: string,
    locationId?: string,
  ): Promise<StockBalanceSummaryRecord> {
    const match: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      itemId: toObjectId(itemId, 'itemId'),
    };

    if (locationId !== undefined) {
      match['storeLocationId'] = toObjectId(locationId, 'locationId');
    }

    const [summary] = await StockBalanceModel.aggregate<StockBalanceSummaryRecord>([
      {
        $match: match,
      },
      {
        $group: {
          _id: null,
          itemId: {
            $first: '$itemId',
          },
          locationId: locationId === undefined
            ? {
                $literal: null,
              }
            : {
                $first: '$storeLocationId',
              },
          onHandQuantity: {
            $sum: '$onHandQuantity',
          },
          availableQuantity: {
            $sum: '$availableQuantity',
          },
          reservedQuantity: {
            $sum: '$reservedQuantity',
          },
          quarantinedQuantity: {
            $sum: '$quarantinedQuantity',
          },
          damagedQuantity: {
            $sum: '$damagedQuantity',
          },
          expiredQuantity: {
            $sum: '$expiredQuantity',
          },
          inTransitQuantity: {
            $sum: '$inTransitQuantity',
          },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
    ]).exec();

    return summary ?? {
      itemId: toObjectId(itemId, 'itemId'),
      locationId: locationId === undefined
        ? null
        : toObjectId(locationId, 'locationId'),
      onHandQuantity: zero(),
      availableQuantity: zero(),
      reservedQuantity: zero(),
      quarantinedQuantity: zero(),
      damagedQuantity: zero(),
      expiredQuantity: zero(),
      inTransitQuantity: zero(),
    };
  }

  public async listEligibleFefoBatches(
    facilityId: string,
    locationId: string,
    itemId: string,
    at: Date,
    limit = 100,
  ): Promise<EligibleFefoBatchRecord[]> {
    return StockBalanceModel.aggregate<EligibleFefoBatchRecord>([
      {
        $match: {
          facilityId: toObjectId(facilityId, 'facilityId'),
          storeLocationId: toObjectId(locationId, 'locationId'),
          itemId: toObjectId(itemId, 'itemId'),
          batchId: {
            $type: 'objectId',
          },
          availableQuantity: {
            $gt: Types.Decimal128.fromString('0'),
          },
        },
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
          'batch.itemId': toObjectId(itemId, 'itemId'),
          'batch.status': 'ACTIVE',
          'batch.inspectionStatus': {
            $in: [
              'NOT_REQUIRED',
              'PASSED',
              'PARTIALLY_ACCEPTED',
            ],
          },
          'batch.recallStatus': 'NONE',
          'batch.enteredInErrorAt': null,
          $or: [
            {
              'batch.expiryDate': null,
            },
            {
              'batch.expiryDate': {
                $gt: at,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          expirySort: {
            $ifNull: [
              '$batch.expiryDate',
              new Date('9999-12-31T23:59:59.999Z'),
            ],
          },
        },
      },
      {
        $sort: {
          expirySort: 1,
          'batch.manufactureDate': 1,
          'batch.createdAt': 1,
          'batch._id': 1,
        },
      },
      {
        $limit: Math.max(1, Math.min(limit, 1_000)),
      },
      {
        $project: {
          _id: 0,
          balanceId: '$_id',
          locationId: '$storeLocationId',
          itemId: '$itemId',
          batchId: '$batchId',
          availableQuantity: 1,
          batchNumber: '$batch.batchNumber',
          manufacturerBatchNumber: '$batch.manufacturerBatchNumber',
          expiryDate: '$batch.expiryDate',
          costPrice: '$batch.costPrice',
          sellingPrice: '$batch.sellingPrice',
          currency: '$batch.currency',
        },
      },
    ]).exec();
  }
}