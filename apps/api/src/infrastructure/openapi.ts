import type {
  Express,
} from 'express';

import swaggerUi from 'swagger-ui-express';

export const openApiDocument = {
  openapi:
    '3.1.0',

  info: {
    title:
      'Hospital MIS API',

    version:
      '0.1.0',

    description:
      'Pure MERN Hospital Management Information System API using standalone MongoDB and application-level transaction compensation.',
  },

  servers: [
    {
      url:
        '/api/v1',
    },
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
              },

              message: {
                type:
                  'string',
              },

              correlationId: {
                type:
                  'string',

                format:
                  'uuid',
              },

              details: {
                type:
                  'array',

                items: {
                  type:
                    'object',
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
              'Invalid credentials',

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
              'Refresh token invalid, expired, reused, or revoked',
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
              'API and MongoDB are ready',
          },

          '503': {
            description:
              'A required dependency is unavailable',
          },
        },
      },
    },
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