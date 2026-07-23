import {
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class ConsultantAgreementNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Consultant agreement was not found');
  }
}

export class ConsultantAgreementRuleNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Consultant agreement rule was not found');
  }
}

export class ConsultantRevenueEntryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Consultant revenue entry was not found');
  }
}

export class ConsultantSettlementNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Consultant settlement was not found');
  }
}

export class ConsultantDisputeNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Consultant-sharing dispute was not found');
  }
}

export class ConsultantSharingAccessDeniedError extends ForbiddenError {
  public constructor(
    message = 'The actor is not authorized for this consultant-sharing operation',
  ) {
    super(message);
  }
}

export class ConsultantSharingFacilityMismatchError extends ForbiddenError {
  public constructor() {
    super('Cross-facility consultant-sharing access is prohibited');
  }
}

export class ConsultantSharingMakerCheckerError extends ForbiddenError {
  public constructor() {
    super('The maker cannot approve the same sensitive consultant-sharing operation');
  }
}

export class ConsultantSharingBreakGlassProhibitedError extends ForbiddenError {
  public constructor() {
    super(
      'Break-glass access cannot bypass consultant agreement, adjustment, reversal, settlement, payout, or dispute approvals',
    );
  }
}

export class ConsultantAgreementInvalidStateTransitionError extends ConflictError {
  public constructor(from: string, to: string) {
    super(`Consultant agreement status cannot transition from ${from} to ${to}`);
  }
}

export class ConsultantSettlementInvalidStateTransitionError extends ConflictError {
  public constructor(from: string, to: string) {
    super(`Consultant settlement status cannot transition from ${from} to ${to}`);
  }
}

export class ConsultantSharingImmutableHistoryError extends ConflictError {
  public constructor() {
    super(
      'Finalized consultant-sharing financial history cannot be edited or deleted; use adjustment or reversal workflows',
    );
  }
}

export class ConsultantSharingConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('Consultant-sharing data changed before the operation could be completed');
  }
}

export class ConsultantAgreementConflictError extends ConflictError {
  public constructor(
    message = 'Consultant agreement rules conflict for the same effective financial context',
  ) {
    super(message);
  }
}

export class ConsultantAgreementAmbiguousMatchError extends ConflictError {
  public constructor(candidateRuleIds: readonly string[]) {
    super(
      `Consultant agreement selection is ambiguous between rules: ${candidateRuleIds.join(', ')}`,
    );
  }
}

export class ConsultantAgreementNoMatchError extends PreconditionFailedError {
  public constructor() {
    super('No active consultant agreement rule matches the authoritative financial context');
  }
}

export class ConsultantAgreementNotEffectiveError extends PreconditionFailedError {
  public constructor() {
    super('Consultant agreement is not active and effective for the source financial event date');
  }
}

export class ConsultantInvalidDecimalError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be a finite base-10 decimal value`);
  }
}

export class ConsultantNegativeAmountError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must not be negative`);
  }
}

export class ConsultantPositiveAmountRequiredError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be greater than zero`);
  }
}

export class ConsultantPercentageOutOfRangeError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be between 0 and 100 inclusive`);
  }
}

export class ConsultantRevenueReconciliationError extends ConflictError {
  public constructor(
    message = 'Consultant revenue components do not reconcile to the authoritative financial activity',
  ) {
    super(message);
  }
}

export class ConsultantShareExceedsEligibleRevenueError extends ConflictError {
  public constructor() {
    super('Consultant and participant shares cannot exceed eligible revenue');
  }
}

export class ConsultantNegativeHospitalShareError extends ConflictError {
  public constructor() {
    super('Consultant-sharing calculation cannot produce a negative hospital share');
  }
}

export class ConsultantParticipantDuplicateError extends ConflictError {
  public constructor(participantId: string) {
    super(`Duplicate consultant participant allocation is not allowed for ${participantId}`);
  }
}

export class ConsultantParticipantReconciliationError extends ConflictError {
  public constructor(
    message = 'Participant allocations must reconcile exactly to the consultant participant pool',
  ) {
    super(message);
  }
}

export class ConsultantTierConfigurationError extends BadRequestError {
  public constructor(message: string) {
    super(message);
  }
}

export class ConsultantRecognitionPreconditionError extends PreconditionFailedError {
  public constructor(message: string) {
    super(message);
  }
}

export class ConsultantDuplicateCalculationError extends ConflictError {
  public constructor() {
    super('The authoritative source financial event has already been recognized for this agreement rule');
  }
}

export class ConsultantSettlementReconciliationError extends ConflictError {
  public constructor(
    message = 'Consultant settlement totals do not reconcile with authoritative revenue entries and payments',
  ) {
    super(message);
  }
}

export class ConsultantSettlementOverpaymentError extends ConflictError {
  public constructor() {
    super('Consultant payment would exceed the approved outstanding settlement balance');
  }
}

export class ConsultantUnsupportedCalculationMethodError extends BadRequestError {
  public constructor(method: string) {
    super(`Unsupported consultant-sharing calculation method: ${method}`);
  }
}