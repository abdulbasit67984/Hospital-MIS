import {
  randomUUID,
} from 'node:crypto';

import type {
  DatabaseObjectId,
  Db,
} from '@hospital-mis/database';

import type {
  FormularyPrescriptionTransactionCompensation,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import {
  FORMULARY_PRESCRIPTION_TRANSACTION_TYPES,
} from '../modules/formulary-prescriptions/formulary-prescriptions.constants.js';

import {
  FORMULARY_PRESCRIPTION_RECOVERY_MODES,
  type FormularyPrescriptionRecoveryMode,
} from '../modules/formulary-prescriptions/formulary-prescriptions.transaction.constants.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

import type {
  FormularyPrescriptionCompensationExecutorPort,
} from './formulary-prescription-compensation.executor.js';

type RecoveryCompensation =
  FormularyPrescriptionTransactionCompensation & {
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

  formularyPrescriptionRecoveryLeaseOwner?:
    string;

  formularyPrescriptionRecoveryLeaseToken?:
    string;

  formularyPrescriptionRecoveryLeaseExpiresAt?:
    Date;

  formularyPrescriptionRecoveryMode?:
    FormularyPrescriptionRecoveryMode;

  formularyPrescriptionResultSnapshot?:
    unknown;

  formularyPrescriptionDomainCompletedAt?:
    Date;

  formularyPrescriptionIdempotencyOwnerId?:
    string;

  formularyPrescriptionCompensations?:
    RecoveryCompensation[];

  errorDetails?:
    unknown;

  version:
    number;
};

const transactionTypes =
  Object.values(
    FORMULARY_PRESCRIPTION_TRANSACTION_TYPES,
  );

function safeError(
  error:
    unknown,
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
        : 'Unknown formulary and prescription recovery error',
  };
}

export interface FormularyPrescriptionRecoveryServiceOptions {
  database:
    Db;

  idempotency:
    IdempotencyService;

  outbox:
    OutboxService;

  compensationExecutor:
    FormularyPrescriptionCompensationExecutorPort;

  leaseMilliseconds?:
    number;
}

export class FormularyPrescriptionRecoveryService {
  private readonly leaseMilliseconds:
    number;

  public constructor(
    private readonly options:
      FormularyPrescriptionRecoveryServiceOptions,
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
        'Formulary and prescription recovery lease must be a positive safe integer',
      );
    }
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
            $in:
              transactionTypes,
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

          formularyPrescriptionDomainCompletedAt: {
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

            formularyPrescriptionRecoveryMode:
              FORMULARY_PRESCRIPTION_RECOVERY_MODES.FINALIZE_COMPLETED,
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
              transactionTypes,
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

          formularyPrescriptionDomainCompletedAt: {
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

            formularyPrescriptionRecoveryMode:
              FORMULARY_PRESCRIPTION_RECOVERY_MODES.COMPENSATE,
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
      workerId:
        string;

      now:
        Date;
    }>,
  ): Promise<RecoveryTransaction | null> {
    const leaseToken =
      randomUUID();

    const leaseExpiresAt =
      new Date(
        input.now.getTime() +
        this.leaseMilliseconds,
      );

    return this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .findOneAndUpdate(
        {
          transactionType: {
            $in:
              transactionTypes,
          },

          status:
            'RECOVERY_REQUIRED',

          recoveryStatus: {
            $in: [
              'PENDING',
              'FAILED',
              'IN_PROGRESS',
            ],
          },

          $or: [
            {
              formularyPrescriptionRecoveryLeaseExpiresAt: {
                $exists:
                  false,
              },
            },

            {
              formularyPrescriptionRecoveryLeaseExpiresAt: {
                $lte:
                  input.now,
              },
            },
          ],
        },
        {
          $set: {
            recoveryStatus:
              'IN_PROGRESS',

            formularyPrescriptionRecoveryLeaseOwner:
              input.workerId,

            formularyPrescriptionRecoveryLeaseToken:
              leaseToken,

            formularyPrescriptionRecoveryLeaseExpiresAt:
              leaseExpiresAt,
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
      transaction.formularyPrescriptionRecoveryMode;

    if (
      mode ===
      FORMULARY_PRESCRIPTION_RECOVERY_MODES.FINALIZE_COMPLETED
    ) {
      await this.finalizeCompleted(
        transaction,
      );
    } else if (
      mode ===
      FORMULARY_PRESCRIPTION_RECOVERY_MODES.COMPENSATE
    ) {
      await this.compensate(
        transaction,
      );
    } else {
      throw new Error(
        'Formulary and prescription recovery mode is unavailable',
      );
    }

    await this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,

          formularyPrescriptionRecoveryLeaseToken:
            transaction.formularyPrescriptionRecoveryLeaseToken,
        },
        {
          $set: {
            status:
              mode ===
              FORMULARY_PRESCRIPTION_RECOVERY_MODES.FINALIZE_COMPLETED
                ? 'COMPLETED'
                : 'COMPENSATED',

            recoveryStatus:
              'COMPLETED',
          },

          $unset: {
            formularyPrescriptionRecoveryLeaseOwner:
              '',

            formularyPrescriptionRecoveryLeaseToken:
              '',

            formularyPrescriptionRecoveryLeaseExpiresAt:
              '',

            formularyPrescriptionRecoveryMode:
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

  private async finalizeCompleted(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    if (
      transaction.formularyPrescriptionResultSnapshot ===
      undefined
    ) {
      throw new Error(
        'Completed formulary and prescription transaction does not contain a recoverable result snapshot',
      );
    }

    if (
      transaction.formularyPrescriptionIdempotencyOwnerId ===
      undefined
    ) {
      throw new Error(
        'Completed formulary and prescription transaction does not contain an idempotency owner',
      );
    }

    await this.options.idempotency
      .complete({
        facilityId:
          transaction.facilityId.toHexString(),

        scope:
          transaction.transactionType,

        key:
          transaction.idempotencyKey,

        ownerId:
          transaction.formularyPrescriptionIdempotencyOwnerId,

        response:
          transaction.formularyPrescriptionResultSnapshot as never,
      });

    await this.options.outbox
      .releaseTransactionEvents(
        transaction.transactionId,
      );
  }

  private async compensate(
    transaction:
      RecoveryTransaction,
  ): Promise<void> {
    const compensations =
      [
        ...(
          transaction.formularyPrescriptionCompensations ??
          []
        ),
      ].reverse();

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
          .execute({
            key:
              compensation.key,

            type:
              compensation.type,

            payload:
              compensation.payload,
          });

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

    await this.options
      .compensationExecutor
      .cleanupTransactionArtifacts(
        transaction.transactionId,
      );

    if (
      transaction.formularyPrescriptionIdempotencyOwnerId !==
      undefined
    ) {
      await this.options.idempotency
        .fail({
          facilityId:
            transaction.facilityId.toHexString(),

          scope:
            transaction.transactionType,

          key:
            transaction.idempotencyKey,

          ownerId:
            transaction.formularyPrescriptionIdempotencyOwnerId,

          error: {
            code:
              'FORMULARY_PRESCRIPTION_TRANSACTION_COMPENSATED',
          } as never,
        });
    }
  }

  private async setCompensationStatus(
    transactionId:
      string,

    compensationKey:
      string,

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

          'formularyPrescriptionCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'formularyPrescriptionCompensations.$[item].status':
              status,

            'formularyPrescriptionCompensations.$[item].completedAt':
              status ===
                'COMPENSATED' ||
              status ===
                'FAILED'
                ? new Date()
                : null,

            'formularyPrescriptionCompensations.$[item].error':
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

  private async markRecoveryFailure(
    transaction:
      RecoveryTransaction,

    error:
      unknown,
  ): Promise<void> {
    await this.options.database
      .collection<RecoveryTransaction>(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId:
            transaction.transactionId,

          formularyPrescriptionRecoveryLeaseToken:
            transaction.formularyPrescriptionRecoveryLeaseToken,
        },
        {
          $set: {
            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'FAILED',

            errorDetails: {
              reason:
                'Formulary and prescription transaction recovery failed',

              error:
                safeError(
                  error,
                ),
            },
          },

          $unset: {
            formularyPrescriptionRecoveryLeaseOwner:
              '',

            formularyPrescriptionRecoveryLeaseToken:
              '',

            formularyPrescriptionRecoveryLeaseExpiresAt:
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
}