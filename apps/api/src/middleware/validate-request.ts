import type { RequestHandler } from 'express';
import { RequestValidationError } from '@hospital-mis/shared';
import {
  parseHttpRequest,
  type HttpRequestSchemas,
} from '@hospital-mis/validation';

export function validateRequest(
  schemas: HttpRequestSchemas,
): RequestHandler {
  return (
    request,
    _response,
    next,
  ) => {
    const result = parseHttpRequest(
      schemas,
      {
        params: request.params,
        query: request.query,
        body: request.body,
        headers: request.headers,
      },
    );

    if (!result.success) {
      next(
        new RequestValidationError(
          result.details,
        ),
      );
      return;
    }

    request.validated = result.data;
    next();
  };
}