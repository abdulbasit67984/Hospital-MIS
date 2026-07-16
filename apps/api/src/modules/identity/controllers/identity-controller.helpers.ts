import type {
  Request,
} from 'express';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  IdentityActorContext,
} from '../identity.types.js';

export type ValidatedRequestLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export interface IdentityMutationRequestContext {
  actor:
    IdentityActorContext;

  idempotencyKey:
    string;
}

export function validatedPart<T>(
  request:
    Request,

  location:
    ValidatedRequestLocation,
): T {
  const value =
    request.validated[
      location
    ];

  if (
    value ===
    undefined
  ) {
    throw new BadRequestError(
      `Validated request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function identityActorFromRequest(
  request:
    Request,
): IdentityActorContext {
  const principal =
    request.auth;

  if (
    principal ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  const actor:
    IdentityActorContext = {
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

  if (
    userAgent !==
    undefined
  ) {
    actor.userAgent =
      userAgent;
  }

  if (
    request.ip.length >
    0
  ) {
    actor.ipAddress =
      request.ip;
  }

  return actor;
}

export function idempotencyKeyFromRequest(
  request:
    Request,
): string {
  const value =
    request
      .header(
        'idempotency-key',
      )
      ?.trim();

  if (
    value ===
      undefined ||
    value.length ===
      0
  ) {
    throw new BadRequestError(
      'Idempotency-Key header is required for this operation',
      [
        {
          code:
            'missing_header',

          message:
            'Idempotency-Key header is required',

          path:
            'headers.idempotency-key',
        },
      ],
    );
  }

  if (
    value.length <
      8 ||
    value.length >
      200 ||
    !/^[A-Za-z0-9._:-]+$/.test(
      value,
    )
  ) {
    throw new BadRequestError(
      'Idempotency-Key header is invalid',
      [
        {
          code:
            'invalid_header',

          message:
            'Use 8 to 200 letters, numbers, periods, underscores, colons, or hyphens',

          path:
            'headers.idempotency-key',
        },
      ],
    );
  }

  return value;
}

export function identityMutationContextFromRequest(
  request:
    Request,
): IdentityMutationRequestContext {
  return {
    actor:
      identityActorFromRequest(
        request,
      ),

    idempotencyKey:
      idempotencyKeyFromRequest(
        request,
      ),
  };
}