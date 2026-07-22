import Decimal from 'decimal.js';

import { decimal128ToString } from '@hospital-mis/database';

import {
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  ReserveAssistanceAllocationInput,
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceApplicationNotEligibleError,
  AssistanceApplicationNotFoundError,
  AssistanceApprovalExpiredError,
  AssistanceApprovalNotFoundError,
  AssistanceFinancialReconciliationError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceReservationExceededError,
  AssistanceReservationNotFoundError,
  AssistanceVersionConflictError,
} from '../welfare-zakat.errors.js';
import {
  assertAssistanceAllocation,
  calculateApprovalRemaining,
  calculateFundPosition,
} from '../welfare-zakat.financial-math.js';
import {
  safeWelfareZakatRealtimePayload,
  stableAssistancePayloadHash,
} from '../welfare-zakat.normalization.js';
import type {
  AssistanceApplicationRepositoryPort,
  AssistanceApprovalRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceReservationRepositoryPort,
  FundTransactionRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAuditPort,
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatClockPort,
  WelfareZakatCoverageClaimsCoordinationPort,
  WelfareZakatEligibilityContextPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApprovalRecord,
  AssistanceFundRecord,
} from '../welfare-zakat.persistence.types.js';
import { projectAssistanceReservation } from '../welfare-zakat.projections.js';

export interface ReleaseAssistanceReservationInput {
  expectedVersion: number;
  expectedFundVersion: number;
  expectedApprovalVersion: number;
  amount?: string | null;
  reason: string;
}

interface Dependencies {
  transactionManager: WelfareZakatTransactionManagerPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  clock: WelfareZakatClockPort;
  numberSequence: WelfareZakatNumberSequencePort;
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  applications: AssistanceApplicationRepositoryPort;
  approvals: AssistanceApprovalRepositoryPort;
  reservations: AssistanceReservationRepositoryPort;
  billing: WelfareZakatAuthoritativeBillingPort;
  coverageClaims: WelfareZakatCoverageClaimsCoordinationPort;
  eligibilityLimits: WelfareZakatEligibilityContextPort;
  audit: WelfareZakatAuditPort;
  outbox: WelfareZakatOutboxPort;
}

function amount(value: string): Decimal {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isPositive()) {
    throw new AssistanceReservationExceededError();
  }
  return parsed;
}

function text(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function fundPosition(
  fund: AssistanceFundRecord,
  changes: Readonly<{
    reservedDelta?: Decimal.Value;
    utilizationDelta?: Decimal.Value;
    reversedDelta?: Decimal.Value;
  }>,
) {
  const refund = new Decimal(decimal128ToString(fund.refundAmount));
  const repayment = new Decimal(decimal128ToString(fund.repaymentAmount));
  const recovery = new Decimal(decimal128ToString(fund.recoveryAmount));
  const reversed = new Decimal(decimal128ToString(fund.reversedBalance))
    .plus(changes.reversedDelta ?? 0);
  const utilizationReversal = Decimal.max(
    0,
    reversed.minus(refund).minus(repayment).minus(recovery),
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
      new Decimal(decimal128ToString(fund.utilizedBalance))
        .plus(reversed)
        .plus(changes.utilizationDelta ?? 0),
    ),
    writeOffAmount: decimal128ToString(fund.writeOffAmount),
    reservedAmount: text(
      new Decimal(decimal128ToString(fund.reservedBalance))
        .plus(changes.reservedDelta ?? 0),
    ),
    committedAmount: decimal128ToString(fund.committedBalance),
  });
}

function approvalAmounts(
  approval: AssistanceApprovalRecord,
  reservedDelta: Decimal.Value,
) {
  const values = {
    approvedAmount: decimal128ToString(approval.approvedAmount),
    reservedAmount: text(
      new Decimal(decimal128ToString(approval.reservedAmount)).plus(reservedDelta),
    ),
    committedAmount: decimal128ToString(approval.committedAmount),
    utilizedAmount: decimal128ToString(approval.utilizedAmount),
    reversedAmount: decimal128ToString(approval.reversedAmount),
    releasedAmount: decimal128ToString(approval.releasedAmount),
  };
  return {
    ...values,
    remainingAmount: calculateApprovalRemaining(values),
  };
}

export class AssistanceReservationService {
  public constructor(private readonly dependencies: Dependencies) {}

  public async reserve(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: ReserveAssistanceAllocationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_CREATE);
    return this.dependencies.transactionManager.execute({
      transactionType: 'RESERVE_ASSISTANCE_FUNDS',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [
        `welfare-zakat:fund:${actor.facilityId}:${input.fundId}`,
        `welfare-zakat:approval:${actor.facilityId}:${input.approvalId}`,
        `billing:invoice:${actor.facilityId}:${input.invoiceId}`,
      ],
      idempotencyPayload: input,
      journalPayload: {
        fundId: input.fundId,
        approvalId: input.approvalId,
        invoiceId: input.invoiceId,
        amount: input.amount,
      },
      execute: async (transaction) => {
        const now = this.dependencies.clock.now();
        const [fund, approval, application] = await Promise.all([
          this.dependencies.funds.findById(actor.facilityId, input.fundId, transaction.session),
          this.dependencies.approvals.findById(
            actor.facilityId,
            input.approvalId,
            transaction.session,
          ),
          this.dependencies.applications.findById(
            actor.facilityId,
            input.applicationId,
            transaction.session,
          ),
        ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        if (application === null) throw new AssistanceApplicationNotFoundError();
        if (fund.status !== 'ACTIVE') throw new AssistanceFundInactiveError();
        if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(approval.status)) {
          throw new AssistanceApplicationNotEligibleError();
        }
        if (approval.expiresAt != null && approval.expiresAt <= now) {
          throw new AssistanceApprovalExpiredError();
        }
        if (
          approval.applicationId.toHexString() !== input.applicationId ||
          approval.fundId.toHexString() !== input.fundId ||
          application.patientId.toHexString() !== input.patientId
        ) {
          throw new AssistanceFinancialReconciliationError(
            'Reservation application, approval, fund, and patient references do not reconcile',
          );
        }

        const requested = amount(input.amount);
        const [billing, coordination, limits] = await Promise.all([
          this.dependencies.billing.loadAllocationSource({
            facilityId: actor.facilityId,
            patientId: input.patientId,
            patientAccountId: input.patientAccountId,
            invoiceId: input.invoiceId,
            invoiceLineIds: [],
            asOf: now,
            session: transaction.session,
          }),
          this.dependencies.coverageClaims.resolveCoordination({
            facilityId: actor.facilityId,
            patientId: input.patientId,
            invoiceId: input.invoiceId,
            invoiceLineIds: [],
            asOf: now,
            session: transaction.session,
          }),
          this.dependencies.eligibilityLimits.calculateLimitRemaining({
            facilityId: actor.facilityId,
            patientId: input.patientId,
            fundId: input.fundId,
            applicationId: input.applicationId,
            invoiceId: input.invoiceId,
            asOf: now,
            session: transaction.session,
          }),
        ]);
        if (!coordination.welfareMayApply) {
          throw new AssistanceApplicationNotEligibleError();
        }
        assertAssistanceAllocation({
          requestedAmount: requested.toFixed(2),
          fundAvailableAmount: decimal128ToString(fund.availableBalance),
          approvalRemainingAmount: decimal128ToString(approval.remainingAmount),
          patientResponsibilityAmount: billing.invoice.patientAmount,
          invoiceOutstandingAmount: billing.invoice.outstandingAmount,
          patientPeriodRemainingAmount: limits.patientPeriodRemainingAmount,
          patientLifetimeRemainingAmount: limits.patientLifetimeRemainingAmount,
          perInvoiceRemainingAmount: limits.perInvoiceRemainingAmount,
          perServiceRemainingAmount: null,
        });

        const expiresAt = new Date(input.expiresAt);
        if (expiresAt <= now || (approval.expiresAt != null && expiresAt > approval.expiresAt)) {
          throw new AssistanceApprovalExpiredError();
        }
        const reservation = await this.dependencies.reservations.create({
          actor,
          operationKey: idempotencyKey,
          applicationId: input.applicationId,
          approvalId: input.approvalId,
          fundId: input.fundId,
          patientId: input.patientId,
          patientAccountId: input.patientAccountId,
          invoiceId: input.invoiceId,
          amount: requested.toFixed(2),
          priority: input.priority,
          expiresAt,
          transaction,
        });
        const nextFund = fundPosition(fund, { reservedDelta: requested });
        const updatedFund = await this.dependencies.funds.applyFinancialPosition({
          actor,
          fundId: input.fundId,
          expectedVersion: input.expectedFundVersion,
          balances: { ...nextFund },
          transaction,
        });
        if (updatedFund === null) throw new AssistanceVersionConflictError();
        const updatedApproval = await this.dependencies.approvals.applyFinancialSummary({
          actor,
          approvalId: input.approvalId,
          expectedVersion: input.expectedApprovalVersion,
          amounts: approvalAmounts(approval, requested),
          transaction,
        });
        if (updatedApproval === null) throw new AssistanceVersionConflictError();

        await this.appendFundTransaction(
          actor,
          fund,
          reservation._id.toHexString(),
          input,
          requested.toFixed(2),
          decimal128ToString(fund.ledgerBalance),
          decimal128ToString(fund.ledgerBalance),
          'RESERVATION',
          input.reason,
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_RESERVATION_CREATED',
          entityType: 'AssistanceReservation',
          entityId: reservation._id.toHexString(),
          reason: input.reason,
          before: null,
          after: projectAssistanceReservation(reservation),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(
          actor,
          reservation._id.toHexString(),
          reservation.status,
          reservation.version,
          transaction,
        );
        return projectAssistanceReservation(reservation);
      },
    });
  }

  public async release(
    actor: WelfareZakatActorContext,
    reservationId: string,
    idempotencyKey: string,
    input: ReleaseAssistanceReservationInput,
    terminalStatus: 'RELEASED' | 'EXPIRED' | 'CANCELLED' = 'RELEASED',
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.RESERVATION_RELEASE);
    return this.dependencies.transactionManager.execute({
      transactionType: 'RELEASE_ASSISTANCE_RESERVATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:reservation:${actor.facilityId}:${reservationId}`],
      idempotencyPayload: { ...input, terminalStatus },
      journalPayload: { reservationId, terminalStatus, amount: input.amount ?? null },
      execute: async (transaction) => {
        const reservation = await this.dependencies.reservations.findById(
          actor.facilityId,
          reservationId,
          transaction.session,
        );
        if (reservation === null) throw new AssistanceReservationNotFoundError();
        const [fund, approval] = await Promise.all([
          this.dependencies.funds.findById(
            actor.facilityId,
            reservation.fundId.toHexString(),
            transaction.session,
          ),
          this.dependencies.approvals.findById(
            actor.facilityId,
            reservation.approvalId.toHexString(),
            transaction.session,
          ),
        ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        const remaining = new Decimal(decimal128ToString(reservation.remainingAmount));
        const releasedAmount = input.amount == null ? remaining : amount(input.amount);
        if (releasedAmount.greaterThan(remaining)) {
          throw new AssistanceReservationExceededError();
        }
        const now = this.dependencies.clock.now();
        const released = await this.dependencies.reservations.release({
          actor,
          reservationId,
          expectedVersion: input.expectedVersion,
          amount: releasedAmount.toFixed(2),
          status: terminalStatus,
          reason: input.reason,
          releasedAt: now,
          transaction,
        });
        if (released === null) throw new AssistanceVersionConflictError();
        const nextFund = fundPosition(fund, { reservedDelta: releasedAmount.negated() });
        const updatedFund = await this.dependencies.funds.applyFinancialPosition({
          actor,
          fundId: fund._id.toHexString(),
          expectedVersion: input.expectedFundVersion,
          balances: { ...nextFund },
          transaction,
        });
        if (updatedFund === null) throw new AssistanceVersionConflictError();
        const updatedApproval = await this.dependencies.approvals.applyFinancialSummary({
          actor,
          approvalId: approval._id.toHexString(),
          expectedVersion: input.expectedApprovalVersion,
          amounts: approvalAmounts(approval, releasedAmount.negated()),
          transaction,
        });
        if (updatedApproval === null) throw new AssistanceVersionConflictError();

        await this.appendFundTransaction(
          actor,
          fund,
          reservationId,
          {
            applicationId: reservation.applicationId.toHexString(),
            approvalId: reservation.approvalId.toHexString(),
            fundId: reservation.fundId.toHexString(),
            invoiceId: reservation.invoiceId.toHexString(),
          },
          releasedAmount.toFixed(2),
          decimal128ToString(fund.ledgerBalance),
          decimal128ToString(fund.ledgerBalance),
          'RESERVATION_RELEASE',
          input.reason,
          transaction,
        );
        await this.dependencies.audit.record({
          actor,
          action: `ASSISTANCE_RESERVATION_${terminalStatus}`,
          entityType: 'AssistanceReservation',
          entityId: reservationId,
          reason: input.reason,
          before: projectAssistanceReservation(reservation),
          after: projectAssistanceReservation(released),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(
          actor,
          reservationId,
          released.status,
          released.version,
          transaction,
        );
        return projectAssistanceReservation(released);
      },
    });
  }

  private async appendFundTransaction(
    actor: WelfareZakatActorContext,
    fund: AssistanceFundRecord,
    reservationId: string,
    references: Readonly<{
      applicationId: string;
      approvalId: string;
      fundId: string;
      invoiceId: string;
    }>,
    transactionAmount: string,
    balanceBefore: string,
    balanceAfter: string,
    transactionType: 'RESERVATION' | 'RESERVATION_RELEASE',
    reason: string,
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
      operationKey: `${transaction.transactionId}:${transactionType}:${reservationId}`,
      transactionType,
      direction: 'MEMO',
      amount: transactionAmount,
      balanceBefore,
      balanceAfter,
      applicationId: references.applicationId,
      approvalId: references.approvalId,
      reservationId,
      invoiceId: references.invoiceId,
      reason,
      makerUserId: actor.userId,
      occurredAt,
      immutableHash: stableAssistancePayloadHash({
        fundId: references.fundId,
        reservationId,
        transactionType,
        transactionAmount,
        balanceBefore,
        balanceAfter,
        transactionId: transaction.transactionId,
      }),
      transaction,
    });
  }

  private async requirePermission(actor: WelfareZakatActorContext, permission: string) {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      permission,
      resourceFacilityId: actor.facilityId,
      sensitiveFinancialAction: true,
    });
    if (!decision.allowed) {
      throw new AssistanceAccessDeniedError(decision.denialReason ?? undefined);
    }
  }

  private async enqueue(
    actor: WelfareZakatActorContext,
    reservationId: string,
    status: string,
    version: number,
    transaction: WelfareZakatTransactionContext,
  ) {
    await this.dependencies.outbox.enqueue({
      facilityId: actor.facilityId,
      eventType: 'welfare_zakat.reservation.changed',
      aggregateType: 'AssistanceReservation',
      aggregateId: reservationId,
      payload: safeWelfareZakatRealtimePayload({
        allocationId: reservationId,
        status,
        version,
        eventAt: this.dependencies.clock.now().toISOString(),
      }),
      correlationId: actor.correlationId,
      transactionId: transaction.transactionId,
      session: transaction.session,
    });
  }
}