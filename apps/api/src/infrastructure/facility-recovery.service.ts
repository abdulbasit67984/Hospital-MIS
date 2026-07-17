import {
  randomUUID,
} from 'node:crypto';

import type {
  DatabaseObjectId,
  Db,
} from '@hospital-mis/database';

import type {
  FacilityTransactionCompensation,
} from '../modules/facility/facility.ports.js';

import {
  FACILITY_RECOVERY_MODES,
  type FacilityRecoveryMode,
} from '../modules/facility/facility.transaction.constants.js';

import type {
  FacilityCompensationExecutorPort,
} from './facility-compensation.executor.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

type RecoveryCompensation =
  FacilityTransactionCompensation & {
    status:
      | 'PENDING'
      | 'COMPENSATING'
      | 'COMPENSATED'
      | 'FAILED';

    registeredAt: Date;
    completedAt?: Date | null;
    error?: Record<string, string> | null;
  };

type RecoveryTransaction = {
  _id: DatabaseObjectId;
  facilityId: DatabaseObjectId;

  transactionId: string;
  transactionType: string;
  idempotencyKey: string;

  status: string;
  recoveryStatus?: string;

  retryCount: number;
  updatedAt: Date;
  completionTimestamp?: Date;

  facilityRecoveryLeaseOwner?: string;
  facilityRecoveryLeaseToken?: string;
  facilityRecoveryLeaseExpiresAt?: Date;

  facilityRecoveryMode?:
    FacilityRecoveryMode;

  facilityResultSnapshot?: unknown;
  facilityDomainCompletedAt?: Date;
  facilityIdempotencyOwnerId?: string;

  facilityCompensations?:
    RecoveryCompensation[];

  errorDetails?: unknown;
  version: number;
};

type IdempotencyRecoveryRecord = {
  facilityId: DatabaseObjectId;
  scope: string;
  key: string;

  status:
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED';

  ownerId: string;
  responseSnapshot?: unknown;
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
        : 'Unknown facility recovery error',
  };
}

export interface FacilityRecoveryServiceOptions {
  database: Db;
  idempotency: IdempotencyService;
  outbox: OutboxService;

  compensationExecutor:
    FacilityCompensationExecutorPort;

  leaseMilliseconds?: number;
}

export class FacilityRecoveryService {
  private readonly leaseMilliseconds:
    number;

  public constructor(
    private readonly options:
      FacilityRecoveryServiceOptions,
  ) {
    this.leaseMilliseconds =
      options.leaseMilliseconds ??
      60_000;

    if (
      !Number.isSafeInteger(
        this.leaseMilliseconds,
      ) ||
      this.leaseMilliseconds <= 0
    ) {
      throw new TypeError(
        'Facility recovery lease must be a positive safe integer',
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
            $regex:
              '^FACILITY_CONFIGURATION_',
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

          facilityDomainCompletedAt: {
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

            facilityRecoveryMode:
              FACILITY_RECOVERY_MODES
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
              '^FACILITY_CONFIGURATION_',
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

          facilityDomainCompletedAt: {
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

            facilityRecoveryMode:
              FACILITY_RECOVERY_MODES
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
      let index = 0;
      index < maxTransactions;
      index += 1
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
        transaction === null
      ) {
        break;
      }

      try {
        await this.recoverTransaction(
          transaction,
        );

        recovered += 1;
      } catch (error) {
        failed += 1;

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
            $regex:
              '^FACILITY_CONFIGURATION_',
          },

          status:
            'RECOVERY_REQUIRED',

          $or: [
            {
              facilityRecoveryLeaseExpiresAt: {
                $exists:
                  false,
              },
            },
            {
              facilityRecoveryLeaseExpiresAt: {
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

            facilityRecoveryLeaseOwner:
              input.workerId,

            facilityRecoveryLeaseToken:
              leaseToken,

            facilityRecoveryLeaseExpiresAt:
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
      transaction.facilityRecoveryMode ??
      (
        transaction.facilityDomainCompletedAt ===
        undefined
          ? FACILITY_RECOVERY_MODES
              .COMPENSATE
          : FACILITY_RECOVERY_MODES
              .FINALIZE_COMPLETED
      );

    if (
      mode ===
      FACILITY_RECOVERY_MODES
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
      transaction.facilityResultSnapshot ===
      undefined
    ) {
      throw new Error(
        'Completed facility transaction has no recoverable result snapshot',
      );
    }

    const ownerId =
      transaction.facilityIdempotencyOwnerId;

    if (
      ownerId === undefined
    ) {
      throw new Error(
        'Completed facility transaction has no idempotency owner',
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
      await this.options.idempotency.complete({
        facilityId,

        scope:
          transaction.transactionType,

        key:
          transaction.idempotencyKey,

        ownerId,

        response:
          transaction
            .facilityResultSnapshot as never,
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
          transaction.facilityCompensations ??
          []
        ),
      ].sort(
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
          safeError(error),
        );

        throw error;
      }
    }

    if (
      transaction.facilityIdempotencyOwnerId !==
      undefined
    ) {
      await this.options.idempotency.fail({
        facilityId:
          transaction.facilityId
            .toHexString(),

        scope:
          transaction.transactionType,

        key:
          transaction.idempotencyKey,

        ownerId:
          transaction
            .facilityIdempotencyOwnerId,

        error:
          (
            transaction.errorDetails ??
            {
              message:
                'Facility transaction was compensated during recovery',
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

    /*
     * Compensated transactions must never later publish blocked domain
     * events. Marking them dead-lettered also makes the failure visible to
     * reconciliation tooling.
     */
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
                'Event suppressed because the facility transaction was compensated',
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
            facilityRecoveryMode:
              '',

            facilityRecoveryLeaseOwner:
              '',

            facilityRecoveryLeaseToken:
              '',

            facilityRecoveryLeaseExpiresAt:
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
                safeError(error),
            },
          },

          $unset: {
            facilityRecoveryLeaseOwner:
              '',

            facilityRecoveryLeaseToken:
              '',

            facilityRecoveryLeaseExpiresAt:
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
      RecoveryCompensation['status'],
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

          'facilityCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'facilityCompensations.$[item].status':
              status,

            'facilityCompensations.$[item].completedAt':
              status ===
                'COMPENSATED' ||
              status ===
                'FAILED'
                ? new Date()
                : null,

            'facilityCompensations.$[item].error':
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