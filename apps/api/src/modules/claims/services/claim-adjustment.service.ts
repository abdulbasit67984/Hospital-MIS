import Decimal from 'decimal.js';

import {
  decimal128ToString,
} from '@hospital-mis/database';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
  RequestClaimAdjustmentInput,
  RequestClaimWriteOffInput,
  SensitiveClaimActionInput,
} from '../claims.contracts.js';

import {
  ClaimAccessDeniedError,
  ClaimBreakGlassProhibitedError,
  ClaimMakerCheckerError,
  ClaimNotFoundError,
  ClaimPaymentOverAllocationError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import {
  calculateClaimReceivable,
} from '../claims.financial-math.js';

import type {
  ClaimAdjustmentRepositoryPort,
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
} from '../claims.ports.js';

export interface ClaimAdjustmentServiceDependencies {
  claims: ClaimsRepositoryPort;
  lines: ClaimLineRepositoryPort;
  adjustments: ClaimAdjustmentRepositoryPort;
  accessPolicy: ClaimsAccessPolicyPort;
  approval: ClaimsApprovalPort;
  transactionManager: ClaimsTransactionManagerPort;
  ledger: ClaimsFinancialLedgerPort;
  financialDischarge: ClaimsFinancialDischargePort;
  audit: ClaimsAuditPort;
  outbox: ClaimsOutboxPort;
  clock: ClaimsClockPort;
}

type ClaimAdjustmentInput =
  | RequestClaimAdjustmentInput
  | RequestClaimWriteOffInput;

function money(value: unknown): Decimal {
  return new Decimal(String(value ?? '0')).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
}

function requestedType(input: ClaimAdjustmentInput): string {
  return 'adjustmentType' in input
    ? input.adjustmentType
    : 'WRITE_OFF';
}

function permissionForRequest(type: string): string {
  return type === 'WRITE_OFF'
    ? CLAIM_PERMISSION_KEYS.WRITE_OFF_REQUEST
    : CLAIM_PERMISSION_KEYS.ADJUSTMENT_REQUEST;
}

function permissionForApproval(type: string): string {
  return type === 'WRITE_OFF'
    ? CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE
    : CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE;
}

export class ClaimAdjustmentService {
  public constructor(
    private readonly dependencies: ClaimAdjustmentServiceDependencies,
  ) {}

  public async requestAdjustment(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: RequestClaimAdjustmentInput,
  ) {
    return this.request(actor, claimId, idempotencyKey, input);
  }

  public async requestWriteOff(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: RequestClaimWriteOffInput,
  ) {
    return this.request(actor, claimId, idempotencyKey, input);
  }

  public async approveAndPost(
    actor: ClaimsActorContext,
    adjustmentId: string,
    idempotencyKey: string,
    input: SensitiveClaimActionInput,
  ) {
    if (actor.breakGlassReason !== undefined) {
      throw new ClaimBreakGlassProhibitedError();
    }

    const existing = await this.dependencies.adjustments.findById(
      actor.facilityId,
      adjustmentId,
    );
    if (existing === null) {
      throw new ClaimNotFoundError();
    }
    await this.requirePermission(
      actor,
      permissionForApproval(existing.adjustmentType),
      existing.makerUserId.toHexString(),
    );
    if (existing.makerUserId.toHexString() === actor.userId) {
      throw new ClaimMakerCheckerError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'APPROVE_POST_CLAIM_ADJUSTMENT',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `claims:adjustment:${actor.facilityId}:${adjustmentId}`,
        `claims:claim:${actor.facilityId}:${existing.claimId.toHexString()}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        adjustmentId,
        claimId: existing.claimId.toHexString(),
      },
      execute: async (transaction) => {
        const adjustment = await this.dependencies.adjustments.findById(
          actor.facilityId,
          adjustmentId,
          transaction.session,
        );
        if (
          adjustment === null ||
          adjustment.version !== input.expectedVersion ||
          adjustment.status !== 'REQUESTED'
        ) {
          throw new ClaimVersionConflictError();
        }
        const claim = await this.dependencies.claims.findById(
          actor.facilityId,
          adjustment.claimId.toHexString(),
          transaction.session,
        );
        if (claim === null) {
          throw new ClaimNotFoundError();
        }

        if (
          adjustment.approvalRequestId !== null &&
          adjustment.approvalRequestId.toHexString() !==
            input.approvalRequestId
        ) {
          throw new ClaimMakerCheckerError();
        }

        await this.dependencies.approval.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: input.approvalRequestId,
          action: `CLAIM_${adjustment.adjustmentType}`,
          entityId: adjustmentId,
          makerUserId: adjustment.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });

        const amount = money(decimal128ToString(adjustment.amount));
        const next = {
          contractualAdjustmentAmount: money(
            decimal128ToString(claim.contractualAdjustmentAmount),
          ),
          disallowedAmount: money(
            decimal128ToString(claim.disallowedAmount),
          ),
          payerWithholdingAmount: money(
            decimal128ToString(claim.payerWithholdingAmount),
          ),
          writeOffAmount: money(decimal128ToString(claim.writeOffAmount)),
          debitNoteAmount: money(decimal128ToString(claim.debitNoteAmount)),
          creditNoteAmount: money(
            decimal128ToString(claim.creditNoteAmount),
          ),
          refundAmount: money(decimal128ToString(claim.refundAmount)),
          repaymentAmount: money(decimal128ToString(claim.repaymentAmount)),
        };

        switch (adjustment.adjustmentType) {
          case 'CONTRACTUAL':
          case 'ROUNDING':
            next.contractualAdjustmentAmount =
              next.contractualAdjustmentAmount.plus(amount);
            break;
          case 'DISALLOWED':
            next.disallowedAmount = next.disallowedAmount.plus(amount);
            break;
          case 'PAYER_WITHHOLDING':
            next.payerWithholdingAmount =
              next.payerWithholdingAmount.plus(amount);
            break;
          case 'WRITE_OFF':
            next.writeOffAmount = next.writeOffAmount.plus(amount);
            break;
          case 'DEBIT_NOTE':
            next.debitNoteAmount = next.debitNoteAmount.plus(amount);
            break;
          case 'CREDIT_NOTE':
            next.creditNoteAmount = next.creditNoteAmount.plus(amount);
            break;
          case 'REFUND':
            next.refundAmount = next.refundAmount.plus(amount);
            break;
          case 'REPAYMENT':
            next.repaymentAmount = next.repaymentAmount.plus(amount);
            break;
          default:
            throw new ClaimPaymentOverAllocationError();
        }

        const receivable = calculateClaimReceivable({
          approvedAmount: decimal128ToString(claim.approvedAmount),
          paidAmount: decimal128ToString(claim.paidAmount),
          contractualAdjustmentAmount:
            next.contractualAdjustmentAmount.toFixed(2),
          writeOffAmount: next.writeOffAmount.toFixed(2),
          payerWithholdingAmount:
            next.payerWithholdingAmount.toFixed(2),
          debitNoteAmount: next.debitNoteAmount.toFixed(2),
          creditNoteAmount: next.creditNoteAmount.toFixed(2),
          refundAmount: next.refundAmount.toFixed(2),
          repaymentAmount: next.repaymentAmount.toFixed(2),
        });

        if (
          adjustment.adjustmentType === 'REFUND' &&
          amount.greaterThan(
            money(decimal128ToString(claim.paidAmount))
              .plus(next.repaymentAmount)
              .minus(money(decimal128ToString(claim.refundAmount))),
          )
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        if (
          adjustment.adjustmentType === 'REPAYMENT' &&
          amount.greaterThan(
            money(decimal128ToString(claim.refundAmount))
              .minus(money(decimal128ToString(claim.repaymentAmount))),
          )
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        if (
          [
            'CONTRACTUAL',
            'ROUNDING',
            'PAYER_WITHHOLDING',
            'WRITE_OFF',
            'CREDIT_NOTE',
          ].includes(
            adjustment.adjustmentType,
          ) &&
          amount.greaterThan(decimal128ToString(claim.outstandingAmount))
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        const posted = await this.dependencies.adjustments.approveAndPost(
          actor.facilityId,
          adjustmentId,
          adjustment.version,
          input.approvalRequestId,
          actor.userId,
          transaction,
        );
        if (posted === null) {
          throw new ClaimVersionConflictError();
        }

        if (adjustment.claimLineId !== null) {
          const [line] = await this.dependencies.lines.findByIds(
            actor.facilityId,
            claim._id.toHexString(),
            [adjustment.claimLineId.toHexString()],
            transaction.session,
          );
          if (line === undefined) {
            throw new ClaimVersionConflictError();
          }
          const currentLineOutstanding = money(
            decimal128ToString(line.outstandingAmount),
          );
          const reducesOutstanding = [
            'CONTRACTUAL',
            'ROUNDING',
            'PAYER_WITHHOLDING',
            'WRITE_OFF',
            'CREDIT_NOTE',
          ].includes(adjustment.adjustmentType);
          const lineOutstanding = ['DEBIT_NOTE', 'REFUND'].includes(
            adjustment.adjustmentType,
          )
            ? currentLineOutstanding.plus(amount)
            : reducesOutstanding || adjustment.adjustmentType === 'REPAYMENT'
              ? Decimal.max(0, currentLineOutstanding.minus(amount))
              : currentLineOutstanding;
          const update: Record<string, unknown> = {
            outstandingAmount: lineOutstanding.toFixed(2),
          };
          if (adjustment.adjustmentType === 'WRITE_OFF') {
            update['writeOffAmount'] = money(
              decimal128ToString(line.writeOffAmount),
            ).plus(amount).toFixed(2);
          } else if (
            ['CONTRACTUAL', 'ROUNDING'].includes(adjustment.adjustmentType)
          ) {
            update['contractualAdjustmentAmount'] = money(
              decimal128ToString(line.contractualAdjustmentAmount),
            ).plus(amount).toFixed(2);
          } else if (adjustment.adjustmentType === 'PAYER_WITHHOLDING') {
            update['payerWithholdingAmount'] = money(
              decimal128ToString(line.payerWithholdingAmount),
            ).plus(amount).toFixed(2);
          } else if (adjustment.adjustmentType === 'DISALLOWED') {
            update['disallowedAmount'] = money(
              decimal128ToString(line.disallowedAmount),
            ).plus(amount).toFixed(2);
          }
          const updatedLine = await this.dependencies.lines.updateFinancials(
            actor.facilityId,
            line._id.toHexString(),
            line.version,
            update,
            actor.userId,
            transaction,
          );
          if (updatedLine === null) {
            throw new ClaimVersionConflictError();
          }
        }

        const updatedClaim = await this.dependencies.claims.updateFinancials(
          actor.facilityId,
          claim._id.toHexString(),
          claim.version,
          {
            contractualAdjustmentAmount:
              next.contractualAdjustmentAmount.toFixed(2),
            disallowedAmount: next.disallowedAmount.toFixed(2),
            payerWithholdingAmount:
              next.payerWithholdingAmount.toFixed(2),
            writeOffAmount: next.writeOffAmount.toFixed(2),
            debitNoteAmount: next.debitNoteAmount.toFixed(2),
            creditNoteAmount: next.creditNoteAmount.toFixed(2),
            refundAmount: next.refundAmount.toFixed(2),
            repaymentAmount: next.repaymentAmount.toFixed(2),
            outstandingAmount: receivable.outstandingAmount,
            overpaymentAmount: receivable.overpaymentAmount,
          },
          actor.userId,
          transaction,
        );
        if (updatedClaim === null) {
          throw new ClaimVersionConflictError();
        }

        await this.dependencies.ledger.postClaimFinancialEvent({
          actor,
          claimId: claim._id.toHexString(),
          eventType: `CLAIM_${adjustment.adjustmentType}_POSTED`,
          amount: amount.toFixed(2),
          sourceRecordId: adjustmentId,
          patientId: claim.patientId.toHexString(),
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          currency: claim.currency,
          transaction,
        });
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: claim.patientAccountId.toHexString(),
          invoiceId: claim.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_ADJUSTMENT_POSTED',
          entityType: 'ClaimAdjustment',
          entityId: adjustmentId,
          reason: input.reason,
          before: { status: adjustment.status },
          after: {
            status: posted.status,
            claimVersion: updatedClaim.version,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.adjustment.posted',
          aggregateType: 'Claim',
          aggregateId: claim._id.toHexString(),
          payload: {
            claimId: claim._id.toHexString(),
            status: updatedClaim.status,
            version: updatedClaim.version,
            eventAt: this.dependencies.clock.now().toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });

        return {
          adjustment: posted,
          claim: updatedClaim,
        };
      },
    });
  }

  private async request(
    actor: ClaimsActorContext,
    claimId: string,
    idempotencyKey: string,
    input: ClaimAdjustmentInput,
  ) {
    const type = requestedType(input);
    await this.requirePermission(actor, permissionForRequest(type));

    return this.dependencies.transactionManager.execute({
      transactionType: 'REQUEST_CLAIM_ADJUSTMENT',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`claims:claim:${actor.facilityId}:${claimId}`],
      idempotencyPayload: input,
      journalPayload: { claimId, adjustmentType: type },
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
        if (['CANCELLED', 'REVERSED', 'VOIDED'].includes(claim.status)) {
          throw new ClaimPaymentOverAllocationError();
        }
        if (
          !['REFUND', 'REPAYMENT'].includes(type) &&
          money(input.amount).greaterThan(
            Decimal.max(
              decimal128ToString(claim.approvedAmount),
              decimal128ToString(claim.outstandingAmount),
            ),
          )
        ) {
          throw new ClaimPaymentOverAllocationError();
        }

        const created = await this.dependencies.adjustments.create(
          actor,
          claimId,
          input,
          type,
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'CLAIM_ADJUSTMENT_REQUESTED',
          entityType: 'ClaimAdjustment',
          entityId: created._id.toHexString(),
          reason: input.reason,
          before: null,
          after: {
            status: created.status,
            adjustmentType: created.adjustmentType,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.dependencies.outbox.enqueue({
          facilityId: actor.facilityId,
          eventType: 'claims.adjustment.requested',
          aggregateType: 'ClaimAdjustment',
          aggregateId: created._id.toHexString(),
          payload: {
            claimId,
            status: created.status,
            eventAt: this.dependencies.clock.now().toISOString(),
          },
          correlationId: actor.correlationId,
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return created;
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
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new ClaimAccessDeniedError(
        decision.denialReason ?? undefined,
      );
    }
  }
}