import Decimal from 'decimal.js';

import type {
  FormularyItemRecord,
  MedicineFormRecord,
  MedicineRecord,
  MedicineRouteRecord,
  MedicineStrengthRecord,
  PrescriptionFrequencyRecord,
  PrescriptionItemRecord,
  PrescriptionRecord,
  PrescriptionSafetyWarningRecord,
  PrescriptionStatusHistoryRecord,
  UnitOfMeasureRecord,
} from './formulary-prescriptions.persistence.types.js';

import type {
  FormularyItemView,
  FormularyStockView,
  PrescriptionHistoryEntryView,
  PrescriptionItemView,
  PrescriptionSafetyWarningView,
  PrescriptionView,
} from './formulary-prescriptions.types.js';

function id(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ?? null;
}

function decimal(
  value: {
    toString(): string;
  } | null,
): string | null {
  return value?.toString() ?? null;
}

export interface FormularyItemMappingContext {
  medicine: MedicineRecord;
  medicineForm: MedicineFormRecord;
  medicineStrength: MedicineStrengthRecord;
  routes: readonly MedicineRouteRecord[];
  doseUnit: UnitOfMeasureRecord;
  quantityUnit: UnitOfMeasureRecord;
  stock?: FormularyStockView;
}

export function toFormularyItemView(
  record: FormularyItemRecord,
  context: FormularyItemMappingContext,
): FormularyItemView {
  const routeById =
    new Map(
      context.routes.map(
        (route) => [
          route._id.toHexString(),
          route,
        ],
      ),
    );

  return {
    id:
      record._id.toHexString(),

    facilityId:
      record.facilityId.toHexString(),

    formularyCode:
      record.formularyCode,

    medicineId:
      record.medicineId.toHexString(),

    genericName:
      context.medicine.genericName,

    brandName:
      record.brandName,

    medicineFormId:
      record.medicineFormId.toHexString(),

    form:
      context.medicineForm.name,

    medicineStrengthId:
      record.medicineStrengthId.toHexString(),

    strength:
      context.medicineStrength.displayText,

    allowedRoutes:
      record.allowedRouteIds.flatMap(
        (routeId) => {
          const route =
            routeById.get(
              routeId.toHexString(),
            );

          return route === undefined
            ? []
            : [
                {
                  id:
                    route._id.toHexString(),

                  code:
                    route.code,

                  name:
                    route.name,
                },
              ];
        },
      ),

    defaultRouteId:
      record.defaultRouteId.toHexString(),

    doseUnitId:
      record.doseUnitId.toHexString(),

    doseUnit:
      context.doseUnit.symbol,

    quantityUnitId:
      record.quantityUnitId.toHexString(),

    quantityUnit:
      context.quantityUnit.symbol,

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

    status:
      record.status,

    effectiveFrom:
      record.effectiveFrom.toISOString(),

    effectiveUntil:
      record.effectiveUntil?.toISOString() ??
      null,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),

    ...(context.stock === undefined
      ? {}
      : {
          stock:
            context.stock,
        }),
  };
}

export function toPrescriptionItemView(
  record: PrescriptionItemRecord,
): PrescriptionItemView {
  const quantity =
    new Decimal(
      record.quantity.toString(),
    );

  const dispensedQuantity =
    new Decimal(
      record.dispensedQuantity.toString(),
    );

  const remainingQuantity =
    Decimal.max(
      quantity.minus(
        dispensedQuantity,
      ),
      0,
    );

  return {
    id:
      record._id.toHexString(),

    sequence:
      record.sequence,

    formularyItemId:
      record.formularyItemId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    genericName:
      record.genericNameSnapshot,

    brandName:
      record.selectedBrandName,

    form:
      record.medicineFormSnapshot,

    strength:
      record.medicineStrengthSnapshot,

    dose:
      record.dose.toString(),

    doseUnit:
      record.doseUnitSnapshot,

    route:
      record.routeSnapshot,

    frequency:
      record.frequencySnapshot,

    durationValue:
      decimal(
        record.durationValue,
      ),

    durationUnit:
      record.durationUnit,

    quantity:
      quantity.toFixed(),

    quantityUnit:
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

    dispensedQuantity:
      dispensedQuantity.toFixed(),

    remainingQuantity:
      remainingQuantity.toFixed(),

    lastDispensedAt:
      record.lastDispensedAt?.toISOString() ??
      null,

    lastDispensationId:
      id(
        record.lastDispensationId,
      ),
  };
}

export function toPrescriptionSafetyWarningView(
  record: PrescriptionSafetyWarningRecord,
): PrescriptionSafetyWarningView {
  return {
    id:
      record._id.toHexString(),

    prescriptionItemId:
      id(
        record.prescriptionItemId,
      ),

    warningType:
      record.warningType,

    severity:
      record.severity,

    status:
      record.status,

    warningCode:
      record.warningCode,

    message:
      record.message,

    patientAllergyId:
      id(
        record.patientAllergyId,
      ),

    conflictingPrescriptionId:
      id(
        record.conflictingPrescriptionId,
      ),

    conflictingPrescriptionItemId:
      id(
        record.conflictingPrescriptionItemId,
      ),

    detectedAt:
      record.detectedAt.toISOString(),

    acknowledgedAt:
      record.acknowledgedAt?.toISOString() ??
      null,

    acknowledgedBy:
      id(
        record.acknowledgedBy,
      ),
  };
}

export function toPrescriptionView(
  record: PrescriptionRecord,
  options: Readonly<{
    items?: readonly PrescriptionItemRecord[];
    warnings?: readonly PrescriptionSafetyWarningRecord[];
  }> = {},
): PrescriptionView {
  return {
    id:
      record._id.toHexString(),

    facilityId:
      record.facilityId.toHexString(),

    prescriptionNumber:
      record.prescriptionNumber,

    patientId:
      record.patientId.toHexString(),

    requestedPatientId:
      record.requestedPatientId.toHexString(),

    canonicalRedirected:
      record.canonicalRedirected,

    encounterId:
      record.encounterId.toHexString(),

    registrationId:
      id(
        record.registrationId,
      ),

    opdVisitId:
      id(
        record.opdVisitId,
      ),

    queueTokenId:
      id(
        record.queueTokenId,
      ),

    departmentId:
      record.departmentId.toHexString(),

    clinicId:
      id(
        record.clinicId,
      ),

    servicePointId:
      id(
        record.servicePointId,
      ),

    prescriberProviderId:
      record.prescriberProviderId.toHexString(),

    status:
      record.status,

    revisionNumber:
      record.revisionNumber,

    rootPrescriptionId:
      record.rootPrescriptionId.toHexString(),

    supersedesPrescriptionId:
      id(
        record.supersedesPrescriptionId,
      ),

    supersededByPrescriptionId:
      id(
        record.supersededByPrescriptionId,
      ),

    draftedAt:
      record.draftedAt.toISOString(),

    issuedAt:
      record.issuedAt?.toISOString() ??
      null,

    expiresAt:
      record.expiresAt?.toISOString() ??
      null,

    signedBy:
      id(
        record.signedBy,
      ),

    interactionCheckStatus:
      record.interactionCheckStatus,

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

    version:
      record.version,

    createdAt:
      record.createdAt.toISOString(),

    updatedAt:
      record.updatedAt.toISOString(),

    ...(options.items === undefined
      ? {}
      : {
          items:
            options.items.map(
              toPrescriptionItemView,
            ),
        }),

    ...(options.warnings === undefined
      ? {}
      : {
          warnings:
            options.warnings.map(
              toPrescriptionSafetyWarningView,
            ),
        }),
  };
}

export function toPrescriptionHistoryEntryView(
  record: PrescriptionStatusHistoryRecord,
): PrescriptionHistoryEntryView {
  return {
    id:
      record._id.toHexString(),

    sequence:
      record.sequence,

    fromStatus:
      record.fromStatus,

    toStatus:
      record.toStatus,

    changeType:
      record.changeType,

    changeSource:
      record.changeSource,

    reason:
      record.reason,

    occurredAt:
      record.occurredAt.toISOString(),

    changedBy:
      record.changedBy.toHexString(),
  };
}