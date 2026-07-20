import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  InventoryQuantityBucket,
  PhysicalStockCountScope,
  PhysicalStockCountStatus,
  ProductRecallStatus,
  StockAdjustmentStatus,
  StockAdjustmentType,
} from '@hospital-mis/database';

export type InventoryControlMongoSession = ClientSession;

export interface InventoryControlMetadataRecord {
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

export interface StockAdjustmentLineRecord {
  _id: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  stockUnitId: Types.ObjectId;
  bucket: InventoryQuantityBucket;
  direction: 'INCREASE' | 'DECREASE';
  quantity: Types.Decimal128;
  onHandDelta: Types.Decimal128;
  availableDelta: Types.Decimal128;
  reservedDelta: Types.Decimal128;
  quarantinedDelta: Types.Decimal128;
  damagedDelta: Types.Decimal128;
  expiredDelta: Types.Decimal128;
  unitCost: Types.Decimal128 | null;
  currency: string | null;
  reasonCode: string;
  notes: string | null;
}

export interface StockAdjustmentRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  adjustmentNumber: string;
  locationId: Types.ObjectId;
  adjustmentType: StockAdjustmentType;
  requestedByStaffId: Types.ObjectId;
  approvedByStaffId: Types.ObjectId | null;
  postedByStaffId: Types.ObjectId | null;
  rejectedByStaffId: Types.ObjectId | null;
  cancelledByStaffId: Types.ObjectId | null;
  reversedByStaffId: Types.ObjectId | null;
  reason: string;
  status: StockAdjustmentStatus;
  lineCount: number;
  totalAbsoluteStockQuantity: Types.Decimal128;
  lines: StockAdjustmentLineRecord[];
  submittedAt: Date | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  decisionReason: string | null;
  reversalReason: string | null;
  sourceType: 'MANUAL' | 'PHYSICAL_STOCK_COUNT' | 'PRODUCT_RECALL' | 'EXPIRY_JOB';
  sourceId: Types.ObjectId | null;
  stockPostingTransactionId: string | null;
  reversalTransactionId: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface PhysicalStockCountRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  countNumber: string;
  locationId: Types.ObjectId;
  scope: PhysicalStockCountScope;
  categoryId: Types.ObjectId | null;
  requestedByStaffId: Types.ObjectId;
  assignedToStaffId: Types.ObjectId | null;
  submittedByStaffId: Types.ObjectId | null;
  approvedByStaffId: Types.ObjectId | null;
  rejectedByStaffId: Types.ObjectId | null;
  cancelledByStaffId: Types.ObjectId | null;
  postedByStaffId: Types.ObjectId | null;
  reason: string;
  status: PhysicalStockCountStatus;
  snapshotAt: Date;
  snapshotLedgerSequence: number;
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
  expectedTotalQuantity: Types.Decimal128;
  actualTotalQuantity: Types.Decimal128 | null;
  absoluteVarianceQuantity: Types.Decimal128 | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
  postedAt: Date | null;
  decisionReason: string | null;
  generatedAdjustmentId: Types.ObjectId | null;
  attachmentIds: Types.ObjectId[];
}

export interface PhysicalStockCountItemRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  physicalStockCountId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  stockUnitId: Types.ObjectId;
  bucket: InventoryQuantityBucket;
  expectedQuantity: Types.Decimal128;
  actualQuantity: Types.Decimal128 | null;
  varianceQuantity: Types.Decimal128 | null;
  status: 'UNCOUNTED' | 'COUNTED' | 'RECOUNT_REQUIRED' | 'VARIANCE_ACCEPTED';
  countedAt: Date | null;
  countedByStaffId: Types.ObjectId | null;
  notes: string | null;
}

export interface ProductRecallRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  recallNumber: string;
  externalReference: string;
  title: string;
  reason: string;
  action: 'QUARANTINE' | 'BLOCK' | 'RETURN_TO_SUPPLIER' | 'DESTROY';
  initiatedByStaffId: Types.ObjectId;
  activatedByStaffId: Types.ObjectId | null;
  closedByStaffId: Types.ObjectId | null;
  cancelledByStaffId: Types.ObjectId | null;
  status: ProductRecallStatus;
  lineCount: number;
  affectedBatchCount: number;
  affectedStockQuantity: Types.Decimal128;
  activatedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  closeReason: string | null;
  attachmentIds: Types.ObjectId[];
}

export interface ProductRecallItemRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  productRecallId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId;
  status: 'PENDING' | 'NO_STOCK' | 'AFFECTED' | 'ACTIONED' | 'CLOSED';
  affectedOnHandQuantity: Types.Decimal128;
  quarantinedQuantity: Types.Decimal128;
  actionedAt: Date | null;
  actionedByStaffId: Types.ObjectId | null;
  notes: string | null;
}

export interface ReorderRuleRecord extends InventoryControlMetadataRecord {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  minimumStockLevel: Types.Decimal128;
  reorderLevel: Types.Decimal128;
  maximumStockLevel: Types.Decimal128 | null;
  safetyStockLevel: Types.Decimal128;
  criticalStockLevel: Types.Decimal128;
  preferredSupplierId: Types.ObjectId | null;
  active: boolean;
  notes: string | null;
}

export interface StockBalanceBucketSnapshot {
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  stockUnitId: Types.ObjectId;
  bucket: InventoryQuantityBucket;
  quantity: Types.Decimal128;
  lastLedgerSequence: number;
}

export interface RestrictionBalanceRecord {
  balanceId: Types.ObjectId;
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId;
  stockUnitId: Types.ObjectId;
  availableQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  quarantinedQuantity: Types.Decimal128;
  damagedQuantity: Types.Decimal128;
  expiredQuantity: Types.Decimal128;
}

export interface ExpirableBatchRecord {
  batchId: Types.ObjectId;
  itemId: Types.ObjectId;
  expiryDate: Date;
  status: string;
  recallStatus: string;
}

export interface RecallRestrictedBatchRecord {
  batchId: Types.ObjectId;
  itemId: Types.ObjectId;
  status: string;
  recallStatus: string;
  recallReference: string | null;
}

export interface LowStockMonitoringRecord {
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  itemCode: string;
  itemName: string;
  availableQuantity: Types.Decimal128;
  onHandQuantity: Types.Decimal128;
  criticalStockLevel: Types.Decimal128;
  minimumStockLevel: Types.Decimal128;
  reorderLevel: Types.Decimal128;
  maximumStockLevel: Types.Decimal128 | null;
  severity: 'CRITICAL' | 'LOW' | 'REORDER';
  preferredSupplierId: Types.ObjectId | null;
}

export interface NearExpiryMonitoringRecord {
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId;
  itemCode: string;
  itemName: string;
  manufacturerBatchNumber: string;
  expiryDate: Date;
  daysToExpiry: number;
  availableQuantity: Types.Decimal128;
  reservedQuantity: Types.Decimal128;
  quarantinedQuantity: Types.Decimal128;
  status: string;
}

export interface InventoryValuationRecord {
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  itemCode: string;
  itemName: string;
  quantity: Types.Decimal128;
  unitCost: Types.Decimal128;
  currency: string;
  extendedValue: Types.Decimal128;
}

export interface StockReconciliationRecord {
  locationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  projectedOnHandQuantity: Types.Decimal128;
  ledgerOnHandQuantity: Types.Decimal128;
  differenceQuantity: Types.Decimal128;
  lastLedgerSequence: number;
  movementCount: number;
  reconciled: boolean;
}