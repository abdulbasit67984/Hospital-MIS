import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  NURSING_MEDICATION_PERMISSION_KEYS,
} from '../nursing-medication.constants.js';

import {
  NursingBreakGlassReasonRequiredError,
} from '../nursing-medication.errors.js';

import type {
  NursingAccessAction,
  NursingAccessDecision,
  NursingAccessMode,
  NursingAccessPolicyPort,
  NursingAccessRequest,
  NursingContextActorIdentityRecord,
  NursingContextStaffRecord,
} from '../nursing-medication.ports.js';

import {
  NursingMedicationContextRepository,
} from '../repositories/nursing-medication-context.repository.js';

export interface NursingAccessIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<
    NursingContextActorIdentityRecord | null
  >;

  findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<
    NursingContextStaffRecord | null
  >;
}

function denied(
  reason: string,
): NursingAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    denialReason: reason,
  };
}

function allowed(
  accessMode:
    NursingAccessMode,

  minimumNecessaryFields:
    readonly string[],

  auditSensitiveRead:
    boolean,
): NursingAccessDecision {
  return {
    allowed: true,
    accessMode,
    minimumNecessaryFields,
    auditSensitiveRead,
  };
}

function requiredPermission(
  action: NursingAccessAction,
): PermissionKey {
  switch (action) {
    case 'WORKSPACE_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.WORKSPACE_READ;

    case 'ASSESSMENT_CREATE':
      return NURSING_MEDICATION_PERMISSION_KEYS.ASSESSMENT_CREATE;

    case 'ASSESSMENT_SIGN':
      return NURSING_MEDICATION_PERMISSION_KEYS.ASSESSMENT_SIGN;

    case 'ASSESSMENT_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.ASSESSMENT_CORRECT;

    case 'CARE_PLAN_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.CARE_PLAN_READ;

    case 'CARE_PLAN_MANAGE':
      return NURSING_MEDICATION_PERMISSION_KEYS.CARE_PLAN_MANAGE;

    case 'CARE_PLAN_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.CARE_PLAN_CORRECT;

    case 'TASK_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.TASK_READ;

    case 'TASK_MANAGE':
      return NURSING_MEDICATION_PERMISSION_KEYS.TASK_MANAGE;

    case 'INTAKE_OUTPUT_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.INTAKE_OUTPUT_READ;

    case 'INTAKE_OUTPUT_RECORD':
      return NURSING_MEDICATION_PERMISSION_KEYS.INTAKE_OUTPUT_RECORD;

    case 'INTAKE_OUTPUT_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.INTAKE_OUTPUT_CORRECT;

    case 'DEVICE_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.DEVICE_READ;

    case 'DEVICE_RECORD':
      return NURSING_MEDICATION_PERMISSION_KEYS.DEVICE_RECORD;

    case 'DEVICE_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.DEVICE_CORRECT;

    case 'VITAL_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.VITAL_READ;

    case 'VITAL_RECORD':
      return NURSING_MEDICATION_PERMISSION_KEYS.VITAL_RECORD;

    case 'VITAL_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.VITAL_CORRECT;

    case 'NOTE_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.NOTE_READ;

    case 'NOTE_CREATE':
      return NURSING_MEDICATION_PERMISSION_KEYS.NOTE_CREATE;

    case 'NOTE_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.NOTE_CORRECT;

    case 'MEDICATION_SCHEDULE_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.MEDICATION_SCHEDULE_READ;

    case 'MEDICATION_ADMINISTER':
      return NURSING_MEDICATION_PERMISSION_KEYS.MEDICATION_ADMINISTER;

    case 'MEDICATION_CORRECT':
      return NURSING_MEDICATION_PERMISSION_KEYS.MEDICATION_CORRECT;

    case 'MEDICATION_WITNESS':
      return NURSING_MEDICATION_PERMISSION_KEYS.MEDICATION_WITNESS;

    case 'HANDOVER_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.HANDOVER_READ;

    case 'HANDOVER_MANAGE':
      return NURSING_MEDICATION_PERMISSION_KEYS.HANDOVER_MANAGE;

    case 'REPORT_READ':
      return NURSING_MEDICATION_PERMISSION_KEYS.REPORT_READ;
  }
}

function isReadAction(
  action: NursingAccessAction,
): boolean {
  return [
    'WORKSPACE_READ',
    'CARE_PLAN_READ',
    'TASK_READ',
    'INTAKE_OUTPUT_READ',
    'DEVICE_READ',
    'VITAL_READ',
    'NOTE_READ',
    'MEDICATION_SCHEDULE_READ',
    'HANDOVER_READ',
    'REPORT_READ',
  ].includes(
    action,
  );
}

function nursingWorkspaceFields():
readonly string[] {
  return [
    'minimumPatientIdentity',
    'admissionIdentityAndStatus',
    'currentWardRoomBed',
    'attendingConsultantAndCareTeam',
    'allergies',
    'activeAlertsAndPrecautions',
    'dueObservations',
    'dueMedicationDoses',
    'pendingNursingTasks',
    'handoverStatus',
  ];
}

function nursingClinicalFields():
readonly string[] {
  return [
    ...nursingWorkspaceFields(),
    'structuredAssessments',
    'nursingNotes',
    'carePlansAndInterventions',
    'vitalSignTimeline',
    'intakeOutputTimelineAndBalance',
    'woundsDrainsLinesAndDevices',
    'medicationAdministrationRecord',
    'correctionAndEnteredInErrorHistory',
  ];
}

function medicalRecordsFields():
readonly string[] {
  return [
    'minimumPatientIdentity',
    'admissionIdentityAndStatus',
    'signedAssessmentMetadata',
    'signedNursingNoteMetadata',
    'medicationAdministrationHistory',
    'handoverMetadata',
    'correctionAndEnteredInErrorHistory',
  ];
}

export class NursingMedicationAccessPolicyService
implements NursingAccessPolicyPort {
  public constructor(
    private readonly identities:
      NursingAccessIdentityReader =
        new NursingMedicationContextRepository(),
  ) {}

  public async authorize(
    request: NursingAccessRequest,
  ): Promise<NursingAccessDecision> {
    const identity =
      await this.identities.findActorIdentity(
        request.actor.userId,
      );

    if (
      identity === null ||
      identity.status !==
        'ACTIVE'
    ) {
      return denied(
        'The authenticated nursing actor is not active',
      );
    }

    if (
      identity.facilityId !==
        null &&
      identity.facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The authenticated nursing actor belongs to another facility',
      );
    }

    if (
      request.context.facilityId !==
      request.actor.facilityId
    ) {
      return denied(
        'The nursing admission belongs to another facility',
      );
    }

    const permission =
      requiredPermission(
        request.action,
      );

    if (
      !request.actor.permissionKeys.includes(
        permission,
      )
    ) {
      return denied(
        `The operation requires ${permission}`,
      );
    }

    const staff =
      identity.staffId ===
      null
        ? null
        : await this.identities.findStaff(
            request.actor.facilityId,
            identity.staffId,
          );

    if (
      staff === null ||
      !staff.isActive ||
      !staff.isClinical ||
      staff.employmentStatus !==
        'ACTIVE'
    ) {
      return denied(
        'The acting user is not linked to active clinical staff',
      );
    }

    const activeCareTeamMember =
      request.context.careTeam.some(
        (member) =>
          member.staffId ===
            staff.staffId &&
          member.endedAt ===
            null,
      );

    const attendingConsultant =
      request.context
        .attendingConsultantStaffId ===
      staff.staffId;

    const sameWardDepartment =
      staff.departmentId !==
        null &&
      staff.departmentId ===
        request.context.location
          .departmentId;

    const wardNurse =
      request.actor.roleKeys.includes(
        'WARD_NURSE',
      );

    const medicalRecordsOfficer =
      request.actor.roleKeys.includes(
        'MEDICAL_RECORDS_OFFICER',
      );

    if (
      wardNurse &&
      sameWardDepartment
    ) {
      return allowed(
        'WARD_ASSIGNED',

        isReadAction(
          request.action,
        )
          ? nursingWorkspaceFields()
          : nursingClinicalFields(),

        isReadAction(
          request.action,
        ),
      );
    }

    if (
      activeCareTeamMember ||
      attendingConsultant
    ) {
      return allowed(
        'CARE_TEAM',
        nursingClinicalFields(),
        isReadAction(
          request.action,
        ),
      );
    }

    if (
      isReadAction(
        request.action,
      ) &&
      medicalRecordsOfficer
    ) {
      return allowed(
        'MEDICAL_RECORDS',
        medicalRecordsFields(),
        true,
      );
    }

    if (
      isReadAction(
        request.action,
      ) &&
      request.actor.permissionKeys.includes(
        NURSING_MEDICATION_PERMISSION_KEYS.BREAK_GLASS,
      )
    ) {
      const reason =
        request.actor.breakGlassReason
          ?.trim() ?? '';

      if (
        reason.length < 10
      ) {
        throw new NursingBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        nursingClinicalFields(),
        true,
      );
    }

    return denied(
      'Nursing access requires current ward responsibility, active care-team responsibility, medical-records responsibility, or documented emergency access',
    );
  }
}