import type {
  Types,
} from 'mongoose';

import type {
  DischargeDisposition,
  DischargeStatus,
  DischargeSummaryStatus,
} from '@hospital-mis/database';

import type {
  InpatientActorContext,
} from './inpatient.types.js';

export interface DischargeChecklistItemInput {
  code:
    string;

  label:
    string;

  status?:
    'PENDING' |
    'COMPLETED' |
    'NOT_APPLICABLE' |
    'BLOCKED';

  note?:
    string | null;
}

export interface MedicationReconciliationItemInput {
  medicineId?:
    string | null;

  medicineDisplay:
    string;

  action:
    'CONTINUE' |
    'STOP' |
    'CHANGE' |
    'NEW';

  dose?:
    string | null;

  doseUnitCode?:
    string | null;

  routeCode?:
    string | null;

  frequencyCode?:
    string | null;

  durationText?:
    string | null;

  instructions?:
    string | null;
}

export interface FollowUpInstructionInput {
  departmentId?:
    string | null;

  providerStaffId?:
    string | null;

  clinicName?:
    string | null;

  followUpAt?:
    string | null;

  instruction:
    string;
}

export interface InitiateDischargeInput {
  admissionId:
    string;

  expectedAdmissionVersion:
    number;

  checklist?:
    readonly DischargeChecklistItemInput[];
}

export interface UpdateDischargeReadinessInput {
  expectedDischargeVersion:
    number;

  checklist:
    readonly DischargeChecklistItemInput[];

  medicationReconciliationCompleted:
    boolean;

  medicationReconciliationItems:
    readonly MedicationReconciliationItemInput[];
}

export interface PrepareDischargeSummaryInput {
  expectedDischargeVersion:
    number;

  admissionReason:
    string;

  hospitalCourse:
    string;

  proceduresPerformed?:
    readonly string[];

  significantInvestigations?:
    readonly string[];

  diagnosisSnapshots:
    readonly {
      diagnosisId?:
        string | null;

      diagnosisCode:
        string;

      diagnosisSystem:
        string;

      diagnosisDisplay:
        string;

      primary?:
        boolean;
    }[];

  conditionAtDischarge:
    string;

  medicationReconciliationItems:
    readonly MedicationReconciliationItemInput[];

  followUpInstructions?:
    readonly FollowUpInstructionInput[];

  warningSigns?:
    readonly string[];

  patientInstructions:
    string;

  finalize?:
    boolean;
}

export interface ClinicallyClearDischargeInput {
  expectedDischargeVersion:
    number;

  expectedAdmissionVersion:
    number;

  disposition:
    DischargeDisposition;
}

export interface ConfirmFinancialClearanceInput {
  expectedDischargeVersion:
    number;

  expectedAdmissionVersion:
    number;

  financialClearanceReference:
    string;

  clearedAt?:
    string | null;
}

export interface CompleteDischargeInput {
  expectedDischargeVersion:
    number;

  expectedAdmissionVersion:
    number;

  expectedBedVersion?:
    number | null;

  expectedAssignmentVersion?:
    number | null;
}

export interface CancelDischargeInput {
  expectedDischargeVersion:
    number;

  expectedAdmissionVersion:
    number;

  reason:
    string;
}

export interface DischargeCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

export interface DischargeEntityCommand<T>
extends DischargeCommand<T> {
  dischargeId:
    string;
}

export interface DischargeRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  dischargeNumber:
    string;

  admissionId:
    Types.ObjectId;

  admissionNumberSnapshot:
    string;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  attendingConsultantUserId:
    Types.ObjectId;

  attendingConsultantStaffId:
    Types.ObjectId;

  initiatingDepartmentId:
    Types.ObjectId;

  status:
    DischargeStatus;

  disposition:
    DischargeDisposition | null;

  initiatedAt:
    Date;

  initiatedByUserId:
    Types.ObjectId;

  initiatedByStaffId:
    Types.ObjectId;

  clinicalClearanceAt:
    Date | null;

  clinicalClearanceByUserId:
    Types.ObjectId | null;

  clinicalClearanceByStaffId:
    Types.ObjectId | null;

  financialClearanceRequestedAt:
    Date | null;

  financialClearanceRequestId:
    string | null;

  financialClearanceReference:
    string | null;

  financiallyClearedAt:
    Date | null;

  financiallyClearedByUserId:
    Types.ObjectId | null;

  completedAt:
    Date | null;

  completedByUserId:
    Types.ObjectId | null;

  completedByStaffId:
    Types.ObjectId | null;

  cancelledAt:
    Date | null;

  cancelledByUserId:
    Types.ObjectId | null;

  cancelledByStaffId:
    Types.ObjectId | null;

  cancellationReason:
    string | null;

  checklist:
    Array<{
      code:
        string;

      label:
        string;

      status:
        'PENDING' |
        'COMPLETED' |
        'NOT_APPLICABLE' |
        'BLOCKED';

      completedAt:
        Date | null;

      completedByUserId:
        Types.ObjectId | null;

      completedByStaffId:
        Types.ObjectId | null;

      note:
        string | null;
    }>;

  medicationReconciliationCompleted:
    boolean;

  medicationReconciliationItems:
    Array<{
      medicineId:
        Types.ObjectId | null;

      medicineDisplay:
        string;

      action:
        'CONTINUE' |
        'STOP' |
        'CHANGE' |
        'NEW';

      dose:
        Types.Decimal128 | null;

      doseUnitCode:
        string | null;

      routeCode:
        string | null;

      frequencyCode:
        string | null;

      durationText:
        string | null;

      instructions:
        string | null;
    }>;

  dischargeSummaryId:
    Types.ObjectId | null;

  latestDischargeSummaryVersionId:
    Types.ObjectId | null;

  currentSummaryVersion:
    number;

  billingAccountReference:
    string | null;

  version:
    number;

  transactionId:
    string;

  correlationId:
    string;

  schemaVersion:
    number;

  createdBy:
    Types.ObjectId;

  updatedBy:
    Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface DischargeSummaryRecord {
  _id:
    Types.ObjectId;

  facilityId:
    Types.ObjectId;

  dischargeId:
    Types.ObjectId;

  admissionId:
    Types.ObjectId;

  patientId:
    Types.ObjectId;

  encounterId:
    Types.ObjectId;

  summaryNumber:
    string;

  versionNumber:
    number;

  previousVersionId:
    Types.ObjectId | null;

  status:
    DischargeSummaryStatus;

  snapshotHash:
    string;

  preparedAt:
    Date;

  preparedByUserId:
    Types.ObjectId;

  preparedByStaffId:
    Types.ObjectId;

  finalizedAt:
    Date | null;

  finalizedByUserId:
    Types.ObjectId | null;

  finalizedByStaffId:
    Types.ObjectId | null;

  version:
    number;
}

export interface DischargeRepositoryPort {
  createDischarge(
    input:
      Omit<
        DischargeRecord,
        '_id' |
        'createdAt' |
        'updatedAt'
      >,
  ): Promise<DischargeRecord>;

  findDischargeById(
    facilityId:
      string,

    dischargeId:
      string,
  ): Promise<DischargeRecord | null>;

  findActiveDischargeByAdmission(
    facilityId:
      string,

    admissionId:
      string,
  ): Promise<DischargeRecord | null>;

  updateDischarge(
    facilityId:
      string,

    dischargeId:
      string,

    expectedVersion:
      number,

    update:
      Record<string, unknown>,
  ): Promise<DischargeRecord | null>;

  createDischargeSummary(
    input:
      Record<string, unknown>,
  ): Promise<DischargeSummaryRecord>;

  findLatestDischargeSummary(
    facilityId:
      string,

    dischargeId:
      string,
  ): Promise<DischargeSummaryRecord | null>;
}

export interface FinancialDischargeClearanceRequest {
  idempotencyKey:
    string;

  facilityId:
    string;

  dischargeId:
    string;

  admissionId:
    string;

  patientId:
    string;

  billingAccountReference:
    string | null;

  correlationId:
    string;
}

export interface FinancialDischargeClearanceResult {
  requestId:
    string;

  status:
    'PENDING' |
    'CLEARED';

  clearanceReference:
    string | null;

  occurredAt:
    Date;
}

export interface FinancialDischargePort {
  requestFinancialClearance(
    input:
      FinancialDischargeClearanceRequest,
  ): Promise<FinancialDischargeClearanceResult>;
}