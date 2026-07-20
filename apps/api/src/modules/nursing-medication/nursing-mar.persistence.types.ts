import type {
  Types,
} from 'mongoose';

import type {
  MedicationAdministrationRoute,
  MedicationAdministrationSource,
  MedicationDoseStatus,
  MedicationScheduleStatus,
  NursingAmendmentType,
} from '@hospital-mis/database';

export interface MarPersistenceMetadata {
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarMedicationScheduleRecord
extends MarPersistenceMetadata {
  _id: Types.ObjectId;
  scheduleNumber: string;
  prescriptionId: Types.ObjectId | null;
  prescriptionItemId: Types.ObjectId | null;
  source: MedicationAdministrationSource;
  medicineId: Types.ObjectId;
  formularyItemId: Types.ObjectId | null;
  medicineDisplay: string;
  prescribedDose: Types.Decimal128;
  doseUnitCode: string;
  route: MedicationAdministrationRoute;
  frequencyCode: string;
  scheduledTimes: Date[];
  prn: boolean;
  prnIndication: string | null;
  startAt: Date;
  endAt: Date | null;
  status: MedicationScheduleStatus;
  holdReason: string | null;
  orderedByUserId: Types.ObjectId;
  orderedByStaffId: Types.ObjectId;
  lastAdministrationAt: Date | null;
  nextScheduledAt: Date | null;
}

export interface MarMedicationAdministrationRecord
extends MarPersistenceMetadata {
  _id: Types.ObjectId;
  administrationNumber: string;
  medicationScheduleId: Types.ObjectId;
  prescriptionId: Types.ObjectId | null;
  prescriptionItemId: Types.ObjectId | null;
  medicineId: Types.ObjectId;
  medicineDisplaySnapshot: string;
  scheduledAt: Date;
  status: MedicationDoseStatus;
  prescribedDose: Types.Decimal128;
  administeredDose: Types.Decimal128 | null;
  doseUnitCode: string;
  prescribedRoute: MedicationAdministrationRoute;
  administeredRoute: MedicationAdministrationRoute | null;
  administeredAt: Date | null;
  administeringNurseUserId: Types.ObjectId | null;
  administeringNurseStaffId: Types.ObjectId | null;
  reasonCode: string | null;
  reason: string | null;
  notes: string | null;
  delayedUntil: Date | null;
  statusChangedAt: Date;
  statusChangedBy: Types.ObjectId;
  correctionOfAdministrationId: Types.ObjectId | null;
  supersededByAdministrationId: Types.ObjectId | null;
}

export interface MarMedicationAdministrationAmendmentRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
  medicationAdministrationId: Types.ObjectId;
  amendmentSequence: number;
  amendmentType: NursingAmendmentType;
  previousStatus: MedicationDoseStatus;
  replacementAdministrationId: Types.ObjectId | null;
  reason: string;
  snapshotHash: string;
  occurredAt: Date;
  performedByUserId: Types.ObjectId;
  performedByStaffId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarScheduleDerivedState {
  lastAdministrationAt: Date | null;
  nextScheduledAt: Date | null;
}