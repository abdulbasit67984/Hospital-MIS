import type { Request } from 'express';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import type { WelfareZakatActorContext } from './welfare-zakat.contracts.js';

export type WelfareZakatValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedWelfareZakatPart<T>(
  request: Request,
  location: WelfareZakatValidatedLocation,
): T {
  const value = request.validated[location];
  if (value === undefined) {
    throw new BadRequestError(
      `Validated Welfare and Zakat request ${location} is unavailable`,
    );
  }
  return value as T;
}

export function requireWelfareZakatPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) throw new UnauthorizedError();
  return request.auth;
}

export async function welfareZakatActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<WelfareZakatActorContext> {
  const principal = requireWelfareZakatPrincipal(request);
  const permissionKeys = new Set<string>(
    await authorization.permissionsFor(principal),
  );
  const breakGlassReason = request.header('x-break-glass-reason')?.trim();
  if (
    breakGlassReason !== undefined &&
    breakGlassReason.length > 0 &&
    !permissionKeys.has('security.break_glass')
  ) {
    throw new BadRequestError(
      'x-break-glass-reason requires security.break_glass permission',
    );
  }
  const userAgent = request.header('user-agent');
  return {
    userId: principal.userId,
    staffId: null,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    permissionKeys,
    roleKeys:
      breakGlassReason === undefined || breakGlassReason.length === 0
        ? []
        : ['BREAK_GLASS'],
    ipAddress: request.ip,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(breakGlassReason === undefined || breakGlassReason.length === 0
      ? {}
      : { breakGlassReason }),
  };
}

export function welfareZakatIdempotencyKeyFromRequest(
  request: Request,
): string {
  return validatedWelfareZakatPart<Readonly<{ 'idempotency-key': string }>>(
    request,
    'headers',
  )['idempotency-key'];
}