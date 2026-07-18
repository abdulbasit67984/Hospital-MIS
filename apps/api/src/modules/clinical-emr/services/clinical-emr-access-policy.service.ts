import type {
  ClinicalDocumentType,
} from '@hospital-mis/database';

import {
  CLINICAL_EMR_PERMISSION_KEYS,
} from '../clinical-emr.constants.js';

import {
  ClinicalEmrBreakGlassReasonRequiredError,
} from '../clinical-emr.errors.js';

import type {
  ClinicalAccessDecision,
  ClinicalAccessRequest,
  ClinicalEmrAccessPolicyPort,
} from '../clinical-emr.ports.js';

import type {
  ClinicalActorIdentityRecord,
} from '../repositories/clinical-emr-context.repository.js';

import {
  ClinicalEmrContextRepository,
} from '../repositories/clinical-emr-context.repository.js';

export interface ClinicalActorIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<ClinicalActorIdentityRecord | null>;
}

function denied(
  reason: string,
): ClinicalAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    denialReason: reason,
  };
}

function hasPermission(
  request: ClinicalAccessRequest,
  permission: string,
): boolean {
  return request.actor.permissionKeys.includes(permission);
}

function isAssigned(
  staffId: string | null,
  assignedProviderIds: readonly string[],
): boolean {
  return staffId !== null && assignedProviderIds.includes(staffId);
}

function minimumNecessaryFields(
  request: ClinicalAccessRequest,
): readonly string[] {
  if (request.intendedAction !== 'READ') {
    return [
      'identity',
      'status',
      'ownership',
      'clinicalContent',
      'version',
      'attribution',
    ];
  }

  if (request.documentType === undefined) {
    return [
      'identity',
      'encounterContext',
      'status',
      'ownership',
      'lifecycleTimestamps',
      'version',
    ];
  }

  const historyOnlyTypes = new Set<ClinicalDocumentType>([
    'PAST_MEDICAL_HISTORY',
    'PAST_SURGICAL_HISTORY',
    'FAMILY_HISTORY',
    'SOCIAL_HISTORY',
    'CURRENT_MEDICATIONS',
    'REVIEW_OF_SYSTEMS',
  ]);

  return [
    'identity',
    'documentType',
    'status',
    'authorAttribution',
    'clinicalContent',
    'finalization',
    'version',
    ...(historyOnlyTypes.has(request.documentType)
      ? ['longitudinalHistoryContext']
      : []),
  ];
}

function writePermissionFor(
  request: ClinicalAccessRequest,
): string {
  if (request.intendedAction === 'CREATE') {
    return request.documentType === undefined
      ? CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE
      : CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE;
  }

  if (request.intendedAction === 'UPDATE') {
    return request.documentType === undefined
      ? CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_CREATE
      : CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_CREATE;
  }

  if (request.intendedAction === 'FINALIZE') {
    return CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_FINALIZE;
  }

  return request.documentType === undefined
    ? CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_AMEND
    : CLINICAL_EMR_PERMISSION_KEYS.CLINICAL_NOTE_AMEND;
}

export class ClinicalEmrAccessPolicyService
implements ClinicalEmrAccessPolicyPort {
  public constructor(
    private readonly identities: ClinicalActorIdentityReader =
      new ClinicalEmrContextRepository(),
  ) {}

  public async authorize(
    request: ClinicalAccessRequest,
  ): Promise<ClinicalAccessDecision> {
    const identity = await this.identities.findActorIdentity(
      request.actor.userId,
    );

    if (identity === null || identity.status !== 'ACTIVE') {
      return denied('The authenticated clinical actor is not active');
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== request.actor.facilityId
    ) {
      return denied('The clinical actor belongs to another facility');
    }

    const assignedProviderIds = request.assignedProviderIds ?? [];
    const assigned = isAssigned(identity.staffId, assignedProviderIds);
    const fields = minimumNecessaryFields(request);

    if (request.intendedAction !== 'READ') {
      const requiredPermission = writePermissionFor(request);

      if (!hasPermission(request, requiredPermission)) {
        return denied(`Clinical mutation requires ${requiredPermission}`);
      }

      if (!assigned) {
        return denied('Clinical mutations require encounter assignment or ownership');
      }

      return {
        allowed: true,
        accessMode: 'ASSIGNED',
        minimumNecessaryFields: fields,
        auditSensitiveRead: false,
      };
    }

    const canReadAssigned = hasPermission(
      request,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ASSIGNED,
    );

    const canReadAll = hasPermission(
      request,
      CLINICAL_EMR_PERMISSION_KEYS.ENCOUNTER_READ_ALL,
    );

    if (assigned && (canReadAssigned || canReadAll)) {
      return {
        allowed: true,
        accessMode: 'ASSIGNED',
        minimumNecessaryFields: fields,
        auditSensitiveRead: true,
      };
    }

    if (canReadAll && request.confidentiality !== 'HIGHLY_RESTRICTED') {
      return {
        allowed: true,
        accessMode: 'FACILITY_WIDE',
        minimumNecessaryFields: fields,
        auditSensitiveRead: true,
      };
    }

    const canBreakGlass = hasPermission(
      request,
      CLINICAL_EMR_PERMISSION_KEYS.BREAK_GLASS,
    );

    if (canBreakGlass) {
      const reason = request.actor.breakGlassReason?.trim() ?? '';

      if (reason.length < 10) {
        throw new ClinicalEmrBreakGlassReasonRequiredError();
      }

      return {
        allowed: true,
        accessMode: 'BREAK_GLASS',
        minimumNecessaryFields: fields,
        auditSensitiveRead: true,
      };
    }

    return denied(
      request.confidentiality === 'HIGHLY_RESTRICTED'
        ? 'Highly restricted clinical information requires assignment or documented emergency access'
        : 'The actor is not assigned and does not have facility-wide clinical read access',
    );
  }
}