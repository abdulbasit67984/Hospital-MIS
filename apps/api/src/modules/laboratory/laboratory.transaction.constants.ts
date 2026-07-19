export const LABORATORY_TRANSACTION_STATES = {
  CONTEXT_VALIDATED: 'CONTEXT_VALIDATED',
  CANONICAL_PATIENT_RESOLVED: 'CANONICAL_PATIENT_RESOLVED',
  ACCESS_AUTHORIZED: 'ACCESS_AUTHORIZED',
  CATALOG_REFERENCES_VALIDATED: 'CATALOG_REFERENCES_VALIDATED',
  NUMBER_ALLOCATED: 'NUMBER_ALLOCATED',
  CURRENT_PROJECTION_CREATED: 'CURRENT_PROJECTION_CREATED',
  CURRENT_PROJECTION_UPDATED: 'CURRENT_PROJECTION_UPDATED',
  ITEMS_CREATED: 'ITEMS_CREATED',
  STATUS_HISTORY_APPENDED: 'STATUS_HISTORY_APPENDED',
  BILLING_REQUESTED: 'BILLING_REQUESTED',
  COMPENSATION_REGISTERED: 'COMPENSATION_REGISTERED',
  AUDIT_APPENDED: 'AUDIT_APPENDED',
  OUTBOX_ENQUEUED: 'OUTBOX_ENQUEUED',
  REALTIME_PUBLISHED: 'REALTIME_PUBLISHED',
} as const;

export const LABORATORY_AUDIT_ACTIONS = {
  CATEGORY_CREATED: 'laboratory.category.created',
  CATEGORY_UPDATED: 'laboratory.category.updated',
  CATEGORY_STATUS_CHANGED: 'laboratory.category.status_changed',
  TEST_CREATED: 'laboratory.test.created',
  TEST_UPDATED: 'laboratory.test.updated',
  TEST_STATUS_CHANGED: 'laboratory.test.status_changed',
  ORDER_CREATED: 'laboratory.order.created',
  ORDER_ACCEPTED: 'laboratory.order.accepted',
  ORDER_CANCELLED: 'laboratory.order.cancelled',
  ORDER_SENSITIVE_READ: 'laboratory.order.sensitive_read',
} as const;

export const LABORATORY_OUTBOX_EVENTS = {
  CATEGORY_CREATED: 'laboratory.category.created.v1',
  CATEGORY_UPDATED: 'laboratory.category.updated.v1',
  CATEGORY_STATUS_CHANGED: 'laboratory.category.status_changed.v1',
  TEST_CREATED: 'laboratory.test.created.v1',
  TEST_UPDATED: 'laboratory.test.updated.v1',
  TEST_STATUS_CHANGED: 'laboratory.test.status_changed.v1',
  ORDER_CREATED: 'laboratory.order.created.v1',
  ORDER_ACCEPTED: 'laboratory.order.accepted.v1',
  ORDER_CANCELLED: 'laboratory.order.cancelled.v1',
  BILLING_REQUESTED: 'laboratory.billing.requested.v1',
  BILLING_CANCELLATION_REQUESTED:
    'laboratory.billing.cancellation_requested.v1',
} as const;

export const LABORATORY_REALTIME_EVENTS = {
  CATALOG_CHANGED: 'laboratory.catalog.changed',
  ORDER_WORKLIST_CHANGED: 'laboratory.order_worklist.changed',
  ENCOUNTER_LABORATORY_CHANGED:
    'clinical.encounter_laboratory.changed',
  PATIENT_LABORATORY_HISTORY_CHANGED:
    'clinical.patient_laboratory_history.changed',
} as const;

export const LABORATORY_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD: 'laboratory.record.delete-created',
  DELETE_CREATED_RECORD_SET:
    'laboratory.record-set.delete-created',
  RESTORE_ENCRYPTED_RECORD:
    'laboratory.record.restore-encrypted',
} as const;

export const LABORATORY_COMPENSATABLE_COLLECTIONS = [
  'labTestCategories',
  'labTests',
  'labOrders',
  'labOrderItems',
  'labOrderStatusHistories',
] as const;

export type LaboratoryCompensatableCollection =
  (typeof LABORATORY_COMPENSATABLE_COLLECTIONS)[number];