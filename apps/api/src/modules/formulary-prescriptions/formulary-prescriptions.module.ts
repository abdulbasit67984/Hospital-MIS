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
  FormularyPrescriptionApplication,
} from './formulary-prescriptions.application.js';

import {
  createFormularyPrescriptionRouter,
} from './formulary-prescriptions.routes.js';

export interface CreateFormularyPrescriptionModuleOptions {
  application:
    FormularyPrescriptionApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export interface FormularyPrescriptionModule {
  application:
    FormularyPrescriptionApplication;

  router:
    Router;
}

export function createFormularyPrescriptionModule(
  options:
    CreateFormularyPrescriptionModuleOptions,
): FormularyPrescriptionModule {
  const router =
    createFormularyPrescriptionRouter({
      application:
        options.application,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,
    });

  return {
    application:
      options.application,

    router,
  };
}