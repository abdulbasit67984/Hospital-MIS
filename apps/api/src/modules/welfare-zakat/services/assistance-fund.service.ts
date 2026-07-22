import Decimal from 'decimal.js';

import {
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
  isAssistanceFundStatusTransitionAllowed,
} from '../welfare-zakat.constants.js';
import type {
  ChangeAssistanceFundStatusInput,
  CreateAssistanceFundInput,
  UpdateAssistanceFundInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApprovalRequiredError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceDuplicateFundCodeError,
  AssistanceFundNotFoundError,
  AssistanceInvalidStateTransitionError,
  AssistanceMakerCheckerViolationError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  hashAssistanceSensitiveReference,
  maskAssistanceReference,
  normalizeAssistanceCode,
  normalizeOptionalAssistanceText,
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceFundRepositoryPort,
  FundTransactionRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEncryptionPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import {
  projectAssistanceFund,
  projectFundTransaction,
} from '../welfare-zakat.projections.js';

export interface AssistanceFundServiceDependencies {
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  sequences: WelfareZakatNumberSequencePort;
  encryption: WelfareZakatEncryptionPort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
}

export class AssistanceFundService {
  public constructor(
    private readonly dependencies: AssistanceFundServiceDependencies,
  ) {}

  public async get(actor: WelfareZakatActorContext, fundId: string) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ);
    const fund = await this.dependencies.funds.findById(actor.facilityId, fundId);
    if (fund === null) throw new AssistanceFundNotFoundError();
    return projectAssistanceFund(fund);
  }

  public async list(actor: WelfareZakatActorContext, query: WelfareZakatListQuery) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ);
    const { records, total } = await this.dependencies.funds.list(actor.facilityId, query);
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectAssistanceFund),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async listTransactions(
    actor: WelfareZakatActorContext,
    fundId: string,
    query: WelfareZakatListQuery,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ);
    const fund = await this.dependencies.funds.findById(actor.facilityId, fundId);
    if (fund === null) throw new AssistanceFundNotFoundError();
    const { records, total } = await this.dependencies.fundTransactions.listByFund(
      actor.facilityId,
      fundId,
      query,
    );
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.max(1, Math.trunc(query.pageSize ?? 25));
    return {
      items: records.map(projectFundTransaction),
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async create(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: CreateAssistanceFundInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE);
    const sensitive = await this.prepareRestriction(input.restriction);

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_ASSISTANCE_FUND',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:fund-code:${actor.facilityId}:${normalizeAssistanceCode(input.fundCode)}`],
      idempotencyPayload: input,
      journalPayload: { fundCode: normalizeAssistanceCode(input.fundCode), fundType: input.fundType },
      execute: async (transaction) => {
        const existing = await this.dependencies.funds.findByCode(
          actor.facilityId,
          input.fundCode,
          transaction.session,
        );
        if (existing !== null) throw new AssistanceDuplicateFundCodeError();
        const operationKey = stableAssistancePayloadHash({
          action: 'CREATE_ASSISTANCE_FUND',
          facilityId: actor.facilityId,
          idempotencyKey,
        });
        const fund = await this.dependencies.funds.create(
          actor,
          input,
          { operationKey, ...sensitive },
          transaction,
        );
        if (new Decimal(input.openingBalance).greaterThan(0)) {
          const now = this.dependencies.clock.now();
          const transactionNumber = await this.dependencies.sequences.next({
            facilityId: actor.facilityId,
            sequenceKey: WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
            effectiveAt: now,
            actorUserId: actor.userId,
            transaction,
          });
          await this.dependencies.fundTransactions.append({
            actor,
            fund,
            transactionNumber,
            operationKey: `${operationKey}:opening`,
            transactionType: 'OPENING_BALANCE',
            direction: 'CREDIT',
            amount: input.openingBalance,
            balanceBefore: '0.00',
            balanceAfter: input.openingBalance,
            reason: input.reason,
            makerUserId: actor.userId,
            occurredAt: now,
            immutableHash: stableAssistancePayloadHash({
              fundId: fund._id.toHexString(),
              transactionType: 'OPENING_BALANCE',
              amount: input.openingBalance,
              transactionId: transaction.transactionId,
            }),
            transaction,
          });
        }
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_FUND_CREATED',
          entityType: 'AssistanceFund',
          entityId: fund._id.toHexString(),
          reason: input.reason,
          before: null,
          after: projectAssistanceFund(fund),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueFundEvent(actor, fund._id.toHexString(), null, fund.status, fund.version, transaction.transactionId, transaction.session);
        return projectAssistanceFund(fund);
      },
    });
  }

  public async update(
    actor: WelfareZakatActorContext,
    fundId: string,
    idempotencyKey: string,
    input: UpdateAssistanceFundInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_CREATE);
    const sensitive = input.restriction === undefined
      ? {}
      : await this.prepareRestriction(input.restriction);
    return this.dependencies.transactionManager.execute({
      transactionType: 'UPDATE_ASSISTANCE_FUND',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:fund:${actor.facilityId}:${fundId}`],
      idempotencyPayload: input,
      journalPayload: { fundId, expectedVersion: input.expectedVersion },
      execute: async (transaction) => {
        const before = await this.dependencies.funds.findById(actor.facilityId, fundId, transaction.session);
        if (before === null) throw new AssistanceFundNotFoundError();
        const updated = await this.dependencies.funds.update(
          actor,
          fundId,
          input.expectedVersion,
          input,
          sensitive,
          transaction,
        );
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_FUND_UPDATED',
          entityType: 'AssistanceFund',
          entityId: fundId,
          reason: input.reason,
          before: projectAssistanceFund(before),
          after: projectAssistanceFund(updated),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueFundEvent(actor, fundId, before.status, updated.status, updated.version, transaction.transactionId, transaction.session);
        return projectAssistanceFund(updated);
      },
    });
  }

  public async changeStatus(
    actor: WelfareZakatActorContext,
    fundId: string,
    idempotencyKey: string,
    input: ChangeAssistanceFundStatusInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.FUND_STATUS_MANAGE, true);
    return this.dependencies.transactionManager.execute({
      transactionType: 'CHANGE_ASSISTANCE_FUND_STATUS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:fund:${actor.facilityId}:${fundId}`],
      idempotencyPayload: input,
      journalPayload: { fundId, toStatus: input.toStatus },
      execute: async (transaction) => {
        const fund = await this.dependencies.funds.findById(actor.facilityId, fundId, transaction.session);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (!isAssistanceFundStatusTransitionAllowed(fund.status, input.toStatus)) {
          throw new AssistanceInvalidStateTransitionError('Assistance fund', fund.status, input.toStatus);
        }
        if (fund.createdBy.toHexString() === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        if (actor.breakGlassReason != null) throw new AssistanceBreakGlassApprovalBypassError();
        if (input.toStatus === 'ACTIVE') {
          if (input.approvalRequestId == null) throw new AssistanceApprovalRequiredError();
          await this.dependencies.financialApprovals.assertApproved({
            facilityId: actor.facilityId,
            approvalRequestId: input.approvalRequestId,
            action: 'ASSISTANCE_FUND_ACTIVATION',
            entityId: fundId,
            amount: fund.openingBalance.toString(),
            makerUserId: fund.createdBy.toHexString(),
            checkerUserId: actor.userId,
            session: transaction.session,
          });
        }
        const now = this.dependencies.clock.now();
        const updated = await this.dependencies.funds.changeStatus({
          actor,
          fundId,
          expectedVersion: input.expectedVersion,
          fromStatus: fund.status,
          toStatus: input.toStatus,
          approvalRequestId: input.approvalRequestId ?? null,
          reason: input.reason,
          occurredAt: now,
          transaction,
        });
        if (updated === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_FUND_STATUS_CHANGED',
          entityType: 'AssistanceFund',
          entityId: fundId,
          reason: input.reason,
          before: { status: fund.status, version: fund.version },
          after: { status: updated.status, version: updated.version },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueueFundEvent(actor, fundId, fund.status, updated.status, updated.version, transaction.transactionId, transaction.session);
        return projectAssistanceFund(updated);
      },
    });
  }

  private async prepareRestriction(restriction: CreateAssistanceFundInput['restriction']) {
    const fundingSource = restriction.fundingSourceReference ?? null;
    const donor = restriction.donorReference ?? null;
    return {
      fundingSourceReferenceHash: hashAssistanceSensitiveReference(fundingSource),
      fundingSourceReferenceMasked: maskAssistanceReference(fundingSource),
      donorReferenceHash: hashAssistanceSensitiveReference(donor),
      donorReferenceMasked: maskAssistanceReference(donor),
      donationReferenceHash: hashAssistanceSensitiveReference(restriction.donationReference),
      grantReferenceHash: hashAssistanceSensitiveReference(restriction.grantReference),
      restrictionNarrativeEncrypted:
        normalizeOptionalAssistanceText(restriction.restrictionNarrative) == null
          ? null
          : await this.dependencies.encryption.encrypt(restriction.restrictionNarrative!.trim()),
    };
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string, sensitiveFinancialAction = false) {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, permission, resourceFacilityId: actor.facilityId, sensitiveFinancialAction });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }

  private async enqueueFundEvent(
    actor: WelfareZakatActorContext,
    fundId: string,
    previousStatus: string | null,
    status: string,
    version: number,
    transactionId: string,
    session: Parameters<WelfareZakatOutboxPort['enqueue']>[0]['session'],
  ) {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'welfare_zakat.fund.changed',
      aggregateType: 'AssistanceFund',
      aggregateId: fundId,
      payload: safeWelfareZakatRealtimePayload({ fundId, status, previousStatus, version, eventAt: this.dependencies.clock.now().toISOString() }),
      correlationId: actor.correlationId,
      transactionId,
      session,
    });
  }
}