import type {
  InventoryAccessPolicyPort,
  InventoryCatalogRepositoryPort,
  InventoryClockPort,
  InventoryContextPort,
  InventoryStockQueryRepositoryPort,
} from './inventory.ports.js';

import type {
  InventoryProcurementAuditPort,
  InventoryProcurementOutboxPort,
  InventoryProcurementRealtimePort,
  InventoryProcurementSequencePort,
  InventoryProcurementTransactionManagerPort,
  InventoryReceiptStockPostingPort,
} from './inventory-procurement.ports.js';

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
} from './inventory-stock.contracts.js';

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
} from './inventory-stock.persistence.types.js';

export interface InventoryStockLedgerRepositoryPort {
  withTransaction<T>(
    work: (
      session: InventoryStockMongoSession,
    ) => Promise<T>,
  ): Promise<T>;

  postLedgerEntries(
    entries: readonly StockLedgerEntryInput[],
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]>;

  findMovementByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockMovementRecord | null>;

  findMovementsBySource(
    facilityId: string,
    sourceType: string,
    sourceId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]>;
}

export interface InventoryStockOperationsRepositoryPort
extends InventoryStockLedgerRepositoryPort {
  createTransferAggregate(
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
  ): Promise<CreatedStockTransferAggregate>;

  findTransfer(
    facilityId: string,
    transferId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  findTransferItems(
    facilityId: string,
    transferId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockTransferItemRecord[]>;

  approveTransfer(
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
  ): Promise<StockTransferRecord | null>;

  rejectTransfer(
    facilityId: string,
    transferId: string,
    input: RejectStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  markTransferDispatched(
    facilityId: string,
    transferId: string,
    input: DispatchStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  recordTransferReceipt(
    facilityId: string,
    transferId: string,
    input: ReceiveStockTransferInput,
    allocations: readonly TransferReceiptAllocationInput[],
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  cancelTransfer(
    facilityId: string,
    transferId: string,
    input: CancelStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  reverseTransfer(
    facilityId: string,
    transferId: string,
    input: ReverseStockTransferInput,
    actorUserId: string,
    actorStaffId: string,
    transactionId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockTransferRecord | null>;

  createReservationAggregate(
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
  ): Promise<CreatedStockReservationAggregate>;

  findReservation(
    facilityId: string,
    reservationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null>;

  findReservationBySource(
    facilityId: string,
    sourceType: string,
    sourceId: string,
    sourceLineId: string | null,
    locationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null>;

  findReservationItems(
    facilityId: string,
    reservationId: string,
    session?: InventoryStockMongoSession,
  ): Promise<StockReservationItemRecord[]>;

  markReservationConsumed(
    facilityId: string,
    reservationId: string,
    expectedVersion: number,
    consumptionSourceId: string,
    consumptionByItem: ReadonlyMap<string, string>,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null>;

  releaseReservation(
    facilityId: string,
    reservationId: string,
    input: ReleaseStockReservationInput,
    releaseByItem: ReadonlyMap<string, string>,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    status: 'RELEASED' | 'EXPIRED',
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null>;

  markReservationReversed(
    facilityId: string,
    reservationId: string,
    expectedVersion: number,
    reason: string,
    actorUserId: string,
    actorStaffId: string,
    occurredAt: Date,
    session: InventoryStockMongoSession,
  ): Promise<StockReservationRecord | null>;

  listExpiredReservations(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<StockReservationRecord[]>;
}

export interface InventoryStockPostingPort {
  post(
    entries: readonly StockLedgerEntryInput[],
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]>;

  reverseSourceMovements(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      correlationId: string;
      actorUserId: string;
      actorStaffId: string;
      sourceType: string;
      sourceId: string;
      reason: string;
      occurredAt: Date;
    }>,
    session: InventoryStockMongoSession,
  ): Promise<StockMovementRecord[]>;
}

export interface InventoryFefoAllocationPort {
  allocate(
    input: Readonly<{
      facilityId: string;
      locationId: string;
      itemId: string;
      stockQuantity: string;
      at: Date;
    }>,
  ): Promise<readonly {
    batchId: string | null;
    stockQuantity: string;
  }[]>;
}

export interface InventoryDispensingIntegrationPort {
  reserveForDispensing(
    context: InventoryStockCommandContext,
    input: ReserveStockInput,
  ): Promise<CreatedStockReservationAggregate>;

  consumeDispensingReservation(
    context: InventoryStockCommandContext,
    reservationId: string,
    input: ConsumeDispensingReservationInput,
  ): Promise<DispensingStockResult>;

  reverseDispensing(
    context: InventoryStockCommandContext,
    input: ReverseDispensingInput,
  ): Promise<DispensingReversalResult>;
}

export interface InventoryStockOperationsDependencies {
  catalog: InventoryCatalogRepositoryPort;
  context: InventoryContextPort;
  accessPolicy: InventoryAccessPolicyPort;
  stockQueries: InventoryStockQueryRepositoryPort;
  repository: InventoryStockOperationsRepositoryPort;
  stockPosting: InventoryStockPostingPort;
  allocation: InventoryFefoAllocationPort;
  transactionManager: InventoryProcurementTransactionManagerPort;
  audit: InventoryProcurementAuditPort;
  outbox: InventoryProcurementOutboxPort;
  realtime: InventoryProcurementRealtimePort;
  sequence: InventoryProcurementSequencePort;
  clock: InventoryClockPort;
}

export type InventoryReceiptStockPostingAdapter =
  InventoryReceiptStockPostingPort;