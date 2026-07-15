import {
  randomUUID,
} from 'node:crypto';

import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  AppError,
  ConflictError,
} from '@hospital-mis/shared';

import {
  type IdempotencyClaim,
  IdempotencyService,
} from './idempotency.service.js';

import {
  type LockResource,
  OperationLockService,
} from './operation-lock.service.js';

import {
  OutboxService,
} from './outbox.service.js';

export type ApplicationTransactionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED'
  | 'MANUALLY_RESOLVED';

export type ApplicationTransactionStepStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'VERIFIED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPENSATION_FAILED'
  | 'SKIPPED';

export interface TransactionStep<
  TContext,
> {
  readonly name: string;

  execute(
    context: TContext,
  ): Promise<void>;

  compensate?(
    context: TContext,
  ): Promise<void>;

  verify(
    context: TContext,
  ): Promise<boolean>;
}

type TransactionDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  transactionId: string;
  transactionType: string;
  idempotencyKey: string;
  correlationId: string;
  initiatedBy: ReturnType<
    typeof toObjectId
  >;

  status:
    ApplicationTransactionStatus;

  contextSnapshot?: unknown;
  relatedEntities?: unknown;
  errorDetails?: unknown;

  retryCount: number;
  completionTimestamp?: Date;

  recoveryStatus?: string;

  version: number;
};

type TransactionStepDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  transactionId: string;
  sequence: number;
  name: string;

  status:
    ApplicationTransactionStepStatus;

  attemptCount: number;

  executedAt?: Date;
  verifiedAt?: Date;
  compensatedAt?: Date;

  errorDetails?: unknown;
  compensationErrorDetails?: unknown;

  version: number;
};

function safeError(
  error: unknown,
) {
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof error,

    message:
      error instanceof Error
        ? error.message.slice(
            0,
            2000,
          )
        : 'Unknown transaction error',
  };
}

export interface ApplicationTransactionRepository {
  create(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      transactionType: string;
      idempotencyKey: string;
      correlationId: string;
      initiatedBy: string;
      contextSnapshot?: unknown;
      relatedEntities?: unknown;
      stepNames:
        readonly string[];
    }>,
  ): Promise<void>;

  setStatus(
    transactionId: string,
    status:
      ApplicationTransactionStatus,
    details?: unknown,
  ): Promise<void>;

  setStepStatus(
    transactionId: string,
    sequence: number,
    status:
      ApplicationTransactionStepStatus,
    details?: unknown,
  ): Promise<void>;

  markStaleForRecovery(
    updatedBefore: Date,
  ): Promise<number>;
}

export class MongoApplicationTransactionRepository
implements ApplicationTransactionRepository {
  constructor(
    private readonly database: Db,
  ) {}

  async create(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      transactionType: string;
      idempotencyKey: string;
      correlationId: string;
      initiatedBy: string;
      contextSnapshot?: unknown;
      relatedEntities?: unknown;
      stepNames:
        readonly string[];
    }>,
  ): Promise<void> {
    const now =
      new Date();

    const facilityId =
      toObjectId(
        input.facilityId,
      );

    await this.database
      .collection<TransactionDocument>(
        'applicationTransactions',
      )
      .insertOne({
        _id:
          createObjectId(),

        facilityId,

        transactionId:
          input.transactionId,

        transactionType:
          input.transactionType,

        idempotencyKey:
          input.idempotencyKey,

        correlationId:
          input.correlationId,

        initiatedBy:
          toObjectId(
            input.initiatedBy,
          ),

        status:
          'PENDING',

        ...(input.contextSnapshot ===
        undefined
          ? {}
          : {
              contextSnapshot:
                input.contextSnapshot,
            }),

        ...(input.relatedEntities ===
        undefined
          ? {}
          : {
              relatedEntities:
                input.relatedEntities,
            }),

        retryCount:
          0,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });

    try {
      await this.database
        .collection<TransactionStepDocument>(
          'applicationTransactionSteps',
        )
        .insertMany(
          input.stepNames.map(
            (
              name,
              sequence,
            ) => ({
              _id:
                createObjectId(),

              facilityId,

              transactionId:
                input.transactionId,

              sequence,
              name,

              status:
                'PENDING',

              attemptCount:
                0,

              schemaVersion:
                1,

              version:
                0,

              createdAt:
                now,

              updatedAt:
                now,
            }),
          ),
          {
            ordered:
              true,
          },
        );
    } catch (error) {
      await this.setStatus(
        input.transactionId,
        'RECOVERY_REQUIRED',
        {
          reason:
            'Transaction journal was created but step journal creation failed',

          error:
            safeError(error),
        },
      );

      throw error;
    }
  }

  async setStatus(
    transactionId: string,
    status:
      ApplicationTransactionStatus,
    details?: unknown,
  ): Promise<void> {
    const completed =
      status ===
        'COMPLETED' ||
      status ===
        'COMPENSATED' ||
      status ===
        'MANUALLY_RESOLVED';

    const result =
      await this.database
        .collection<TransactionDocument>(
          'applicationTransactions',
        )
        .updateOne(
          {
            transactionId,
          },

          {
            $set: {
              status,

              ...(details === undefined
                ? {}
                : {
                    errorDetails:
                      details,
                  }),

              ...(completed
                ? {
                    completionTimestamp:
                      new Date(),
                  }
                : {}),
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

    if (
      result.matchedCount !== 1
    ) {
      throw new ConflictError(
        `Application transaction ${transactionId} was not found`,
      );
    }
  }

  async setStepStatus(
    transactionId: string,
    sequence: number,
    status:
      ApplicationTransactionStepStatus,
    details?: unknown,
  ): Promise<void> {
    const timestampFields =
      status === 'EXECUTED'
        ? {
            executedAt:
              new Date(),
          }
        : status === 'VERIFIED'
          ? {
              verifiedAt:
                new Date(),
            }
          : status ===
              'COMPENSATED'
            ? {
                compensatedAt:
                  new Date(),
              }
            : {};

    const errorFields =
      status === 'FAILED'
        ? {
            errorDetails:
              details,
          }
        : status ===
              'COMPENSATION_FAILED'
          ? {
              compensationErrorDetails:
                details,
            }
          : {};

    const result =
      await this.database
        .collection<TransactionStepDocument>(
          'applicationTransactionSteps',
        )
        .updateOne(
          {
            transactionId,
            sequence,
          },

          {
            $set: {
              status,
              ...timestampFields,
              ...errorFields,
            },

            ...(status ===
            'EXECUTING'
              ? {
                  $inc: {
                    attemptCount:
                      1,

                    version:
                      1,
                  },
                }
              : {
                  $inc: {
                    version:
                      1,
                  },
                }),

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

    if (
      result.matchedCount !== 1
    ) {
      throw new ConflictError(
        `Transaction step ${transactionId}:${sequence} was not found`,
      );
    }
  }

  async markStaleForRecovery(
    updatedBefore: Date,
  ): Promise<number> {
    const result =
      await this.database
        .collection<TransactionDocument>(
          'applicationTransactions',
        )
        .updateMany(
          {
            status: {
              $in: [
                'PENDING',
                'IN_PROGRESS',
                'COMPENSATING',
              ],
            },

            updatedAt: {
              $lte:
                updatedBefore,
            },
          },

          {
            $set: {
              status:
                'RECOVERY_REQUIRED',

              recoveryStatus:
                'ABANDONED_TRANSACTION_DETECTED',
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

    return result.modifiedCount;
  }
}

export type ExecuteApplicationTransactionInput<
  TContext,
  TResult,
> = Readonly<{
  facilityId: string;
  transactionType: string;
  idempotencyKey: string;
  correlationId: string;
  initiatedBy: string;

  requestPayload: unknown;

  context: TContext;
  contextSnapshot?: unknown;
  relatedEntities?: unknown;

  locks?:
    readonly LockResource[];

  steps:
    readonly TransactionStep<TContext>[];

  buildResult(
    context: TContext,
  ): TResult;

  serializeResult(
    result: TResult,
  ): unknown;
}>;

export class ApplicationTransactionManager {
  constructor(
    private readonly transactions:
      ApplicationTransactionRepository,

    private readonly idempotency:
      IdempotencyService,

    private readonly locks:
      OperationLockService,

    private readonly outbox:
      OutboxService,
  ) {}

  async execute<
    TContext,
    TResult,
  >(
    input:
      ExecuteApplicationTransactionInput<
        TContext,
        TResult
      >,
  ): Promise<TResult> {
    const claim =
      await this.idempotency.begin({
        facilityId:
          input.facilityId,

        scope:
          input.transactionType,

        key:
          input.idempotencyKey,

        requestPayload:
          input.requestPayload,
      });

    if (
      claim.kind ===
      'REPLAY'
    ) {
      return claim.response as TResult;
    }

    return this.executeAcquired(
      input,
      claim,
    );
  }

  private async executeAcquired<
    TContext,
    TResult,
  >(
    input:
      ExecuteApplicationTransactionInput<
        TContext,
        TResult
      >,

    claim:
      Extract<
        IdempotencyClaim,
        {
          kind: 'ACQUIRED';
        }
      >,
  ): Promise<TResult> {
    const transactionId =
      randomUUID();

    await this.transactions.create({
      facilityId:
        input.facilityId,

      transactionId,

      transactionType:
        input.transactionType,

      idempotencyKey:
        input.idempotencyKey,

      correlationId:
        input.correlationId,

      initiatedBy:
        input.initiatedBy,

      contextSnapshot:
        input.contextSnapshot,

      relatedEntities:
        input.relatedEntities,

      stepNames:
        input.steps.map(
          (step) =>
            step.name,
        ),
    });

    const acquiredLocks =
      await this.locks
        .acquireMany({
          facilityId:
            input.facilityId,

          ownerId:
            transactionId,

          resources:
            input.locks ??
            [],
        });

    const completedSteps:
      Array<{
        step:
          TransactionStep<TContext>;
        sequence:
          number;
      }> = [];

    try {
      await this.transactions
        .setStatus(
          transactionId,
          'IN_PROGRESS',
        );

      for (
        const [
          sequence,
          step,
        ] of input.steps.entries()
      ) {
        await this.transactions
          .setStepStatus(
            transactionId,
            sequence,
            'EXECUTING',
          );

        try {
          await step.execute(
            input.context,
          );

          await this.transactions
            .setStepStatus(
              transactionId,
              sequence,
              'EXECUTED',
            );

          completedSteps.push({
            step,
            sequence,
          });

          const verified =
            await step.verify(
              input.context,
            );

          if (!verified) {
            throw new Error(
              `Verification failed for transaction step ${step.name}`,
            );
          }

          await this.transactions
            .setStepStatus(
              transactionId,
              sequence,
              'VERIFIED',
            );
        } catch (error) {
          await this.transactions
            .setStepStatus(
              transactionId,
              sequence,
              'FAILED',
              safeError(error),
            );

          throw error;
        }
      }

      const result =
        input.buildResult(
          input.context,
        );

      await this.transactions
        .setStatus(
          transactionId,
          'COMPLETED',
        );

      await this.outbox
        .releaseTransactionEvents(
          transactionId,
        )
        .catch(() => 0);

      await this.idempotency
        .complete({
          facilityId:
            input.facilityId,

          scope:
            input.transactionType,

          key:
            input.idempotencyKey,

          ownerId:
            claim.ownerId,

          response:
            input.serializeResult(
              result,
            ) as never,
        });

      return result;
    } catch (error) {
      const compensationSucceeded =
        await this.compensate(
          transactionId,
          input.context,
          completedSteps,
        );

      await this.idempotency
        .fail({
          facilityId:
            input.facilityId,

          scope:
            input.transactionType,

          key:
            input.idempotencyKey,

          ownerId:
            claim.ownerId,

          error:
            safeError(
              error,
            ),
        });

      if (
        !compensationSucceeded
      ) {
        await this.transactions
          .setStatus(
            transactionId,
            'RECOVERY_REQUIRED',
            {
              originalError:
                safeError(error),

              reason:
                'One or more compensation handlers failed',
            },
          );

        throw new AppError({
          code:
            'TRANSACTION_RECOVERY_REQUIRED',

          message:
            'The operation could not be completed and requires recovery',

          statusCode:
            500,

          retryable:
            false,

          cause:
            error,
        });
      }

      await this.transactions
        .setStatus(
          transactionId,
          'COMPENSATED',
          {
            originalError:
              safeError(error),
          },
        );

      throw error;
    } finally {
      await this.locks
        .releaseMany(
          acquiredLocks,
        );
    }
  }

  private async compensate<
    TContext,
  >(
    transactionId: string,
    context: TContext,

    completed:
      readonly {
        step:
          TransactionStep<TContext>;
        sequence:
          number;
      }[],
  ): Promise<boolean> {
    await this.transactions
      .setStatus(
        transactionId,
        'COMPENSATING',
      );

    let success =
      true;

    for (
      const item of
      [...completed].reverse()
    ) {
      if (
        item.step.compensate ===
        undefined
      ) {
        await this.transactions
          .setStepStatus(
            transactionId,
            item.sequence,
            'SKIPPED',
          );

        continue;
      }

      await this.transactions
        .setStepStatus(
          transactionId,
          item.sequence,
          'COMPENSATING',
        );

      try {
        await item.step.compensate(
          context,
        );

        await this.transactions
          .setStepStatus(
            transactionId,
            item.sequence,
            'COMPENSATED',
          );
      } catch (error) {
        success =
          false;

        await this.transactions
          .setStepStatus(
            transactionId,
            item.sequence,
            'COMPENSATION_FAILED',
            safeError(error),
          );
      }
    }

    return success;
  }
}