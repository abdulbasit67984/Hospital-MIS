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
  PaymentCashierActorContext,
} from './payments-cashier-shifts.contracts.js';

import type {
  PaymentCashierActorResolverPort,
} from './payments-cashier-shifts.ports.js';

export type PaymentCashierValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export function validatedPaymentCashierPart<T>(
  request: Request,
  location:
    PaymentCashierValidatedLocation,
): T {
  const value =
    request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated payment and cashier-shift request ${location} is unavailable`,
    );
  }

  return value as T;
}

export function requirePaymentCashierPrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

export async function paymentCashierActorFromRequest(
  request: Request,
  authorization: AuthorizationService,
  actorResolver:
    PaymentCashierActorResolverPort,
): Promise<PaymentCashierActorContext> {
  const principal =
    requirePaymentCashierPrincipal(
      request,
    );

  const permissions =
    await authorization.permissionsFor(
      principal,
    );

  const validatedHeaders =
    request.validated.headers as
      | {
          'idempotency-key'?:
            string;

          'x-break-glass-reason'?:
            string;
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

export function paymentCashierIdempotencyKeyFromRequest(
  request: Request,
): string {
  const headers =
    validatedPaymentCashierPart<{
      'idempotency-key': string;
    }>(
      request,
      'headers',
    );

  return headers[
    'idempotency-key'
  ];
}