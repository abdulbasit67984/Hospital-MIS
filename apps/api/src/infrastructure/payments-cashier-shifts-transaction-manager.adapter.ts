import {
  randomUUID,
} from 'node:crypto';

import mongoose from 'mongoose';

import type {
  ClientSession,
} from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  PaymentCashierRecoveryRequiredError,
} from '../modules/payments-cashier-shifts/payments-cashier-shifts.errors.js';

import type {
  PaymentCashierTransactionManagerPort,
} from '../modules/payments-cashier-shifts/payments-cashier-shifts.ports.js';

import type {
  ApplicationTransactionRepository,
} from './application-transaction.js';

import type {
  OutboxService,
} from './outbox.service.js';

import type {
  RecoverableInfrastructure,
  RecoveryCycleResult,
} from './recovery-loop.js';

function errorSummary(error: unknown): Readonly<{
  name: string;
  message: string;
}> {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error
      ? error.message.slice(0, 2_000)
      : 'Unknown payment transaction failure',
  };
}

export class MongoPaymentsCashierShiftsTransactionManagerAdapter
implements PaymentCashierTransactionManagerPort, RecoverableInfrastructure {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly outbox: OutboxService,
  ) {}

  public async run<T>(
    context: Readonly<{
      facilityId: string;
      actorUserId: string;
      correlationId: string;
      operation: string;
      operationKey: string;
    }>,
    work: (
      session: ClientSession,
      transactionId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const transactionId = randomUUID();
    const session = await mongoose.startSession();
    let transactionCreated = false;
    let domainCommitted = false;
    let result: T | undefined;

    try {
      await this.transactions.create({
        facilityId: context.facilityId,
        transactionId,
        transactionType: context.operation,
        idempotencyKey: context.operationKey,
        correlationId: context.correlationId,
        initiatedBy: context.actorUserId,
        contextSnapshot: {
          operationKey: context.operationKey,
        },
        relatedEntities: {
          module: 'PAYMENTS_CASHIER_SHIFTS',
        },
        stepNames: [
          'EXECUTE_PAYMENTS_CASHIER_DOMAIN_TRANSACTION',
        ],
      });
      transactionCreated = true;

      await this.transactions.setStatus(transactionId, 'IN_PROGRESS');
      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTING');

      await session.withTransaction(async () => {
        result = await work(session, transactionId);
      });
      domainCommitted = true;

      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTED');
      await this.transactions.setStepStatus(transactionId, 0, 'VERIFIED');
      await this.transactions.setStatus(transactionId, 'COMPLETED');
      await this.outbox.releaseTransactionEvents(transactionId);

      if (result === undefined) {
        throw new Error('Payment transaction completed without a result');
      }

      return result;
    } catch (error) {
      if (!domainCommitted) {
        if (transactionCreated) {
          await this.transactions
            .setStepStatus(transactionId, 0, 'FAILED', errorSummary(error))
            .catch(() => undefined);
          await this.transactions
            .setStatus(transactionId, 'FAILED', errorSummary(error))
            .catch(() => undefined);
        }

        throw error;
      }

      await this.database.collection('applicationTransactions').updateOne(
        {
          transactionId,
        },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            recoveryStatus: 'PAYMENTS_FINALIZATION_PENDING',
            errorDetails: errorSummary(error),
            'relatedEntities.finalization': {
              operationKey: context.operationKey,
            },
          },
          $inc: {
            version: 1,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
      );

      throw new PaymentCashierRecoveryRequiredError(
        'The payment operation committed and finalization will be recovered safely',
        error,
      );
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  public async markStaleTransactions(
    staleBefore: Date,
  ): Promise<number> {
    const result = await this.database.collection('applicationTransactions').updateMany(
      {
        transactionType: {
          $regex: /^PAYMENTS_/u,
        },
        status: {
          $in: ['PENDING', 'IN_PROGRESS'],
        },
        updatedAt: {
          $lt: staleBefore,
        },
      },
      {
        $set: {
          status: 'RECOVERY_REQUIRED',
          recoveryStatus: 'PAYMENTS_STALE_TRANSACTION',
        },
        $inc: {
          version: 1,
        },
        $currentDate: {
          updatedAt: true,
        },
      },
    );

    return result.modifiedCount;
  }

  public async recoverAvailable(input: Readonly<{
    workerId: string;
    maxTransactions: number;
    now: Date;
  }>): Promise<RecoveryCycleResult> {
    const transactions = await this.database.collection<{
      transactionId: string;
      recoveryStatus?: string;
    }>('applicationTransactions')
      .find({
        transactionType: {
          $regex: /^PAYMENTS_/u,
        },
        status: 'RECOVERY_REQUIRED',
        recoveryStatus: {
          $in: [
            'PAYMENTS_FINALIZATION_PENDING',
            'PAYMENTS_STALE_TRANSACTION',
          ],
        },
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(input.maxTransactions, 500)))
      .toArray();

    let recovered = 0;
    let failed = 0;

    for (const transaction of transactions) {
      try {
        if (transaction.recoveryStatus === 'PAYMENTS_FINALIZATION_PENDING') {
          await this.transactions.setStatus(transaction.transactionId, 'COMPLETED', {
            recoveredBy: input.workerId,
            recoveredAt: input.now.toISOString(),
          });
          await this.outbox.releaseTransactionEvents(transaction.transactionId);
        } else {
          await this.transactions.setStatus(transaction.transactionId, 'MANUALLY_RESOLVED', {
            recoveredBy: input.workerId,
            recoveredAt: input.now.toISOString(),
            resolution: 'Stale transaction contained no committed finalization marker',
          });
        }

        await this.database.collection('applicationTransactions').updateOne(
          {
            transactionId: transaction.transactionId,
          },
          {
            $unset: {
              recoveryStatus: '',
            },
            $inc: {
              version: 1,
            },
            $currentDate: {
              updatedAt: true,
            },
          },
        );

        recovered += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      recovered,
      failed,
    };
  }
}