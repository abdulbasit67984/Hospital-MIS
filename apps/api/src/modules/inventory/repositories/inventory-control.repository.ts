import Decimal from 'decimal.js';
import {
  Types,
  type ClientSession,
  type Query,
} from 'mongoose';

import {
  InventoryBatchModel,
  InventoryItemModel,
  PhysicalStockCountItemModel,
  PhysicalStockCountModel,
  ProductRecallItemModel,
  ProductRecallModel,
  ReorderRuleModel,
  StockAdjustmentModel,
  StockBalanceModel,
  StockMovementModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CreatePhysicalStockCountInput,
  CreateProductRecallInput,
  CreateStockAdjustmentInput,
  DecideInventoryControlInput,
  RecordPhysicalStockCountLineInput,
  ReverseStockAdjustmentInput,
  SubmitInventoryControlInput,
  UpsertReorderRuleInput,
} from '../inventory-control.contracts.js';

import type {
  CreatedPhysicalCountAggregate,
  CreatedProductRecallAggregate,
  InventoryControlRepositoryPort,
} from '../inventory-control.ports.js';

import type {
  InventoryBatchRecord,
} from '../inventory.persistence.types.js';

import type {
  ExpirableBatchRecord,
  InventoryControlMongoSession,
  PhysicalStockCountItemRecord,
  PhysicalStockCountRecord,
  RecallRestrictedBatchRecord,
  ProductRecallItemRecord,
  ProductRecallRecord,
  ReorderRuleRecord,
  RestrictionBalanceRecord,
  StockAdjustmentRecord,
  StockBalanceBucketSnapshot,
} from '../inventory-control.persistence.types.js';

import {
  normalizeInventoryDisplayText,
  normalizeNullableInventoryText,
} from '../inventory.normalization.js';

function record<T>(value: unknown): T {
  return value as T;
}

function decimal(value: string): Types.Decimal128 {
  return Types.Decimal128.fromString(value);
}

function decimalString(value: unknown): string {
  if (
    value != null &&
    typeof value === 'object' &&
    'toString' in value
  ) {
    return String(value);
  }

  return String(value);
}

function objectIdOrNull(
  value: string | null | undefined,
  path: string,
): Types.ObjectId | null {
  return value == null
    ? null
    : toObjectId(value, path);
}

function withSession<T>(
  query: Query<T, unknown>,
  session?: InventoryControlMongoSession,
): Query<T, unknown> {
  return session === undefined
    ? query
    : query.session(session);
}

function common(
  facilityId: string,
  actorUserId: string,
  transactionId: string,
  correlationId: string,
): Record<string, unknown> {
  const actorId = toObjectId(actorUserId, 'actorUserId');

  return {
    facilityId: toObjectId(facilityId, 'facilityId'),
    transactionId,
    correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function bucketField(bucket: string): string {
  switch (bucket) {
    case 'AVAILABLE':
      return 'availableQuantity';
    case 'RESERVED':
      return 'reservedQuantity';
    case 'QUARANTINED':
      return 'quarantinedQuantity';
    case 'DAMAGED':
      return 'damagedQuantity';
    case 'EXPIRED':
      return 'expiredQuantity';
    default:
      throw new ConflictError('Unsupported inventory quantity bucket');
  }
}

function sumAbsolute(
  values: readonly string[],
): string {
  return values
    .reduce(
      (total, value) => total.plus(new Decimal(value).abs()),
      new Decimal(0),
    )
    .toFixed();
}

export class InventoryControlRepository
implements InventoryControlRepositoryPort {
  public async withTransaction<T>(
    work: (
      session: InventoryControlMongoSession,
    ) => Promise<T>,
  ): Promise<T> {
    const session =
      await StockAdjustmentModel.db.startSession();

    try {
      let result: T | undefined;

      await session.withTransaction(async () => {
        result = await work(session);
      });

      if (result === undefined) {
        throw new Error(
          'Inventory-control transaction completed without a result',
        );
      }

      return result;
    } finally {
      await session.endSession();
    }
  }

  public async findBatchById(
    facilityId: string,
    batchId: string,
    session?: InventoryControlMongoSession,
  ): Promise<InventoryBatchRecord | null> {
    return record<InventoryBatchRecord | null>(
      await withSession(
        InventoryBatchModel.findOne({
          _id: toObjectId(batchId, 'batchId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select(
          '+costPrice +quarantineReason +recallReason +blockedReason +enteredInErrorReason',
        ),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findBucketSnapshot(
    facilityId: string,
    locationId: string,
    itemId: string,
    batchId: string | null,
    bucket: string,
    session?: InventoryControlMongoSession,
  ): Promise<StockBalanceBucketSnapshot> {
    const [balance, item] = await Promise.all([
      withSession(
        StockBalanceModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          storeLocationId: toObjectId(locationId, 'locationId'),
          itemId: toObjectId(itemId, 'itemId'),
          batchId:
            batchId === null
              ? null
              : toObjectId(batchId, 'batchId'),
        }).select(
          'availableQuantity reservedQuantity quarantinedQuantity damagedQuantity expiredQuantity lastLedgerSequence',
        ),
        session,
      )
        .lean()
        .exec(),

      withSession(
        InventoryItemModel.findOne({
          _id: toObjectId(itemId, 'itemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('stockUnitId'),
        session,
      )
        .lean()
        .exec(),
    ]);

    if (item === null) {
      throw new ConflictError(
        'Physical-count or adjustment item was not found in the facility',
      );
    }

    const field = bucketField(bucket);
    const quantity =
      balance === null
        ? Types.Decimal128.fromString('0')
        : record<Record<string, Types.Decimal128>>(balance)[field] ??
          Types.Decimal128.fromString('0');

    return {
      locationId: toObjectId(locationId, 'locationId'),
      itemId: toObjectId(itemId, 'itemId'),
      batchId:
        batchId === null
          ? null
          : toObjectId(batchId, 'batchId'),
      stockUnitId: item.stockUnitId,
      bucket: record<StockBalanceBucketSnapshot['bucket']>(bucket),
      quantity,
      lastLedgerSequence:
        balance?.lastLedgerSequence ?? 0,
    };
  }

  public async findLatestLedgerSequence(
    facilityId: string,
    locationId: string,
    session?: InventoryControlMongoSession,
  ): Promise<number> {
    const movement = await withSession(
      StockMovementModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        storeLocationId: toObjectId(locationId, 'locationId'),
      })
        .select('ledgerSequence')
        .sort({
          ledgerSequence: -1,
          _id: -1,
        }),
      session,
    )
      .lean()
      .exec();

    return movement?.ledgerSequence ?? 0;
  }

  public async createAdjustment(
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
  ): Promise<StockAdjustmentRecord> {
    const [created] = await StockAdjustmentModel.create(
      [
        {
          ...common(
            facilityId,
            actorUserId,
            prepared.transactionId,
            prepared.correlationId,
          ),
          adjustmentNumber: prepared.adjustmentNumber,
          locationId: toObjectId(input.locationId, 'locationId'),
          adjustmentType: input.adjustmentType,
          requestedByStaffId: toObjectId(
            prepared.requestedByStaffId,
            'requestedByStaffId',
          ),
          approvedByStaffId: null,
          postedByStaffId: null,
          rejectedByStaffId: null,
          cancelledByStaffId: null,
          reversedByStaffId: null,
          reason: normalizeInventoryDisplayText(input.reason),
          status: 'DRAFT',
          lineCount: prepared.lines.length,
          totalAbsoluteStockQuantity: decimal(
            sumAbsolute(prepared.lines.map((line) => line.quantity)),
          ),
          lines: prepared.lines.map((line, index) => ({
            lineNumber: index + 1,
            itemId: toObjectId(line.itemId, 'lines.itemId'),
            batchId: objectIdOrNull(line.batchId, 'lines.batchId'),
            stockUnitId: toObjectId(line.stockUnitId, 'lines.stockUnitId'),
            bucket: line.bucket,
            direction: line.direction,
            quantity: decimal(line.quantity),
            onHandDelta: decimal(line.onHandDelta),
            availableDelta: decimal(line.availableDelta),
            reservedDelta: decimal(line.reservedDelta),
            quarantinedDelta: decimal(line.quarantinedDelta),
            damagedDelta: decimal(line.damagedDelta),
            expiredDelta: decimal(line.expiredDelta),
            unitCost:
              line.unitCost === null
                ? null
                : decimal(line.unitCost),
            currency: line.currency,
            reasonCode: line.reasonCode.trim().toUpperCase(),
            notes: normalizeNullableInventoryText(line.notes),
          })),
          submittedAt: null,
          approvedAt: null,
          postedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          reversedAt: null,
          decisionReason: null,
          reversalReason: null,
          sourceType: prepared.sourceType,
          sourceId: objectIdOrNull(prepared.sourceId, 'sourceId'),
          stockPostingTransactionId: null,
          reversalTransactionId: null,
          attachmentIds: (input.attachmentIds ?? []).map((value) =>
            toObjectId(value, 'attachmentIds'),
          ),
        },
      ],
      {
        session,
        ordered: true,
      },
    );

    if (created === undefined) {
      throw new Error('Stock adjustment was not created');
    }

    return record<StockAdjustmentRecord>(created.toObject());
  }

  public async findAdjustment(
    facilityId: string,
    adjustmentId: string,
    session?: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null> {
    return record<StockAdjustmentRecord | null>(
      await withSession(
        StockAdjustmentModel.findOne({
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select(
          '+reason +decisionReason +reversalReason +lines.notes',
        ),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async submitAdjustment(
    facilityId: string,
    adjustmentId: string,
    input: SubmitInventoryControlInput,
    actorUserId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null> {
    return record<StockAdjustmentRecord | null>(
      await StockAdjustmentModel.findOneAndUpdate(
        {
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'DRAFT',
        },
        {
          $set: {
            status: 'SUBMITTED',
            submittedAt: occurredAt,
            decisionReason: normalizeInventoryDisplayText(input.reason),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason +reversalReason +lines.notes')
        .lean()
        .exec(),
    );
  }

  public async decideAdjustment(
    facilityId: string,
    adjustmentId: string,
    input: DecideInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null> {
    const approved = input.decision === 'APPROVE';

    return record<StockAdjustmentRecord | null>(
      await StockAdjustmentModel.findOneAndUpdate(
        {
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'SUBMITTED',
          requestedByStaffId: {
            $ne: toObjectId(actorStaffId, 'actorStaffId'),
          },
        },
        {
          $set: approved
            ? {
                status: 'APPROVED',
                approvedAt: occurredAt,
                approvedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
                decisionReason: normalizeInventoryDisplayText(input.reason),
                updatedBy: toObjectId(actorUserId, 'actorUserId'),
              }
            : {
                status: 'REJECTED',
                rejectedAt: occurredAt,
                rejectedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
                decisionReason: normalizeInventoryDisplayText(input.reason),
                updatedBy: toObjectId(actorUserId, 'actorUserId'),
              },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason +reversalReason +lines.notes')
        .lean()
        .exec(),
    );
  }

  public async markAdjustmentPosted(
    facilityId: string,
    adjustmentId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    stockPostingTransactionId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null> {
    return record<StockAdjustmentRecord | null>(
      await StockAdjustmentModel.findOneAndUpdate(
        {
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'APPROVED',
        },
        {
          $set: {
            status: 'POSTED',
            postedAt: occurredAt,
            postedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            stockPostingTransactionId,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason +reversalReason +lines.notes')
        .lean()
        .exec(),
    );
  }

  public async markAdjustmentReversed(
    facilityId: string,
    adjustmentId: string,
    input: ReverseStockAdjustmentInput,
    actorUserId: string,
    actorStaffId: string,
    reversalTransactionId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<StockAdjustmentRecord | null> {
    return record<StockAdjustmentRecord | null>(
      await StockAdjustmentModel.findOneAndUpdate(
        {
          _id: toObjectId(adjustmentId, 'adjustmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'POSTED',
        },
        {
          $set: {
            status: 'REVERSED',
            reversedAt: occurredAt,
            reversedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            reversalReason: normalizeInventoryDisplayText(input.reason),
            reversalTransactionId,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason +reversalReason +lines.notes')
        .lean()
        .exec(),
    );
  }

  public async createPhysicalCount(
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
  ): Promise<CreatedPhysicalCountAggregate> {
    const expectedTotal = prepared.lines.reduce(
      (total, line) => total.plus(decimalString(line.quantity)),
      new Decimal(0),
    );

    const [createdCount] = await PhysicalStockCountModel.create(
      [
        {
          ...common(
            facilityId,
            actorUserId,
            prepared.transactionId,
            prepared.correlationId,
          ),
          countNumber: prepared.countNumber,
          locationId: toObjectId(input.locationId, 'locationId'),
          scope: input.scope,
          categoryId: objectIdOrNull(input.categoryId, 'categoryId'),
          requestedByStaffId: toObjectId(
            prepared.requestedByStaffId,
            'requestedByStaffId',
          ),
          assignedToStaffId: objectIdOrNull(
            input.assignedToStaffId,
            'assignedToStaffId',
          ),
          submittedByStaffId: null,
          approvedByStaffId: null,
          rejectedByStaffId: null,
          cancelledByStaffId: null,
          postedByStaffId: null,
          reason: normalizeInventoryDisplayText(input.reason),
          status: 'DRAFT',
          snapshotAt: prepared.occurredAt,
          snapshotLedgerSequence: prepared.snapshotLedgerSequence,
          lineCount: prepared.lines.length,
          countedLineCount: 0,
          varianceLineCount: 0,
          expectedTotalQuantity: decimal(expectedTotal.toFixed()),
          actualTotalQuantity: null,
          absoluteVarianceQuantity: null,
          startedAt: null,
          submittedAt: null,
          approvedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          postedAt: null,
          decisionReason: null,
          generatedAdjustmentId: null,
          attachmentIds: (input.attachmentIds ?? []).map((value) =>
            toObjectId(value, 'attachmentIds'),
          ),
        },
      ],
      {
        session,
        ordered: true,
      },
    );

    if (createdCount === undefined) {
      throw new Error('Physical stock count was not created');
    }

    const items = await PhysicalStockCountItemModel.create(
      prepared.lines.map((line, index) => ({
        ...common(
          facilityId,
          actorUserId,
          prepared.transactionId,
          prepared.correlationId,
        ),
        physicalStockCountId: createdCount._id,
        lineNumber: index + 1,
        itemId: line.itemId,
        batchId: line.batchId,
        stockUnitId: line.stockUnitId,
        bucket: line.bucket,
        expectedQuantity: line.quantity,
        actualQuantity: null,
        varianceQuantity: null,
        status: 'UNCOUNTED',
        countedAt: null,
        countedByStaffId: null,
        notes: null,
      })),
      {
        session,
        ordered: true,
      },
    );

    return {
      count: record<PhysicalStockCountRecord>(createdCount.toObject()),
      items: items.map((item) =>
        record<PhysicalStockCountItemRecord>(item.toObject()),
      ),
    };
  }

  public async findPhysicalCount(
    facilityId: string,
    countId: string,
    session?: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    return record<PhysicalStockCountRecord | null>(
      await withSession(
        PhysicalStockCountModel.findOne({
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+reason +decisionReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findPhysicalCountItems(
    facilityId: string,
    countId: string,
    session?: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountItemRecord[]> {
    return record<PhysicalStockCountItemRecord[]>(
      await withSession(
        PhysicalStockCountItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          physicalStockCountId: toObjectId(countId, 'countId'),
        })
          .select('+notes')
          .sort({
            lineNumber: 1,
            _id: 1,
          }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async startPhysicalCount(
    facilityId: string,
    countId: string,
    expectedVersion: number,
    actorUserId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    return record<PhysicalStockCountRecord | null>(
      await PhysicalStockCountModel.findOneAndUpdate(
        {
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'DRAFT',
        },
        {
          $set: {
            status: 'IN_PROGRESS',
            startedAt: occurredAt,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason')
        .lean()
        .exec(),
    );
  }

  public async recordPhysicalCountLine(
    facilityId: string,
    countId: string,
    countItemId: string,
    input: RecordPhysicalStockCountLineInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountItemRecord | null> {
    const current = await withSession(
      PhysicalStockCountItemModel.findOne({
        _id: toObjectId(countItemId, 'countItemId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        physicalStockCountId: toObjectId(countId, 'countId'),
        version: input.expectedVersion,
      }).select('+notes'),
      session,
    )
      .lean()
      .exec();

    if (current === null) {
      return null;
    }

    const variance = new Decimal(input.actualQuantity).minus(
      decimalString(current.expectedQuantity),
    );

    return record<PhysicalStockCountItemRecord | null>(
      await PhysicalStockCountItemModel.findOneAndUpdate(
        {
          _id: current._id,
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: {
            actualQuantity: decimal(input.actualQuantity),
            varianceQuantity: decimal(variance.toFixed()),
            status: 'COUNTED',
            countedAt: occurredAt,
            countedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            notes: normalizeNullableInventoryText(input.notes),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+notes')
        .lean()
        .exec(),
    );
  }

  public async recomputePhysicalCountTotals(
    facilityId: string,
    countId: string,
    actorUserId: string,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    const items = await this.findPhysicalCountItems(
      facilityId,
      countId,
      session,
    );

    const counted = items.filter((item) => item.actualQuantity !== null);
    const actual = counted.reduce(
      (total, item) => total.plus(decimalString(item.actualQuantity)),
      new Decimal(0),
    );
    const absoluteVariance = counted.reduce(
      (total, item) =>
        total.plus(new Decimal(decimalString(item.varianceQuantity)).abs()),
      new Decimal(0),
    );
    const varianceLineCount = counted.filter(
      (item) => !new Decimal(decimalString(item.varianceQuantity)).eq(0),
    ).length;

    return record<PhysicalStockCountRecord | null>(
      await PhysicalStockCountModel.findOneAndUpdate(
        {
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: {
            $in: [
              'DRAFT',
              'IN_PROGRESS',
              'SUBMITTED',
            ],
          },
        },
        {
          $set: {
            countedLineCount: counted.length,
            varianceLineCount,
            actualTotalQuantity: decimal(actual.toFixed()),
            absoluteVarianceQuantity: decimal(absoluteVariance.toFixed()),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason')
        .lean()
        .exec(),
    );
  }

  public async submitPhysicalCount(
    facilityId: string,
    countId: string,
    input: SubmitInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    return record<PhysicalStockCountRecord | null>(
      await PhysicalStockCountModel.findOneAndUpdate(
        {
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'IN_PROGRESS',
          $expr: {
            $eq: [
              '$lineCount',
              '$countedLineCount',
            ],
          },
        },
        {
          $set: {
            status: 'SUBMITTED',
            submittedAt: occurredAt,
            submittedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            decisionReason: normalizeInventoryDisplayText(input.reason),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason')
        .lean()
        .exec(),
    );
  }

  public async decidePhysicalCount(
    facilityId: string,
    countId: string,
    input: DecideInventoryControlInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    generatedAdjustmentId: string | null,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    const approved = input.decision === 'APPROVE';

    return record<PhysicalStockCountRecord | null>(
      await PhysicalStockCountModel.findOneAndUpdate(
        {
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'SUBMITTED',
          requestedByStaffId: {
            $ne: toObjectId(actorStaffId, 'actorStaffId'),
          },
        },
        {
          $set: approved
            ? {
                status: 'APPROVED',
                approvedAt: occurredAt,
                approvedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
                decisionReason: normalizeInventoryDisplayText(input.reason),
                generatedAdjustmentId: objectIdOrNull(
                  generatedAdjustmentId,
                  'generatedAdjustmentId',
                ),
                updatedBy: toObjectId(actorUserId, 'actorUserId'),
              }
            : {
                status: 'REJECTED',
                rejectedAt: occurredAt,
                rejectedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
                decisionReason: normalizeInventoryDisplayText(input.reason),
                updatedBy: toObjectId(actorUserId, 'actorUserId'),
              },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason')
        .lean()
        .exec(),
    );
  }

  public async markPhysicalCountPosted(
    facilityId: string,
    countId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    adjustmentId: string | null,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<PhysicalStockCountRecord | null> {
    return record<PhysicalStockCountRecord | null>(
      await PhysicalStockCountModel.findOneAndUpdate(
        {
          _id: toObjectId(countId, 'countId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'APPROVED',
          generatedAdjustmentId:
            adjustmentId === null
              ? null
              : toObjectId(adjustmentId, 'adjustmentId'),
        },
        {
          $set: {
            status: 'POSTED',
            postedAt: occurredAt,
            postedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +decisionReason')
        .lean()
        .exec(),
    );
  }

  public async createProductRecall(
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
  ): Promise<CreatedProductRecallAggregate> {
    const [createdRecall] = await ProductRecallModel.create(
      [
        {
          ...common(
            facilityId,
            actorUserId,
            prepared.transactionId,
            prepared.correlationId,
          ),
          recallNumber: prepared.recallNumber,
          externalReference: normalizeInventoryDisplayText(
            input.externalReference,
          ),
          title: normalizeInventoryDisplayText(input.title),
          reason: normalizeInventoryDisplayText(input.reason),
          action: input.action,
          initiatedByStaffId: toObjectId(
            prepared.initiatedByStaffId,
            'initiatedByStaffId',
          ),
          activatedByStaffId: null,
          closedByStaffId: null,
          cancelledByStaffId: null,
          status: 'DRAFT',
          lineCount: input.batches.length,
          affectedBatchCount: 0,
          affectedStockQuantity: decimal('0'),
          activatedAt: null,
          closedAt: null,
          cancelledAt: null,
          closeReason: null,
          attachmentIds: (input.attachmentIds ?? []).map((value) =>
            toObjectId(value, 'attachmentIds'),
          ),
        },
      ],
      {
        session,
        ordered: true,
      },
    );

    if (createdRecall === undefined) {
      throw new Error('Product recall was not created');
    }

    const items = await ProductRecallItemModel.create(
      input.batches.map((line, index) => ({
        ...common(
          facilityId,
          actorUserId,
          prepared.transactionId,
          prepared.correlationId,
        ),
        productRecallId: createdRecall._id,
        lineNumber: index + 1,
        itemId: toObjectId(line.itemId, 'batches.itemId'),
        batchId: toObjectId(line.batchId, 'batches.batchId'),
        status: 'PENDING',
        affectedOnHandQuantity: decimal('0'),
        quarantinedQuantity: decimal('0'),
        actionedAt: null,
        actionedByStaffId: null,
        notes: normalizeNullableInventoryText(line.notes),
      })),
      {
        session,
        ordered: true,
      },
    );

    return {
      recall: record<ProductRecallRecord>(createdRecall.toObject()),
      items: items.map((item) =>
        record<ProductRecallItemRecord>(item.toObject()),
      ),
    };
  }

  public async findProductRecall(
    facilityId: string,
    recallId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null> {
    return record<ProductRecallRecord | null>(
      await withSession(
        ProductRecallModel.findOne({
          _id: toObjectId(recallId, 'recallId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+reason +closeReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findProductRecallItems(
    facilityId: string,
    recallId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ProductRecallItemRecord[]> {
    return record<ProductRecallItemRecord[]>(
      await withSession(
        ProductRecallItemModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          productRecallId: toObjectId(recallId, 'recallId'),
        })
          .select('+notes')
          .sort({
            lineNumber: 1,
            _id: 1,
          }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findRestrictionBalances(
    facilityId: string,
    batchId: string,
    session?: InventoryControlMongoSession,
  ): Promise<RestrictionBalanceRecord[]> {
    const balances = await withSession(
      StockBalanceModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        batchId: toObjectId(batchId, 'batchId'),
        $or: [
          {
            availableQuantity: {
              $gt: decimal('0'),
            },
          },
          {
            reservedQuantity: {
              $gt: decimal('0'),
            },
          },
        ],
      }).select(
        '_id storeLocationId itemId batchId availableQuantity reservedQuantity quarantinedQuantity damagedQuantity expiredQuantity',
      ),
      session,
    )
      .lean()
      .exec();

    if (balances.length === 0) {
      return [];
    }

    const itemIds = [
      ...new Set(
        balances.map((balance) => balance.itemId.toHexString()),
      ),
    ];

    const items = await withSession(
      InventoryItemModel.find({
        _id: {
          $in: itemIds.map((value) => toObjectId(value, 'itemIds')),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
      }).select('_id stockUnitId'),
      session,
    )
      .lean()
      .exec();

    const stockUnits = new Map(
      items.map((item) => [
        item._id.toHexString(),
        item.stockUnitId,
      ]),
    );

    return balances.map((balance) => {
      const stockUnitId = stockUnits.get(balance.itemId.toHexString());

      if (stockUnitId === undefined) {
        throw new ConflictError(
          'Restricted stock references an unavailable inventory item',
        );
      }

      return {
        balanceId: balance._id,
        locationId: balance.storeLocationId,
        itemId: balance.itemId,
        batchId: balance.batchId as Types.ObjectId,
        stockUnitId,
        availableQuantity: balance.availableQuantity,
        reservedQuantity: balance.reservedQuantity,
        quarantinedQuantity: balance.quarantinedQuantity,
        damagedQuantity: balance.damagedQuantity,
        expiredQuantity: balance.expiredQuantity,
      };
    });
  }

  public async activateProductRecall(
    facilityId: string,
    recallId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    affectedStockQuantity: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null> {
    return record<ProductRecallRecord | null>(
      await ProductRecallModel.findOneAndUpdate(
        {
          _id: toObjectId(recallId, 'recallId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'DRAFT',
          initiatedByStaffId: {
            $ne: toObjectId(actorStaffId, 'actorStaffId'),
          },
        },
        {
          $set: {
            status: 'ACTIVE',
            activatedAt: occurredAt,
            activatedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            affectedBatchCount: await ProductRecallItemModel.countDocuments({
              facilityId: toObjectId(facilityId, 'facilityId'),
              productRecallId: toObjectId(recallId, 'recallId'),
            }).session(session),
            affectedStockQuantity: decimal(affectedStockQuantity),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +closeReason')
        .lean()
        .exec(),
    );
  }

  public async markRecallItemsActioned(
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
  ): Promise<void> {
    const items = await this.findProductRecallItems(
      facilityId,
      recallId,
      session,
    );

    for (const item of items) {
      const quantities = quantitiesByItemId.get(item._id.toHexString()) ?? {
        affectedStockQuantity: '0',
        quarantinedQuantity: '0',
      };
      const hasStock = new Decimal(quantities.affectedStockQuantity).gt(0);

      const result = await ProductRecallItemModel.updateOne(
        {
          _id: item._id,
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: item.version,
          status: 'PENDING',
        },
        {
          $set: {
            status: hasStock ? 'ACTIONED' : 'NO_STOCK',
            affectedOnHandQuantity: decimal(quantities.affectedStockQuantity),
            quarantinedQuantity: decimal(quantities.quarantinedQuantity),
            actionedAt: occurredAt,
            actionedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      );

      if (result.modifiedCount !== 1) {
        throw new ConflictError(
          'A product-recall line changed before activation completed',
        );
      }
    }
  }

  public async closeProductRecall(
    facilityId: string,
    recallId: string,
    expectedVersion: number,
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ProductRecallRecord | null> {
    const updated = record<ProductRecallRecord | null>(
      await ProductRecallModel.findOneAndUpdate(
        {
          _id: toObjectId(recallId, 'recallId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: 'ACTIVE',
        },
        {
          $set: {
            status: 'CLOSED',
            closedAt: occurredAt,
            closedByStaffId: toObjectId(actorStaffId, 'actorStaffId'),
            closeReason: normalizeInventoryDisplayText(reason),
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select('+reason +closeReason')
        .lean()
        .exec(),
    );

    if (updated !== null) {
      await ProductRecallItemModel.updateMany(
        {
          facilityId: toObjectId(facilityId, 'facilityId'),
          productRecallId: toObjectId(recallId, 'recallId'),
          status: {
            $in: [
              'NO_STOCK',
              'ACTIONED',
            ],
          },
        },
        {
          $set: {
            status: 'CLOSED',
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      );
    }

    return updated;
  }

  public async markBatchRestricted(
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
  ): Promise<boolean> {
    const actorId = toObjectId(input.actorUserId, 'actorUserId');
    const setValues: Record<string, unknown> = {
      status: input.status,
      updatedBy: actorId,
    };

    if (input.status === 'QUARANTINED') {
      setValues['quarantineAt'] = input.occurredAt;
      setValues['quarantinedBy'] = actorId;
      setValues['quarantineReason'] = input.reason;
    }

    if (input.status === 'BLOCKED') {
      setValues['blockedAt'] = input.occurredAt;
      setValues['blockedBy'] = actorId;
      setValues['blockedReason'] = input.reason;
    }

    if (input.status === 'RECALLED' || input.recallStatus !== undefined) {
      setValues['recallStatus'] = input.recallStatus ?? 'ACTIVE';
      setValues['recallReference'] = input.recallReference ?? `RECALL-${batchId}`;
      setValues['recalledAt'] = input.occurredAt;
      setValues['recalledBy'] = actorId;
      setValues['recallReason'] = input.reason;
    }

    if (input.status === 'EXPIRED') {
      setValues['blockedAt'] = input.occurredAt;
      setValues['blockedBy'] = actorId;
      setValues['blockedReason'] = input.reason;
    }

    const result = await InventoryBatchModel.updateOne(
      {
        _id: toObjectId(batchId, 'batchId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        enteredInErrorAt: null,
        status: {
          $nin: [
            'DEPLETED',
            'ENTERED_IN_ERROR',
          ],
        },
      },
      {
        $set: setValues,
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    );

    return result.matchedCount === 1;
  }

  public async listExpirableBatches(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<ExpirableBatchRecord[]> {
    const balanceBatchIds = await StockBalanceModel.distinct('batchId', {
      facilityId: toObjectId(facilityId, 'facilityId'),
      batchId: {
        $type: 'objectId',
      },
      $or: [
        {
          availableQuantity: {
            $gt: decimal('0'),
          },
        },
        {
          reservedQuantity: {
            $gt: decimal('0'),
          },
        },
      ],
    }).exec();

    const batches = await InventoryBatchModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      expiryDate: {
        $ne: null,
        $lte: at,
      },
      $or: [
        {
          status: {
            $in: [
              'ACTIVE',
              'QUARANTINED',
              'BLOCKED',
              'RECALLED',
            ],
          },
        },
        {
          status: 'EXPIRED',
          _id: {
            $in: balanceBatchIds,
          },
        },
      ],
      enteredInErrorAt: null,
    })
      .select('_id itemId expiryDate status recallStatus')
      .sort({
        expiryDate: 1,
        _id: 1,
      })
      .limit(Math.max(1, Math.min(limit, 5_000)))
      .lean()
      .exec();

    return batches
      .filter(
        (batch): batch is typeof batch & { expiryDate: Date } =>
          batch.expiryDate !== null,
      )
      .map((batch) => ({
        batchId: batch._id,
        itemId: batch.itemId,
        expiryDate: batch.expiryDate,
        status: batch.status,
        recallStatus: batch.recallStatus,
      }));
  }

  public async listRecallRestrictedBatches(
    facilityId: string,
    limit: number,
  ): Promise<RecallRestrictedBatchRecord[]> {
    const balanceBatchIds = await StockBalanceModel.distinct('batchId', {
      facilityId: toObjectId(facilityId, 'facilityId'),
      batchId: {
        $type: 'objectId',
      },
      availableQuantity: {
        $gt: decimal('0'),
      },
    }).exec();

    if (balanceBatchIds.length === 0) {
      return [];
    }

    const batches = await InventoryBatchModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      _id: {
        $in: balanceBatchIds,
      },
      recallStatus: {
        $ne: 'NONE',
      },
      status: {
        $in: [
          'RECALLED',
          'BLOCKED',
        ],
      },
      enteredInErrorAt: null,
    })
      .select('_id itemId status recallStatus recallReference')
      .sort({
        recalledAt: 1,
        _id: 1,
      })
      .limit(Math.max(1, Math.min(limit, 5_000)))
      .lean()
      .exec();

    return batches.map((batch) => ({
      batchId: batch._id,
      itemId: batch.itemId,
      status: batch.status,
      recallStatus: batch.recallStatus,
      recallReference: batch.recallReference ?? null,
    }));
  }

  public async findReorderRule(
    facilityId: string,
    locationId: string,
    itemId: string,
    session?: InventoryControlMongoSession,
  ): Promise<ReorderRuleRecord | null> {
    return record<ReorderRuleRecord | null>(
      await withSession(
        ReorderRuleModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          locationId: toObjectId(locationId, 'locationId'),
          itemId: toObjectId(itemId, 'itemId'),
        }).select('+notes'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async upsertReorderRule(
    facilityId: string,
    input: UpsertReorderRuleInput,
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    occurredAt: Date,
    session: InventoryControlMongoSession,
  ): Promise<ReorderRuleRecord | null> {
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      locationId: toObjectId(input.locationId, 'locationId'),
      itemId: toObjectId(input.itemId, 'itemId'),
    };

    if (input.expectedVersion !== undefined) {
      filter['version'] = input.expectedVersion;
    }

    const actorId = toObjectId(actorUserId, 'actorUserId');

    return record<ReorderRuleRecord | null>(
      await ReorderRuleModel.findOneAndUpdate(
        filter,
        {
          $set: {
            minimumStockLevel: decimal(input.minimumStockLevel),
            reorderLevel: decimal(input.reorderLevel),
            maximumStockLevel:
              input.maximumStockLevel == null
                ? null
                : decimal(input.maximumStockLevel),
            safetyStockLevel: decimal(input.safetyStockLevel),
            criticalStockLevel: decimal(input.criticalStockLevel),
            preferredSupplierId: objectIdOrNull(
              input.preferredSupplierId,
              'preferredSupplierId',
            ),
            active: input.active ?? true,
            notes: normalizeNullableInventoryText(input.notes),
            updatedBy: actorId,
            transactionId,
            correlationId,
          },
          $setOnInsert: {
            facilityId: toObjectId(facilityId, 'facilityId'),
            locationId: toObjectId(input.locationId, 'locationId'),
            itemId: toObjectId(input.itemId, 'itemId'),
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            createdAt: occurredAt,
          },
          $inc: {
            version: input.expectedVersion === undefined ? 0 : 1,
          },
        },
        {
          new: true,
          upsert: input.expectedVersion === undefined,
          session,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
        .select('+notes')
        .lean()
        .exec(),
    );
  }
}