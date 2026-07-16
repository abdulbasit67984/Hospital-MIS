import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  IdentityApplication,
} from './identity.application.js';

import {
  createIdentityRouter,
} from './identity.routes.js';

export interface CreateIdentityModuleOptions {
  application:
    IdentityApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createIdentityModule(
  options:
    CreateIdentityModuleOptions,
) {
  const router =
    createIdentityRouter({
      application:
        options.application,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,
    });

  return {
    ...options.application,
    router,
  };
}

export * from './identity.application.js';
export * from './identity.constants.js';
export * from './identity.errors.js';
export * from './identity.openapi.js';
export * from './identity.policy.js';
export * from './identity.routes.js';
export * from './identity.types.js';
export * from './identity.validation.js';

export * from './infrastructure/identity-compensation.executor.js';
export * from './infrastructure/identity-infrastructure.js';
export * from './infrastructure/identity-runtime.adapters.js';
export * from './infrastructure/identity-transaction-manager.adapter.js';