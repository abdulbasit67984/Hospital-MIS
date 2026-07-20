import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  StockReservationItemModel,
  StockReservationModel,
  StockTransferItemModel,
  StockTransferModel,
  StockMovementModel,
  stockMovementDirectionValues,
  stockMovementSourceTypeValues,
  stockMovementTypeValues,
  stockReservationItemStatusValues,
  stockReservationSourceTypeValues,
  stockReservationStatusValues,
  stockTransferItemStatusValues,
  stockTransferStatusValues,
  stockTransferTypeValues,
} from '../models/inventory-operational.model.js';

import {
  StockBalanceModel,
} from '../models/inventory-stock.model.js';

import type {
  Migration,
} from './types.js';

export const inventoryStockLedgerCollections = [
  'stockBalances',
  'stockMovements',
  'stockTransfers',
  'stockTransferItems',
  'stockReservations',
  'stockReservationItems',
] as const satisfies readonly HospitalCollectionName[];

type InventoryStockLedgerCollection =
  (typeof inventoryStockLedgerCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;

const nullableObjectId = {
  bsonType: [
    'objectId',
    'null',
  ],
} as const;

const string = {
  bsonType: 'string',
} as const;

const nullableString = {
  bsonType: [
    'string',
    'null',
  ],
} as const;

const date = {
  bsonType: 'date',
} as const;

const nullableDate = {
  bsonType: [
    'date',
    'null',
  ],
} as const;

const number = {
  bsonType: 'number',
} as const;

const boolean = {
  bsonType: 'bool',
} as const;

const decimal = {
  bsonType: 'decimal',
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const commonProperties = {
  facilityId: objectId,
  transactionId: string,
  correlationId: string,

  schemaVersion: {
    ...number,
    minimum: 1,
  },

  version: {
    ...number,
    minimum: 0,
  },

  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
  options: Readonly<{
    transactionIdField?: string;
  }> = {},
): Record<string, unknown> {
  const transactionIdField =
    options.transactionIdField ?? 'transactionId';

  const requiredCommon = commonRequired.map(
    (field) =>
      field === 'transactionId'
        ? transactionIdField
        : field,
  );

  const propertiesWithCommon = {
    ...properties,
    ...commonProperties,
  } as Record<string, unknown>;

  if (transactionIdField !== 'transactionId') {
    delete propertiesWithCommon['transactionId'];
    propertiesWithCommon[transactionIdField] = string;
  }

  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...required,
        ...requiredCommon,
      ],
      properties: {
        _id: objectId,
        ...propertiesWithCommon,
      },
    },
  };
}

const transferAllocation = {
  bsonType: 'object',
  required: [
    'allocatedStockQuantity',
    'dispatchedStockQuantity',
    'receivedStockQuantity',
    'discrepancyStockQuantity',
  ],
  properties: {
    _id: objectId,
    batchId: nullableObjectId,
    allocatedStockQuantity: decimal,
    dispatchedStockQuantity: decimal,
    receivedStockQuantity: decimal,
    discrepancyStockQuantity: decimal,
  },
} as const;

const reservationAllocation = {
  bsonType: 'object',
  required: [
    'reservedStockQuantity',
    'consumedStockQuantity',
    'releasedStockQuantity',
  ],
  properties: {
    _id: objectId,
    batchId: nullableObjectId,
    reservedStockQuantity: decimal,
    consumedStockQuantity: decimal,
    releasedStockQuantity: decimal,
  },
} as const;

export const inventoryStockLedgerValidators:
Readonly<
  Record<
    InventoryStockLedgerCollection,
    Record<string, unknown>
  >
> = {
  stockBalances: validator(
    [
      'storeLocationId',
      'itemId',
      'onHandQuantity',
      'availableQuantity',
      'reservedQuantity',
      'quarantinedQuantity',
      'damagedQuantity',
      'expiredQuantity',
      'inTransitQuantity',
      'negativeStockOverride',
      'lastLedgerSequence',
      'projectionTransactionId',
    ],
    {
      storeLocationId: objectId,
      itemId: objectId,
      batchId: nullableObjectId,
      onHandQuantity: decimal,
      availableQuantity: decimal,
      reservedQuantity: decimal,
      quarantinedQuantity: decimal,
      damagedQuantity: decimal,
      expiredQuantity: decimal,
      inTransitQuantity: decimal,
      negativeStockOverride: boolean,
      negativeStockOverrideReason: nullableString,
      negativeStockAuthorizedBy: nullableObjectId,
      lastMovementId: nullableObjectId,
      lastMovementAt: nullableDate,
      lastLedgerSequence: {
        ...number,
        minimum: 0,
      },
      lastReconciledAt: nullableDate,
      projectionTransactionId: string,
    },
    {
      transactionIdField: 'projectionTransactionId',
    },
  ),

  stockMovements: validator(
    [
      'movementNumber',
      'ledgerSequence',
      'itemId',
      'storeLocationId',
      'stockUnitId',
      'movementType',
      'direction',
      'quantity',
      'onHandDelta',
      'availableDelta',
      'reservedDelta',
      'quarantinedDelta',
      'damagedDelta',
      'expiredDelta',
      'inTransitDelta',
      'balanceVersionBefore',
      'balanceVersionAfter',
      'sourceType',
      'sourceId',
      'operationKey',
      'actorStaffId',
      'negativeStockOverride',
      'occurredAt',
    ],
    {
      movementNumber: string,
      ledgerSequence: {
        ...number,
        minimum: 1,
      },
      itemId: objectId,
      batchId: nullableObjectId,
      storeLocationId: objectId,
      stockUnitId: objectId,
      movementType: {
        bsonType: 'string',
        enum: [
          ...stockMovementTypeValues,
        ],
      },
      direction: {
        bsonType: 'string',
        enum: [
          ...stockMovementDirectionValues,
        ],
      },
      quantity: decimal,
      onHandDelta: decimal,
      availableDelta: decimal,
      reservedDelta: decimal,
      quarantinedDelta: decimal,
      damagedDelta: decimal,
      expiredDelta: decimal,
      inTransitDelta: decimal,
      balanceVersionBefore: {
        ...number,
        minimum: 0,
      },
      balanceVersionAfter: {
        ...number,
        minimum: 1,
      },
      sourceType: {
        bsonType: 'string',
        enum: [
          ...stockMovementSourceTypeValues,
        ],
      },
      sourceId: objectId,
      sourceLineId: nullableObjectId,
      reversalOfMovementId: nullableObjectId,
      operationKey: string,
      actorStaffId: objectId,
      unitCost: nullableDecimal,
      currency: nullableString,
      negativeStockOverride: boolean,
      negativeStockOverrideReason: nullableString,
      reason: nullableString,
      metadata: {},
      occurredAt: date,
    },
  ),

  stockTransfers: validator(
    [
      'transferNumber',
      'transferType',
      'sourceLocationId',
      'destinationLocationId',
      'requestedByStaffId',
      'reason',
      'status',
      'lineCount',
      'requestedAt',
    ],
    {
      transferNumber: string,
      transferType: {
        bsonType: 'string',
        enum: [
          ...stockTransferTypeValues,
        ],
      },
      sourceLocationId: objectId,
      destinationLocationId: objectId,
      requestedByStaffId: objectId,
      approvedByStaffId: nullableObjectId,
      rejectedByStaffId: nullableObjectId,
      dispatchedByStaffId: nullableObjectId,
      receivedByStaffId: nullableObjectId,
      cancelledByStaffId: nullableObjectId,
      reversedByStaffId: nullableObjectId,
      reservationId: nullableObjectId,
      reason: string,
      notes: nullableString,
      status: {
        bsonType: 'string',
        enum: [
          ...stockTransferStatusValues,
        ],
      },
      lineCount: {
        ...number,
        minimum: 1,
        maximum: 500,
      },
      requestedAt: date,
      approvedAt: nullableDate,
      rejectedAt: nullableDate,
      dispatchedAt: nullableDate,
      receivedAt: nullableDate,
      cancelledAt: nullableDate,
      reversedAt: nullableDate,
      decisionReason: nullableString,
      discrepancyReason: nullableString,
      cancellationReason: nullableString,
      reversalReason: nullableString,
      dispatchTransactionId: nullableString,
      receiptTransactionId: nullableString,
      reversalTransactionId: nullableString,
    },
  ),

  stockTransferItems: validator(
    [
      'stockTransferId',
      'lineNumber',
      'itemId',
      'stockUnitId',
      'requestedStockQuantity',
      'approvedStockQuantity',
      'dispatchedStockQuantity',
      'receivedStockQuantity',
      'discrepancyStockQuantity',
      'allocations',
      'status',
    ],
    {
      stockTransferId: objectId,
      lineNumber: {
        ...number,
        minimum: 1,
        maximum: 500,
      },
      itemId: objectId,
      stockUnitId: objectId,
      requestedStockQuantity: decimal,
      approvedStockQuantity: decimal,
      dispatchedStockQuantity: decimal,
      receivedStockQuantity: decimal,
      discrepancyStockQuantity: decimal,
      allocations: {
        bsonType: 'array',
        items: transferAllocation,
      },
      status: {
        bsonType: 'string',
        enum: [
          ...stockTransferItemStatusValues,
        ],
      },
      notes: nullableString,
    },
  ),

  stockReservations: validator(
    [
      'reservationNumber',
      'sourceType',
      'sourceId',
      'locationId',
      'reservedByStaffId',
      'status',
      'lineCount',
      'reservedAt',
      'expiresAt',
    ],
    {
      reservationNumber: string,
      sourceType: {
        bsonType: 'string',
        enum: [
          ...stockReservationSourceTypeValues,
        ],
      },
      sourceId: objectId,
      sourceLineId: nullableObjectId,
      locationId: objectId,
      patientId: nullableObjectId,
      reservedByStaffId: objectId,
      consumedByStaffId: nullableObjectId,
      releasedByStaffId: nullableObjectId,
      reversedByStaffId: nullableObjectId,
      status: {
        bsonType: 'string',
        enum: [
          ...stockReservationStatusValues,
        ],
      },
      lineCount: {
        ...number,
        minimum: 1,
        maximum: 500,
      },
      reservedAt: date,
      expiresAt: date,
      consumedAt: nullableDate,
      releasedAt: nullableDate,
      reversedAt: nullableDate,
      releaseReason: nullableString,
      reversalReason: nullableString,
      consumptionSourceId: nullableObjectId,
    },
  ),

  stockReservationItems: validator(
    [
      'stockReservationId',
      'lineNumber',
      'itemId',
      'stockUnitId',
      'requestedStockQuantity',
      'reservedStockQuantity',
      'consumedStockQuantity',
      'releasedStockQuantity',
      'allocations',
      'status',
    ],
    {
      stockReservationId: objectId,
      lineNumber: {
        ...number,
        minimum: 1,
        maximum: 500,
      },
      itemId: objectId,
      stockUnitId: objectId,
      requestedStockQuantity: decimal,
      reservedStockQuantity: decimal,
      consumedStockQuantity: decimal,
      releasedStockQuantity: decimal,
      allocations: {
        bsonType: 'array',
        items: reservationAllocation,
      },
      status: {
        bsonType: 'string',
        enum: [
          ...stockReservationItemStatusValues,
        ],
      },
    },
  ),
};

const models = {
  stockBalances: StockBalanceModel,
  stockMovements: StockMovementModel,
  stockTransfers: StockTransferModel,
  stockTransferItems: StockTransferItemModel,
  stockReservations: StockReservationModel,
  stockReservationItems: StockReservationItemModel,
} as const;

async function ensureCollection(
  database: Db,
  name: InventoryStockLedgerCollection,
): Promise<void> {
  const exists = (
    await database
      .listCollections(
        {
          name,
        },
        {
          nameOnly: true,
        },
      )
      .toArray()
  ).length > 0;

  const collectionValidator =
    inventoryStockLedgerValidators[name];

  if (exists) {
    await database.command({
      collMod: name,
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(
      name,
      {
        validator: collectionValidator,
        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  }

  const collection = database.collection(name);
  const existingIndexes = await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const inventoryStockLedgerOperations:
Migration = {
  id: '026-inventory-stock-ledger-operations',

  description:
    'Create the immutable stock ledger, reconciled balance projection, transfer workflows, and expiring stock reservations',

  async up(database) {
    for (
      const collectionName of
      inventoryStockLedgerCollections
    ) {
      const spec = collectionSpecs.find(
        (candidate) =>
          candidate.name === collectionName,
      );

      const requiredRetention =
        collectionName === 'stockMovements'
          ? 'immutable'
          : 'standard';

      if (
        spec === undefined ||
        spec.domain !== 'inventory' ||
        !spec.facilityScoped ||
        spec.retention !== requiredRetention
      ) {
        throw new Error(
          `${collectionName} has an invalid inventory stock-ledger collection specification`,
        );
      }

      await ensureCollection(
        database,
        collectionName,
      );
    }
  },
};