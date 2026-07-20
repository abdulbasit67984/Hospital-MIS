import type {
  AdmissionStatus,
  IntakeOutputEntryStatus,
  NursingAssessmentStatus,
  NursingCarePlanStatus,
  NursingDeviceStatus,
  NursingTaskStatus,
  PatientAlertSeverity,
  PatientAlertType,
} from '@hospital-mis/database';

import type {
  IntakeOutputListQuery,
  NursingAdmissionContext,
  NursingAssessmentListQuery,
  NursingCarePlanListQuery,
  NursingDeviceListQuery,
  NursingMedicationActorContext,
  NursingTaskListQuery,
} from './nursing-medication.contracts.js';

import type {
  IntakeOutputEntryRecord,
  NursingAssessmentRecord,
  NursingAssessmentVersionRecord,
  NursingCarePlanRecord,
  NursingCarePlanVersionRecord,
  NursingDeviceObservationRecord,
  NursingDeviceRecord,
  NursingTaskRecord,
} from './nursing-medication.persistence.types.js';

export type NursingAssessmentPersistenceUpdate =
  Partial<
    Pick<
      NursingAssessmentRecord,
      | 'status'
      | 'signedAt'
      | 'signedByUserId'
      | 'signedByStaffId'
      | 'supersededByAssessmentId'
      | 'correctionReason'
      | 'enteredInErrorAt'
      | 'enteredInErrorByUserId'
      | 'enteredInErrorByStaffId'
      | 'enteredInErrorReason'
      | 'updatedBy'
    >
  >;

export type NursingCarePlanPersistenceUpdate =
  Partial<
    Pick<
      NursingCarePlanRecord,
      | 'status'
      | 'problems'
      | 'assignedNurseStaffId'
      | 'assignedTeamCode'
      | 'targetCompletionAt'
      | 'nextReviewAt'
      | 'lastReviewedAt'
      | 'lastReviewedByStaffId'
      | 'outcomeEvaluation'
      | 'completedAt'
      | 'completedByStaffId'
      | 'cancellationReason'
      | 'revisionNumber'
      | 'supersededByCarePlanId'
      | 'correctionReason'
      | 'updatedBy'
    >
  >;

export type NursingTaskPersistenceUpdate =
  Partial<
    Pick<
      NursingTaskRecord,
      | 'status'
      | 'assignedStaffId'
      | 'assignedTeamCode'
      | 'dueAt'
      | 'carriedForwardToTaskId'
      | 'startedAt'
      | 'completedAt'
      | 'completedByUserId'
      | 'completedByStaffId'
      | 'dispositionReasonCode'
      | 'dispositionReason'
      | 'escalatedAt'
      | 'escalatedToStaffId'
      | 'escalationReason'
      | 'updatedBy'
    >
  >;

export type IntakeOutputPersistenceUpdate =
  Partial<
    Pick<
      IntakeOutputEntryRecord,
      | 'status'
      | 'supersededByEntryId'
      | 'correctionReason'
      | 'enteredInErrorAt'
      | 'enteredInErrorByUserId'
      | 'enteredInErrorByStaffId'
      | 'enteredInErrorReason'
      | 'updatedBy'
    >
  >;

export type NursingDevicePersistenceUpdate =
  Partial<
    Pick<
      NursingDeviceRecord,
      | 'status'
      | 'removedAt'
      | 'removedByStaffId'
      | 'removalReason'
      | 'updatedBy'
    >
  >;

export interface NursingContextActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'LOCKED'
    | 'SUSPENDED'
    | 'DISABLED';
}

export interface NursingContextStaffRecord {
  staffId: string;
  facilityId: string;
  departmentId: string | null;
  displayName: string;
  professionalType: string | null;
  employmentStatus:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ON_LEAVE'
    | 'SUSPENDED'
    | 'TERMINATED';
  isClinical: boolean;
  isActive: boolean;
}

export interface NursingContextAdmissionRecord {
  facilityId: string;
  admissionId: string;
  admissionNumber: string;
  patientId: string;
  encounterId: string;
  admittingDepartmentId: string;
  status: AdmissionStatus;
  isActive: boolean;
  admittedAt: Date | null;
  clinicallyDischargedAt: Date | null;
  dischargedAt: Date | null;
  attendingConsultantUserId: string;
  attendingConsultantStaffId: string;
  currentWardId: string | null;
  currentRoomId: string | null;
  currentBedId: string | null;
  careTeam: readonly {
    staffId: string;
    userId: string | null;
    role: string;
    startedAt: Date;
    endedAt: Date | null;
  }[];
}

export interface NursingContextLocationAssignmentRecord {
  wardId: string;
  roomId: string;
  bedId: string;
}

export interface NursingContextPatientRecord {
  patientId: string;
  facilityId: string;
  displayName: string;
  birthDate: Date | null;
  estimatedAgeYears: number | null;
  sexAtBirth: string;
  status: string;
}

export interface NursingContextAlertRecord {
  alertId: string;
  alertType: PatientAlertType;
  severity: PatientAlertSeverity;
  title: string;
  details: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface NursingContextAllergyRecord {
  patientAllergyId: string;
  allergenText: string;
  category: string;
  severity: string;
  verificationStatus: string;
  reactions: readonly string[];
}

export interface NursingContextWardRecord {
  wardId: string;
  facilityId: string;
  wardCode: string;
  name: string;
  wardType: string;
  departmentId: string;
  nursingStationCode: string | null;
  status: string;
}

export interface NursingContextRoomRecord {
  roomId: string;
  facilityId: string;
  wardId: string;
  roomNumber: string;
  name: string;
  status: string;
}

export interface NursingContextBedRecord {
  bedId: string;
  facilityId: string;
  wardId: string;
  roomId: string;
  bedNumber: string;
  label: string;
  bedCategory: string;
  operationalStatus: string;
  currentAdmissionId: string | null;
  currentPatientId: string | null;
}

export interface NursingMedicationContextRepositoryPort {
  findActorIdentity(
    userId: string,
  ): Promise<
    NursingContextActorIdentityRecord | null
  >;

  findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<NursingContextStaffRecord | null>;

  findAdmission(
    facilityId: string,
    admissionId: string,
  ): Promise<
    NursingContextAdmissionRecord | null
  >;

  findPatient(
    facilityId: string,
    patientId: string,
  ): Promise<
    NursingContextPatientRecord | null
  >;

  findLatestLocationAssignment(
    facilityId: string,
    admissionId: string,
  ): Promise<
    NursingContextLocationAssignmentRecord | null
  >;

  findPrimaryMrn(
    facilityId: string,
    patientId: string,
  ): Promise<string | null>;

  listActiveAlerts(
    facilityId: string,
    patientId: string,
    at: Date,
  ): Promise<NursingContextAlertRecord[]>;

  listActiveAllergies(
    facilityId: string,
    patientId: string,
  ): Promise<NursingContextAllergyRecord[]>;

  findWard(
    facilityId: string,
    wardId: string,
  ): Promise<NursingContextWardRecord | null>;

  findRoom(
    facilityId: string,
    roomId: string,
  ): Promise<NursingContextRoomRecord | null>;

  findBed(
    facilityId: string,
    bedId: string,
  ): Promise<NursingContextBedRecord | null>;
}

export interface NursingMedicationContextPort {
  requireActiveActorStaffId(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<string>;

  resolveAdmission(
    actor: NursingMedicationActorContext,
    admissionId: string,
  ): Promise<NursingAdmissionContext>;
}

export interface NursingAssessmentRepositoryPort {
  create(
    input: Omit<
      NursingAssessmentRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingAssessmentRecord>;

  findById(
    facilityId: string,
    assessmentId: string,
  ): Promise<NursingAssessmentRecord | null>;

  list(
    facilityId: string,
    query: NursingAssessmentListQuery,
  ): Promise<{
    items: NursingAssessmentRecord[];
    total: number;
  }>;

  update(
    facilityId: string,
    assessmentId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingAssessmentStatus[],
    update: NursingAssessmentPersistenceUpdate,
  ): Promise<NursingAssessmentRecord | null>;

  createVersion(
    input: Omit<
      NursingAssessmentVersionRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingAssessmentVersionRecord>;
}

export interface NursingCareRepositoryPort {
  createCarePlan(
    input: Omit<
      NursingCarePlanRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingCarePlanRecord>;

  findCarePlanById(
    facilityId: string,
    carePlanId: string,
  ): Promise<NursingCarePlanRecord | null>;

  listCarePlans(
    facilityId: string,
    query: NursingCarePlanListQuery,
  ): Promise<{
    items: NursingCarePlanRecord[];
    total: number;
  }>;

  updateCarePlan(
    facilityId: string,
    carePlanId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingCarePlanStatus[],
    update: NursingCarePlanPersistenceUpdate,
  ): Promise<NursingCarePlanRecord | null>;

  createCarePlanVersion(
    input: Omit<
      NursingCarePlanVersionRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingCarePlanVersionRecord>;

  createTask(
    input: Omit<
      NursingTaskRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingTaskRecord>;

  findTaskById(
    facilityId: string,
    taskId: string,
  ): Promise<NursingTaskRecord | null>;

  listTasks(
    facilityId: string,
    query: NursingTaskListQuery,
  ): Promise<{
    items: NursingTaskRecord[];
    total: number;
  }>;

  updateTask(
    facilityId: string,
    taskId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingTaskStatus[],
    update: NursingTaskPersistenceUpdate,
  ): Promise<NursingTaskRecord | null>;
}

export interface NursingObservationRepositoryPort {
  createIntakeOutput(
    input: Omit<
      IntakeOutputEntryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<IntakeOutputEntryRecord>;

  findIntakeOutputById(
    facilityId: string,
    entryId: string,
  ): Promise<IntakeOutputEntryRecord | null>;

  listIntakeOutput(
    facilityId: string,
    query: IntakeOutputListQuery,
  ): Promise<{
    items: IntakeOutputEntryRecord[];
    total: number;
  }>;

  updateIntakeOutput(
    facilityId: string,
    entryId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly IntakeOutputEntryStatus[],
    update: IntakeOutputPersistenceUpdate,
  ): Promise<IntakeOutputEntryRecord | null>;

  calculateFluidBalance(
    facilityId: string,
    admissionId: string,
    from: Date,
    to: Date,
  ): Promise<{
    intakeMillilitres: string;
    outputMillilitres: string;
    balanceMillilitres: string;
  }>;

  createDevice(
    input: Omit<
      NursingDeviceRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingDeviceRecord>;

  findDeviceById(
    facilityId: string,
    deviceId: string,
  ): Promise<NursingDeviceRecord | null>;

  listDevices(
    facilityId: string,
    query: NursingDeviceListQuery,
  ): Promise<{
    items: NursingDeviceRecord[];
    total: number;
  }>;

  updateDevice(
    facilityId: string,
    deviceId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingDeviceStatus[],
    update: NursingDevicePersistenceUpdate,
  ): Promise<NursingDeviceRecord | null>;

  createDeviceObservation(
    input: Omit<
      NursingDeviceObservationRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingDeviceObservationRecord>;

  listDeviceObservations(
    facilityId: string,
    deviceId: string,
  ): Promise<NursingDeviceObservationRecord[]>;
}

export type NursingAccessAction =
  | 'WORKSPACE_READ'
  | 'ASSESSMENT_CREATE'
  | 'ASSESSMENT_SIGN'
  | 'ASSESSMENT_CORRECT'
  | 'CARE_PLAN_READ'
  | 'CARE_PLAN_MANAGE'
  | 'CARE_PLAN_CORRECT'
  | 'TASK_READ'
  | 'TASK_MANAGE'
  | 'INTAKE_OUTPUT_READ'
  | 'INTAKE_OUTPUT_RECORD'
  | 'INTAKE_OUTPUT_CORRECT'
  | 'DEVICE_READ'
  | 'DEVICE_RECORD'
  | 'DEVICE_CORRECT'
  | 'VITAL_READ'
  | 'VITAL_RECORD'
  | 'VITAL_CORRECT'
  | 'NOTE_READ'
  | 'NOTE_CREATE'
  | 'NOTE_CORRECT'
  | 'MEDICATION_SCHEDULE_READ'
  | 'MEDICATION_ADMINISTER'
  | 'MEDICATION_CORRECT'
  | 'MEDICATION_WITNESS'
  | 'HANDOVER_READ'
  | 'HANDOVER_MANAGE'
  | 'REPORT_READ';

export type NursingAccessMode =
  | 'WARD_ASSIGNED'
  | 'CARE_TEAM'
  | 'MEDICAL_RECORDS'
  | 'BREAK_GLASS'
  | 'DENIED';

export interface NursingAccessDecision {
  allowed: boolean;
  accessMode: NursingAccessMode;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface NursingAccessRequest {
  action: NursingAccessAction;
  actor: NursingMedicationActorContext;
  context: NursingAdmissionContext;
}

export interface NursingAccessPolicyPort {
  authorize(
    request: NursingAccessRequest,
  ): Promise<NursingAccessDecision>;
}

export interface NursingClockPort {
  now(): Date;
}