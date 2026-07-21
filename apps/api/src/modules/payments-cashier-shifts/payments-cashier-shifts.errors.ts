import {
  AppError,
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class PaymentMethodConfigurationNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment-method configuration was not found',
    );
  }
}

export class CashCounterNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Cash counter was not found',
    );
  }
}

export class CashierShiftNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Cashier shift was not found',
    );
  }
}

export class ShiftReconciliationNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Shift reconciliation was not found',
    );
  }
}

export class PaymentIntentNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment intent was not found',
    );
  }
}

export class PaymentNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment was not found',
    );
  }
}

export class PaymentAllocationNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment allocation was not found',
    );
  }
}

export class PaymentReceiptNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment receipt was not found',
    );
  }
}

export class DepositNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Deposit or advance was not found',
    );
  }
}

export class RefundRequestNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Refund request was not found',
    );
  }
}

export class RefundNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Refund was not found',
    );
  }
}

export class PaymentReversalNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Payment reversal was not found',
    );
  }
}

export class CashMovementNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'Cash movement was not found',
    );
  }
}

export class PaymentCashierAccessDeniedError
extends ForbiddenError {
  public constructor(
    message =
      'The actor is not authorized for this payment operation',
  ) {
    super(message);
  }
}

export class PaymentCashierActorInactiveError
extends ForbiddenError {
  public constructor() {
    super(
      'Payment operations require an active staff identity in the current facility',
    );
  }
}

export class PaymentCashierFacilityMismatchError
extends ForbiddenError {
  public constructor() {
    super(
      'Cross-facility payment access is prohibited',
    );
  }
}

export class PaymentCashierCounterScopeError
extends ForbiddenError {
  public constructor() {
    super(
      'The actor is not assigned or authorized for this cash counter',
    );
  }
}

export class PaymentCashierCashierScopeError
extends ForbiddenError {
  public constructor() {
    super(
      'The actor is not authorized to perform this operation for another cashier',
    );
  }
}

export class PaymentCashierMakerCheckerError
extends ForbiddenError {
  public constructor() {
    super(
      'The maker cannot approve or post the same sensitive financial operation',
    );
  }
}

export class PaymentCashierBreakGlassProhibitedError
extends ForbiddenError {
  public constructor() {
    super(
      'Break-glass access cannot bypass payment approvals, reconciliation, or maker-checker controls',
    );
  }
}

export class PaymentMethodInactiveError
extends ConflictError {
  public constructor() {
    super(
      'The selected payment method is inactive or outside its effective period',
    );
  }
}

export class PaymentMethodReferenceRequiredError
extends BadRequestError {
  public constructor(
    referenceType: string,
  ) {
    super(
      `The selected payment method requires a ${referenceType} reference`,
    );
  }
}

export class PaymentMethodCurrencyError
extends ConflictError {
  public constructor() {
    super(
      'The selected payment method does not support the authoritative transaction currency',
    );
  }
}

export class PaymentMethodRefundNotAllowedError
extends ConflictError {
  public constructor() {
    super(
      'The original payment method is not eligible for the requested refund workflow',
    );
  }
}

export class CashCounterInactiveError
extends ConflictError {
  public constructor() {
    super(
      'Financial activity cannot be recorded through an inactive cash counter',
    );
  }
}

export class CashCounterPaymentMethodError
extends ConflictError {
  public constructor() {
    super(
      'The selected payment method is not allowed at this cash counter',
    );
  }
}

export class ActiveCashierShiftConflictError
extends ConflictError {
  public constructor() {
    super(
      'An active cashier shift already exists under the configured counter policy',
    );
  }
}

export class CashierShiftClosedError
extends ConflictError {
  public constructor() {
    super(
      'Financial activity cannot be posted against a closed cashier shift',
    );
  }
}

export class CashierShiftNotOpenError
extends ConflictError {
  public constructor() {
    super(
      'The cashier shift is not open for this financial operation',
    );
  }
}

export class CashierShiftClosingBlockedError
extends PreconditionFailedError {
  public constructor(
    message =
      'The cashier shift has unresolved blocking discrepancies',
  ) {
    super(message);
  }
}

export class CashHoldingLimitExceededError
extends PreconditionFailedError {
  public constructor() {
    super(
      'The cash holding limit would be exceeded without an authorized cash movement',
    );
  }
}

export class PaymentIntentExpiredError
extends ConflictError {
  public constructor() {
    super(
      'The payment intent has expired',
    );
  }
}

export class PaymentIntentStateError
extends ConflictError {
  public constructor(
    message =
      'The payment intent is not in an eligible state',
  ) {
    super(message);
  }
}

export class PaymentDuplicateError
extends ConflictError {
  public constructor() {
    super(
      'A payment already exists for the same deterministic operation',
    );
  }
}

export class PaymentAmountMismatchError
extends BadRequestError {
  public constructor(
    message =
      'Tender, allocation, and payment totals do not reconcile exactly',
  ) {
    super(message);
  }
}

export class PaymentOutstandingBalanceError
extends ConflictError {
  public constructor() {
    super(
      'The requested allocation exceeds the server-authoritative outstanding balance',
    );
  }
}

export class PaymentAllocationConflictError
extends ConflictError {
  public constructor(
    message =
      'The payment allocation is invalid or exceeds an authoritative balance',
  ) {
    super(message);
  }
}

export class PaymentFinalizedInvoiceError
extends ConflictError {
  public constructor(
    message =
      'The invoice is not eligible for the requested payment allocation',
  ) {
    super(message);
  }
}

export class PaymentRefundableBalanceError
extends ConflictError {
  public constructor() {
    super(
      'The requested refund exceeds the server-authoritative refundable balance',
    );
  }
}

export class DepositBalanceError
extends ConflictError {
  public constructor() {
    super(
      'The requested deposit operation exceeds the available deposit balance',
    );
  }
}

export class ReceiptImmutableError
extends ConflictError {
  public constructor() {
    super(
      'Issued receipts are immutable and must be corrected through replacement records',
    );
  }
}

export class PaymentCashierConcurrencyError
extends ConcurrencyConflictError {
  public constructor(
    message =
      'The financial record changed before the operation could be completed',
  ) {
    super(message);
  }
}

export class PaymentCashierPersistenceError
extends AppError {
  public constructor(
    cause?: unknown,
  ) {
    super({
      code:
        'PAYMENTS_CASHIER_PERSISTENCE_ERROR',

      message:
        'The payment or cashier-shift operation could not be persisted',

      statusCode:
        500,

      expose:
        false,

      retryable:
        true,

      cause,
    });
  }
}

export class PaymentCashierRecoveryRequiredError
extends AppError {
  public constructor(
    message: string,
    cause?: unknown,
  ) {
    super({
      code:
        'PAYMENTS_CASHIER_RECOVERY_REQUIRED',

      message,

      statusCode:
        503,

      expose:
        false,

      retryable:
        true,

      cause,
    });
  }
}

function duplicateIndexName(
  error: unknown,
): string | null {
  if (
    error == null ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  if (
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const match =
      /index:\s+([^\s]+)\s+dup key/iu.exec(
        error.message,
      );

    return match?.[1] ?? '';
  }

  return '';
}

export function throwMappedPaymentCashierPersistenceError(
  error: unknown,
): never {
  const indexName =
    duplicateIndexName(error);

  if (indexName !== null) {
    if (
      indexName.includes(
        'cash_shifts_active_counter_cashier',
      ) ||
      indexName.includes(
        'cash_shifts_operation',
      )
    ) {
      throw new ActiveCashierShiftConflictError();
    }

    if (
      indexName.includes(
        'payments_operation',
      ) ||
      indexName.includes(
        'payment_intents_operation',
      ) ||
      indexName.includes(
        'payments_external_reference',
      )
    ) {
      throw new PaymentDuplicateError();
    }

    if (
      indexName.includes(
        'payment_receipts_number',
      ) ||
      indexName.includes(
        'payment_receipts_payment',
      ) ||
      indexName.includes(
        'payments_facility_receipt',
      )
    ) {
      throw new ConflictError(
        'A receipt already exists for this payment operation',
      );
    }

    if (
      indexName.includes(
        'refunds_operation',
      ) ||
      indexName.includes(
        'refund_requests_operation',
      )
    ) {
      throw new ConflictError(
        'A refund already exists for the same deterministic operation',
      );
    }

    if (
      indexName.includes(
        'payment_reversals_operation',
      )
    ) {
      throw new ConflictError(
        'A payment reversal already exists for the same deterministic operation',
      );
    }
  }

  throw new PaymentCashierPersistenceError(
    error,
  );
}