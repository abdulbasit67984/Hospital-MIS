import { z } from 'zod';
import type { ApiErrorDetail } from '@hospital-mis/shared';

export const httpRequestLocations = [
  'params',
  'query',
  'body',
  'headers',
] as const;

export type HttpRequestLocation =
  (typeof httpRequestLocations)[number];

export type HttpRequestSchemas = Readonly<
  Partial<
    Record<
      HttpRequestLocation,
      z.ZodType<unknown>
    >
  >
>;

export type HttpRequestInput = Readonly<
  Record<HttpRequestLocation, unknown>
>;

export type ParsedHttpRequest = Partial<
  Record<HttpRequestLocation, unknown>
>;

function issuePath(
  location: HttpRequestLocation,
  path: readonly PropertyKey[],
): string {
  const suffix = path
    .map(String)
    .join('.');

  return suffix.length === 0
    ? location
    : `${location}.${suffix}`;
}

export function formatZodIssues(
  location: HttpRequestLocation,
  error: z.ZodError,
): readonly ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issuePath(
      location,
      issue.path,
    ),
  }));
}

export function parseHttpRequest(
  schemas: HttpRequestSchemas,
  input: HttpRequestInput,
):
  | Readonly<{
      success: true;
      data: ParsedHttpRequest;
    }>
  | Readonly<{
      success: false;
      details: readonly ApiErrorDetail[];
    }> {
  const data: ParsedHttpRequest = {};
  const details: ApiErrorDetail[] = [];

  for (const location of httpRequestLocations) {
    const schema = schemas[location];

    if (schema === undefined) {
      continue;
    }

    const result = schema.safeParse(
      input[location],
    );

    if (result.success) {
      data[location] = result.data;
      continue;
    }

    details.push(
      ...formatZodIssues(
        location,
        result.error,
      ),
    );
  }

  if (details.length > 0) {
    return {
      success: false,
      details,
    };
  }

  return {
    success: true,
    data,
  };
}