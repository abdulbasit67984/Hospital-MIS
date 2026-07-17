import type {
  createFacilityInfrastructure,
} from '../../infrastructure/facility-infrastructure.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  createConfigurationRouter,
} from './configuration.routes.js';

import {
  createFacilityRecordPolicies,
} from './facility.policy.js';

import {
  createFacilityRouter,
} from './facility.routes.js';

export interface CreateFacilityModuleOptions {
  infrastructure:
    ReturnType<
      typeof createFacilityInfrastructure
    >;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createFacilityModule(
  options:
    CreateFacilityModuleOptions,
) {
  const policies =
    createFacilityRecordPolicies(
      options.authorizationService,
    );

  const router =
    createFacilityRouter({
      application:
        options.infrastructure
          .application,

      lifecycleService:
        options.infrastructure
          .lifecycleService,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,

      policies,
    });

  const configurationRouter =
    createConfigurationRouter({
      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,

      definitionService:
        options.infrastructure
          .application
          .settingDefinitionService,

      definitionMutationService:
        options.infrastructure
          .application
          .settingDefinitionMutationService,

      settingService:
        options.infrastructure
          .application
          .systemSettingService,
    });

  return {
    ...options.infrastructure
      .application,

    lifecycleService:
      options.infrastructure
        .lifecycleService,

    policies,
    router,
    configurationRouter,
  };
}

export * from './configuration.controller.js';
export * from './configuration.routes.js';
export * from './facility.application.js';
export * from './facility.constants.js';
export * from './facility.errors.js';
export * from './facility.http-helpers.js';
export * from './facility.lifecycle.service.js';
export * from './facility.openapi.js';
export * from './facility.policy.js';
export * from './facility.ports.js';
export * from './facility.routes.js';
export * from './facility.seed.js';
export * from './facility.setting-value.js';
export * from './facility.transaction.constants.js';
export * from './facility.types.js';
export * from './facility.validation.js';