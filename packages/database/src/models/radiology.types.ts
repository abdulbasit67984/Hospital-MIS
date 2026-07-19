export const radiologyCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const radiologyModalityTypeValues = [
  'XRAY',
  'CT',
  'MRI',
  'ULTRASOUND',
  'MAMMOGRAPHY',
  'FLUOROSCOPY',
  'NUCLEAR_MEDICINE',
  'PET',
  'INTERVENTIONAL_RADIOLOGY',
  'DEXA',
  'OTHER',
] as const;

export const radiologyLateralityRequirementValues = [
  'NOT_APPLICABLE',
  'OPTIONAL',
  'REQUIRED',
] as const;

export const radiologyLateralityValues = [
  'NOT_APPLICABLE',
  'LEFT',
  'RIGHT',
  'BILATERAL',
  'MIDLINE',
  'UNSPECIFIED',
] as const;

export const radiologyContrastRequirementValues = [
  'NONE',
  'OPTIONAL',
  'REQUIRED',
  'CONDITIONAL',
] as const;

export const radiologyContrastRouteValues = [
  'INTRAVENOUS',
  'ORAL',
  'RECTAL',
  'INTRA_ARTICULAR',
  'INTRATHECAL',
  'OTHER',
] as const;

export const radiologySafetyRequirementValues = [
  'CONTRAST_ALLERGY',
  'PREGNANCY',
  'RENAL_RISK',
  'IMPLANT_DEVICE',
  'METAL_SCREENING',
  'CLAUSTROPHOBIA',
  'SEDATION',
  'INFECTION_CONTROL',
  'OTHER',
] as const;

export const radiologyOrderPriorityValues = [
  'ROUTINE',
  'URGENT',
  'STAT',
] as const;

export const radiologyOrderStatusValues = [
  'ORDERED',
  'ACCEPTED',
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'REPORTED',
  'VERIFIED',
  'REJECTED',
  'CANCELLED',
] as const;

export const radiologyOrderItemStatusValues = [
  'ORDERED',
  'ACCEPTED',
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'PRELIMINARY_REPORTED',
  'FINAL_REPORTED',
  'VERIFIED',
  'REJECTED',
  'CANCELLED',
] as const;

export const radiologyOrderStatusChangeSourceValues = [
  'ORDERING_PROVIDER',
  'RADIOLOGY_STAFF',
  'SYSTEM',
  'RECOVERY',
] as const;

export const radiologySafetyScreeningStatusValues = [
  'NOT_REQUIRED',
  'PENDING',
  'CLEARED',
  'HOLD',
  'FAILED',
] as const;

export const radiologyPreparationStatusValues = [
  'NOT_REQUIRED',
  'PENDING',
  'CONFIRMED',
  'INCOMPLETE',
] as const;

export const radiologyBillingStatusValues = [
  'NOT_REQUESTED',
  'PENDING',
  'CHARGED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'FAILED',
] as const;

export type RadiologyCatalogStatus =
  (typeof radiologyCatalogStatusValues)[number];

export type RadiologyModalityType =
  (typeof radiologyModalityTypeValues)[number];

export type RadiologyLateralityRequirement =
  (typeof radiologyLateralityRequirementValues)[number];

export type RadiologyLaterality =
  (typeof radiologyLateralityValues)[number];

export type RadiologyContrastRequirement =
  (typeof radiologyContrastRequirementValues)[number];

export type RadiologyContrastRoute =
  (typeof radiologyContrastRouteValues)[number];

export type RadiologySafetyRequirement =
  (typeof radiologySafetyRequirementValues)[number];

export type RadiologyOrderPriority =
  (typeof radiologyOrderPriorityValues)[number];

export type RadiologyOrderStatus =
  (typeof radiologyOrderStatusValues)[number];

export type RadiologyOrderItemStatus =
  (typeof radiologyOrderItemStatusValues)[number];

export type RadiologyOrderStatusChangeSource =
  (typeof radiologyOrderStatusChangeSourceValues)[number];

export type RadiologySafetyScreeningStatus =
  (typeof radiologySafetyScreeningStatusValues)[number];

export type RadiologyPreparationStatus =
  (typeof radiologyPreparationStatusValues)[number];

export type RadiologyBillingStatus =
  (typeof radiologyBillingStatusValues)[number];