export const INPATIENT_BED_OPERATION_TRANSACTION_TYPES = {
  RESERVE_BED:
    'INPATIENT_BED_RESERVE',

  RELEASE_BED_HOLD:
    'INPATIENT_BED_HOLD_RELEASE',

  EXPIRE_BED_HOLD:
    'INPATIENT_BED_HOLD_EXPIRE',

  ASSIGN_BED:
    'INPATIENT_BED_ASSIGN',

  TRANSFER_BED:
    'INPATIENT_BED_TRANSFER',

  RELEASE_BED:
    'INPATIENT_BED_RELEASE',

  CHANGE_BED_OPERATIONAL_STATUS:
    'INPATIENT_BED_OPERATIONAL_STATUS_CHANGE',

  COMPLETE_BED_TURNAROUND:
    'INPATIENT_BED_TURNAROUND_COMPLETE',

  RECONCILE_BED_STATE:
    'INPATIENT_BED_STATE_RECONCILE',

  SUBMIT_BED_CHARGE:
    'INPATIENT_BED_CHARGE_SUBMIT',

  REVERSE_BED_CHARGE:
    'INPATIENT_BED_CHARGE_REVERSE',
} as const;

export const INPATIENT_BED_OPERATION_AUDIT_ACTIONS = {
  BED_RESERVED:
    'inpatient.bed.reserved',

  BED_HOLD_RELEASED:
    'inpatient.bed_hold.released',

  BED_HOLD_EXPIRED:
    'inpatient.bed_hold.expired',

  BED_ASSIGNED:
    'inpatient.bed.assigned',

  BED_TRANSFERRED:
    'inpatient.bed.transferred',

  BED_RELEASED:
    'inpatient.bed.released',

  BED_OPERATIONAL_STATUS_CHANGED:
    'inpatient.bed.operational_status_changed',

  BED_TURNAROUND_COMPLETED:
    'inpatient.bed.turnaround_completed',

  BED_STATE_RECONCILED:
    'inpatient.bed.state_reconciled',

  BED_CHARGE_SUBMITTED:
    'inpatient.bed_charge.submitted',

  BED_CHARGE_REVERSED:
    'inpatient.bed_charge.reversed',
} as const;

export const INPATIENT_BED_OPERATION_EVENTS = {
  BED_RESERVED:
    'inpatient.bed.reserved.v1',

  BED_HOLD_RELEASED:
    'inpatient.bed_hold.released.v1',

  BED_HOLD_EXPIRED:
    'inpatient.bed_hold.expired.v1',

  BED_ASSIGNED:
    'inpatient.bed.assigned.v1',

  BED_TRANSFERRED:
    'inpatient.bed.transferred.v1',

  BED_RELEASED:
    'inpatient.bed.released.v1',

  BED_OPERATIONAL_STATUS_CHANGED:
    'inpatient.bed.operational_status_changed.v1',

  BED_TURNAROUND_COMPLETED:
    'inpatient.bed.turnaround_completed.v1',

  BED_STATE_RECONCILED:
    'inpatient.bed.state_reconciled.v1',

  BED_CHARGE_SEGMENT_OPENED:
    'inpatient.bed_charge_segment.opened.v1',

  BED_CHARGE_SEGMENT_CLOSED:
    'inpatient.bed_charge_segment.closed.v1',

  BED_CHARGE_SUBMITTED:
    'inpatient.bed_charge.submitted.v1',

  BED_CHARGE_REVERSED:
    'inpatient.bed_charge.reversed.v1',
} as const;

export const INPATIENT_BED_OPERATION_REALTIME_EVENTS = {
  BED_MAP_CHANGED:
    'inpatient.bed_map.changed',

  ADMISSION_LOCATION_CHANGED:
    'inpatient.admission_location.changed',

  BED_HOLD_WORKLIST_CHANGED:
    'inpatient.bed_hold_worklist.changed',

  BED_TURNAROUND_WORKLIST_CHANGED:
    'inpatient.bed_turnaround_worklist.changed',

  BED_CHARGE_WORKLIST_CHANGED:
    'inpatient.bed_charge_worklist.changed',
} as const;

export const INPATIENT_BED_OPERATION_COMPENSATION_TYPES = {
  RESTORE_BED:
    'inpatient.bed.restore',

  RESTORE_ADMISSION:
    'inpatient.admission.restore',

  RESTORE_BED_HOLD:
    'inpatient.bed_hold.restore',

  RESTORE_ASSIGNMENT:
    'inpatient.bed_assignment.restore',

  RESTORE_CHARGE_SEGMENT:
    'inpatient.bed_charge_segment.restore',

  DELETE_CREATED_BED_HOLD:
    'inpatient.bed_hold.delete-created',

  DELETE_CREATED_ASSIGNMENT:
    'inpatient.bed_assignment.delete-created',

  DELETE_CREATED_BED_STATUS_HISTORY:
    'inpatient.bed_status_history.delete-created',

  DELETE_CREATED_ADMISSION_HISTORY:
    'inpatient.admission_status_history.delete-created',

  DELETE_CREATED_CHARGE_SEGMENT:
    'inpatient.bed_charge_segment.delete-created',
} as const;

export const INPATIENT_BED_OPERATION_REASON_CODES = {
  BED_RESERVED:
    'BED_RESERVED',

  RESERVATION_RELEASED:
    'RESERVATION_RELEASED',

  RESERVATION_EXPIRED:
    'RESERVATION_EXPIRED',

  PATIENT_ADMITTED:
    'PATIENT_ADMITTED',

  PATIENT_TRANSFERRED:
    'PATIENT_TRANSFERRED',

  PATIENT_DISCHARGED:
    'PATIENT_DISCHARGED',

  ADMISSION_CANCELLED:
    'ADMISSION_CANCELLED',

  TURNAROUND_STARTED:
    'TURNAROUND_STARTED',

  TURNAROUND_COMPLETED:
    'TURNAROUND_COMPLETED',

  MAINTENANCE_STARTED:
    'MAINTENANCE_STARTED',

  MAINTENANCE_COMPLETED:
    'MAINTENANCE_COMPLETED',

  BED_BLOCKED:
    'BED_BLOCKED',

  BED_UNBLOCKED:
    'BED_UNBLOCKED',

  RECOVERY:
    'RECOVERY',
} as const;