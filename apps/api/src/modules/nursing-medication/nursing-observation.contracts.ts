import type {
  ClinicalConfidentiality,
  VitalSignBodyPosition,
  VitalSignSource,
  VitalSignStatus,
  VitalSignTemperatureSite,
  WardHandoverStatus,
  WardHandoverType,
} from '@hospital-mis/database';

import type {
  NursingMedicationActorContext,
  NursingMedicationObjectIdString,
} from './nursing-medication.contracts.js';

export interface NursingVitalMeasurementInput {
  admissionId: NursingMedicationObjectIdString;
  measuredAt: string;
  source?: VitalSignSource;
  deviceIdentifier?: string | null;
  bodyPosition?: VitalSignBodyPosition;
  temperatureCelsius?: string | null;
  temperatureSite?: VitalSignTemperatureSite;
  pulsePerMinute?: number | null;
  respiratoryRatePerMinute?: number | null;
  systolicBloodPressureMmHg?: number | null;
  diastolicBloodPressureMmHg?: number | null;
  oxygenSaturationPercent?: string | null;
  bloodGlucoseMgDl?: string | null;
  painScore?: number | null;
  weightKg?: string | null;
  heightCm?: string | null;
  oxygenDeliveryMethod?: string | null;
  oxygenFlowLitresPerMinute?: string | null;
  notes?: string | null;
  confidentiality?: ClinicalConfidentiality;
  restrictionReason?: string | null;
  backdatedEntryReason?: string | null;
}

export interface CorrectNursingVitalObservationInput
extends NursingVitalMeasurementInput {
  expectedVersion: number;
  reason: string;
}

export interface EnterNursingVitalObservationInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface NursingVitalMutationResult {
  vitalSignId: string;
  facilityId: string;
  admissionId: string | null;
  encounterId: string;
  patientId: string;
  observerProviderId: string;
  source: VitalSignSource;
  deviceIdentifier: string | null;
  measuredAt: string;
  recordedAt: string;
  bodyPosition: VitalSignBodyPosition;
  temperatureCelsius: string | null;
  temperatureSite: VitalSignTemperatureSite;
  pulsePerMinute: number | null;
  respiratoryRatePerMinute: number | null;
  systolicBloodPressureMmHg: number | null;
  diastolicBloodPressureMmHg: number | null;
  oxygenSaturationPercent: string | null;
  bloodGlucoseMgDl: string | null;
  painScore: number | null;
  weightKg: string | null;
  heightCm: string | null;
  bmi: string | null;
  oxygenDeliveryMethod: string | null;
  oxygenFlowLitresPerMinute: string | null;
  status: VitalSignStatus;
  supersedesVitalSignId: string | null;
  supersededByVitalSignId: string | null;
  version: number;
}

export interface NursingObservationThresholdRule {
  code: string;

  measurement:
    | 'TEMPERATURE_CELSIUS'
    | 'PULSE_PER_MINUTE'
    | 'RESPIRATORY_RATE_PER_MINUTE'
    | 'SYSTOLIC_BLOOD_PRESSURE_MMHG'
    | 'DIASTOLIC_BLOOD_PRESSURE_MMHG'
    | 'OXYGEN_SATURATION_PERCENT'
    | 'BLOOD_GLUCOSE_MG_DL'
    | 'PAIN_SCORE';

  minimumInclusive?: number | null;
  maximumInclusive?: number | null;
  score: number;

  severity:
    | 'ATTENTION'
    | 'URGENT'
    | 'CRITICAL';

  requiresImmediateEscalation: boolean;
  message: string;
}

export interface NursingObservationThresholdConfiguration {
  facilityId: string;
  wardId?: string | null;
  configurationVersion: number;
  rules: readonly NursingObservationThresholdRule[];
  supplementalOxygenScore: number;
  urgentScoreThreshold: number;
  criticalScoreThreshold: number;
}

export interface NursingObservationTriggeredRule {
  code: string;
  measurement: NursingObservationThresholdRule['measurement'];
  observedValue: number;
  score: number;
  severity: NursingObservationThresholdRule['severity'];
  requiresImmediateEscalation: boolean;
  message: string;
}

export interface NursingDeteriorationEvaluation {
  configurationVersion: number;
  totalScore: number;

  severity:
    | 'ROUTINE'
    | 'ATTENTION'
    | 'URGENT'
    | 'CRITICAL';

  requiresEscalation: boolean;
  requiresImmediateEscalation: boolean;
  triggeredRules: readonly NursingObservationTriggeredRule[];
}

export interface NursingVitalObservationResult {
  vitalSign: NursingVitalMutationResult;
  deterioration: NursingDeteriorationEvaluation;
  escalationTaskId: string | null;
}

export interface NursingVitalTrendQuery {
  admissionId: string;
  measuredFrom?: string;
  measuredTo?: string;
  status?: VitalSignStatus;
  page: number;
  pageSize: number;
}

export interface CorrectWardHandoverInput {
  expectedVersion: number;
  reason: string;

  replacement: {
    handoverType: WardHandoverType;
    shiftCode: string;
    summary: string;
    activeConcerns?: readonly string[];
    pendingTasks?: readonly string[];
    medicationConcerns?: readonly string[];
    safetyConcerns?: readonly string[];
    toNurseUserId: string;
    toNurseStaffId: string;
    handedOverAt: string;
  };
}

export interface EnterWardHandoverInErrorInput {
  expectedVersion: number;
  reason: string;
}

export interface WardHandoverListQuery {
  admissionId?: string;
  wardId?: string;
  toNurseStaffId?: string;
  status?: WardHandoverStatus;
  handedOverFrom?: string;
  handedOverTo?: string;
  page: number;
  pageSize: number;
}

export interface NursingObservationCommand<T> {
  actor: NursingMedicationActorContext;
  input: T;
  idempotencyKey: string;
}

export interface NursingObservationEntityCommand<T>
extends NursingObservationCommand<T> {
  entityId: string;
}