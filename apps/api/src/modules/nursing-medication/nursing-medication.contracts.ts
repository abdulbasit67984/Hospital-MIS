import type {
  AdmissionStatus,
  AllergySeverity,
  AllergyVerificationStatus,
  IntakeOutputCategory,
  IntakeOutputDirection,
  IntakeOutputEntryStatus,
  NursingAssessmentRiskLevel,
  NursingAssessmentStatus,
  NursingAssessmentType,
  NursingCarePlanGoalStatus,
  NursingCarePlanProblemStatus,
  NursingCarePlanStatus,
  NursingDeviceObservationType,
  NursingDeviceStatus,
  NursingDeviceType,
  NursingInterventionFrequencyType,
  NursingTaskPriority,
  NursingTaskSourceType,
  NursingTaskStatus,
  PatientAlertSeverity,
  PatientAlertType,
  WoundClassification,
} from '@hospital-mis/database';

import type {
  IntakeOutputSortField,
  NursingAssessmentSortField,
  NursingCarePlanSortField,
  NursingDeviceSortField,
  NursingTaskSortField,
} from './nursing-medication.constants.js';

export type NursingMedicationObjectIdString = string;

export type NursingMedicationSortDirection =
  | 'asc'
  | 'desc';

export interface NursingMedicationActorContext {
  userId: NursingMedicationObjectIdString;
  facilityId: NursingMedicationObjectIdString;
  correlationId: string;
  roleKeys: readonly string[];
  permissionKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface NursingAssessmentSectionInput {
  sectionCode: string;
  sectionLabel: string;
  values: Readonly<Record<string, unknown>>;
  narrative?: string | null;
  riskLevel?: NursingAssessmentRiskLevel;
  score?: string | null;
}

export interface CreateNursingAssessmentInput {
  admissionId: NursingMedicationObjectIdString;
  assessmentType: NursingAssessmentType;
  templateCode?: string | null;
  templateVersion?: number | null;
  sections: readonly NursingAssessmentSectionInput[];
  summary?: string | null;
  overallRiskLevel?: NursingAssessmentRiskLevel;
  requiresEscalation?: boolean;
  escalationReason?: string | null;
  assessedAt: string;
  backdatedEntryReason?: string | null;
}

export interface SignNursingAssessmentInput {
  expectedVersion: number;
}

export interface CorrectNursingAssessmentInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<
    CreateNursingAssessmentInput,
    'admissionId'
  >;
}

export interface MarkNursingAssessmentEnteredInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface NursingCarePlanGoalInput {
  goalId?: NursingMedicationObjectIdString;
  description: string;
  expectedOutcome: string;
  targetDate?: string | null;
  status?: NursingCarePlanGoalStatus;
  evaluation?: string | null;
}

export interface NursingInterventionFrequencyInput {
  type: NursingInterventionFrequencyType;
  intervalMinutes?: number | null;
  timesOfDay?: readonly string[];
  shiftCodes?: readonly string[];
  instruction?: string | null;
}

export interface NursingCarePlanInterventionInput {
  interventionId?: NursingMedicationObjectIdString;
  description: string;
  frequency: NursingInterventionFrequencyInput;
  assignedStaffId?:
    | NursingMedicationObjectIdString
    | null;
  assignedTeamCode?: string | null;
  startsAt: string;
  endsAt?: string | null;
  active?: boolean;
}

export interface NursingCarePlanProblemInput {
  problemId?: NursingMedicationObjectIdString;
  problemCode?: string | null;
  description: string;
  identifiedAt: string;
  sourceAssessmentId?:
    | NursingMedicationObjectIdString
    | null;
  status?: NursingCarePlanProblemStatus;
  goals?: readonly NursingCarePlanGoalInput[];
  interventions?:
    readonly NursingCarePlanInterventionInput[];
}

export interface CreateNursingCarePlanInput {
  admissionId: NursingMedicationObjectIdString;
  title: string;
  problems: readonly NursingCarePlanProblemInput[];
  assignedNurseStaffId?:
    | NursingMedicationObjectIdString
    | null;
  assignedTeamCode?: string | null;
  startedAt: string;
  targetCompletionAt?: string | null;
  nextReviewAt?: string | null;
}

export interface ReviewNursingCarePlanInput {
  expectedVersion: number;
  problems: readonly NursingCarePlanProblemInput[];
  outcomeEvaluation?: string | null;
  nextReviewAt?: string | null;
}

export interface CompleteNursingCarePlanInput {
  expectedVersion: number;
  outcomeEvaluation: string;
}

export interface CancelNursingCarePlanInput {
  expectedVersion: number;
  reason: string;
}

export interface CorrectNursingCarePlanInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<
    CreateNursingCarePlanInput,
    'admissionId'
  >;
}

export interface CreateNursingTaskInput {
  admissionId: NursingMedicationObjectIdString;
  sourceType: NursingTaskSourceType;
  sourceRecordId?:
    | NursingMedicationObjectIdString
    | null;
  carePlanId?:
    | NursingMedicationObjectIdString
    | null;
  carePlanInterventionId?:
    | NursingMedicationObjectIdString
    | null;
  title: string;
  instructions?: string | null;
  priority?: NursingTaskPriority;
  assignedStaffId?:
    | NursingMedicationObjectIdString
    | null;
  assignedTeamCode?: string | null;
  scheduledAt?: string | null;
  dueAt: string;
  recurrenceKey?: string | null;
}

export interface ChangeNursingTaskStatusInput {
  expectedVersion: number;
  status: Exclude<
    NursingTaskStatus,
    'PENDING'
  >;
  dispositionReasonCode?: string | null;
  dispositionReason?: string | null;
  delayedUntil?: string | null;
  escalatedToStaffId?:
    | NursingMedicationObjectIdString
    | null;
  escalationReason?: string | null;
}

export interface CarryForwardNursingTaskInput {
  expectedVersion: number;
  dueAt: string;
  assignedStaffId?:
    | NursingMedicationObjectIdString
    | null;
  assignedTeamCode?: string | null;
  reason: string;
}

export interface RecordIntakeOutputInput {
  admissionId: NursingMedicationObjectIdString;
  direction: IntakeOutputDirection;
  category: IntakeOutputCategory;
  sourceDescription?: string | null;
  quantity: string;
  unitCode: string;
  conversionFactorToMillilitres: string;
  occurredAt: string;
  shiftCode: string;
  backdatedEntryReason?: string | null;
}

export interface CorrectIntakeOutputInput {
  expectedVersion: number;
  reason: string;
  replacement: Omit<
    RecordIntakeOutputInput,
    'admissionId'
  >;
}

export interface MarkIntakeOutputEnteredInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface NursingWoundDetailsInput {
  classification: WoundClassification;
  anatomicalLocation?: string | null;
  stageOrGrade?: string | null;
  lengthCm?: string | null;
  widthCm?: string | null;
  depthCm?: string | null;
  dressingType?: string | null;
}

export interface CreateNursingDeviceInput {
  admissionId: NursingMedicationObjectIdString;
  deviceType: NursingDeviceType;
  deviceName: string;
  anatomicalSite: string;
  laterality?: string | null;
  woundDetails?:
    | NursingWoundDetailsInput
    | null;
  insertedAt?: string | null;
  insertedByStaffId?:
    | NursingMedicationObjectIdString
    | null;
  backdatedEntryReason?: string | null;
}

export interface RecordNursingDeviceObservationInput {
  observationType: NursingDeviceObservationType;
  observedAt: string;
  siteCondition?: string | null;
  dressingType?: string | null;
  outputMillilitres?: string | null;
  infectionIndicators?: readonly string[];
  findings?: Readonly<Record<string, unknown>>;
  narrative?: string | null;
  requiresEscalation?: boolean;
  escalationReason?: string | null;
  backdatedEntryReason?: string | null;
}

export interface RemoveNursingDeviceInput {
  expectedVersion: number;
  removedAt: string;
  reason: string;
}

export interface NursingAssessmentListQuery {
  page: number;
  pageSize: number;
  admissionId?: NursingMedicationObjectIdString;
  patientId?: NursingMedicationObjectIdString;
  wardId?: NursingMedicationObjectIdString;
  assessmentType?: NursingAssessmentType;
  status?: NursingAssessmentStatus;
  riskLevel?: NursingAssessmentRiskLevel;
  assessedFrom?: string;
  assessedTo?: string;
  sortBy: NursingAssessmentSortField;
  sortDirection: NursingMedicationSortDirection;
}

export interface NursingCarePlanListQuery {
  page: number;
  pageSize: number;
  admissionId?: NursingMedicationObjectIdString;
  patientId?: NursingMedicationObjectIdString;
  wardId?: NursingMedicationObjectIdString;
  assignedNurseStaffId?:
    NursingMedicationObjectIdString;
  status?: NursingCarePlanStatus;
  reviewDueBefore?: string;
  sortBy: NursingCarePlanSortField;
  sortDirection: NursingMedicationSortDirection;
}

export interface NursingTaskListQuery {
  page: number;
  pageSize: number;
  admissionId?: NursingMedicationObjectIdString;
  patientId?: NursingMedicationObjectIdString;
  wardId?: NursingMedicationObjectIdString;
  assignedStaffId?: NursingMedicationObjectIdString;
  sourceType?: NursingTaskSourceType;
  status?: NursingTaskStatus;
  priority?: NursingTaskPriority;
  dueFrom?: string;
  dueTo?: string;
  overdueAt?: string;
  sortBy: NursingTaskSortField;
  sortDirection: NursingMedicationSortDirection;
}

export interface IntakeOutputListQuery {
  page: number;
  pageSize: number;
  admissionId?: NursingMedicationObjectIdString;
  patientId?: NursingMedicationObjectIdString;
  wardId?: NursingMedicationObjectIdString;
  shiftCode?: string;
  direction?: IntakeOutputDirection;
  category?: IntakeOutputCategory;
  status?: IntakeOutputEntryStatus;
  occurredFrom?: string;
  occurredTo?: string;
  sortBy: IntakeOutputSortField;
  sortDirection: NursingMedicationSortDirection;
}

export interface NursingDeviceListQuery {
  page: number;
  pageSize: number;
  admissionId?: NursingMedicationObjectIdString;
  patientId?: NursingMedicationObjectIdString;
  wardId?: NursingMedicationObjectIdString;
  deviceType?: NursingDeviceType;
  status?: NursingDeviceStatus;
  sortBy: NursingDeviceSortField;
  sortDirection: NursingMedicationSortDirection;
}

export interface NursingPatientIdentityContext {
  patientId: NursingMedicationObjectIdString;
  displayName: string;
  mrn: string | null;
  birthDate: string | null;
  estimatedAgeYears: number | null;
  sexAtBirth: string;
}

export interface NursingPatientAlertContext {
  alertId: NursingMedicationObjectIdString;
  alertType: PatientAlertType;
  severity: PatientAlertSeverity;
  title: string;
  details: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface NursingPatientAllergyContext {
  patientAllergyId: NursingMedicationObjectIdString;
  allergenText: string;
  category: string;
  severity: AllergySeverity;
  verificationStatus:
    AllergyVerificationStatus;
  reactions: readonly string[];
}

export interface NursingLocationContext {
  wardId: NursingMedicationObjectIdString;
  wardCode: string;
  wardName: string;
  wardType: string;
  nursingStationCode: string | null;
  departmentId: NursingMedicationObjectIdString;
  roomId:
    | NursingMedicationObjectIdString
    | null;
  roomNumber: string | null;
  roomName: string | null;
  bedId:
    | NursingMedicationObjectIdString
    | null;
  bedNumber: string | null;
  bedLabel: string | null;
  bedCategory: string | null;
}

export interface NursingCareTeamMemberContext {
  staffId: NursingMedicationObjectIdString;
  userId:
    | NursingMedicationObjectIdString
    | null;
  role: string;
  startedAt: string;
  endedAt: string | null;
}

export interface NursingAdmissionContext {
  facilityId: NursingMedicationObjectIdString;
  admissionId: NursingMedicationObjectIdString;
  admissionNumber: string;
  admissionStatus: AdmissionStatus;
  isActive: boolean;
  encounterId: NursingMedicationObjectIdString;
  admittedAt: string | null;
  clinicallyDischargedAt: string | null;
  dischargedAt: string | null;
  attendingConsultantUserId:
    NursingMedicationObjectIdString;
  attendingConsultantStaffId:
    NursingMedicationObjectIdString;
  careTeam:
    readonly NursingCareTeamMemberContext[];
  patient: NursingPatientIdentityContext;
  location: NursingLocationContext;
  alerts:
    readonly NursingPatientAlertContext[];
  allergies:
    readonly NursingPatientAllergyContext[];
}

export interface NursingMedicationCommand<T> {
  actor: NursingMedicationActorContext;
  input: T;
  idempotencyKey: string;
}

export interface NursingMedicationEntityCommand<T>
extends NursingMedicationCommand<T> {
  entityId: NursingMedicationObjectIdString;
}