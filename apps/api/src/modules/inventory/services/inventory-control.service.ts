import Decimal from 'decimal.js';

import {
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  InventoryAccessDecision,
} from '../inventory.ports.js';

import type {
  InventoryProcurementTransactionContext,
} from '../inventory-procurement.ports.js';

import type {
  StockLedgerEntryInput,
} from '../inventory-stock.persistence.types.js';

import type {
  ActivateProductRecallInput,
  CreatePhysicalStockCountInput,
  CreateProductRecallInput,
  CreateStockAdjustmentInput,
  DecideInventoryControlInput,
  InventoryControlCommandContext,
  InventoryMonitoringQuery,
  InventoryRestrictionSweepResult,
  InventoryValuationQuery,
  NearExpiryInventoryQuery,
  RecordPhysicalStockCountLineInput,
  ReverseStockAdjustmentInput,
  StockReconciliationQuery,
  SubmitInventoryControlInput,
  UpsertReorderRuleInput,
} from '../inventory-control.contracts.js';

import type {
  InventoryControlDependencies,
} from '../inventory-control.ports.js';

import type {
  PhysicalStockCountItemRecord,
  PhysicalStockCountRecord,
  ProductRecallRecord,
  StockAdjustmentRecord,
} from '../inventory-control.persistence.types.js';

import {
  normalizeInventoryDecimal,
} from '../inventory.normalization.js';

const TRANSACTION_TYPES = {
  CREATE_ADJUSTMENT: 'inventory.control.adjustment.create',
  SUBMIT_ADJUSTMENT: 'inventory.control.adjustment.submit',
  DECIDE_ADJUSTMENT: 'inventory.control.adjustment.decide',
  REVERSE_ADJUSTMENT: 'inventory.control.adjustment.reverse',
  CREATE_COUNT: 'inventory.control.count.create',
  START_COUNT: 'inventory.control.count.start',
  RECORD_COUNT: 'inventory.control.count.record',
  SUBMIT_COUNT: 'inventory.control.count.submit',
  DECIDE_COUNT: 'inventory.control.count.decide',
  CREATE_RECALL: 'inventory.control.recall.create',
  ACTIVATE_RECALL: 'inventory.control.recall.activate',
  CLOSE_RECALL: 'inventory.control.recall.close',
  UPSERT_REORDER: 'inventory.control.reorder.upsert',
  RESTRICTION_SWEEP: 'inventory.control.restriction.sweep',
} as const;

const AUDIT_ACTIONS = {
  ADJUSTMENT_CREATED: 'inventory.stock_adjustment.created',
  ADJUSTMENT_SUBMITTED: 'inventory.stock_adjustment.submitted',
  ADJUSTMENT_APPROVED: 'inventory.stock_adjustment.approved',
  ADJUSTMENT_REJECTED: 'inventory.stock_adjustment.rejected',
  ADJUSTMENT_REVERSED: 'inventory.stock_adjustment.reversed',
  COUNT_CREATED: 'inventory.physical_count.created',
  COUNT_STARTED: 'inventory.physical_count.started',
  COUNT_LINE_RECORDED: 'inventory.physical_count.line_recorded',
  COUNT_SUBMITTED: 'inventory.physical_count.submitted',
  COUNT_APPROVED: 'inventory.physical_count.approved',
  COUNT_REJECTED: 'inventory.physical_count.rejected',
  RECALL_CREATED: 'inventory.product_recall.created',
  RECALL_ACTIVATED: 'inventory.product_recall.activated',
  RECALL_CLOSED: 'inventory.product_recall.closed',
  REORDER_UPDATED: 'inventory.reorder_rule.updated',
  RESTRICTION_SWEEP: 'inventory.restriction_sweep.completed',
} as const;

const OUTBOX_EVENTS = {
  ADJUSTMENT_CHANGED: 'inventory.stock_adjustment.changed.v1',
  COUNT_CHANGED: 'inventory.physical_count.changed.v1',
  RECALL_CHANGED: 'inventory.product_recall.changed.v1',
  REORDER_CHANGED: 'inventory.reorder_rule.changed.v1',
  STOCK_RESTRICTED: 'inventory.stock.restricted.v1',
} as const;

const REALTIME_EVENTS = {
  ADJUSTMENT_WORKLIST: 'inventory.stock_adjustment_worklist.changed',
  COUNT_WORKLIST: 'inventory.physical_count_worklist.changed',
  RECALL_WORKLIST: 'inventory.product_recall_worklist.changed',
  LOW_STOCK_WORKLIST: 'inventory.low_stock_worklist.changed',
  STOCK_CHANGED: 'inventory.stock.changed',
} as const;

const SEQUENCE_KEYS = {
  ADJUSTMENT: 'inventory.stock-adjustment',
  COUNT: 'inventory.physical-stock-count',
  RECALL: 'inventory.product-recall',
} as const;

function normalized(value: Decimal | string): string {
  return normalizeInventoryDecimal(
    value instanceof Decimal
      ? value.toFixed()
      : value,
    8,
  );
}

function negative(value: Decimal | string): string {
  return normalized(
    value instanceof Decimal
      ? value.negated()
      : new Decimal(value).negated(),
  );
}

function requireAllowed(
  decision: InventoryAccessDecision,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ??
        'Inventory-control operation was denied',
    );
  }
}

function requireVersioned<T>(
  value: T | null,
  message: string,
): T {
  if (value === null) {
    throw new ConcurrencyConflictError(message);
  }

  return value;
}

function lockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map((value) => value.normalize('NFKC').trim().toLowerCase())
    .join(':');
}

function deduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return `${transactionId}:${action}:${entityId}`;
}

function formatNumber(
  prefix: 'ADJ' | 'PSC' | 'RCL',
  facilityCode: string,
  occurredAt: Date,
  value: number,
): string {
  return [
    facilityCode.trim().toUpperCase(),
    prefix,
    occurredAt.getUTCFullYear(),
    String(value).padStart(8, '0'),
  ].join('-');
}

function adjustmentSnapshot(
  adjustment: StockAdjustmentRecord,
): Record<string, unknown> {
  return {
    adjustmentId: adjustment._id.toHexString(),
    adjustmentNumber: adjustment.adjustmentNumber,
    locationId: adjustment.locationId.toHexString(),
    adjustmentType: adjustment.adjustmentType,
    status: adjustment.status,
    lineCount: adjustment.lineCount,
    totalAbsoluteStockQuantity:
      adjustment.totalAbsoluteStockQuantity.toString(),
    sourceType: adjustment.sourceType,
    sourceId: adjustment.sourceId?.toHexString() ?? null,
    version: adjustment.version,
  };
}

function countSnapshot(
  count: PhysicalStockCountRecord,
): Record<string, unknown> {
  return {
    countId: count._id.toHexString(),
    countNumber: count.countNumber,
    locationId: count.locationId.toHexString(),
    scope: count.scope,
    status: count.status,
    snapshotLedgerSequence: count.snapshotLedgerSequence,
    lineCount: count.lineCount,
    countedLineCount: count.countedLineCount,
    varianceLineCount: count.varianceLineCount,
    generatedAdjustmentId:
      count.generatedAdjustmentId?.toHexString() ?? null,
    version: count.version,
  };
}

function recallSnapshot(
  recall: ProductRecallRecord,
): Record<string, unknown> {
  return {
    recallId: recall._id.toHexString(),
    recallNumber: recall.recallNumber,
    externalReference: recall.externalReference,
    action: recall.action,
    status: recall.status,
    lineCount: recall.lineCount,
    affectedBatchCount: recall.affectedBatchCount,
    affectedStockQuantity: recall.affectedStockQuantity.toString(),
    version: recall.version,
  };
}

function bucketDeltas(
  bucket: string,
  signedQuantity: Decimal,
): {
  onHandDelta: string;
  availableDelta: string;
  reservedDelta: string;
  quarantinedDelta: string;
  damagedDelta: string;
  expiredDelta: string;
} {
  const zero = '0';
  const value = normalized(signedQuantity);

  return {
    onHandDelta: value,
    availableDelta: bucket === 'AVAILABLE' ? value : zero,
    reservedDelta: bucket === 'RESERVED' ? value : zero,
    quarantinedDelta: bucket === 'QUARANTINED' ? value : zero,
    damagedDelta: bucket === 'DAMAGED' ? value : zero,
    expiredDelta: bucket === 'EXPIRED' ? value : zero,
  };
}

function movementTypeForAdjustment(
  adjustmentType: string,
): StockLedgerEntryInput['movementType'] {
  switch (adjustmentType) {
    case 'BREAKAGE':
      return 'BREAKAGE';
    case 'WASTAGE':
      return 'WASTAGE';
    case 'DAMAGE':
      return 'ADJUSTMENT';
    case 'EXPIRY_WRITE_OFF':
      return 'EXPIRY_WRITE_OFF';
    case 'THEFT_LOSS':
      return 'THEFT_LOSS';
    case 'QUARANTINE':
      return 'QUARANTINE';
    case 'QUARANTINE_RELEASE':
      return 'QUARANTINE_RELEASE';
    case 'COUNT_RECONCILIATION':
      return 'STOCK_COUNT_RECONCILIATION';
    default:
      return 'ADJUSTMENT';
  }
}

export class InventoryControlService {
  public constructor(
    private readonly dependencies: InventoryControlDependencies,
  ) {}

  public createStockAdjustment(
    context: InventoryControlCommandContext,
    input: CreateStockAdjustmentInput,
  ): Promise<StockAdjustmentRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CREATE_ADJUSTMENT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:adjustment:create',
          context.actor.facilityId,
          input.locationId,
        ),
        ...input.lines.map((line) =>
          lockKey(
            'inventory:balance',
            context.actor.facilityId,
            input.locationId,
            line.itemId,
            line.batchId ?? 'none',
            line.bucket,
          ),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_STOCK_ADJUSTMENT',
        locationId: input.locationId,
        lineCount: input.lines.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            input.locationId,
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ADJUST',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              input.locationId,
            ),
          }),
        );

        if (input.lines.some((line) => line.bucket === 'RESERVED')) {
          throw new ConflictError(
            'Reserved stock can be changed only through reservation workflows',
          );
        }

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        const preparedLines = [];

        for (const line of input.lines) {
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            line.itemId,
            true,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError(
              'An active adjustment inventory item was not found',
            );
          }

          if (item.batchTrackingRequired && line.batchId == null) {
            throw new ConflictError(
              'Batch-tracked adjustment items require a batch ID',
            );
          }

          if (!item.batchTrackingRequired && line.batchId != null) {
            throw new ConflictError(
              'Non-batch inventory items cannot use a batch ID',
            );
          }

          if (line.batchId != null) {
            const batch = await this.dependencies.repository.findBatchById(
              context.actor.facilityId,
              line.batchId,
            );

            if (
              batch === null ||
              batch.itemId.toHexString() !== line.itemId ||
              batch.enteredInErrorAt !== null
            ) {
              throw new ResourceNotFoundError(
                'Adjustment batch was not found for the selected item',
              );
            }
          }

          const signed =
            line.direction === 'INCREASE'
              ? new Decimal(line.quantity)
              : new Decimal(line.quantity).negated();
          const deltas = bucketDeltas(line.bucket, signed);

          preparedLines.push({
            itemId: line.itemId,
            batchId: line.batchId ?? null,
            stockUnitId: item.stockUnitId.toHexString(),
            bucket: line.bucket,
            direction: line.direction,
            quantity: normalized(line.quantity),
            ...deltas,
            unitCost: line.unitCost ?? null,
            currency: line.currency ?? null,
            reasonCode: line.reasonCode,
            notes: line.notes ?? null,
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          SEQUENCE_KEYS.ADJUSTMENT,
        );

        const created = await this.dependencies.repository.withTransaction(
          (session) =>
            this.dependencies.repository.createAdjustment(
              input,
              {
                adjustmentNumber: formatNumber(
                  'ADJ',
                  sequence.facilityCode,
                  occurredAt,
                  sequence.value,
                ),
                requestedByStaffId: operational.actor.staffId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                occurredAt,
                sourceType: 'MANUAL',
                sourceId: null,
                lines: preparedLines,
              },
              context.actor.userId,
              context.actor.facilityId,
              session,
            ),
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.ADJUSTMENT_CREATED,
          OUTBOX_EVENTS.ADJUSTMENT_CHANGED,
          REALTIME_EVENTS.ADJUSTMENT_WORKLIST,
          'StockAdjustment',
          created._id.toHexString(),
          adjustmentSnapshot(created),
          {
            locationId: input.locationId,
          },
        );

        return created;
      },
    });
  }

  public submitStockAdjustment(
    context: InventoryControlCommandContext,
    adjustmentId: string,
    input: SubmitInventoryControlInput,
  ): Promise<StockAdjustmentRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.SUBMIT_ADJUSTMENT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:adjustment', context.actor.facilityId, adjustmentId),
      ],
      idempotencyPayload: {
        adjustmentId,
        ...input,
      },
      journalPayload: {
        operation: 'SUBMIT_STOCK_ADJUSTMENT',
        adjustmentId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requireAdjustment(
          context.actor.facilityId,
          adjustmentId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ADJUST',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        const updated = requireVersioned(
          await this.dependencies.repository.withTransaction((session) =>
            this.dependencies.repository.submitAdjustment(
              context.actor.facilityId,
              adjustmentId,
              input,
              context.actor.userId,
              occurredAt,
              session,
            ),
          ),
          'The stock adjustment changed before submission completed',
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.ADJUSTMENT_SUBMITTED,
          OUTBOX_EVENTS.ADJUSTMENT_CHANGED,
          REALTIME_EVENTS.ADJUSTMENT_WORKLIST,
          'StockAdjustment',
          adjustmentId,
          adjustmentSnapshot(updated),
          {
            locationId: current.locationId.toHexString(),
          },
          adjustmentSnapshot(current),
          input.reason,
        );

        return updated;
      },
    });
  }

  public decideStockAdjustment(
    context: InventoryControlCommandContext,
    adjustmentId: string,
    input: DecideInventoryControlInput,
  ): Promise<StockAdjustmentRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.DECIDE_ADJUSTMENT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:adjustment', context.actor.facilityId, adjustmentId),
      ],
      idempotencyPayload: {
        adjustmentId,
        ...input,
      },
      journalPayload: {
        operation: 'DECIDE_STOCK_ADJUSTMENT',
        adjustmentId,
        decision: input.decision,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requireAdjustment(
          context.actor.facilityId,
          adjustmentId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ADJUST',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        if (current.requestedByStaffId.toHexString() === operational.actor.staffId) {
          throw new ConflictError(
            'Stock-adjustment maker and approver must be different staff members',
          );
        }

        const updated = await this.dependencies.repository.withTransaction(
          async (session) => {
            const decided = requireVersioned(
              await this.dependencies.repository.decideAdjustment(
                context.actor.facilityId,
                adjustmentId,
                input,
                context.actor.userId,
                operational.actor.staffId,
                occurredAt,
                session,
              ),
              'The stock adjustment changed before the decision completed',
            );

            if (input.decision === 'REJECT') {
              return decided;
            }

            await this.dependencies.stockPosting.post(
              this.adjustmentLedgerEntries(
                context,
                transaction.transactionId,
                operational.actor.staffId,
                decided,
                occurredAt,
              ),
              session,
            );

            return requireVersioned(
              await this.dependencies.repository.markAdjustmentPosted(
                context.actor.facilityId,
                adjustmentId,
                decided.version,
                context.actor.userId,
                operational.actor.staffId,
                transaction.transactionId,
                occurredAt,
                session,
              ),
              'The approved stock adjustment changed before posting completed',
            );
          },
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          input.decision === 'APPROVE'
            ? AUDIT_ACTIONS.ADJUSTMENT_APPROVED
            : AUDIT_ACTIONS.ADJUSTMENT_REJECTED,
          OUTBOX_EVENTS.ADJUSTMENT_CHANGED,
          input.decision === 'APPROVE'
            ? REALTIME_EVENTS.STOCK_CHANGED
            : REALTIME_EVENTS.ADJUSTMENT_WORKLIST,
          'StockAdjustment',
          adjustmentId,
          adjustmentSnapshot(updated),
          {
            locationId: current.locationId.toHexString(),
          },
          adjustmentSnapshot(current),
          input.reason,
        );

        return updated;
      },
    });
  }

  public reverseStockAdjustment(
    context: InventoryControlCommandContext,
    adjustmentId: string,
    input: ReverseStockAdjustmentInput,
  ): Promise<StockAdjustmentRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.REVERSE_ADJUSTMENT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:adjustment', context.actor.facilityId, adjustmentId),
      ],
      idempotencyPayload: {
        adjustmentId,
        ...input,
      },
      journalPayload: {
        operation: 'REVERSE_STOCK_ADJUSTMENT',
        adjustmentId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requireAdjustment(
          context.actor.facilityId,
          adjustmentId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ADJUST',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        const updated = await this.dependencies.repository.withTransaction(
          async (session) => {
            await this.dependencies.stockPosting.reverseSourceMovements(
              {
                facilityId: context.actor.facilityId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                actorUserId: context.actor.userId,
                actorStaffId: operational.actor.staffId,
                sourceType: 'STOCK_ADJUSTMENT',
                sourceId: adjustmentId,
                reason: input.reason,
                occurredAt,
              },
              session,
            );

            return requireVersioned(
              await this.dependencies.repository.markAdjustmentReversed(
                context.actor.facilityId,
                adjustmentId,
                input,
                context.actor.userId,
                operational.actor.staffId,
                transaction.transactionId,
                occurredAt,
                session,
              ),
              'The stock adjustment changed before reversal completed',
            );
          },
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.ADJUSTMENT_REVERSED,
          OUTBOX_EVENTS.ADJUSTMENT_CHANGED,
          REALTIME_EVENTS.STOCK_CHANGED,
          'StockAdjustment',
          adjustmentId,
          adjustmentSnapshot(updated),
          {
            locationId: current.locationId.toHexString(),
          },
          adjustmentSnapshot(current),
          input.reason,
        );

        return updated;
      },
    });
  }

  public createPhysicalStockCount(
    context: InventoryControlCommandContext,
    input: CreatePhysicalStockCountInput,
  ): Promise<PhysicalStockCountRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CREATE_COUNT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:count:create', context.actor.facilityId, input.locationId),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_PHYSICAL_STOCK_COUNT',
        locationId: input.locationId,
        targetCount: input.targets.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            input.locationId,
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'COUNT',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              input.locationId,
            ),
          }),
        );

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        const snapshots = [];

        for (const target of input.targets) {
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            target.itemId,
            false,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError(
              'A physical-count inventory item was not found',
            );
          }

          if (input.categoryId != null && item.categoryId.toHexString() !== input.categoryId) {
            throw new ConflictError(
              'A physical-count target is outside the selected category',
            );
          }

          if (target.batchId != null) {
            const batch = await this.dependencies.repository.findBatchById(
              context.actor.facilityId,
              target.batchId,
            );

            if (
              batch === null ||
              batch.itemId.toHexString() !== target.itemId ||
              batch.enteredInErrorAt !== null
            ) {
              throw new ResourceNotFoundError(
                'A physical-count batch was not found for the selected item',
              );
            }
          }

          snapshots.push(
            await this.dependencies.repository.findBucketSnapshot(
              context.actor.facilityId,
              input.locationId,
              target.itemId,
              target.batchId ?? null,
              target.bucket,
            ),
          );
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          SEQUENCE_KEYS.COUNT,
        );
        const snapshotLedgerSequence =
          await this.dependencies.repository.findLatestLedgerSequence(
            context.actor.facilityId,
            input.locationId,
          );

        const aggregate = await this.dependencies.repository.withTransaction(
          (session) =>
            this.dependencies.repository.createPhysicalCount(
              input,
              {
                countNumber: formatNumber(
                  'PSC',
                  sequence.facilityCode,
                  occurredAt,
                  sequence.value,
                ),
                requestedByStaffId: operational.actor.staffId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                occurredAt,
                snapshotLedgerSequence,
                lines: snapshots,
              },
              context.actor.userId,
              context.actor.facilityId,
              session,
            ),
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.COUNT_CREATED,
          OUTBOX_EVENTS.COUNT_CHANGED,
          REALTIME_EVENTS.COUNT_WORKLIST,
          'PhysicalStockCount',
          aggregate.count._id.toHexString(),
          countSnapshot(aggregate.count),
          {
            locationId: input.locationId,
          },
        );

        return aggregate.count;
      },
    });
  }

  public transitionPhysicalStockCount(
    context: InventoryControlCommandContext,
    countId: string,
    input: SubmitInventoryControlInput,
    transition: 'START' | 'SUBMIT',
  ): Promise<PhysicalStockCountRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType:
        transition === 'START'
          ? TRANSACTION_TYPES.START_COUNT
          : TRANSACTION_TYPES.SUBMIT_COUNT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:count', context.actor.facilityId, countId),
      ],
      idempotencyPayload: {
        countId,
        transition,
        ...input,
      },
      journalPayload: {
        operation: `${transition}_PHYSICAL_STOCK_COUNT`,
        countId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requirePhysicalCount(
          context.actor.facilityId,
          countId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'COUNT',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        const updated = requireVersioned(
          await this.dependencies.repository.withTransaction((session) =>
            transition === 'START'
              ? this.dependencies.repository.startPhysicalCount(
                  context.actor.facilityId,
                  countId,
                  input.expectedVersion,
                  context.actor.userId,
                  occurredAt,
                  session,
                )
              : this.dependencies.repository.submitPhysicalCount(
                  context.actor.facilityId,
                  countId,
                  input,
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  session,
                ),
          ),
          `The physical stock count changed before ${transition.toLowerCase()} completed`,
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          transition === 'START'
            ? AUDIT_ACTIONS.COUNT_STARTED
            : AUDIT_ACTIONS.COUNT_SUBMITTED,
          OUTBOX_EVENTS.COUNT_CHANGED,
          REALTIME_EVENTS.COUNT_WORKLIST,
          'PhysicalStockCount',
          countId,
          countSnapshot(updated),
          {
            locationId: current.locationId.toHexString(),
          },
          countSnapshot(current),
          input.reason,
        );

        return updated;
      },
    });
  }

  public recordPhysicalStockCountLine(
    context: InventoryControlCommandContext,
    countId: string,
    countItemId: string,
    input: RecordPhysicalStockCountLineInput,
  ): Promise<PhysicalStockCountItemRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.RECORD_COUNT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:count', context.actor.facilityId, countId),
        lockKey('inventory:count:item', context.actor.facilityId, countItemId),
      ],
      idempotencyPayload: {
        countId,
        countItemId,
        ...input,
      },
      journalPayload: {
        operation: 'RECORD_PHYSICAL_STOCK_COUNT_LINE',
        countId,
        countItemId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requirePhysicalCount(
          context.actor.facilityId,
          countId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'COUNT',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        if (current.status !== 'IN_PROGRESS') {
          throw new ConflictError(
            'Physical-count lines can be recorded only while the count is in progress',
          );
        }

        const updated = await this.dependencies.repository.withTransaction(
          async (session) => {
            const line = requireVersioned(
              await this.dependencies.repository.recordPhysicalCountLine(
                context.actor.facilityId,
                countId,
                countItemId,
                input,
                context.actor.userId,
                operational.actor.staffId,
                occurredAt,
                session,
              ),
              'The physical-count line changed before recording completed',
            );

            requireVersioned(
              await this.dependencies.repository.recomputePhysicalCountTotals(
                context.actor.facilityId,
                countId,
                context.actor.userId,
                session,
              ),
              'The physical-count header changed before totals were recomputed',
            );

            return line;
          },
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.COUNT_LINE_RECORDED,
          OUTBOX_EVENTS.COUNT_CHANGED,
          REALTIME_EVENTS.COUNT_WORKLIST,
          'PhysicalStockCountItem',
          countItemId,
          {
            countId,
            countItemId,
            actualQuantity: updated.actualQuantity?.toString() ?? null,
            varianceQuantity: updated.varianceQuantity?.toString() ?? null,
            status: updated.status,
            version: updated.version,
          },
          {
            locationId: current.locationId.toHexString(),
          },
        );

        return updated;
      },
    });
  }

  public decidePhysicalStockCount(
    context: InventoryControlCommandContext,
    countId: string,
    input: DecideInventoryControlInput,
  ): Promise<PhysicalStockCountRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.DECIDE_COUNT,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:count', context.actor.facilityId, countId),
      ],
      idempotencyPayload: {
        countId,
        ...input,
      },
      journalPayload: {
        operation: 'DECIDE_PHYSICAL_STOCK_COUNT',
        countId,
        decision: input.decision,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const current = await this.requirePhysicalCount(
          context.actor.facilityId,
          countId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            current.locationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'COUNT',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              current.locationId.toHexString(),
            ),
          }),
        );

        if (current.requestedByStaffId.toHexString() === operational.actor.staffId) {
          throw new ConflictError(
            'Physical-count maker and approver must be different staff members',
          );
        }

        if (input.decision === 'APPROVE') {
          const latestLedgerSequence =
            await this.dependencies.repository.findLatestLedgerSequence(
              context.actor.facilityId,
              current.locationId.toHexString(),
            );

          if (latestLedgerSequence !== current.snapshotLedgerSequence) {
            throw new ConflictError(
              'Stock changed after the physical-count snapshot; start a new count before approval',
            );
          }
        }

        const items = await this.dependencies.repository.findPhysicalCountItems(
          context.actor.facilityId,
          countId,
        );

        const varianceItems = items.filter(
          (item) =>
            item.varianceQuantity !== null &&
            !new Decimal(item.varianceQuantity.toString()).eq(0),
        );

        if (
          input.decision === 'APPROVE' &&
          varianceItems.some((item) => item.bucket === 'RESERVED')
        ) {
          throw new ConflictError(
            'Reserved-stock count variances must be resolved through reservation workflows',
          );
        }

        const result = await this.dependencies.repository.withTransaction(
          async (session) => {
            if (input.decision === 'REJECT') {
              return requireVersioned(
                await this.dependencies.repository.decidePhysicalCount(
                  context.actor.facilityId,
                  countId,
                  input,
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  null,
                  session,
                ),
                'The physical stock count changed before rejection completed',
              );
            }

            let adjustment: StockAdjustmentRecord | null = null;

            if (varianceItems.length > 0) {
              const sequence = await this.dependencies.sequence.next(
                context.actor.facilityId,
                SEQUENCE_KEYS.ADJUSTMENT,
              );
              const adjustmentInput: CreateStockAdjustmentInput = {
                locationId: current.locationId.toHexString(),
                adjustmentType: 'COUNT_RECONCILIATION',
                reason: input.reason,
                attachmentIds: [],
                lines: varianceItems.map((item) => ({
                  itemId: item.itemId.toHexString(),
                  batchId: item.batchId?.toHexString() ?? null,
                  bucket: item.bucket,
                  direction:
                    new Decimal(item.varianceQuantity!.toString()).gt(0)
                      ? 'INCREASE'
                      : 'DECREASE',
                  quantity: normalized(
                    new Decimal(item.varianceQuantity!.toString()).abs(),
                  ),
                  reasonCode: 'COUNT_VARIANCE',
                  notes: `Generated by physical count ${current.countNumber}`,
                })),
              };

              const preparedLines = varianceItems.map((item) => {
                const variance = new Decimal(item.varianceQuantity!.toString());
                const deltas = bucketDeltas(item.bucket, variance);

                return {
                  itemId: item.itemId.toHexString(),
                  batchId: item.batchId?.toHexString() ?? null,
                  stockUnitId: item.stockUnitId.toHexString(),
                  bucket: item.bucket,
                  direction: variance.gt(0) ? 'INCREASE' as const : 'DECREASE' as const,
                  quantity: normalized(variance.abs()),
                  ...deltas,
                  unitCost: null,
                  currency: null,
                  reasonCode: 'COUNT_VARIANCE',
                  notes: `Generated by physical count ${current.countNumber}`,
                };
              });

              const created = await this.dependencies.repository.createAdjustment(
                adjustmentInput,
                {
                  adjustmentNumber: formatNumber(
                    'ADJ',
                    sequence.facilityCode,
                    occurredAt,
                    sequence.value,
                  ),
                  requestedByStaffId: current.requestedByStaffId.toHexString(),
                  transactionId: transaction.transactionId,
                  correlationId: context.actor.correlationId,
                  occurredAt,
                  sourceType: 'PHYSICAL_STOCK_COUNT',
                  sourceId: countId,
                  lines: preparedLines,
                },
                context.actor.userId,
                context.actor.facilityId,
                session,
              );

              const submitted = requireVersioned(
                await this.dependencies.repository.submitAdjustment(
                  context.actor.facilityId,
                  created._id.toHexString(),
                  {
                    expectedVersion: created.version,
                    reason: input.reason,
                  },
                  context.actor.userId,
                  occurredAt,
                  session,
                ),
                'Generated count adjustment could not be submitted',
              );

              const approved = requireVersioned(
                await this.dependencies.repository.decideAdjustment(
                  context.actor.facilityId,
                  created._id.toHexString(),
                  {
                    expectedVersion: submitted.version,
                    decision: 'APPROVE',
                    reason: input.reason,
                  },
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  session,
                ),
                'Generated count adjustment could not be approved',
              );

              await this.dependencies.stockPosting.post(
                this.adjustmentLedgerEntries(
                  context,
                  transaction.transactionId,
                  operational.actor.staffId,
                  approved,
                  occurredAt,
                ),
                session,
              );

              adjustment = requireVersioned(
                await this.dependencies.repository.markAdjustmentPosted(
                  context.actor.facilityId,
                  approved._id.toHexString(),
                  approved.version,
                  context.actor.userId,
                  operational.actor.staffId,
                  transaction.transactionId,
                  occurredAt,
                  session,
                ),
                'Generated count adjustment could not be marked posted',
              );
            }

            const approvedCount = requireVersioned(
              await this.dependencies.repository.decidePhysicalCount(
                context.actor.facilityId,
                countId,
                input,
                context.actor.userId,
                operational.actor.staffId,
                occurredAt,
                adjustment?._id.toHexString() ?? null,
                session,
              ),
              'The physical stock count changed before approval completed',
            );

            return requireVersioned(
              await this.dependencies.repository.markPhysicalCountPosted(
                context.actor.facilityId,
                countId,
                approvedCount.version,
                context.actor.userId,
                operational.actor.staffId,
                adjustment?._id.toHexString() ?? null,
                occurredAt,
                session,
              ),
              'The approved physical count changed before posting completed',
            );
          },
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          input.decision === 'APPROVE'
            ? AUDIT_ACTIONS.COUNT_APPROVED
            : AUDIT_ACTIONS.COUNT_REJECTED,
          OUTBOX_EVENTS.COUNT_CHANGED,
          input.decision === 'APPROVE'
            ? REALTIME_EVENTS.STOCK_CHANGED
            : REALTIME_EVENTS.COUNT_WORKLIST,
          'PhysicalStockCount',
          countId,
          countSnapshot(result),
          {
            locationId: current.locationId.toHexString(),
          },
          countSnapshot(current),
          input.reason,
        );

        return result;
      },
    });
  }

  public createProductRecall(
    context: InventoryControlCommandContext,
    input: CreateProductRecallInput,
  ): Promise<ProductRecallRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CREATE_RECALL,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:recall:create',
          context.actor.facilityId,
          input.externalReference,
        ),
        ...input.batches.map((line) =>
          lockKey('inventory:batch', context.actor.facilityId, line.batchId),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_PRODUCT_RECALL',
        externalReference: input.externalReference,
        batchCount: input.batches.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor = await this.dependencies.context.requireActiveActorStaff(
          context.actor,
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'BATCH_MANAGE',
          }),
        );

        await this.dependencies.attachments.assertAvailable(
          context.actor.facilityId,
          input.attachmentIds ?? [],
        );

        for (const entry of input.batches) {
          const [item, batch] = await Promise.all([
            this.dependencies.catalog.findItemById(
              context.actor.facilityId,
              entry.itemId,
              false,
            ),
            this.dependencies.repository.findBatchById(
              context.actor.facilityId,
              entry.batchId,
            ),
          ]);

          if (
            item === null ||
            batch === null ||
            batch.itemId.toHexString() !== entry.itemId ||
            batch.enteredInErrorAt !== null
          ) {
            throw new ResourceNotFoundError(
              'A recalled batch was not found for the selected inventory item',
            );
          }
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          SEQUENCE_KEYS.RECALL,
        );

        const aggregate = await this.dependencies.repository.withTransaction(
          (session) =>
            this.dependencies.repository.createProductRecall(
              input,
              {
                recallNumber: formatNumber(
                  'RCL',
                  sequence.facilityCode,
                  occurredAt,
                  sequence.value,
                ),
                initiatedByStaffId: actor.staffId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                occurredAt,
              },
              context.actor.userId,
              context.actor.facilityId,
              session,
            ),
        );

        await this.publishMutation(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RECALL_CREATED,
          OUTBOX_EVENTS.RECALL_CHANGED,
          REALTIME_EVENTS.RECALL_WORKLIST,
          'ProductRecall',
          aggregate.recall._id.toHexString(),
          recallSnapshot(aggregate.recall),
          {},
        );

        return aggregate.recall;
      },
    });
  }

  public activateProductRecall(
    context: InventoryControlCommandContext,
    recallId: string,
    input: ActivateProductRecallInput,
  ): Promise<ProductRecallRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.ACTIVATE_RECALL,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:recall', context.actor.facilityId, recallId),
      ],
      idempotencyPayload: {
        recallId,
        ...input,
      },
      journalPayload: {
        operation: 'ACTIVATE_PRODUCT_RECALL',
        recallId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor = await this.dependencies.context.requireActiveActorStaff(
          context.actor,
        );
        const current = await this.requireProductRecall(
          context.actor.facilityId,
          recallId,
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'BATCH_MANAGE',
          }),
        );

        if (current.initiatedByStaffId.toHexString() === actor.staffId) {
          throw new ConflictError(
            'Product-recall initiator and activator must be different staff members',
          );
        }

        const recallItems = await this.dependencies.repository.findProductRecallItems(
          context.actor.facilityId,
          recallId,
        );

        const result = await this.dependencies.repository.withTransaction(
          async (session) => {
            const entries: StockLedgerEntryInput[] = [];
            const quantitiesByRecallItem = new Map<
              string,
              {
                affectedStockQuantity: string;
                quarantinedQuantity: string;
              }
            >();
            let affectedStock = new Decimal(0);

            for (const recallItem of recallItems) {
              const balances = await this.dependencies.repository.findRestrictionBalances(
                context.actor.facilityId,
                recallItem.batchId.toHexString(),
                session,
              );
              let itemAffected = new Decimal(0);

              for (const balance of balances) {
                const available = new Decimal(
                  balance.availableQuantity.toString(),
                );
                const reserved = new Decimal(
                  balance.reservedQuantity.toString(),
                );

                itemAffected = itemAffected.plus(available).plus(reserved);
                affectedStock = affectedStock.plus(available).plus(reserved);

                if (available.gt(0)) {
                  entries.push({
                    facilityId: context.actor.facilityId,
                    transactionId: transaction.transactionId,
                    correlationId: context.actor.correlationId,
                    actorUserId: context.actor.userId,
                    actorStaffId: actor.staffId,
                    itemId: balance.itemId.toHexString(),
                    batchId: balance.batchId.toHexString(),
                    locationId: balance.locationId.toHexString(),
                    stockUnitId: balance.stockUnitId.toHexString(),
                    movementType: 'QUARANTINE',
                    sourceType: 'PRODUCT_RECALL',
                    sourceId: recallId,
                    sourceLineId: recallItem._id.toHexString(),
                    operationKey: deduplicationKey(
                      transaction.transactionId,
                      'recall-quarantine',
                      balance.balanceId.toHexString(),
                    ),
                    quantity: normalized(available),
                    onHandDelta: '0',
                    availableDelta: negative(available),
                    reservedDelta: '0',
                    quarantinedDelta: normalized(available),
                    damagedDelta: '0',
                    expiredDelta: '0',
                    inTransitDelta: '0',
                    reason: input.reason,
                    metadata: {
                      recallNumber: current.recallNumber,
                      externalReference: current.externalReference,
                      reservedQuantityBlocked: normalized(reserved),
                    },
                    occurredAt,
                    allowNegativeStock: false,
                  });
                }
              }

              const quarantined = balances.reduce(
                (total, balance) =>
                  total.plus(balance.availableQuantity.toString()),
                new Decimal(0),
              );

              quantitiesByRecallItem.set(
                recallItem._id.toHexString(),
                {
                  affectedStockQuantity: normalized(itemAffected),
                  quarantinedQuantity: normalized(quarantined),
                },
              );

              const restricted = await this.dependencies.repository.markBatchRestricted(
                context.actor.facilityId,
                recallItem.batchId.toHexString(),
                {
                  status:
                    current.action === 'BLOCK'
                      ? 'BLOCKED'
                      : 'RECALLED',
                  recallStatus: 'ACTIVE',
                  recallReference: current.externalReference,
                  reason: input.reason,
                  actorUserId: context.actor.userId,
                  occurredAt,
                },
                session,
              );

              if (!restricted) {
                throw new ConflictError(
                  'A product-recall batch changed before activation completed',
                );
              }
            }

            if (entries.length > 0) {
              await this.dependencies.stockPosting.post(entries, session);
            }

            await this.dependencies.repository.markRecallItemsActioned(
              context.actor.facilityId,
              recallId,
              context.actor.userId,
              actor.staffId,
              quantitiesByRecallItem,
              occurredAt,
              session,
            );

            return requireVersioned(
              await this.dependencies.repository.activateProductRecall(
                context.actor.facilityId,
                recallId,
                input.expectedVersion,
                context.actor.userId,
                actor.staffId,
                normalized(affectedStock),
                occurredAt,
                session,
              ),
              'The product recall changed before activation completed',
            );
          },
        );

        await this.publishMutation(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RECALL_ACTIVATED,
          OUTBOX_EVENTS.RECALL_CHANGED,
          REALTIME_EVENTS.STOCK_CHANGED,
          'ProductRecall',
          recallId,
          recallSnapshot(result),
          {},
          recallSnapshot(current),
          input.reason,
        );

        return result;
      },
    });
  }

  public closeProductRecall(
    context: InventoryControlCommandContext,
    recallId: string,
    input: SubmitInventoryControlInput,
  ): Promise<ProductRecallRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CLOSE_RECALL,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:recall', context.actor.facilityId, recallId),
      ],
      idempotencyPayload: {
        recallId,
        ...input,
      },
      journalPayload: {
        operation: 'CLOSE_PRODUCT_RECALL',
        recallId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor = await this.dependencies.context.requireActiveActorStaff(
          context.actor,
        );
        const current = await this.requireProductRecall(
          context.actor.facilityId,
          recallId,
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'BATCH_MANAGE',
          }),
        );

        const items = await this.dependencies.repository.findProductRecallItems(
          context.actor.facilityId,
          recallId,
        );

        const updated = await this.dependencies.repository.withTransaction(
          async (session) => {
            for (const item of items) {
              await this.dependencies.repository.markBatchRestricted(
                context.actor.facilityId,
                item.batchId.toHexString(),
                {
                  status:
                    current.action === 'BLOCK'
                      ? 'BLOCKED'
                      : 'RECALLED',
                  recallStatus: 'CLOSED',
                  recallReference: current.externalReference,
                  reason: input.reason,
                  actorUserId: context.actor.userId,
                  occurredAt,
                },
                session,
              );
            }

            return requireVersioned(
              await this.dependencies.repository.closeProductRecall(
                context.actor.facilityId,
                recallId,
                input.expectedVersion,
                context.actor.userId,
                actor.staffId,
                input.reason,
                occurredAt,
                session,
              ),
              'The product recall changed before closure completed',
            );
          },
        );

        await this.publishMutation(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RECALL_CLOSED,
          OUTBOX_EVENTS.RECALL_CHANGED,
          REALTIME_EVENTS.RECALL_WORKLIST,
          'ProductRecall',
          recallId,
          recallSnapshot(updated),
          {},
          recallSnapshot(current),
          input.reason,
        );

        return updated;
      },
    });
  }

  public upsertReorderRule(
    context: InventoryControlCommandContext,
    input: UpsertReorderRuleInput,
  ) {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.UPSERT_REORDER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:reorder-rule',
          context.actor.facilityId,
          input.locationId,
          input.itemId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'UPSERT_REORDER_RULE',
        locationId: input.locationId,
        itemId: input.itemId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            input.locationId,
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'ITEM_MANAGE',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              input.locationId,
            ),
          }),
        );

        const item = await this.dependencies.catalog.findItemById(
          context.actor.facilityId,
          input.itemId,
          false,
        );

        if (item === null || item.status !== 'ACTIVE') {
          throw new ResourceNotFoundError(
            'An active reorder-rule inventory item was not found',
          );
        }

        const existingRule = await this.dependencies.repository.findReorderRule(
          context.actor.facilityId,
          input.locationId,
          input.itemId,
        );

        if (existingRule !== null && input.expectedVersion === undefined) {
          throw new ConflictError(
            'Updating an existing reorder rule requires its expected version',
          );
        }

        if (existingRule === null && input.expectedVersion !== undefined) {
          throw new ConcurrencyConflictError(
            'The reorder rule does not exist at the expected version',
          );
        }

        const updated = requireVersioned(
          await this.dependencies.repository.withTransaction((session) =>
            this.dependencies.repository.upsertReorderRule(
              context.actor.facilityId,
              input,
              context.actor.userId,
              transaction.transactionId,
              context.actor.correlationId,
              occurredAt,
              session,
            ),
          ),
          'The reorder rule changed before the update completed',
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.REORDER_UPDATED,
          OUTBOX_EVENTS.REORDER_CHANGED,
          REALTIME_EVENTS.LOW_STOCK_WORKLIST,
          'ReorderRule',
          updated._id.toHexString(),
          {
            ruleId: updated._id.toHexString(),
            locationId: updated.locationId.toHexString(),
            itemId: updated.itemId.toHexString(),
            criticalStockLevel: updated.criticalStockLevel.toString(),
            reorderLevel: updated.reorderLevel.toString(),
            active: updated.active,
            version: updated.version,
          },
          {
            locationId: input.locationId,
          },
        );

        return updated;
      },
    });
  }

  public runInventoryRestrictionSweep(
    context: InventoryControlCommandContext,
    batchLimit = 500,
  ): Promise<InventoryRestrictionSweepResult> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.RESTRICTION_SWEEP,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:restriction-sweep', context.actor.facilityId),
      ],
      idempotencyPayload: {
        batchLimit,
      },
      journalPayload: {
        operation: 'RUN_INVENTORY_RESTRICTION_SWEEP',
        batchLimit,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const actor = await this.dependencies.context.requireActiveActorStaff(
          context.actor,
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'BATCH_MANAGE',
          }),
        );

        const [expirable, recalled] = await Promise.all([
          this.dependencies.repository.listExpirableBatches(
            context.actor.facilityId,
            occurredAt,
            batchLimit,
          ),
          this.dependencies.repository.listRecallRestrictedBatches(
            context.actor.facilityId,
            batchLimit,
          ),
        ]);

        const expiringBatchIds = new Set(
          expirable.map((batch) => batch.batchId.toHexString()),
        );
        const recalledOnly = recalled.filter(
          (batch) => !expiringBatchIds.has(batch.batchId.toHexString()),
        );

        const result = await this.dependencies.repository.withTransaction(
          async (session) => {
            const entries: StockLedgerEntryInput[] = [];
            let reclassifiedBalanceCount = 0;
            let skippedReservedBalanceCount = 0;

            for (const batch of expirable) {
              const balances = await this.dependencies.repository.findRestrictionBalances(
                context.actor.facilityId,
                batch.batchId.toHexString(),
                session,
              );

              for (const balance of balances) {
                const available = new Decimal(
                  balance.availableQuantity.toString(),
                );
                const reserved = new Decimal(
                  balance.reservedQuantity.toString(),
                );

                if (reserved.gt(0)) {
                  skippedReservedBalanceCount += 1;
                }

                if (available.lte(0)) {
                  continue;
                }

                reclassifiedBalanceCount += 1;
                entries.push({
                  facilityId: context.actor.facilityId,
                  transactionId: transaction.transactionId,
                  correlationId: context.actor.correlationId,
                  actorUserId: context.actor.userId,
                  actorStaffId: actor.staffId,
                  itemId: balance.itemId.toHexString(),
                  batchId: balance.batchId.toHexString(),
                  locationId: balance.locationId.toHexString(),
                  stockUnitId: balance.stockUnitId.toHexString(),
                  movementType: 'EXPIRY_WRITE_OFF',
                  sourceType: 'EXPIRY_JOB',
                  sourceId: batch.batchId.toHexString(),
                  sourceLineId: balance.balanceId.toHexString(),
                  operationKey: deduplicationKey(
                    transaction.transactionId,
                    'expiry-reclassify',
                    balance.balanceId.toHexString(),
                  ),
                  quantity: normalized(available),
                  onHandDelta: '0',
                  availableDelta: negative(available),
                  reservedDelta: '0',
                  quarantinedDelta: '0',
                  damagedDelta: '0',
                  expiredDelta: normalized(available),
                  inTransitDelta: '0',
                  reason: 'Automated expiry restriction sweep',
                  metadata: {
                    expiryDate: batch.expiryDate.toISOString(),
                    recallStatus: batch.recallStatus,
                    reservedQuantityBlocked: normalized(reserved),
                  },
                  occurredAt,
                  allowNegativeStock: false,
                });
              }

              if (batch.recallStatus === 'NONE') {
                const restricted =
                  await this.dependencies.repository.markBatchRestricted(
                    context.actor.facilityId,
                    batch.batchId.toHexString(),
                    {
                      status: 'EXPIRED',
                      reason: 'Batch reached or passed its expiry date',
                      actorUserId: context.actor.userId,
                      occurredAt,
                    },
                    session,
                  );

                if (!restricted) {
                  throw new ConflictError(
                    'An expiring batch changed before restriction completed',
                  );
                }
              }
            }

            for (const batch of recalledOnly) {
              const balances = await this.dependencies.repository.findRestrictionBalances(
                context.actor.facilityId,
                batch.batchId.toHexString(),
                session,
              );

              for (const balance of balances) {
                const available = new Decimal(
                  balance.availableQuantity.toString(),
                );
                const reserved = new Decimal(
                  balance.reservedQuantity.toString(),
                );

                if (reserved.gt(0)) {
                  skippedReservedBalanceCount += 1;
                }

                if (available.lte(0)) {
                  continue;
                }

                reclassifiedBalanceCount += 1;
                entries.push({
                  facilityId: context.actor.facilityId,
                  transactionId: transaction.transactionId,
                  correlationId: context.actor.correlationId,
                  actorUserId: context.actor.userId,
                  actorStaffId: actor.staffId,
                  itemId: balance.itemId.toHexString(),
                  batchId: balance.batchId.toHexString(),
                  locationId: balance.locationId.toHexString(),
                  stockUnitId: balance.stockUnitId.toHexString(),
                  movementType: 'QUARANTINE',
                  sourceType: 'PRODUCT_RECALL',
                  sourceId: batch.batchId.toHexString(),
                  sourceLineId: balance.balanceId.toHexString(),
                  operationKey: deduplicationKey(
                    transaction.transactionId,
                    'recall-reclassify',
                    balance.balanceId.toHexString(),
                  ),
                  quantity: normalized(available),
                  onHandDelta: '0',
                  availableDelta: negative(available),
                  reservedDelta: '0',
                  quarantinedDelta: normalized(available),
                  damagedDelta: '0',
                  expiredDelta: '0',
                  inTransitDelta: '0',
                  reason: 'Automated recall restriction sweep',
                  metadata: {
                    recallReference: batch.recallReference,
                    recallStatus: batch.recallStatus,
                    reservedQuantityBlocked: normalized(reserved),
                  },
                  occurredAt,
                  allowNegativeStock: false,
                });
              }
            }

            const movements =
              entries.length === 0
                ? []
                : await this.dependencies.stockPosting.post(entries, session);

            return {
              expiredBatchCount: expirable.length,
              recalledBatchCount: recalledOnly.length,
              reclassifiedBalanceCount,
              postedMovementCount: movements.length,
              skippedReservedBalanceCount,
            };
          },
        );

        await this.publishMutation(
          context,
          transaction,
          actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RESTRICTION_SWEEP,
          OUTBOX_EVENTS.STOCK_RESTRICTED,
          REALTIME_EVENTS.STOCK_CHANGED,
          'InventoryRestrictionSweep',
          transaction.transactionId,
          result,
          {},
        );

        return result;
      },
    });
  }

  public async listLowStock(
    actor: InventoryControlCommandContext['actor'],
    query: InventoryMonitoringQuery,
  ) {
    await this.authorizeMonitoring(actor, query.locationId, false);

    return this.dependencies.monitoring.listLowStock(
      actor.facilityId,
      query,
    );
  }

  public async listNearExpiry(
    actor: InventoryControlCommandContext['actor'],
    query: NearExpiryInventoryQuery,
  ) {
    await this.authorizeMonitoring(actor, query.locationId, false);

    return this.dependencies.monitoring.listNearExpiry(
      actor.facilityId,
      query,
    );
  }

  public async listValuation(
    actor: InventoryControlCommandContext['actor'],
    query: InventoryValuationQuery,
  ) {
    await this.authorizeMonitoring(actor, query.locationId, true);

    return this.dependencies.monitoring.listValuation(
      actor.facilityId,
      query,
    );
  }

  public async listReconciliation(
    actor: InventoryControlCommandContext['actor'],
    query: StockReconciliationQuery,
  ) {
    await this.authorizeMonitoring(actor, query.locationId, false);

    return this.dependencies.monitoring.listReconciliation(
      actor.facilityId,
      query,
    );
  }

  private adjustmentLedgerEntries(
    context: InventoryControlCommandContext,
    transactionId: string,
    actorStaffId: string,
    adjustment: StockAdjustmentRecord,
    occurredAt: Date,
  ): StockLedgerEntryInput[] {
    return adjustment.lines.map((line) => ({
      facilityId: context.actor.facilityId,
      transactionId,
      correlationId: context.actor.correlationId,
      actorUserId: context.actor.userId,
      actorStaffId,
      itemId: line.itemId.toHexString(),
      batchId: line.batchId?.toHexString() ?? null,
      locationId: adjustment.locationId.toHexString(),
      stockUnitId: line.stockUnitId.toHexString(),
      movementType: movementTypeForAdjustment(adjustment.adjustmentType),
      sourceType:
        adjustment.sourceType === 'PHYSICAL_STOCK_COUNT'
          ? 'PHYSICAL_STOCK_COUNT'
          : adjustment.sourceType === 'PRODUCT_RECALL'
            ? 'PRODUCT_RECALL'
            : adjustment.sourceType === 'EXPIRY_JOB'
              ? 'EXPIRY_JOB'
              : 'STOCK_ADJUSTMENT',
      sourceId: adjustment._id.toHexString(),
      sourceLineId: line._id.toHexString(),
      operationKey: deduplicationKey(
        transactionId,
        'stock-adjustment',
        line._id.toHexString(),
      ),
      quantity: line.quantity.toString(),
      onHandDelta: line.onHandDelta.toString(),
      availableDelta: line.availableDelta.toString(),
      reservedDelta: line.reservedDelta.toString(),
      quarantinedDelta: line.quarantinedDelta.toString(),
      damagedDelta: line.damagedDelta.toString(),
      expiredDelta: line.expiredDelta.toString(),
      inTransitDelta: '0',
      unitCost: line.unitCost?.toString() ?? null,
      currency: line.currency,
      reason: adjustment.reason,
      metadata: {
        adjustmentNumber: adjustment.adjustmentNumber,
        adjustmentType: adjustment.adjustmentType,
        reasonCode: line.reasonCode,
      },
      occurredAt,
      allowNegativeStock: false,
    }));
  }

  private async authorizeMonitoring(
    actor: InventoryControlCommandContext['actor'],
    locationId: string | undefined,
    requireCost: boolean,
  ): Promise<void> {
    const location =
      locationId === undefined
        ? undefined
        : await this.requireLocationRecord(actor.facilityId, locationId);

    requireAllowed(
      await this.dependencies.accessPolicy.authorize({
        actor,
        action: requireCost ? 'COST_READ' : 'REPORT_READ',
        ...(location === undefined ? {} : { location }),
      }),
    );
  }

  private async requireAdjustment(
    facilityId: string,
    adjustmentId: string,
  ): Promise<StockAdjustmentRecord> {
    const adjustment = await this.dependencies.repository.findAdjustment(
      facilityId,
      adjustmentId,
    );

    if (adjustment === null) {
      throw new ResourceNotFoundError(
        'Stock adjustment was not found',
      );
    }

    return adjustment;
  }

  private async requirePhysicalCount(
    facilityId: string,
    countId: string,
  ): Promise<PhysicalStockCountRecord> {
    const count = await this.dependencies.repository.findPhysicalCount(
      facilityId,
      countId,
    );

    if (count === null) {
      throw new ResourceNotFoundError(
        'Physical stock count was not found',
      );
    }

    return count;
  }

  private async requireProductRecall(
    facilityId: string,
    recallId: string,
  ): Promise<ProductRecallRecord> {
    const recall = await this.dependencies.repository.findProductRecall(
      facilityId,
      recallId,
    );

    if (recall === null) {
      throw new ResourceNotFoundError(
        'Product recall was not found',
      );
    }

    return recall;
  }

  private async requireLocationRecord(
    facilityId: string,
    locationId: string,
  ) {
    const location = await this.dependencies.catalog.findLocationById(
      facilityId,
      locationId,
    );

    if (location === null) {
      throw new ResourceNotFoundError(
        'Inventory location was not found',
      );
    }

    return location;
  }

  private async publishMutation(
    context: InventoryControlCommandContext,
    transaction: InventoryProcurementTransactionContext,
    actorStaffId: string,
    occurredAt: Date,
    auditAction: string,
    outboxEvent: string,
    realtimeEvent: string,
    entityType: string,
    entityId: string,
    after: Record<string, unknown>,
    routing: {
      locationId?: string;
    },
    before?: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const deduplication = deduplicationKey(
      transaction.transactionId,
      auditAction,
      entityId,
    );

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: deduplication,
      action: auditAction,
      entityType,
      entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      ...(context.actor.ipAddress === undefined
        ? {}
        : {
            ipAddress: context.actor.ipAddress,
          }),
      ...(context.actor.userAgent === undefined
        ? {}
        : {
            userAgent: context.actor.userAgent,
          }),
      ...(reason === undefined
        ? {}
        : {
            reason,
          }),
      ...(before === undefined
        ? {}
        : {
            before,
          }),
      after,
    });

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: `${deduplication}:outbox`,
      eventType: outboxEvent,
      aggregateType: entityType,
      aggregateId: entityId,
      actorUserId: context.actor.userId,
      actorStaffId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      occurredAt,
      payload: after,
    });

    await this.dependencies.realtime.publish({
      eventType: realtimeEvent,
      facilityId: context.actor.facilityId,
      ...(routing.locationId === undefined
        ? {}
        : {
            locationId: routing.locationId,
          }),
      payload: {
        entityType,
        entityId,
        ...after,
      },
    });
  }
}