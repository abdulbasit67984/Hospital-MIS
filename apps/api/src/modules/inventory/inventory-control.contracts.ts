import type {
  InventoryQuantityBucket,
  PhysicalStockCountScope,
  PhysicalStockCountStatus,
  ProductRecallStatus,
  StockAdjustmentStatus,
  StockAdjustmentType,
} from '@hospital-mis/database';

import type {
  InventoryActorContext,
  InventoryObjectIdString,
} from './inventory.contracts.js';

export interface InventoryControlCommandContext {
  actor: InventoryActorContext;
  idempotencyKey: string;
}

export interface StockAdjustmentLineInput {
  itemId: InventoryObjectIdString;
  batchId?: InventoryObjectIdString | null;
  bucket: InventoryQuantityBucket;
  direction: 'INCREASE' | 'DECREASE';
  quantity: string;
  reasonCode: string;
  unitCost?: string | null;
  currency?: string | null;
  notes?: string | null;
}

export interface CreateStockAdjustmentInput {
  locationId: InventoryObjectIdString;
  adjustmentType: StockAdjustmentType;
  reason: string;
  attachmentIds?: readonly InventoryObjectIdString[];
  lines: readonly StockAdjustmentLineInput[];
}

export interface SubmitInventoryControlInput {
  expectedVersion: number;
  reason: string;
}

export interface DecideInventoryControlInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

export interface ReverseStockAdjustmentInput {
  expectedVersion: number;
  reason: string;
}

export interface PhysicalStockCountTargetInput {
  itemId: InventoryObjectIdString;
  batchId?: InventoryObjectIdString | null;
  bucket: InventoryQuantityBucket;
}

export interface CreatePhysicalStockCountInput {
  locationId: InventoryObjectIdString;
  scope: PhysicalStockCountScope;
  categoryId?: InventoryObjectIdString | null;
  assignedToStaffId?: InventoryObjectIdString | null;
  reason: string;
  attachmentIds?: readonly InventoryObjectIdString[];
  targets: readonly PhysicalStockCountTargetInput[];
}

export interface RecordPhysicalStockCountLineInput {
  expectedVersion: number;
  actualQuantity: string;
  notes?: string | null;
}

export interface ProductRecallBatchInput {
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString;
  notes?: string | null;
}

export interface CreateProductRecallInput {
  externalReference: string;
  title: string;
  reason: string;
  action:
    | 'QUARANTINE'
    | 'BLOCK'
    | 'RETURN_TO_SUPPLIER'
    | 'DESTROY';
  attachmentIds?: readonly InventoryObjectIdString[];
  batches: readonly ProductRecallBatchInput[];
}

export interface ActivateProductRecallInput {
  expectedVersion: number;
  reason: string;
}

export interface CloseProductRecallInput {
  expectedVersion: number;
  reason: string;
}

export interface UpsertReorderRuleInput {
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  expectedVersion?: number;
  minimumStockLevel: string;
  reorderLevel: string;
  maximumStockLevel?: string | null;
  safetyStockLevel: string;
  criticalStockLevel: string;
  preferredSupplierId?: InventoryObjectIdString | null;
  active?: boolean;
  notes?: string | null;
}

export interface RunInventoryRestrictionSweepInput {
  facilityId: InventoryObjectIdString;
  batchLimit?: number;
  occurredAt?: string;
}

export interface InventoryMonitoringQuery {
  locationId?: InventoryObjectIdString;
  itemId?: InventoryObjectIdString;
  categoryId?: InventoryObjectIdString;
  page: number;
  pageSize: number;
}

export interface NearExpiryInventoryQuery extends InventoryMonitoringQuery {
  expiresWithinDays: number;
  includeQuarantined?: boolean;
}

export interface InventoryValuationQuery extends InventoryMonitoringQuery {
  includeRestricted?: boolean;
}

export interface StockReconciliationQuery extends InventoryMonitoringQuery {
  onlyMismatches?: boolean;
}

export interface StockAdjustmentResponse {
  id: InventoryObjectIdString;
  adjustmentNumber: string;
  locationId: InventoryObjectIdString;
  adjustmentType: StockAdjustmentType;
  requestedByStaffId: InventoryObjectIdString;
  approvedByStaffId: InventoryObjectIdString | null;
  status: StockAdjustmentStatus;
  lineCount: number;
  totalAbsoluteStockQuantity: string;
  sourceType: string;
  sourceId: InventoryObjectIdString | null;
  stockPostingTransactionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhysicalStockCountResponse {
  id: InventoryObjectIdString;
  countNumber: string;
  locationId: InventoryObjectIdString;
  scope: PhysicalStockCountScope;
  categoryId: InventoryObjectIdString | null;
  requestedByStaffId: InventoryObjectIdString;
  assignedToStaffId: InventoryObjectIdString | null;
  status: PhysicalStockCountStatus;
  snapshotAt: string;
  snapshotLedgerSequence: number;
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
  expectedTotalQuantity: string;
  actualTotalQuantity: string | null;
  absoluteVarianceQuantity: string | null;
  generatedAdjustmentId: InventoryObjectIdString | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRecallResponse {
  id: InventoryObjectIdString;
  recallNumber: string;
  externalReference: string;
  title: string;
  action: string;
  status: ProductRecallStatus;
  lineCount: number;
  affectedBatchCount: number;
  affectedStockQuantity: string;
  activatedAt: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LowStockMonitoringRow {
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  itemCode: string;
  itemName: string;
  availableQuantity: string;
  onHandQuantity: string;
  criticalStockLevel: string;
  minimumStockLevel: string;
  reorderLevel: string;
  maximumStockLevel: string | null;
  severity: 'CRITICAL' | 'LOW' | 'REORDER';
  preferredSupplierId: InventoryObjectIdString | null;
}

export interface NearExpiryMonitoringRow {
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString;
  itemCode: string;
  itemName: string;
  manufacturerBatchNumber: string;
  expiryDate: string;
  daysToExpiry: number;
  availableQuantity: string;
  reservedQuantity: string;
  quarantinedQuantity: string;
  status: string;
}

export interface InventoryValuationRow {
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  itemCode: string;
  itemName: string;
  quantity: string;
  unitCost: string;
  currency: string;
  extendedValue: string;
}

export interface StockReconciliationRow {
  locationId: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  projectedOnHandQuantity: string;
  ledgerOnHandQuantity: string;
  differenceQuantity: string;
  lastLedgerSequence: number;
  movementCount: number;
  reconciled: boolean;
}

export interface InventoryRestrictionSweepResult {
  expiredBatchCount: number;
  recalledBatchCount: number;
  reclassifiedBalanceCount: number;
  postedMovementCount: number;
  skippedReservedBalanceCount: number;
}