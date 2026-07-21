import type {
  Request,
} from 'express';

import {
  z,
} from 'zod';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  UnifiedBillingActorContext,
} from './unified-billing.contracts.js';

import type {
  UnifiedBillingActorResolverPort,
} from './unified-billing.ports.js';

export type UnifiedBillingValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedUnifiedBillingPart<T>(
  request: Request,
  location: UnifiedBillingValidatedLocation,
): T {
  const value =
    request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated unified billing request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requireUnifiedBillingPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function unifiedBillingActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
  actorResolver: UnifiedBillingActorResolverPort,
): Promise<UnifiedBillingActorContext> {
  const principal =
    requireUnifiedBillingPrincipal(request);
  const permissions =
    await authorization.permissionsFor(
      principal,
    );
  const validatedHeaders =
    request.validated.headers as
      | {
          'idempotency-key'?: string;
          'x-break-glass-reason'?: string;
        }
      | undefined;
  const rawBreakGlassReason =
    validatedHeaders?.[
      'x-break-glass-reason'
    ] ??
    request.header(
      'x-break-glass-reason',
    );
  const breakGlassReason =
    rawBreakGlassReason === undefined
      ? undefined
      : z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .parse(
            rawBreakGlassReason,
          );
  const ipAddress =
    request.ip;
  const userAgent =
    request.header(
      'user-agent',
    );

  return actorResolver.resolve({
    userId:
      principal.userId,
    facilityId:
      principal.facilityId,
    correlationId:
      request.correlationId,
    permissions,
    ...(ipAddress.length === 0
      ? {}
      : {
          ipAddress,
        }),
    ...(userAgent === undefined
      ? {}
      : {
          userAgent,
        }),
    ...(breakGlassReason === undefined
      ? {}
      : {
          breakGlassReason,
        }),
  });
}

export function unifiedBillingIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers =
    validatedUnifiedBillingPart<{
      'idempotency-key': string;
    }>(
      request,
      'headers',
    );

  return headers[
    'idempotency-key'
  ];
}