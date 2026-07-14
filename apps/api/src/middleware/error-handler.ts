import type { ErrorRequestHandler } from 'express';
import type { ApiConfig } from '@hospital-mis/config';
import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  RequestValidationError,
  createApiFailure,
  isAppError,
  type ApiErrorDetail,
} from '@hospital-mis/shared';

type UnknownRecord = Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === 'object' &&
    value !== null
  );
}

function isBodyParserSyntaxError(
  error: unknown,
): boolean {
  return (
    error instanceof SyntaxError &&
    isRecord(error) &&
    error['type'] === 'entity.parse.failed' &&
    error['status'] === 400
  );
}

function isMongoDuplicateKeyError(
  error: unknown,
): boolean {
  return (
    isRecord(error) &&
    error['code'] === 11000
  );
}

function mongooseValidationDetails(
  error: UnknownRecord,
): readonly ApiErrorDetail[] {
  const rawErrors = error['errors'];

  if (!isRecord(rawErrors)) {
    return [];
  }

  return Object.entries(rawErrors).map(
    ([path, value]) => {
      const message =
        isRecord(value) &&
        typeof value['message'] === 'string'
          ? value['message']
          : 'Invalid value';

      return {
        code: 'invalid_value',
        message,
        path,
      };
    },
  );
}

function normalizeError(
  error: unknown,
): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (isBodyParserSyntaxError(error)) {
    return new BadRequestError(
      'Request body contains invalid JSON',
    );
  }

  if (isMongoDuplicateKeyError(error)) {
    return new ConflictError(
      'A record with the same unique value already exists',
    );
  }

  if (
    isRecord(error) &&
    error['name'] === 'ValidationError'
  ) {
    return new RequestValidationError(
      mongooseValidationDetails(error),
      'Database validation failed',
    );
  }

  if (
    isRecord(error) &&
    error['name'] === 'CastError'
  ) {
    const path =
      typeof error['path'] === 'string'
        ? error['path']
        : 'identifier';

    return new RequestValidationError([
      {
        code: 'invalid_identifier',
        message: 'Invalid identifier value',
        path,
      },
    ]);
  }

  return new InternalServerError(error);
}

export function createErrorHandler(
  config: ApiConfig,
): ErrorRequestHandler {
  return (
    error,
    request,
    response,
    _next,
  ) => {
    const normalized =
      normalizeError(error);

    const logPayload = {
      errorName:
        error instanceof Error
          ? error.name
          : typeof error,
      errorCode: normalized.code,
      statusCode: normalized.statusCode,
      correlationId: request.correlationId,
      retryable: normalized.retryable,
    };

    if (normalized.statusCode >= 500) {
      request.log.error(
        logPayload,
        'Request failed',
      );
    } else {
      request.log.warn(
        logPayload,
        'Request rejected',
      );
    }

    const exposeMessage =
      normalized.expose ||
      config.nodeEnv !== 'production';

    response
      .status(normalized.statusCode)
      .json(
        createApiFailure({
          code: normalized.code,

          message: exposeMessage
            ? normalized.message
            : 'An unexpected error occurred',

          correlationId:
            request.correlationId,

          details: normalized.expose
            ? normalized.details
            : [],
        }),
      );
  };
}