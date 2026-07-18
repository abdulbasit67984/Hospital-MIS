import {
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  OpdVisitStatus,
  QueueEntryStatus,
} from '@hospital-mis/database';

export class RegistrationNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Registration was not found');
  }
}

export class OpdVisitNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('OPD visit was not found');
  }
}

export class OpdClinicNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('OPD clinic was not found');
  }
}

export class ServicePointNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Service point was not found');
  }
}

export class QueueDefinitionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Queue definition was not found');
  }
}

export class ServiceCounterNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Service counter was not found');
  }
}

export class QueueEntryNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Queue entry was not found');
  }
}

export class RegistrationConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The registration changed before the operation could be completed');
  }
}

export class OpdVisitConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The OPD visit changed before the operation could be completed');
  }
}

export class QueueEntryConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The queue entry changed before the operation could be completed');
  }
}

export class RegistrationQueueConfigurationConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The registration or queue configuration changed before the operation could be completed');
  }
}

export class DuplicateActiveVisitError extends ConflictError {
  public constructor() {
    super(
      'The patient already has an active OPD visit for the same service context and date',
      [
        {
          code: 'duplicate_active_opd_visit',
          message: 'Complete, cancel, or correct the existing active visit before creating another',
          path: 'body.registration',
        },
      ],
    );
  }
}

export class DuplicateActiveQueueEntryError extends ConflictError {
  public constructor() {
    super(
      'The OPD visit already has an active queue entry',
      [
        {
          code: 'duplicate_active_queue_entry',
          message: 'Use the existing active queue entry or complete its lifecycle first',
          path: 'body.queue',
        },
      ],
    );
  }
}

export class RegistrationNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated registration number is already in use');
  }
}

export class OpdVisitNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated OPD visit number is already in use');
  }
}

export class QueueTokenNumberConflictError extends ConflictError {
  public constructor() {
    super('The generated queue token number is already in use');
  }
}

export class RegistrationAppointmentConflictError extends ConflictError {
  public constructor() {
    super('The appointment is already linked to an active registration');
  }
}

export class RegistrationQueueFacilityBoundaryError extends ForbiddenError {
  public constructor() {
    super('The registration, visit, queue, or service context belongs to another facility');
  }
}

export class InactiveRegistrationContextError extends ConflictError {
  public constructor(resource: string) {
    super(`${resource} is inactive and cannot accept an OPD registration`);
  }
}

export class RegistrationContextMismatchError extends ConflictError {
  public constructor(
    message = 'The selected department, clinic, service point, provider, queue, or counter context is inconsistent',
  ) {
    super(message);
  }
}

export class CanonicalPatientUnavailableError extends ConflictError {
  public constructor() {
    super('The canonical patient record is not active and cannot be registered');
  }
}

export class InvalidOpdVisitTransitionError extends ConflictError {
  public constructor(
    fromStatus: OpdVisitStatus,
    toStatus: OpdVisitStatus,
  ) {
    super(`OPD visit cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class InvalidQueueEntryTransitionError extends ConflictError {
  public constructor(
    fromStatus: QueueEntryStatus,
    toStatus: QueueEntryStatus,
  ) {
    super(`Queue entry cannot transition from ${fromStatus} to ${toStatus}`);
  }
}

export class QueuePriorityNotSupportedError extends ConflictError {
  public constructor() {
    super('The selected queue does not allow priority handling');
  }
}

export class QueueEmergencyOverrideNotSupportedError extends ConflictError {
  public constructor() {
    super('The selected queue does not allow emergency override');
  }
}

export class QueueTransferConflictError extends ConflictError {
  public constructor(
    message = 'The queue entry cannot be transferred to the selected destination',
  ) {
    super(message);
  }
}

export class QueueRecallLimitExceededError extends ConflictError {
  public constructor() {
    super('The queue entry has reached the configured recall limit');
  }
}

export class VisitCancellationConflictError extends ConflictError {
  public constructor() {
    super('The OPD visit can no longer be cancelled in its current state');
  }
}

export class VisitCorrectionConflictError extends ConflictError {
  public constructor() {
    super('The OPD visit can no longer be corrected in its current state');
  }
}

export class RegistrationQueueNumberingUnavailableError extends ConflictError {
  public constructor(
    resource:
      | 'registration'
      | 'visit'
      | 'queue token',
  ) {
    super(`The ${resource} number could not be allocated`);
  }
}