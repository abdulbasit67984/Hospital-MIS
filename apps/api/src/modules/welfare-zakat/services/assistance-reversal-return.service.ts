import Decimal from 'decimal.js';

import { decimal128ToString } from '@hospital-mis/database';

import {
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  ReturnFundsInput,
  ReverseAssistanceAllocationInput,
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceAllocationNotFoundError,
  AssistanceApprovalNotFoundError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceFinancialReconciliationError,
  AssistanceFundNotFoundError,
  AssistanceMakerCheckerViolationError,
  AssistanceReversalExceededError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  calculateApprovalRemaining,
  calculateFundPosition,
} from '../welfare-zakat.financial-math.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceAllocationRepositoryPort,
  AssistanceApprovalRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceReversalRepositoryPort,
  FundReturnRepositoryPort,
  FundTransactionRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatClockPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatFinancialDischargePort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceAllocationLineRecord,
  AssistanceAllocationRecord,
  AssistanceApprovalRecord,
  AssistanceFundRecord,
} from '../welfare-zakat.persistence.types.js';
import { projectAssistanceAllocation } from '../welfare-zakat.projections.js';

export type AssistanceFundReturnType = 'REFUND' | 'REPAYMENT' | 'RECOVERY';

export interface PostAssistanceFundReturnInput {
  returnType: AssistanceFundReturnType;
  input: ReturnFundsInput;
}

interface Dependencies {
  transactionManager: WelfareZakatTransactionManagerPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  clock: WelfareZakatClockPort;
  numberSequence: WelfareZakatNumberSequencePort;
  attachments: WelfareZakatAttachmentPort;
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  approvals: AssistanceApprovalRepositoryPort;
  allocations: AssistanceAllocationRepositoryPort;
  reversals: AssistanceReversalRepositoryPort;
  fundReturns: FundReturnRepositoryPort;
  billing: WelfareZakatAuthoritativeBillingPort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
  financialLedger: WelfareZakatFinancialLedgerPort;
  financialDischarge: WelfareZakatFinancialDischargePort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
}

function money(value: Decimal.Value): Decimal {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new AssistanceFinancialReconciliationError('Invalid financial amount');
  }
  return parsed;
}

function positive(value: Decimal.Value): Decimal {
  const parsed = money(value);
  if (!parsed.isPositive()) throw new AssistanceReversalExceededError();
  return parsed;
}

function text(value: Decimal.Value): string {
  return money(value).toFixed(2);
}

function activeAllocationAmount(allocation: AssistanceAllocationRecord): Decimal {
  return money(decimal128ToString(allocation.utilizedAmount))
    .minus(money(decimal128ToString(allocation.reversedAmount)))
    .minus(money(decimal128ToString(allocation.refundedAmount)))
    .minus(money(decimal128ToString(allocation.repaidAmount)))
    .minus(money(decimal128ToString(allocation.recoveredAmount)));
}

function activeLineAmount(line: AssistanceAllocationLineRecord): Decimal {
  return money(decimal128ToString(line.utilizedAmount))
    .minus(money(decimal128ToString(line.reversedAmount)))
    .minus(money(decimal128ToString(line.refundedAmount)))
    .minus(money(decimal128ToString(line.repaidAmount)))
    .minus(money(decimal128ToString(line.recoveredAmount)));
}

function distribute(
  allocation: AssistanceAllocationRecord,
  requested: Decimal,
  invoiceLineId: string | null,
): readonly Readonly<{ line: AssistanceAllocationLineRecord; amount: Decimal }>[] {
  if (invoiceLineId != null) {
    const line = allocation.lines.find(
      (candidate) => candidate.invoiceLineId.toHexString() === invoiceLineId,
    );
    if (line == null || requested.greaterThan(activeLineAmount(line))) {
      throw new AssistanceReversalExceededError();
    }
    return [{ line, amount: requested }];
  }

  let remaining = requested;
  const result: Array<Readonly<{ line: AssistanceAllocationLineRecord; amount: Decimal }>> = [];
  for (const line of allocation.lines) {
    if (remaining.isZero()) break;
    const available = activeLineAmount(line);
    if (!available.isPositive()) continue;
    const used = Decimal.min(remaining, available);
    result.push({ line, amount: used });
    remaining = remaining.minus(used);
  }
  if (!remaining.isZero()) throw new AssistanceReversalExceededError();
  return result;
}

function nextApproval(
  approval: AssistanceApprovalRecord,
  reversalAmount: Decimal,
) {
  const values = {
    approvedAmount: decimal128ToString(approval.approvedAmount),
    reservedAmount: decimal128ToString(approval.reservedAmount),
    committedAmount: decimal128ToString(approval.committedAmount),
    utilizedAmount: decimal128ToString(approval.utilizedAmount),
    reversedAmount: text(
      money(decimal128ToString(approval.reversedAmount)).plus(reversalAmount),
    ),
    releasedAmount: decimal128ToString(approval.releasedAmount),
  };
  return { ...values, remainingAmount: calculateApprovalRemaining(values) };
}

function nextFund(
  fund: AssistanceFundRecord,
  returnType: 'REVERSAL' | AssistanceFundReturnType,
  change: Decimal,
) {
  const refund = money(decimal128ToString(fund.refundAmount))
    .plus(returnType === 'REFUND' ? change : 0);
  const repayment = money(decimal128ToString(fund.repaymentAmount))
    .plus(returnType === 'REPAYMENT' ? change : 0);
  const recovery = money(decimal128ToString(fund.recoveryAmount))
    .plus(returnType === 'RECOVERY' ? change : 0);
  const currentReversed = money(decimal128ToString(fund.reversedBalance));
  const nextReversed = currentReversed.plus(change);
  const utilizationReversal = Decimal.max(
    0,
    nextReversed.minus(refund).minus(repayment).minus(recovery),
  );
  return calculateFundPosition({
    openingBalance: decimal128ToString(fund.openingBalance),
    inflowAmount: decimal128ToString(fund.inflowAmount),
    transferInAmount: decimal128ToString(fund.transferInAmount),
    adjustmentIncreaseAmount: decimal128ToString(fund.adjustmentIncreaseAmount),
    utilizationReversalAmount: text(utilizationReversal),
    refundAmount: text(refund),
    repaymentAmount: text(repayment),
    recoveryAmount: text(recovery),
    transferOutAmount: decimal128ToString(fund.transferOutAmount),
    adjustmentDecreaseAmount: decimal128ToString(fund.adjustmentDecreaseAmount),
    utilizationAmount: text(
      money(decimal128ToString(fund.utilizedBalance)).plus(currentReversed),
    ),
    writeOffAmount: decimal128ToString(fund.writeOffAmount),
    reservedAmount: decimal128ToString(fund.reservedBalance),
    committedAmount: decimal128ToString(fund.committedBalance),
  });
}

export class AssistanceReversalReturnService {
  public constructor(private readonly dependencies: Dependencies) {}

  public async requestReversal(
    actor: WelfareZakatActorContext,
    allocationId: string,
    idempotencyKey: string,
    input: ReverseAssistanceAllocationInput,
  ) {
    await this.requirePermission(
      actor,
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_REQUEST,
    );
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: input.supportingAttachmentIds ?? [],
    });
    return this.dependencies.transactionManager.execute({
      transactionType: 'REQUEST_ASSISTANCE_ALLOCATION_REVERSAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:allocation:${actor.facilityId}:${allocationId}`],
      idempotencyPayload: input,
      journalPayload: { allocationId, amount: input.amount, invoiceLineId: input.invoiceLineId ?? null },
      execute: async (transaction) => {
        const allocation = await this.dependencies.allocations.findById(
          actor.facilityId,
          allocationId,
          transaction.session,
        );
        if (allocation === null) throw new AssistanceAllocationNotFoundError();
        if (!['UTILIZED', 'PARTIALLY_REVERSED', 'RECOVERY_PENDING'].includes(allocation.status)) {
          throw new AssistanceReversalExceededError();
        }
        if (allocation.reversalStatus === 'APPROVAL_PENDING') {
          throw new AssistanceFinancialReconciliationError(
            'An allocation reversal is already awaiting approval',
          );
        }
        const requested = positive(input.amount);
        if (requested.greaterThan(activeAllocationAmount(allocation))) {
          throw new AssistanceReversalExceededError();
        }
        distribute(allocation, requested, input.invoiceLineId ?? null);
        const now = this.dependencies.clock.now();
        const reversal = await this.dependencies.reversals.create({
          actor,
          allocation,
          input,
          operationKey: idempotencyKey,
          immutableHash: stableAssistancePayloadHash({
            allocationId,
            amount: requested.toFixed(2),
            invoiceLineId: input.invoiceLineId ?? null,
            makerUserId: actor.userId,
            transactionId: transaction.transactionId,
          }),
          requestedAt: now,
          transaction,
        });
        const pending = await this.dependencies.allocations.applyFinancialSummary({
          actor,
          allocationId,
          expectedVersion: input.expectedVersion,
          amounts: {},
          status: allocation.status,
          reversalStatus: 'APPROVAL_PENDING',
          transaction,
        });
        if (pending === null) throw new AssistanceVersionConflictError();
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_ALLOCATION_REVERSAL_REQUESTED',
          entityType: 'FundAllocationReversal',
          entityId: reversal._id.toHexString(),
          reason: input.reason,
          before: null,
          after: {
            allocationId,
            amount: requested.toFixed(2),
            status: reversal.status,
          },
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        return {
          reversalId: reversal._id.toHexString(),
          allocation: projectAssistanceAllocation(pending),
          status: reversal.status,
        };
      },
    });
  }

  public async approveAndPostReversal(
    actor: WelfareZakatActorContext,
    reversalId: string,
    idempotencyKey: string,
  ) {
    await this.requirePermission(
      actor,
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
      true,
    );
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }
    return this.dependencies.transactionManager.execute({
      transactionType: 'POST_ASSISTANCE_ALLOCATION_REVERSAL',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:reversal:${actor.facilityId}:${reversalId}`],
      idempotencyPayload: { reversalId },
      journalPayload: { reversalId },
      execute: async (transaction) => {
        const reversal = await this.dependencies.reversals.findById(
          actor.facilityId,
          reversalId,
          transaction.session,
        );
        if (reversal === null) throw new AssistanceFinancialReconciliationError('Reversal was not found');
        if (reversal.makerUserId.toHexString() === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        const allocation = await this.dependencies.allocations.findById(
          actor.facilityId,
          reversal.allocationId.toHexString(),
          transaction.session,
        );
        if (allocation === null) throw new AssistanceAllocationNotFoundError();
        const [fund, approval] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            allocation.fundId.toHexString(),
            transaction.session,
          ),
          this.dependencies.approvals.findById(
            actor.facilityId,
            allocation.approvalId.toHexString(),
            transaction.session,
          ),
        ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        const reversalAmount = positive(decimal128ToString(reversal.amount));
        if (reversalAmount.greaterThan(activeAllocationAmount(allocation))) {
          throw new AssistanceReversalExceededError();
        }
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: reversal.approvalRequestId.toHexString(),
          action: 'ASSISTANCE_ALLOCATION_REVERSAL',
          entityId: reversalId,
          amount: reversalAmount.toFixed(2),
          makerUserId: reversal.makerUserId.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const distributions = distribute(
          allocation,
          reversalAmount,
          reversal.invoiceLineId?.toHexString() ?? null,
        );
        await this.dependencies.billing.reverseAllocation({
          actor,
          allocationId: allocation._id.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          invoiceLineId: reversal.invoiceLineId?.toHexString() ?? null,
          amount: reversalAmount.toFixed(2),
          reason: reversal.reason,
          transaction,
        });
        const nextFundPosition = nextFund(fund, 'REVERSAL', reversalAmount);
        const updatedFund = await this.dependencies.funds.applyFinancialPosition({
          actor,
          fundId: fund._id.toHexString(),
          expectedVersion: fund.version,
          balances: { ...nextFundPosition },
          transaction,
        });
        if (updatedFund === null) throw new AssistanceVersionConflictError();
        const updatedApproval = await this.dependencies.approvals.applyFinancialSummary({
          actor,
          approvalId: approval._id.toHexString(),
          expectedVersion: approval.version,
          amounts: nextApproval(approval, reversalAmount),
          transaction,
        });
        if (updatedApproval === null) throw new AssistanceVersionConflictError();

        const currentReversed = money(decimal128ToString(allocation.reversedAmount));
        const newReversed = currentReversed.plus(reversalAmount);
        const fullyReversed = reversalAmount.equals(activeAllocationAmount(allocation));
        const updatedAllocation = await this.dependencies.allocations.applyFinancialSummary({
          actor,
          allocationId: allocation._id.toHexString(),
          expectedVersion: allocation.version,
          amounts: {
            reversedAmount: newReversed.toFixed(2),
            remainingAmount: text(
              money(decimal128ToString(allocation.remainingAmount)).plus(reversalAmount),
            ),
          },
          lineAmounts: distributions.map(({ line, amount: lineAmount }) => ({
            invoiceLineId: line.invoiceLineId.toHexString(),
            amounts: {
              reversedAmount: text(
                money(decimal128ToString(line.reversedAmount)).plus(lineAmount),
              ),
              remainingAmount: text(
                money(decimal128ToString(line.remainingAmount)).plus(lineAmount),
              ),
            },
          })),
          status: fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED',
          reversalStatus: 'POSTED',
          transaction,
        });
        if (updatedAllocation === null) throw new AssistanceVersionConflictError();
        const posted = await this.dependencies.reversals.post({
          actor,
          reversalId,
          checkerUserId: actor.userId,
          postedAt: this.dependencies.clock.now(),
          transaction,
        });
        if (posted === null) throw new AssistanceVersionConflictError();
        await this.appendFundCredit(
          actor,
          fund,
          allocation,
          'UTILIZATION_REVERSAL',
          reversalAmount.toFixed(2),
          decimal128ToString(fund.ledgerBalance),
          nextFundPosition.ledgerBalance,
          reversal.reason,
          reversal.approvalRequestId.toHexString(),
          { reversalId },
          transaction,
        );
        await this.dependencies.financialLedger.postFundFinancialEvent({
          actor,
          fundId: fund._id.toHexString(),
          eventType: 'ASSISTANCE_UTILIZATION_REVERSAL',
          amount: reversalAmount.toFixed(2),
          sourceRecordId: reversalId,
          patientId: allocation.patientId.toHexString(),
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          currency: allocation.currency,
          transaction,
        });
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_ALLOCATION_REVERSAL_POSTED',
          entityType: 'FundAllocationReversal',
          entityId: reversalId,
          reason: reversal.reason,
          before: projectAssistanceAllocation(allocation),
          after: projectAssistanceAllocation(updatedAllocation),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(actor, updatedAllocation, allocation.status, transaction);
        return projectAssistanceAllocation(updatedAllocation);
      },
    });
  }

  public async postFundReturn(
    actor: WelfareZakatActorContext,
    allocationId: string,
    idempotencyKey: string,
    command: PostAssistanceFundReturnInput,
  ) {
    const permission = command.returnType === 'REFUND'
      ? WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE
      : command.returnType === 'REPAYMENT'
        ? WELFARE_ZAKAT_PERMISSION_KEYS.REPAYMENT_APPROVE
        : WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE;
    await this.requirePermission(actor, permission, true);
    if (actor.breakGlassReason != null) throw new AssistanceBreakGlassApprovalBypassError();
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: command.input.supportingAttachmentIds ?? [],
    });

    return this.dependencies.transactionManager.execute({
      transactionType: `POST_ASSISTANCE_${command.returnType}`,
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:allocation:${actor.facilityId}:${allocationId}`],
      idempotencyPayload: command,
      journalPayload: { allocationId, returnType: command.returnType, amount: command.input.amount },
      execute: async (transaction) => {
        const allocation = await this.dependencies.allocations.findById(
          actor.facilityId,
          allocationId,
          transaction.session,
        );
        if (allocation === null) throw new AssistanceAllocationNotFoundError();
        const [fund, approval] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            allocation.fundId.toHexString(),
            transaction.session,
          ),
          this.dependencies.approvals.findById(
            actor.facilityId,
            allocation.approvalId.toHexString(),
            transaction.session,
          ),
        ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        const returnAmount = positive(command.input.amount);
        const active = activeAllocationAmount(allocation);
        if (returnAmount.greaterThan(active)) throw new AssistanceReversalExceededError();
        const authoritativeSource = await this.dependencies.billing.assertFundReturnSource({
          facilityId: actor.facilityId,
          allocation,
          returnType: command.returnType,
          amount: returnAmount.toFixed(2),
          paymentId: command.input.paymentId ?? null,
          refundId: command.input.refundId ?? null,
          creditNoteId: command.input.creditNoteId ?? null,
          debitNoteId: command.input.debitNoteId ?? null,
          claimAdjustmentId: command.input.claimAdjustmentId ?? null,
          session: transaction.session,
        });
        if (authoritativeSource.makerUserId === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId: command.input.approvalRequestId,
          action: `ASSISTANCE_${command.returnType}`,
          entityId: allocationId,
          amount: returnAmount.toFixed(2),
          makerUserId: authoritativeSource.makerUserId,
          checkerUserId: actor.userId,
          session: transaction.session,
        });
        const distributions = distribute(allocation, returnAmount, null);
        await this.dependencies.billing.reverseAllocation({
          actor,
          allocationId,
          invoiceId: allocation.invoiceId.toHexString(),
          amount: returnAmount.toFixed(2),
          reason: command.input.reason,
          transaction,
        });
        const nextFundPosition = nextFund(fund, command.returnType, returnAmount);
        const updatedFund = await this.dependencies.funds.applyFinancialPosition({
          actor,
          fundId: fund._id.toHexString(),
          expectedVersion: fund.version,
          balances: { ...nextFundPosition },
          transaction,
        });
        if (updatedFund === null) throw new AssistanceVersionConflictError();
        const updatedApproval = await this.dependencies.approvals.applyFinancialSummary({
          actor,
          approvalId: approval._id.toHexString(),
          expectedVersion: approval.version,
          amounts: nextApproval(approval, returnAmount),
          transaction,
        });
        if (updatedApproval === null) throw new AssistanceVersionConflictError();

        const field = command.returnType === 'REFUND'
          ? 'refundedAmount'
          : command.returnType === 'REPAYMENT'
            ? 'repaidAmount'
            : 'recoveredAmount';
        const current = money(decimal128ToString(allocation[field]));
        const fullyReturned = returnAmount.equals(active);
        const updatedAllocation = await this.dependencies.allocations.applyFinancialSummary({
          actor,
          allocationId,
          expectedVersion: command.input.expectedAllocationVersion,
          amounts: {
            [field]: current.plus(returnAmount).toFixed(2),
            remainingAmount: text(
              money(decimal128ToString(allocation.remainingAmount)).plus(returnAmount),
            ),
          },
          lineAmounts: distributions.map(({ line, amount: lineAmount }) => ({
            invoiceLineId: line.invoiceLineId.toHexString(),
            amounts: {
              [field]: money(decimal128ToString(line[field])).plus(lineAmount).toFixed(2),
              remainingAmount: money(decimal128ToString(line.remainingAmount))
                .plus(lineAmount)
                .toFixed(2),
            },
          })),
          status: fullyReturned
            ? command.returnType === 'RECOVERY'
              ? 'RECOVERED'
              : 'REVERSED'
            : 'PARTIALLY_REVERSED',
          reversalStatus: null,
          transaction,
        });
        if (updatedAllocation === null) throw new AssistanceVersionConflictError();

        const postedAt = this.dependencies.clock.now();
        const fundReturn = await this.dependencies.fundReturns.create({
          actor,
          makerUserId: authoritativeSource.makerUserId,
          returnType: command.returnType,
          allocation,
          input: command.input,
          operationKey: idempotencyKey,
          checkerUserId: actor.userId,
          postedAt,
          immutableHash: stableAssistancePayloadHash({
            allocationId,
            returnType: command.returnType,
            amount: returnAmount.toFixed(2),
            makerUserId: authoritativeSource.makerUserId,
            checkerUserId: actor.userId,
            sourceRecordId: authoritativeSource.sourceRecordId,
            transactionId: transaction.transactionId,
          }),
          transaction,
        });
        const transactionType = command.returnType === 'REFUND'
          ? 'REFUND_TO_FUND'
          : command.returnType === 'REPAYMENT'
            ? 'REPAYMENT_TO_FUND'
            : 'RECOVERY_TO_FUND';
        await this.appendFundCredit(
          actor,
          fund,
          allocation,
          transactionType,
          returnAmount.toFixed(2),
          decimal128ToString(fund.ledgerBalance),
          nextFundPosition.ledgerBalance,
          command.input.reason,
          command.input.approvalRequestId,
          {
            paymentId: command.input.paymentId ?? null,
            refundId: command.input.refundId ?? null,
            creditNoteId: command.input.creditNoteId ?? null,
            debitNoteId: command.input.debitNoteId ?? null,
            claimAdjustmentId: command.input.claimAdjustmentId ?? null,
          },
          transaction,
        );
        await this.dependencies.financialLedger.postFundFinancialEvent({
          actor,
          fundId: fund._id.toHexString(),
          eventType: `ASSISTANCE_${command.returnType}_TO_FUND`,
          amount: returnAmount.toFixed(2),
          sourceRecordId: fundReturn._id.toHexString(),
          patientId: allocation.patientId.toHexString(),
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          paymentId: command.input.paymentId ?? null,
          currency: allocation.currency,
          transaction,
        });
        await this.dependencies.financialDischarge.refreshClearance({
          facilityId: actor.facilityId,
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          actorUserId: actor.userId,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: `ASSISTANCE_${command.returnType}_POSTED`,
          entityType: 'FundReturn',
          entityId: fundReturn._id.toHexString(),
          reason: command.input.reason,
          before: projectAssistanceAllocation(allocation),
          after: projectAssistanceAllocation(updatedAllocation),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(actor, updatedAllocation, allocation.status, transaction);
        return {
          fundReturnId: fundReturn._id.toHexString(),
          allocation: projectAssistanceAllocation(updatedAllocation),
        };
      },
    });
  }

  private async appendFundCredit(
    actor: WelfareZakatActorContext,
    fund: AssistanceFundRecord,
    allocation: AssistanceAllocationRecord,
    transactionType:
      | 'UTILIZATION_REVERSAL'
      | 'REFUND_TO_FUND'
      | 'REPAYMENT_TO_FUND'
      | 'RECOVERY_TO_FUND',
    transactionAmount: string,
    balanceBefore: string,
    balanceAfter: string,
    reason: string,
    approvalRequestId: string,
    references: Readonly<{
      reversalId?: string;
      paymentId?: string | null;
      refundId?: string | null;
      creditNoteId?: string | null;
      debitNoteId?: string | null;
      claimAdjustmentId?: string | null;
    }>,
    transaction: WelfareZakatTransactionContext,
  ) {
    const occurredAt = this.dependencies.clock.now();
    const transactionNumber = await this.dependencies.numberSequence.next({
      facilityId: actor.facilityId,
      sequenceKey: WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
      effectiveAt: occurredAt,
      actorUserId: actor.userId,
      transaction,
    });
    await this.dependencies.fundTransactions.append({
      actor,
      fund,
      transactionNumber,
      operationKey: `${transaction.transactionId}:${transactionType}:${allocation._id.toHexString()}`,
      transactionType,
      direction: 'CREDIT',
      amount: transactionAmount,
      balanceBefore,
      balanceAfter,
      applicationId: allocation.applicationId.toHexString(),
      approvalId: allocation.approvalId.toHexString(),
      reservationId: allocation.reservationId?.toHexString() ?? null,
      allocationId: allocation._id.toHexString(),
      invoiceId: allocation.invoiceId.toHexString(),
      paymentId: references.paymentId ?? null,
      refundId: references.refundId ?? null,
      creditNoteId: references.creditNoteId ?? null,
      debitNoteId: references.debitNoteId ?? null,
      claimId: allocation.claimId?.toHexString() ?? null,
      claimAdjustmentId: references.claimAdjustmentId ?? null,
      reason,
      makerUserId: allocation.allocatedBy.toHexString(),
      checkerUserId: actor.userId,
      approvalRequestId,
      occurredAt,
      immutableHash: stableAssistancePayloadHash({
        allocationId: allocation._id.toHexString(),
        transactionType,
        transactionAmount,
        balanceBefore,
        balanceAfter,
        transactionId: transaction.transactionId,
      }),
      transaction,
    });
  }

  private async requirePermission(
    actor: WelfareZakatActorContext,
    permission: string,
    sensitiveFinancialAction = false,
  ) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
  }

  private async enqueue(
    actor: WelfareZakatActorContext,
    allocation: AssistanceAllocationRecord,
    previousStatus: string,
    transaction: WelfareZakatTransactionContext,
  ) {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'welfare_zakat.allocation.changed',
      aggregateType: 'InvoiceFundAllocation',
      aggregateId: allocation._id.toHexString(),
      payload: safeWelfareZakatRealtimePayload({
        applicationId: allocation.applicationId.toHexString(),
        approvalId: allocation.approvalId.toHexString(),
        allocationId: allocation._id.toHexString(),
        fundId: allocation.fundId.toHexString(),
        status: allocation.status,
        previousStatus,
        version: allocation.version,
        eventAt: this.dependencies.clock.now().toISOString(),
      }),
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }
}