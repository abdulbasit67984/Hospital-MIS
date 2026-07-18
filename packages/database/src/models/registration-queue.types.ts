export const registrationModeValues = [
  'NEW_PATIENT',
  'RETURNING_PATIENT',
] as const;

export const registrationSourceValues = [
  'WALK_IN',
  'APPOINTMENT',
  'REFERRAL',
  'EMERGENCY',
  'FOLLOW_UP',
  'INTERNAL_TRANSFER',
  'OTHER',
] as const;

export const visitTypeValues = [
  'NEW_PATIENT',
  'RETURNING_PATIENT',
  'FOLLOW_UP',
  'EMERGENCY',
] as const;

export const registrationStatusValues = [
  'ACTIVE',
  'CANCELLED',
  'SUPERSEDED',
] as const;

export const opdVisitStatusValues = [
  'REGISTERED',
  'CHECKED_IN',
  'QUEUED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'CORRECTED',
] as const;

export const clinicStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const servicePointTypeValues = [
  'REGISTRATION_DESK',
  'TRIAGE',
  'CLINIC',
  'CONSULTATION_ROOM',
  'PROCEDURE_ROOM',
  'EMERGENCY',
  'OTHER',
] as const;

export const servicePointStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const queueDefinitionStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const queueResetPolicyValues = [
  'SERVICE_DATE',
] as const;

export const queuePublicDisplayModeValues = [
  'TOKEN_ONLY',
  'TOKEN_AND_COUNTER',
  'TOKEN_COUNTER_AND_SERVICE',
] as const;

export const serviceCounterTypeValues = [
  'RECEPTION',
  'TRIAGE',
  'QUEUE',
  'CONSULTATION',
  'OTHER',
] as const;

export const serviceCounterStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'OUT_OF_SERVICE',
] as const;

export const queueEntryStatusValues = [
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
  'TRANSFERRED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const queuePriorityClassValues = [
  'ROUTINE',
  'PRIORITY',
  'URGENT',
  'EMERGENCY',
] as const;

export const triagePriorityValues = [
  'NOT_TRIAGED',
  'LEVEL_5_NON_URGENT',
  'LEVEL_4_LESS_URGENT',
  'LEVEL_3_URGENT',
  'LEVEL_2_EMERGENT',
  'LEVEL_1_RESUSCITATION',
] as const;

export const queueSpecialCategoryValues = [
  'CHILD',
  'SENIOR_CITIZEN',
  'PREGNANT',
  'PERSON_WITH_DISABILITY',
  'HOSPITAL_STAFF',
  'OTHER_AUTHORIZED',
] as const;

export const queueTransferReasonValues = [
  'PROVIDER_REASSIGNMENT',
  'CLINIC_REASSIGNMENT',
  'DEPARTMENT_REASSIGNMENT',
  'SERVICE_POINT_REASSIGNMENT',
  'COUNTER_REASSIGNMENT',
  'PATIENT_REQUEST',
  'OPERATIONAL_LOAD_BALANCING',
  'CLINICAL_ESCALATION',
  'OTHER',
] as const;

export const queueStatusChangeSourceValues = [
  'RECEPTION',
  'PROVIDER',
  'TRIAGE',
  'SYSTEM',
  'RECOVERY',
] as const;

export type RegistrationMode =
  (typeof registrationModeValues)[number];

export type RegistrationSource =
  (typeof registrationSourceValues)[number];

export type VisitType =
  (typeof visitTypeValues)[number];

export type RegistrationStatus =
  (typeof registrationStatusValues)[number];

export type OpdVisitStatus =
  (typeof opdVisitStatusValues)[number];

export type ClinicStatus =
  (typeof clinicStatusValues)[number];

export type ServicePointType =
  (typeof servicePointTypeValues)[number];

export type ServicePointStatus =
  (typeof servicePointStatusValues)[number];

export type QueueDefinitionStatus =
  (typeof queueDefinitionStatusValues)[number];

export type QueueResetPolicy =
  (typeof queueResetPolicyValues)[number];

export type QueuePublicDisplayMode =
  (typeof queuePublicDisplayModeValues)[number];

export type ServiceCounterType =
  (typeof serviceCounterTypeValues)[number];

export type ServiceCounterStatus =
  (typeof serviceCounterStatusValues)[number];

export type QueueEntryStatus =
  (typeof queueEntryStatusValues)[number];

export type QueuePriorityClass =
  (typeof queuePriorityClassValues)[number];

export type TriagePriority =
  (typeof triagePriorityValues)[number];

export type QueueSpecialCategory =
  (typeof queueSpecialCategoryValues)[number];

export type QueueTransferReason =
  (typeof queueTransferReasonValues)[number];

export type QueueStatusChangeSource =
  (typeof queueStatusChangeSourceValues)[number];

export const activeOpdVisitStatusValues = [
  'REGISTERED',
  'CHECKED_IN',
  'QUEUED',
  'IN_SERVICE',
] as const satisfies readonly OpdVisitStatus[];

export const terminalOpdVisitStatusValues = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'CORRECTED',
] as const satisfies readonly OpdVisitStatus[];

export const activeQueueEntryStatusValues = [
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
] as const satisfies readonly QueueEntryStatus[];

export const terminalQueueEntryStatusValues = [
  'TRANSFERRED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const satisfies readonly QueueEntryStatus[];