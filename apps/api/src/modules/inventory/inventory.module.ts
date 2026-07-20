import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  InventoryActorResolverPort,
} from '../../infrastructure/inventory-runtime.adapters.js';

import type {
  InventoryApplication,
} from './inventory.application.js';

import {
  createInventoryRouter,
} from './inventory.http.js';

export interface CreateInventoryModuleOptions {
  application: InventoryApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: InventoryActorResolverPort;
}

export function createInventoryModule(
  options: CreateInventoryModuleOptions,
) {
  return {
    router: createInventoryRouter(options),
    application: options.application,
  };
}

export type InventoryModule = ReturnType<
  typeof createInventoryModule
>;