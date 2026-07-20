import type {
  FilterQuery,
  Model,
} from 'mongoose';

import {
  GoodsReceiptModel,
  PhysicalStockCountModel,
  ProductRecallModel,
  PurchaseOrderModel,
  PurchaseRequisitionModel,
  StockAdjustmentModel,
  StockMovementModel,
  StockReservationModel,
  StockTransferModel,
  SupplierReturnModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  InventoryActorContext,
} from '../inventory.contracts.js';

import type {
  InventoryAccessPolicyPort,
  InventoryContextPort,
} from '../inventory.ports.js';

export interface InventoryOperationalListQuery {
  page: number;
  pageSize: number;
  status?: string;
  locationId?: string;
  supplierId?: string;
  itemId?: string;
  sourceType?: string;
  sourceId?: string;
  from?: string;
  to?: string;
}

interface QueryDefinition {
  model: Model<unknown>;
  entityName: string;
  locationFields: readonly string[];
  supplierField?: string;
  itemField?: string;
  dateField: string;
  accessAction:
    | 'CATALOG_READ'
    | 'STOCK_READ'
    | 'PROCURE'
    | 'RECEIVE'
    | 'TRANSFER'
    | 'ADJUST'
    | 'COUNT'
    | 'BATCH_MANAGE'
    | 'RETURN';
}

const definitions = {
  requisitions: {
    model: PurchaseRequisitionModel as Model<unknown>,
    entityName: 'Purchase requisition',
    locationFields: ['requestingLocationId'],
    dateField: 'createdAt',
    accessAction: 'PROCURE',
  },
  purchaseOrders: {
    model: PurchaseOrderModel as Model<unknown>,
    entityName: 'Purchase order',
    locationFields: ['deliveryLocationId'],
    supplierField: 'supplierId',
    dateField: 'orderedAt',
    accessAction: 'PROCURE',
  },
  goodsReceipts: {
    model: GoodsReceiptModel as Model<unknown>,
    entityName: 'Goods receipt',
    locationFields: ['receivingLocationId'],
    supplierField: 'supplierId',
    dateField: 'receivedAt',
    accessAction: 'RECEIVE',
  },
  supplierReturns: {
    model: SupplierReturnModel as Model<unknown>,
    entityName: 'Supplier return',
    locationFields: ['sourceLocationId'],
    supplierField: 'supplierId',
    dateField: 'createdAt',
    accessAction: 'RETURN',
  },
  transfers: {
    model: StockTransferModel as Model<unknown>,
    entityName: 'Stock transfer',
    locationFields: [
      'sourceLocationId',
      'destinationLocationId',
    ],
    dateField: 'createdAt',
    accessAction: 'TRANSFER',
  },
  reservations: {
    model: StockReservationModel as Model<unknown>,
    entityName: 'Stock reservation',
    locationFields: ['locationId'],
    dateField: 'createdAt',
    accessAction: 'STOCK_READ',
  },
  adjustments: {
    model: StockAdjustmentModel as Model<unknown>,
    entityName: 'Stock adjustment',
    locationFields: ['locationId'],
    dateField: 'createdAt',
    accessAction: 'ADJUST',
  },
  counts: {
    model: PhysicalStockCountModel as Model<unknown>,
    entityName: 'Physical stock count',
    locationFields: ['locationId'],
    dateField: 'createdAt',
    accessAction: 'COUNT',
  },
  recalls: {
    model: ProductRecallModel as Model<unknown>,
    entityName: 'Product recall',
    locationFields: [],
    dateField: 'createdAt',
    accessAction: 'BATCH_MANAGE',
  },
  movements: {
    model: StockMovementModel as Model<unknown>,
    entityName: 'Stock movement',
    locationFields: ['locationId'],
    itemField: 'itemId',
    dateField: 'occurredAt',
    accessAction: 'STOCK_READ',
  },
} as const satisfies Record<string, QueryDefinition>;

export type InventoryOperationalResource =
  keyof typeof definitions;

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
) {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages:
      totalItems === 0
        ? 0
        : Math.ceil(totalItems / pageSize),
  };
}

function requireAllowed(
  decision: Awaited<
    ReturnType<InventoryAccessPolicyPort['authorize']>
  >,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ??
        'Inventory operational query access was denied',
    );
  }
}

export class InventoryQueryService {
  public constructor(
    private readonly accessPolicy: InventoryAccessPolicyPort,
    private readonly context: InventoryContextPort,
  ) {}

  public async list(
    actor: InventoryActorContext,
    resource: InventoryOperationalResource,
    query: InventoryOperationalListQuery,
  ) {
    const definition: QueryDefinition = definitions[resource];

    requireAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: definition.accessAction,
      }),
    );

    if (query.locationId !== undefined) {
      await this.context.resolveOperationalLocation(
        actor,
        query.locationId,
      );
    }

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(
        actor.facilityId,
        'facilityId',
      ),
    };

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (
      query.locationId !== undefined &&
      definition.locationFields.length > 0
    ) {
      const locationId = toObjectId(
        query.locationId,
        'locationId',
      );

      if (definition.locationFields.length === 1) {
        filter[definition.locationFields[0]!] = locationId;
      } else {
        filter['$or'] = definition.locationFields.map(
          (field) => ({
            [field]: locationId,
          }),
        );
      }
    }

    if (
      query.supplierId !== undefined &&
      definition.supplierField !== undefined
    ) {
      filter[definition.supplierField] = toObjectId(
        query.supplierId,
        'supplierId',
      );
    }

    if (
      query.itemId !== undefined &&
      definition.itemField !== undefined
    ) {
      filter[definition.itemField] = toObjectId(
        query.itemId,
        'itemId',
      );
    }

    if (resource === 'movements') {
      if (query.sourceType !== undefined) {
        filter['sourceType'] = query.sourceType;
      }

      if (query.sourceId !== undefined) {
        filter['sourceId'] = toObjectId(
          query.sourceId,
          'sourceId',
        );
      }
    }

    if (
      query.from !== undefined ||
      query.to !== undefined
    ) {
      filter[definition.dateField] = {
        ...(query.from === undefined
          ? {}
          : {
              $gte: new Date(query.from),
            }),
        ...(query.to === undefined
          ? {}
          : {
              $lte: new Date(query.to),
            }),
      };
    }

    const page = Math.max(1, query.page);
    const pageSize = Math.max(
      1,
      Math.min(query.pageSize, 100),
    );
    const skip = (page - 1) * pageSize;

    const [items, totalItems] = await Promise.all([
      definition.model
        .find(filter)
        .sort({
          [definition.dateField]: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      definition.model.countDocuments(filter).exec(),
    ]);

    return pageResult(
      items,
      page,
      pageSize,
      totalItems,
    );
  }

  public async get(
    actor: InventoryActorContext,
    resource: InventoryOperationalResource,
    entityId: string,
  ) {
    const definition: QueryDefinition = definitions[resource];

    requireAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: definition.accessAction,
      }),
    );

    const record = await definition.model
      .findOne({
        _id: toObjectId(entityId, 'entityId'),
        facilityId: toObjectId(
          actor.facilityId,
          'facilityId',
        ),
      })
      .lean()
      .exec();

    if (record === null) {
      throw new ResourceNotFoundError(
        `${definition.entityName} was not found`,
      );
    }

    for (const field of definition.locationFields) {
      const value = (
        record as Record<string, unknown>
      )[field];

      if (
        value !== null &&
        typeof value === 'object' &&
        'toHexString' in value &&
        typeof value.toHexString === 'function'
      ) {
        await this.context.resolveOperationalLocation(
          actor,
          value.toHexString(),
        );
        break;
      }
    }

    return record;
  }
}