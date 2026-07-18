import {
  DuplicateActiveQueueEntryError,
  DuplicateActiveVisitError,
  OpdVisitNumberConflictError,
  QueueTokenNumberConflictError,
  RegistrationAppointmentConflictError,
  RegistrationNumberConflictError,
} from './registration-queue.errors.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: unknown;
  cause?: unknown;
}

export type RegistrationQueuePersistenceOperation =
  | 'CREATE_REGISTRATION'
  | 'CREATE_VISIT'
  | 'CREATE_QUEUE_ENTRY'
  | 'CREATE_QUEUE_HISTORY'
  | 'UPDATE_CONFIGURATION';

function asMongoLikeError(
  error: unknown,
): MongoLikeError | null {
  if (
    error === null ||
    typeof error !== 'object'
  ) {
    return null;
  }

  return error as MongoLikeError;
}

function findDuplicateKeyError(
  error: unknown,
  depth = 0,
): MongoLikeError | null {
  if (depth > 5) {
    return null;
  }

  const candidate =
    asMongoLikeError(
      error,
    );

  if (candidate === null) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  return candidate.cause ===
    undefined
    ? null
    : findDuplicateKeyError(
        candidate.cause,
        depth + 1,
      );
}

function duplicateFields(
  error: MongoLikeError,
): Set<string> {
  return new Set(
    Object.keys(
      error.keyPattern ??
      error.keyValue ??
      {},
    ),
  );
}

function messageContains(
  error: MongoLikeError,
  value: string,
): boolean {
  return (
    typeof error.message ===
      'string' &&
    error.message.includes(
      value,
    )
  );
}

function hasFields(
  fields: ReadonlySet<string>,
  ...required: readonly string[]
): boolean {
  return required.every(
    (field) =>
      fields.has(
        field,
      ),
  );
}

export function isRegistrationQueueDuplicateKeyError(
  error: unknown,
): boolean {
  return findDuplicateKeyError(
    error,
  ) !== null;
}

export function mapRegistrationQueuePersistenceError(
  error: unknown,
  operation: RegistrationQueuePersistenceOperation,
): Error {
  const duplicateError =
    findDuplicateKeyError(
      error,
    );

  if (duplicateError === null) {
    return error instanceof Error
      ? error
      : new Error(
          'Unknown registration and queue persistence error',
          {
            cause:
              error,
          },
        );
  }

  const fields =
    duplicateFields(
      duplicateError,
    );

  if (
    operation ===
      'CREATE_REGISTRATION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'appointmentId',
      ) ||
      messageContains(
        duplicateError,
        'uq_registrations_facility_appointment',
      )
    )
  ) {
    return new RegistrationAppointmentConflictError();
  }

  if (
    operation ===
      'CREATE_REGISTRATION' &&
    (
      hasFields(
        fields,
        'facilityId',
        'registrationNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_registrations_facility_number',
      )
    )
  ) {
    return new RegistrationNumberConflictError();
  }

  if (
    operation ===
      'CREATE_VISIT' &&
    (
      hasFields(
        fields,
        'facilityId',
        'activeVisitKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_opd_visits_facility_active_key',
      )
    )
  ) {
    return new DuplicateActiveVisitError();
  }

  if (
    operation ===
      'CREATE_VISIT' &&
    (
      hasFields(
        fields,
        'facilityId',
        'visitNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_opd_visits_facility_number',
      )
    )
  ) {
    return new OpdVisitNumberConflictError();
  }

  if (
    operation ===
      'CREATE_QUEUE_ENTRY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'activeEntryKey',
      ) ||
      messageContains(
        duplicateError,
        'uq_queue_tokens_facility_active_visit',
      )
    )
  ) {
    return new DuplicateActiveQueueEntryError();
  }

  if (
    operation ===
      'CREATE_QUEUE_ENTRY' &&
    (
      hasFields(
        fields,
        'facilityId',
        'serviceDate',
        'queueDefinitionId',
        'tokenNumber',
      ) ||
      messageContains(
        duplicateError,
        'uq_queue_tokens_facility_date_queue_number',
      )
    )
  ) {
    return new QueueTokenNumberConflictError();
  }

  return error instanceof Error
    ? error
    : new Error(
        'Registration and queue persistence conflict',
        {
          cause:
            error,
        },
      );
}

export function throwMappedRegistrationQueuePersistenceError(
  error: unknown,
  operation: RegistrationQueuePersistenceOperation,
): never {
  throw mapRegistrationQueuePersistenceError(
    error,
    operation,
  );
}