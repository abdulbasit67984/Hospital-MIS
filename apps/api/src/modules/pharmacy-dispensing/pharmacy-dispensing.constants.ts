import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const PHARMACY_DISPENSING_PERMISSION_KEYS = {
  READ: 'pharmacy.read',
  QUEUE_READ: 'pharmacy.queue.read',
  VERIFY: 'pharmacy.verify',
  DISPENSE: 'pharmacy.dispense',
  CONTROLLED_DISPENSE: 'pharmacy.controlled_dispense',
  RETURN: 'pharmacy.return',
  REVERSAL: 'pharmacy.reversal',
  PRICE_OVERRIDE: 'pharmacy.price_override',
  COST_READ: 'pharmacy.view_cost',
  OVERRIDE_FEFO: 'pharmacy.override_fefo',
  REPORT_READ: 'pharmacy.reports.read',
  REPORT_EXPORT: 'pharmacy.reports.export',
  CONFIGURATION_MANAGE: 'pharmacy.configuration.manage',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const PHARMACY_DISPENSING_OPERATIONAL_ROLE_KEYS = [
  'PHARMACIST',
  'PHARMACY_MANAGER',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
] as const;

export const PHARMACY_DISPENSING_SORT_FIELDS = [
  'queuedAt',
  'priority',
  'status',
  'expiresAt',
  'completedAt',
  'updatedAt',
] as const;

export const PHARMACY_DISPENSING_ITEM_SORT_FIELDS = [
  'lineNumber',
  'status',
  'dispensedAt',
  'updatedAt',
] as const;

export const DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE = 25;
export const MAX_PHARMACY_DISPENSING_PAGE_SIZE = 100;
export const DEFAULT_PHARMACY_RESERVATION_MINUTES = 30;
export const MAX_PHARMACY_RESERVATION_MINUTES = 24 * 60;
export const DEFAULT_PHARMACY_FEFO_BATCH_LIMIT = 100;
export const MAX_PHARMACY_FEFO_BATCH_LIMIT = 500;
export const DEFAULT_DISPENSATION_NUMBER_WIDTH = 7;

export const PHARMACY_DISPENSING_NUMBER_SEQUENCE_NAMESPACE =
  'pharmacy.dispensation.number';
export const PHARMACY_RETURN_NUMBER_SEQUENCE_NAMESPACE =
  'pharmacy.patient-return.number';
export const PHARMACY_REVERSAL_NUMBER_SEQUENCE_NAMESPACE =
  'pharmacy.dispensation-reversal.number';
export const PHARMACY_CONTROLLED_REGISTER_NUMBER_SEQUENCE_NAMESPACE =
  'pharmacy.controlled-register.number';
export const PHARMACY_LABEL_NUMBER_SEQUENCE_NAMESPACE =
  'pharmacy.label.number';

export const PHARMACY_DISPENSING_LOCK_NAMESPACE = {
  PRESCRIPTION: 'pharmacy-dispensing:prescription',
  DISPENSATION: 'pharmacy-dispensing:dispensation',
  DISPENSATION_ITEM: 'pharmacy-dispensing:dispensation-item',
  PATIENT: 'pharmacy-dispensing:patient',
  RESERVATION: 'pharmacy-dispensing:reservation',
  CONTROLLED_REGISTER: 'pharmacy-dispensing:controlled-register',
  RETURN: 'pharmacy-dispensing:return',
  REVERSAL: 'pharmacy-dispensing:reversal',
} as const;

export const PHARMACY_DISPENSING_EVENT_TYPES = {
  INTAKE_CREATED: 'pharmacy.dispensation.created.v1',
  REVIEWED: 'pharmacy.dispensation.reviewed.v1',
  VERIFIED: 'pharmacy.dispensation.verified.v1',
  HELD: 'pharmacy.dispensation.held.v1',
  RELEASED: 'pharmacy.dispensation.released.v1',
  REJECTED: 'pharmacy.dispensation.rejected.v1',
  SUBSTITUTION_AUTHORIZED: 'pharmacy.substitution.authorized.v1',
  RESERVATION_CREATED: 'pharmacy.dispensation.reservation_created.v1',
  PARTIALLY_DISPENSED: 'pharmacy.dispensation.partially_dispensed.v1',
  COMPLETED: 'pharmacy.dispensation.completed.v1',
  CANCELLED: 'pharmacy.dispensation.cancelled.v1',
  RETURN_CREATED: 'pharmacy.patient_return.created.v1',
  RETURN_POSTED: 'pharmacy.patient_return.posted.v1',
  REVERSAL_REQUESTED: 'pharmacy.dispensation_reversal.requested.v1',
  REVERSAL_POSTED: 'pharmacy.dispensation_reversal.posted.v1',
  LABEL_PRINTED: 'pharmacy.label.printed.v1',
  COUNSELLING_COMPLETED: 'pharmacy.counselling.completed.v1',
  CONTROLLED_REGISTER_CHANGED: 'pharmacy.controlled_register.changed.v1',
} as const;

export const PHARMACY_DISPENSING_REALTIME_EVENTS = {
  WORKLIST_CHANGED: 'pharmacy.worklist.changed',
  RETURN_WORKLIST_CHANGED: 'pharmacy.return_worklist.changed',
  CONTROLLED_DISCREPANCY_CHANGED:
    'pharmacy.controlled_discrepancy.changed',
} as const;

export const PHARMACY_DISPENSING_TRANSACTION_TYPES = {
  INTAKE: 'PHARMACY_DISPENSATION_INTAKE',
  VERIFY: 'PHARMACY_DISPENSATION_VERIFY',
  HOLD: 'PHARMACY_DISPENSATION_HOLD',
  RELEASE: 'PHARMACY_DISPENSATION_RELEASE',
  REJECT: 'PHARMACY_DISPENSATION_REJECT',
  AUTHORIZE_SUBSTITUTION: 'PHARMACY_SUBSTITUTION_AUTHORIZE',
  RESERVE: 'PHARMACY_DISPENSATION_RESERVE',
  DISPENSE: 'PHARMACY_DISPENSATION_COMPLETE',
  RETURN: 'PHARMACY_PATIENT_RETURN',
  REVERSE: 'PHARMACY_DISPENSATION_REVERSE',
  PRINT_LABEL: 'PHARMACY_LABEL_PRINT',
  COUNSELLING: 'PHARMACY_COUNSELLING_COMPLETE',
} as const;

export type PharmacyDispensingSortField =
  (typeof PHARMACY_DISPENSING_SORT_FIELDS)[number];
export type PharmacyDispensingItemSortField =
  (typeof PHARMACY_DISPENSING_ITEM_SORT_FIELDS)[number];