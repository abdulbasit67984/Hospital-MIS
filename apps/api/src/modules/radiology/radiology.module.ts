import type {
  FastifyInstance,
} from 'fastify';

import {
  createRadiologyApplication,
  type RadiologyApplication,
  type RadiologyApplicationDependencies,
} from './radiology.application.js';

import type {
  RadiologyClinicalIntegration,
} from './radiology-clinical.integration.js';

import {
  RadiologyCompensationExecutor,
} from './radiology-compensation.executor.js';

import {
  radiologyOpenApi,
} from './radiology.openapi.js';

import {
  radiologyRoutes,
} from './radiology.routes.js';

import type {
  RadiologyReconciliationService,
  RadiologyRecoveryService,
} from '../../infrastructure/radiology-recovery-reconciliation.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    radiology:
      RadiologyApplication;

    radiologyClinicalIntegration:
      RadiologyClinicalIntegration;

    radiologyCompensationExecutor:
      RadiologyCompensationExecutor;

    radiologyRecovery:
      RadiologyRecoveryService | null;

    radiologyReconciliation:
      RadiologyReconciliationService | null;
  }
}

export interface RadiologyRecoveryRegistrar {
  register(
    name:
      'radiology',

    recovery:
      RadiologyRecoveryService,
  ): void;
}

export interface RadiologyReconciliationRegistrar {
  register(
    name:
      'radiology',

    reconciliation:
      RadiologyReconciliationService,
  ): void;
}

export interface RegisterRadiologyModuleOptions {
  dependencies:
    RadiologyApplicationDependencies;

  authenticate?:
    (
      request:
        unknown,

      reply:
        unknown,
    ) => Promise<void> | void;

  routePrefix?:
    string;

  recovery?:
    RadiologyRecoveryService;

  recoveryRegistrar?:
    RadiologyRecoveryRegistrar;

  reconciliation?:
    RadiologyReconciliationService;

  reconciliationRegistrar?:
    RadiologyReconciliationRegistrar;
}

export interface RegisteredRadiologyModule {
  application:
    RadiologyApplication;

  clinicalIntegration:
    RadiologyClinicalIntegration;

  compensationExecutor:
    RadiologyCompensationExecutor;

  recovery:
    RadiologyRecoveryService | null;

  reconciliation:
    RadiologyReconciliationService | null;
}

export async function registerRadiologyModule(
  fastify:
    FastifyInstance,

  options:
    RegisterRadiologyModuleOptions,
): Promise<
  RegisteredRadiologyModule
> {
  const application =
    createRadiologyApplication(
      options.dependencies,
    );

  const clinicalIntegration =
    application.clinicalIntegration;

  const compensationExecutor =
    new RadiologyCompensationExecutor(
      options.dependencies.snapshotCrypto,
    );

  const recovery =
    options.recovery ??
    null;

  const reconciliation =
    options.reconciliation ??
    null;

  if (
    fastify.hasDecorator(
      'radiology',
    )
  ) {
    throw new Error(
      'The Radiology module has already been registered',
    );
  }

  fastify.decorate(
    'radiology',
    application,
  );

  fastify.decorate(
    'radiologyClinicalIntegration',
    clinicalIntegration,
  );

  fastify.decorate(
    'radiologyCompensationExecutor',
    compensationExecutor,
  );

  fastify.decorate(
    'radiologyRecovery',
    recovery,
  );

  fastify.decorate(
    'radiologyReconciliation',
    reconciliation,
  );

  if (
    recovery !==
    null
  ) {
    options.recoveryRegistrar?.register(
      'radiology',
      recovery,
    );
  }

  if (
    reconciliation !==
    null
  ) {
    options.reconciliationRegistrar?.register(
      'radiology',
      reconciliation,
    );
  }

  await fastify.register(
    radiologyRoutes,
    {
      prefix:
        options.routePrefix ??
        '/api/v1/radiology',

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

  return {
    application,
    clinicalIntegration,
    compensationExecutor,
    recovery,
    reconciliation,
  };
}

export const radiologyModuleOpenApi =
  radiologyOpenApi;