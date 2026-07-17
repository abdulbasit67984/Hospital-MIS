import type {
  Request,
  RequestHandler,
} from 'express';

import {
  BadRequestError,
  UnauthorizedError,
} from '@hospital-mis/shared';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  PATIENT_PERMISSION_KEYS,
} from './patient.constants.js';

import type {
  PatientQueryAccessLevel,
} from './patient.query.types.js';

import type {
  PatientActorContext,
} from './patient.types.js';

import type {
  PatientMutationHeaders,
  PatientReadHeaders,
} from './patient.http.validation.js';

export type PatientValidatedRequestLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

export interface PatientMutationRequestContext {
  actor:
    PatientActorContext;

  idempotencyKey:
    string;
}

export function validatedPatientPart<T>(
  request:
    Request,

  location:
    PatientValidatedRequestLocation,
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

export function requirePatientPrincipal(
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

export function patientActorFromRequest(
  request:
    Request,
): PatientActorContext {
  const principal =
    requirePatientPrincipal(
      request,
    );

  const actor:
    PatientActorContext = {
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

export function patientIdempotencyKeyFromRequest(
  request:
    Request,
): string {
  const headers =
    validatedPatientPart<
      PatientMutationHeaders
    >(
      request,
      'headers',
    );

  const value =
    headers[
      'idempotency-key'
    ];

  if (
    value.length < 8 ||
    value.length > 200 ||
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

export function patientMutationContextFromRequest(
  request:
    Request,
): PatientMutationRequestContext {
  return {
    actor:
      patientActorFromRequest(
        request,
      ),

    idempotencyKey:
      patientIdempotencyKeyFromRequest(
        request,
      ),
  };
}

export function patientReadAccessLevelFromRequest(
  request:
    Request,
): PatientQueryAccessLevel {
  const headers =
    validatedPatientPart<
      PatientReadHeaders
    >(
      request,
      'headers',
    );

  return headers[
    'x-patient-access-level'
  ];
}

export function requireSensitivePatientReadWhenRequested(
  authorization:
    AuthorizationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      if (
        patientReadAccessLevelFromRequest(
          request,
        ) ===
        'SENSITIVE'
      ) {
        await authorization
          .assertPermission(
            requirePatientPrincipal(
              request,
            ),

            PATIENT_PERMISSION_KEYS
              .READ_SENSITIVE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}