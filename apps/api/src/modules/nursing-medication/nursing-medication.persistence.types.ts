import type {
  Types,
} from 'mongoose';

import type {
  IntakeOutputCategory,
  IntakeOutputDirection,
  IntakeOutputEntryStatus,
  NursingAssessmentRiskLevel,
  NursingAssessmentStatus,
  NursingAssessmentType,
  NursingCarePlanGoalStatus,
  NursingCarePlanProblemStatus,
  NursingCarePlanStatus,
  NursingDeviceObservationType,
  NursingDeviceStatus,
  NursingDeviceType,
  NursingInterventionFrequencyType,
  NursingTaskPriority,
  NursingTaskSourceType,
  NursingTaskStatus,
  WoundClassification,
} from '@hospital-mis/database';

export interface NursingPersistenceMetadata {
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  idempotencyKey: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface NursingImmutableMetadata {
  facilityId: Types.ObjectId;
  admissionId: Types.ObjectId;
  patientId: Types.ObjectId;
  encounterId: Types.ObjectId;
  wardId: Types.ObjectId;
  roomId: Types.ObjectId | null;
  bedId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface NursingAssessmentSectionRecord {
  sectionCode: string;
  sectionLabel: string;
  values: Record<string, unknown>;
  narrative: string | null;
  riskLevel: NursingAssessmentRiskLevel;
  score: Types.Decimal128 | null;
}

export interface NursingAssessmentRecord
extends NursingPersistenceMetadata {
  _id: Types.ObjectId;
  assessmentNumber: string;
  assessmentType: NursingAssessmentType;
  templateCode: string | null;
  templateVersion: number | null;
  sections: NursingAssessmentSectionRecord[];
  summary: string | null;
  overallRiskLevel: NursingAssessmentRiskLevel;
  requiresEscalation: boolean;
  escalationReason: string | null;
  assessedAt: Date;
  recordedAt: Date;
  backdatedEntryReason: string | null;
  assessedByUserId: Types.ObjectId;
  assessedByStaffId: Types.ObjectId;
  status: NursingAssessmentStatus;
  signedAt: Date | null;
  signedByUserId: Types.ObjectId | null;
  signedByStaffId: Types.ObjectId | null;
  revisionNumber: number;
  rootAssessmentId: Types.ObjectId;
  supersedesAssessmentId: Types.ObjectId | null;
  supersededByAssessmentId: Types.ObjectId | null;
  correctionReason: string | null;
  enteredInErrorAt: Date | null;
  enteredInErrorByUserId: Types.ObjectId | null;
  enteredInErrorByStaffId: Types.ObjectId | null;
  enteredInErrorReason: string | null;
}

export interface NursingAssessmentVersionRecord
extends NursingImmutableMetadata {
  _id: Types.ObjectId;
  nursingAssessmentId: Types.ObjectId;
  rootAssessmentId: Types.ObjectId;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  capturedAt: Date;
  capturedByUserId: Types.ObjectId;
  capturedByStaffId: Types.ObjectId;
  reason: string;
}

export interface NursingCarePlanGoalRecord {
  goalId: Types.ObjectId;
  description: string;
  expectedOutcome: string;
  targetDate: Date | null;
  status: NursingCarePlanGoalStatus;
  evaluation: string | null;
  evaluatedAt: Date | null;
  evaluatedByStaffId: Types.ObjectId | null;
}

export interface NursingInterventionFrequencyRecord {
  type: NursingInterventionFrequencyType;
  intervalMinutes: number | null;
  timesOfDay: string[];
  shiftCodes: string[];
  instruction: string | null;
}

export interface NursingCarePlanInterventionRecord {
  interventionId: Types.ObjectId;
  description: string;
  frequency: NursingInterventionFrequencyRecord;
  assignedStaffId: Types.ObjectId | null;
  assignedTeamCode: string | null;
  startsAt: Date;
  endsAt: Date | null;
  active: boolean;
}

export interface NursingCarePlanProblemRecord {
  problemId: Types.ObjectId;
  problemCode: string | null;
  description: string;
  identifiedAt: Date;
  sourceAssessmentId: Types.ObjectId | null;
  status: NursingCarePlanProblemStatus;
  goals: NursingCarePlanGoalRecord[];
  interventions:
    NursingCarePlanInterventionRecord[];
}

export interface NursingCarePlanRecord
extends NursingPersistenceMetadata {
  _id: Types.ObjectId;
  carePlanNumber: string;
  title: string;
  status: NursingCarePlanStatus;
  problems: NursingCarePlanProblemRecord[];
  assignedNurseStaffId: Types.ObjectId | null;
  assignedTeamCode: string | null;
  startedAt: Date;
  targetCompletionAt: Date | null;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  lastReviewedByStaffId: Types.ObjectId | null;
  outcomeEvaluation: string | null;
  completedAt: Date | null;
  completedByStaffId: Types.ObjectId | null;
  cancellationReason: string | null;
  revisionNumber: number;
  rootCarePlanId: Types.ObjectId;
  supersedesCarePlanId: Types.ObjectId | null;
  supersededByCarePlanId: Types.ObjectId | null;
  correctionReason: string | null;
}

export interface NursingCarePlanVersionRecord
extends NursingImmutableMetadata {
  _id: Types.ObjectId;
  nursingCarePlanId: Types.ObjectId;
  rootCarePlanId: Types.ObjectId;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  capturedAt: Date;
  capturedByUserId: Types.ObjectId;
  capturedByStaffId: Types.ObjectId;
  reason: string;
}

export interface NursingTaskRecord
extends NursingPersistenceMetadata {
  _id: Types.ObjectId;
  taskNumber: string;
  sourceType: NursingTaskSourceType;
  sourceRecordId: Types.ObjectId | null;
  carePlanId: Types.ObjectId | null;
  carePlanInterventionId: Types.ObjectId | null;
  title: string;
  instructions: string | null;
  priority: NursingTaskPriority;
  status: NursingTaskStatus;
  assignedStaffId: Types.ObjectId | null;
  assignedTeamCode: string | null;
  scheduledAt: Date | null;
  dueAt: Date;
  recurrenceKey: string | null;
  carriedForwardFromTaskId: Types.ObjectId | null;
  carriedForwardToTaskId: Types.ObjectId | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completedByUserId: Types.ObjectId | null;
  completedByStaffId: Types.ObjectId | null;
  dispositionReasonCode: string | null;
  dispositionReason: string | null;
  escalatedAt: Date | null;
  escalatedToStaffId: Types.ObjectId | null;
  escalationReason: string | null;
}

export interface IntakeOutputEntryRecord
extends NursingPersistenceMetadata {
  _id: Types.ObjectId;
  entryNumber: string;
  direction: IntakeOutputDirection;
  category: IntakeOutputCategory;
  sourceDescription: string | null;
  volumeMillilitres: Types.Decimal128;
  originalQuantity: Types.Decimal128;
  originalUnitCode: string;
  conversionFactorToMillilitres: Types.Decimal128;
  occurredAt: Date;
  recordedAt: Date;
  shiftCode: string;
  recordedByUserId: Types.ObjectId;
  recordedByStaffId: Types.ObjectId;
  status: IntakeOutputEntryStatus;
  rootEntryId: Types.ObjectId;
  revisionNumber: number;
  supersedesEntryId: Types.ObjectId | null;
  supersededByEntryId: Types.ObjectId | null;
  correctionReason: string | null;
  enteredInErrorAt: Date | null;
  enteredInErrorByUserId: Types.ObjectId | null;
  enteredInErrorByStaffId: Types.ObjectId | null;
  enteredInErrorReason: string | null;
}

export interface NursingWoundDetailsRecord {
  classification: WoundClassification;
  anatomicalLocation: string | null;
  stageOrGrade: string | null;
  lengthCm: Types.Decimal128 | null;
  widthCm: Types.Decimal128 | null;
  depthCm: Types.Decimal128 | null;
  dressingType: string | null;
}

export interface NursingDeviceRecord
extends NursingPersistenceMetadata {
  _id: Types.ObjectId;
  deviceNumber: string;
  deviceType: NursingDeviceType;
  deviceName: string;
  anatomicalSite: string;
  laterality: string | null;
  woundDetails: NursingWoundDetailsRecord | null;
  insertedAt: Date | null;
  insertedByStaffId: Types.ObjectId | null;
  status: NursingDeviceStatus;
  removedAt: Date | null;
  removedByStaffId: Types.ObjectId | null;
  removalReason: string | null;
}

export interface NursingDeviceObservationRecord
extends NursingImmutableMetadata {
  _id: Types.ObjectId;
  nursingDeviceId: Types.ObjectId;
  observationNumber: string;
  observationType: NursingDeviceObservationType;
  observedAt: Date;
  recordedAt: Date;
  observedByUserId: Types.ObjectId;
  observedByStaffId: Types.ObjectId;
  siteCondition: string | null;
  dressingType: string | null;
  outputMillilitres: Types.Decimal128 | null;
  infectionIndicators: string[];
  findings: Record<string, unknown>;
  narrative: string | null;
  requiresEscalation: boolean;
  escalationReason: string | null;
}