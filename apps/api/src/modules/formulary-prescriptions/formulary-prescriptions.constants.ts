import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  PrescriptionStatus,
  PrescriptionWarningSeverity,
} from '@hospital-mis/database';

export const FORMULARY_PRESCRIPTION_PERMISSION_KEYS = {
  FORMULARY_READ: 'formulary.read',
  FORMULARY_MANAGE: 'formulary.manage',
  PRESCRIPTION_READ: 'prescriptions.read',
  PRESCRIPTION_CREATE: 'prescriptions.create',
  PRESCRIPTION_ISSUE: 'prescriptions.issue',
  PRESCRIPTION_AMEND: 'prescriptions.amend',
  PRESCRIPTION_CANCEL: 'prescriptions.cancel',
  PRESCRIPTION_PRINT: 'prescriptions.print',
  INVENTORY_READ: 'inventory.read',
  PHARMACY_QUEUE_READ: 'pharmacy.queue.read',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export type FormularyPrescriptionPermissionKey =
  (typeof FORMULARY_PRESCRIPTION_PERMISSION_KEYS)[keyof typeof FORMULARY_PRESCRIPTION_PERMISSION_KEYS];

export const PRESCRIPTION_TRANSITIONS = {
  DRAFT: [
    'ISSUED',
    'CANCELLED',
  ],
  ISSUED: [
    'PARTIALLY_DISPENSED',
    'DISPENSED',
    'CANCELLED',
    'EXPIRED',
  ],
  PARTIALLY_DISPENSED: [
    'DISPENSED',
    'CANCELLED',
    'EXPIRED',
  ],
  DISPENSED: [],
  CANCELLED: [],
  EXPIRED: [],
} as const satisfies Record<PrescriptionStatus, readonly PrescriptionStatus[]>;

export const BLOCKING_PRESCRIPTION_WARNING_SEVERITIES = [
  'HIGH',
  'CONTRAINDICATED',
] as const satisfies readonly PrescriptionWarningSeverity[];

export const DEFAULT_FORMULARY_PAGE_SIZE = 25;
export const MAX_FORMULARY_PAGE_SIZE = 100;
export const DEFAULT_PRESCRIPTION_PAGE_SIZE = 25;
export const MAX_PRESCRIPTION_PAGE_SIZE = 100;
export const DEFAULT_PRESCRIPTION_NUMBER_WIDTH = 7;
export const DEFAULT_PRESCRIPTION_EXPIRY_DAYS = 30;

export const PRESCRIPTION_NUMBER_SEQUENCE_NAMESPACE =
  'clinical.prescription.number';

export const FORMULARY_PRESCRIPTION_LOCK_NAMESPACE = {
  FORMULARY_ITEM: 'formulary-prescriptions:formulary-item',
  PRESCRIPTION: 'formulary-prescriptions:prescription',
  PATIENT_ACTIVE_MEDICINES: 'formulary-prescriptions:patient-active-medicines',
  ENCOUNTER_PRESCRIPTIONS: 'formulary-prescriptions:encounter-prescriptions',
} as const;

export const FORMULARY_SORT_FIELDS = [
  'genericName',
  'brandName',
  'form',
  'strength',
  'status',
  'updatedAt',
] as const;

export const PRESCRIPTION_SORT_FIELDS = [
  'draftedAt',
  'issuedAt',
  'expiresAt',
  'status',
  'updatedAt',
] as const;

export type FormularySortField =
  (typeof FORMULARY_SORT_FIELDS)[number];

export type PrescriptionSortField =
  (typeof PRESCRIPTION_SORT_FIELDS)[number];

export const FORMULARY_PRESCRIPTION_EVENT_TYPES = {
  FORMULARY_ITEM_CREATED: 'formulary.item.created.v1',
  FORMULARY_ITEM_UPDATED: 'formulary.item.updated.v1',
  FORMULARY_ITEM_STATUS_CHANGED: 'formulary.item.status_changed.v1',
  PRESCRIPTION_DRAFT_CREATED: 'prescription.draft.created.v1',
  PRESCRIPTION_DRAFT_UPDATED: 'prescription.draft.updated.v1',
  PRESCRIPTION_ISSUED: 'prescription.issued.v1',
  PRESCRIPTION_CANCELLED: 'prescription.cancelled.v1',
  PRESCRIPTION_REPLACED: 'prescription.replaced.v1',
  PRESCRIPTION_EXPIRED: 'prescription.expired.v1',
  PRESCRIPTION_DISPENSATION_STATUS_CHANGED:
    'prescription.dispensation_status_changed.v1',
  PRESCRIPTION_SAFETY_WARNING_CHANGED:
    'prescription.safety_warning.changed.v1',
} as const;

export const FORMULARY_PRESCRIPTION_TRANSACTION_TYPES = {
  CREATE_FORMULARY_ITEM: 'FORMULARY_ITEM_CREATE',
  UPDATE_FORMULARY_ITEM: 'FORMULARY_ITEM_UPDATE',
  CHANGE_FORMULARY_ITEM_STATUS: 'FORMULARY_ITEM_STATUS_CHANGE',
  CREATE_PRESCRIPTION_DRAFT: 'PRESCRIPTION_DRAFT_CREATE',
  UPDATE_PRESCRIPTION_DRAFT: 'PRESCRIPTION_DRAFT_UPDATE',
  ISSUE_PRESCRIPTION: 'PRESCRIPTION_ISSUE',
  CANCEL_PRESCRIPTION: 'PRESCRIPTION_CANCEL',
  REPLACE_PRESCRIPTION: 'PRESCRIPTION_REPLACE',
  ACKNOWLEDGE_PRESCRIPTION_WARNING: 'PRESCRIPTION_WARNING_ACKNOWLEDGE',
  PRINT_PRESCRIPTION: 'PRESCRIPTION_PRINT',
} as const;