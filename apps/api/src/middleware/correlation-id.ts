import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithRequestContext } from '@hospital-mis/shared';
import { correlationIdSchema } from '@hospital-mis/validation';

export const correlationIdMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const requestedCorrelationId = request
    .header('x-correlation-id')
    ?.trim();

  const parsedCorrelationId =
    correlationIdSchema.safeParse(
      requestedCorrelationId,
    );

  const correlationId =
    parsedCorrelationId.success
      ? parsedCorrelationId.data
      : randomUUID();

  request.correlationId = correlationId;

  response.setHeader(
    'x-correlation-id',
    correlationId,
  );

  runWithRequestContext(
    {
      correlationId,
    },
    next,
  );
};