import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const NURSING_MEDICATION_PERMISSION_KEYS = {
  WORKSPACE_READ: 'nursing.read',
  ASSESSMENT_CREATE: 'nursing.notes.create',
  ASSESSMENT_SIGN: 'nursing.notes.create',
  ASSESSMENT_CORRECT: 'nursing.notes.amend',
  CARE_PLAN_READ: 'nursing.read',
  CARE_PLAN_MANAGE: 'nursing.notes.create',
  CARE_PLAN_CORRECT: 'nursing.notes.amend',
  TASK_READ: 'nursing.read',
  TASK_MANAGE: 'nursing.notes.create',
  INTAKE_OUTPUT_READ: 'nursing.read',
  INTAKE_OUTPUT_RECORD: 'nursing.notes.create',
  INTAKE_OUTPUT_CORRECT: 'nursing.notes.amend',
  DEVICE_READ: 'nursing.read',
  DEVICE_RECORD: 'nursing.notes.create',
  DEVICE_CORRECT: 'nursing.notes.amend',
  VITAL_READ: 'nursing.read',
  VITAL_RECORD: 'nursing.vitals.create',
  VITAL_CORRECT: 'nursing.vitals.amend',
  NOTE_READ: 'nursing.read',
  NOTE_CREATE: 'nursing.notes.create',
  NOTE_CORRECT: 'nursing.notes.amend',
  MEDICATION_SCHEDULE_READ: 'nursing.read',
  MEDICATION_ADMINISTER: 'nursing.medication_administer',
  MEDICATION_CORRECT: 'nursing.medication_administer',
  MEDICATION_WITNESS: 'nursing.medication_administer',
  HANDOVER_READ: 'nursing.read',
  HANDOVER_MANAGE: 'nursing.handover.manage',
  REPORT_READ: 'reports.clinical.read',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE = {
  ASSESSMENT: 'nursing.assessment.number',
  CARE_PLAN: 'nursing.care_plan.number',
  TASK: 'nursing.task.number',
  INTAKE_OUTPUT: 'nursing.intake_output.number',
  DEVICE: 'nursing.device.number',
  DEVICE_OBSERVATION: 'nursing.device_observation.number',
} as const;

export const DEFAULT_NURSING_MEDICATION_PAGE_SIZE = 25;

export const MAX_NURSING_MEDICATION_PAGE_SIZE = 100;

export const DEFAULT_NURSING_MEDICATION_NUMBER_WIDTH = 7;

export const NURSING_BACKDATE_REASON_THRESHOLD_MINUTES = 15;

export const NURSING_ASSESSMENT_SORT_FIELDS = [
  'assessedAt',
  'recordedAt',
  'assessmentType',
  'status',
  'createdAt',
] as const;

export const NURSING_CARE_PLAN_SORT_FIELDS = [
  'startedAt',
  'nextReviewAt',
  'status',
  'createdAt',
] as const;

export const NURSING_TASK_SORT_FIELDS = [
  'dueAt',
  'priority',
  'status',
  'createdAt',
] as const;

export const INTAKE_OUTPUT_SORT_FIELDS = [
  'occurredAt',
  'recordedAt',
  'direction',
  'category',
  'createdAt',
] as const;

export const NURSING_DEVICE_SORT_FIELDS = [
  'deviceType',
  'status',
  'insertedAt',
  'createdAt',
] as const;

export type NursingAssessmentSortField =
  (typeof NURSING_ASSESSMENT_SORT_FIELDS)[number];

export type NursingCarePlanSortField =
  (typeof NURSING_CARE_PLAN_SORT_FIELDS)[number];

export type NursingTaskSortField =
  (typeof NURSING_TASK_SORT_FIELDS)[number];

export type IntakeOutputSortField =
  (typeof INTAKE_OUTPUT_SORT_FIELDS)[number];

export type NursingDeviceSortField =
  (typeof NURSING_DEVICE_SORT_FIELDS)[number];