import type { Request } from 'express';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import type { ClaimsActorContext } from './claims.contracts.js';

export type ClaimsValidatedLocation = 'params' | 'query' | 'body' | 'headers';

export function validatedClaimsPart<T>(
  request: Request,
  location: ClaimsValidatedLocation,
): T {
  const value = request.validated[location];
  if (value === undefined) {
    throw new BadRequestError(
      `Validated claims request ${location} is unavailable`,
    );
  }
  return value as T;
}

export function requireClaimsPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }
  return request.auth;
}

export async function claimsActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<ClaimsActorContext> {
  const principal = requireClaimsPrincipal(request);
  const permissionSet = await authorization.permissionsFor(principal);
  const permissions = new Set<string>(permissionSet);
  const userAgent = request.header('user-agent');
  const requestedBreakGlassReason = request.header('x-break-glass-reason')?.trim();
  const mayBreakGlass = permissions.has('security.break_glass');

  if (requestedBreakGlassReason !== undefined &&
      requestedBreakGlassReason.length > 0 &&
      !mayBreakGlass) {
    throw new BadRequestError(
      'x-break-glass-reason requires security.break_glass permission',
    );
  }

  return {
    userId: principal.userId,
    staffId: null,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    permissionKeys: permissions,
    roleKeys:
      requestedBreakGlassReason !== undefined &&
      requestedBreakGlassReason.length > 0
        ? ['BREAK_GLASS']
        : [],
    ipAddress: request.ip,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(requestedBreakGlassReason === undefined ||
       requestedBreakGlassReason.length === 0
      ? {}
      : { breakGlassReason: requestedBreakGlassReason }),
  };
}

export function claimsIdempotencyKeyFromRequest(request: Request): string {
  return validatedClaimsPart<Readonly<{ 'idempotency-key': string }>>(
    request,
    'headers',
  )['idempotency-key'];
}