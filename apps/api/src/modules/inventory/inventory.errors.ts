import {
  AppError,
  BadRequestError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class InventoryCategoryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory category was not found');
  }
}

export class InventoryItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory item was not found');
  }
}

export class InventoryLocationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory location was not found');
  }
}

export class InventorySupplierNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory supplier was not found');
  }
}

export class InventoryBatchNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory batch was not found');
  }
}

export class StockBalanceNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Stock balance was not found');
  }
}

export class InventoryUnitOfMeasureNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Inventory unit of measure was not found');
  }
}

export class InventoryFormularyItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Linked formulary item was not found');
  }
}

export class InventoryActorInactiveError extends ForbiddenError {
  public constructor() {
    super('The authenticated inventory actor is not active');
  }
}

export class InventoryStaffAttributionError extends ForbiddenError {
  public constructor() {
    super('Inventory mutations require an active staff attribution in the current facility');
  }
}

export class InventoryLocationAccessDeniedError extends ForbiddenError {
  public constructor() {
    super('The actor is not authorized for the selected inventory location');
  }
}

export class InventoryBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('A break-glass reason is required for this inventory operation');
  }
}

export class InventoryContextMismatchError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class InventoryCategoryConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The inventory category changed before the operation could be completed');
  }
}

export class InventoryItemConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The inventory item changed before the operation could be completed');
  }
}

export class InventoryLocationConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The inventory location changed before the operation could be completed');
  }
}

export class InventorySupplierConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The inventory supplier changed before the operation could be completed');
  }
}

export class InventoryCategoryConflictError extends ConflictError {
  public constructor() {
    super('The inventory category code or hierarchy name is already configured in this facility');
  }
}

export class InventoryItemConflictError extends ConflictError {
  public constructor() {
    super('The inventory item code, barcode, or active formulary link is already configured in this facility');
  }
}

export class InventoryLocationConflictError extends ConflictError {
  public constructor() {
    super('The inventory location code, ownership code, or hierarchy name is already configured in this facility');
  }
}

export class InventorySupplierConflictError extends ConflictError {
  public constructor() {
    super('The supplier code or legal name is already configured in this facility');
  }
}

export class InventoryUnitConversionError extends BadRequestError {
  public constructor(message: string) {
    super(message);
  }
}

export class InventoryPersistenceError extends AppError {
  public constructor(cause?: unknown) {
    super({
      code: 'INVENTORY_PERSISTENCE_ERROR',
      message: 'The inventory operation could not be persisted',
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

    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return '';
}

export function throwMappedInventoryPersistenceError(
  error: unknown,
): never {
  const indexName = duplicateIndexName(error);

  if (indexName !== null) {
    if (indexName.includes('inventory_categories')) {
      throw new InventoryCategoryConflictError();
    }

    if (indexName.includes('inventory_items')) {
      throw new InventoryItemConflictError();
    }

    if (indexName.includes('store_locations')) {
      throw new InventoryLocationConflictError();
    }

    if (indexName.includes('suppliers')) {
      throw new InventorySupplierConflictError();
    }
  }

  throw new InventoryPersistenceError(error);
}