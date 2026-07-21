import type {
  Request,
  RequestHandler,
  Response,
} from 'express';

import {
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PaymentsCashierShiftsApplication,
} from './payments-cashier-shifts.application.js';

import {
  paymentCashierActorFromRequest,
  paymentCashierIdempotencyKeyFromRequest,
  validatedPaymentCashierPart,
} from './payments-cashier-shifts.http-contracts.js';

import type {
  PaymentCashierActorContext,
  PaymentCashierListQuery,
} from './payments-cashier-shifts.contracts.js';

import type {
  PaymentCashierActorResolverPort,
} from './payments-cashier-shifts.ports.js';

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return null;
  }
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => jsonSafe(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate['toHexString'] === 'function') {
      return (candidate['toHexString'] as () => string)();
    }
    if (candidate['_bsontype'] === 'Decimal128' && typeof candidate['toString'] === 'function') {
      return (candidate['toString'] as () => string)();
    }
    if (typeof candidate['toObject'] === 'function') {
      return jsonSafe((candidate['toObject'] as () => unknown)(), depth + 1);
    }
    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [key, jsonSafe(nested, depth + 1)]),
    );
  }
  return String(value);
}

export class PaymentsCashierShiftsController {
  public constructor(
    private readonly application: PaymentsCashierShiftsApplication,
    private readonly authorization: AuthorizationService,
    private readonly actorResolver: PaymentCashierActorResolverPort,
  ) {}

  private actor(request: Request): Promise<PaymentCashierActorContext> {
    return paymentCashierActorFromRequest(
      request,
      this.authorization,
      this.actorResolver,
    );
  }

  private parameter(request: Request, key: string): string {
    const value = validatedPaymentCashierPart<Record<string, string | undefined>>(
      request,
      'params',
    )[key];
    if (value === undefined) {
      throw new ResourceNotFoundError(`Payments route parameter ${key} is unavailable`);
    }
    return value;
  }

  private send(request: Request, response: Response, status: number, result: unknown): void {
    response.status(status).json(
      createApiSuccess(jsonSafe(result), request.correlationId),
    );
  }

  private read(
    status: number,
    operation: (actor: PaymentCashierActorContext, request: Request) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        this.send(request, response, status, await operation(await this.actor(request), request));
      } catch (error) {
        next(error);
      }
    };
  }

  private mutation(
    status: number,
    operation: (
      context: Readonly<{
        actor: PaymentCashierActorContext;
        idempotencyKey: string;
      }>,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const context = {
          actor: await this.actor(request),
          idempotencyKey: paymentCashierIdempotencyKeyFromRequest(request),
        };
        this.send(request, response, status, await operation(context, request));
      } catch (error) {
        next(error);
      }
    };
  }

  private body(request: Request): never {
    return validatedPaymentCashierPart(request, 'body') as never;
  }

  private query(request: Request): PaymentCashierListQuery {
    return validatedPaymentCashierPart<PaymentCashierListQuery>(request, 'query');
  }

  public listPaymentMethods = this.read(200, (actor, request) =>
    this.application.services.paymentMethods.list(actor, this.query(request)));
  public getPaymentMethod = this.read(200, (actor, request) =>
    this.application.services.paymentMethods.get(actor, this.parameter(request, 'methodId')));
  public createPaymentMethod = this.mutation(201, (context, request) =>
    this.application.services.paymentMethods.create(context, this.body(request)));
  public updatePaymentMethod = this.mutation(200, (context, request) =>
    this.application.services.paymentMethods.update(context, this.parameter(request, 'methodId'), this.body(request)));
  public changePaymentMethodStatus = this.mutation(200, (context, request) =>
    this.application.services.paymentMethods.changeStatus(context, this.parameter(request, 'methodId'), this.body(request)));

  public listCounters = this.read(200, (actor, request) =>
    this.application.services.counters.list(actor, this.query(request)));
  public getCounter = this.read(200, (actor, request) =>
    this.application.services.counters.get(actor, this.parameter(request, 'counterId')));
  public createCounter = this.mutation(201, (context, request) =>
    this.application.services.counters.create(context, this.body(request)));
  public updateCounter = this.mutation(200, (context, request) =>
    this.application.services.counters.update(context, this.parameter(request, 'counterId'), this.body(request)));
  public changeCounterStatus = this.mutation(200, (context, request) =>
    this.application.services.counters.changeStatus(context, this.parameter(request, 'counterId'), this.body(request)));
  public assignCounterUsers = this.mutation(200, (context, request) =>
    this.application.services.counters.assignUsers(context, this.parameter(request, 'counterId'), this.body(request)));

  public listShifts = this.read(200, (actor, request) =>
    this.application.services.shifts.list(actor, this.query(request)));
  public getShift = this.read(200, (actor, request) =>
    this.application.services.shifts.get(actor, this.parameter(request, 'shiftId')));
  public openShift = this.mutation(201, (context, request) =>
    this.application.services.shifts.open(context, this.body(request)));
  public suspendShift = this.mutation(200, (context, request) =>
    this.application.services.shifts.suspend(context, this.parameter(request, 'shiftId'), this.body(request)));
  public resumeShift = this.mutation(200, (context, request) =>
    this.application.services.shifts.resume(context, this.parameter(request, 'shiftId'), this.body(request)));
  public handoverShift = this.mutation(200, (context, request) =>
    this.application.services.shifts.handover(context, this.parameter(request, 'shiftId'), this.body(request)));
  public reopenShift = this.mutation(201, (context, request) =>
    this.application.services.shifts.reopen(context, this.parameter(request, 'shiftId'), this.body(request)));

  public getReconciliation = this.read(200, (actor, request) =>
    this.application.services.reconciliations.get(actor, this.parameter(request, 'shiftId')));
  public beginClosing = this.mutation(201, (context, request) =>
    this.application.services.reconciliations.beginClosing(context, this.parameter(request, 'shiftId'), this.body(request)));
  public approveShiftControl = this.mutation(200, (context, request) =>
    this.application.services.reconciliations.approveShiftControl(context, this.parameter(request, 'shiftId'), this.body(request)));
  public closeShift = this.mutation(200, (context, request) =>
    this.application.services.reconciliations.close(context, this.parameter(request, 'shiftId'), this.body(request)));

  public getPaymentIntent = this.read(200, (actor, request) =>
    this.application.services.paymentIntents.get(actor, this.parameter(request, 'intentId')));
  public createPaymentIntent = this.mutation(201, (context, request) =>
    this.application.services.paymentIntents.create(context, this.body(request)));
  public authorizePaymentIntent = this.mutation(200, (context, request) =>
    this.application.services.paymentIntents.authorize(context, this.parameter(request, 'intentId'), this.body(request)));
  public cancelPaymentIntent = this.mutation(200, (context, request) =>
    this.application.services.paymentIntents.cancel(context, this.parameter(request, 'intentId'), this.body(request)));

  public listPayments = this.read(200, (actor, request) =>
    this.application.services.reports.listPayments(actor, this.query(request)));
  public getPayment = this.read(200, (actor, request) =>
    this.application.services.reports.getPayment(actor, this.parameter(request, 'paymentId')));
  public collectPayment = this.mutation(201, (context, request) =>
    this.application.services.payments.collect(context, this.body(request)));
  public allocatePayment = this.mutation(200, (context, request) =>
    this.application.services.payments.allocate(context, this.parameter(request, 'paymentId'), this.body(request)));

  public getReceipt = this.read(200, (actor, request) =>
    this.application.services.receipts.get(actor, this.parameter(request, 'receiptId')));
  public reprintReceipt = this.mutation(201, (context, request) =>
    this.application.services.receipts.reprint(context, this.parameter(request, 'receiptId'), this.body(request)));

  public listDeposits = this.read(200, (actor, request) =>
    this.application.services.deposits.list(actor, this.query(request)));
  public getDeposit = this.read(200, (actor, request) =>
    this.application.services.deposits.get(actor, this.parameter(request, 'depositId')));
  public createDeposit = this.mutation(201, (context, request) =>
    this.application.services.deposits.create(context, this.body(request)));
  public applyDeposit = this.mutation(201, (context, request) =>
    this.application.services.deposits.apply(context, this.parameter(request, 'depositId'), this.body(request)));
  public transferDeposit = this.mutation(201, (context, request) =>
    this.application.services.deposits.transfer(context, this.parameter(request, 'depositId'), this.body(request)));

  public getRefundRequest = this.read(200, (actor, request) =>
    this.application.services.refundsAndReversals.getRefundRequest(actor, this.parameter(request, 'requestId')));
  public getRefund = this.read(200, (actor, request) =>
    this.application.services.reports.getRefund(actor, this.parameter(request, 'refundId')));
  public requestRefund = this.mutation(201, (context, request) =>
    this.application.services.refundsAndReversals.requestRefund(context, this.body(request)));
  public decideRefundRequest = this.mutation(200, (context, request) =>
    this.application.services.refundsAndReversals.decideRefundRequest(context, this.parameter(request, 'requestId'), this.body(request)));
  public processRefund = this.mutation(201, (context, request) =>
    this.application.services.refundsAndReversals.processRefund(context, this.parameter(request, 'requestId'), this.body(request)));
  public reverseRefund = this.mutation(200, (context, request) =>
    this.application.services.refundsAndReversals.reverseRefund(context, this.parameter(request, 'refundId'), this.body(request)));

  public getPaymentReversal = this.read(200, (actor, request) =>
    this.application.services.reports.getReversal(actor, this.parameter(request, 'reversalId')));
  public requestPaymentReversal = this.mutation(201, (context, request) =>
    this.application.services.refundsAndReversals.requestPaymentReversal(context, this.body(request)));
  public decidePaymentReversal = this.mutation(200, (context, request) =>
    this.application.services.refundsAndReversals.decidePaymentReversal(context, this.parameter(request, 'reversalId'), this.body(request)));
  public postPaymentReversal = this.mutation(200, (context, request) =>
    this.application.services.refundsAndReversals.postPaymentReversal(context, this.parameter(request, 'reversalId'), this.body(request)));

  public listCashMovements = this.read(200, (actor, request) =>
    this.application.services.cashMovements.list(actor, this.query(request)));
  public getCashMovement = this.read(200, (actor, request) =>
    this.application.services.cashMovements.get(actor, this.parameter(request, 'movementId')));
  public createCashMovement = this.mutation(201, (context, request) =>
    this.application.services.cashMovements.create(context, this.body(request)));
  public decideCashMovement = this.mutation(200, (context, request) =>
    this.application.services.cashMovements.decide(context, this.parameter(request, 'movementId'), this.body(request)));
  public postCashMovement = this.mutation(200, (context, request) =>
    this.application.services.cashMovements.post(context, this.parameter(request, 'movementId'), this.body(request)));

  public shiftSummary = this.read(200, (actor, request) =>
    this.application.services.reports.shiftSummary(actor, this.parameter(request, 'shiftId')));
  public operationalExceptions = this.read(200, (actor) =>
    this.application.services.reports.countOperationalExceptions(actor));
  public exportPayments: RequestHandler = async (request, response, next) => {
    try {
      const report = await this.application.services.reports.exportPaymentsCsv(
        await this.actor(request),
        this.query(request),
      );
      response
        .status(200)
        .type(report.contentType)
        .attachment(report.filename)
        .send(report.content);
    } catch (error) {
      next(error);
    }
  };

  public runRecovery = this.read(200, async (actor, request) => {
    const body = validatedPaymentCashierPart<{ limit?: number }>(request, 'body');
    return this.application.services.recovery.run(actor, body.limit ?? 100);
  });
}