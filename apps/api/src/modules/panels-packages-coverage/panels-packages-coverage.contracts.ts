import type {
  NextFunction,
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
  PanelsPackagesCoverageApplication,
} from './panels-packages-coverage.application.js';

import type {
  PpcReportQuery,
} from './services/panels-packages-coverage-report.service.js';

import {
  ppcActorFromRequest,
  ppcIdempotencyKeyFromRequest,
  validatedPpcPart,
} from './panels-packages-coverage.http-contracts.js';

export class PanelsPackagesCoverageController {
  public constructor(
    private readonly application: PanelsPackagesCoverageApplication,
    private readonly authorization: AuthorizationService,
  ) {}

  public createPanel = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.panels.create(
        actor,
        key,
        this.body(request),
      ),
  );

  public createPayer = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.coverageMaster.createPayer(
        actor,
        key,
        this.body(request),
      ),
  );

  public createCoveragePlan = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.coverageMaster.createPlan(
        actor,
        key,
        this.body(request),
      ),
  );

  public enrollCoverage = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.coverageMaster.enrollPatient(
        actor,
        key,
        this.body(request),
      ),
  );

  public verifyCoverage = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.verification.verify(
        actor,
        this.parameter(request, 'coverageId'),
        key,
        this.body(request),
      ),
  );

  public enrollPackage = this.mutation(
    201,
    (actor, key, request) =>
      this.application.services.packages.enroll(
        actor,
        key,
        this.body(request),
      ),
  );

  public reservePackage = this.mutation(
    201,
    (actor, key, request) => {
      const body = this.body<
        Readonly<{
          expectedBalanceVersion: number;
        }> &
        Record<string, unknown>
      >(request);

      return this.application.services.packages.reserveUtilization(
        actor,
        body.expectedBalanceVersion,
        {
          ...body,
          idempotencyKey: key,
        } as never,
      );
    },
  );

  public reversePackage = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.packages.reverseUtilization(
        actor,
        this.parameter(request, 'utilizationId'),
        key,
        this.body(request),
      ),
  );

  public estimateCoverage = this.mutation(
    200,
    (actor, _key, request) =>
      this.application.services.determinations.estimate(
        actor,
        this.body(request),
      ),
  );

  public determineCoverage = this.mutation(
    201,
    (actor, key, request) => {
      const body = this.body<
        Readonly<{
          expectedInvoiceVersion: number;
        }> &
        Record<string, unknown>
      >(request);

      return this.application.services.determinations.determine(
        actor,
        body.expectedInvoiceVersion,
        {
          ...body,
          idempotencyKey: key,
        } as never,
      );
    },
  );

  public changePanelStatus = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls.changePanelStatus(
        actor,
        this.parameter(request, 'panelId'),
        key,
        this.body(request),
      ),
  );

  public changePackageStatus = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls.changePackageStatus(
        actor,
        this.parameter(request, 'packageId'),
        key,
        this.body(request),
      ),
  );

  public changeCoveragePlanStatus = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls.changeCoveragePlanStatus(
        actor,
        this.parameter(request, 'planId'),
        key,
        this.body(request),
      ),
  );

  public overrideDetermination = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls
        .overrideDetermination(
          actor,
          this.parameter(request, 'determinationId'),
          key,
          this.body(request),
        ),
  );

  public reverseDetermination = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls
        .reverseDetermination(
          actor,
          this.parameter(request, 'determinationId'),
          key,
          this.body(request),
        ),
  );

  public applyRefundEffects = this.mutation(
    200,
    (actor, key, request) =>
      this.application.services.financialControls
        .applyRefundEffects(actor, key, this.body(request)),
  );

  public packageUtilizationReport = this.read(
    (actor, request) =>
      this.application.services.reports.packageUtilization(
        actor,
        this.query(request),
      ),
  );

  public coverageUtilizationReport = this.read(
    (actor, request) =>
      this.application.services.reports.coverageUtilization(
        actor,
        this.query(request),
      ),
  );

  public benefitBalanceReport = this.read(
    (actor, request) =>
      this.application.services.reports.benefitBalances(
        actor,
        this.query(request),
      ),
  );

  public exportReport = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const actor = await ppcActorFromRequest(
        request,
        this.authorization,
      );
      const report = this.parameter(request, 'report') as
        | 'package-utilization'
        | 'coverage-utilization'
        | 'benefit-balances';
      const query = this.query(request);

      if (query.async === true) {
        this.send(
          request,
          response,
          202,
          await this.application.services.reports.queueCsvExport(
            actor,
            report,
            query,
          ),
        );
        return;
      }

      const exported =
        await this.application.services.reports.exportCsv(
          actor,
          report,
          query,
        );

      response
        .status(200)
        .setHeader('content-type', exported.contentType)
        .setHeader(
          'content-disposition',
          `attachment; filename="${exported.filename}"`,
        )
        .send(exported.content);
    } catch (error) {
      next(error);
    }
  };

  public runRecovery = this.mutation(
    200,
    async (actor, _key, request) => {
      const body = this.body<
        Readonly<{
          limit: number;
        }>
      >(request);

      const markedStale =
        await this.application.services.recovery
          .markStaleTransactions(
            new Date(Date.now() - 5 * 60_000),
          );

      const recovered =
        await this.application.services.recovery
          .recoverAvailable({
            workerId: `manual-ppc-recovery:${actor.userId}`,
            maxTransactions: body.limit,
            now: new Date(),
          });

      return {
        markedStale,
        ...recovered,
      };
    },
  );

  private parameter(
    request: Request,
    key: string,
  ): string {
    const value = validatedPpcPart<
      Record<string, string | undefined>
    >(request, 'params')[key];

    if (value === undefined) {
      throw new ResourceNotFoundError(
        `Route parameter ${key} is unavailable`,
      );
    }

    return value;
  }

  private body<T>(
    request: Request,
  ): T {
    return validatedPpcPart<T>(request, 'body');
  }

  private query(
    request: Request,
  ): PpcReportQuery {
    return validatedPpcPart<PpcReportQuery>(request, 'query');
  }

  private send(
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ): void {
    response
      .status(status)
      .json(createApiSuccess(result, request.correlationId));
  }

  private mutation(
    status: number,
    operation: (
      actor: Awaited<ReturnType<typeof ppcActorFromRequest>>,
      key: string,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await ppcActorFromRequest(
          request,
          this.authorization,
        );
        const key = ppcIdempotencyKeyFromRequest(request);
        const result = await operation(actor, key, request);
        this.send(request, response, status, result);
      } catch (error) {
        next(error);
      }
    };
  }

  private read(
    operation: (
      actor: Awaited<ReturnType<typeof ppcActorFromRequest>>,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await ppcActorFromRequest(
          request,
          this.authorization,
        );
        const result = await operation(actor, request);
        this.send(request, response, 200, result);
      } catch (error) {
        next(error);
      }
    };
  }
}