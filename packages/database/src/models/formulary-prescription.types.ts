export const medicineCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const medicineFormCategoryValues = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'SUSPENSION',
  'SOLUTION',
  'INJECTION',
  'INFUSION',
  'CREAM',
  'OINTMENT',
  'GEL',
  'LOTION',
  'DROPS',
  'INHALER',
  'NEBULIZER_SOLUTION',
  'SUPPOSITORY',
  'POWDER',
  'GRANULES',
  'PATCH',
  'DEVICE',
  'OTHER',
] as const;

export const medicineRouteCodeValues = [
  'ORAL',
  'SUBLINGUAL',
  'BUCCAL',
  'INTRAVENOUS',
  'INTRAMUSCULAR',
  'SUBCUTANEOUS',
  'INTRADERMAL',
  'RECTAL',
  'VAGINAL',
  'TOPICAL',
  'TRANSDERMAL',
  'OPHTHALMIC',
  'OTIC',
  'NASAL',
  'INHALATION',
  'NEBULIZATION',
  'ENTERAL_TUBE',
  'INTRATHECAL',
  'EPIDURAL',
  'INTRA_ARTICULAR',
  'OTHER',
] as const;

export const unitOfMeasureDimensionValues = [
  'MASS',
  'VOLUME',
  'COUNT',
  'TIME',
  'CONCENTRATION',
  'DOSE',
  'LENGTH',
  'AREA',
  'OTHER',
] as const;

export const prescriptionFrequencyKindValues = [
  'SCHEDULED',
  'INTERVAL',
  'ONCE',
  'AS_NEEDED',
  'CUSTOM',
] as const;

export const formularyItemStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const formularyRestrictionTypeValues = [
  'NONE',
  'SPECIALIST_ONLY',
  'DEPARTMENT_ONLY',
  'AGE_RESTRICTED',
  'CONTROLLED',
  'HIGH_ALERT',
  'OTHER',
] as const;

export const prescriptionStatusValues = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_DISPENSED',
  'DISPENSED',
  'CANCELLED',
  'EXPIRED',
] as const;

export const prescriptionItemStatusValues = [
  'ACTIVE',
  'CANCELLED',
  'REPLACED',
] as const;

export const prescriptionDurationUnitValues = [
  'DOSES',
  'DAYS',
  'WEEKS',
  'MONTHS',
  'UNTIL_FINISHED',
  'AS_NEEDED',
] as const;

export const prescriptionChangeTypeValues = [
  'CREATED',
  'UPDATED',
  'ISSUED',
  'PARTIALLY_DISPENSED',
  'DISPENSED',
  'CANCELLED',
  'EXPIRED',
  'REPLACED',
] as const;

export const prescriptionStatusChangeSourceValues = [
  'PROVIDER',
  'PHARMACY',
  'SYSTEM',
  'RECOVERY',
] as const;

export const prescriptionWarningTypeValues = [
  'ALLERGY',
  'DUPLICATE_ACTIVE_MEDICINE',
  'INTERACTION',
  'FORMULARY_RESTRICTION',
  'DOSE_RANGE',
  'OTHER',
] as const;

export const prescriptionWarningSeverityValues = [
  'INFO',
  'LOW',
  'MODERATE',
  'HIGH',
  'CONTRAINDICATED',
] as const;

export const prescriptionWarningStatusValues = [
  'OPEN',
  'ACKNOWLEDGED',
  'OVERRIDDEN',
  'RESOLVED',
] as const;

export const medicineInteractionCheckStatusValues = [
  'NOT_REQUESTED',
  'PENDING',
  'COMPLETED',
  'UNAVAILABLE',
  'FAILED',
] as const;

export type MedicineCatalogStatus =
  (typeof medicineCatalogStatusValues)[number];

export type MedicineFormCategory =
  (typeof medicineFormCategoryValues)[number];

export type MedicineRouteCode =
  (typeof medicineRouteCodeValues)[number];

export type UnitOfMeasureDimension =
  (typeof unitOfMeasureDimensionValues)[number];

export type PrescriptionFrequencyKind =
  (typeof prescriptionFrequencyKindValues)[number];

export type FormularyItemStatus =
  (typeof formularyItemStatusValues)[number];

export type FormularyRestrictionType =
  (typeof formularyRestrictionTypeValues)[number];

export type PrescriptionStatus =
  (typeof prescriptionStatusValues)[number];

export type PrescriptionItemStatus =
  (typeof prescriptionItemStatusValues)[number];

export type PrescriptionDurationUnit =
  (typeof prescriptionDurationUnitValues)[number];

export type PrescriptionChangeType =
  (typeof prescriptionChangeTypeValues)[number];

export type PrescriptionStatusChangeSource =
  (typeof prescriptionStatusChangeSourceValues)[number];

export type PrescriptionWarningType =
  (typeof prescriptionWarningTypeValues)[number];

export type PrescriptionWarningSeverity =
  (typeof prescriptionWarningSeverityValues)[number];

export type PrescriptionWarningStatus =
  (typeof prescriptionWarningStatusValues)[number];

export type MedicineInteractionCheckStatus =
  (typeof medicineInteractionCheckStatusValues)[number];