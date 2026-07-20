import type {
  NursingAdmissionContext,
} from './nursing-medication.contracts.js';

import type {
  IntakeOutputEntryRecord,
  NursingAssessmentRecord,
  NursingCarePlanRecord,
  NursingDeviceRecord,
  NursingTaskRecord,
} from './nursing-medication.persistence.types.js';

function id(
  value:
    | {
        toHexString(): string;
      }
    | null,
): string | null {
  return value?.toHexString() ?? null;
}

function decimal(
  value:
    | {
        toString(): string;
      }
    | null,
): string | null {
  return value?.toString() ?? null;
}

export interface NursingWorkspaceView {
  admission: {
    id: string;
    number: string;
    status: string;
    admittedAt: string | null;
    clinicallyDischargedAt: string | null;
    dischargedAt: string | null;
  };

  patient:
    NursingAdmissionContext['patient'];

  location:
    NursingAdmissionContext['location'];

  attendingConsultantStaffId: string;

  careTeam:
    NursingAdmissionContext['careTeam'];

  alerts:
    NursingAdmissionContext['alerts'];

  allergies:
    NursingAdmissionContext['allergies'];
}

export function projectNursingWorkspace(
  context: NursingAdmissionContext,
): NursingWorkspaceView {
  return {
    admission: {
      id:
        context.admissionId,

      number:
        context.admissionNumber,

      status:
        context.admissionStatus,

      admittedAt:
        context.admittedAt,

      clinicallyDischargedAt:
        context.clinicallyDischargedAt,

      dischargedAt:
        context.dischargedAt,
    },

    patient:
      context.patient,

    location:
      context.location,

    attendingConsultantStaffId:
      context.attendingConsultantStaffId,

    careTeam:
      context.careTeam,

    alerts:
      context.alerts,

    allergies:
      context.allergies,
  };
}

export interface NursingAssessmentSummaryView {
  id: string;
  assessmentNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  assessmentType: string;
  overallRiskLevel: string;
  requiresEscalation: boolean;
  assessedAt: string;
  recordedAt: string;
  assessedByStaffId: string;
  status: string;
  signedAt: string | null;
  revisionNumber: number;
  version: number;
  updatedAt: string;
}

export function projectNursingAssessmentSummary(
  record: NursingAssessmentRecord,
): NursingAssessmentSummaryView {
  return {
    id:
      record._id.toHexString(),

    assessmentNumber:
      record.assessmentNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    assessmentType:
      record.assessmentType,

    overallRiskLevel:
      record.overallRiskLevel,

    requiresEscalation:
      record.requiresEscalation,

    assessedAt:
      record.assessedAt.toISOString(),

    recordedAt:
      record.recordedAt.toISOString(),

    assessedByStaffId:
      record.assessedByStaffId.toHexString(),

    status:
      record.status,

    signedAt:
      record.signedAt
        ?.toISOString() ?? null,

    revisionNumber:
      record.revisionNumber,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export interface NursingAssessmentClinicalView
extends NursingAssessmentSummaryView {
  roomId: string | null;
  bedId: string | null;
  templateCode: string | null;
  templateVersion: number | null;

  sections: readonly {
    sectionCode: string;
    sectionLabel: string;
    values:
      Readonly<Record<string, unknown>>;
    narrative: string | null;
    riskLevel: string;
    score: string | null;
  }[];

  summary: string | null;
  escalationReason: string | null;
  backdatedEntryReason: string | null;
  correctionReason: string | null;
  enteredInErrorReason: string | null;
}

export function projectNursingAssessmentClinical(
  record: NursingAssessmentRecord,
): NursingAssessmentClinicalView {
  return {
    ...projectNursingAssessmentSummary(
      record,
    ),

    roomId:
      id(record.roomId),

    bedId:
      id(record.bedId),

    templateCode:
      record.templateCode,

    templateVersion:
      record.templateVersion,

    sections:
      record.sections.map(
        (section) => ({
          sectionCode:
            section.sectionCode,

          sectionLabel:
            section.sectionLabel,

          values:
            section.values,

          narrative:
            section.narrative,

          riskLevel:
            section.riskLevel,

          score:
            decimal(
              section.score,
            ),
        }),
      ),

    summary:
      record.summary,

    escalationReason:
      record.escalationReason,

    backdatedEntryReason:
      record.backdatedEntryReason,

    correctionReason:
      record.correctionReason,

    enteredInErrorReason:
      record.enteredInErrorReason,
  };
}

export interface NursingCarePlanSummaryView {
  id: string;
  carePlanNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  title: string;
  status: string;
  assignedNurseStaffId: string | null;
  assignedTeamCode: string | null;
  startedAt: string;
  targetCompletionAt: string | null;
  nextReviewAt: string | null;
  problemCount: number;
  activeInterventionCount: number;
  revisionNumber: number;
  version: number;
  updatedAt: string;
}

export function projectNursingCarePlanSummary(
  record: NursingCarePlanRecord,
): NursingCarePlanSummaryView {
  return {
    id:
      record._id.toHexString(),

    carePlanNumber:
      record.carePlanNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    title:
      record.title,

    status:
      record.status,

    assignedNurseStaffId:
      id(
        record.assignedNurseStaffId,
      ),

    assignedTeamCode:
      record.assignedTeamCode,

    startedAt:
      record.startedAt.toISOString(),

    targetCompletionAt:
      record.targetCompletionAt
        ?.toISOString() ?? null,

    nextReviewAt:
      record.nextReviewAt
        ?.toISOString() ?? null,

    problemCount:
      record.problems.length,

    activeInterventionCount:
      record.problems.reduce(
        (
          total,
          problem,
        ) =>
          total +
          problem.interventions.filter(
            (intervention) =>
              intervention.active,
          ).length,
        0,
      ),

    revisionNumber:
      record.revisionNumber,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export interface NursingTaskSummaryView {
  id: string;
  taskNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  sourceType: string;
  title: string;
  priority: string;
  status: string;
  assignedStaffId: string | null;
  assignedTeamCode: string | null;
  scheduledAt: string | null;
  dueAt: string;
  completedAt: string | null;
  dispositionReasonCode: string | null;
  version: number;
  updatedAt: string;
}

export function projectNursingTaskSummary(
  record: NursingTaskRecord,
): NursingTaskSummaryView {
  return {
    id:
      record._id.toHexString(),

    taskNumber:
      record.taskNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    sourceType:
      record.sourceType,

    title:
      record.title,

    priority:
      record.priority,

    status:
      record.status,

    assignedStaffId:
      id(
        record.assignedStaffId,
      ),

    assignedTeamCode:
      record.assignedTeamCode,

    scheduledAt:
      record.scheduledAt
        ?.toISOString() ?? null,

    dueAt:
      record.dueAt.toISOString(),

    completedAt:
      record.completedAt
        ?.toISOString() ?? null,

    dispositionReasonCode:
      record.dispositionReasonCode,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export interface IntakeOutputEntryView {
  id: string;
  entryNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  direction: string;
  category: string;
  sourceDescription: string | null;
  volumeMillilitres: string;
  originalQuantity: string;
  originalUnitCode: string;
  occurredAt: string;
  recordedAt: string;
  shiftCode: string;
  recordedByStaffId: string;
  status: string;
  revisionNumber: number;
  version: number;
}

export function projectIntakeOutputEntry(
  record: IntakeOutputEntryRecord,
): IntakeOutputEntryView {
  return {
    id:
      record._id.toHexString(),

    entryNumber:
      record.entryNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    direction:
      record.direction,

    category:
      record.category,

    sourceDescription:
      record.sourceDescription,

    volumeMillilitres:
      record.volumeMillilitres.toString(),

    originalQuantity:
      record.originalQuantity.toString(),

    originalUnitCode:
      record.originalUnitCode,

    occurredAt:
      record.occurredAt.toISOString(),

    recordedAt:
      record.recordedAt.toISOString(),

    shiftCode:
      record.shiftCode,

    recordedByStaffId:
      record.recordedByStaffId.toHexString(),

    status:
      record.status,

    revisionNumber:
      record.revisionNumber,

    version:
      record.version,
  };
}

export interface NursingDeviceSummaryView {
  id: string;
  deviceNumber: string;
  admissionId: string;
  patientId: string;
  wardId: string;
  deviceType: string;
  deviceName: string;
  anatomicalSite: string;
  laterality: string | null;
  insertedAt: string | null;
  status: string;
  removedAt: string | null;
  version: number;
  updatedAt: string;
}

export function projectNursingDeviceSummary(
  record: NursingDeviceRecord,
): NursingDeviceSummaryView {
  return {
    id:
      record._id.toHexString(),

    deviceNumber:
      record.deviceNumber,

    admissionId:
      record.admissionId.toHexString(),

    patientId:
      record.patientId.toHexString(),

    wardId:
      record.wardId.toHexString(),

    deviceType:
      record.deviceType,

    deviceName:
      record.deviceName,

    anatomicalSite:
      record.anatomicalSite,

    laterality:
      record.laterality,

    insertedAt:
      record.insertedAt
        ?.toISOString() ?? null,

    status:
      record.status,

    removedAt:
      record.removedAt
        ?.toISOString() ?? null,

    version:
      record.version,

    updatedAt:
      record.updatedAt.toISOString(),
  };
}