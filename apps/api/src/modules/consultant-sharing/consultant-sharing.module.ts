import type { Router } from 'express';

import type { AuthenticationService } from '../auth/auth.service.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { ConsultantSharingApplication } from './consultant-sharing.application.js';
import type { ConsultantSharingActorIdentityResolver } from './consultant-sharing.http-contracts.js';
import { createConsultantSharingRouter } from './consultant-sharing.routes.js';

export interface CreateConsultantSharingModuleOptions {
  application: ConsultantSharingApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorIdentityResolver: ConsultantSharingActorIdentityResolver;
}

export interface ConsultantSharingModule {
  application: ConsultantSharingApplication;
  router: Router;
}

export function createConsultantSharingModule(
  options: CreateConsultantSharingModuleOptions,
): ConsultantSharingModule {
  return {
    application: options.application,
    router: createConsultantSharingRouter(options),
  };
}