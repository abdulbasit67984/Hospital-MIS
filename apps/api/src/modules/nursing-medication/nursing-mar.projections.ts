import type {
  MedicationAdministrationView,
  MedicationScheduleView,
} from './nursing-mar.contracts.js';

import type {
  MarMedicationAdministrationRecord,
  MarMedicationScheduleRecord,
} from './nursing-mar.persistence.types.js';

function id(
  value:
    | {
        toHexString(): string;
      }
    | null,
): string | null {
  return value?.toHexString() ?? null;
}

function decimal(
  value:
    | {
        toString(): string;
      }
    | null,
): string | null {
  return value?.toString() ?? null;
}

export function projectMedicationSchedule(
  record: MarMedicationScheduleRecord,
): MedicationScheduleView {
  return {
    id:
      record._id.toHexString(),

    scheduleNumber:
      record.scheduleNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    prescriptionId:
      id(
        record.prescriptionId,
      ),

    prescriptionItemId:
      id(
        record.prescriptionItemId,
      ),

    source:
      record.source,

    medicineId:
      record.medicineId.toHexString(),

    formularyItemId:
      id(
        record.formularyItemId,
      ),

    medicineDisplay:
      record.medicineDisplay,

    prescribedDose:
      record.prescribedDose.toString(),

    doseUnitCode:
      record.doseUnitCode,

    route:
      record.route,

    frequencyCode:
      record.frequencyCode,

    scheduledTimes:
      record.scheduledTimes.map(
        (value) =>
          value.toISOString(),
      ),

    prn:
      record.prn,

    prnIndication:
      record.prnIndication,

    startAt:
      record.startAt.toISOString(),

    endAt:
      record.endAt?.toISOString() ?? null,

    status:
      record.status,

    holdReason:
      record.holdReason,

    lastAdministrationAt:
      record.lastAdministrationAt
        ?.toISOString() ?? null,

    nextScheduledAt:
      record.nextScheduledAt
        ?.toISOString() ?? null,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function projectMedicationAdministration(
  record: MarMedicationAdministrationRecord,
): MedicationAdministrationView {
  return {
    id:
      record._id.toHexString(),

    administrationNumber:
      record.administrationNumber,

    medicationScheduleId:
      record.medicationScheduleId.toHexString(),

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    medicineId:
      record.medicineId.toHexString(),

    medicineDisplay:
      record.medicineDisplaySnapshot,

    scheduledAt:
      record.scheduledAt.toISOString(),

    status:
      record.status,

    prescribedDose:
      record.prescribedDose.toString(),

    administeredDose:
      decimal(
        record.administeredDose,
      ),

    doseUnitCode:
      record.doseUnitCode,

    prescribedRoute:
      record.prescribedRoute,

    administeredRoute:
      record.administeredRoute,

    administeredAt:
      record.administeredAt
        ?.toISOString() ?? null,

    administeringNurseUserId:
      id(
        record.administeringNurseUserId,
      ),

    administeringNurseStaffId:
      id(
        record.administeringNurseStaffId,
      ),

    reasonCode:
      record.reasonCode,

    reason:
      record.reason,

    notes:
      record.notes,

    delayedUntil:
      record.delayedUntil
        ?.toISOString() ?? null,

    correctionOfAdministrationId:
      id(
        record.correctionOfAdministrationId,
      ),

    supersededByAdministrationId:
      id(
        record.supersededByAdministrationId,
      ),

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}