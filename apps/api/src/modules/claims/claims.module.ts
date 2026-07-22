import type { Router } from 'express';

import type { AuthenticationService } from '../auth/auth.service.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { ClaimsApplication } from './claims.application.js';
import { createClaimsRouter } from './claims.routes.js';

export interface CreateClaimsModuleOptions {
  application: ClaimsApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}

export interface ClaimsModule {
  application: ClaimsApplication;
  router: Router;
}

export function createClaimsModule(
  options: CreateClaimsModuleOptions,
): ClaimsModule {
  return {
    application: options.application,
    router: createClaimsRouter(options),
  };
}