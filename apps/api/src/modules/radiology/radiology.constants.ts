import type {
  RadiologyOrderItemStatus,
  RadiologyOrderStatus,
  RadiologyPreparationStatus,
  RadiologySafetyScreeningStatus,
} from '@hospital-mis/database';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const RADIOLOGY_PERMISSION_KEYS = {
  CATALOG_READ: 'radiology.catalog.read',
  CATALOG_MANAGE: 'radiology.catalog.manage',
  ORDERS_READ: 'radiology.orders.read',
  ORDERS_CREATE: 'radiology.orders.create',
  ORDERS_MANAGE: 'radiology.orders.manage',
  ORDERS_CANCEL: 'radiology.orders.cancel',
  SCHEDULES_READ: 'radiology.schedules.read',
  SCHEDULES_MANAGE: 'radiology.schedules.manage',
  SAFETY_READ: 'radiology.safety_screening.read',
  SAFETY_MANAGE: 'radiology.safety_screening.manage',
  EXAMINATIONS_READ: 'radiology.examinations.read',
  EXAMINATIONS_MANAGE: 'radiology.examinations.manage',
  STUDIES_READ: 'radiology.studies.read',
  STUDIES_MANAGE: 'radiology.studies.manage',
  REPORTS_READ: 'radiology.reports.read',
  REPORTS_ENTER: 'radiology.reports.enter',
  REPORTS_REVIEW: 'radiology.reports.review',
  REPORTS_VERIFY: 'radiology.reports.verify',
  REPORTS_AMEND: 'radiology.reports.amend',
  REPORTS_PUBLISH: 'radiology.reports.publish',
  REPORTS_WITHDRAW: 'radiology.reports.withdraw',
  REPORTS_PRINT: 'radiology.reports.print',
  CRITICAL_NOTIFY: 'radiology.critical_findings.notify',
  CRITICAL_ACKNOWLEDGE: 'radiology.critical_findings.acknowledge',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const RADIOLOGY_ORDER_TRANSITIONS = {
  ORDERED: [
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
  ],
  ACCEPTED: [
    'SCHEDULED',
    'CHECKED_IN',
    'IN_PROGRESS',
    'REJECTED',
    'CANCELLED',
  ],
  SCHEDULED: [
    'CHECKED_IN',
    'IN_PROGRESS',
    'CANCELLED',
  ],
  CHECKED_IN: [
    'IN_PROGRESS',
    'CANCELLED',
  ],
  IN_PROGRESS: [
    'COMPLETED',
    'CANCELLED',
  ],
  COMPLETED: [
    'REPORTED',
  ],
  REPORTED: [
    'VERIFIED',
  ],
  VERIFIED: [],
  REJECTED: [],
  CANCELLED: [],
} as const satisfies Record<
  RadiologyOrderStatus,
  readonly RadiologyOrderStatus[]
>;

export const RADIOLOGY_ORDER_ITEM_TRANSITIONS = {
  ORDERED: [
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
  ],
  ACCEPTED: [
    'SCHEDULED',
    'CHECKED_IN',
    'IN_PROGRESS',
    'REJECTED',
    'CANCELLED',
  ],
  SCHEDULED: [
    'CHECKED_IN',
    'IN_PROGRESS',
    'CANCELLED',
  ],
  CHECKED_IN: [
    'IN_PROGRESS',
    'CANCELLED',
  ],
  IN_PROGRESS: [
    'COMPLETED',
    'CANCELLED',
  ],
  COMPLETED: [
    'PRELIMINARY_REPORTED',
    'FINAL_REPORTED',
  ],
  PRELIMINARY_REPORTED: [
    'FINAL_REPORTED',
  ],
  FINAL_REPORTED: [
    'VERIFIED',
  ],
  VERIFIED: [],
  REJECTED: [],
  CANCELLED: [],
} as const satisfies Record<
  RadiologyOrderItemStatus,
  readonly RadiologyOrderItemStatus[]
>;

export const RADIOLOGY_SAFETY_SCREENING_TRANSITIONS = {
  NOT_REQUIRED: [],
  PENDING: [
    'CLEARED',
    'HOLD',
    'FAILED',
  ],
  CLEARED: [
    'HOLD',
  ],
  HOLD: [
    'PENDING',
    'CLEARED',
    'FAILED',
  ],
  FAILED: [
    'PENDING',
  ],
} as const satisfies Record<
  RadiologySafetyScreeningStatus,
  readonly RadiologySafetyScreeningStatus[]
>;

export const RADIOLOGY_PREPARATION_TRANSITIONS = {
  NOT_REQUIRED: [],
  PENDING: [
    'CONFIRMED',
    'INCOMPLETE',
  ],
  CONFIRMED: [
    'INCOMPLETE',
  ],
  INCOMPLETE: [
    'PENDING',
    'CONFIRMED',
  ],
} as const satisfies Record<
  RadiologyPreparationStatus,
  readonly RadiologyPreparationStatus[]
>;

export const DEFAULT_RADIOLOGY_PAGE_SIZE = 25;
export const MAX_RADIOLOGY_PAGE_SIZE = 100;
export const DEFAULT_RADIOLOGY_NUMBER_WIDTH = 7;

export const RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE = {
  ORDER: 'radiology.order.number',
  ACCESSION: 'radiology.accession.number',
  STUDY: 'radiology.study.number',
  REPORT: 'radiology.report.number',
} as const;

export const RADIOLOGY_LOCK_NAMESPACE = {
  MODALITY: 'radiology:modality',
  PROCEDURE: 'radiology:procedure',
  ENCOUNTER_ORDERS: 'radiology:encounter-orders',
  ORDER: 'radiology:order',
  ORDER_ITEM: 'radiology:order-item',
  SCHEDULE: 'radiology:schedule',
  RESOURCE: 'radiology:resource',
  STUDY: 'radiology:study',
  REPORT: 'radiology:report',
  CRITICAL_FINDING: 'radiology:critical-finding',
} as const;

export const RADIOLOGY_CATALOG_SORT_FIELDS = [
  'name',
  'procedureCode',
  'modalityNameSnapshot',
  'status',
  'updatedAt',
] as const;

export const RADIOLOGY_ORDER_SORT_FIELDS = [
  'orderedAt',
  'priority',
  'status',
  'updatedAt',
] as const;

export type RadiologyCatalogSortField =
  (typeof RADIOLOGY_CATALOG_SORT_FIELDS)[number];

export type RadiologyOrderSortField =
  (typeof RADIOLOGY_ORDER_SORT_FIELDS)[number];

export const RADIOLOGY_EVENT_TYPES = {
  MODALITY_CREATED: 'radiology.modality.created.v1',
  MODALITY_UPDATED: 'radiology.modality.updated.v1',
  PROCEDURE_CREATED: 'radiology.procedure.created.v1',
  PROCEDURE_UPDATED: 'radiology.procedure.updated.v1',
  PROCEDURE_STATUS_CHANGED: 'radiology.procedure.status_changed.v1',
  ORDER_CREATED: 'radiology.order.created.v1',
  ORDER_ACCEPTED: 'radiology.order.accepted.v1',
  ORDER_REJECTED: 'radiology.order.rejected.v1',
  ORDER_CANCELLED: 'radiology.order.cancelled.v1',
  ORDER_STATUS_CHANGED: 'radiology.order.status_changed.v1',
  APPOINTMENT_SCHEDULED: 'radiology.appointment.scheduled.v1',
  SAFETY_STATUS_CHANGED: 'radiology.safety_status.changed.v1',
  EXAMINATION_STARTED: 'radiology.examination.started.v1',
  EXAMINATION_COMPLETED: 'radiology.examination.completed.v1',
  STUDY_REGISTERED: 'radiology.study.registered.v1',
  REPORT_FINALIZED: 'radiology.report.finalized.v1',
  REPORT_PUBLISHED: 'radiology.report.published.v1',
  REPORT_WITHDRAWN: 'radiology.report.withdrawn.v1',
  CRITICAL_FINDING_RECORDED: 'radiology.critical_finding.recorded.v1',
  CRITICAL_FINDING_ACKNOWLEDGED:
    'radiology.critical_finding.acknowledged.v1',
} as const;

export const RADIOLOGY_TRANSACTION_TYPES = {
  CREATE_MODALITY: 'RADIOLOGY_MODALITY_CREATE',
  UPDATE_MODALITY: 'RADIOLOGY_MODALITY_UPDATE',
  CHANGE_MODALITY_STATUS: 'RADIOLOGY_MODALITY_STATUS_CHANGE',
  CREATE_PROCEDURE: 'RADIOLOGY_PROCEDURE_CREATE',
  UPDATE_PROCEDURE: 'RADIOLOGY_PROCEDURE_UPDATE',
  CHANGE_PROCEDURE_STATUS: 'RADIOLOGY_PROCEDURE_STATUS_CHANGE',
  CREATE_ORDER: 'RADIOLOGY_ORDER_CREATE',
  ACCEPT_ORDER: 'RADIOLOGY_ORDER_ACCEPT',
  REJECT_ORDER: 'RADIOLOGY_ORDER_REJECT',
  CANCEL_ORDER: 'RADIOLOGY_ORDER_CANCEL',
  SCHEDULE_EXAMINATION: 'RADIOLOGY_EXAMINATION_SCHEDULE',
  RECORD_SAFETY_SCREENING: 'RADIOLOGY_SAFETY_SCREENING_RECORD',
  CHECK_IN: 'RADIOLOGY_EXAMINATION_CHECK_IN',
  START_EXAMINATION: 'RADIOLOGY_EXAMINATION_START',
  COMPLETE_EXAMINATION: 'RADIOLOGY_EXAMINATION_COMPLETE',
  REGISTER_STUDY: 'RADIOLOGY_STUDY_REGISTER',
  ENTER_REPORT: 'RADIOLOGY_REPORT_ENTER',
  FINALIZE_REPORT: 'RADIOLOGY_REPORT_FINALIZE',
  CORRECT_REPORT: 'RADIOLOGY_REPORT_CORRECT',
  ADD_REPORT_ADDENDUM: 'RADIOLOGY_REPORT_ADDENDUM',
  PUBLISH_REPORT: 'RADIOLOGY_REPORT_PUBLISH',
  WITHDRAW_REPORT: 'RADIOLOGY_REPORT_WITHDRAW',
  RECORD_CRITICAL_FINDING: 'RADIOLOGY_CRITICAL_FINDING_RECORD',
  ACKNOWLEDGE_CRITICAL_FINDING:
    'RADIOLOGY_CRITICAL_FINDING_ACKNOWLEDGE',
  PRINT_REPORT: 'RADIOLOGY_REPORT_PRINT',
} as const;