import Decimal from 'decimal.js';
import {
  Types,
  type ClientSession,
  type Query,
} from 'mongoose';

import {
  InventoryBatchModel,
  InventoryItemModel,
  StockBalanceModel,
  StockMovementModel,
  StockReservationItemModel,
  StockReservationModel,
  StockTransferItemModel,
  StockTransferModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  CreateStockTransferRequestInput,
  ReceiveStockTransferInput,
  RejectStockTransferInput,
  ReleaseStockReservationInput,
  ReserveStockInput,
  CancelStockTransferInput,
  DispatchStockTransferInput,
  ReverseStockTransferInput,
} from '../inventory-stock.contracts.js';

import type {
  InventoryStockOperationsRepositoryPort,
} from '../inventory-stock.ports.js';

import type {
  CreatedStockReservationAggregate,
  CreatedStockTransferAggregate,
  InventoryStockMongoSession,
  PreparedReservationLine,
  PreparedTransferLine,
  StockLedgerEntryInput,
  StockMovementRecord,
  StockReservationItemRecord,
  StockReservationRecord,
  StockTransferItemRecord,
  StockTransferRecord,
  TransferReceiptAllocationInput,
} from '../inventory-stock.persistence.types.js';

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

function withSession<T>(
  query: Query<T, unknown>,
  session?: InventoryStockMongoSession,
): Query<T, unknown> {
  return session === undefined
    ? query
    : query.session(session);
}

function sessionOptions(session: ClientSession) {
  return {
    session,
    ordered: true,
  } as const;
}

function common(
  facilityId: string,
  actorUserId: string,
  transactionId: string,
  correlationId: string,
): Record<string, unknown> {
  const actorId = toObjectId(
    actorUserId,
    'actorUserId',
  );

  return {
    facilityId: toObjectId(
      facilityId,
      'facilityId',
    ),
    transactionId,
    correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function directionFor(
  onHandDelta: Decimal,
): 'IN' | 'OUT' | 'NEUTRAL' {
  return onHandDelta.gt(0)
    ? 'IN'
    : onHandDelta.lt(0)
      ? 'OUT'
      : 'NEUTRAL';
}

function balanceKey(
  input: Readonly<{
    locationId: string;
    itemId: string;
    batchId: string | null;
  }>,
): string {
  return [
    input.locationId.toLowerCase(),
    input.itemId.toLowerCase(),
    input.batchId?.toLowerCase() ?? 'none',
  ].join(':');
}

function movementNumber(
  transactionId: string,
  sequence: number,
): string {
  return `SM-${transactionId.slice(0, 150)}-${String(sequence).padStart(8, '0')}`
    .toUpperCase();
}

function allocationId(
  value: unknown,
): string {
  if (
    value != null &&
    typeof value === 'object' &&
    '_id' in value
  ) {
    return String(value._id);
  }

  throw new TypeError(
    'Stock allocation is missing its identifier',
  );
}

export class InventoryStockOperationsRepository
implements InventoryStockOperationsRepositoryPort {
  public async withTransaction<T>(
    work: (
      session: InventoryStockMongoSession,
    ) => Promise<T>,
  ): Promise<T> {
    const session =
      await StockMovementModel.db.startSession();

    try {
      let result: T | undefined;

      await session.withTransaction(
        async () => {
          result = await work(session);
        },
      );

      if (result === undefined) {
        throw new Error(
          'Inventory stock transaction completed without a result',
        );
      }

      return result;
    } finally {
      await session.endSession();
    }
  }

  public async findMovementByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockMovementRecord | null> {
    return record<StockMovementRecord | null>(
      await withSession(
        StockMovementModel.findOne({
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          operationKey,
        }).select(
          '+reason +metadata +negativeStockOverrideReason',
        ),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findMovementsBySource(
    facilityId: string,
    sourceType: string,
    sourceId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]> {
    return record<StockMovementRecord[]>(
      await withSession(
        StockMovementModel.find({
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          sourceType,
          sourceId: toObjectId(
            sourceId,
            'sourceId',
          ),
        })
          .select(
            '+reason +metadata +negativeStockOverrideReason',
          )
          .sort({
            occurredAt: 1,
            ledgerSequence: 1,
            _id: 1,
          }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async postLedgerEntries(
    entries: readonly StockLedgerEntryInput[],
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]> {
    const sortedEntries = [...entries].sort(
      (left, right) => {
        const keyComparison = balanceKey(left).localeCompare(
          balanceKey(right),
        );

        return keyComparison !== 0
          ? keyComparison
          : left.operationKey.localeCompare(
              right.operationKey,
            );
      },
    );

    const results: StockMovementRecord[] = [];

    for (const entry of sortedEntries) {
      const existing =
        await this.findMovementByOperationKey(
          entry.facilityId,
          entry.operationKey,
          session,
        );

      if (existing !== null) {
        results.push(existing);
        continue;
      }

      const facilityObjectId = toObjectId(
        entry.facilityId,
        'facilityId',
      );
      const itemObjectId = toObjectId(
        entry.itemId,
        'itemId',
      );
      const locationObjectId = toObjectId(
        entry.locationId,
        'locationId',
      );
      const batchObjectId =
        entry.batchId === null
          ? null
          : toObjectId(
              entry.batchId,
              'batchId',
            );

      const item = await InventoryItemModel.findOne({
        _id: itemObjectId,
        facilityId: facilityObjectId,
      })
        .select(
          '_id facilityId stockUnitId batchTrackingRequired negativeStockAllowed controlledMedicine',
        )
        .session(session)
        .lean()
        .exec();

      if (item === null) {
        throw new ResourceNotFoundError(
          'Inventory item was not found while posting stock',
        );
      }

      if (
        item.stockUnitId.toHexString().toLowerCase() !==
        entry.stockUnitId.toLowerCase()
      ) {
        throw new ConflictError(
          'Stock movement unit does not match the inventory item stock unit',
        );
      }

      if (
        item.batchTrackingRequired &&
        batchObjectId === null
      ) {
        throw new ConflictError(
          'Batch-tracked inventory items require a batch on every stock movement',
        );
      }

      if (batchObjectId !== null) {
        const batch = await InventoryBatchModel.findOne({
          _id: batchObjectId,
          facilityId: facilityObjectId,
          itemId: itemObjectId,
        })
          .select('_id')
          .session(session)
          .lean()
          .exec();

        if (batch === null) {
          throw new ResourceNotFoundError(
            'Inventory batch was not found while posting stock',
          );
        }
      }

      const current = await StockBalanceModel.findOne({
        facilityId: facilityObjectId,
        storeLocationId: locationObjectId,
        itemId: itemObjectId,
        batchId: batchObjectId,
      })
        .select(
          '+negativeStockOverrideReason',
        )
        .session(session)
        .lean()
        .exec();

      const before = {
        onHand: new Decimal(
          current?.onHandQuantity.toString() ?? '0',
        ),
        available: new Decimal(
          current?.availableQuantity.toString() ?? '0',
        ),
        reserved: new Decimal(
          current?.reservedQuantity.toString() ?? '0',
        ),
        quarantined: new Decimal(
          current?.quarantinedQuantity.toString() ?? '0',
        ),
        damaged: new Decimal(
          current?.damagedQuantity.toString() ?? '0',
        ),
        expired: new Decimal(
          current?.expiredQuantity.toString() ?? '0',
        ),
        inTransit: new Decimal(
          current?.inTransitQuantity.toString() ?? '0',
        ),
      };

      const deltas = {
        onHand: new Decimal(entry.onHandDelta),
        available: new Decimal(entry.availableDelta),
        reserved: new Decimal(entry.reservedDelta),
        quarantined: new Decimal(entry.quarantinedDelta),
        damaged: new Decimal(entry.damagedDelta),
        expired: new Decimal(entry.expiredDelta),
        inTransit: new Decimal(entry.inTransitDelta),
      };

      const after = {
        onHand: before.onHand.plus(deltas.onHand),
        available: before.available.plus(deltas.available),
        reserved: before.reserved.plus(deltas.reserved),
        quarantined: before.quarantined.plus(
          deltas.quarantined,
        ),
        damaged: before.damaged.plus(deltas.damaged),
        expired: before.expired.plus(deltas.expired),
        inTransit: before.inTransit.plus(deltas.inTransit),
      };

      if (
        after.reserved.isNegative() ||
        after.quarantined.isNegative() ||
        after.damaged.isNegative() ||
        after.expired.isNegative() ||
        after.inTransit.isNegative()
      ) {
        throw new ConflictError(
          'Stock posting would create a negative restricted, reserved, or in-transit balance',
        );
      }

      const negativeOnHand =
        after.onHand.isNegative() ||
        after.available.isNegative();

      const negativeAllowed =
        entry.allowNegativeStock === true &&
        item.negativeStockAllowed &&
        !item.controlledMedicine;

      if (negativeOnHand && !negativeAllowed) {
        throw new ConflictError(
          'Stock posting would create negative inventory',
        );
      }

      if (
        negativeOnHand &&
        entry.negativeStockOverrideReason == null
      ) {
        throw new ConflictError(
          'Negative stock requires an attributable override reason',
        );
      }

      const classified = after.available
        .plus(after.reserved)
        .plus(after.quarantined)
        .plus(after.damaged)
        .plus(after.expired);

      if (!classified.eq(after.onHand)) {
        throw new ConflictError(
          'Stock posting does not reconcile the on-hand balance',
        );
      }

      const movementId = new Types.ObjectId();
      const balanceVersionBefore =
        current?.version ?? 0;
      const balanceVersionAfter =
        balanceVersionBefore + 1;
      const ledgerSequence =
        (current?.lastLedgerSequence ?? 0) + 1;
      const actorUserId = toObjectId(
        entry.actorUserId,
        'actorUserId',
      );

      const balanceSet = {
        onHandQuantity: decimal(after.onHand.toFixed()),
        availableQuantity: decimal(
          after.available.toFixed(),
        ),
        reservedQuantity: decimal(
          after.reserved.toFixed(),
        ),
        quarantinedQuantity: decimal(
          after.quarantined.toFixed(),
        ),
        damagedQuantity: decimal(
          after.damaged.toFixed(),
        ),
        expiredQuantity: decimal(
          after.expired.toFixed(),
        ),
        inTransitQuantity: decimal(
          after.inTransit.toFixed(),
        ),
        negativeStockOverride: negativeOnHand,
        negativeStockOverrideReason: negativeOnHand
          ? entry.negativeStockOverrideReason
          : null,
        negativeStockAuthorizedBy: negativeOnHand
          ? actorUserId
          : null,
        lastMovementId: movementId,
        lastMovementAt: entry.occurredAt,
        lastLedgerSequence: ledgerSequence,
        projectionTransactionId: entry.transactionId,
        correlationId: entry.correlationId,
        updatedBy: actorUserId,
      };

      if (current === null) {
        const [createdBalance] =
          await StockBalanceModel.create(
            [
              {
                _id: new Types.ObjectId(),
                facilityId: facilityObjectId,
                storeLocationId: locationObjectId,
                itemId: itemObjectId,
                batchId: batchObjectId,
                ...balanceSet,
                schemaVersion: 1,
                version: balanceVersionAfter,
                createdBy: actorUserId,
              },
            ],
            sessionOptions(session),
          );

        if (createdBalance === undefined) {
          throw new Error(
            'Stock balance was not created',
          );
        }
      } else {
        const updatedBalance =
          await StockBalanceModel.updateOne(
            {
              _id: current._id,
              facilityId: facilityObjectId,
              version: balanceVersionBefore,
              lastLedgerSequence:
                current.lastLedgerSequence,
            },
            {
              $set: balanceSet,
              $inc: {
                version: 1,
              },
            },
            {
              session,
              runValidators: true,
            },
          ).exec();

        if (updatedBalance.modifiedCount !== 1) {
          throw new ConcurrencyConflictError(
            'Stock balance changed before ledger posting completed',
          );
        }
      }

      const [movement] =
        await StockMovementModel.create(
          [
            {
              _id: movementId,
              facilityId: facilityObjectId,
              movementNumber: movementNumber(
                entry.transactionId,
                ledgerSequence,
              ),
              ledgerSequence,
              itemId: itemObjectId,
              batchId: batchObjectId,
              storeLocationId: locationObjectId,
              stockUnitId: toObjectId(
                entry.stockUnitId,
                'stockUnitId',
              ),
              movementType: entry.movementType,
              direction: directionFor(
                deltas.onHand,
              ),
              quantity: decimal(entry.quantity),
              onHandDelta: decimal(
                deltas.onHand.toFixed(),
              ),
              availableDelta: decimal(
                deltas.available.toFixed(),
              ),
              reservedDelta: decimal(
                deltas.reserved.toFixed(),
              ),
              quarantinedDelta: decimal(
                deltas.quarantined.toFixed(),
              ),
              damagedDelta: decimal(
                deltas.damaged.toFixed(),
              ),
              expiredDelta: decimal(
                deltas.expired.toFixed(),
              ),
              inTransitDelta: decimal(
                deltas.inTransit.toFixed(),
              ),
              balanceVersionBefore,
              balanceVersionAfter,
              sourceType: entry.sourceType,
              sourceId: toObjectId(
                entry.sourceId,
                'sourceId',
              ),
              sourceLineId:
                entry.sourceLineId === null
                  ? null
                  : toObjectId(
                      entry.sourceLineId,
                      'sourceLineId',
                    ),
              reversalOfMovementId:
                entry.reversalOfMovementId == null
                  ? null
                  : toObjectId(
                      entry.reversalOfMovementId,
                      'reversalOfMovementId',
                    ),
              operationKey: entry.operationKey,
              actorStaffId: toObjectId(
                entry.actorStaffId,
                'actorStaffId',
              ),
              unitCost:
                entry.unitCost == null
                  ? null
                  : decimal(entry.unitCost),
              currency:
                entry.currency?.trim().toUpperCase() ??
                null,
              negativeStockOverride: negativeOnHand,
              negativeStockOverrideReason:
                negativeOnHand
                  ? entry.negativeStockOverrideReason
                  : null,
              reason:
                normalizeNullableInventoryText(
                  entry.reason,
                ),
              metadata: entry.metadata ?? null,
              occurredAt: entry.occurredAt,
              transactionId: entry.transactionId,
              correlationId: entry.correlationId,
              schemaVersion: 1,
              version: 0,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          ],
          sessionOptions(session),
        );

      if (movement === undefined) {
        throw new Error(
          'Stock movement was not created',
        );
      }

      results.push(
        record<StockMovementRecord>(
          movement.toObject(),
        ),
      );
    }

    return results;
  }

  public async createTransferAggregate(
    input: CreateStockTransferRequestInput,
    prepared: Readonly<{
      transferNumber: string;
      requestedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      lines: readonly {
        itemId: string;
        stockUnitId: string;
        requestedStockQuantity: string;
        notes: string | null;
      }[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryStockMongoSession,
  ): Promise<CreatedStockTransferAggregate> {
    const transferId = new Types.ObjectId();
    const metadata = common(
      facilityId,
      actorUserId,
      prepared.transactionId,
      prepared.correlationId,
    );

    const [transfer] = await StockTransferModel.create(
      [
        {
          _id: transferId,
          ...metadata,
          transferNumber: prepared.transferNumber,
          transferType: input.transferType,
          sourceLocationId: toObjectId(
            input.sourceLocationId,
            'sourceLocationId',
          ),
          destinationLocationId: toObjectId(
            input.destinationLocationId,
            'destinationLocationId',
          ),
          requestedByStaffId: toObjectId(
            prepared.requestedByStaffId,
            'requestedByStaffId',
          ),
          approvedByStaffId: null,
          rejectedByStaffId: null,
          dispatchedByStaffId: null,
          receivedByStaffId: null,
          cancelledByStaffId: null,
          reversedByStaffId: null,
          reservationId: null,
          reason: normalizeInventoryDisplayText(
            input.reason,
          ),
          notes: normalizeNullableInventoryText(
            input.notes,
          ),
          status: 'REQUESTED',
          lineCount: prepared.lines.length,
          requestedAt: prepared.occurredAt,
          approvedAt: null,
          rejectedAt: null,
          dispatchedAt: null,
          receivedAt: null,
          cancelledAt: null,
          reversedAt: null,
          decisionReason: null,
          discrepancyReason: null,
          cancellationReason: null,
          reversalReason: null,
          dispatchTransactionId: null,
          receiptTransactionId: null,
          reversalTransactionId: null,
        },
      ],
      sessionOptions(session),
    );

    if (transfer === undefined) {
      throw new Error(
        'Stock transfer was not created',
      );
    }

    const items = await StockTransferItemModel.create(
      prepared.lines.map(
        (line, index) => ({
          _id: new Types.ObjectId(),
          ...metadata,
          stockTransferId: transferId,
          lineNumber: index + 1,
          itemId: toObjectId(
            line.itemId,
            'itemId',
          ),
          stockUnitId: toObjectId(
            line.stockUnitId,
            'stockUnitId',
          ),
          requestedStockQuantity: decimal(
            line.requestedStockQuantity,
          ),
          approvedStockQuantity: decimal('0'),
          dispatchedStockQuantity: decimal('0'),
          receivedStockQuantity: decimal('0'),
          discrepancyStockQuantity: decimal('0'),
          allocations: [],
          status: 'REQUESTED',
          notes: normalizeNullableInventoryText(
            line.notes,
          ),
        }),
      ),
      sessionOptions(session),
    );

    return {
      transfer: record<StockTransferRecord>(
        transfer.toObject(),
      ),
      items: record<StockTransferItemRecord[]>(
        items.map((item) => item.toObject()),
      ),
    };
  }

  public async findTransfer(
    facilityId: string,
    transferId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    return record<StockTransferRecord | null>(
      await withSession(
        StockTransferModel.findOne({
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
        }).select(
          '+reason +notes +decisionReason +discrepancyReason +cancellationReason +reversalReason',
        ),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findTransferItems(
    facilityId: string,
    transferId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockTransferItemRecord[]> {
    return record<StockTransferItemRecord[]>(
      await withSession(
        StockTransferItemModel.find({
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          stockTransferId: toObjectId(
            transferId,
            'transferId',
          ),
        })
          .select('+notes')
          .sort({
            lineNumber: 1,
          }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async approveTransfer(
    facilityId: string,
    transferId: string,
    expectedVersion: number,
    reservationId: string,
    preparedLines: readonly PreparedTransferLine[],
    actorUserId: string,
    actorStaffId: string,
    reason: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    for (const line of preparedLines) {
      const updated = await StockTransferItemModel.updateOne(
        {
          _id: toObjectId(
            line.transferItemId,
            'transferItemId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          stockTransferId: toObjectId(
            transferId,
            'transferId',
          ),
          version: line.expectedVersion,
          status: 'REQUESTED',
        },
        {
          $set: {
            approvedStockQuantity: decimal(
              line.approvedStockQuantity,
            ),
            allocations: line.allocations.map(
              (allocation) => ({
                _id: new Types.ObjectId(),
                batchId:
                  allocation.batchId === null
                    ? null
                    : toObjectId(
                        allocation.batchId,
                        'batchId',
                      ),
                allocatedStockQuantity: decimal(
                  allocation.stockQuantity,
                ),
                dispatchedStockQuantity:
                  decimal('0'),
                receivedStockQuantity: decimal('0'),
                discrepancyStockQuantity:
                  decimal('0'),
              }),
            ),
            status: 'APPROVED',
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'A stock-transfer line changed before approval completed',
        );
      }
    }

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
          status: 'REQUESTED',
        },
        {
          $set: {
            status: 'APPROVED',
            reservationId: toObjectId(
              reservationId,
              'reservationId',
            ),
            approvedAt: occurredAt,
            approvedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            decisionReason: normalizeInventoryDisplayText(
              reason,
            ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select(
          '+reason +notes +decisionReason +discrepancyReason +cancellationReason +reversalReason',
        )
        .lean()
        .exec(),
    );
  }

  public async rejectTransfer(
    facilityId: string,
    transferId: string,
    input: RejectStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    await StockTransferItemModel.updateMany(
      {
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        stockTransferId: toObjectId(
          transferId,
          'transferId',
        ),
        status: 'REQUESTED',
      },
      {
        $set: {
          status: 'REJECTED',
          updatedBy: toObjectId(
            actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: 'REQUESTED',
        },
        {
          $set: {
            status: 'REJECTED',
            rejectedAt: occurredAt,
            rejectedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            decisionReason: normalizeInventoryDisplayText(
              input.reason,
            ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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

  public async markTransferDispatched(
    facilityId: string,
    transferId: string,
    input: DispatchStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    const items = await this.findTransferItems(
      facilityId,
      transferId,
      session,
    );

    for (const item of items) {
      const allocations = item.allocations.map(
        (allocation) => ({
          _id: allocation._id,
          batchId: allocation.batchId,
          allocatedStockQuantity:
            allocation.allocatedStockQuantity,
          dispatchedStockQuantity:
            allocation.allocatedStockQuantity,
          receivedStockQuantity:
            allocation.receivedStockQuantity,
          discrepancyStockQuantity:
            allocation.discrepancyStockQuantity,
        }),
      );

      const updated = await StockTransferItemModel.updateOne(
        {
          _id: item._id,
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: item.version,
          status: 'APPROVED',
        },
        {
          $set: {
            dispatchedStockQuantity:
              item.approvedStockQuantity,
            allocations,
            status: 'DISPATCHED',
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'A transfer line changed before dispatch completed',
        );
      }
    }

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: 'APPROVED',
        },
        {
          $set: {
            status: 'DISPATCHED',
            dispatchedAt: occurredAt,
            dispatchedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            dispatchTransactionId: transactionId,
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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

  public async recordTransferReceipt(
    facilityId: string,
    transferId: string,
    input: ReceiveStockTransferInput,
    receiptAllocations: readonly TransferReceiptAllocationInput[],
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    const items = await this.findTransferItems(
      facilityId,
      transferId,
      session,
    );

    for (const item of items) {
      const lineUpdates = receiptAllocations.filter(
        (allocation) =>
          allocation.transferItemId ===
          item._id.toHexString(),
      );

      if (lineUpdates.length === 0) {
        continue;
      }

      const allocations = item.allocations.map(
        (allocation) => {
          const update = lineUpdates.find(
            (candidate) =>
              candidate.allocationId ===
              allocation._id.toHexString(),
          );

          if (update === undefined) {
            return allocation;
          }

          return {
            _id: allocation._id,
            batchId: allocation.batchId,
            allocatedStockQuantity:
              allocation.allocatedStockQuantity,
            dispatchedStockQuantity:
              allocation.dispatchedStockQuantity,
            receivedStockQuantity: decimal(
              new Decimal(
                allocation.receivedStockQuantity.toString(),
              )
                .plus(update.receivedStockQuantity)
                .toFixed(),
            ),
            discrepancyStockQuantity: decimal(
              new Decimal(
                allocation.discrepancyStockQuantity.toString(),
              )
                .plus(update.discrepancyStockQuantity)
                .toFixed(),
            ),
          };
        },
      );

      const received = allocations.reduce(
        (total, allocation) =>
          total.plus(
            decimalString(
              allocation.receivedStockQuantity,
            ),
          ),
        new Decimal(0),
      );

      const discrepancy = allocations.reduce(
        (total, allocation) =>
          total.plus(
            decimalString(
              allocation.discrepancyStockQuantity,
            ),
          ),
        new Decimal(0),
      );

      const dispatched = new Decimal(
        item.dispatchedStockQuantity.toString(),
      );

      const settled = received.plus(discrepancy);
      const status = settled.eq(dispatched)
        ? discrepancy.gt(0)
          ? 'DISCREPANCY'
          : 'RECEIVED'
        : 'PARTIALLY_RECEIVED';

      const updated = await StockTransferItemModel.updateOne(
        {
          _id: item._id,
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: item.version,
          status: {
            $in: [
              'DISPATCHED',
              'PARTIALLY_RECEIVED',
            ],
          },
        },
        {
          $set: {
            allocations,
            receivedStockQuantity: decimal(
              received.toFixed(),
            ),
            discrepancyStockQuantity: decimal(
              discrepancy.toFixed(),
            ),
            status,
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
          },
          $inc: {
            version: 1,
          },
        },
        {
          session,
          runValidators: true,
        },
      ).exec();

      if (updated.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'A transfer line changed before receipt completed',
        );
      }
    }

    const refreshedItems = await this.findTransferItems(
      facilityId,
      transferId,
      session,
    );

    const allSettled = refreshedItems.every(
      (item) =>
        new Decimal(
          item.receivedStockQuantity.toString(),
        )
          .plus(
            item.discrepancyStockQuantity.toString(),
          )
          .eq(
            item.dispatchedStockQuantity.toString(),
          ),
    );

    const anyDiscrepancy = refreshedItems.some(
      (item) =>
        new Decimal(
          item.discrepancyStockQuantity.toString(),
        ).gt(0),
    );

    const status = allSettled
      ? anyDiscrepancy
        ? 'DISCREPANCY'
        : 'RECEIVED'
      : 'PARTIALLY_RECEIVED';

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: {
            $in: [
              'DISPATCHED',
              'PARTIALLY_RECEIVED',
            ],
          },
        },
        {
          $set: {
            status,
            receivedAt: allSettled
              ? occurredAt
              : null,
            receivedByStaffId: allSettled
              ? toObjectId(
                  actorStaffId,
                  'actorStaffId',
                )
              : null,
            receiptTransactionId: transactionId,
            discrepancyReason: anyDiscrepancy
              ? normalizeNullableInventoryText(
                  input.discrepancyReason,
                )
              : null,
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select(
          '+reason +notes +decisionReason +discrepancyReason',
        )
        .lean()
        .exec(),
    );
  }

  public async cancelTransfer(
    facilityId: string,
    transferId: string,
    input: CancelStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    await StockTransferItemModel.updateMany(
      {
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        stockTransferId: toObjectId(
          transferId,
          'transferId',
        ),
        status: {
          $in: [
            'REQUESTED',
            'APPROVED',
          ],
        },
      },
      {
        $set: {
          status: 'CANCELLED',
          updatedBy: toObjectId(
            actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: {
            $in: [
              'REQUESTED',
              'APPROVED',
            ],
          },
        },
        {
          $set: {
            status: 'CANCELLED',
            cancelledAt: occurredAt,
            cancelledByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            cancellationReason:
              normalizeInventoryDisplayText(
                input.reason,
              ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select('+reason +cancellationReason')
        .lean()
        .exec(),
    );
  }

  public async reverseTransfer(
    facilityId: string,
    transferId: string,
    input: ReverseStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null> {
    await StockTransferItemModel.updateMany(
      {
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        stockTransferId: toObjectId(
          transferId,
          'transferId',
        ),
        status: {
          $in: [
            'DISPATCHED',
            'PARTIALLY_RECEIVED',
            'RECEIVED',
            'DISCREPANCY',
          ],
        },
      },
      {
        $set: {
          status: 'REVERSED',
          updatedBy: toObjectId(
            actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    return record<StockTransferRecord | null>(
      await StockTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(
            transferId,
            'transferId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: {
            $in: [
              'DISPATCHED',
              'PARTIALLY_RECEIVED',
              'RECEIVED',
              'DISCREPANCY',
            ],
          },
        },
        {
          $set: {
            status: 'REVERSED',
            reversedAt: occurredAt,
            reversedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            reversalReason:
              normalizeInventoryDisplayText(
                input.reason,
              ),
            reversalTransactionId: transactionId,
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select('+reason +reversalReason')
        .lean()
        .exec(),
    );
  }

  public async createReservationAggregate(
    input: ReserveStockInput,
    prepared: Readonly<{
      reservationNumber: string;
      reservedByStaffId: string;
      transactionId: string;
      correlationId: string;
      occurredAt: Date;
      lines: readonly PreparedReservationLine[];
    }>,
    actorUserId: string,
    facilityId: string,
    session: InventoryStockMongoSession,
  ): Promise<CreatedStockReservationAggregate> {
    const reservationId = new Types.ObjectId();
    const metadata = common(
      facilityId,
      actorUserId,
      prepared.transactionId,
      prepared.correlationId,
    );

    const [reservation] =
      await StockReservationModel.create(
        [
          {
            _id: reservationId,
            ...metadata,
            reservationNumber:
              prepared.reservationNumber,
            sourceType: input.sourceType,
            sourceId: toObjectId(
              input.sourceId,
              'sourceId',
            ),
            sourceLineId:
              input.sourceLineId == null
                ? null
                : toObjectId(
                    input.sourceLineId,
                    'sourceLineId',
                  ),
            locationId: toObjectId(
              input.locationId,
              'locationId',
            ),
            patientId:
              input.patientId == null
                ? null
                : toObjectId(
                    input.patientId,
                    'patientId',
                  ),
            reservedByStaffId: toObjectId(
              prepared.reservedByStaffId,
              'reservedByStaffId',
            ),
            consumedByStaffId: null,
            releasedByStaffId: null,
            reversedByStaffId: null,
            status: 'ACTIVE',
            lineCount: prepared.lines.length,
            reservedAt: prepared.occurredAt,
            expiresAt: new Date(input.expiresAt),
            consumedAt: null,
            releasedAt: null,
            reversedAt: null,
            releaseReason: null,
            reversalReason: null,
            consumptionSourceId: null,
          },
        ],
        sessionOptions(session),
      );

    if (reservation === undefined) {
      throw new Error(
        'Stock reservation was not created',
      );
    }

    const items =
      await StockReservationItemModel.create(
        prepared.lines.map(
          (line, index) => ({
            _id: new Types.ObjectId(),
            ...metadata,
            stockReservationId: reservationId,
            lineNumber: index + 1,
            itemId: toObjectId(
              line.itemId,
              'itemId',
            ),
            stockUnitId: toObjectId(
              line.stockUnitId,
              'stockUnitId',
            ),
            requestedStockQuantity: decimal(
              line.requestedStockQuantity,
            ),
            reservedStockQuantity: decimal(
              line.reservedStockQuantity,
            ),
            consumedStockQuantity: decimal('0'),
            releasedStockQuantity: decimal('0'),
            allocations: line.allocations.map(
              (allocation) => ({
                _id: new Types.ObjectId(),
                batchId:
                  allocation.batchId === null
                    ? null
                    : toObjectId(
                        allocation.batchId,
                        'batchId',
                      ),
                reservedStockQuantity: decimal(
                  allocation.stockQuantity,
                ),
                consumedStockQuantity: decimal('0'),
                releasedStockQuantity: decimal('0'),
              }),
            ),
            status: 'ACTIVE',
          }),
        ),
        sessionOptions(session),
      );

    return {
      reservation: record<StockReservationRecord>(
        reservation.toObject(),
      ),
      items: record<StockReservationItemRecord[]>(
        items.map((item) => item.toObject()),
      ),
    };
  }

  public async findReservation(
    facilityId: string,
    reservationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null> {
    return record<StockReservationRecord | null>(
      await withSession(
        StockReservationModel.findOne({
          _id: toObjectId(
            reservationId,
            'reservationId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
        }).select('+releaseReason +reversalReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findReservationBySource(
    facilityId: string,
    sourceType: string,
    sourceId: string,
    sourceLineId: string | null,
    locationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null> {
    return record<StockReservationRecord | null>(
      await withSession(
        StockReservationModel.findOne({
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          sourceType,
          sourceId: toObjectId(
            sourceId,
            'sourceId',
          ),
          sourceLineId:
            sourceLineId === null
              ? null
              : toObjectId(
                  sourceLineId,
                  'sourceLineId',
                ),
          locationId: toObjectId(
            locationId,
            'locationId',
          ),
          status: {
            $in: [
              'ACTIVE',
              'PARTIALLY_CONSUMED',
              'CONSUMED',
            ],
          },
        }).select('+releaseReason +reversalReason'),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async findReservationItems(
    facilityId: string,
    reservationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationItemRecord[]> {
    return record<StockReservationItemRecord[]>(
      await withSession(
        StockReservationItemModel.find({
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          stockReservationId: toObjectId(
            reservationId,
            'reservationId',
          ),
        }).sort({
          lineNumber: 1,
        }),
        session,
      )
        .lean()
        .exec(),
    );
  }

  public async markReservationConsumed(
    facilityId: string,
    reservationId: string,
    expectedVersion: number,
    consumptionSourceId: string,
    consumptionByItem: ReadonlyMap<string, string>,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null> {
    const items = await this.findReservationItems(
      facilityId,
      reservationId,
      session,
    );

    for (const item of items) {
      const requestedConsumption =
        consumptionByItem.get(
          item._id.toHexString(),
        );

      if (requestedConsumption === undefined) {
        continue;
      }

      let remaining = new Decimal(
        requestedConsumption,
      );

      const allocations = item.allocations.map(
        (allocation) => {
          if (remaining.lte(0)) {
            return allocation;
          }

          const available = new Decimal(
            allocation.reservedStockQuantity.toString(),
          )
            .minus(
              allocation.consumedStockQuantity.toString(),
            )
            .minus(
              allocation.releasedStockQuantity.toString(),
            );

          const consume = Decimal.min(
            available,
            remaining,
          );

          remaining = remaining.minus(consume);

          return {
            _id: allocation._id,
            batchId: allocation.batchId,
            reservedStockQuantity:
              allocation.reservedStockQuantity,
            consumedStockQuantity: decimal(
              new Decimal(
                allocation.consumedStockQuantity.toString(),
              )
                .plus(consume)
                .toFixed(),
            ),
            releasedStockQuantity:
              allocation.releasedStockQuantity,
          };
        },
      );

      if (remaining.gt(0)) {
        throw new ConflictError(
          'Consumption quantity exceeds the remaining reservation',
        );
      }

      const consumed = allocations.reduce(
        (total, allocation) =>
          total.plus(
            decimalString(
              allocation.consumedStockQuantity,
            ),
          ),
        new Decimal(0),
      );

      const released = allocations.reduce(
        (total, allocation) =>
          total.plus(
            decimalString(
              allocation.releasedStockQuantity,
            ),
          ),
        new Decimal(0),
      );

      const reserved = new Decimal(
        item.reservedStockQuantity.toString(),
      );

      const status = consumed.plus(released).eq(reserved)
        ? 'CONSUMED'
        : 'PARTIALLY_CONSUMED';

      const updated =
        await StockReservationItemModel.updateOne(
          {
            _id: item._id,
            facilityId: toObjectId(
              facilityId,
              'facilityId',
            ),
            version: item.version,
            status: {
              $in: [
                'ACTIVE',
                'PARTIALLY_CONSUMED',
              ],
            },
          },
          {
            $set: {
              allocations,
              consumedStockQuantity: decimal(
                consumed.toFixed(),
              ),
              status,
              updatedBy: toObjectId(
                actorUserId,
                'actorUserId',
              ),
            },
            $inc: {
              version: 1,
            },
          },
          {
            session,
            runValidators: true,
          },
        ).exec();

      if (updated.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'A stock-reservation line changed before consumption completed',
        );
      }
    }

    const refreshed = await this.findReservationItems(
      facilityId,
      reservationId,
      session,
    );

    const complete = refreshed.every(
      (item) => item.status === 'CONSUMED',
    );

    return record<StockReservationRecord | null>(
      await StockReservationModel.findOneAndUpdate(
        {
          _id: toObjectId(
            reservationId,
            'reservationId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
          status: {
            $in: [
              'ACTIVE',
              'PARTIALLY_CONSUMED',
            ],
          },
        },
        {
          $set: {
            status: complete
              ? 'CONSUMED'
              : 'PARTIALLY_CONSUMED',
            consumedAt: occurredAt,
            consumedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            consumptionSourceId: toObjectId(
              consumptionSourceId,
              'consumptionSourceId',
            ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select('+releaseReason +reversalReason')
        .lean()
        .exec(),
    );
  }

  public async releaseReservation(
    facilityId: string,
    reservationId: string,
    input: ReleaseStockReservationInput,
    releaseByItem: ReadonlyMap<string, string>,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    status: 'RELEASED' | 'EXPIRED',
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null> {
    const items = await this.findReservationItems(
      facilityId,
      reservationId,
      session,
    );

    for (const item of items) {
      const requestedRelease = releaseByItem.get(
        item._id.toHexString(),
      );

      if (requestedRelease === undefined) {
        continue;
      }

      let remaining = new Decimal(
        requestedRelease,
      );

      const allocations = item.allocations.map(
        (allocation) => {
          if (remaining.lte(0)) {
            return allocation;
          }

          const releasable = new Decimal(
            allocation.reservedStockQuantity.toString(),
          )
            .minus(
              allocation.consumedStockQuantity.toString(),
            )
            .minus(
              allocation.releasedStockQuantity.toString(),
            );

          const release = Decimal.min(
            releasable,
            remaining,
          );

          remaining = remaining.minus(release);

          return {
            _id: allocation._id,
            batchId: allocation.batchId,
            reservedStockQuantity:
              allocation.reservedStockQuantity,
            consumedStockQuantity:
              allocation.consumedStockQuantity,
            releasedStockQuantity: decimal(
              new Decimal(
                allocation.releasedStockQuantity.toString(),
              )
                .plus(release)
                .toFixed(),
            ),
          };
        },
      );

      if (remaining.gt(0)) {
        throw new ConflictError(
          'Reservation release exceeds the remaining reserved quantity',
        );
      }

      const released = allocations.reduce(
        (total, allocation) =>
          total.plus(
            decimalString(
              allocation.releasedStockQuantity,
            ),
          ),
        new Decimal(0),
      );

      const updated =
        await StockReservationItemModel.updateOne(
          {
            _id: item._id,
            facilityId: toObjectId(
              facilityId,
              'facilityId',
            ),
            version: item.version,
            status: {
              $in: [
                'ACTIVE',
                'PARTIALLY_CONSUMED',
              ],
            },
          },
          {
            $set: {
              allocations,
              releasedStockQuantity: decimal(
                released.toFixed(),
              ),
              status,
              updatedBy: toObjectId(
                actorUserId,
                'actorUserId',
              ),
            },
            $inc: {
              version: 1,
            },
          },
          {
            session,
            runValidators: true,
          },
        ).exec();

      if (updated.modifiedCount !== 1) {
        throw new ConcurrencyConflictError(
          'A stock-reservation line changed before release completed',
        );
      }
    }

    return record<StockReservationRecord | null>(
      await StockReservationModel.findOneAndUpdate(
        {
          _id: toObjectId(
            reservationId,
            'reservationId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: input.expectedVersion,
          status: {
            $in: [
              'ACTIVE',
              'PARTIALLY_CONSUMED',
            ],
          },
        },
        {
          $set: {
            status,
            releasedAt: occurredAt,
            releasedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            releaseReason: normalizeInventoryDisplayText(
              input.reason,
            ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select('+releaseReason +reversalReason')
        .lean()
        .exec(),
    );
  }

  public async markReservationReversed(
    facilityId: string,
    reservationId: string,
    expectedVersion: number,
    reason: string,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null> {
    await StockReservationItemModel.updateMany(
      {
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        stockReservationId: toObjectId(
          reservationId,
          'reservationId',
        ),
        status: {
          $in: [
            'CONSUMED',
            'PARTIALLY_CONSUMED',
          ],
        },
      },
      {
        $set: {
          status: 'REVERSED',
          updatedBy: toObjectId(
            actorUserId,
            'actorUserId',
          ),
        },
        $inc: {
          version: 1,
        },
      },
      {
        session,
        runValidators: true,
      },
    ).exec();

    return record<StockReservationRecord | null>(
      await StockReservationModel.findOneAndUpdate(
        {
          _id: toObjectId(
            reservationId,
            'reservationId',
          ),
          facilityId: toObjectId(
            facilityId,
            'facilityId',
          ),
          version: expectedVersion,
          status: {
            $in: [
              'CONSUMED',
              'PARTIALLY_CONSUMED',
            ],
          },
        },
        {
          $set: {
            status: 'REVERSED',
            reversedAt: occurredAt,
            reversedByStaffId: toObjectId(
              actorStaffId,
              'actorStaffId',
            ),
            reversalReason: normalizeInventoryDisplayText(
              reason,
            ),
            updatedBy: toObjectId(
              actorUserId,
              'actorUserId',
            ),
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
        .select('+releaseReason +reversalReason')
        .lean()
        .exec(),
    );
  }

  public async listExpiredReservations(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<StockReservationRecord[]> {
    return record<StockReservationRecord[]>(
      await StockReservationModel.find({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        status: {
          $in: [
            'ACTIVE',
            'PARTIALLY_CONSUMED',
          ],
        },
        expiresAt: {
          $lte: at,
        },
      })
        .select('+releaseReason +reversalReason')
        .sort({
          expiresAt: 1,
          _id: 1,
        })
        .limit(
          Math.max(
            1,
            Math.min(limit, 1_000),
          ),
        )
        .lean()
        .exec(),
    );
  }
}