export const INPATIENT_TRANSACTION_STATES = {
  CONTEXT_VALIDATED:
    'CONTEXT_VALIDATED',

  ACCESS_AUTHORIZED:
    'ACCESS_AUTHORIZED',

  LOCATION_HIERARCHY_VALIDATED:
    'LOCATION_HIERARCHY_VALIDATED',

  RESTRICTIONS_VALIDATED:
    'RESTRICTIONS_VALIDATED',

  NUMBER_ALLOCATED:
    'NUMBER_ALLOCATED',

  RATE_OVERLAP_VALIDATED:
    'RATE_OVERLAP_VALIDATED',

  CURRENT_PROJECTION_CREATED:
    'CURRENT_PROJECTION_CREATED',

  CURRENT_PROJECTION_UPDATED:
    'CURRENT_PROJECTION_UPDATED',

  IMMUTABLE_VERSION_APPENDED:
    'IMMUTABLE_VERSION_APPENDED',

  STATUS_HISTORY_APPENDED:
    'STATUS_HISTORY_APPENDED',

  RECOMMENDATION_CONVERTED:
    'RECOMMENDATION_CONVERTED',

  COMPENSATION_REGISTERED:
    'COMPENSATION_REGISTERED',

  AUDIT_APPENDED:
    'AUDIT_APPENDED',

  OUTBOX_ENQUEUED:
    'OUTBOX_ENQUEUED',

  REALTIME_PUBLISHED:
    'REALTIME_PUBLISHED',
} as const;

export const INPATIENT_AUDIT_ACTIONS = {
  WARD_CREATED:
    'inpatient.ward.created',

  WARD_UPDATED:
    'inpatient.ward.updated',

  WARD_STATUS_CHANGED:
    'inpatient.ward.status_changed',

  ROOM_CREATED:
    'inpatient.room.created',

  ROOM_UPDATED:
    'inpatient.room.updated',

  ROOM_STATUS_CHANGED:
    'inpatient.room.status_changed',

  BED_CREATED:
    'inpatient.bed.created',

  BED_UPDATED:
    'inpatient.bed.updated',

  BED_CATALOG_STATUS_CHANGED:
    'inpatient.bed.catalog_status_changed',

  BED_RATE_CREATED:
    'inpatient.bed_rate.created',

  BED_RATE_ACTIVATED:
    'inpatient.bed_rate.activated',

  BED_RATE_SUPERSEDED:
    'inpatient.bed_rate.superseded',

  ADMISSION_RECOMMENDED:
    'inpatient.admission.recommended',

  ADMISSION_RECOMMENDATION_ACCEPTED:
    'inpatient.admission_recommendation.accepted',

  ADMISSION_RECOMMENDATION_REJECTED:
    'inpatient.admission_recommendation.rejected',

  ADMISSION_RECOMMENDATION_CANCELLED:
    'inpatient.admission_recommendation.cancelled',

  ADMISSION_CREATED:
    'inpatient.admission.created',

  ADMISSION_ACCEPTED:
    'inpatient.admission.accepted',

  ADMISSION_CANCELLED:
    'inpatient.admission.cancelled',
} as const;

export const INPATIENT_OUTBOX_EVENTS = {
  WARD_CREATED:
    'inpatient.ward.created.v1',

  WARD_UPDATED:
    'inpatient.ward.updated.v1',

  WARD_STATUS_CHANGED:
    'inpatient.ward.status_changed.v1',

  ROOM_CREATED:
    'inpatient.room.created.v1',

  ROOM_UPDATED:
    'inpatient.room.updated.v1',

  ROOM_STATUS_CHANGED:
    'inpatient.room.status_changed.v1',

  BED_CREATED:
    'inpatient.bed.created.v1',

  BED_UPDATED:
    'inpatient.bed.updated.v1',

  BED_CATALOG_STATUS_CHANGED:
    'inpatient.bed.catalog_status_changed.v1',

  BED_RATE_CREATED:
    'inpatient.bed_rate.created.v1',

  BED_RATE_ACTIVATED:
    'inpatient.bed_rate.activated.v1',

  BED_RATE_SUPERSEDED:
    'inpatient.bed_rate.superseded.v1',

  ADMISSION_RECOMMENDED:
    'inpatient.admission.recommended.v1',

  ADMISSION_RECOMMENDATION_ACCEPTED:
    'inpatient.admission_recommendation.accepted.v1',

  ADMISSION_RECOMMENDATION_REJECTED:
    'inpatient.admission_recommendation.rejected.v1',

  ADMISSION_RECOMMENDATION_CANCELLED:
    'inpatient.admission_recommendation.cancelled.v1',

  ADMISSION_CREATED:
    'inpatient.admission.created.v1',

  ADMISSION_ACCEPTED:
    'inpatient.admission.accepted.v1',

  ADMISSION_CANCELLED:
    'inpatient.admission.cancelled.v1',
} as const;

export const INPATIENT_REALTIME_EVENTS = {
  LOCATION_CATALOG_CHANGED:
    'inpatient.location_catalog.changed',

  BED_MAP_CHANGED:
    'inpatient.bed_map.changed',

  BED_RATE_CATALOG_CHANGED:
    'inpatient.bed_rate_catalog.changed',

  ADMISSION_RECOMMENDATION_WORKLIST_CHANGED:
    'inpatient.admission_recommendation_worklist.changed',

  ADMISSION_WORKLIST_CHANGED:
    'inpatient.admission_worklist.changed',

  PATIENT_INPATIENT_HISTORY_CHANGED:
    'clinical.patient_inpatient_history.changed',

  ENCOUNTER_ADMISSION_CHANGED:
    'clinical.encounter_admission.changed',
} as const;

export const INPATIENT_COMPENSATION_TYPES = {
  DELETE_CREATED_RECORD:
    'inpatient.record.delete-created',

  RESTORE_ENCRYPTED_RECORD:
    'inpatient.record.restore-encrypted',
} as const;

export const INPATIENT_COMPENSATABLE_COLLECTIONS = [
  'wards',
  'rooms',
  'beds',
  'bedRates',
  'bedRateVersions',
  'admissionRecommendations',
  'admissions',
  'admissionStatusHistories',
] as const;

export type InpatientCompensatableCollection =
  (
    typeof INPATIENT_COMPENSATABLE_COLLECTIONS
  )[number];