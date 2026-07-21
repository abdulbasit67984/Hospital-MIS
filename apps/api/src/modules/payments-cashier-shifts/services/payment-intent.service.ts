import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AuthorizePaymentIntentInput,
  CancelPaymentIntentInput,
  CreatePaymentIntentInput,
  PaymentCashierActorContext,
  PaymentIntentView,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashCounterInactiveError,
  CashCounterNotFoundError,
  CashierShiftNotFoundError,
  CashierShiftNotOpenError,
  PaymentCashierConcurrencyError,
  PaymentIntentExpiredError,
  PaymentIntentNotFoundError,
  PaymentIntentStateError,
  PaymentMethodCurrencyError,
  PaymentMethodReferenceRequiredError,
  PaymentOutstandingBalanceError,
  PaymentMethodInactiveError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
} from '../payments-cashier-shifts.ports.js';

import {
  projectPaymentIntent,
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
  normalizeNullablePaymentCashierText,
  paymentCashierLockKey,
} from '../payments-cashier-shifts.normalization.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import type {
  CashierShiftExtendedRepositoryPort,
} from '../repositories/cashier-shift.repository.js';

import type {
  PaymentFinancialRepositoryPort,
} from '../repositories/payment-finance.repository.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

import type {
  MongoUnifiedBillingPaymentsAdapter,
} from './unified-billing-payments.adapter.js';

const DEFAULT_INTENT_TTL_MINUTES = 30;

function paymentMethodValue(
  code: string,
): string {
  return code;
}

export interface PaymentIntentServiceDependencies {
  payments:
    PaymentFinancialRepositoryPort;
  configuration:
    PaymentConfigurationRepository;
  shifts:
    CashierShiftExtendedRepositoryPort;
  billing:
    MongoUnifiedBillingPaymentsAdapter;
  accessPolicy:
    PaymentCashierAccessPolicyPort;
  commandSupport:
    PaymentCashierCommandSupport;
  sequences:
    PaymentCashierSequencePort;
  audit:
    PaymentCashierAuditPort;
  outbox:
    PaymentCashierOutboxPort;
  realtime:
    PaymentCashierRealtimePort;
  clock:
    Readonly<{
      now(): Date;
    }>;
}

export class PaymentIntentService {
  public constructor(
    private readonly dependencies:
      PaymentIntentServiceDependencies,
  ) {}

  public async get(
    actor:
      PaymentCashierActorContext,
    intentId:
      string,
  ): Promise<PaymentIntentView> {
    const intent =
      await this.dependencies.payments.findIntentById(
        actor.facilityId,
        intentId,
      );

    if (intent === null) {
      throw new PaymentIntentNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'PAYMENT_READ',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        intent.cashCounterId?.toHexString() ??
        null,
      cashierUserId:
        null,
    });

    return projectPaymentIntent(
      intent,
    );
  }

  public async create(
    command:
      PaymentCashierCommandContext,
    input:
      CreatePaymentIntentInput,
  ): Promise<PaymentIntentView> {
    const {
      actor,
    } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'PAYMENT_INTENT_CREATE',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        input.cashCounterId ??
        null,
      cashierUserId:
        actor.userId,
    });

    const lockKeys = [
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
        actor.facilityId,
        input.patientAccountId,
      ),
    ];

    if (input.cashShiftId != null) {
      lockKeys.push(
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
          actor.facilityId,
          input.cashShiftId,
        ),
      );
    }

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_PAYMENT_INTENT,
        command,
        payload:
          input,
        lockKeys,
        work: async ({
          session,
          transactionId,
          operationKey,
        }) => {
          const now =
            this.dependencies.clock.now();
          const account =
            await this.dependencies.billing.resolvePatientAccount(
              actor.facilityId,
              input.patientAccountId,
              session,
            );

          if (account === null) {
            throw new PaymentIntentStateError(
              'The patient account was not found',
            );
          }

          if (input.invoiceId != null) {
            const invoice =
              await this.dependencies.billing.resolveInvoice(
                actor.facilityId,
                input.invoiceId,
                session,
              );

            if (
              invoice === null ||
              invoice.patientAccountId.toHexString() !==
                input.patientAccountId ||
              ![
                'FINALIZED',
                'PARTIALLY_PAID',
              ].includes(
                invoice.status,
              )
            ) {
              throw new PaymentIntentStateError(
                'The invoice is not eligible for a payment intent',
              );
            }

            if (
              input.purpose === 'INVOICE_PAYMENT' &&
              new Decimal(
                input.amount,
              ).greaterThan(
                invoice.outstandingAmount.toString(),
              )
            ) {
              throw new PaymentOutstandingBalanceError();
            }
          }

          const method =
            await this.dependencies.configuration.findPaymentMethodById(
              actor.facilityId,
              input.paymentMethodConfigurationId,
              session,
            );

          if (
            method === null ||
            !method.active ||
            method.effectiveFrom.getTime() >
              now.getTime() ||
            (
              method.effectiveThrough !== null &&
              method.effectiveThrough.getTime() <
                now.getTime()
            )
          ) {
            throw new PaymentMethodInactiveError();
          }

          const currency =
            input.currency ??
            account.currency;

          if (
            currency !== account.currency ||
            !method.allowedCurrencies.includes(
              currency,
            )
          ) {
            throw new PaymentMethodCurrencyError();
          }

          if (method.requiresOpenCashierShift) {
            if (
              input.cashCounterId == null ||
              input.cashShiftId == null
            ) {
              throw new CashierShiftNotOpenError();
            }

            const [counter, shift] =
              await Promise.all([
                this.dependencies.configuration.findCounterById(
                  actor.facilityId,
                  input.cashCounterId,
                  session,
                ),
                this.dependencies.shifts.findById(
                  actor.facilityId,
                  input.cashShiftId,
                  session,
                ),
              ]);

            if (counter === null) {
              throw new CashCounterNotFoundError();
            }

            if (!counter.active) {
              throw new CashCounterInactiveError();
            }

            if (shift === null) {
              throw new CashierShiftNotFoundError();
            }

            if (
              shift.status !== 'OPEN' ||
              shift.cashCounterId.toHexString() !==
                input.cashCounterId ||
              shift.cashierUserId.toHexString() !==
                actor.userId
            ) {
              throw new CashierShiftNotOpenError();
            }
          }

          const intentNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.PAYMENT_INTENT,
              now,
              session,
            );
          const expiresAt =
            new Date(
              now.getTime() +
                (
                  input.expiresInMinutes ??
                  DEFAULT_INTENT_TTL_MINUTES
                ) *
                  60_000,
            );
          const created =
            await this.dependencies.payments.createIntent(
              actor.facilityId,
              input,
              {
                operationKey,
                intentNumber,
                patientId:
                  account.patientId.toHexString(),
                paymentMethod:
                  paymentMethodValue(
                    method.methodCode,
                  ),
                cashierStaffId:
                  actor.staffId,
                expiresAt,
                externalReference:
                  normalizeNullablePaymentCashierText(
                    input.externalReference,
                  ),
                actorUserId:
                  actor.userId,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const view =
            projectPaymentIntent(
              created,
            );

          await this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType:
              'PAYMENT_INTENT',
            entityId:
              view.id,
            action:
              'CREATED',
            occurredAt:
              now,
            session,
            statusFrom:
              null,
            statusTo:
              view.status,
            amount:
              view.amount,
            currency:
              view.currency,
            cashCounterId:
              input.cashCounterId,
            cashShiftId:
              input.cashShiftId,
            paymentMethodConfigurationId:
              input.paymentMethodConfigurationId,
            patientId:
              view.patientId,
            patientAccountId:
              view.patientAccountId,
            invoiceId:
              view.invoiceId,
            metadata: {
              intentNumber:
                view.intentNumber,
              purpose:
                input.purpose,
              expiresAt:
                view.expiresAt,
            },
          });

          await Promise.all([
            this.dependencies.audit.record(
              {
                facilityId:
                  actor.facilityId,
                actorUserId:
                  actor.userId,
                actorStaffId:
                  actor.staffId,
                action:
                  PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_INTENT_CREATED,
                entityType:
                  'PAYMENT_INTENT',
                entityId:
                  view.id,
                after: {
                  intentNumber:
                    view.intentNumber,
                  status:
                    view.status,
                  amount:
                    view.amount,
                  currency:
                    view.currency,
                },
                correlationId:
                  actor.correlationId,
                transactionId,
                ipAddress:
                  actor.ipAddress,
                userAgent:
                  actor.userAgent,
              },
              session,
            ),
            this.dependencies.outbox.publish(
              {
                facilityId:
                  actor.facilityId,
                aggregateType:
                  'PAYMENT_INTENT',
                aggregateId:
                  view.id,
                eventType:
                  PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_INTENT_CREATED,
                payload: {
                  intentId:
                    view.id,
                  status:
                    view.status,
                  counterId:
                    input.cashCounterId ??
                    null,
                  shiftId:
                    input.cashShiftId ??
                    null,
                },
                correlationId:
                  actor.correlationId,
                transactionId,
                occurredAt:
                  now,
              },
              session,
            ),
          ]);

          return view;
        },
      });

    await this.publish(
      actor.facilityId,
      result,
    );

    return result;
  }

  public async authorize(
    command:
      PaymentCashierCommandContext,
    intentId:
      string,
    input:
      AuthorizePaymentIntentInput,
  ): Promise<PaymentIntentView> {
    return this.transition(
      command,
      intentId,
      input.expectedVersion,
      'AUTHORIZED',
      input.externalReference,
      input.authorizedAt,
      null,
    );
  }

  public async cancel(
    command:
      PaymentCashierCommandContext,
    intentId:
      string,
    input:
      CancelPaymentIntentInput,
  ): Promise<PaymentIntentView> {
    return this.transition(
      command,
      intentId,
      input.expectedVersion,
      'CANCELLED',
      null,
      null,
      input.reason,
    );
  }

  private async transition(
    command:
      PaymentCashierCommandContext,
    intentId:
      string,
    expectedVersion:
      number,
    nextStatus:
      'AUTHORIZED' | 'CANCELLED',
    externalReference:
      string | null,
    authorizedAt:
      string | null,
    reason:
      string | null,
  ): Promise<PaymentIntentView> {
    const {
      actor,
    } = command;
    const existing =
      await this.dependencies.payments.findIntentById(
        actor.facilityId,
        intentId,
      );

    if (existing === null) {
      throw new PaymentIntentNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        nextStatus === 'CANCELLED'
          ? 'PAYMENT_INTENT_CANCEL'
          : 'PAYMENT_COLLECT_NON_CASH',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        existing.cashCounterId?.toHexString() ??
        null,
      cashierUserId:
        actor.userId,
    });

    const operation =
      nextStatus === 'CANCELLED'
        ? PAYMENT_CASHIER_TRANSACTION_TYPES.CANCEL_PAYMENT_INTENT
        : PAYMENT_CASHIER_TRANSACTION_TYPES.AUTHORIZE_PAYMENT_INTENT;

    const result =
      await this.dependencies.commandSupport.execute({
        operation,
        command,
        payload: {
          intentId,
          expectedVersion,
          nextStatus,
          externalReference,
          authorizedAt,
          reason,
        },
        lockKeys: [
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_INTENT,
            actor.facilityId,
            intentId,
          ),
        ],
        work: async ({
          session,
          transactionId,
        }) => {
          const current =
            await this.dependencies.payments.findIntentById(
              actor.facilityId,
              intentId,
              session,
            );

          if (current === null) {
            throw new PaymentIntentNotFoundError();
          }

          if (current.version !== expectedVersion) {
            throw new PaymentCashierConcurrencyError();
          }

          if (
            nextStatus === 'AUTHORIZED' &&
            current.status !== 'PENDING'
          ) {
            throw new PaymentIntentStateError(
              'Only pending payment intents can be authorized',
            );
          }

          if (
            nextStatus === 'CANCELLED' &&
            ![
              'PENDING',
              'AUTHORIZED',
            ].includes(
              current.status,
            )
          ) {
            throw new PaymentIntentStateError(
              'Only pending or authorized payment intents can be cancelled',
            );
          }

          const now =
            this.dependencies.clock.now();

          if (
            current.expiresAt.getTime() <=
            now.getTime()
          ) {
            throw new PaymentIntentExpiredError();
          }

          if (nextStatus === 'AUTHORIZED') {
            if (current.paymentMethodConfigurationId === null) {
              throw new PaymentIntentStateError(
                'The payment intent has no authoritative payment-method configuration',
              );
            }

            const method =
              await this.dependencies.configuration.findPaymentMethodById(
                actor.facilityId,
                current.paymentMethodConfigurationId.toHexString(),
                session,
              );

            if (
              method === null ||
              !method.active ||
              method.methodKind === 'CASH'
            ) {
              throw new PaymentIntentStateError(
                'The payment method is not eligible for external authorization',
              );
            }

            const normalizedReference =
              normalizeNullablePaymentCashierText(
                externalReference,
              );

            if (normalizedReference === null) {
              throw new PaymentMethodReferenceRequiredError(
                'payment authorization',
              );
            }

            const compactReference =
              normalizedReference.replace(
                /[\s-]/gu,
                '',
              );

            if (
              method.methodKind === 'CARD' &&
              /^\d{12,19}$/u.test(compactReference)
            ) {
              throw new PaymentMethodReferenceRequiredError(
                'tokenized or authorization-only card',
              );
            }
          }

          const updated =
            await this.dependencies.payments.updateIntent(
              actor.facilityId,
              intentId,
              expectedVersion,
              {
                status:
                  nextStatus,
                externalReference:
                  externalReference ??
                  current.externalReference,
                authorizedAt:
                  nextStatus === 'AUTHORIZED'
                    ? new Date(
                        authorizedAt ??
                          now.toISOString(),
                      )
                    : current.authorizedAt,
                cancelledAt:
                  nextStatus === 'CANCELLED'
                    ? now
                    : null,
                cancelledBy:
                  nextStatus === 'CANCELLED'
                    ? toObjectId(
                        actor.userId,
                        'actor.userId',
                      )
                    : null,
                cancellationReason:
                  nextStatus === 'CANCELLED'
                    ? reason
                    : null,
                updatedBy:
                  toObjectId(
                    actor.userId,
                    'actor.userId',
                  ),
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );

          if (updated === null) {
            throw new PaymentCashierConcurrencyError();
          }

          const view =
            projectPaymentIntent(
              updated,
            );
          const action =
            nextStatus === 'AUTHORIZED'
              ? 'AUTHORIZED'
              : 'CANCELLED';

          await this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType:
              'PAYMENT_INTENT',
            entityId:
              intentId,
            action,
            occurredAt:
              now,
            session,
            statusFrom:
              current.status,
            statusTo:
              nextStatus,
            amount:
              view.amount,
            currency:
              view.currency,
            reason,
            cashCounterId:
              current.cashCounterId?.toHexString() ??
              null,
            cashShiftId:
              current.cashShiftId?.toHexString() ??
              null,
            patientId:
              current.patientId.toHexString(),
            patientAccountId:
              current.patientAccountId.toHexString(),
            invoiceId:
              current.invoiceId?.toHexString() ??
              null,
          });

          await Promise.all([
            this.dependencies.audit.record(
              {
                facilityId:
                  actor.facilityId,
                actorUserId:
                  actor.userId,
                actorStaffId:
                  actor.staffId,
                action:
                  nextStatus === 'AUTHORIZED'
                    ? PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_INTENT_AUTHORIZED
                    : PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_INTENT_CANCELLED,
                entityType:
                  'PAYMENT_INTENT',
                entityId:
                  intentId,
                reason,
                before: {
                  status:
                    current.status,
                },
                after: {
                  status:
                    view.status,
                },
                correlationId:
                  actor.correlationId,
                transactionId,
                ipAddress:
                  actor.ipAddress,
                userAgent:
                  actor.userAgent,
              },
              session,
            ),
            this.dependencies.outbox.publish(
              {
                facilityId:
                  actor.facilityId,
                aggregateType:
                  'PAYMENT_INTENT',
                aggregateId:
                  intentId,
                eventType:
                  nextStatus === 'AUTHORIZED'
                    ? PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_INTENT_AUTHORIZED
                    : PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_INTENT_CANCELLED,
                payload: {
                  intentId,
                  status:
                    view.status,
                },
                correlationId:
                  actor.correlationId,
                transactionId,
                occurredAt:
                  now,
              },
              session,
            ),
          ]);

          return view;
        },
      });

    await this.publish(
      actor.facilityId,
      result,
    );

    return result;
  }

  private async publish(
    facilityId:
      string,
    intent:
      PaymentIntentView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType:
        PAYMENT_CASHIER_REALTIME_EVENTS.PAYMENT_INTENT_CHANGED,
      entityId:
        intent.id,
      counterId:
        null,
      shiftId:
        null,
      status:
        intent.status,
      occurredAt:
        this.dependencies.clock.now().toISOString(),
    });
  }
}