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
  ApproveStockTransferInput,
  CancelStockTransferInput,
  ConsumeDispensingReservationInput,
  CreateStockTransferRequestInput,
  DispatchStockTransferInput,
  DispensingReversalResult,
  DispensingStockResult,
  InventoryStockCommandContext,
  ReceiveStockTransferInput,
  RejectStockTransferInput,
  ReleaseStockReservationInput,
  ReserveStockInput,
  ReverseDispensingInput,
  ReverseStockTransferInput,
} from '../inventory-stock.contracts.js';

import type {
  InventoryDispensingIntegrationPort,
  InventoryStockOperationsDependencies,
} from '../inventory-stock.ports.js';

import type {
  CreatedStockReservationAggregate,
  PreparedReservationLine,
  PreparedTransferLine,
  StockLedgerEntryInput,
  StockReservationItemRecord,
  StockReservationRecord,
  StockTransferItemRecord,
  StockTransferRecord,
  TransferReceiptAllocationInput,
} from '../inventory-stock.persistence.types.js';

import {
  normalizeInventoryDecimal,
} from '../inventory.normalization.js';

const TRANSACTION_TYPES = {
  CREATE_TRANSFER: 'inventory.stock.transfer.create',
  APPROVE_TRANSFER: 'inventory.stock.transfer.approve',
  REJECT_TRANSFER: 'inventory.stock.transfer.reject',
  DISPATCH_TRANSFER: 'inventory.stock.transfer.dispatch',
  RECEIVE_TRANSFER: 'inventory.stock.transfer.receive',
  CANCEL_TRANSFER: 'inventory.stock.transfer.cancel',
  REVERSE_TRANSFER: 'inventory.stock.transfer.reverse',
  RESERVE_STOCK: 'inventory.stock.reservation.create',
  RELEASE_RESERVATION: 'inventory.stock.reservation.release',
  CONSUME_DISPENSING: 'inventory.stock.dispensing.consume',
  REVERSE_DISPENSING: 'inventory.stock.dispensing.reverse',
} as const;

const AUDIT_ACTIONS = {
  TRANSFER_CREATED: 'inventory.stock_transfer.created',
  TRANSFER_APPROVED: 'inventory.stock_transfer.approved',
  TRANSFER_REJECTED: 'inventory.stock_transfer.rejected',
  TRANSFER_DISPATCHED: 'inventory.stock_transfer.dispatched',
  TRANSFER_RECEIVED: 'inventory.stock_transfer.received',
  TRANSFER_CANCELLED: 'inventory.stock_transfer.cancelled',
  TRANSFER_REVERSED: 'inventory.stock_transfer.reversed',
  RESERVATION_CREATED: 'inventory.stock_reservation.created',
  RESERVATION_RELEASED: 'inventory.stock_reservation.released',
  DISPENSING_CONSUMED: 'inventory.dispensing_stock.consumed',
  DISPENSING_REVERSED: 'inventory.dispensing_stock.reversed',
} as const;

const OUTBOX_EVENTS = {
  TRANSFER_CREATED: 'inventory.stock_transfer.created.v1',
  TRANSFER_APPROVED: 'inventory.stock_transfer.approved.v1',
  TRANSFER_REJECTED: 'inventory.stock_transfer.rejected.v1',
  TRANSFER_DISPATCHED: 'inventory.stock_transfer.dispatched.v1',
  TRANSFER_RECEIVED: 'inventory.stock_transfer.received.v1',
  TRANSFER_CANCELLED: 'inventory.stock_transfer.cancelled.v1',
  TRANSFER_REVERSED: 'inventory.stock_transfer.reversed.v1',
  RESERVATION_CREATED: 'inventory.stock_reservation.created.v1',
  RESERVATION_RELEASED: 'inventory.stock_reservation.released.v1',
  DISPENSING_CONSUMED: 'inventory.dispensing_stock.consumed.v1',
  DISPENSING_REVERSED: 'inventory.dispensing_stock.reversed.v1',
} as const;

const REALTIME_EVENTS = {
  TRANSFER_WORKLIST: 'inventory.stock_transfer_worklist.changed',
  RESERVATION_WORKLIST: 'inventory.stock_reservation_worklist.changed',
  STOCK_CHANGED: 'inventory.stock.changed',
} as const;

const SEQUENCE_KEYS = {
  TRANSFER: 'inventory.stock-transfer',
  RESERVATION: 'inventory.stock-reservation',
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
        'Inventory stock operation was denied',
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

function requireFound<T>(
  value: T | null,
  message: string,
): T {
  if (value === null) {
    throw new ResourceNotFoundError(message);
  }

  return value;
}

function formatNumber(
  prefix: 'STR' | 'RSV',
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
    .map((value) => value.toLowerCase())
    .join(':');
}

function deduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return `${transactionId}:${action}:${entityId}`;
}

function transferSnapshot(
  transfer: StockTransferRecord,
): Record<string, unknown> {
  return {
    transferId: transfer._id.toHexString(),
    transferNumber: transfer.transferNumber,
    transferType: transfer.transferType,
    sourceLocationId:
      transfer.sourceLocationId.toHexString(),
    destinationLocationId:
      transfer.destinationLocationId.toHexString(),
    reservationId:
      transfer.reservationId?.toHexString() ?? null,
    status: transfer.status,
    lineCount: transfer.lineCount,
    version: transfer.version,
  };
}

function reservationSnapshot(
  reservation: StockReservationRecord,
): Record<string, unknown> {
  return {
    reservationId: reservation._id.toHexString(),
    reservationNumber: reservation.reservationNumber,
    sourceType: reservation.sourceType,
    sourceId: reservation.sourceId.toHexString(),
    sourceLineId:
      reservation.sourceLineId?.toHexString() ?? null,
    locationId: reservation.locationId.toHexString(),
    patientId:
      reservation.patientId?.toHexString() ?? null,
    status: reservation.status,
    lineCount: reservation.lineCount,
    expiresAt: reservation.expiresAt.toISOString(),
    version: reservation.version,
  };
}

function remainingReserved(
  item: StockReservationItemRecord,
): Decimal {
  return new Decimal(
    item.reservedStockQuantity.toString(),
  )
    .minus(item.consumedStockQuantity.toString())
    .minus(item.releasedStockQuantity.toString());
}

function transferItem(
  items: readonly StockTransferItemRecord[],
  id: string,
): StockTransferItemRecord {
  const found = items.find(
    (item) => item._id.toHexString() === id,
  );

  if (found === undefined) {
    throw new ResourceNotFoundError(
      'Stock-transfer line was not found',
    );
  }

  return found;
}

function reservationItem(
  items: readonly StockReservationItemRecord[],
  id: string,
): StockReservationItemRecord {
  const found = items.find(
    (item) => item._id.toHexString() === id,
  );

  if (found === undefined) {
    throw new ResourceNotFoundError(
      'Stock-reservation line was not found',
    );
  }

  return found;
}

export class InventoryStockOperationsService
implements InventoryDispensingIntegrationPort {
  public constructor(
    private readonly dependencies: InventoryStockOperationsDependencies,
  ) {}

  public createStockTransferRequest(
    context: InventoryStockCommandContext,
    input: CreateStockTransferRequestInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CREATE_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:transfer:create',
          context.actor.facilityId,
          input.sourceLocationId,
          input.destinationLocationId,
        ),
        ...input.lines.map((line) =>
          lockKey(
            'inventory:item:transfer',
            context.actor.facilityId,
            line.itemId,
          ),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'CREATE_STOCK_TRANSFER',
        sourceLocationId: input.sourceLocationId,
        destinationLocationId:
          input.destinationLocationId,
        lineCount: input.lines.length,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const source =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            input.sourceLocationId,
          );
        await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          input.destinationLocationId,
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              input.sourceLocationId,
            ),
          }),
        );

        const preparedLines = [];

        for (const line of input.lines) {
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            line.itemId,
            false,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError(
              'An active transfer inventory item was not found',
            );
          }

          const quantity = new Decimal(
            line.requestedStockQuantity,
          );

          if (
            !item.allowFractionalStock &&
            !quantity.isInteger()
          ) {
            throw new ConflictError(
              'Transfer quantity is fractional for an indivisible inventory item',
            );
          }

          preparedLines.push({
            itemId: item._id.toHexString(),
            stockUnitId: item.stockUnitId.toHexString(),
            requestedStockQuantity: normalized(quantity),
            notes: line.notes ?? null,
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          SEQUENCE_KEYS.TRANSFER,
        );

        const aggregate =
          await this.dependencies.repository.withTransaction(
            (session) =>
              this.dependencies.repository.createTransferAggregate(
                input,
                {
                  transferNumber: formatNumber(
                    'STR',
                    sequence.facilityCode,
                    occurredAt,
                    sequence.value,
                  ),
                  requestedByStaffId:
                    source.actor.staffId,
                  transactionId: transaction.transactionId,
                  correlationId:
                    context.actor.correlationId,
                  occurredAt,
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
          source.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_CREATED,
          OUTBOX_EVENTS.TRANSFER_CREATED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          aggregate.transfer._id.toHexString(),
          transferSnapshot(aggregate.transfer),
          {
            locationId: input.sourceLocationId,
          },
        );

        return aggregate.transfer;
      },
    });
  }

  public approveStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: ApproveStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.APPROVE_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:transfer',
          context.actor.facilityId,
          transferId,
        ),
      ],
      idempotencyPayload: {
        transferId,
        ...input,
      },
      journalPayload: {
        operation: 'APPROVE_STOCK_TRANSFER',
        transferId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );

        if (transfer.status !== 'REQUESTED') {
          throw new ConflictError(
            'Only requested stock transfers can be approved',
          );
        }

        const source =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.sourceLocationId.toHexString(),
          );

        if (
          transfer.requestedByStaffId.toHexString() ===
          source.actor.staffId
        ) {
          throw new ConflictError(
            'Stock-transfer maker and approver must be different staff members',
          );
        }

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.sourceLocationId.toHexString(),
            ),
          }),
        );

        const items = await this.dependencies.repository.findTransferItems(
          context.actor.facilityId,
          transferId,
        );

        if (input.lines.length !== items.length) {
          throw new ConflictError(
            'Transfer approval must decide every transfer line',
          );
        }

        const preparedTransferLines: PreparedTransferLine[] = [];
        const preparedReservationLines: PreparedReservationLine[] = [];

        for (const decision of input.lines) {
          const itemLine = transferItem(
            items,
            decision.transferItemId,
          );
          const approved = new Decimal(
            decision.approvedStockQuantity,
          );
          const requested = new Decimal(
            itemLine.requestedStockQuantity.toString(),
          );

          if (approved.gt(requested)) {
            throw new ConflictError(
              'Approved transfer quantity cannot exceed requested quantity',
            );
          }

          const allocations = await this.dependencies.allocation.allocate({
            facilityId: context.actor.facilityId,
            locationId: transfer.sourceLocationId.toHexString(),
            itemId: itemLine.itemId.toHexString(),
            stockQuantity: normalized(approved),
            at: occurredAt,
          });

          preparedTransferLines.push({
            transferItemId: itemLine._id.toHexString(),
            expectedVersion: itemLine.version,
            itemId: itemLine.itemId.toHexString(),
            stockUnitId: itemLine.stockUnitId.toHexString(),
            approvedStockQuantity: normalized(approved),
            allocations,
          });

          preparedReservationLines.push({
            itemId: itemLine.itemId.toHexString(),
            stockUnitId: itemLine.stockUnitId.toHexString(),
            requestedStockQuantity: normalized(approved),
            reservedStockQuantity: normalized(approved),
            allocations,
          });
        }

        const reservationSequence =
          await this.dependencies.sequence.next(
            context.actor.facilityId,
            SEQUENCE_KEYS.RESERVATION,
          );

        const result =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              const reservationInput: ReserveStockInput = {
                sourceType: 'STOCK_TRANSFER',
                sourceId: transferId,
                sourceLineId: null,
                locationId:
                  transfer.sourceLocationId.toHexString(),
                patientId: null,
                expiresAt: input.reservationExpiresAt,
                lines: preparedReservationLines.map(
                  (line) => ({
                    itemId: line.itemId,
                    requestedStockQuantity:
                      line.requestedStockQuantity,
                  }),
                ),
              };

              const reservation =
                await this.dependencies.repository.createReservationAggregate(
                  reservationInput,
                  {
                    reservationNumber: formatNumber(
                      'RSV',
                      reservationSequence.facilityCode,
                      occurredAt,
                      reservationSequence.value,
                    ),
                    reservedByStaffId:
                      source.actor.staffId,
                    transactionId:
                      transaction.transactionId,
                    correlationId:
                      context.actor.correlationId,
                    occurredAt,
                    lines: preparedReservationLines,
                  },
                  context.actor.userId,
                  context.actor.facilityId,
                  session,
                );

              await this.dependencies.stockPosting.post(
                this.reservationEntries(
                  context,
                  transaction.transactionId,
                  source.actor.staffId,
                  reservation,
                  occurredAt,
                  'TRANSFER_RESERVATION',
                ),
                session,
              );

              const approved = requireVersioned(
                await this.dependencies.repository.approveTransfer(
                  context.actor.facilityId,
                  transferId,
                  input.expectedVersion,
                  reservation.reservation._id.toHexString(),
                  preparedTransferLines,
                  context.actor.userId,
                  source.actor.staffId,
                  input.reason,
                  occurredAt,
                  session,
                ),
                'The stock transfer changed before approval completed',
              );

              return {
                approved,
                reservation,
              };
            },
          );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'reverse-stock-reservation',
            result.reservation.reservation._id.toHexString(),
          ),
          type: 'inventory.stock.reverse-source-movements',
          payload: {
            facilityId: context.actor.facilityId,
            sourceType: 'STOCK_RESERVATION',
            sourceId:
              result.reservation.reservation._id.toHexString(),
          },
        });

        await this.publishMutation(
          context,
          transaction,
          source.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_APPROVED,
          OUTBOX_EVENTS.TRANSFER_APPROVED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(result.approved),
          {
            locationId:
              transfer.sourceLocationId.toHexString(),
          },
          transferSnapshot(transfer),
          input.reason,
        );

        return result.approved;
      },
    });
  }

  public rejectStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: RejectStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.REJECT_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:transfer', context.actor.facilityId, transferId),
      ],
      idempotencyPayload: { transferId, ...input },
      journalPayload: { operation: 'REJECT_STOCK_TRANSFER', transferId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.sourceLocationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.sourceLocationId.toHexString(),
            ),
          }),
        );

        if (
          transfer.requestedByStaffId.toHexString() ===
          operational.actor.staffId
        ) {
          throw new ConflictError(
            'Stock-transfer maker and rejector must be different staff members',
          );
        }

        const updated = requireVersioned(
          await this.dependencies.repository.withTransaction(
            (session) =>
              this.dependencies.repository.rejectTransfer(
                context.actor.facilityId,
                transferId,
                input,
                context.actor.userId,
                operational.actor.staffId,
                occurredAt,
                session,
              ),
          ),
          'The stock transfer changed before rejection completed',
        );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_REJECTED,
          OUTBOX_EVENTS.TRANSFER_REJECTED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(updated),
          { locationId: transfer.sourceLocationId.toHexString() },
          transferSnapshot(transfer),
          input.reason,
        );

        return updated;
      },
    });
  }

  public dispatchStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: DispatchStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.DISPATCH_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:transfer', context.actor.facilityId, transferId),
      ],
      idempotencyPayload: { transferId, ...input },
      journalPayload: { operation: 'DISPATCH_STOCK_TRANSFER', transferId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );

        if (
          transfer.status !== 'APPROVED' ||
          transfer.reservationId === null
        ) {
          throw new ConflictError(
            'Only approved reserved transfers can be dispatched',
          );
        }

        const source =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.sourceLocationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.sourceLocationId.toHexString(),
            ),
          }),
        );

        const reservation = await this.requireReservation(
          context.actor.facilityId,
          transfer.reservationId.toHexString(),
        );
        const reservationItems =
          await this.dependencies.repository.findReservationItems(
            context.actor.facilityId,
            reservation._id.toHexString(),
          );

        const consumptionByItem = new Map<string, string>();
        const entries: StockLedgerEntryInput[] = [];

        for (const item of reservationItems) {
          const remaining = remainingReserved(item);

          if (remaining.lte(0)) {
            continue;
          }

          consumptionByItem.set(
            item._id.toHexString(),
            normalized(remaining),
          );

          for (const allocation of item.allocations) {
            const quantity = new Decimal(
              allocation.reservedStockQuantity.toString(),
            )
              .minus(allocation.consumedStockQuantity.toString())
              .minus(allocation.releasedStockQuantity.toString());

            if (quantity.lte(0)) {
              continue;
            }

            entries.push({
              facilityId: context.actor.facilityId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              actorUserId: context.actor.userId,
              actorStaffId: source.actor.staffId,
              itemId: item.itemId.toHexString(),
              batchId: allocation.batchId?.toHexString() ?? null,
              locationId: transfer.sourceLocationId.toHexString(),
              stockUnitId: item.stockUnitId.toHexString(),
              movementType: 'TRANSFER_DISPATCH',
              sourceType: 'STOCK_TRANSFER',
              sourceId: transferId,
              sourceLineId: item._id.toHexString(),
              operationKey: deduplicationKey(
                transaction.transactionId,
                'transfer-dispatch',
                allocation._id.toHexString(),
              ),
              quantity: normalized(quantity),
              onHandDelta: negative(quantity),
              availableDelta: '0',
              reservedDelta: negative(quantity),
              quarantinedDelta: '0',
              damagedDelta: '0',
              expiredDelta: '0',
              inTransitDelta: normalized(quantity),
              reason: input.reason,
              occurredAt,
              allowNegativeStock: false,
            });
          }
        }

        const updated =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              await this.dependencies.stockPosting.post(
                entries,
                session,
              );

              requireVersioned(
                await this.dependencies.repository.markReservationConsumed(
                  context.actor.facilityId,
                  reservation._id.toHexString(),
                  reservation.version,
                  transferId,
                  consumptionByItem,
                  context.actor.userId,
                  source.actor.staffId,
                  occurredAt,
                  session,
                ),
                'The transfer reservation changed before dispatch completed',
              );

              return requireVersioned(
                await this.dependencies.repository.markTransferDispatched(
                  context.actor.facilityId,
                  transferId,
                  input,
                  context.actor.userId,
                  source.actor.staffId,
                  transaction.transactionId,
                  occurredAt,
                  session,
                ),
                'The stock transfer changed before dispatch completed',
              );
            },
          );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'reverse-transfer-dispatch',
            transferId,
          ),
          type: 'inventory.stock.reverse-source-movements',
          payload: {
            facilityId: context.actor.facilityId,
            sourceType: 'STOCK_TRANSFER',
            sourceId: transferId,
          },
        });

        await this.publishMutation(
          context,
          transaction,
          source.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_DISPATCHED,
          OUTBOX_EVENTS.TRANSFER_DISPATCHED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(updated),
          { locationId: transfer.sourceLocationId.toHexString() },
          transferSnapshot(transfer),
          input.reason,
        );

        await this.dependencies.realtime.publish({
          eventType: REALTIME_EVENTS.STOCK_CHANGED,
          facilityId: context.actor.facilityId,
          locationId: transfer.sourceLocationId.toHexString(),
          payload: {
            transferId,
            direction: 'DISPATCH',
          },
        });

        return updated;
      },
    });
  }

  public receiveStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: ReceiveStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.RECEIVE_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:transfer', context.actor.facilityId, transferId),
      ],
      idempotencyPayload: { transferId, ...input },
      journalPayload: { operation: 'RECEIVE_STOCK_TRANSFER', transferId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );

        if (
          ![
            'DISPATCHED',
            'PARTIALLY_RECEIVED',
          ].includes(transfer.status)
        ) {
          throw new ConflictError(
            'Only dispatched or partially received transfers can be received',
          );
        }

        const destination =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.destinationLocationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.destinationLocationId.toHexString(),
            ),
          }),
        );

        const items = await this.dependencies.repository.findTransferItems(
          context.actor.facilityId,
          transferId,
        );
        const receiptAllocations: TransferReceiptAllocationInput[] = [];
        const entries: StockLedgerEntryInput[] = [];

        for (const line of input.lines) {
          const item = transferItem(
            items,
            line.transferItemId,
          );
          const allocation = item.allocations.find(
            (candidate) =>
              (candidate.batchId?.toHexString() ?? null) ===
              (line.batchId ?? null),
          );

          if (allocation === undefined) {
            throw new ResourceNotFoundError(
              'Transfer batch allocation was not found',
            );
          }

          const outstanding = new Decimal(
            allocation.dispatchedStockQuantity.toString(),
          )
            .minus(allocation.receivedStockQuantity.toString())
            .minus(allocation.discrepancyStockQuantity.toString());
          const received = new Decimal(
            line.receivedStockQuantity,
          );

          if (received.gt(outstanding)) {
            throw new ConflictError(
              'Transfer receipt quantity exceeds the outstanding dispatched quantity',
            );
          }

          receiptAllocations.push({
            transferItemId: item._id.toHexString(),
            allocationId: allocation._id.toHexString(),
            receivedStockQuantity: normalized(received),
            discrepancyStockQuantity: '0',
          });

          entries.push(
            this.inTransitReleaseEntry(
              context,
              transaction.transactionId,
              destination.actor.staffId,
              transfer,
              item,
              allocation.batchId?.toHexString() ?? null,
              received,
              occurredAt,
              allocation._id.toHexString(),
              'received',
            ),
          );

          entries.push(
            await this.destinationReceiptEntry(
              context,
              transaction.transactionId,
              destination.actor.staffId,
              transfer,
              item,
              allocation.batchId?.toHexString() ?? null,
              received,
              occurredAt,
              allocation._id.toHexString(),
            ),
          );
        }

        if (input.closeWithDiscrepancy === true) {
          for (const item of items) {
            for (const allocation of item.allocations) {
              const alreadyIncoming = receiptAllocations
                .filter(
                  (candidate) =>
                    candidate.allocationId ===
                    allocation._id.toHexString(),
                )
                .reduce(
                  (total, candidate) =>
                    total.plus(
                      candidate.receivedStockQuantity,
                    ),
                  new Decimal(0),
                );

              const outstanding = new Decimal(
                allocation.dispatchedStockQuantity.toString(),
              )
                .minus(allocation.receivedStockQuantity.toString())
                .minus(allocation.discrepancyStockQuantity.toString())
                .minus(alreadyIncoming);

              if (outstanding.lte(0)) {
                continue;
              }

              const existing = receiptAllocations.find(
                (candidate) =>
                  candidate.allocationId ===
                  allocation._id.toHexString(),
              );

              if (existing === undefined) {
                receiptAllocations.push({
                  transferItemId: item._id.toHexString(),
                  allocationId: allocation._id.toHexString(),
                  receivedStockQuantity: '0',
                  discrepancyStockQuantity:
                    normalized(outstanding),
                });
              } else {
                existing.discrepancyStockQuantity =
                  normalized(outstanding);
              }

              entries.push({
                facilityId: context.actor.facilityId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                actorUserId: context.actor.userId,
                actorStaffId: destination.actor.staffId,
                itemId: item.itemId.toHexString(),
                batchId:
                  allocation.batchId?.toHexString() ?? null,
                locationId:
                  transfer.sourceLocationId.toHexString(),
                stockUnitId: item.stockUnitId.toHexString(),
                movementType: 'TRANSFER_DISCREPANCY',
                sourceType: 'STOCK_TRANSFER',
                sourceId: transferId,
                sourceLineId: item._id.toHexString(),
                operationKey: deduplicationKey(
                  transaction.transactionId,
                  'transfer-discrepancy',
                  allocation._id.toHexString(),
                ),
                quantity: normalized(outstanding),
                onHandDelta: '0',
                availableDelta: '0',
                reservedDelta: '0',
                quarantinedDelta: '0',
                damagedDelta: '0',
                expiredDelta: '0',
                inTransitDelta: negative(outstanding),
                reason:
                  input.discrepancyReason ??
                  'Transfer discrepancy',
                occurredAt,
                allowNegativeStock: false,
              });
            }
          }
        }

        const updated =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              await this.dependencies.stockPosting.post(
                entries,
                session,
              );

              return requireVersioned(
                await this.dependencies.repository.recordTransferReceipt(
                  context.actor.facilityId,
                  transferId,
                  input,
                  receiptAllocations,
                  context.actor.userId,
                  destination.actor.staffId,
                  transaction.transactionId,
                  occurredAt,
                  session,
                ),
                'The stock transfer changed before receipt completed',
              );
            },
          );

        await this.publishMutation(
          context,
          transaction,
          destination.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_RECEIVED,
          OUTBOX_EVENTS.TRANSFER_RECEIVED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(updated),
          {
            locationId:
              transfer.destinationLocationId.toHexString(),
          },
          transferSnapshot(transfer),
          input.discrepancyReason ?? undefined,
        );

        await this.dependencies.realtime.publish({
          eventType: REALTIME_EVENTS.STOCK_CHANGED,
          facilityId: context.actor.facilityId,
          locationId:
            transfer.destinationLocationId.toHexString(),
          payload: {
            transferId,
            direction: 'RECEIPT',
            status: updated.status,
          },
        });

        return updated;
      },
    });
  }

  public cancelStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: CancelStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CANCEL_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:transfer', context.actor.facilityId, transferId),
      ],
      idempotencyPayload: { transferId, ...input },
      journalPayload: { operation: 'CANCEL_STOCK_TRANSFER', transferId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );

        if (!['REQUESTED', 'APPROVED'].includes(transfer.status)) {
          throw new ConflictError(
            'Only requested or approved transfers can be cancelled',
          );
        }

        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.sourceLocationId.toHexString(),
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.sourceLocationId.toHexString(),
            ),
          }),
        );

        const updated =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              if (transfer.reservationId !== null) {
                const reservation = requireFound(
                  await this.dependencies.repository.findReservation(
                    context.actor.facilityId,
                    transfer.reservationId.toHexString(),
                    session,
                  ),
                  'The transfer reservation was not found',
                );
                const items =
                  await this.dependencies.repository.findReservationItems(
                    context.actor.facilityId,
                    reservation._id.toHexString(),
                    session,
                  );

                const release = this.releaseEntries(
                  context,
                  transaction.transactionId,
                  operational.actor.staffId,
                  reservation,
                  items,
                  occurredAt,
                  input.reason,
                  'TRANSFER_RESERVATION_RELEASE',
                );

                if (release.entries.length > 0) {
                  await this.dependencies.stockPosting.post(
                    release.entries,
                    session,
                  );
                }

                requireVersioned(
                  await this.dependencies.repository.releaseReservation(
                    context.actor.facilityId,
                    reservation._id.toHexString(),
                    {
                      expectedVersion: reservation.version,
                      reason: input.reason,
                    },
                    release.releaseByItem,
                    context.actor.userId,
                    operational.actor.staffId,
                    occurredAt,
                    'RELEASED',
                    session,
                  ),
                  'The transfer reservation changed before cancellation completed',
                );
              }

              return requireVersioned(
                await this.dependencies.repository.cancelTransfer(
                  context.actor.facilityId,
                  transferId,
                  input,
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  session,
                ),
                'The stock transfer changed before cancellation completed',
              );
            },
          );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_CANCELLED,
          OUTBOX_EVENTS.TRANSFER_CANCELLED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(updated),
          { locationId: transfer.sourceLocationId.toHexString() },
          transferSnapshot(transfer),
          input.reason,
        );

        return updated;
      },
    });
  }

  public reverseStockTransfer(
    context: InventoryStockCommandContext,
    transferId: string,
    input: ReverseStockTransferInput,
  ): Promise<StockTransferRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.REVERSE_TRANSFER,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey('inventory:transfer', context.actor.facilityId, transferId),
      ],
      idempotencyPayload: { transferId, ...input },
      journalPayload: { operation: 'REVERSE_STOCK_TRANSFER', transferId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const transfer = await this.requireTransfer(
          context.actor.facilityId,
          transferId,
        );

        if (
          ![
            'DISPATCHED',
            'PARTIALLY_RECEIVED',
            'RECEIVED',
            'DISCREPANCY',
          ].includes(transfer.status)
        ) {
          throw new ConflictError(
            'The stock transfer is not eligible for reversal',
          );
        }

        const source =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            transfer.sourceLocationId.toHexString(),
          );
        await this.dependencies.context.resolveOperationalLocation(
          context.actor,
          transfer.destinationLocationId.toHexString(),
        );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'TRANSFER',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              transfer.sourceLocationId.toHexString(),
            ),
          }),
        );

        const items = await this.dependencies.repository.findTransferItems(
          context.actor.facilityId,
          transferId,
        );
        const originalMovements =
          await this.dependencies.repository.findMovementsBySource(
            context.actor.facilityId,
            'STOCK_TRANSFER',
            transferId,
          );
        const entries: StockLedgerEntryInput[] = [];

        for (const item of items) {
          for (const allocation of item.allocations) {
            const received = new Decimal(
              allocation.receivedStockQuantity.toString(),
            );
            const discrepancy = new Decimal(
              allocation.discrepancyStockQuantity.toString(),
            );
            const dispatched = new Decimal(
              allocation.dispatchedStockQuantity.toString(),
            );
            const outstanding = dispatched
              .minus(received)
              .minus(discrepancy);
            const batchId =
              allocation.batchId?.toHexString() ?? null;

            if (received.gt(0)) {
              const destinationMovement = originalMovements.find(
                (movement) =>
                  movement.movementType === 'TRANSFER_RECEIPT' &&
                  movement.storeLocationId.toHexString() ===
                    transfer.destinationLocationId.toHexString() &&
                  (movement.batchId?.toHexString() ?? null) === batchId &&
                  movement.sourceLineId?.toHexString() ===
                    item._id.toHexString(),
              );

              if (destinationMovement === undefined) {
                throw new ConflictError(
                  'Destination receipt movement was not found for transfer reversal',
                );
              }

              entries.push({
                facilityId: context.actor.facilityId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                actorUserId: context.actor.userId,
                actorStaffId: source.actor.staffId,
                itemId: item.itemId.toHexString(),
                batchId,
                locationId:
                  transfer.destinationLocationId.toHexString(),
                stockUnitId: item.stockUnitId.toHexString(),
                movementType: 'TRANSFER_REVERSAL',
                sourceType: 'STOCK_TRANSFER',
                sourceId: transferId,
                sourceLineId: item._id.toHexString(),
                reversalOfMovementId:
                  destinationMovement._id.toHexString(),
                operationKey: deduplicationKey(
                  transaction.transactionId,
                  'transfer-reversal-destination',
                  allocation._id.toHexString(),
                ),
                quantity: normalized(received),
                onHandDelta: negative(received),
                availableDelta: negative(
                  new Decimal(
                    destinationMovement.availableDelta.toString(),
                  ),
                ),
                reservedDelta: '0',
                quarantinedDelta: negative(
                  new Decimal(
                    destinationMovement.quarantinedDelta.toString(),
                  ),
                ),
                damagedDelta: '0',
                expiredDelta: '0',
                inTransitDelta: '0',
                reason: input.reason,
                occurredAt,
                allowNegativeStock: false,
              });

              entries.push({
                facilityId: context.actor.facilityId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                actorUserId: context.actor.userId,
                actorStaffId: source.actor.staffId,
                itemId: item.itemId.toHexString(),
                batchId,
                locationId:
                  transfer.sourceLocationId.toHexString(),
                stockUnitId: item.stockUnitId.toHexString(),
                movementType: 'TRANSFER_REVERSAL',
                sourceType: 'STOCK_TRANSFER',
                sourceId: transferId,
                sourceLineId: item._id.toHexString(),
                operationKey: deduplicationKey(
                  transaction.transactionId,
                  'transfer-reversal-source-received',
                  allocation._id.toHexString(),
                ),
                quantity: normalized(received),
                onHandDelta: normalized(received),
                availableDelta: normalized(received),
                reservedDelta: '0',
                quarantinedDelta: '0',
                damagedDelta: '0',
                expiredDelta: '0',
                inTransitDelta: '0',
                reason: input.reason,
                occurredAt,
                allowNegativeStock: false,
              });
            }

            const restore = discrepancy.plus(outstanding);

            if (restore.gt(0)) {
              entries.push({
                facilityId: context.actor.facilityId,
                transactionId: transaction.transactionId,
                correlationId: context.actor.correlationId,
                actorUserId: context.actor.userId,
                actorStaffId: source.actor.staffId,
                itemId: item.itemId.toHexString(),
                batchId,
                locationId:
                  transfer.sourceLocationId.toHexString(),
                stockUnitId: item.stockUnitId.toHexString(),
                movementType: 'TRANSFER_REVERSAL',
                sourceType: 'STOCK_TRANSFER',
                sourceId: transferId,
                sourceLineId: item._id.toHexString(),
                operationKey: deduplicationKey(
                  transaction.transactionId,
                  'transfer-reversal-source-unreceived',
                  allocation._id.toHexString(),
                ),
                quantity: normalized(restore),
                onHandDelta: normalized(restore),
                availableDelta: normalized(restore),
                reservedDelta: '0',
                quarantinedDelta: '0',
                damagedDelta: '0',
                expiredDelta: '0',
                inTransitDelta: outstanding.gt(0)
                  ? negative(outstanding)
                  : '0',
                reason: input.reason,
                occurredAt,
                allowNegativeStock: false,
              });
            }
          }
        }

        const updated =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              await this.dependencies.stockPosting.post(
                entries,
                session,
              );

              if (transfer.reservationId !== null) {
                const reservation = requireFound(
                  await this.dependencies.repository.findReservation(
                    context.actor.facilityId,
                    transfer.reservationId.toHexString(),
                    session,
                  ),
                  'The transfer reservation was not found',
                );

                requireVersioned(
                  await this.dependencies.repository.markReservationReversed(
                    context.actor.facilityId,
                    reservation._id.toHexString(),
                    reservation.version,
                    input.reason,
                    context.actor.userId,
                    source.actor.staffId,
                    occurredAt,
                    session,
                  ),
                  'The transfer reservation changed before reversal completed',
                );
              }

              return requireVersioned(
                await this.dependencies.repository.reverseTransfer(
                  context.actor.facilityId,
                  transferId,
                  input,
                  context.actor.userId,
                  source.actor.staffId,
                  transaction.transactionId,
                  occurredAt,
                  session,
                ),
                'The stock transfer changed before reversal completed',
              );
            },
          );

        await this.publishMutation(
          context,
          transaction,
          source.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.TRANSFER_REVERSED,
          OUTBOX_EVENTS.TRANSFER_REVERSED,
          REALTIME_EVENTS.TRANSFER_WORKLIST,
          'StockTransfer',
          transferId,
          transferSnapshot(updated),
          { locationId: transfer.sourceLocationId.toHexString() },
          transferSnapshot(transfer),
          input.reason,
        );

        return updated;
      },
    });
  }

  public reserveStock(
    context: InventoryStockCommandContext,
    input: ReserveStockInput,
  ): Promise<CreatedStockReservationAggregate> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.RESERVE_STOCK,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:reservation:source',
          context.actor.facilityId,
          input.sourceType,
          input.sourceId,
          input.sourceLineId ?? 'header',
          input.locationId,
        ),
        ...input.lines.map((line) =>
          lockKey(
            'inventory:balance',
            context.actor.facilityId,
            input.locationId,
            line.itemId,
          ),
        ),
      ],
      idempotencyPayload: input,
      journalPayload: {
        operation: 'RESERVE_STOCK',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        locationId: input.locationId,
      },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            input.locationId,
            {
              requireDispensing:
                input.sourceType === 'PRESCRIPTION' ||
                input.sourceType === 'DISPENSATION',
            },
          );

        const action =
          input.sourceType === 'PRESCRIPTION' ||
          input.sourceType === 'DISPENSATION'
            ? 'DISPENSE'
            : 'TRANSFER';

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action,
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              input.locationId,
            ),
          }),
        );

        const existing =
          await this.dependencies.repository.findReservationBySource(
            context.actor.facilityId,
            input.sourceType,
            input.sourceId,
            input.sourceLineId ?? null,
            input.locationId,
          );

        if (existing !== null) {
          throw new ConflictError(
            'An active or consumed stock reservation already exists for this source',
          );
        }

        const preparedLines: PreparedReservationLine[] = [];

        for (const line of input.lines) {
          const item = await this.dependencies.catalog.findItemById(
            context.actor.facilityId,
            line.itemId,
            false,
          );

          if (item === null || item.status !== 'ACTIVE') {
            throw new ResourceNotFoundError(
              'An active reservation inventory item was not found',
            );
          }

          if (
            item.controlledMedicine &&
            !operational.location.allowsControlledMedicine
          ) {
            throw new ConflictError(
              'The inventory location is not approved for controlled medicine stock',
            );
          }

          const allocations = await this.dependencies.allocation.allocate({
            facilityId: context.actor.facilityId,
            locationId: input.locationId,
            itemId: line.itemId,
            stockQuantity: line.requestedStockQuantity,
            at: occurredAt,
          });

          preparedLines.push({
            itemId: line.itemId,
            stockUnitId: item.stockUnitId.toHexString(),
            requestedStockQuantity:
              line.requestedStockQuantity,
            reservedStockQuantity:
              line.requestedStockQuantity,
            allocations,
          });
        }

        const sequence = await this.dependencies.sequence.next(
          context.actor.facilityId,
          SEQUENCE_KEYS.RESERVATION,
        );

        const aggregate =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              const created =
                await this.dependencies.repository.createReservationAggregate(
                  input,
                  {
                    reservationNumber: formatNumber(
                      'RSV',
                      sequence.facilityCode,
                      occurredAt,
                      sequence.value,
                    ),
                    reservedByStaffId:
                      operational.actor.staffId,
                    transactionId:
                      transaction.transactionId,
                    correlationId:
                      context.actor.correlationId,
                    occurredAt,
                    lines: preparedLines,
                  },
                  context.actor.userId,
                  context.actor.facilityId,
                  session,
                );

              await this.dependencies.stockPosting.post(
                this.reservationEntries(
                  context,
                  transaction.transactionId,
                  operational.actor.staffId,
                  created,
                  occurredAt,
                  input.sourceType === 'PRESCRIPTION' ||
                    input.sourceType === 'DISPENSATION'
                    ? 'DISPENSING_RESERVATION'
                    : 'RESERVATION',
                ),
                session,
              );

              return created;
            },
          );

        await transaction.registerCompensation({
          key: deduplicationKey(
            transaction.transactionId,
            'reverse-reservation',
            aggregate.reservation._id.toHexString(),
          ),
          type: 'inventory.stock.reverse-source-movements',
          payload: {
            facilityId: context.actor.facilityId,
            sourceType: 'STOCK_RESERVATION',
            sourceId: aggregate.reservation._id.toHexString(),
          },
        });

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RESERVATION_CREATED,
          OUTBOX_EVENTS.RESERVATION_CREATED,
          REALTIME_EVENTS.RESERVATION_WORKLIST,
          'StockReservation',
          aggregate.reservation._id.toHexString(),
          reservationSnapshot(aggregate.reservation),
          { locationId: input.locationId },
        );

        return aggregate;
      },
    });
  }

  public reserveForDispensing(
    context: InventoryStockCommandContext,
    input: ReserveStockInput,
  ): Promise<CreatedStockReservationAggregate> {
    if (
      input.sourceType !== 'PRESCRIPTION' &&
      input.sourceType !== 'DISPENSATION'
    ) {
      throw new ConflictError(
        'Dispensing stock reservations require a prescription or dispensation source',
      );
    }

    return this.reserveStock(context, input);
  }

  public releaseStockReservation(
    context: InventoryStockCommandContext,
    reservationId: string,
    input: ReleaseStockReservationInput,
    status: 'RELEASED' | 'EXPIRED' = 'RELEASED',
  ): Promise<StockReservationRecord> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.RELEASE_RESERVATION,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:reservation',
          context.actor.facilityId,
          reservationId,
        ),
      ],
      idempotencyPayload: { reservationId, status, ...input },
      journalPayload: { operation: 'RELEASE_STOCK_RESERVATION', reservationId, status },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const reservation = await this.requireReservation(
          context.actor.facilityId,
          reservationId,
        );

        if (
          ![
            'ACTIVE',
            'PARTIALLY_CONSUMED',
          ].includes(reservation.status)
        ) {
          throw new ConflictError(
            'The stock reservation is not eligible for release',
          );
        }

        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            reservation.locationId.toHexString(),
          );

        const action =
          reservation.sourceType === 'PRESCRIPTION' ||
          reservation.sourceType === 'DISPENSATION'
            ? 'DISPENSE'
            : 'TRANSFER';

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action,
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              reservation.locationId.toHexString(),
            ),
          }),
        );

        const items =
          await this.dependencies.repository.findReservationItems(
            context.actor.facilityId,
            reservationId,
          );
        const release = this.releaseEntries(
          context,
          transaction.transactionId,
          operational.actor.staffId,
          reservation,
          items,
          occurredAt,
          input.reason,
          'RESERVATION_RELEASE',
        );

        const updated =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              if (release.entries.length > 0) {
                await this.dependencies.stockPosting.post(
                  release.entries,
                  session,
                );
              }

              return requireVersioned(
                await this.dependencies.repository.releaseReservation(
                  context.actor.facilityId,
                  reservationId,
                  input,
                  release.releaseByItem,
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  status,
                  session,
                ),
                'The stock reservation changed before release completed',
              );
            },
          );

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.RESERVATION_RELEASED,
          OUTBOX_EVENTS.RESERVATION_RELEASED,
          REALTIME_EVENTS.RESERVATION_WORKLIST,
          'StockReservation',
          reservationId,
          reservationSnapshot(updated),
          { locationId: reservation.locationId.toHexString() },
          reservationSnapshot(reservation),
          input.reason,
        );

        return updated;
      },
    });
  }

  public consumeDispensingReservation(
    context: InventoryStockCommandContext,
    reservationId: string,
    input: ConsumeDispensingReservationInput,
  ): Promise<DispensingStockResult> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.CONSUME_DISPENSING,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:reservation',
          context.actor.facilityId,
          reservationId,
        ),
        lockKey(
          'inventory:dispensation',
          context.actor.facilityId,
          input.dispensationId,
        ),
      ],
      idempotencyPayload: { reservationId, ...input },
      journalPayload: { operation: 'CONSUME_DISPENSING_RESERVATION', reservationId, dispensationId: input.dispensationId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const reservation = await this.requireReservation(
          context.actor.facilityId,
          reservationId,
        );

        if (
          ![
            'PRESCRIPTION',
            'DISPENSATION',
          ].includes(reservation.sourceType)
        ) {
          throw new ConflictError(
            'Only prescription or dispensation reservations can be consumed by pharmacy dispensing',
          );
        }

        if (
          reservation.expiresAt.getTime() <=
          occurredAt.getTime()
        ) {
          throw new ConflictError(
            'The stock reservation has expired',
          );
        }

        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            reservation.locationId.toHexString(),
            { requireDispensing: true },
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'DISPENSE',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              reservation.locationId.toHexString(),
            ),
          }),
        );

        const items =
          await this.dependencies.repository.findReservationItems(
            context.actor.facilityId,
            reservationId,
          );
        const consumptionByItem = new Map<string, string>();
        const entries: StockLedgerEntryInput[] = [];
        let totalConsumed = new Decimal(0);

        for (const line of input.lines) {
          const item = reservationItem(
            items,
            line.reservationItemId,
          );
          let remaining = new Decimal(
            line.stockQuantity,
          );

          if (remaining.gt(remainingReserved(item))) {
            throw new ConflictError(
              'Dispensing quantity exceeds the remaining reservation',
            );
          }

          consumptionByItem.set(
            item._id.toHexString(),
            normalized(remaining),
          );
          totalConsumed = totalConsumed.plus(remaining);

          for (const allocation of item.allocations) {
            if (remaining.lte(0)) {
              break;
            }

            const available = new Decimal(
              allocation.reservedStockQuantity.toString(),
            )
              .minus(allocation.consumedStockQuantity.toString())
              .minus(allocation.releasedStockQuantity.toString());

            if (available.lte(0)) {
              continue;
            }

            if (allocation.batchId !== null) {
              const batch = await this.dependencies.stockQueries.findBatchById(
                context.actor.facilityId,
                allocation.batchId.toHexString(),
                false,
              );

              if (
                batch === null ||
                batch.status !== 'ACTIVE' ||
                ![
                  'NOT_REQUIRED',
                  'PASSED',
                  'PARTIALLY_ACCEPTED',
                ].includes(batch.inspectionStatus) ||
                batch.recallStatus !== 'NONE' ||
                batch.enteredInErrorAt !== null ||
                (
                  batch.expiryDate !== null &&
                  batch.expiryDate.getTime() <= occurredAt.getTime()
                )
              ) {
                throw new ConflictError(
                  'Dispensing cannot consume an expired, recalled, quarantined, blocked, failed-inspection, or entered-in-error batch',
                );
              }
            }

            const consume = Decimal.min(
              available,
              remaining,
            );

            remaining = remaining.minus(consume);

            entries.push({
              facilityId: context.actor.facilityId,
              transactionId: transaction.transactionId,
              correlationId: context.actor.correlationId,
              actorUserId: context.actor.userId,
              actorStaffId: operational.actor.staffId,
              itemId: item.itemId.toHexString(),
              batchId: allocation.batchId?.toHexString() ?? null,
              locationId: reservation.locationId.toHexString(),
              stockUnitId: item.stockUnitId.toHexString(),
              movementType: 'DISPENSING',
              sourceType: 'DISPENSATION',
              sourceId: input.dispensationId,
              sourceLineId: item._id.toHexString(),
              operationKey: deduplicationKey(
                transaction.transactionId,
                'dispensing',
                allocation._id.toHexString(),
              ),
              quantity: normalized(consume),
              onHandDelta: negative(consume),
              availableDelta: '0',
              reservedDelta: negative(consume),
              quarantinedDelta: '0',
              damagedDelta: '0',
              expiredDelta: '0',
              inTransitDelta: '0',
              reason: 'Pharmacy dispensation completed',
              metadata: {
                reservationId,
                reservationItemId: item._id.toHexString(),
              },
              occurredAt,
              allowNegativeStock: false,
            });
          }
        }

        const movements =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              const posted = await this.dependencies.stockPosting.post(
                entries,
                session,
              );

              requireVersioned(
                await this.dependencies.repository.markReservationConsumed(
                  context.actor.facilityId,
                  reservationId,
                  input.expectedVersion,
                  input.dispensationId,
                  consumptionByItem,
                  context.actor.userId,
                  operational.actor.staffId,
                  occurredAt,
                  session,
                ),
                'The stock reservation changed before dispensing completed',
              );

              return posted;
            },
          );

        const result: DispensingStockResult = {
          reservationId,
          dispensationId: input.dispensationId,
          consumedStockQuantity: normalized(totalConsumed),
          movementIds: movements.map(
            (movement) => movement._id.toHexString(),
          ),
        };

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.DISPENSING_CONSUMED,
          OUTBOX_EVENTS.DISPENSING_CONSUMED,
          REALTIME_EVENTS.STOCK_CHANGED,
          'Dispensation',
          input.dispensationId,
          result as unknown as Record<string, unknown>,
          { locationId: reservation.locationId.toHexString() },
          undefined,
          'Pharmacy dispensation completed',
        );

        return result;
      },
    });
  }

  public reverseDispensing(
    context: InventoryStockCommandContext,
    input: ReverseDispensingInput,
  ): Promise<DispensingReversalResult> {
    return this.dependencies.transactionManager.execute({
      transactionType: TRANSACTION_TYPES.REVERSE_DISPENSING,
      idempotencyKey: context.idempotencyKey,
      actorUserId: context.actor.userId,
      facilityId: context.actor.facilityId,
      correlationId: context.actor.correlationId,
      lockKeys: [
        lockKey(
          'inventory:dispensation',
          context.actor.facilityId,
          input.dispensationId,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: { operation: 'REVERSE_DISPENSING', dispensationId: input.dispensationId },
      execute: async (transaction) => {
        const occurredAt = this.dependencies.clock.now();
        const movements =
          await this.dependencies.repository.findMovementsBySource(
            context.actor.facilityId,
            'DISPENSATION',
            input.dispensationId,
          );
        const dispensingMovements = movements.filter(
          (movement) => movement.movementType === 'DISPENSING',
        );

        if (dispensingMovements.length === 0) {
          throw new ResourceNotFoundError(
            'Dispensing stock movements were not found',
          );
        }

        const locationId =
          dispensingMovements[0]?.storeLocationId.toHexString();

        if (locationId === undefined) {
          throw new ConflictError(
            'Dispensing stock location could not be resolved',
          );
        }

        const operational =
          await this.dependencies.context.resolveOperationalLocation(
            context.actor,
            locationId,
            { requireDispensing: true },
          );

        requireAllowed(
          await this.dependencies.accessPolicy.authorize({
            actor: context.actor,
            action: 'DISPENSE',
            location: await this.requireLocationRecord(
              context.actor.facilityId,
              locationId,
            ),
          }),
        );

        const entries: StockLedgerEntryInput[] = [];
        const reservationIds = new Set<string>();

        for (const movement of dispensingMovements) {
          const quantity = movement.quantity.toString();
          const batchId = movement.batchId?.toHexString() ?? null;
          let available = true;

          if (batchId !== null) {
            const batch = await this.dependencies.stockQueries.findBatchById(
              context.actor.facilityId,
              batchId,
              false,
            );

            available =
              batch !== null &&
              batch.status === 'ACTIVE' &&
              batch.recallStatus === 'NONE' &&
              (
                batch.expiryDate === null ||
                batch.expiryDate.getTime() > occurredAt.getTime()
              );
          }

          const metadata = movement.metadata ?? {};
          const reservationId =
            typeof metadata['reservationId'] === 'string'
              ? metadata['reservationId']
              : null;

          if (reservationId !== null) {
            reservationIds.add(reservationId);
          }

          entries.push({
            facilityId: context.actor.facilityId,
            transactionId: transaction.transactionId,
            correlationId: context.actor.correlationId,
            actorUserId: context.actor.userId,
            actorStaffId: operational.actor.staffId,
            itemId: movement.itemId.toHexString(),
            batchId,
            locationId,
            stockUnitId: movement.stockUnitId.toHexString(),
            movementType: 'DISPENSING_REVERSAL',
            sourceType: 'DISPENSATION',
            sourceId: input.dispensationId,
            sourceLineId: movement._id.toHexString(),
            reversalOfMovementId: movement._id.toHexString(),
            operationKey: deduplicationKey(
              transaction.transactionId,
              'dispensing-reversal',
              movement._id.toHexString(),
            ),
            quantity,
            onHandDelta: quantity,
            availableDelta: available ? quantity : '0',
            reservedDelta: '0',
            quarantinedDelta: available ? '0' : quantity,
            damagedDelta: '0',
            expiredDelta: '0',
            inTransitDelta: '0',
            reason: input.reason,
            metadata: {
              originalDispensationId: input.dispensationId,
            },
            occurredAt,
            allowNegativeStock: false,
          });
        }

        const reversed =
          await this.dependencies.repository.withTransaction(
            async (session) => {
              const posted = await this.dependencies.stockPosting.post(
                entries,
                session,
              );

              for (const reservationId of reservationIds) {
                const reservation = requireFound(
                  await this.dependencies.repository.findReservation(
                    context.actor.facilityId,
                    reservationId,
                    session,
                  ),
                  'The dispensing reservation was not found',
                );

                requireVersioned(
                  await this.dependencies.repository.markReservationReversed(
                    context.actor.facilityId,
                    reservationId,
                    reservation.version,
                    input.reason,
                    context.actor.userId,
                    operational.actor.staffId,
                    occurredAt,
                    session,
                  ),
                  'The dispensing reservation changed before reversal completed',
                );
              }

              return posted;
            },
          );

        const result: DispensingReversalResult = {
          dispensationId: input.dispensationId,
          reversedMovementIds: reversed.map(
            (movement) => movement._id.toHexString(),
          ),
        };

        await this.publishMutation(
          context,
          transaction,
          operational.actor.staffId,
          occurredAt,
          AUDIT_ACTIONS.DISPENSING_REVERSED,
          OUTBOX_EVENTS.DISPENSING_REVERSED,
          REALTIME_EVENTS.STOCK_CHANGED,
          'Dispensation',
          input.dispensationId,
          result as unknown as Record<string, unknown>,
          { locationId },
          undefined,
          input.reason,
        );

        return result;
      },
    });
  }

  public async expireReservations(
    context: InventoryStockCommandContext,
    limit = 100,
  ): Promise<number> {
    const occurredAt = this.dependencies.clock.now();
    const reservations =
      await this.dependencies.repository.listExpiredReservations(
        context.actor.facilityId,
        occurredAt,
        limit,
      );

    let released = 0;

    for (const reservation of reservations) {
      await this.releaseStockReservation(
        {
          actor: context.actor,
          idempotencyKey:
            `reservation-expiry:${reservation._id.toHexString()}:${reservation.version}`,
        },
        reservation._id.toHexString(),
        {
          expectedVersion: reservation.version,
          reason: 'Stock reservation expired before consumption',
        },
        'EXPIRED',
      );
      released += 1;
    }

    return released;
  }

  private reservationEntries(
    context: InventoryStockCommandContext,
    transactionId: string,
    actorStaffId: string,
    aggregate: CreatedStockReservationAggregate,
    occurredAt: Date,
    movementType:
      | 'TRANSFER_RESERVATION'
      | 'DISPENSING_RESERVATION'
      | 'RESERVATION',
  ): StockLedgerEntryInput[] {
    return aggregate.items.flatMap((item) =>
      item.allocations.map((allocation) => {
        const quantity =
          allocation.reservedStockQuantity.toString();

        return {
          facilityId: context.actor.facilityId,
          transactionId,
          correlationId: context.actor.correlationId,
          actorUserId: context.actor.userId,
          actorStaffId,
          itemId: item.itemId.toHexString(),
          batchId: allocation.batchId?.toHexString() ?? null,
          locationId:
            aggregate.reservation.locationId.toHexString(),
          stockUnitId: item.stockUnitId.toHexString(),
          movementType,
          sourceType: 'STOCK_RESERVATION' as const,
          sourceId:
            aggregate.reservation._id.toHexString(),
          sourceLineId: item._id.toHexString(),
          operationKey: deduplicationKey(
            transactionId,
            'reservation',
            allocation._id.toHexString(),
          ),
          quantity,
          onHandDelta: '0',
          availableDelta: negative(quantity),
          reservedDelta: quantity,
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: '0',
          inTransitDelta: '0',
          reason: 'Stock reserved for an authorized source document',
          occurredAt,
          allowNegativeStock: false,
        };
      }),
    );
  }

  private releaseEntries(
    context: InventoryStockCommandContext,
    transactionId: string,
    actorStaffId: string,
    reservation: StockReservationRecord,
    items: readonly StockReservationItemRecord[],
    occurredAt: Date,
    reason: string,
    movementType:
      | 'RESERVATION_RELEASE'
      | 'TRANSFER_RESERVATION_RELEASE',
  ): {
    entries: StockLedgerEntryInput[];
    releaseByItem: ReadonlyMap<string, string>;
  } {
    const entries: StockLedgerEntryInput[] = [];
    const releaseByItem = new Map<string, string>();

    for (const item of items) {
      let itemRelease = new Decimal(0);

      for (const allocation of item.allocations) {
        const quantity = new Decimal(
          allocation.reservedStockQuantity.toString(),
        )
          .minus(allocation.consumedStockQuantity.toString())
          .minus(allocation.releasedStockQuantity.toString());

        if (quantity.lte(0)) {
          continue;
        }

        itemRelease = itemRelease.plus(quantity);

        entries.push({
          facilityId: context.actor.facilityId,
          transactionId,
          correlationId: context.actor.correlationId,
          actorUserId: context.actor.userId,
          actorStaffId,
          itemId: item.itemId.toHexString(),
          batchId: allocation.batchId?.toHexString() ?? null,
          locationId: reservation.locationId.toHexString(),
          stockUnitId: item.stockUnitId.toHexString(),
          movementType,
          sourceType: 'STOCK_RESERVATION',
          sourceId: reservation._id.toHexString(),
          sourceLineId: item._id.toHexString(),
          operationKey: deduplicationKey(
            transactionId,
            'reservation-release',
            allocation._id.toHexString(),
          ),
          quantity: normalized(quantity),
          onHandDelta: '0',
          availableDelta: normalized(quantity),
          reservedDelta: negative(quantity),
          quarantinedDelta: '0',
          damagedDelta: '0',
          expiredDelta: '0',
          inTransitDelta: '0',
          reason,
          occurredAt,
          allowNegativeStock: false,
        });
      }

      if (itemRelease.gt(0)) {
        releaseByItem.set(
          item._id.toHexString(),
          normalized(itemRelease),
        );
      }
    }

    return {
      entries,
      releaseByItem,
    };
  }

  private inTransitReleaseEntry(
    context: InventoryStockCommandContext,
    transactionId: string,
    actorStaffId: string,
    transfer: StockTransferRecord,
    item: StockTransferItemRecord,
    batchId: string | null,
    quantity: Decimal,
    occurredAt: Date,
    allocationId: string,
    suffix: string,
  ): StockLedgerEntryInput {
    return {
      facilityId: context.actor.facilityId,
      transactionId,
      correlationId: context.actor.correlationId,
      actorUserId: context.actor.userId,
      actorStaffId,
      itemId: item.itemId.toHexString(),
      batchId,
      locationId: transfer.sourceLocationId.toHexString(),
      stockUnitId: item.stockUnitId.toHexString(),
      movementType: 'TRANSFER_RECEIPT',
      sourceType: 'STOCK_TRANSFER',
      sourceId: transfer._id.toHexString(),
      sourceLineId: item._id.toHexString(),
      operationKey: deduplicationKey(
        transactionId,
        `transfer-in-transit-${suffix}`,
        allocationId,
      ),
      quantity: normalized(quantity),
      onHandDelta: '0',
      availableDelta: '0',
      reservedDelta: '0',
      quarantinedDelta: '0',
      damagedDelta: '0',
      expiredDelta: '0',
      inTransitDelta: negative(quantity),
      reason: 'Transfer stock received at destination',
      occurredAt,
      allowNegativeStock: false,
    };
  }

  private async destinationReceiptEntry(
    context: InventoryStockCommandContext,
    transactionId: string,
    actorStaffId: string,
    transfer: StockTransferRecord,
    item: StockTransferItemRecord,
    batchId: string | null,
    quantity: Decimal,
    occurredAt: Date,
    allocationId: string,
  ): Promise<StockLedgerEntryInput> {
    let available = true;

    if (batchId !== null) {
      const batch = await this.dependencies.stockQueries.findBatchById(
        context.actor.facilityId,
        batchId,
        false,
      );

      available =
        batch !== null &&
        batch.status === 'ACTIVE' &&
        batch.recallStatus === 'NONE' &&
        (
          batch.expiryDate === null ||
          batch.expiryDate.getTime() > occurredAt.getTime()
        );
    }

    return {
      facilityId: context.actor.facilityId,
      transactionId,
      correlationId: context.actor.correlationId,
      actorUserId: context.actor.userId,
      actorStaffId,
      itemId: item.itemId.toHexString(),
      batchId,
      locationId: transfer.destinationLocationId.toHexString(),
      stockUnitId: item.stockUnitId.toHexString(),
      movementType: 'TRANSFER_RECEIPT',
      sourceType: 'STOCK_TRANSFER',
      sourceId: transfer._id.toHexString(),
      sourceLineId: item._id.toHexString(),
      operationKey: deduplicationKey(
        transactionId,
        'transfer-destination-receipt',
        allocationId,
      ),
      quantity: normalized(quantity),
      onHandDelta: normalized(quantity),
      availableDelta: available
        ? normalized(quantity)
        : '0',
      reservedDelta: '0',
      quarantinedDelta: available
        ? '0'
        : normalized(quantity),
      damagedDelta: '0',
      expiredDelta: '0',
      inTransitDelta: '0',
      reason: available
        ? 'Transfer stock received into available inventory'
        : 'Restricted transfer stock received into quarantine',
      occurredAt,
      allowNegativeStock: false,
    };
  }

  private async requireTransfer(
    facilityId: string,
    transferId: string,
  ): Promise<StockTransferRecord> {
    const transfer = await this.dependencies.repository.findTransfer(
      facilityId,
      transferId,
    );

    if (transfer === null) {
      throw new ResourceNotFoundError(
        'Stock transfer was not found',
      );
    }

    return transfer;
  }

  private async requireReservation(
    facilityId: string,
    reservationId: string,
  ): Promise<StockReservationRecord> {
    const reservation =
      await this.dependencies.repository.findReservation(
        facilityId,
        reservationId,
      );

    if (reservation === null) {
      throw new ResourceNotFoundError(
        'Stock reservation was not found',
      );
    }

    return reservation;
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
    context: InventoryStockCommandContext,
    transaction: InventoryProcurementTransactionContext,
    actorStaffId: string,
    occurredAt: Date,
    auditAction: string,
    outboxEvent: string,
    realtimeEvent: string,
    entityType: string,
    entityId: string,
    after: Record<string, unknown>,
    routing: Readonly<{
      locationId?: string;
    }>,
    before?: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: deduplicationKey(
        transaction.transactionId,
        auditAction,
        entityId,
      ),
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
        : { ipAddress: context.actor.ipAddress }),
      ...(context.actor.userAgent === undefined
        ? {}
        : { userAgent: context.actor.userAgent }),
      ...(reason === undefined ? {} : { reason }),
      ...(before === undefined ? {} : { before }),
      after,
    });

    await transaction.checkpoint('AUDIT_APPENDED', {
      auditAction,
      entityId,
    });

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: deduplicationKey(
        transaction.transactionId,
        outboxEvent,
        entityId,
      ),
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

    await transaction.checkpoint('OUTBOX_ENQUEUED', {
      outboxEvent,
      entityId,
    });

    await this.dependencies.realtime.publish({
      eventType: realtimeEvent,
      facilityId: context.actor.facilityId,
      ...(routing.locationId === undefined
        ? {}
        : { locationId: routing.locationId }),
      payload: after,
    });

    await transaction.checkpoint('REALTIME_PUBLISHED', {
      realtimeEvent,
      entityId,
    });
  }
}