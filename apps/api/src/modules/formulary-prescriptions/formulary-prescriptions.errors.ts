import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PrescriptionStatus,
} from '@hospital-mis/database';

export class MedicineNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Medicine was not found');
  }
}

export class MedicineFormNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Medicine form was not found');
  }
}

export class MedicineRouteNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Medicine route was not found');
  }
}

export class UnitOfMeasureNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Unit of measure was not found');
  }
}

export class MedicineStrengthNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Medicine strength was not found');
  }
}

export class PrescriptionFrequencyNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Prescription frequency was not found');
  }
}

export class FormularyItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Formulary item was not found');
  }
}

export class PrescriptionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Prescription was not found');
  }
}

export class PrescriptionItemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Prescription item was not found');
  }
}

export class PrescriptionSafetyWarningNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Prescription safety warning was not found');
  }
}

export class MedicineConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The medicine changed before the operation could be completed');
  }
}

export class MedicineFormConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The medicine form changed before the operation could be completed');
  }
}

export class MedicineRouteConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The medicine route changed before the operation could be completed');
  }
}

export class UnitOfMeasureConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The unit of measure changed before the operation could be completed');
  }
}

export class MedicineStrengthConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The medicine strength changed before the operation could be completed');
  }
}

export class PrescriptionFrequencyConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The prescription frequency changed before the operation could be completed');
  }
}

export class FormularyItemConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The formulary item changed before the operation could be completed');
  }
}

export class PrescriptionConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The prescription changed before the operation could be completed');
  }
}

export class PrescriptionSafetyWarningConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The prescription safety warning changed before the operation could be completed');
  }
}

export class MedicineCodeConflictError extends ConflictError {
  public constructor() {
    super('The medicine code is already configured in this facility');
  }
}

export class MedicineGenericNameConflictError extends ConflictError {
  public constructor() {
    super('The generic medicine name is already configured in this facility');
  }
}

export class MedicineFormConflictError extends ConflictError {
  public constructor() {
    super('The medicine form code or name is already configured in this facility');
  }
}

export class MedicineRouteConflictError extends ConflictError {
  public constructor() {
    super('The medicine route code or name is already configured in this facility');
  }
}

export class UnitOfMeasureConflictError extends ConflictError {
  public constructor() {
    super('The unit-of-measure code is already configured in this facility');
  }
}

export class MedicineStrengthConflictError extends ConflictError {
  public constructor() {
    super('The medicine strength is already configured for this medicine and form');
  }
}

export class PrescriptionFrequencyConflictError extends ConflictError {
  public constructor() {
    super('The prescription frequency code or name is already configured in this facility');
  }
}

export class FormularyCodeConflictError extends ConflictError {
  public constructor() {
    super('The formulary code is already configured in this facility');
  }
}

export class ActiveFormularySelectionConflictError extends ConflictError {
  public constructor() {
    super('An active formulary entry already exists for the selected medicine, form, strength, and brand');
  }
}

export class PrescriptionNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated prescription number is already in use');
  }
}

export class PrescriptionRevisionConflictError extends ConflictError {
  public constructor() {
    super('The prescription revision number is already in use');
  }
}

export class PrescriptionItemSequenceConflictError extends ConflictError {
  public constructor() {
    super('The prescription item sequence is already in use');
  }
}

export class PrescriptionStatusHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The prescription status-history sequence is already in use');
  }
}

export class PrescriptionWarningFingerprintConflictError extends ConflictError {
  public constructor() {
    super('The prescription safety warning has already been recorded');
  }
}

export class FormularyPrescriptionFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The requested formulary or prescription record belongs to another facility');
  }
}

export class FormularyPrescriptionMinimumNecessaryAccessError extends ForbiddenError {
  public constructor() {
    super('Minimum-necessary access to the requested prescription could not be established');
  }
}

export class FormularyPrescriptionBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('Emergency prescription access requires a documented break-glass reason');
  }
}

export class PrescriptionProviderAttributionError extends ForbiddenError {
  public constructor() {
    super('The acting user is not the attributed provider for this prescription operation');
  }
}

export class PrescriptionClinicalContextMismatchError extends ConflictError {
  public constructor(
    message = 'The prescription patient, encounter, provider, department, clinic, registration, OPD visit, or queue linkage is inconsistent',
  ) {
    super(message);
  }
}

export class PrescriptionEncounterNotActiveError extends ConflictError {
  public constructor() {
    super('Prescriptions can only be created or issued from an active clinical encounter');
  }
}

export class PrescriptionEncounterUnsignedProviderError extends ConflictError {
  public constructor() {
    super('The selected prescriber is not assigned to the active clinical encounter');
  }
}

export class InactiveMedicineError extends ConflictError {
  public constructor() {
    super('Inactive medicine master records cannot be selected for prescribing');
  }
}

export class InactiveMedicineFormError extends ConflictError {
  public constructor() {
    super('Inactive medicine forms cannot be selected for prescribing');
  }
}

export class InactiveMedicineRouteError extends ConflictError {
  public constructor() {
    super('Inactive medicine routes cannot be selected for prescribing');
  }
}

export class InactiveMedicineStrengthError extends ConflictError {
  public constructor() {
    super('Inactive medicine strengths cannot be selected for prescribing');
  }
}

export class InactivePrescriptionFrequencyError extends ConflictError {
  public constructor() {
    super('Inactive prescription frequencies cannot be selected for prescribing');
  }
}

export class InactiveUnitOfMeasureError extends ConflictError {
  public constructor() {
    super('Inactive units of measure cannot be selected for prescribing');
  }
}

export class InactiveFormularyItemError extends ConflictError {
  public constructor() {
    super('Inactive formulary items cannot be selected for prescribing');
  }
}

export class FormularyItemNotEffectiveError extends ConflictError {
  public constructor() {
    super('The formulary item is not effective for the current prescribing date');
  }
}

export class FormularyOnlyPrescribingError extends ConflictError {
  public constructor() {
    super('Prescription items must reference an approved facility formulary item');
  }
}

export class FormularyRouteNotAllowedError extends ConflictError {
  public constructor() {
    super('The selected medicine route is not permitted by the formulary item');
  }
}

export class FormularyDoseUnitMismatchError extends ConflictError {
  public constructor() {
    super('The selected dose unit does not match the formulary item');
  }
}

export class FormularyQuantityUnitMismatchError extends ConflictError {
  public constructor() {
    super('The selected quantity unit does not match the formulary item');
  }
}

export class FormularyDepartmentRestrictionError extends ForbiddenError {
  public constructor() {
    super('The formulary item is restricted to another department');
  }
}

export class FormularyAgeRestrictionError extends ConflictError {
  public constructor() {
    super('The formulary item is not approved for the patient age');
  }
}

export class PrescriptionNoActiveItemsError extends ConflictError {
  public constructor() {
    super('A prescription requires at least one active formulary item');
  }
}

export class PrescriptionDuplicateItemError extends ConflictError {
  public constructor() {
    super('The same formulary medicine selection cannot be added more than once to a prescription');
  }
}

export class PrescriptionDraftRequiredError extends ConflictError {
  public constructor() {
    super('This operation is only permitted while the prescription is a draft');
  }
}

export class IssuedPrescriptionImmutableError extends ConflictError {
  public constructor() {
    super('Issued prescription content is immutable; create a replacement prescription instead');
  }
}

export class InvalidPrescriptionTransitionError extends ConflictError {
  public constructor(
    fromStatus: PrescriptionStatus,
    toStatus: PrescriptionStatus,
  ) {
    super(`Prescription cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class PrescriptionSignatureRequiredError extends ConflictError {
  public constructor() {
    super('Prescription issuance requires complete provider signature attribution');
  }
}

export class PrescriptionBlockingWarningError extends ConflictError {
  public constructor() {
    super(
      'The prescription contains unresolved high-severity safety warnings',
      [
        {
          code: 'blocking_prescription_warning',
          message: 'Acknowledge or resolve every blocking warning before issuing the prescription',
          path: 'body.warningAcknowledgements',
        },
      ],
    );
  }
}

export class PrescriptionAllergyWarningError extends ConflictError {
  public constructor() {
    super('The prescription conflicts with an active patient allergy');
  }
}

export class DuplicateActiveMedicineWarningError extends ConflictError {
  public constructor() {
    super('The patient already has an active prescription for the selected medicine');
  }
}

export class PrescriptionInteractionServiceUnavailableError extends ConflictError {
  public constructor() {
    super('Medicine interaction checking is unavailable for this issuance attempt');
  }
}

export class PrescriptionCancellationConflictError extends ConflictError {
  public constructor() {
    super('The prescription cannot be cancelled in its current lifecycle state');
  }
}

export class PrescriptionReplacementConflictError extends ConflictError {
  public constructor() {
    super('The prescription cannot be replaced in its current lifecycle state');
  }
}

export class PrescriptionDispensationTraceConflictError extends ConflictError {
  public constructor() {
    super('Prescription dispensing status must be updated by the Pharmacy Dispensing module');
  }
}

export class PrescriptionInventoryMutationProhibitedError extends ConflictError {
  public constructor() {
    super('Prescription operations must not directly modify inventory or stock balances');
  }
}

export class PrescriptionExpiredError extends ConflictError {
  public constructor() {
    super('The prescription has expired');
  }
}

export class PrescriptionSnapshotIntegrityError extends AppError {
  public constructor(
    message = 'Prescription snapshot integrity validation failed',
  ) {
    super({
      code: 'PRESCRIPTION_SNAPSHOT_INTEGRITY_ERROR',
      message,
      statusCode: 500,
      expose: false,
    });
  }
}