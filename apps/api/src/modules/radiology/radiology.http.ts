import type {
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import {
  ZodError,
  type ZodType,
} from 'zod';

import type {
  RadiologyActorContext,
} from './radiology.types.js';

export interface RadiologyAuthenticatedPrincipal {
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

export type RadiologyAuthenticatedRequest<
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> = FastifyRequest<{
  Params:
    TParams;

  Querystring:
    TQuery;

  Body:
    TBody;
}> & {
  user:
    RadiologyAuthenticatedPrincipal;
};

export function radiologyActorFromRequest(
  request:
    RadiologyAuthenticatedRequest,
): RadiologyActorContext {
  const correlationHeader =
    request.headers[
      'x-correlation-id'
    ];

  const correlationId =
    typeof correlationHeader ===
      'string' &&
    correlationHeader
      .trim()
      .length >
      0
      ? correlationHeader.trim()
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

    ...(
      request.ip.length ===
      0
        ? {}
        : {
            ipAddress:
              request.ip,
          }
    ),

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

export function requireRadiologyIdempotencyKey(
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
      ? header[
          0
        ]
      : header;

  if (
    value ===
      undefined ||
    value
      .trim()
      .length <
      8 ||
    value
      .trim()
      .length >
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

export function parseRadiologyInput<T>(
  schema:
    ZodType<T>,

  value:
    unknown,
): T {
  return schema.parse(
    value,
  );
}

export function radiologyHttpErrorHandler(
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
            'The Radiology request is invalid',

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

    const expose =
      candidate.expose ===
        true ||
      statusCode <
        500;

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
              : 'RADIOLOGY_INTERNAL_ERROR',

          message:
            expose &&
            typeof candidate.message ===
              'string'
              ? candidate.message
              : 'The Radiology operation could not be completed',
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
          'RADIOLOGY_INTERNAL_ERROR',

        message:
          'The Radiology operation could not be completed',
      },
    });
}