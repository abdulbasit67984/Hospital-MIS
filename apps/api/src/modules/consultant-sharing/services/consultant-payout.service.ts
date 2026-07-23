import Decimal from 'decimal.js';

import type {
  ConsultantSettlementView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantSettlementNotFoundError,
  ConsultantSettlementOverpaymentError,
  ConsultantSettlementReconciliationError,
  ConsultantSharingAccessDeniedError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import { calculateConsultantSettlementTotals } from '../consultant-sharing.financial-math.js';
import type { ConsultantSettlementPaymentView } from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantApprovalPort,
  ConsultantAuditPort,
  ConsultantClockPort,
  ConsultantFinancialAdjustmentLedgerPort,
  ConsultantIdempotencyPort,
  ConsultantOperationLockPort,
  ConsultantOutboxPort,
  ConsultantPayoutPort,
  ConsultantSequencePort,
  ConsultantSettlementPaymentRepositoryPort,
  ConsultantSettlementRepositoryPort,
  ConsultantSharingAccessPolicyPort,
  ConsultantSharingTransactionManagerPort,
} from '../consultant-sharing.ports.js';

export interface RequestConsultantPayoutInput {
  settlementId: string;
  paymentMethod: ConsultantSettlementPaymentView['paymentMethod'];
  paymentMethodId: string;
  amount: string;
  taxWithholdingAmount?: string;
  advanceRecoveryAmount?: string;
  overpaymentRecoveryAmount?: string;
  otherDeductionAmount?: string;
  paymentReference: string;
  payoutProfileReference?: string | null;
  cashShiftId?: string | null;
  cashCounterId?: string | null;
  approvalRequestId: string;
}

export interface ExecuteConsultantPayoutInput {
  settlementPaymentId: string;
  paymentMethodId: string;
  paymentReference: string;
  cashierShiftId?: string | null;
}

export interface ReverseConsultantPayoutInput {
  settlementPaymentId: string;
  expectedSettlementVersion: number;
  makerUserId: string;
  approvalRequestId: string;
  reason: string;
}

export interface ConsultantPayoutServiceDependencies {
  settlements: ConsultantSettlementRepositoryPort;
  payments: ConsultantSettlementPaymentRepositoryPort;
  approval: ConsultantApprovalPort;
  payout: ConsultantPayoutPort;
  ledger: ConsultantFinancialAdjustmentLedgerPort;
  sequence: ConsultantSequencePort;
  accessPolicy: ConsultantSharingAccessPolicyPort;
  transactions: ConsultantSharingTransactionManagerPort;
  idempotency: ConsultantIdempotencyPort;
  locks: ConsultantOperationLockPort;
  audit: ConsultantAuditPort;
  outbox: ConsultantOutboxPort;
  clock: ConsultantClockPort;
}

function money(field: string, value: Decimal.Value, positive = false): Decimal {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite() || parsed.isNegative() || (positive && !parsed.greaterThan(0))) {
    throw new ConsultantSettlementReconciliationError(`${field} contains an invalid amount`);
  }
  return parsed;
}

function maskedReference(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(Math.min(12, normalized.length - 4))}${normalized.slice(-4)}`;
}

function settlementAfterPayment(
  settlement: ConsultantSettlementView,
  amountValue: Decimal,
) {
  const paidAmount = new Decimal(settlement.totals.paidAmount).plus(amountValue);
  if (paidAmount.greaterThan(settlement.totals.netPayable)) {
    throw new ConsultantSettlementOverpaymentError();
  }
  return calculateConsultantSettlementTotals({
    openingBalance: settlement.totals.openingBalance,
    broughtForwardBalance: settlement.totals.broughtForwardBalance,
    eligibleRevenue: settlement.totals.eligibleRevenue,
    consultantShare: settlement.totals.consultantShare,
    adjustments: settlement.totals.adjustments,
    refundDeductions: settlement.totals.refundDeductions,
    creditNoteDeductions: settlement.totals.creditNoteDeductions,
    debitNoteAdditions: settlement.totals.debitNoteAdditions,
    claimDeductions: settlement.totals.claimDeductions,
    welfareZakatDeductions: settlement.totals.welfareZakatDeductions,
    taxWithholding: settlement.totals.taxWithholding,
    otherDeductions: settlement.totals.otherDeductions,
    advanceRecovery: settlement.totals.advanceRecovery,
    overpaymentRecovery: settlement.totals.overpaymentRecovery,
    paidAmount: paidAmount.toFixed(2),
  });
}

function settlementAfterPayoutReversal(
  settlement: ConsultantSettlementView,
  amountValue: Decimal,
) {
  const paidAmount = new Decimal(settlement.totals.paidAmount).minus(amountValue);
  if (paidAmount.isNegative()) {
    throw new ConsultantSettlementReconciliationError('Payout reversal exceeds the settlement paid amount');
  }
  return calculateConsultantSettlementTotals({
    openingBalance: settlement.totals.openingBalance,
    broughtForwardBalance: settlement.totals.broughtForwardBalance,
    eligibleRevenue: settlement.totals.eligibleRevenue,
    consultantShare: settlement.totals.consultantShare,
    adjustments: settlement.totals.adjustments,
    refundDeductions: settlement.totals.refundDeductions,
    creditNoteDeductions: settlement.totals.creditNoteDeductions,
    debitNoteAdditions: settlement.totals.debitNoteAdditions,
    claimDeductions: settlement.totals.claimDeductions,
    welfareZakatDeductions: settlement.totals.welfareZakatDeductions,
    taxWithholding: settlement.totals.taxWithholding,
    otherDeductions: settlement.totals.otherDeductions,
    advanceRecovery: settlement.totals.advanceRecovery,
    overpaymentRecovery: settlement.totals.overpaymentRecovery,
    paidAmount: paidAmount.toFixed(2),
  });
}

export class ConsultantPayoutService {
  public constructor(private readonly dependencies: ConsultantPayoutServiceDependencies) {}

  public async request(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: RequestConsultantPayoutInput,
  ): Promise<ConsultantSettlementPaymentView> {
    await this.assertAllowed(actor, 'PAYOUT_REQUEST', false);
    const amountValue = money('amount', input.amount, true);
    const taxWithholding = money('taxWithholdingAmount', input.taxWithholdingAmount ?? '0.00');
    const advanceRecovery = money('advanceRecoveryAmount', input.advanceRecoveryAmount ?? '0.00');
    const overpaymentRecovery = money('overpaymentRecoveryAmount', input.overpaymentRecoveryAmount ?? '0.00');
    const otherDeduction = money('otherDeductionAmount', input.otherDeductionAmount ?? '0.00');
    const netDisbursed = amountValue.minus(taxWithholding).minus(advanceRecovery).minus(overpaymentRecovery).minus(otherDeduction);
    if (netDisbursed.isNegative()) throw new ConsultantSettlementReconciliationError('Payout deductions exceed the payout amount');
    if (input.paymentMethod === 'CASH' && (input.cashShiftId == null || input.cashCounterId == null)) {
      throw new ConsultantSettlementReconciliationError('Cash consultant payouts require cashier shift and counter references');
    }

    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_PAYOUT_REQUEST',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ ...input, paymentReference: stableConsultantSharingPayloadHash(input.paymentReference) }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-payout-request:${actor.facilityId}:${input.settlementId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 60_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const settlement = await this.dependencies.settlements.findById({ facilityId: actor.facilityId, settlementId: input.settlementId, transaction });
          if (settlement == null) throw new ConsultantSettlementNotFoundError();
          if (!['APPROVED', 'PARTIALLY_PAID'].includes(settlement.status)) {
            throw new ConsultantSettlementReconciliationError('Only approved settlements with an outstanding balance can be paid');
          }
          if (amountValue.greaterThan(settlement.totals.outstandingAmount)) throw new ConsultantSettlementOverpaymentError();
          const now = this.dependencies.clock.now();
          const payoutNumber = await this.dependencies.sequence.next({ facilityId: actor.facilityId, sequenceKey: 'CONSULTANT_PAYOUT_NUMBER', occurredAt: now, transaction });
          const payment = await this.dependencies.payments.create({
            actor,
            payoutNumber,
            settlement,
            paymentMethod: input.paymentMethod,
            amount: amountValue.toFixed(2),
            taxWithholdingAmount: taxWithholding.toFixed(2),
            advanceRecoveryAmount: advanceRecovery.toFixed(2),
            overpaymentRecoveryAmount: overpaymentRecovery.toFixed(2),
            otherDeductionAmount: otherDeduction.toFixed(2),
            netDisbursedAmount: netDisbursed.toFixed(2),
            paymentReferenceHash: stableConsultantSharingPayloadHash({ facilityId: actor.facilityId, reference: input.paymentReference.trim() }),
            paymentReferenceMasked: maskedReference(input.paymentReference),
            payoutProfileReferenceHash: input.payoutProfileReference == null ? null : stableConsultantSharingPayloadHash({ facilityId: actor.facilityId, profile: input.payoutProfileReference }),
            payoutProfileReferenceMasked: input.payoutProfileReference == null ? null : maskedReference(input.payoutProfileReference),
            cashShiftId: input.cashShiftId ?? null,
            cashCounterId: input.cashCounterId ?? null,
            approvalRequestId: input.approvalRequestId,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'PAYOUT', facilityId: actor.facilityId, idempotencyKey }),
            requestedAt: now,
            transaction,
          });
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_PAYOUT_REQUESTED', entityType: 'ConsultantSettlementPayment', entityId: payment.id, after: { settlementId: settlement.id, status: payment.status, amount: payment.amount, paymentMethod: payment.paymentMethod }, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantSettlementPayment', aggregateId: payment.id, eventType: 'consultant.payout.requested', payload: { settlementPaymentId: payment.id, settlementId: settlement.id, status: payment.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return payment;
        }),
      }),
    });
  }

  public async approveAndExecute(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: ExecuteConsultantPayoutInput,
  ): Promise<Readonly<{ payment: ConsultantSettlementPaymentView; settlement: ConsultantSettlementView }>> {
    await this.assertAllowed(actor, 'PAYOUT_APPROVE', true);
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_PAYOUT_EXECUTION',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash({ ...input, paymentReference: stableConsultantSharingPayloadHash(input.paymentReference) }),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-payout-execute:${actor.facilityId}:${input.settlementPaymentId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 120_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const payment = await this.dependencies.payments.findById({ facilityId: actor.facilityId, settlementPaymentId: input.settlementPaymentId, transaction });
          if (payment == null) throw new ConsultantSettlementNotFoundError();
          const settlement = await this.dependencies.settlements.findById({ facilityId: actor.facilityId, settlementId: payment.settlementId, transaction });
          if (settlement == null) throw new ConsultantSettlementNotFoundError();
          await this.dependencies.approval.requireApproved({ actor, approvalRequestId: payment.approvalRequestId, action: 'CONSULTANT_PAYOUT', entityType: 'ConsultantSettlementPayment', entityId: payment.id, amount: payment.amount, makerUserId: payment.makerUserId, transaction });
          const now = this.dependencies.clock.now();
          const approved = payment.status === 'APPROVED' || payment.status === 'PAID'
            ? payment
            : await this.dependencies.payments.approve({ actor, settlementPaymentId: payment.id, checkerUserId: actor.userId, approvedAt: now, transaction });
          if (approved == null) throw new ConsultantSharingConcurrencyError();
          if (approved.status === 'PAID') return { payment: approved, settlement };
          const executed = await this.dependencies.payout.createPayout({ actor, settlementId: settlement.id, consultantId: settlement.consultantId, amount: approved.amount, paymentMethodId: input.paymentMethodId, paymentReference: input.paymentReference, cashierShiftId: input.cashierShiftId ?? null, approvalRequestId: approved.approvalRequestId, operationKey: stableConsultantSharingPayloadHash({ scope: 'PAYOUT_EXECUTION', facilityId: actor.facilityId, idempotencyKey }), transaction });
          if (!['POSTED', 'PAID', 'COMPLETED', 'SUCCESS'].includes(executed.status.toUpperCase())) {
            throw new ConsultantSettlementReconciliationError(`Consultant payout execution did not complete successfully: ${executed.status}`);
          }
          if (!new Decimal(executed.amount).equals(approved.amount)) {
            throw new ConsultantSettlementReconciliationError('Payment gateway payout amount does not match the approved consultant payout');
          }
          const ledger = await this.dependencies.ledger.postPayout({ actor, settlementId: settlement.id, settlementPaymentId: approved.id, consultantId: settlement.consultantId, paymentId: executed.paymentId, amount: approved.amount, netDisbursedAmount: approved.netDisbursedAmount, taxWithholdingAmount: approved.taxWithholdingAmount, otherDeductionAmount: new Decimal(approved.advanceRecoveryAmount).plus(approved.overpaymentRecoveryAmount).plus(approved.otherDeductionAmount).toFixed(2), currency: approved.currency, occurredAt: now, transaction });
          const paidPayment = await this.dependencies.payments.markPaid({ actor, settlementPaymentId: approved.id, paymentId: executed.paymentId, ledgerTransactionId: ledger.ledgerTransactionId, paidAt: now, transaction });
          if (paidPayment == null) throw new ConsultantSharingConcurrencyError();
          const authoritativeTotals = settlementAfterPayment(settlement, new Decimal(approved.amount));
          const paidSettlement = await this.dependencies.settlements.applyPayment({ actor, settlementId: settlement.id, expectedVersion: settlement.version, paymentId: executed.paymentId, amount: approved.amount, authoritativeTotals, occurredAt: now, transaction });
          if (paidSettlement == null) throw new ConsultantSharingConcurrencyError();
          await this.dependencies.audit.record({ actor, action: 'CONSULTANT_PAYOUT_PAID', entityType: 'ConsultantSettlementPayment', entityId: paidPayment.id, before: { status: approved.status }, after: { status: paidPayment.status, settlementStatus: paidSettlement.status }, transaction });
          await this.dependencies.outbox.publish({ aggregateType: 'ConsultantSettlementPayment', aggregateId: paidPayment.id, eventType: 'consultant.payout.paid', payload: { settlementPaymentId: paidPayment.id, settlementId: paidSettlement.id, status: paidPayment.status }, correlationId: actor.correlationId, occurredAt: now, transaction });
          return { payment: paidPayment, settlement: paidSettlement };
        }),
      }),
    });
  }

  public async reverse(
    actor: ConsultantSharingActorContext,
    idempotencyKey: string,
    input: ReverseConsultantPayoutInput,
  ): Promise<Readonly<{
    originalPayment: ConsultantSettlementPaymentView;
    reversalPayment: ConsultantSettlementPaymentView;
    settlement: ConsultantSettlementView;
  }>> {
    await this.assertAllowed(actor, 'PAYOUT_REVERSE', true);
    if (input.makerUserId === actor.userId) {
      throw new ConsultantSettlementReconciliationError('The payout-reversal maker cannot approve or execute the same reversal');
    }
    return this.dependencies.idempotency.execute({
      scope: 'CONSULTANT_PAYOUT_REVERSAL',
      actor,
      idempotencyKey,
      requestHash: stableConsultantSharingPayloadHash(input),
      operation: () => this.dependencies.locks.withLock({
        lockKey: `consultant-payout-reversal:${actor.facilityId}:${input.settlementPaymentId}`,
        ownerId: `${actor.userId}:${actor.correlationId}`,
        ttlMs: 120_000,
        operation: () => this.dependencies.transactions.withTransaction(async (transaction) => {
          const originalPayment = await this.dependencies.payments.findById({
            facilityId: actor.facilityId,
            settlementPaymentId: input.settlementPaymentId,
            transaction,
          });
          if (
            originalPayment == null
            || originalPayment.status !== 'PAID'
            || originalPayment.paymentId == null
            || originalPayment.reversedByPaymentId != null
          ) {
            throw new ConsultantSettlementReconciliationError('Only an unreversed paid consultant payout can be reversed');
          }
          const settlement = await this.dependencies.settlements.findById({
            facilityId: actor.facilityId,
            settlementId: originalPayment.settlementId,
            transaction,
          });
          if (settlement == null) throw new ConsultantSettlementNotFoundError();
          if (!['PAID', 'PARTIALLY_PAID'].includes(settlement.status)) {
            throw new ConsultantSettlementReconciliationError('The payout settlement is not in a reversible paid state');
          }
          await this.dependencies.approval.requireApproved({
            actor,
            approvalRequestId: input.approvalRequestId,
            action: 'CONSULTANT_PAYOUT_REVERSAL',
            entityType: 'ConsultantSettlementPayment',
            entityId: originalPayment.id,
            amount: originalPayment.amount,
            makerUserId: input.makerUserId,
            transaction,
          });
          const now = this.dependencies.clock.now();
          const gatewayResult = await this.dependencies.payout.reversePayout({
            actor,
            settlementId: settlement.id,
            consultantId: settlement.consultantId,
            paymentId: originalPayment.paymentId,
            amount: originalPayment.amount,
            reason: input.reason,
            approvalRequestId: input.approvalRequestId,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'PAYOUT_REVERSAL_GATEWAY', facilityId: actor.facilityId, idempotencyKey }),
            transaction,
          });
          if (!['POSTED', 'REVERSED', 'COMPLETED', 'SUCCESS'].includes(gatewayResult.status.toUpperCase())) {
            throw new ConsultantSettlementReconciliationError(`Consultant payout reversal did not complete successfully: ${gatewayResult.status}`);
          }
          if (!new Decimal(gatewayResult.amount).equals(originalPayment.amount)) {
            throw new ConsultantSettlementReconciliationError('Payment gateway reversal amount does not match the original consultant payout');
          }
          const ledger = await this.dependencies.ledger.postPayoutReversal({
            actor,
            settlementId: settlement.id,
            originalSettlementPaymentId: originalPayment.id,
            paymentReversalId: gatewayResult.paymentReversalId,
            consultantId: settlement.consultantId,
            amount: originalPayment.amount,
            netDisbursedAmount: originalPayment.netDisbursedAmount,
            taxWithholdingAmount: originalPayment.taxWithholdingAmount,
            otherDeductionAmount: new Decimal(originalPayment.advanceRecoveryAmount).plus(originalPayment.overpaymentRecoveryAmount).plus(originalPayment.otherDeductionAmount).toFixed(2),
            currency: originalPayment.currency,
            occurredAt: now,
            transaction,
          });
          const reversalPayoutNumber = await this.dependencies.sequence.next({
            facilityId: actor.facilityId,
            sequenceKey: 'CONSULTANT_PAYOUT_REVERSAL_NUMBER',
            occurredAt: now,
            transaction,
          });
          const reversalPayment = await this.dependencies.payments.createReversal({
            actor,
            reversalPayoutNumber,
            originalPayment,
            makerUserId: input.makerUserId,
            paymentReversalId: gatewayResult.paymentReversalId,
            ledgerTransactionId: ledger.ledgerTransactionId,
            reason: input.reason,
            approvalRequestId: input.approvalRequestId,
            operationKey: stableConsultantSharingPayloadHash({ scope: 'PAYOUT_REVERSAL_RECORD', facilityId: actor.facilityId, idempotencyKey }),
            occurredAt: now,
            transaction,
          });
          const authoritativeTotals = settlementAfterPayoutReversal(settlement, new Decimal(originalPayment.amount));
          const updatedSettlement = await this.dependencies.settlements.reversePayment({
            actor,
            settlementId: settlement.id,
            expectedVersion: input.expectedSettlementVersion,
            originalPaymentId: originalPayment.id,
            reversalPaymentId: reversalPayment.id,
            amount: originalPayment.amount,
            authoritativeTotals,
            occurredAt: now,
            transaction,
          });
          if (updatedSettlement == null) throw new ConsultantSharingConcurrencyError();
          await this.dependencies.audit.record({
            actor,
            action: 'CONSULTANT_PAYOUT_REVERSED',
            entityType: 'ConsultantSettlementPayment',
            entityId: originalPayment.id,
            before: { status: originalPayment.status, settlementStatus: settlement.status },
            after: { reversalPaymentId: reversalPayment.id, settlementStatus: updatedSettlement.status },
            reason: input.reason,
            transaction,
          });
          await this.dependencies.outbox.publish({
            aggregateType: 'ConsultantSettlementPayment',
            aggregateId: originalPayment.id,
            eventType: 'consultant.payout.reversed',
            payload: {
              settlementPaymentId: originalPayment.id,
              reversalSettlementPaymentId: reversalPayment.id,
              settlementId: updatedSettlement.id,
              status: reversalPayment.status,
            },
            correlationId: actor.correlationId,
            occurredAt: now,
            transaction,
          });
          return { originalPayment, reversalPayment, settlement: updatedSettlement };
        }),
      }),
    });
  }

  private async assertAllowed(actor: ConsultantSharingActorContext, action: 'PAYOUT_REQUEST' | 'PAYOUT_APPROVE' | 'PAYOUT_REVERSE', sensitiveFinancialAction: boolean): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({ actor, action, resourceFacilityId: actor.facilityId, sensitiveFinancialAction });
    if (!decision.allowed) throw new ConsultantSharingAccessDeniedError(decision.denialReason);
  }
}