import type { Request } from 'express';

import { BadRequestError, UnauthorizedError } from '@hospital-mis/shared';

import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import type { ConsultantSharingActorContext } from './consultant-sharing.contracts.js';

export type ConsultantSharingValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export interface ConsultantSharingActorIdentity {
  staffId: string | null;
  roleKeys: readonly string[];
}

export interface ConsultantSharingActorIdentityResolver {
  resolve(input: Readonly<{
    facilityId: string;
    userId: string;
  }>): Promise<ConsultantSharingActorIdentity>;
}

export function validatedConsultantSharingPart<T>(
  request: Request,
  location: ConsultantSharingValidatedLocation,
): T {
  const value = request.validated[location];
  if (value === undefined) {
    throw new BadRequestError(
      `Validated Consultant Sharing request ${location} is unavailable`,
    );
  }
  return value as T;
}

export function requireConsultantSharingPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) throw new UnauthorizedError();
  return request.auth;
}

export async function consultantSharingActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
  identityResolver: ConsultantSharingActorIdentityResolver,
): Promise<ConsultantSharingActorContext> {
  const principal = requireConsultantSharingPrincipal(request);
  const [permissionKeys, identity] = await Promise.all([
    authorization.permissionsFor(principal),
    identityResolver.resolve({
      facilityId: principal.facilityId,
      userId: principal.userId,
    }),
  ]);
  const breakGlassReason = request.header('x-break-glass-reason')?.trim();
  if (breakGlassReason && !permissionKeys.has('security.break_glass')) {
    throw new BadRequestError(
      'x-break-glass-reason requires security.break_glass permission',
    );
  }
  const userAgent = request.header('user-agent');
  return {
    userId: principal.userId,
    staffId: identity.staffId,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    permissionKeys,
    roleKeys: breakGlassReason
      ? [...new Set([...identity.roleKeys, 'BREAK_GLASS'])]
      : identity.roleKeys,
    ipAddress: request.ip,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(breakGlassReason ? { breakGlassReason } : {}),
  };
}

export function consultantSharingIdempotencyKeyFromRequest(
  request: Request,
): string {
  return validatedConsultantSharingPart<
    Readonly<{ 'idempotency-key': string }>
  >(request, 'headers')['idempotency-key'];
}