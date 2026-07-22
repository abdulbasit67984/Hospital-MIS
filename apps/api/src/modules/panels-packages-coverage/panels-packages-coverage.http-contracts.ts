import type {
  Request,
} from 'express';

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
  PanelsPackagesCoverageActorContext,
} from './panels-packages-coverage.contracts.js';

export type PpcValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedPpcPart<T>(
  request: Request,
  location: PpcValidatedLocation,
): T {
  const value = request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated panels, packages, and coverage request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requirePpcPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function ppcActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<PanelsPackagesCoverageActorContext> {
  const principal = requirePpcPrincipal(request);
  const permissionSet = await authorization.permissionsFor(principal);

  return {
    userId: principal.userId,
    staffId: null,
    facilityId: principal.facilityId,
    correlationId: request.correlationId,
    permissionKeys: [...permissionSet],
    roleKeys: [],
    ipAddress: request.ip,
    userAgent: request.header('user-agent'),
  };
}

export function ppcIdempotencyKeyFromRequest(
  request: Request,
): string {
  return validatedPpcPart<
    Readonly<{
      'idempotency-key': string;
    }>
  >(request, 'headers')['idempotency-key'];
}