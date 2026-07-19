import type {
  LaboratoryApplication,
} from './laboratory.application.js';

import type {
  LaboratoryClinicalIntegration,
} from './laboratory-clinical.integration.js';

import type {
  LaboratoryCompensationExecutor,
} from './laboratory-compensation.executor.js';

import type {
  LaboratoryAuthenticatedPrincipal,
} from './laboratory.http.js';

declare module 'fastify' {
  interface FastifyInstance {
    laboratory: LaboratoryApplication;

    laboratoryClinicalIntegration:
      LaboratoryClinicalIntegration;

    laboratoryCompensationExecutor:
      LaboratoryCompensationExecutor;
  }

  interface FastifyRequest {
    user: LaboratoryAuthenticatedPrincipal;
  }
}

export {};