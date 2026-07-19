import {
  LABORATORY_PERMISSION_KEYS,
} from '../laboratory.constants.js';

import {
  LaboratoryBreakGlassReasonRequiredError,
  LaboratoryProviderAttributionError,
} from '../laboratory.errors.js';

import type {
  LaboratoryAccessAction,
  LaboratoryAccessDecision,
  LaboratoryAccessMode,
  LaboratoryAccessPolicyPort,
  LaboratoryAccessRequest,
} from '../laboratory.ports.js';

import type {
  LaboratoryActorIdentityRecord,
} from '../repositories/laboratory-context.repository.js';

import {
  LaboratoryContextRepository,
} from '../repositories/laboratory-context.repository.js';

export interface LaboratoryActorIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<
    LaboratoryActorIdentityRecord |
    null
  >;
}

function denied(
  reason: string,
): LaboratoryAccessDecision {
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
    LaboratoryAccessMode,

  minimumNecessaryFields:
    readonly string[],

  auditSensitiveRead:
    boolean,
): LaboratoryAccessDecision {
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
    LaboratoryAccessRequest,

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
    LaboratoryAccessAction,
): string {
  switch (action) {
    case 'CATALOG_READ':
      return LABORATORY_PERMISSION_KEYS
        .CATALOG_READ;

    case 'CATALOG_MANAGE':
      return LABORATORY_PERMISSION_KEYS
        .CATALOG_MANAGE;

    case 'ORDER_READ':
      return LABORATORY_PERMISSION_KEYS
        .ORDERS_READ;

    case 'ORDER_CREATE':
      return LABORATORY_PERMISSION_KEYS
        .ORDERS_CREATE;

    case 'ORDER_MANAGE':
      return LABORATORY_PERMISSION_KEYS
        .ORDERS_MANAGE;

    case 'ORDER_CANCEL':
      return LABORATORY_PERMISSION_KEYS
        .ORDERS_CANCEL;

    case 'SPECIMEN_READ':
      return LABORATORY_PERMISSION_KEYS
        .SPECIMENS_READ;

    case 'SPECIMEN_COLLECT':
      return LABORATORY_PERMISSION_KEYS
        .SPECIMENS_COLLECT;

    case 'SPECIMEN_RECEIVE':
      return LABORATORY_PERMISSION_KEYS
        .SPECIMENS_RECEIVE;

    case 'SPECIMEN_REJECT':
      return LABORATORY_PERMISSION_KEYS
        .SPECIMENS_REJECT;

    case 'RESULT_READ':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_READ;

    case 'RESULT_ENTER':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_ENTER;

    case 'RESULT_VALIDATE':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_VALIDATE;

    case 'RESULT_VERIFY':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_VERIFY;

    case 'RESULT_AMEND':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_AMEND;

    case 'RESULT_PUBLISH':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_PUBLISH;

    case 'RESULT_PRINT':
      return LABORATORY_PERMISSION_KEYS
        .RESULTS_PRINT;

    case 'CRITICAL_NOTIFY':
      return LABORATORY_PERMISSION_KEYS
        .CRITICAL_NOTIFY;

    case 'CRITICAL_ACKNOWLEDGE':
      return LABORATORY_PERMISSION_KEYS
        .CRITICAL_ACKNOWLEDGE;
  }
}

function catalogFields():
  readonly string[] {
  return [
    'testIdentity',
    'category',
    'method',
    'specimenRequirements',
    'resultDefinitions',
    'referenceRanges',
    'turnaroundTimes',
    'availability',
    'status',
    'version',
  ];
}

function clinicianOrderFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'orderingProviderAttribution',
    'testSelections',
    'priority',
    'clinicalIndication',
    'orderingNotes',
    'specimenState',
    'resultState',
    'lifecycle',
    'version',
  ];
}

function laboratoryOperationalFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'orderingProviderAttribution',
    'testDefinitionSnapshots',
    'priority',
    'clinicalIndication',
    'orderingNotes',
    'specimenCollection',
    'specimenHandling',
    'resultContent',
    'validationAttribution',
    'verificationAttribution',
    'criticalCommunication',
    'publication',
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
    'testIdentity',
    'verifiedResultContent',
    'verificationAttribution',
    'publication',
    'amendmentHistory',
    'reportMetadata',
  ];
}

function isReadAction(
  action:
    LaboratoryAccessAction,
): boolean {
  return [
    'CATALOG_READ',
    'ORDER_READ',
    'SPECIMEN_READ',
    'RESULT_READ',
    'RESULT_PRINT',
  ].includes(
    action,
  );
}

function isLaboratoryOperationalAction(
  action:
    LaboratoryAccessAction,
): boolean {
  return [
    'ORDER_READ',
    'ORDER_MANAGE',
    'SPECIMEN_READ',
    'SPECIMEN_COLLECT',
    'SPECIMEN_RECEIVE',
    'SPECIMEN_REJECT',
    'RESULT_READ',
    'RESULT_ENTER',
    'RESULT_VALIDATE',
    'RESULT_VERIFY',
    'RESULT_AMEND',
    'RESULT_PUBLISH',
    'RESULT_PRINT',
    'CRITICAL_NOTIFY',
  ].includes(
    action,
  );
}

export class LaboratoryAccessPolicyService
implements LaboratoryAccessPolicyPort {
  public constructor(
    private readonly identities:
      LaboratoryActorIdentityReader =
        new LaboratoryContextRepository(),
  ) {}

  public async requireActiveActorStaffId(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<string> {
    const identity =
      await this
        .identities
        .findActorIdentity(
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
      throw new LaboratoryProviderAttributionError();
    }

    return identity.staffId;
  }

  public async authorize(
    request:
      LaboratoryAccessRequest,
  ): Promise<
    LaboratoryAccessDecision
  > {
    const identity =
      await this
        .identities
        .findActorIdentity(
          request.actor.userId,
        );

    if (
      identity === null ||
      identity.status !==
        'ACTIVE'
    ) {
      return denied(
        'The authenticated Laboratory actor is not active',
      );
    }

    if (
      identity.facilityId !==
        null &&
      identity.facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The authenticated Laboratory actor belongs to another facility',
      );
    }

    if (
      request.clinicalContext !==
        undefined &&
      request
        .clinicalContext
        .facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The clinical encounter belongs to another facility',
      );
    }

    if (
      request.order !==
        undefined &&
      request
        .order
        .facilityId
        .toHexString() !==
        request.actor.facilityId
    ) {
      return denied(
        'The Laboratory order belongs to another facility',
      );
    }

    if (
      request.result !==
        undefined &&
      request
        .result
        .facilityId
        .toHexString() !==
        request.actor.facilityId
    ) {
      return denied(
        'The Laboratory result belongs to another facility',
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
        'CATALOG_READ'
    ) {
      return allowed(
        'CATALOG',
        catalogFields(),
        false,
      );
    }

    if (
      request.action ===
        'CATALOG_MANAGE'
    ) {
      return allowed(
        'LABORATORY_OPERATIONAL',
        catalogFields(),
        false,
      );
    }

    const staffId =
      identity.staffId;

    const clinicalContext =
      request.clinicalContext;

    const order =
      request.order;

    const result =
      request.result;

    const assigned =
      staffId !== null &&
      clinicalContext !==
        undefined &&
      clinicalContext
        .assignedProviderIds
        .includes(
          staffId,
        );

    const orderingProvider =
      staffId !== null &&
      order !== undefined &&
      order
        .orderingProviderId
        .toHexString() ===
        staffId;

    const laboratoryRole =
      request
        .actor
        .roleKeys
        .includes(
          'LABORATORY_STAFF',
        ) ||
      request
        .actor
        .roleKeys
        .includes(
          'SYSTEM_ADMINISTRATOR',
        );

    const medicalRecordsRole =
      request
        .actor
        .roleKeys
        .includes(
          'MEDICAL_RECORDS_OFFICER',
        );

    const highlyRestricted =
      clinicalContext
        ?.confidentiality ===
      'HIGHLY_RESTRICTED';

    if (
      request.action ===
        'ORDER_CREATE'
    ) {
      if (!assigned) {
        return denied(
          'Laboratory order creation requires assignment to the active clinical encounter',
        );
      }

      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      request.action ===
        'ORDER_CANCEL' &&
      (
        assigned ||
        orderingProvider
      )
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      isLaboratoryOperationalAction(
        request.action,
      ) &&
      laboratoryRole
    ) {
      return allowed(
        'LABORATORY_OPERATIONAL',
        laboratoryOperationalFields(),
        isReadAction(
          request.action,
        ),
      );
    }

    if (
      request.action ===
        'ORDER_CANCEL' &&
      laboratoryRole
    ) {
      return allowed(
        'LABORATORY_OPERATIONAL',
        laboratoryOperationalFields(),
        false,
      );
    }

    if (
      request.action ===
        'CRITICAL_ACKNOWLEDGE' &&
      (
        assigned ||
        orderingProvider
      )
    ) {
      return allowed(
        'ASSIGNED_CLINICIAN',
        clinicianOrderFields(),
        false,
      );
    }

    if (
      [
        'ORDER_READ',
        'SPECIMEN_READ',
        'RESULT_READ',
        'RESULT_PRINT',
      ].includes(
        request.action,
      ) &&
      (
        assigned ||
        orderingProvider
      )
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
        'RESULT_READ',
        'RESULT_PRINT',
      ].includes(
        request.action,
      ) &&
      !highlyRestricted &&
      result
        ?.publicationStatus !==
        'WITHDRAWN'
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
        LABORATORY_PERMISSION_KEYS
          .BREAK_GLASS,
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
        throw new LaboratoryBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        laboratoryOperationalFields(),
        true,
      );
    }

    return denied(
      highlyRestricted
        ? 'Highly restricted Laboratory information requires encounter assignment, Laboratory operational responsibility, or documented emergency access'
        : 'Laboratory access requires encounter assignment, Laboratory operational responsibility, medical-records responsibility, or documented emergency access',
    );
  }
}