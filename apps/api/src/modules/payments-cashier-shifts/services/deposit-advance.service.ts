import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  ApplyDepositInput,
  CreateDepositInput,
  DepositView,
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  TransferDepositInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  DepositBalanceError,
  DepositNotFoundError,
  PaymentCashierConcurrencyError,
  PaymentNotFoundError,
  PaymentOutstandingBalanceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  FinancialApprovalPort,
  PaymentCashierAccessPolicyPort,
  PaymentCashierAuditPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
  PaymentLedgerPort,
} from '../payments-cashier-shifts.ports.js';

import {
  projectDeposit,
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
} from '../payments-cashier-shifts.normalization.js';

import type {
  PaymentConfigurationRepository,
} from '../repositories/payment-configuration.repository.js';

import type {
  DepositFinancialRepositoryPort,
  PaymentFinancialRepositoryPort,
} from '../repositories/payment-finance.repository.js';

import {
  PaymentCashierCommandSupport,
  type PaymentCashierCommandContext,
} from './payment-cashier-command-support.js';

import {
  MongoUnifiedBillingPaymentsAdapter,
} from './unified-billing-payments.adapter.js';

export interface DepositAdvanceServiceDependencies {
  deposits:
    DepositFinancialRepositoryPort;
  payments:
    PaymentFinancialRepositoryPort;
  configuration:
    PaymentConfigurationRepository;
  billing:
    MongoUnifiedBillingPaymentsAdapter;
  approvals:
    FinancialApprovalPort;
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

export class DepositAdvanceService {
  public constructor(
    private readonly dependencies:
      DepositAdvanceServiceDependencies,
  ) {}

  public async get(
    actor:
      PaymentCashierActorContext,
    depositId:
      string,
  ): Promise<DepositView> {
    const deposit =
      await this.dependencies.deposits.findById(
        actor.facilityId,
        depositId,
      );

    if (deposit === null) {
      throw new DepositNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'DEPOSIT_READ',
      resourceFacilityId:
        actor.facilityId,
    });

    return projectDeposit(
      deposit,
    );
  }

  public async list(
    actor:
      PaymentCashierActorContext,
    query:
      PaymentCashierListQuery,
  ): Promise<PaymentCashierPage<DepositView>> {
    this.dependencies.accessPolicy.require({
      actor,
      action:
        'DEPOSIT_READ',
      resourceFacilityId:
        actor.facilityId,
    });

    const page =
      await this.dependencies.deposits.list(
        actor.facilityId,
        query,
      );

    return {
      ...page,
      items:
        page.items.map(
          projectDeposit,
        ),
    };
  }

  public async create(
    command:
      PaymentCashierCommandContext,
    input:
      CreateDepositInput,
  ): Promise<DepositView> {
    const {
      actor,
    } = command;

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'DEPOSIT_COLLECT',
      resourceFacilityId:
        actor.facilityId,
    });

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.CREATE_DEPOSIT,
        command,
        payload:
          input,
        lockKeys: [
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
            actor.facilityId,
            input.paymentId,
          ),
        ],
        work: async ({
          session,
          transactionId,
          operationKey,
        }) => {
          const payment =
            await this.dependencies.payments.findPaymentById(
              actor.facilityId,
              input.paymentId,
              session,
            );

          if (payment === null) {
            throw new PaymentNotFoundError();
          }

          if (
            ![
              'POSTED',
              'COMPLETED',
              'PARTIALLY_REFUNDED',
            ].includes(
              payment.status,
            ) ||
            new Decimal(
              payment.unallocatedAmount.toString(),
            ).isZero()
          ) {
            throw new DepositBalanceError();
          }

          if (
            input.patientAccountId != null &&
            input.patientAccountId !==
              payment.patientAccountId.toHexString()
          ) {
            throw new DepositBalanceError();
          }

          const existing =
            await this.dependencies.deposits.findByPaymentId(
              actor.facilityId,
              input.paymentId,
              session,
            );

          if (existing !== null) {
            return projectDeposit(
              existing,
            );
          }

          const now =
            this.dependencies.clock.now();
          const depositNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.DEPOSIT,
              now,
              session,
            );
          const created =
            await this.dependencies.deposits.create(
              actor.facilityId,
              {
                ...input,
                patientAccountId:
                  payment.patientAccountId.toHexString(),
              },
              {
                operationKey,
                depositNumber,
                patientId:
                  payment.patientId.toHexString(),
                originalAmount:
                  payment.unallocatedAmount.toString(),
                currency:
                  payment.currency,
                receivedAt:
                  payment.receivedAt,
                actorUserId:
                  actor.userId,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const view =
            projectDeposit(
              created,
            );

          await this.dependencies.commandSupport.appendHistory({
            actor,
            transactionId,
            entityType:
              'DEPOSIT',
            entityId:
              view.id,
            action:
              'CREATED',
            occurredAt:
              now,
            session,
            amount:
              view.originalAmount,
            currency:
              view.currency,
            cashCounterId:
              payment.cashCounterId?.toHexString() ??
              null,
            cashShiftId:
              payment.cashShiftId?.toHexString() ??
              null,
            patientId:
              view.patientId,
            patientAccountId:
              view.patientAccountId,
            paymentId:
              view.paymentId,
            metadata: {
              depositNumber:
                view.depositNumber,
              depositType:
                input.depositType,
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
                  PAYMENT_CASHIER_AUDIT_ACTIONS.DEPOSIT_CREATED,
                entityType:
                  'DEPOSIT',
                entityId:
                  view.id,
                after: {
                  depositNumber:
                    view.depositNumber,
                  amount:
                    view.originalAmount,
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
                  'DEPOSIT',
                aggregateId:
                  view.id,
                eventType:
                  PAYMENT_CASHIER_EVENT_TYPES.DEPOSIT_CREATED,
                payload: {
                  depositId:
                    view.id,
                  paymentId:
                    view.paymentId,
                  patientAccountId:
                    view.patientAccountId,
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

  public async apply(
    command:
      PaymentCashierCommandContext,
    depositId:
      string,
    input:
      ApplyDepositInput,
  ): Promise<DepositView> {
    const {
      actor,
    } = command;
    const existing =
      await this.dependencies.deposits.findById(
        actor.facilityId,
        depositId,
      );

    if (existing === null) {
      throw new DepositNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'DEPOSIT_APPLY',
      resourceFacilityId:
        actor.facilityId,
    });

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.APPLY_DEPOSIT,
        command,
        payload: {
          depositId,
          ...input,
        },
        lockKeys: [
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.DEPOSIT,
            actor.facilityId,
            depositId,
          ),
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.PAYMENT,
            actor.facilityId,
            existing.paymentId.toHexString(),
          ),
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
            actor.facilityId,
            input.targetPatientAccountId,
          ),
        ],
        work: async ({
          session,
          transactionId,
          operationKey,
        }) => {
          const deposit =
            await this.dependencies.deposits.findById(
              actor.facilityId,
              depositId,
              session,
            );

          if (deposit === null) {
            throw new DepositNotFoundError();
          }

          if (
            deposit.version !==
            input.expectedDepositVersion
          ) {
            throw new PaymentCashierConcurrencyError();
          }

          const amount =
            new Decimal(
              input.amount,
            );
          const available =
            new Decimal(
              deposit.availableAmount.toString(),
            );

          if (
            ![
              'AVAILABLE',
              'PARTIALLY_APPLIED',
            ].includes(
              deposit.status,
            ) ||
            amount.greaterThan(
              available,
            )
          ) {
            throw new DepositBalanceError();
          }

          const targetAccount =
            await this.dependencies.billing.resolvePatientAccount(
              actor.facilityId,
              input.targetPatientAccountId,
              session,
            );

          if (
            targetAccount === null ||
            targetAccount.patientId.toHexString() !==
              deposit.patientId.toHexString()
          ) {
            throw new DepositBalanceError();
          }

          const payment =
            await this.dependencies.payments.findPaymentById(
              actor.facilityId,
              deposit.paymentId.toHexString(),
              session,
            );

          if (payment === null) {
            throw new PaymentNotFoundError();
          }

          const allocations =
            input.targetInvoiceId == null
              ? await this.dependencies.billing.planAccountAllocation(
                  actor.facilityId,
                  input.targetPatientAccountId,
                  input.amount,
                  session,
                )
              : [
                  {
                    invoiceId:
                      input.targetInvoiceId,
                    accountChargeId:
                      null,
                    amount:
                      input.amount,
                  },
                ];

          await this.dependencies.billing.validateAllocations(
            actor.facilityId,
            input.targetPatientAccountId,
            allocations,
            session,
          );

          const now =
            this.dependencies.clock.now();
          const createdAllocations =
            await this.dependencies.payments.createAllocations(
              actor.facilityId,
              payment._id.toHexString(),
              input.targetPatientAccountId,
              allocations,
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

          const nextPaymentAllocated =
            new Decimal(
              payment.allocatedAmount.toString(),
            ).plus(
              amount,
            );
          const nextPaymentUnallocated =
            new Decimal(
              payment.unallocatedAmount.toString(),
            ).minus(
              amount,
            );

          if (nextPaymentUnallocated.isNegative()) {
            throw new DepositBalanceError();
          }

          const updatedPayment =
            await this.dependencies.payments.updatePayment(
              actor.facilityId,
              payment._id.toHexString(),
              payment.version,
              {
                allocatedAmount:
                  paymentCashierDecimal128(
                    nextPaymentAllocated.toFixed(),
                    'allocatedAmount',
                  ),
                unallocatedAmount:
                  paymentCashierDecimal128(
                    nextPaymentUnallocated.toFixed(),
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

          if (updatedPayment === null) {
            throw new PaymentCashierConcurrencyError();
          }

          const ledgerAccountId =
            await this.resolveDepositControlLedgerAccount(
              actor.facilityId,
              payment._id.toHexString(),
              session,
            );
          const ledgerTransaction =
            await this.dependencies.ledger.postBalancedTransaction(
              {
                operationKey:
                  `${operationKey}:ledger`,
                facilityId:
                  actor.facilityId,
                sourceEntityType:
                  'DEPOSIT_APPLICATION',
                sourceEntityId:
                  depositId,
                patientId:
                  deposit.patientId.toHexString(),
                patientAccountId:
                  input.targetPatientAccountId,
                invoiceId:
                  input.targetInvoiceId ??
                  null,
                paymentId:
                  payment._id.toHexString(),
                currency:
                  deposit.currency,
                description:
                  `Deposit ${deposit.depositNumber} applied`,
                postedAt:
                  now,
                postedBy:
                  actor.userId,
                entries: [
                  {
                    ledgerAccountId,
                    direction:
                      'DEBIT',
                    amount:
                      input.amount,
                    description:
                      'Release unallocated patient credit',
                  },
                  {
                    ledgerAccountId,
                    direction:
                      'CREDIT',
                    amount:
                      input.amount,
                    description:
                      'Apply deposit to patient receivable',
                  },
                ],
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const applicationNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.DEPOSIT_APPLICATION,
              now,
              session,
            );

          await this.dependencies.deposits.createApplication(
            input,
            {
              operationKey:
                `${operationKey}:application`,
              applicationNumber,
              deposit,
              patientId:
                deposit.patientId.toHexString(),
              actorUserId:
                actor.userId,
              appliedAt:
                now,
              paymentAllocationId:
                createdAllocations[0]!._id.toHexString(),
              financialLedgerTransactionId:
                ledgerTransaction._id.toHexString(),
              transactionId,
              correlationId:
                actor.correlationId,
            },
            session,
          );

          const nextAvailable =
            available.minus(
              amount,
            );
          const nextApplied =
            new Decimal(
              deposit.appliedAmount.toString(),
            ).plus(
              amount,
            );
          const updatedDeposit =
            await this.dependencies.deposits.update(
              actor.facilityId,
              depositId,
              deposit.version,
              {
                availableAmount:
                  paymentCashierDecimal128(
                    nextAvailable.toFixed(),
                    'availableAmount',
                  ),
                appliedAmount:
                  paymentCashierDecimal128(
                    nextApplied.toFixed(),
                    'appliedAmount',
                  ),
                status:
                  nextAvailable.isZero()
                    ? 'APPLIED'
                    : 'PARTIALLY_APPLIED',
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

          if (updatedDeposit === null) {
            throw new PaymentCashierConcurrencyError();
          }

          const view =
            projectDeposit(
              updatedDeposit,
            );

          await this.writeDepositEvent(
            actor,
            transactionId,
            now,
            view,
            'APPLIED',
            PAYMENT_CASHIER_AUDIT_ACTIONS.DEPOSIT_APPLIED,
            PAYMENT_CASHIER_EVENT_TYPES.DEPOSIT_APPLIED,
            input.amount,
            session,
          );

          return view;
        },
      });

    await this.publish(
      actor.facilityId,
      result,
    );

    return result;
  }

  public async transfer(
    command:
      PaymentCashierCommandContext,
    depositId:
      string,
    input:
      TransferDepositInput,
  ): Promise<DepositView> {
    const {
      actor,
    } = command;
    const existing =
      await this.dependencies.deposits.findById(
        actor.facilityId,
        depositId,
      );

    if (existing === null) {
      throw new DepositNotFoundError();
    }

    this.dependencies.accessPolicy.require({
      actor,
      action:
        'DEPOSIT_TRANSFER',
      resourceFacilityId:
        actor.facilityId,
      makerUserId:
        existing.createdBy.toHexString(),
    });

    const result =
      await this.dependencies.commandSupport.execute({
        operation:
          PAYMENT_CASHIER_TRANSACTION_TYPES.TRANSFER_DEPOSIT,
        command,
        payload: {
          depositId,
          ...input,
        },
        lockKeys: [
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.DEPOSIT,
            actor.facilityId,
            depositId,
          ),
          paymentCashierLockKey(
            PAYMENT_CASHIER_LOCK_NAMESPACES.PATIENT_ACCOUNT,
            actor.facilityId,
            input.destinationPatientAccountId ??
              input.destinationPatientId,
          ),
        ],
        work: async ({
          session,
          transactionId,
          operationKey,
        }) => {
          const deposit =
            await this.dependencies.deposits.findById(
              actor.facilityId,
              depositId,
              session,
            );

          if (deposit === null) {
            throw new DepositNotFoundError();
          }

          if (
            deposit.version !==
            input.expectedDepositVersion
          ) {
            throw new PaymentCashierConcurrencyError();
          }

          const amount =
            new Decimal(
              input.amount,
            );
          const available =
            new Decimal(
              deposit.availableAmount.toString(),
            );

          if (
            amount.greaterThan(
              available,
            )
          ) {
            throw new DepositBalanceError();
          }

          const approval =
            await this.dependencies.approvals.requireApproved(
              actor.facilityId,
              input.approvalRequestId,
              'DEPOSIT_TRANSFER',
              deposit.createdBy.toHexString(),
              session,
            );
          const destinationAccount =
            input.destinationPatientAccountId == null
              ? null
              : await this.dependencies.billing.resolvePatientAccount(
                  actor.facilityId,
                  input.destinationPatientAccountId,
                  session,
                );

          if (
            destinationAccount !== null &&
            destinationAccount.patientId.toHexString() !==
              input.destinationPatientId
          ) {
            throw new DepositBalanceError();
          }

          const now =
            this.dependencies.clock.now();
          const destinationNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.DEPOSIT,
              now,
              session,
            );
          const destination =
            await this.dependencies.deposits.create(
              actor.facilityId,
              {
                paymentId:
                  deposit.paymentId.toHexString(),
                patientAccountId:
                  input.destinationPatientAccountId,
                depositType:
                  'GENERAL_ADVANCE',
              },
              {
                operationKey:
                  `${operationKey}:destination`,
                depositNumber:
                  destinationNumber,
                patientId:
                  input.destinationPatientId,
                originalAmount:
                  input.amount,
                currency:
                  deposit.currency,
                receivedAt:
                  now,
                actorUserId:
                  actor.userId,
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const ledgerAccountId =
            await this.resolveDepositControlLedgerAccount(
              actor.facilityId,
              deposit.paymentId.toHexString(),
              session,
            );
          const ledgerTransaction =
            await this.dependencies.ledger.postBalancedTransaction(
              {
                operationKey:
                  `${operationKey}:ledger`,
                facilityId:
                  actor.facilityId,
                sourceEntityType:
                  'DEPOSIT_TRANSFER',
                sourceEntityId:
                  depositId,
                patientId:
                  deposit.patientId.toHexString(),
                patientAccountId:
                  deposit.patientAccountId?.toHexString() ??
                  null,
                paymentId:
                  deposit.paymentId.toHexString(),
                currency:
                  deposit.currency,
                description:
                  `Deposit ${deposit.depositNumber} transferred`,
                postedAt:
                  now,
                postedBy:
                  actor.userId,
                entries: [
                  {
                    ledgerAccountId,
                    direction:
                      'DEBIT',
                    amount:
                      input.amount,
                    description:
                      'Source patient credit transfer',
                  },
                  {
                    ledgerAccountId,
                    direction:
                      'CREDIT',
                    amount:
                      input.amount,
                    description:
                      'Destination patient credit transfer',
                  },
                ],
                transactionId,
                correlationId:
                  actor.correlationId,
              },
              session,
            );
          const transferNumber =
            await this.dependencies.sequences.next(
              actor.facilityId,
              PAYMENT_CASHIER_SEQUENCE_KEYS.DEPOSIT_TRANSFER,
              now,
              session,
            );

          await this.dependencies.deposits.createTransfer(
            input,
            {
              operationKey:
                `${operationKey}:transfer`,
              transferNumber,
              deposit,
              destinationDepositId:
                destination._id.toHexString(),
              approvedBy:
                approval.decidedBy!.toHexString(),
              transferredAt:
                now,
              financialLedgerTransactionId:
                ledgerTransaction._id.toHexString(),
              actorUserId:
                actor.userId,
              transactionId,
              correlationId:
                actor.correlationId,
            },
            session,
          );

          const nextAvailable =
            available.minus(
              amount,
            );
          const updated =
            await this.dependencies.deposits.update(
              actor.facilityId,
              depositId,
              deposit.version,
              {
                availableAmount:
                  paymentCashierDecimal128(
                    nextAvailable.toFixed(),
                    'availableAmount',
                  ),
                transferredAmount:
                  paymentCashierDecimal128(
                    new Decimal(
                      deposit.transferredAmount.toString(),
                    )
                      .plus(amount)
                      .toFixed(),
                    'transferredAmount',
                  ),
                status:
                  nextAvailable.isZero()
                    ? 'TRANSFERRED'
                    : 'PARTIALLY_TRANSFERRED',
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
            projectDeposit(
              destination,
            );

          await this.writeDepositEvent(
            actor,
            transactionId,
            now,
            view,
            'TRANSFERRED',
            PAYMENT_CASHIER_AUDIT_ACTIONS.DEPOSIT_TRANSFERRED,
            PAYMENT_CASHIER_EVENT_TYPES.DEPOSIT_TRANSFERRED,
            input.amount,
            session,
          );

          return view;
        },
      });

    await this.publish(
      actor.facilityId,
      result,
    );

    return result;
  }

  private async resolveDepositControlLedgerAccount(
    facilityId:
      string,
    paymentId:
      string,
    session:
      Parameters<
        PaymentFinancialRepositoryPort['listTenders']
      >[2],
  ): Promise<string> {
    const tenders =
      await this.dependencies.payments.listTenders(
        facilityId,
        paymentId,
        session,
      );
    const first =
      tenders[0];

    if (first === undefined) {
      throw new PaymentOutstandingBalanceError();
    }

    const method =
      await this.dependencies.configuration.findPaymentMethodById(
        facilityId,
        first.paymentMethodConfigurationId.toHexString(),
        session,
      );
    const accountId =
      method?.receivableLedgerAccountId;

    if (accountId === null || accountId === undefined) {
      throw new PaymentOutstandingBalanceError();
    }

    return accountId.toHexString();
  }

  private async writeDepositEvent(
    actor:
      PaymentCashierActorContext,
    transactionId:
      string,
    occurredAt:
      Date,
    deposit:
      DepositView,
    action:
      'APPLIED' | 'TRANSFERRED',
    auditAction:
      string,
    eventType:
      string,
    amount:
      string,
    session:
      NonNullable<
        Parameters<
          PaymentFinancialRepositoryPort['findPaymentById']
        >[2]
      >,
  ): Promise<void> {
    await this.dependencies.commandSupport.appendHistory({
      actor,
      transactionId,
      entityType:
        'DEPOSIT',
      entityId:
        deposit.id,
      action,
      occurredAt,
      session,
      amount,
      currency:
        deposit.currency,
      patientId:
        deposit.patientId,
      patientAccountId:
        deposit.patientAccountId,
      paymentId:
        deposit.paymentId,
      metadata: {
        depositNumber:
          deposit.depositNumber,
        status:
          deposit.status,
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
            auditAction,
          entityType:
            'DEPOSIT',
          entityId:
            deposit.id,
          after: {
            depositNumber:
              deposit.depositNumber,
            amount,
            status:
              deposit.status,
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
            'DEPOSIT',
          aggregateId:
            deposit.id,
          eventType,
          payload: {
            depositId:
              deposit.id,
            patientAccountId:
              deposit.patientAccountId,
            status:
              deposit.status,
          },
          correlationId:
            actor.correlationId,
          transactionId,
          occurredAt,
        },
        session,
      ),
    ]);
  }

  private async publish(
    facilityId:
      string,
    deposit:
      DepositView,
  ): Promise<void> {
    await this.dependencies.realtime.publishMinimumNecessary({
      facilityId,
      eventType:
        PAYMENT_CASHIER_REALTIME_EVENTS.DEPOSIT_CHANGED,
      entityId:
        deposit.id,
      status:
        deposit.status,
      occurredAt:
        this.dependencies.clock.now().toISOString(),
    });
  }
}