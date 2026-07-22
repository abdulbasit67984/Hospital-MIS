import type { Router } from 'express';

import type { AuthenticationService } from '../auth/auth.service.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { WelfareZakatApplication } from './welfare-zakat.application.js';
import { createWelfareZakatRouter } from './welfare-zakat.routes.js';

export interface CreateWelfareZakatModuleOptions {
  application: WelfareZakatApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}

export interface WelfareZakatModule {
  application: WelfareZakatApplication;
  router: Router;
}

export function createWelfareZakatModule(
  options: CreateWelfareZakatModuleOptions,
): WelfareZakatModule {
  return {
    application: options.application,
    router: createWelfareZakatRouter(options),
  };
}