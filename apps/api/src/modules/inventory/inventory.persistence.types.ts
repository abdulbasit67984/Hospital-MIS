import type {
  Types,
} from 'mongoose';

import type {
  FormularyItemStatus,
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
  UnitOfMeasureDimension,
} from '@hospital-mis/database';

export interface InventoryPersistenceMetadata {
  facilityId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryCatalogLifecycleRecord {
  status: InventoryCatalogStatus;
  activatedAt: Date;
  activatedBy: Types.ObjectId;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface InventoryCategoryRecord
extends InventoryPersistenceMetadata,
InventoryCatalogLifecycleRecord {
  _id: Types.ObjectId;
  categoryCode: string;
  name: string;
  normalizedName: string;
  categoryType: InventoryCategoryType;
  parentCategoryId: Types.ObjectId | null;
  ancestorCategoryIds: Types.ObjectId[];
  hierarchyDepth: number;
  description: string | null;
  displayOrder: number;
}

export interface InventoryUnitConversionRecord {
  unitId: Types.ObjectId;
  purpose: InventoryUnitPurpose;
  toStockUnitFactor: Types.Decimal128;
  isDefault: boolean;
}

export interface InventorySupplierCatalogueEntryRecord {
  supplierId: Types.ObjectId;
  supplierItemCode: string;
  supplierItemName: string | null;
  purchaseUnitId: Types.ObjectId;
  purchaseUnitToStockFactor: Types.Decimal128;
  minimumOrderQuantity: Types.Decimal128;
  lastQuotedUnitCost: Types.Decimal128 | null;
  currency: string;
  leadTimeDays: number | null;
  preferred: boolean;
  active: boolean;
}

export interface InventoryItemRecord
extends InventoryPersistenceMetadata,
InventoryCatalogLifecycleRecord {
  _id: Types.ObjectId;
  itemCode: string;
  name: string;
  normalizedName: string;
  itemType: InventoryItemType;
  categoryId: Types.ObjectId;
  formularyItemId: Types.ObjectId | null;
  barcode: string | null;
  manufacturerName: string | null;
  description: string | null;
  stockUnitId: Types.ObjectId;
  purchaseUnitId: Types.ObjectId;
  purchaseUnitToStockFactor: Types.Decimal128;
  issueUnitId: Types.ObjectId;
  issueUnitToStockFactor: Types.Decimal128;
  unitConversions: InventoryUnitConversionRecord[];
  allowFractionalStock: boolean;
  batchTrackingRequired: boolean;
  expiryTrackingRequired: boolean;
  storageConditions: InventoryStorageCondition[];
  minimumStorageTemperatureCelsius: Types.Decimal128 | null;
  maximumStorageTemperatureCelsius: Types.Decimal128 | null;
  reorderLevel: Types.Decimal128;
  minimumStockLevel: Types.Decimal128;
  maximumStockLevel: Types.Decimal128 | null;
  safetyStockLevel: Types.Decimal128;
  nearExpiryWarningDays: number;
  negativeStockAllowed: boolean;
  controlledMedicine: boolean;
  highAlert: boolean;
  highValue: boolean;
  valuationMethod: InventoryValuationMethod;
  preferredSupplierIds: Types.ObjectId[];
  supplierCatalogueEntries: InventorySupplierCatalogueEntryRecord[];
  searchText: string;
}

export interface SupplierContactRecord {
  contactType: SupplierContactType;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  primary: boolean;
  active: boolean;
}

export interface SupplierAddressRecord {
  addressType: SupplierAddressType;
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  primary: boolean;
  active: boolean;
}

export interface SupplierRecord extends InventoryPersistenceMetadata {
  _id: Types.ObjectId;
  supplierCode: string;
  legalName: string;
  normalizedLegalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;
  salesTaxRegistrationNumber: string | null;
  drugSaleLicenseNumber: string | null;
  contacts: SupplierContactRecord[];
  addresses: SupplierAddressRecord[];
  defaultCurrency: string;
  paymentTermsDays: number;
  standardLeadTimeDays: number;
  notes: string | null;
  status: SupplierStatus;
  activatedAt: Date;
  activatedBy: Types.ObjectId;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
}

export interface StoreLocationRecord
extends InventoryPersistenceMetadata,
InventoryCatalogLifecycleRecord {
  _id: Types.ObjectId;
  locationCode: string;
  name: string;
  normalizedName: string;
  locationType: InventoryLocationType;
  parentLocationId: Types.ObjectId | null;
  ancestorLocationIds: Types.ObjectId[];
  hierarchyDepth: number;
  departmentId: Types.ObjectId | null;
  wardId: Types.ObjectId | null;
  servicePointId: Types.ObjectId | null;
  managerStaffId: Types.ObjectId | null;
  storageConditions: InventoryStorageCondition[];
  supportsDispensing: boolean;
  allowsControlledMedicine: boolean;
  allowsGeneralStock: boolean;
  stockOwnershipCode: string;
  physicalAddress: string | null;
  contactPhone: string | null;
  displayOrder: number;
}

export interface InventoryBatchRecord extends InventoryPersistenceMetadata {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  supplierId: Types.ObjectId | null;
  batchNumber: string;
  manufacturerName: string | null;
  manufacturerBatchNumber: string;
  normalizedBatchNumber: string;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  costPrice: Types.Decimal128;
  sellingPrice: Types.Decimal128;
  currency: string;
  goodsReceiptId: Types.ObjectId | null;
  goodsReceiptItemId: Types.ObjectId | null;
  inspectionStatus: InventoryBatchInspectionStatus;
  status: InventoryBatchStatus;
  quarantineAt: Date | null;
  quarantinedBy: Types.ObjectId | null;
  quarantineReason: string | null;
  releasedFromQuarantineAt: Date | null;
  releasedFromQuarantineBy: Types.ObjectId | null;
  quarantineReleaseReason: string | null;
  recallStatus: InventoryRecallStatus;
  recallReference: string | null;
  recalledAt: Date | null;
  recalledBy: Types.ObjectId | null;
  recallReason: string | null;
  blockedAt: Date | null;
  blockedBy: Types.ObjectId | null;
  blockedReason: string | null;
  enteredInErrorAt: Date | null;
  enteredInErrorBy: Types.ObjectId | null;
  enteredInErrorReason: string | null;
}

export interface StockBalanceRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  storeLocationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  onHandQuantity: Types.Decimal128;
  availableQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  quarantinedQuantity: Types.Decimal128;
  damagedQuantity: Types.Decimal128;
  expiredQuantity: Types.Decimal128;
  inTransitQuantity: Types.Decimal128;
  lastMovementId: Types.ObjectId | null;
  lastMovementAt: Date | null;
  lastLedgerSequence: number;
  lastReconciledAt: Date | null;
  projectionTransactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryUnitOfMeasureRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  code: string;
  name: string;
  normalizedName: string;
  symbol: string;
  dimension: UnitOfMeasureDimension;
  decimalScale: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InventoryFormularyItemRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  formularyCode: string;
  inventoryItemId: Types.ObjectId | null;
  stockTracked: boolean;
  highAlert: boolean;
  controlledMedicine: boolean;
  status: FormularyItemStatus;
}

export interface InventoryActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED';
}

export interface InventoryStaffRecord {
  staffId: string;
  facilityId: string;
  departmentId: string | null;
  displayName: string;
  professionalType: string | null;
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
  isClinical: boolean;
  isActive: boolean;
}

export interface InventoryDepartmentRecord {
  departmentId: string;
  facilityId: string;
  departmentType: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface InventoryWardRecord {
  wardId: string;
  facilityId: string;
  departmentId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface StockBalanceSummaryRecord {
  itemId: Types.ObjectId;
  locationId: Types.ObjectId | null;
  onHandQuantity: Types.Decimal128;
  availableQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  quarantinedQuantity: Types.Decimal128;
  damagedQuantity: Types.Decimal128;
  expiredQuantity: Types.Decimal128;
  inTransitQuantity: Types.Decimal128;
}

export interface EligibleFefoBatchRecord {
  balanceId: Types.ObjectId;
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId;
  availableQuantity: Types.Decimal128;
  batchNumber: string;
  manufacturerBatchNumber: string;
  expiryDate: Date | null;
  costPrice: Types.Decimal128;
  sellingPrice: Types.Decimal128;
  currency: string;
}