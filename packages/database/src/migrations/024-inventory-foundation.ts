import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  InventoryCategoryModel,
  InventoryItemModel,
} from '../models/inventory-catalog.model.js';

import {
  StoreLocationModel,
} from '../models/inventory-location.model.js';

import {
  InventoryBatchModel,
  StockBalanceModel,
} from '../models/inventory-stock.model.js';

import {
  inventoryBatchInspectionStatusValues,
  inventoryBatchStatusValues,
  inventoryCatalogStatusValues,
  inventoryCategoryTypeValues,
  inventoryItemTypeValues,
  inventoryLocationTypeValues,
  inventoryRecallStatusValues,
  inventoryStorageConditionValues,
  inventoryUnitPurposeValues,
  inventoryValuationMethodValues,
  supplierAddressTypeValues,
  supplierContactTypeValues,
  supplierStatusValues,
} from '../models/inventory.types.js';

import {
  SupplierModel,
} from '../models/supplier.model.js';

import type {
  Migration,
} from './types.js';

export const inventoryFoundationCollections = [
  'inventoryCategories',
  'inventoryItems',
  'suppliers',
  'storeLocations',
  'inventoryBatches',
  'stockBalances',
] as const satisfies readonly HospitalCollectionName[];

type InventoryFoundationCollection =
  (typeof inventoryFoundationCollections)[number];

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

const nullableNumber = {
  bsonType: [
    'number',
    'null',
  ],
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

const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;

const stringArray = {
  bsonType: 'array',
  items: string,
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

const lifecycleProperties = {
  status: {
    bsonType: 'string',
    enum: [
      ...inventoryCatalogStatusValues,
    ],
  },
  activatedAt: date,
  activatedBy: objectId,
  deactivatedAt: nullableDate,
  deactivatedBy: nullableObjectId,
  deactivationReason: nullableString,
} as const;

const lifecycleRequired = [
  'status',
  'activatedAt',
  'activatedBy',
] as const;

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
  options: {
    requireTransactionId?: boolean;
  } = {},
): Record<string, unknown> {
  const requiredCommonFields =
    options.requireTransactionId === false
      ? commonRequired.filter(
          (field) =>
            field !== 'transactionId',
        )
      : commonRequired;

  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...required,
        ...requiredCommonFields,
      ],
      properties: {
        _id: objectId,
        ...properties,
        ...commonProperties,
      },
    },
  };
}

const unitConversion = {
  bsonType: 'object',
  required: [
    'unitId',
    'purpose',
    'toStockUnitFactor',
    'isDefault',
  ],
  properties: {
    unitId: objectId,
    purpose: {
      bsonType: 'string',
      enum: [
        ...inventoryUnitPurposeValues,
      ],
    },
    toStockUnitFactor: decimal,
    isDefault: boolean,
  },
} as const;

const supplierCatalogueEntry = {
  bsonType: 'object',
  required: [
    'supplierId',
    'supplierItemCode',
    'purchaseUnitId',
    'purchaseUnitToStockFactor',
    'minimumOrderQuantity',
    'currency',
    'preferred',
    'active',
  ],
  properties: {
    supplierId: objectId,
    supplierItemCode: string,
    supplierItemName: nullableString,
    purchaseUnitId: objectId,
    purchaseUnitToStockFactor: decimal,
    minimumOrderQuantity: decimal,
    lastQuotedUnitCost: nullableDecimal,
    currency: string,
    leadTimeDays: nullableNumber,
    preferred: boolean,
    active: boolean,
  },
} as const;

const supplierContact = {
  bsonType: 'object',
  required: [
    'contactType',
    'name',
    'primary',
    'active',
  ],
  properties: {
    contactType: {
      bsonType: 'string',
      enum: [
        ...supplierContactTypeValues,
      ],
    },
    name: string,
    designation: nullableString,
    phone: nullableString,
    email: nullableString,
    primary: boolean,
    active: boolean,
  },
} as const;

const supplierAddress = {
  bsonType: 'object',
  required: [
    'addressType',
    'line1',
    'city',
    'countryCode',
    'primary',
    'active',
  ],
  properties: {
    addressType: {
      bsonType: 'string',
      enum: [
        ...supplierAddressTypeValues,
      ],
    },
    line1: string,
    line2: nullableString,
    city: string,
    district: nullableString,
    province: nullableString,
    postalCode: nullableString,
    countryCode: string,
    primary: boolean,
    active: boolean,
  },
} as const;

export const inventoryFoundationValidators:
  Readonly<
    Record<
      InventoryFoundationCollection,
      Record<string, unknown>
    >
  > = {
    inventoryCategories: validator(
      [
        'categoryCode',
        'name',
        'normalizedName',
        'categoryType',
        'ancestorCategoryIds',
        'hierarchyDepth',
        'displayOrder',
        ...lifecycleRequired,
      ],
      {
        categoryCode: string,
        name: string,
        normalizedName: string,
        categoryType: {
          bsonType: 'string',
          enum: [
            ...inventoryCategoryTypeValues,
          ],
        },
        parentCategoryId:
          nullableObjectId,
        ancestorCategoryIds:
          objectIdArray,
        hierarchyDepth: number,
        description: nullableString,
        displayOrder: number,
        ...lifecycleProperties,
      },
    ),

    inventoryItems: validator(
      [
        'itemCode',
        'name',
        'normalizedName',
        'itemType',
        'categoryId',
        'stockUnitId',
        'purchaseUnitId',
        'purchaseUnitToStockFactor',
        'issueUnitId',
        'issueUnitToStockFactor',
        'unitConversions',
        'allowFractionalStock',
        'batchTrackingRequired',
        'expiryTrackingRequired',
        'storageConditions',
        'reorderLevel',
        'minimumStockLevel',
        'safetyStockLevel',
        'nearExpiryWarningDays',
        'negativeStockAllowed',
        'controlledMedicine',
        'highAlert',
        'highValue',
        'valuationMethod',
        'preferredSupplierIds',
        'supplierCatalogueEntries',
        'searchText',
        ...lifecycleRequired,
      ],
      {
        itemCode: string,
        name: string,
        normalizedName: string,
        itemType: {
          bsonType: 'string',
          enum: [
            ...inventoryItemTypeValues,
          ],
        },
        categoryId: objectId,
        formularyItemId:
          nullableObjectId,
        barcode: nullableString,
        manufacturerName:
          nullableString,
        description: nullableString,
        stockUnitId: objectId,
        purchaseUnitId: objectId,
        purchaseUnitToStockFactor:
          decimal,
        issueUnitId: objectId,
        issueUnitToStockFactor:
          decimal,
        unitConversions: {
          bsonType: 'array',
          items: unitConversion,
        },
        allowFractionalStock:
          boolean,
        batchTrackingRequired:
          boolean,
        expiryTrackingRequired:
          boolean,
        storageConditions: {
          ...stringArray,
          items: {
            bsonType: 'string',
            enum: [
              ...inventoryStorageConditionValues,
            ],
          },
        },
        minimumStorageTemperatureCelsius:
          nullableDecimal,
        maximumStorageTemperatureCelsius:
          nullableDecimal,
        reorderLevel: decimal,
        minimumStockLevel: decimal,
        maximumStockLevel:
          nullableDecimal,
        safetyStockLevel: decimal,
        nearExpiryWarningDays:
          number,
        negativeStockAllowed:
          boolean,
        controlledMedicine: boolean,
        highAlert: boolean,
        highValue: boolean,
        valuationMethod: {
          bsonType: 'string',
          enum: [
            ...inventoryValuationMethodValues,
          ],
        },
        preferredSupplierIds:
          objectIdArray,
        supplierCatalogueEntries: {
          bsonType: 'array',
          items:
            supplierCatalogueEntry,
        },
        searchText: string,
        ...lifecycleProperties,
      },
    ),

    suppliers: validator(
      [
        'supplierCode',
        'legalName',
        'normalizedLegalName',
        'contacts',
        'addresses',
        'defaultCurrency',
        'paymentTermsDays',
        'standardLeadTimeDays',
        'status',
        'activatedAt',
        'activatedBy',
      ],
      {
        supplierCode: string,
        legalName: string,
        normalizedLegalName:
          string,
        tradingName: nullableString,
        registrationNumber:
          nullableString,
        taxRegistrationNumber:
          nullableString,
        salesTaxRegistrationNumber:
          nullableString,
        drugSaleLicenseNumber:
          nullableString,
        contacts: {
          bsonType: 'array',
          items: supplierContact,
        },
        addresses: {
          bsonType: 'array',
          items: supplierAddress,
        },
        defaultCurrency: string,
        paymentTermsDays: number,
        standardLeadTimeDays:
          number,
        notes: nullableString,
        status: {
          bsonType: 'string',
          enum: [
            ...supplierStatusValues,
          ],
        },
        activatedAt: date,
        activatedBy: objectId,
        suspendedAt: nullableDate,
        suspendedBy:
          nullableObjectId,
        suspensionReason:
          nullableString,
        deactivatedAt: nullableDate,
        deactivatedBy:
          nullableObjectId,
        deactivationReason:
          nullableString,
      },
    ),

    storeLocations: validator(
      [
        'locationCode',
        'name',
        'normalizedName',
        'locationType',
        'ancestorLocationIds',
        'hierarchyDepth',
        'storageConditions',
        'supportsDispensing',
        'allowsControlledMedicine',
        'allowsGeneralStock',
        'stockOwnershipCode',
        'displayOrder',
        ...lifecycleRequired,
      ],
      {
        locationCode: string,
        name: string,
        normalizedName: string,
        locationType: {
          bsonType: 'string',
          enum: [
            ...inventoryLocationTypeValues,
          ],
        },
        parentLocationId:
          nullableObjectId,
        ancestorLocationIds:
          objectIdArray,
        hierarchyDepth: number,
        departmentId:
          nullableObjectId,
        wardId: nullableObjectId,
        servicePointId:
          nullableObjectId,
        managerStaffId:
          nullableObjectId,
        storageConditions: {
          ...stringArray,
          items: {
            bsonType: 'string',
            enum: [
              ...inventoryStorageConditionValues,
            ],
          },
        },
        supportsDispensing: boolean,
        allowsControlledMedicine:
          boolean,
        allowsGeneralStock: boolean,
        stockOwnershipCode: string,
        physicalAddress:
          nullableString,
        contactPhone: nullableString,
        displayOrder: number,
        ...lifecycleProperties,
      },
    ),

    inventoryBatches: validator(
      [
        'itemId',
        'batchNumber',
        'manufacturerBatchNumber',
        'normalizedBatchNumber',
        'costPrice',
        'sellingPrice',
        'currency',
        'inspectionStatus',
        'status',
        'recallStatus',
      ],
      {
        itemId: objectId,
        supplierId:
          nullableObjectId,
        batchNumber: string,
        manufacturerName:
          nullableString,
        manufacturerBatchNumber:
          string,
        normalizedBatchNumber:
          string,
        manufactureDate:
          nullableDate,
        expiryDate: nullableDate,
        costPrice: decimal,
        sellingPrice: decimal,
        currency: string,
        goodsReceiptId:
          nullableObjectId,
        goodsReceiptItemId:
          nullableObjectId,
        inspectionStatus: {
          bsonType: 'string',
          enum: [
            ...inventoryBatchInspectionStatusValues,
          ],
        },
        status: {
          bsonType: 'string',
          enum: [
            ...inventoryBatchStatusValues,
          ],
        },
        quarantineAt: nullableDate,
        quarantinedBy:
          nullableObjectId,
        quarantineReason:
          nullableString,
        releasedFromQuarantineAt:
          nullableDate,
        releasedFromQuarantineBy:
          nullableObjectId,
        quarantineReleaseReason:
          nullableString,
        recallStatus: {
          bsonType: 'string',
          enum: [
            ...inventoryRecallStatusValues,
          ],
        },
        recallReference:
          nullableString,
        recalledAt: nullableDate,
        recalledBy: nullableObjectId,
        recallReason: nullableString,
        blockedAt: nullableDate,
        blockedBy: nullableObjectId,
        blockedReason: nullableString,
        enteredInErrorAt:
          nullableDate,
        enteredInErrorBy:
          nullableObjectId,
        enteredInErrorReason:
          nullableString,
      },
    ),

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
        quarantinedQuantity:
          decimal,
        damagedQuantity: decimal,
        expiredQuantity: decimal,
        inTransitQuantity: decimal,
        lastMovementId:
          nullableObjectId,
        lastMovementAt: nullableDate,
        lastLedgerSequence: number,
        lastReconciledAt:
          nullableDate,
        projectionTransactionId:
          string,
      },
      {
        requireTransactionId: false,
      },
    ),
  };

const models = {
  inventoryCategories:
    InventoryCategoryModel,
  inventoryItems: InventoryItemModel,
  suppliers: SupplierModel,
  storeLocations: StoreLocationModel,
  inventoryBatches:
    InventoryBatchModel,
  stockBalances: StockBalanceModel,
} as const;

async function ensureCollection(
  database: Db,
  name: InventoryFoundationCollection,
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
    inventoryFoundationValidators[name];

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
        validator:
          collectionValidator,
        validationLevel: 'strict',
        validationAction: 'error',
      },
    );
  }

  const collection =
    database.collection(name);
  const existingIndexes =
    await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(
        index.name,
      );
    }
  }

  const indexes =
    models[name].schema.indexes() as
      IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(
      indexes,
    );
  }
}

export const inventoryFoundation:
  Migration = {
    id: '024-inventory-foundation',

    description:
      'Create facility-isolated inventory categories, items, units linkage, suppliers, location hierarchy, batch traceability, and reconciled stock-balance projections',

    async up(database) {
      for (
        const collectionName of
        inventoryFoundationCollections
      ) {
        const spec =
          collectionSpecs.find(
            (candidate) =>
              candidate.name ===
              collectionName,
          );

        if (
          spec === undefined ||
          spec.domain !== 'inventory' ||
          !spec.facilityScoped ||
          spec.retention !== 'standard'
        ) {
          throw new Error(
            `${collectionName} must be cataloged as facility-scoped standard inventory data`,
          );
        }

        await ensureCollection(
          database,
          collectionName,
        );
      }
    },
  };