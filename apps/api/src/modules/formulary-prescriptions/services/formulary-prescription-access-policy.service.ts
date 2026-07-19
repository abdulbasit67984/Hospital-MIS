import {
  FORMULARY_PRESCRIPTION_PERMISSION_KEYS,
} from '../formulary-prescriptions.constants.js';

import {
  FormularyPrescriptionBreakGlassReasonRequiredError,
} from '../formulary-prescriptions.errors.js';

import type {
  FormularyPrescriptionActorContext,
  PrescriptionClinicalContext,
} from '../formulary-prescriptions.types.js';

import type {
  PrescriptionRecord,
} from '../formulary-prescriptions.persistence.types.js';

import type {
  FormularyPrescriptionActorIdentityRecord,
} from '../repositories/formulary-prescription-context.repository.js';

import {
  FormularyPrescriptionContextRepository,
} from '../repositories/formulary-prescription-context.repository.js';

export type FormularyPrescriptionAccessAction =
  | 'FORMULARY_READ'
  | 'FORMULARY_MANAGE'
  | 'PRESCRIPTION_READ'
  | 'PRESCRIPTION_CREATE'
  | 'PRESCRIPTION_UPDATE_DRAFT'
  | 'PRESCRIPTION_ISSUE'
  | 'PRESCRIPTION_AMEND'
  | 'PRESCRIPTION_CANCEL'
  | 'PRESCRIPTION_PRINT'
  | 'STOCK_READ';

export type FormularyPrescriptionAccessMode =
  | 'CATALOG'
  | 'ASSIGNED_PROVIDER'
  | 'PRESCRIBER'
  | 'PHARMACY_QUEUE'
  | 'FACILITY_OPERATIONAL'
  | 'BREAK_GLASS'
  | 'DENIED';

export interface FormularyPrescriptionAccessRequest {
  actor: FormularyPrescriptionActorContext;
  action: FormularyPrescriptionAccessAction;
  clinicalContext?: PrescriptionClinicalContext;
  prescription?: PrescriptionRecord;
}

export interface FormularyPrescriptionAccessDecision {
  allowed: boolean;
  accessMode: FormularyPrescriptionAccessMode;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface FormularyPrescriptionActorIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<FormularyPrescriptionActorIdentityRecord | null>;
}

function denied(
  reason: string,
): FormularyPrescriptionAccessDecision {
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
    FormularyPrescriptionAccessMode,
  minimumNecessaryFields:
    readonly string[],
  auditSensitiveRead:
    boolean,
): FormularyPrescriptionAccessDecision {
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
    FormularyPrescriptionAccessRequest,
  permission:
    string,
): boolean {
  return request.actor
    .permissionKeys
    .includes(
      permission,
    );
}

function requiredPermission(
  action:
    FormularyPrescriptionAccessAction,
): string {
  switch (action) {
    case 'FORMULARY_READ':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.FORMULARY_READ;

    case 'FORMULARY_MANAGE':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.FORMULARY_MANAGE;

    case 'PRESCRIPTION_READ':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_READ;

    case 'PRESCRIPTION_CREATE':
    case 'PRESCRIPTION_UPDATE_DRAFT':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_CREATE;

    case 'PRESCRIPTION_ISSUE':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_ISSUE;

    case 'PRESCRIPTION_AMEND':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_AMEND;

    case 'PRESCRIPTION_CANCEL':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_CANCEL;

    case 'PRESCRIPTION_PRINT':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PRESCRIPTION_PRINT;

    case 'STOCK_READ':
      return FORMULARY_PRESCRIPTION_PERMISSION_KEYS.INVENTORY_READ;
  }
}

function providerFields():
  readonly string[] {
  return [
    'identity',
    'encounterContext',
    'prescriberAttribution',
    'medicineSelection',
    'dose',
    'frequency',
    'route',
    'duration',
    'quantity',
    'instructions',
    'safetyWarnings',
    'dispensationTrace',
    'lifecycle',
    'version',
  ];
}

function pharmacyFields():
  readonly string[] {
  return [
    'identity',
    'patientReference',
    'encounterReference',
    'prescriberAttribution',
    'medicineSelection',
    'dose',
    'frequency',
    'route',
    'duration',
    'quantity',
    'instructions',
    'dispensationTrace',
    'lifecycle',
    'version',
  ];
}

export class FormularyPrescriptionAccessPolicyService {
  public constructor(
    private readonly identities:
      FormularyPrescriptionActorIdentityReader =
        new FormularyPrescriptionContextRepository(),
  ) {}

  public async authorize(
    request:
      FormularyPrescriptionAccessRequest,
  ): Promise<FormularyPrescriptionAccessDecision> {
    const identity =
      await this.identities.findActorIdentity(
        request.actor.userId,
      );

    if (
      identity === null ||
      identity.status !== 'ACTIVE'
    ) {
      return denied(
        'The authenticated formulary or prescription actor is not active',
      );
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The authenticated actor belongs to another facility',
      );
    }

    if (
      request.clinicalContext !== undefined &&
      request.clinicalContext.facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The clinical encounter belongs to another facility',
      );
    }

    if (
      request.prescription !== undefined &&
      request.prescription.facilityId.toHexString() !==
        request.actor.facilityId
    ) {
      return denied(
        'The prescription belongs to another facility',
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
        'FORMULARY_READ'
    ) {
      return allowed(
        'CATALOG',
        [
          'medicineIdentity',
          'form',
          'strength',
          'route',
          'units',
          'availability',
          'restrictions',
          'status',
        ],
        false,
      );
    }

    if (
      request.action ===
        'FORMULARY_MANAGE'
    ) {
      return allowed(
        'FACILITY_OPERATIONAL',
        [
          'medicineMaster',
          'form',
          'strength',
          'route',
          'units',
          'frequency',
          'availability',
          'restrictions',
          'status',
          'version',
        ],
        false,
      );
    }

    if (
      request.action ===
        'STOCK_READ'
    ) {
      return allowed(
        'FACILITY_OPERATIONAL',
        [
          'inventoryItemReference',
          'availableQuantity',
          'unit',
          'lowStockStatus',
          'asOf',
        ],
        false,
      );
    }

    const clinicalContext =
      request.clinicalContext;

    const prescription =
      request.prescription;

    const staffId =
      identity.staffId;

    const assigned =
      staffId !== null &&
      clinicalContext !== undefined &&
      clinicalContext.assignedProviderIds.includes(
        staffId,
      );

    const prescriptionProvider =
      staffId !== null &&
      prescription !== undefined &&
      prescription.prescriberProviderId.toHexString() ===
        staffId;

    const pharmacyQueueAccess =
      hasPermission(
        request,
        FORMULARY_PRESCRIPTION_PERMISSION_KEYS.PHARMACY_QUEUE_READ,
      ) &&
      prescription !== undefined &&
      [
        'ISSUED',
        'PARTIALLY_DISPENSED',
        'DISPENSED',
      ].includes(
        prescription.status,
      );

    if (
      request.action ===
        'PRESCRIPTION_READ'
    ) {
      if (
        assigned ||
        prescriptionProvider
      ) {
        return allowed(
          assigned
            ? 'ASSIGNED_PROVIDER'
            : 'PRESCRIBER',
          providerFields(),
          true,
        );
      }

      if (pharmacyQueueAccess) {
        return allowed(
          'PHARMACY_QUEUE',
          pharmacyFields(),
          true,
        );
      }

      if (
        hasPermission(
          request,
          FORMULARY_PRESCRIPTION_PERMISSION_KEYS.BREAK_GLASS,
        )
      ) {
        const reason =
          request.actor
            .breakGlassReason
            ?.trim() ??
          '';

        if (reason.length < 10) {
          throw new FormularyPrescriptionBreakGlassReasonRequiredError();
        }

        return allowed(
          'BREAK_GLASS',
          providerFields(),
          true,
        );
      }

      return denied(
        'Prescription access requires encounter assignment, prescriber attribution, pharmacy-queue responsibility, or documented emergency access',
      );
    }

    if (
      request.action ===
        'PRESCRIPTION_PRINT' &&
      pharmacyQueueAccess
    ) {
      return allowed(
        'PHARMACY_QUEUE',
        pharmacyFields(),
        true,
      );
    }

    if (
      assigned ||
      prescriptionProvider
    ) {
      return allowed(
        assigned
          ? 'ASSIGNED_PROVIDER'
          : 'PRESCRIBER',
        providerFields(),
        false,
      );
    }

    return denied(
      'Prescription mutations require encounter assignment or prescriber attribution',
    );
  }
}