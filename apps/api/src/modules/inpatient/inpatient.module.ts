import type {
  FastifyInstance,
  preHandlerHookHandler,
} from 'fastify';

import {
  createInpatientApplication,
  type InpatientApplication,
  type InpatientApplicationDependencies,
} from './inpatient.application.js';

import {
  inpatientOpenApi,
} from './inpatient.openapi.js';

import {
  inpatientRoutes,
} from './inpatient.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    inpatient:
      InpatientApplication;
  }
}

export interface RegisterInpatientModuleOptions {
  dependencies:
    InpatientApplicationDependencies;

  authenticate?:
    preHandlerHookHandler;

  routePrefix?:
    string;
}

export async function registerInpatientModule(
  fastify:
    FastifyInstance,

  options:
    RegisterInpatientModuleOptions,
): Promise<InpatientApplication> {
  if (
    fastify.hasDecorator(
      'inpatient',
    )
  ) {
    throw new Error(
      'The inpatient module has already been registered',
    );
  }

  const application =
    createInpatientApplication(
      options.dependencies,
    );

  fastify.decorate(
    'inpatient',
    application,
  );

  await fastify.register(
    inpatientRoutes,

    {
      prefix:
        options.routePrefix ??
        '/api/v1/inpatient',

      application,

      ...(
        options.authenticate ===
        undefined
          ? {}
          : {
              authenticate:
                options.authenticate,
            }
      ),
    },
  );

  return application;
}

export const inpatientModuleOpenApi =
  inpatientOpenApi;