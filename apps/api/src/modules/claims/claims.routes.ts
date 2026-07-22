import {
  Router,
  type RequestHandler,
} from 'express';

import { z } from 'zod';

import type { PermissionKey } from '@hospital-mis/permissions';

import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import type { AuthenticationService } from '../auth/auth.service.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';

import type { ClaimsApplication } from './claims.application.js';
import { CLAIM_PERMISSION_KEYS } from './claims.constants.js';
import { ClaimsController } from './claims.controller.js';
import {
  approveClaimAppealSchema,
  approveClaimBatchSchema,
  assignClaimWorkItemSchema,
  claimAppealIdParamsSchema,
  claimBatchIdParamsSchema,
  claimExpectedVersionSchema,
  claimIdParamsSchema,
  claimIdempotencyHeaderSchema,
  claimObjectIdSchema,
  claimReasonSchema,
  claimsListQuerySchema,
  claimsRecoveryRunSchema,
  claimsReportParamsSchema,
  claimsReportQuerySchema,
  claimWorkItemIdParamsSchema,
  createClaimAppealSchema,
  createClaimBatchSchema,
  createClaimSchema,
  escalateClaimWorkItemSchema,
  importRemittanceSchema,
  markClaimReadySchema,
  postClaimPaymentSchema,
  recordClaimAdjudicationSchema,
  recordClaimAppealDecisionSchema,
  recordSubmissionAcknowledgementSchema,
  requestClaimAdjustmentSchema,
  requestClaimWriteOffSchema,
  sensitiveClaimActionSchema,
  submitClaimAppealSchema,
  submitClaimBatchSchema,
  updateDraftClaimSchema,
  validateClaimSchema,
} from './claims.validation.js';

const adjustmentParamsSchema = z.object({
  adjustmentId: claimObjectIdSchema,
}).strict();

const resolveWorkItemSchema = z.object({
  expectedVersion: claimExpectedVersionSchema,
  reason: claimReasonSchema,
}).strict();

const reconcileClaimSchema = z.object({
  expectedVersion: claimExpectedVersionSchema,
  reason: claimReasonSchema,
}).strict();

const sensitiveLifecycleSchema = sensitiveClaimActionSchema.extend({
  makerUserId: claimObjectIdSchema,
}).strict();

export const CLAIMS_ROUTE_MANIFEST = [
  ['GET', '/reports/:reportName.csv', CLAIM_PERMISSION_KEYS.REPORT_EXPORT],
  ['POST', '/reports/:reportName/export-jobs', CLAIM_PERMISSION_KEYS.REPORT_EXPORT],
  ['GET', '/reports/:reportName', CLAIM_PERMISSION_KEYS.REPORT_READ],
  ['POST', '/recovery/run', CLAIM_PERMISSION_KEYS.RECOVER],
  ['GET', '/', CLAIM_PERMISSION_KEYS.READ],
  ['POST', '/', CLAIM_PERMISSION_KEYS.PREPARE],
  ['GET', '/batches', CLAIM_PERMISSION_KEYS.READ],
  ['GET', '/batches/:claimBatchId', CLAIM_PERMISSION_KEYS.READ],
  ['POST', '/batches', CLAIM_PERMISSION_KEYS.BATCH_MANAGE],
  ['POST', '/batches/:claimBatchId/approve', CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE],
  ['POST', '/batches/:claimBatchId/submit', CLAIM_PERMISSION_KEYS.SUBMIT],
  ['POST', '/batches/:claimBatchId/acknowledgements', CLAIM_PERMISSION_KEYS.ACKNOWLEDGEMENT_RECORD],
  ['POST', '/remittances', CLAIM_PERMISSION_KEYS.REMITTANCE_IMPORT],
  ['POST', '/adjustments/:adjustmentId/approve', CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE],
  ['POST', '/write-offs/:adjustmentId/approve', CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE],
  ['POST', '/appeals/:appealId/approve', CLAIM_PERMISSION_KEYS.APPEAL_APPROVE],
  ['POST', '/appeals/:appealId/submit', CLAIM_PERMISSION_KEYS.APPEAL_SUBMIT],
  ['POST', '/appeals/:appealId/decision', CLAIM_PERMISSION_KEYS.DENIAL_MANAGE],
  ['GET', '/work-items', CLAIM_PERMISSION_KEYS.READ],
  ['GET', '/work-items/:workItemId', CLAIM_PERMISSION_KEYS.READ],
  ['POST', '/work-items/:workItemId/assign', CLAIM_PERMISSION_KEYS.ASSIGN],
  ['POST', '/work-items/:workItemId/escalate', CLAIM_PERMISSION_KEYS.ESCALATE],
  ['POST', '/work-items/:workItemId/resolve', CLAIM_PERMISSION_KEYS.ASSIGN],
  ['GET', '/:claimId', CLAIM_PERMISSION_KEYS.READ],
  ['PUT', '/:claimId', CLAIM_PERMISSION_KEYS.UPDATE],
  ['POST', '/:claimId/validate', CLAIM_PERMISSION_KEYS.VALIDATE],
  ['POST', '/:claimId/ready', CLAIM_PERMISSION_KEYS.MARK_READY],
  ['POST', '/:claimId/adjudications', CLAIM_PERMISSION_KEYS.ADJUDICATION_RECORD],
  ['POST', '/:claimId/payments', CLAIM_PERMISSION_KEYS.PAYMENT_RECORD],
  ['POST', '/:claimId/adjustments', CLAIM_PERMISSION_KEYS.ADJUSTMENT_REQUEST],
  ['POST', '/:claimId/write-offs', CLAIM_PERMISSION_KEYS.WRITE_OFF_REQUEST],
  ['POST', '/:claimId/appeals', CLAIM_PERMISSION_KEYS.APPEAL_PREPARE],
  ['POST', '/:claimId/reconcile', CLAIM_PERMISSION_KEYS.PAYMENT_MATCH],
  ['POST', '/:claimId/cancel', CLAIM_PERMISSION_KEYS.CANCEL_APPROVE],
  ['POST', '/:claimId/reverse', CLAIM_PERMISSION_KEYS.REVERSE_APPROVE],
  ['POST', '/:claimId/void', CLAIM_PERMISSION_KEYS.VOID_APPROVE],
] as const;

export function createClaimsRouter(options: Readonly<{
  application: ClaimsApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}>): Router {
  const router = Router();
  const controller = new ClaimsController(
    options.application,
    options.authorizationService,
  );

  router.use(authenticate(options.authenticationService));

  const read = (
    path: string,
    permission: PermissionKey,
    schema: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ): Router => router.get(
    path,
    validateRequest(schema),
    requirePermission(options.authorizationService, permission),
    handler,
  );

  const mutation = (
    method: 'post' | 'put',
    path: string,
    permission: PermissionKey,
    schema: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ): Router => {
    const validation = validateRequest({
      headers: claimIdempotencyHeaderSchema,
      ...schema,
    });
    const authorization = requirePermission(
      options.authorizationService,
      permission,
    );

    return method === 'post'
      ? router.post(path, validation, authorization, handler)
      : router.put(path, validation, authorization, handler);
  };


  read(
    '/reports/:reportName.csv',
    CLAIM_PERMISSION_KEYS.REPORT_EXPORT,
    { params: claimsReportParamsSchema, query: claimsReportQuerySchema },
    controller.exportReportCsv,
  );
  mutation(
    'post',
    '/reports/:reportName/export-jobs',
    CLAIM_PERMISSION_KEYS.REPORT_EXPORT,
    { params: claimsReportParamsSchema, query: claimsReportQuerySchema },
    controller.queueReportExport,
  );
  read(
    '/reports/:reportName',
    CLAIM_PERMISSION_KEYS.REPORT_READ,
    { params: claimsReportParamsSchema, query: claimsReportQuerySchema },
    controller.runReport,
  );
  mutation(
    'post',
    '/recovery/run',
    CLAIM_PERMISSION_KEYS.RECOVER,
    { body: claimsRecoveryRunSchema },
    controller.runRecovery,
  );

  read('/', CLAIM_PERMISSION_KEYS.READ, { query: claimsListQuerySchema }, controller.listClaims);
  mutation('post', '/', CLAIM_PERMISSION_KEYS.PREPARE, { body: createClaimSchema }, controller.createClaim);

  read('/batches', CLAIM_PERMISSION_KEYS.READ, { query: claimsListQuerySchema }, controller.listBatches);
  read('/batches/:claimBatchId', CLAIM_PERMISSION_KEYS.READ, { params: claimBatchIdParamsSchema }, controller.getBatch);
  mutation('post', '/batches', CLAIM_PERMISSION_KEYS.BATCH_MANAGE, { body: createClaimBatchSchema }, controller.createBatch);
  mutation('post', '/batches/:claimBatchId/approve', CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE, { params: claimBatchIdParamsSchema, body: approveClaimBatchSchema }, controller.approveBatch);
  mutation('post', '/batches/:claimBatchId/submit', CLAIM_PERMISSION_KEYS.SUBMIT, { params: claimBatchIdParamsSchema, body: submitClaimBatchSchema.omit({ idempotencyKey: true }) }, controller.submitBatch);
  mutation('post', '/batches/:claimBatchId/acknowledgements', CLAIM_PERMISSION_KEYS.ACKNOWLEDGEMENT_RECORD, { params: claimBatchIdParamsSchema, body: recordSubmissionAcknowledgementSchema }, controller.acknowledgeBatch);

  mutation('post', '/remittances', CLAIM_PERMISSION_KEYS.REMITTANCE_IMPORT, { body: importRemittanceSchema }, controller.importRemittance);
  mutation('post', '/adjustments/:adjustmentId/approve', CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE, { params: adjustmentParamsSchema, body: sensitiveClaimActionSchema }, controller.approveAdjustment);
  mutation('post', '/write-offs/:adjustmentId/approve', CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE, { params: adjustmentParamsSchema, body: sensitiveClaimActionSchema }, controller.approveAdjustment);
  mutation('post', '/appeals/:appealId/approve', CLAIM_PERMISSION_KEYS.APPEAL_APPROVE, { params: claimAppealIdParamsSchema, body: approveClaimAppealSchema }, controller.approveAppeal);
  mutation('post', '/appeals/:appealId/submit', CLAIM_PERMISSION_KEYS.APPEAL_SUBMIT, { params: claimAppealIdParamsSchema, body: submitClaimAppealSchema }, controller.submitAppeal);
  mutation('post', '/appeals/:appealId/decision', CLAIM_PERMISSION_KEYS.DENIAL_MANAGE, { params: claimAppealIdParamsSchema, body: recordClaimAppealDecisionSchema }, controller.recordAppealDecision);

  read('/work-items', CLAIM_PERMISSION_KEYS.READ, { query: claimsListQuerySchema }, controller.listWorkItems);
  read('/work-items/:workItemId', CLAIM_PERMISSION_KEYS.READ, { params: claimWorkItemIdParamsSchema }, controller.getWorkItem);
  mutation('post', '/work-items/:workItemId/assign', CLAIM_PERMISSION_KEYS.ASSIGN, { params: claimWorkItemIdParamsSchema, body: assignClaimWorkItemSchema }, controller.assignWorkItem);
  mutation('post', '/work-items/:workItemId/escalate', CLAIM_PERMISSION_KEYS.ESCALATE, { params: claimWorkItemIdParamsSchema, body: escalateClaimWorkItemSchema }, controller.escalateWorkItem);
  mutation('post', '/work-items/:workItemId/resolve', CLAIM_PERMISSION_KEYS.ASSIGN, { params: claimWorkItemIdParamsSchema, body: resolveWorkItemSchema }, controller.resolveWorkItem);

  read('/:claimId', CLAIM_PERMISSION_KEYS.READ, { params: claimIdParamsSchema }, controller.getClaim);
  mutation('put', '/:claimId', CLAIM_PERMISSION_KEYS.UPDATE, { params: claimIdParamsSchema, body: updateDraftClaimSchema }, controller.updateDraft);
  mutation('post', '/:claimId/validate', CLAIM_PERMISSION_KEYS.VALIDATE, { params: claimIdParamsSchema, body: validateClaimSchema }, controller.validateClaim);
  mutation('post', '/:claimId/ready', CLAIM_PERMISSION_KEYS.MARK_READY, { params: claimIdParamsSchema, body: markClaimReadySchema }, controller.markReady);
  mutation('post', '/:claimId/adjudications', CLAIM_PERMISSION_KEYS.ADJUDICATION_RECORD, { params: claimIdParamsSchema, body: recordClaimAdjudicationSchema }, controller.recordAdjudication);
  mutation('post', '/:claimId/payments', CLAIM_PERMISSION_KEYS.PAYMENT_RECORD, { params: claimIdParamsSchema, body: postClaimPaymentSchema }, controller.postClaimPayment);
  mutation('post', '/:claimId/adjustments', CLAIM_PERMISSION_KEYS.ADJUSTMENT_REQUEST, { params: claimIdParamsSchema, body: requestClaimAdjustmentSchema }, controller.requestAdjustment);
  mutation('post', '/:claimId/write-offs', CLAIM_PERMISSION_KEYS.WRITE_OFF_REQUEST, { params: claimIdParamsSchema, body: requestClaimWriteOffSchema }, controller.requestWriteOff);
  mutation('post', '/:claimId/appeals', CLAIM_PERMISSION_KEYS.APPEAL_PREPARE, { params: claimIdParamsSchema, body: createClaimAppealSchema }, controller.createAppeal);
  mutation('post', '/:claimId/reconcile', CLAIM_PERMISSION_KEYS.PAYMENT_MATCH, { params: claimIdParamsSchema, body: reconcileClaimSchema }, controller.reconcileClaim);
  mutation('post', '/:claimId/cancel', CLAIM_PERMISSION_KEYS.CANCEL_APPROVE, { params: claimIdParamsSchema, body: sensitiveLifecycleSchema }, controller.cancelClaim);
  mutation('post', '/:claimId/reverse', CLAIM_PERMISSION_KEYS.REVERSE_APPROVE, { params: claimIdParamsSchema, body: sensitiveLifecycleSchema }, controller.reverseClaim);
  mutation('post', '/:claimId/void', CLAIM_PERMISSION_KEYS.VOID_APPROVE, { params: claimIdParamsSchema, body: sensitiveLifecycleSchema }, controller.voidClaim);

  return router;
}