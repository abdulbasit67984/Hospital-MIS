import {
  LaboratoryAccessionConflictError,
  LaboratoryCategoryCodeConflictError,
  LaboratoryCategoryNameConflictError,
  LaboratoryCriticalCommunicationSequenceConflictError,
  LaboratoryOrderItemResultConflictError,
  LaboratoryOrderItemSequenceConflictError,
  LaboratoryOrderItemTestConflictError,
  LaboratoryOrderNumberConflictError,
  LaboratoryOrderStatusHistorySequenceConflictError,
  LaboratoryResultNumberConflictError,
  LaboratoryResultVersionConflictError,
  LaboratorySpecimenHistorySequenceConflictError,
  LaboratorySpecimenIdentifierConflictError,
  LaboratorySpecimenLabelConflictError,
  LaboratoryTestCodeConflictError,
  LaboratoryTestNameConflictError,
} from './laboratory.errors.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: unknown;
  cause?: unknown;
}

export type LaboratoryPersistenceOperation =
  | 'CREATE_CATEGORY'
  | 'CREATE_TEST'
  | 'CREATE_ORDER'
  | 'CREATE_ORDER_ITEM'
  | 'CREATE_ORDER_HISTORY'
  | 'CREATE_SPECIMEN'
  | 'CREATE_SPECIMEN_HISTORY'
  | 'CREATE_RESULT'
  | 'CREATE_RESULT_VERSION'
  | 'CREATE_CRITICAL_COMMUNICATION';

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

  const candidate = asMongoLikeError(error);

  if (candidate === null) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  return candidate.cause === undefined
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

function hasFields(
  fields: ReadonlySet<string>,
  ...required: readonly string[]
): boolean {
  return required.every(
    (field) => fields.has(field),
  );
}

function messageContains(
  error: MongoLikeError,
  value: string,
): boolean {
  return (
    typeof error.message === 'string' &&
    error.message.includes(value)
  );
}

export function isLaboratoryDuplicateKeyError(
  error: unknown,
): boolean {
  return findDuplicateKeyError(error) !== null;
}

export function mapLaboratoryPersistenceError(
  error: unknown,
  operation: LaboratoryPersistenceOperation,
): Error {
  const duplicateError = findDuplicateKeyError(error);

  if (duplicateError === null) {
    return error instanceof Error
      ? error
      : new Error(
          'Unknown Laboratory persistence error',
          {
            cause: error,
          },
        );
  }

  const fields = duplicateFields(duplicateError);

  if (operation === 'CREATE_CATEGORY') {
    if (
      hasFields(fields, 'facilityId', 'categoryCode') ||
      messageContains(
        duplicateError,
        'uq_lab_test_categories_facility_code',
      )
    ) {
      return new LaboratoryCategoryCodeConflictError();
    }

    return new LaboratoryCategoryNameConflictError();
  }

  if (operation === 'CREATE_TEST') {
    if (
      hasFields(fields, 'facilityId', 'testCode') ||
      messageContains(
        duplicateError,
        'uq_lab_tests_facility_code',
      )
    ) {
      return new LaboratoryTestCodeConflictError();
    }

    return new LaboratoryTestNameConflictError();
  }

  if (operation === 'CREATE_ORDER') {
    return new LaboratoryOrderNumberConflictError();
  }

  if (operation === 'CREATE_ORDER_ITEM') {
    if (
      hasFields(fields, 'facilityId', 'labOrderId', 'labTestId') ||
      messageContains(
        duplicateError,
        'uq_lab_order_items_test',
      )
    ) {
      return new LaboratoryOrderItemTestConflictError();
    }

    return new LaboratoryOrderItemSequenceConflictError();
  }

  if (operation === 'CREATE_ORDER_HISTORY') {
    return new LaboratoryOrderStatusHistorySequenceConflictError();
  }

  if (operation === 'CREATE_SPECIMEN') {
    if (
      hasFields(fields, 'facilityId', 'accessionNumber') ||
      messageContains(
        duplicateError,
        'uq_lab_specimens_facility_accession',
      )
    ) {
      return new LaboratoryAccessionConflictError();
    }

    if (
      hasFields(fields, 'facilityId', 'specimenIdentifier') ||
      messageContains(
        duplicateError,
        'uq_lab_specimens_facility_identifier',
      )
    ) {
      return new LaboratorySpecimenIdentifierConflictError();
    }

    return new LaboratorySpecimenLabelConflictError();
  }

  if (operation === 'CREATE_SPECIMEN_HISTORY') {
    return new LaboratorySpecimenHistorySequenceConflictError();
  }

  if (operation === 'CREATE_RESULT') {
    if (
      hasFields(fields, 'facilityId', 'labOrderItemId') ||
      messageContains(
        duplicateError,
        'uq_lab_results_order_item',
      )
    ) {
      return new LaboratoryOrderItemResultConflictError();
    }

    return new LaboratoryResultNumberConflictError();
  }

  if (operation === 'CREATE_RESULT_VERSION') {
    return new LaboratoryResultVersionConflictError();
  }

  return new LaboratoryCriticalCommunicationSequenceConflictError();
}

export function throwMappedLaboratoryPersistenceError(
  error: unknown,
  operation: LaboratoryPersistenceOperation,
): never {
  throw mapLaboratoryPersistenceError(
    error,
    operation,
  );
}