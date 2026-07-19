import type {
  FormularyPrescriptionSnapshotCryptoPort,
  FormularyPrescriptionTransactionCompensation,
} from './formulary-prescriptions.ports.js';

import type {
  FormularyItemRecord,
  PrescriptionItemRecord,
  PrescriptionRecord,
  PrescriptionSafetyWarningRecord,
} from './formulary-prescriptions.persistence.types.js';

import {
  FORMULARY_PRESCRIPTION_COMPENSATION_TYPES,
  type FormularyPrescriptionCompensatableCollection,
} from './formulary-prescriptions.transaction.constants.js';

export interface FormularyPrescriptionRestoreSnapshot {
  version: number;
  updatedBy: string;
  updatedAt: string;
  values: Record<string, unknown>;
}

export interface ProtectedFormularyPrescriptionRestorePayload {
  collection: FormularyPrescriptionCompensatableCollection;
  entityId: string;
  expectedPostVersion: number;
  associatedData: string;
  encryptedSnapshot: ReturnType<
    FormularyPrescriptionSnapshotCryptoPort['protect']
  >['encryptedValue'];
  snapshotHash: string;
}

export interface ProtectedFormularyPrescriptionRecordSetRestorePayload {
  collection: FormularyPrescriptionCompensatableCollection;
  parentField: string;
  parentId: string;
  associatedData: string;
  encryptedSnapshot: ReturnType<
    FormularyPrescriptionSnapshotCryptoPort['protect']
  >['encryptedValue'];
  snapshotHash: string;
}

function id(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ?? null;
}

function date(
  value: Date | null,
): string | null {
  return value?.toISOString() ?? null;
}

export function formularyItemRestoreSnapshot(
  record: FormularyItemRecord,
): FormularyPrescriptionRestoreSnapshot {
  return {
    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),

    values: {
      brandName:
        record.brandName,

      normalizedBrandName:
        record.normalizedBrandName,

      allowedRouteIds:
        record.allowedRouteIds.map(
          (routeId) =>
            routeId.toHexString(),
        ),

      defaultRouteId:
        record.defaultRouteId.toHexString(),

      inventoryItemId:
        id(
          record.inventoryItemId,
        ),

      stockTracked:
        record.stockTracked,

      restrictionType:
        record.restrictionType,

      restrictedDepartmentIds:
        record.restrictedDepartmentIds.map(
          (departmentId) =>
            departmentId.toHexString(),
        ),

      minimumAgeYears:
        record.minimumAgeYears,

      maximumAgeYears:
        record.maximumAgeYears,

      highAlert:
        record.highAlert,

      controlledMedicine:
        record.controlledMedicine,

      prescribingNotes:
        record.prescribingNotes,

      searchText:
        record.searchText,

      activeSelectionKey:
        record.activeSelectionKey,

      effectiveFrom:
        record.effectiveFrom.toISOString(),

      effectiveUntil:
        date(
          record.effectiveUntil,
        ),

      status:
        record.status,

      deactivatedAt:
        date(
          record.deactivatedAt,
        ),

      deactivatedBy:
        id(
          record.deactivatedBy,
        ),

      deactivationReason:
        record.deactivationReason,
    },
  };
}

export function prescriptionRestoreSnapshot(
  record: PrescriptionRecord,
): FormularyPrescriptionRestoreSnapshot {
  return {
    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),

    values: {
      status:
        record.status,

      supersededByPrescriptionId:
        id(
          record.supersededByPrescriptionId,
        ),

      issuedAt:
        date(
          record.issuedAt,
        ),

      expiresAt:
        date(
          record.expiresAt,
        ),

      signedBy:
        id(
          record.signedBy,
        ),

      signatureMethod:
        record.signatureMethod,

      signatureDigest:
        record.signatureDigest,

      lockedAt:
        date(
          record.lockedAt,
        ),

      lockedBy:
        id(
          record.lockedBy,
        ),

      issuedSnapshotHash:
        record.issuedSnapshotHash,

      cancelledAt:
        date(
          record.cancelledAt,
        ),

      cancelledBy:
        id(
          record.cancelledBy,
        ),

      cancellationReason:
        record.cancellationReason,

      interactionCheckStatus:
        record.interactionCheckStatus,

      interactionCheckProvider:
        record.interactionCheckProvider,

      interactionCheckedAt:
        date(
          record.interactionCheckedAt,
        ),

      itemCount:
        record.itemCount,

      activeItemCount:
        record.activeItemCount,

      dispensedItemCount:
        record.dispensedItemCount,

      safetyWarningCount:
        record.safetyWarningCount,

      unresolvedBlockingWarningCount:
        record.unresolvedBlockingWarningCount,

      printRevision:
        record.printRevision,

      lastPrintedAt:
        date(
          record.lastPrintedAt,
        ),

      lastPrintedBy:
        id(
          record.lastPrintedBy,
        ),
    },
  };
}

export function prescriptionItemRestoreSnapshot(
  record: PrescriptionItemRecord,
): Record<string, unknown> {
  return {
    _id:
      record._id.toHexString(),

    facilityId:
      record.facilityId.toHexString(),

    prescriptionId:
      record.prescriptionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    encounterId:
      record.encounterId.toHexString(),

    sequence:
      record.sequence,

    formularyItemId:
      record.formularyItemId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    medicineFormId:
      record.medicineFormId.toHexString(),

    medicineStrengthId:
      record.medicineStrengthId.toHexString(),

    selectedBrandName:
      record.selectedBrandName,

    genericNameSnapshot:
      record.genericNameSnapshot,

    medicineFormSnapshot:
      record.medicineFormSnapshot,

    medicineStrengthSnapshot:
      record.medicineStrengthSnapshot,

    dose:
      record.dose.toString(),

    doseUnitId:
      record.doseUnitId.toHexString(),

    doseUnitSnapshot:
      record.doseUnitSnapshot,

    routeId:
      record.routeId.toHexString(),

    routeSnapshot:
      record.routeSnapshot,

    frequencyId:
      record.frequencyId.toHexString(),

    frequencySnapshot:
      record.frequencySnapshot,

    durationValue:
      record.durationValue?.toString() ??
      null,

    durationUnit:
      record.durationUnit,

    quantity:
      record.quantity.toString(),

    quantityUnitId:
      record.quantityUnitId.toHexString(),

    quantityUnitSnapshot:
      record.quantityUnitSnapshot,

    instructions:
      record.instructions,

    asNeeded:
      record.asNeeded,

    asNeededReason:
      record.asNeededReason,

    startDate:
      record.startDate,

    endDate:
      record.endDate,

    status:
      record.status,

    cancelledAt:
      date(
        record.cancelledAt,
      ),

    cancelledBy:
      id(
        record.cancelledBy,
      ),

    cancellationReason:
      record.cancellationReason,

    dispensedQuantity:
      record.dispensedQuantity.toString(),

    lastDispensedAt:
      date(
        record.lastDispensedAt,
      ),

    lastDispensationId:
      id(
        record.lastDispensationId,
      ),

    transactionId:
      record.transactionId,

    correlationId:
      record.correlationId,

    schemaVersion:
      record.schemaVersion,

    version:
      record.version,

    createdBy:
      record.createdBy.toHexString(),

    updatedBy:
      record.updatedBy.toHexString(),

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function prescriptionWarningRestoreSnapshot(
  record: PrescriptionSafetyWarningRecord,
): FormularyPrescriptionRestoreSnapshot {
  return {
    version:
      record.version,

    updatedBy:
      record.updatedBy.toHexString(),

    updatedAt:
      record.updatedAt.toISOString(),

    values: {
      status:
        record.status,

      acknowledgedAt:
        date(
          record.acknowledgedAt,
        ),

      acknowledgedBy:
        id(
          record.acknowledgedBy,
        ),

      acknowledgementReason:
        record.acknowledgementReason,

      overriddenAt:
        date(
          record.overriddenAt,
        ),

      overriddenBy:
        id(
          record.overriddenBy,
        ),

      overrideReason:
        record.overrideReason,

      resolvedAt:
        date(
          record.resolvedAt,
        ),

      resolvedBy:
        id(
          record.resolvedBy,
        ),

      resolutionReason:
        record.resolutionReason,
    },
  };
}

export function protectFormularyPrescriptionRestorePayload(
  input: Readonly<{
    collection: FormularyPrescriptionCompensatableCollection;
    entityId: string;
    expectedPostVersion: number;
    transactionId: string;
    snapshot: FormularyPrescriptionRestoreSnapshot;
    snapshotCrypto: FormularyPrescriptionSnapshotCryptoPort;
  }>,
): ProtectedFormularyPrescriptionRestorePayload {
  const associatedData = [
    'hospital-mis',
    'formulary-prescriptions',
    'compensation',
    input.collection,
    input.entityId,
    input.transactionId,
  ].join(':');

  const protectedSnapshot =
    input.snapshotCrypto.protect(
      input.snapshot,
      associatedData,
    );

  return {
    collection:
      input.collection,

    entityId:
      input.entityId,

    expectedPostVersion:
      input.expectedPostVersion,

    associatedData,

    encryptedSnapshot:
      protectedSnapshot.encryptedValue,

    snapshotHash:
      protectedSnapshot.valueHash,
  };
}

export function protectPrescriptionItemSetRestorePayload(
  input: Readonly<{
    prescriptionId: string;
    items: readonly PrescriptionItemRecord[];
    transactionId: string;
    snapshotCrypto: FormularyPrescriptionSnapshotCryptoPort;
  }>,
): ProtectedFormularyPrescriptionRecordSetRestorePayload {
  const associatedData = [
    'hospital-mis',
    'formulary-prescriptions',
    'compensation',
    'prescriptionItems',
    input.prescriptionId,
    input.transactionId,
  ].join(':');

  const protectedSnapshot =
    input.snapshotCrypto.protect(
      input.items.map(
        prescriptionItemRestoreSnapshot,
      ),
      associatedData,
    );

  return {
    collection:
      'prescriptionItems',

    parentField:
      'prescriptionId',

    parentId:
      input.prescriptionId,

    associatedData,

    encryptedSnapshot:
      protectedSnapshot.encryptedValue,

    snapshotHash:
      protectedSnapshot.valueHash,
  };
}

export function deleteCreatedFormularyPrescriptionRecordCompensation(
  input: Readonly<{
    key: string;
    collection: FormularyPrescriptionCompensatableCollection;
    entityId: string;
    expectedVersion: number;
    transactionId: string;
  }>,
): FormularyPrescriptionTransactionCompensation {
  return {
    key:
      input.key,

    type:
      FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.DELETE_CREATED_RECORD,

    payload: {
      collection:
        input.collection,

      entityId:
        input.entityId,

      expectedVersion:
        input.expectedVersion,

      transactionId:
        input.transactionId,
    },
  };
}

export function restoreFormularyPrescriptionRecordCompensation(
  key: string,
  payload: ProtectedFormularyPrescriptionRestorePayload,
): FormularyPrescriptionTransactionCompensation {
  return {
    key,

    type:
      FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD,

    payload: {
      ...payload,
    },
  };
}

export function restorePrescriptionItemSetCompensation(
  key: string,
  payload: ProtectedFormularyPrescriptionRecordSetRestorePayload,
): FormularyPrescriptionTransactionCompensation {
  return {
    key,

    type:
      FORMULARY_PRESCRIPTION_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD_SET,

    payload: {
      ...payload,
    },
  };
}