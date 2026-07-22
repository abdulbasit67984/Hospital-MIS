import type { Request, RequestHandler, Response } from 'express';

import {
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { WelfareZakatApplication } from './welfare-zakat.application.js';
import type {
  WelfareZakatListQuery,
  WelfareZakatReportName,
  WelfareZakatReportQuery,
  WelfareZakatRecoveryRunInput,
} from './welfare-zakat.contracts.js';
import {
  validatedWelfareZakatPart,
  welfareZakatActorFromRequest,
  welfareZakatIdempotencyKeyFromRequest,
} from './welfare-zakat.http-contracts.js';
import type { ReleaseAssistanceReservationInput } from './services/assistance-reservation.service.js';
import type { AssistanceFundReturnType } from './services/assistance-reversal-return.service.js';
import type {
  DecideFundTransferInput,
  ReverseFundTransferInput,
} from './services/assistance-fund-transfer.service.js';

export class WelfareZakatController {
  public constructor(
    private readonly application: WelfareZakatApplication,
    private readonly authorization: AuthorizationService,
  ) {}

  private parameter(request: Request, name = 'id'): string {
    const value = validatedWelfareZakatPart<Record<string, string | undefined>>(
      request,
      'params',
    )[name];
    if (value === undefined) {
      throw new ResourceNotFoundError(`Route parameter ${name} is unavailable`);
    }
    return value;
  }

  private body<T>(request: Request): T {
    return validatedWelfareZakatPart<T>(request, 'body');
  }

  private query(request: Request): WelfareZakatListQuery {
    return validatedWelfareZakatPart<WelfareZakatListQuery>(request, 'query');
  }


  private reportQuery(request: Request): WelfareZakatReportQuery {
    return validatedWelfareZakatPart<WelfareZakatReportQuery>(request, 'query');
  }

  private reportName(request: Request): WelfareZakatReportName {
    const value = validatedWelfareZakatPart<Readonly<{ report?: WelfareZakatReportName }>>(
      request,
      'params',
    ).report;
    if (value === undefined) {
      throw new ResourceNotFoundError('The requested Welfare and Zakat report was not found');
    }
    return value;
  }

  private send(
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ): void {
    response.status(status).json(createApiSuccess(result, request.correlationId));
  }

  private read(
    operation: (
      actor: Awaited<ReturnType<typeof welfareZakatActorFromRequest>>,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await welfareZakatActorFromRequest(
          request,
          this.authorization,
        );
        this.send(request, response, 200, await operation(actor, request));
      } catch (error) {
        next(error);
      }
    };
  }

  private mutation(
    status: number,
    operation: (
      actor: Awaited<ReturnType<typeof welfareZakatActorFromRequest>>,
      idempotencyKey: string,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await welfareZakatActorFromRequest(
          request,
          this.authorization,
        );
        const idempotencyKey = welfareZakatIdempotencyKeyFromRequest(request);
        this.send(
          request,
          response,
          status,
          await operation(actor, idempotencyKey, request),
        );
      } catch (error) {
        next(error);
      }
    };
  }

  public listFunds = this.read((actor, request) =>
    this.application.services.funds.list(actor, this.query(request)));

  public getFund = this.read((actor, request) =>
    this.application.services.funds.get(actor, this.parameter(request)));

  public listFundTransactions = this.read((actor, request) =>
    this.application.services.funds.listTransactions(
      actor,
      this.parameter(request),
      this.query(request),
    ));

  public createFund = this.mutation(201, (actor, key, request) =>
    this.application.services.funds.create(actor, key, this.body(request)));

  public updateFund = this.mutation(200, (actor, key, request) =>
    this.application.services.funds.update(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public changeFundStatus = this.mutation(200, (actor, key, request) =>
    this.application.services.funds.changeStatus(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public recordFundInflow = this.mutation(201, (actor, key, request) =>
    this.application.services.donations.recordInflow(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public reconcileFund = this.mutation(200, (actor, key, request) => {
    const body = this.body<Readonly<{ asOf?: string }>>(request);
    return this.application.services.reconciliation.reconcileFund(
      actor,
      this.parameter(request),
      key,
      body.asOf === undefined ? undefined : new Date(body.asOf),
    );
  });

  public listApplications = this.read((actor, request) =>
    this.application.services.applications.list(actor, this.query(request)));

  public getApplication = this.read((actor, request) =>
    this.application.services.applications.get(actor, this.parameter(request)));

  public createApplication = this.mutation(201, (actor, key, request) =>
    this.application.services.applications.create(actor, key, this.body(request)));

  public updateApplication = this.mutation(200, (actor, key, request) =>
    this.application.services.applications.update(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public submitApplication = this.mutation(200, (actor, key, request) =>
    this.application.services.applications.submit(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public requestApplicationInformation = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.applications.requestInformation(
        actor,
        this.parameter(request),
        key,
        this.body(request),
      ),
  );

  public recordApplicationReview = this.mutation(201, (actor, key, request) =>
    this.application.services.applications.recordReview(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public evaluateApplication = this.mutation(200, (actor, key, request) => {
    const body = this.body<Readonly<{ fundId: string }>>(request);
    return this.application.services.eligibility.evaluate(
      actor,
      this.parameter(request),
      body.fundId,
      key,
    );
  });

  public requestApproval = this.mutation(201, (actor, key, request) =>
    this.application.services.approvals.request(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public listApplicationApprovals = this.read((actor, request) =>
    this.application.services.approvals.listByApplication(
      actor,
      this.parameter(request),
    ));

  public getApproval = this.read((actor, request) =>
    this.application.services.approvals.get(actor, this.parameter(request)));

  public decideApproval = this.mutation(200, (actor, key, request) =>
    this.application.services.approvals.decide(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public reserveFunds = this.mutation(201, (actor, key, request) =>
    this.application.services.reservations.reserve(
      actor,
      key,
      this.body(request),
    ));

  public releaseReservation = this.mutation(200, (actor, key, request) =>
    this.application.services.reservations.release(
      actor,
      this.parameter(request),
      key,
      this.body<ReleaseAssistanceReservationInput>(request),
    ));

  public listAllocations = this.read((actor, request) =>
    this.application.services.allocations.list(actor, this.query(request)));

  public getAllocation = this.read((actor, request) =>
    this.application.services.allocations.get(actor, this.parameter(request)));

  public createAllocation = this.mutation(201, (actor, key, request) =>
    this.application.services.allocations.create(actor, key, this.body(request)));

  public confirmAllocation = this.mutation(200, (actor, key, request) =>
    this.application.services.allocations.confirmAndUtilize(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public requestAllocationReversal = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.reversalsAndReturns.requestReversal(
        actor,
        this.parameter(request),
        key,
        this.body(request),
      ),
  );

  public approveAllocationReversal = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.reversalsAndReturns.approveAndPostReversal(
        actor,
        this.parameter(request),
        key,
      ),
  );

  private fundReturn(returnType: AssistanceFundReturnType): RequestHandler {
    return this.mutation(201, (actor, key, request) =>
      this.application.services.reversalsAndReturns.postFundReturn(
        actor,
        this.parameter(request),
        key,
        { returnType, input: this.body(request) },
      ));
  }

  public postRefund = this.fundReturn('REFUND');
  public postRepayment = this.fundReturn('REPAYMENT');
  public postRecovery = this.fundReturn('RECOVERY');

  public reconcileAllocation = this.mutation(200, (actor, key, request) =>
    this.application.services.reconciliation.reconcileAllocation(
      actor,
      this.parameter(request),
      key,
    ));

  public listWorkItems = this.read((actor, request) =>
    this.application.services.workQueue.list(actor, this.query(request)));

  public getWorkItem = this.read((actor, request) =>
    this.application.services.workQueue.get(actor, this.parameter(request)));

  public assignWorkItem = this.mutation(200, (actor, key, request) =>
    this.application.services.workQueue.assign(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public escalateWorkItem = this.mutation(200, (actor, key, request) =>
    this.application.services.workQueue.escalate(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public listTransfers = this.read((actor, request) =>
    this.application.services.transfers.list(actor, this.query(request)));

  public getTransfer = this.read((actor, request) =>
    this.application.services.transfers.get(actor, this.parameter(request)));

  public requestTransfer = this.mutation(201, (actor, key, request) =>
    this.application.services.transfers.request(actor, key, this.body(request)));

  public decideTransfer = this.mutation(200, (actor, key, request) =>
    this.application.services.transfers.decide(
      actor,
      this.parameter(request),
      key,
      this.body<DecideFundTransferInput>(request),
    ));

  public reverseTransfer = this.mutation(200, (actor, key, request) =>
    this.application.services.transfers.reverse(
      actor,
      this.parameter(request),
      key,
      this.body<ReverseFundTransferInput>(request),
    ));

  public runReport = this.read((actor, request) =>
    this.application.services.reports.run(
      actor,
      this.reportName(request),
      this.reportQuery(request),
    ));

  public exportReport: RequestHandler = async (request, response, next) => {
    try {
      const actor = await welfareZakatActorFromRequest(request, this.authorization);
      const exported = await this.application.services.reports.exportCsv(
        actor,
        this.reportName(request),
        this.reportQuery(request),
      );
      response.status(200);
      response.setHeader('content-type', exported.contentType);
      response.setHeader(
        'content-disposition',
        `attachment; filename="${exported.filename.replaceAll('\"', '')}"`,
      );
      response.send(exported.content);
    } catch (error) {
      next(error);
    }
  };

  public queueReportExport = this.mutation(202, (actor, key, request) =>
    this.application.services.reports.queueCsvExport(
      actor,
      key,
      this.reportName(request),
      this.reportQuery(request),
    ));

  public runRecovery = this.mutation(200, (actor, key, request) =>
    this.application.services.recovery.runManual(
      actor,
      key,
      this.body<WelfareZakatRecoveryRunInput>(request),
    ));

}