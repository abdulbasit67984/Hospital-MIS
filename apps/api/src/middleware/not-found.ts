import type { RequestHandler } from 'express';
import { ResourceNotFoundError } from '@hospital-mis/shared';

export const notFoundHandler: RequestHandler = (
  request,
  _response,
  next,
) => {
  next(
    new ResourceNotFoundError(
      `Route ${request.method} ${request.originalUrl} was not found`,
    ),
  );
};