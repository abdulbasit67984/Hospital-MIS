import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

import type {
  PaymentOperationalAction,
  PaymentOperationalEntityType,
} from '../payments-cashier-shifts.constants.js';

import type {
  PaymentCashierDistributedLockPort,
  PaymentCashierIdempotencyPort,
  PaymentCashierSequencePort,
  PaymentCashierTransactionManagerPort,
  PaymentOperationalHistoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentCashierMongoSession,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  PAYMENT_CASHIER_SEQUENCE_KEYS,
} from '../payments-cashier-shifts.operations.js';

import {
  nullablePaymentCashierObjectId,
  paymentCashierDecimal128,
  paymentCashierOperationKey,
  paymentCashierRequestHash,
  paymentCashierSnapshotHash,
} from '../payments-cashier-shifts.normalization.js';

export interface PaymentCashierCommandContext {
  actor: PaymentCashierActorContext;
  idempotencyKey: string;
}

export interface PaymentCashierCommandExecution<T> {
  operation: string;
  command: PaymentCashierCommandContext;
  payload: unknown;
  lockKeys: readonly string[];
  work(
    context: Readonly<{
      session: PaymentCashierMongoSession;
      transactionId: string;
      operationKey: string;
    }>,
  ): Promise<T>;
}

export interface PaymentCashierHistoryInput {
  actor: PaymentCashierActorContext;
  transactionId: string;
  entityType: PaymentOperationalEntityType;
  entityId: string;
  action: PaymentOperationalAction;
  occurredAt: Date;
  session: PaymentCashierMongoSession;
  statusFrom?: string | null;
  statusTo?: string | null;
  amount?: string | null;
  currency?: string | null;
  reasonCode?: string | null;
  reason?: string | null;
  approvalRequestId?: string | null;
  cashCounterId?: string | null;
  cashShiftId?: string | null;
  paymentMethodConfigurationId?: string | null;
  patientId?: string | null;
  patientAccountId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  receiptId?: string | null;
  metadata?: Record<string, unknown>;
}

export class PaymentCashierCommandSupport {
  public constructor(
    private readonly idempotency: PaymentCashierIdempotencyPort,
    private readonly locks: PaymentCashierDistributedLockPort,
    private readonly transactions: PaymentCashierTransactionManagerPort,
    private readonly history: PaymentOperationalHistoryPort,
    private readonly sequences: PaymentCashierSequencePort,
  ) {}

  public async execute<T>(
    input: PaymentCashierCommandExecution<T>,
  ): Promise<T> {
    const { actor } = input.command;
    const requestHash = paymentCashierRequestHash(input.payload);
    const deterministicOperationKey = paymentCashierOperationKey(
      input.operation,
      actor.facilityId,
      input.command.idempotencyKey,
    );

    const claim = await this.idempotency.begin({
      facilityId: actor.facilityId,
      operation: input.operation,
      idempotencyKey: input.command.idempotencyKey,
      requestHash,
      actorUserId: actor.userId,
      correlationId: actor.correlationId,
    });

    const operationKey = claim.operationKey.trim().length === 0
      ? deterministicOperationKey
      : claim.operationKey;

    if (claim.state === 'REPLAY') {
      return claim.response as T;
    }

    if (claim.state === 'IN_PROGRESS') {
      throw new ConflictError(
        'The same financial operation is already in progress',
      );
    }

    if (claim.state === 'CONFLICT') {
      throw new ConflictError(
        'The idempotency key was already used with a different request',
      );
    }

    const orderedLockKeys = [...new Set(input.lockKeys)].sort();

    const runWithLocks = async (
      index: number,
    ): Promise<T> => {
      const lockKey = orderedLockKeys[index];

      if (lockKey === undefined) {
        return this.transactions.run(
          {
            facilityId: actor.facilityId,
            actorUserId: actor.userId,
            correlationId: actor.correlationId,
            operation: input.operation,
            operationKey,
          },
          async (session, transactionId) =>
            input.work({
              session,
              transactionId,
              operationKey,
            }),
        );
      }

      return this.locks.withLock(lockKey, operationKey, () =>
        runWithLocks(index + 1),
      );
    };

    try {
      const result = await runWithLocks(0);
      await this.idempotency.complete(operationKey, result);
      return result;
    } catch (error) {
      await this.idempotency.fail(
        operationKey,
        error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      );
      throw error;
    }
  }

  public async appendHistory(
    input: PaymentCashierHistoryInput,
  ): Promise<void> {
    const eventNumber = await this.sequences.next(
      input.actor.facilityId,
      PAYMENT_CASHIER_SEQUENCE_KEYS.OPERATIONAL_HISTORY,
      input.occurredAt,
      input.session,
    );

    const metadata = input.metadata ?? {};

    await this.history.append(
      {
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'actor.userId'),
        updatedBy: toObjectId(input.actor.userId, 'actor.userId'),
        operationKey: `${input.transactionId}:history:${input.entityType}:${input.entityId}:${input.action}`,
        eventNumber,
        entityType: input.entityType,
        entityId: toObjectId(input.entityId, 'entityId'),
        action: input.action,
        statusFrom: input.statusFrom ?? null,
        statusTo: input.statusTo ?? null,
        amount:
          input.amount == null
            ? null
            : paymentCashierDecimal128(input.amount, 'history.amount'),
        currency: input.currency ?? null,
        reasonCode: input.reasonCode ?? null,
        reason: input.reason ?? null,
        actorUserId: toObjectId(input.actor.userId, 'actor.userId'),
        actorStaffId: toObjectId(input.actor.staffId, 'actor.staffId'),
        approvalRequestId: nullablePaymentCashierObjectId(
          input.approvalRequestId,
          'approvalRequestId',
        ),
        cashCounterId: nullablePaymentCashierObjectId(
          input.cashCounterId,
          'cashCounterId',
        ),
        cashShiftId: nullablePaymentCashierObjectId(
          input.cashShiftId,
          'cashShiftId',
        ),
        paymentMethodConfigurationId: nullablePaymentCashierObjectId(
          input.paymentMethodConfigurationId,
          'paymentMethodConfigurationId',
        ),
        patientId: nullablePaymentCashierObjectId(input.patientId, 'patientId'),
        patientAccountId: nullablePaymentCashierObjectId(
          input.patientAccountId,
          'patientAccountId',
        ),
        invoiceId: nullablePaymentCashierObjectId(input.invoiceId, 'invoiceId'),
        paymentId: nullablePaymentCashierObjectId(input.paymentId, 'paymentId'),
        refundId: nullablePaymentCashierObjectId(input.refundId, 'refundId'),
        receiptId: nullablePaymentCashierObjectId(input.receiptId, 'receiptId'),
        occurredAt: input.occurredAt,
        snapshotHash: paymentCashierSnapshotHash({
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          statusFrom: input.statusFrom ?? null,
          statusTo: input.statusTo ?? null,
          amount: input.amount ?? null,
          currency: input.currency ?? null,
          reasonCode: input.reasonCode ?? null,
          reason: input.reason ?? null,
          metadata,
          occurredAt: input.occurredAt.toISOString(),
        }),
        metadata,
      },
      input.session,
    );
  }
}