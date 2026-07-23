import {
  CONSULTANT_AGREEMENT_ALLOWED_STATUS_TRANSITIONS,
  CONSULTANT_SHARING_PERMISSION_KEYS,
  type ConsultantAgreementStatus,
} from '../consultant-sharing.constants.js';
import type { ConsultantSharingActorContext } from '../consultant-sharing.contracts.js';
import {
  ConsultantAgreementInvalidStateTransitionError,
  ConsultantAgreementNotFoundError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
  ConsultantSharingMakerCheckerError,
} from '../consultant-sharing.errors.js';
import { assertNoConsultantAgreementRuleConflicts } from '../consultant-sharing.agreement-matching.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantAgreementHistoryRepositoryPort,
  ConsultantAgreementRepositoryPort,
  ConsultantAgreementRuleRepositoryPort,
  ConsultantApprovalPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantEncryptionPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export interface ConsultantAgreementStatusCommand {
  expectedVersion: number;
  targetStatus: ConsultantAgreementStatus;
  reason: string;
  approvalRequestId?: string | null;
}

export interface ConsultantAgreementApprovalServiceDependencies {
  agreements: ConsultantAgreementRepositoryPort;
  rules: ConsultantAgreementRuleRepositoryPort;
  history: ConsultantAgreementHistoryRepositoryPort;
  approvals: ConsultantApprovalPort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  encryption: ConsultantEncryptionPort;
  clock: ConsultantClockPort;
}

function statusAction(
  target: ConsultantAgreementStatus,
): keyof typeof CONSULTANT_SHARING_PERMISSION_KEYS {
  switch (target) {
    case 'SUBMITTED':
      return 'AGREEMENT_SUBMIT';
    case 'UNDER_REVIEW':
      return 'AGREEMENT_REVIEW';
    case 'APPROVED':
      return 'AGREEMENT_APPROVE';
    case 'ACTIVE':
      return 'AGREEMENT_ACTIVATE';
    case 'SUSPENDED':
      return 'AGREEMENT_SUSPEND';
    case 'TERMINATED':
    case 'EXPIRED':
    case 'SUPERSEDED':
      return 'AGREEMENT_TERMINATE';
    case 'REOPENED':
      return 'AGREEMENT_REOPEN';
    case 'DRAFT':
    case 'CANCELLED':
      return 'AGREEMENT_UPDATE';
  }
}

function historyType(from: ConsultantAgreementStatus, target: ConsultantAgreementStatus): string {
  const values: Readonly<Record<ConsultantAgreementStatus, string>> = {
    DRAFT: 'REOPENED',
    SUBMITTED: 'SUBMITTED',
    UNDER_REVIEW: 'REVIEWED',
    APPROVED: 'APPROVED',
    ACTIVE: 'ACTIVATED',
    SUSPENDED: 'SUSPENDED',
    EXPIRED: 'EXPIRED',
    TERMINATED: 'TERMINATED',
    CANCELLED: 'CANCELLED',
    SUPERSEDED: 'SUPERSEDED',
    REOPENED: 'REOPENED',
  };
  return from === 'SUSPENDED' && target === 'ACTIVE' ? 'RESUMED' : values[target];
}

function approvalRequired(target: ConsultantAgreementStatus): boolean {
  return ['APPROVED', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'SUPERSEDED'].includes(target);
}

export class ConsultantAgreementApprovalService {
  public constructor(
    private readonly dependencies: ConsultantAgreementApprovalServiceDependencies,
  ) {}

  public async changeStatus(
    actor: ConsultantSharingActorContext,
    agreementId: string,
    idempotencyKey: string,
    command: ConsultantAgreementStatusCommand,
  ) {
    const action = statusAction(command.targetStatus);
    const requestHash = stableConsultantSharingPayloadHash({ agreementId, command });

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_AGREEMENT_STATUS',
      actor,
      idempotencyKey,
      requestHash,
      operation: async () => {
        const preview = await this.dependencies.agreements.findById({
          facilityId: actor.facilityId,
          agreementId,
        });
        if (preview == null) throw new ConsultantAgreementNotFoundError();
        return this.dependencies.locks.withLock({
          lockKey: `consultant-sharing:agreement-consultant:${actor.facilityId}:${preview.consultantId}`,
          ownerId: `${actor.userId}:${actor.correlationId}`,
          ttlMs: 30_000,
          operation: async () =>
            this.dependencies.transactions.withTransaction(async (transaction) => {
              const before = await this.dependencies.agreements.findById({
                facilityId: actor.facilityId,
                agreementId,
                transaction,
              });
              if (before == null) throw new ConsultantAgreementNotFoundError();
              if (!CONSULTANT_AGREEMENT_ALLOWED_STATUS_TRANSITIONS[before.status].includes(command.targetStatus)) {
                throw new ConsultantAgreementInvalidStateTransitionError(
                  before.status,
                  command.targetStatus,
                );
              }

              const makerUserId = before.submittedBy ?? actor.userId;
              const decision = await this.dependencies.accessPolicy.authorize({
                actor,
                action,
                resourceFacilityId: before.facilityId,
                consultantStaffId: before.consultantStaffId,
                makerUserId: approvalRequired(command.targetStatus) ? makerUserId : null,
                sensitiveFinancialAction: approvalRequired(command.targetStatus),
              });
              if (!decision.allowed) {
                throw new ConsultantSharingAccessDeniedError(decision.denialReason);
              }

              if (approvalRequired(command.targetStatus)) {
                if (command.approvalRequestId == null) {
                  throw new ConsultantSharingMakerCheckerError();
                }
                await this.dependencies.approvals.requireApproved({
                  actor,
                  approvalRequestId: command.approvalRequestId,
                  action: `CONSULTANT_AGREEMENT_${command.targetStatus}`,
                  entityType: 'ConsultantAgreement',
                  entityId: agreementId,
                  makerUserId,
                  transaction,
                });
              }

              const now = this.dependencies.clock.now();
              const updated = await this.dependencies.agreements.changeStatus({
                actor,
                agreementId,
                expectedVersion: command.expectedVersion,
                fromStatus: before.status,
                toStatus: command.targetStatus,
                reason: command.reason,
                approvalRequestId: command.approvalRequestId ?? null,
                occurredAt: now,
                transaction,
              });
              if (updated == null) throw new ConsultantSharingConcurrencyError();

              if (command.targetStatus === 'ACTIVE') {
                const prospectiveRules = await this.dependencies.rules.listByAgreement({
                  facilityId: actor.facilityId,
                  agreementId,
                  transaction,
                });
                const existingCandidates = await this.dependencies.rules.findConflictCandidates({
                  facilityId: actor.facilityId,
                  consultantId: before.consultantId,
                  effectiveFrom: new Date(before.effectiveFrom),
                  effectiveThrough: before.effectiveThrough == null
                    ? null
                    : new Date(before.effectiveThrough),
                  excludeAgreementIds: [
                    agreementId,
                    ...(before.supersedesAgreementId == null
                      ? []
                      : [before.supersedesAgreementId]),
                  ],
                  transaction,
                });
                const prospectiveCandidates = prospectiveRules.map((rule) => ({
                  agreementId: before.id,
                  agreementNumber: before.agreementNumber,
                  agreementVersion: before.agreementVersion,
                  agreementStatus: 'ACTIVE' as const,
                  agreementPriority: before.priority,
                  rule: { ...rule, status: 'ACTIVE' as const },
                }));
                assertNoConsultantAgreementRuleConflicts([
                  ...existingCandidates,
                  ...prospectiveCandidates,
                ]);
                if (before.supersedesAgreementId != null) {
                  const sourceBefore = await this.dependencies.agreements.findById({
                    facilityId: actor.facilityId,
                    agreementId: before.supersedesAgreementId,
                    transaction,
                  });
                  if (sourceBefore == null) throw new ConsultantAgreementNotFoundError();
                  const amendmentEffectiveFrom = new Date(before.effectiveFrom);
                  const sourceRuleEffectiveThrough = new Date(
                    amendmentEffectiveFrom.getTime() - 1,
                  );
                  const supersededSource = await this.dependencies.agreements.supersedeForAmendment({
                    actor,
                    sourceAgreementId: before.supersedesAgreementId,
                    amendmentAgreementId: agreementId,
                    amendmentEffectiveFrom,
                    occurredAt: now,
                    transaction,
                  });
                  if (supersededSource == null) {
                    throw new ConsultantSharingConcurrencyError();
                  }
                  await this.dependencies.rules.supersedeForAgreement({
                    actor,
                    agreementId: supersededSource.id,
                    supersededAt: sourceRuleEffectiveThrough,
                    transaction,
                  });
                  const sourceReasonEncrypted = await this.dependencies.encryption.encrypt(
                    `Superseded by consultant agreement ${before.agreementNumber}`,
                  );
                  await this.dependencies.history.append({
                    actor,
                    agreementId: supersededSource.id,
                    agreementVersion: supersededSource.agreementVersion,
                    historyType: 'SUPERSEDED',
                    fromStatus: sourceBefore.status,
                    toStatus: 'SUPERSEDED',
                    reasonEncrypted: sourceReasonEncrypted,
                    snapshot: supersededSource as unknown as Readonly<Record<string, unknown>>,
                    immutableHash: stableConsultantSharingPayloadHash(supersededSource),
                    occurredAt: now,
                    approvalRequestId: command.approvalRequestId ?? null,
                    transaction,
                  });
                  await this.dependencies.audit.record({
                    actor,
                    action: 'CONSULTANT_AGREEMENT_SUPERSEDED_BY_AMENDMENT',
                    entityType: 'ConsultantAgreement',
                    entityId: supersededSource.id,
                    before: sourceBefore as unknown as Readonly<Record<string, unknown>>,
                    after: supersededSource as unknown as Readonly<Record<string, unknown>>,
                    reason: command.reason,
                    transaction,
                  });
                }
                await this.dependencies.rules.activateForAgreement({
                  actor,
                  agreementId,
                  transaction,
                });
              }
              if (['SUPERSEDED', 'TERMINATED', 'EXPIRED'].includes(command.targetStatus)) {
                await this.dependencies.rules.supersedeForAgreement({
                  actor,
                  agreementId,
                  supersededAt: now,
                  transaction,
                });
              }

              const reasonEncrypted = await this.dependencies.encryption.encrypt(command.reason);
              await this.dependencies.history.append({
                actor,
                agreementId,
                agreementVersion: updated.agreementVersion,
                historyType: historyType(before.status, command.targetStatus),
                fromStatus: before.status,
                toStatus: updated.status,
                reasonEncrypted,
                snapshot: updated as unknown as Readonly<Record<string, unknown>>,
                immutableHash: stableConsultantSharingPayloadHash(updated),
                occurredAt: now,
                approvalRequestId: command.approvalRequestId ?? null,
                transaction,
              });
              await this.dependencies.audit.record({
                actor,
                action: `CONSULTANT_AGREEMENT_${command.targetStatus}`,
                entityType: 'ConsultantAgreement',
                entityId: agreementId,
                before: before as unknown as Readonly<Record<string, unknown>>,
                after: updated as unknown as Readonly<Record<string, unknown>>,
                reason: command.reason,
                transaction,
              });
              await this.dependencies.outbox.publish({
                aggregateType: 'ConsultantAgreement',
                aggregateId: agreementId,
                eventType: 'consultant.agreement.status_changed',
                payload: {
                  agreementId,
                  fromStatus: before.status,
                  toStatus: updated.status,
                  version: updated.version,
                },
                correlationId: actor.correlationId,
                occurredAt: now,
                transaction,
              });
              return updated;
            }),
        });
      },
    });
  }
}