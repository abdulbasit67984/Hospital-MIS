import {
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class PanelNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Panel definition was not found');
  }
}

export class TreatmentPackageNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Treatment package was not found');
  }
}

export class PackageEnrollmentNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient package enrollment was not found');
  }
}

export class CoveragePlanNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Coverage plan was not found');
  }
}

export class PatientCoverageNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient coverage enrollment was not found');
  }
}

export class CoverageDeterminationNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('Coverage determination was not found');
  }
}

export class PpcFacilityMismatchError extends ForbiddenError {
  public constructor() {
    super('Cross-facility panel, package, or coverage access is prohibited');
  }
}

export class PpcMakerCheckerViolationError extends ForbiddenError {
  public constructor() {
    super('The initiating actor cannot approve or override this operation');
  }
}

export class PpcConcurrencyConflictError
extends ConcurrencyConflictError {
  public constructor() {
    super('The record changed after it was read; reload and retry');
  }
}

export class PpcDuplicateCodeError extends ConflictError {
  public constructor(entityName: string) {
    super(`${entityName} code already exists in this facility`);
  }
}

export class PackageEligibilityFailedError
extends PreconditionFailedError {
  public constructor(reason: string) {
    super(`Patient is not eligible for this package: ${reason}`);
  }
}

export class PackageBalanceExceededError
extends PreconditionFailedError {
  public constructor() {
    super('Package utilization exceeds the remaining package balance');
  }
}

export class CoverageInactiveError extends PreconditionFailedError {
  public constructor() {
    super('Coverage is not active for the requested service date');
  }
}

export class CoverageLimitExceededError
extends PreconditionFailedError {
  public constructor() {
    super('Coverage benefit limit has been exhausted');
  }
}

export class CoveragePreauthorizationRequiredError
extends PreconditionFailedError {
  public constructor() {
    super('Coverage requires a valid preauthorization');
  }
}

export class CoverageNetworkRestrictionError
extends PreconditionFailedError {
  public constructor() {
    super('The service does not satisfy the configured network restriction');
  }
}

export class PpcInvalidFinancialAllocationError
extends BadRequestError {
  public constructor() {
    super(
      'Package, sponsor, patient, deductible, copayment, coinsurance, and denied portions do not reconcile',
    );
  }
}

export class PpcImmutableHistoryError extends ConflictError {
  public constructor() {
    super(
      'Immutable package or coverage history cannot be edited; use a reversal workflow',
    );
  }
}