import {
  PAYMENT_CASHIER_ACTION_PERMISSION,
  PAYMENT_CASHIER_BREAK_GLASS_PROHIBITED_ACTIONS,
  PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS,
  PAYMENT_CASHIER_PERMISSION_KEYS,
  PAYMENT_CASHIER_READ_ACTIONS,
} from '../payments-cashier-shifts.constants.js';

import {
  PaymentCashierAccessDeniedError,
  PaymentCashierActorInactiveError,
  PaymentCashierBreakGlassProhibitedError,
  PaymentCashierCashierScopeError,
  PaymentCashierCounterScopeError,
  PaymentCashierFacilityMismatchError,
  PaymentCashierMakerCheckerError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessDecision,
  PaymentCashierAccessRequest,
} from '../payments-cashier-shifts.contracts.js';

import type {
  PaymentCashierAccessPolicyPort,
} from '../payments-cashier-shifts.ports.js';

function denied(
  request:
    PaymentCashierAccessRequest,

  reason:
    string,
): PaymentCashierAccessDecision {
  return {
    allowed:
      false,

    accessMode:
      'DENIED',

    requiredPermission:
      PAYMENT_CASHIER_ACTION_PERMISSION[
        request.action
      ],

    minimumNecessaryFields:
      [],

    auditSensitiveRead:
      false,

    requiresIndependentApproval:
      PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS.includes(
        request.action as
          (typeof PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS)[number],
      ),

    denialReason:
      reason,
  };
}

function minimumNecessaryFields(
  request:
    PaymentCashierAccessRequest,
): readonly string[] {
  const fields = [
    'publicFinancialNumber',
    'facilityReference',
    'counterReference',
    'shiftReference',
    'cashierAttribution',
    'paymentMethodSummary',
    'currency',
    'financialTotals',
    'status',
    'version',
    'timestamps',
  ];

  if (
    request.action.startsWith(
      'PAYMENT_',
    ) ||
    request.action.startsWith(
      'REFUND_',
    ) ||
    request.action.startsWith(
      'REVERSAL_',
    ) ||
    request.action.startsWith(
      'DEPOSIT_',
    ) ||
    request.action.startsWith(
      'RECEIPT_',
    )
  ) {
    fields.push(
      'patientReference',
      'accountReference',
      'invoiceReferences',
      'allocationSummary',
    );
  }

  if (
    request.action.startsWith(
      'SHIFT_',
    ) ||
    request.action.startsWith(
      'RECONCILIATION_',
    ) ||
    request.action.startsWith(
      'CASH_MOVEMENT_',
    )
  ) {
    fields.push(
      'openingFloat',
      'expectedCash',
      'declaredCash',
      'cashVariance',
      'receiptRange',
      'blockingDiscrepancies',
    );
  }

  return fields;
}

function isReadAction(
  action:
    PaymentCashierAccessRequest['action'],
): boolean {
  return PAYMENT_CASHIER_READ_ACTIONS.includes(
    action as
      (typeof PAYMENT_CASHIER_READ_ACTIONS)[number],
  );
}

function isIndependentApprovalAction(
  action:
    PaymentCashierAccessRequest['action'],
): boolean {
  return PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS.includes(
    action as
      (typeof PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS)[number],
  );
}

function isBreakGlassProhibited(
  action:
    PaymentCashierAccessRequest['action'],
): boolean {
  return PAYMENT_CASHIER_BREAK_GLASS_PROHIBITED_ACTIONS.includes(
    action as
      (typeof PAYMENT_CASHIER_BREAK_GLASS_PROHIBITED_ACTIONS)[number],
  );
}

function isCounterElevated(
  request:
    PaymentCashierAccessRequest,
): boolean {
  return (
    request.actor.permissionKeys.has(
      PAYMENT_CASHIER_PERMISSION_KEYS
        .COUNTER_MANAGE,
    ) ||
    request.actor.permissionKeys.has(
      PAYMENT_CASHIER_PERMISSION_KEYS
        .RECONCILIATION_OVERRIDE,
    ) ||
    request.action === 'REPORT_READ' ||
    request.action === 'REPORT_EXPORT' ||
    request.action === 'RECOVERY_MANAGE' ||
    request.action === 'PAYMENT_METHOD_MANAGE' ||
    request.action === 'COUNTER_MANAGE' ||
    request.action === 'COUNTER_ASSIGN'
  );
}

function isCashierElevated(
  request:
    PaymentCashierAccessRequest,
): boolean {
  return (
    isCounterElevated(
      request,
    ) ||
    request.action ===
      'SHIFT_VARIANCE_APPROVE' ||
    request.action ===
      'SHIFT_REOPEN' ||
    request.action ===
      'REFUND_APPROVE' ||
    request.action ===
      'REVERSAL_APPROVE' ||
    request.action ===
      'CASH_MOVEMENT_APPROVE'
  );
}

export class PaymentsCashierShiftsAccessPolicyService
implements PaymentCashierAccessPolicyPort {
  public decide(
    request:
      PaymentCashierAccessRequest,
  ): PaymentCashierAccessDecision {
    const requiredPermission =
      PAYMENT_CASHIER_ACTION_PERMISSION[
        request.action
      ];

    if (!request.actor.active) {
      return denied(
        request,
        'Actor staff identity is inactive',
      );
    }

    if (
      request.resourceFacilityId !== undefined &&
      request.resourceFacilityId !==
        request.actor.facilityId
    ) {
      return denied(
        request,
        'Resource belongs to another facility',
      );
    }

    if (
      !request.actor.permissionKeys.has(
        requiredPermission,
      )
    ) {
      return denied(
        request,
        `Missing required permission: ${requiredPermission}`,
      );
    }

    if (
      request.actor.breakGlassReason !== undefined &&
      isBreakGlassProhibited(
        request.action,
      )
    ) {
      return denied(
        request,
        'Break-glass access is prohibited for this financial control',
      );
    }

    if (
      request.paymentMethodPermissionCodes !==
        undefined &&
      request.paymentMethodPermissionCodes.some(
        (permission) =>
          !request.actor.permissionKeys.has(
            permission,
          ),
      )
    ) {
      return denied(
        request,
        'The actor lacks a permission required by the payment method',
      );
    }

    if (
      request.manualOperation === true &&
      !request.actor.permissionKeys.has(
        PAYMENT_CASHIER_PERMISSION_KEYS
          .PAYMENT_COLLECT_MANUAL,
      )
    ) {
      return denied(
        request,
        'Manual payment collection requires explicit permission',
      );
    }

    if (
      request.counterId != null &&
      !request.actor.assignedCounterIds.includes(
        request.counterId,
      ) &&
      !isCounterElevated(
        request,
      )
    ) {
      return denied(
        request,
        'Actor is outside the authorized counter scope',
      );
    }

    if (
      request.cashierUserId != null &&
      request.cashierUserId !==
        request.actor.userId &&
      !isCashierElevated(
        request,
      )
    ) {
      return denied(
        request,
        'Actor is outside the authorized cashier scope',
      );
    }

    if (
      isIndependentApprovalAction(
        request.action,
      ) &&
      request.makerUserId != null &&
      request.makerUserId ===
        request.actor.userId
    ) {
      return denied(
        request,
        'Maker-checker separation prohibits self-approval',
      );
    }

    const counterScoped =
      request.counterId != null &&
      !isCounterElevated(
        request,
      );

    const cashierScoped =
      request.cashierUserId != null &&
      request.cashierUserId ===
        request.actor.userId &&
      !isCashierElevated(
        request,
      );

    return {
      allowed:
        true,

      accessMode:
        isReadAction(
          request.action,
        )
          ? counterScoped ||
            cashierScoped
            ? 'CASHIER_SCOPED'
            : 'READ_ONLY'
          : counterScoped
            ? 'COUNTER_SCOPED'
            : cashierScoped
              ? 'CASHIER_SCOPED'
              : 'FULL',

      requiredPermission,

      minimumNecessaryFields:
        minimumNecessaryFields(
          request,
        ),

      auditSensitiveRead:
        request.action ===
          'PAYMENT_READ' ||
        request.action ===
          'RECEIPT_READ' ||
        request.action ===
          'REPORT_EXPORT',

      requiresIndependentApproval:
        isIndependentApprovalAction(
          request.action,
        ),
    };
  }

  public require(
    request:
      PaymentCashierAccessRequest,
  ): PaymentCashierAccessDecision {
    const decision =
      this.decide(
        request,
      );

    if (decision.allowed) {
      return decision;
    }

    if (!request.actor.active) {
      throw new PaymentCashierActorInactiveError();
    }

    if (
      request.resourceFacilityId !== undefined &&
      request.resourceFacilityId !==
        request.actor.facilityId
    ) {
      throw new PaymentCashierFacilityMismatchError();
    }

    if (
      request.actor.breakGlassReason !== undefined &&
      isBreakGlassProhibited(
        request.action,
      )
    ) {
      throw new PaymentCashierBreakGlassProhibitedError();
    }

    if (
      isIndependentApprovalAction(
        request.action,
      ) &&
      request.makerUserId != null &&
      request.makerUserId ===
        request.actor.userId
    ) {
      throw new PaymentCashierMakerCheckerError();
    }

    if (
      request.counterId != null &&
      !request.actor.assignedCounterIds.includes(
        request.counterId,
      ) &&
      !isCounterElevated(
        request,
      )
    ) {
      throw new PaymentCashierCounterScopeError();
    }

    if (
      request.cashierUserId != null &&
      request.cashierUserId !==
        request.actor.userId &&
      !isCashierElevated(
        request,
      )
    ) {
      throw new PaymentCashierCashierScopeError();
    }

    throw new PaymentCashierAccessDeniedError(
      decision.denialReason ??
        'The actor is not authorized for this payment operation',
    );
  }
}