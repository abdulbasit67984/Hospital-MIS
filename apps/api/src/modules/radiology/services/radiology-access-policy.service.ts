import {
  RADIOLOGY_PERMISSION_KEYS,
} from '../radiology.constants.js';

import {
  RadiologyBreakGlassReasonRequiredError,
  RadiologyProviderAttributionError,
} from '../radiology.errors.js';

import type {
  RadiologyAccessAction,
  RadiologyAccessDecision,
  RadiologyAccessMode,
  RadiologyAccessPolicyPort,
  RadiologyAccessRequest,
} from '../radiology.ports.js';

import type {
  RadiologyActorIdentityRecord,
} from '../repositories/radiology-context.repository.js';

import {
  RadiologyContextRepository,
} from '../repositories/radiology-context.repository.js';

export interface RadiologyActorIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<RadiologyActorIdentityRecord | null>;
}

function denied(
  reason: string,
): RadiologyAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    denialReason: reason,
  };
}

function allowed(
  accessMode: RadiologyAccessMode,
  minimumNecessaryFields: readonly string[],
  auditSensitiveRead: boolean,
): RadiologyAccessDecision {
  return {
    allowed: true,
    accessMode,
    minimumNecessaryFields,
    auditSensitiveRead,
  };
}

function hasPermission(
  request: RadiologyAccessRequest,
  permission: string,
): boolean {
  return request.actor.permissionKeys.includes(permission);
}

function requiredPermission(
  action: RadiologyAccessAction,
): string {
  switch (action) {
    case 'CATALOG_READ':
      return RADIOLOGY_PERMISSION_KEYS.CATALOG_READ;

    case 'CATALOG_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.CATALOG_MANAGE;

    case 'ORDER_READ':
      return RADIOLOGY_PERMISSION_KEYS.ORDERS_READ;

    case 'ORDER_CREATE':
      return RADIOLOGY_PERMISSION_KEYS.ORDERS_CREATE;

    case 'ORDER_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.ORDERS_MANAGE;

    case 'ORDER_CANCEL':
      return RADIOLOGY_PERMISSION_KEYS.ORDERS_CANCEL;

    case 'SCHEDULE_READ':
      return RADIOLOGY_PERMISSION_KEYS.SCHEDULES_READ;

    case 'SCHEDULE_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.SCHEDULES_MANAGE;

    case 'SAFETY_READ':
      return RADIOLOGY_PERMISSION_KEYS.SAFETY_READ;

    case 'SAFETY_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.SAFETY_MANAGE;

    case 'EXAMINATION_READ':
      return RADIOLOGY_PERMISSION_KEYS.EXAMINATIONS_READ;

    case 'EXAMINATION_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.EXAMINATIONS_MANAGE;

    case 'STUDY_READ':
      return RADIOLOGY_PERMISSION_KEYS.STUDIES_READ;

    case 'STUDY_MANAGE':
      return RADIOLOGY_PERMISSION_KEYS.STUDIES_MANAGE;

    case 'REPORT_READ':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_READ;

    case 'REPORT_ENTER':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_ENTER;

    case 'REPORT_REVIEW':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_REVIEW;

    case 'REPORT_VERIFY':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_VERIFY;

    case 'REPORT_AMEND':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_AMEND;

    case 'REPORT_PUBLISH':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_PUBLISH;

    case 'REPORT_WITHDRAW':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_WITHDRAW;

    case 'REPORT_PRINT':
      return RADIOLOGY_PERMISSION_KEYS.REPORTS_PRINT;

    case 'CRITICAL_NOTIFY':
      return RADIOLOGY_PERMISSION_KEYS.CRITICAL_NOTIFY;

    case 'CRITICAL_ACKNOWLEDGE':
      return RADIOLOGY_PERMISSION_KEYS.CRITICAL_ACKNOWLEDGE;
  }
}

function catalogFields(): readonly string[] {
  return [
    'procedureIdentity',
    'modalityIdentity',
    'bodyRegions',
    'lateralityRules',
    'contrastRules',
    'preparationInstructions',
    'contraindications',
    'safetyRequirements',
    'turnaroundTimes',
    'availability',
    'billingReference',
    'status',
    'version',
  ];
}

function clinicianOrderFields(): readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'orderingProviderAttribution',
    'procedureSelections',
    'priority',
    'clinicalIndication',
    'orderingNotes',
    'appointmentSummary',
    'examinationSummary',
    'verifiedReportSummary',
    'criticalFindingAcknowledgement',
    'lifecycle',
    'version',
  ];
}

function radiologyOperationalFields(): readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'orderingProviderAttribution',
    'procedureDefinitionSnapshots',
    'priority',
    'clinicalIndication',
    'orderingNotes',
    'preparationAndSafety',
    'resourceAllocation',
    'appointment',
    'examination',
    'studyMetadata',
    'technicianNotes',
    'reportContent',
    'radiologistAttribution',
    'criticalFindings',
    'publication',
    'lifecycle',
    'version',
  ];
}

function medicalRecordsFields(): readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'procedureIdentity',
    'verifiedReportContent',
    'radiologistAttribution',
    'publication',
    'correctionAndAddendumHistory',
    'reportMetadata',
  ];
}

function isReadAction(
  action: RadiologyAccessAction,
): boolean {
  return [
    'CATALOG_READ',
    'ORDER_READ',
    'SCHEDULE_READ',
    'SAFETY_READ',
    'EXAMINATION_READ',
    'STUDY_READ',
    'REPORT_READ',
    'REPORT_PRINT',
  ].includes(action);
}

function isRadiologyOperationalAction(
  action: RadiologyAccessAction,
): boolean {
  return [
    'ORDER_READ',
    'ORDER_MANAGE',
    'SCHEDULE_READ',
    'SCHEDULE_MANAGE',
    'SAFETY_READ',
    'SAFETY_MANAGE',
    'EXAMINATION_READ',
    'EXAMINATION_MANAGE',
    'STUDY_READ',
    'STUDY_MANAGE',
    'REPORT_READ',
    'REPORT_ENTER',
    'REPORT_REVIEW',
    'REPORT_VERIFY',
    'REPORT_AMEND',
    'REPORT_PUBLISH',
    'REPORT_WITHDRAW',
    'REPORT_PRINT',
    'CRITICAL_NOTIFY',
  ].includes(action);
}

export class RadiologyAccessPolicyService
implements RadiologyAccessPolicyPort {
  public constructor(
    private readonly identities: RadiologyActorIdentityReader =
      new RadiologyContextRepository(),
  ) {}

  public async requireActiveActorStaffId(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<string> {
    const identity = await this.identities.findActorIdentity(actor.userId);

    if (
      identity === null ||
      identity.status !== 'ACTIVE' ||
      identity.staffId === null ||
      (
        identity.facilityId !== null &&
        identity.facilityId !== actor.facilityId
      )
    ) {
      throw new RadiologyProviderAttributionError();
    }

    return identity.staffId;
  }

  public async authorize(
    request: RadiologyAccessRequest,
  ): Promise<RadiologyAccessDecision> {
    const identity = await this.identities.findActorIdentity(
      request.actor.userId,
    );

    if (identity === null || identity.status !== 'ACTIVE') {
      return denied('The authenticated Radiology actor is not active');
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== request.actor.facilityId
    ) {
      return denied(
        'The authenticated Radiology actor belongs to another facility',
      );
    }

    if (
      request.clinicalContext !== undefined &&
      request.clinicalContext.facilityId !== request.actor.facilityId
    ) {
      return denied('The clinical encounter belongs to another facility');
    }

    if (
      request.order !== undefined &&
      request.order.facilityId.toHexString() !== request.actor.facilityId
    ) {
      return denied('The Radiology order belongs to another facility');
    }

    if (
      request.orderItem !== undefined &&
      request.orderItem.facilityId.toHexString() !== request.actor.facilityId
    ) {
      return denied('The Radiology order item belongs to another facility');
    }

    const permission = requiredPermission(request.action);

    if (!hasPermission(request, permission)) {
      return denied(`The operation requires ${permission}`);
    }

    if (request.action === 'CATALOG_READ') {
      return allowed('CATALOG', catalogFields(), false);
    }

    if (request.action === 'CATALOG_MANAGE') {
      return allowed(
        'RADIOLOGY_OPERATIONAL',
        catalogFields(),
        false,
      );
    }

    const staffId = identity.staffId;
    const clinicalContext = request.clinicalContext;
    const order = request.order;

    const assigned =
      staffId !== null &&
      clinicalContext !== undefined &&
      clinicalContext.assignedProviderIds.includes(staffId);

    const orderingProvider =
      staffId !== null &&
      order !== undefined &&
      order.orderingProviderId.toHexString() === staffId;

    const radiologyRole =
      request.actor.roleKeys.includes('RADIOLOGY_STAFF') ||
      request.actor.roleKeys.includes('SYSTEM_ADMINISTRATOR');

    const medicalRecordsRole = request.actor.roleKeys.includes(
      'MEDICAL_RECORDS_OFFICER',
    );

    const highlyRestricted =
      clinicalContext?.confidentiality === 'HIGHLY_RESTRICTED';

    if (request.action === 'ORDER_CREATE') {
      if (!assigned) {
        return denied(
          'Radiology order creation requires assignment to the active clinical encounter',
        );
      }

      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      request.action === 'ORDER_CANCEL' &&
      (assigned || orderingProvider)
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      request.action === 'CRITICAL_ACKNOWLEDGE' &&
      (assigned || orderingProvider)
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      isRadiologyOperationalAction(request.action) &&
      radiologyRole
    ) {
      return allowed(
        'RADIOLOGY_OPERATIONAL',
        radiologyOperationalFields(),
        isReadAction(request.action),
      );
    }

    if (
      request.action === 'ORDER_CANCEL' &&
      radiologyRole
    ) {
      return allowed(
        'RADIOLOGY_OPERATIONAL',
        radiologyOperationalFields(),
        false,
      );
    }

    if (
      [
        'ORDER_READ',
        'SCHEDULE_READ',
        'EXAMINATION_READ',
        'STUDY_READ',
        'REPORT_READ',
        'REPORT_PRINT',
      ].includes(request.action) &&
      (assigned || orderingProvider)
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        true,
      );
    }

    if (
      medicalRecordsRole &&
      [
        'ORDER_READ',
        'STUDY_READ',
        'REPORT_READ',
        'REPORT_PRINT',
      ].includes(request.action) &&
      !highlyRestricted &&
      order?.status === 'VERIFIED'
    ) {
      return allowed(
        'MEDICAL_RECORDS',
        medicalRecordsFields(),
        true,
      );
    }

    if (
      isReadAction(request.action) &&
      hasPermission(request, RADIOLOGY_PERMISSION_KEYS.BREAK_GLASS)
    ) {
      const reason = request.actor.breakGlassReason?.trim() ?? '';

      if (reason.length < 10) {
        throw new RadiologyBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        radiologyOperationalFields(),
        true,
      );
    }

    return denied(
      highlyRestricted
        ? 'Highly restricted Radiology information requires encounter assignment, Radiology operational responsibility, or documented emergency access'
        : 'Radiology access requires encounter assignment, Radiology operational responsibility, medical-records responsibility, or documented emergency access',
    );
  }
}