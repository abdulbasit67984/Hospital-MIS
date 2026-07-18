import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  ClinicalDocumentStatus,
  EncounterStatus,
  PatientAllergyStatus,
  PatientProblemStatus,
} from '@hospital-mis/database';

export class EncounterNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Clinical encounter was not found');
  }
}

export class ClinicalNoteNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Clinical note was not found');
  }
}

export class ClinicalNoteVersionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Clinical note version was not found');
  }
}

export class DiagnosisNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Diagnosis was not found');
  }
}

export class EncounterDiagnosisNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Encounter diagnosis was not found');
  }
}

export class PatientProblemNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient problem was not found');
  }
}

export class AllergyNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Allergen was not found');
  }
}

export class PatientAllergyNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient allergy record was not found');
  }
}

export class VitalSignNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Vital-sign record was not found');
  }
}

export class EncounterConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The encounter changed before the operation could be completed');
  }
}

export class ClinicalNoteConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The clinical note changed before the operation could be completed');
  }
}

export class DiagnosisConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The diagnosis changed before the operation could be completed');
  }
}

export class EncounterDiagnosisConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The encounter diagnosis changed before the operation could be completed');
  }
}

export class PatientProblemConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The patient problem changed before the operation could be completed');
  }
}

export class AllergyConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The allergen changed before the operation could be completed');
  }
}

export class PatientAllergyConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The patient allergy record changed before the operation could be completed');
  }
}

export class VitalSignConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The vital-sign record changed before the operation could be completed');
  }
}

export class ClinicalEmrFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The requested clinical record belongs to another facility');
  }
}

export class ClinicalEmrMinimumNecessaryAccessError extends ForbiddenError {
  public constructor() {
    super('Minimum-necessary clinical access could not be established');
  }
}

export class ClinicalEmrBreakGlassReasonRequiredError extends ForbiddenError {
  public constructor() {
    super('Emergency clinical access requires a documented break-glass reason');
  }
}

export class ClinicalEncounterContextMismatchError extends ConflictError {
  public constructor(
    message = 'The patient, registration, visit, queue, provider, department, clinic, or service-point linkage is inconsistent',
  ) {
    super(message);
  }
}

export class ClinicalEncounterOwnershipError extends ConflictError {
  public constructor() {
    super('The acting provider does not own or participate in this encounter');
  }
}

export class CanonicalClinicalPatientUnavailableError extends ConflictError {
  public constructor() {
    super('The canonical patient record is not active and cannot receive clinical documentation');
  }
}

export class DuplicateActiveEncounterError extends ConflictError {
  public constructor() {
    super(
      'An active encounter already exists for this care context',
      [
        {
          code: 'duplicate_active_encounter',
          message: 'Use the existing active encounter or complete its lifecycle first',
          path: 'body',
        },
      ],
    );
  }
}

export class EncounterNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated encounter number is already in use');
  }
}

export class ClinicalNoteNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated clinical note number is already in use');
  }
}

export class PatientProblemNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated patient problem number is already in use');
  }
}

export class EncounterStatusHistorySequenceConflictError extends ConflictError {
  public constructor() {
    super('The encounter status history sequence is already in use');
  }
}

export class ClinicalNoteVersionConflictError extends ConflictError {
  public constructor() {
    super('The clinical note version is already in use');
  }
}

export class PatientProblemVersionConflictError extends ConflictError {
  public constructor() {
    super('The patient problem version is already in use');
  }
}

export class PatientAllergyVersionConflictError extends ConflictError {
  public constructor() {
    super('The patient allergy version is already in use');
  }
}

export class DiagnosisCodeConflictError extends ConflictError {
  public constructor() {
    super('The diagnosis code is already configured in this facility');
  }
}

export class AllergyCatalogConflictError extends ConflictError {
  public constructor() {
    super('The allergen code or normalized allergen name is already configured in this facility');
  }
}

export class DuplicateActiveEncounterDiagnosisError extends ConflictError {
  public constructor() {
    super('The diagnosis is already active on this encounter');
  }
}

export class DuplicateActivePatientProblemError extends ConflictError {
  public constructor() {
    super('The diagnosis is already active on the patient problem list');
  }
}

export class DuplicateActivePatientAllergyError extends ConflictError {
  public constructor() {
    super('The allergy declaration is already active for this patient');
  }
}

export class InvalidEncounterTransitionError extends ConflictError {
  public constructor(
    fromStatus: EncounterStatus,
    toStatus: EncounterStatus,
  ) {
    super(`Encounter cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class InvalidClinicalDocumentTransitionError extends ConflictError {
  public constructor(
    fromStatus: ClinicalDocumentStatus,
    toStatus: ClinicalDocumentStatus,
  ) {
    super(`Clinical document cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class InvalidPatientProblemTransitionError extends ConflictError {
  public constructor(
    fromStatus: PatientProblemStatus,
    toStatus: PatientProblemStatus,
  ) {
    super(`Patient problem cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class InvalidPatientAllergyTransitionError extends ConflictError {
  public constructor(
    fromStatus: PatientAllergyStatus,
    toStatus: PatientAllergyStatus,
  ) {
    super(`Patient allergy cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class FinalizedClinicalDocumentImmutableError extends ConflictError {
  public constructor() {
    super('Finalized clinical content cannot be edited in place; create an amendment, correction, or addendum');
  }
}

export class ClinicalDocumentSignatureRequiredError extends ConflictError {
  public constructor() {
    super('The clinical document requires complete provider signature attribution');
  }
}

export class EncounterSignatureRequiredError extends ConflictError {
  public constructor() {
    super('The encounter requires complete provider signature attribution before closing');
  }
}

export class ClinicalCorrectionConflictError extends ConflictError {
  public constructor() {
    super('The clinical record cannot be corrected in its current lifecycle state');
  }
}

export class ClinicalAddendumConflictError extends ConflictError {
  public constructor() {
    super('An addendum can only be attached to a finalized clinical note');
  }
}

export class ClinicalNoKnownAllergyConflictError extends ConflictError {
  public constructor() {
    super('A no-known-allergy declaration cannot coexist with an active allergen record in the same declaration scope');
  }
}

export class VitalSignCorrectionConflictError extends ConflictError {
  public constructor() {
    super('Vital signs can only be corrected or entered in error while the original record remains active');
  }
}

export class ClinicalNumberingUnavailableError extends ConflictError {
  public constructor(
    resource: 'encounter' | 'clinical note' | 'patient problem',
  ) {
    super(`The ${resource} number could not be allocated`);
  }
}

export class ClinicalSnapshotIntegrityError extends AppError {
  public constructor(message = 'Clinical snapshot integrity validation failed') {
    super({
      code: 'CLINICAL_SNAPSHOT_INTEGRITY_ERROR',
      message,
      statusCode: 500,
      expose: false,
    });
  }
}