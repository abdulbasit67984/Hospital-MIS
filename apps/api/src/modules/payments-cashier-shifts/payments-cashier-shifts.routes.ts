import {
  Router,
  type RequestHandler,
} from 'express';

import {
  z,
} from 'zod';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PaymentsCashierShiftsApplication,
} from './payments-cashier-shifts.application.js';

import {
  PAYMENT_CASHIER_PERMISSION_KEYS,
} from './payments-cashier-shifts.constants.js';

import {
  PaymentsCashierShiftsController,
} from './payments-cashier-shifts.controller.js';

import type {
  PaymentCashierActorResolverPort,
} from './payments-cashier-shifts.ports.js';

import {
  allocatePaymentSchema,
  applyDepositSchema,
  approveShiftVarianceSchema,
  assignCashCounterUsersSchema,
  authorizePaymentIntentSchema,
  beginShiftClosingSchema,
  cancelPaymentIntentSchema,
  changeCashCounterStatusSchema,
  changePaymentMethodStatusSchema,
  closeCashierShiftSchema,
  collectPaymentSchema,
  createCashCounterSchema,
  createCashMovementSchema,
  createDepositSchema,
  createPaymentIntentSchema,
  createPaymentMethodConfigurationSchema,
  createPaymentReversalSchema,
  createRefundRequestSchema,
  decideCashMovementSchema,
  decidePaymentReversalSchema,
  decideRefundRequestSchema,
  handoverCashierShiftSchema,
  openCashierShiftSchema,
  paymentCashierIdempotencyHeadersSchema,
  paymentCashierListQuerySchema,
  paymentCashierObjectIdSchema,
  paymentCashierOptionalBreakGlassHeadersSchema,
  postCashMovementSchema,
  postPaymentReversalSchema,
  processRefundSchema,
  reprintReceiptSchema,
  reopenCashierShiftSchema,
  resumeCashierShiftSchema,
  reverseRefundSchema,
  suspendCashierShiftSchema,
  transferDepositSchema,
  updateCashCounterSchema,
  updatePaymentMethodConfigurationSchema,
} from './payments-cashier-shifts.validation.js';

export interface CreatePaymentsCashierShiftsRouterOptions {
  application: PaymentsCashierShiftsApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: PaymentCashierActorResolverPort;
}

export const PAYMENTS_CASHIER_ROUTE_MANIFEST = [
  ['GET', '/payment-methods', 'payments.methods.read', false],
  ['POST', '/payment-methods', 'payments.methods.manage', true],
  ['GET', '/counters', 'payments.counters.read', false],
  ['POST', '/counters', 'payments.counters.manage', true],
  ['GET', '/shifts', 'cash_shifts.read', false],
  ['POST', '/shifts/open', 'cash_shifts.open', true],
  ['POST', '/payment-intents', 'payments.intents.create', true],
  ['GET', '/payments', 'payments.read', false],
  ['POST', '/payments', 'payments.collect', true],
  ['GET', '/deposits', 'payments.deposits.read', false],
  ['POST', '/refund-requests', 'payments.refunds.request', true],
  ['POST', '/payment-reversals', 'payments.reversals.request', true],
  ['GET', '/cash-movements', 'payments.cash_movements.read', false],
  ['POST', '/cash-movements', 'payments.cash_movements.create', true],
  ['GET', '/reports/operational-exceptions', 'payments.reports.read', false],
  ['GET', '/reports/payments.csv', 'payments.reports.export', false],
  ['POST', '/recovery/run', 'payments.recovery.manage', false],
] as const;

const params = {
  method: z.object({ methodId: paymentCashierObjectIdSchema }).strict(),
  counter: z.object({ counterId: paymentCashierObjectIdSchema }).strict(),
  shift: z.object({ shiftId: paymentCashierObjectIdSchema }).strict(),
  intent: z.object({ intentId: paymentCashierObjectIdSchema }).strict(),
  payment: z.object({ paymentId: paymentCashierObjectIdSchema }).strict(),
  receipt: z.object({ receiptId: paymentCashierObjectIdSchema }).strict(),
  deposit: z.object({ depositId: paymentCashierObjectIdSchema }).strict(),
  request: z.object({ requestId: paymentCashierObjectIdSchema }).strict(),
  refund: z.object({ refundId: paymentCashierObjectIdSchema }).strict(),
  reversal: z.object({ reversalId: paymentCashierObjectIdSchema }).strict(),
  movement: z.object({ movementId: paymentCashierObjectIdSchema }).strict(),
} as const;

const recoveryBodySchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
}).strict();

export function createPaymentsCashierShiftsRouter(
  options: CreatePaymentsCashierShiftsRouterOptions,
): Router {
  const router = Router();
  const controller = new PaymentsCashierShiftsController(
    options.application,
    options.authorizationService,
    options.actorResolver,
  );
  const requireAuthentication = authenticate(options.authenticationService);
  router.use(requireAuthentication);

  const read = (
    path: string,
    permission: PermissionKey,
    schemas: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ): void => {
    router.get(
      path,
      validateRequest({
        headers: paymentCashierOptionalBreakGlassHeadersSchema,
        ...schemas,
      }),
      requirePermission(options.authorizationService, permission),
      handler,
    );
  };

  const post = (
    path: string,
    permission: PermissionKey,
    schemas: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
    idempotent = true,
  ): void => {
    router.post(
      path,
      validateRequest({
        headers: idempotent
          ? paymentCashierIdempotencyHeadersSchema
          : paymentCashierOptionalBreakGlassHeadersSchema,
        ...schemas,
      }),
      requirePermission(options.authorizationService, permission),
      handler,
    );
  };

  const patch = (
    path: string,
    permission: PermissionKey,
    schemas: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ): void => {
    router.patch(
      path,
      validateRequest({
        headers: paymentCashierIdempotencyHeadersSchema,
        ...schemas,
      }),
      requirePermission(options.authorizationService, permission),
      handler,
    );
  };

  read('/payment-methods', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_READ, { query: paymentCashierListQuerySchema }, controller.listPaymentMethods);
  post('/payment-methods', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_MANAGE, { body: createPaymentMethodConfigurationSchema }, controller.createPaymentMethod);
  read('/payment-methods/:methodId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_READ, { params: params.method }, controller.getPaymentMethod);
  patch('/payment-methods/:methodId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_MANAGE, { params: params.method, body: updatePaymentMethodConfigurationSchema }, controller.updatePaymentMethod);
  post('/payment-methods/:methodId/status', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_MANAGE, { params: params.method, body: changePaymentMethodStatusSchema }, controller.changePaymentMethodStatus);

  read('/counters', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_READ, { query: paymentCashierListQuerySchema }, controller.listCounters);
  post('/counters', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_MANAGE, { body: createCashCounterSchema }, controller.createCounter);
  read('/counters/:counterId', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_READ, { params: params.counter }, controller.getCounter);
  patch('/counters/:counterId', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_MANAGE, { params: params.counter, body: updateCashCounterSchema }, controller.updateCounter);
  post('/counters/:counterId/status', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_MANAGE, { params: params.counter, body: changeCashCounterStatusSchema }, controller.changeCounterStatus);
  post('/counters/:counterId/users', PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_ASSIGN, { params: params.counter, body: assignCashCounterUsersSchema }, controller.assignCounterUsers);

  read('/shifts', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_READ, { query: paymentCashierListQuerySchema }, controller.listShifts);
  post('/shifts/open', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_OPEN, { body: openCashierShiftSchema }, controller.openShift);
  read('/shifts/:shiftId', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_READ, { params: params.shift }, controller.getShift);
  post('/shifts/:shiftId/suspend', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_SUSPEND, { params: params.shift, body: suspendCashierShiftSchema }, controller.suspendShift);
  post('/shifts/:shiftId/resume', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_RESUME, { params: params.shift, body: resumeCashierShiftSchema }, controller.resumeShift);
  post('/shifts/:shiftId/handover', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_HANDOVER, { params: params.shift, body: handoverCashierShiftSchema }, controller.handoverShift);
  post('/shifts/:shiftId/reopen', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_REOPEN, { params: params.shift, body: reopenCashierShiftSchema }, controller.reopenShift);
  read('/shifts/:shiftId/reconciliation', PAYMENT_CASHIER_PERMISSION_KEYS.RECONCILIATION_READ, { params: params.shift }, controller.getReconciliation);
  post('/shifts/:shiftId/reconciliation', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_RECONCILE, { params: params.shift, body: beginShiftClosingSchema }, controller.beginClosing);
  post('/shifts/:shiftId/reconciliation/approval', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_VARIANCE_APPROVE, { params: params.shift, body: approveShiftVarianceSchema }, controller.approveShiftControl);
  post('/shifts/:shiftId/close', PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_CLOSE, { params: params.shift, body: closeCashierShiftSchema }, controller.closeShift);

  post('/payment-intents', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_CREATE, { body: createPaymentIntentSchema }, controller.createPaymentIntent);
  read('/payment-intents/:intentId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { params: params.intent }, controller.getPaymentIntent);
  post('/payment-intents/:intentId/authorize', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_CREATE, { params: params.intent, body: authorizePaymentIntentSchema }, controller.authorizePaymentIntent);
  post('/payment-intents/:intentId/cancel', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_CANCEL, { params: params.intent, body: cancelPaymentIntentSchema }, controller.cancelPaymentIntent);

  read('/payments', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { query: paymentCashierListQuerySchema }, controller.listPayments);
  post('/payments', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT, { body: collectPaymentSchema }, controller.collectPayment);
  read('/payments/:paymentId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { params: params.payment }, controller.getPayment);
  post('/payments/:paymentId/allocations', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_ALLOCATE, { params: params.payment, body: allocatePaymentSchema }, controller.allocatePayment);

  read('/receipts/:receiptId', PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_READ, { params: params.receipt }, controller.getReceipt);
  post('/receipts/:receiptId/reprints', PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_REPRINT, { params: params.receipt, body: reprintReceiptSchema }, controller.reprintReceipt);

  read('/deposits', PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_READ, { query: paymentCashierListQuerySchema }, controller.listDeposits);
  post('/deposits', PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_COLLECT, { body: createDepositSchema }, controller.createDeposit);
  read('/deposits/:depositId', PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_READ, { params: params.deposit }, controller.getDeposit);
  post('/deposits/:depositId/applications', PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_APPLY, { params: params.deposit, body: applyDepositSchema }, controller.applyDeposit);
  post('/deposits/:depositId/transfers', PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_TRANSFER, { params: params.deposit, body: transferDepositSchema }, controller.transferDeposit);

  post('/refund-requests', PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_REQUEST, { body: createRefundRequestSchema }, controller.requestRefund);
  read('/refund-requests/:requestId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { params: params.request }, controller.getRefundRequest);
  post('/refund-requests/:requestId/decision', PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_APPROVE, { params: params.request, body: decideRefundRequestSchema }, controller.decideRefundRequest);
  post('/refund-requests/:requestId/process', PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_PROCESS, { params: params.request, body: processRefundSchema }, controller.processRefund);
  read('/refunds/:refundId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { params: params.refund }, controller.getRefund);
  post('/refunds/:refundId/reverse', PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_REVERSE, { params: params.refund, body: reverseRefundSchema }, controller.reverseRefund);

  post('/payment-reversals', PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_REQUEST, { body: createPaymentReversalSchema }, controller.requestPaymentReversal);
  read('/payment-reversals/:reversalId', PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ, { params: params.reversal }, controller.getPaymentReversal);
  post('/payment-reversals/:reversalId/decision', PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_APPROVE, { params: params.reversal, body: decidePaymentReversalSchema }, controller.decidePaymentReversal);
  post('/payment-reversals/:reversalId/post', PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_PROCESS, { params: params.reversal, body: postPaymentReversalSchema }, controller.postPaymentReversal);

  read('/cash-movements', PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_READ, { query: paymentCashierListQuerySchema }, controller.listCashMovements);
  post('/cash-movements', PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_CREATE, { body: createCashMovementSchema }, controller.createCashMovement);
  read('/cash-movements/:movementId', PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_READ, { params: params.movement }, controller.getCashMovement);
  post('/cash-movements/:movementId/decision', PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_APPROVE, { params: params.movement, body: decideCashMovementSchema }, controller.decideCashMovement);
  post('/cash-movements/:movementId/post', PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_POST, { params: params.movement, body: postCashMovementSchema }, controller.postCashMovement);

  read('/reports/shifts/:shiftId', PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_READ, { params: params.shift }, controller.shiftSummary);
  read('/reports/operational-exceptions', PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_READ, {}, controller.operationalExceptions);
  read('/reports/payments.csv', PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_EXPORT, { query: paymentCashierListQuerySchema }, controller.exportPayments);
  post('/recovery/run', PAYMENT_CASHIER_PERMISSION_KEYS.RECOVERY_MANAGE, { body: recoveryBodySchema }, controller.runRecovery, false);

  return router;
}