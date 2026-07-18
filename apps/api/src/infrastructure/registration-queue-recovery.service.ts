import {
  randomUUID,
} from 'node:crypto';

import type {
  DatabaseObjectId,
  Db,
} from '@hospital-mis/database';

import type {
  RegistrationQueueTransactionCompensation,
} from '../modules/registration-queue/registration-queue.ports.js';

import {
  REGISTRATION_QUEUE_RECOVERY_MODES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
  type RegistrationQueueRecoveryMode,
} from '../modules/registration-queue/registration-queue.transaction.constants.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

import type {
  RegistrationQueueCompensationExecutorPort,
} from './registration-queue-compensation.executor.js';

type RegistrationQueueRecoveryCompensation =
  RegistrationQueueTransactionCompensation & {
    status:
      | 'PENDING'
      | 'COMPENSATING'
      | 'COMPENSATED'
      | 'FAILED';

    registeredAt:
      Date;

    completedAt?:
      Date | null;

    error?:
      Record<string, string> | null;
  };

type RecoveryTransaction = {
  _id:
    DatabaseObjectId;

  facilityId:
    DatabaseObjectId;

  transactionId:
    string;

  transactionType:
    string;

  idempotencyKey:
    string;

  status:
    string;

  recoveryStatus?:
    string;

  retryCount:
    number;

  updatedAt:
    Date;

  completionTimestamp?:
    Date;

  registrationQueueRecoveryLeaseOwner?:
    string;

  registrationQueueRecoveryLeaseToken?:
    string;

  registrationQueueRecoveryLeaseExpiresAt?:
    Date;

  registrationQueueRecoveryMode?:
    RegistrationQueueRecoveryMode;

  registrationQueueResultSnapshot?:
    unknown;

  registrationQueueDomainCompletedAt?:
    Date;

  registrationQueueIdempotencyOwnerId?:
    string;

  registrationQueueCompensations?:
    RegistrationQueueRecoveryCompensation[];

  errorDetails?:
    unknown;

  version:
    number;
};

const registrationQueueTransactionTypes =
  Object.values(
    REGISTRATION_QUEUE_TRANSACTION_TYPES,
  );

type IdempotencyRecoveryRecord = {
  facilityId:
    DatabaseObjectId;

  scope:
    string;

  key:
    string;

  status:
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED';

  ownerId:
    string;

  responseSnapshot?:
    unknown;
};

function safeError(
  error: unknown,
): Record<string, string> {
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof error,

    message:
      error instanceof Error
        ? error.message.slice(
            0,
            1_500,
          )
        : 'Unknown registration and queue recovery error',
  };
}

export interface RegistrationQueueRecoveryServiceOptions {
  database:
    Db;

  idempotency:
    IdempotencyService;

  outbox:
    OutboxService;

  compensationExecutor:
    RegistrationQueueCompensationExecutorPort;

  leaseMilliseconds?:
    number;
}

export class RegistrationQueueRecoveryService {
  private readonly leaseMilliseconds:
    number;

  public constructor(
    private readonly options:
      RegistrationQueueRecoveryServiceOptions,
  ) {
    this.leaseMilliseconds =
      options.leaseMilliseconds ??
      60_000;

    if (
      !Number.isSafeInteger(
        this.leaseMilliseconds,
      ) ||
      this.leaseMilliseconds <=
        0
    ) {
      throw new TypeError(
        'Registration and queue recovery lease must be a positive safe integer',
      );
    }
  }

  public async markStaleTransactions(
    staleBefore: Date,
  ): Promise<number> {
    const collection =
      this.options.database
        .collection<RecoveryTransaction>(
          'applicationTransactions',
        );

    const completedDomain =
      await collection.updateMany(
        {
          transactionType: {
            $in:
              registrationQueueTransactionTypes,
          },

          status: {
            $in: [
              'PENDING',
              'IN_PROGRESS',
              'COMPENSATING',
            ],
          },

          updatedAt: {
            $lt:
              staleBefore,
          },

          registrationQueueDomainCompletedAt: {
            $type:
              'date',
          },
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'PENDING',

            registrationQueueRecoveryMode:
              REGISTRATION_QUEUE_RECOVERY_MODES
                .FINALIZE_COMPLETED,
          },

          $inc: {
            retryCount:
              1,

            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    const incompleteDomain =
      await collection.updateMany(
        {
          transactionType: {
            $in:
              registrationQueueTransactionTypes,
          },

          status: {
            $in: [
              'PENDING',
              'IN_PROGRESS',
              'COMPENSATING',
            ],
          },

          updatedAt: {
            $lt:
              staleBefore,
          },

          registrationQueueDomainCompletedAt: {
            $exists:
              false,
          },
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'PENDING',

            registrationQueueRecoveryMode:
              REGISTRATION_QUEUE_RECOVERY_MODES
                .COMPENSATE,
          },

          $inc: {
            retryCount:
              1,

            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    return (
      completedDomain.modifiedCount +
      incompleteDomain.modifiedCount
    );
  }

  public async recoverAvailable(
    input: Readonly<{
      workerId: string;
      maxTransactions?: number;
      now?: Date;
    }>,
  ): Promise<{
    recovered: number;
    failed: number;
  }> {
    const maxTransactions =
      Math.max(
        1,
        Math.min(
          input.maxTransactions ??
            10,
          100,
        ),
      );

    let recovered =
      0;

    let failed =
      0;

    for (
      let index =
        0;

      index <
      maxTransactions;

      index +=
      1
    ) {
      const transaction =
        await this.leaseNext({
          workerId:
            input.workerId,

          now:
            input.now ??
            new Date(),
        });

      if (
        transaction ===
        null
      ) {
        break;
      }

      try {
        await this.recoverTransaction(
          transaction,
        );

        recovered +=
          1;
      } catch (error) {
        failed +=
          1;

        await this.markRecoveryFailure(
          transaction,
          error,
        );
      }
    }

    return {
      recovered,
      failed,
    };
  }

  private async leaseNext(
    input: Readonly<{
      workerId: string;
      now: Date;
    }>,
  ): Promise<RecoveryTransaction | null> {
    const leaseToken =
      randomUUID();

    return this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .findOneAndUpdate(
        {
          transactionType: {
            $in:
              registrationQueueTransactionTypes,
          },

          status:
            'RECOVERY_REQUIRED',

          $or: [
            {
              registrationQueueRecoveryLeaseExpiresAt: {
                $exists:
                  false,
              },
            },
            {
              registrationQueueRecoveryLeaseExpiresAt: {
                $lte:
                  input.now,
              },
            },
          ],
        },
        {
          $set: {
            recoveryStatus:
              'PROCESSING',

            registrationQueueRecoveryLeaseOwner:
              input.workerId,

            registrationQueueRecoveryLeaseToken:
              leaseToken,

            registrationQueueRecoveryLeaseExpiresAt:
              new Date(
                input.now.getTime() +
                  this.leaseMilliseconds,
              ),
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
        {
          sort: {
            updatedAt:
              1,
          },

          returnDocument:
            'after',
        },
      );
  }

  private async recoverTransaction(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    const mode =
      transaction
        .registrationQueueRecoveryMode ??
      (
        transaction
          .registrationQueueDomainCompletedAt ===
        undefined
          ? REGISTRATION_QUEUE_RECOVERY_MODES
              .COMPENSATE
          : REGISTRATION_QUEUE_RECOVERY_MODES
              .FINALIZE_COMPLETED
      );

    if (
      mode ===
      REGISTRATION_QUEUE_RECOVERY_MODES
        .FINALIZE_COMPLETED
    ) {
      await this.finalizeCompletedTransaction(
        transaction,
      );

      return;
    }

    await this.compensateTransaction(
      transaction,
    );
  }

  private async finalizeCompletedTransaction(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    if (
      transaction
        .registrationQueueResultSnapshot ===
      undefined
    ) {
      throw new Error(
        'Completed registration and queue transaction has no recoverable result snapshot',
      );
    }

    if (
      transaction
        .registrationQueueIdempotencyOwnerId ===
      undefined
    ) {
      throw new Error(
        'Completed registration and queue transaction has no idempotency owner',
      );
    }

    const idempotency =
      await this.options.database
        .collection<IdempotencyRecoveryRecord>(
          'idempotencyKeys',
        )
        .findOne({
          facilityId:
            transaction.facilityId,

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,
        });

    if (
      idempotency?.status !==
      'COMPLETED'
    ) {
      await this.options
        .idempotency
        .complete({
          facilityId:
            transaction.facilityId
              .toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction
              .registrationQueueIdempotencyOwnerId,

          response:
            transaction
              .registrationQueueResultSnapshot as never,
        });
    }

    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,
        },
        {
          $set: {
            status:
              'COMPLETED',

            recoveryStatus:
              'FINALIZING',

            completionTimestamp:
              new Date(),
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    await this.options.outbox
      .releaseTransactionEvents(
        transaction.transactionId,
      );

    await this.completeRecovery(
      transaction.transactionId,
      'COMPLETED',
    );
  }

  private async compensateTransaction(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,
        },
        {
          $set: {
            status:
              'COMPENSATING',

            recoveryStatus:
              'COMPENSATING',
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    const compensations = [
      ...(
        transaction
          .registrationQueueCompensations ??
        []
      ),
    ].sort(
      (
        left,
        right,
      ) =>
        right.registeredAt
          .getTime() -
        left.registeredAt
          .getTime(),
    );

    for (
      const compensation of
      compensations
    ) {
      if (
        compensation.status ===
        'COMPENSATED'
      ) {
        continue;
      }

      await this.setCompensationStatus(
        transaction.transactionId,
        compensation.key,
        'COMPENSATING',
      );

      try {
        await this.options
          .compensationExecutor
          .execute(
            compensation,
          );

        await this.setCompensationStatus(
          transaction.transactionId,
          compensation.key,
          'COMPENSATED',
        );
      } catch (error) {
        await this.setCompensationStatus(
          transaction.transactionId,
          compensation.key,
          'FAILED',
          safeError(
            error,
          ),
        );

        throw error;
      }
    }

    if (
      transaction
        .registrationQueueIdempotencyOwnerId !==
      undefined
    ) {
      await this.options
        .idempotency
        .fail({
          facilityId:
            transaction.facilityId
              .toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction
              .registrationQueueIdempotencyOwnerId,

          error:
            (
              transaction.errorDetails ??
              {
                message:
                  'Registration and queue transaction was compensated during recovery',
              }
            ) as never,
        });
    }

    await this.options.database
      .collection(
        'applicationTransactionSteps',
      )
      .updateMany(
        {
          transactionId:
            transaction.transactionId,
        },
        {
          $set: {
            status:
              'COMPENSATED',

            compensatedAt:
              new Date(),
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    await this.options.database
      .collection(
        'outboxEvents',
      )
      .updateMany(
        {
          transactionId:
            transaction.transactionId,

          status:
            'BLOCKED',
        },
        {
          $set: {
            status:
              'DEAD_LETTER',

            lastError: {
              code:
                'TRANSACTION_COMPENSATED',

              message:
                'Event suppressed because the registration and queue transaction was compensated',
            },
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );

    await this.completeRecovery(
      transaction.transactionId,
      'COMPENSATED',
    );
  }

  private async completeRecovery(
    transactionId: string,
    status:
      | 'COMPLETED'
      | 'COMPENSATED',
  ): Promise<void> {
    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId,
        },
        {
          $set: {
            status,

            recoveryStatus:
              'COMPLETED',

            completionTimestamp:
              new Date(),
          },

          $unset: {
            registrationQueueRecoveryMode:
              '',

            registrationQueueRecoveryLeaseOwner:
              '',

            registrationQueueRecoveryLeaseToken:
              '',

            registrationQueueRecoveryLeaseExpiresAt:
              '',
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );
  }

  private async markRecoveryFailure(
    transaction:
      RecoveryTransaction,

    error: unknown,
  ): Promise<void> {
    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'FAILED',

            errorDetails: {
              previous:
                transaction.errorDetails ??
                null,

              recoveryError:
                safeError(
                  error,
                ),
            },
          },

          $unset: {
            registrationQueueRecoveryLeaseOwner:
              '',

            registrationQueueRecoveryLeaseToken:
              '',

            registrationQueueRecoveryLeaseExpiresAt:
              '',
          },

          $inc: {
            retryCount:
              1,

            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );
  }

  private async setCompensationStatus(
    transactionId: string,
    compensationKey: string,
    status:
      RegistrationQueueRecoveryCompensation['status'],
    error?:
      Record<string, string>,
  ): Promise<void> {
    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId,

          'registrationQueueCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'registrationQueueCompensations.$[item].status':
              status,

            'registrationQueueCompensations.$[item].completedAt':
              status ===
                'COMPENSATED' ||
              status ===
                'FAILED'
                ? new Date()
                : null,

            'registrationQueueCompensations.$[item].error':
              error ??
              null,
          },

          $inc: {
            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
        {
          arrayFilters: [
            {
              'item.key':
                compensationKey,
            },
          ],
        },
      );
  }
}