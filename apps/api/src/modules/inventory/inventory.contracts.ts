import type {
  InventoryBatchInspectionStatus,
  InventoryBatchStatus,
  InventoryCatalogStatus,
  InventoryCategoryType,
  InventoryItemType,
  InventoryLocationType,
  InventoryRecallStatus,
  InventoryStorageCondition,
  InventoryUnitPurpose,
  InventoryValuationMethod,
  SupplierAddressType,
  SupplierContactType,
  SupplierStatus,
} from '@hospital-mis/database';

import type {
  InventoryBatchSortField,
  InventoryCategorySortField,
  InventoryItemSortField,
  InventoryLocationSortField,
  InventorySupplierSortField,
  StockBalanceSortField,
} from './inventory.constants.js';

export type InventoryObjectIdString = string;
export type InventorySortDirection = 'asc' | 'desc';

export interface InventoryActorContext {
  userId: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface InventoryUnitConversionInput {
  unitId: InventoryObjectIdString;
  purpose: InventoryUnitPurpose;
  toStockUnitFactor: string;
  isDefault?: boolean;
}

export interface SupplierCatalogueEntryInput {
  supplierId: InventoryObjectIdString;
  supplierItemCode: string;
  supplierItemName?: string | null;
  purchaseUnitId: InventoryObjectIdString;
  purchaseUnitToStockFactor: string;
  minimumOrderQuantity?: string;
  lastQuotedUnitCost?: string | null;
  currency?: string;
  leadTimeDays?: number | null;
  preferred?: boolean;
  active?: boolean;
}

export interface CreateInventoryCategoryInput {
  categoryCode: string;
  name: string;
  categoryType?: InventoryCategoryType;
  parentCategoryId?: InventoryObjectIdString | null;
  description?: string | null;
  displayOrder?: number;
}

export interface UpdateInventoryCategoryInput {
  expectedVersion: number;
  name?: string;
  categoryType?: InventoryCategoryType;
  parentCategoryId?: InventoryObjectIdString | null;
  description?: string | null;
  displayOrder?: number;
}

export interface CreateInventoryItemInput {
  itemCode: string;
  name: string;
  itemType: InventoryItemType;
  categoryId: InventoryObjectIdString;
  formularyItemId?: InventoryObjectIdString | null;
  barcode?: string | null;
  manufacturerName?: string | null;
  description?: string | null;
  stockUnitId: InventoryObjectIdString;
  purchaseUnitId: InventoryObjectIdString;
  purchaseUnitToStockFactor: string;
  issueUnitId: InventoryObjectIdString;
  issueUnitToStockFactor: string;
  unitConversions?: readonly InventoryUnitConversionInput[];
  allowFractionalStock?: boolean;
  batchTrackingRequired?: boolean;
  expiryTrackingRequired?: boolean;
  storageConditions?: readonly InventoryStorageCondition[];
  minimumStorageTemperatureCelsius?: string | null;
  maximumStorageTemperatureCelsius?: string | null;
  reorderLevel?: string;
  minimumStockLevel?: string;
  maximumStockLevel?: string | null;
  safetyStockLevel?: string;
  nearExpiryWarningDays?: number;
  negativeStockAllowed?: boolean;
  controlledMedicine?: boolean;
  highAlert?: boolean;
  highValue?: boolean;
  valuationMethod?: InventoryValuationMethod;
  preferredSupplierIds?: readonly InventoryObjectIdString[];
  supplierCatalogueEntries?: readonly SupplierCatalogueEntryInput[];
}

export interface UpdateInventoryItemInput {
  expectedVersion: number;
  name?: string;
  categoryId?: InventoryObjectIdString;
  barcode?: string | null;
  manufacturerName?: string | null;
  description?: string | null;
  purchaseUnitId?: InventoryObjectIdString;
  purchaseUnitToStockFactor?: string;
  issueUnitId?: InventoryObjectIdString;
  issueUnitToStockFactor?: string;
  unitConversions?: readonly InventoryUnitConversionInput[];
  allowFractionalStock?: boolean;
  batchTrackingRequired?: boolean;
  expiryTrackingRequired?: boolean;
  storageConditions?: readonly InventoryStorageCondition[];
  minimumStorageTemperatureCelsius?: string | null;
  maximumStorageTemperatureCelsius?: string | null;
  reorderLevel?: string;
  minimumStockLevel?: string;
  maximumStockLevel?: string | null;
  safetyStockLevel?: string;
  nearExpiryWarningDays?: number;
  negativeStockAllowed?: boolean;
  controlledMedicine?: boolean;
  highAlert?: boolean;
  highValue?: boolean;
  preferredSupplierIds?: readonly InventoryObjectIdString[];
  supplierCatalogueEntries?: readonly SupplierCatalogueEntryInput[];
}

export interface ChangeInventoryCatalogStatusInput {
  expectedVersion: number;
  status: InventoryCatalogStatus;
  reason: string;
}

export interface SupplierContactInput {
  contactType: SupplierContactType;
  name: string;
  designation?: string | null;
  phone?: string | null;
  email?: string | null;
  primary?: boolean;
  active?: boolean;
}

export interface SupplierAddressInput {
  addressType: SupplierAddressType;
  line1: string;
  line2?: string | null;
  city: string;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  primary?: boolean;
  active?: boolean;
}

export interface CreateSupplierInput {
  supplierCode: string;
  legalName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  taxRegistrationNumber?: string | null;
  salesTaxRegistrationNumber?: string | null;
  drugSaleLicenseNumber?: string | null;
  contacts?: readonly SupplierContactInput[];
  addresses?: readonly SupplierAddressInput[];
  defaultCurrency?: string;
  paymentTermsDays?: number;
  standardLeadTimeDays?: number;
  notes?: string | null;
}

export interface UpdateSupplierInput {
  expectedVersion: number;
  legalName?: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  taxRegistrationNumber?: string | null;
  salesTaxRegistrationNumber?: string | null;
  drugSaleLicenseNumber?: string | null;
  contacts?: readonly SupplierContactInput[];
  addresses?: readonly SupplierAddressInput[];
  defaultCurrency?: string;
  paymentTermsDays?: number;
  standardLeadTimeDays?: number;
  notes?: string | null;
}

export interface ChangeSupplierStatusInput {
  expectedVersion: number;
  status: SupplierStatus;
  reason: string;
}

export interface CreateInventoryLocationInput {
  locationCode: string;
  name: string;
  locationType: InventoryLocationType;
  parentLocationId?: InventoryObjectIdString | null;
  departmentId?: InventoryObjectIdString | null;
  wardId?: InventoryObjectIdString | null;
  servicePointId?: InventoryObjectIdString | null;
  managerStaffId?: InventoryObjectIdString | null;
  storageConditions?: readonly InventoryStorageCondition[];
  supportsDispensing?: boolean;
  allowsControlledMedicine?: boolean;
  allowsGeneralStock?: boolean;
  stockOwnershipCode: string;
  physicalAddress?: string | null;
  contactPhone?: string | null;
  displayOrder?: number;
}

export interface UpdateInventoryLocationInput {
  expectedVersion: number;
  name?: string;
  parentLocationId?: InventoryObjectIdString | null;
  departmentId?: InventoryObjectIdString | null;
  wardId?: InventoryObjectIdString | null;
  servicePointId?: InventoryObjectIdString | null;
  managerStaffId?: InventoryObjectIdString | null;
  storageConditions?: readonly InventoryStorageCondition[];
  supportsDispensing?: boolean;
  allowsControlledMedicine?: boolean;
  allowsGeneralStock?: boolean;
  physicalAddress?: string | null;
  contactPhone?: string | null;
  displayOrder?: number;
}

export interface InventoryCategoryListQuery {
  page: number;
  pageSize: number;
  search?: string;
  parentCategoryId?: InventoryObjectIdString | null;
  categoryType?: InventoryCategoryType;
  status?: InventoryCatalogStatus;
  sortBy: InventoryCategorySortField;
  sortDirection: InventorySortDirection;
}

export interface InventoryItemListQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: InventoryObjectIdString;
  itemType?: InventoryItemType;
  formularyItemId?: InventoryObjectIdString;
  supplierId?: InventoryObjectIdString;
  status?: InventoryCatalogStatus;
  controlledMedicine?: boolean;
  highAlert?: boolean;
  highValue?: boolean;
  batchTrackingRequired?: boolean;
  sortBy: InventoryItemSortField;
  sortDirection: InventorySortDirection;
}

export interface SupplierListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: SupplierStatus;
  sortBy: InventorySupplierSortField;
  sortDirection: InventorySortDirection;
}

export interface InventoryLocationListQuery {
  page: number;
  pageSize: number;
  search?: string;
  parentLocationId?: InventoryObjectIdString | null;
  locationType?: InventoryLocationType;
  departmentId?: InventoryObjectIdString;
  wardId?: InventoryObjectIdString;
  status?: InventoryCatalogStatus;
  supportsDispensing?: boolean;
  sortBy: InventoryLocationSortField;
  sortDirection: InventorySortDirection;
}

export interface InventoryBatchListQuery {
  page: number;
  pageSize: number;
  itemId?: InventoryObjectIdString;
  supplierId?: InventoryObjectIdString;
  status?: InventoryBatchStatus;
  inspectionStatus?: InventoryBatchInspectionStatus;
  recallStatus?: InventoryRecallStatus;
  expiresFrom?: string;
  expiresTo?: string;
  includeExpired?: boolean;
  sortBy: InventoryBatchSortField;
  sortDirection: InventorySortDirection;
}

export interface StockBalanceListQuery {
  page: number;
  pageSize: number;
  locationId?: InventoryObjectIdString;
  itemId?: InventoryObjectIdString;
  batchId?: InventoryObjectIdString | null;
  onlyAvailable?: boolean;
  onlyRestricted?: boolean;
  sortBy: StockBalanceSortField;
  sortDirection: InventorySortDirection;
}

export interface InventoryActorStaffContext {
  userId: InventoryObjectIdString;
  staffId: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  departmentId: InventoryObjectIdString | null;
  displayName: string;
  professionalType: string | null;
}

export interface InventoryLocationContext {
  locationId: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  locationCode: string;
  name: string;
  locationType: InventoryLocationType;
  parentLocationId: InventoryObjectIdString | null;
  ancestorLocationIds: readonly InventoryObjectIdString[];
  departmentId: InventoryObjectIdString | null;
  wardId: InventoryObjectIdString | null;
  servicePointId: InventoryObjectIdString | null;
  managerStaffId: InventoryObjectIdString | null;
  supportsDispensing: boolean;
  allowsControlledMedicine: boolean;
  allowsGeneralStock: boolean;
  status: InventoryCatalogStatus;
}

export interface InventoryOperationalContext {
  actor: InventoryActorStaffContext;
  location: InventoryLocationContext;
}

export interface InventoryUnitConversionRequest {
  quantity: string;
  fromUnitId: InventoryObjectIdString;
  toUnitId: InventoryObjectIdString;
}

export interface InventoryUnitConversionResult {
  quantity: string;
  fromUnitId: InventoryObjectIdString;
  toUnitId: InventoryObjectIdString;
  stockUnitId: InventoryObjectIdString;
  stockQuantity: string;
  exact: boolean;
}

export interface InventoryPageResponse<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InventoryCategoryResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  categoryCode: string;
  name: string;
  categoryType: InventoryCategoryType;
  parentCategoryId: InventoryObjectIdString | null;
  ancestorCategoryIds: readonly InventoryObjectIdString[];
  hierarchyDepth: number;
  description: string | null;
  displayOrder: number;
  status: InventoryCatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySupplierCatalogueEntryResponse {
  supplierId: InventoryObjectIdString;
  supplierItemCode: string;
  supplierItemName: string | null;
  purchaseUnitId: InventoryObjectIdString;
  purchaseUnitToStockFactor: string;
  minimumOrderQuantity: string;
  currency: string;
  leadTimeDays: number | null;
  preferred: boolean;
  active: boolean;
  lastQuotedUnitCost?: string | null;
}

export interface InventoryItemResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  itemCode: string;
  name: string;
  itemType: InventoryItemType;
  categoryId: InventoryObjectIdString;
  formularyItemId: InventoryObjectIdString | null;
  barcode: string | null;
  manufacturerName: string | null;
  description: string | null;
  stockUnitId: InventoryObjectIdString;
  purchaseUnitId: InventoryObjectIdString;
  purchaseUnitToStockFactor: string;
  issueUnitId: InventoryObjectIdString;
  issueUnitToStockFactor: string;
  unitConversions: readonly InventoryUnitConversionInput[];
  allowFractionalStock: boolean;
  batchTrackingRequired: boolean;
  expiryTrackingRequired: boolean;
  storageConditions: readonly InventoryStorageCondition[];
  minimumStorageTemperatureCelsius: string | null;
  maximumStorageTemperatureCelsius: string | null;
  reorderLevel: string;
  minimumStockLevel: string;
  maximumStockLevel: string | null;
  safetyStockLevel: string;
  nearExpiryWarningDays: number;
  negativeStockAllowed: boolean;
  controlledMedicine: boolean;
  highAlert: boolean;
  highValue: boolean;
  valuationMethod: InventoryValuationMethod;
  preferredSupplierIds: readonly InventoryObjectIdString[];
  supplierCatalogueEntries: readonly InventorySupplierCatalogueEntryResponse[];
  status: InventoryCatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SupplierContactResponse = SupplierContactInput;
export type SupplierAddressResponse = SupplierAddressInput;

export interface SupplierResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  supplierCode: string;
  legalName: string;
  tradingName: string | null;
  defaultCurrency: string;
  paymentTermsDays: number;
  standardLeadTimeDays: number;
  status: SupplierStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  contacts?: readonly SupplierContactResponse[];
  addresses?: readonly SupplierAddressResponse[];
  registrationNumber?: string | null;
  taxRegistrationNumber?: string | null;
  salesTaxRegistrationNumber?: string | null;
  drugSaleLicenseNumber?: string | null;
  notes?: string | null;
}

export interface InventoryLocationResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  locationCode: string;
  name: string;
  locationType: InventoryLocationType;
  parentLocationId: InventoryObjectIdString | null;
  ancestorLocationIds: readonly InventoryObjectIdString[];
  hierarchyDepth: number;
  departmentId: InventoryObjectIdString | null;
  wardId: InventoryObjectIdString | null;
  servicePointId: InventoryObjectIdString | null;
  managerStaffId: InventoryObjectIdString | null;
  storageConditions: readonly InventoryStorageCondition[];
  supportsDispensing: boolean;
  allowsControlledMedicine: boolean;
  allowsGeneralStock: boolean;
  stockOwnershipCode: string;
  physicalAddress: string | null;
  contactPhone: string | null;
  displayOrder: number;
  status: InventoryCatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBatchResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  supplierId: InventoryObjectIdString | null;
  manufacturerName: string | null;
  manufacturerBatchNumber: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  sellingPrice: string;
  costPrice?: string;
  currency: string;
  goodsReceiptId: InventoryObjectIdString | null;
  goodsReceiptItemId: InventoryObjectIdString | null;
  inspectionStatus: InventoryBatchInspectionStatus;
  status: InventoryBatchStatus;
  recallStatus: InventoryRecallStatus;
  recallReference: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockBalanceResponse {
  id: InventoryObjectIdString;
  facilityId: InventoryObjectIdString;
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  onHandQuantity: string;
  availableQuantity: string;
  reservedQuantity: string;
  quarantinedQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  inTransitQuantity: string;
  lastMovementId: InventoryObjectIdString | null;
  lastMovementAt: string | null;
  lastLedgerSequence: number;
  lastReconciledAt: string | null;
  version: number;
  updatedAt: string;
}