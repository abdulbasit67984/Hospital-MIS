import {
  Router,
} from 'express';

import {
  z,
} from 'zod';

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
  PharmacyDispensingApplication,
} from './pharmacy-dispensing.application.js';

import type {
  PharmacyActorResolverPort,
} from './pharmacy-dispensing.ports.js';

import {
  PHARMACY_DISPENSING_PERMISSION_KEYS,
} from './pharmacy-dispensing.constants.js';

import {
  PharmacyDispensingController,
} from './pharmacy-dispensing.controller.js';

import {
  completeDispensationBodySchema,
  createDispensationIntakeBodySchema,
  createDispensationReversalBodySchema,
  createPatientReturnBodySchema,
  decideDispensationSubstitutionBodySchema,
  holdDispensationBodySchema,
  pharmacyDispensationListQuerySchema,
  pharmacyEntityParamsSchema,
  pharmacyExpectedVersionSchema,
  pharmacyIsoDateTimeSchema,
  pharmacyMutationHeadersSchema,
  pharmacyObjectIdSchema,
  pharmacyReadHeadersSchema,
  pharmacyReasonSchema,
  printDispensingLabelBodySchema,
  proposeDispensationSubstitutionBodySchema,
  recordPharmacyCounsellingBodySchema,
  rejectDispensationBodySchema,
  releaseDispensationBodySchema,
  reserveDispensationStockBodySchema,
  verifyDispensationBodySchema,
} from './pharmacy-dispensing.validation.js';

const mutationHeaders = pharmacyMutationHeadersSchema.passthrough();
const readHeaders = pharmacyReadHeadersSchema.passthrough();

const dispensationParams = pharmacyEntityParamsSchema
  .pick({ dispensationId: true })
  .required()
  .strict();

const dispensationItemParams = pharmacyEntityParamsSchema
  .pick({ dispensationId: true, dispensationItemId: true })
  .required()
  .strict();

const substitutionParams = pharmacyEntityParamsSchema
  .pick({ dispensationId: true, substitutionId: true })
  .required()
  .strict();

const returnParams = pharmacyEntityParamsSchema
  .pick({ returnId: true })
  .required()
  .strict();

const reversalParams = pharmacyEntityParamsSchema
  .pick({ reversalId: true })
  .required()
  .strict();

const labelParams = pharmacyEntityParamsSchema
  .pick({ labelId: true })
  .required()
  .strict();

const generateLabelBodySchema = z
  .object({
    languageCode: z.string().trim().toLowerCase().min(2).max(20).default('en-pk'),
  })
  .strict();

const postReturnBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
  })
  .strict();

const postReversalBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    dispensationItemIds: z.array(pharmacyObjectIdSchema).min(1).max(500).optional(),
  })
  .strict();

const controlledRegisterQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    pharmacyLocationId: pharmacyObjectIdSchema.optional(),
    inventoryItemId: pharmacyObjectIdSchema.optional(),
    batchId: pharmacyObjectIdSchema.optional(),
    patientId: pharmacyObjectIdSchema.optional(),
    discrepancyStatus: z.enum(['NONE', 'OPEN', 'ESCALATED', 'RESOLVED']).optional(),
    from: pharmacyIsoDateTimeSchema.optional(),
    to: pharmacyIsoDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.from).getTime() <= new Date(value.to).getTime(),
    {
      path: ['to'],
      message: 'Controlled-register query end must not precede its start',
    },
  );

const reportSummaryQuerySchema = z
  .object({
    from: pharmacyIsoDateTimeSchema,
    to: pharmacyIsoDateTimeSchema,
    pharmacyLocationId: pharmacyObjectIdSchema.optional(),
  })
  .strict()
  .refine(
    (value) => new Date(value.from).getTime() <= new Date(value.to).getTime(),
    {
      path: ['to'],
      message: 'Report end must not precede its start',
    },
  );

const recoveryParamsSchema = z
  .object({
    entityType: z.enum([
      'DISPENSATION',
      'PATIENT_RETURN',
      'DISPENSATION_REVERSAL',
    ]),
    entityId: pharmacyObjectIdSchema,
  })
  .strict();

const recoveryBodySchema = z
  .object({
    expectedVersion: pharmacyExpectedVersionSchema,
    recoveryReason: pharmacyReasonSchema,
  })
  .strict();

export interface CreatePharmacyDispensingRouterOptions {
  application: PharmacyDispensingApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: PharmacyActorResolverPort;
}

export function createPharmacyDispensingRouter(
  options: CreatePharmacyDispensingRouterOptions,
): Router {
  const router = Router();
  const controller = new PharmacyDispensingController(
    options.application,
    options.authorizationService,
    options.actorResolver,
  );

  router.use(authenticate(options.authenticationService));

  router.get(
    '/worklist',
    validateRequest({ headers: readHeaders, query: pharmacyDispensationListQuerySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.QUEUE_READ),
    controller.listWorklist,
  );

  router.get(
    '/dispensations',
    validateRequest({ headers: readHeaders, query: pharmacyDispensationListQuerySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.READ),
    controller.listDispensations,
  );

  router.post(
    '/dispensations',
    validateRequest({ headers: mutationHeaders, body: createDispensationIntakeBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.createIntake,
  );

  router.get(
    '/dispensations/:dispensationId',
    validateRequest({ headers: readHeaders, params: dispensationParams }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.READ),
    controller.getDispensation,
  );

  router.post(
    '/dispensations/:dispensationId/verify',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: verifyDispensationBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.verify,
  );

  router.post(
    '/dispensations/:dispensationId/hold',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: holdDispensationBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.hold,
  );

  router.post(
    '/dispensations/:dispensationId/release',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: releaseDispensationBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.release,
  );

  router.post(
    '/dispensations/:dispensationId/reject',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: rejectDispensationBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.reject,
  );

  router.post(
    '/dispensations/:dispensationId/reservations',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: reserveDispensationStockBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE),
    controller.reserve,
  );

  router.post(
    '/dispensations/:dispensationId/dispense',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: completeDispensationBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE),
    controller.dispense,
  );

  router.post(
    '/dispensations/:dispensationId/items/:dispensationItemId/substitutions',
    validateRequest({ headers: mutationHeaders, params: dispensationItemParams, body: proposeDispensationSubstitutionBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.proposeSubstitution,
  );

  router.post(
    '/dispensations/:dispensationId/substitutions/:substitutionId/decision',
    validateRequest({ headers: mutationHeaders, params: substitutionParams, body: decideDispensationSubstitutionBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.VERIFY),
    controller.decideSubstitution,
  );

  router.post(
    '/dispensations/:dispensationId/items/:dispensationItemId/labels',
    validateRequest({ headers: mutationHeaders, params: dispensationItemParams, body: generateLabelBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE),
    controller.generateLabel,
  );

  router.post(
    '/labels/:labelId/print',
    validateRequest({ headers: mutationHeaders, params: labelParams, body: printDispensingLabelBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE),
    controller.printLabel,
  );

  router.post(
    '/dispensations/:dispensationId/counselling',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: recordPharmacyCounsellingBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.DISPENSE),
    controller.recordCounselling,
  );

  router.post(
    '/returns',
    validateRequest({ headers: mutationHeaders, body: createPatientReturnBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.RETURN),
    controller.createPatientReturn,
  );

  router.get(
    '/returns/:returnId',
    validateRequest({ headers: readHeaders, params: returnParams }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.READ),
    controller.getPatientReturn,
  );

  router.post(
    '/returns/:returnId/post',
    validateRequest({ headers: mutationHeaders, params: returnParams, body: postReturnBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.RETURN),
    controller.postPatientReturn,
  );

  router.post(
    '/dispensations/:dispensationId/reversals',
    validateRequest({ headers: mutationHeaders, params: dispensationParams, body: createDispensationReversalBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.REVERSAL),
    controller.requestReversal,
  );

  router.post(
    '/reversals/:reversalId/post',
    validateRequest({ headers: mutationHeaders, params: reversalParams, body: postReversalBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.REVERSAL),
    controller.postReversal,
  );

  router.get(
    '/controlled-register',
    validateRequest({ headers: readHeaders, query: controlledRegisterQuerySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.REPORT_READ),
    controller.listControlledRegister,
  );

  router.get(
    '/reports/summary',
    validateRequest({ headers: readHeaders, query: reportSummaryQuerySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.REPORT_READ),
    controller.reportSummary,
  );

  router.get(
    '/recovery',
    validateRequest({ headers: readHeaders }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.CONFIGURATION_MANAGE),
    controller.recoveryDashboard,
  );

  router.post(
    '/recovery/:entityType/:entityId',
    validateRequest({ headers: mutationHeaders, params: recoveryParamsSchema, body: recoveryBodySchema }),
    requirePermission(options.authorizationService, PHARMACY_DISPENSING_PERMISSION_KEYS.CONFIGURATION_MANAGE),
    controller.prepareRecovery,
  );

  return router;
}