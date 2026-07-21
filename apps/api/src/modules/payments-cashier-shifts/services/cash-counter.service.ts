import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AssignCashCounterUsersInput,
  CashCounterView,
  ChangeCashCounterStatusInput,
  CreateCashCounterInput,
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  UpdateCashCounterInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashHoldingLimitExceededError,
  CashCounterNotFoundError,
  PaymentCashierConcurrencyError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashCounterUpdate,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  projectCashCounter,
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
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  comparePaymentCashierDecimals,
  normalizePaymentCashierText,
  nullablePaymentCashierObjectId,
  paymentCashierDecimal128,
  paymentCashierLockKey,
  paymentCashierObjectId,
} from '../payments-cashier-shifts.normalization.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

export interface CashCounterServiceDependencies {
  repository: PaymentConfigurationRepository;
  shifts: CashierShiftExtendedRepositoryPort;
  accessPolicy: PaymentCashierAccessPolicyPort;
  commandSupport: PaymentCashierCommandSupport;
  audit: PaymentCashierAuditPort;
  outbox: PaymentCashierOutboxPort;
  realtime: PaymentCashierRealtimePort;
  clock: Readonly<{ now(): Date }>;
}

function requireUpdated<T>(value: T | null): T {
  if (value === null) {
    throw new PaymentCashierConcurrencyError();
  }

  return value;
}

export class CashCounterService {
  public constructor(
    private readonly dependencies: CashCounterServiceDependencies,
  ) {}

  public async get(
    actor: PaymentCashierActorContext,
    counterId: string,
  ): Promise<CashCounterView> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_READ',
      resourceFacilityId: actor.facilityId,
      counterId,
    });

    const counter = await this.dependencies.repository.findCounterById(
      actor.facilityId,
      counterId,
    );

    if (counter === null) {
      throw new CashCounterNotFoundError();
    }

    return projectCashCounter(counter);
  }

  public async list(
    actor: PaymentCashierActorContext,
    query: PaymentCashierListQuery,
  ): Promise<PaymentCashierPage<CashCounterView>> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_READ',
      resourceFacilityId: actor.facilityId,
      counterId: query.counterId,
      cashierUserId: query.cashierUserId,
    });

    const page = await this.dependencies.repository.listCounters(
      actor.facilityId,
      query,
    );

    return {
      ...page,
      items: page.items.map(projectCashCounter),
    };
  }

  public async create(
    command: PaymentCashierCommandContext,
    input: CreateCashCounterInput,
  ): Promise<CashCounterView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_MANAGE',
      resourceFacilityId: actor.facilityId,
    });

    this.assertCounterConfiguration({
      openingFloatRequired: input.openingFloatRequired ?? true,
      minimumOpeningFloat: input.minimumOpeningFloat ?? '0',
      maximumOpeningFloat: input.maximumOpeningFloat ?? '0',
      cashHoldingLimit: input.cashHoldingLimit,
    });
    await this.validateReferences(actor.facilityId, input);

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_CASH_COUNTER,
      command,
      payload: input,
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASH_COUNTER,
          actor.facilityId,
          input.counterCode.trim().toUpperCase(),
        ),
      ],
      work: async ({ session, transactionId }) => {
        const occurredAt = this.dependencies.clock.now();
        const created = await this.dependencies.repository.createCounter(
          input,
          {
            facilityId: actor.facilityId,
            actorUserId: actor.userId,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const view = projectCashCounter(created);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_COUNTER',
          entityId: view.id,
          action: 'CREATED',
          occurredAt,
          session,
          statusFrom: null,
          statusTo: 'ACTIVE',
          cashCounterId: view.id,
          metadata: {
            counterCode: view.counterCode,
            counterType: view.counterType,
            departmentId: view.departmentId,
          },
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASH_COUNTER_CREATED,
          PAYMENT_CASHIER_EVENT_TYPES.CASH_COUNTER_CREATED,
          view.id,
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

  public async update(
    command: PaymentCashierCommandContext,
    counterId: string,
    input: UpdateCashCounterInput,
  ): Promise<CashCounterView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_MANAGE',
      resourceFacilityId: actor.facilityId,
      counterId,
    });

    await this.validateReferences(actor.facilityId, input);

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.UPDATE_CASH_COUNTER,
      command,
      payload: { counterId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASH_COUNTER,
          actor.facilityId,
          counterId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const existing = await this.dependencies.repository.findCounterById(
          actor.facilityId,
          counterId,
          session,
        );

        if (existing === null) {
          throw new CashCounterNotFoundError();
        }

        const activeShiftCount = await this.dependencies.shifts.countActiveForCounter(
          actor.facilityId,
          counterId,
          session,
        );

        if (
          activeShiftCount > 0 &&
          this.changesOperationalConfiguration(input)
        ) {
          throw new ConflictError(
            'Counter operational configuration cannot change while a shift is active',
          );
        }

        this.assertCounterConfiguration({
          openingFloatRequired:
            input.openingFloatRequired ?? existing.openingFloatRequired,
          minimumOpeningFloat:
            input.minimumOpeningFloat ?? existing.minimumOpeningFloat.toString(),
          maximumOpeningFloat:
            input.maximumOpeningFloat ?? existing.maximumOpeningFloat.toString(),
          cashHoldingLimit:
            input.cashHoldingLimit ?? existing.cashHoldingLimit.toString(),
        });

        const occurredAt = this.dependencies.clock.now();
        const before = projectCashCounter(existing);
        const updated = requireUpdated(
          await this.dependencies.repository.updateCounterWithMetadata(
            actor.facilityId,
            counterId,
            input.expectedVersion,
            this.buildUpdate(actor, input),
            {
              actorUserId: actor.userId,
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const after = projectCashCounter(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_COUNTER',
          entityId: after.id,
          action: 'UPDATED',
          occurredAt,
          session,
          cashCounterId: after.id,
          metadata: {
            previousVersion: before.version,
            nextVersion: after.version,
          },
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASH_COUNTER_UPDATED,
          PAYMENT_CASHIER_EVENT_TYPES.CASH_COUNTER_UPDATED,
          after.id,
          before,
          after,
          null,
          session,
        );

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async changeStatus(
    command: PaymentCashierCommandContext,
    counterId: string,
    input: ChangeCashCounterStatusInput,
  ): Promise<CashCounterView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_MANAGE',
      resourceFacilityId: actor.facilityId,
      counterId,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CHANGE_CASH_COUNTER_STATUS,
      command,
      payload: { counterId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASH_COUNTER,
          actor.facilityId,
          counterId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const existing = await this.dependencies.repository.findCounterById(
          actor.facilityId,
          counterId,
          session,
        );

        if (existing === null) {
          throw new CashCounterNotFoundError();
        }

        if (existing.active === input.active) {
          return projectCashCounter(existing);
        }

        if (
          !input.active &&
          (await this.dependencies.shifts.countActiveForCounter(
            actor.facilityId,
            counterId,
            session,
          )) > 0
        ) {
          throw new ConflictError(
            'A cash counter cannot be deactivated while it has an active shift',
          );
        }

        const occurredAt = this.dependencies.clock.now();
        const before = projectCashCounter(existing);
        const updated = requireUpdated(
          await this.dependencies.repository.updateCounterWithMetadata(
            actor.facilityId,
            counterId,
            input.expectedVersion,
            {
              active: input.active,
              deactivatedAt: input.active ? null : occurredAt,
              deactivatedBy: input.active
                ? null
                : toObjectId(actor.userId, 'actor.userId'),
              deactivationReason: input.active
                ? null
                : normalizePaymentCashierText(input.reason),
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
        const after = projectCashCounter(updated);
        const action = input.active ? 'ACTIVATED' : 'DEACTIVATED';

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_COUNTER',
          entityId: after.id,
          action,
          occurredAt,
          session,
          statusFrom: before.active ? 'ACTIVE' : 'INACTIVE',
          statusTo: after.active ? 'ACTIVE' : 'INACTIVE',
          reason: input.reason,
          cashCounterId: after.id,
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          input.active
            ? PAYMENT_CASHIER_AUDIT_ACTIONS.CASH_COUNTER_ACTIVATED
            : PAYMENT_CASHIER_AUDIT_ACTIONS.CASH_COUNTER_DEACTIVATED,
          PAYMENT_CASHIER_EVENT_TYPES.CASH_COUNTER_STATUS_CHANGED,
          after.id,
          before,
          after,
          input.reason,
          session,
        );

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async assignUsers(
    command: PaymentCashierCommandContext,
    counterId: string,
    input: AssignCashCounterUsersInput,
  ): Promise<CashCounterView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'COUNTER_ASSIGN',
      resourceFacilityId: actor.facilityId,
      counterId,
    });

    if (
      !(await this.dependencies.repository.activeUsersExist(
        actor.facilityId,
        input.assignedUserIds,
      ))
    ) {
      throw new CashCounterNotFoundError();
    }

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.ASSIGN_CASH_COUNTER_USERS,
      command,
      payload: { counterId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASH_COUNTER,
          actor.facilityId,
          counterId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const existing = await this.dependencies.repository.findCounterById(
          actor.facilityId,
          counterId,
          session,
        );

        if (existing === null) {
          throw new CashCounterNotFoundError();
        }

        const activeCashierIds = new Set(
          existing.assignedUserIds.map((id) => id.toHexString()),
        );
        const removedUsers = [...activeCashierIds].filter(
          (userId) => !input.assignedUserIds.includes(userId),
        );

        if (removedUsers.length > 0) {
          for (const userId of removedUsers) {
            if (
              (await this.dependencies.shifts.countActiveForCashier(
                actor.facilityId,
                userId,
                session,
              )) > 0
            ) {
              throw new ConflictError(
                'A cashier with an active shift cannot be removed from the counter',
              );
            }
          }
        }

        const occurredAt = this.dependencies.clock.now();
        const before = projectCashCounter(existing);
        const updated = requireUpdated(
          await this.dependencies.repository.updateCounterWithMetadata(
            actor.facilityId,
            counterId,
            input.expectedVersion,
            {
              assignedUserIds: input.assignedUserIds.map((userId) =>
                paymentCashierObjectId(userId, 'assignedUserIds'),
              ),
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
        const after = projectCashCounter(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'CASH_COUNTER',
          entityId: after.id,
          action: 'UPDATED',
          occurredAt,
          session,
          reason: input.reason,
          cashCounterId: after.id,
          metadata: {
            assignedUserIds: after.assignedUserIds,
          },
        });

        await this.writeAuditAndOutbox(
          actor,
          transactionId,
          occurredAt,
          PAYMENT_CASHIER_AUDIT_ACTIONS.CASH_COUNTER_USERS_ASSIGNED,
          PAYMENT_CASHIER_EVENT_TYPES.CASH_COUNTER_USERS_ASSIGNED,
          after.id,
          before,
          after,
          input.reason,
          session,
        );

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  private assertCounterConfiguration(
    input: Readonly<{
      openingFloatRequired: boolean;
      minimumOpeningFloat: string;
      maximumOpeningFloat: string;
      cashHoldingLimit: string;
    }>,
  ): void {
    if (
      comparePaymentCashierDecimals(
        input.minimumOpeningFloat,
        input.maximumOpeningFloat,
      ) > 0
    ) {
      throw new CashHoldingLimitExceededError();
    }

    if (
      !input.openingFloatRequired &&
      (
        comparePaymentCashierDecimals(input.minimumOpeningFloat, '0') !== 0 ||
        comparePaymentCashierDecimals(input.maximumOpeningFloat, '0') !== 0
      )
    ) {
      throw new CashHoldingLimitExceededError();
    }

    if (
      comparePaymentCashierDecimals(
        input.maximumOpeningFloat,
        input.cashHoldingLimit,
      ) > 0
    ) {
      throw new CashHoldingLimitExceededError();
    }
  }

  private async validateReferences(
    facilityId: string,
    input: Readonly<{
      departmentId?: string | null;
      assignedUserIds?: readonly string[];
      allowedPaymentMethodConfigurationIds?: readonly string[];
      currency?: string;
    }>,
  ): Promise<void> {
    if (
      input.departmentId != null &&
      !(await this.dependencies.repository.departmentExists(
        facilityId,
        input.departmentId,
      ))
    ) {
      throw new CashCounterNotFoundError();
    }

    if (
      input.assignedUserIds !== undefined &&
      !(await this.dependencies.repository.activeUsersExist(
        facilityId,
        input.assignedUserIds,
      ))
    ) {
      throw new CashCounterNotFoundError();
    }

    if (
      input.allowedPaymentMethodConfigurationIds !== undefined &&
      !(await this.dependencies.repository.activePaymentMethodsExist(
        facilityId,
        input.allowedPaymentMethodConfigurationIds,
        input.currency ?? 'PKR',
      ))
    ) {
      throw new CashCounterNotFoundError();
    }
  }

  private changesOperationalConfiguration(
    input: UpdateCashCounterInput,
  ): boolean {
    return (
      input.counterType !== undefined ||
      input.departmentId !== undefined ||
      input.assignedUserIds !== undefined ||
      input.allowedPaymentMethodConfigurationIds !== undefined ||
      input.currency !== undefined ||
      input.cashHoldingLimit !== undefined ||
      input.openingFloatRequired !== undefined ||
      input.minimumOpeningFloat !== undefined ||
      input.maximumOpeningFloat !== undefined ||
      input.activeShiftPolicy !== undefined ||
      input.negativeExpectedCashAllowed !== undefined
    );
  }

  private buildUpdate(
    actor: PaymentCashierActorContext,
    input: UpdateCashCounterInput,
  ): CashCounterUpdate {
    const update: Record<string, unknown> = {
      ...(input.name === undefined
        ? {}
        : { name: normalizePaymentCashierText(input.name) }),
      ...(input.location === undefined
        ? {}
        : { location: normalizePaymentCashierText(input.location) }),
      ...(input.departmentId === undefined
        ? {}
        : {
            departmentId: nullablePaymentCashierObjectId(
              input.departmentId,
              'departmentId',
            ),
          }),
      ...(input.counterType === undefined
        ? {}
        : { counterType: input.counterType }),
      ...(input.assignedUserIds === undefined
        ? {}
        : {
            assignedUserIds: input.assignedUserIds.map((userId) =>
              paymentCashierObjectId(userId, 'assignedUserIds'),
            ),
          }),
      ...(input.allowedPaymentMethodConfigurationIds === undefined
        ? {}
        : {
            allowedPaymentMethodConfigurationIds:
              input.allowedPaymentMethodConfigurationIds.map((methodId) =>
                paymentCashierObjectId(
                  methodId,
                  'allowedPaymentMethodConfigurationIds',
                ),
              ),
          }),
      ...(input.currency === undefined
        ? {}
        : { currency: input.currency }),
      ...(input.cashHoldingLimit === undefined
        ? {}
        : {
            cashHoldingLimit: paymentCashierDecimal128(
              input.cashHoldingLimit,
              'cashHoldingLimit',
            ),
          }),
      ...(input.openingFloatRequired === undefined
        ? {}
        : { openingFloatRequired: input.openingFloatRequired }),
      ...(input.minimumOpeningFloat === undefined
        ? {}
        : {
            minimumOpeningFloat: paymentCashierDecimal128(
              input.minimumOpeningFloat,
              'minimumOpeningFloat',
            ),
          }),
      ...(input.maximumOpeningFloat === undefined
        ? {}
        : {
            maximumOpeningFloat: paymentCashierDecimal128(
              input.maximumOpeningFloat,
              'maximumOpeningFloat',
            ),
          }),
      ...(input.activeShiftPolicy === undefined
        ? {}
        : { activeShiftPolicy: input.activeShiftPolicy }),
      ...(input.supervisorApprovalRequiredForClose === undefined
        ? {}
        : {
            supervisorApprovalRequiredForClose:
              input.supervisorApprovalRequiredForClose,
          }),
      ...(input.negativeExpectedCashAllowed === undefined
        ? {}
        : {
            negativeExpectedCashAllowed: input.negativeExpectedCashAllowed,
          }),
      updatedBy: toObjectId(actor.userId, 'actor.userId'),
    };

    return update as CashCounterUpdate;
  }

  private async writeAuditAndOutbox(
    actor: PaymentCashierActorContext,
    transactionId: string,
    occurredAt: Date,
    auditAction: string,
    eventType: string,
    counterId: string,
    before: CashCounterView | null,
    after: CashCounterView,
    reason: string | null,
    session: Parameters<PaymentCashierAuditPort['record']>[1],
  ): Promise<void> {
    await Promise.all([
      this.dependencies.audit.record(
        {
          facilityId: actor.facilityId,
          actorUserId: actor.userId,
          actorStaffId: actor.staffId,
          action: auditAction,
          entityType: 'CashCounter',
          entityId: counterId,
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
          aggregateType: 'CashCounter',
          aggregateId: counterId,
          eventType,
          payload: {
            counterId,
            counterCode: after.counterCode,
            active: after.active,
            version: after.version,
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
    counter: CashCounterView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.COUNTER_CHANGED,
      entityId: counter.id,
      counterId: counter.id,
      status: counter.active ? 'ACTIVE' : 'INACTIVE',
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }
}