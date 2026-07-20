import type {
  MedicationAdministrationRoute,
  MedicationAdministrationSource,
  MedicationDoseStatus,
  MedicationScheduleStatus,
} from '@hospital-mis/database';

import type {
  NursingMedicationActorContext,
} from './nursing-medication.contracts.js';

export const medicationWitnessRequirementValues = [
  'NOT_REQUIRED',
  'REQUIRED',
  'SATISFIED',
] as const;

export const medicationSafetyCheckStatusValues = [
  'PASSED',
  'WARNING_ACKNOWLEDGED',
  'BLOCKED',
] as const;

export const medicationAdministrationRiskValues = [
  'STANDARD',
  'HIGH_ALERT',
  'CONTROLLED',
  'CYTOTOXIC',
  'INSULIN',
  'ANTICOAGULANT',
] as const;

export type MedicationWitnessRequirement =
  (typeof medicationWitnessRequirementValues)[number];

export type MedicationSafetyCheckStatus =
  (typeof medicationSafetyCheckStatusValues)[number];

export type MedicationAdministrationRisk =
  (typeof medicationAdministrationRiskValues)[number];

export interface NursingMarActorContext
extends NursingMedicationActorContext {
  staffId?: string;
}

export interface NursingMedicationScheduleView {
  id: string;
  scheduleNumber: string;
  facilityId: string;
  admissionId: string;
  patientId: string;
  encounterId: string;
  wardId: string;
  roomId: string | null;
  bedId: string | null;
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
  orderedByUserId: string;
  orderedByStaffId: string;
  lastAdministrationAt: string | null;
  nextScheduledAt: string | null;
  version: number;
}

export interface NursingMedicationAdministrationView {
  id: string;
  administrationNumber: string;
  facilityId: string;
  admissionId: string;
  patientId: string;
  encounterId: string;
  wardId: string;
  roomId: string | null;
  bedId: string | null;
  medicationScheduleId: string;
  prescriptionId: string | null;
  prescriptionItemId: string | null;
  medicineId: string;
  medicineDisplaySnapshot: string;
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
  reason: string | null;
  notes: string | null;
  delayedUntil: string | null;
  statusChangedAt: string;
  statusChangedBy: string;
  correctionOfAdministrationId: string | null;
  supersededByAdministrationId: string | null;
  version: number;
}

export interface MedicationSafetyCheckInput {
  scannedPatientIdentifier?: string | null;
  scannedMedicineIdentifier?: string | null;
  confirmedPatientId: string;
  confirmedMedicineId: string;
  confirmedDose: string;
  confirmedDoseUnitCode: string;
  confirmedRoute: MedicationAdministrationRoute;
  confirmedScheduledAt: string;
  allergyOverrideReason?: string | null;
  timingOverrideReason?: string | null;
  doseOverrideReason?: string | null;
  routeOverrideReason?: string | null;
}

export interface MedicationWitnessInput {
  witnessUserId: string;
  witnessStaffId: string;
  witnessedAt: string;
  witnessStatement: string;
}

export interface AdministerScheduledMedicationInput {
  expectedScheduleVersion: number;
  scheduledAt: string;
  administeredDose: string;
  administeredRoute: MedicationAdministrationRoute;
  administeredAt?: string | null;
  notes?: string | null;
  safetyCheck: MedicationSafetyCheckInput;
  risk?: MedicationAdministrationRisk;
  witness?: MedicationWitnessInput | null;
}

export interface RecordMedicationExceptionInput {
  expectedScheduleVersion: number;
  scheduledAt: string;

  status: Extract<
    MedicationDoseStatus,
    | 'OMITTED'
    | 'REFUSED'
    | 'DELAYED'
    | 'CANCELLED'
  >;

  reasonCode: string;
  reason: string;
  delayedUntil?: string | null;
  notes?: string | null;
}

export interface CorrectMedicationAdministrationInput {
  expectedAdministrationVersion: number;
  reason: string;

  replacement:
    | AdministerScheduledMedicationInput
    | RecordMedicationExceptionInput;
}

export interface MarkMedicationAdministrationEnteredInErrorInput {
  expectedAdministrationVersion: number;
  reason: string;
}

export interface UpdateMedicationScheduleStatusInput {
  expectedVersion: number;

  status: Extract<
    MedicationScheduleStatus,
    | 'ACTIVE'
    | 'HELD'
    | 'COMPLETED'
    | 'CANCELLED'
  >;

  reason?: string | null;
}

export interface RecordPrnEffectivenessInput {
  expectedAdministrationVersion: number;
  assessedAt: string;

  effectiveness:
    | 'EFFECTIVE'
    | 'PARTIALLY_EFFECTIVE'
    | 'INEFFECTIVE'
    | 'NOT_ASSESSABLE';

  response: string;
  followUpRequired?: boolean;
  followUpDueAt?: string | null;
}

export interface NursingMarWorklistQuery {
  admissionId?: string;
  patientId?: string;
  wardId?: string;
  status?: MedicationScheduleStatus;
  dueFrom?: string;
  dueTo?: string;
  overdueAt?: string;
  includePrn?: boolean;
  page: number;
  pageSize: number;
}

export interface NursingMarAdministrationQuery {
  admissionId: string;
  medicationScheduleId?: string;
  medicineId?: string;
  status?: MedicationDoseStatus;
  scheduledFrom?: string;
  scheduledTo?: string;
  page: number;
  pageSize: number;
}

export interface MedicationComplianceSummary {
  admissionId: string;
  from: string;
  to: string;
  administered: number;
  omitted: number;
  refused: number;
  delayed: number;
  cancelled: number;
  totalFinalized: number;
  compliancePercent: string;
}

export interface NursingMarCommand<T> {
  actor: NursingMarActorContext;
  idempotencyKey: string;
  input: T;
}

export interface NursingMarEntityCommand<T>
extends NursingMarCommand<T> {
  entityId: string;
}