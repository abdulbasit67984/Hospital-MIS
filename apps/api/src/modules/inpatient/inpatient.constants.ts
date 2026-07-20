import type {
  AdmissionRecommendationStatus,
  AdmissionStatus,
  BedAssignmentStatus,
  BedHoldStatus,
  BedRateStatus,
  InpatientBedStatus,
} from '@hospital-mis/database';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const INPATIENT_PERMISSION_KEYS = {
  ADMISSIONS_READ: 'admissions.read',
  ADMISSIONS_CREATE: 'admissions.create',
  ADMISSIONS_TRANSFER: 'admissions.transfer',
  ADMISSIONS_CLINICAL_DISCHARGE: 'admissions.clinical_discharge',
  ADMISSIONS_FINANCIAL_DISCHARGE: 'admissions.financial_discharge',
  BEDS_READ: 'beds.read',
  BEDS_MANAGE: 'beds.manage',
  BEDS_ASSIGN: 'beds.assign',
  BEDS_TRANSFER: 'beds.transfer',
  BEDS_STATUS_MANAGE: 'beds.status_manage',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const ADMISSION_RECOMMENDATION_TRANSITIONS = {
  ORDERED: [
    'ACCEPTED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  ACCEPTED: [
    'CONVERTED',
    'CANCELLED',
    'EXPIRED',
  ],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  CONVERTED: [],
} as const satisfies Record<
  AdmissionRecommendationStatus,
  readonly AdmissionRecommendationStatus[]
>;

export const ADMISSION_TRANSITIONS = {
  PENDING_ACCEPTANCE: [
    'ACCEPTED',
    'CANCELLED',
  ],
  ACCEPTED: [
    'AWAITING_BED',
    'CANCELLED',
  ],
  AWAITING_BED: [
    'ADMITTED',
    'CANCELLED',
  ],
  ADMITTED: [
    'TRANSFER_PENDING',
    'DISCHARGE_INITIATED',
  ],
  TRANSFER_PENDING: [
    'ADMITTED',
    'DISCHARGE_INITIATED',
  ],
  DISCHARGE_INITIATED: [
    'ADMITTED',
    'CLINICALLY_DISCHARGED',
  ],
  CLINICALLY_DISCHARGED: [
    'ADMITTED',
    'FINANCIAL_CLEARANCE_PENDING',
  ],
  FINANCIAL_CLEARANCE_PENDING: [
    'CLINICALLY_DISCHARGED',
    'DISCHARGED',
  ],
  DISCHARGED: [],
  CANCELLED: [],
} as const satisfies Record<
  AdmissionStatus,
  readonly AdmissionStatus[]
>;

export const BED_STATUS_TRANSITIONS = {
  AVAILABLE: [
    'RESERVED',
    'OCCUPIED',
    'CLEANING',
    'MAINTENANCE',
    'BLOCKED',
  ],
  RESERVED: [
    'AVAILABLE',
    'OCCUPIED',
    'MAINTENANCE',
    'BLOCKED',
  ],
  OCCUPIED: [
    'CLEANING',
  ],
  CLEANING: [
    'AVAILABLE',
    'MAINTENANCE',
    'BLOCKED',
  ],
  MAINTENANCE: [
    'AVAILABLE',
    'CLEANING',
    'BLOCKED',
  ],
  BLOCKED: [
    'AVAILABLE',
    'CLEANING',
    'MAINTENANCE',
  ],
} as const satisfies Record<
  InpatientBedStatus,
  readonly InpatientBedStatus[]
>;

export const BED_HOLD_TRANSITIONS = {
  ACTIVE: [
    'CONSUMED',
    'RELEASED',
    'EXPIRED',
    'CANCELLED',
  ],
  CONSUMED: [],
  RELEASED: [],
  EXPIRED: [],
  CANCELLED: [],
} as const satisfies Record<
  BedHoldStatus,
  readonly BedHoldStatus[]
>;

export const BED_ASSIGNMENT_TRANSITIONS = {
  ACTIVE: [
    'COMPLETED',
    'CANCELLED',
    'CORRECTED',
  ],
  COMPLETED: [],
  CANCELLED: [],
  CORRECTED: [],
} as const satisfies Record<
  BedAssignmentStatus,
  readonly BedAssignmentStatus[]
>;

export const BED_RATE_TRANSITIONS = {
  DRAFT: [
    'ACTIVE',
    'CANCELLED',
  ],
  ACTIVE: [
    'SUPERSEDED',
    'CANCELLED',
  ],
  SUPERSEDED: [],
  CANCELLED: [],
} as const satisfies Record<
  BedRateStatus,
  readonly BedRateStatus[]
>;

export const DEFAULT_INPATIENT_PAGE_SIZE = 25;
export const MAX_INPATIENT_PAGE_SIZE = 100;
export const DEFAULT_INPATIENT_NUMBER_WIDTH = 7;
export const DEFAULT_BED_HOLD_MINUTES = 30;
export const MAX_BED_HOLD_MINUTES = 24 * 60;

export const INPATIENT_NUMBER_SEQUENCE_NAMESPACE = {
  ADMISSION_RECOMMENDATION:
    'inpatient.admission_recommendation.number',
  ADMISSION:
    'inpatient.admission.number',
  BED_HOLD:
    'inpatient.bed_hold.number',
  BED_ASSIGNMENT:
    'inpatient.bed_assignment.number',
  BED_CHARGE_SEGMENT:
    'inpatient.bed_charge_segment.number',
} as const;

export const INPATIENT_LOCK_NAMESPACE = {
  WARD:
    'inpatient:ward',
  ROOM:
    'inpatient:room',
  BED:
    'inpatient:bed',
  BED_RATE_SCOPE:
    'inpatient:bed-rate-scope',
  PATIENT_ADMISSION:
    'inpatient:patient-admission',
  ADMISSION:
    'inpatient:admission',
  ADMISSION_RECOMMENDATION:
    'inpatient:admission-recommendation',
  BED_HOLD:
    'inpatient:bed-hold',
  BED_ASSIGNMENT:
    'inpatient:bed-assignment',
  BED_CHARGE_SEGMENT:
    'inpatient:bed-charge-segment',
} as const;

export const INPATIENT_EVENT_TYPES = {
  WARD_CREATED:
    'inpatient.ward.created.v1',
  WARD_UPDATED:
    'inpatient.ward.updated.v1',
  ROOM_CREATED:
    'inpatient.room.created.v1',
  ROOM_UPDATED:
    'inpatient.room.updated.v1',
  BED_CREATED:
    'inpatient.bed.created.v1',
  BED_UPDATED:
    'inpatient.bed.updated.v1',
  BED_STATUS_CHANGED:
    'inpatient.bed.status_changed.v1',
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
  BED_RESERVED:
    'inpatient.bed.reserved.v1',
  BED_ASSIGNED:
    'inpatient.bed.assigned.v1',
  BED_TRANSFERRED:
    'inpatient.bed.transferred.v1',
  BED_RELEASED:
    'inpatient.bed.released.v1',
} as const;

export const INPATIENT_TRANSACTION_TYPES = {
  CREATE_WARD:
    'INPATIENT_WARD_CREATE',
  UPDATE_WARD:
    'INPATIENT_WARD_UPDATE',
  CHANGE_WARD_STATUS:
    'INPATIENT_WARD_STATUS_CHANGE',
  CREATE_ROOM:
    'INPATIENT_ROOM_CREATE',
  UPDATE_ROOM:
    'INPATIENT_ROOM_UPDATE',
  CHANGE_ROOM_STATUS:
    'INPATIENT_ROOM_STATUS_CHANGE',
  CREATE_BED:
    'INPATIENT_BED_CREATE',
  UPDATE_BED:
    'INPATIENT_BED_UPDATE',
  CHANGE_BED_CATALOG_STATUS:
    'INPATIENT_BED_CATALOG_STATUS_CHANGE',
  CREATE_BED_RATE:
    'INPATIENT_BED_RATE_CREATE',
  ACTIVATE_BED_RATE:
    'INPATIENT_BED_RATE_ACTIVATE',
  SUPERSEDE_BED_RATE:
    'INPATIENT_BED_RATE_SUPERSEDE',
  CREATE_ADMISSION_RECOMMENDATION:
    'INPATIENT_ADMISSION_RECOMMENDATION_CREATE',
  ACCEPT_ADMISSION_RECOMMENDATION:
    'INPATIENT_ADMISSION_RECOMMENDATION_ACCEPT',
  REJECT_ADMISSION_RECOMMENDATION:
    'INPATIENT_ADMISSION_RECOMMENDATION_REJECT',
  CANCEL_ADMISSION_RECOMMENDATION:
    'INPATIENT_ADMISSION_RECOMMENDATION_CANCEL',
  CREATE_ADMISSION:
    'INPATIENT_ADMISSION_CREATE',
  ACCEPT_ADMISSION:
    'INPATIENT_ADMISSION_ACCEPT',
  CANCEL_ADMISSION:
    'INPATIENT_ADMISSION_CANCEL',
} as const;

export const INPATIENT_LOCATION_SORT_FIELDS = [
  'name',
  'code',
  'status',
  'displayOrder',
  'updatedAt',
] as const;

export const INPATIENT_ADMISSION_SORT_FIELDS = [
  'requestedAt',
  'admittedAt',
  'priority',
  'status',
  'updatedAt',
] as const;

export type InpatientLocationSortField =
  (typeof INPATIENT_LOCATION_SORT_FIELDS)[number];

export type InpatientAdmissionSortField =
  (typeof INPATIENT_ADMISSION_SORT_FIELDS)[number];