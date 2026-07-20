export const nursingAssessmentTypeValues = [
  'ADMISSION',
  'INITIAL',
  'ONGOING',
  'HEAD_TO_TOE',
  'NEUROLOGICAL',
  'RESPIRATORY',
  'CARDIOVASCULAR',
  'GASTROINTESTINAL',
  'GENITOURINARY',
  'SKIN_WOUND',
  'MOBILITY',
  'PAIN',
  'FALL_RISK',
  'PRESSURE_INJURY_RISK',
  'NUTRITION',
  'FUNCTIONAL_STATUS',
  'PSYCHOSOCIAL',
  'INFECTION_CONTROL',
  'CUSTOM',
] as const;

export const nursingAssessmentStatusValues = [
  'DRAFT',
  'SIGNED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingAssessmentRiskLevelValues = [
  'NONE',
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL',
  'NOT_ASSESSED',
] as const;

export const nursingCarePlanStatusValues = [
  'DRAFT',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingCarePlanProblemStatusValues = [
  'ACTIVE',
  'IMPROVING',
  'UNCHANGED',
  'DETERIORATING',
  'RESOLVED',
  'CANCELLED',
] as const;

export const nursingCarePlanGoalStatusValues = [
  'PLANNED',
  'IN_PROGRESS',
  'ACHIEVED',
  'PARTIALLY_ACHIEVED',
  'NOT_ACHIEVED',
  'CANCELLED',
] as const;

export const nursingInterventionFrequencyTypeValues = [
  'ONCE',
  'HOURLY',
  'INTERVAL',
  'SHIFT',
  'DAILY',
  'WEEKLY',
  'PRN',
  'CUSTOM',
] as const;

export const nursingTaskStatusValues = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'OMITTED',
  'DELAYED',
  'REFUSED',
  'CANCELLED',
  'ESCALATED',
] as const;

export const nursingTaskPriorityValues = [
  'ROUTINE',
  'URGENT',
  'STAT',
  'CRITICAL',
] as const;

export const nursingTaskSourceTypeValues = [
  'MANUAL',
  'CARE_PLAN',
  'PHYSICIAN_ORDER',
  'MEDICATION_SCHEDULE',
  'OBSERVATION',
  'DEVICE',
  'DISCHARGE_READINESS',
] as const;

export const intakeOutputDirectionValues = [
  'INTAKE',
  'OUTPUT',
] as const;

export const intakeOutputCategoryValues = [
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

export const intakeOutputEntryStatusValues = [
  'ACTIVE',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingDeviceTypeValues = [
  'WOUND',
  'DRAIN',
  'URINARY_CATHETER',
  'PERIPHERAL_IV',
  'CENTRAL_LINE',
  'ARTERIAL_LINE',
  'ENTERAL_TUBE',
  'AIRWAY',
  'OTHER',
] as const;

export const nursingDeviceStatusValues = [
  'ACTIVE',
  'REMOVED',
  'DISCONTINUED',
  'ENTERED_IN_ERROR',
] as const;

export const nursingDeviceObservationTypeValues = [
  'INSERTION',
  'ASSESSMENT',
  'DRESSING_CHANGE',
  'OUTPUT',
  'COMPLICATION',
  'REMOVAL',
  'CORRECTION',
] as const;

export const woundClassificationValues = [
  'PRESSURE_INJURY',
  'SURGICAL',
  'TRAUMATIC',
  'DIABETIC',
  'VENOUS',
  'ARTERIAL',
  'BURN',
  'MOISTURE_ASSOCIATED',
  'OTHER',
  'NOT_APPLICABLE',
] as const;

export type NursingAssessmentType =
  (typeof nursingAssessmentTypeValues)[number];

export type NursingAssessmentStatus =
  (typeof nursingAssessmentStatusValues)[number];

export type NursingAssessmentRiskLevel =
  (typeof nursingAssessmentRiskLevelValues)[number];

export type NursingCarePlanStatus =
  (typeof nursingCarePlanStatusValues)[number];

export type NursingCarePlanProblemStatus =
  (typeof nursingCarePlanProblemStatusValues)[number];

export type NursingCarePlanGoalStatus =
  (typeof nursingCarePlanGoalStatusValues)[number];

export type NursingInterventionFrequencyType =
  (typeof nursingInterventionFrequencyTypeValues)[number];

export type NursingTaskStatus =
  (typeof nursingTaskStatusValues)[number];

export type NursingTaskPriority =
  (typeof nursingTaskPriorityValues)[number];

export type NursingTaskSourceType =
  (typeof nursingTaskSourceTypeValues)[number];

export type IntakeOutputDirection =
  (typeof intakeOutputDirectionValues)[number];

export type IntakeOutputCategory =
  (typeof intakeOutputCategoryValues)[number];

export type IntakeOutputEntryStatus =
  (typeof intakeOutputEntryStatusValues)[number];

export type NursingDeviceType =
  (typeof nursingDeviceTypeValues)[number];

export type NursingDeviceStatus =
  (typeof nursingDeviceStatusValues)[number];

export type NursingDeviceObservationType =
  (typeof nursingDeviceObservationTypeValues)[number];

export type WoundClassification =
  (typeof woundClassificationValues)[number];