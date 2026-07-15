import {
  Router,
} from 'express';

import type {
  ApiConfig,
} from '@hospital-mis/config';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  AuthenticationController,
} from './auth.controller.js';

import type {
  AuthenticationService,
} from './auth.service.js';

import {
  loginRequestSchema,
  revokeSessionParamsSchema,
} from './auth.validation.js';

export function createAuthenticationRouter(
  input: {
    service:
      AuthenticationService;

    apiConfig:
      ApiConfig;
  },
): Router {
  const router =
    Router();

  const controller =
    new AuthenticationController(
      input.service,
      input.apiConfig,
    );

  const requireAuthentication =
    authenticate(
      input.service,
    );

  router.post(
    '/login',

    validateRequest({
      body:
        loginRequestSchema,
    }),

    controller.login,
  );

  router.post(
    '/refresh',
    controller.refresh,
  );

  router.post(
    '/logout',
    requireAuthentication,
    controller.logout,
  );

  router.post(
    '/logout-all',
    requireAuthentication,
    controller.logoutAll,
  );

  router.get(
    '/sessions',
    requireAuthentication,
    controller.listSessions,
  );

  router.delete(
    '/sessions/:sessionId',

    requireAuthentication,

    validateRequest({
      params:
        revokeSessionParamsSchema,
    }),

    controller.revokeSession,
  );

  return router;
}