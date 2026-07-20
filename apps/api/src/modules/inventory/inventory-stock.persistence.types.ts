import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  StockMovementDirection,
  StockMovementSourceType,
  StockMovementType,
  StockReservationSourceType,
  StockReservationStatus,
  StockTransferStatus,
  StockTransferType,
} from '@hospital-mis/database';

export type InventoryStockMongoSession = ClientSession;

export interface InventoryStockMetadataRecord {
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

export interface StockMovementRecord
extends InventoryStockMetadataRecord {
  _id: Types.ObjectId;
  movementNumber: string;
  ledgerSequence: number;
  itemId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  storeLocationId: Types.ObjectId;
  stockUnitId: Types.ObjectId;
  movementType: StockMovementType;
  direction: StockMovementDirection;
  quantity: Types.Decimal128;
  onHandDelta: Types.Decimal128;
  availableDelta: Types.Decimal128;
  reservedDelta: Types.Decimal128;
  quarantinedDelta: Types.Decimal128;
  damagedDelta: Types.Decimal128;
  expiredDelta: Types.Decimal128;
  inTransitDelta: Types.Decimal128;
  balanceVersionBefore: number;
  balanceVersionAfter: number;
  sourceType: StockMovementSourceType;
  sourceId: Types.ObjectId;
  sourceLineId: Types.ObjectId | null;
  reversalOfMovementId: Types.ObjectId | null;
  operationKey: string;
  actorStaffId: Types.ObjectId;
  unitCost: Types.Decimal128 | null;
  currency: string | null;
  negativeStockOverride: boolean;
  negativeStockOverrideReason: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
}

export interface StockTransferAllocationRecord {
  _id: Types.ObjectId;
  batchId: Types.ObjectId | null;
  allocatedStockQuantity: Types.Decimal128;
  dispatchedStockQuantity: Types.Decimal128;
  receivedStockQuantity: Types.Decimal128;
  discrepancyStockQuantity: Types.Decimal128;
}

export interface StockTransferRecord
extends InventoryStockMetadataRecord {
  _id: Types.ObjectId;
  transferNumber: string;
  transferType: StockTransferType;
  sourceLocationId: Types.ObjectId;
  destinationLocationId: Types.ObjectId;
  requestedByStaffId: Types.ObjectId;
  approvedByStaffId: Types.ObjectId | null;
  rejectedByStaffId: Types.ObjectId | null;
  dispatchedByStaffId: Types.ObjectId | null;
  receivedByStaffId: Types.ObjectId | null;
  cancelledByStaffId: Types.ObjectId | null;
  reversedByStaffId: Types.ObjectId | null;
  reservationId: Types.ObjectId | null;
  reason: string;
  notes: string | null;
  status: StockTransferStatus;
  lineCount: number;
  requestedAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  decisionReason: string | null;
  discrepancyReason: string | null;
  cancellationReason: string | null;
  reversalReason: string | null;
  dispatchTransactionId: string | null;
  receiptTransactionId: string | null;
  reversalTransactionId: string | null;
}

export interface StockTransferItemRecord
extends InventoryStockMetadataRecord {
  _id: Types.ObjectId;
  stockTransferId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  stockUnitId: Types.ObjectId;
  requestedStockQuantity: Types.Decimal128;
  approvedStockQuantity: Types.Decimal128;
  dispatchedStockQuantity: Types.Decimal128;
  receivedStockQuantity: Types.Decimal128;
  discrepancyStockQuantity: Types.Decimal128;
  allocations: StockTransferAllocationRecord[];
  status: string;
  notes: string | null;
}

export interface StockReservationAllocationRecord {
  _id: Types.ObjectId;
  batchId: Types.ObjectId | null;
  reservedStockQuantity: Types.Decimal128;
  consumedStockQuantity: Types.Decimal128;
  releasedStockQuantity: Types.Decimal128;
}

export interface StockReservationRecord
extends InventoryStockMetadataRecord {
  _id: Types.ObjectId;
  reservationNumber: string;
  sourceType: StockReservationSourceType;
  sourceId: Types.ObjectId;
  sourceLineId: Types.ObjectId | null;
  locationId: Types.ObjectId;
  patientId: Types.ObjectId | null;
  reservedByStaffId: Types.ObjectId;
  consumedByStaffId: Types.ObjectId | null;
  releasedByStaffId: Types.ObjectId | null;
  reversedByStaffId: Types.ObjectId | null;
  status: StockReservationStatus;
  lineCount: number;
  reservedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  releasedAt: Date | null;
  reversedAt: Date | null;
  releaseReason: string | null;
  reversalReason: string | null;
  consumptionSourceId: Types.ObjectId | null;
}

export interface StockReservationItemRecord
extends InventoryStockMetadataRecord {
  _id: Types.ObjectId;
  stockReservationId: Types.ObjectId;
  lineNumber: number;
  itemId: Types.ObjectId;
  stockUnitId: Types.ObjectId;
  requestedStockQuantity: Types.Decimal128;
  reservedStockQuantity: Types.Decimal128;
  consumedStockQuantity: Types.Decimal128;
  releasedStockQuantity: Types.Decimal128;
  allocations: StockReservationAllocationRecord[];
  status: string;
}

export interface StockLedgerEntryInput {
  facilityId: string;
  transactionId: string;
  correlationId: string;
  actorUserId: string;
  actorStaffId: string;
  itemId: string;
  batchId: string | null;
  locationId: string;
  stockUnitId: string;
  movementType: StockMovementType;
  sourceType: StockMovementSourceType;
  sourceId: string;
  sourceLineId: string | null;
  reversalOfMovementId?: string | null;
  operationKey: string;
  quantity: string;
  onHandDelta: string;
  availableDelta: string;
  reservedDelta: string;
  quarantinedDelta: string;
  damagedDelta: string;
  expiredDelta: string;
  inTransitDelta: string;
  unitCost?: string | null;
  currency?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: Date;
  allowNegativeStock?: boolean;
  negativeStockOverrideReason?: string | null;
}

export interface StockAllocation {
  batchId: string | null;
  stockQuantity: string;
}

export interface PreparedTransferLine {
  transferItemId: string;
  expectedVersion: number;
  itemId: string;
  stockUnitId: string;
  approvedStockQuantity: string;
  allocations: readonly StockAllocation[];
}

export interface PreparedReservationLine {
  itemId: string;
  stockUnitId: string;
  requestedStockQuantity: string;
  reservedStockQuantity: string;
  allocations: readonly StockAllocation[];
}

export interface CreatedStockTransferAggregate {
  transfer: StockTransferRecord;
  items: StockTransferItemRecord[];
}

export interface CreatedStockReservationAggregate {
  reservation: StockReservationRecord;
  items: StockReservationItemRecord[];
}

export interface TransferReceiptAllocationInput {
  transferItemId: string;
  allocationId: string;
  receivedStockQuantity: string;
  discrepancyStockQuantity: string;
}