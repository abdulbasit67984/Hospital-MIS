import type {
  StockMovementDirection,
  StockMovementSourceType,
  StockMovementType,
  StockReservationSourceType,
  StockReservationStatus,
  StockTransferStatus,
  StockTransferType,
} from '@hospital-mis/database';

import type {
  InventoryActorContext,
  InventoryObjectIdString,
} from './inventory.contracts.js';

export interface InventoryStockCommandContext {
  actor: InventoryActorContext;
  idempotencyKey: string;
}

export interface StockTransferRequestLineInput {
  itemId: InventoryObjectIdString;
  requestedStockQuantity: string;
  notes?: string | null;
}

export interface CreateStockTransferRequestInput {
  transferType: StockTransferType;
  sourceLocationId: InventoryObjectIdString;
  destinationLocationId: InventoryObjectIdString;
  reason: string;
  notes?: string | null;
  lines: readonly StockTransferRequestLineInput[];
}

export interface ApproveStockTransferLineInput {
  transferItemId: InventoryObjectIdString;
  approvedStockQuantity: string;
}

export interface ApproveStockTransferInput {
  expectedVersion: number;
  reason: string;
  reservationExpiresAt: string;
  lines: readonly ApproveStockTransferLineInput[];
}

export interface RejectStockTransferInput {
  expectedVersion: number;
  reason: string;
}

export interface DispatchStockTransferInput {
  expectedVersion: number;
  reason: string;
}

export interface ReceiveStockTransferLineInput {
  transferItemId: InventoryObjectIdString;
  batchId?: InventoryObjectIdString | null;
  receivedStockQuantity: string;
}

export interface ReceiveStockTransferInput {
  expectedVersion: number;
  lines: readonly ReceiveStockTransferLineInput[];
  closeWithDiscrepancy?: boolean;
  discrepancyReason?: string | null;
}

export interface CancelStockTransferInput {
  expectedVersion: number;
  reason: string;
}

export interface ReverseStockTransferInput {
  expectedVersion: number;
  reason: string;
}

export interface ReserveStockLineInput {
  itemId: InventoryObjectIdString;
  requestedStockQuantity: string;
}

export interface ReserveStockInput {
  sourceType: StockReservationSourceType;
  sourceId: InventoryObjectIdString;
  sourceLineId?: InventoryObjectIdString | null;
  locationId: InventoryObjectIdString;
  patientId?: InventoryObjectIdString | null;
  expiresAt: string;
  lines: readonly ReserveStockLineInput[];
}

export interface ReleaseStockReservationInput {
  expectedVersion: number;
  reason: string;
}

export interface ConsumeReservationLineInput {
  reservationItemId: InventoryObjectIdString;
  stockQuantity: string;
}

export interface ConsumeDispensingReservationInput {
  expectedVersion: number;
  dispensationId: InventoryObjectIdString;
  lines: readonly ConsumeReservationLineInput[];
}

export interface ReverseDispensingInput {
  dispensationId: InventoryObjectIdString;
  reason: string;
}

export interface ExpireReservationsInput {
  facilityId: InventoryObjectIdString;
  limit?: number;
}

export interface StockAllocationResponse {
  allocationId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  reservedStockQuantity: string;
  consumedStockQuantity: string;
  releasedStockQuantity: string;
}

export interface StockReservationItemResponse {
  id: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  stockUnitId: InventoryObjectIdString;
  requestedStockQuantity: string;
  reservedStockQuantity: string;
  consumedStockQuantity: string;
  releasedStockQuantity: string;
  status: string;
  allocations: readonly StockAllocationResponse[];
}

export interface StockReservationResponse {
  id: InventoryObjectIdString;
  reservationNumber: string;
  sourceType: StockReservationSourceType;
  sourceId: InventoryObjectIdString;
  sourceLineId: InventoryObjectIdString | null;
  locationId: InventoryObjectIdString;
  patientId: InventoryObjectIdString | null;
  status: StockReservationStatus;
  lineCount: number;
  reservedAt: string;
  expiresAt: string;
  version: number;
  items: readonly StockReservationItemResponse[];
}

export interface StockTransferAllocationResponse {
  allocationId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  allocatedStockQuantity: string;
  dispatchedStockQuantity: string;
  receivedStockQuantity: string;
  discrepancyStockQuantity: string;
}

export interface StockTransferItemResponse {
  id: InventoryObjectIdString;
  itemId: InventoryObjectIdString;
  stockUnitId: InventoryObjectIdString;
  requestedStockQuantity: string;
  approvedStockQuantity: string;
  dispatchedStockQuantity: string;
  receivedStockQuantity: string;
  discrepancyStockQuantity: string;
  status: string;
  allocations: readonly StockTransferAllocationResponse[];
}

export interface StockTransferResponse {
  id: InventoryObjectIdString;
  transferNumber: string;
  transferType: StockTransferType;
  sourceLocationId: InventoryObjectIdString;
  destinationLocationId: InventoryObjectIdString;
  reservationId: InventoryObjectIdString | null;
  status: StockTransferStatus;
  lineCount: number;
  requestedAt: string;
  approvedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  version: number;
  items: readonly StockTransferItemResponse[];
}

export interface StockMovementResponse {
  id: InventoryObjectIdString;
  movementNumber: string;
  ledgerSequence: number;
  itemId: InventoryObjectIdString;
  batchId: InventoryObjectIdString | null;
  locationId: InventoryObjectIdString;
  movementType: StockMovementType;
  direction: StockMovementDirection;
  quantity: string;
  sourceType: StockMovementSourceType;
  sourceId: InventoryObjectIdString;
  sourceLineId: InventoryObjectIdString | null;
  reversalOfMovementId: InventoryObjectIdString | null;
  occurredAt: string;
}

export interface DispensingStockResult {
  reservationId: InventoryObjectIdString;
  dispensationId: InventoryObjectIdString;
  consumedStockQuantity: string;
  movementIds: readonly InventoryObjectIdString[];
}

export interface DispensingReversalResult {
  dispensationId: InventoryObjectIdString;
  reversedMovementIds: readonly InventoryObjectIdString[];
}