import type {
  Router,
} from 'express';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PharmacyDispensingApplication,
} from './pharmacy-dispensing.application.js';

import type {
  PharmacyActorResolverPort,
} from './pharmacy-dispensing.ports.js';

import {
  createPharmacyDispensingRouter,
} from './pharmacy-dispensing.routes.js';

export interface CreatePharmacyDispensingModuleOptions {
  application: PharmacyDispensingApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: PharmacyActorResolverPort;
}

export interface PharmacyDispensingModule {
  application: PharmacyDispensingApplication;
  router: Router;
}

export function createPharmacyDispensingModule(
  options: CreatePharmacyDispensingModuleOptions,
): PharmacyDispensingModule {
  return {
    application: options.application,
    router: createPharmacyDispensingRouter(options),
  };
}