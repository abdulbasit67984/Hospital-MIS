import {
  INPATIENT_PERMISSION_KEYS,
} from '../inpatient.constants.js';

import {
  InpatientBreakGlassReasonRequiredError,
  InpatientStaffAttributionError,
} from '../inpatient.errors.js';

import type {
  InpatientAccessAction,
  InpatientAccessDecision,
  InpatientAccessMode,
  InpatientAccessPolicyPort,
  InpatientAccessRequest,
} from '../inpatient.ports.js';

import type {
  InpatientActorIdentityRecord,
  InpatientStaffContextRecord,
} from '../repositories/inpatient-context.repository.js';

import {
  InpatientContextRepository,
} from '../repositories/inpatient-context.repository.js';

export interface InpatientIdentityReader {
  findActorIdentity(
    userId:
      string,
  ): Promise<
    InpatientActorIdentityRecord | null
  >;

  findStaff(
    facilityId:
      string,

    staffId:
      string,
  ): Promise<
    InpatientStaffContextRecord | null
  >;
}

function denied(
  reason:
    string,
): InpatientAccessDecision {
  return {
    allowed:
      false,

    accessMode:
      'DENIED',

    minimumNecessaryFields:
      [],

    auditSensitiveRead:
      false,

    denialReason:
      reason,
  };
}

function allowed(
  accessMode:
    InpatientAccessMode,

  minimumNecessaryFields:
    readonly string[],

  auditSensitiveRead:
    boolean,
): InpatientAccessDecision {
  return {
    allowed:
      true,

    accessMode,

    minimumNecessaryFields,

    auditSensitiveRead,
  };
}

function hasPermission(
  request:
    InpatientAccessRequest,

  permission:
    string,
): boolean {
  return request
    .actor
    .permissionKeys
    .includes(
      permission,
    );
}

function requiredPermission(
  action:
    InpatientAccessAction,
): string {
  switch (action) {
    case 'WARD_READ':
    case 'BED_READ':
      return INPATIENT_PERMISSION_KEYS.BEDS_READ;

    case 'WARD_MANAGE':
    case 'BED_MANAGE':
      return INPATIENT_PERMISSION_KEYS.BEDS_MANAGE;

    case 'BED_ASSIGN':
      return INPATIENT_PERMISSION_KEYS.BEDS_ASSIGN;

    case 'BED_TRANSFER':
      return INPATIENT_PERMISSION_KEYS.BEDS_TRANSFER;

    case 'BED_STATUS_MANAGE':
      return INPATIENT_PERMISSION_KEYS.BEDS_STATUS_MANAGE;

    case 'ADMISSION_READ':
      return INPATIENT_PERMISSION_KEYS.ADMISSIONS_READ;

    case 'ADMISSION_RECOMMEND':
    case 'ADMISSION_CREATE':
    case 'ADMISSION_ACCEPT':
    case 'ADMISSION_REJECT':
    case 'ADMISSION_CANCEL':
      return INPATIENT_PERMISSION_KEYS.ADMISSIONS_CREATE;
  }
}

function catalogFields():
  readonly string[] {
  return [
    'identity',
    'locationHierarchy',
    'classification',
    'restrictions',
    'operationalStatus',
    'effectiveRateReference',
    'catalogStatus',
    'version',
  ];
}

function wardOperationalFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'admissionReference',
    'locationHierarchy',
    'bedStatus',
    'activeHoldReference',
    'activeAssignmentReference',
    'restrictionEvaluation',
    'turnaroundAndMaintenance',
    'lifecycle',
    'version',
  ];
}

function clinicianAdmissionFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'admissionRecommendation',
    'clinicalIndication',
    'diagnosisSnapshots',
    'attendingConsultant',
    'careTeam',
    'currentLocationSummary',
    'diagnosticResultVisibility',
    'dischargeStatusSummary',
    'lifecycle',
    'version',
  ];
}

function medicalRecordsFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'admissionType',
    'admissionAndDischargeTimes',
    'attendingConsultant',
    'bedAssignmentTimeline',
    'publishedDischargeSummaryReference',
    'lifecycle',
  ];
}

function isReadAction(
  action:
    InpatientAccessAction,
): boolean {
  return [
    'WARD_READ',
    'BED_READ',
    'ADMISSION_READ',
  ].includes(
    action,
  );
}

function isOperationalAction(
  action:
    InpatientAccessAction,
): boolean {
  return [
    'WARD_MANAGE',
    'BED_MANAGE',
    'BED_ASSIGN',
    'BED_TRANSFER',
    'BED_STATUS_MANAGE',
    'ADMISSION_CREATE',
    'ADMISSION_ACCEPT',
    'ADMISSION_REJECT',
    'ADMISSION_CANCEL',
  ].includes(
    action,
  );
}

export class InpatientAccessPolicyService
implements InpatientAccessPolicyPort {
  public constructor(
    private readonly identities:
      InpatientIdentityReader =
        new InpatientContextRepository(),
  ) {}

  public async requireActiveActorStaffId(
    actor:
      Readonly<{
        userId:
          string;

        facilityId:
          string;
      }>,
  ): Promise<string> {
    const identity =
      await this.identities.findActorIdentity(
        actor.userId,
      );

    if (
      identity === null ||
      identity.status !==
        'ACTIVE' ||
      identity.staffId ===
        null ||
      (
        identity.facilityId !==
          null &&
        identity.facilityId !==
          actor.facilityId
      )
    ) {
      throw new InpatientStaffAttributionError();
    }

    return identity.staffId;
  }

  public async authorize(
    request:
      InpatientAccessRequest,
  ): Promise<
    InpatientAccessDecision
  > {
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
        'The authenticated inpatient actor is not active',
      );
    }

    if (
      identity.facilityId !==
        null &&
      identity.facilityId !==
        request
          .actor
          .facilityId
    ) {
      return denied(
        'The authenticated inpatient actor belongs to another facility',
      );
    }

    const facilityId =
      request
        .actor
        .facilityId;

    const scopedRecords = [
      request.ward,
      request.room,
      request.bed,
      request.recommendation,
      request.admission,
    ].filter(
      (
        value,
      ) =>
        value !== undefined,
    );

    if (
      scopedRecords.some(
        (
          record,
        ) =>
          record
            .facilityId
            .toHexString() !==
          facilityId,
      )
    ) {
      return denied(
        'The requested inpatient record belongs to another facility',
      );
    }

    if (
      request.clinicalContext !==
        undefined &&
      request
        .clinicalContext
        .facilityId !==
        facilityId
    ) {
      return denied(
        'The clinical encounter belongs to another facility',
      );
    }

    const permission =
      requiredPermission(
        request.action,
      );

    if (
      !hasPermission(
        request,
        permission,
      )
    ) {
      return denied(
        `The operation requires ${permission}`,
      );
    }

    if (
      request.action ===
        'WARD_READ' ||
      request.action ===
        'BED_READ'
    ) {
      return allowed(
        'CATALOG',
        catalogFields(),
        false,
      );
    }

    const staff =
      identity.staffId ===
      null
        ? null
        : await this
            .identities
            .findStaff(
              facilityId,
              identity.staffId,
            );

    const administrativeRole =
      request
        .actor
        .roleKeys
        .includes(
          'SYSTEM_ADMINISTRATOR',
        ) ||
      request
        .actor
        .roleKeys
        .includes(
          'DEPARTMENT_MANAGER',
        );

    const wardNurseRole =
      request
        .actor
        .roleKeys
        .includes(
          'WARD_NURSE',
        );

    const doctorRole =
      request
        .actor
        .roleKeys
        .includes(
          'CLINICAL_DOCTOR',
        );

    const medicalRecordsRole =
      request
        .actor
        .roleKeys
        .includes(
          'MEDICAL_RECORDS_OFFICER',
        );

    const wardDepartmentId =
      request
        .ward
        ?.departmentId
        .toHexString() ??
      request
        .bed
        ?.departmentId
        .toHexString() ??
      request
        .admission
        ?.admittingDepartmentId
        .toHexString() ??
      request
        .recommendation
        ?.orderingDepartmentId
        .toHexString();

    const sameDepartment =
      staff !== null &&
      wardDepartmentId !==
        undefined &&
      staff.departmentId ===
        wardDepartmentId;

    if (
      isOperationalAction(
        request.action,
      ) &&
      administrativeRole &&
      (
        request
          .actor
          .roleKeys
          .includes(
            'SYSTEM_ADMINISTRATOR',
          ) ||
        sameDepartment ||
        wardDepartmentId ===
          undefined
      )
    ) {
      return allowed(
        'WARD_OPERATIONAL',
        wardOperationalFields(),
        false,
      );
    }

    if (
      [
        'BED_ASSIGN',
        'BED_TRANSFER',
        'BED_STATUS_MANAGE',
      ].includes(
        request.action,
      ) &&
      wardNurseRole &&
      sameDepartment
    ) {
      return allowed(
        'WARD_OPERATIONAL',
        wardOperationalFields(),
        false,
      );
    }

    const assignedEncounter =
      identity.staffId !==
        null &&
      request.clinicalContext !==
        undefined &&
      request
        .clinicalContext
        .assignedProviderStaffIds
        .includes(
          identity.staffId,
        );

    const admissionClinician =
      identity.staffId !==
        null &&
      request.admission !==
        undefined &&
      (
        request
          .admission
          .attendingConsultantStaffId
          .toHexString() ===
          identity.staffId ||
        request
          .admission
          .careTeam
          .some(
            (
              member,
            ) =>
              member.endedAt ===
                null &&
              member
                .staffId
                .toHexString() ===
                identity.staffId,
          )
      );

    const recommendingClinician =
      identity.staffId !==
        null &&
      request.recommendation !==
        undefined &&
      request
        .recommendation
        .orderingProviderStaffId
        .toHexString() ===
        identity.staffId;

    if (
      request.action ===
        'ADMISSION_RECOMMEND' &&
      doctorRole &&
      assignedEncounter
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianAdmissionFields(),
        false,
      );
    }

    if (
      request.action ===
        'ADMISSION_CANCEL' &&
      doctorRole &&
      recommendingClinician
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianAdmissionFields(),
        false,
      );
    }

    if (
      request.action ===
        'ADMISSION_READ' &&
      (
        assignedEncounter ||
        admissionClinician ||
        recommendingClinician
      )
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianAdmissionFields(),
        true,
      );
    }

    if (
      request.action ===
        'ADMISSION_READ' &&
      wardNurseRole &&
      sameDepartment
    ) {
      return allowed(
        'WARD_OPERATIONAL',
        wardOperationalFields(),
        true,
      );
    }

    const highlyRestricted =
      request
        .clinicalContext
        ?.confidentiality ===
      'HIGHLY_RESTRICTED';

    if (
      request.action ===
        'ADMISSION_READ' &&
      medicalRecordsRole &&
      !highlyRestricted
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
      hasPermission(
        request,
        INPATIENT_PERMISSION_KEYS.BREAK_GLASS,
      )
    ) {
      const reason =
        request
          .actor
          .breakGlassReason
          ?.trim() ??
        '';

      if (
        reason.length <
        10
      ) {
        throw new InpatientBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        clinicianAdmissionFields(),
        true,
      );
    }

    return denied(
      highlyRestricted
        ? 'Highly restricted inpatient information requires direct clinical responsibility, ward responsibility, or documented emergency access'
        : 'Inpatient access requires direct clinical responsibility, ward responsibility, medical-records responsibility, or documented emergency access',
    );
  }
}