import type {
  Request,
} from 'express';

import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  FACILITY_PERMISSION_KEYS,
} from './facility.constants.js';

import type {
  FacilityActorContext,
} from './facility.types.js';

export type FacilityValidatedRequestLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export interface FacilityMutationRequestContext {
  actor:
    FacilityActorContext;

  idempotencyKey:
    string;
}

export function validatedFacilityPart<T>(
  request:
    Request,

  location:
    FacilityValidatedRequestLocation,
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

export function requireFacilityPrincipal(
  request:
    Request,
): AuthenticatedPrincipal {
  if (
    request.auth ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export function facilityActorFromRequest(
  request:
    Request,
): FacilityActorContext {
  const principal =
    requireFacilityPrincipal(
      request,
    );

  const actor:
    FacilityActorContext = {
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

export function facilityIdempotencyKeyFromRequest(
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
    !/^[A-Za-z0-9._:-]+$/u.test(
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

export function facilityMutationContextFromRequest(
  request:
    Request,
): FacilityMutationRequestContext {
  return {
    actor:
      facilityActorFromRequest(
        request,
      ),

    idempotencyKey:
      facilityIdempotencyKeyFromRequest(
        request,
      ),
  };
}

export async function canManageAllFacilities(
  request:
    Request,

  authorization:
    AuthorizationService,
): Promise<boolean> {
  return authorization
    .hasPermission(
      requireFacilityPrincipal(
        request,
      ),

      FACILITY_PERMISSION_KEYS
        .FACILITY_MANAGE_ALL,
    );
}

export async function assertFacilityOrManageAll(
  request:
    Request,

  authorization:
    AuthorizationService,

  targetFacilityId:
    string,
): Promise<void> {
  const principal =
    requireFacilityPrincipal(
      request,
    );

  if (
    principal.facilityId ===
    targetFacilityId
  ) {
    return;
  }

  if (
    await authorization
      .hasPermission(
        principal,
        FACILITY_PERMISSION_KEYS
          .FACILITY_MANAGE_ALL,
      )
  ) {
    return;
  }

  throw new ForbiddenError(
    'Cross-facility access is not permitted',
  );
}