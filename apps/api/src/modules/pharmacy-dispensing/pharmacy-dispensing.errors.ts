import {
  AppError,
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class PharmacyDispensationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Pharmacy dispensation was not found');
  }
}

export class PharmacyDispensationItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Pharmacy dispensation item was not found');
  }
}

export class PharmacyPrescriptionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The source prescription was not found');
  }
}

export class PharmacyPrescriptionUnavailableError extends ConflictError {
  public constructor(message = 'The prescription is not eligible for pharmacy dispensing') {
    super(message);
  }
}

export class PharmacyPatientNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The pharmacy patient context was not found');
  }
}

export class PharmacyAdmissionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient admission was not found');
  }
}

export class PharmacyLocationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('The pharmacy inventory location was not found');
  }
}

export class PharmacyActorInactiveError extends ForbiddenError {
  public constructor() {
    super('The authenticated pharmacy actor is not active');
  }
}

export class PharmacyStaffAttributionError extends ForbiddenError {
  public constructor() {
    super('Pharmacy operations require active staff attribution in the current facility');
  }
}

export class PharmacyAccessDeniedError extends ForbiddenError {
  public constructor(message = 'The actor is not authorized for this pharmacy operation') {
    super(message);
  }
}

export class PharmacyBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('A break-glass reason is required for this pharmacy access');
  }
}

export class PharmacyControlledMedicinePermissionError extends ForbiddenError {
  public constructor() {
    super('Controlled-medicine dispensing requires explicit controlled-dispensing permission');
  }
}

export class PharmacyContextMismatchError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class PharmacyDispensationConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The pharmacy dispensation changed before the operation could be completed');
  }
}

export class PharmacyDispensationConflictError extends ConflictError {
  public constructor() {
    super('An active pharmacy dispensation already exists for this prescription operation');
  }
}

export class PharmacySafetyBlockingError extends ConflictError {
  public constructor() {
    super('Blocking medication-safety findings must be resolved before dispensing');
  }
}

export class PharmacyStockUnavailableError extends ConflictError {
  public constructor() {
    super('Eligible pharmacy stock is unavailable for the requested quantity');
  }
}

export class PharmacyPriceResolutionError extends BadRequestError {
  public constructor(message: string) {
    super(message);
  }
}

export class PharmacyPersistenceError extends AppError {
  public constructor(cause?: unknown) {
    super({
      code: 'PHARMACY_DISPENSING_PERSISTENCE_ERROR',
      message: 'The pharmacy dispensing operation could not be persisted',
      statusCode: 500,
      expose: false,
      retryable: true,
      cause,
    });
  }
}

function duplicateIndexName(error: unknown): string | null {
  if (
    error == null ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  if ('message' in error && typeof error.message === 'string') {
    const match = /index:\s+([^\s]+)\s+dup key/iu.exec(error.message);
    return match?.[1] ?? '';
  }

  return '';
}

export function throwMappedPharmacyPersistenceError(error: unknown): never {
  const indexName = duplicateIndexName(error);

  if (indexName !== null) {
    if (
      indexName.includes('dispensations_creation_operation') ||
      indexName.includes('dispensations_stock_reservation')
    ) {
      throw new PharmacyDispensationConflictError();
    }

    if (indexName.includes('dispensation_reversals_active_source')) {
      throw new ConflictError(
        'An active reversal already exists for this dispensation',
      );
    }
  }

  throw new PharmacyPersistenceError(error);
}