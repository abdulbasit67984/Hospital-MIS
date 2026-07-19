export const LABORATORY_RESULT_AUDIT_ACTIONS = {
  RESULT_ENTERED:
    'laboratory.result.entered',

  RESULT_UPDATED:
    'laboratory.result.updated',

  RESULT_VALIDATED:
    'laboratory.result.validated',

  RESULT_VERIFIED:
    'laboratory.result.verified',

  RESULT_CORRECTED:
    'laboratory.result.corrected',

  RESULT_PUBLISHED:
    'laboratory.result.published',

  RESULT_WITHDRAWN:
    'laboratory.result.withdrawn',

  CRITICAL_COMMUNICATION_RECORDED:
    'laboratory.critical_result.communication_recorded',

  RESULT_HISTORY_READ:
    'laboratory.result.history_read',

  RESULT_REPORT_PRINTED:
    'laboratory.result.report_printed',
} as const;

export const LABORATORY_RESULT_OUTBOX_EVENTS = {
  RESULT_ENTERED:
    'laboratory.result.entered.v1',

  RESULT_UPDATED:
    'laboratory.result.updated.v1',

  RESULT_VALIDATED:
    'laboratory.result.validated.v1',

  RESULT_VERIFIED:
    'laboratory.result.verified.v1',

  RESULT_CORRECTED:
    'laboratory.result.corrected.v1',

  RESULT_PUBLISHED:
    'laboratory.result.published.v1',

  RESULT_WITHDRAWN:
    'laboratory.result.withdrawn.v1',

  CRITICAL_COMMUNICATION_RECORDED:
    'laboratory.critical_result.communication_recorded.v1',
} as const;

export const LABORATORY_RESULT_REALTIME_EVENTS = {
  RESULT_WORKLIST_CHANGED:
    'laboratory.result_worklist.changed',

  CRITICAL_WORKLIST_CHANGED:
    'laboratory.critical_worklist.changed',

  ENCOUNTER_LABORATORY_CHANGED:
    'clinical.encounter_laboratory.changed',

  PATIENT_LABORATORY_HISTORY_CHANGED:
    'clinical.patient_laboratory_history.changed',
} as const;

export const LABORATORY_RESULT_TRANSACTION_STATES = {
  COMPONENTS_VALIDATED:
    'COMPONENTS_VALIDATED',

  RESULT_CREATED:
    'RESULT_CREATED',

  RESULT_UPDATED:
    'RESULT_UPDATED',

  RESULT_VALIDATED:
    'RESULT_VALIDATED',

  SNAPSHOT_ENCRYPTED:
    'SNAPSHOT_ENCRYPTED',

  IMMUTABLE_VERSION_APPENDED:
    'IMMUTABLE_VERSION_APPENDED',

  RESULT_VERIFIED:
    'RESULT_VERIFIED',

  RESULT_CORRECTED:
    'RESULT_CORRECTED',

  PUBLICATION_CHANGED:
    'PUBLICATION_CHANGED',

  CRITICAL_COMMUNICATION_APPENDED:
    'CRITICAL_COMMUNICATION_APPENDED',

  ORDER_AGGREGATE_UPDATED:
    'ORDER_AGGREGATE_UPDATED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',

  REPORT_RENDERED:
    'REPORT_RENDERED',
} as const;

export const LABORATORY_RESULT_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD:
    'laboratory.result.delete-created',

  RESTORE_ENCRYPTED_RECORD:
    'laboratory.result.restore-encrypted',
} as const;

export const LABORATORY_RESULT_COMPENSATABLE_COLLECTIONS = [
  'labResults',
  'labResultVersions',
  'labCriticalResultCommunications',
  'labOrders',
  'labOrderItems',
  'labOrderStatusHistories',
] as const;

export type LaboratoryResultCompensatableCollection =
  (typeof LABORATORY_RESULT_COMPENSATABLE_COLLECTIONS)[number];

export const LABORATORY_CRITICAL_RESULT_FLAGS = [
  'CRITICAL',
  'CRITICAL_HIGH',
  'CRITICAL_LOW',
] as const;

export const DEFAULT_LABORATORY_HISTORY_PAGE_SIZE =
  25;

export const MAX_LABORATORY_HISTORY_PAGE_SIZE =
  100;