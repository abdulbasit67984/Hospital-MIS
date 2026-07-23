import { Router, type RequestHandler } from 'express';

import type { PermissionKey } from '@hospital-mis/permissions';

import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import type { AuthenticationService } from '../auth/auth.service.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { ConsultantSharingApplication } from './consultant-sharing.application.js';
import { CONSULTANT_SHARING_PERMISSION_KEYS as P } from './consultant-sharing.constants.js';
import { ConsultantSharingController } from './consultant-sharing.controller.js';
import type { ConsultantSharingActorIdentityResolver } from './consultant-sharing.http-contracts.js';
import * as validation from './consultant-sharing.validation.js';

export const CONSULTANT_SHARING_ROUTE_MANIFEST = [
  ['GET', '/agreements', P.READ],
  ['POST', '/agreements', P.AGREEMENT_CREATE],
  ['GET', '/agreements/:id', P.READ],
  ['PUT', '/agreements/:id', P.AGREEMENT_UPDATE],
  ['POST', '/agreements/:id/amendments', P.AGREEMENT_AMEND],
  ['POST', '/agreements/:id/submit', P.AGREEMENT_SUBMIT],
  ['POST', '/agreements/:id/review', P.AGREEMENT_REVIEW],
  ['POST', '/agreements/:id/approve', P.AGREEMENT_APPROVE],
  ['POST', '/agreements/:id/activate', P.AGREEMENT_ACTIVATE],
  ['POST', '/agreements/:id/resume', P.AGREEMENT_ACTIVATE],
  ['POST', '/agreements/:id/suspend', P.AGREEMENT_SUSPEND],
  ['POST', '/agreements/:id/terminate', P.AGREEMENT_TERMINATE],
  ['POST', '/agreements/:id/expire', P.AGREEMENT_TERMINATE],
  ['POST', '/agreements/:id/cancel', P.AGREEMENT_UPDATE],
  ['POST', '/agreements/:id/reopen', P.AGREEMENT_REOPEN],
  ['POST', '/agreements/:id/return-to-draft', P.AGREEMENT_UPDATE],
  ['GET', '/revenue-entries', P.REVENUE_READ],
  ['POST', '/revenue-entries/calculate', P.CALCULATE],
  ['POST', '/revenue-entries/:id/hold', P.REVENUE_HOLD],
  ['POST', '/revenue-entries/:id/release', P.REVENUE_RELEASE],
  ['POST', '/adjustments', P.ADJUSTMENT_REQUEST],
  ['POST', '/adjustments/:id/approve', P.ADJUSTMENT_APPROVE],
  ['POST', '/reversals', P.REVERSAL_REQUEST],
  ['POST', '/reversals/:id/approve', P.REVERSAL_APPROVE],
  ['POST', '/recalculations', P.RECALCULATE],
  ['GET', '/settlements', P.SETTLEMENT_READ],
  ['POST', '/settlements/calculate', P.SETTLEMENT_CALCULATE],
  ['GET', '/settlements/:id', P.SETTLEMENT_READ],
  ['POST', '/settlements/:id/submit', P.SETTLEMENT_SUBMIT],
  ['POST', '/settlements/:id/review', P.SETTLEMENT_REVIEW],
  ['POST', '/settlements/:id/approve', P.SETTLEMENT_APPROVE],
  ['POST', '/settlements/:id/mark-disputed', P.DISPUTE_REVIEW],
  ['POST', '/settlements/:id/return-to-calculated', P.SETTLEMENT_REVIEW],
  ['POST', '/settlements/:id/cancel', P.SETTLEMENT_CANCEL],
  ['POST', '/settlements/:id/reverse', P.SETTLEMENT_REVERSE],
  ['POST', '/settlements/:id/close', P.SETTLEMENT_APPROVE],
  ['POST', '/settlements/:id/payouts', P.PAYOUT_REQUEST],
  ['POST', '/payouts/:id/execute', P.PAYOUT_APPROVE],
  ['POST', '/payouts/:id/reverse', P.PAYOUT_REVERSE],
  ['POST', '/disputes', P.DISPUTE_CREATE],
  ['POST', '/disputes/:id/review', P.DISPUTE_REVIEW],
  ['POST', '/disputes/:id/request-information', P.DISPUTE_REVIEW],
  ['POST', '/disputes/:id/approve', P.DISPUTE_RESOLVE],
  ['POST', '/disputes/:id/partially-approve', P.DISPUTE_RESOLVE],
  ['POST', '/disputes/:id/reject', P.DISPUTE_RESOLVE],
  ['POST', '/disputes/:id/resolve', P.DISPUTE_RESOLVE],
  ['POST', '/disputes/:id/cancel', P.DISPUTE_REVIEW],
  ['GET', '/work-items', P.READ],
  ['POST', '/work-items', P.ASSIGN],
  ['POST', '/work-items/:id/assign', P.ASSIGN],
  ['POST', '/work-items/:id/escalate', P.ESCALATE],
  ['GET', '/reports/:report', P.REPORT_READ],
  ['GET', '/reports/:report/export', P.REPORT_EXPORT],
  ['POST', '/reports/:report/export-jobs', P.REPORT_EXPORT],
  ['POST', '/maintenance/recovery', P.RECOVERY_MANAGE],
  ['POST', '/reconciliation', P.RECONCILE],
] as const;

interface RouteSchemas {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: unknown;
}

export interface CreateConsultantSharingRouterOptions {
  application: ConsultantSharingApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorIdentityResolver: ConsultantSharingActorIdentityResolver;
}

export function createConsultantSharingRouter(
  options: CreateConsultantSharingRouterOptions,
): Router {
  const router = Router();
  const controller = new ConsultantSharingController(
    options.application,
    options.authorizationService,
    options.actorIdentityResolver,
  );
  const authenticateRequest = authenticate(options.authenticationService);

  const add = (
    method: 'get' | 'post' | 'put',
    path: string,
    permission: PermissionKey,
    schemas: RouteSchemas,
    handler: RequestHandler,
    mutation = false,
  ): void => {
    router[method](
      path,
      authenticateRequest,
      requirePermission(options.authorizationService, permission),
      validateRequest(
        mutation
          ? {
              ...schemas,
              headers: validation.consultantSharingIdempotencyHeaderSchema,
            }
          : schemas,
      ),
      handler,
    );
  };

  const idParams = { params: validation.consultantSharingIdParamsSchema };
  const agreementTransition = validation.consultantAgreementTransitionBodySchema;
  const settlementTransition = validation.consultantSettlementTransitionBodySchema;
  const disputeTransition = validation.consultantDisputeTransitionBodySchema;

  add('get', '/agreements', P.READ, {
    query: validation.consultantSharingListQuerySchema,
  }, controller.listAgreements);
  add('post', '/agreements', P.AGREEMENT_CREATE, {
    body: validation.createConsultantAgreementSchema,
  }, controller.createAgreement, true);
  add('get', '/agreements/:id', P.READ, idParams, controller.getAgreement);
  add('put', '/agreements/:id', P.AGREEMENT_UPDATE, {
    ...idParams,
    body: validation.updateConsultantAgreementSchema,
  }, controller.updateAgreement, true);
  add('post', '/agreements/:id/amendments', P.AGREEMENT_AMEND, {
    ...idParams,
    body: validation.amendConsultantAgreementSchema,
  }, controller.amendAgreement, true);

  const agreementActions = [
    ['/agreements/:id/submit', P.AGREEMENT_SUBMIT, 'SUBMITTED'],
    ['/agreements/:id/review', P.AGREEMENT_REVIEW, 'UNDER_REVIEW'],
    ['/agreements/:id/approve', P.AGREEMENT_APPROVE, 'APPROVED'],
    ['/agreements/:id/activate', P.AGREEMENT_ACTIVATE, 'ACTIVE'],
    ['/agreements/:id/resume', P.AGREEMENT_ACTIVATE, 'ACTIVE'],
    ['/agreements/:id/suspend', P.AGREEMENT_SUSPEND, 'SUSPENDED'],
    ['/agreements/:id/terminate', P.AGREEMENT_TERMINATE, 'TERMINATED'],
    ['/agreements/:id/expire', P.AGREEMENT_TERMINATE, 'EXPIRED'],
    ['/agreements/:id/cancel', P.AGREEMENT_UPDATE, 'CANCELLED'],
    ['/agreements/:id/reopen', P.AGREEMENT_REOPEN, 'REOPENED'],
    ['/agreements/:id/return-to-draft', P.AGREEMENT_UPDATE, 'DRAFT'],
  ] as const;
  for (const [path, permission, targetStatus] of agreementActions) {
    add('post', path, permission, {
      ...idParams,
      body: agreementTransition,
    }, controller.agreementTransition(targetStatus), true);
  }

  add('get', '/revenue-entries', P.REVENUE_READ, {
    query: validation.consultantSharingListQuerySchema,
  }, controller.listRevenueEntries);
  add('post', '/revenue-entries/calculate', P.CALCULATE, {
    body: validation.calculateConsultantRevenueSchema,
  }, controller.calculateRevenue, true);
  add('post', '/revenue-entries/:id/hold', P.REVENUE_HOLD, {
    ...idParams,
    body: validation.consultantRevenueStatusSchema,
  }, controller.holdRevenue, true);
  add('post', '/revenue-entries/:id/release', P.REVENUE_RELEASE, {
    ...idParams,
    body: validation.consultantRevenueStatusSchema,
  }, controller.releaseRevenue, true);
  add('post', '/adjustments', P.ADJUSTMENT_REQUEST, {
    body: validation.requestConsultantAdjustmentSchema,
  }, controller.requestAdjustment, true);
  add('post', '/adjustments/:id/approve', P.ADJUSTMENT_APPROVE, {
    ...idParams,
    body: validation.consultantSharingEmptyBodySchema,
  }, controller.approveAdjustment, true);
  add('post', '/reversals', P.REVERSAL_REQUEST, {
    body: validation.requestConsultantReversalSchema,
  }, controller.requestReversal, true);
  add('post', '/reversals/:id/approve', P.REVERSAL_APPROVE, {
    ...idParams,
    body: validation.consultantSharingEmptyBodySchema,
  }, controller.approveReversal, true);
  add('post', '/recalculations', P.RECALCULATE, {
    body: validation.recalculateConsultantRevenueSchema,
  }, controller.recalculate, true);

  add('get', '/settlements', P.SETTLEMENT_READ, {
    query: validation.consultantSharingListQuerySchema,
  }, controller.listSettlements);
  add('post', '/settlements/calculate', P.SETTLEMENT_CALCULATE, {
    body: validation.createConsultantSettlementSchema,
  }, controller.calculateSettlement, true);
  add('get', '/settlements/:id', P.SETTLEMENT_READ, idParams, controller.getSettlement);

  const settlementActions = [
    ['/settlements/:id/submit', P.SETTLEMENT_SUBMIT, 'SUBMITTED'],
    ['/settlements/:id/review', P.SETTLEMENT_REVIEW, 'UNDER_REVIEW'],
    ['/settlements/:id/approve', P.SETTLEMENT_APPROVE, 'APPROVED'],
    ['/settlements/:id/mark-disputed', P.DISPUTE_REVIEW, 'DISPUTED'],
    ['/settlements/:id/return-to-calculated', P.SETTLEMENT_REVIEW, 'CALCULATED'],
    ['/settlements/:id/cancel', P.SETTLEMENT_CANCEL, 'CANCELLED'],
    ['/settlements/:id/reverse', P.SETTLEMENT_REVERSE, 'REVERSED'],
    ['/settlements/:id/close', P.SETTLEMENT_APPROVE, 'CLOSED'],
  ] as const;
  for (const [path, permission, toStatus] of settlementActions) {
    add('post', path, permission, {
      ...idParams,
      body: settlementTransition,
    }, controller.settlementTransition(toStatus), true);
  }

  add('post', '/settlements/:id/payouts', P.PAYOUT_REQUEST, {
    ...idParams,
    body: validation.requestConsultantPayoutSchema,
  }, controller.requestPayout, true);
  add('post', '/payouts/:id/execute', P.PAYOUT_APPROVE, {
    ...idParams,
    body: validation.executeConsultantPayoutSchema,
  }, controller.executePayout, true);
  add('post', '/payouts/:id/reverse', P.PAYOUT_REVERSE, {
    ...idParams,
    body: validation.reverseConsultantPayoutSchema,
  }, controller.reversePayout, true);

  add('post', '/disputes', P.DISPUTE_CREATE, {
    body: validation.openConsultantDisputeSchema,
  }, controller.openDispute, true);
  const disputeActions = [
    ['/disputes/:id/review', P.DISPUTE_REVIEW, 'UNDER_REVIEW'],
    ['/disputes/:id/request-information', P.DISPUTE_REVIEW, 'INFORMATION_REQUESTED'],
    ['/disputes/:id/approve', P.DISPUTE_RESOLVE, 'APPROVED'],
    ['/disputes/:id/partially-approve', P.DISPUTE_RESOLVE, 'PARTIALLY_APPROVED'],
    ['/disputes/:id/reject', P.DISPUTE_RESOLVE, 'REJECTED'],
    ['/disputes/:id/resolve', P.DISPUTE_RESOLVE, 'RESOLVED'],
    ['/disputes/:id/cancel', P.DISPUTE_REVIEW, 'CANCELLED'],
  ] as const;
  for (const [path, permission, toStatus] of disputeActions) {
    add('post', path, permission, {
      ...idParams,
      body: disputeTransition,
    }, controller.disputeTransition(toStatus), true);
  }

  add('get', '/work-items', P.READ, {
    query: validation.consultantSharingListQuerySchema,
  }, controller.listWorkItems);
  add('post', '/work-items', P.ASSIGN, {
    body: validation.createConsultantWorkItemSchema,
  }, controller.createWorkItem, true);
  add('post', '/work-items/:id/assign', P.ASSIGN, {
    ...idParams,
    body: validation.assignConsultantWorkItemSchema,
  }, controller.assignWorkItem, true);
  add('post', '/work-items/:id/escalate', P.ESCALATE, {
    ...idParams,
    body: validation.escalateConsultantWorkItemSchema,
  }, controller.escalateWorkItem, true);
  add('get', '/reports/:report', P.REPORT_READ, {
    params: validation.consultantSharingReportParamsSchema,
    query: validation.consultantSharingReportQuerySchema,
  }, controller.runReport);
  add('get', '/reports/:report/export', P.REPORT_EXPORT, {
    params: validation.consultantSharingReportParamsSchema,
    query: validation.consultantSharingReportQuerySchema,
  }, controller.exportReport);
  add('post', '/reports/:report/export-jobs', P.REPORT_EXPORT, {
    params: validation.consultantSharingReportParamsSchema,
    query: validation.consultantSharingReportQuerySchema,
    body: validation.consultantSharingEmptyBodySchema,
  }, controller.queueReportExport, true);
  add('post', '/maintenance/recovery', P.RECOVERY_MANAGE, {
    body: validation.consultantSharingRecoveryRunSchema,
  }, controller.runRecovery, true);

  add('post', '/reconciliation', P.RECONCILE, {
    body: validation.consultantReconciliationSchema,
  }, controller.reconcile, true);

  return router;
}