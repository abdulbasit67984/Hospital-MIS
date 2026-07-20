import type {
  MedicationAdministrationRoute,
  MedicationAdministrationSource,
  MedicationDoseStatus,
  MedicationScheduleStatus,
} from '@hospital-mis/database';

import type {
  NursingMedicationActorContext,
} from './nursing-medication.contracts.js';

export interface MedicationPatientConfirmationInput {
  patientId: string;
  mrn: string;
  birthDate: string | null;
}

export interface MedicationIndependentDoubleCheckInput {
  performedByUserId: string;
  performedByStaffId: string;
  confirmedAt: string;
  confirmationMethod:
    | 'BARCODE_AND_VISUAL'
    | 'TWO_PERSON_VISUAL'
    | 'ELECTRONIC_COSIGN';
}

export interface CreateMedicationAdministrationScheduleInput {
  admissionId: string;
  prescriptionId?: string | null;
  prescriptionItemId?: string | null;
  source: MedicationAdministrationSource;
  medicineId: string;
  formularyItemId?: string | null;
  medicineDisplay: string;
  prescribedDose: string;
  doseUnitCode: string;
  route: MedicationAdministrationRoute;
  frequencyCode: string;
  scheduledTimes?: readonly string[];
  prn?: boolean;
  prnIndication?: string | null;
  startAt: string;
  endAt?: string | null;
  orderedByUserId: string;
  orderedByStaffId: string;
}

export interface ChangeMedicationAdministrationScheduleStatusInput {
  expectedVersion: number;
  status: Extract<
    MedicationScheduleStatus,
    'ACTIVE' | 'HELD' | 'COMPLETED' | 'CANCELLED'
  >;
  reason?: string | null;
}

export interface RecordMedicationAdministrationInput {
  expectedScheduleVersion: number;
  scheduledAt: string;
  status: Extract<
    MedicationDoseStatus,
    'ADMINISTERED' | 'OMITTED' | 'REFUSED' | 'DELAYED' | 'CANCELLED'
  >;
  patientConfirmation: MedicationPatientConfirmationInput;
  medicationBarcode?: string | null;
  indicationConfirmed?: boolean;
  administeredDose?: string | null;
  administeredRoute?: MedicationAdministrationRoute | null;
  administeredAt?: string | null;
  varianceReason?: string | null;
  reasonCode?: string | null;
  reason?: string | null;
  notes?: string | null;
  delayedUntil?: string | null;
  independentDoubleCheck?: MedicationIndependentDoubleCheckInput | null;
}

export interface CorrectMedicationAdministrationInput {
  expectedAdministrationVersion: number;
  reason: string;
  replacement: Omit<
    RecordMedicationAdministrationInput,
    'expectedScheduleVersion'
  > & {
    expectedScheduleVersion: number;
  };
}

export interface EnterMedicationAdministrationInErrorInput {
  expectedAdministrationVersion: number;
  reason: string;
}

export interface MedicationDueBoardQuery {
  admissionId?: string;
  wardId?: string;
  dueUntil: string;
  includeHeld: boolean;
  page: number;
  pageSize: number;
}

export interface MedicationAdministrationHistoryQuery {
  admissionId: string;
  medicationScheduleId?: string;
  status?: MedicationDoseStatus;
  scheduledFrom?: string;
  scheduledTo?: string;
  page: number;
  pageSize: number;
}

export interface MedicationComplianceQuery {
  admissionId: string;
  from: string;
  to: string;
}

export interface MedicationOrderTrace {
  valid: boolean;
  prescriptionStatus: string | null;
  prescriptionItemStatus: string | null;
  highAlert: boolean;
  controlledMedicine: boolean;
  blockingReasons: readonly string[];
}

export interface MedicationScheduleView {
  id: string;
  scheduleNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  prescriptionId: string | null;
  prescriptionItemId: string | null;
  source: MedicationAdministrationSource;
  medicineId: string;
  formularyItemId: string | null;
  medicineDisplay: string;
  prescribedDose: string;
  doseUnitCode: string;
  route: MedicationAdministrationRoute;
  frequencyCode: string;
  scheduledTimes: readonly string[];
  prn: boolean;
  prnIndication: string | null;
  startAt: string;
  endAt: string | null;
  status: MedicationScheduleStatus;
  holdReason: string | null;
  lastAdministrationAt: string | null;
  nextScheduledAt: string | null;
  version: number;
}

export interface MedicationAdministrationView {
  id: string;
  administrationNumber: string;
  medicationScheduleId: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  medicineId: string;
  medicineDisplay: string;
  scheduledAt: string;
  status: MedicationDoseStatus;
  prescribedDose: string;
  administeredDose: string | null;
  doseUnitCode: string;
  prescribedRoute: MedicationAdministrationRoute;
  administeredRoute: MedicationAdministrationRoute | null;
  administeredAt: string | null;
  administeringNurseUserId: string | null;
  administeringNurseStaffId: string | null;
  reasonCode: string | null;
  delayedUntil: string | null;
  correctionOfAdministrationId: string | null;
  supersededByAdministrationId: string | null;
  version: number;
}

export interface MedicationDueBoardItem {
  medicationSchedule: MedicationScheduleView;
  scheduledAt: string;
  dueState:
    | 'UPCOMING'
    | 'DUE'
    | 'OVERDUE'
    | 'DELAYED_DUE'
    | 'HELD';
  recordedAdministration: MedicationAdministrationView | null;
  highAlert: boolean;
  controlledMedicine: boolean;
}

export interface MedicationAdministrationCommand<T> {
  actor: NursingMedicationActorContext;
  input: T;
  idempotencyKey: string;
}

export interface MedicationAdministrationEntityCommand<T>
  extends MedicationAdministrationCommand<T> {
  entityId: string;
}