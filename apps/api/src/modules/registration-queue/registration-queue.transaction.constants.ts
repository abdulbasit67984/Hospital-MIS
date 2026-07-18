export const REGISTRATION_QUEUE_TRANSACTION_TYPES = {
  REGISTER_OPD_VISIT:
    'REGISTER_OPD_VISIT',

  CANCEL_REGISTRATION:
    'CANCEL_REGISTRATION',

  CANCEL_OPD_VISIT:
    'CANCEL_OPD_VISIT',

  MARK_OPD_VISIT_NO_SHOW:
    'MARK_OPD_VISIT_NO_SHOW',

  CORRECT_OPD_VISIT:
    'CORRECT_OPD_VISIT',

  CHANGE_QUEUE_STATUS:
    'CHANGE_QUEUE_STATUS',

  UPDATE_QUEUE_ASSIGNMENT:
    'UPDATE_QUEUE_ASSIGNMENT',

  UPDATE_QUEUE_PRIORITY:
    'UPDATE_QUEUE_PRIORITY',

  TRANSFER_QUEUE_ENTRY:
    'TRANSFER_QUEUE_ENTRY',
} as const;

export const REGISTRATION_QUEUE_TRANSACTION_STATES = {
  CANONICAL_PATIENT_RESOLVED:
    'CANONICAL_PATIENT_RESOLVED',

  SERVICE_CONTEXT_VALIDATED:
    'SERVICE_CONTEXT_VALIDATED',

  REGISTRATION_NUMBER_ALLOCATED:
    'REGISTRATION_NUMBER_ALLOCATED',

  REGISTRATION_CREATED:
    'REGISTRATION_CREATED',

  VISIT_NUMBER_ALLOCATED:
    'VISIT_NUMBER_ALLOCATED',

  OPD_VISIT_CREATED:
    'OPD_VISIT_CREATED',

  QUEUE_TOKEN_ALLOCATED:
    'QUEUE_TOKEN_ALLOCATED',

  QUEUE_ENTRY_CREATED:
    'QUEUE_ENTRY_CREATED',

  QUEUE_HISTORY_APPENDED:
    'QUEUE_HISTORY_APPENDED',

  REGISTRATION_CANCELLED:
    'REGISTRATION_CANCELLED',

  OPD_VISIT_STATUS_CHANGED:
    'OPD_VISIT_STATUS_CHANGED',

  OPD_VISIT_CORRECTED:
    'OPD_VISIT_CORRECTED',

  QUEUE_STATUS_CHANGED:
    'QUEUE_STATUS_CHANGED',

  QUEUE_ASSIGNMENT_UPDATED:
    'QUEUE_ASSIGNMENT_UPDATED',

  QUEUE_PRIORITY_UPDATED:
    'QUEUE_PRIORITY_UPDATED',

  SOURCE_QUEUE_TRANSFERRED:
    'SOURCE_QUEUE_TRANSFERRED',

  DESTINATION_QUEUE_CREATED:
    'DESTINATION_QUEUE_CREATED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',
} as const;

export const REGISTRATION_QUEUE_COMPENSATION_TYPES = {
  DELETE_REGISTRATION:
    'registration-queue.registration.delete',

  RESTORE_REGISTRATION:
    'registration-queue.registration.restore',

  DELETE_OPD_VISIT:
    'registration-queue.opd-visit.delete',

  RESTORE_OPD_VISIT:
    'registration-queue.opd-visit.restore',

  DELETE_QUEUE_ENTRY:
    'registration-queue.queue-entry.delete',

  RESTORE_QUEUE_ENTRY:
    'registration-queue.queue-entry.restore',

  DELETE_QUEUE_HISTORY:
    'registration-queue.queue-history.delete',
} as const;

export const REGISTRATION_QUEUE_AUDIT_ACTIONS = {
  REGISTRATION_CREATED:
    'registration.created',

  REGISTRATION_CANCELLED:
    'registration.cancelled',

  OPD_VISIT_CREATED:
    'opd_visit.created',

  OPD_VISIT_CHECKED_IN:
    'opd_visit.checked_in',

  OPD_VISIT_CANCELLED:
    'opd_visit.cancelled',

  OPD_VISIT_NO_SHOW:
    'opd_visit.no_show',

  OPD_VISIT_CORRECTED:
    'opd_visit.corrected',

  QUEUE_ENTRY_CREATED:
    'queue.entry.created',

  QUEUE_STATUS_CHANGED:
    'queue.entry.status_changed',

  QUEUE_ASSIGNMENT_UPDATED:
    'queue.entry.assignment_updated',

  QUEUE_PRIORITY_UPDATED:
    'queue.entry.priority_updated',

  QUEUE_ENTRY_TRANSFERRED:
    'queue.entry.transferred',
} as const;

export const REGISTRATION_QUEUE_OUTBOX_EVENTS = {
  REGISTRATION_CREATED:
    'registration.created',

  REGISTRATION_CANCELLED:
    'registration.cancelled',

  OPD_VISIT_CREATED:
    'opd_visit.created',

  OPD_VISIT_STATUS_CHANGED:
    'opd_visit.status_changed',

  OPD_VISIT_CORRECTED:
    'opd_visit.corrected',

  QUEUE_ENTRY_CREATED:
    'queue.entry.created',

  QUEUE_STATUS_CHANGED:
    'queue.entry.status_changed',

  QUEUE_ASSIGNMENT_UPDATED:
    'queue.entry.assignment_updated',

  QUEUE_PRIORITY_UPDATED:
    'queue.entry.priority_updated',

  QUEUE_ENTRY_TRANSFERRED:
    'queue.entry.transferred',
} as const;

export const REGISTRATION_QUEUE_REALTIME_EVENTS = {
  QUEUE_SNAPSHOT_CHANGED:
    'queue.snapshot.changed',

  QUEUE_ENTRY_CREATED:
    'queue.entry.created',

  QUEUE_STATUS_CHANGED:
    'queue.entry.status_changed',

  QUEUE_ASSIGNMENT_UPDATED:
    'queue.entry.assignment_updated',

  QUEUE_PRIORITY_UPDATED:
    'queue.entry.priority_updated',

  QUEUE_ENTRY_TRANSFERRED:
    'queue.entry.transferred',
} as const;

export const REGISTRATION_QUEUE_RECOVERY_MODES = {
  COMPENSATE:
    'COMPENSATE',

  FINALIZE_COMPLETED:
    'FINALIZE_COMPLETED',
} as const;

export type RegistrationQueueRecoveryMode =
  (typeof REGISTRATION_QUEUE_RECOVERY_MODES)[keyof typeof REGISTRATION_QUEUE_RECOVERY_MODES];