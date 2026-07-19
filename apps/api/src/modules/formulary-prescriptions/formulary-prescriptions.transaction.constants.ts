export const FORMULARY_PRESCRIPTION_TRANSACTION_STATES = {
  CONTEXT_VALIDATED:
    'CONTEXT_VALIDATED',

  CANONICAL_PATIENT_RESOLVED:
    'CANONICAL_PATIENT_RESOLVED',

  ACCESS_AUTHORIZED:
    'ACCESS_AUTHORIZED',

  CATALOG_REFERENCES_VALIDATED:
    'CATALOG_REFERENCES_VALIDATED',

  NUMBER_ALLOCATED:
    'NUMBER_ALLOCATED',

  SAFETY_EVALUATED:
    'SAFETY_EVALUATED',

  WARNINGS_PERSISTED:
    'WARNINGS_PERSISTED',

  CURRENT_PROJECTION_CREATED:
    'CURRENT_PROJECTION_CREATED',

  CURRENT_PROJECTION_UPDATED:
    'CURRENT_PROJECTION_UPDATED',

  ITEMS_CREATED:
    'ITEMS_CREATED',

  ITEMS_REPLACED:
    'ITEMS_REPLACED',

  SNAPSHOT_ENCRYPTED:
    'SNAPSHOT_ENCRYPTED',

  STATUS_HISTORY_APPENDED:
    'STATUS_HISTORY_APPENDED',

  REPLACEMENT_LINKED:
    'REPLACEMENT_LINKED',

  COMPENSATION_REGISTERED:
    'COMPENSATION_REGISTERED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',

  PRINT_ARTIFACT_CREATED:
    'PRINT_ARTIFACT_CREATED',
} as const;

export const FORMULARY_PRESCRIPTION_RECOVERY_MODES = {
  COMPENSATE:
    'COMPENSATE',

  FINALIZE_COMPLETED:
    'FINALIZE_COMPLETED',
} as const;

export type FormularyPrescriptionRecoveryMode =
  (typeof FORMULARY_PRESCRIPTION_RECOVERY_MODES)[keyof typeof FORMULARY_PRESCRIPTION_RECOVERY_MODES];

export const FORMULARY_PRESCRIPTION_AUDIT_ACTIONS = {
  FORMULARY_ITEM_CREATED:
    'formulary.item.created',

  FORMULARY_ITEM_UPDATED:
    'formulary.item.updated',

  FORMULARY_ITEM_STATUS_CHANGED:
    'formulary.item.status_changed',

  PRESCRIPTION_DRAFT_CREATED:
    'prescription.draft.created',

  PRESCRIPTION_DRAFT_UPDATED:
    'prescription.draft.updated',

  PRESCRIPTION_ISSUED:
    'prescription.issued',

  PRESCRIPTION_CANCELLED:
    'prescription.cancelled',

  PRESCRIPTION_REPLACED:
    'prescription.replaced',

  PRESCRIPTION_EXPIRED:
    'prescription.expired',

  PRESCRIPTION_PRINTED:
    'prescription.printed',

  PRESCRIPTION_WARNING_ACKNOWLEDGED:
    'prescription.warning.acknowledged',

  PRESCRIPTION_WARNING_OVERRIDDEN:
    'prescription.warning.overridden',

  PRESCRIPTION_SENSITIVE_READ:
    'prescription.sensitive_read',

  PRESCRIPTION_BREAK_GLASS_READ:
    'prescription.break_glass_read',
} as const;

export const FORMULARY_PRESCRIPTION_OUTBOX_EVENTS = {
  FORMULARY_ITEM_CREATED:
    'formulary.item.created.v1',

  FORMULARY_ITEM_UPDATED:
    'formulary.item.updated.v1',

  FORMULARY_ITEM_STATUS_CHANGED:
    'formulary.item.status_changed.v1',

  PRESCRIPTION_DRAFT_CREATED:
    'prescription.draft.created.v1',

  PRESCRIPTION_DRAFT_UPDATED:
    'prescription.draft.updated.v1',

  PRESCRIPTION_ISSUED:
    'prescription.issued.v1',

  PRESCRIPTION_CANCELLED:
    'prescription.cancelled.v1',

  PRESCRIPTION_REPLACED:
    'prescription.replaced.v1',

  PRESCRIPTION_EXPIRED:
    'prescription.expired.v1',

  PRESCRIPTION_WARNING_CHANGED:
    'prescription.safety_warning.changed.v1',
} as const;

export const FORMULARY_PRESCRIPTION_REALTIME_EVENTS = {
  FORMULARY_CHANGED:
    'formulary.changed',

  PRESCRIPTION_CHANGED:
    'prescription.changed',

  PATIENT_MEDICATION_HISTORY_CHANGED:
    'patient.medication_history.changed',

  PHARMACY_QUEUE_CHANGED:
    'pharmacy.prescription_queue.changed',

  PRESCRIPTION_WARNING_CHANGED:
    'prescription.safety_warning.changed',
} as const;

export const FORMULARY_PRESCRIPTION_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD:
    'formulary-prescriptions.record.delete-created',

  RESTORE_ENCRYPTED_RECORD:
    'formulary-prescriptions.record.restore-encrypted',

  RESTORE_ENCRYPTED_RECORD_SET:
    'formulary-prescriptions.record-set.restore-encrypted',
} as const;

export const FORMULARY_PRESCRIPTION_COMPENSATABLE_COLLECTIONS = [
  'formularyItems',
  'prescriptions',
  'prescriptionItems',
  'prescriptionSafetyWarnings',
  'prescriptionStatusHistories',
] as const;

export type FormularyPrescriptionCompensatableCollection =
  (typeof FORMULARY_PRESCRIPTION_COMPENSATABLE_COLLECTIONS)[number];

export type FormularyPrescriptionCompensationType =
  (typeof FORMULARY_PRESCRIPTION_COMPENSATION_TYPES)[keyof typeof FORMULARY_PRESCRIPTION_COMPENSATION_TYPES];