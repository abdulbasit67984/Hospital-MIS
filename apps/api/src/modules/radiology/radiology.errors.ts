import type {
  RadiologyOrderItemStatus,
  RadiologyOrderStatus,
  RadiologyPreparationStatus,
  RadiologySafetyScreeningStatus,
} from '@hospital-mis/database';

import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class RadiologyModalityNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Radiology modality was not found');
  }
}

export class RadiologyProcedureNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Radiology procedure was not found');
  }
}

export class RadiologyOrderNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Radiology order was not found');
  }
}

export class RadiologyOrderItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Radiology order item was not found');
  }
}

export class RadiologyModalityConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Radiology modality changed before the operation could be completed');
  }
}

export class RadiologyProcedureConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Radiology procedure changed before the operation could be completed');
  }
}

export class RadiologyOrderConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Radiology order changed before the operation could be completed');
  }
}

export class RadiologyOrderItemConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Radiology order item changed before the operation could be completed');
  }
}

export class RadiologyModalityCodeConflictError extends ConflictError {
  public constructor() {
    super('The Radiology modality code is already configured in this facility');
  }
}

export class RadiologyModalityNameConflictError extends ConflictError {
  public constructor() {
    super('The Radiology modality name is already configured in this facility');
  }
}

export class RadiologyProcedureCodeConflictError extends ConflictError {
  public constructor() {
    super('The Radiology procedure code is already configured in this facility');
  }
}

export class RadiologyProcedureNameConflictError extends ConflictError {
  public constructor() {
    super('The Radiology procedure name is already configured in this facility');
  }
}

export class RadiologyOrderNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated Radiology order number is already in use');
  }
}

export class RadiologyOrderItemSequenceConflictError extends ConflictError {
  public constructor() {
    super('The Radiology order item sequence is already in use');
  }
}

export class RadiologyAccessionNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated Radiology accession number is already in use');
  }
}

export class RadiologyOrderStatusHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The Radiology order status-history sequence is already in use');
  }
}

export class RadiologyOrderItemStatusHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The Radiology order-item status-history sequence is already in use');
  }
}

export class RadiologyFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The requested Radiology record belongs to another facility');
  }
}

export class RadiologyMinimumNecessaryAccessError extends ForbiddenError {
  public constructor() {
    super('Minimum-necessary access to the requested Radiology record could not be established');
  }
}

export class RadiologyBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('Emergency Radiology access requires a documented break-glass reason');
  }
}

export class RadiologyProviderAttributionError extends ForbiddenError {
  public constructor() {
    super('The acting user is not assigned to the clinical encounter for this Radiology operation');
  }
}

export class RadiologyClinicalContextMismatchError extends ConflictError {
  public constructor(
    message = 'The Radiology patient, encounter, provider, department, clinic, registration, OPD visit, or queue linkage is inconsistent',
  ) {
    super(message);
  }
}

export class RadiologyEncounterNotActiveError extends ConflictError {
  public constructor() {
    super('Radiology orders can only be created from an active clinical encounter');
  }
}

export class RadiologyOrderingProviderNotAssignedError extends ConflictError {
  public constructor() {
    super('The ordering provider is not assigned to the active clinical encounter');
  }
}

export class RadiologyInactiveModalityError extends ConflictError {
  public constructor() {
    super('Inactive Radiology modalities cannot be selected for an active procedure');
  }
}

export class RadiologyProcedureNotOrderableError extends ConflictError {
  public constructor() {
    super('The selected Radiology procedure is inactive, unavailable, outside its effective period, or not orderable for this department');
  }
}

export class RadiologyDuplicateProcedureSelectionError extends ConflictError {
  public constructor() {
    super('A Radiology order cannot contain duplicate procedure, laterality, and contrast selections');
  }
}

export class RadiologyInvalidOrderTransitionError extends ConflictError {
  public constructor(
    fromStatus: RadiologyOrderStatus,
    toStatus: RadiologyOrderStatus,
  ) {
    super(`Radiology order cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class RadiologyInvalidOrderItemTransitionError extends ConflictError {
  public constructor(
    fromStatus: RadiologyOrderItemStatus,
    toStatus: RadiologyOrderItemStatus,
  ) {
    super(`Radiology order item cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class RadiologyInvalidSafetyScreeningTransitionError extends ConflictError {
  public constructor(
    fromStatus: RadiologySafetyScreeningStatus,
    toStatus: RadiologySafetyScreeningStatus,
  ) {
    super(`Radiology safety screening cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class RadiologyInvalidPreparationTransitionError extends ConflictError {
  public constructor(
    fromStatus: RadiologyPreparationStatus,
    toStatus: RadiologyPreparationStatus,
  ) {
    super(`Radiology preparation cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class RadiologyProcedureRequestConflictError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class RadiologySafetyClearanceRequiredError extends ConflictError {
  public constructor() {
    super('Radiology examination cannot start until required safety screening is cleared');
  }
}

export class RadiologyPreparationIncompleteError extends ConflictError {
  public constructor() {
    super('Radiology examination cannot start until required patient preparation is confirmed');
  }
}

export class RadiologyNumberingUnavailableError extends ConflictError {
  public constructor(resource: string) {
    super(`A Radiology ${resource} number could not be allocated`);
  }
}

export class RadiologyInventoryMutationProhibitedError extends AppError {
  public constructor() {
    super({
      code: 'RADIOLOGY_INVENTORY_MUTATION_PROHIBITED',
      message: 'Radiology workflows must not directly mutate contrast-media, consumable, or inventory stock',
      statusCode: 409,
    });
  }
}

export type RadiologyPersistenceOperation =
  | 'CREATE_MODALITY'
  | 'UPDATE_MODALITY'
  | 'CREATE_PROCEDURE'
  | 'UPDATE_PROCEDURE'
  | 'CREATE_ORDER'
  | 'CREATE_ORDER_ITEM'
  | 'CREATE_ORDER_HISTORY'
  | 'CREATE_ORDER_ITEM_HISTORY';

function duplicateIndexName(error: unknown): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  if (
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const match = error.message.match(/index:\s+([^\s]+)\s+dup key/iu);
    return match?.[1] ?? null;
  }

  return null;
}

export function throwMappedRadiologyPersistenceError(
  error: unknown,
  operation: RadiologyPersistenceOperation,
): never {
  const indexName = duplicateIndexName(error);

  switch (indexName) {
    case 'uq_radiology_modalities_facility_code':
      throw new RadiologyModalityCodeConflictError();

    case 'uq_radiology_modalities_facility_name':
      throw new RadiologyModalityNameConflictError();

    case 'uq_radiology_procedures_facility_code':
      throw new RadiologyProcedureCodeConflictError();

    case 'uq_radiology_procedures_facility_name':
      throw new RadiologyProcedureNameConflictError();

    case 'uq_radiology_orders_facility_number':
      throw new RadiologyOrderNumberConflictError();

    case 'uq_radiology_order_items_sequence':
      throw new RadiologyOrderItemSequenceConflictError();

    case 'uq_radiology_order_items_facility_accession':
      throw new RadiologyAccessionNumberConflictError();

    case 'uq_radiology_order_status_histories_sequence':
      throw new RadiologyOrderStatusHistorySequenceConflictError();

    case 'uq_radiology_order_item_status_histories_sequence':
      throw new RadiologyOrderItemStatusHistorySequenceConflictError();

    default:
      break;
  }

  if (operation === 'UPDATE_MODALITY') {
    throw new RadiologyModalityConcurrencyError();
  }

  if (operation === 'UPDATE_PROCEDURE') {
    throw new RadiologyProcedureConcurrencyError();
  }

  throw error;
}