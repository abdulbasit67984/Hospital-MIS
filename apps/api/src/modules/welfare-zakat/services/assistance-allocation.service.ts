import Decimal from 'decimal.js';

import { decimal128ToString } from '@hospital-mis/database';

import {
  WELFARE_ZAKAT_ALLOCATION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY,
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import type {
  ConfirmAssistanceAllocationInput,
  CreateAssistanceAllocationInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceAccessDeniedError,
  AssistanceAllocationNotFoundError,
  AssistanceApplicationNotEligibleError,
  AssistanceApplicationNotFoundError,
  AssistanceApprovalExpiredError,
  AssistanceApprovalLimitExceededError,
  AssistanceApprovalNotFoundError,
  AssistanceApprovalRequiredError,
  AssistanceBreakGlassApprovalBypassError,
  AssistanceDoubleFundingError,
  AssistanceFinancialReconciliationError,
  AssistanceFundInactiveError,
  AssistanceFundNotFoundError,
  AssistanceInvalidStateTransitionError,
  AssistanceMakerCheckerViolationError,
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
  AssistanceAllocationRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceApprovalRepositoryPort,
  AssistanceFundRepositoryPort,
  AssistanceReservationRepositoryPort,
  FundTransactionRepositoryPort,
  WelfareZakatAccessPolicyPort,
  WelfareZakatAttachmentPort,
  WelfareZakatAuditPort,
  WelfareZakatAuthoritativeBillingPort,
  WelfareZakatClockPort,
  WelfareZakatCoverageClaimsCoordinationPort,
  WelfareZakatEligibilityContextPort,
  WelfareZakatFinancialApprovalPort,
  WelfareZakatFinancialDischargePort,
  WelfareZakatFinancialLedgerPort,
  WelfareZakatNumberSequencePort,
  WelfareZakatOutboxPort,
  WelfareZakatReconciliationPort,
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceAllocationRecord,
  AssistanceApprovalRecord,
  AssistanceFundRecord,
  AssistanceReservationRecord,
} from '../welfare-zakat.persistence.types.js';
import {
  projectAssistanceAllocation,
} from '../welfare-zakat.projections.js';

interface Dependencies {
  transactionManager: WelfareZakatTransactionManagerPort;
  accessPolicy: WelfareZakatAccessPolicyPort;
  clock: WelfareZakatClockPort;
  numberSequence: WelfareZakatNumberSequencePort;
  attachments: WelfareZakatAttachmentPort;
  funds: AssistanceFundRepositoryPort;
  fundTransactions: FundTransactionRepositoryPort;
  applications: AssistanceApplicationRepositoryPort;
  approvals: AssistanceApprovalRepositoryPort;
  reservations: AssistanceReservationRepositoryPort;
  allocations: AssistanceAllocationRepositoryPort;
  billing: WelfareZakatAuthoritativeBillingPort;
  coverageClaims: WelfareZakatCoverageClaimsCoordinationPort;
  eligibilityLimits: WelfareZakatEligibilityContextPort;
  financialApprovals: WelfareZakatFinancialApprovalPort;
  financialLedger: WelfareZakatFinancialLedgerPort;
  financialDischarge: WelfareZakatFinancialDischargePort;
  reconciliation: WelfareZakatReconciliationPort;
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

function positiveMoney(value: Decimal.Value): Decimal {
  const parsed = money(value);
  if (!parsed.isPositive()) {
    throw new AssistanceFinancialReconciliationError('Amount must be positive');
  }
  return parsed;
}

function text(value: Decimal.Value): string {
  return money(value).toFixed(2);
}

function minimumOptionalAmount(
  values: readonly (string | null)[],
): string | null {
  const finite = values.filter((value): value is string => value !== null);
  if (finite.length === 0) return null;
  return Decimal.min(...finite.map((value) => money(value))).toFixed(2);
}

function utilizationReversalAmount(fund: AssistanceFundRecord): Decimal {
  return Decimal.max(
    0,
    money(decimal128ToString(fund.reversedBalance))
      .minus(money(decimal128ToString(fund.refundAmount)))
      .minus(money(decimal128ToString(fund.repaymentAmount)))
      .minus(money(decimal128ToString(fund.recoveryAmount))),
  );
}

function nextFundPosition(
  fund: AssistanceFundRecord,
  input: Readonly<{ reservedDelta: Decimal.Value; utilizationDelta: Decimal.Value }>,
) {
  const reversal = utilizationReversalAmount(fund);
  return calculateFundPosition({
    openingBalance: decimal128ToString(fund.openingBalance),
    inflowAmount: decimal128ToString(fund.inflowAmount),
    transferInAmount: decimal128ToString(fund.transferInAmount),
    adjustmentIncreaseAmount: decimal128ToString(fund.adjustmentIncreaseAmount),
    utilizationReversalAmount: text(reversal),
    refundAmount: decimal128ToString(fund.refundAmount),
    repaymentAmount: decimal128ToString(fund.repaymentAmount),
    recoveryAmount: decimal128ToString(fund.recoveryAmount),
    transferOutAmount: decimal128ToString(fund.transferOutAmount),
    adjustmentDecreaseAmount: decimal128ToString(fund.adjustmentDecreaseAmount),
    utilizationAmount: text(
      money(decimal128ToString(fund.utilizedBalance))
        .plus(reversal)
        .plus(input.utilizationDelta),
    ),
    writeOffAmount: decimal128ToString(fund.writeOffAmount),
    reservedAmount: text(
      money(decimal128ToString(fund.reservedBalance)).plus(input.reservedDelta),
    ),
    committedAmount: decimal128ToString(fund.committedBalance),
  });
}

function nextApprovalAmounts(
  approval: AssistanceApprovalRecord,
  input: Readonly<{ reservedDelta: Decimal.Value; utilizedDelta: Decimal.Value }>,
) {
  const values = {
    approvedAmount: decimal128ToString(approval.approvedAmount),
    reservedAmount: text(
      money(decimal128ToString(approval.reservedAmount)).plus(input.reservedDelta),
    ),
    committedAmount: decimal128ToString(approval.committedAmount),
    utilizedAmount: text(
      money(decimal128ToString(approval.utilizedAmount)).plus(input.utilizedDelta),
    ),
    reversedAmount: decimal128ToString(approval.reversedAmount),
    releasedAmount: decimal128ToString(approval.releasedAmount),
  };
  return { ...values, remainingAmount: calculateApprovalRemaining(values) };
}


export class AssistanceAllocationService {
  public constructor(private readonly dependencies: Dependencies) {}

  public async get(
    actor: WelfareZakatActorContext,
    allocationId: string,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const record = await this.dependencies.allocations.findById(
      actor.facilityId,
      allocationId,
    );
    if (record === null) throw new AssistanceAllocationNotFoundError();
    return projectAssistanceAllocation(record);
  }

  public async list(actor: WelfareZakatActorContext, query: WelfareZakatListQuery) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.READ);
    const result = await this.dependencies.allocations.list(actor.facilityId, query);
    return {
      items: result.records.map(projectAssistanceAllocation),
      totalItems: result.total,
    };
  }

  public async create(
    actor: WelfareZakatActorContext,
    idempotencyKey: string,
    input: CreateAssistanceAllocationInput,
  ) {
    await this.requirePermission(actor, WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_CREATE);
    await this.dependencies.attachments.assertAttachmentIdsUsable({
      facilityId: actor.facilityId,
      actorUserId: actor.userId,
      attachmentIds: [
        ...(input.supportingAttachmentIds ?? []),
        ...input.lines.flatMap((line) => line.supportingAttachmentIds ?? []),
      ],
    });

    return this.dependencies.transactionManager.execute({
      transactionType: 'CREATE_ASSISTANCE_ALLOCATION',
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
        applicationId: input.applicationId,
        approvalId: input.approvalId,
        invoiceId: input.invoiceId,
        lines: input.lines.map((line) => ({
          invoiceLineId: line.invoiceLineId,
          amount: line.amount,
        })),
      },
      execute: async (transaction) => {
        const now = this.dependencies.clock.now();
        const [fund, approval, application, reservation, billing, coordination] =
          await Promise.all([
            this.dependencies.funds.findById(
              actor.facilityId,
              input.fundId,
              transaction.session,
            ),
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
            input.reservationId == null
              ? Promise.resolve(null)
              : this.dependencies.reservations.findById(
                  actor.facilityId,
                  input.reservationId,
                  transaction.session,
                ),
            this.dependencies.billing.loadAllocationSource({
              facilityId: actor.facilityId,
              patientId: input.patientId,
              patientAccountId: input.patientAccountId,
              invoiceId: input.invoiceId,
              invoiceLineIds: input.lines.map((line) => line.invoiceLineId),
              claimId: input.claimId ?? null,
              asOf: now,
              session: transaction.session,
            }),
            this.dependencies.coverageClaims.resolveCoordination({
              facilityId: actor.facilityId,
              patientId: input.patientId,
              invoiceId: input.invoiceId,
              invoiceLineIds: input.lines.map((line) => line.invoiceLineId),
              asOf: now,
              session: transaction.session,
            }),
          ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        if (application === null) throw new AssistanceApplicationNotFoundError();
        if (input.reservationId != null && reservation === null) {
          throw new AssistanceReservationNotFoundError();
        }
        this.assertRelationships(input, fund, approval, application.patientId.toHexString());
        if (fund.status !== 'ACTIVE') throw new AssistanceFundInactiveError();
        if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(approval.status)) {
          throw new AssistanceApplicationNotEligibleError();
        }
        if (approval.expiresAt != null && approval.expiresAt <= now) {
          throw new AssistanceApprovalExpiredError();
        }
        if (!coordination.welfareMayApply) {
          throw new AssistanceApplicationNotEligibleError();
        }
        this.assertReservation(input, reservation);

        const sourceByLine = new Map(
          billing.lines.map((line) => [line.invoiceLineId, line]),
        );
        const coordinationByLine = new Map(
          coordination.lines.map((line) => [line.invoiceLineId, line]),
        );
        let authoritativeTotal = new Decimal(0);
        const patientPeriodLimits: Array<string | null> = [];
        const patientLifetimeLimits: Array<string | null> = [];
        const invoiceLimits: Array<string | null> = [];
        for (const requestedLine of input.lines) {
          const source = sourceByLine.get(requestedLine.invoiceLineId);
          const coordinated = coordinationByLine.get(requestedLine.invoiceLineId);
          if (source == null || coordinated == null) {
            throw new AssistanceFinancialReconciliationError(
              'Invoice-line allocation source was not found',
            );
          }
          this.assertApprovalScope(approval, source);
          const requested = positiveMoney(requestedLine.amount);
          const limits = await this.dependencies.eligibilityLimits.calculateLimitRemaining({
            facilityId: actor.facilityId,
            patientId: input.patientId,
            fundId: input.fundId,
            applicationId: input.applicationId,
            invoiceId: input.invoiceId,
            invoiceLineId: requestedLine.invoiceLineId,
            serviceCategory: source.serviceCategory,
            serviceCode: source.serviceCode,
            asOf: now,
            session: transaction.session,
          });
          patientPeriodLimits.push(limits.patientPeriodRemainingAmount);
          patientLifetimeLimits.push(limits.patientLifetimeRemainingAmount);
          invoiceLimits.push(limits.perInvoiceRemainingAmount);
          assertAssistanceAllocation({
            requestedAmount: requested.toFixed(2),
            fundAvailableAmount: decimal128ToString(fund.availableBalance),
            approvalRemainingAmount: decimal128ToString(approval.remainingAmount),
            patientResponsibilityAmount: coordinated.patientResponsibilityAmount,
            invoiceOutstandingAmount: billing.invoice.outstandingAmount,
            invoiceLineOutstandingAmount: coordinated.maximumAdditionalAssistanceAmount,
            reservationRemainingAmount: reservation == null
              ? null
              : decimal128ToString(reservation.remainingAmount),
            patientPeriodRemainingAmount: limits.patientPeriodRemainingAmount,
            patientLifetimeRemainingAmount: limits.patientLifetimeRemainingAmount,
            perInvoiceRemainingAmount: limits.perInvoiceRemainingAmount,
            perServiceRemainingAmount: limits.perServiceRemainingAmount,
          });
          authoritativeTotal = authoritativeTotal.plus(requested);
        }
        assertAssistanceAllocation({
          requestedAmount: authoritativeTotal.toFixed(2),
          fundAvailableAmount: reservation == null
            ? decimal128ToString(fund.availableBalance)
            : decimal128ToString(reservation.remainingAmount),
          approvalRemainingAmount: reservation == null
            ? decimal128ToString(approval.remainingAmount)
            : decimal128ToString(reservation.remainingAmount),
          patientResponsibilityAmount: billing.invoice.patientAmount,
          invoiceOutstandingAmount: billing.invoice.outstandingAmount,
          reservationRemainingAmount: reservation == null
            ? null
            : decimal128ToString(reservation.remainingAmount),
          patientPeriodRemainingAmount: minimumOptionalAmount(patientPeriodLimits),
          patientLifetimeRemainingAmount: minimumOptionalAmount(patientLifetimeLimits),
          perInvoiceRemainingAmount: minimumOptionalAmount(invoiceLimits),
          perServiceRemainingAmount: null,
        });

        const duplicateKey = stableAssistancePayloadHash({
          facilityId: actor.facilityId,
          fundId: input.fundId,
          applicationId: input.applicationId,
          approvalId: input.approvalId,
          invoiceId: input.invoiceId,
          lines: [...input.lines]
            .map((line) => ({
              invoiceLineId: line.invoiceLineId,
              amount: text(line.amount),
            }))
            .sort((left, right) => left.invoiceLineId.localeCompare(right.invoiceLineId)),
        });
        if (
          await this.dependencies.allocations.findDuplicate(
            actor.facilityId,
            duplicateKey,
            transaction.session,
          )
        ) {
          throw new AssistanceDoubleFundingError();
        }
        const allocationNumber = await this.dependencies.numberSequence.next({
          facilityId: actor.facilityId,
          sequenceKey: WELFARE_ZAKAT_ALLOCATION_NUMBER_SEQUENCE_KEY,
          effectiveAt: now,
          actorUserId: actor.userId,
          transaction,
        });
        const allocation = await this.dependencies.allocations.create({
          actor,
          input,
          operationKey: idempotencyKey,
          duplicateKey,
          allocationNumber,
          authoritativeAmount: authoritativeTotal.toFixed(2),
          allocatedAt: now,
          transaction,
        });
        await this.dependencies.audit.record({
          actor,
          action: 'ASSISTANCE_ALLOCATION_CREATED',
          entityType: 'InvoiceFundAllocation',
          entityId: allocation._id.toHexString(),
          reason: input.reason,
          before: null,
          after: projectAssistanceAllocation(allocation),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(actor, allocation, null, transaction);
        return projectAssistanceAllocation(allocation);
      },
    });
  }

  public async confirmAndUtilize(
    actor: WelfareZakatActorContext,
    allocationId: string,
    idempotencyKey: string,
    input: ConfirmAssistanceAllocationInput,
  ) {
    await this.requirePermission(
      actor,
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE,
      true,
    );
    if (actor.breakGlassReason != null) {
      throw new AssistanceBreakGlassApprovalBypassError();
    }
    if (input.approvalRequestId == null) {
      throw new AssistanceApprovalRequiredError();
    }

    return this.dependencies.transactionManager.execute({
      transactionType: 'CONFIRM_UTILIZE_ASSISTANCE_ALLOCATION',
      idempotencyKey,
      actorUserId: actor.userId,
      facilityId: actor.facilityId,
      correlationId: actor.correlationId,
      lockKeys: [`welfare-zakat:allocation:${actor.facilityId}:${allocationId}`],
      idempotencyPayload: input,
      journalPayload: { allocationId, approvalRequestId: input.approvalRequestId },
      execute: async (transaction) => {
        const allocation = await this.dependencies.allocations.findById(
          actor.facilityId,
          allocationId,
          transaction.session,
        );
        if (allocation === null) throw new AssistanceAllocationNotFoundError();
        if (allocation.allocatedBy.toHexString() === actor.userId) {
          throw new AssistanceMakerCheckerViolationError();
        }
        if (!['RESERVED', 'APPROVAL_PENDING'].includes(allocation.status)) {
          throw new AssistanceInvalidStateTransitionError(
            'Assistance allocation',
            allocation.status,
            'CONFIRMED',
          );
        }
        const [fund, approval, reservation] = await Promise.all([
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
          allocation.reservationId == null
            ? Promise.resolve(null)
            : this.dependencies.reservations.findById(
                actor.facilityId,
                allocation.reservationId.toHexString(),
                transaction.session,
              ),
        ]);
        if (fund === null) throw new AssistanceFundNotFoundError();
        if (approval === null) throw new AssistanceApprovalNotFoundError();
        if (allocation.reservationId != null && reservation === null) {
          throw new AssistanceReservationNotFoundError();
        }
        const allocationAmount = positiveMoney(decimal128ToString(allocation.amount));
        const approvalRequestId = input.approvalRequestId
          ?? allocation.approvalRequestId?.toHexString()
          ?? null;
        if (approvalRequestId === null) {
          throw new AssistanceApprovalRequiredError();
        }
        await this.dependencies.financialApprovals.assertApproved({
          facilityId: actor.facilityId,
          approvalRequestId,
          action: 'ASSISTANCE_ALLOCATION_CONFIRM',
          entityId: allocationId,
          amount: allocationAmount.toFixed(2),
          makerUserId: allocation.allocatedBy.toHexString(),
          checkerUserId: actor.userId,
          session: transaction.session,
        });

        const now = this.dependencies.clock.now();
        const invoiceLineIds = allocation.lines.map(
          (line) => line.invoiceLineId.toHexString(),
        );
        const [billing, coordination] = await Promise.all([
          this.dependencies.billing.loadAllocationSource({
            facilityId: actor.facilityId,
            patientId: allocation.patientId.toHexString(),
            patientAccountId: allocation.patientAccountId.toHexString(),
            invoiceId: allocation.invoiceId.toHexString(),
            invoiceLineIds,
            claimId: allocation.claimId?.toHexString() ?? null,
            asOf: now,
            session: transaction.session,
          }),
          this.dependencies.coverageClaims.resolveCoordination({
            facilityId: actor.facilityId,
            patientId: allocation.patientId.toHexString(),
            invoiceId: allocation.invoiceId.toHexString(),
            invoiceLineIds,
            asOf: now,
            session: transaction.session,
          }),
        ]);
        if (!coordination.welfareMayApply) {
          throw new AssistanceApplicationNotEligibleError();
        }
        const sourceByLine = new Map(
          billing.lines.map((line) => [line.invoiceLineId, line]),
        );
        const coordinationByLine = new Map(
          coordination.lines.map((line) => [line.invoiceLineId, line]),
        );
        const patientPeriodLimits: Array<string | null> = [];
        const patientLifetimeLimits: Array<string | null> = [];
        const invoiceLimits: Array<string | null> = [];
        for (const line of allocation.lines) {
          const invoiceLineId = line.invoiceLineId.toHexString();
          const source = sourceByLine.get(invoiceLineId);
          const coordinated = coordinationByLine.get(invoiceLineId);
          if (source == null || coordinated == null) {
            throw new AssistanceFinancialReconciliationError(
              'Allocation invoice line is no longer available',
            );
          }
          this.assertApprovalScope(approval, source);
          const limits = await this.dependencies.eligibilityLimits.calculateLimitRemaining({
            facilityId: actor.facilityId,
            patientId: allocation.patientId.toHexString(),
            fundId: allocation.fundId.toHexString(),
            applicationId: allocation.applicationId.toHexString(),
            invoiceId: allocation.invoiceId.toHexString(),
            invoiceLineId,
            serviceCategory: source.serviceCategory,
            serviceCode: source.serviceCode,
            asOf: now,
            session: transaction.session,
          });
          patientPeriodLimits.push(limits.patientPeriodRemainingAmount);
          patientLifetimeLimits.push(limits.patientLifetimeRemainingAmount);
          invoiceLimits.push(limits.perInvoiceRemainingAmount);
          assertAssistanceAllocation({
            requestedAmount: decimal128ToString(line.amount),
            fundAvailableAmount: reservation == null
              ? decimal128ToString(fund.availableBalance)
              : decimal128ToString(reservation.remainingAmount),
            approvalRemainingAmount: reservation == null
              ? decimal128ToString(approval.remainingAmount)
              : decimal128ToString(reservation.remainingAmount),
            patientResponsibilityAmount: coordinated.patientResponsibilityAmount,
            invoiceOutstandingAmount: billing.invoice.outstandingAmount,
            invoiceLineOutstandingAmount: coordinated.maximumAdditionalAssistanceAmount,
            reservationRemainingAmount: reservation == null
              ? null
              : decimal128ToString(reservation.remainingAmount),
            patientPeriodRemainingAmount: limits.patientPeriodRemainingAmount,
            patientLifetimeRemainingAmount: limits.patientLifetimeRemainingAmount,
            perInvoiceRemainingAmount: limits.perInvoiceRemainingAmount,
            perServiceRemainingAmount: limits.perServiceRemainingAmount,
          });
        }
        assertAssistanceAllocation({
          requestedAmount: allocationAmount.toFixed(2),
          fundAvailableAmount: reservation == null
            ? decimal128ToString(fund.availableBalance)
            : decimal128ToString(reservation.remainingAmount),
          approvalRemainingAmount: reservation == null
            ? decimal128ToString(approval.remainingAmount)
            : decimal128ToString(reservation.remainingAmount),
          patientResponsibilityAmount: billing.invoice.patientAmount,
          invoiceOutstandingAmount: billing.invoice.outstandingAmount,
          reservationRemainingAmount: reservation == null
            ? null
            : decimal128ToString(reservation.remainingAmount),
          patientPeriodRemainingAmount: minimumOptionalAmount(patientPeriodLimits),
          patientLifetimeRemainingAmount: minimumOptionalAmount(patientLifetimeLimits),
          perInvoiceRemainingAmount: minimumOptionalAmount(invoiceLimits),
          perServiceRemainingAmount: null,
        });

        const confirmed = await this.dependencies.allocations.transition({
          actor,
          allocationId,
          expectedVersion: input.expectedVersion,
          fromStatus: allocation.status,
          toStatus: 'CONFIRMED',
          reason: input.reason,
          approvedBy: actor.userId,
          approvalRequestId,
          occurredAt: now,
          transaction,
        });
        if (confirmed === null) throw new AssistanceVersionConflictError();

        await this.dependencies.billing.applyAllocation({
          actor,
          allocationId,
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          lines: allocation.lines.map((line) => ({
            invoiceLineId: line.invoiceLineId.toHexString(),
            amount: decimal128ToString(line.amount),
          })),
          transaction,
        });

        const reservedDelta = reservation == null ? new Decimal(0) : allocationAmount.negated();
        if (reservation != null) {
          const consumed = await this.dependencies.reservations.consume({
            actor,
            reservationId: reservation._id.toHexString(),
            expectedVersion: reservation.version,
            amount: allocationAmount.toFixed(2),
            consumedAt: now,
            transaction,
          });
          if (consumed === null) throw new AssistanceVersionConflictError();
        }
        const nextFund = nextFundPosition(fund, {
          reservedDelta,
          utilizationDelta: allocationAmount,
        });
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
          amounts: nextApprovalAmounts(approval, {
            reservedDelta,
            utilizedDelta: allocationAmount,
          }),
          transaction,
        });
        if (updatedApproval === null) throw new AssistanceVersionConflictError();

        const utilized = await this.dependencies.allocations.applyFinancialSummary({
          actor,
          allocationId,
          expectedVersion: confirmed.version,
          amounts: {
            utilizedAmount: allocationAmount.toFixed(2),
            remainingAmount: '0.00',
          },
          lineAmounts: allocation.lines.map((line) => ({
            invoiceLineId: line.invoiceLineId.toHexString(),
            amounts: {
              utilizedAmount: decimal128ToString(line.amount),
              remainingAmount: '0.00',
            },
          })),
          status: 'UTILIZED',
          transaction,
        });
        if (utilized === null) throw new AssistanceVersionConflictError();

        await this.appendUtilizationTransaction(
          actor,
          fund,
          utilized,
          allocationAmount.toFixed(2),
          decimal128ToString(fund.ledgerBalance),
          nextFund.ledgerBalance,
          input.reason,
          approvalRequestId,
          transaction,
        );
        await this.dependencies.financialLedger.postFundFinancialEvent({
          actor,
          fundId: fund._id.toHexString(),
          eventType: 'ASSISTANCE_UTILIZATION',
          amount: allocationAmount.toFixed(2),
          sourceRecordId: allocationId,
          patientId: allocation.patientId.toHexString(),
          patientAccountId: allocation.patientAccountId.toHexString(),
          invoiceId: allocation.invoiceId.toHexString(),
          currency: allocation.currency,
          transaction,
        });
        await this.dependencies.billing.assertAllocationReconciliation({
          facilityId: actor.facilityId,
          allocationId,
          invoiceId: allocation.invoiceId.toHexString(),
          session: transaction.session,
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
          action: 'ASSISTANCE_ALLOCATION_UTILIZED',
          entityType: 'InvoiceFundAllocation',
          entityId: allocationId,
          reason: input.reason,
          before: projectAssistanceAllocation(allocation),
          after: projectAssistanceAllocation(utilized),
          transactionId: transaction.transactionId,
          session: transaction.session,
        });
        await this.enqueue(actor, utilized, allocation.status, transaction);
        return projectAssistanceAllocation(utilized);
      },
    });
  }

  private assertRelationships(
    input: CreateAssistanceAllocationInput,
    fund: AssistanceFundRecord,
    approval: AssistanceApprovalRecord,
    applicationPatientId: string,
  ) {
    if (
      approval.applicationId.toHexString() !== input.applicationId ||
      approval.fundId.toHexString() !== input.fundId ||
      fund._id.toHexString() !== input.fundId ||
      applicationPatientId !== input.patientId
    ) {
      throw new AssistanceFinancialReconciliationError(
        'Allocation application, approval, fund, and patient references do not reconcile',
      );
    }
  }

  private assertReservation(
    input: CreateAssistanceAllocationInput,
    reservation: AssistanceReservationRecord | null,
  ) {
    if (reservation == null) return;
    if (
      !['ACTIVE', 'PARTIALLY_CONSUMED'].includes(reservation.status) ||
      reservation.applicationId.toHexString() !== input.applicationId ||
      reservation.approvalId.toHexString() !== input.approvalId ||
      reservation.fundId.toHexString() !== input.fundId ||
      reservation.patientId.toHexString() !== input.patientId ||
      reservation.patientAccountId.toHexString() !== input.patientAccountId ||
      reservation.invoiceId.toHexString() !== input.invoiceId
    ) {
      throw new AssistanceReservationExceededError();
    }
  }

  private assertApprovalScope(
    approval: AssistanceApprovalRecord,
    source: Readonly<{
      invoiceLineId: string;
      serviceCategory: string;
      serviceCode: string;
    }>,
  ) {
    if (
      approval.approvedInvoiceLineIds.length > 0 &&
      !approval.approvedInvoiceLineIds.some(
        (id) => id.toHexString() === source.invoiceLineId,
      )
    ) {
      throw new AssistanceApprovalLimitExceededError();
    }
    if (
      approval.approvedServiceCategories.length > 0 &&
      !approval.approvedServiceCategories.includes(
        source.serviceCategory as AssistanceApprovalRecord['approvedServiceCategories'][number],
      )
    ) {
      throw new AssistanceApprovalLimitExceededError();
    }
    if (
      approval.approvedServiceCodes.length > 0 &&
      !approval.approvedServiceCodes.includes(source.serviceCode.trim().toUpperCase())
    ) {
      throw new AssistanceApprovalLimitExceededError();
    }
  }

  private async appendUtilizationTransaction(
    actor: WelfareZakatActorContext,
    fund: AssistanceFundRecord,
    allocation: AssistanceAllocationRecord,
    transactionAmount: string,
    balanceBefore: string,
    balanceAfter: string,
    reason: string,
    approvalRequestId: string,
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
      operationKey: `${transaction.transactionId}:UTILIZATION:${allocation._id.toHexString()}`,
      transactionType: 'UTILIZATION',
      direction: 'DEBIT',
      amount: transactionAmount,
      balanceBefore,
      balanceAfter,
      applicationId: allocation.applicationId.toHexString(),
      approvalId: allocation.approvalId.toHexString(),
      reservationId: allocation.reservationId?.toHexString() ?? null,
      allocationId: allocation._id.toHexString(),
      invoiceId: allocation.invoiceId.toHexString(),
      claimId: allocation.claimId?.toHexString() ?? null,
      reason,
      makerUserId: allocation.allocatedBy.toHexString(),
      checkerUserId: actor.userId,
      approvalRequestId,
      occurredAt,
      immutableHash: stableAssistancePayloadHash({
        allocationId: allocation._id.toHexString(),
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
    previousStatus: string | null,
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