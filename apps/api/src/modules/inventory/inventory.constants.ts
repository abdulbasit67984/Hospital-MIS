import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const INVENTORY_PERMISSION_KEYS = {
  READ: 'inventory.read',
  VIEW_COST: 'inventory.view_cost',
  ITEMS_MANAGE: 'inventory.items.manage',
  BATCHES_MANAGE: 'inventory.batches.manage',
  PROCURE: 'inventory.procure',
  RECEIVE: 'inventory.receive',
  TRANSFER: 'inventory.transfer',
  ADJUST: 'inventory.adjust',
  COUNT: 'inventory.count',
  PHARMACY_DISPENSE: 'pharmacy.dispense',
  PHARMACY_RETURN: 'pharmacy.return',
  REPORTS_READ: 'reports.inventory.read',
  REPORTS_EXPORT: 'reports.export',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const DEFAULT_INVENTORY_PAGE_SIZE = 25;
export const MAX_INVENTORY_PAGE_SIZE = 100;

export const INVENTORY_CATEGORY_SORT_FIELDS = [
  'name',
  'categoryCode',
  'categoryType',
  'status',
  'displayOrder',
  'updatedAt',
] as const;

export const INVENTORY_ITEM_SORT_FIELDS = [
  'name',
  'itemCode',
  'itemType',
  'status',
  'reorderLevel',
  'updatedAt',
] as const;

export const INVENTORY_LOCATION_SORT_FIELDS = [
  'name',
  'locationCode',
  'locationType',
  'status',
  'displayOrder',
  'updatedAt',
] as const;

export const INVENTORY_SUPPLIER_SORT_FIELDS = [
  'legalName',
  'supplierCode',
  'status',
  'standardLeadTimeDays',
  'updatedAt',
] as const;

export const INVENTORY_BATCH_SORT_FIELDS = [
  'expiryDate',
  'manufacturerBatchNumber',
  'status',
  'costPrice',
  'createdAt',
] as const;

export const STOCK_BALANCE_SORT_FIELDS = [
  'availableQuantity',
  'onHandQuantity',
  'reservedQuantity',
  'lastMovementAt',
  'updatedAt',
] as const;

export type InventoryCategorySortField =
  (typeof INVENTORY_CATEGORY_SORT_FIELDS)[number];

export type InventoryItemSortField =
  (typeof INVENTORY_ITEM_SORT_FIELDS)[number];

export type InventoryLocationSortField =
  (typeof INVENTORY_LOCATION_SORT_FIELDS)[number];

export type InventorySupplierSortField =
  (typeof INVENTORY_SUPPLIER_SORT_FIELDS)[number];

export type InventoryBatchSortField =
  (typeof INVENTORY_BATCH_SORT_FIELDS)[number];

export type StockBalanceSortField =
  (typeof STOCK_BALANCE_SORT_FIELDS)[number];

export const INVENTORY_OPERATIONAL_ROLE_KEYS = [
  'PHARMACIST',
  'STORE_MANAGER',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
] as const;

export const INVENTORY_LOCK_NAMESPACE = {
  CATEGORY: 'inventory:category',
  ITEM: 'inventory:item',
  LOCATION: 'inventory:location',
  SUPPLIER: 'inventory:supplier',
  BATCH: 'inventory:batch',
  BALANCE: 'inventory:balance',
} as const;