import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import type { PermissionKey } from '@hospital-mis/permissions';

import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import type { AuthenticationService } from '../auth/auth.service.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { WelfareZakatApplication } from './welfare-zakat.application.js';
import { WELFARE_ZAKAT_PERMISSION_KEYS } from './welfare-zakat.constants.js';
import { WelfareZakatController } from './welfare-zakat.controller.js';
import {
  assignAssistanceWorkItemSchema,
  changeAssistanceFundStatusSchema,
  confirmAssistanceAllocationSchema,
  createAssistanceAllocationSchema,
  createAssistanceApplicationSchema,
  createAssistanceFundSchema,
  decideAssistanceApprovalSchema,
  decideFundTransferSchema,
  escalateAssistanceWorkItemSchema,
  recordAssistanceReviewSchema,
  recordFundInflowSchema,
  requestApplicationInformationSchema,
  requestAssistanceApprovalSchema,
  requestFundTransferSchema,
  reverseFundTransferSchema,
  reserveAssistanceAllocationSchema,
  returnFundsSchema,
  reverseAssistanceAllocationSchema,
  submitAssistanceApplicationSchema,
  updateAssistanceApplicationSchema,
  updateAssistanceFundSchema,
  welfareZakatIdempotencyHeaderSchema,
  welfareZakatIdParamsSchema,
  welfareZakatIsoDateTimeSchema,
  welfareZakatListQuerySchema,
  welfareZakatRecoveryRunSchema,
  welfareZakatReportParamsSchema,
  welfareZakatReportQuerySchema,
  welfareZakatPositiveMoneySchema,
  welfareZakatReasonSchema,
  welfareZakatExpectedVersionSchema,
} from './welfare-zakat.validation.js';

const recordDonationHttpSchema = recordFundInflowSchema.refine(
  (input) => input.transactionType === 'DONATION',
  {
    path: ['transactionType'],
    message: 'The donations endpoint only accepts DONATION transactions',
  },
);

const recordNonDonationInflowHttpSchema = recordFundInflowSchema.refine(
  (input) => input.transactionType !== 'DONATION',
  {
    path: ['transactionType'],
    message: 'Use the donations endpoint for DONATION transactions',
  },
);

const releaseReservationSchema = z.object({
  expectedVersion: welfareZakatExpectedVersionSchema,
  expectedFundVersion: welfareZakatExpectedVersionSchema,
  expectedApprovalVersion: welfareZakatExpectedVersionSchema,
  amount: welfareZakatPositiveMoneySchema.nullable().optional(),
  reason: welfareZakatReasonSchema,
}).strict();

const reconciliationSchema = z.object({
  asOf: welfareZakatIsoDateTimeSchema.optional(),
}).strict();

const emptyBodySchema = z.object({}).strict();

export const WELFARE_ZAKAT_ROUTE_MANIFEST = [
  ['GET', '/funds', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ],
  ['POST', '/funds', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE],
  ['GET', '/funds/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ],
  ['PUT', '/funds/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE],
  ['POST', '/funds/:id/status', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_STATUS_MANAGE],
  ['GET', '/funds/:id/transactions', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ],
  ['POST', '/funds/:id/donations', WELFARE_ZAKAT_PERMISSION_KEYS.DONATION_RECORD],
  ['POST', '/funds/:id/inflows', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSACTION_RECORD],
  ['POST', '/funds/:id/reconcile', WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE],
  ['GET', '/transfers', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ],
  ['POST', '/transfers', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_REQUEST],
  ['GET', '/transfers/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ],
  ['POST', '/transfers/:id/decisions', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE],
  ['POST', '/transfers/:id/reverse', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE],
  ['GET', '/applications', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/applications', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_CREATE],
  ['GET', '/applications/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['PUT', '/applications/:id', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_UPDATE],
  ['POST', '/applications/:id/submit', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_SUBMIT],
  ['POST', '/applications/:id/information-requests', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW],
  ['POST', '/applications/:id/reviews', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW],
  ['POST', '/applications/:id/eligibility', WELFARE_ZAKAT_PERMISSION_KEYS.ELIGIBILITY_EVALUATE],
  ['GET', '/applications/:id/approvals', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/applications/:id/approvals', WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_REQUEST],
  ['GET', '/approvals/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/approvals/:id/decisions', WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_DECIDE],
  ['POST', '/reservations', WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_CREATE],
  ['POST', '/reservations/:id/release', WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_RELEASE],
  ['GET', '/allocations', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/allocations', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_CREATE],
  ['GET', '/allocations/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/allocations/:id/confirm', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE],
  ['POST', '/allocations/:id/reversal-requests', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_REQUEST],
  ['POST', '/reversals/:id/approve', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE],
  ['POST', '/allocations/:id/refunds', WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE],
  ['POST', '/allocations/:id/repayments', WELFARE_ZAKAT_PERMISSION_KEYS.REPAYMENT_APPROVE],
  ['POST', '/allocations/:id/recoveries', WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE],
  ['POST', '/allocations/:id/reconcile', WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE],
  ['GET', '/work-items', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['GET', '/work-items/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ],
  ['POST', '/work-items/:id/assign', WELFARE_ZAKAT_PERMISSION_KEYS.ASSIGN],
  ['POST', '/work-items/:id/escalate', WELFARE_ZAKAT_PERMISSION_KEYS.ESCALATE],
  ['GET', '/reports/:report', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_READ],
  ['GET', '/reports/:report/export', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT],
  ['POST', '/reports/:report/export-jobs', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT],
  ['POST', '/maintenance/recovery', WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE],
] as const;

export function createWelfareZakatRouter(options: Readonly<{
  application: WelfareZakatApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
}>): Router {
  const router = Router();
  const controller = new WelfareZakatController(
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
      headers: welfareZakatIdempotencyHeaderSchema,
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

  read('/funds', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, { query: welfareZakatListQuerySchema }, controller.listFunds);
  mutation('post', '/funds', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE, { body: createAssistanceFundSchema }, controller.createFund);
  read('/funds/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, { params: welfareZakatIdParamsSchema }, controller.getFund);
  mutation('put', '/funds/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE, { params: welfareZakatIdParamsSchema, body: updateAssistanceFundSchema }, controller.updateFund);
  mutation('post', '/funds/:id/status', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_STATUS_MANAGE, { params: welfareZakatIdParamsSchema, body: changeAssistanceFundStatusSchema }, controller.changeFundStatus);
  read('/funds/:id/transactions', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, { params: welfareZakatIdParamsSchema, query: welfareZakatListQuerySchema }, controller.listFundTransactions);
  mutation('post', '/funds/:id/donations', WELFARE_ZAKAT_PERMISSION_KEYS.DONATION_RECORD, { params: welfareZakatIdParamsSchema, body: recordDonationHttpSchema }, controller.recordFundInflow);
  mutation('post', '/funds/:id/inflows', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSACTION_RECORD, { params: welfareZakatIdParamsSchema, body: recordNonDonationInflowHttpSchema }, controller.recordFundInflow);
  mutation('post', '/funds/:id/reconcile', WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE, { params: welfareZakatIdParamsSchema, body: reconciliationSchema }, controller.reconcileFund);

  read('/transfers', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, { query: welfareZakatListQuerySchema }, controller.listTransfers);
  mutation('post', '/transfers', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_REQUEST, { body: requestFundTransferSchema }, controller.requestTransfer);
  read('/transfers/:id', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ, { params: welfareZakatIdParamsSchema }, controller.getTransfer);
  mutation('post', '/transfers/:id/decisions', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE, { params: welfareZakatIdParamsSchema, body: decideFundTransferSchema }, controller.decideTransfer);
  mutation('post', '/transfers/:id/reverse', WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE, { params: welfareZakatIdParamsSchema, body: reverseFundTransferSchema }, controller.reverseTransfer);

  read('/applications', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { query: welfareZakatListQuerySchema }, controller.listApplications);
  mutation('post', '/applications', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_CREATE, { body: createAssistanceApplicationSchema }, controller.createApplication);
  read('/applications/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { params: welfareZakatIdParamsSchema }, controller.getApplication);
  mutation('put', '/applications/:id', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_UPDATE, { params: welfareZakatIdParamsSchema, body: updateAssistanceApplicationSchema }, controller.updateApplication);
  mutation('post', '/applications/:id/submit', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_SUBMIT, { params: welfareZakatIdParamsSchema, body: submitAssistanceApplicationSchema }, controller.submitApplication);
  mutation('post', '/applications/:id/information-requests', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW, { params: welfareZakatIdParamsSchema, body: requestApplicationInformationSchema }, controller.requestApplicationInformation);
  mutation('post', '/applications/:id/reviews', WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW, { params: welfareZakatIdParamsSchema, body: recordAssistanceReviewSchema }, controller.recordApplicationReview);
  mutation('post', '/applications/:id/eligibility', WELFARE_ZAKAT_PERMISSION_KEYS.ELIGIBILITY_EVALUATE, { params: welfareZakatIdParamsSchema, body: z.object({ fundId: welfareZakatIdParamsSchema.shape.id }).strict() }, controller.evaluateApplication);
  read('/applications/:id/approvals', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { params: welfareZakatIdParamsSchema }, controller.listApplicationApprovals);
  mutation('post', '/applications/:id/approvals', WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_REQUEST, { params: welfareZakatIdParamsSchema, body: requestAssistanceApprovalSchema }, controller.requestApproval);

  read('/approvals/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { params: welfareZakatIdParamsSchema }, controller.getApproval);
  mutation('post', '/approvals/:id/decisions', WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_DECIDE, { params: welfareZakatIdParamsSchema, body: decideAssistanceApprovalSchema }, controller.decideApproval);

  mutation('post', '/reservations', WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_CREATE, { body: reserveAssistanceAllocationSchema }, controller.reserveFunds);
  mutation('post', '/reservations/:id/release', WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_RELEASE, { params: welfareZakatIdParamsSchema, body: releaseReservationSchema }, controller.releaseReservation);

  read('/allocations', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { query: welfareZakatListQuerySchema }, controller.listAllocations);
  mutation('post', '/allocations', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_CREATE, { body: createAssistanceAllocationSchema }, controller.createAllocation);
  read('/allocations/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { params: welfareZakatIdParamsSchema }, controller.getAllocation);
  mutation('post', '/allocations/:id/confirm', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE, { params: welfareZakatIdParamsSchema, body: confirmAssistanceAllocationSchema }, controller.confirmAllocation);
  mutation('post', '/allocations/:id/reversal-requests', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_REQUEST, { params: welfareZakatIdParamsSchema, body: reverseAssistanceAllocationSchema }, controller.requestAllocationReversal);
  mutation('post', '/reversals/:id/approve', WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE, { params: welfareZakatIdParamsSchema, body: emptyBodySchema }, controller.approveAllocationReversal);
  mutation('post', '/allocations/:id/refunds', WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE, { params: welfareZakatIdParamsSchema, body: returnFundsSchema }, controller.postRefund);
  mutation('post', '/allocations/:id/repayments', WELFARE_ZAKAT_PERMISSION_KEYS.REPAYMENT_APPROVE, { params: welfareZakatIdParamsSchema, body: returnFundsSchema }, controller.postRepayment);
  mutation('post', '/allocations/:id/recoveries', WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE, { params: welfareZakatIdParamsSchema, body: returnFundsSchema }, controller.postRecovery);
  mutation('post', '/allocations/:id/reconcile', WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE, { params: welfareZakatIdParamsSchema, body: emptyBodySchema }, controller.reconcileAllocation);

  read('/work-items', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { query: welfareZakatListQuerySchema }, controller.listWorkItems);
  read('/work-items/:id', WELFARE_ZAKAT_PERMISSION_KEYS.READ, { params: welfareZakatIdParamsSchema }, controller.getWorkItem);
  mutation('post', '/work-items/:id/assign', WELFARE_ZAKAT_PERMISSION_KEYS.ASSIGN, { params: welfareZakatIdParamsSchema, body: assignAssistanceWorkItemSchema }, controller.assignWorkItem);
  mutation('post', '/work-items/:id/escalate', WELFARE_ZAKAT_PERMISSION_KEYS.ESCALATE, { params: welfareZakatIdParamsSchema, body: escalateAssistanceWorkItemSchema }, controller.escalateWorkItem);

  read('/reports/:report', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_READ, { params: welfareZakatReportParamsSchema, query: welfareZakatReportQuerySchema }, controller.runReport);
  read('/reports/:report/export', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT, { params: welfareZakatReportParamsSchema, query: welfareZakatReportQuerySchema }, controller.exportReport);
  mutation('post', '/reports/:report/export-jobs', WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT, { params: welfareZakatReportParamsSchema, query: welfareZakatReportQuerySchema }, controller.queueReportExport);
  mutation('post', '/maintenance/recovery', WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE, { body: welfareZakatRecoveryRunSchema }, controller.runRecovery);

  return router;
}