import type {
  Express,
} from 'express';

import swaggerUi from 'swagger-ui-express';

import {
  facilityOpenApi,
} from '../modules/facility/facility.openapi.js';

import {
  identityOpenApi,
} from '../modules/identity/identity.openapi.js';

import {
  patientOpenApi,
} from '../modules/patient/patient.openapi.js';

export const openApiDocument = {
  openapi:
    '3.1.0',

  info: {
    title:
      'Hospital MIS API',

    version:
      '0.1.0',

    description:
      'Hospital Management Information System API using MongoDB, centralized authorization, audit history, idempotency, encrypted configuration, optimistic concurrency, and application-level transaction compensation.',
  },

  servers: [
    {
      url:
        '/api/v1',
    },
  ],

  tags: [
    {
      name:
        'Authentication',

      description:
        'Sign-in, refresh-token rotation, sign-out, and session management.',
    },

    {
      name:
        'Operations',

      description:
        'Liveness and readiness endpoints.',
    },

    ...identityOpenApi.tags,
    ...facilityOpenApi.tags,
    ...patientOpenApi.tags,
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type:
          'http',

        scheme:
          'bearer',

        bearerFormat:
          'JWT',
      },

      refreshCookie: {
        type:
          'apiKey',

        in:
          'cookie',

        name:
          'hmis_refresh_token',
      },
    },

    schemas: {
      ApiError: {
        type:
          'object',

        required: [
          'success',
          'error',
        ],

        properties: {
          success: {
            type:
              'boolean',

            const:
              false,
          },

          error: {
            type:
              'object',

            required: [
              'code',
              'message',
              'correlationId',
            ],

            properties: {
              code: {
                type:
                  'string',

                example:
                  'FACILITY_CONCURRENCY_CONFLICT',
              },

              message: {
                type:
                  'string',

                example:
                  'The request could not be completed',
              },

              correlationId: {
                type:
                  'string',

                format:
                  'uuid',
              },

              retryable: {
                type:
                  'boolean',
              },

              details: {
                type:
                  'array',

                items: {
                  type:
                    'object',

                  required: [
                    'code',
                    'message',
                  ],

                  properties: {
                    code: {
                      type:
                        'string',
                    },

                    message: {
                      type:
                        'string',
                    },

                    path: {
                      type:
                        'string',
                    },
                  },
                },
              },
            },
          },
        },
      },

      LoginRequest: {
        type:
          'object',

        required: [
          'facilityId',
          'login',
          'password',
        ],

        properties: {
          facilityId: {
            type:
              'string',

            pattern:
              '^[a-fA-F0-9]{24}$',

            example:
              '507f191e810c19729de860ea',
          },

          login: {
            type:
              'string',

            example:
              'admin',
          },

          password: {
            type:
              'string',

            format:
              'password',
          },
        },
      },

      ...identityOpenApi
        .components
        .schemas,

      ...facilityOpenApi
        .components
        .schemas,

      ...patientOpenApi
        .components
        .schemas,
    },
  },

  paths: {
    '/auth/login': {
      post: {
        tags: [
          'Authentication',
        ],

        summary:
          'Sign in',

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/LoginRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Authentication successful',
          },

          '401': {
            description:
              'Invalid credentials or inactive facility',

            content: {
              'application/json': {
                schema: {
                  $ref:
                    '#/components/schemas/ApiError',
                },
              },
            },
          },
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: [
          'Authentication',
        ],

        summary:
          'Rotate the refresh token',

        security: [
          {
            refreshCookie:
              [],
          },
        ],

        responses: {
          '200': {
            description:
              'Token rotation completed',
          },

          '401': {
            description:
              'Refresh token, user, session, or facility is invalid or inactive',
          },
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: [
          'Authentication',
        ],

        summary:
          'Revoke the current session',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        responses: {
          '200': {
            description:
              'Current session revoked',
          },
        },
      },
    },

    '/auth/logout-all': {
      post: {
        tags: [
          'Authentication',
        ],

        summary:
          'Revoke all sessions for the authenticated user',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        responses: {
          '200': {
            description:
              'All active sessions revoked',
          },
        },
      },
    },

    '/health': {
      get: {
        tags: [
          'Operations',
        ],

        summary:
          'Liveness check',

        responses: {
          '200': {
            description:
              'API process is alive',
          },
        },
      },
    },

    '/ready': {
      get: {
        tags: [
          'Operations',
        ],

        summary:
          'Readiness check',

        responses: {
          '200': {
            description:
              'API and required dependencies are ready',
          },

          '503': {
            description:
              'A required dependency is unavailable',
          },
        },
      },
    },

    ...identityOpenApi.paths,
    ...facilityOpenApi.paths,
    ...patientOpenApi.paths,
  },
} as const;

export function registerOpenApi(
  application:
    Express,
): void {
  application.get(
    '/api/v1/openapi.json',

    (
      _request,
      response,
    ) => {
      response.json(
        openApiDocument,
      );
    },
  );

  application.use(
    '/api/docs',

    swaggerUi.serve,

    swaggerUi.setup(
      openApiDocument,
      {
        explorer:
          true,

        customSiteTitle:
          'Hospital MIS API',
      },
    ),
  );
}