import {
  createHash,
} from 'node:crypto';

import Decimal from 'decimal.js';

import type {
  InventoryStockCommandContext,
} from '../inventory/inventory-stock.contracts.js';

import type {
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
} from './pharmacy-dispensing.persistence.types.js';

import type {
  PharmacyDispensingActorContext,
} from './pharmacy-dispensing.contracts.js';

import {
  PHARMACY_DISPENSING_LOCK_NAMESPACE,
} from './pharmacy-dispensing.constants.js';

function normalizeLockPart(value: string): string {
  return value.trim().toLowerCase();
}

export function pharmacyLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map(normalizeLockPart)
    .join(':');
}

export function prescriptionDispensingLockKeys(
  facilityId: string,
  prescriptionId: string,
  patientId: string,
): string[] {
  return [
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.PRESCRIPTION,
      facilityId,
      prescriptionId,
    ),
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.PATIENT,
      facilityId,
      patientId,
    ),
  ].sort();
}

export function dispensationMutationLockKeys(
  facilityId: string,
  dispensation: Pick<
    PharmacyDispensationRecord,
    '_id' | 'prescriptionId' | 'patientId' | 'stockReservationId'
  >,
): string[] {
  const keys = [
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.DISPENSATION,
      facilityId,
      dispensation._id.toHexString(),
    ),
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.PRESCRIPTION,
      facilityId,
      dispensation.prescriptionId.toHexString(),
    ),
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.PATIENT,
      facilityId,
      dispensation.patientId.toHexString(),
    ),
  ];

  if (dispensation.stockReservationId !== null) {
    keys.push(
      pharmacyLockKey(
        PHARMACY_DISPENSING_LOCK_NAMESPACE.RESERVATION,
        facilityId,
        dispensation.stockReservationId.toHexString(),
      ),
    );
  }

  return keys.sort();
}

export function dispensationItemMutationLockKeys(
  facilityId: string,
  dispensationId: string,
  itemId: string,
): string[] {
  return [
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.DISPENSATION,
      facilityId,
      dispensationId,
    ),
    pharmacyLockKey(
      PHARMACY_DISPENSING_LOCK_NAMESPACE.DISPENSATION_ITEM,
      facilityId,
      itemId,
    ),
  ].sort();
}

export function pharmacyDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return `${transactionId}:${action}:${entityId}`;
}

export function pharmacyOperationKey(
  facilityId: string,
  operation: string,
  idempotencyKey: string,
): string {
  return [
    facilityId,
    operation,
    idempotencyKey,
  ]
    .map(normalizeLockPart)
    .join(':');
}

export function pharmacySnapshotHash(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

export function formatDispensationNumber(
  occurredAt: Date,
  sequence: number,
): string {
  return [
    'DSP',
    occurredAt.getUTCFullYear(),
    String(sequence).padStart(7, '0'),
  ].join('-');
}

export function normalizePharmacyDecimal(
  value: string | Decimal,
  maximumScale = 8,
): string {
  const decimal =
    value instanceof Decimal
      ? value
      : new Decimal(value);

  if (!decimal.isFinite()) {
    throw new TypeError(
      'Pharmacy quantity must be a finite decimal',
    );
  }

  return decimal
    .toDecimalPlaces(
      maximumScale,
      Decimal.ROUND_HALF_UP,
    )
    .toFixed();
}

export function remainingPrescriptionQuantity(
  prescribedQuantity: string,
  alreadyDispensedQuantity: string,
): string {
  const remaining = new Decimal(
    prescribedQuantity,
  ).minus(alreadyDispensedQuantity);

  if (remaining.lt(0)) {
    throw new RangeError(
      'Prescription dispensing progress exceeds the prescribed quantity',
    );
  }

  return normalizePharmacyDecimal(remaining);
}

export function dispensationSnapshot(
  record: PharmacyDispensationRecord,
): Record<string, unknown> {
  return {
    dispensationId:
      record._id.toHexString(),
    dispensationNumber:
      record.dispensationNumber,
    prescriptionId:
      record.prescriptionId.toHexString(),
    prescriptionNumber:
      record.prescriptionNumberSnapshot,
    patientId:
      record.patientId.toHexString(),
    pharmacyLocationId:
      record.pharmacyLocationId.toHexString(),
    context:
      record.context,
    priority:
      record.priority,
    status:
      record.status,
    controlledMedicine:
      record.controlledMedicine,
    highAlertMedicine:
      record.highAlertMedicine,
    secondCheckRequired:
      record.secondCheckRequired,
    witnessRequired:
      record.witnessRequired,
    lineCount:
      record.lineCount,
    verifiedLineCount:
      record.verifiedLineCount,
    completedLineCount:
      record.completedLineCount,
    stockReservationId:
      record.stockReservationId?.toHexString() ?? null,
    finalizationState:
      record.finalizationState,
    version:
      record.version,
  };
}

export function dispensationItemSnapshot(
  record: PharmacyDispensationItemRecord,
): Record<string, unknown> {
  return {
    dispensationItemId:
      record._id.toHexString(),
    dispensationId:
      record.dispensationId.toHexString(),
    prescriptionItemId:
      record.prescriptionItemId.toHexString(),
    lineNumber:
      record.lineNumber,
    prescribedFormularyItemId:
      record.prescribedFormularyItemId.toHexString(),
    actualFormularyItemId:
      record.actualFormularyItemId?.toHexString() ?? null,
    requestedQuantity:
      record.requestedQuantity.toString(),
    approvedQuantity:
      record.approvedQuantity.toString(),
    reservedQuantity:
      record.reservedQuantity.toString(),
    dispensedQuantity:
      record.dispensedQuantity.toString(),
    blockingAlertCount:
      record.blockingAlertCount,
    controlledMedicine:
      record.controlledMedicine,
    status:
      record.status,
    version:
      record.version,
  };
}

export function pharmacyInventoryCommandContext(
  actor: PharmacyDispensingActorContext,
  idempotencyKey: string,
): InventoryStockCommandContext {
  return {
    actor: {
      userId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      roleKeys: actor.roleKeys,
      permissionKeys: actor.permissionKeys,
      ...(actor.ipAddress === undefined
        ? {}
        : {
            ipAddress: actor.ipAddress,
          }),
      ...(actor.userAgent === undefined
        ? {}
        : {
            userAgent: actor.userAgent,
          }),
      ...(actor.breakGlassReason === undefined
        ? {}
        : {
            breakGlassReason:
              actor.breakGlassReason,
          }),
    },
    idempotencyKey,
  };
}

export function safePharmacyJournalPayload(
  action: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    module: 'PHARMACY_DISPENSING',
    action,
    ...Object.fromEntries(
      Object.entries(payload).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  };
}