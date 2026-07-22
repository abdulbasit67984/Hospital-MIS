import {
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
  isClaimStatusTransitionAllowed,
} from '../claims.constants.js';

import type {
  ClaimStatus,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  MarkClaimReadyInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBreakGlassProhibitedError,
  ClaimInvalidStateTransitionError,
  ClaimMakerCheckerError,
  ClaimNotFoundError,
  ClaimNotReadyError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  safeClaimRealtimePayload,
} from '../claims.normalization.js';

import type {
  ClaimLineRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsApprovalPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsFinancialDischargePort,
  ClaimsFinancialLedgerPort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
  ClaimValidationRepositoryPort,
  ClaimWorkflowHistoryRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimRecord,
} from '../claims.persistence.types.js';

export interface ClaimWorkflowServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  validation: ClaimValidationRepositoryPort;
  history: ClaimWorkflowHistoryRepositoryPort;
  accessPolicy: ClaimsAccessPolicyPort;
  approval: ClaimsApprovalPort;
  transactionManager: ClaimsTransactionManagerPort;
  financialLedger: ClaimsFinancialLedgerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

function permissionForTransition(toStatus: ClaimStatus): string {
  if (
    ['SUBMISSION_PENDING', 'SUBMITTED', 'RESUBMITTED'].includes(toStatus)
  ) {
    return CLAIM_PERMISSION_KEYS.SUBMIT;
  }
  if (toStatus === 'CANCELLED') {
    return CLAIM_PERMISSION_KEYS.CANCEL_APPROVE;
  }
  if (toStatus === 'REVERSED') {
    return CLAIM_PERMISSION_KEYS.REVERSE_APPROVE;
  }
  if (toStatus === 'VOIDED') {
    return CLAIM_PERMISSION_KEYS.VOID_APPROVE;
  }
  return CLAIM_PERMISSION_KEYS.STATUS_MANAGE;
}

function lineStatusForClaimStatus(
  status: ClaimStatus,
): string | null {
  const direct = new Set([
    'DRAFT',
    'READY',
    'SUBMITTED',
    'ACKNOWLEDGED',
    'UNDER_REVIEW',
    'APPROVED',
    'PARTIALLY_APPROVED',
    'DENIED',
    'REJECTED',
    'RETURNED',
    'PAID',
    'CLOSED',
    'CANCELLED',
    'REVERSED',
  ]);
  if (direct.has(status)) {
    return status;
  }
  if (status === 'SUBMISSION_PENDING' || status === 'RESUBMITTED') {
    return 'READY';
  }
  return null;
}

function transitionMetadata(
  status: ClaimStatus,
  actorUserId: string,
  now: Date,
  reason: string | null,
): Readonly<Record<string, unknown>> {
  switch (status) {
    case 'SUBMITTED':
    case 'RESUBMITTED':
      return { submittedAt: now, submittedBy: actorUserId };
    case 'ACKNOWLEDGED':
      return { acknowledgedAt: now };
    case 'APPROVED':
    case 'PARTIALLY_APPROVED':
    case 'DENIED':
      return { adjudicatedAt: now };
    case 'PAID':
      return { paidAt: now };
    case 'CLOSED':
      return { closedAt: now };
    case 'CANCELLED':
      return {
        cancelledAt: now,
        cancelledBy: actorUserId,
        cancellationReason: reason,
      };
    case 'REVERSED':
      return {
        reversedAt: now,
        reversedBy: actorUserId,
        reversalReason: reason,
      };
    case 'VOIDED':
      return {
        voidedAt: now,
        voidedBy: actorUserId,
        voidReason: reason,
      };
    default:
      return {};
  }
}

export class ClaimWorkflowService implements ClaimsWorkflowPort {
  public constructor(
    private readonly dependencies: ClaimWorkflowServiceDependencies,
  ) {}

  public async markReady(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: MarkClaimReadyInput,
  ): Promise<ClaimRecord> {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.MARK_READY);

    return this.dependencies.transactionManager.execute({
      transactionType: 'MARK_CLAIM_READY',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:claim:${actor.facilityId}:${claimId}`],
      idempotencyPayload: input,
      journalPayload: { claimId, validationSnapshotId: input.validationSnapshotId },
      execute: async (transaction) => {
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          claimId,
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        if (claim.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        const snapshot = await this.dependencies.validation.findById(
          actor.facilityId,
          input.validationSnapshotId,
          transaction.session,
        );
        if (
          snapshot === null ||
          !snapshot.claimId.equals(claim._id) ||
          !snapshot.submissionReady ||
          claim.readinessSnapshotId === null ||
          !claim.readinessSnapshotId.equals(snapshot._id) ||
          snapshot.claimVersion !== claim.version - 1
        ) {
          throw new ClaimNotReadyError();
        }
        const updated = await this.transitionInTransaction({
          actor,
          claim,
          toStatus: 'READY',
          reason: input.reason,
          transaction,
        });
        await this.dependencies.financialLedger.postClaimReceivable({
          actor,
          claimId,
          payerOrganizationId: claim.payerOrganizationId.toHexString(),
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          amount: decimal128ToString(claim.claimedAmount),
          transaction,
        });
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        return updated;
      },
    });
  }

  public async transition(
    input: Parameters<ClaimsWorkflowPort['transition']>[0],
  ): Promise<ClaimRecord> {
    await this.requirePermission(
      input.actor,
      permissionForTransition(input.toStatus),
      input.claim.createdBy.toHexString(),
    );
    return this.transitionInTransaction(input);
  }

  private async transitionInTransaction(
    input: Parameters<ClaimsWorkflowPort['transition']>[0],
  ): Promise<ClaimRecord> {
    const {
      actor,
      claim,
      toStatus,
      reason,
      makerUserId,
      checkerUserId,
      approvalRequestId,
      transaction,
    } = input;
    if (!isClaimStatusTransitionAllowed(claim.status, toStatus)) {
      throw new ClaimInvalidStateTransitionError(claim.status, toStatus);
    }
    const sensitive = ['CANCELLED', 'REVERSED', 'VOIDED'].includes(toStatus);
    if (sensitive) {
      if (actor.breakGlassReason !== undefined) {
        throw new ClaimBreakGlassProhibitedError();
      }
      const maker = makerUserId ?? claim.createdBy.toHexString();
      const checker = checkerUserId ?? actor.userId;
      if (maker === checker) {
        throw new ClaimMakerCheckerError();
      }
      if (approvalRequestId === undefined || approvalRequestId === null) {
        throw new ClaimMakerCheckerError();
      }
      await this.dependencies.approval.assertApproved({
        facilityId: actor.facilityId,
        approvalRequestId,
        action: `CLAIM_${toStatus}`,
        entityId: claim._id.toHexString(),
        makerUserId: maker,
        checkerUserId: checker,
        session: transaction.session,
      });
    }
    const now = this.dependencies.clock.now();
    const updated = await this.dependencies.claims.updateStatus(
      actor.facilityId,
      claim._id.toHexString(),
      claim.version,
      {
        status: toStatus,
        ...transitionMetadata(toStatus, actor.userId, now, reason),
      },
      actor.userId,
      transaction,
    );
    if (updated === null) {
      throw new ClaimVersionConflictError();
    }
    const lineStatus = lineStatusForClaimStatus(toStatus);
    if (lineStatus !== null) {
      await this.dependencies.lines.updateStatusesForClaim(
        actor.facilityId,
        claim._id.toHexString(),
        lineStatus,
        actor.userId,
        transaction,
      );
    }
    await this.dependencies.history.appendStatus(
      actor,
      {
        claimId: claim._id,
        fromStatus: claim.status,
        toStatus,
        reason,
        payerReasonCode: null,
        payerReasonDescription: null,
        actorUserId: toObjectId(actor.userId, 'actorUserId'),
        makerUserId: nullableObjectId(makerUserId),
        checkerUserId: nullableObjectId(checkerUserId),
        approvalRequestId: nullableObjectId(approvalRequestId),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        occurredAt: now,
        immutableHash: '',
      },
      transaction,
    );
    await this.dependencies.audit.record({
      actor,
      action: `CLAIM_STATUS_${toStatus}`,
      entityType: 'Claim',
      entityId: claim._id.toHexString(),
      reason,
      before: { status: claim.status, version: claim.version },
      after: { status: updated.status, version: updated.version },
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'claims.claim.status_changed',
      aggregateType: 'Claim',
      aggregateId: claim._id.toHexString(),
      payload: safeClaimRealtimePayload({
        claimId: claim._id.toHexString(),
        status: updated.status,
        previousStatus: claim.status,
        version: updated.version,
        eventAt: now.toISOString(),
      }),
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
    return updated;
  }

  private async requirePermission(
    actor: ClaimsActorContext,
    permission: string,
    makerUserId?: string,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      ...(makerUserId === undefined ? {} : { makerUserId }),
      sensitiveFinancialAction: [
        CLAIM_PERMISSION_KEYS.CANCEL_APPROVE,
        CLAIM_PERMISSION_KEYS.REVERSE_APPROVE,
        CLAIM_PERMISSION_KEYS.VOID_APPROVE,
      ].includes(permission as never),
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}

function nullableObjectId(
  value: string | null | undefined,
) {
  return value == null ? null : toObjectId(value, 'claimWorkflowUserId');
}