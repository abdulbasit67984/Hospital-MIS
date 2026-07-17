import {
  Router,
} from 'express';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  GuardianController,
} from './controllers/guardian.controller.js';

import type {
  PatientApplication,
} from './patient.application.js';

import {
  PATIENT_PERMISSION_KEYS,
} from './patient.constants.js';

import {
  requireSensitivePatientReadWhenRequested,
} from './patient.http-helpers.js';

import {
  guardianPathParamsSchema,
  patientMutationHeadersSchema,
  patientReadHeadersSchema,
} from './patient.http.validation.js';

import {
  guardianProfileQuerySchema,
  guardianSearchQuerySchema,
} from './patient.query.validation.js';

import {
  updateGuardianBodySchema,
} from './patient.validation.js';

export interface CreateGuardianRouterOptions {
  application:
    PatientApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createGuardianRouter(
  options:
    CreateGuardianRouterOptions,
): Router {
  const router =
    Router();

  const controller =
    new GuardianController(
      options.application,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/',

    validateRequest({
      headers:
        patientReadHeadersSchema,

      query:
        guardianSearchQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_READ,
    ),

    requireSensitivePatientReadWhenRequested(
      options.authorizationService,
    ),

    controller.search,
  );

  router.get(
    '/:guardianId',

    validateRequest({
      headers:
        patientReadHeadersSchema,

      params:
        guardianPathParamsSchema,

      query:
        guardianProfileQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_READ,
    ),

    requireSensitivePatientReadWhenRequested(
      options.authorizationService,
    ),

    controller.getProfile,
  );

  router.patch(
    '/:guardianId',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        guardianPathParamsSchema,

      body:
        updateGuardianBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_MANAGE,
    ),

    controller.update,
  );

  return router;
}