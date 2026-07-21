import Decimal from 'decimal.js';
import {
  Types,
} from 'mongoose';

import {
  FinancialApprovalRequestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ApproveShiftVarianceInput,
  BeginShiftClosingInput,
  CloseCashierShiftInput,
  PaymentCashierActorContext,
  ShiftReconciliationView,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashCounterNotFoundError,
  CashierShiftClosingBlockedError,
  CashierShiftNotFoundError,
  PaymentCashierConcurrencyError,
  ShiftReconciliationNotFoundError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashierShiftRecord,
  FinancialApprovalRecord,
  PaymentCashierMongoSession,
  ShiftReconciliationRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  projectShiftReconciliation,
} from '../payments-cashier-shifts.projections.js';

import {
  PAYMENT_CASHIER_AUDIT_ACTIONS,
  PAYMENT_CASHIER_EVENT_TYPES,
  PAYMENT_CASHIER_LOCK_NAMESPACES,
  PAYMENT_CASHIER_REALTIME_EVENTS,
  PAYMENT_CASHIER_SEQUENCE_KEYS,
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  normalizePaymentCashierText,
  paymentCashierDecimal128,
  paymentCashierLockKey,
  paymentCashierSnapshotHash,
} from '../payments-cashier-shifts.normalization.js';

import type {
  CashierShiftExtendedRepositoryPort,
} from '../repositories/cashier-shift.repository.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import type {
  ShiftFinancialSnapshot,
  ShiftReconciliationQueryRepositoryPort,
} from '../repositories/shift-reconciliation-query.repository.js';

import {
  CashierShiftStateMachineService,
} from './cashier-shift-state-machine.service.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

export interface ShiftReconciliationServiceDependencies {
  shifts: CashierShiftExtendedRepositoryPort;
  configuration: PaymentConfigurationRepository;
  query: ShiftReconciliationQueryRepositoryPort;
  accessPolicy: PaymentCashierAccessPolicyPort;
  commandSupport: PaymentCashierCommandSupport;
  sequences: PaymentCashierSequencePort;
  audit: PaymentCashierAuditPort;
  outbox: PaymentCashierOutboxPort;
  realtime: PaymentCashierRealtimePort;
  stateMachine: CashierShiftStateMachineService;
  clock: Readonly<{ now(): Date }>;
}

function decimal(value: unknown): Decimal {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toString' in value
  ) {
    return new Decimal(String(value));
  }

  return new Decimal(String(value ?? '0'));
}

function requireUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new PaymentCashierConcurrencyError();
  }

  return value;
}

export class ShiftReconciliationService {
  public constructor(
    private readonly dependencies: ShiftReconciliationServiceDependencies,
  ) {}

  public async get(
    actor: PaymentCashierActorContext,
    shiftId: string,
  ): Promise<ShiftReconciliationView> {
    const reconciliation = await this.dependencies.shifts.findReconciliationByShift(
      actor.facilityId,
      shiftId,
    );

    if (reconciliation === null) {
      throw new ShiftReconciliationNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'RECONCILIATION_READ',
      resourceFacilityId: actor.facilityId,
      counterId: reconciliation.cashCounterId.toHexString(),
      cashierUserId: reconciliation.cashierUserId.toHexString(),
    });

    return projectShiftReconciliation(reconciliation);
  }

  public async beginClosing(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: BeginShiftClosingInput,
  ): Promise<ShiftReconciliationView> {
    const { actor } = command;
    const existingShift = await this.dependencies.shifts.findById(
      actor.facilityId,
      shiftId,
    );

    if (existingShift === null) {
      throw new CashierShiftNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_RECONCILE',
      resourceFacilityId: actor.facilityId,
      counterId: existingShift.cashCounterId.toHexString(),
      cashierUserId: existingShift.cashierUserId.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.BEGIN_SHIFT_RECONCILIATION,
      command,
      payload: { shiftId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.SHIFT_RECONCILIATION,
          actor.facilityId,
          shiftId,
        ),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const shift = await this.dependencies.shifts.findById(
          actor.facilityId,
          shiftId,
          session,
        );

        if (shift === null) {
          throw new CashierShiftNotFoundError();
        }

        if (shift.version !== input.expectedVersion) {
          throw new PaymentCashierConcurrencyError();
        }

        if (shift.status !== 'CLOSING_IN_PROGRESS') {
          this.dependencies.stateMachine.requireTransition(
            shift.status,
            'BEGIN_CLOSING',
          );
        }

        const counter = await this.dependencies.configuration.findCounterById(
          actor.facilityId,
          shift.cashCounterId.toHexString(),
          session,
        );

        if (counter === null) {
          throw new CashCounterNotFoundError();
        }

        const now = this.dependencies.clock.now();
        const snapshot = await this.dependencies.query.calculate(
          actor.facilityId,
          shiftId,
          session,
        );
        const expectedCash = this.expectedCash(shift, snapshot);
        const declaredCash = new Decimal(input.declaredCash);
        const variance = declaredCash.minus(expectedCash);
        const blockingIssues = this.blockingIssues(snapshot, input);
        const currentReconciliation = await this.dependencies.shifts.findReconciliationByShift(
          actor.facilityId,
          shiftId,
          session,
        );

        if (
          currentReconciliation !== null &&
          !['DRAFT', 'BLOCKED', 'PENDING_APPROVAL'].includes(
            currentReconciliation.status,
          )
        ) {
          throw new PaymentCashierConcurrencyError(
            'A completed reconciliation cannot be recalculated',
          );
        }

        let closingApprovalId: Types.ObjectId | null = null;
        let varianceApprovalId: Types.ObjectId | null = null;

        if (blockingIssues.length === 0) {
          if (counter.supervisorApprovalRequiredForClose) {
            closingApprovalId = await this.createApproval(
              actor,
              transactionId,
              `${operationKey}:close-approval`,
              shift._id,
              'CASH_SHIFT_CLOSE',
              expectedCash.toFixed(),
              input.notes ?? 'Cashier shift closing approval',
              now,
              session,
            );
          }

          if (!variance.isZero()) {
            varianceApprovalId = await this.createApproval(
              actor,
              transactionId,
              `${operationKey}:variance-approval`,
              shift._id,
              'SHIFT_VARIANCE',
              variance.abs().toFixed(),
              input.varianceReason ?? 'Cashier shift variance approval',
              now,
              session,
            );
          }
        }

        const status = blockingIssues.length > 0
          ? 'BLOCKED'
          : closingApprovalId !== null || varianceApprovalId !== null
            ? 'PENDING_APPROVAL'
            : 'APPROVED';
        const reconciliationNumber = currentReconciliation?.reconciliationNumber ??
          await this.dependencies.sequences.next(
            actor.facilityId,
            PAYMENT_CASHIER_SEQUENCE_KEYS.SHIFT_RECONCILIATION,
            now,
            session,
          );
        const snapshotHash = paymentCashierSnapshotHash({
          shiftId,
          expectedCash: expectedCash.toFixed(),
          declaredCash: declaredCash.toFixed(),
          variance: variance.toFixed(),
          snapshot,
          declarations: input.paymentMethodDeclarations ?? [],
          blockingIssues,
        });
        const common = {
          status,
          calculatedAt: now,
          calculatedBy: toObjectId(actor.userId, 'actor.userId'),
          openingFloat: shift.openingFloat,
          cashCollections: paymentCashierDecimal128(
            snapshot.cashCollections,
            'cashCollections',
          ),
          cashRefunds: paymentCashierDecimal128(
            snapshot.cashRefunds,
            'cashRefunds',
          ),
          cashPaidOut: paymentCashierDecimal128(
            snapshot.cashPaidOut,
            'cashPaidOut',
          ),
          cashDrops: paymentCashierDecimal128(
            snapshot.cashDrops,
            'cashDrops',
          ),
          safeDeposits: paymentCashierDecimal128(
            snapshot.safeDeposits,
            'safeDeposits',
          ),
          cashTransfersIn: paymentCashierDecimal128(
            snapshot.cashTransfersIn,
            'cashTransfersIn',
          ),
          cashTransfersOut: paymentCashierDecimal128(
            snapshot.cashTransfersOut,
            'cashTransfersOut',
          ),
          expectedClosingCash: paymentCashierDecimal128(
            expectedCash.toFixed(),
            'expectedClosingCash',
          ),
          declaredClosingCash: paymentCashierDecimal128(
            declaredCash.toFixed(),
            'declaredClosingCash',
          ),
          cashVariance: paymentCashierDecimal128(
            variance.toFixed(),
            'cashVariance',
          ),
          nonCashTotal: paymentCashierDecimal128(
            snapshot.nonCashTotal,
            'nonCashTotal',
          ),
          paymentMethodTotals: snapshot.paymentMethodTotals,
          paymentCount: snapshot.paymentCount,
          receiptCount: snapshot.receiptCount,
          failedPaymentCount: snapshot.failedPaymentCount,
          unallocatedPaymentCount: snapshot.unallocatedPaymentCount,
          unresolvedRefundCount: snapshot.unresolvedRefundCount,
          incompleteJournalCount: snapshot.incompleteJournalCount,
          blockingIssueCodes: blockingIssues,
          varianceReason: input.varianceReason ?? null,
          overrideReason: null,
          overrideApprovalRequestId: null,
          varianceApprovalRequestId: varianceApprovalId,
          approvedAt: status === 'APPROVED' ? now : null,
          approvedBy: status === 'APPROVED'
            ? toObjectId(actor.userId, 'actor.userId')
            : null,
          closedAt: null,
          snapshotHash,
          updatedBy: toObjectId(actor.userId, 'actor.userId'),
          transactionId,
          correlationId: actor.correlationId,
        } as const;

        const reconciliation = currentReconciliation === null
          ? await this.dependencies.shifts.createReconciliation(
              {
                facilityId: toObjectId(actor.facilityId, 'facilityId'),
                transactionId,
                correlationId: actor.correlationId,
                schemaVersion: 1,
                version: 0,
                createdBy: toObjectId(actor.userId, 'actor.userId'),
                updatedBy: toObjectId(actor.userId, 'actor.userId'),
                operationKey,
                reconciliationNumber,
                cashShiftId: shift._id,
                cashCounterId: shift.cashCounterId,
                cashierUserId: shift.cashierUserId,
                currency: shift.currency,
                ...common,
              },
              session,
            )
          : requireUpdated(
              await this.dependencies.shifts.updateReconciliation(
                actor.facilityId,
                currentReconciliation._id.toHexString(),
                currentReconciliation.version,
                common,
                session,
              ),
            );

        const updatedShift = requireUpdated(
          await this.dependencies.shifts.updateWithMetadata(
            actor.facilityId,
            shiftId,
            shift.version,
            {
              status: 'CLOSING_IN_PROGRESS',
              closingStartedAt: shift.closingStartedAt ?? now,
              closingStartedBy: shift.closingStartedBy ??
                toObjectId(actor.userId, 'actor.userId'),
              expectedCash: paymentCashierDecimal128(
                expectedCash.toFixed(),
                'expectedCash',
              ),
              declaredCash: paymentCashierDecimal128(
                declaredCash.toFixed(),
                'declaredCash',
              ),
              cashVariance: paymentCashierDecimal128(
                variance.toFixed(),
                'cashVariance',
              ),
              nonCashTotal: paymentCashierDecimal128(
                snapshot.nonCashTotal,
                'nonCashTotal',
              ),
              paymentMethodTotals: snapshot.paymentMethodTotals,
              refundTotal: paymentCashierDecimal128(
                snapshot.refundTotal,
                'refundTotal',
              ),
              reversalTotal: paymentCashierDecimal128(
                snapshot.reversalTotal,
                'reversalTotal',
              ),
              depositTotal: paymentCashierDecimal128(
                snapshot.depositTotal,
                'depositTotal',
              ),
              advanceTotal: paymentCashierDecimal128(
                snapshot.advanceTotal,
                'advanceTotal',
              ),
              firstReceiptNumber: snapshot.firstReceiptNumber,
              lastReceiptNumber: snapshot.lastReceiptNumber,
              receiptCount: snapshot.receiptCount,
              paymentCount: snapshot.paymentCount,
              notes: input.notes ?? shift.notes,
              shiftReconciliationId: reconciliation._id,
              closingApprovalRequestId: closingApprovalId,
              varianceApprovalRequestId: varianceApprovalId,
            },
            {
              actorUserId: actor.userId,
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const view = projectShiftReconciliation(reconciliation);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'SHIFT_RECONCILIATION',
          entityId: view.id,
          action: blockingIssues.length > 0
            ? 'CLOSING_BLOCKED'
            : 'CLOSING_STARTED',
          occurredAt: now,
          session,
          statusFrom: currentReconciliation?.status ?? null,
          statusTo: view.status,
          amount: view.declaredClosingCash,
          currency: view.currency,
          reason: blockingIssues.length > 0
            ? blockingIssues.join(', ')
            : input.notes ?? null,
          cashCounterId: updatedShift.cashCounterId.toHexString(),
          cashShiftId: shiftId,
          metadata: {
            expectedCash: view.expectedClosingCash,
            variance: view.cashVariance,
            closingApprovalRequestId: closingApprovalId?.toHexString() ?? null,
            varianceApprovalRequestId: varianceApprovalId?.toHexString() ?? null,
          },
        });

        await this.writeEvent(
          actor,
          transactionId,
          now,
          reconciliation,
          blockingIssues.length > 0
            ? PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_RECONCILIATION_BLOCKED
            : PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_CLOSING_STARTED,
          blockingIssues.length > 0
            ? PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_RECONCILIATION_BLOCKED
            : PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_CLOSING_STARTED,
          session,
        );

        return view;
      },
    });

    await this.publish(actor.facilityId, shiftId, result);
    return result;
  }

  public async approveShiftControl(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: ApproveShiftVarianceInput,
  ): Promise<ShiftReconciliationView> {
    const { actor } = command;
    const shift = await this.dependencies.shifts.findById(
      actor.facilityId,
      shiftId,
    );

    if (shift === null) {
      throw new CashierShiftNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_VARIANCE_APPROVE',
      resourceFacilityId: actor.facilityId,
      counterId: shift.cashCounterId.toHexString(),
      makerUserId: shift.cashierUserId.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.DECIDE_SHIFT_APPROVAL,
      command,
      payload: { shiftId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.FINANCIAL_APPROVAL,
          actor.facilityId,
          input.approvalRequestId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const currentShift = await this.dependencies.shifts.findById(
          actor.facilityId,
          shiftId,
          session,
        );
        const reconciliation = await this.dependencies.shifts.findReconciliationByShift(
          actor.facilityId,
          shiftId,
          session,
        );

        if (
          currentShift === null ||
          reconciliation === null ||
          currentShift.version !== input.expectedVersion ||
          reconciliation.status !== 'PENDING_APPROVAL'
        ) {
          throw new PaymentCashierConcurrencyError();
        }

        const approval = await this.approveFinancialRequest(
          actor,
          input.approvalRequestId,
          currentShift._id,
          input.decisionReason,
          transactionId,
          session,
        );
        const closingApproved = await this.isApproved(
          actor.facilityId,
          currentShift.closingApprovalRequestId,
          session,
        );
        const varianceApproved = await this.isApproved(
          actor.facilityId,
          currentShift.varianceApprovalRequestId,
          session,
        );
        const allApproved = closingApproved && varianceApproved;
        const now = this.dependencies.clock.now();
        const updated = requireUpdated(
          await this.dependencies.shifts.updateReconciliation(
            actor.facilityId,
            reconciliation._id.toHexString(),
            reconciliation.version,
            {
              status: allApproved ? 'APPROVED' : 'PENDING_APPROVAL',
              approvedAt: allApproved ? now : reconciliation.approvedAt,
              approvedBy: allApproved
                ? toObjectId(actor.userId, 'actor.userId')
                : reconciliation.approvedBy,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const view = projectShiftReconciliation(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'SHIFT_RECONCILIATION',
          entityId: view.id,
          action: 'APPROVED',
          occurredAt: now,
          session,
          statusFrom: 'PENDING_APPROVAL',
          statusTo: view.status,
          amount: view.cashVariance,
          currency: view.currency,
          reason: input.decisionReason,
          approvalRequestId: approval._id.toHexString(),
          cashCounterId: view.cashCounterId,
          cashShiftId: view.cashShiftId,
          metadata: {
            approvalType: approval.approvalType,
            allApprovalsSatisfied: allApproved,
          },
        });

        await this.writeEvent(
          actor,
          transactionId,
          now,
          updated,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_APPROVAL_DECIDED,
          PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_APPROVAL_DECIDED,
          session,
        );

        return view;
      },
    });

    await this.publish(actor.facilityId, shiftId, result);
    return result;
  }

  public async close(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: CloseCashierShiftInput,
  ): Promise<ShiftReconciliationView> {
    const { actor } = command;
    const existingShift = await this.dependencies.shifts.findById(
      actor.facilityId,
      shiftId,
    );

    if (existingShift === null) {
      throw new CashierShiftNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_CLOSE',
      resourceFacilityId: actor.facilityId,
      counterId: existingShift.cashCounterId.toHexString(),
      cashierUserId: existingShift.cashierUserId.toHexString(),
      makerUserId: existingShift.cashierUserId.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CLOSE_CASHIER_SHIFT,
      command,
      payload: { shiftId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.SHIFT_RECONCILIATION,
          actor.facilityId,
          input.reconciliationId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const shift = await this.dependencies.shifts.findById(
          actor.facilityId,
          shiftId,
          session,
        );
        const reconciliation = await this.dependencies.shifts.findReconciliationByShift(
          actor.facilityId,
          shiftId,
          session,
        );

        if (
          shift === null ||
          reconciliation === null ||
          shift.version !== input.expectedVersion ||
          reconciliation._id.toHexString() !== input.reconciliationId
        ) {
          throw new PaymentCashierConcurrencyError();
        }

        this.dependencies.stateMachine.requireTransition(shift.status, 'CLOSE');

        if (
          reconciliation.blockingIssueCodes.length > 0 ||
          reconciliation.status !== 'APPROVED'
        ) {
          throw new CashierShiftClosingBlockedError();
        }

        if (
          shift.closingApprovalRequestId !== null &&
          shift.closingApprovalRequestId.toHexString() !==
            input.closingApprovalRequestId
        ) {
          throw new CashierShiftClosingBlockedError(
            'The closing approval does not match the shift reconciliation',
          );
        }

        if (
          !(await this.isApproved(
            actor.facilityId,
            shift.closingApprovalRequestId,
            session,
          )) ||
          !(await this.isApproved(
            actor.facilityId,
            shift.varianceApprovalRequestId,
            session,
          ))
        ) {
          throw new CashierShiftClosingBlockedError(
            'All required closing and variance approvals must be completed',
          );
        }

        const now = this.dependencies.clock.now();
        const closedReconciliation = requireUpdated(
          await this.dependencies.shifts.updateReconciliation(
            actor.facilityId,
            reconciliation._id.toHexString(),
            reconciliation.version,
            {
              status: 'CLOSED',
              closedAt: now,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        await this.dependencies.shifts.updateWithMetadata(
          actor.facilityId,
          shiftId,
          shift.version,
          {
            status: 'CLOSED',
            closedAt: now,
            closedBy: toObjectId(actor.userId, 'actor.userId'),
            notes: input.reason ?? shift.notes,
          },
          {
            actorUserId: actor.userId,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const view = projectShiftReconciliation(closedReconciliation);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'SHIFT_RECONCILIATION',
          entityId: view.id,
          action: 'CLOSED',
          occurredAt: now,
          session,
          statusFrom: 'APPROVED',
          statusTo: 'CLOSED',
          amount: view.declaredClosingCash,
          currency: view.currency,
          reason: input.reason ?? null,
          cashCounterId: view.cashCounterId,
          cashShiftId: view.cashShiftId,
          metadata: {
            variance: view.cashVariance,
            paymentCount: view.paymentCount,
            receiptCount: view.receiptCount,
          },
        });

        await this.writeEvent(
          actor,
          transactionId,
          now,
          closedReconciliation,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_CLOSED,
          PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_CLOSED,
          session,
        );

        return view;
      },
    });

    await this.publish(actor.facilityId, shiftId, result);
    return result;
  }

  private expectedCash(
    shift: CashierShiftRecord,
    snapshot: ShiftFinancialSnapshot,
  ): Decimal {
    return decimal(shift.openingFloat)
      .plus(snapshot.cashCollections)
      .minus(snapshot.cashRefunds)
      .minus(snapshot.cashPaidOut)
      .minus(snapshot.cashDrops)
      .minus(snapshot.safeDeposits)
      .plus(snapshot.cashTransfersIn)
      .minus(snapshot.cashTransfersOut);
  }

  private blockingIssues(
    snapshot: ShiftFinancialSnapshot,
    input: BeginShiftClosingInput,
  ): string[] {
    const issues: string[] = [];

    if (snapshot.failedPaymentCount > 0) {
      issues.push('FAILED_PAYMENTS');
    }
    if (snapshot.unallocatedPaymentCount > 0) {
      issues.push('UNRESOLVED_UNALLOCATED_PAYMENTS');
    }
    if (snapshot.unresolvedRefundCount > 0) {
      issues.push('UNRESOLVED_REFUNDS');
    }
    if (snapshot.incompleteJournalCount > 0) {
      issues.push('INCOMPLETE_FINANCIAL_JOURNALS');
    }

    const totals = new Map(
      snapshot.paymentMethodTotals.map((total) => [
        total.paymentMethodConfigurationId.toHexString(),
        decimal(total.netAmount),
      ]),
    );

    for (const declaration of input.paymentMethodDeclarations ?? []) {
      const authoritative = totals.get(
        declaration.paymentMethodConfigurationId,
      ) ?? new Decimal(0);

      if (!authoritative.equals(declaration.declaredAmount)) {
        issues.push(
          `PAYMENT_METHOD_DECLARATION_MISMATCH:${declaration.paymentMethodConfigurationId}`,
        );
      }
    }

    return [...new Set(issues)];
  }

  private async createApproval(
    actor: PaymentCashierActorContext,
    transactionId: string,
    operationKey: string,
    shiftId: Types.ObjectId,
    approvalType: 'CASH_SHIFT_CLOSE' | 'SHIFT_VARIANCE',
    amount: string,
    reason: string,
    requestedAt: Date,
    session: PaymentCashierMongoSession,
  ): Promise<Types.ObjectId> {
    const approvalId = new Types.ObjectId();
    const number = await this.dependencies.sequences.next(
      actor.facilityId,
      PAYMENT_CASHIER_SEQUENCE_KEYS.FINANCIAL_APPROVAL,
      requestedAt,
      session,
    );
    const actorId = toObjectId(actor.userId, 'actor.userId');

    await FinancialApprovalRequestModel.create(
      [
        {
          _id: approvalId,
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
          requestNumber: number,
          operationKey,
          approvalType,
          entityType: 'CASH_SHIFT',
          entityId: shiftId,
          patientAccountId: null,
          amount: paymentCashierDecimal128(amount, 'amount'),
          thresholdAmountSnapshot: paymentCashierDecimal128(
            amount,
            'thresholdAmountSnapshot',
          ),
          requestedBy: actorId,
          requestedAt,
          reason: normalizePaymentCashierText(reason),
          status: 'PENDING',
          decidedBy: null,
          decidedAt: null,
          decisionReason: null,
          expiresAt: null,
          makerCheckerSatisfied: false,
        },
      ],
      { session },
    );

    return approvalId;
  }

  private async approveFinancialRequest(
    actor: PaymentCashierActorContext,
    approvalRequestId: string,
    shiftId: Types.ObjectId,
    decisionReason: string,
    transactionId: string,
    session: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord> {
    const actorId = toObjectId(actor.userId, 'actor.userId');
    const now = this.dependencies.clock.now();
    const approval = await FinancialApprovalRequestModel.findOneAndUpdate(
      {
        _id: toObjectId(approvalRequestId, 'approvalRequestId'),
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        entityId: shiftId,
        approvalType: { $in: ['CASH_SHIFT_CLOSE', 'SHIFT_VARIANCE'] },
        status: 'PENDING',
        requestedBy: { $ne: actorId },
      },
      {
        $set: {
          status: 'APPROVED',
          decidedBy: actorId,
          decidedAt: now,
          decisionReason: normalizePaymentCashierText(decisionReason),
          makerCheckerSatisfied: true,
          updatedBy: actorId,
          transactionId,
          correlationId: actor.correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (approval === null) {
      throw new PaymentCashierConcurrencyError(
        'The shift approval is no longer pending or violates maker-checker rules',
      );
    }

    return approval as FinancialApprovalRecord;
  }

  private async isApproved(
    facilityId: string,
    approvalRequestId: Types.ObjectId | null,
    session: PaymentCashierMongoSession,
  ): Promise<boolean> {
    if (approvalRequestId === null) {
      return true;
    }

    const approval = await FinancialApprovalRequestModel.findOne({
      _id: approvalRequestId,
      facilityId: toObjectId(facilityId, 'facilityId'),
      status: 'APPROVED',
      makerCheckerSatisfied: true,
    })
      .session(session)
      .lean()
      .exec();

    return approval !== null;
  }

  private async writeEvent(
    actor: PaymentCashierActorContext,
    transactionId: string,
    occurredAt: Date,
    reconciliation: ShiftReconciliationRecord,
    auditAction: string,
    eventType: string,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const view = projectShiftReconciliation(reconciliation);

    await Promise.all([
      this.dependencies.audit.record(
        {
          facilityId: actor.facilityId,
          actorUserId: actor.userId,
          actorStaffId: actor.staffId,
          action: auditAction,
          entityType: 'SHIFT_RECONCILIATION',
          entityId: view.id,
          reason: view.blockingIssueCodes.join(', ') || view.varianceReason,
          before: null,
          after: view as unknown as Record<string, unknown>,
          correlationId: actor.correlationId,
          transactionId,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        session,
      ),
      this.dependencies.outbox.publish(
        {
          facilityId: actor.facilityId,
          aggregateType: 'CASH_SHIFT',
          aggregateId: view.cashShiftId,
          eventType,
          payload: {
            shiftId: view.cashShiftId,
            reconciliationId: view.id,
            status: view.status,
            cashVariance: view.cashVariance,
            blockingIssueCodes: view.blockingIssueCodes,
          },
          correlationId: actor.correlationId,
          transactionId,
          occurredAt,
        },
        session,
      ),
    ]);
  }

  private async publish(
    facilityId: string,
    shiftId: string,
    view: ShiftReconciliationView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.RECONCILIATION_CHANGED,
      entityId: view.id,
      counterId: view.cashCounterId,
      shiftId,
      status: view.status,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }
}