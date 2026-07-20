import type {
  ChangeInventoryCatalogStatusInput,
  ChangeSupplierStatusInput,
  CreateInventoryCategoryInput,
  CreateInventoryItemInput,
  CreateInventoryLocationInput,
  CreateSupplierInput,
  InventoryActorContext,
  InventoryBatchListQuery,
  InventoryCategoryListQuery,
  InventoryItemListQuery,
  InventoryLocationListQuery,
  InventoryOperationalContext,
  InventoryUnitConversionRequest,
  InventoryUnitConversionResult,
  StockBalanceListQuery,
  SupplierListQuery,
  UpdateInventoryCategoryInput,
  UpdateInventoryItemInput,
  UpdateInventoryLocationInput,
  UpdateSupplierInput,
} from './inventory.contracts.js';

import type {
  EligibleFefoBatchRecord,
  InventoryActorIdentityRecord,
  InventoryBatchRecord,
  InventoryCategoryRecord,
  InventoryDepartmentRecord,
  InventoryFormularyItemRecord,
  InventoryItemRecord,
  InventoryStaffRecord,
  InventoryUnitOfMeasureRecord,
  InventoryWardRecord,
  StockBalanceRecord,
  StockBalanceSummaryRecord,
  StoreLocationRecord,
  SupplierRecord,
} from './inventory.persistence.types.js';

export interface InventoryPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InventoryContextRepositoryPort {
  findActorIdentity(
    userId: string,
  ): Promise<InventoryActorIdentityRecord | null>;

  findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<InventoryStaffRecord | null>;

  findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<InventoryDepartmentRecord | null>;

  findWard(
    facilityId: string,
    wardId: string,
  ): Promise<InventoryWardRecord | null>;

  findLocation(
    facilityId: string,
    locationId: string,
  ): Promise<StoreLocationRecord | null>;
}

export interface InventoryContextPort {
  requireActiveActorStaff(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<InventoryOperationalContext['actor']>;

  resolveOperationalLocation(
    actor: InventoryActorContext,
    locationId: string,
    options?: Readonly<{
      requireActive?: boolean;
      requireDispensing?: boolean;
      requireControlledMedicineStorage?: boolean;
    }>,
  ): Promise<InventoryOperationalContext>;
}

export type InventoryCategoryPersistenceUpdate = Partial<
  Pick<
    InventoryCategoryRecord,
    | 'name'
    | 'normalizedName'
    | 'categoryType'
    | 'parentCategoryId'
    | 'ancestorCategoryIds'
    | 'hierarchyDepth'
    | 'description'
    | 'displayOrder'
    | 'updatedBy'
  >
>;

export type InventoryItemPersistenceUpdate = Partial<
  Pick<
    InventoryItemRecord,
    | 'name'
    | 'normalizedName'
    | 'categoryId'
    | 'barcode'
    | 'manufacturerName'
    | 'description'
    | 'purchaseUnitId'
    | 'purchaseUnitToStockFactor'
    | 'issueUnitId'
    | 'issueUnitToStockFactor'
    | 'unitConversions'
    | 'allowFractionalStock'
    | 'batchTrackingRequired'
    | 'expiryTrackingRequired'
    | 'storageConditions'
    | 'minimumStorageTemperatureCelsius'
    | 'maximumStorageTemperatureCelsius'
    | 'reorderLevel'
    | 'minimumStockLevel'
    | 'maximumStockLevel'
    | 'safetyStockLevel'
    | 'nearExpiryWarningDays'
    | 'negativeStockAllowed'
    | 'controlledMedicine'
    | 'highAlert'
    | 'highValue'
    | 'preferredSupplierIds'
    | 'supplierCatalogueEntries'
    | 'searchText'
    | 'updatedBy'
  >
>;

export type SupplierPersistenceUpdate = Partial<
  Pick<
    SupplierRecord,
    | 'legalName'
    | 'normalizedLegalName'
    | 'tradingName'
    | 'registrationNumber'
    | 'taxRegistrationNumber'
    | 'salesTaxRegistrationNumber'
    | 'drugSaleLicenseNumber'
    | 'contacts'
    | 'addresses'
    | 'defaultCurrency'
    | 'paymentTermsDays'
    | 'standardLeadTimeDays'
    | 'notes'
    | 'updatedBy'
  >
>;

export type StoreLocationPersistenceUpdate = Partial<
  Pick<
    StoreLocationRecord,
    | 'name'
    | 'normalizedName'
    | 'parentLocationId'
    | 'ancestorLocationIds'
    | 'hierarchyDepth'
    | 'departmentId'
    | 'wardId'
    | 'servicePointId'
    | 'managerStaffId'
    | 'storageConditions'
    | 'supportsDispensing'
    | 'allowsControlledMedicine'
    | 'allowsGeneralStock'
    | 'physicalAddress'
    | 'contactPhone'
    | 'displayOrder'
    | 'updatedBy'
  >
>;

export interface InventoryCatalogRepositoryPort {
  findCategoryById(
    facilityId: string,
    categoryId: string,
  ): Promise<InventoryCategoryRecord | null>;

  listCategories(
    facilityId: string,
    query: InventoryCategoryListQuery,
  ): Promise<InventoryPage<InventoryCategoryRecord>>;

  createCategory(
    input: CreateInventoryCategoryInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      ancestorCategoryIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<InventoryCategoryRecord>;

  updateCategory(
    facilityId: string,
    categoryId: string,
    input: UpdateInventoryCategoryInput,
    metadata: Readonly<{
      actorUserId: string;
      ancestorCategoryIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<InventoryCategoryRecord | null>;

  changeCategoryStatus(
    facilityId: string,
    categoryId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<InventoryCategoryRecord | null>;

  countActiveCategoryChildren(
    facilityId: string,
    categoryId: string,
  ): Promise<number>;

  findItemById(
    facilityId: string,
    itemId: string,
    includeCost?: boolean,
  ): Promise<InventoryItemRecord | null>;

  findItemByFormularyItemId(
    facilityId: string,
    formularyItemId: string,
  ): Promise<InventoryItemRecord | null>;

  listItems(
    facilityId: string,
    query: InventoryItemListQuery,
    includeCost?: boolean,
  ): Promise<InventoryPage<InventoryItemRecord>>;

  createItem(
    input: CreateInventoryItemInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
    }>,
  ): Promise<InventoryItemRecord>;

  updateItem(
    facilityId: string,
    itemId: string,
    input: UpdateInventoryItemInput,
    actorUserId: string,
  ): Promise<InventoryItemRecord | null>;

  changeItemStatus(
    facilityId: string,
    itemId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<InventoryItemRecord | null>;

  findSupplierById(
    facilityId: string,
    supplierId: string,
    includeSensitive?: boolean,
  ): Promise<SupplierRecord | null>;

  listSuppliers(
    facilityId: string,
    query: SupplierListQuery,
    includeSensitive?: boolean,
  ): Promise<InventoryPage<SupplierRecord>>;

  createSupplier(
    input: CreateSupplierInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
    }>,
  ): Promise<SupplierRecord>;

  updateSupplier(
    facilityId: string,
    supplierId: string,
    input: UpdateSupplierInput,
    actorUserId: string,
  ): Promise<SupplierRecord | null>;

  changeSupplierStatus(
    facilityId: string,
    supplierId: string,
    input: ChangeSupplierStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<SupplierRecord | null>;

  findLocationById(
    facilityId: string,
    locationId: string,
  ): Promise<StoreLocationRecord | null>;

  listLocations(
    facilityId: string,
    query: InventoryLocationListQuery,
  ): Promise<InventoryPage<StoreLocationRecord>>;

  createLocation(
    input: CreateInventoryLocationInput,
    metadata: Readonly<{
      facilityId: string;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      ancestorLocationIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<StoreLocationRecord>;

  updateLocation(
    facilityId: string,
    locationId: string,
    input: UpdateInventoryLocationInput,
    metadata: Readonly<{
      actorUserId: string;
      ancestorLocationIds: readonly string[];
      hierarchyDepth: number;
    }>,
  ): Promise<StoreLocationRecord | null>;

  changeLocationStatus(
    facilityId: string,
    locationId: string,
    input: ChangeInventoryCatalogStatusInput,
    actorUserId: string,
    occurredAt: Date,
  ): Promise<StoreLocationRecord | null>;

  countActiveLocationChildren(
    facilityId: string,
    locationId: string,
  ): Promise<number>;

  findUnitOfMeasureById(
    facilityId: string,
    unitId: string,
  ): Promise<InventoryUnitOfMeasureRecord | null>;

  findUnitsOfMeasureByIds(
    facilityId: string,
    unitIds: readonly string[],
  ): Promise<InventoryUnitOfMeasureRecord[]>;

  findFormularyItemById(
    facilityId: string,
    formularyItemId: string,
  ): Promise<InventoryFormularyItemRecord | null>;
}

export interface InventoryStockQueryRepositoryPort {
  findBatchById(
    facilityId: string,
    batchId: string,
    includeCost?: boolean,
  ): Promise<InventoryBatchRecord | null>;

  listBatches(
    facilityId: string,
    query: InventoryBatchListQuery,
    includeCost?: boolean,
  ): Promise<InventoryPage<InventoryBatchRecord>>;

  findBalance(
    facilityId: string,
    locationId: string,
    itemId: string,
    batchId: string | null,
  ): Promise<StockBalanceRecord | null>;

  listBalances(
    facilityId: string,
    query: StockBalanceListQuery,
  ): Promise<InventoryPage<StockBalanceRecord>>;

  summarizeItemStock(
    facilityId: string,
    itemId: string,
    locationId?: string,
  ): Promise<StockBalanceSummaryRecord>;

  listEligibleFefoBatches(
    facilityId: string,
    locationId: string,
    itemId: string,
    at: Date,
    limit?: number,
  ): Promise<EligibleFefoBatchRecord[]>;
}

export interface InventoryUnitConversionPort {
  convert(
    item: InventoryItemRecord,
    request: InventoryUnitConversionRequest,
  ): InventoryUnitConversionResult;

  toStockUnit(
    item: InventoryItemRecord,
    quantity: string,
    fromUnitId: string,
  ): string;

  fromStockUnit(
    item: InventoryItemRecord,
    stockQuantity: string,
    toUnitId: string,
  ): string;
}

export interface InventoryAccessRequest {
  actor: InventoryActorContext;
  action:
    | 'CATALOG_READ'
    | 'ITEM_MANAGE'
    | 'SUPPLIER_MANAGE'
    | 'LOCATION_MANAGE'
    | 'STOCK_READ'
    | 'COST_READ'
    | 'BATCH_MANAGE'
    | 'PROCURE'
    | 'RECEIVE'
    | 'TRANSFER'
    | 'ADJUST'
    | 'COUNT'
    | 'DISPENSE'
    | 'RETURN'
    | 'REPORT_READ'
    | 'REPORT_EXPORT';
  location?: StoreLocationRecord;
  item?: InventoryItemRecord;
}

export interface InventoryAccessDecision {
  allowed: boolean;
  accessMode:
    | 'FACILITY_INVENTORY'
    | 'LOCATION_MANAGER'
    | 'DEPARTMENT_LOCATION'
    | 'WARD_REQUESTOR'
    | 'PHARMACY'
    | 'BREAK_GLASS'
    | 'DENIED';
  includeCost: boolean;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface InventoryAccessPolicyPort {
  authorize(
    request: InventoryAccessRequest,
  ): Promise<InventoryAccessDecision>;
}

export interface InventoryClockPort {
  now(): Date;
}