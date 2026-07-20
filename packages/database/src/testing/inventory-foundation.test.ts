import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  InventoryCategoryModel,
  InventoryItemModel,
  inventoryCategorySchema,
  inventoryItemSchema,
} from '../models/inventory-catalog.model.js';

import {
  StoreLocationModel,
  storeLocationSchema,
} from '../models/inventory-location.model.js';

import {
  InventoryBatchModel,
  StockBalanceModel,
  inventoryBatchSchema,
  stockBalanceSchema,
} from '../models/inventory-stock.model.js';

import {
  nursingAssessmentSchema,
} from '../models/nursing-medication.model.js';

import {
  schemaForCollection,
} from '../models/registry.js';

import {
  SupplierModel,
  supplierSchema,
} from '../models/supplier.model.js';

import {
  unitOfMeasureSchema,
} from '../models/medicine-catalog.model.js';

import {
  inventoryFoundation,
  inventoryFoundationCollections,
  inventoryFoundationValidators,
} from '../migrations/024-inventory-foundation.js';

import {
  nursingMedicationFoundation,
} from '../migrations/023-nursing-medication-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();

  return {
    facilityId: objectId(),
    transactionId:
      `tx-${objectId().toHexString()}`,
    correlationId:
      `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function lifecycleFields() {
  const actorId = objectId();

  return {
    status: 'ACTIVE' as const,
    activatedAt: new Date(),
    activatedBy: actorId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function indexNames(
  schema: mongoose.Schema,
): string[] {
  return schema.indexes().flatMap(
    ([, options]) =>
      typeof options.name === 'string'
        ? [options.name]
        : [],
  );
}

describe(
  'inventory procurement and stock-control foundation',
  () => {
    it(
      'registers migration 024 after the nursing-medication foundation',
      () => {
        expect(
          inventoryFoundation.id,
        ).toBe(
          '024-inventory-foundation',
        );
        expect(
          migrations.at(-2),
        ).toBe(
          nursingMedicationFoundation,
        );
        expect(
          migrations.at(-1),
        ).toBe(
          inventoryFoundation,
        );
        expect(
          migrations.slice(-3).map(
            (migration) => migration.id,
          ),
        ).toEqual([
          '022-inpatient-discharge',
          '023-nursing-medication-foundation',
          '024-inventory-foundation',
        ]);
      },
    );

    it(
      'provides strict facility-scoped validators for every inventory foundation collection',
      () => {
        expect(
          Object.keys(
            inventoryFoundationValidators,
          ).sort(),
        ).toEqual(
          [
            ...inventoryFoundationCollections,
          ].sort(),
        );

        for (
          const collectionName of
          inventoryFoundationCollections
        ) {
          const validator =
            inventoryFoundationValidators[
              collectionName
            ];

          expect(validator).toHaveProperty(
            '$jsonSchema.bsonType',
            'object',
          );
          expect(validator).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );
          expect(validator).toHaveProperty(
            '$jsonSchema.properties.version.minimum',
            0,
          );
        }
      },
    );

    it(
      'reuses the formulary unit-of-measure collection and registers normalized inventory schemas',
      () => {
        expect(
          inventoryFoundationCollections,
        ).not.toContain(
          'unitsOfMeasure',
        );
        expect(
          schemaForCollection(
            'unitsOfMeasure',
          ),
        ).toBe(unitOfMeasureSchema);
        expect(
          schemaForCollection(
            'inventoryCategories',
          ),
        ).toBe(inventoryCategorySchema);
        expect(
          schemaForCollection(
            'inventoryItems',
          ),
        ).toBe(inventoryItemSchema);
        expect(
          schemaForCollection(
            'suppliers',
          ),
        ).toBe(supplierSchema);
        expect(
          schemaForCollection(
            'storeLocations',
          ),
        ).toBe(storeLocationSchema);
        expect(
          schemaForCollection(
            'inventoryBatches',
          ),
        ).toBe(inventoryBatchSchema);
        expect(
          schemaForCollection(
            'stockBalances',
          ),
        ).toBe(stockBalanceSchema);
        expect(
          schemaForCollection(
            'nursingAssessments',
          ),
        ).toBe(nursingAssessmentSchema);
      },
    );

    it(
      'defines facility-safe master-data, FEFO, and balance indexes',
      () => {
        expect(
          indexNames(
            InventoryCategoryModel.schema,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_inventory_categories_facility_code',
            'ix_inventory_categories_hierarchy',
          ]),
        );
        expect(
          indexNames(
            InventoryItemModel.schema,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_inventory_items_facility_code',
            'uq_inventory_items_active_formulary_link',
            'ix_inventory_items_preferred_suppliers',
          ]),
        );
        expect(
          indexNames(
            StoreLocationModel.schema,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_store_locations_facility_code',
            'ix_store_locations_hierarchy',
          ]),
        );
        expect(
          indexNames(
            SupplierModel.schema,
          ),
        ).toContain(
          'uq_suppliers_facility_code',
        );
        expect(
          indexNames(
            InventoryBatchModel.schema,
          ),
        ).toContain(
          'ix_inventory_batches_fefo',
        );
        expect(
          indexNames(
            StockBalanceModel.schema,
          ),
        ).toContain(
          'uq_stock_balances_location_item_batch',
        );
      },
    );

    it(
      'requires medication inventory items to link to the formulary',
      async () => {
        const unitId = objectId();
        const item =
          new InventoryItemModel({
            ...commonFields(),
            ...lifecycleFields(),
            itemCode: 'med-001',
            name: 'Paracetamol tablets',
            normalizedName: 'placeholder',
            itemType: 'MEDICATION',
            categoryId: objectId(),
            formularyItemId: null,
            barcode: null,
            manufacturerName: null,
            description: null,
            stockUnitId: unitId,
            purchaseUnitId: unitId,
            purchaseUnitToStockFactor:
              '1',
            issueUnitId: unitId,
            issueUnitToStockFactor:
              '1',
            unitConversions: [],
            allowFractionalStock:
              false,
            batchTrackingRequired:
              true,
            expiryTrackingRequired:
              true,
            storageConditions: [
              'AMBIENT',
            ],
            minimumStorageTemperatureCelsius:
              null,
            maximumStorageTemperatureCelsius:
              null,
            reorderLevel: '50',
            minimumStockLevel: '25',
            maximumStockLevel: '500',
            safetyStockLevel: '10',
            nearExpiryWarningDays: 90,
            negativeStockAllowed:
              false,
            controlledMedicine:
              false,
            highAlert: false,
            highValue: false,
            valuationMethod:
              'BATCH_COST',
            preferredSupplierIds: [],
            supplierCatalogueEntries: [],
            searchText: 'placeholder',
          });

        await expect(
          item.validate(),
        ).rejects.toThrow(
          /formulary-item link/iu,
        );
      },
    );

    it(
      'enforces unit conversions and stock-threshold ordering',
      async () => {
        const unitId = objectId();
        const item =
          new InventoryItemModel({
            ...commonFields(),
            ...lifecycleFields(),
            itemCode: 'supply-001',
            name: 'Sterile gloves',
            normalizedName: 'placeholder',
            itemType:
              'NON_MEDICATION',
            categoryId: objectId(),
            formularyItemId: null,
            barcode: null,
            manufacturerName: null,
            description: null,
            stockUnitId: unitId,
            purchaseUnitId: unitId,
            purchaseUnitToStockFactor:
              '0',
            issueUnitId: unitId,
            issueUnitToStockFactor:
              '1',
            unitConversions: [],
            allowFractionalStock:
              false,
            batchTrackingRequired:
              false,
            expiryTrackingRequired:
              false,
            storageConditions: [
              'AMBIENT',
            ],
            minimumStorageTemperatureCelsius:
              null,
            maximumStorageTemperatureCelsius:
              null,
            reorderLevel: '20',
            minimumStockLevel: '10',
            maximumStockLevel: '15',
            safetyStockLevel: '11',
            nearExpiryWarningDays: 0,
            negativeStockAllowed:
              false,
            controlledMedicine:
              false,
            highAlert: false,
            highValue: false,
            valuationMethod:
              'BATCH_COST',
            preferredSupplierIds: [],
            supplierCatalogueEntries: [],
            searchText: 'placeholder',
          });

        await expect(
          item.validate(),
        ).rejects.toThrow(
          /greater than zero|cannot exceed/iu,
        );
      },
    );

    it(
      'enforces hierarchy integrity and operational location rules',
      async () => {
        const parentId = objectId();
        const location =
          new StoreLocationModel({
            ...commonFields(),
            ...lifecycleFields(),
            locationCode: 'ward-a',
            name: 'Ward A Store',
            normalizedName: 'placeholder',
            locationType:
              'WARD_STORE',
            parentLocationId:
              parentId,
            ancestorLocationIds: [],
            hierarchyDepth: 1,
            departmentId: objectId(),
            wardId: null,
            servicePointId: null,
            managerStaffId: null,
            storageConditions: [
              'AMBIENT',
            ],
            supportsDispensing:
              false,
            allowsControlledMedicine:
              false,
            allowsGeneralStock: true,
            stockOwnershipCode:
              'ward-a',
            physicalAddress: null,
            contactPhone: null,
            displayOrder: 0,
          });

        await expect(
          location.validate(),
        ).rejects.toThrow(
          /ancestry|ward link/iu,
        );
      },
    );

    it(
      'requires supplier suspension attribution',
      async () => {
        const supplier =
          new SupplierModel({
            ...commonFields(),
            supplierCode: 'sup-001',
            legalName:
              'Fictional Medical Supply Company',
            normalizedLegalName:
              'placeholder',
            tradingName: null,
            registrationNumber: null,
            taxRegistrationNumber: null,
            salesTaxRegistrationNumber:
              null,
            drugSaleLicenseNumber: null,
            contacts: [],
            addresses: [],
            defaultCurrency: 'PKR',
            paymentTermsDays: 30,
            standardLeadTimeDays: 7,
            notes: null,
            status: 'SUSPENDED',
            activatedAt: new Date(),
            activatedBy: objectId(),
            suspendedAt: null,
            suspendedBy: null,
            suspensionReason: null,
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          });

        await expect(
          supplier.validate(),
        ).rejects.toThrow(
          /suspension attribution/iu,
        );
      },
    );

    it(
      'blocks invalid batch chronology and active expired batches',
      async () => {
        const batch =
          new InventoryBatchModel({
            ...commonFields(),
            itemId: objectId(),
            supplierId: objectId(),
            batchNumber: 'LOT-001',
            manufacturerName:
              'Fictional Pharma',
            manufacturerBatchNumber:
              'LOT-001',
            normalizedBatchNumber:
              'placeholder',
            manufactureDate:
              new Date('2027-01-01T00:00:00.000Z'),
            expiryDate:
              new Date('2026-01-01T00:00:00.000Z'),
            costPrice: '10.25',
            sellingPrice: '12.00',
            currency: 'PKR',
            goodsReceiptId: null,
            goodsReceiptItemId: null,
            inspectionStatus: 'PASSED',
            status: 'ACTIVE',
            quarantineAt: null,
            quarantinedBy: null,
            quarantineReason: null,
            releasedFromQuarantineAt:
              null,
            releasedFromQuarantineBy:
              null,
            quarantineReleaseReason:
              null,
            recallStatus: 'NONE',
            recallReference: null,
            recalledAt: null,
            recalledBy: null,
            recallReason: null,
            blockedAt: null,
            blockedBy: null,
            blockedReason: null,
            enteredInErrorAt: null,
            enteredInErrorBy: null,
            enteredInErrorReason: null,
          });

        await expect(
          batch.validate(),
        ).rejects.toThrow(
          /expiry date|cannot remain active/iu,
        );
      },
    );

    it(
      'reconciles stock-balance classifications exactly to on-hand stock',
      async () => {
        const balance =
          new StockBalanceModel({
            facilityId: objectId(),
            schemaVersion: 1,
            version: 0,
            storeLocationId: objectId(),
            itemId: objectId(),
            batchId: objectId(),
            onHandQuantity: '10.000',
            availableQuantity: '6.000',
            reservedQuantity: '2.000',
            quarantinedQuantity: '1.000',
            damagedQuantity: '1.500',
            expiredQuantity: '0',
            inTransitQuantity: '0',
            lastMovementId: null,
            lastMovementAt: null,
            lastLedgerSequence: 0,
            lastReconciledAt: null,
            projectionTransactionId:
              `tx-${objectId().toHexString()}`,
            correlationId:
              `corr-${objectId().toHexString()}`,
            createdBy: objectId(),
            updatedBy: objectId(),
          });

        await expect(
          balance.validate(),
        ).rejects.toThrow(
          /reconcile exactly/iu,
        );
      },
    );
  },
);