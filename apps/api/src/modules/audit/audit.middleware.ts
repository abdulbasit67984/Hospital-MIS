import type {
  Request,
  RequestHandler,
} from 'express';

import type {
  AuditService,
} from './audit.service.js';

import type {
  AuditSensitivity,
} from './audit.types.js';

export type HttpAuditOptions = {
  action: string;
  module: string;
  entityType: string;

  sensitivity:
    AuditSensitivity;

  resolveEntityId(
    request: Request,
  ): string;

  resolveReason?(
    request: Request,
  ): string | undefined;

  resolveMetadata?(
    request: Request,
  ): unknown;
};

export function auditHttpAccess(
  service:
    AuditService,

  options:
    HttpAuditOptions,
): RequestHandler {
  return (
    request,
    response,
    next,
  ) => {
    const entityId =
      options.resolveEntityId(
        request,
      );

    const reason =
      options.resolveReason?.(
        request,
      );

    const metadata =
      options.resolveMetadata?.(
        request,
      );

    response.once(
      'finish',
      () => {
        const outcome =
          response.statusCode >= 200 &&
          response.statusCode < 400
            ? 'SUCCESS'
            : response.statusCode ===
                401 ||
              response.statusCode === 403
              ? 'DENIED'
              : 'FAILURE';

        void service
          .recordFromContext({
            action:
              options.action,

            module:
              options.module,

            entityType:
              options.entityType,

            entityId,

            ...(reason === undefined
              ? {}
              : {
                  reason,
                }),

            metadata: {
              ...(metadata === undefined
                ? {}
                : {
                    request:
                      metadata,
                  }),

              responseStatusCode:
                response.statusCode,
            },

            outcome,

            sensitivity:
              options.sensitivity,

            requestSource:
              'API',

            requestMethod:
              request.method,

            requestPath:
              request.originalUrl,

            responseStatusCode:
              response.statusCode,

            ipAddress:
              request.ip,

            userAgent:
              request
                .header(
                  'user-agent',
                )
                ?.slice(
                  0,
                  1000,
                ),
          })
          .catch(
            (error: unknown) => {
              request.log.error(
                {
                  errorName:
                    error instanceof Error
                      ? error.name
                      : typeof error,

                  auditAction:
                    options.action,

                  auditEntityType:
                    options.entityType,

                  auditEntityId:
                    entityId,
                },

                'Asynchronous HTTP access audit failed',
              );
            },
          );
      },
    );

    next();
  };
}