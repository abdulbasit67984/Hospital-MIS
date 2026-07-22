import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_APPEAL_NUMBER_SEQUENCE_KEY,
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ApproveClaimAppealInput,
  ClaimsActorContext,
  CreateClaimAppealInput,
  RecordClaimAppealDecisionInput,
  SubmitClaimAppealInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimAppealNotFoundError,
  ClaimBreakGlassProhibitedError,
  ClaimFinancialReconciliationError,
  ClaimMakerCheckerError,
  ClaimNotFoundError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  calculateClaimReceivable,
} from '../claims.financial-math.js';

import type {
  ClaimAppealRepositoryPort,
  ClaimDenialRepositoryPort,
  ClaimLineRepositoryPort,
  ClaimsAccessPolicyPort,
  ClaimsApprovalPort,
  ClaimsAttachmentPort,
  ClaimsAuditPort,
  ClaimsClockPort,
  ClaimsEncryptionPort,
  ClaimsFinancialDischargePort,
  ClaimsFinancialLedgerPort,
  ClaimsNumberSequencePort,
  ClaimsOutboxPort,
  ClaimsRepositoryPort,
  ClaimsTransactionContext,
  ClaimsTransactionManagerPort,
  ClaimsWorkflowPort,
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimLineRecord,
} from '../claims.persistence.types.js';

export interface ClaimDenialAppealServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  denials: ClaimDenialRepositoryPort;
  appeals: ClaimAppealRepositoryPort;
  workQueue: ClaimWorkQueueRepositoryPort;
  workflow: ClaimsWorkflowPort;
  accessPolicy: ClaimsAccessPolicyPort;
  approval: ClaimsApprovalPort;
  transactionManager: ClaimsTransactionManagerPort;
  numberSequence: ClaimsNumberSequencePort;
  attachments: ClaimsAttachmentPort;
  encryption: ClaimsEncryptionPort;
  ledger: ClaimsFinancialLedgerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

function money(value: unknown): Decimal {
  return new Decimal(String(value ?? '0')).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
}


interface AppealLineState {
  line: ClaimLineRecord;
  approvedAmount: Decimal;
  deniedAmount: Decimal;
  disallowedAmount: Decimal;
  returnedAmount: Decimal;
  outstandingAmount: Decimal;
}

function smaller(left: Decimal, right: Decimal): Decimal {
  return left.lessThan(right) ? left : right;
}

function applyAppealApproval(
  state: AppealLineState,
  maximumAmount: Decimal,
): Decimal {
  let remaining = maximumAmount;
  const deniedReduction = smaller(remaining, state.deniedAmount);
  state.deniedAmount = state.deniedAmount.minus(deniedReduction);
  remaining = remaining.minus(deniedReduction);

  const disallowedReduction = smaller(remaining, state.disallowedAmount);
  state.disallowedAmount = state.disallowedAmount.minus(disallowedReduction);
  remaining = remaining.minus(disallowedReduction);

  const returnedReduction = smaller(remaining, state.returnedAmount);
  state.returnedAmount = state.returnedAmount.minus(returnedReduction);
  remaining = remaining.minus(returnedReduction);

  const applied = maximumAmount.minus(remaining);
  state.approvedAmount = state.approvedAmount.plus(applied);
  state.outstandingAmount = state.outstandingAmount.plus(applied);
  return applied;
}

export class ClaimDenialAppealService {
  public constructor(
    private readonly dependencies: ClaimDenialAppealServiceDependencies,
  ) {}

  public async createAppeal(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: CreateClaimAppealInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.APPEAL_PREPARE);

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_CLAIM_APPEAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:claim:${actor.facilityId}:${claimId}`,
        ...input.denialIds.map(
          (denialId) =>
            `claims:denial:${actor.facilityId}:${denialId}`,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: { claimId, denialIds: input.denialIds },
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
        if (!['DENIED', 'PARTIALLY_APPROVED'].includes(claim.status)) {
          throw new ClaimFinancialReconciliationError(
            'Only denied or partially approved claims can be appealed',
          );
        }

        const denials = await this.dependencies.denials.findByIds(
          actor.facilityId,
          claimId,
          input.denialIds,
          transaction.session,
        );
        if (denials.length !== input.denialIds.length) {
          throw new ClaimNotFoundError();
        }
        const now = this.dependencies.clock.now();
        if (
          denials.some(
            (denial) =>
              denial.resolved ||
              !denial.appealEligible ||
              denial.appealDeadline === null ||
              denial.appealDeadline.getTime() < now.getTime(),
          )
        ) {
          throw new ClaimFinancialReconciliationError(
            'One or more denials are not currently appeal eligible',
          );
        }
        const deniedAmount = denials.reduce(
          (sum, denial) =>
            sum.plus(decimal128ToString(denial.deniedAmount)),
          new Decimal(0),
        );
        if (money(input.requestedAmount).greaterThan(deniedAmount)) {
          throw new ClaimFinancialReconciliationError(
            'Appeal requested amount exceeds the selected denials',
          );
        }
        const requestedDeadline = new Date(input.appealDeadline);
        const earliestDeadline = denials.reduce(
          (earliest, denial) =>
            denial.appealDeadline !== null &&
            denial.appealDeadline.getTime() < earliest.getTime()
              ? denial.appealDeadline
              : earliest,
          requestedDeadline,
        );
        if (requestedDeadline.getTime() > earliestDeadline.getTime()) {
          throw new ClaimFinancialReconciliationError(
            'Appeal deadline cannot exceed the payer denial deadline',
          );
        }

        await this.dependencies.attachments.assertAttachmentsUsable({
          facilityId: actor.facilityId,
          actorUserId: actor.userId,
          attachments: input.evidenceAttachmentIds.map((attachmentId) => ({
            attachmentId,
            purpose: 'APPEAL_EVIDENCE',
          })),
        });
        const [appealNumber, groundsEncrypted] = await Promise.all([
          this.dependencies.numberSequence.next({
            facilityId: actor.facilityId,
            sequenceKey: CLAIM_APPEAL_NUMBER_SEQUENCE_KEY,
            effectiveAt: now,
            actorUserId: actor.userId,
            transaction,
          }),
          this.dependencies.encryption.encrypt(input.grounds),
        ]);
        const appeal = await this.dependencies.appeals.create(
          actor,
          claimId,
          appealNumber,
          input,
          groundsEncrypted,
          transaction,
        );
        await this.dependencies.workQueue.upsertOpenItem(
          actor,
          {
            claimId,
            appealId: appeal._id.toHexString(),
            workQueueType: 'APPEAL',
            priority: 80,
            followUpAt: requestedDeadline,
            reasonEncrypted: null,
          },
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_APPEAL_CREATED',
          entityType: 'ClaimAppeal',
          entityId: appeal._id.toHexString(),
          reason: input.grounds,
          before: null,
          after: {
            appealNumber: appeal.appealNumber,
            status: appeal.status,
            denialCount: denials.length,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.publish(
          actor,
          appeal._id.toHexString(),
          claimId,
          appeal.status,
          transaction,
        );
        return appeal;
      },
    });
  }

  public async approveAppeal(
    actor: ClaimsActorContext,
    appealId: string,
    idempotencyKey: string,
    input: ApproveClaimAppealInput,
  ) {
    if (actor.breakGlassReason !== undefined) {
      throw new ClaimBreakGlassProhibitedError();
    }
    const existing = await this.dependencies.appeals.findById(
      actor.facilityId,
      appealId,
    );
    if (existing === null) {
      throw new ClaimAppealNotFoundError();
    }
    await this.requirePermission(
      actor,
      CLAIM_PERMISSION_KEYS.APPEAL_APPROVE,
      existing.createdBy.toHexString(),
    );
    if (existing.createdBy.toHexString() === actor.userId) {
      throw new ClaimMakerCheckerError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'APPROVE_CLAIM_APPEAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:appeal:${actor.facilityId}:${appealId}`],
      idempotencyPayload: input,
      journalPayload: { appealId },
      execute: async (transaction) => {
        const appeal = await this.dependencies.appeals.findById(
          actor.facilityId,
          appealId,
          transaction.session,
        );
        if (
          appeal === null ||
          appeal.version !== input.expectedVersion ||
          appeal.status !== 'APPROVAL_PENDING'
        ) {
          throw new ClaimVersionConflictError();
        }
        await this.dependencies.approval.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: 'CLAIM_APPEAL_SUBMISSION',
          entityId: appealId,
          makerUserId: appeal.createdBy.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const approved = await this.dependencies.appeals.approve(
          actor.facilityId,
          appealId,
          input.expectedVersion,
          input,
          actor.userId,
          transaction,
        );
        if (approved === null) {
          throw new ClaimVersionConflictError();
        }
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_APPEAL_APPROVED',
          entityType: 'ClaimAppeal',
          entityId: appealId,
          reason: input.decisionReason,
          before: { status: appeal.status },
          after: { status: approved.status },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.publish(
          actor,
          appealId,
          approved.claimId.toHexString(),
          approved.status,
          transaction,
        );
        return approved;
      },
    });
  }

  public async submitAppeal(
    actor: ClaimsActorContext,
    appealId: string,
    idempotencyKey: string,
    input: SubmitClaimAppealInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.APPEAL_SUBMIT);

    return this.dependencies.transactionManager.execute({
      transactionType: 'SUBMIT_CLAIM_APPEAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:appeal:${actor.facilityId}:${appealId}`],
      idempotencyPayload: input,
      journalPayload: { appealId },
      execute: async (transaction) => {
        const appeal = await this.dependencies.appeals.findById(
          actor.facilityId,
          appealId,
          transaction.session,
        );
        if (
          appeal === null ||
          appeal.version !== input.expectedVersion ||
          appeal.status !== 'APPROVED_FOR_SUBMISSION'
        ) {
          throw new ClaimVersionConflictError();
        }
        if (new Date(input.submittedAt).getTime() > appeal.appealDeadline.getTime()) {
          throw new ClaimFinancialReconciliationError(
            'Appeal submission is after the payer deadline',
          );
        }
        if (
          appeal.approvalRequestId === null ||
          appeal.approvedBy === null
        ) {
          throw new ClaimMakerCheckerError();
        }
        await this.dependencies.approval.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: 'CLAIM_APPEAL_SUBMISSION',
          entityId: appealId,
          makerUserId: appeal.createdBy.toHexString(),
          checkerUserId: appeal.approvedBy.toHexString(),
          session: transaction.session,
        });
        const submitted = await this.dependencies.appeals.submit(
          actor.facilityId,
          appealId,
          input.expectedVersion,
          input,
          actor.userId,
          transaction,
        );
        if (submitted === null) {
          throw new ClaimVersionConflictError();
        }
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_APPEAL_SUBMITTED',
          entityType: 'ClaimAppeal',
          entityId: appealId,
          reason: null,
          before: { status: appeal.status },
          after: { status: submitted.status },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.publish(
          actor,
          appealId,
          submitted.claimId.toHexString(),
          submitted.status,
          transaction,
        );
        return submitted;
      },
    });
  }

  public async recordDecision(
    actor: ClaimsActorContext,
    appealId: string,
    idempotencyKey: string,
    input: RecordClaimAppealDecisionInput,
  ) {
    await this.requirePermission(actor, CLAIM_PERMISSION_KEYS.DENIAL_MANAGE);
    const existing = await this.dependencies.appeals.findById(
      actor.facilityId,
      appealId,
    );
    if (existing === null) {
      throw new ClaimAppealNotFoundError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'RECORD_CLAIM_APPEAL_DECISION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:appeal:${actor.facilityId}:${appealId}`,
        `claims:claim:${actor.facilityId}:${existing.claimId.toHexString()}`,
        ...existing.denialIds.map(
          (denialId) =>
            `claims:denial:${actor.facilityId}:${denialId.toHexString()}`,
        ),
      ],
      idempotencyPayload: input,
      journalPayload: { appealId, decision: input.decision },
      execute: async (transaction) => {
        const appeal = await this.dependencies.appeals.findById(
          actor.facilityId,
          appealId,
          transaction.session,
        );
        if (appeal === null) {
          throw new ClaimAppealNotFoundError();
        }
        if (appeal.version !== input.expectedVersion) {
          throw new ClaimVersionConflictError();
        }
        const additional = money(input.approvedAdditionalAmount);
        if (
          additional.greaterThan(decimal128ToString(appeal.requestedAmount)) ||
          (input.decision === 'UPHELD' && additional.isPositive())
        ) {
          throw new ClaimFinancialReconciliationError(
            'Appeal decision amount does not reconcile to the appeal request',
          );
        }
        if (input.attachmentId !== undefined && input.attachmentId !== null) {
          await this.dependencies.attachments.assertAttachmentsUsable({
            facilityId: actor.facilityId,
            actorUserId: actor.userId,
            attachments: [{
              attachmentId: input.attachmentId,
              purpose: 'OTHER',
            }],
          });
        }

        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          appeal.claimId.toHexString(),
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }
        const denials = await this.dependencies.denials.findByIds(
          actor.facilityId,
          claim._id.toHexString(),
          appeal.denialIds.map((id) => id.toHexString()),
          transaction.session,
        );
        if (denials.length !== appeal.denialIds.length) {
          throw new ClaimNotFoundError();
        }

        const lineIds = [...new Set(
          denials.flatMap((denial) =>
            denial.claimLineId === null
              ? []
              : [denial.claimLineId.toHexString()],
          ),
        )];
        const lines = await this.dependencies.lines.findByIds(
          actor.facilityId,
          claim._id.toHexString(),
          lineIds,
          transaction.session,
        );
        if (lines.length !== lineIds.length) {
          throw new ClaimFinancialReconciliationError(
            'Appealed denial lines are incomplete',
          );
        }
        const states = new Map<string, AppealLineState>(
          lines.map((line) => [
            line._id.toHexString(),
            {
              line,
              approvedAmount: money(decimal128ToString(line.approvedAmount)),
              deniedAmount: money(decimal128ToString(line.deniedAmount)),
              disallowedAmount: money(
                decimal128ToString(line.disallowedAmount),
              ),
              returnedAmount: money(decimal128ToString(line.returnedAmount)),
              outstandingAmount: money(
                decimal128ToString(line.outstandingAmount),
              ),
            },
          ]),
        );

        let remainingAdditional = additional;
        for (const denial of denials) {
          if (remainingAdditional.isZero() || denial.claimLineId === null) {
            continue;
          }
          const state = states.get(denial.claimLineId.toHexString());
          if (state === undefined) {
            throw new ClaimFinancialReconciliationError(
              'Appealed denial line was not found',
            );
          }
          const denialLimit = money(decimal128ToString(denial.deniedAmount));
          const applied = applyAppealApproval(
            state,
            smaller(remainingAdditional, denialLimit),
          );
          remainingAdditional = remainingAdditional.minus(applied);
        }
        if (remainingAdditional.isPositive()) {
          throw new ClaimFinancialReconciliationError(
            'Appeal approval must be allocated to denied service lines',
          );
        }

        const deniedReduction = lines.reduce(
          (sum, line) => sum.plus(
            money(decimal128ToString(line.deniedAmount)).minus(
              states.get(line._id.toHexString())!.deniedAmount,
            ),
          ),
          new Decimal(0),
        );
        const disallowedReduction = lines.reduce(
          (sum, line) => sum.plus(
            money(decimal128ToString(line.disallowedAmount)).minus(
              states.get(line._id.toHexString())!.disallowedAmount,
            ),
          ),
          new Decimal(0),
        );
        const returnedReduction = lines.reduce(
          (sum, line) => sum.plus(
            money(decimal128ToString(line.returnedAmount)).minus(
              states.get(line._id.toHexString())!.returnedAmount,
            ),
          ),
          new Decimal(0),
        );

        for (const state of states.values()) {
          const originalAdverse = money(
            decimal128ToString(state.line.deniedAmount),
          )
            .plus(decimal128ToString(state.line.disallowedAmount))
            .plus(decimal128ToString(state.line.returnedAmount));
          const currentAdverse = state.deniedAmount
            .plus(state.disallowedAmount)
            .plus(state.returnedAmount);
          if (currentAdverse.equals(originalAdverse)) {
            continue;
          }
          const updatedLine = await this.dependencies.lines.updateFinancials(
            actor.facilityId,
            state.line._id.toHexString(),
            state.line.version,
            {
              approvedAmount: state.approvedAmount.toFixed(2),
              deniedAmount: state.deniedAmount.toFixed(2),
              disallowedAmount: state.disallowedAmount.toFixed(2),
              returnedAmount: state.returnedAmount.toFixed(2),
              outstandingAmount: state.outstandingAmount.toFixed(2),
              status: currentAdverse.isZero()
                ? 'APPROVED'
                : 'PARTIALLY_APPROVED',
            },
            actor.userId,
            transaction,
          );
          if (updatedLine === null) {
            throw new ClaimVersionConflictError();
          }
        }

        const decided = await this.dependencies.appeals.recordDecision(
          actor.facilityId,
          appealId,
          input,
          actor.userId,
          transaction,
        );
        if (decided === null) {
          throw new ClaimVersionConflictError();
        }

        let finalClaim = claim;
        if (additional.isPositive()) {
          const approvedAmount = money(
            decimal128ToString(claim.approvedAmount),
          ).plus(additional);
          const deniedAmount = Decimal.max(
            0,
            money(decimal128ToString(claim.deniedAmount))
              .minus(deniedReduction),
          );
          const disallowedAmount = Decimal.max(
            0,
            money(decimal128ToString(claim.disallowedAmount))
              .minus(disallowedReduction),
          );
          const returnedAmount = Decimal.max(
            0,
            money(decimal128ToString(claim.returnedAmount))
              .minus(returnedReduction),
          );
          const receivable = calculateClaimReceivable({
            approvedAmount: approvedAmount.toFixed(2),
            paidAmount: decimal128ToString(claim.paidAmount),
            contractualAdjustmentAmount: decimal128ToString(
              claim.contractualAdjustmentAmount,
            ),
            writeOffAmount: decimal128ToString(claim.writeOffAmount),
            payerWithholdingAmount: decimal128ToString(
              claim.payerWithholdingAmount,
            ),
            debitNoteAmount: decimal128ToString(claim.debitNoteAmount),
            creditNoteAmount: decimal128ToString(claim.creditNoteAmount),
            refundAmount: decimal128ToString(claim.refundAmount),
            repaymentAmount: decimal128ToString(claim.repaymentAmount),
          });
          const updated = await this.dependencies.claims.updateFinancials(
            actor.facilityId,
            claim._id.toHexString(),
            claim.version,
            {
              approvedAmount: approvedAmount.toFixed(2),
              deniedAmount: deniedAmount.toFixed(2),
              disallowedAmount: disallowedAmount.toFixed(2),
              returnedAmount: returnedAmount.toFixed(2),
              outstandingAmount: receivable.outstandingAmount,
              overpaymentAmount: receivable.overpaymentAmount,
            },
            actor.userId,
            transaction,
          );
          if (updated === null) {
            throw new ClaimVersionConflictError();
          }
          const targetStatus = deniedAmount
            .plus(disallowedAmount)
            .plus(returnedAmount)
            .isZero()
              ? 'APPROVED'
              : 'PARTIALLY_APPROVED';
          finalClaim = updated.status === targetStatus
            ? updated
            : await this.dependencies.workflow.transition({
                actor,
                claim: updated,
                toStatus: targetStatus,
                reason: input.reason,
                transaction,
              });
          await this.dependencies.ledger.postClaimFinancialEvent({
            actor,
            claimId: claim._id.toHexString(),
            eventType: 'CLAIM_APPEAL_OVERTURNED',
            amount: additional.toFixed(2),
            sourceRecordId: appealId,
            patientId: claim.patientId.toHexString(),
            patientAccountId: claim.patientAccountId.toHexString(),
            invoiceId: claim.invoiceId.toHexString(),
            currency: claim.currency,
            transaction,
          });
        }

        await this.dependencies.denials.resolveMany(
          actor.facilityId,
          appeal.denialIds.map((id) => id.toHexString()),
          input.reason,
          actor.userId,
          transaction,
        );
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_APPEAL_DECISION_RECORDED',
          entityType: 'ClaimAppeal',
          entityId: appealId,
          reason: input.reason,
          before: { status: appeal.status },
          after: {
            status: decided.status,
            claimStatus: finalClaim.status,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.publish(
          actor,
          appealId,
          claim._id.toHexString(),
          decided.status,
          transaction,
        );
        return {
          appeal: decided,
          claim: finalClaim,
        };
      },
    });
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
      sensitiveFinancialAction: permission === CLAIM_PERMISSION_KEYS.APPEAL_APPROVE,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }

  private async publish(
    actor: ClaimsActorContext,
    appealId: string,
    claimId: string,
    status: string,
    transaction: ClaimsTransactionContext,
  ): Promise<void> {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'claims.appeal.changed',
      aggregateType: 'ClaimAppeal',
      aggregateId: appealId,
      payload: {
        claimId,
        appealId,
        status,
        eventAt: this.dependencies.clock.now().toISOString(),
      },
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }
}