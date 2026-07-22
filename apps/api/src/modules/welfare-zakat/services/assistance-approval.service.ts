mport Decimal from 'decimal.js';
import { decimal128ToString } from '@hospital-mis/database';

import {
  WELFARE_ZAKAT_APPROVAL_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
  isAssistanceApplicationStatusTransitionAllowed,
  isAssistanceApprovalStatusTransitionAllowed,
} from '../welfare-zakat.constants.js';
import type {
  DecideAssistanceApprovalInput,
  RequestAssistanceApprovalInput,
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApplicationNotEligibleError,
  AssistanceApplicationNotFoundError,
  AssistanceApprovalLimitExceededError,
  AssistanceApprovalNotFoundError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceFundExpiredError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceInvalidStateTransitionError,
  AssistanceMakerCheckerViolationError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceApplicationHistoryRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceApprovalHistoryRepositoryPort,
  AssistanceApprovalRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceWorkQueueRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatClockPort,
  WelfareZakatEncryptionPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApplicationRecord,
  AssistanceApprovalRecord,
} from '../welfare-zakat.persistence.types.js';
import {
  projectAssistanceApplication,
  projectAssistanceApproval,
} from '../welfare-zakat.projections.js';

export interface AssistanceApprovalServiceDependencies {
  applications: AssistanceApplicationRepositoryPort;
  applicationHistories: AssistanceApplicationHistoryRepositoryPort;
  approvals: AssistanceApprovalRepositoryPort;
  approvalHistories: AssistanceApprovalHistoryRepositoryPort;
  funds: AssistanceFundRepositoryPort;
  workQueue: AssistanceWorkQueueRepositoryPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  transactionManager: WelfareZakatTransactionManagerPort;
  attachments: WelfareZakatAttachmentPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
  clock: WelfareZakatClockPort;
  sequences: WelfareZakatNumberSequencePort;
  encryption: WelfareZakatEncryptionPort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
}

function isEffective(from: Date, through: Date | null, at: Date): boolean {
  return from.getTime() <= at.getTime() && (through == null || through.getTime() >= at.getTime());
}

function money(value: string | number | Decimal): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export class AssistanceApprovalService {
  public constructor(
    private readonly dependencies: AssistanceApprovalServiceDependencies,
  ) {}

  public async get(actor: WelfareZakatActorContext, approvalId: string) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const approval = await this.dependencies.approvals.findById(actor.facilityId, approvalId);
    if (approval === null) throw new AssistanceApprovalNotFoundError();
    return projectAssistanceApproval(approval);
  }

  public async listByApplication(
    actor: WelfareZakatActorContext,
    applicationId: string,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const application = await this.dependencies.applications.findById(actor.facilityId, applicationId);
    if (application === null) throw new AssistanceApplicationNotFoundError();
    const approvals = await this.dependencies.approvals.listByApplication(actor.facilityId, applicationId);
    return approvals.map(projectAssistanceApproval);
  }

  public async request(
    actor: WelfareZakatActorContext,
    applicationId: string,
    idempotencyKey: string,
    input: RequestAssistanceApprovalInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_REQUEST);
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: input.attachmentIds ?? [],
    });
    const conditionsEncrypted = input.conditions == null || input.conditions.length === 0
      ? null
      : await this.dependencies.encryption.encrypt(JSON.stringify(input.conditions));
    const notesEncrypted = await this.dependencies.encryption.encrypt(input.reason);

    return this.dependencies.transactionManager.execute({
      transactionType: 'REQUEST_ASSISTANCE_APPROVAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `welfare-zakat:application:${actor.facilityId}:${applicationId}`,
        `welfare-zakat:fund:${actor.facilityId}:${input.fundId}`,
      ],
      idempotencyPayload: input,
      journalPayload: { applicationId, fundId: input.fundId, requestedAmount: input.requestedAmount },
      execute: async (transaction) => {
        const application = await this.dependencies.applications.findById(actor.facilityId, applicationId, transaction.session);
        if (application === null) throw new AssistanceApplicationNotFoundError();
        if (application.eligibilityOutcome !== 'ELIGIBLE' || application.eligibilitySnapshotId == null) {
          throw new AssistanceApplicationNotEligibleError();
        }
        if (!['ELIGIBLE', 'PARTIALLY_APPROVED'].includes(application.status)) {
          throw new AssistanceInvalidStateTransitionError('Assistance application', application.status, 'APPROVAL_PENDING');
        }
        const fund = await this.dependencies.funds.findById(actor.facilityId, input.fundId, transaction.session);
        if (fund === null) throw new AssistanceFundNotFoundError();
        const now = this.dependencies.clock.now();
        if (fund.status !== 'ACTIVE') throw new AssistanceFundInactiveError();
        if (!isEffective(fund.effectiveFrom, fund.effectiveThrough, now)) throw new AssistanceFundExpiredError();
        const requestedAmount = new Decimal(input.requestedAmount);
        const available = new Decimal(decimal128ToString(fund.availableBalance));
        if (requestedAmount.greaterThan(available)) throw new AssistanceApprovalLimitExceededError();
        if (application.requestedAmount != null && requestedAmount.greaterThan(decimal128ToString(application.requestedAmount))) {
          throw new AssistanceApprovalLimitExceededError();
        }
        const approvalNumber = await this.dependencies.sequences.next({
          facilityId: actor.facilityId,
          sequenceKey: WELFARE_ZAKAT_APPROVAL_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const operationKey = stableAssistancePayloadHash({ action: 'REQUEST_ASSISTANCE_APPROVAL', facilityId: actor.facilityId, applicationId, fundId: input.fundId, idempotencyKey });
        const approval = await this.dependencies.approvals.create({
          actor,
          application,
          fund,
          input,
          operationKey,
          approvalNumber,
          conditionsEncrypted,
          notesEncrypted,
          expiresAt: input.approvedThrough == null ? null : new Date(input.approvedThrough),
          transaction,
        });
        await this.appendApprovalHistory(actor, approval, null, 'PENDING', input.reason, null, transaction);
        const applicationUpdated = await this.dependencies.applications.transition({
          actor,
          applicationId,
          expectedVersion: input.expectedApplicationVersion,
          fromStatus: application.status,
          toStatus: 'APPROVAL_PENDING',
          reason: input.reason,
          makerUserId: actor.userId,
          occurredAt: now,
          updates: { approvalDeadlineAt: input.approvedThrough == null ? null : new Date(input.approvedThrough) },
          transaction,
        });
        if (applicationUpdated === null) throw new AssistanceVersionConflictError();
        await this.appendApplicationHistory(actor, applicationUpdated, application.status, 'APPROVAL_PENDING', input.reason, transaction);
        await this.dependencies.workQueue.create({ actor, applicationId, approvalId: approval._id.toHexString(), workQueueType: 'APPROVAL', priority: 25, followUpAt: approval.expiresAt, transaction });
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_APPROVAL_REQUESTED', entityType: 'AssistanceApproval', entityId: approval._id.toHexString(), reason: input.reason, before: null, after: projectAssistanceApproval(approval), transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueueApprovalEvent(actor, approval, null, transaction);
        return { approval: projectAssistanceApproval(approval), application: projectAssistanceApplication(applicationUpdated) };
      },
    });
  }

  public async decide(
    actor: WelfareZakatActorContext,
    approvalId: string,
    idempotencyKey: string,
    input: DecideAssistanceApprovalInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_DECIDE, true);
    const conditionsEncrypted = input.conditions === undefined
      ? undefined
      : input.conditions.length === 0
        ? null
        : await this.dependencies.encryption.encrypt(JSON.stringify(input.conditions));
    return this.dependencies.transactionManager.execute({
      transactionType: 'DECIDE_ASSISTANCE_APPROVAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:approval:${actor.facilityId}:${approvalId}`],
      idempotencyPayload: input,
      journalPayload: { approvalId, decision: input.decision, approvedAmount: input.approvedAmount ?? null },
      execute: async (transaction) => {
        const approval = await this.dependencies.approvals.findById(actor.facilityId, approvalId, transaction.session);
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        if (approval.makerUserId.toHexString() === actor.userId) throw new AssistanceMakerCheckerViolationError();
        if (actor.breakGlassReason != null) throw new AssistanceBreakGlassApprovalBypassError();
        const toStatus = input.decision === 'APPROVE'
          ? 'APPROVED'
          : input.decision === 'PARTIALLY_APPROVE'
            ? 'PARTIALLY_APPROVED'
            : 'REJECTED';
        if (!isAssistanceApprovalStatusTransitionAllowed(approval.status, toStatus)) {
          throw new AssistanceInvalidStateTransitionError('Assistance approval', approval.status, toStatus);
        }
        const approvedAmount = input.decision === 'REJECT' ? '0.00' : money(input.approvedAmount ?? '0');
        const requestedAmount = new Decimal(decimal128ToString(approval.requestedAmount));
        const approved = new Decimal(approvedAmount);
        if (approved.greaterThan(requestedAmount)) {
          throw new AssistanceApprovalLimitExceededError();
        }
        if (input.decision === 'APPROVE' && !approved.equals(requestedAmount)) {
          throw new AssistanceApprovalLimitExceededError();
        }
        if (
          input.decision === 'PARTIALLY_APPROVE' &&
          (!approved.greaterThan(0) || !approved.lessThan(requestedAmount))
        ) {
          throw new AssistanceApprovalLimitExceededError();
        }
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: approval.approvalRequestId.toHexString(),
          action: 'ASSISTANCE_APPLICATION_APPROVAL',
          entityId: approvalId,
          amount: approvedAmount,
          makerUserId: approval.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const decided = await this.dependencies.approvals.decide({
          actor,
          approvalId,
          expectedVersion: input.expectedVersion,
          fromStatus: approval.status,
          toStatus,
          decision: input,
          authoritativeApprovedAmount: approvedAmount,
          ...(conditionsEncrypted === undefined ? {} : { conditionsEncrypted }),
          checkerUserId: actor.userId,
          decidedAt: this.dependencies.clock.now(),
          transaction,
        });
        if (decided === null) throw new AssistanceVersionConflictError();
        await this.appendApprovalHistory(actor, decided, approval.status, decided.status, input.decisionReason, actor.userId, transaction);

        const application = await this.dependencies.applications.findById(actor.facilityId, approval.applicationId.toHexString(), transaction.session);
        if (application === null) throw new AssistanceApplicationNotFoundError();
        const applicationStatus = input.decision === 'APPROVE'
          ? 'APPROVED'
          : input.decision === 'PARTIALLY_APPROVE'
            ? 'PARTIALLY_APPROVED'
            : 'REJECTED';
        if (!isAssistanceApplicationStatusTransitionAllowed(application.status, applicationStatus)) {
          throw new AssistanceInvalidStateTransitionError('Assistance application', application.status, applicationStatus);
        }
        const applicationUpdated = await this.dependencies.applications.transition({
          actor,
          applicationId: application._id.toHexString(),
          expectedVersion: application.version,
          fromStatus: application.status,
          toStatus: applicationStatus,
          reason: input.decisionReason,
          makerUserId: approval.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          occurredAt: this.dependencies.clock.now(),
          updates: {
            approvedAmount,
            remainingApprovedAmount: approvedAmount,
            preferredFundId: approval.fundId.toHexString(),
          },
          transaction,
        });
        if (applicationUpdated === null) throw new AssistanceVersionConflictError();
        await this.appendApplicationHistory(actor, applicationUpdated, application.status, applicationStatus, input.decisionReason, transaction);
        await this.dependencies.audit.record({ actor, action: 'ASSISTANCE_APPROVAL_DECIDED', entityType: 'AssistanceApproval', entityId: approvalId, reason: input.decisionReason, before: projectAssistanceApproval(approval), after: projectAssistanceApproval(decided), transactionId: transaction.transactionId, session: transaction.session });
        await this.enqueueApprovalEvent(actor, decided, approval.status, transaction);
        return { approval: projectAssistanceApproval(decided), application: projectAssistanceApplication(applicationUpdated) };
      },
    });
  }

  private async appendApprovalHistory(
    actor: WelfareZakatActorContext,
    approval: AssistanceApprovalRecord,
    fromStatus: AssistanceApprovalRecord['status'] | null,
    toStatus: AssistanceApprovalRecord['status'],
    reason: string,
    checkerUserId: string | null,
    transaction: WelfareZakatTransactionContext,
  ) {
    await this.dependencies.approvalHistories.append({
      actor,
      approval,
      fromStatus,
      toStatus,
      checkerUserId,
      reason,
      occurredAt: this.dependencies.clock.now(),
      immutableHash: stableAssistancePayloadHash({ approvalId: approval._id.toHexString(), version: approval.version, fromStatus, toStatus, checkerUserId, transactionId: transaction.transactionId }),
      transaction,
    });
  }

  private async appendApplicationHistory(
    actor: WelfareZakatActorContext,
    application: AssistanceApplicationRecord,
    fromStatus: AssistanceApplicationRecord['status'],
    toStatus: AssistanceApplicationRecord['status'],
    reason: string,
    transaction: WelfareZakatTransactionContext,
  ) {
    const snapshot = projectAssistanceApplication(application);
    const snapshotHash = stableAssistancePayloadHash(snapshot);
    await this.dependencies.applicationHistories.append({ actor, application, fromStatus, toStatus, reason, snapshot: snapshot as unknown as Readonly<Record<string, unknown>>, snapshotHash, immutableHash: stableAssistancePayloadHash({ applicationId: application._id.toHexString(), version: application.version, fromStatus, toStatus, snapshotHash, transactionId: transaction.transactionId }), occurredAt: this.dependencies.clock.now(), transaction });
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string, sensitiveFinancialAction = false) {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, permission, resourceFacilityId: actor.facilityId, sensitiveFinancialAction });
    if (!decision.allowed) throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
  }

  private async enqueueApprovalEvent(actor: WelfareZakatActorContext, approval: AssistanceApprovalRecord, previousStatus: string | null, transaction: WelfareZakatTransactionContext) {
    await this.dependencies.outbox.enqueue({ facilityId: actor.facilityId, eventType: 'welfare_zakat.approval.changed', aggregateType: 'AssistanceApproval', aggregateId: approval._id.toHexString(), payload: safeWelfareZakatRealtimePayload({ applicationId: approval.applicationId.toHexString(), approvalId: approval._id.toHexString(), fundId: approval.fundId.toHexString(), status: approval.status, previousStatus, version: approval.version, eventAt: this.dependencies.clock.now().toISOString() }), correlationId: actor.correlationId, transactionId: transaction.transactionId, session: transaction.session });
  }
}