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

import type {
  RegistrationQueueApplication,
} from './registration-queue.application.js';

import {
  REGISTRATION_QUEUE_PERMISSION_KEYS,
} from './registration-queue.constants.js';

import {
  RegistrationQueueCommandController,
} from './controllers/registration-queue-command.controller.js';

import {
  RegistrationQueueQueryController,
} from './controllers/registration-queue-query.controller.js';

import {
  registrationQueueMutationHeadersSchema,
} from './registration-queue.http.validation.js';

import {
  opdVisitNumberParamsSchema,
  registrationNumberParamsSchema,
  registrationQueueConfigurationQuerySchema,
  registrationQueueDashboardQuerySchema,
  registrationQueueHistoryQuerySchema,
  registrationQueuePublicDisplayQuerySchema,
} from './registration-queue.query.validation.js';

import {
  cancelOpdVisitBodySchema,
  cancelRegistrationBodySchema,
  changeQueueStatusBodySchema,
  correctOpdVisitBodySchema,
  markOpdVisitNoShowBodySchema,
  opdVisitIdParamsSchema,
  opdVisitListQuerySchema,
  queueEntryIdParamsSchema,
  queueEntryListQuerySchema,
  registerOpdVisitBodySchema,
  registrationIdParamsSchema,
  registrationListQuerySchema,
  transferQueueEntryBodySchema,
  updateQueueAssignmentBodySchema,
  updateQueuePriorityBodySchema,
} from './registration-queue.validation.js';

export interface CreateRegistrationQueueRouterOptions {
  application:
    RegistrationQueueApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createRegistrationQueueRouter(
  options:
    CreateRegistrationQueueRouterOptions,
): Router {
  const router =
    Router();

  const commandController =
    new RegistrationQueueCommandController(
      options.application,
    );

  const queryController =
    new RegistrationQueueQueryController(
      options.application,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/registrations',

    validateRequest({
      query:
        registrationListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.listRegistrations,
  );

  router.post(
    '/registrations',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      body:
        registerOpdVisitBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_CREATE,
    ),

    commandController.registerOpdVisit,
  );

  router.get(
    '/registrations/by-number/:registrationNumber',

    validateRequest({
      params:
        registrationNumberParamsSchema,

      query:
        registrationQueueHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.getRegistrationByNumber,
  );

  router.get(
    '/registrations/:registrationId',

    validateRequest({
      params:
        registrationIdParamsSchema,

      query:
        registrationQueueHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.getRegistrationById,
  );

  router.post(
    '/registrations/:registrationId/cancel',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        registrationIdParamsSchema,

      body:
        cancelRegistrationBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_CREATE,
    ),

    commandController.cancelRegistration,
  );

  router.get(
    '/visits',

    validateRequest({
      query:
        opdVisitListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.listVisits,
  );

  router.get(
    '/visits/by-number/:visitNumber',

    validateRequest({
      params:
        opdVisitNumberParamsSchema,

      query:
        registrationQueueHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.getVisitByNumber,
  );

  router.get(
    '/visits/:visitId',

    validateRequest({
      params:
        opdVisitIdParamsSchema,

      query:
        registrationQueueHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.getVisitById,
  );

  router.post(
    '/visits/:visitId/cancel',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        opdVisitIdParamsSchema,

      body:
        cancelOpdVisitBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_CREATE,
    ),

    commandController.cancelOpdVisit,
  );

  router.post(
    '/visits/:visitId/no-show',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        opdVisitIdParamsSchema,

      body:
        markOpdVisitNoShowBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_MANAGE,
    ),

    commandController.markOpdVisitNoShow,
  );

  router.post(
    '/visits/:visitId/correct',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        opdVisitIdParamsSchema,

      body:
        correctOpdVisitBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_CREATE,
    ),

    commandController.correctOpdVisit,
  );

  router.get(
    '/queue-entries',

    validateRequest({
      query:
        queueEntryListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_READ,
    ),

    queryController.listQueueEntries,
  );

  router.get(
    '/queue-entries/:queueEntryId',

    validateRequest({
      params:
        queueEntryIdParamsSchema,

      query:
        registrationQueueHistoryQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_READ,
    ),

    queryController.getQueueEntry,
  );

  router.post(
    '/queue-entries/:queueEntryId/status',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        queueEntryIdParamsSchema,

      body:
        changeQueueStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_MANAGE,
    ),

    commandController.changeQueueStatus,
  );

  router.patch(
    '/queue-entries/:queueEntryId/assignment',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        queueEntryIdParamsSchema,

      body:
        updateQueueAssignmentBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_MANAGE,
    ),

    commandController.updateQueueAssignment,
  );

  router.patch(
    '/queue-entries/:queueEntryId/priority',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        queueEntryIdParamsSchema,

      body:
        updateQueuePriorityBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_PRIORITY,
    ),

    commandController.updateQueuePriority,
  );

  router.post(
    '/queue-entries/:queueEntryId/transfer',

    validateRequest({
      headers:
        registrationQueueMutationHeadersSchema,

      params:
        queueEntryIdParamsSchema,

      body:
        transferQueueEntryBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_TRANSFER,
    ),

    commandController.transferQueueEntry,
  );

  router.get(
    '/dashboard',

    validateRequest({
      query:
        registrationQueueDashboardQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_READ,
    ),

    queryController.dashboard,
  );

  router.get(
    '/configuration',

    validateRequest({
      query:
        registrationQueueConfigurationQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .REGISTRATION_READ,
    ),

    queryController.configuration,
  );

  router.get(
    '/public-display',

    validateRequest({
      query:
        registrationQueuePublicDisplayQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      REGISTRATION_QUEUE_PERMISSION_KEYS
        .QUEUE_PUBLIC_DISPLAY,
    ),

    queryController.publicDisplay,
  );

  return router;
}