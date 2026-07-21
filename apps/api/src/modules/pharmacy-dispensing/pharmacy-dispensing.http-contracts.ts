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
  PharmacyDispensingActorContext,
} from './pharmacy-dispensing.contracts.js';

import type {
  PharmacyActorResolverPort,
} from './pharmacy-dispensing.ports.js';

export type PharmacyValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedPharmacyPart<T>(
  request: Request,
  location: PharmacyValidatedLocation,
): T {
  const value = request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated pharmacy dispensing request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requirePharmacyPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function pharmacyActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
  actorResolver: PharmacyActorResolverPort,
): Promise<PharmacyDispensingActorContext> {
  const principal = requirePharmacyPrincipal(request);
  const permissions = await authorization.permissionsFor(principal);
  const validatedHeaders = request.validated.headers as
    | {
        'idempotency-key'?: string;
        'x-break-glass-reason'?: string;
      }
    | undefined;
  const rawBreakGlassReason =
    validatedHeaders?.['x-break-glass-reason'] ??
    request.header('x-break-glass-reason');
  const breakGlassReason = rawBreakGlassReason === undefined
    ? undefined
    : z.string().trim().min(10).max(1_000).parse(rawBreakGlassReason);
  const ipAddress = request.ip;
  const userAgent = request.header('user-agent');

  return actorResolver.resolve({
    userId: principal.userId,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    permissions,
    ...(ipAddress.length === 0 ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(breakGlassReason === undefined ? {} : { breakGlassReason }),
  });
}

export function pharmacyIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers = validatedPharmacyPart<{
    'idempotency-key': string;
  }>(request, 'headers');

  return headers['idempotency-key'];
}