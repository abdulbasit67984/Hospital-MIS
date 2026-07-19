import {
  randomBytes,
} from 'node:crypto';

import type {
  FormularyItemStatus,
  PrescriptionStatus,
} from '@hospital-mis/database';

import {
  FORMULARY_PRESCRIPTION_LOCK_NAMESPACE,
  PRESCRIPTION_TRANSITIONS,
} from './formulary-prescriptions.constants.js';

import {
  InvalidPrescriptionTransitionError,
} from './formulary-prescriptions.errors.js';

import type {
  FormularyItemRecord,
  PrescriptionRecord,
} from './formulary-prescriptions.persistence.types.js';

export function newFormularyPrescriptionObjectIdString(): string {
  return randomBytes(12).toString('hex');
}

export function formularyPrescriptionDeduplicationKey(
  transactionId: string,
  action: string,
  entityId: string,
): string {
  return [
    transactionId,
    action,
    entityId,
  ].join(':');
}

export function formularyPrescriptionLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [
    namespace,
    facilityId,
    ...parts,
  ]
    .map((value) =>
      value
        .trim()
        .toLowerCase(),
    )
    .join(':');
}

export function formularyItemCreateLockKeys(
  facilityId: string,
  input: Readonly<{
    medicineId: string;
    medicineFormId: string;
    medicineStrengthId: string;
    brandName?: string | null;
  }>,
): string[] {
  return [
    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.FORMULARY_ITEM,
      facilityId,
      input.medicineId,
      input.medicineFormId,
      input.medicineStrengthId,
      input.brandName ?? '-',
    ),
  ];
}

export function formularyItemMutationLockKeys(
  facilityId: string,
  formularyItemId: string,
): string[] {
  return [
    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.FORMULARY_ITEM,
      facilityId,
      formularyItemId,
    ),
  ];
}

export function prescriptionCreateLockKeys(
  facilityId: string,
  patientId: string,
  encounterId: string,
): string[] {
  return [
    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.ENCOUNTER_PRESCRIPTIONS,
      facilityId,
      encounterId,
    ),

    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.PATIENT_ACTIVE_MEDICINES,
      facilityId,
      patientId,
    ),
  ];
}

export function prescriptionMutationLockKeys(
  facilityId: string,
  prescription: PrescriptionRecord,
): string[] {
  return [
    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.PRESCRIPTION,
      facilityId,
      prescription._id.toHexString(),
    ),

    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.ENCOUNTER_PRESCRIPTIONS,
      facilityId,
      prescription.encounterId.toHexString(),
    ),

    formularyPrescriptionLockKey(
      FORMULARY_PRESCRIPTION_LOCK_NAMESPACE.PATIENT_ACTIVE_MEDICINES,
      facilityId,
      prescription.patientId.toHexString(),
    ),
  ];
}

export function assertPrescriptionTransition(
  fromStatus: PrescriptionStatus,
  toStatus: PrescriptionStatus,
): void {
  if (fromStatus === toStatus) {
    return;
  }

  const allowed =
    PRESCRIPTION_TRANSITIONS[
      fromStatus
    ] as readonly PrescriptionStatus[];

  if (!allowed.includes(toStatus)) {
    throw new InvalidPrescriptionTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function safeFormularyItemAuditSnapshot(
  record: FormularyItemRecord,
): Record<string, unknown> {
  return {
    formularyItemId:
      record._id.toHexString(),

    formularyCode:
      record.formularyCode,

    medicineId:
      record.medicineId.toHexString(),

    medicineFormId:
      record.medicineFormId.toHexString(),

    medicineStrengthId:
      record.medicineStrengthId.toHexString(),

    allowedRouteIds:
      record.allowedRouteIds.map(
        (routeId) =>
          routeId.toHexString(),
      ),

    defaultRouteId:
      record.defaultRouteId.toHexString(),

    inventoryLinked:
      record.inventoryItemId !== null,

    stockTracked:
      record.stockTracked,

    restrictionType:
      record.restrictionType,

    restrictedDepartmentIds:
      record.restrictedDepartmentIds.map(
        (departmentId) =>
          departmentId.toHexString(),
      ),

    highAlert:
      record.highAlert,

    controlledMedicine:
      record.controlledMedicine,

    effectiveFrom:
      record.effectiveFrom.toISOString(),

    effectiveUntil:
      record.effectiveUntil?.toISOString() ??
      null,

    status:
      record.status,

    version:
      record.version,
  };
}

export function safeFormularyItemEventPayload(
  record: FormularyItemRecord,
): Record<string, unknown> {
  return {
    formularyItemId:
      record._id.toHexString(),

    formularyCode:
      record.formularyCode,

    medicineId:
      record.medicineId.toHexString(),

    status:
      record.status,

    stockTracked:
      record.stockTracked,

    inventoryLinked:
      record.inventoryItemId !== null,

    version:
      record.version,
  };
}

export function safePrescriptionAuditSnapshot(
  record: PrescriptionRecord,
): Record<string, unknown> {
  return {
    prescriptionId:
      record._id.toHexString(),

    prescriptionNumber:
      record.prescriptionNumber,

    encounterId:
      record.encounterId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    prescriberProviderId:
      record.prescriberProviderId.toHexString(),

    departmentId:
      record.departmentId.toHexString(),

    status:
      record.status,

    revisionNumber:
      record.revisionNumber,

    rootPrescriptionId:
      record.rootPrescriptionId.toHexString(),

    supersedesPrescriptionId:
      record.supersedesPrescriptionId?.toHexString() ??
      null,

    supersededByPrescriptionId:
      record.supersededByPrescriptionId?.toHexString() ??
      null,

    issuedAt:
      record.issuedAt?.toISOString() ??
      null,

    expiresAt:
      record.expiresAt?.toISOString() ??
      null,

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

    version:
      record.version,
  };
}

export function safePrescriptionEventPayload(
  record: PrescriptionRecord,
): Record<string, unknown> {
  return {
    prescriptionId:
      record._id.toHexString(),

    prescriptionNumber:
      record.prescriptionNumber,

    encounterId:
      record.encounterId.toHexString(),

    prescriberProviderId:
      record.prescriberProviderId.toHexString(),

    departmentId:
      record.departmentId.toHexString(),

    status:
      record.status,

    revisionNumber:
      record.revisionNumber,

    itemCount:
      record.itemCount,

    unresolvedBlockingWarningCount:
      record.unresolvedBlockingWarningCount,

    issuedAt:
      record.issuedAt?.toISOString() ??
      null,

    expiresAt:
      record.expiresAt?.toISOString() ??
      null,

    version:
      record.version,
  };
}

export function safePrescriptionJournalPayload(
  operation: string,
  input: Readonly<{
    prescriptionId?: string;
    encounterId: string;
    patientId: string;
    status?: PrescriptionStatus;
    itemCount?: number;
    revisionNumber?: number;
  }>,
): Record<string, unknown> {
  return {
    operation,

    prescriptionId:
      input.prescriptionId ??
      null,

    encounterId:
      input.encounterId,

    patientId:
      input.patientId,

    status:
      input.status ??
      null,

    itemCount:
      input.itemCount ??
      null,

    revisionNumber:
      input.revisionNumber ??
      null,
  };
}

export function safeFormularyJournalPayload(
  operation: string,
  input: Readonly<{
    formularyItemId?: string;
    medicineId: string;
    medicineFormId: string;
    medicineStrengthId: string;
    status?: FormularyItemStatus;
  }>,
): Record<string, unknown> {
  return {
    operation,

    formularyItemId:
      input.formularyItemId ??
      null,

    medicineId:
      input.medicineId,

    medicineFormId:
      input.medicineFormId,

    medicineStrengthId:
      input.medicineStrengthId,

    status:
      input.status ??
      null,
  };
}