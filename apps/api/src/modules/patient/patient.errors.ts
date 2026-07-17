import {
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PatientIdentifierType,
} from '@hospital-mis/database';

export class PatientNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient was not found');
  }
}

export class GuardianNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Guardian was not found');
  }
}

export class PatientIdentifierNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Patient identifier was not found');
  }
}

export class PatientConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The patient changed before the update could be completed');
  }
}

export class GuardianConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The guardian changed before the update could be completed');
  }
}

export class PatientIdentifierConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The patient identifier changed before the update could be completed');
  }
}

export class PatientIdentityConflictError extends ConflictError {
  public constructor(
    identifierType: PatientIdentifierType,
  ) {
    super(
      `An active ${identifierType} identity is already assigned to another patient`,
      [
        {
          code: 'patient_identity_conflict',
          message: 'The identity value is already in use',
          path: 'body.identifiers',
        },
      ],
    );
  }
}

export class PatientMedicalRecordNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated medical record number is already in use');
  }
}

export class PatientDuplicateBlockedError extends ConflictError {
  public constructor() {
    super(
      'Patient registration was blocked because an exact identity match exists',
      [
        {
          code: 'patient_duplicate_blocked',
          message: 'Review the existing patient before registering another record',
          path: 'body',
        },
      ],
    );
  }
}

export class MinorGuardianRequiredError extends ConflictError {
  public constructor() {
    super(
      'A minor patient requires an active guardian with a valid CNIC',
      [
        {
          code: 'minor_guardian_required',
          message: 'Guardian information and guardian CNIC are required for minors',
          path: 'body.guardian',
        },
      ],
    );
  }
}

export class PatientFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The patient or guardian record belongs to another facility');
  }
}

export class PatientFacilityNumberingUnavailableError extends ConflictError {
  public constructor() {
    super('The facility is not available for patient MRN allocation');
  }
}