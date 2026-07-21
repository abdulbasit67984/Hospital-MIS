import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AllocatePaymentInput,
  CollectPaymentInput,
  PaymentCashierActorContext,
  PaymentReceiptView,
  PaymentView,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashCounterInactiveError,
  CashCounterNotFoundError,
  CashierShiftNotFoundError,
  CashierShiftNotOpenError,
  PaymentAmountMismatchError,
  PaymentCashierConcurrencyError,
  PaymentIntentExpiredError,
  PaymentIntentNotFoundError,
  PaymentIntentStateError,
  PaymentMethodInactiveError,
  PaymentNotFoundError,
  PaymentOutstandingBalanceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
  PaymentLedgerPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentAllocationRecord,
  PaymentReceiptRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  projectPayment,
  projectPaymentReceipt,
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
  paymentCashierDecimal128,
  paymentCashierLockKey,
  paymentCashierSnapshotHash,
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
  MongoPaymentReceiptRepository,
} from '../repositories/payment-finance.repository.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

import {
  PaymentMethodTenderValidationService,
  type ValidatedPaymentTender,
} from './payment-method-tender-validation.service.js';

import {
  MongoUnifiedBillingPaymentsAdapter,
} from './unified-billing-payments.adapter.js';

export interface CollectedPaymentResult {
  payment:
    PaymentView;
  receipt:
    PaymentReceiptView;
}

export interface PaymentCollectionServiceDependencies {
  configuration:
    PaymentConfigurationRepository;
  shifts:
    CashierShiftExtendedRepositoryPort;
  payments:
    PaymentFinancialRepositoryPort;
  receipts:
    MongoPaymentReceiptRepository;
  billing:
    MongoUnifiedBillingPaymentsAdapter;
  tenderValidation:
    PaymentMethodTenderValidationService;
  ledger:
    PaymentLedgerPort;
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

function total(
  values:
    readonly Readonly<{
      amount: string;
    }>[],
): Decimal {
  return values.reduce(
    (
      sum,
      value,
    ) =>
      sum.plus(
        value.amount,
      ),
    new Decimal(0),
  );
}

function invoiceIds(
  allocations:
    readonly PaymentAllocationRecord[],
): string[] {
  return [
    ...new Set(
      allocations.flatMap(
        (allocation) =>
          allocation.invoiceId === null
            ? []
            : [
                allocation.invoiceId.toHexString(),
              ],
      ),
    ),
  ];
}

export class PaymentCollectionService {
  public constructor(
    private readonly dependencies:
      PaymentCollectionServiceDependencies,
  ) {}

  public async get(
    actor:
      PaymentCashierActorContext,
    paymentId:
      string,
  ): Promise<PaymentView> {
    const payment =
      await this.dependencies.payments.findPaymentById(
        actor.facilityId,
        paymentId,
      );

    if (payment === null) {
      throw new PaymentNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'PAYMENT_READ',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        payment.cashCounterId?.toHexString() ??
        null,
      cashierUserId:
        payment.createdBy.toHexString(),
    });

    const [allocations, tenders] =
      await Promise.all([
        this.dependencies.payments.listAllocations(
          actor.facilityId,
          paymentId,
        ),
        this.dependencies.payments.listTenders(
          actor.facilityId,
          paymentId,
        ),
      ]);

    return projectPayment(
      payment,
      allocations,
      tenders,
    );
  }

  public async collect(
    command:
      PaymentCashierCommandContext,
    input:
      CollectPaymentInput,
  ): Promise<CollectedPaymentResult> {
    const {
      actor,
    } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'PAYMENT_COLLECT',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        input.cashCounterId,
      cashierUserId:
        actor.userId,
      manualOperation:
        input.manualPayment === true,
    });

    if (input.tenders.length > 1) {
      this.dependencies.accessPolicy.require({
        actor,
        action:
          'PAYMENT_COLLECT_SPLIT',
        resourceFacilityId:
          actor.facilityId,
        counterId:
          input.cashCounterId,
        cashierUserId:
          actor.userId,
      });
    }

    const lockKeys = [
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.CASHIER_SHIFT,
        actor.facilityId,
        input.cashShiftId,
      ),
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
        actor.facilityId,
        input.patientAccountId,
      ),
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.RECEIPT_SEQUENCE,
        actor.facilityId,
      ),
      ...input.allocations.flatMap(
        (allocation) =>
          allocation.invoiceId == null
            ? []
            : [
                paymentCashierLockKey(
                  PAYMENT_CASHIER_LOCK_NAMESPACES.INVOICE,
                  actor.facilityId,
                  allocation.invoiceId,
                ),
              ],
      ),
    ];

    if (input.paymentIntentId != null) {
      lockKeys.push(
        paymentCashierLockKey(
          PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT_INTENT,
          actor.facilityId,
          input.paymentIntentId,
        ),
      );
    }

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.COLLECT_PAYMENT,
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
            input.receivedAt == null
              ? this.dependencies.clock.now()
              : new Date(
                  input.receivedAt,
                );
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

          const account =
            await this.dependencies.billing.resolvePatientAccount(
              actor.facilityId,
              input.patientAccountId,
              session,
            );

          if (account === null) {
            throw new PaymentOutstandingBalanceError();
          }

          const currency =
            input.currency ??
            account.currency;

          if (currency !== account.currency) {
            throw new PaymentAmountMismatchError(
              'Payment currency must match the authoritative patient-account currency',
            );
          }

          const tenderTotal =
            total(
              input.tenders,
            );
          const requestedTotal =
            new Decimal(
              input.totalAmount,
            );

          if (!tenderTotal.equals(requestedTotal)) {
            throw new PaymentAmountMismatchError();
          }

          const validatedTenders:
            ValidatedPaymentTender[] = [];

          for (const tender of input.tenders) {
            const method =
              await this.dependencies.configuration.findPaymentMethodById(
                actor.facilityId,
                tender.paymentMethodConfigurationId,
                session,
              );

            if (method === null) {
              throw new PaymentMethodInactiveError();
            }

            validatedTenders.push(
              this.dependencies.tenderValidation.prepare(
                method,
                tender,
                {
                  currency,
                  counter,
                  shift,
                  actor,
                  at:
                    now,
                },
              ),
            );
          }

          const intent =
            input.paymentIntentId == null
              ? null
              : await this.dependencies.payments.findIntentById(
                  actor.facilityId,
                  input.paymentIntentId,
                  session,
                );

          if (
            input.paymentIntentId != null &&
            intent === null
          ) {
            throw new PaymentIntentNotFoundError();
          }

          if (intent !== null) {
            if (
              intent.patientAccountId.toHexString() !==
                input.patientAccountId ||
              ![
                'PENDING',
                'AUTHORIZED',
              ].includes(
                intent.status,
              ) ||
              !new Decimal(
                intent.amount.toString(),
              ).equals(
                requestedTotal,
              )
            ) {
              throw new PaymentIntentStateError();
            }

            if (
              intent.expiresAt.getTime() <=
              now.getTime()
            ) {
              throw new PaymentIntentExpiredError();
            }

            if (
              validatedTenders.length !== 1 ||
              intent.paymentMethodConfigurationId?.toHexString() !==
                validatedTenders[0]?.paymentMethodConfigurationId
            ) {
              throw new PaymentIntentStateError(
                'The payment tenders do not match the payment intent',
              );
            }
          }

          for (const tender of validatedTenders) {
            const method =
              await this.dependencies.configuration.findPaymentMethodById(
                actor.facilityId,
                tender.paymentMethodConfigurationId,
                session,
              );

            if (
              method !== null &&
              method.settlementMode !== 'IMMEDIATE' &&
              intent?.status !== 'AUTHORIZED'
            ) {
              throw new PaymentIntentStateError(
                'Delayed or externally settled methods require a previously authorized payment intent',
              );
            }
          }

          const validation =
            await this.dependencies.billing.validateAllocations(
              actor.facilityId,
              input.patientAccountId,
              input.allocations ??
                [],
              session,
            );
          const allocatedAmount =
            new Decimal(
              validation.authoritativeAllocationTotal,
            );

          if (allocatedAmount.greaterThan(requestedTotal)) {
            throw new PaymentAmountMismatchError();
          }

          const unallocatedAmount =
            requestedTotal.minus(
              allocatedAmount,
            );
          const paymentNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.PAYMENT,
              now,
              session,
            );
          const receiptNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.RECEIPT,
              now,
              session,
            );
          const parentMethod =
            validatedTenders.length > 1
              ? 'SPLIT_TENDER'
              : validatedTenders[0]!
                  .legacyPaymentMethod;
          const created =
            await this.dependencies.payments.createPayment(
              actor.facilityId,
              input,
              {
                operationKey,
                paymentNumber,
                receiptNumber,
                patientId:
                  account.patientId.toHexString(),
                authoritativeAmount:
                  requestedTotal.toFixed(),
                authoritativeAllocatedAmount:
                  allocatedAmount.toFixed(),
                authoritativeUnallocatedAmount:
                  unallocatedAmount.toFixed(),
                paymentMethod:
                  parentMethod,
                paymentMethodConfigurationId:
                  validatedTenders.length === 1
                    ? validatedTenders[0]!
                        .paymentMethodConfigurationId
                    : null,
                externalReference:
                  validatedTenders.length === 1
                    ? validatedTenders[0]!
                        .externalReference
                    : null,
                tenders:
                  validatedTenders,
                actorUserId:
                  actor.userId,
                actorStaffId:
                  actor.staffId,
                receivedAt:
                  now,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const allocations =
            await this.dependencies.payments.createAllocations(
              actor.facilityId,
              created._id.toHexString(),
              input.patientAccountId,
              input.allocations ??
                [],
              {
                operationKeyPrefix:
                  operationKey,
                actorUserId:
                  actor.userId,
                allocatedAt:
                  now,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );

          await this.dependencies.billing.applyPayment(
            actor.facilityId,
            created,
            allocations,
            session,
          );

          await this.dependencies.ledger.postBalancedTransaction(
            {
              operationKey:
                `${operationKey}:ledger`,
              facilityId:
                actor.facilityId,
              sourceEntityType:
                'PAYMENT',
              sourceEntityId:
                created._id.toHexString(),
              patientId:
                account.patientId.toHexString(),
              patientAccountId:
                input.patientAccountId,
              invoiceId:
                input.invoiceId ??
                null,
              paymentId:
                created._id.toHexString(),
              cashShiftId:
                input.cashShiftId,
              cashCounterId:
                input.cashCounterId,
              paymentMethodConfigurationId:
                validatedTenders.length === 1
                  ? validatedTenders[0]!
                      .paymentMethodConfigurationId
                  : null,
              currency,
              description:
                `Payment ${paymentNumber} received`,
              postedAt:
                now,
              postedBy:
                actor.userId,
              entries:
                validatedTenders.flatMap(
                  (tender) => [
                    {
                      ledgerAccountId:
                        tender.debitLedgerAccountId,
                      direction:
                        'DEBIT' as const,
                      amount:
                        tender.amount,
                      description:
                        `${tender.paymentMethodCodeSnapshot} receipt`,
                    },
                    {
                      ledgerAccountId:
                        tender.receivableLedgerAccountId,
                      direction:
                        'CREDIT' as const,
                      amount:
                        tender.amount,
                      description:
                        'Patient financial control credit',
                    },
                  ],
                ),
              transactionId,
              correlationId:
                actor.correlationId,
            },
            session,
          );

          const receipt =
            await this.dependencies.receipts.create(
              this.buildReceipt({
                actor,
                transactionId,
                operationKey,
                payment:
                  created,
                allocations,
                tenders:
                  validatedTenders,
                receiptNumber,
                issuedAt:
                  now,
                payerDisplayName:
                  input.payerName ??
                  null,
                responsiblePartyType:
                  input.responsiblePartyType ??
                  null,
              }),
              session,
            );

          if (intent !== null) {
            const updatedIntent =
              await this.dependencies.payments.updateIntent(
                actor.facilityId,
                intent._id.toHexString(),
                intent.version,
                {
                  status:
                    'COMPLETED',
                  capturedAt:
                    now,
                  completedPaymentId:
                    created._id,
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

            if (updatedIntent === null) {
              throw new PaymentCashierConcurrencyError(
                'The payment intent changed before completion',
              );
            }
          }

          const tenderRecords =
            await this.dependencies.payments.listTenders(
              actor.facilityId,
              created._id.toHexString(),
              session,
            );
          const paymentView =
            projectPayment(
              created,
              allocations,
              tenderRecords,
            );
          const receiptView =
            projectPaymentReceipt(
              receipt,
            );

          await this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType:
              'PAYMENT',
            entityId:
              paymentView.id,
            action:
              'COMPLETED',
            occurredAt:
              now,
            session,
            statusFrom:
              'PENDING',
            statusTo:
              paymentView.status,
            amount:
              paymentView.amount,
            currency:
              paymentView.currency,
            cashCounterId:
              input.cashCounterId,
            cashShiftId:
              input.cashShiftId,
            patientId:
              paymentView.patientId,
            patientAccountId:
              paymentView.patientAccountId,
            invoiceId:
              paymentView.invoiceId,
            paymentId:
              paymentView.id,
            receiptId:
              receiptView.id,
            metadata: {
              paymentNumber:
                paymentView.paymentNumber,
              receiptNumber:
                receiptView.receiptNumber,
              tenderCount:
                paymentView.tenders.length,
              allocatedAmount:
                paymentView.allocatedAmount,
              unallocatedAmount:
                paymentView.unallocatedAmount,
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
                  PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_COMPLETED,
                entityType:
                  'PAYMENT',
                entityId:
                  paymentView.id,
                after: {
                  paymentNumber:
                    paymentView.paymentNumber,
                  receiptNumber:
                    receiptView.receiptNumber,
                  amount:
                    paymentView.amount,
                  allocatedAmount:
                    paymentView.allocatedAmount,
                  unallocatedAmount:
                    paymentView.unallocatedAmount,
                  status:
                    paymentView.status,
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
                  'PAYMENT',
                aggregateId:
                  paymentView.id,
                eventType:
                  PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_COMPLETED,
                payload: {
                  paymentId:
                    paymentView.id,
                  receiptId:
                    receiptView.id,
                  patientAccountId:
                    paymentView.patientAccountId,
                  invoiceIds:
                    invoiceIds(
                      allocations,
                    ),
                  status:
                    paymentView.status,
                  counterId:
                    input.cashCounterId,
                  shiftId:
                    input.cashShiftId,
                },
                correlationId:
                  actor.correlationId,
                transactionId,
                occurredAt:
                  now,
              },
              session,
            ),
            this.dependencies.outbox.publish(
              {
                facilityId:
                  actor.facilityId,
                aggregateType:
                  'PAYMENT_RECEIPT',
                aggregateId:
                  receiptView.id,
                eventType:
                  PAYMENT_CASHIER_EVENT_TYPES.RECEIPT_ISSUED,
                payload: {
                  receiptId:
                    receiptView.id,
                  paymentId:
                    paymentView.id,
                  status:
                    receiptView.status,
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

          return {
            payment:
              paymentView,
            receipt:
              receiptView,
          };
        },
      });

    await Promise.all([
      this.dependencies.realtime.publishMinimumNecessary({
        facilityId:
          actor.facilityId,
        eventType:
          PAYMENT_CASHIER_REALTIME_EVENTS.PAYMENT_CHANGED,
        entityId:
          result.payment.id,
        counterId:
          input.cashCounterId,
        shiftId:
          input.cashShiftId,
        status:
          result.payment.status,
        occurredAt:
          this.dependencies.clock.now().toISOString(),
      }),
      this.dependencies.realtime.publishMinimumNecessary({
        facilityId:
          actor.facilityId,
        eventType:
          PAYMENT_CASHIER_REALTIME_EVENTS.RECEIPT_CHANGED,
        entityId:
          result.receipt.id,
        counterId:
          input.cashCounterId,
        shiftId:
          input.cashShiftId,
        status:
          result.receipt.status,
        occurredAt:
          this.dependencies.clock.now().toISOString(),
      }),
    ]);

    return result;
  }

  public async allocate(
    command:
      PaymentCashierCommandContext,
    paymentId:
      string,
    input:
      AllocatePaymentInput,
  ): Promise<PaymentView> {
    const {
      actor,
    } = command;
    const existing =
      await this.dependencies.payments.findPaymentById(
        actor.facilityId,
        paymentId,
      );

    if (existing === null) {
      throw new PaymentNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'PAYMENT_ALLOCATE',
      resourceFacilityId:
        actor.facilityId,
      counterId:
        existing.cashCounterId?.toHexString() ??
        null,
      cashierUserId:
        existing.createdBy.toHexString(),
    });

    const lockKeys = [
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
        actor.facilityId,
        paymentId,
      ),
      paymentCashierLockKey(
        PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
        actor.facilityId,
        existing.patientAccountId.toHexString(),
      ),
      ...input.allocations.flatMap(
        (allocation) =>
          allocation.invoiceId == null
            ? []
            : [
                paymentCashierLockKey(
                  PAYMENT_CASHIER_LOCK_NAMESPACES.INVOICE,
                  actor.facilityId,
                  allocation.invoiceId,
                ),
              ],
      ),
    ];

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.ALLOCATE_PAYMENT,
        command,
        payload: {
          paymentId,
          ...input,
        },
        lockKeys,
        work: async ({
          session,
          transactionId,
          operationKey,
        }) => {
          const payment =
            await this.dependencies.payments.findPaymentById(
              actor.facilityId,
              paymentId,
              session,
            );

          if (payment === null) {
            throw new PaymentNotFoundError();
          }

          if (
            payment.version !==
            input.expectedPaymentVersion
          ) {
            throw new PaymentCashierConcurrencyError();
          }

          if (
            ![
              'POSTED',
              'COMPLETED',
              'PARTIALLY_REFUNDED',
            ].includes(
              payment.status,
            )
          ) {
            throw new PaymentOutstandingBalanceError();
          }

          const requested =
            total(
              input.allocations,
            );
          const available =
            new Decimal(
              payment.unallocatedAmount.toString(),
            );

          if (requested.greaterThan(available)) {
            throw new PaymentOutstandingBalanceError();
          }

          await this.dependencies.billing.validateAllocations(
            actor.facilityId,
            payment.patientAccountId.toHexString(),
            input.allocations,
            session,
          );

          const now =
            this.dependencies.clock.now();
          const createdAllocations =
            await this.dependencies.payments.createAllocations(
              actor.facilityId,
              paymentId,
              payment.patientAccountId.toHexString(),
              input.allocations,
              {
                operationKeyPrefix:
                  operationKey,
                actorUserId:
                  actor.userId,
                allocatedAt:
                  now,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );

          await this.dependencies.billing.applyAdditionalAllocations(
            actor.facilityId,
            payment,
            createdAllocations,
            session,
          );

          const nextAllocated =
            new Decimal(
              payment.allocatedAmount.toString(),
            ).plus(
              requested,
            );
          const nextUnallocated =
            available.minus(
              requested,
            );
          const updated =
            await this.dependencies.payments.updatePayment(
              actor.facilityId,
              paymentId,
              payment.version,
              {
                allocatedAmount:
                  paymentCashierDecimal128(
                    nextAllocated.toFixed(),
                    'allocatedAmount',
                  ),
                unallocatedAmount:
                  paymentCashierDecimal128(
                    nextUnallocated.toFixed(),
                    'unallocatedAmount',
                  ),
                updatedBy:
                  toObjectId(
                    actor.userId,
                    'actor.userId',
                  ),
              },
              session,
            );

          if (updated === null) {
            throw new PaymentCashierConcurrencyError();
          }

          const [allAllocations, tenders] =
            await Promise.all([
              this.dependencies.payments.listAllocations(
                actor.facilityId,
                paymentId,
                session,
              ),
              this.dependencies.payments.listTenders(
                actor.facilityId,
                paymentId,
                session,
              ),
            ]);
          const view =
            projectPayment(
              updated,
              allAllocations,
              tenders,
            );

          await this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType:
              'PAYMENT_ALLOCATION',
            entityId:
              createdAllocations[0]!._id.toHexString(),
            action:
              'ALLOCATED',
            occurredAt:
              now,
            session,
            amount:
              requested.toFixed(),
            currency:
              payment.currency,
            cashCounterId:
              payment.cashCounterId?.toHexString() ??
              null,
            cashShiftId:
              payment.cashShiftId?.toHexString() ??
              null,
            patientId:
              payment.patientId.toHexString(),
            patientAccountId:
              payment.patientAccountId.toHexString(),
            paymentId,
            metadata: {
              allocationIds:
                createdAllocations.map(
                  (allocation) =>
                    allocation._id.toHexString(),
                ),
              unallocatedAmount:
                view.unallocatedAmount,
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
                  PAYMENT_CASHIER_AUDIT_ACTIONS.PAYMENT_ALLOCATED,
                entityType:
                  'PAYMENT',
                entityId:
                  paymentId,
                before: {
                  allocatedAmount:
                    payment.allocatedAmount.toString(),
                  unallocatedAmount:
                    payment.unallocatedAmount.toString(),
                },
                after: {
                  allocatedAmount:
                    view.allocatedAmount,
                  unallocatedAmount:
                    view.unallocatedAmount,
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
                  'PAYMENT',
                aggregateId:
                  paymentId,
                eventType:
                  PAYMENT_CASHIER_EVENT_TYPES.PAYMENT_ALLOCATED,
                payload: {
                  paymentId,
                  allocationIds:
                    createdAllocations.map(
                      (allocation) =>
                        allocation._id.toHexString(),
                    ),
                  invoiceIds:
                    invoiceIds(
                      createdAllocations,
                    ),
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

    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId:
        actor.facilityId,
      eventType:
        PAYMENT_CASHIER_REALTIME_EVENTS.PAYMENT_CHANGED,
      entityId:
        result.id,
      counterId:
        existing.cashCounterId?.toHexString() ??
        null,
      shiftId:
        existing.cashShiftId?.toHexString() ??
        null,
      status:
        result.status,
      occurredAt:
        this.dependencies.clock.now().toISOString(),
    });

    return result;
  }

  private buildReceipt(
    input:
      Readonly<{
        actor:
          PaymentCashierActorContext;
        transactionId:
          string;
        operationKey:
          string;
        payment:
          Parameters<
            typeof projectPayment
          >[0];
        allocations:
          readonly PaymentAllocationRecord[];
        tenders:
          readonly ValidatedPaymentTender[];
        receiptNumber:
          string;
        issuedAt:
          Date;
        payerDisplayName:
          string | null;
        responsiblePartyType:
          string | null;
      }>,
  ): Omit<
    PaymentReceiptRecord,
    '_id' | 'createdAt' | 'updatedAt'
  > {
    const actorId =
      toObjectId(
        input.actor.userId,
        'actor.userId',
      );
    const invoiceReferences =
      invoiceIds(
        input.allocations,
      );
    const projection = {
      receiptNumber:
        input.receiptNumber,
      paymentId:
        input.payment._id.toHexString(),
      patientId:
        input.payment.patientId.toHexString(),
      patientAccountId:
        input.payment.patientAccountId.toHexString(),
      totalAmount:
        input.payment.amount.toString(),
      allocatedAmount:
        input.payment.allocatedAmount.toString(),
      unallocatedAmount:
        input.payment.unallocatedAmount.toString(),
      tenders:
        input.tenders.map(
          (tender) => ({
            paymentMethodConfigurationId:
              tender.paymentMethodConfigurationId,
            paymentMethodCode:
              tender.paymentMethodCodeSnapshot,
            amount:
              tender.amount,
            externalReferenceMasked:
              tender.maskedReference,
          }),
        ),
      allocations:
        input.allocations.map(
          (allocation) => ({
            id:
              allocation._id.toHexString(),
            invoiceId:
              allocation.invoiceId?.toHexString() ??
              null,
            accountChargeId:
              allocation.accountChargeId?.toHexString() ??
              null,
            amount:
              allocation.amount.toString(),
          }),
        ),
    };

    return {
      facilityId:
        input.payment.facilityId,
      transactionId:
        input.transactionId,
      correlationId:
        input.actor.correlationId,
      schemaVersion:
        1,
      version:
        0,
      createdBy:
        actorId,
      updatedBy:
        actorId,
      operationKey:
        `${input.operationKey}:receipt`,
      receiptNumber:
        input.receiptNumber,
      paymentId:
        input.payment._id,
      paymentIntentId:
        input.payment.paymentIntentId,
      patientId:
        input.payment.patientId,
      patientAccountId:
        input.payment.patientAccountId,
      invoiceIds:
        invoiceReferences.map(
          (invoiceId) =>
            toObjectId(
              invoiceId,
              'invoiceId',
            ),
        ),
      cashCounterId:
        input.payment.cashCounterId,
      cashShiftId:
        input.payment.cashShiftId,
      cashierUserId:
        actorId,
      cashierStaffId:
        input.payment.cashierStaffId,
      issuedAt:
        input.issuedAt,
      currency:
        input.payment.currency,
      totalAmount:
        input.payment.amount,
      allocatedAmount:
        input.payment.allocatedAmount,
      unallocatedAmount:
        input.payment.unallocatedAmount,
      paymentMethodSummaries:
        input.tenders.map(
          (tender) => ({
            paymentMethodConfigurationId:
              toObjectId(
                tender.paymentMethodConfigurationId,
                'paymentMethodConfigurationId',
              ),
            paymentMethodCodeSnapshot:
              tender.paymentMethodCodeSnapshot,
            amount:
              paymentCashierDecimal128(
                tender.amount,
                'tender.amount',
              ),
            externalReferenceMasked:
              tender.maskedReference,
          }),
        ),
      allocationSummaries:
        input.allocations.map(
          (allocation) => ({
            paymentAllocationId:
              allocation._id,
            invoiceId:
              allocation.invoiceId,
            accountChargeId:
              allocation.accountChargeId,
            amount:
              allocation.amount,
          }),
        ),
      payerDisplayName:
        input.payerDisplayName,
      responsiblePartyType:
        input.responsiblePartyType,
      status:
        'ISSUED',
      originalReceiptId:
        null,
      replacementReceiptId:
        null,
      refundId:
        null,
      paymentReversalId:
        null,
      statusChangedAt:
        null,
      statusChangedBy:
        null,
      statusReason:
        null,
      printableProjectionVersion:
        1,
      printableProjectionHash:
        paymentCashierSnapshotHash(
          projection,
        ),
    };
  }
}