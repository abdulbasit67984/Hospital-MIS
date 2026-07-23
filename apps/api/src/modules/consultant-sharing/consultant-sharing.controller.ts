import type { Request, RequestHandler, Response } from 'express';

import {
  ForbiddenError,
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { ConsultantSharingApplication } from './consultant-sharing.application.js';
import {
  CONSULTANT_SHARING_PERMISSION_KEYS,
  type ConsultantAgreementStatus,
  type ConsultantDisputeStatus,
  type ConsultantSettlementStatus,
} from './consultant-sharing.constants.js';
import type {
  ConsultantAgreementView,
  ConsultantSharingActorContext,
  ConsultantSharingListQuery,
} from './consultant-sharing.contracts.js';
import type {
  ConsultantSharingRecoveryRunInput,
  ConsultantSharingReportName,
  ConsultantSharingReportQuery,
} from './consultant-sharing.reporting.contracts.js';
import {
  consultantSharingActorFromRequest,
  consultantSharingIdempotencyKeyFromRequest,
  type ConsultantSharingActorIdentityResolver,
  validatedConsultantSharingPart,
} from './consultant-sharing.http-contracts.js';

interface AgreementTransitionBody {
  expectedVersion: number;
  reason: string;
  approvalRequestId?: string | null;
}

interface SettlementTransitionBody {
  expectedVersion: number;
  reason: string;
  approvalRequestId?: string | null;
}

interface DisputeTransitionBody {
  expectedVersion: number;
  reason: string;
  approvedAdjustmentAmount?: string;
  approvalRequestId?: string | null;
  adjustmentApprovalRequestId?: string | null;
  attachmentIds?: readonly string[];
}

export class ConsultantSharingController {
  public constructor(
    private readonly application: ConsultantSharingApplication,
    private readonly authorization: AuthorizationService,
    private readonly actorIdentityResolver: ConsultantSharingActorIdentityResolver,
  ) {}

  private parameter(request: Request, name = 'id'): string {
    const value = validatedConsultantSharingPart<
      Record<string, string | undefined>
    >(request, 'params')[name];
    if (value === undefined) {
      throw new ResourceNotFoundError(
        `Route parameter ${name} is unavailable`,
      );
    }
    return value;
  }

  private body<T>(request: Request): T {
    return validatedConsultantSharingPart<T>(request, 'body');
  }

  private query(request: Request): ConsultantSharingListQuery {
    return validatedConsultantSharingPart<ConsultantSharingListQuery>(
      request,
      'query',
    );
  }

  private reportQuery(request: Request): ConsultantSharingReportQuery {
    return validatedConsultantSharingPart<ConsultantSharingReportQuery>(
      request,
      'query',
    );
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

  private async actor(request: Request): Promise<ConsultantSharingActorContext> {
    return consultantSharingActorFromRequest(
      request,
      this.authorization,
      this.actorIdentityResolver,
    );
  }

  private read(
    operation: (
      actor: ConsultantSharingActorContext,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await this.actor(request);
        this.send(request, response, 200, await operation(actor, request));
      } catch (error) {
        next(error);
      }
    };
  }

  private mutation(
    status: number,
    operation: (
      actor: ConsultantSharingActorContext,
      idempotencyKey: string,
      request: Request,
    ) => Promise<unknown>,
  ): RequestHandler {
    return async (request, response, next) => {
      try {
        const actor = await this.actor(request);
        const idempotencyKey =
          consultantSharingIdempotencyKeyFromRequest(request);
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

  private selfScopedQuery(
    actor: ConsultantSharingActorContext,
    query: ConsultantSharingListQuery,
  ): ConsultantSharingListQuery {
    const consultantSelfAccess =
      actor.roleKeys.includes('CONSULTANT')
      && !actor.permissionKeys.has(
        CONSULTANT_SHARING_PERMISSION_KEYS.READ_SENSITIVE,
      );
    if (!consultantSelfAccess) return query;
    if (actor.staffId === null) {
      throw new ForbiddenError(
        'Consultant self-access requires a linked staff record',
      );
    }
    if (query.consultantId !== undefined && query.consultantId !== actor.staffId) {
      throw new ForbiddenError(
        'Consultants may only access their own financial records',
      );
    }
    return { ...query, consultantId: actor.staffId };
  }

  private assertAgreementSelfAccess(
    actor: ConsultantSharingActorContext,
    agreement: ConsultantAgreementView,
  ): void {
    if (
      actor.roleKeys.includes('CONSULTANT')
      && !actor.permissionKeys.has(
        CONSULTANT_SHARING_PERMISSION_KEYS.READ_SENSITIVE,
      )
      && agreement.consultantStaffId !== actor.staffId
    ) {
      throw new ForbiddenError(
        'Consultants may only access their own agreements',
      );
    }
  }

  public listAgreements = this.read((actor, request) =>
    this.application.services.agreements.list(
      actor,
      this.selfScopedQuery(actor, this.query(request)),
    ));

  public getAgreement = this.read(async (actor, request) => {
    const result = await this.application.services.agreements.get(
      actor,
      this.parameter(request),
    );
    this.assertAgreementSelfAccess(actor, result.agreement);
    return result;
  });

  public createAgreement = this.mutation(201, (actor, key, request) =>
    this.application.services.agreements.create(
      actor,
      key,
      this.body(request),
    ));

  public updateAgreement = this.mutation(200, (actor, key, request) =>
    this.application.services.agreements.updateDraft(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public amendAgreement = this.mutation(201, (actor, key, request) =>
    this.application.services.agreements.amend(
      actor,
      this.parameter(request),
      key,
      this.body(request),
    ));

  public agreementTransition(
    targetStatus: ConsultantAgreementStatus,
  ): RequestHandler {
    return this.mutation(200, (actor, key, request) => {
      const body = this.body<AgreementTransitionBody>(request);
      return this.application.services.agreementApprovals.changeStatus(
        actor,
        this.parameter(request),
        key,
        { ...body, targetStatus },
      );
    });
  }

  public listRevenueEntries = this.read((actor, request) =>
    this.application.repositories.revenueEntries.list({
      facilityId: actor.facilityId,
      query: this.selfScopedQuery(actor, this.query(request)),
    }));

  public calculateRevenue = this.mutation(201, (actor, key, request) =>
    this.application.services.revenueCalculation.calculate(
      actor,
      key,
      this.body(request),
    ));

  public holdRevenue = this.mutation(200, (actor, key, request) => {
    const body = this.body<{ expectedVersion: number; reason: string }>(request);
    return this.application.services.revenueAssignment.hold(
      actor,
      this.parameter(request),
      body.expectedVersion,
      body.reason,
      key,
    );
  });

  public releaseRevenue = this.mutation(200, (actor, key, request) => {
    const body = this.body<{ expectedVersion: number; reason: string }>(request);
    return this.application.services.revenueAssignment.release(
      actor,
      this.parameter(request),
      body.expectedVersion,
      body.reason,
      key,
    );
  });

  public requestAdjustment = this.mutation(201, (actor, key, request) =>
    this.application.services.revenueAdjustments.requestAdjustment(
      actor,
      key,
      this.body(request),
    ));

  public approveAdjustment = this.mutation(200, (actor, key, request) =>
    this.application.services.revenueAdjustments.approveAndPostAdjustment(
      actor,
      key,
      this.parameter(request),
    ));

  public requestReversal = this.mutation(201, (actor, key, request) =>
    this.application.services.revenueAdjustments.requestReversal(
      actor,
      key,
      this.body(request),
    ));

  public approveReversal = this.mutation(200, (actor, key, request) =>
    this.application.services.revenueAdjustments.approveAndPostReversal(
      actor,
      key,
      this.parameter(request),
    ));

  public recalculate = this.mutation(202, (actor, key, request) =>
    this.application.services.recalculation.recalculate(
      actor,
      key,
      this.body(request),
    ));

  public listSettlements = this.read((actor, request) =>
    this.application.repositories.settlements.list({
      facilityId: actor.facilityId,
      query: this.selfScopedQuery(actor, this.query(request)),
    }));

  public getSettlement = this.read(async (actor, request) => {
    const settlement = await this.application.repositories.settlements.findById({
      facilityId: actor.facilityId,
      settlementId: this.parameter(request),
    });
    if (settlement === null) {
      throw new ResourceNotFoundError('Consultant settlement was not found');
    }
    if (
      actor.roleKeys.includes('CONSULTANT')
      && !actor.permissionKeys.has(
        CONSULTANT_SHARING_PERMISSION_KEYS.READ_SENSITIVE,
      )
      && settlement.consultantId !== actor.staffId
    ) {
      throw new ForbiddenError(
        'Consultants may only access their own settlements',
      );
    }
    return settlement;
  });

  public calculateSettlement = this.mutation(201, (actor, key, request) =>
    this.application.services.settlements.calculate(
      actor,
      key,
      this.body(request),
    ));

  public settlementTransition(
    toStatus: ConsultantSettlementStatus,
  ): RequestHandler {
    return this.mutation(200, (actor, key, request) => {
      const body = this.body<SettlementTransitionBody>(request);
      return this.application.services.settlements.transition(actor, key, {
        ...body,
        settlementId: this.parameter(request),
        toStatus,
      });
    });
  }

  public requestPayout = this.mutation(201, (actor, key, request) =>
    this.application.services.payouts.request(actor, key, {
      ...this.body<Record<string, unknown>>(request),
      settlementId: this.parameter(request),
    } as never));

  public executePayout = this.mutation(200, (actor, key, request) =>
    this.application.services.payouts.approveAndExecute(actor, key, {
      ...this.body<Record<string, unknown>>(request),
      settlementPaymentId: this.parameter(request),
    } as never));

  public reversePayout = this.mutation(201, (actor, key, request) =>
    this.application.services.payouts.reverse(actor, key, {
      ...this.body<Record<string, unknown>>(request),
      settlementPaymentId: this.parameter(request),
    } as never));

  public openDispute = this.mutation(201, (actor, key, request) =>
    this.application.services.disputes.open(actor, key, this.body(request)));

  public disputeTransition(toStatus: ConsultantDisputeStatus): RequestHandler {
    return this.mutation(200, (actor, key, request) => {
      const body = this.body<DisputeTransitionBody>(request);
      return this.application.services.disputes.transition(actor, key, {
        ...body,
        disputeId: this.parameter(request),
        toStatus,
      });
    });
  }

  public listWorkItems = this.read((actor, request) => {
    const query = this.query(request);
    return this.application.services.workQueue.listMine(
      actor,
      query.page,
      query.pageSize,
    );
  });

  public createWorkItem = this.mutation(201, (actor, key, request) =>
    this.application.services.workQueue.create(
      actor,
      key,
      this.body(request),
    ));

  public assignWorkItem = this.mutation(200, (actor, key, request) => {
    const body = this.body<{
      expectedVersion: number;
      assignedToUserId: string;
      followUpAt: string | null;
    }>(request);
    return this.application.services.workQueue.assign(
      actor,
      this.parameter(request),
      body.expectedVersion,
      body.assignedToUserId,
      body.followUpAt,
      key,
    );
  });

  public escalateWorkItem = this.mutation(200, (actor, key, request) => {
    const body = this.body<{
      expectedVersion: number;
      escalatedToUserId: string;
      reason: string;
    }>(request);
    return this.application.services.workQueue.escalate(
      actor,
      this.parameter(request),
      body.expectedVersion,
      body.escalatedToUserId,
      body.reason,
      key,
    );
  });

  public runReport = this.read((actor, request) =>
    this.application.services.reporting.run(
      actor,
      this.parameter(request, 'report') as ConsultantSharingReportName,
      this.reportQuery(request),
    ));

  public exportReport: RequestHandler = async (request, response, next) => {
    try {
      const actor = await this.actor(request);
      const exported = await this.application.services.reporting.exportCsv(
        actor,
        this.parameter(request, 'report') as ConsultantSharingReportName,
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
      this.parameter(request, 'report') as ConsultantSharingReportName,
      this.reportQuery(request),
    ));

  public runRecovery = this.mutation(200, (actor, key, request) =>
    this.application.services.recovery.run(
      actor,
      key,
      this.body<ConsultantSharingRecoveryRunInput>(request),
    ));

  public reconcile = this.mutation(200, (actor, _key, request) => {
    const body = this.body<{ from: string; through: string }>(request);
    return this.application.services.reconciliation.run({
      actor,
      from: new Date(body.from),
      through: new Date(body.through),
    });
  });
}