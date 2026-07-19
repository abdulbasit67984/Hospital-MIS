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
  FormularyPrescriptionApplication,
} from './formulary-prescriptions.application.js';

import {
  FORMULARY_PRESCRIPTION_PERMISSION_KEYS,
} from './formulary-prescriptions.constants.js';

import {
  FormularyPrescriptionController,
} from './formulary-prescriptions.controller.js';

import {
  acknowledgePrescriptionWarningBodySchema,
  cancelPrescriptionBodySchema,
  changeFormularyItemStatusBodySchema,
  createFormularyItemBodySchema,
  createPrescriptionDraftBodySchema,
  formularyPrescriptionEntityParamsSchema,
  formularyPrescriptionMutationHeadersSchema,
  formularyPrescriptionReadHeadersSchema,
  formularySearchQuerySchema,
  issuePrescriptionBodySchema,
  prescriptionListQuerySchema,
  printPrescriptionBodySchema,
  replacePrescriptionBodySchema,
  updateFormularyItemBodySchema,
  updatePrescriptionDraftBodySchema,
} from './formulary-prescriptions.validation.js';

const mutationHeadersSchema =
  formularyPrescriptionMutationHeadersSchema
    .passthrough();

const readHeadersSchema =
  formularyPrescriptionReadHeadersSchema
    .passthrough();

const formularyItemParamsSchema =
  formularyPrescriptionEntityParamsSchema
    .pick({
      formularyItemId:
        true,
    })
    .required()
    .strict();

const prescriptionParamsSchema =
  formularyPrescriptionEntityParamsSchema
    .pick({
      prescriptionId:
        true,
    })
    .required()
    .strict();

const patientParamsSchema =
  formularyPrescriptionEntityParamsSchema
    .pick({
      patientId:
        true,
    })
    .required()
    .strict();

const prescriptionWarningParamsSchema =
  formularyPrescriptionEntityParamsSchema
    .pick({
      prescriptionId:
        true,

      warningId:
        true,
    })
    .required()
    .strict();

const formularyItemReadQuerySchema =
  formularySearchQuerySchema
    .pick({
      includeStock:
        true,
    })
    .strict();

const prescriptionReadQuerySchema =
  prescriptionListQuerySchema
    .pick({
      includeItems:
        true,

      includeWarnings:
        true,
    })
    .strict();

export interface CreateFormularyPrescriptionRouterOptions {
  application:
    FormularyPrescriptionApplication;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createFormularyPrescriptionRouter(
  options:
    CreateFormularyPrescriptionRouterOptions,
): Router {
  const router =
    Router();

  const controller =
    new FormularyPrescriptionController(
      options.application,
      options.authorizationService,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  router.get(
    '/formulary',

    validateRequest({
      headers:
        readHeadersSchema,

      query:
        formularySearchQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .FORMULARY_READ,
    ),

    controller.searchFormulary,
  );

  router.get(
    '/formulary/:formularyItemId',

    validateRequest({
      headers:
        readHeadersSchema,

      params:
        formularyItemParamsSchema,

      query:
        formularyItemReadQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .FORMULARY_READ,
    ),

    controller.getFormularyItem,
  );

  router.post(
    '/formulary',

    validateRequest({
      headers:
        mutationHeadersSchema,

      body:
        createFormularyItemBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .FORMULARY_MANAGE,
    ),

    controller.createFormularyItem,
  );

  router.patch(
    '/formulary/:formularyItemId',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        formularyItemParamsSchema,

      body:
        updateFormularyItemBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .FORMULARY_MANAGE,
    ),

    controller.updateFormularyItem,
  );

  router.post(
    '/formulary/:formularyItemId/status',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        formularyItemParamsSchema,

      body:
        changeFormularyItemStatusBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .FORMULARY_MANAGE,
    ),

    controller.changeFormularyItemStatus,
  );

  router.get(
    '/patients/:patientId/medications',

    validateRequest({
      headers:
        readHeadersSchema,

      params:
        patientParamsSchema,

      query:
        prescriptionListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_READ,
    ),

    controller.patientMedicationHistory,
  );

  router.get(
    '/prescriptions',

    validateRequest({
      headers:
        readHeadersSchema,

      query:
        prescriptionListQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_READ,
    ),

    controller.listPrescriptions,
  );

  router.post(
    '/prescriptions',

    validateRequest({
      headers:
        mutationHeadersSchema,

      body:
        createPrescriptionDraftBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_CREATE,
    ),

    controller.createPrescriptionDraft,
  );

  router.get(
    '/prescriptions/:prescriptionId',

    validateRequest({
      headers:
        readHeadersSchema,

      params:
        prescriptionParamsSchema,

      query:
        prescriptionReadQuerySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_READ,
    ),

    controller.getPrescription,
  );

  router.get(
    '/prescriptions/:prescriptionId/history',

    validateRequest({
      headers:
        readHeadersSchema,

      params:
        prescriptionParamsSchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_READ,
    ),

    controller.getPrescriptionHistory,
  );

  router.patch(
    '/prescriptions/:prescriptionId/draft',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionParamsSchema,

      body:
        updatePrescriptionDraftBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_CREATE,
    ),

    controller.updatePrescriptionDraft,
  );

  router.post(
    '/prescriptions/:prescriptionId/issue',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionParamsSchema,

      body:
        issuePrescriptionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_ISSUE,
    ),

    controller.issuePrescription,
  );

  router.post(
    '/prescriptions/:prescriptionId/cancel',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionParamsSchema,

      body:
        cancelPrescriptionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_CANCEL,
    ),

    controller.cancelPrescription,
  );

  router.post(
    '/prescriptions/:prescriptionId/replace',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionParamsSchema,

      body:
        replacePrescriptionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_AMEND,
    ),

    controller.replacePrescription,
  );

  router.post(
    '/prescriptions/:prescriptionId/warnings/:warningId/acknowledge',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionWarningParamsSchema,

      body:
        acknowledgePrescriptionWarningBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_ISSUE,
    ),

    controller.acknowledgeWarning,
  );

  router.post(
    '/prescriptions/:prescriptionId/print',

    validateRequest({
      headers:
        mutationHeadersSchema,

      params:
        prescriptionParamsSchema,

      body:
        printPrescriptionBodySchema,
    }),

    requirePermission(
      options.authorizationService,
      FORMULARY_PRESCRIPTION_PERMISSION_KEYS
        .PRESCRIPTION_PRINT,
    ),

    controller.printPrescription,
  );

  return router;
}