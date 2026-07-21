import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CashierShiftView,
  HandoverCashierShiftInput,
  OpenCashierShiftInput,
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  ReopenCashierShiftInput,
  ResumeCashierShiftInput,
  SuspendCashierShiftInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  ActiveCashierShiftConflictError,
  CashCounterInactiveError,
  CashCounterNotFoundError,
  CashHoldingLimitExceededError,
  CashierShiftNotFoundError,
  CashierShiftNotOpenError,
  PaymentCashierConcurrencyError,
  PaymentCashierCounterScopeError,
  PaymentMethodCurrencyError,
} from '../payments-cashier-shifts.errors.js';

import type {
  FinancialApprovalPort,
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashCounterRecord,
  CashierShiftRecord,
  CashierShiftUpdate,
  PaymentCashierMongoSession,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  projectCashierShift,
} from '../payments-cashier-shifts.projections.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import type {
  CashierShiftExtendedRepositoryPort,
} from '../repositories/cashier-shift.repository.js';

import {
  PAYMENT_CASHIER_AUDIT_ACTIONS,
  PAYMENT_CASHIER_EVENT_TYPES,
  PAYMENT_CASHIER_LOCK_NAMESPACES,
  PAYMENT_CASHIER_REALTIME_EVENTS,
  PAYMENT_CASHIER_SEQUENCE_KEYS,
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  comparePaymentCashierDecimals,
  normalizeNullablePaymentCashierText,
  normalizePaymentCashierText,
  paymentCashierDecimal128,
  paymentCashierLockKey,
} from '../payments-cashier-shifts.normalization.js';

import {
  CashierShiftStateMachineService,
} from './cashier-shift-state-machine.service.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

export interface CashierShiftServiceDependencies {
  configuration: PaymentConfigurationRepository;
  shifts: CashierShiftExtendedRepositoryPort;
  accessPolicy: PaymentCashierAccessPolicyPort;
  approvals: FinancialApprovalPort;
  commandSupport: PaymentCashierCommandSupport;
  sequences: PaymentCashierSequencePort;
  audit: PaymentCashierAuditPort;
  outbox: PaymentCashierOutboxPort;
  realtime: PaymentCashierRealtimePort;
  stateMachine: CashierShiftStateMachineService;
  clock: Readonly<{ now(): Date }>;
}

function requireUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new PaymentCashierConcurrencyError();
  }

  return value;
}

export class CashierShiftService {
  public constructor(
    private readonly dependencies: CashierShiftServiceDependencies,
  ) {}

  public async get(
    actor: PaymentCashierActorContext,
    shiftId: string,
  ): Promise<CashierShiftView> {
    const shift = await this.dependencies.shifts.findById(
      actor.facilityId,
      shiftId,
    );

    if (shift === null) {
      throw new CashierShiftNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_READ',
      resourceFacilityId: actor.facilityId,
      counterId: shift.cashCounterId.toHexString(),
      cashierUserId: shift.cashierUserId.toHexString(),
    });

    return projectCashierShift(shift);
  }

  public async list(
    actor: PaymentCashierActorContext,
    query: PaymentCashierListQuery,
  ): Promise<PaymentCashierPage<CashierShiftView>> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_READ',
      resourceFacilityId: actor.facilityId,
      counterId: query.counterId,
      cashierUserId: query.cashierUserId,
    });

    const page = await this.dependencies.shifts.list(
      actor.facilityId,
      query,
    );

    return {
      ...page,
      items: page.items.map(projectCashierShift),
    };
  }

  public async open(
    command: PaymentCashierCommandContext,
    input: OpenCashierShiftInput,
  ): Promise<CashierShiftView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_OPEN',
      resourceFacilityId: actor.facilityId,
      counterId: input.cashCounterId,
      cashierUserId: actor.userId,
    });

    const counter = await this.dependencies.configuration.findCounterById(
      actor.facilityId,
      input.cashCounterId,
    );

    if (counter === null) {
      throw new CashCounterNotFoundError();
    }

    this.requireCounterOpenable(counter, actor, input);

    const policyLockKey = this.activePolicyLockKey(
      actor.facilityId,
      counter.activeShiftPolicy,
      input.cashCounterId,
      actor.userId,
    );

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.OPEN_CASHIER_SHIFT,
      command,
      payload: input,
      lockKeys: [
        policyLockKey,
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASH_COUNTER,
          actor.facilityId,
          input.cashCounterId,
        ),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const currentCounter =
          await this.dependencies.configuration.findCounterById(
            actor.facilityId,
            input.cashCounterId,
            session,
          );

        if (currentCounter === null) {
          throw new CashCounterNotFoundError();
        }

        this.requireCounterOpenable(currentCounter, actor, input);

        const active = await this.dependencies.shifts.findActiveForPolicy(
          actor.facilityId,
          input.cashCounterId,
          actor.userId,
          currentCounter.activeShiftPolicy,
          session,
        );

        if (active !== null) {
          throw new ActiveCashierShiftConflictError();
        }

        const openedAt = this.dependencies.clock.now();
        const shiftNumber = await this.dependencies.sequences.next(
          actor.facilityId,
          PAYMENT_CASHIER_SEQUENCE_KEYS.CASHIER_SHIFT,
          openedAt,
          session,
        );
        const created = await this.dependencies.shifts.create(
          this.buildOpenShiftRecord({
            actor,
            input,
            transactionId,
            operationKey,
            shiftNumber,
            openedAt,
          }),
          session,
        );
        const view = projectCashierShift(created);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_SHIFT',
          entityId: view.id,
          action: 'OPENED',
          occurredAt: openedAt,
          session,
          statusFrom: null,
          statusTo: 'OPEN',
          amount: view.openingFloat,
          currency: view.currency,
          cashCounterId: view.cashCounterId,
          cashShiftId: view.id,
          metadata: {
            shiftNumber: view.shiftNumber,
            cashierUserId: view.cashierUserId,
            openingFloat: view.openingFloat,
          },
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          openedAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_OPENED,
          PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_OPENED,
          view,
          null,
          view,
          null,
          session,
        );

        return view;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async suspend(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: SuspendCashierShiftInput,
  ): Promise<CashierShiftView> {
    return this.changeLifecycleStatus(
      command,
      shiftId,
      input.expectedVersion,
      'SHIFT_SUSPEND',
      'SUSPEND',
      'SUSPENDED',
      input.reason,
      PAYMENT_CASHIER_TRANSACTION_TYPES.SUSPEND_CASHIER_SHIFT,
      PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_SUSPENDED,
      PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_SUSPENDED,
    );
  }

  public async resume(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: ResumeCashierShiftInput,
  ): Promise<CashierShiftView> {
    return this.changeLifecycleStatus(
      command,
      shiftId,
      input.expectedVersion,
      'SHIFT_RESUME',
      'RESUME',
      'OPEN',
      input.reason,
      PAYMENT_CASHIER_TRANSACTION_TYPES.RESUME_CASHIER_SHIFT,
      PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_RESUMED,
      PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_RESUMED,
    );
  }

  public async handover(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: HandoverCashierShiftInput,
  ): Promise<CashierShiftView> {
    const { actor } = command;
    const existing = await this.requireShift(actor.facilityId, shiftId);

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_HANDOVER',
      resourceFacilityId: actor.facilityId,
      counterId: existing.cashCounterId.toHexString(),
      cashierUserId: existing.cashierUserId.toHexString(),
    });

    this.dependencies.stateMachine.requireTransition(
      existing.status,
      'SUSPEND',
    );

    const counter = await this.dependencies.configuration.findCounterById(
      actor.facilityId,
      existing.cashCounterId.toHexString(),
    );

    if (counter === null || !counter.active) {
      throw new CashCounterInactiveError();
    }

    if (
      !counter.assignedUserIds.some(
        (userId) => userId.toHexString() === input.handoverToUserId,
      ) ||
      !(await this.dependencies.configuration.activeUsersExist(
        actor.facilityId,
        [input.handoverToUserId],
      ))
    ) {
      throw new PaymentCashierCounterScopeError();
    }

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.HANDOVER_CASHIER_SHIFT,
      command,
      payload: { shiftId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const current = await this.requireShift(
          actor.facilityId,
          shiftId,
          session,
        );
        this.dependencies.stateMachine.requireTransition(current.status, 'SUSPEND');

        const occurredAt = this.dependencies.clock.now();
        const before = projectCashierShift(current);
        const updated = requireUpdated(
          await this.dependencies.shifts.updateWithMetadata(
            actor.facilityId,
            shiftId,
            input.expectedVersion,
            {
              status: 'SUSPENDED',
              suspendedAt: occurredAt,
              suspendedBy: toObjectId(actor.userId, 'actor.userId'),
              suspensionReason: 'SHIFT_HANDOVER',
              handoverToUserId: toObjectId(
                input.handoverToUserId,
                'handoverToUserId',
              ),
              handoverAt: occurredAt,
              handoverNotes: normalizePaymentCashierText(input.notes),
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
            },
            {
              actorUserId: actor.userId,
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const after = projectCashierShift(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_SHIFT',
          entityId: after.id,
          action: 'TRANSFERRED',
          occurredAt,
          session,
          statusFrom: before.status,
          statusTo: after.status,
          reason: input.notes,
          cashCounterId: after.cashCounterId,
          cashShiftId: after.id,
          metadata: {
            handoverToUserId: input.handoverToUserId,
          },
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_HANDOVER_RECORDED,
          PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_HANDOVER_RECORDED,
          after,
          before,
          after,
          input.notes,
          session,
        );

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async reopen(
    command: PaymentCashierCommandContext,
    shiftId: string,
    input: ReopenCashierShiftInput,
  ): Promise<CashierShiftView> {
    const { actor } = command;
    const closedShift = await this.requireShift(actor.facilityId, shiftId);

    if (closedShift.status !== 'CLOSED') {
      throw new CashierShiftNotOpenError();
    }

    const closedCounter = await this.dependencies.configuration.findCounterById(
      actor.facilityId,
      closedShift.cashCounterId.toHexString(),
    );

    if (closedCounter === null || !closedCounter.active) {
      throw new CashCounterInactiveError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action: 'SHIFT_REOPEN',
      resourceFacilityId: actor.facilityId,
      counterId: closedShift.cashCounterId.toHexString(),
      cashierUserId: closedShift.cashierUserId.toHexString(),
      makerUserId: closedShift.closedBy?.toHexString() ?? null,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.REOPEN_CASHIER_SHIFT,
      command,
      payload: { shiftId, ...input },
      lockKeys: [
        this.activePolicyLockKey(
          actor.facilityId,
          closedCounter.activeShiftPolicy,
          closedShift.cashCounterId.toHexString(),
          closedShift.cashierUserId.toHexString(),
        ),
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
      ],
      work: async ({ session, transactionId, operationKey }) => {
        const current = await this.requireShift(
          actor.facilityId,
          shiftId,
          session,
        );

        if (current.status !== 'CLOSED') {
          throw new CashierShiftNotOpenError();
        }

        const counter = await this.dependencies.configuration.findCounterById(
          actor.facilityId,
          current.cashCounterId.toHexString(),
          session,
        );

        if (counter === null || !counter.active) {
          throw new CashCounterInactiveError();
        }

        await this.dependencies.approvals.requireApproved(
          actor.facilityId,
          input.approvalRequestId,
          'CASH_SHIFT_REOPEN',
          current.closedBy?.toHexString() ?? current.cashierUserId.toHexString(),
          session,
        );

        const active = await this.dependencies.shifts.findActiveForPolicy(
          actor.facilityId,
          current.cashCounterId.toHexString(),
          current.cashierUserId.toHexString(),
          counter.activeShiftPolicy,
          session,
        );

        if (active !== null) {
          throw new ActiveCashierShiftConflictError();
        }

        const reopenedAt = this.dependencies.clock.now();
        const shiftNumber = await this.dependencies.sequences.next(
          actor.facilityId,
          PAYMENT_CASHIER_SEQUENCE_KEYS.CASHIER_SHIFT,
          reopenedAt,
          session,
        );
        const openingFloat = current.declaredCash.toString();
        const replacement = await this.dependencies.shifts.create(
          this.buildOpenShiftRecord({
            actor,
            cashierUserId: current.cashierUserId.toHexString(),
            cashierStaffId:
              current.cashierStaffId?.toHexString() ?? actor.staffId,
            input: {
              cashCounterId: current.cashCounterId.toHexString(),
              openingFloat,
              currency: current.currency as 'PKR',
              supervisorUserId: current.supervisorUserId?.toHexString() ?? null,
              notes: `Reopened from ${current.shiftNumber}: ${input.reason}`,
            },
            transactionId,
            operationKey,
            shiftNumber,
            openedAt: reopenedAt,
            reopenedFromShiftId: shiftId,
            reopenApprovalRequestId: input.approvalRequestId,
            reopenReason: input.reason,
          }),
          session,
        );
        const replacementView = projectCashierShift(replacement);
        const closedView = projectCashierShift(current);

        await Promise.all([
          this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType: 'CASH_SHIFT',
            entityId: closedView.id,
            action: 'REOPENED',
            occurredAt: reopenedAt,
            session,
            statusFrom: 'CLOSED',
            statusTo: 'CLOSED',
            reason: input.reason,
            approvalRequestId: input.approvalRequestId,
            cashCounterId: closedView.cashCounterId,
            cashShiftId: closedView.id,
            metadata: {
              replacementShiftId: replacementView.id,
              replacementShiftNumber: replacementView.shiftNumber,
            },
          }),
          this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType: 'CASH_SHIFT',
            entityId: replacementView.id,
            action: 'OPENED',
            occurredAt: reopenedAt,
            session,
            statusFrom: null,
            statusTo: 'OPEN',
            amount: replacementView.openingFloat,
            currency: replacementView.currency,
            reason: input.reason,
            approvalRequestId: input.approvalRequestId,
            cashCounterId: replacementView.cashCounterId,
            cashShiftId: replacementView.id,
            metadata: {
              reopenedFromShiftId: closedView.id,
            },
          }),
        ]);

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          reopenedAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASHIER_SHIFT_REOPENED,
          PAYMENT_CASHIER_EVENT_TYPES.CASHIER_SHIFT_REOPENED,
          replacementView,
          closedView,
          replacementView,
          input.reason,
          session,
        );

        return replacementView;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  private async changeLifecycleStatus(
    command: PaymentCashierCommandContext,
    shiftId: string,
    expectedVersion: number,
    accessAction: 'SHIFT_SUSPEND' | 'SHIFT_RESUME',
    transitionAction: 'SUSPEND' | 'RESUME',
    nextStatus: 'SUSPENDED' | 'OPEN',
    reason: string,
    transactionType: string,
    auditAction: string,
    eventType: string,
  ): Promise<CashierShiftView> {
    const { actor } = command;
    const existing = await this.requireShift(actor.facilityId, shiftId);

    this.dependencies.accessPolicy.require({
      actor,
      action: accessAction,
      resourceFacilityId: actor.facilityId,
      counterId: existing.cashCounterId.toHexString(),
      cashierUserId: existing.cashierUserId.toHexString(),
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: transactionType,
      command,
      payload: { shiftId, expectedVersion, reason },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          shiftId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const current = await this.requireShift(
          actor.facilityId,
          shiftId,
          session,
        );
        this.dependencies.stateMachine.requireTransition(
          current.status,
          transitionAction,
        );

        const occurredAt = this.dependencies.clock.now();
        const before = projectCashierShift(current);
        const update: CashierShiftUpdate = nextStatus === 'SUSPENDED'
          ? {
              status: 'SUSPENDED',
              suspendedAt: occurredAt,
              suspendedBy: toObjectId(actor.userId, 'actor.userId'),
              suspensionReason: normalizePaymentCashierText(reason),
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
            }
          : {
              status: 'OPEN',
              suspendedAt: null,
              suspendedBy: null,
              suspensionReason: null,
              updatedBy: toObjectId(actor.userId, 'actor.userId'),
            };

        const updated = requireUpdated(
          await this.dependencies.shifts.updateWithMetadata(
            actor.facilityId,
            shiftId,
            expectedVersion,
            update,
            {
              actorUserId: actor.userId,
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const after = projectCashierShift(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_SHIFT',
          entityId: after.id,
          action: nextStatus === 'SUSPENDED' ? 'SUSPENDED' : 'RESUMED',
          occurredAt,
          session,
          statusFrom: before.status,
          statusTo: after.status,
          reason,
          cashCounterId: after.cashCounterId,
          cashShiftId: after.id,
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          auditAction,
          eventType,
          after,
          before,
          after,
          reason,
          session,
        );

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  private requireCounterOpenable(
    counter: CashCounterRecord,
    actor: PaymentCashierActorContext,
    input: OpenCashierShiftInput,
  ): void {
    if (!counter.active) {
      throw new CashCounterInactiveError();
    }

    if (counter.currency !== (input.currency ?? counter.currency)) {
      throw new PaymentMethodCurrencyError();
    }

    const assigned = counter.assignedUserIds.some(
      (userId) => userId.toHexString() === actor.userId,
    );

    if (
      !assigned &&
      !actor.permissionKeys.has('payments.counters.manage')
    ) {
      throw new PaymentCashierCounterScopeError();
    }

    const openingFloat = input.openingFloat;

    if (
      counter.openingFloatRequired &&
      (
        comparePaymentCashierDecimals(
          openingFloat,
          counter.minimumOpeningFloat.toString(),
        ) < 0 ||
        comparePaymentCashierDecimals(
          openingFloat,
          counter.maximumOpeningFloat.toString(),
        ) > 0
      )
    ) {
      throw new CashHoldingLimitExceededError();
    }

    if (
      !counter.openingFloatRequired &&
      comparePaymentCashierDecimals(openingFloat, '0') !== 0
    ) {
      throw new CashHoldingLimitExceededError();
    }

    if (
      comparePaymentCashierDecimals(
        openingFloat,
        counter.cashHoldingLimit.toString(),
      ) > 0
    ) {
      throw new CashHoldingLimitExceededError();
    }
  }

  private buildOpenShiftRecord(
    input: Readonly<{
      actor: PaymentCashierActorContext;
      cashierUserId?: string;
      cashierStaffId?: string;
      input: OpenCashierShiftInput;
      transactionId: string;
      operationKey: string;
      shiftNumber: string;
      openedAt: Date;
      reopenedFromShiftId?: string;
      reopenApprovalRequestId?: string;
      reopenReason?: string;
    }>,
  ): Omit<CashierShiftRecord, '_id' | 'createdAt' | 'updatedAt'> {
    const actorUserId = toObjectId(input.actor.userId, 'actor.userId');
    const openingFloat = paymentCashierDecimal128(
      input.input.openingFloat,
      'openingFloat',
    );

    return {
      facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
      transactionId: input.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      operationKey: input.operationKey,
      shiftNumber: input.shiftNumber,
      cashCounterId: toObjectId(input.input.cashCounterId, 'cashCounterId'),
      cashierUserId: toObjectId(
        input.cashierUserId ?? input.actor.userId,
        'cashierUserId',
      ),
      cashierStaffId: toObjectId(
        input.cashierStaffId ?? input.actor.staffId,
        'cashierStaffId',
      ),
      supervisorUserId:
        input.input.supervisorUserId == null
          ? null
          : toObjectId(input.input.supervisorUserId, 'supervisorUserId'),
      currency: input.input.currency ?? 'PKR',
      status: 'OPEN',
      openedAt: input.openedAt,
      openingFloat,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      closingStartedAt: null,
      closingStartedBy: null,
      closedAt: null,
      closedBy: null,
      expectedCash: openingFloat,
      declaredCash: openingFloat,
      cashVariance: paymentCashierDecimal128('0', 'cashVariance'),
      nonCashTotal: paymentCashierDecimal128('0', 'nonCashTotal'),
      paymentMethodTotals: [],
      refundTotal: paymentCashierDecimal128('0', 'refundTotal'),
      reversalTotal: paymentCashierDecimal128('0', 'reversalTotal'),
      depositTotal: paymentCashierDecimal128('0', 'depositTotal'),
      advanceTotal: paymentCashierDecimal128('0', 'advanceTotal'),
      firstReceiptNumber: null,
      lastReceiptNumber: null,
      receiptCount: 0,
      paymentCount: 0,
      notes: normalizeNullablePaymentCashierText(input.input.notes),
      handoverToUserId: null,
      handoverAt: null,
      handoverNotes: null,
      shiftReconciliationId: null,
      closingApprovalRequestId: null,
      varianceApprovalRequestId: null,
      reopenedFromShiftId:
        input.reopenedFromShiftId === undefined
          ? null
          : toObjectId(input.reopenedFromShiftId, 'reopenedFromShiftId'),
      reopenApprovalRequestId:
        input.reopenApprovalRequestId === undefined
          ? null
          : toObjectId(
              input.reopenApprovalRequestId,
              'reopenApprovalRequestId',
            ),
      reopenReason: input.reopenReason ?? null,
    };
  }

  private async requireShift(
    facilityId: string,
    shiftId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord> {
    const shift = await this.dependencies.shifts.findById(
      facilityId,
      shiftId,
      session,
    );

    if (shift === null) {
      throw new CashierShiftNotFoundError();
    }

    return shift;
  }

  private activePolicyLockKey(
    facilityId: string,
    policy: string,
    counterId: string,
    cashierUserId: string,
  ): string {
    return policy === 'CASHIER'
      ? paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.ACTIVE_SHIFT_POLICY,
          facilityId,
          'cashier',
          cashierUserId,
        )
      : policy === 'COUNTER'
        ? paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.ACTIVE_SHIFT_POLICY,
            facilityId,
            'counter',
            counterId,
          )
        : paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.ACTIVE_SHIFT_POLICY,
            facilityId,
            'cashier-counter',
            cashierUserId,
            counterId,
          );
  }

  private async writeAuditAndOutbox(
    actor: PaymentCashierActorContext,
    transactionId: string,
    occurredAt: Date,
    auditAction: string,
    eventType: string,
    shift: CashierShiftView,
    before: CashierShiftView | null,
    after: CashierShiftView,
    reason: string | null,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    await Promise.all([
      this.dependencies.audit.record(
        {
          facilityId: actor.facilityId,
          actorUserId: actor.userId,
          actorStaffId: actor.staffId,
          action: auditAction,
          entityType: 'CashShift',
          entityId: shift.id,
          ...(reason === null ? {} : { reason }),
          before,
          after,
          correlationId: actor.correlationId,
          transactionId,
          ...(actor.ipAddress === undefined
            ? {}
            : { ipAddress: actor.ipAddress }),
          ...(actor.userAgent === undefined
            ? {}
            : { userAgent: actor.userAgent }),
        },
        session,
      ),
      this.dependencies.outbox.publish(
        {
          facilityId: actor.facilityId,
          aggregateType: 'CashShift',
          aggregateId: shift.id,
          eventType,
          payload: {
            shiftId: shift.id,
            shiftNumber: shift.shiftNumber,
            counterId: shift.cashCounterId,
            cashierUserId: shift.cashierUserId,
            status: shift.status,
            version: shift.version,
          },
          correlationId: actor.correlationId,
          transactionId,
          occurredAt,
        },
        session,
      ),
    ]);
  }

  private async publishChanged(
    facilityId: string,
    shift: CashierShiftView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.SHIFT_CHANGED,
      entityId: shift.id,
      counterId: shift.cashCounterId,
      shiftId: shift.id,
      status: shift.status,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }
}