export type ApiErrorDetail = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type ApiMeta = Readonly<{
  correlationId: string;
}>;

export type ApiSuccess<T> = Readonly<{
  success: true;
  data: T;
  meta: ApiMeta;
}>;

export type ApiFailure = Readonly<{
  success: false;
  error: Readonly<{
    code: string;
    message: string;
    details?: readonly ApiErrorDetail[];
    correlationId: string;
  }>;
}>;

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createApiSuccess<T>(
  data: T,
  correlationId: string,
): ApiSuccess<T> {
  return {
    success: true,
    data,
    meta: {
      correlationId,
    },
  };
}

export function createApiFailure(input: {
  code: string;
  message: string;
  correlationId: string;
  details?: readonly ApiErrorDetail[];
}): ApiFailure {
  return {
    success: false,
    error: {
      code: input.code,
      message: input.message,
      correlationId: input.correlationId,
      ...(input.details === undefined || input.details.length === 0
        ? {}
        : {
            details: input.details,
          }),
    },
  };
}