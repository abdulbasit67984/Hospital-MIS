import type {
  LaboratoryOrderStatus,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class LaboratoryTestCategoryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory test category was not found');
  }
}

export class LaboratoryTestNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory test was not found');
  }
}

export class LaboratoryOrderNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory order was not found');
  }
}

export class LaboratoryOrderItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory order item was not found');
  }
}

export class LaboratorySpecimenNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory specimen was not found');
  }
}

export class LaboratoryResultNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory result was not found');
  }
}

export class LaboratoryResultVersionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Laboratory result version was not found');
  }
}

export class LaboratoryCriticalCommunicationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Critical-result communication record was not found');
  }
}

export class LaboratoryTestCategoryConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory test category changed before the operation could be completed');
  }
}

export class LaboratoryTestConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory test changed before the operation could be completed');
  }
}

export class LaboratoryOrderConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory order changed before the operation could be completed');
  }
}

export class LaboratoryOrderItemConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory order item changed before the operation could be completed');
  }
}

export class LaboratorySpecimenConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory specimen changed before the operation could be completed');
  }
}

export class LaboratoryResultConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The Laboratory result changed before the operation could be completed');
  }
}

export class LaboratoryCategoryCodeConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory category code is already configured in this facility');
  }
}

export class LaboratoryCategoryNameConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory category name is already configured in this facility');
  }
}

export class LaboratoryTestCodeConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory test code is already configured in this facility');
  }
}

export class LaboratoryTestNameConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory test name is already configured in this facility');
  }
}

export class LaboratoryOrderNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated Laboratory order number is already in use');
  }
}

export class LaboratoryOrderItemSequenceConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory order item sequence is already in use');
  }
}

export class LaboratoryOrderItemTestConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory test is already selected on this order');
  }
}

export class LaboratoryOrderStatusHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory order status-history sequence is already in use');
  }
}

export class LaboratoryAccessionConflictError extends ConflictError {
  public constructor() {
    super('The generated Laboratory accession number is already in use');
  }
}

export class LaboratorySpecimenIdentifierConflictError extends ConflictError {
  public constructor() {
    super('The generated Laboratory specimen identifier is already in use');
  }
}

export class LaboratorySpecimenLabelConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory specimen label code is already in use');
  }
}

export class LaboratorySpecimenHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory specimen status-history sequence is already in use');
  }
}

export class LaboratoryResultNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated Laboratory result number is already in use');
  }
}

export class LaboratoryOrderItemResultConflictError extends ConflictError {
  public constructor() {
    super('A Laboratory result already exists for this order item');
  }
}

export class LaboratoryResultVersionConflictError extends ConflictError {
  public constructor() {
    super('The Laboratory result version number is already in use');
  }
}

export class LaboratoryCriticalCommunicationSequenceConflictError extends ConflictError {
  public constructor() {
    super('The critical-result communication sequence is already in use');
  }
}

export class LaboratoryFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The requested Laboratory record belongs to another facility');
  }
}

export class LaboratoryMinimumNecessaryAccessError extends ForbiddenError {
  public constructor() {
    super('Minimum-necessary access to the requested Laboratory record could not be established');
  }
}

export class LaboratoryBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('Emergency Laboratory access requires a documented break-glass reason');
  }
}

export class LaboratoryProviderAttributionError extends ForbiddenError {
  public constructor() {
    super('The acting user is not assigned to the clinical encounter for this Laboratory operation');
  }
}

export class LaboratoryClinicalContextMismatchError extends ConflictError {
  public constructor(
    message = 'The Laboratory patient, encounter, provider, department, clinic, registration, OPD visit, or queue linkage is inconsistent',
  ) {
    super(message);
  }
}

export class LaboratoryEncounterNotActiveError extends ConflictError {
  public constructor() {
    super('Laboratory orders can only be created from an active clinical encounter');
  }
}

export class LaboratoryOrderingProviderNotAssignedError extends ConflictError {
  public constructor() {
    super('The ordering provider is not assigned to the active clinical encounter');
  }
}

export class LaboratoryInactiveCategoryError extends ConflictError {
  public constructor() {
    super('Inactive Laboratory categories cannot be selected for an active test');
  }
}

export class LaboratoryTestNotOrderableError extends ConflictError {
  public constructor() {
    super('The selected Laboratory test is inactive, unavailable, outside its effective period, or not orderable for this department');
  }
}

export class LaboratoryDuplicateTestSelectionError extends ConflictError {
  public constructor() {
    super('A Laboratory order cannot contain duplicate standardized tests');
  }
}

export class LaboratoryInvalidOrderTransitionError extends ConflictError {
  public constructor(
    fromStatus: LaboratoryOrderStatus,
    toStatus: LaboratoryOrderStatus,
  ) {
    super(`Laboratory order cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class LaboratoryInvalidSpecimenTransitionError extends ConflictError {
  public constructor(
    fromStatus: LaboratorySpecimenStatus,
    toStatus: LaboratorySpecimenStatus,
  ) {
    super(`Laboratory specimen cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class LaboratoryInvalidResultTransitionError extends ConflictError {
  public constructor(
    fromStatus: LaboratoryResultStatus,
    toStatus: LaboratoryResultStatus,
  ) {
    super(`Laboratory result cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class LaboratoryInvalidPublicationTransitionError extends ConflictError {
  public constructor(
    fromStatus: LaboratoryResultPublicationStatus,
    toStatus: LaboratoryResultPublicationStatus,
  ) {
    super(`Laboratory result publication cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class LaboratoryFinalizedResultMutationError extends ConflictError {
  public constructor() {
    super('Verified or corrected Laboratory results cannot be edited in place; use the correction workflow');
  }
}

export class LaboratoryResultVerificationPreconditionError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class LaboratoryCriticalAcknowledgementRequiredError extends ConflictError {
  public constructor() {
    super('Critical Laboratory results require traceable notification and acknowledgement');
  }
}

export class LaboratoryInventoryMutationProhibitedError extends AppError {
  public constructor() {
    super({
      code: 'LABORATORY_INVENTORY_MUTATION_PROHIBITED',
      message: 'Laboratory workflows must not directly mutate reagent, consumable, or inventory stock',
      statusCode: 409,
    });
  }
}