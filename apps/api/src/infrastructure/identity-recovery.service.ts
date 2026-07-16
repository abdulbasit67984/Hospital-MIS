import {
  randomUUID,
} from 'node:crypto';

import type {
  Db,
  DatabaseObjectId,
} from '@hospital-mis/database';

import type {
  IdempotencyService,
} from '../../../infrastructure/idempotency.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  IdentityTransactionCompensation,
} from '../identity.ports.js';

import type {
  IdentityCompensationExecutorPort,
} from './identity-compensation.executor.js';

import {
  IDENTITY_RECOVERY_MODES,
  type IdentityRecoveryMode,
} from './identity-transaction-manager.adapter.js';

type RecoveryCompensation =
  IdentityTransactionCompensation & {
    status:
      | 'PENDING'
      | 'COMPENSATING'
      | 'COMPENSATED'
      | 'FAILED';

    registeredAt:
      Date;
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

  identityRecoveryLeaseOwner?:
    string;

  identityRecoveryLeaseToken?:
    string;

  identityRecoveryLeaseExpiresAt?:
    Date;

  errorDetails?:
    unknown;

  identityRecoveryMode?:
    IdentityRecoveryMode;

  identityResultSnapshot?:
    unknown;

  identityDomainCompletedAt?:
    Date;

  identityIdempotencyOwnerId?:
    string;

  identityCompensations?:
    RecoveryCompensation[];

  version:
    number;
};

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
            1500,
          )
        : 'Unknown identity recovery error',
  };
}

export interface IdentityRecoveryServiceOptions {
  database:
    Db;

  idempotency:
    IdempotencyService;

  outbox:
    OutboxService;

  compensationExecutor:
    IdentityCompensationExecutorPort;

  leaseMilliseconds?:
    number;
}

export class IdentityRecoveryService {
  private readonly leaseMilliseconds:
    number;

  public constructor(
    private readonly options:
      IdentityRecoveryServiceOptions,
  ) {
    this.leaseMilliseconds =
      options.leaseMilliseconds ??
      60_000;
  }

  public async markStaleTransactions(
    staleBefore:
      Date,
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
            $regex:
              '^IDENTITY_',
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

          identityDomainCompletedAt: {
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

            identityRecoveryMode:
              IDENTITY_RECOVERY_MODES
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
            $regex:
              '^IDENTITY_',
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

          identityDomainCompletedAt: {
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

            identityRecoveryMode:
              IDENTITY_RECOVERY_MODES
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
    input:
      Readonly<{
        workerId:
          string;

        maxTransactions?:
          number;

        now?:
          Date;
      }>,
  ): Promise<{
    recovered:
      number;

    failed:
      number;
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
      let index = 0;
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
    input:
      Readonly<{
        workerId:
          string;

        now:
          Date;
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
            $regex:
              '^IDENTITY_',
          },

          status:
            'RECOVERY_REQUIRED',

          $or: [
            {
              identityRecoveryLeaseExpiresAt: {
                $exists:
                  false,
              },
            },
            {
              identityRecoveryLeaseExpiresAt: {
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

            identityRecoveryLeaseOwner:
              input.workerId,

            identityRecoveryLeaseToken:
              leaseToken,

            identityRecoveryLeaseExpiresAt:
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
      transaction.identityRecoveryMode ??
      (
        transaction.identityDomainCompletedAt ===
          undefined
          ? IDENTITY_RECOVERY_MODES
              .COMPENSATE
          : IDENTITY_RECOVERY_MODES
              .FINALIZE_COMPLETED
      );

    if (
      mode ===
      IDENTITY_RECOVERY_MODES
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
      transaction.identityResultSnapshot ===
      undefined
    ) {
      throw new Error(
        'Completed identity transaction has no recoverable result snapshot',
      );
    }

    const ownerId =
      transaction.identityIdempotencyOwnerId;

    if (
      ownerId ===
      undefined
    ) {
      throw new Error(
        'Completed identity transaction has no idempotency owner',
      );
    }

    const facilityId =
      transaction.facilityId
        .toHexString();

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
      await this.options.idempotency
        .complete({
          facilityId,

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId,

          response:
            transaction.identityResultSnapshot as never,
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

    const compensations =
      [
        ...(
          transaction.identityCompensations ??
          []
        ),
      ]
        .sort(
          (
            left,
            right,
          ) =>
            right.registeredAt.getTime() -
            left.registeredAt.getTime(),
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
      transaction.identityIdempotencyOwnerId !==
      undefined
    ) {
      await this.options.idempotency
        .fail({
          facilityId:
            transaction.facilityId
              .toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction.identityIdempotencyOwnerId,

          error:
            (
              transaction.errorDetails ??
              {
                message:
                  'Identity transaction was compensated during recovery',
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
            identityRecoveryMode:
              '',

            identityRecoveryLeaseOwner:
              '',

            identityRecoveryLeaseToken:
              '',

            identityRecoveryLeaseExpiresAt:
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

    error:
      unknown,
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
            identityRecoveryLeaseOwner:
              '',

            identityRecoveryLeaseToken:
              '',

            identityRecoveryLeaseExpiresAt:
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
      RecoveryCompensation[
        'status'
      ],

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

          'identityCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'identityCompensations.$[item].status':
              status,

            'identityCompensations.$[item].completedAt':
              status ===
                'COMPENSATED' ||
              status ===
                'FAILED'
                ? new Date()
                : null,

            'identityCompensations.$[item].error':
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