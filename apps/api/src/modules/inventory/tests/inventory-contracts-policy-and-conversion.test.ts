import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  InventoryContextRepositoryPort,
} from '../inventory.ports.js';

import type {
  InventoryItemRecord,
  StoreLocationRecord,
} from '../inventory.persistence.types.js';

import {
  createInventoryItemBodySchema,
  createInventoryLocationBodySchema,
  createSupplierBodySchema,
  inventoryBatchListQuerySchema,
  inventoryItemListQuerySchema,
} from '../inventory.validation.js';

import {
  InventoryAccessPolicyService,
} from '../services/inventory-access-policy.service.js';

import {
  InventoryContextService,
} from '../services/inventory-context.service.js';

import {
  InventoryUnitConversionService,
} from '../services/inventory-unit-conversion.service.js';

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function locationRecord(
  overrides: Partial<StoreLocationRecord> = {},
): StoreLocationRecord {
  const facilityId = objectId();
  const actorId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId,
    locationCode: 'WARD-A',
    name: 'Ward A Store',
    normalizedName: 'ward a store',
    locationType: 'WARD_STORE',
    parentLocationId: null,
    ancestorLocationIds: [],
    hierarchyDepth: 0,
    departmentId: objectId(),
    wardId: objectId(),
    servicePointId: null,
    managerStaffId: null,
    storageConditions: ['AMBIENT'],
    supportsDispensing: false,
    allowsControlledMedicine: false,
    allowsGeneralStock: true,
    stockOwnershipCode: 'WARD-A',
    physicalAddress: null,
    contactPhone: null,
    displayOrder: 0,
    status: 'ACTIVE',
    activatedAt: occurredAt,
    activatedBy: actorId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    transactionId: 'tx-location',
    correlationId: 'corr-location',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  };
}

function inventoryItemRecord(
  overrides: Partial<InventoryItemRecord> = {},
): InventoryItemRecord {
  const facilityId = objectId();
  const actorId = objectId();
  const unitId = objectId();
  const occurredAt = new Date('2026-07-20T10:00:00.000Z');

  return {
    _id: objectId(),
    facilityId,
    itemCode: 'ITEM-001',
    name: 'Sterile gloves',
    normalizedName: 'sterile gloves',
    itemType: 'NON_MEDICATION',
    categoryId: objectId(),
    formularyItemId: null,
    barcode: null,
    manufacturerName: null,
    description: null,
    stockUnitId: unitId,
    purchaseUnitId: objectId(),
    purchaseUnitToStockFactor: Types.Decimal128.fromString('100'),
    issueUnitId: unitId,
    issueUnitToStockFactor: Types.Decimal128.fromString('1'),
    unitConversions: [],
    allowFractionalStock: false,
    batchTrackingRequired: false,
    expiryTrackingRequired: false,
    storageConditions: ['AMBIENT'],
    minimumStorageTemperatureCelsius: null,
    maximumStorageTemperatureCelsius: null,
    reorderLevel: Types.Decimal128.fromString('100'),
    minimumStockLevel: Types.Decimal128.fromString('50'),
    maximumStockLevel: Types.Decimal128.fromString('1000'),
    safetyStockLevel: Types.Decimal128.fromString('25'),
    nearExpiryWarningDays: 90,
    negativeStockAllowed: false,
    controlledMedicine: false,
    highAlert: false,
    highValue: false,
    valuationMethod: 'BATCH_COST',
    preferredSupplierIds: [],
    supplierCatalogueEntries: [],
    searchText: 'item-001 sterile gloves',
    status: 'ACTIVE',
    activatedAt: occurredAt,
    activatedBy: actorId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    transactionId: 'tx-item',
    correlationId: 'corr-item',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  };
}

class ContextRepositoryStub
implements InventoryContextRepositoryPort {
  public constructor(
    private readonly location: StoreLocationRecord,
    private readonly staffDepartmentId: string | null,
  ) {}

  public async findActorIdentity() {
    return {
      userId: '507f1f77bcf86cd799439011',
      facilityId: this.location.facilityId.toHexString(),
      staffId: '507f1f77bcf86cd799439012',
      status: 'ACTIVE' as const,
    };
  }

  public async findStaff() {
    return {
      staffId: '507f1f77bcf86cd799439012',
      facilityId: this.location.facilityId.toHexString(),
      departmentId: this.staffDepartmentId,
      displayName: 'Fictional Inventory User',
      professionalType: 'PHARMACIST',
      employmentStatus: 'ACTIVE' as const,
      isClinical: false,
      isActive: true,
    };
  }

  public async findDepartment() {
    return this.location.departmentId === null
      ? null
      : {
          departmentId: this.location.departmentId.toHexString(),
          facilityId: this.location.facilityId.toHexString(),
          departmentType: 'PHARMACY',
          name: 'Pharmacy',
          status: 'ACTIVE' as const,
        };
  }

  public async findWard() {
    return this.location.wardId === null ||
      this.location.departmentId === null
      ? null
      : {
          wardId: this.location.wardId.toHexString(),
          facilityId: this.location.facilityId.toHexString(),
          departmentId: this.location.departmentId.toHexString(),
          name: 'Ward A',
          status: 'ACTIVE' as const,
        };
  }

  public async findLocation() {
    return this.location;
  }
}

describe(
  'inventory Batch 2 contracts, policy, and conversion',
  () => {
    it(
      'rejects medication items without a formulary link and invalid stock thresholds',
      () => {
        const unitId = objectId().toHexString();

        const result = createInventoryItemBodySchema.safeParse({
          itemCode: 'MED-001',
          name: 'Paracetamol',
          itemType: 'MEDICATION',
          categoryId: objectId().toHexString(),
          formularyItemId: null,
          stockUnitId: unitId,
          purchaseUnitId: unitId,
          purchaseUnitToStockFactor: '1',
          issueUnitId: unitId,
          issueUnitToStockFactor: '1',
          batchTrackingRequired: false,
          expiryTrackingRequired: true,
          reorderLevel: '5',
          minimumStockLevel: '10',
          maximumStockLevel: '8',
          safetyStockLevel: '11',
        });

        expect(result.success).toBe(false);

        if (!result.success) {
          expect(
            result.error.issues.map(
              (issue) => issue.path.join('.'),
            ),
          ).toEqual(
            expect.arrayContaining([
              'formularyItemId',
              'expiryTrackingRequired',
              'reorderLevel',
              'maximumStockLevel',
              'safetyStockLevel',
            ]),
          );
        }
      },
    );

    it(
      'enforces location-type and supplier primary-record rules',
      () => {
        const location = createInventoryLocationBodySchema.safeParse({
          locationCode: 'PHARM-01',
          name: 'Main Pharmacy',
          locationType: 'PHARMACY',
          stockOwnershipCode: 'PHARM-01',
          supportsDispensing: false,
        });

        const supplier = createSupplierBodySchema.safeParse({
          supplierCode: 'SUP-01',
          legalName: 'Fictional Supplier',
          contacts: [
            {
              contactType: 'PRIMARY',
              name: 'One',
              primary: true,
            },
            {
              contactType: 'SALES',
              name: 'Two',
              primary: true,
            },
          ],
        });

        expect(location.success).toBe(false);
        expect(supplier.success).toBe(false);
      },
    );

    it(
      'applies strict list defaults and validates expiry ranges',
      () => {
        expect(
          inventoryItemListQuerySchema.parse({}),
        ).toMatchObject({
          page: 1,
          pageSize: 25,
          sortBy: 'name',
          sortDirection: 'asc',
        });

        expect(
          inventoryBatchListQuerySchema.safeParse({
            expiresFrom: '2026-08-01T00:00:00.000Z',
            expiresTo: '2026-07-01T00:00:00.000Z',
          }).success,
        ).toBe(false);
      },
    );

    it(
      'rejects contradictory factors for the same configured unit',
      () => {
        const sharedUnitId = objectId();

        const item = inventoryItemRecord({
          stockUnitId: objectId(),
          purchaseUnitId: sharedUnitId,
          issueUnitId: sharedUnitId,
          purchaseUnitToStockFactor:
            Types.Decimal128.fromString('10'),
          issueUnitToStockFactor:
            Types.Decimal128.fromString('5'),
        });

        const service = new InventoryUnitConversionService();

        expect(() =>
          service.toStockUnit(
            item,
            '1',
            sharedUnitId.toHexString(),
          ),
        ).toThrow(/conflicting conversion factors/iu);
      },
    );

    it(
      'converts through the stock unit without floating-point arithmetic',
      () => {
        const item = inventoryItemRecord();
        const service = new InventoryUnitConversionService();

        const result = service.convert(item, {
          quantity: '2',
          fromUnitId: item.purchaseUnitId.toHexString(),
          toUnitId: item.issueUnitId.toHexString(),
        });

        expect(result.stockQuantity).toBe('200');
        expect(result.quantity).toBe('200');
        expect(result.exact).toBe(true);
      },
    );

    it(
      'blocks fractional stock for indivisible items',
      () => {
        const item = inventoryItemRecord({
          purchaseUnitToStockFactor:
            Types.Decimal128.fromString('2.5'),
          allowFractionalStock: false,
        });

        const service = new InventoryUnitConversionService();

        expect(() =>
          service.toStockUnit(
            item,
            '1',
            item.purchaseUnitId.toHexString(),
          ),
        ).toThrow(/does not allow fractional stock/iu);
      },
    );

    it(
      'resolves an active facility-isolated inventory location with staff attribution',
      async () => {
        const location = locationRecord();

        const repository = new ContextRepositoryStub(
          location,
          location.departmentId?.toHexString() ?? null,
        );

        const service = new InventoryContextService(repository);

        const context = await service.resolveOperationalLocation(
          {
            userId: '507f1f77bcf86cd799439011',
            facilityId: location.facilityId.toHexString(),
            correlationId: 'corr-test',
            roleKeys: ['STORE_MANAGER'],
            permissionKeys: ['inventory.read'],
          },
          location._id.toHexString(),
        );

        expect(context.actor.staffId).toBe(
          '507f1f77bcf86cd799439012',
        );

        expect(context.location.locationId).toBe(
          location._id.toHexString(),
        );
      },
    );

    it(
      'keeps cost visibility separately permission-gated',
      async () => {
        const location = locationRecord({
          locationType: 'PHARMACY',
          supportsDispensing: true,
        });

        const repository = new ContextRepositoryStub(
          location,
          location.departmentId?.toHexString() ?? null,
        );

        const policy = new InventoryAccessPolicyService(repository);

        const withoutCost = await policy.authorize({
          actor: {
            userId: '507f1f77bcf86cd799439011',
            facilityId: location.facilityId.toHexString(),
            correlationId: 'corr-policy-1',
            roleKeys: ['PHARMACIST'],
            permissionKeys: ['inventory.read'],
          },
          action: 'STOCK_READ',
          location,
        });

        const withCost = await policy.authorize({
          actor: {
            userId: '507f1f77bcf86cd799439011',
            facilityId: location.facilityId.toHexString(),
            correlationId: 'corr-policy-2',
            roleKeys: ['PHARMACIST'],
            permissionKeys: [
              'inventory.read',
              'inventory.view_cost',
            ],
          },
          action: 'STOCK_READ',
          location,
        });

        expect(withoutCost.allowed).toBe(true);
        expect(withoutCost.includeCost).toBe(false);
        expect(withCost.allowed).toBe(true);
        expect(withCost.includeCost).toBe(true);
      },
    );

    it(
      'limits a ward user to stock visibility in the linked department and hides cost',
      async () => {
        const location = locationRecord();

        const repository = new ContextRepositoryStub(
          location,
          location.departmentId?.toHexString() ?? null,
        );

        const policy = new InventoryAccessPolicyService(repository);

        const decision = await policy.authorize({
          actor: {
            userId: '507f1f77bcf86cd799439011',
            facilityId: location.facilityId.toHexString(),
            correlationId: 'corr-ward',
            roleKeys: ['WARD_NURSE'],
            permissionKeys: [
              'inventory.read',
              'inventory.view_cost',
            ],
          },
          action: 'STOCK_READ',
          location,
        });

        expect(decision.allowed).toBe(true);
        expect(decision.accessMode).toBe('WARD_REQUESTOR');
        expect(decision.includeCost).toBe(false);
      },
    );
  },
);