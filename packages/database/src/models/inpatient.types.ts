import {
  bedStatuses,
} from '../catalog/enums.js';

export const inpatientCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const wardTypeValues = [
  'GENERAL',
  'PRIVATE',
  'ICU',
  'HDU',
  'NICU',
  'PICU',
  'MATERNITY',
  'PEDIATRIC',
  'ISOLATION',
  'OBSERVATION',
  'OTHER',
] as const;

export const roomTypeValues = [
  'GENERAL_WARD',
  'PRIVATE_ROOM',
  'SEMI_PRIVATE_ROOM',
  'ICU_BAY',
  'HDU_BAY',
  'NICU_BAY',
  'PICU_BAY',
  'ISOLATION_ROOM',
  'OBSERVATION_BAY',
  'OTHER',
] as const;

export const roomClassValues = [
  'GENERAL',
  'SEMI_PRIVATE',
  'PRIVATE',
  'DELUXE',
  'ICU',
  'HDU',
  'NICU',
  'PICU',
  'ISOLATION',
  'OBSERVATION',
  'OTHER',
] as const;

export const bedCategoryValues = [
  'GENERAL',
  'PRIVATE',
  'ICU',
  'HDU',
  'NICU',
  'PICU',
  'ISOLATION',
  'OBSERVATION',
  'BASSINET',
  'OTHER',
] as const;

export const patientSexRestrictionValues = [
  'MALE',
  'FEMALE',
  'OTHER',
  'UNKNOWN',
] as const;

export const isolationCapabilityValues = [
  'STANDARD_PRECAUTIONS',
  'CONTACT',
  'DROPLET',
  'AIRBORNE',
  'PROTECTIVE',
  'NEGATIVE_PRESSURE',
] as const;

export const inpatientBedStatusValues = bedStatuses;

export const bedRateScopeValues = [
  'WARD',
  'ROOM',
  'BED',
  'BED_CATEGORY',
] as const;

export const bedBillingUnitValues = [
  'PER_HOUR',
  'PER_24_HOURS',
  'PER_CALENDAR_DAY',
  'PER_STAY',
] as const;

export const partialDayPolicyValues = [
  'ACTUAL_DURATION',
  'ROUND_UP_TO_FULL_UNIT',
  'ROUND_TO_INCREMENT',
  'MINIMUM_ONE_UNIT',
] as const;

export const sameDayDischargePolicyValues = [
  'ACTUAL_DURATION',
  'MINIMUM_ONE_UNIT',
  'FIXED_SAME_DAY_RATE',
] as const;

export const transferChargingPolicyValues = [
  'SPLIT_AT_TRANSFER_TIME',
  'DESTINATION_FROM_TRANSFER_TIME',
  'HIGHEST_RATE_FOR_CALENDAR_DAY',
] as const;

export const bedRateStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUPERSEDED',
  'CANCELLED',
] as const;

export const bedRateVersionChangeTypeValues = [
  'CREATED',
  'ACTIVATED',
  'SUPERSEDED',
  'CORRECTED',
  'CANCELLED',
  'RECOVERY',
] as const;

export const admissionTypeValues = [
  'EMERGENCY',
  'ELECTIVE',
  'OBSERVATION',
  'TRANSFER_IN',
  'DAY_CARE',
  'OTHER',
] as const;

export const admissionPriorityValues = [
  'ROUTINE',
  'URGENT',
  'STAT',
] as const;

export const admissionRecommendationStatusValues = [
  'ORDERED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CONVERTED',
] as const;

export const admissionStatusValues = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'AWAITING_BED',
  'ADMITTED',
  'TRANSFER_PENDING',
  'DISCHARGE_INITIATED',
  'CLINICALLY_DISCHARGED',
  'FINANCIAL_CLEARANCE_PENDING',
  'DISCHARGED',
  'CANCELLED',
] as const;

export const activeAdmissionStatusValues = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'AWAITING_BED',
  'ADMITTED',
  'TRANSFER_PENDING',
  'DISCHARGE_INITIATED',
  'CLINICALLY_DISCHARGED',
  'FINANCIAL_CLEARANCE_PENDING',
] as const;

export const admissionHistoryChangeTypeValues = [
  'CREATED',
  'ACCEPTED',
  'REJECTED',
  'BED_ASSIGNED',
  'TRANSFER_STARTED',
  'TRANSFER_COMPLETED',
  'DISCHARGE_INITIATED',
  'CLINICALLY_DISCHARGED',
  'FINANCIAL_CLEARANCE_REQUESTED',
  'DISCHARGED',
  'CANCELLED',
  'CORRECTED',
  'RECOVERY',
] as const;

export const bedHoldTypeValues = [
  'ADMISSION_RESERVATION',
  'TRANSFER_RESERVATION',
  'TEMPORARY_HOLD',
  'ISOLATION_RESERVATION',
] as const;

export const bedHoldStatusValues = [
  'ACTIVE',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const bedAssignmentTypeValues = [
  'INITIAL',
  'INTERNAL_TRANSFER',
  'WARD_TRANSFER',
  'ROOM_TRANSFER',
  'TEMPORARY_PLACEMENT',
  'RETURN_FROM_LEAVE',
] as const;

export const bedAssignmentStatusValues = [
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'CORRECTED',
] as const;

export const bedReleaseReasonValues = [
  'TRANSFER',
  'DISCHARGE',
  'DEATH',
  'LEAVE',
  'CANCELLATION',
  'CORRECTION',
  'OTHER',
] as const;

export const bedStatusChangeReasonValues = [
  'ACTIVATED',
  'DEACTIVATED',
  'RESERVED',
  'RESERVATION_RELEASED',
  'OCCUPIED',
  'PATIENT_TRANSFERRED',
  'PATIENT_DISCHARGED',
  'TURNAROUND_STARTED',
  'TURNAROUND_COMPLETED',
  'MAINTENANCE_STARTED',
  'MAINTENANCE_COMPLETED',
  'BLOCKED',
  'UNBLOCKED',
  'CORRECTION',
  'RECOVERY',
] as const;

export const bedChargeSegmentStatusValues = [
  'OPEN',
  'PENDING_BILLING',
  'BILLED',
  'CORRECTION_PENDING',
  'CANCELLED',
  'REVERSED',
] as const;

export type InpatientCatalogStatus =
  (typeof inpatientCatalogStatusValues)[number];

export type WardType =
  (typeof wardTypeValues)[number];

export type RoomType =
  (typeof roomTypeValues)[number];

export type RoomClass =
  (typeof roomClassValues)[number];

export type BedCategory =
  (typeof bedCategoryValues)[number];

export type PatientSexRestriction =
  (typeof patientSexRestrictionValues)[number];

export type IsolationCapability =
  (typeof isolationCapabilityValues)[number];

export type InpatientBedStatus =
  (typeof inpatientBedStatusValues)[number];

export type BedRateScope =
  (typeof bedRateScopeValues)[number];

export type BedBillingUnit =
  (typeof bedBillingUnitValues)[number];

export type PartialDayPolicy =
  (typeof partialDayPolicyValues)[number];

export type SameDayDischargePolicy =
  (typeof sameDayDischargePolicyValues)[number];

export type TransferChargingPolicy =
  (typeof transferChargingPolicyValues)[number];

export type BedRateStatus =
  (typeof bedRateStatusValues)[number];

export type AdmissionType =
  (typeof admissionTypeValues)[number];

export type AdmissionPriority =
  (typeof admissionPriorityValues)[number];

export type AdmissionRecommendationStatus =
  (typeof admissionRecommendationStatusValues)[number];

export type AdmissionStatus =
  (typeof admissionStatusValues)[number];

export type BedHoldType =
  (typeof bedHoldTypeValues)[number];

export type BedHoldStatus =
  (typeof bedHoldStatusValues)[number];

export type BedAssignmentType =
  (typeof bedAssignmentTypeValues)[number];

export type BedAssignmentStatus =
  (typeof bedAssignmentStatusValues)[number];

export type BedChargeSegmentStatus =
  (typeof bedChargeSegmentStatusValues)[number];