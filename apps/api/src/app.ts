import cors from 'cors';
import express, {
  type Express,
  type Request,
} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import type { ApiConfig } from '@hospital-mis/config';

import {
  ForbiddenError,
  createApiFailure,
  createApiSuccess,
  createLogger,
} from '@hospital-mis/shared';

import type { ReadinessResult } from './infrastructure/readiness.js';
import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';

export type ApplicationDependencies = {
  config: ApiConfig;

  readinessProbe:
    () => Promise<ReadinessResult>;

  registerRoutes?:
    (app: Express) => void;
};

export function createApp({
  config,
  readinessProbe,
  registerRoutes,
}: ApplicationDependencies): Express {
  const app = express();

  const logger = createLogger(
    'hospital-mis-api',
    config.logLevel,
  );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(correlationIdMiddleware);

  app.use(
    pinoHttp({
      logger,

      customProps: (request) => ({
        correlationId:
          (request as Request).correlationId,
      }),
    }),
  );

  app.use(
    helmet(),
  );

  app.use(
    cors({
      credentials: true,

      origin(
        origin,
        callback,
      ) {
        if (
          origin === undefined ||
          config.corsOrigins.includes(origin)
        ) {
          callback(
            null,
            true,
          );
          return;
        }

        callback(
          new ForbiddenError(
            'Origin is not allowed by CORS policy',
          ),
        );
      },
    }),
  );

  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,

      handler(
        request,
        response,
      ) {
        response
          .status(429)
          .json(
            createApiFailure({
              code: 'RATE_LIMIT_EXCEEDED',

              message:
                'Too many requests. Please try again later',

              correlationId:
                request.correlationId,
            }),
          );
      },
    }),
  );

  app.get(
    '/api/v1/health',
    (
      request,
      response,
    ) => {
      response
        .status(200)
        .json(
          createApiSuccess(
            {
              service:
                'hospital-mis-api',

              status: 'ok' as const,

              timestamp:
                new Date().toISOString(),

              uptimeSeconds:
                Math.floor(
                  process.uptime(),
                ),
            },

            request.correlationId,
          ),
        );
    },
  );

  app.get(
    '/api/v1/ready',
    async (
      request,
      response,
      next,
    ) => {
      try {
        const readiness =
          await readinessProbe();

        response
          .status(
            readiness.status === 'ready'
              ? 200
              : 503,
          )
          .json(
            createApiSuccess(
              readiness,
              request.correlationId,
            ),
          );
      } catch (error) {
        next(error);
      }
    },
  );

  registerRoutes?.(app);

  app.use(notFoundHandler);
  app.use(createErrorHandler(config));

  return app;
}