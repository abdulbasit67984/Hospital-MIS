import {
  AppError,
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  PreconditionFailedError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class BillingChargeCategoryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Charge category was not found');
  }
}

export class BillingChargeCatalogItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Charge catalog item was not found');
  }
}

export class BillingPriceListNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Price list was not found');
  }
}

export class BillingServiceRateNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('An effective service rate was not found');
  }
}

export class BillingTaxCategoryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Tax category was not found');
  }
}

export class BillingTreatmentPackageNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Treatment package was not found');
  }
}

export class BillingPatientAccountNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient financial account was not found');
  }
}

export class BillingAccountChargeNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Account charge was not found');
  }
}

export class BillingInvoiceNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Invoice was not found');
  }
}

export class BillingPaymentNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Payment was not found');
  }
}

export class BillingApprovalRequestNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Financial approval request was not found');
  }
}

export class BillingRefundRequestNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Refund request was not found');
  }
}

export class BillingActorInactiveError extends ForbiddenError {
  public constructor() {
    super('The authenticated billing actor is not active');
  }
}

export class BillingStaffAttributionError extends ForbiddenError {
  public constructor() {
    super('Billing mutations require active staff attribution in the current facility');
  }
}

export class BillingAccessDeniedError extends ForbiddenError {
  public constructor(
    message = 'The actor is not authorized for this billing operation',
  ) {
    super(message);
  }
}

export class BillingBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('Emergency financial access requires a documented break-glass reason');
  }
}

export class BillingFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The requested financial record belongs to another facility');
  }
}

export class BillingSensitiveFinancialAccessError extends ForbiddenError {
  public constructor() {
    super('The actor is not authorized to view cost or margin information');
  }
}

export class BillingContextMismatchError extends ConflictError {
  public constructor(
    message = 'The authoritative billing context is inconsistent',
  ) {
    super(message);
  }
}

export class BillingSourceNotBillableError extends ConflictError {
  public constructor(reason?: string | null) {
    super(
      reason == null
        ? 'The source record is not eligible for financial charging'
        : `The source record is not eligible for financial charging: ${reason}`,
    );
  }
}

export class BillingPatientUnavailableError extends ConflictError {
  public constructor() {
    super('The source patient is not eligible for financial operations');
  }
}

export class BillingAccountLockedError extends ConflictError {
  public constructor() {
    super('The patient financial account is locked against new financial activity');
  }
}

export class BillingFinalizedRecordImmutableError extends ConflictError {
  public constructor() {
    super('Finalized financial records cannot be edited; use a correction, reversal, or financial note');
  }
}

export class BillingClosedPeriodError extends ConflictError {
  public constructor() {
    super('The financial operation is blocked because its accounting period is closed');
  }
}

export class BillingInvalidLifecycleTransitionError extends ConflictError {
  public constructor(
    entity: string,
    fromStatus: string,
    toStatus: string,
  ) {
    super(
      `${entity} cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class BillingDuplicateChargeError extends ConflictError {
  public constructor() {
    super('The source operation has already created this financial charge');
  }
}

export class BillingDuplicatePaymentError extends ConflictError {
  public constructor() {
    super('The payment operation has already been recorded');
  }
}

export class BillingPriceResolutionError extends BadRequestError {
  public constructor(message: string) {
    super(message);
  }
}

export class BillingNoEffectivePriceError extends PreconditionFailedError {
  public constructor() {
    super('No effective authoritative price is configured for this charge context');
  }
}

export class BillingChargeRuleViolationError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class BillingPackageExhaustedError extends ConflictError {
  public constructor() {
    super('The package does not have sufficient remaining included quantity');
  }
}

export class BillingApprovalRequiredError extends PreconditionFailedError {
  public constructor(message = 'Independent financial approval is required') {
    super(message);
  }
}

export class BillingMakerCheckerViolationError extends ForbiddenError {
  public constructor() {
    super('The requester cannot approve their own sensitive financial operation');
  }
}

export class BillingApprovalExpiredError extends ConflictError {
  public constructor() {
    super('The financial approval request has expired');
  }
}

export class BillingAmountExceedsBalanceError extends ConflictError {
  public constructor() {
    super('The requested financial amount exceeds the available balance');
  }
}

export class BillingReconciliationError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class BillingCatalogConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The charge catalog record changed before the operation could be completed');
  }
}

export class BillingPriceListConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The price list changed before the operation could be completed');
  }
}

export class BillingPackageConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The treatment package changed before the operation could be completed');
  }
}

export class BillingPatientAccountConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The patient financial account changed before the operation could be completed');
  }
}

export class BillingAccountChargeConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The account charge changed before the operation could be completed');
  }
}

export class BillingInvoiceConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The invoice changed before the operation could be completed');
  }
}

export class BillingPaymentConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The payment changed before the operation could be completed');
  }
}

export class BillingApprovalConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The financial approval request changed before the decision could be completed');
  }
}

export class UnifiedBillingPersistenceError extends AppError {
  public constructor(cause?: unknown) {
    super({
      code: 'UNIFIED_BILLING_PERSISTENCE_ERROR',
      message: 'The unified billing operation could not be persisted',
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

  if (
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const match =
      /index:\s+([^\s]+)\s+dup key/iu.exec(error.message);

    return match?.[1] ?? '';
  }

  return '';
}

export function throwMappedUnifiedBillingPersistenceError(
  error: unknown,
): never {
  const indexName = duplicateIndexName(error);

  if (indexName !== null) {
    if (
      indexName.includes('account_charges_operation') ||
      indexName.includes('account_charges_deterministic_key')
    ) {
      throw new BillingDuplicateChargeError();
    }

    if (
      indexName.includes('payments_operation') ||
      indexName.includes('payments_external_reference')
    ) {
      throw new BillingDuplicatePaymentError();
    }

    if (
      indexName.includes('charge_categories_facility_code') ||
      indexName.includes('charge_catalog_facility_charge_code') ||
      indexName.includes('price_lists_facility_code') ||
      indexName.includes('service_rates_facility_rate_code') ||
      indexName.includes('treatment_packages_facility_code')
    ) {
      throw new ConflictError(
        'A billing catalog or pricing code is already configured in this facility',
      );
    }

    if (
      indexName.includes('patient_accounts_active_admission') ||
      indexName.includes('patient_accounts_facility_number')
    ) {
      throw new ConflictError(
        'A matching patient financial account already exists',
      );
    }

    if (
      indexName.includes('invoices_facility_number') ||
      indexName.includes('credit_notes_facility_number') ||
      indexName.includes('debit_notes_facility_number')
    ) {
      throw new ConflictError(
        'The generated financial document number is already in use',
      );
    }
  }

  throw new UnifiedBillingPersistenceError(error);
}