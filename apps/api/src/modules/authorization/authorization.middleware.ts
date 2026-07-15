import type {
  Request,
  RequestHandler,
} from 'express';

import {
  ForbiddenError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  AuthorizationService,
} from './authorization.service.js';

function requirePrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (
    request.auth ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export function requirePermission(
  service:
    AuthorizationService,

  permission:
    PermissionKey,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      await service.assertPermission(
        requirePrincipal(request),
        permission,
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAnyPermission(
  service:
    AuthorizationService,

  permissions:
    readonly PermissionKey[],
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      await service.assertAnyPermission(
        requirePrincipal(request),
        permissions,
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}

export type FacilityIdResolver =
  (
    request: Request,
  ) =>
    | string
    | undefined;

export function requireFacilityAccess(
  service:
    AuthorizationService,

  resolveFacilityId:
    FacilityIdResolver,
): RequestHandler {
  return (
    request,
    _response,
    next,
  ) => {
    try {
      const facilityId =
        resolveFacilityId(
          request,
        );

      if (
        facilityId ===
        undefined
      ) {
        throw new ForbiddenError(
          'Facility context is required',
        );
      }

      service.assertFacilityAccess(
        requirePrincipal(request),
        facilityId,
      );

      next();
    } catch (error) {
      next(error);
    }
  };
}

export type PolicyDecision =
  | Readonly<{
      allowed: true;
    }>
  | Readonly<{
      allowed: false;
      reason?: string;
    }>;

export type RecordPolicyContext<TRecord> =
  Readonly<{
    principal:
      AuthenticatedPrincipal;

    record:
      TRecord;

    request:
      Request;
  }>;

export interface RecordAccessPolicy<TRecord> {
  readonly name: string;

  evaluate(
    context:
      RecordPolicyContext<TRecord>,
  ): Promise<PolicyDecision>;
}

export function enforceRecordPolicy<TRecord>(
  policy:
    RecordAccessPolicy<TRecord>,

  loadRecord:
    (
      request: Request,
    ) => Promise<TRecord>,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const principal =
        requirePrincipal(
          request,
        );

      const record =
        await loadRecord(
          request,
        );

      const decision =
        await policy.evaluate({
          principal,
          record,
          request,
        });

      if (!decision.allowed) {
        throw new ForbiddenError(
          decision.reason ??
            `Record policy ${policy.name} denied access`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}