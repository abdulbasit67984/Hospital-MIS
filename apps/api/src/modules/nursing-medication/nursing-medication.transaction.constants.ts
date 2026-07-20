export const NURSING_MEDICATION_TRANSACTION_TYPES = {
  CREATE_ASSESSMENT:
    'NURSING_ASSESSMENT_CREATE',

  SIGN_ASSESSMENT:
    'NURSING_ASSESSMENT_SIGN',

  CORRECT_ASSESSMENT:
    'NURSING_ASSESSMENT_CORRECT',

  MARK_ASSESSMENT_ENTERED_IN_ERROR:
    'NURSING_ASSESSMENT_ENTERED_IN_ERROR',

  CREATE_CARE_PLAN:
    'NURSING_CARE_PLAN_CREATE',

  REVIEW_CARE_PLAN:
    'NURSING_CARE_PLAN_REVIEW',

  COMPLETE_CARE_PLAN:
    'NURSING_CARE_PLAN_COMPLETE',

  CANCEL_CARE_PLAN:
    'NURSING_CARE_PLAN_CANCEL',

  CORRECT_CARE_PLAN:
    'NURSING_CARE_PLAN_CORRECT',

  CREATE_TASK:
    'NURSING_TASK_CREATE',

  CHANGE_TASK_STATUS:
    'NURSING_TASK_STATUS_CHANGE',

  CARRY_FORWARD_TASK:
    'NURSING_TASK_CARRY_FORWARD',
} as const;

export const NURSING_MEDICATION_TRANSACTION_STATES = {
  CONTEXT_RESOLVED:
    'CONTEXT_RESOLVED',

  ACCESS_AUTHORIZED:
    'ACCESS_AUTHORIZED',

  LIFECYCLE_VALIDATED:
    'LIFECYCLE_VALIDATED',

  NUMBER_ALLOCATED:
    'NUMBER_ALLOCATED',

  CURRENT_PROJECTION_CREATED:
    'CURRENT_PROJECTION_CREATED',

  CURRENT_PROJECTION_UPDATED:
    'CURRENT_PROJECTION_UPDATED',

  IMMUTABLE_VERSION_APPENDED:
    'IMMUTABLE_VERSION_APPENDED',

  COMPENSATION_REGISTERED:
    'COMPENSATION_REGISTERED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',
} as const;

export const NURSING_MEDICATION_AUDIT_ACTIONS = {
  ASSESSMENT_CREATED:
    'nursing.assessment.created',

  ASSESSMENT_SIGNED:
    'nursing.assessment.signed',

  ASSESSMENT_CORRECTED:
    'nursing.assessment.corrected',

  ASSESSMENT_ENTERED_IN_ERROR:
    'nursing.assessment.entered_in_error',

  CARE_PLAN_CREATED:
    'nursing.care_plan.created',

  CARE_PLAN_REVIEWED:
    'nursing.care_plan.reviewed',

  CARE_PLAN_COMPLETED:
    'nursing.care_plan.completed',

  CARE_PLAN_CANCELLED:
    'nursing.care_plan.cancelled',

  CARE_PLAN_CORRECTED:
    'nursing.care_plan.corrected',

  TASK_CREATED:
    'nursing.task.created',

  TASK_STATUS_CHANGED:
    'nursing.task.status_changed',

  TASK_CARRIED_FORWARD:
    'nursing.task.carried_forward',
} as const;

export const NURSING_MEDICATION_OUTBOX_EVENTS = {
  ASSESSMENT_CREATED:
    'nursing.assessment.created.v1',

  ASSESSMENT_SIGNED:
    'nursing.assessment.signed.v1',

  ASSESSMENT_CORRECTED:
    'nursing.assessment.corrected.v1',

  ASSESSMENT_ENTERED_IN_ERROR:
    'nursing.assessment.entered_in_error.v1',

  CARE_PLAN_CREATED:
    'nursing.care_plan.created.v1',

  CARE_PLAN_REVIEWED:
    'nursing.care_plan.reviewed.v1',

  CARE_PLAN_COMPLETED:
    'nursing.care_plan.completed.v1',

  CARE_PLAN_CANCELLED:
    'nursing.care_plan.cancelled.v1',

  CARE_PLAN_CORRECTED:
    'nursing.care_plan.corrected.v1',

  TASK_CREATED:
    'nursing.task.created.v1',

  TASK_STATUS_CHANGED:
    'nursing.task.status_changed.v1',

  TASK_CARRIED_FORWARD:
    'nursing.task.carried_forward.v1',
} as const;

export const NURSING_MEDICATION_REALTIME_EVENTS = {
  WORKSPACE_CHANGED:
    'nursing.workspace.changed',

  ASSESSMENT_WORKLIST_CHANGED:
    'nursing.assessment_worklist.changed',

  CARE_PLAN_WORKLIST_CHANGED:
    'nursing.care_plan_worklist.changed',

  TASK_WORKLIST_CHANGED:
    'nursing.task_worklist.changed',

  PATIENT_TIMELINE_CHANGED:
    'clinical.patient_nursing_timeline.changed',
} as const;

export const NURSING_MEDICATION_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD:
    'nursing.record.delete_created',

  RESTORE_ENCRYPTED_RECORD:
    'nursing.record.restore_encrypted',
} as const;

export const NURSING_MEDICATION_COMPENSATABLE_COLLECTIONS = [
  'nursingAssessments',
  'nursingAssessmentVersions',
  'nursingCarePlans',
  'nursingCarePlanVersions',
  'nursingTasks',
] as const;

export type NursingMedicationCompensatableCollection =
  (typeof NURSING_MEDICATION_COMPENSATABLE_COLLECTIONS)[number];

export const NURSING_MEDICATION_LOCK_NAMESPACE = {
  ADMISSION:
    'nursing:admission',

  PATIENT_TIMELINE:
    'nursing:patient_timeline',

  ASSESSMENT:
    'nursing:assessment',

  CARE_PLAN:
    'nursing:care_plan',

  TASK:
    'nursing:task',
} as const;