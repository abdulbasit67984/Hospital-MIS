import {
  PHARMACY_DISPENSING_OPERATIONAL_ROLE_KEYS,
  PHARMACY_DISPENSING_PERMISSION_KEYS,
} from '../pharmacy-dispensing.constants.js';

import {
  PharmacyBreakGlassReasonRequiredError,
} from '../pharmacy-dispensing.errors.js';

import type {
  PharmacyAccessDecision,
  PharmacyAccessPolicyPort,
  PharmacyAccessRequest,
  PharmacyDispensingContextRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import {
  PharmacyDispensingContextRepository,
} from '../repositories/pharmacy-dispensing-context.repository.js';

function denied(reason: string): PharmacyAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    includeCost: false,
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    denialReason: reason,
  };
}

function allowed(
  accessMode: PharmacyAccessDecision['accessMode'],
  includeCost: boolean,
  minimumNecessaryFields: readonly string[],
  auditSensitiveRead: boolean,
): PharmacyAccessDecision {
  return {
    allowed: true,
    accessMode,
    includeCost,
    minimumNecessaryFields,
    auditSensitiveRead,
  };
}

function requiredPermission(
  action: PharmacyAccessRequest['action'],
): string {
  switch (action) {
    case 'READ':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.READ;
    case 'QUEUE_READ':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.QUEUE_READ;
    case 'VERIFY':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY;
    case 'DISPENSE':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE;
    case 'CONTROLLED_DISPENSE':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.CONTROLLED_DISPENSE;
    case 'RETURN':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.RETURN;
    case 'REVERSAL':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.REVERSAL;
    case 'PRICE_OVERRIDE':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.PRICE_OVERRIDE;
    case 'COST_READ':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.COST_READ;
    case 'REPORT_READ':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.REPORT_READ;
    case 'REPORT_EXPORT':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.REPORT_EXPORT;
    case 'CONFIGURATION_MANAGE':
      return PHARMACY_DISPENSING_PERMISSION_KEYS.CONFIGURATION_MANAGE;
  }
}

function isMutation(action: PharmacyAccessRequest['action']): boolean {
  return ![
    'READ',
    'QUEUE_READ',
    'COST_READ',
    'REPORT_READ',
    'REPORT_EXPORT',
  ].includes(action);
}

function minimumFields(
  action: PharmacyAccessRequest['action'],
  includeCost: boolean,
): readonly string[] {
  const fields = [
    'dispensationIdentity',
    'patientReference',
    'prescriptionReference',
    'encounterReference',
    'prescriberAttribution',
    'medicineIdentity',
    'quantity',
    'batchExpiry',
    'sellingPrice',
    'status',
    'version',
  ];

  if (['VERIFY', 'DISPENSE', 'CONTROLLED_DISPENSE'].includes(action)) {
    fields.push(
      'clinicalInstructions',
      'safetyAlerts',
      'allergyAndInteractionContext',
      'stockReservation',
    );
  }

  if (action === 'CONTROLLED_DISPENSE') {
    fields.push('controlledRegister', 'witnessAttribution');
  }

  if (includeCost) {
    fields.push('costPrice', 'valuation');
  }

  return fields;
}

export class PharmacyDispensingAccessPolicyService
implements PharmacyAccessPolicyPort {
  public constructor(
    private readonly identities: PharmacyDispensingContextRepositoryPort =
      new PharmacyDispensingContextRepository(),
  ) {}

  public async authorize(
    request: PharmacyAccessRequest,
  ): Promise<PharmacyAccessDecision> {
    const identity = await this.identities.findActorIdentity(
      request.actor.userId,
    );

    if (identity === null || identity.status !== 'ACTIVE') {
      return denied('The authenticated pharmacy actor is not active');
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== request.actor.facilityId
    ) {
      return denied('The authenticated pharmacy actor belongs to another facility');
    }

    if (
      request.location !== undefined &&
      request.location.facilityId !== request.actor.facilityId
    ) {
      return denied('The selected pharmacy location belongs to another facility');
    }

    if (
      request.dispensation !== undefined &&
      request.dispensation.facilityId.toHexString() !== request.actor.facilityId
    ) {
      return denied('The dispensation belongs to another facility');
    }

    const permission = requiredPermission(request.action);

    if (!request.actor.permissionKeys.includes(permission)) {
      return denied(`The operation requires ${permission}`);
    }

    if (
      request.dispensation?.controlledMedicine === true &&
      ['VERIFY', 'DISPENSE', 'REVERSAL', 'RETURN'].includes(request.action) &&
      !request.actor.permissionKeys.includes(
        PHARMACY_DISPENSING_PERMISSION_KEYS.CONTROLLED_DISPENSE,
      )
    ) {
      return denied(
        'Controlled-medicine operations require pharmacy.controlled_dispense',
      );
    }

    if (
      request.location !== undefined &&
      request.location.status !== 'ACTIVE'
    ) {
      return denied('The selected pharmacy location is inactive');
    }

    if (
      request.location !== undefined &&
      !request.location.supportsDispensing &&
      ['VERIFY', 'DISPENSE', 'CONTROLLED_DISPENSE', 'RETURN'].includes(
        request.action,
      )
    ) {
      return denied('The selected location is not configured for pharmacy dispensing');
    }

    if (
      request.action === 'CONTROLLED_DISPENSE' &&
      request.location !== undefined &&
      !request.location.allowsControlledMedicine
    ) {
      return denied('The selected location is not approved for controlled medicines');
    }

    if (
      request.witnessStaffId !== undefined &&
      request.witnessStaffId !== null &&
      request.witnessStaffId === identity.staffId
    ) {
      return denied('The pharmacist and witness must be different staff members');
    }

    const staff = identity.staffId === null
      ? null
      : await this.identities.findStaff(
          request.actor.facilityId,
          identity.staffId,
        );

    if (
      isMutation(request.action) &&
      (
        staff === null ||
        !staff.isActive ||
        staff.employmentStatus !== 'ACTIVE'
      )
    ) {
      return denied('Pharmacy mutations require active staff attribution');
    }

    const hasOperationalRole = request.actor.roleKeys.some((roleKey) =>
      PHARMACY_DISPENSING_OPERATIONAL_ROLE_KEYS.includes(
        roleKey as (typeof PHARMACY_DISPENSING_OPERATIONAL_ROLE_KEYS)[number],
      ),
    );

    const isAdministrator = request.actor.roleKeys.some((roleKey) =>
      ['SYSTEM_ADMINISTRATOR', 'HOSPITAL_ADMINISTRATOR'].includes(roleKey),
    );
    const isManager = request.actor.roleKeys.includes('PHARMACY_MANAGER');
    const includeCost =
      request.action === 'COST_READ' &&
      request.actor.permissionKeys.includes(
        PHARMACY_DISPENSING_PERMISSION_KEYS.COST_READ,
      );

    if (isAdministrator) {
      return allowed(
        'FACILITY_ADMINISTRATOR',
        includeCost,
        minimumFields(request.action, includeCost),
        true,
      );
    }

    if (isManager) {
      return allowed(
        'PHARMACY_MANAGER',
        includeCost,
        minimumFields(request.action, includeCost),
        request.action === 'COST_READ' || request.action.startsWith('REPORT_'),
      );
    }

    if (
      hasOperationalRole ||
      (
        staff !== null &&
        request.location?.locationType === 'PHARMACY'
      )
    ) {
      return allowed(
        'PHARMACY_OPERATIONAL',
        includeCost,
        minimumFields(request.action, includeCost),
        request.action === 'COST_READ',
      );
    }

    if (
      request.actor.permissionKeys.includes(
        PHARMACY_DISPENSING_PERMISSION_KEYS.BREAK_GLASS,
      )
    ) {
      if (request.actor.breakGlassReason === undefined) {
        throw new PharmacyBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        false,
        minimumFields(request.action, false),
        true,
      );
    }

    if (isMutation(request.action)) {
      return denied('Pharmacy mutations require an operational pharmacy role');
    }

    return denied('The actor has no pharmacy operational assignment');
  }
}