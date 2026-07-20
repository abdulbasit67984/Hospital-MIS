import type {
  IntakeOutputEntryStatus,
  NursingAssessmentStatus,
  NursingCarePlanStatus,
  NursingDeviceStatus,
  NursingTaskStatus,
} from '@hospital-mis/database';

import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class NursingAdmissionNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'The inpatient admission was not found for nursing documentation',
    );
  }
}

export class NursingAssessmentNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The nursing assessment was not found');
  }
}

export class NursingCarePlanNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The nursing care plan was not found');
  }
}

export class NursingTaskNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The nursing task was not found');
  }
}

export class IntakeOutputEntryNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The intake/output entry was not found');
  }
}

export class NursingDeviceNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super(
      'The nursing wound, drain, line, or device record was not found',
    );
  }
}

export class NursingAssessmentConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The nursing assessment changed before the operation could be completed',
    );
  }
}

export class NursingCarePlanConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The nursing care plan changed before the operation could be completed',
    );
  }
}

export class NursingTaskConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The nursing task changed before the operation could be completed',
    );
  }
}

export class IntakeOutputEntryConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The intake/output entry changed before the operation could be completed',
    );
  }
}

export class NursingDeviceConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The nursing device record changed before the operation could be completed',
    );
  }
}

export class NursingFacilityBoundaryError
extends ForbiddenError {
  public constructor() {
    super(
      'The requested nursing record belongs to another facility',
    );
  }
}

export class NursingPatientAdmissionBoundaryError
extends ForbiddenError {
  public constructor() {
    super(
      'The nursing record does not belong to the resolved patient and admission',
    );
  }
}

export class NursingMinimumNecessaryAccessError
extends ForbiddenError {
  public constructor() {
    super(
      'Minimum-necessary nursing access could not be established',
    );
  }
}

export class NursingBreakGlassReasonRequiredError
extends ForbiddenError {
  public constructor() {
    super(
      'Emergency nursing access requires a documented break-glass reason',
    );
  }
}

export class NursingStaffAttributionError
extends ForbiddenError {
  public constructor() {
    super(
      'The acting user is not linked to active staff in the selected facility',
    );
  }
}

export class NursingClinicalContextMismatchError
extends ConflictError {
  public constructor(
    message =
      'The nursing patient, admission, encounter, ward, room, or bed context is inconsistent',
  ) {
    super(message);
  }
}

export class NursingAdmissionDocumentationClosedError
extends ConflictError {
  public constructor() {
    super(
      'New nursing documentation is not permitted after clinical or final discharge',
    );
  }
}

export class NursingLateEntryReasonRequiredError
extends ConflictError {
  public constructor() {
    super(
      'Late nursing documentation requires a documented clinical reason',
    );
  }
}

export class NursingSignedEntryImmutableError
extends ConflictError {
  public constructor() {
    super(
      'Signed nursing documentation cannot be silently edited; create a correction revision',
    );
  }
}

export class InvalidNursingAssessmentTransitionError
extends ConflictError {
  public constructor(
    fromStatus: NursingAssessmentStatus,
    toStatus: NursingAssessmentStatus,
  ) {
    super(
      `Nursing assessment cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidNursingCarePlanTransitionError
extends ConflictError {
  public constructor(
    fromStatus: NursingCarePlanStatus,
    toStatus: NursingCarePlanStatus,
  ) {
    super(
      `Nursing care plan cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidNursingTaskTransitionError
extends ConflictError {
  public constructor(
    fromStatus: NursingTaskStatus,
    toStatus: NursingTaskStatus,
  ) {
    super(
      `Nursing task cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidIntakeOutputTransitionError
extends ConflictError {
  public constructor(
    fromStatus: IntakeOutputEntryStatus,
    toStatus: IntakeOutputEntryStatus,
  ) {
    super(
      `Intake/output entry cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidNursingDeviceTransitionError
extends ConflictError {
  public constructor(
    fromStatus: NursingDeviceStatus,
    toStatus: NursingDeviceStatus,
  ) {
    super(
      `Nursing device cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class NursingNumberingUnavailableError
extends ConflictError {
  public constructor(resource: string) {
    super(
      `A nursing ${resource} number could not be allocated`,
    );
  }
}

export class NursingDirectInventoryMutationProhibitedError
extends AppError {
  public constructor() {
    super({
      code:
        'NURSING_DIRECT_INVENTORY_MUTATION_PROHIBITED',
      message:
        'Nursing workflows must not directly mutate pharmacy inventory, dispensation, or stock balances',
      statusCode: 409,
    });
  }
}