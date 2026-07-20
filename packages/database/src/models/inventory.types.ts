export const inventoryCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const inventoryCategoryTypeValues = [
  'MEDICATION',
  'NON_MEDICATION',
  'MIXED',
] as const;

export const inventoryItemTypeValues = [
  'MEDICATION',
  'NON_MEDICATION',
] as const;

export const inventoryValuationMethodValues = [
  'BATCH_COST',
] as const;

export const inventoryStorageConditionValues = [
  'AMBIENT',
  'CONTROLLED_ROOM_TEMPERATURE',
  'REFRIGERATED',
  'FROZEN',
  'PROTECT_FROM_LIGHT',
  'DRY_STORAGE',
  'SECURE_CONTROLLED_STORAGE',
  'HAZARDOUS_MATERIAL',
  'OTHER',
] as const;

export const inventoryLocationTypeValues = [
  'WAREHOUSE',
  'CENTRAL_STORE',
  'PHARMACY',
  'SUB_STORE',
  'WARD_STORE',
  'DEPARTMENT_STORE',
  'QUARANTINE',
  'DAMAGED',
  'RETURNS',
  'IN_TRANSIT',
] as const;

export const supplierStatusValues = [
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
] as const;

export const supplierContactTypeValues = [
  'PRIMARY',
  'SALES',
  'ACCOUNTS',
  'QUALITY',
  'LOGISTICS',
  'OTHER',
] as const;

export const supplierAddressTypeValues = [
  'REGISTERED',
  'BILLING',
  'DELIVERY',
  'RETURN',
  'OTHER',
] as const;

export const inventoryBatchStatusValues = [
  'ACTIVE',
  'QUARANTINED',
  'RECALLED',
  'EXPIRED',
  'DEPLETED',
  'BLOCKED',
] as const;

export const inventoryBatchInspectionStatusValues = [
  'NOT_REQUIRED',
  'PENDING',
  'PASSED',
  'PARTIALLY_ACCEPTED',
  'FAILED',
] as const;

export const inventoryRecallStatusValues = [
  'NONE',
  'INITIATED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const inventoryUnitPurposeValues = [
  'PURCHASE',
  'ISSUE',
  'ALTERNATE',
] as const;

export type InventoryCatalogStatus =
  (typeof inventoryCatalogStatusValues)[number];

export type InventoryCategoryType =
  (typeof inventoryCategoryTypeValues)[number];

export type InventoryItemType =
  (typeof inventoryItemTypeValues)[number];

export type InventoryValuationMethod =
  (typeof inventoryValuationMethodValues)[number];

export type InventoryStorageCondition =
  (typeof inventoryStorageConditionValues)[number];

export type InventoryLocationType =
  (typeof inventoryLocationTypeValues)[number];

export type SupplierStatus =
  (typeof supplierStatusValues)[number];

export type SupplierContactType =
  (typeof supplierContactTypeValues)[number];

export type SupplierAddressType =
  (typeof supplierAddressTypeValues)[number];

export type InventoryBatchStatus =
  (typeof inventoryBatchStatusValues)[number];

export type InventoryBatchInspectionStatus =
  (typeof inventoryBatchInspectionStatusValues)[number];

export type InventoryRecallStatus =
  (typeof inventoryRecallStatusValues)[number];

export type InventoryUnitPurpose =
  (typeof inventoryUnitPurposeValues)[number];