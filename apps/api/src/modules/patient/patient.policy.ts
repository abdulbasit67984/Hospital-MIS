import type {
  PolicyDecision,
  RecordAccessPolicy,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  PATIENT_PERMISSION_KEYS,
} from './patient.constants.js';

import type {
  GuardianRecord,
  PatientRecord,
} from './patient.types.js';

function allow(): PolicyDecision {
  return {
    allowed: true,
  };
}

function deny(
  reason: string,
): PolicyDecision {
  return {
    allowed: false,
    reason,
  };
}

function belongsToPrincipalFacility(
  record: Readonly<{
    facilityId: {
      toHexString(): string;
    } | string;
  }>,
  facilityId: string,
): boolean {
  const recordFacilityId =
    typeof record.facilityId === 'string'
      ? record.facilityId
      : record.facilityId.toHexString();

  return recordFacilityId === facilityId;
}

export class PatientRecordPolicy
implements RecordAccessPolicy<PatientRecord> {
  public readonly name =
    'patient-record-policy';

  public async evaluate(
    context: Parameters<
      RecordAccessPolicy<PatientRecord>['evaluate']
    >[0],
  ): Promise<PolicyDecision> {
    if (
      belongsToPrincipalFacility(
        context.record,
        context.principal.facilityId,
      )
    ) {
      return allow();
    }

    return deny(
      'The patient belongs to another facility',
    );
  }
}

export class PatientSensitiveRecordPolicy
implements RecordAccessPolicy<PatientRecord> {
  public readonly name =
    'patient-sensitive-record-policy';

  public constructor(
    private readonly authorization:
      AuthorizationService,
  ) {}

  public async evaluate(
    context: Parameters<
      RecordAccessPolicy<PatientRecord>['evaluate']
    >[0],
  ): Promise<PolicyDecision> {
    if (
      !belongsToPrincipalFacility(
        context.record,
        context.principal.facilityId,
      )
    ) {
      return deny(
        'The patient belongs to another facility',
      );
    }

    if (
      await this.authorization.hasPermission(
        context.principal,
        PATIENT_PERMISSION_KEYS.READ_SENSITIVE,
      )
    ) {
      return allow();
    }

    return deny(
      'Sensitive patient information requires patients.read_sensitive',
    );
  }
}

export class PatientMergeRecordPolicy
implements RecordAccessPolicy<PatientRecord> {
  public readonly name =
    'patient-merge-record-policy';

  public constructor(
    private readonly authorization:
      AuthorizationService,
  ) {}

  public async evaluate(
    context: Parameters<
      RecordAccessPolicy<PatientRecord>['evaluate']
    >[0],
  ): Promise<PolicyDecision> {
    if (
      !belongsToPrincipalFacility(
        context.record,
        context.principal.facilityId,
      )
    ) {
      return deny(
        'The patient belongs to another facility',
      );
    }

    if (
      await this.authorization.hasPermission(
        context.principal,
        PATIENT_PERMISSION_KEYS.MERGE,
      )
    ) {
      return allow();
    }

    return deny(
      'Patient merge permission is required',
    );
  }
}

export class GuardianRecordPolicy
implements RecordAccessPolicy<GuardianRecord> {
  public readonly name =
    'guardian-record-policy';

  public async evaluate(
    context: Parameters<
      RecordAccessPolicy<GuardianRecord>['evaluate']
    >[0],
  ): Promise<PolicyDecision> {
    if (
      belongsToPrincipalFacility(
        context.record,
        context.principal.facilityId,
      )
    ) {
      return allow();
    }

    return deny(
      'The guardian belongs to another facility',
    );
  }
}

export interface PatientRecordPolicies {
  patient: PatientRecordPolicy;
  patientSensitive: PatientSensitiveRecordPolicy;
  patientMerge: PatientMergeRecordPolicy;
  guardian: GuardianRecordPolicy;
}

export function createPatientRecordPolicies(
  authorization: AuthorizationService,
): PatientRecordPolicies {
  return {
    patient:
      new PatientRecordPolicy(),
    patientSensitive:
      new PatientSensitiveRecordPolicy(
        authorization,
      ),
    patientMerge:
      new PatientMergeRecordPolicy(
        authorization,
      ),
    guardian:
      new GuardianRecordPolicy(),
  };
}