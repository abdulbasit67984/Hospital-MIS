import {
  IdentityConflictError,
} from './identity.errors.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  cause?: unknown;
  message?: unknown;
}

export interface IdentityDuplicateContext {
  entityName: string;
  fallbackMessage: string;
  fallbackCode: string;
}

function asMongoLikeError(
  error: unknown,
): MongoLikeError | null {
  if (!error || typeof error !== 'object') {
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

  if (!candidate) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  if (candidate.cause) {
    return findDuplicateKeyError(
      candidate.cause,
      depth + 1,
    );
  }

  return null;
}

export function isDuplicateKeyError(
  error: unknown,
): boolean {
  return Boolean(findDuplicateKeyError(error));
}

export function extractDuplicateKeyDetails(
  error: unknown,
): {
  fields: string[];
  values: Record<string, unknown>;
} | null {
  const duplicateError = findDuplicateKeyError(error);

  if (!duplicateError) {
    return null;
  }

  const fields = Object.keys(
    duplicateError.keyPattern ??
      duplicateError.keyValue ??
      {},
  );

  return {
    fields,
    values: duplicateError.keyValue ?? {},
  };
}

export function mapIdentityPersistenceError(
  error: unknown,
  context: IdentityDuplicateContext,
): Error {
  const duplicateDetails =
    extractDuplicateKeyDetails(error);

  if (!duplicateDetails) {
    return error instanceof Error
      ? error
      : new Error('Unknown identity persistence error', {
          cause: error,
        });
  }

  return new IdentityConflictError(
    context.fallbackMessage,
    context.fallbackCode,
    {
      entityName: context.entityName,
      duplicateFields: duplicateDetails.fields,
      duplicateValues: duplicateDetails.values,
    },
  );
}

export function throwMappedIdentityPersistenceError(
  error: unknown,
  context: IdentityDuplicateContext,
): never {
  throw mapIdentityPersistenceError(error, context);
}