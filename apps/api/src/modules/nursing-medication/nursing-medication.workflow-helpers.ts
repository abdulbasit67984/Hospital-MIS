import {
  NURSING_MEDICATION_LOCK_NAMESPACE,
} from './nursing-medication.transaction.constants.js';

import {
  nursingLockKey,
} from './nursing-medication.normalization.js';

import type {
  NursingAdmissionContext,
} from './nursing-medication.contracts.js';

import type {
  NursingAssessmentRecord,
  NursingCarePlanRecord,
  NursingTaskRecord,
} from './nursing-medication.persistence.types.js';

export function nursingAdmissionLockKeys(
  context: NursingAdmissionContext,
): string[] {
  return [
    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.ADMISSION,
      context.facilityId,
      context.admissionId,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.PATIENT_TIMELINE,
      context.facilityId,
      context.patient.patientId,
    ),
  ];
}

export function nursingAssessmentCreateLockKeys(
  context: NursingAdmissionContext,
  assessmentType: string,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.ASSESSMENT,
      context.facilityId,
      context.admissionId,
      assessmentType,
      'new',
    ),
  ];
}

export function nursingAssessmentMutationLockKeys(
  context: NursingAdmissionContext,
  assessment: Pick<NursingAssessmentRecord, '_id'>,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.ASSESSMENT,
      context.facilityId,
      assessment._id.toHexString(),
    ),
  ];
}

export function nursingCarePlanCreateLockKeys(
  context: NursingAdmissionContext,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.CARE_PLAN,
      context.facilityId,
      context.admissionId,
      'new',
    ),
  ];
}

export function nursingCarePlanMutationLockKeys(
  context: NursingAdmissionContext,
  carePlan: Pick<NursingCarePlanRecord, '_id'>,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.CARE_PLAN,
      context.facilityId,
      carePlan._id.toHexString(),
    ),
  ];
}

export function nursingTaskCreateLockKeys(
  context: NursingAdmissionContext,
  recurrenceKey: string | null | undefined,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.TASK,
      context.facilityId,
      context.admissionId,
      recurrenceKey ?? 'manual',
      'new',
    ),
  ];
}

export function nursingTaskMutationLockKeys(
  context: NursingAdmissionContext,
  task: Pick<NursingTaskRecord, '_id'>,
): string[] {
  return [
    ...nursingAdmissionLockKeys(
      context,
    ),

    nursingLockKey(
      NURSING_MEDICATION_LOCK_NAMESPACE.TASK,
      context.facilityId,
      task._id.toHexString(),
    ),
  ];
}

export function safeAssessmentJournalPayload(
  operation: string,
  input: Readonly<{
    context: NursingAdmissionContext;
    assessmentId?: string;
    assessmentType?: string;
    targetStatus?: string;
    expectedVersion?: number;
  }>,
): Record<string, unknown> {
  return {
    operation,
    admissionId:
      input.context.admissionId,
    patientId:
      input.context.patient.patientId,
    wardId:
      input.context.location.wardId,
    assessmentId:
      input.assessmentId,
    assessmentType:
      input.assessmentType,
    targetStatus:
      input.targetStatus,
    expectedVersion:
      input.expectedVersion,
  };
}

export function safeCarePlanJournalPayload(
  operation: string,
  input: Readonly<{
    context: NursingAdmissionContext;
    carePlanId?: string;
    targetStatus?: string;
    expectedVersion?: number;
    problemCount?: number;
  }>,
): Record<string, unknown> {
  return {
    operation,
    admissionId:
      input.context.admissionId,
    patientId:
      input.context.patient.patientId,
    wardId:
      input.context.location.wardId,
    carePlanId:
      input.carePlanId,
    targetStatus:
      input.targetStatus,
    expectedVersion:
      input.expectedVersion,
    problemCount:
      input.problemCount,
  };
}

export function safeTaskJournalPayload(
  operation: string,
  input: Readonly<{
    context: NursingAdmissionContext;
    taskId?: string;
    sourceType?: string;
    targetStatus?: string;
    expectedVersion?: number;
  }>,
): Record<string, unknown> {
  return {
    operation,
    admissionId:
      input.context.admissionId,
    patientId:
      input.context.patient.patientId,
    wardId:
      input.context.location.wardId,
    taskId:
      input.taskId,
    sourceType:
      input.sourceType,
    targetStatus:
      input.targetStatus,
    expectedVersion:
      input.expectedVersion,
  };
}

export function assessmentEventPayload(
  record: NursingAssessmentRecord,
): Record<string, unknown> {
  return {
    assessmentId:
      record._id.toHexString(),
    assessmentNumber:
      record.assessmentNumber,
    admissionId:
      record.admissionId.toHexString(),
    patientId:
      record.patientId.toHexString(),
    wardId:
      record.wardId.toHexString(),
    assessmentType:
      record.assessmentType,
    riskLevel:
      record.overallRiskLevel,
    requiresEscalation:
      record.requiresEscalation,
    status:
      record.status,
    revisionNumber:
      record.revisionNumber,
    assessedAt:
      record.assessedAt.toISOString(),
  };
}

export function carePlanEventPayload(
  record: NursingCarePlanRecord,
): Record<string, unknown> {
  return {
    carePlanId:
      record._id.toHexString(),
    carePlanNumber:
      record.carePlanNumber,
    admissionId:
      record.admissionId.toHexString(),
    patientId:
      record.patientId.toHexString(),
    wardId:
      record.wardId.toHexString(),
    status:
      record.status,
    revisionNumber:
      record.revisionNumber,
    problemCount:
      record.problems.length,
    nextReviewAt:
      record.nextReviewAt
        ?.toISOString() ?? null,
  };
}

export function taskEventPayload(
  record: NursingTaskRecord,
): Record<string, unknown> {
  return {
    taskId:
      record._id.toHexString(),
    taskNumber:
      record.taskNumber,
    admissionId:
      record.admissionId.toHexString(),
    patientId:
      record.patientId.toHexString(),
    wardId:
      record.wardId.toHexString(),
    sourceType:
      record.sourceType,
    priority:
      record.priority,
    status:
      record.status,
    dueAt:
      record.dueAt.toISOString(),
    assignedStaffId:
      record.assignedStaffId
        ?.toHexString() ?? null,
  };
}