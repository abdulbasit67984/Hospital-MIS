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
  FormularyPrescriptionActorContext,
} from './formulary-prescriptions.types.js';

export type FormularyPrescriptionValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedFormularyPrescriptionPart<T>(
  request: Request,
  location: FormularyPrescriptionValidatedLocation,
): T {
  const value =
    request.validated[
      location
    ];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated formulary and prescription request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requireFormularyPrescriptionPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function formularyPrescriptionActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<FormularyPrescriptionActorContext> {
  const principal =
    requireFormularyPrescriptionPrincipal(
      request,
    );

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

  return {
    userId:
      principal.userId,

    facilityId:
      principal.facilityId,

    correlationId:
      request.correlationId,

    roleKeys:
      [],

    permissionKeys:
      [
        ...permissions,
      ],

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
  };
}

export function formularyPrescriptionIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers =
    validatedFormularyPrescriptionPart<{
      'idempotency-key': string;
    }>(
      request,
      'headers',
    );

  return headers[
    'idempotency-key'
  ];
}