import {
  BadRequestError,
} from '@hospital-mis/shared';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ChangePaymentMethodStatusInput,
  CreatePaymentMethodConfigurationInput,
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  PaymentMethodConfigurationView,
  UpdatePaymentMethodConfigurationInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentCashierConcurrencyError,
  PaymentMethodConfigurationNotFoundError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
} from '../payments-cashier-shifts.ports.js';

import {
  projectPaymentMethodConfiguration,
} from '../payments-cashier-shifts.projections.js';

import type {
  PaymentMethodConfigurationUpdate,
} from '../payments-cashier-shifts.persistence.types.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import {
  PAYMENT_CASHIER_AUDIT_ACTIONS,
  PAYMENT_CASHIER_EVENT_TYPES,
  PAYMENT_CASHIER_LOCK_NAMESPACES,
  PAYMENT_CASHIER_REALTIME_EVENTS,
  PAYMENT_CASHIER_TRANSACTION_TYPES,
} from '../payments-cashier-shifts.operations.js';

import {
  normalizeNullablePaymentCashierText,
  normalizePaymentCashierCode,
  normalizePaymentCashierText,
  nullablePaymentCashierObjectId,
  paymentCashierDate,
  paymentCashierLockKey,
} from '../payments-cashier-shifts.normalization.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

export interface PaymentMethodConfigurationServiceDependencies {
  repository: PaymentConfigurationRepository;
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

export class PaymentMethodConfigurationService {
  public constructor(
    private readonly dependencies:
      PaymentMethodConfigurationServiceDependencies,
  ) {}

  public async get(
    actor: PaymentCashierActorContext,
    paymentMethodConfigurationId: string,
  ): Promise<PaymentMethodConfigurationView> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_METHOD_READ',
      resourceFacilityId: actor.facilityId,
    });

    const record = await this.dependencies.repository.findPaymentMethodById(
      actor.facilityId,
      paymentMethodConfigurationId,
    );

    if (record === null) {
      throw new PaymentMethodConfigurationNotFoundError();
    }

    return projectPaymentMethodConfiguration(record);
  }

  public async list(
    actor: PaymentCashierActorContext,
    query: PaymentCashierListQuery,
  ): Promise<PaymentCashierPage<PaymentMethodConfigurationView>> {
    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_METHOD_READ',
      resourceFacilityId: actor.facilityId,
    });

    const page = await this.dependencies.repository.listPaymentMethods(
      actor.facilityId,
      query,
    );

    return {
      ...page,
      items: page.items.map(projectPaymentMethodConfiguration),
    };
  }

  public async create(
    command: PaymentCashierCommandContext,
    input: CreatePaymentMethodConfigurationInput,
  ): Promise<PaymentMethodConfigurationView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_METHOD_MANAGE',
      resourceFacilityId: actor.facilityId,
    });

    this.assertConfigurationInvariants(input);
    await this.requireLedgerAccounts(actor.facilityId, input);

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_PAYMENT_METHOD,
      command,
      payload: input,
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_METHOD,
          actor.facilityId,
          normalizePaymentCashierCode(input.code),
        ),
      ],
      work: async ({ session, transactionId }) => {
        const occurredAt = this.dependencies.clock.now();
        const created = await this.dependencies.repository.createPaymentMethod(
          input,
          {
            facilityId: actor.facilityId,
            actorUserId: actor.userId,
            transactionId,
            correlationId: actor.correlationId,
          },
          session,
        );
        const view = projectPaymentMethodConfiguration(created);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_METHOD_CONFIGURATION',
          entityId: view.id,
          action: 'CREATED',
          occurredAt,
          session,
          statusFrom: null,
          statusTo: 'ACTIVE',
          paymentMethodConfigurationId: view.id,
          metadata: {
            code: view.code,
            methodCode: view.methodCode,
            methodKind: view.methodKind,
          },
        });

        await Promise.all([
          this.dependencies.audit.record(
            {
              facilityId: actor.facilityId,
              actorUserId: actor.userId,
              actorStaffId: actor.staffId,
              action: PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_METHOD_CREATED,
              entityType: 'PaymentMethodConfiguration',
              entityId: view.id,
              before: null,
              after: view,
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
              aggregateType: 'PaymentMethodConfiguration',
              aggregateId: view.id,
              eventType: PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_METHOD_CREATED,
              payload: {
                paymentMethodConfigurationId: view.id,
                code: view.code,
                active: view.active,
              },
              correlationId: actor.correlationId,
              transactionId,
              occurredAt,
            },
            session,
          ),
        ]);

        return view;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async update(
    command: PaymentCashierCommandContext,
    paymentMethodConfigurationId: string,
    input: UpdatePaymentMethodConfigurationInput,
  ): Promise<PaymentMethodConfigurationView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_METHOD_MANAGE',
      resourceFacilityId: actor.facilityId,
    });

    await this.requireLedgerAccounts(actor.facilityId, input);

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.UPDATE_PAYMENT_METHOD,
      command,
      payload: { paymentMethodConfigurationId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_METHOD,
          actor.facilityId,
          paymentMethodConfigurationId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const existing = await this.dependencies.repository.findPaymentMethodById(
          actor.facilityId,
          paymentMethodConfigurationId,
          session,
        );

        if (existing === null) {
          throw new PaymentMethodConfigurationNotFoundError();
        }

        this.assertConfigurationInvariants({
          methodKind: input.methodKind ?? existing.methodKind,
          cashEquivalent: input.cashEquivalent ?? existing.cashEquivalent,
          settlementMode: input.settlementMode ?? existing.settlementMode,
          settlementDelayHours:
            input.settlementDelayHours === undefined
              ? existing.settlementDelayHours
              : input.settlementDelayHours,
          cardReferenceRequired:
            input.cardReferenceRequired ?? existing.cardReferenceRequired,
          bankReferenceRequired:
            input.bankReferenceRequired ?? existing.bankReferenceRequired,
          effectiveFrom:
            input.effectiveFrom ?? existing.effectiveFrom.toISOString(),
          effectiveThrough:
            input.effectiveThrough === undefined
              ? existing.effectiveThrough?.toISOString() ?? null
              : input.effectiveThrough,
        });

        const occurredAt = this.dependencies.clock.now();
        const before = projectPaymentMethodConfiguration(existing);
        const update = this.buildUpdate(actor, input);
        const updated = requireUpdated(
          await this.dependencies.repository.updatePaymentMethodWithMetadata(
            actor.facilityId,
            paymentMethodConfigurationId,
            input.expectedVersion,
            update,
            {
              actorUserId: actor.userId,
              transactionId,
              correlationId: actor.correlationId,
            },
            session,
          ),
        );
        const after = projectPaymentMethodConfiguration(updated);

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_METHOD_CONFIGURATION',
          entityId: after.id,
          action: 'UPDATED',
          occurredAt,
          session,
          paymentMethodConfigurationId: after.id,
          metadata: {
            previousVersion: before.version,
            nextVersion: after.version,
          },
        });

        await Promise.all([
          this.dependencies.audit.record(
            {
              facilityId: actor.facilityId,
              actorUserId: actor.userId,
              actorStaffId: actor.staffId,
              action: PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_METHOD_UPDATED,
              entityType: 'PaymentMethodConfiguration',
              entityId: after.id,
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
              aggregateType: 'PaymentMethodConfiguration',
              aggregateId: after.id,
              eventType: PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_METHOD_UPDATED,
              payload: {
                paymentMethodConfigurationId: after.id,
                code: after.code,
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

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  public async changeStatus(
    command: PaymentCashierCommandContext,
    paymentMethodConfigurationId: string,
    input: ChangePaymentMethodStatusInput,
  ): Promise<PaymentMethodConfigurationView> {
    const { actor } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action: 'PAYMENT_METHOD_MANAGE',
      resourceFacilityId: actor.facilityId,
    });

    const result = await this.dependencies.commandSupport.execute({
      operation: PAYMENT_CASHIER_TRANSACTION_TYPES.CHANGE_PAYMENT_METHOD_STATUS,
      command,
      payload: { paymentMethodConfigurationId, ...input },
      lockKeys: [
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_METHOD,
          actor.facilityId,
          paymentMethodConfigurationId,
        ),
      ],
      work: async ({ session, transactionId }) => {
        const existing = await this.dependencies.repository.findPaymentMethodById(
          actor.facilityId,
          paymentMethodConfigurationId,
          session,
        );

        if (existing === null) {
          throw new PaymentMethodConfigurationNotFoundError();
        }

        if (existing.active === input.active) {
          return projectPaymentMethodConfiguration(existing);
        }

        const occurredAt = this.dependencies.clock.now();
        const before = projectPaymentMethodConfiguration(existing);
        const updated = requireUpdated(
          await this.dependencies.repository.updatePaymentMethodWithMetadata(
            actor.facilityId,
            paymentMethodConfigurationId,
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
        const after = projectPaymentMethodConfiguration(updated);
        const action = input.active ? 'ACTIVATED' : 'DEACTIVATED';

        await this.dependencies.commandSupport.appendHistory({
          actor,
          transactionId,
          entityType: 'PAYMENT_METHOD_CONFIGURATION',
          entityId: after.id,
          action,
          occurredAt,
          session,
          statusFrom: before.active ? 'ACTIVE' : 'INACTIVE',
          statusTo: after.active ? 'ACTIVE' : 'INACTIVE',
          reason: input.reason,
          paymentMethodConfigurationId: after.id,
        });

        await Promise.all([
          this.dependencies.audit.record(
            {
              facilityId: actor.facilityId,
              actorUserId: actor.userId,
              actorStaffId: actor.staffId,
              action: input.active
                ? PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_METHOD_ACTIVATED
                : PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_METHOD_DEACTIVATED,
              entityType: 'PaymentMethodConfiguration',
              entityId: after.id,
              reason: input.reason,
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
              aggregateType: 'PaymentMethodConfiguration',
              aggregateId: after.id,
              eventType:
                PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_METHOD_STATUS_CHANGED,
              payload: {
                paymentMethodConfigurationId: after.id,
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

        return after;
      },
    });

    await this.publishChanged(actor.facilityId, result);
    return result;
  }

  private assertConfigurationInvariants(
    input: Readonly<{
      methodKind?: string;
      cashEquivalent?: boolean;
      settlementMode?: string;
      settlementDelayHours?: number | null;
      cardReferenceRequired?: boolean;
      bankReferenceRequired?: boolean;
      effectiveFrom?: string;
      effectiveThrough?: string | null;
    }>,
  ): void {
    if (
      input.effectiveFrom !== undefined &&
      input.effectiveThrough != null &&
      new Date(input.effectiveThrough).getTime() <
        new Date(input.effectiveFrom).getTime()
    ) {
      throw new BadRequestError(
        'Payment-method effective-through cannot precede effective-from',
      );
    }

    if (
      input.settlementMode === 'DELAYED' &&
      input.settlementDelayHours == null
    ) {
      throw new BadRequestError(
        'Delayed payment methods require a settlement delay',
      );
    }

    if (
      input.settlementMode !== undefined &&
      input.settlementMode !== 'DELAYED' &&
      input.settlementDelayHours != null
    ) {
      throw new BadRequestError(
        'Settlement delay is only valid for delayed methods',
      );
    }

    if (
      input.methodKind === 'CASH' &&
      (input.cashEquivalent !== true || input.settlementMode !== 'IMMEDIATE')
    ) {
      throw new BadRequestError(
        'Cash methods must be cash-equivalent and settle immediately',
      );
    }

    if (
      input.cardReferenceRequired === true &&
      input.methodKind !== 'CARD'
    ) {
      throw new BadRequestError(
        'Card-reference requirements are limited to card methods',
      );
    }

    if (
      input.bankReferenceRequired === true &&
      input.methodKind !== 'BANK'
    ) {
      throw new BadRequestError(
        'Bank-reference requirements are limited to bank methods',
      );
    }
  }

  private buildUpdate(
    actor: PaymentCashierActorContext,
    input: UpdatePaymentMethodConfigurationInput,
  ): PaymentMethodConfigurationUpdate {
    return {
      ...(input.name === undefined
        ? {}
        : { name: normalizePaymentCashierText(input.name) }),
      ...(input.description === undefined
        ? {}
        : {
            description: normalizeNullablePaymentCashierText(
              input.description,
            ),
          }),
      ...(input.methodKind === undefined
        ? {}
        : { methodKind: input.methodKind }),
      ...(input.effectiveFrom === undefined
        ? {}
        : {
            effectiveFrom: paymentCashierDate(
              input.effectiveFrom,
              'effectiveFrom',
            ),
          }),
      ...(input.effectiveThrough === undefined
        ? {}
        : {
            effectiveThrough:
              input.effectiveThrough === null
                ? null
                : paymentCashierDate(
                    input.effectiveThrough,
                    'effectiveThrough',
                  ),
          }),
      ...(input.allowedCurrencies === undefined
        ? {}
        : { allowedCurrencies: [...input.allowedCurrencies] }),
      ...(input.externalReferenceRequired === undefined
        ? {}
        : { externalReferenceRequired: input.externalReferenceRequired }),
      ...(input.bankReferenceRequired === undefined
        ? {}
        : { bankReferenceRequired: input.bankReferenceRequired }),
      ...(input.cardReferenceRequired === undefined
        ? {}
        : { cardReferenceRequired: input.cardReferenceRequired }),
      ...(input.cashEquivalent === undefined
        ? {}
        : { cashEquivalent: input.cashEquivalent }),
      ...(input.refundEligible === undefined
        ? {}
        : { refundEligible: input.refundEligible }),
      ...(input.reversalEligible === undefined
        ? {}
        : { reversalEligible: input.reversalEligible }),
      ...(input.settlementMode === undefined
        ? {}
        : { settlementMode: input.settlementMode }),
      ...(input.settlementDelayHours === undefined
        ? {}
        : { settlementDelayHours: input.settlementDelayHours }),
      ...(input.permissionCodes === undefined
        ? {}
        : { permissionCodes: [...input.permissionCodes] }),
      ...(input.cashLedgerAccountId === undefined
        ? {}
        : {
            cashLedgerAccountId: nullablePaymentCashierObjectId(
              input.cashLedgerAccountId,
              'cashLedgerAccountId',
            ),
          }),
      ...(input.clearingLedgerAccountId === undefined
        ? {}
        : {
            clearingLedgerAccountId: nullablePaymentCashierObjectId(
              input.clearingLedgerAccountId,
              'clearingLedgerAccountId',
            ),
          }),
      ...(input.receivableLedgerAccountId === undefined
        ? {}
        : {
            receivableLedgerAccountId: nullablePaymentCashierObjectId(
              input.receivableLedgerAccountId,
              'receivableLedgerAccountId',
            ),
          }),
      ...(input.externalProviderCode === undefined
        ? {}
        : {
            externalProviderCode:
              input.externalProviderCode === null
                ? null
                : normalizePaymentCashierCode(input.externalProviderCode),
          }),
      ...(input.requiresOpenCashierShift === undefined
        ? {}
        : { requiresOpenCashierShift: input.requiresOpenCashierShift }),
      updatedBy: toObjectId(actor.userId, 'actor.userId'),
    };
  }

  private async requireLedgerAccounts(
    facilityId: string,
    input: Readonly<{
      cashLedgerAccountId?: string | null;
      clearingLedgerAccountId?: string | null;
      receivableLedgerAccountId?: string | null;
    }>,
  ): Promise<void> {
    const ids = [
      input.cashLedgerAccountId,
      input.clearingLedgerAccountId,
      input.receivableLedgerAccountId,
    ].filter((value): value is string => value != null);

    if (
      !(await this.dependencies.repository.ledgerAccountsExist(
        facilityId,
        ids,
      ))
    ) {
      throw new PaymentMethodConfigurationNotFoundError();
    }
  }

  private async publishChanged(
    facilityId: string,
    view: PaymentMethodConfigurationView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType: PAYMENT_CASHIER_REALTIME_EVENTS.CONFIGURATION_CHANGED,
      entityId: view.id,
      status: view.active ? 'ACTIVE' : 'INACTIVE',
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
  }
}