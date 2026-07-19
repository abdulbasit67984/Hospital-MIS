import {
  AppError,
  ConflictError,
} from '@hospital-mis/shared';

export class LaboratoryResultOrderItemStateError extends ConflictError {
  public constructor() {
    super(
      'The Laboratory order item is not ready for result entry, validation, or verification',
    );
  }
}

export class LaboratoryResultSpecimenMismatchError extends ConflictError {
  public constructor() {
    super(
      'The selected Laboratory specimen does not belong to the result order item or is not ready for result entry',
    );
  }
}

export class LaboratoryResultComponentDefinitionError extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class LaboratoryResultAttributionError extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class LaboratoryResultPublicationConflictError extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class LaboratoryCriticalResultComponentNotFoundError extends ConflictError {
  public constructor() {
    super(
      'The selected component is not a critical component of the current verified Laboratory result version',
    );
  }
}

export class LaboratoryCriticalResultCommunicationConflictError extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class LaboratoryResultReportUnavailableError extends ConflictError {
  public constructor() {
    super(
      'A Laboratory report can only be produced when the order contains published verified or corrected results',
    );
  }
}

export class LaboratoryResultSnapshotIntegrityError extends AppError {
  public constructor(
    message =
      'Laboratory result snapshot integrity verification failed',

    cause?: unknown,
  ) {
    super({
      code:
        'LABORATORY_RESULT_SNAPSHOT_INTEGRITY_ERROR',

      message,

      statusCode:
        500,

      expose:
        false,

      cause,
    });
  }
}