import type {
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import {
  ZodError,
  type ZodType,
} from 'zod';

import type {
  InpatientActorContext,
} from './inpatient.types.js';

export interface InpatientAuthenticatedPrincipal {
  userId:
    string;

  facilityId:
    string;

  roleKeys:
    string[];

  permissionKeys:
    string[];

  breakGlassReason?:
    string;
}

export type InpatientAuthenticatedRequest<
  TParams =
    Record<
      string,
      string
    >,

  TQuery =
    Record<
      string,
      unknown
    >,

  TBody =
    unknown,
> =
  FastifyRequest<{
    Params:
      TParams;

    Querystring:
      TQuery;

    Body:
      TBody;
  }> & {
    user:
      InpatientAuthenticatedPrincipal;
  };

export function inpatientActorFromRequest(
  request:
    InpatientAuthenticatedRequest,
): InpatientActorContext {
  const header =
    request.headers[
      'x-correlation-id'
    ];

  const correlationId =
    typeof header ===
      'string' &&
    header.trim().length >
      0
      ? header.trim()
      : request.id;

  return {
    userId:
      request.user.userId,

    facilityId:
      request.user.facilityId,

    roleKeys: [
      ...request.user.roleKeys,
    ],

    permissionKeys: [
      ...request.user.permissionKeys,
    ],

    correlationId,

    ...(
      request.user.breakGlassReason ===
      undefined
        ? {}
        : {
            breakGlassReason:
              request.user.breakGlassReason,
          }
    ),

    ipAddress:
      request.ip,

    ...(
      request.headers[
        'user-agent'
      ] ===
      undefined
        ? {}
        : {
            userAgent:
              request.headers[
                'user-agent'
              ],
          }
    ),
  };
}

export function requireInpatientIdempotencyKey(
  request:
    FastifyRequest,
): string {
  const header =
    request.headers[
      'idempotency-key'
    ];

  const value =
    Array.isArray(
      header,
    )
      ? header[0]
      : header;

  if (
    value ===
      undefined ||
    value.trim().length <
      8 ||
    value.trim().length >
      200
  ) {
    const error =
      new Error(
        'A valid Idempotency-Key header is required',
      );

    Object.assign(
      error,
      {
        statusCode:
          400,

        code:
          'INVALID_IDEMPOTENCY_KEY',

        expose:
          true,
      },
    );

    throw error;
  }

  return value.trim();
}

export function parseInpatientInput<T>(
  schema:
    ZodType<T>,

  input:
    unknown,
): T {
  return schema.parse(
    input,
  );
}

export function inpatientHttpErrorHandler(
  error:
    unknown,

  _request:
    FastifyRequest,

  reply:
    FastifyReply,
): void {
  if (
    error instanceof
    ZodError
  ) {
    void reply
      .status(
        400,
      )
      .send({
        error: {
          code:
            'VALIDATION_ERROR',

          message:
            'The inpatient request is invalid',

          details:
            error.issues.map(
              (
                issue,
              ) => ({
                path:
                  issue.path.join(
                    '.',
                  ),

                message:
                  issue.message,
              }),
            ),
        },
      });

    return;
  }

  if (
    error !==
      null &&
    typeof error ===
      'object'
  ) {
    const candidate =
      error as {
        statusCode?:
          unknown;

        code?:
          unknown;

        message?:
          unknown;

        expose?:
          unknown;
      };

    const statusCode =
      typeof candidate.statusCode ===
      'number'
        ? candidate.statusCode
        : 500;

    void reply
      .status(
        statusCode,
      )
      .send({
        error: {
          code:
            typeof candidate.code ===
            'string'
              ? candidate.code
              : 'INPATIENT_INTERNAL_ERROR',

          message:
            candidate.expose ===
              true ||
            statusCode <
              500
              ? (
                  typeof candidate.message ===
                    'string'
                    ? candidate.message
                    : 'Inpatient request failed'
                )
              : 'An internal inpatient error occurred',
        },
      });

    return;
  }

  void reply
    .status(
      500,
    )
    .send({
      error: {
        code:
          'INPATIENT_INTERNAL_ERROR',

        message:
          'An internal inpatient error occurred',
      },
    });
}