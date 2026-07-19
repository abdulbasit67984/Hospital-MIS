export const RADIOLOGY_TRANSACTION_STATES = {
  CONTEXT_VALIDATED: 'CONTEXT_VALIDATED',
  ACCESS_AUTHORIZED: 'ACCESS_AUTHORIZED',
  CATALOG_REFERENCES_VALIDATED:
    'CATALOG_REFERENCES_VALIDATED',
  RESOURCE_AVAILABILITY_VALIDATED:
    'RESOURCE_AVAILABILITY_VALIDATED',
  SAFETY_VALIDATED: 'SAFETY_VALIDATED',
  NUMBER_ALLOCATED: 'NUMBER_ALLOCATED',
  CURRENT_PROJECTION_CREATED:
    'CURRENT_PROJECTION_CREATED',
  CURRENT_PROJECTION_UPDATED:
    'CURRENT_PROJECTION_UPDATED',
  ITEMS_CREATED: 'ITEMS_CREATED',
  RESERVATIONS_CREATED: 'RESERVATIONS_CREATED',
  RESERVATIONS_RELEASED: 'RESERVATIONS_RELEASED',
  STATUS_HISTORY_APPENDED: 'STATUS_HISTORY_APPENDED',
  BILLING_REQUESTED: 'BILLING_REQUESTED',
  BILLING_CANCELLATION_REQUESTED:
    'BILLING_CANCELLATION_REQUESTED',
  EXTERNAL_REFERENCE_VALIDATED:
    'EXTERNAL_REFERENCE_VALIDATED',
  INVENTORY_USAGE_REQUESTED:
    'INVENTORY_USAGE_REQUESTED',
  ATTACHMENTS_VALIDATED: 'ATTACHMENTS_VALIDATED',
  REPORT_VERSION_APPENDED: 'REPORT_VERSION_APPENDED',
  REPORT_PUBLICATION_CHANGED:
    'REPORT_PUBLICATION_CHANGED',
  CRITICAL_COMMUNICATION_APPENDED:
    'CRITICAL_COMMUNICATION_APPENDED',
  CRITICAL_FINDING_ACKNOWLEDGED:
    'CRITICAL_FINDING_ACKNOWLEDGED',
  REPORT_ARTIFACT_STORED: 'REPORT_ARTIFACT_STORED',
  COMPENSATION_REGISTERED: 'COMPENSATION_REGISTERED',
  AUDIT_APPENDED: 'AUDIT_APPENDED',
  OUTBOX_ENQUEUED: 'OUTBOX_ENQUEUED',
  REALTIME_PUBLISHED: 'REALTIME_PUBLISHED',
} as const;

export const RADIOLOGY_AUDIT_ACTIONS = {
  MODALITY_CREATED: 'radiology.modality.created',
  MODALITY_UPDATED: 'radiology.modality.updated',
  MODALITY_STATUS_CHANGED:
    'radiology.modality.status_changed',
  PROCEDURE_CREATED: 'radiology.procedure.created',
  PROCEDURE_UPDATED: 'radiology.procedure.updated',
  PROCEDURE_STATUS_CHANGED:
    'radiology.procedure.status_changed',
  ORDER_CREATED: 'radiology.order.created',
  ORDER_ACCEPTED: 'radiology.order.accepted',
  ORDER_REJECTED: 'radiology.order.rejected',
  ORDER_CANCELLED: 'radiology.order.cancelled',
  ORDER_SENSITIVE_READ: 'radiology.order.sensitive_read',
  RESOURCE_CREATED: 'radiology.resource.created',
  RESOURCE_STATUS_CHANGED:
    'radiology.resource.status_changed',
  APPOINTMENT_SCHEDULED:
    'radiology.appointment.scheduled',
  APPOINTMENT_RESCHEDULED:
    'radiology.appointment.rescheduled',
  APPOINTMENT_CANCELLED:
    'radiology.appointment.cancelled',
  SAFETY_SCREENING_RECORDED:
    'radiology.safety_screening.recorded',
  PATIENT_CHECKED_IN:
    'radiology.examination.checked_in',
  EXAMINATION_STARTED:
    'radiology.examination.started',
  EXAMINATION_COMPLETED:
    'radiology.examination.completed',
  IMAGING_STUDY_REGISTERED:
    'radiology.imaging_study.registered',
  REPORT_ASSIGNED: 'radiology.report.assigned',
  REPORT_DRAFT_SAVED: 'radiology.report.draft_saved',
  REPORT_PRELIMINARY_SUBMITTED:
    'radiology.report.preliminary_submitted',
  REPORT_FINALIZED: 'radiology.report.finalized',
  REPORT_CORRECTED: 'radiology.report.corrected',
  REPORT_ADDENDUM_ADDED:
    'radiology.report.addendum_added',
  REPORT_PUBLISHED: 'radiology.report.published',
  REPORT_WITHDRAWN: 'radiology.report.withdrawn',
  REPORT_RENDERED: 'radiology.report.rendered',
  REPORT_SENSITIVE_READ:
    'radiology.report.sensitive_read',
  CRITICAL_FINDING_COMMUNICATED:
    'radiology.critical_finding.communicated',
  CRITICAL_FINDING_ACKNOWLEDGED:
    'radiology.critical_finding.acknowledged',
} as const;

export const RADIOLOGY_OUTBOX_EVENTS = {
  MODALITY_CREATED: 'radiology.modality.created.v1',
  MODALITY_UPDATED: 'radiology.modality.updated.v1',
  MODALITY_STATUS_CHANGED:
    'radiology.modality.status_changed.v1',
  PROCEDURE_CREATED: 'radiology.procedure.created.v1',
  PROCEDURE_UPDATED: 'radiology.procedure.updated.v1',
  PROCEDURE_STATUS_CHANGED:
    'radiology.procedure.status_changed.v1',
  ORDER_CREATED: 'radiology.order.created.v1',
  ORDER_ACCEPTED: 'radiology.order.accepted.v1',
  ORDER_REJECTED: 'radiology.order.rejected.v1',
  ORDER_CANCELLED: 'radiology.order.cancelled.v1',
  BILLING_REQUESTED: 'radiology.billing.requested.v1',
  BILLING_CANCELLATION_REQUESTED:
    'radiology.billing.cancellation_requested.v1',
  RESOURCE_CREATED: 'radiology.resource.created.v1',
  RESOURCE_STATUS_CHANGED:
    'radiology.resource.status_changed.v1',
  APPOINTMENT_SCHEDULED:
    'radiology.appointment.scheduled.v1',
  APPOINTMENT_RESCHEDULED:
    'radiology.appointment.rescheduled.v1',
  APPOINTMENT_CANCELLED:
    'radiology.appointment.cancelled.v1',
  SAFETY_SCREENING_STATUS_CHANGED:
    'radiology.safety_screening.status_changed.v1',
  PATIENT_CHECKED_IN:
    'radiology.examination.checked_in.v1',
  EXAMINATION_STARTED:
    'radiology.examination.started.v1',
  EXAMINATION_COMPLETED:
    'radiology.examination.completed.v1',
  IMAGING_STUDY_REGISTERED:
    'radiology.imaging_study.registered.v1',
  REPORT_ASSIGNED:
    'radiology.report.assigned.v1',
  REPORT_DRAFT_SAVED:
    'radiology.report.draft_saved.v1',
  REPORT_PRELIMINARY_SUBMITTED:
    'radiology.report.preliminary_submitted.v1',
  REPORT_FINALIZED:
    'radiology.report.finalized.v1',
  REPORT_CORRECTED:
    'radiology.report.corrected.v1',
  REPORT_ADDENDUM_ADDED:
    'radiology.report.addendum_added.v1',
  REPORT_PUBLISHED:
    'radiology.report.published.v1',
  REPORT_WITHDRAWN:
    'radiology.report.withdrawn.v1',
  REPORT_RENDERED:
    'radiology.report.rendered.v1',
  CRITICAL_FINDING_COMMUNICATED:
    'radiology.critical_finding.communicated.v1',
  CRITICAL_FINDING_ACKNOWLEDGED:
    'radiology.critical_finding.acknowledged.v1',
} as const;

export const RADIOLOGY_REALTIME_EVENTS = {
  CATALOG_CHANGED: 'radiology.catalog.changed',
  ORDER_WORKLIST_CHANGED:
    'radiology.order_worklist.changed',
  SCHEDULE_CHANGED:
    'radiology.schedule.changed',
  EXAMINATION_WORKLIST_CHANGED:
    'radiology.examination_worklist.changed',
  STUDY_CHANGED:
    'radiology.study.changed',
  REPORT_WORKLIST_CHANGED:
    'radiology.report_worklist.changed',
  REPORT_PUBLICATION_CHANGED:
    'radiology.report_publication.changed',
  CRITICAL_FINDING_CHANGED:
    'radiology.critical_finding.changed',
  ENCOUNTER_RADIOLOGY_CHANGED:
    'clinical.encounter_radiology.changed',
  PATIENT_RADIOLOGY_HISTORY_CHANGED:
    'clinical.patient_radiology_history.changed',
} as const;

export const RADIOLOGY_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD:
    'radiology.record.delete-created',
  DELETE_CREATED_RECORD_SET:
    'radiology.record-set.delete-created',
  RESTORE_ENCRYPTED_RECORD:
    'radiology.record.restore-encrypted',
} as const;

export const RADIOLOGY_COMPENSATABLE_COLLECTIONS = [
  'radiologyModalities',
  'radiologyProcedures',
  'radiologyOrders',
  'radiologyOrderItems',
  'radiologyOrderStatusHistories',
  'radiologyOrderItemStatusHistories',
  'radiologyResources',
  'radiologyAppointments',
  'radiologyResourceReservations',
  'radiologySafetyScreenings',
  'radiologyExaminations',
  'radiologyImagingStudies',
  'radiologyImagingSeries',
  'radiologyReports',
  'radiologyReportVersions',
  'radiologyCriticalFindingCommunications',
] as const;

export type RadiologyCompensatableCollection =
  (typeof RADIOLOGY_COMPENSATABLE_COLLECTIONS)[number];