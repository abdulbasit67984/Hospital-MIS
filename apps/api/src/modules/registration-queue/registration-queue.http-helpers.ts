import type {
  Request,
} from 'express';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  RegistrationQueueMutationHeaders,
} from './registration-queue.http.validation.js';

import type {
  RegistrationQueueActorContext,
} from './registration-queue.types.js';

export type RegistrationQueueValidatedRequestLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export interface RegistrationQueueMutationRequestContext {
  actor:
    RegistrationQueueActorContext;

  idempotencyKey:
    string;
}

export function validatedRegistrationQueuePart<T>(
  request: Request,
  location: RegistrationQueueValidatedRequestLocation,
): T {
  const value =
    request.validated[
      location
    ];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requireRegistrationQueuePrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export function registrationQueueActorFromRequest(
  request: Request,
): RegistrationQueueActorContext {
  const principal =
    requireRegistrationQueuePrincipal(
      request,
    );

  const actor:
    RegistrationQueueActorContext = {
      userId:
        principal.userId,

      facilityId:
        principal.facilityId,

      correlationId:
        request.correlationId,
  };

  const userAgent =
    request.header(
      'user-agent',
    );

  if (userAgent !== undefined) {
    actor.userAgent =
      userAgent;
  }

  if (request.ip.length > 0) {
    actor.ipAddress =
      request.ip;
  }

  return actor;
}

export function registrationQueueIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers =
    validatedRegistrationQueuePart<
      RegistrationQueueMutationHeaders
    >(
      request,
      'headers',
    );

  return headers[
    'idempotency-key'
  ];
}

export function registrationQueueMutationContextFromRequest(
  request: Request,
): RegistrationQueueMutationRequestContext {
  return {
    actor:
      registrationQueueActorFromRequest(
        request,
      ),

    idempotencyKey:
      registrationQueueIdempotencyKeyFromRequest(
        request,
      ),
  };
}