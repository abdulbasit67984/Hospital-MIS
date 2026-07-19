import type {
  FastifyInstance,
} from 'fastify';

import {
  createLaboratoryApplication,
  type LaboratoryApplication,
  type LaboratoryApplicationDependencies,
} from './laboratory.application.js';

import {
  LaboratoryClinicalIntegration,
} from './laboratory-clinical.integration.js';

import {
  LaboratoryCompensationExecutor,
} from './laboratory-compensation.executor.js';

import {
  laboratoryOpenApi,
} from './laboratory.openapi.js';

import {
  laboratoryRoutes,
} from './laboratory.routes.js';

export interface RegisterLaboratoryModuleOptions {
  dependencies: LaboratoryApplicationDependencies;

  authenticate?: (
    request: unknown,
    reply: unknown,
  ) => Promise<void> | void;

  routePrefix?: string;
}

export interface RegisteredLaboratoryModule {
  application: LaboratoryApplication;
  clinicalIntegration: LaboratoryClinicalIntegration;
  compensationExecutor: LaboratoryCompensationExecutor;
}

export async function registerLaboratoryModule(
  fastify: FastifyInstance,
  options: RegisterLaboratoryModuleOptions,
): Promise<RegisteredLaboratoryModule> {
  const application =
    createLaboratoryApplication(
      options.dependencies,
    );

  const clinicalIntegration =
    new LaboratoryClinicalIntegration(
      application,
    );

  const compensationExecutor =
    new LaboratoryCompensationExecutor(
      options.dependencies.snapshotCrypto,
    );

  if (
    fastify.hasDecorator(
      'laboratory',
    )
  ) {
    throw new Error(
      'The Laboratory module has already been registered',
    );
  }

  fastify.decorate(
    'laboratory',
    application,
  );

  fastify.decorate(
    'laboratoryClinicalIntegration',
    clinicalIntegration,
  );

  fastify.decorate(
    'laboratoryCompensationExecutor',
    compensationExecutor,
  );

  await fastify.register(
    laboratoryRoutes,
    {
      prefix:
        options.routePrefix ??
        '/api/v1/laboratory',
      application,
      ...(options.authenticate === undefined
        ? {}
        : {
            authenticate: options.authenticate,
          }),
    },
  );

  return {
    application,
    clinicalIntegration,
    compensationExecutor,
  };
}

export const laboratoryModuleOpenApi =
  laboratoryOpenApi;