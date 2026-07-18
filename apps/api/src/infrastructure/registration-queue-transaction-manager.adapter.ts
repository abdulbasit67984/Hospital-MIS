import {
  randomUUID,
} from 'node:crypto';

import type {
  Db,
} from '@hospital-mis/database';

import {
  AppError,
  BadRequestError,
} from '@hospital-mis/shared';

import type {
  RegistrationQueueTransactionCompensation,
  RegistrationQueueTransactionContext,
  RegistrationQueueTransactionManagerPort,
  RegistrationQueueTransactionRequest,
} from '../modules/registration-queue/registration-queue.ports.js';

import {
  REGISTRATION_QUEUE_RECOVERY_MODES,
  type RegistrationQueueRecoveryMode,
} from '../modules/registration-queue/registration-queue.transaction.constants.js';

import type {
  ApplicationTransactionRepository,
} from './application-transaction.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  AcquiredLock,
  OperationLockService,
} from './operation-lock.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

import type {
  RegistrationQueueCompensationExecutorPort,
} from './registration-queue-compensation.executor.js';

type PersistedRegistrationQueueCompensation =
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
        : 'Unknown registration and queue transaction error',
  };
}

function snapshot(
  value: unknown,
): unknown {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as unknown;
}

function lockResources(
  lockKeys:
    readonly string[],
) {
  return [
    ...new Set(
      lockKeys,
    ),
  ].map(
    (resourceKey) => ({
      resourceType:
        'registration-opd-queue',

      resourceKey,
    }),
  );
}

function assertCheckpointName(
  state: string,
): void {
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/u.test(
      state,
    )
  ) {
    throw new Error(
      `Invalid registration and queue transaction checkpoint: ${state}`,
    );
  }
}

export interface RegistrationQueueTransactionManagerAdapterOptions {
  database:
    Db;

  transactions:
    ApplicationTransactionRepository;

  idempotency:
    IdempotencyService;

  locks:
    OperationLockService;

  outbox:
    OutboxService;

  compensationExecutor:
    RegistrationQueueCompensationExecutorPort;
}

export class MongoRegistrationQueueTransactionManagerAdapter
implements RegistrationQueueTransactionManagerPort {
  public constructor(
    private readonly options:
      RegistrationQueueTransactionManagerAdapterOptions,
  ) {}

  public async execute<T>(
    request:
      RegistrationQueueTransactionRequest<T>,
  ): Promise<T> {
    if (
      request.facilityId.length ===
      0
    ) {
      throw new BadRequestError(
        'An authenticated facility context is required for registration and queue mutations',
      );
    }

    const claim =
      await this.options
        .idempotency
        .begin({
          facilityId:
            request.facilityId,

          scope:
            request.transactionType,

          key:
            request.idempotencyKey,

          requestPayload:
            request.idempotencyPayload,
        });

    if (
      claim.kind ===
      'REPLAY'
    ) {
      return claim.response as T;
    }

    const transactionId =
      randomUUID();

    const compensations =
      new Map<
        string,
        RegistrationQueueTransactionCompensation
      >();

    let acquiredLocks:
      readonly AcquiredLock[] =
        [];

    let transactionCreated =
      false;

    let failureHandled =
      false;

    try {
      await this.options
        .transactions
        .create({
          facilityId:
            request.facilityId,

          transactionId,

          transactionType:
            request.transactionType,

          idempotencyKey:
            request.idempotencyKey,

          correlationId:
            request.correlationId,

          initiatedBy:
            request.actorUserId,

          contextSnapshot:
            snapshot(
              request.journalPayload,
            ),

          relatedEntities: {
            lockKeys: [
              ...request.lockKeys,
            ],
          },

          stepNames: [
            'registration-queue-domain-operation',
          ],
        });

      transactionCreated =
        true;

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
              registrationQueueIdempotencyOwnerId:
                claim.ownerId,
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

      acquiredLocks =
        await this.options
          .locks
          .acquireMany({
            facilityId:
              request.facilityId,

            ownerId:
              transactionId,

            resources:
              lockResources(
                request.lockKeys,
              ),
          });

      await this.options
        .transactions
        .setStatus(
          transactionId,
          'IN_PROGRESS',
        );

      await this.options
        .transactions
        .setStepStatus(
          transactionId,
          0,
          'EXECUTING',
        );

      const context:
        RegistrationQueueTransactionContext = {
        transactionId,

        idempotencyKey:
          request.idempotencyKey,

        checkpoint:
          async (
            state,
            data,
          ) => {
            assertCheckpointName(
              state,
            );

            const result =
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
                      [`registrationQueueCheckpoints.${state}`]: {
                        data:
                          snapshot(
                            data ??
                              null,
                          ),

                        recordedAt:
                          new Date(),
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

            if (
              result.matchedCount !==
              1
            ) {
              throw new Error(
                'Registration and queue transaction checkpoint could not be persisted',
              );
            }
          },

        registerCompensation:
          async (
            compensation,
          ) => {
            if (
              compensations.has(
                compensation.key,
              )
            ) {
              return;
            }

            const persisted:
              PersistedRegistrationQueueCompensation = {
              ...compensation,

              payload:
                snapshot(
                  compensation.payload,
                ) as Record<
                  string,
                  unknown
                >,

              status:
                'PENDING',

              registeredAt:
                new Date(),
            };

            const result =
              await this.options.database
                .collection(
                  'applicationTransactions',
                )
                .updateOne(
                  {
                    transactionId,

                    'registrationQueueCompensations.key': {
                      $ne:
                        compensation.key,
                    },
                  },
                  {
                    $push: {
                      registrationQueueCompensations:
                        persisted,
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
              result.matchedCount !==
              1
            ) {
              const existing =
                await this.options.database
                  .collection(
                    'applicationTransactions',
                  )
                  .findOne({
                    transactionId,

                    'registrationQueueCompensations.key':
                      compensation.key,
                  });

              if (
                existing === null
              ) {
                throw new Error(
                  'Registration and queue compensation could not be persisted',
                );
              }
            }

            compensations.set(
              compensation.key,
              compensation,
            );
          },
      };

      let result:
        T;

      try {
        result =
          await request.execute(
            context,
          );

        await this.persistCompletedDomainResult(
          transactionId,
          result,
        );

        await this.options
          .transactions
          .setStepStatus(
            transactionId,
            0,
            'EXECUTED',
          );

        await this.options
          .transactions
          .setStepStatus(
            transactionId,
            0,
            'VERIFIED',
          );

        await this.options
          .transactions
          .setStatus(
            transactionId,
            'COMPLETED',
          );
      } catch (error) {
        await this.options
          .transactions
          .setStepStatus(
            transactionId,
            0,
            'FAILED',
            safeError(
              error,
            ),
          )
          .catch(
            () =>
              undefined,
          );

        let compensated =
          false;

        try {
          compensated =
            await this.compensate(
              transactionId,
              [
                ...compensations
                  .values(),
              ],
            );
        } catch (
          compensationError
        ) {
          failureHandled =
            true;

          await this.setRecoveryRequired(
            transactionId,
            REGISTRATION_QUEUE_RECOVERY_MODES
              .COMPENSATE,
            {
              originalError:
                safeError(
                  error,
                ),

              compensationError:
                safeError(
                  compensationError,
                ),

              reason:
                'Registration and queue compensation execution was interrupted',
            },
          );

          throw new AppError({
            code:
              'REGISTRATION_QUEUE_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The registration and queue operation failed and requires transaction recovery',

            statusCode:
              500,

            retryable:
              false,

            cause:
              error,
          });
        }

        failureHandled =
          true;

        if (!compensated) {
          await this.setRecoveryRequired(
            transactionId,
            REGISTRATION_QUEUE_RECOVERY_MODES
              .COMPENSATE,
            {
              originalError:
                safeError(
                  error,
                ),

              reason:
                'One or more registration and queue compensations failed',
            },
          );

          throw new AppError({
            code:
              'REGISTRATION_QUEUE_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The registration and queue operation failed and requires transaction recovery',

            statusCode:
              500,

            retryable:
              false,

            cause:
              error,
          });
        }

        await this.deadLetterBlockedEvents(
          transactionId,
          'Registration and queue transaction was compensated',
        );

        await this.options
          .idempotency
          .fail({
            facilityId:
              request.facilityId,

            scope:
              request.transactionType,

            key:
              request.idempotencyKey,

            ownerId:
              claim.ownerId,

            error:
              safeError(
                error,
              ) as never,
          })
          .catch(
            () =>
              undefined,
          );

        await this.options
          .transactions
          .setStatus(
            transactionId,
            'COMPENSATED',
            {
              originalError:
                safeError(
                  error,
                ),
            },
          )
          .catch(
            () =>
              undefined,
          );

        throw error;
      }

      try {
        await this.options
          .idempotency
          .complete({
            facilityId:
              request.facilityId,

            scope:
              request.transactionType,

            key:
              request.idempotencyKey,

            ownerId:
              claim.ownerId,

            response:
              snapshot(
                result,
              ) as never,
          });

        await this.options
          .outbox
          .releaseTransactionEvents(
            transactionId,
          );

        await this.clearRecoveryMetadata(
          transactionId,
        );
      } catch (error) {
        failureHandled =
          true;

        await this.setRecoveryRequired(
          transactionId,
          REGISTRATION_QUEUE_RECOVERY_MODES
            .FINALIZE_COMPLETED,
          {
            reason:
              'The registration and queue operation completed but idempotency or outbox finalization failed',

            error:
              safeError(
                error,
              ),
          },
        );

        throw new AppError({
          code:
            'REGISTRATION_QUEUE_FINALIZATION_RECOVERY_REQUIRED',

          message:
            'The registration and queue operation completed but finalization requires recovery',

          statusCode:
            500,

          retryable:
            false,

          cause:
            error,
        });
      }

      return result;
    } catch (error) {
      if (!failureHandled) {
        if (
          transactionCreated
        ) {
          await this.options
            .transactions
            .setStatus(
              transactionId,
              'FAILED',
              safeError(
                error,
              ),
            )
            .catch(
              () =>
                undefined,
            );
        }

        await this.options
          .idempotency
          .fail({
            facilityId:
              request.facilityId,

            scope:
              request.transactionType,

            key:
              request.idempotencyKey,

            ownerId:
              claim.ownerId,

            error:
              safeError(
                error,
              ) as never,
          })
          .catch(
            () =>
              undefined,
          );
      }

      throw error;
    } finally {
      await this.options
        .locks
        .releaseMany(
          acquiredLocks,
        );
    }
  }

  private async persistCompletedDomainResult<T>(
    transactionId: string,
    result: T,
  ): Promise<void> {
    const update =
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
              registrationQueueResultSnapshot:
                snapshot(
                  result,
                ),

              registrationQueueDomainCompletedAt:
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

    if (
      update.matchedCount !==
      1
    ) {
      throw new Error(
        'Registration and queue transaction result could not be persisted for recovery',
      );
    }
  }

  private async setRecoveryRequired(
    transactionId: string,
    mode:
      RegistrationQueueRecoveryMode,
    details:
      Record<string, unknown>,
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
            status:
              'RECOVERY_REQUIRED',

            recoveryStatus:
              'PENDING',

            registrationQueueRecoveryMode:
              mode,

            errorDetails:
              details,
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

  private async clearRecoveryMetadata(
    transactionId: string,
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

          $set: {
            recoveryStatus:
              'NOT_REQUIRED',
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

  private async compensate(
    transactionId: string,
    compensations:
      readonly RegistrationQueueTransactionCompensation[],
  ): Promise<boolean> {
    await this.options
      .transactions
      .setStatus(
        transactionId,
        'COMPENSATING',
      )
      .catch(
        () =>
          undefined,
      );

    let succeeded =
      true;

    for (
      const compensation of
      [...compensations]
        .reverse()
    ) {
      await this.setCompensationStatus(
        transactionId,
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
          transactionId,
          compensation.key,
          'COMPENSATED',
        );
      } catch (error) {
        succeeded =
          false;

        await this.setCompensationStatus(
          transactionId,
          compensation.key,
          'FAILED',
          safeError(
            error,
          ),
        );
      }
    }

    return succeeded;
  }

  private async setCompensationStatus(
    transactionId: string,
    compensationKey: string,
    status:
      PersistedRegistrationQueueCompensation['status'],
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

  private async deadLetterBlockedEvents(
    transactionId: string,
    message: string,
  ): Promise<void> {
    await this.options.database
      .collection(
        'outboxEvents',
      )
      .updateMany(
        {
          transactionId,

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

              message,
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
  }
}