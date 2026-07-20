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

import type {
  MedicationAdministrationHistoryQuery,
  MedicationDueBoardQuery,
  MedicationOrderTrace,
} from './medication-administration.contracts.js';

export interface MedicationScheduleRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
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
  version: number;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicationAdministrationRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
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
  version: number;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMedicationScheduleRecordInput
  extends Omit<
    MedicationScheduleRecord,
    '_id' | 'createdAt' | 'updatedAt'
  > {}

export interface CreateMedicationAdministrationRecordInput
  extends Omit<
    MedicationAdministrationRecord,
    '_id' | 'createdAt' | 'updatedAt'
  > {}

export interface MedicationAdministrationRepositoryPort {
  createSchedule(
    input: CreateMedicationScheduleRecordInput,
  ): Promise<MedicationScheduleRecord>;

  findScheduleById(
    facilityId: string,
    scheduleId: string,
  ): Promise<MedicationScheduleRecord | null>;

  updateSchedule(
    facilityId: string,
    scheduleId: string,
    expectedVersion: number,
    allowedStatuses: readonly MedicationScheduleStatus[],
    update: Record<string, unknown>,
  ): Promise<MedicationScheduleRecord | null>;

  listSchedulesForDueBoard(
    facilityId: string,
    query: MedicationDueBoardQuery,
  ): Promise<MedicationScheduleRecord[]>;

  listSchedulesForCompliance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<MedicationScheduleRecord[]>;

  createAdministration(
    input: CreateMedicationAdministrationRecordInput,
  ): Promise<MedicationAdministrationRecord>;

  findAdministrationById(
    facilityId: string,
    administrationId: string,
  ): Promise<MedicationAdministrationRecord | null>;

  findCurrentAdministrationForDose(
    facilityId: string,
    scheduleId: string,
    scheduledAt: Date,
  ): Promise<MedicationAdministrationRecord | null>;

  findDelayedAdministrationByRevisedTime(
    facilityId: string,
    scheduleId: string,
    delayedUntil: Date,
  ): Promise<MedicationAdministrationRecord | null>;

  updateAdministration(
    facilityId: string,
    administrationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
  ): Promise<MedicationAdministrationRecord | null>;

  createAmendment(
    input: Readonly<{
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
    }>,
  ): Promise<string>;

  listAdministrations(
    facilityId: string,
    query: MedicationAdministrationHistoryQuery,
  ): Promise<{
    items: MedicationAdministrationRecord[];
    total: number;
  }>;

  listCurrentAdministrationsForSchedules(
    facilityId: string,
    scheduleIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<MedicationAdministrationRecord[]>;

  resolveOrderTrace(
    schedule: MedicationScheduleRecord,
  ): Promise<MedicationOrderTrace>;
}

export interface MedicationTimingPolicy {
  earlyWindowMinutes: number;
  lateWindowMinutes: number;
  highAlertEarlyWindowMinutes: number;
  highAlertLateWindowMinutes: number;
  doubleCheckMaximumAgeMinutes: number;
}

export interface MedicationTimingPolicyPort {
  resolve(
    facilityId: string,
    wardId: string,
    route: MedicationAdministrationRoute,
  ): Promise<MedicationTimingPolicy>;
}
