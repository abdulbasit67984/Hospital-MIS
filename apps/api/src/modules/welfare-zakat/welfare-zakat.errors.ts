import {
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class AssistanceFundNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested welfare, Zakat, charity, or donor fund was not found');
  }
}

export class AssistanceApplicationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested assistance application was not found');
  }
}

export class AssistanceApprovalNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested assistance approval was not found');
  }
}

export class AssistanceReservationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested assistance reservation was not found');
  }
}

export class AssistanceAllocationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested welfare or Zakat allocation was not found');
  }
}

export class AssistanceFundTransactionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested immutable fund transaction was not found');
  }
}

export class AssistanceDuplicateFundCodeError extends ConflictError {
  public constructor() {
    super('An assistance fund with this code already exists in the facility');
  }
}

export class AssistanceDuplicateApplicationError extends ConflictError {
  public constructor() {
    super('A materially duplicate active assistance application already exists');
  }
}

export class AssistanceInvalidStateTransitionError extends ConflictError {
  public constructor(entity: string, from: string, to: string) {
    super(`${entity} status cannot transition from ${from} to ${to}`);
  }
}

export class AssistanceImmutableHistoryError extends ConflictError {
  public constructor() {
    super(
      'Immutable fund, application, approval, allocation, reversal, refund, repayment, or adjustment history cannot be edited or deleted',
    );
  }
}

export class AssistanceVersionConflictError extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The assistance fund, application, approval, reservation, allocation, assignment, or workflow record changed before this operation completed',
    );
  }
}

export class AssistanceMakerCheckerViolationError extends ForbiddenError {
  public constructor() {
    super(
      'The maker cannot approve, confirm, reverse, refund, repay, transfer, or adjust the same sensitive financial operation',
    );
  }
}

export class AssistanceBreakGlassApprovalBypassError extends ForbiddenError {
  public constructor() {
    super(
      'Break-glass access cannot bypass maker-checker separation or financial approval requirements',
    );
  }
}

export class AssistanceFundInactiveError extends PreconditionFailedError {
  public constructor() {
    super('Only an active and currently effective fund may be reserved or utilized');
  }
}

export class AssistanceFundExpiredError extends PreconditionFailedError {
  public constructor() {
    super('The assistance fund is outside its configured effective period');
  }
}

export class AssistanceFundRestrictionError extends PreconditionFailedError {
  public constructor(message = 'The requested assistance does not satisfy the fund restrictions') {
    super(message);
  }
}

export class AssistanceApplicationIncompleteError extends PreconditionFailedError {
  public constructor() {
    super('The assistance application is incomplete and cannot be submitted');
  }
}

export class AssistanceApplicationNotEligibleError extends PreconditionFailedError {
  public constructor() {
    super('The assistance application has not passed the required eligibility review');
  }
}

export class AssistanceApprovalRequiredError extends PreconditionFailedError {
  public constructor() {
    super('A valid independent assistance approval is required for this operation');
  }
}

export class AssistanceApprovalExpiredError extends PreconditionFailedError {
  public constructor() {
    super('The assistance approval has expired or is outside its approved period');
  }
}

export class AssistanceApprovalLimitExceededError extends ConflictError {
  public constructor() {
    super('The requested amount exceeds the remaining approved assistance limit');
  }
}

export class AssistanceFundBalanceExceededError extends ConflictError {
  public constructor() {
    super('The requested operation exceeds the authoritative available fund balance');
  }
}

export class AssistanceNegativeFundBalanceError extends ConflictError {
  public constructor() {
    super('The operation would create a negative fund balance');
  }
}

export class AssistancePatientResponsibilityExceededError extends ConflictError {
  public constructor() {
    super('The allocation exceeds the authoritative patient responsibility');
  }
}

export class AssistanceInvoiceBalanceExceededError extends ConflictError {
  public constructor() {
    super('The allocation exceeds the authoritative invoice or invoice-line balance');
  }
}

export class AssistanceReservationExceededError extends ConflictError {
  public constructor() {
    super('The allocation exceeds the remaining active reservation');
  }
}

export class AssistanceDoubleFundingError extends ConflictError {
  public constructor() {
    super(
      'The requested amount would duplicate payer, package, claim, welfare, Zakat, charity, or donor funding',
    );
  }
}

export class AssistanceFinancialReconciliationError extends ConflictError {
  public constructor(
    message = 'Assistance financial amounts do not reconcile to authoritative fund, approval, invoice, and patient-account values',
  ) {
    super(message);
  }
}

export class AssistanceInvalidDecimalError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be a finite base-10 decimal value`);
  }
}

export class AssistanceNegativeAmountError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} cannot be negative`);
  }
}

export class AssistancePositiveAmountRequiredError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be greater than zero`);
  }
}

export class AssistanceInvalidEffectivePeriodError extends BadRequestError {
  public constructor() {
    super('The effective-through date must be later than the effective-from date');
  }
}

export class AssistanceInvalidLimitError extends BadRequestError {
  public constructor(message = 'The configured assistance limit is invalid') {
    super(message);
  }
}

export class AssistanceSensitiveClientAmountError extends BadRequestError {
  public constructor() {
    super('Authoritative fund, approval, reservation, allocation, and invoice balances cannot be supplied by the client');
  }
}

export class AssistanceTransferSameFundError extends BadRequestError {
  public constructor() {
    super('A fund transfer must use different source and destination funds');
  }
}

export class AssistanceCurrencyMismatchError extends ConflictError {
  public constructor() {
    super('The assistance operation currency does not match the authoritative fund and invoice currency');
  }
}

export class AssistanceReversalExceededError extends ConflictError {
  public constructor() {
    super('The reversal, refund, repayment, or recovery exceeds the remaining reversible amount');
  }
}

export class AssistanceAccessDeniedError extends ForbiddenError {
  public constructor(message = 'You are not authorized to access or modify this Welfare and Zakat record') {
    super(message);
  }
}

export class AssistanceWorkItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The requested Welfare and Zakat work-queue item was not found');
  }
}

export class AssistanceEscalationTargetRequiredError extends BadRequestError {
  public constructor() {
    super('Escalating a Welfare and Zakat work item requires an explicit destination user');
  }
}