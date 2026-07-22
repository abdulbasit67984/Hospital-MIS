import {
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class ClaimNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim was not found');
  }
}

export class ClaimLineNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim line was not found');
  }
}

export class ClaimBatchNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim batch was not found');
  }
}

export class ClaimSubmissionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim submission was not found');
  }
}

export class ClaimAdjudicationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim adjudication was not found');
  }
}

export class ClaimRemittanceNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim remittance was not found');
  }
}

export class ClaimAppealNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim appeal was not found');
  }
}

export class ClaimWorkItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Claim work item was not found');
  }
}

export class ClaimAccessDeniedError extends ForbiddenError {
  public constructor(message = 'The actor is not authorized for this claim operation') {
    super(message);
  }
}

export class ClaimFacilityMismatchError extends ForbiddenError {
  public constructor() {
    super('Cross-facility claim access is prohibited');
  }
}

export class ClaimMakerCheckerError extends ForbiddenError {
  public constructor() {
    super('The maker cannot approve the same sensitive claim operation');
  }
}

export class ClaimBreakGlassProhibitedError extends ForbiddenError {
  public constructor() {
    super(
      'Break-glass access cannot bypass claim submission, cancellation, reversal, adjustment, write-off, or appeal approvals',
    );
  }
}

export class ClaimInvalidStateTransitionError extends ConflictError {
  public constructor(from: string, to: string) {
    super(`Claim status cannot transition from ${from} to ${to}`);
  }
}

export class ClaimImmutableHistoryError extends ConflictError {
  public constructor() {
    super('Immutable claim financial or workflow history cannot be edited or deleted');
  }
}

export class ClaimNotEditableError extends ConflictError {
  public constructor() {
    super('Only an eligible draft, returned, or rejected claim version may be edited');
  }
}

export class ClaimNotReadyError extends PreconditionFailedError {
  public constructor() {
    super('Claim completeness, eligibility, duplicate, or scrubbing checks are not satisfied');
  }
}

export class ClaimInvoiceNotEligibleError extends PreconditionFailedError {
  public constructor() {
    super('The authoritative invoice is not eligible for claim generation');
  }
}

export class ClaimCoverageNotEligibleError extends PreconditionFailedError {
  public constructor() {
    super('The authoritative coverage determination is not approved or does not match the claim');
  }
}

export class ClaimPreauthorizationRequiredError extends PreconditionFailedError {
  public constructor() {
    super('A valid preauthorization is required for one or more claim services');
  }
}

export class ClaimDuplicateError extends ConflictError {
  public constructor() {
    super('A duplicate active claim already exists for the authoritative invoice and payer context');
  }
}

export class ClaimDuplicateLineError extends ConflictError {
  public constructor() {
    super('A duplicate active service line was detected for this payer and service context');
  }
}

export class ClaimFinancialReconciliationError extends ConflictError {
  public constructor(message = 'Claim financial amounts do not reconcile to authoritative billing and coverage values') {
    super(message);
  }
}

export class ClaimAdjudicationReconciliationError extends ConflictError {
  public constructor() {
    super('Adjudication amounts must reconcile exactly to the submitted claimed amount');
  }
}

export class ClaimPaymentOverAllocationError extends ConflictError {
  public constructor() {
    super('Claim payment, adjustment, or write-off would exceed the authoritative receivable balance');
  }
}

export class ClaimRemittanceReconciliationError extends ConflictError {
  public constructor() {
    super('Remittance allocations and unapplied amount do not reconcile to the sponsor payment');
  }
}

export class ClaimInvalidDecimalError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} must be a finite base-10 decimal value`);
  }
}

export class ClaimNegativeAmountError extends BadRequestError {
  public constructor(field: string) {
    super(`${field} cannot be negative`);
  }
}

export class ClaimVersionConflictError extends ConcurrencyConflictError {
  public constructor() {
    super('The claim, batch, appeal, or work item changed before this operation completed');
  }
}

export class ClaimOriginalVersionRequiredError extends BadRequestError {
  public constructor() {
    super('Corrected and replacement claims require an original claim reference');
  }
}

export class ClaimPrimaryDiagnosisError extends BadRequestError {
  public constructor() {
    super('A claim must contain exactly one primary diagnosis');
  }
}

export class ClaimSubmissionReferenceError extends BadRequestError {
  public constructor() {
    super('The selected claim submission channel requires its destination or clearinghouse reference');
  }
}

export class ClaimSensitiveClientAmountError extends BadRequestError {
  public constructor() {
    super('Authoritative claim financial totals cannot be supplied by the client');
  }
}