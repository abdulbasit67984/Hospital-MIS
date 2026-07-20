import type {
  InventoryAccessPolicyPort,
  InventoryCatalogRepositoryPort,
  InventoryClockPort,
  InventoryContextPort,
} from './inventory.ports.js';

import type {
  InventoryBatchRecord,
} from './inventory.persistence.types.js';

import type {
  InventoryProcurementAttachmentPort,
  InventoryProcurementAuditPort,
  InventoryProcurementOutboxPort,
  InventoryProcurementRealtimePort,
  InventoryProcurementSequencePort,
  InventoryProcurementTransactionManagerPort,
} from './inventory-procurement.ports.js';

import type {
  InventoryStockPostingPort,
} from './inventory-stock.ports.js';

import type {
  CreatePhysicalStockCountInput,
  CreateProductRecallInput,
  CreateStockAdjustmentInput,
  DecideInventoryControlInput,
  InventoryMonitoringQuery,
  InventoryValuationQuery,
  NearExpiryInventoryQuery,
  RecordPhysicalStockCountLineInput,
  ReverseStockAdjustmentInput,
  StockReconciliationQuery,
  SubmitInventoryControlInput,
  UpsertReorderRuleInput,
} from './inventory-control.contracts.js';

import type {
  ExpirableBatchRecord,
  InventoryControlMongoSession,
  InventoryValuationRecord,
  LowStockMonitoringRecord,
  NearExpiryMonitoringRecord,
  PhysicalStockCountItemRecord,
  PhysicalStockCountRecord,
  ProductRecallItemRecord,
  ProductRecallRecord,
  RecallRestrictedBatchRecord,
  ReorderRuleRecord,
  RestrictionBalanceRecord,
  StockAdjustmentRecord,
  StockBalanceBucketSnapshot,
  StockReconciliationRecord,
} from './inventory-control.persistence.types.js';

export interface CreatedPhysicalCountAggregate {
  count: PhysicalStockCountRecord;
  items: PhysicalStockCountItemRecord[];
}

export interface CreatedProductRecallAggregate {
  recall: ProductRecallRecord;
  items: ProductRecallItemRecord[];
}

export interface InventoryControlPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface InventoryControlRepositoryPort {
  withTransaction<T>(
    work: (
      session: InventoryControlMongoSession,
    ) => Promise<T>,
  ): Promise<T>;

  findBatchById(
    facilityId: string,
    batchId: string,
    session?: InventoryControlMongoSession,
  ): Promise<InventoryBatchRecord | null>;

  findBucketSnapshot(
    facilityId: string,
    locationId: string,
    itemId: string,
    batchId: string | null,
    bucket: string,
    session?: InventoryControlMongoSession,
  ): Promise<StockBalanceBucketSnapshot>;

  findLatestLedgerSequence(
    facilityId: string,
    locationId: string,
    session?: InventoryControlMongoSession,
  ): Promise<number>;

  createAdjustment(
    input: CreateStockAdjustmentInput,
    prepared: Readonly<{
      adjustmentNumber: string;
      requestedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      sourceType: 'MANUAL' | 'PHYSICAL_STOCK_COUNT' | 'PRODUCT_RECALL' | 'EXPIRY_JOB';
      sourceId: string | null;
      lines: readonly {
        itemId: string;
        batchId: string | null;
        stockUnitId: string;
        bucket: string;
        direction: 'INCREASE' | 'DECREASE';
        quantity: string;
        onHandDelta: string;
        availableDelta: string;
        reservedDelta: string;
        quarantinedDelta: string;
        damagedDelta: string;
        expiredDelta: string;
        unitCost: string | null;
        currency: string | null;
        reasonCode: string;
        notes: string | null;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord>;

  findAdjustment(
    facilityId: string,
    adjustmentId: string,
    session?: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null>;

  submitAdjustment(
    facilityId: string,
    adjustmentId: string,
    input: SubmitInventoryControlInput,
    actorUserId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null>;

  decideAdjustment(
    facilityId: string,
    adjustmentId: string,
    input: DecideInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null>;

  markAdjustmentPosted(
    facilityId: string,
    adjustmentId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    stockPostingTransactionId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null>;

  markAdjustmentReversed(
    facilityId: string,
    adjustmentId: string,
    input: ReverseStockAdjustmentInput,
    actorUserId: string,
    actorStaffId: string,
    reversalTransactionId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null>;

  createPhysicalCount(
    input: CreatePhysicalStockCountInput,
    prepared: Readonly<{
      countNumber: string;
      requestedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      snapshotLedgerSequence: number;
      lines: readonly StockBalanceBucketSnapshot[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryControlMongoSession,
  ): Promise<CreatedPhysicalCountAggregate>;

  findPhysicalCount(
    facilityId: string,
    countId: string,
    session?: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  findPhysicalCountItems(
    facilityId: string,
    countId: string,
    session?: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountItemRecord[]>;

  startPhysicalCount(
    facilityId: string,
    countId: string,
    expectedVersion: number,
    actorUserId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  recordPhysicalCountLine(
    facilityId: string,
    countId: string,
    countItemId: string,
    input: RecordPhysicalStockCountLineInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountItemRecord | null>;

  recomputePhysicalCountTotals(
    facilityId: string,
    countId: string,
    actorUserId: string,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  submitPhysicalCount(
    facilityId: string,
    countId: string,
    input: SubmitInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  decidePhysicalCount(
    facilityId: string,
    countId: string,
    input: DecideInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    generatedAdjustmentId: string | null,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  markPhysicalCountPosted(
    facilityId: string,
    countId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    adjustmentId: string | null,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null>;

  createProductRecall(
    input: CreateProductRecallInput,
    prepared: Readonly<{
      recallNumber: string;
      initiatedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryControlMongoSession,
  ): Promise<CreatedProductRecallAggregate>;

  findProductRecall(
    facilityId: string,
    recallId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null>;

  findProductRecallItems(
    facilityId: string,
    recallId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ProductRecallItemRecord[]>;

  findRestrictionBalances(
    facilityId: string,
    batchId: string,
    session?: InventoryControlMongoSession,
  ): Promise<RestrictionBalanceRecord[]>;

  activateProductRecall(
    facilityId: string,
    recallId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    affectedStockQuantity: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null>;

  markRecallItemsActioned(
    facilityId: string,
    recallId: string,
    actorUserId: string,
    actorStaffId: string,
    quantitiesByItemId: ReadonlyMap<
      string,
      Readonly<{
        affectedStockQuantity: string;
        quarantinedQuantity: string;
      }>
    >,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<void>;

  closeProductRecall(
    facilityId: string,
    recallId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null>;

  markBatchRestricted(
    facilityId: string,
    batchId: string,
    input: Readonly<{
      status: 'QUARANTINED' | 'RECALLED' | 'BLOCKED' | 'EXPIRED';
      recallStatus?: 'INITIATED' | 'ACTIVE' | 'CLOSED';
      recallReference?: string;
      reason: string;
      actorUserId: string;
      occurredAt: Date;
    }>,
    session: InventoryControlMongoSession,
  ): Promise<boolean>;

  listExpirableBatches(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<ExpirableBatchRecord[]>;

  listRecallRestrictedBatches(
    facilityId: string,
    limit: number,
  ): Promise<RecallRestrictedBatchRecord[]>;

  findReorderRule(
    facilityId: string,
    locationId: string,
    itemId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ReorderRuleRecord | null>;

  upsertReorderRule(
    facilityId: string,
    input: UpsertReorderRuleInput,
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ReorderRuleRecord | null>;
}

export interface InventoryMonitoringRepositoryPort {
  listLowStock(
    facilityId: string,
    query: InventoryMonitoringQuery,
  ): Promise<InventoryControlPage<LowStockMonitoringRecord>>;

  listNearExpiry(
    facilityId: string,
    query: NearExpiryInventoryQuery,
  ): Promise<InventoryControlPage<NearExpiryMonitoringRecord>>;

  listValuation(
    facilityId: string,
    query: InventoryValuationQuery,
  ): Promise<InventoryControlPage<InventoryValuationRecord>>;

  listReconciliation(
    facilityId: string,
    query: StockReconciliationQuery,
  ): Promise<InventoryControlPage<StockReconciliationRecord>>;
}

export interface InventoryControlDependencies {
  catalog: InventoryCatalogRepositoryPort;
  context: InventoryContextPort;
  accessPolicy: InventoryAccessPolicyPort;
  repository: InventoryControlRepositoryPort;
  monitoring: InventoryMonitoringRepositoryPort;
  stockPosting: InventoryStockPostingPort;
  transactionManager: InventoryProcurementTransactionManagerPort;
  audit: InventoryProcurementAuditPort;
  outbox: InventoryProcurementOutboxPort;
  realtime: InventoryProcurementRealtimePort;
  sequence: InventoryProcurementSequencePort;
  attachments: InventoryProcurementAttachmentPort;
  clock: InventoryClockPort;
}