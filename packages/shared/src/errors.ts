import type { ApiErrorDetail } from './api-response.js';

export type AppErrorOptions = Readonly<{
  code: string;
  message: string;
  statusCode: number;
  details?: readonly ApiErrorDetail[];
  expose?: boolean;
  retryable?: boolean;
  cause?: unknown;
}>;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: readonly ApiErrorDetail[];
  readonly expose: boolean;
  readonly retryable: boolean;

  constructor(options: AppErrorOptions) {
    super(options.message, {
      cause: options.cause,
    });

    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details ?? [];
    this.expose = options.expose ?? options.statusCode < 500;
    this.retryable = options.retryable ?? false;

    Error.captureStackTrace(this, new.target);
  }
}

export class RequestValidationError extends AppError {
  constructor(
    details: readonly ApiErrorDetail[],
    message = 'Request validation failed',
  ) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 422,
      details,
    });
  }
}

export class BadRequestError extends AppError {
  constructor(
    message: string,
    details: readonly ApiErrorDetail[] = [],
  ) {
    super({
      code: 'BAD_REQUEST',
      message,
      statusCode: 400,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required') {
    super({
      code: 'UNAUTHORIZED',
      message,
      statusCode: 401,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
  ) {
    super({
      code: 'FORBIDDEN',
      message,
      statusCode: 403,
    });
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super({
      code: 'RESOURCE_NOT_FOUND',
      message,
      statusCode: 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    details: readonly ApiErrorDetail[] = [],
  ) {
    super({
      code: 'CONFLICT',
      message,
      statusCode: 409,
      details,
    });
  }
}

export class ConcurrencyConflictError extends AppError {
  constructor(
    message = 'The record changed before this operation could be completed',
  ) {
    super({
      code: 'CONCURRENCY_CONFLICT',
      message,
      statusCode: 409,
      retryable: true,
    });
  }
}

export class PreconditionFailedError extends AppError {
  constructor(message: string) {
    super({
      code: 'PRECONDITION_FAILED',
      message,
      statusCode: 412,
    });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again later') {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      message,
      statusCode: 429,
      retryable: true,
    });
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super({
      code: 'DEPENDENCY_UNAVAILABLE',
      message,
      statusCode: 503,
      expose: false,
      retryable: true,
      cause,
    });
  }
}

export class InternalServerError extends AppError {
  constructor(cause?: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
      expose: false,
      cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}