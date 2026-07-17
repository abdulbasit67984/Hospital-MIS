import {
  Router,
  type RequestHandler,
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
  PatientCommandController,
} from './controllers/patient-command.controller.js';

import {
  PatientQueryController,
} from './controllers/patient-query.controller.js';

import type {
  PatientApplication,
} from './patient.application.js';

import {
  PATIENT_PERMISSION_KEYS,
} from './patient.constants.js';

import {
  requirePatientPrincipal,
  requireSensitivePatientReadWhenRequested,
  validatedPatientPart,
} from './patient.http-helpers.js';

import {
  addPatientIdentifierBodySchema,
  patientAddressPathParamsSchema,
  patientAlertPathParamsSchema,
  patientContactPathParamsSchema,
  patientGuardianRelationshipPathParamsSchema,
  patientIdentifierPathParamsSchema,
  patientMergePathParamsSchema,
  patientMutationHeadersSchema,
  patientPathParamsSchema,
  patientReadHeadersSchema,
  revokePatientIdentifierBodySchema,
  verifyPatientGuardianBodySchema,
  verifyPatientIdentifierBodySchema,
} from './patient.http.validation.js';

import {
  mergePatientsBodySchema,
  resolveDuplicateReviewBodySchema,
} from './patient.merge.js';

import {
  addPatientAddressBodySchema,
  addPatientContactBodySchema,
  createPatientAlertBodySchema,
  deactivatePatientAddressBodySchema,
  deactivatePatientContactBodySchema,
  endPatientGuardianBodySchema,
  resolvePatientAlertBodySchema,
  updatePatientAddressBodySchema,
  updatePatientContactBodySchema,
  verifyPatientContactBodySchema,
} from './patient-profile.validation.js';

import {
  patientProfileQuerySchema,
  patientRegistrationSlipQuerySchema,
  patientSearchQuerySchema,
} from './patient.query.validation.js';

import {
  linkGuardianBodySchema,
  patientDuplicateCheckBodySchema,
  registerPatientBodySchema,
  updatePatientBodySchema,
  type RegisterPatientBody,
} from './patient.validation.js';

function requireGuardianManagementForRegistration(
  authorization:
    AuthorizationService,
): RequestHandler {
  return async (
    request,
    _response,
    next,
  ) => {
    try {
      const body =
        validatedPatientPart<
          RegisterPatientBody
        >(
          request,
          'body',
        );

      if (
        body.isMinor ||
        body.guardian !==
          undefined ||
        body.guardianRelationship !==
          undefined
      ) {
        await authorization
          .assertPermission(
            requirePatientPrincipal(
              request,
            ),

            PATIENT_PERMISSION_KEYS
              .GUARDIAN_MANAGE,
          );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export interface CreatePatientRouterOptions {
  application:
    PatientApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createPatientRouter(
  options:
    CreatePatientRouterOptions,
): Router {
  const router =
    Router();

  const queryController =
    new PatientQueryController(
      options.application,
    );

  const commandController =
    new PatientCommandController(
      options.application,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/search',

    validateRequest({
      headers:
        patientReadHeadersSchema,

      query:
        patientSearchQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.READ,
    ),

    requireSensitivePatientReadWhenRequested(
      options.authorizationService,
    ),

    queryController.search,
  );

  router.post(
    '/duplicate-check',

    validateRequest({
      body:
        patientDuplicateCheckBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.CREATE,
    ),

    queryController.duplicateCheck,
  );

  router.get(
    '/merges/:mergeId',

    validateRequest({
      params:
        patientMergePathParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.MERGE,
    ),

    queryController.getMerge,
  );

  router.post(
    '/identifiers/:identifierId/verify',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientIdentifierPathParamsSchema,

      body:
        verifyPatientIdentifierBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.verifyIdentifier,
  );

  router.post(
    '/identifiers/:identifierId/revoke',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientIdentifierPathParamsSchema,

      body:
        revokePatientIdentifierBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.revokeIdentifier,
  );

  router.post(
    '/guardian-relationships/:relationshipId/verify',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientGuardianRelationshipPathParamsSchema,

      body:
        verifyPatientGuardianBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_MANAGE,
    ),

    commandController.verifyGuardianRelationship,
  );

  router.post(
    '/guardian-relationships/:relationshipId/end',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientGuardianRelationshipPathParamsSchema,

      body:
        endPatientGuardianBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_MANAGE,
    ),

    commandController.endGuardianRelationship,
  );

  router.patch(
    '/contacts/:contactId',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientContactPathParamsSchema,

      body:
        updatePatientContactBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.updateContact,
  );

  router.post(
    '/contacts/:contactId/verify',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientContactPathParamsSchema,

      body:
        verifyPatientContactBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.verifyContact,
  );

  router.post(
    '/contacts/:contactId/deactivate',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientContactPathParamsSchema,

      body:
        deactivatePatientContactBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.deactivateContact,
  );

  router.patch(
    '/addresses/:addressId',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientAddressPathParamsSchema,

      body:
        updatePatientAddressBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.updateAddress,
  );

  router.post(
    '/addresses/:addressId/deactivate',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientAddressPathParamsSchema,

      body:
        deactivatePatientAddressBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.deactivateAddress,
  );

  router.post(
    '/alerts/:alertId/resolve',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientAlertPathParamsSchema,

      body:
        resolvePatientAlertBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.resolveAlert,
  );

  router.post(
    '/',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      body:
        registerPatientBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.CREATE,
    ),

    requireGuardianManagementForRegistration(
      options.authorizationService,
    ),

    commandController.register,
  );

  router.get(
    '/:patientId/canonical',

    validateRequest({
      params:
        patientPathParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.READ,
    ),

    queryController.resolveCanonical,
  );

  router.get(
    '/:patientId/registration-slip',

    validateRequest({
      params:
        patientPathParamsSchema,

      query:
        patientRegistrationSlipQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.READ,
    ),

    queryController.registrationSlip,
  );

  router.get(
    '/:patientId',

    validateRequest({
      headers:
        patientReadHeadersSchema,

      params:
        patientPathParamsSchema,

      query:
        patientProfileQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.READ,
    ),

    requireSensitivePatientReadWhenRequested(
      options.authorizationService,
    ),

    queryController.getProfile,
  );

  router.patch(
    '/:patientId',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        updatePatientBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.update,
  );

  router.post(
    '/:patientId/identifiers',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        addPatientIdentifierBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.addIdentifier,
  );

  router.post(
    '/:patientId/guardians',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        linkGuardianBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.GUARDIAN_MANAGE,
    ),

    commandController.linkGuardian,
  );

  router.post(
    '/:patientId/contacts',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        addPatientContactBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.addContact,
  );

  router.post(
    '/:patientId/addresses',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        addPatientAddressBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.addAddress,
  );

  router.post(
    '/:patientId/alerts',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        createPatientAlertBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.UPDATE,
    ),

    commandController.createAlert,
  );

  router.post(
    '/:patientId/duplicate-review',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        resolveDuplicateReviewBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.MERGE,
    ),

    commandController.resolveDuplicateReview,
  );

  router.post(
    '/:patientId/merge',

    validateRequest({
      headers:
        patientMutationHeadersSchema,

      params:
        patientPathParamsSchema,

      body:
        mergePatientsBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      PATIENT_PERMISSION_KEYS.MERGE,
    ),

    commandController.merge,
  );

  return router;
}