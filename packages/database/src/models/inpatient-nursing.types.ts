export const nursingNoteTypeValues = [
  'OBSERVATION',
  'ASSESSMENT',
  'CARE_PLAN',
  'INTAKE_OUTPUT',
  'ESCALATION',
  'DISCHARGE_READINESS',
  'GENERAL',
] as const;

export const nursingEntryStatusValues = [
  'ACTIVE',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingObservationSeverityValues = [
  'ROUTINE',
  'ATTENTION',
  'URGENT',
  'CRITICAL',
] as const;

export const nursingIntakeOutputDirectionValues = [
  'INTAKE',
  'OUTPUT',
] as const;

export const nursingIntakeOutputRouteValues = [
  'ORAL',
  'ENTERAL',
  'INTRAVENOUS',
  'BLOOD_PRODUCT',
  'URINE',
  'DRAIN',
  'VOMIT',
  'STOOL',
  'OTHER',
] as const;

export const medicationScheduleStatusValues = [
  'ACTIVE',
  'HELD',
  'COMPLETED',
  'CANCELLED',
] as const;

export const medicationDoseStatusValues = [
  'SCHEDULED',
  'DUE',
  'ADMINISTERED',
  'OMITTED',
  'REFUSED',
  'DELAYED',
  'CANCELLED',
] as const;

export const medicationAdministrationRouteValues = [
  'ORAL',
  'INTRAVENOUS',
  'INTRAMUSCULAR',
  'SUBCUTANEOUS',
  'INHALATION',
  'TOPICAL',
  'RECTAL',
  'VAGINAL',
  'ENTERAL',
  'OTHER',
] as const;

export const medicationAdministrationSourceValues = [
  'PRESCRIPTION',
  'STAT_ORDER',
  'PRN_ORDER',
  'MANUAL_RECOVERY',
] as const;

export const wardHandoverTypeValues = [
  'SHIFT',
  'TRANSFER',
  'TEMPORARY_COVER',
  'ESCALATION',
] as const;

export const wardHandoverStatusValues = [
  'DRAFT',
  'SIGNED',
  'ACKNOWLEDGED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingAmendmentEntityTypeValues = [
  'VITAL_SIGN',
  'NURSING_NOTE',
  'MEDICATION_SCHEDULE',
  'MEDICATION_ADMINISTRATION',
  'WARD_HANDOVER',
] as const;

export const nursingAmendmentTypeValues = [
  'CORRECTION',
  'ENTERED_IN_ERROR',
  'RECOVERY',
] as const;

export type NursingNoteType =
  (typeof nursingNoteTypeValues)[number];

export type NursingEntryStatus =
  (typeof nursingEntryStatusValues)[number];

export type NursingObservationSeverity =
  (typeof nursingObservationSeverityValues)[number];

export type NursingIntakeOutputDirection =
  (typeof nursingIntakeOutputDirectionValues)[number];

export type NursingIntakeOutputRoute =
  (typeof nursingIntakeOutputRouteValues)[number];

export type MedicationScheduleStatus =
  (typeof medicationScheduleStatusValues)[number];

export type MedicationDoseStatus =
  (typeof medicationDoseStatusValues)[number];

export type MedicationAdministrationRoute =
  (typeof medicationAdministrationRouteValues)[number];

export type MedicationAdministrationSource =
  (typeof medicationAdministrationSourceValues)[number];

export type WardHandoverType =
  (typeof wardHandoverTypeValues)[number];

export type WardHandoverStatus =
  (typeof wardHandoverStatusValues)[number];

export type NursingAmendmentEntityType =
  (typeof nursingAmendmentEntityTypeValues)[number];

export type NursingAmendmentType =
  (typeof nursingAmendmentTypeValues)[number];