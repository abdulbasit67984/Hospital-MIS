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
  ClaimsApplication,
} from './claims.application.js';

import type {
  ClaimsListQuery,
  ClaimsRecoveryRunInput,
  ClaimsReportName,
  ClaimsReportQuery,
  SubmitClaimBatchInput,
} from './claims.contracts.js';

import {
  claimsActorFromRequest,
  claimsIdempotencyKeyFromRequest,
  validatedClaimsPart,
} from './claims.http-contracts.js';

import type {
  SensitiveClaimLifecycleInput,
} from './services/claim-sensitive-lifecycle.service.js';

export class ClaimsController {
  public constructor(
    private readonly application: ClaimsApplication,
    private readonly authorization: AuthorizationService,
  ) {}

  private parameter(request: Request, key: string): string {
    const value = validatedClaimsPart<Record<string, string | undefined>>(
      request,
      'params',
    )[key];
    if (value === undefined) {
      throw new ResourceNotFoundError(`Route parameter ${key} is unavailable`);
    }
    return value;
  }

  private body<T>(request: Request): T {
    return validatedClaimsPart<T>(request, 'body');
  }

  private query(request: Request): ClaimsListQuery {
    return validatedClaimsPart<ClaimsListQuery>(request, 'query');
  }

  private reportQuery(request: Request): ClaimsReportQuery {
    return validatedClaimsPart<ClaimsReportQuery>(request, 'query');
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
      actor: Awaited<ReturnType<typeof claimsActorFromRequest>>,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await claimsActorFromRequest(request, this.authorization);
        this.send(request, response, 200, await operation(actor, request));
      } catch (error) {
        next(error);
      }
    };
  }

  private mutation(
    status: number,
    operation: (
      actor: Awaited<ReturnType<typeof claimsActorFromRequest>>,
      idempotencyKey: string,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await claimsActorFromRequest(request, this.authorization);
        const key = claimsIdempotencyKeyFromRequest(request);
        this.send(request, response, status, await operation(actor, key, request));
      } catch (error) {
        next(error);
      }
    };
  }


  public runReport = this.read((actor, request) =>
    this.application.services.reporting.run(
      actor,
      this.parameter(request, 'reportName') as ClaimsReportName,
      this.reportQuery(request),
    ));

  public exportReportCsv: RequestHandler = async (request, response, next) => {
    try {
      const actor = await claimsActorFromRequest(request, this.authorization);
      const exported = await this.application.services.reporting.exportCsv(
        actor,
        this.parameter(request, 'reportName') as ClaimsReportName,
        this.reportQuery(request),
      );
      response
        .status(200)
        .type(exported.contentType)
        .attachment(exported.filename)
        .send(exported.content);
    } catch (error) {
      next(error);
    }
  };

  public queueReportExport = this.mutation(202, (actor, key, request) =>
    this.application.services.reporting.queueCsvExport(
      actor,
      key,
      this.parameter(request, 'reportName') as ClaimsReportName,
      this.reportQuery(request),
    ));

  public runRecovery = this.mutation(200, (actor, key, request) =>
    this.application.services.recovery.run(
      actor,
      key,
      this.body<ClaimsRecoveryRunInput>(request),
    ));

  public listClaims = this.read((actor, request) =>
    this.application.services.preparation.list(actor, this.query(request)));

  public getClaim = this.read((actor, request) =>
    this.application.services.preparation.get(
      actor,
      this.parameter(request, 'claimId'),
    ));

  public createClaim = this.mutation(201, (actor, key, request) =>
    this.application.services.preparation.create(actor, key, this.body(request)));

  public updateDraft = this.mutation(200, (actor, key, request) =>
    this.application.services.preparation.updateDraft(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public validateClaim = this.mutation(200, (actor, key, request) =>
    this.application.services.validation.validate(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public markReady = this.mutation(200, (actor, key, request) =>
    this.application.services.workflow.markReady(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public listBatches = this.read((actor, request) =>
    this.application.services.batches.list(actor, this.query(request)));

  public getBatch = this.read((actor, request) =>
    this.application.services.batches.get(
      actor,
      this.parameter(request, 'claimBatchId'),
    ));

  public createBatch = this.mutation(201, (actor, key, request) =>
    this.application.services.batches.create(actor, key, this.body(request)));

  public approveBatch = this.mutation(200, (actor, key, request) =>
    this.application.services.batches.approve(
      actor,
      this.parameter(request, 'claimBatchId'),
      key,
      this.body(request),
    ));

  public submitBatch = this.mutation(202, (actor, key, request) => {
    const body = this.body<Omit<SubmitClaimBatchInput, 'idempotencyKey'>>(request);
    return this.application.services.submissions.queue(
      actor,
      this.parameter(request, 'claimBatchId'),
      { ...body, idempotencyKey: key },
    );
  });

  public acknowledgeBatch = this.mutation(200, (actor, key, request) =>
    this.application.services.submissions.acknowledge(
      actor,
      this.parameter(request, 'claimBatchId'),
      key,
      this.body(request),
    ));

  public recordAdjudication = this.mutation(201, (actor, key, request) =>
    this.application.services.adjudication.record(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public importRemittance = this.mutation(201, (actor, key, request) =>
    this.application.services.remittances.importRemittance(
      actor,
      key,
      this.body(request),
    ));

  public postClaimPayment = this.mutation(201, (actor, key, request) =>
    this.application.services.remittances.postClaimPayment(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public requestAdjustment = this.mutation(201, (actor, key, request) =>
    this.application.services.adjustments.requestAdjustment(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public requestWriteOff = this.mutation(201, (actor, key, request) =>
    this.application.services.adjustments.requestWriteOff(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public approveAdjustment = this.mutation(200, (actor, key, request) =>
    this.application.services.adjustments.approveAndPost(
      actor,
      this.parameter(request, 'adjustmentId'),
      key,
      this.body(request),
    ));

  public createAppeal = this.mutation(201, (actor, key, request) =>
    this.application.services.denialsAndAppeals.createAppeal(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body(request),
    ));

  public approveAppeal = this.mutation(200, (actor, key, request) =>
    this.application.services.denialsAndAppeals.approveAppeal(
      actor,
      this.parameter(request, 'appealId'),
      key,
      this.body(request),
    ));

  public submitAppeal = this.mutation(202, (actor, key, request) =>
    this.application.services.denialsAndAppeals.submitAppeal(
      actor,
      this.parameter(request, 'appealId'),
      key,
      this.body(request),
    ));

  public recordAppealDecision = this.mutation(200, (actor, key, request) =>
    this.application.services.denialsAndAppeals.recordDecision(
      actor,
      this.parameter(request, 'appealId'),
      key,
      this.body(request),
    ));

  public listWorkItems = this.read((actor, request) =>
    this.application.services.workQueue.list(actor, this.query(request)));

  public getWorkItem = this.read((actor, request) =>
    this.application.services.workQueue.get(
      actor,
      this.parameter(request, 'workItemId'),
    ));

  public assignWorkItem = this.mutation(200, (actor, key, request) =>
    this.application.services.workQueue.assign(
      actor,
      this.parameter(request, 'workItemId'),
      key,
      this.body(request),
    ));

  public escalateWorkItem = this.mutation(200, (actor, key, request) =>
    this.application.services.workQueue.escalate(
      actor,
      this.parameter(request, 'workItemId'),
      key,
      this.body(request),
    ));

  public resolveWorkItem = this.mutation(200, (actor, key, request) => {
    const body = this.body<{ expectedVersion: number; reason: string }>(request);
    return this.application.services.workQueue.resolve(
      actor,
      this.parameter(request, 'workItemId'),
      body.expectedVersion,
      key,
      body.reason,
    );
  });

  public reconcileClaim = this.mutation(200, (actor, key, request) => {
    const body = this.body<{ expectedVersion: number; reason: string }>(request);
    return this.application.services.reconciliation.reconcile(
      actor,
      this.parameter(request, 'claimId'),
      body.expectedVersion,
      key,
      body.reason,
    );
  });

  public cancelClaim = this.mutation(200, (actor, key, request) =>
    this.application.services.sensitiveLifecycle.cancel(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body<SensitiveClaimLifecycleInput>(request),
    ));

  public reverseClaim = this.mutation(200, (actor, key, request) =>
    this.application.services.sensitiveLifecycle.reverse(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body<SensitiveClaimLifecycleInput>(request),
    ));

  public voidClaim = this.mutation(200, (actor, key, request) =>
    this.application.services.sensitiveLifecycle.voidClaim(
      actor,
      this.parameter(request, 'claimId'),
      key,
      this.body<SensitiveClaimLifecycleInput>(request),
    ));
}