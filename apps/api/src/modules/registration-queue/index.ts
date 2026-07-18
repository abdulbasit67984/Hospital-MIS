import type {
  createRegistrationQueueInfrastructure,
} from '../../infrastructure/registration-queue-infrastructure.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  createRegistrationQueueRouter,
} from './registration-queue.routes.js';

export interface CreateRegistrationQueueModuleOptions {
  infrastructure:
    ReturnType<
      typeof createRegistrationQueueInfrastructure
    >;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createRegistrationQueueModule(
  options:
    CreateRegistrationQueueModuleOptions,
) {
  const router =
    createRegistrationQueueRouter({
      application:
        options.infrastructure.application,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,
    });

  return {
    ...options.infrastructure,
    router,
  };
}

export * from './controllers/registration-queue-command.controller.js';
export * from './controllers/registration-queue-query.controller.js';

export * from './queue-workflow.mapper.js';
export * from './registration-queue.application.js';
export * from './registration-queue.constants.js';
export * from './registration-queue.errors.js';
export * from './registration-queue.http-helpers.js';
export * from './registration-queue.http.validation.js';
export * from './registration-queue.mapper.js';
export * from './registration-queue.mutation-snapshots.js';
export * from './registration-queue.normalization.js';
export * from './registration-queue.persistence-errors.js';
export * from './registration-queue.ports.js';
export * from './registration-queue.projections.js';
export * from './registration-queue.query.types.js';
export * from './registration-queue.query.validation.js';
export * from './registration-queue.routes.js';
export * from './registration-queue.transaction.constants.js';
export * from './registration-queue.types.js';
export * from './registration-queue.validation.js';
export * from './registration-queue.workflow-helpers.js';
export * from './registration-visit-lifecycle.mapper.js';

export * from './repositories/opd-visit-lifecycle.repository.js';
export * from './repositories/opd-visit-queue-mutation.repository.js';
export * from './repositories/opd-visit.repository.js';
export * from './repositories/queue-status-history.repository.js';
export * from './repositories/queue-token-mutation.repository.js';
export * from './repositories/queue-token.repository.js';
export * from './repositories/queue-transfer.repository.js';
export * from './repositories/registration-context.repository.js';
export * from './repositories/registration-queue-read.repository.js';
export * from './repositories/registration.repository.js';

export * from './services/queue-mutation-context.service.js';
export * from './services/queue-public-display.service.js';
export * from './services/queue-wait-estimate.service.js';
export * from './services/registration-context.service.js';
export * from './services/registration-patient-resolution.service.js';
export * from './services/registration-queue-number.service.js';
export * from './services/registration-queue-query.service.js';

export * from './workflows/cancel-opd-visit.workflow.js';
export * from './workflows/cancel-registration.workflow.js';
export * from './workflows/change-queue-status.workflow.js';
export * from './workflows/correct-opd-visit.workflow.js';
export * from './workflows/mark-opd-visit-no-show.workflow.js';
export * from './workflows/register-opd-visit.workflow.js';
export * from './workflows/transfer-queue-entry.workflow.js';
export * from './workflows/update-queue-assignment.workflow.js';
export * from './workflows/update-queue-priority.workflow.js';