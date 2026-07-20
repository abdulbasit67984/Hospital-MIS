import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  PhysicalStockCountItemModel,
  PhysicalStockCountModel,
  ProductRecallItemModel,
  ProductRecallModel,
  ReorderRuleModel,
  StockAdjustmentModel,
  inventoryQuantityBucketValues,
  physicalStockCountItemStatusValues,
  physicalStockCountScopeValues,
  physicalStockCountStatusValues,
  productRecallActionValues,
  productRecallItemStatusValues,
  productRecallStatusValues,
  stockAdjustmentDirectionValues,
  stockAdjustmentStatusValues,
  stockAdjustmentTypeValues,
} from '../models/inventory-control.model.js';

import type {
  Migration,
} from './types.js';

export const inventoryControlsMonitoringCollections = [
  'stockAdjustments',
  'physicalStockCounts',
  'physicalStockCountItems',
  'productRecalls',
  'productRecallItems',
  'reorderRules',
] as const satisfies readonly HospitalCollectionName[];

type ControlCollection =
  (typeof inventoryControlsMonitoringCollections)[number];

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

const decimal = {
  bsonType: 'decimal',
} as const;

const nullableDecimal = {
  bsonType: [
    'decimal',
    'null',
  ],
} as const;

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
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
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...required,
        ...commonRequired,
      ],
      properties: {
        _id: objectId,
        ...properties,
        ...commonProperties,
      },
    },
  };
}

const adjustmentLine = {
  bsonType: 'object',
  required: [
    'lineNumber',
    'itemId',
    'stockUnitId',
    'bucket',
    'direction',
    'quantity',
    'onHandDelta',
    'availableDelta',
    'reservedDelta',
    'quarantinedDelta',
    'damagedDelta',
    'expiredDelta',
    'reasonCode',
  ],
  properties: {
    _id: objectId,
    lineNumber: number,
    itemId: objectId,
    batchId: nullableObjectId,
    stockUnitId: objectId,

    bucket: {
      bsonType: 'string',
      enum: [
        ...inventoryQuantityBucketValues,
      ],
    },

    direction: {
      bsonType: 'string',
      enum: [
        ...stockAdjustmentDirectionValues,
      ],
    },

    quantity: decimal,
    onHandDelta: decimal,
    availableDelta: decimal,
    reservedDelta: decimal,
    quarantinedDelta: decimal,
    damagedDelta: decimal,
    expiredDelta: decimal,
    unitCost: nullableDecimal,
    currency: nullableString,
    reasonCode: string,
    notes: nullableString,
  },
} as const;

export const inventoryControlsMonitoringValidators:
Readonly<Record<ControlCollection, Record<string, unknown>>> = {
  stockAdjustments: validator(
    [
      'adjustmentNumber',
      'locationId',
      'adjustmentType',
      'requestedByStaffId',
      'reason',
      'status',
      'lineCount',
      'totalAbsoluteStockQuantity',
      'lines',
      'sourceType',
      'attachmentIds',
    ],
    {
      adjustmentNumber: string,
      locationId: objectId,

      adjustmentType: {
        bsonType: 'string',
        enum: [
          ...stockAdjustmentTypeValues,
        ],
      },

      requestedByStaffId: objectId,
      approvedByStaffId: nullableObjectId,
      postedByStaffId: nullableObjectId,
      rejectedByStaffId: nullableObjectId,
      cancelledByStaffId: nullableObjectId,
      reversedByStaffId: nullableObjectId,
      reason: string,

      status: {
        bsonType: 'string',
        enum: [
          ...stockAdjustmentStatusValues,
        ],
      },

      lineCount: number,
      totalAbsoluteStockQuantity: decimal,

      lines: {
        bsonType: 'array',
        items: adjustmentLine,
      },

      submittedAt: nullableDate,
      approvedAt: nullableDate,
      postedAt: nullableDate,
      rejectedAt: nullableDate,
      cancelledAt: nullableDate,
      reversedAt: nullableDate,
      decisionReason: nullableString,
      reversalReason: nullableString,
      sourceType: string,
      sourceId: nullableObjectId,
      stockPostingTransactionId: nullableString,
      reversalTransactionId: nullableString,
      attachmentIds: objectIdArray,
    },
  ),

  physicalStockCounts: validator(
    [
      'countNumber',
      'locationId',
      'scope',
      'requestedByStaffId',
      'reason',
      'status',
      'snapshotAt',
      'snapshotLedgerSequence',
      'lineCount',
      'countedLineCount',
      'varianceLineCount',
      'expectedTotalQuantity',
      'attachmentIds',
    ],
    {
      countNumber: string,
      locationId: objectId,

      scope: {
        bsonType: 'string',
        enum: [
          ...physicalStockCountScopeValues,
        ],
      },

      categoryId: nullableObjectId,
      requestedByStaffId: objectId,
      assignedToStaffId: nullableObjectId,
      submittedByStaffId: nullableObjectId,
      approvedByStaffId: nullableObjectId,
      rejectedByStaffId: nullableObjectId,
      cancelledByStaffId: nullableObjectId,
      postedByStaffId: nullableObjectId,
      reason: string,

      status: {
        bsonType: 'string',
        enum: [
          ...physicalStockCountStatusValues,
        ],
      },

      snapshotAt: date,
      snapshotLedgerSequence: number,
      lineCount: number,
      countedLineCount: number,
      varianceLineCount: number,
      expectedTotalQuantity: decimal,
      actualTotalQuantity: nullableDecimal,
      absoluteVarianceQuantity: nullableDecimal,
      startedAt: nullableDate,
      submittedAt: nullableDate,
      approvedAt: nullableDate,
      rejectedAt: nullableDate,
      cancelledAt: nullableDate,
      postedAt: nullableDate,
      decisionReason: nullableString,
      generatedAdjustmentId: nullableObjectId,
      attachmentIds: objectIdArray,
    },
  ),

  physicalStockCountItems: validator(
    [
      'physicalStockCountId',
      'lineNumber',
      'itemId',
      'stockUnitId',
      'bucket',
      'expectedQuantity',
      'status',
    ],
    {
      physicalStockCountId: objectId,
      lineNumber: number,
      itemId: objectId,
      batchId: nullableObjectId,
      stockUnitId: objectId,

      bucket: {
        bsonType: 'string',
        enum: [
          ...inventoryQuantityBucketValues,
        ],
      },

      expectedQuantity: decimal,
      actualQuantity: nullableDecimal,
      varianceQuantity: nullableDecimal,

      status: {
        bsonType: 'string',
        enum: [
          ...physicalStockCountItemStatusValues,
        ],
      },

      countedAt: nullableDate,
      countedByStaffId: nullableObjectId,
      notes: nullableString,
    },
  ),

  productRecalls: validator(
    [
      'recallNumber',
      'externalReference',
      'title',
      'reason',
      'action',
      'initiatedByStaffId',
      'status',
      'lineCount',
      'affectedBatchCount',
      'affectedStockQuantity',
      'attachmentIds',
    ],
    {
      recallNumber: string,
      externalReference: string,
      title: string,
      reason: string,

      action: {
        bsonType: 'string',
        enum: [
          ...productRecallActionValues,
        ],
      },

      initiatedByStaffId: objectId,
      activatedByStaffId: nullableObjectId,
      closedByStaffId: nullableObjectId,
      cancelledByStaffId: nullableObjectId,

      status: {
        bsonType: 'string',
        enum: [
          ...productRecallStatusValues,
        ],
      },

      lineCount: number,
      affectedBatchCount: number,
      affectedStockQuantity: decimal,
      activatedAt: nullableDate,
      closedAt: nullableDate,
      cancelledAt: nullableDate,
      closeReason: nullableString,
      attachmentIds: objectIdArray,
    },
  ),

  productRecallItems: validator(
    [
      'productRecallId',
      'lineNumber',
      'itemId',
      'batchId',
      'status',
      'affectedOnHandQuantity',
      'quarantinedQuantity',
    ],
    {
      productRecallId: objectId,
      lineNumber: number,
      itemId: objectId,
      batchId: objectId,

      status: {
        bsonType: 'string',
        enum: [
          ...productRecallItemStatusValues,
        ],
      },

      affectedOnHandQuantity: decimal,
      quarantinedQuantity: decimal,
      actionedAt: nullableDate,
      actionedByStaffId: nullableObjectId,
      notes: nullableString,
    },
  ),

  reorderRules: validator(
    [
      'locationId',
      'itemId',
      'minimumStockLevel',
      'reorderLevel',
      'safetyStockLevel',
      'criticalStockLevel',
      'active',
    ],
    {
      locationId: objectId,
      itemId: objectId,
      minimumStockLevel: decimal,
      reorderLevel: decimal,
      maximumStockLevel: nullableDecimal,
      safetyStockLevel: decimal,
      criticalStockLevel: decimal,
      preferredSupplierId: nullableObjectId,

      active: {
        bsonType: 'bool',
      },

      notes: nullableString,
    },
  ),
};

const models = {
  stockAdjustments: StockAdjustmentModel,
  physicalStockCounts: PhysicalStockCountModel,
  physicalStockCountItems: PhysicalStockCountItemModel,
  productRecalls: ProductRecallModel,
  productRecallItems: ProductRecallItemModel,
  reorderRules: ReorderRuleModel,
} as const;

async function ensureCollection(
  database: Db,
  name: ControlCollection,
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
    inventoryControlsMonitoringValidators[name];

  if (exists) {
    await database.command({
      collMod: name,
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(name, {
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
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

export const inventoryControlsMonitoring: Migration = {
  id: '027-inventory-controls-monitoring',

  description:
    'Create stock adjustments, physical counts, product recalls, and location-specific reorder monitoring',

  async up(database) {
    for (const collectionName of inventoryControlsMonitoringCollections) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === collectionName,
      );

      if (
        spec === undefined ||
        spec.domain !== 'inventory' ||
        !spec.facilityScoped ||
        spec.retention !== 'standard'
      ) {
        throw new Error(
          `${collectionName} has an invalid inventory collection specification`,
        );
      }

      await ensureCollection(database, collectionName);
    }
  },
};