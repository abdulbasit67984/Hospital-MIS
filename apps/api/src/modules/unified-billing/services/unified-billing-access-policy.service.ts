import {
  UNIFIED_BILLING_OPERATIONAL_ROLE_KEYS,
  UNIFIED_BILLING_PERMISSION_KEYS,
} from '../unified-billing.constants.js';

import {
  BillingBreakGlassReasonRequiredError,
} from '../unified-billing.errors.js';

import type {
  UnifiedBillingAccessAction,
  UnifiedBillingAccessDecision,
  UnifiedBillingAccessPolicyPort,
  UnifiedBillingAccessRequest,
  UnifiedBillingContextRepositoryPort,
} from '../unified-billing.ports.js';

function denied(
  reason: string,
): UnifiedBillingAccessDecision {
  return {
    allowed: false,
    accessMode: 'DENIED',
    includeCost: false,
    minimumNecessaryFields: [],
    auditSensitiveRead: false,
    requiresIndependentApproval: false,
    denialReason: reason,
  };
}

function allowed(
  accessMode: UnifiedBillingAccessDecision['accessMode'],
  includeCost: boolean,
  minimumNecessaryFields: readonly string[],
  auditSensitiveRead: boolean,
  requiresIndependentApproval: boolean,
): UnifiedBillingAccessDecision {
  return {
    allowed: true,
    accessMode,
    includeCost,
    minimumNecessaryFields,
    auditSensitiveRead,
    requiresIndependentApproval,
  };
}

function requiredPermission(
  action: UnifiedBillingAccessAction,
): string {
  switch (action) {
    case 'CATALOG_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.CATALOG_READ;
    case 'CATALOG_MANAGE':
      return UNIFIED_BILLING_PERMISSION_KEYS.CATALOG_MANAGE;
    case 'CATALOG_COST_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.CATALOG_COST_READ;
    case 'PRICING_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.PRICING_READ;
    case 'PRICING_MANAGE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PRICING_MANAGE;
    case 'PACKAGE_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.PACKAGES_READ;
    case 'PACKAGE_MANAGE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PACKAGES_MANAGE;
    case 'ACCOUNT_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_READ;
    case 'ACCOUNT_CREATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_CREATE;
    case 'ACCOUNT_MANAGE':
      return UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_MANAGE;
    case 'ACCOUNT_SUSPEND':
      return UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_SUSPEND;
    case 'ACCOUNT_FINALIZE':
      return UNIFIED_BILLING_PERMISSION_KEYS.ACCOUNTS_FINALIZE;
    case 'CHARGE_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_READ;
    case 'CHARGE_CREATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_CREATE;
    case 'CHARGE_POST':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_POST;
    case 'CHARGE_CANCEL':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_CANCEL;
    case 'CHARGE_REVERSE':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_REVERSE;
    case 'CHARGE_ADJUST':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_ADJUST;
    case 'CHARGE_WRITE_OFF':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_WRITE_OFF;
    case 'CHARGE_TRANSFER':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_TRANSFER;
    case 'CHARGE_MANUAL':
      return UNIFIED_BILLING_PERMISSION_KEYS.CHARGES_MANUAL;
    case 'INVOICE_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_READ;
    case 'INVOICE_CREATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_CREATE;
    case 'INVOICE_FINALIZE':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_FINALIZE;
    case 'INVOICE_CANCEL':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_CANCEL;
    case 'INVOICE_CORRECT':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_CORRECT;
    case 'INVOICE_PRINT':
      return UNIFIED_BILLING_PERMISSION_KEYS.INVOICE_PRINT;
    case 'DISCOUNT_REQUEST':
      return UNIFIED_BILLING_PERMISSION_KEYS.DISCOUNT_REQUEST;
    case 'DISCOUNT_APPROVE':
      return UNIFIED_BILLING_PERMISSION_KEYS.DISCOUNT_APPROVE;
    case 'PRICE_OVERRIDE_REQUEST':
      return UNIFIED_BILLING_PERMISSION_KEYS.PRICE_OVERRIDE_REQUEST;
    case 'PRICE_OVERRIDE_APPROVE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PRICE_OVERRIDE_APPROVE;
    case 'PAYMENT_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.PAYMENT_READ;
    case 'PAYMENT_RECEIVE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PAYMENT_RECEIVE;
    case 'PAYMENT_ALLOCATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PAYMENT_ALLOCATE;
    case 'PAYMENT_REVERSE':
      return UNIFIED_BILLING_PERMISSION_KEYS.PAYMENT_REVERSE;
    case 'REFUND_REQUEST':
      return UNIFIED_BILLING_PERMISSION_KEYS.REFUND_REQUEST;
    case 'REFUND_APPROVE':
      return UNIFIED_BILLING_PERMISSION_KEYS.REFUND_APPROVE;
    case 'REFUND_PROCESS':
      return UNIFIED_BILLING_PERMISSION_KEYS.REFUND_PROCESS;
    case 'CREDIT_NOTE_CREATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.CREDIT_NOTE_CREATE;
    case 'CREDIT_NOTE_POST':
      return UNIFIED_BILLING_PERMISSION_KEYS.CREDIT_NOTE_POST;
    case 'DEBIT_NOTE_CREATE':
      return UNIFIED_BILLING_PERMISSION_KEYS.DEBIT_NOTE_CREATE;
    case 'DEBIT_NOTE_POST':
      return UNIFIED_BILLING_PERMISSION_KEYS.DEBIT_NOTE_POST;
    case 'FINANCIAL_DISCHARGE':
      return UNIFIED_BILLING_PERMISSION_KEYS.FINANCIAL_DISCHARGE;
    case 'REPORT_READ':
      return UNIFIED_BILLING_PERMISSION_KEYS.REPORT_READ;
    case 'REPORT_EXPORT':
      return UNIFIED_BILLING_PERMISSION_KEYS.REPORT_EXPORT;
    case 'REPORT_COST_MARGIN':
      return UNIFIED_BILLING_PERMISSION_KEYS.REPORT_COST_MARGIN;
  }
}

function isMutation(
  action: UnifiedBillingAccessAction,
): boolean {
  return ![
    'CATALOG_READ',
    'CATALOG_COST_READ',
    'PRICING_READ',
    'PACKAGE_READ',
    'ACCOUNT_READ',
    'CHARGE_READ',
    'INVOICE_READ',
    'INVOICE_PRINT',
    'PAYMENT_READ',
    'REPORT_READ',
    'REPORT_EXPORT',
    'REPORT_COST_MARGIN',
  ].includes(action);
}

function needsIndependentApproval(
  action: UnifiedBillingAccessAction,
): boolean {
  return [
    'ACCOUNT_FINALIZE',
    'CHARGE_REVERSE',
    'CHARGE_ADJUST',
    'CHARGE_WRITE_OFF',
    'CHARGE_TRANSFER',
    'DISCOUNT_APPROVE',
    'PRICE_OVERRIDE_APPROVE',
    'PAYMENT_REVERSE',
    'REFUND_APPROVE',
    'REFUND_PROCESS',
    'CREDIT_NOTE_POST',
    'DEBIT_NOTE_POST',
    'INVOICE_CANCEL',
    'INVOICE_CORRECT',
  ].includes(action);
}

function minimumFields(
  action: UnifiedBillingAccessAction,
  includeCost: boolean,
): readonly string[] {
  const fields = [
    'financialIdentity',
    'patientReference',
    'accountReference',
    'sourceAttribution',
    'chargeSnapshot',
    'priceSnapshot',
    'quantity',
    'financialTotals',
    'payerResponsibility',
    'patientResponsibility',
    'status',
    'version',
  ];

  if (
    action.startsWith('INVOICE_')
  ) {
    fields.push(
      'invoiceLines',
      'invoiceFinalization',
      'paymentSummary',
    );
  }

  if (
    action.startsWith('PAYMENT_') ||
    action.startsWith('REFUND_')
  ) {
    fields.push(
      'paymentMethod',
      'allocationSummary',
      'cashierAttribution',
      'externalReferenceMasked',
    );
  }

  if (
    action.includes('APPROVE') ||
    needsIndependentApproval(action)
  ) {
    fields.push(
      'approvalHistory',
      'makerCheckerAttribution',
      'reason',
    );
  }

  if (includeCost) {
    fields.push(
      'costAmount',
      'marginAmount',
      'marginPercentage',
    );
  }

  return fields;
}

function recordFacilityIds(
  request: UnifiedBillingAccessRequest,
): string[] {
  return [
    request.patientAccount?.facilityId.toHexString(),
    request.accountCharge?.facilityId.toHexString(),
    request.invoice?.facilityId.toHexString(),
    request.payment?.facilityId.toHexString(),
  ].filter(
    (value): value is string =>
      value !== undefined,
  );
}

export class UnifiedBillingAccessPolicyService
implements UnifiedBillingAccessPolicyPort {
  public constructor(
    private readonly identities:
      UnifiedBillingContextRepositoryPort,
  ) {}

  public async authorize(
    request: UnifiedBillingAccessRequest,
  ): Promise<UnifiedBillingAccessDecision> {
    const identity =
      await this.identities.findActorIdentity(
        request.actor.userId,
      );

    if (
      identity === null ||
      identity.status !== 'ACTIVE'
    ) {
      return denied(
        'The authenticated billing actor is not active',
      );
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !==
        request.actor.facilityId
    ) {
      return denied(
        'The authenticated billing actor belongs to another facility',
      );
    }

    if (
      recordFacilityIds(request).some(
        (facilityId) =>
          facilityId !==
          request.actor.facilityId,
      )
    ) {
      return denied(
        'The requested financial record belongs to another facility',
      );
    }

    const permission =
      requiredPermission(request.action);

    if (
      !request.actor.permissionKeys.includes(
        permission,
      )
    ) {
      return denied(
        `The operation requires ${permission}`,
      );
    }

    const includeCost =
      request.action ===
        'CATALOG_COST_READ' ||
      request.action ===
        'REPORT_COST_MARGIN' ||
      request.includeCost === true;

    if (
      includeCost &&
      !request.actor.permissionKeys.includes(
        UNIFIED_BILLING_PERMISSION_KEYS
          .CATALOG_COST_READ,
      ) &&
      !request.actor.permissionKeys.includes(
        UNIFIED_BILLING_PERMISSION_KEYS
          .REPORT_COST_MARGIN,
      )
    ) {
      return denied(
        'Cost and margin information requires an explicit sensitive financial permission',
      );
    }

    if (
      needsIndependentApproval(
        request.action,
      ) &&
      request.requesterUserId != null &&
      request.requesterUserId ===
        request.actor.userId
    ) {
      return denied(
        'The requester cannot approve or post their own sensitive financial operation',
      );
    }

    const staff =
      identity.staffId === null
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
        staff.employmentStatus !==
          'ACTIVE'
      )
    ) {
      return denied(
        'Billing mutations require active staff attribution',
      );
    }

    const roleKeys =
      request.actor.roleKeys;
    const isAdministrator =
      roleKeys.some(
        (roleKey) =>
          [
            'SYSTEM_ADMINISTRATOR',
            'HOSPITAL_ADMINISTRATOR',
          ].includes(roleKey),
      );
    const isManager =
      roleKeys.includes(
        'BILLING_MANAGER',
      );
    const isBillingOfficer =
      roleKeys.includes(
        'BILLING_OFFICER',
      );
    const isCashier =
      roleKeys.includes('CASHIER');
    const isClaimsOfficer =
      roleKeys.includes(
        'CLAIMS_OFFICER',
      );
    const hasOperationalRole =
      roleKeys.some(
        (roleKey) =>
          UNIFIED_BILLING_OPERATIONAL_ROLE_KEYS.includes(
            roleKey as
              (typeof UNIFIED_BILLING_OPERATIONAL_ROLE_KEYS)[number],
          ),
      );

    const auditSensitiveRead =
      includeCost ||
      request.action.includes('APPROVE') ||
      request.action.includes('REVERSE') ||
      request.action.includes('WRITE_OFF') ||
      request.action.includes('REFUND') ||
      request.action ===
        'FINANCIAL_DISCHARGE';

    if (isAdministrator) {
      return allowed(
        'FACILITY_ADMINISTRATOR',
        includeCost,
        minimumFields(
          request.action,
          includeCost,
        ),
        true,
        needsIndependentApproval(
          request.action,
        ),
      );
    }

    if (isManager) {
      return allowed(
        'BILLING_MANAGER',
        includeCost,
        minimumFields(
          request.action,
          includeCost,
        ),
        auditSensitiveRead,
        needsIndependentApproval(
          request.action,
        ),
      );
    }

    if (
      isCashier &&
      [
        'ACCOUNT_READ',
        'INVOICE_READ',
        'INVOICE_PRINT',
        'PAYMENT_READ',
        'PAYMENT_RECEIVE',
        'PAYMENT_ALLOCATE',
        'REFUND_REQUEST',
      ].includes(request.action)
    ) {
      return allowed(
        'CASHIER',
        false,
        minimumFields(
          request.action,
          false,
        ),
        auditSensitiveRead,
        false,
      );
    }

    if (
      isClaimsOfficer &&
      [
        'CATALOG_READ',
        'PRICING_READ',
        'PACKAGE_READ',
        'ACCOUNT_READ',
        'CHARGE_READ',
        'INVOICE_READ',
        'REPORT_READ',
        'REPORT_EXPORT',
      ].includes(request.action)
    ) {
      return allowed(
        'CLAIMS_OPERATIONAL',
        false,
        minimumFields(
          request.action,
          false,
        ),
        auditSensitiveRead,
        false,
      );
    }

    if (
      isBillingOfficer ||
      hasOperationalRole
    ) {
      if (
        needsIndependentApproval(
          request.action,
        )
      ) {
        return denied(
          'This sensitive financial operation requires a billing manager or facility administrator',
        );
      }

      return allowed(
        'BILLING_OPERATIONAL',
        false,
        minimumFields(
          request.action,
          false,
        ),
        auditSensitiveRead,
        false,
      );
    }

    if (
      !isMutation(request.action) &&
      request.actor.permissionKeys.includes(
        UNIFIED_BILLING_PERMISSION_KEYS
          .BREAK_GLASS,
      )
    ) {
      if (
        request.actor.breakGlassReason ===
        undefined
      ) {
        throw new BillingBreakGlassReasonRequiredError();
      }

      return allowed(
        'BREAK_GLASS',
        false,
        minimumFields(
          request.action,
          false,
        ),
        true,
        false,
      );
    }

    return denied(
      'The actor has no billing operational assignment',
    );
  }
}