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
  ApplicationTransactionRepository,
} from '../../../infrastructure/application-transaction.js';

import type {
  IdempotencyService,
} from '../../../infrastructure/idempotency.service.js';

import type {
  AcquiredLock,
  OperationLockService,
} from '../../../infrastructure/operation-lock.service.js';

import type {
  OutboxService,
} from '../../../infrastructure/outbox.service.js';

import type {
  IdentityTransactionCompensation,
  IdentityTransactionContext,
  IdentityTransactionManagerPort,
  IdentityTransactionRequest,
} from '../identity.ports.js';

import type {
  IdentityCompensationExecutorPort,
} from './identity-compensation.executor.js';

export const IDENTITY_RECOVERY_MODES = {
  COMPENSATE:
    'COMPENSATE',

  FINALIZE_COMPLETED:
    'FINALIZE_COMPLETED',
} as const;

export type IdentityRecoveryMode =
  (typeof IDENTITY_RECOVERY_MODES)[keyof typeof IDENTITY_RECOVERY_MODES];

type PersistedIdentityCompensation =
  IdentityTransactionCompensation & {
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
            1500,
          )
        : 'Unknown identity transaction error',
  };
}

function snapshot(
  value: unknown,
): unknown {
  if (
    value ===
    undefined
  ) {
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
    (
      resourceKey,
    ) => ({
      resourceType:
        'identity',

      resourceKey,
    }),
  );
}

function assertCheckpointName(
  state: string,
): void {
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/.test(
      state,
    )
  ) {
    throw new Error(
      `Invalid identity transaction checkpoint: ${state}`,
    );
  }
}

export interface IdentityTransactionManagerAdapterOptions {
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
    IdentityCompensationExecutorPort;
}

export class MongoIdentityTransactionManagerAdapter
implements IdentityTransactionManagerPort {
  public constructor(
    private readonly options:
      IdentityTransactionManagerAdapterOptions,
  ) {}

  public async execute<T>(
    request:
      IdentityTransactionRequest<T>,
  ): Promise<T> {
    const facilityId =
      request.facilityId ??
      null;

    if (
      facilityId ===
      null
    ) {
      throw new BadRequestError(
        'An authenticated facility context is required for identity mutations',
      );
    }

    const claim =
      await this.options.idempotency
        .begin({
          facilityId,

          scope:
            request.transactionType,

          key:
            request.idempotencyKey,

          requestPayload:
            request.payload,
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
        IdentityTransactionCompensation
      >();

    let acquiredLocks:
      readonly AcquiredLock[] =
      [];

    let transactionCreated =
      false;

    let failureHandled =
      false;

    try {
      await this.options.transactions
        .create({
          facilityId,

          transactionId,

          transactionType:
            request.transactionType,

          idempotencyKey:
            request.idempotencyKey,

          correlationId:
            transactionId,

          initiatedBy:
            request.actorUserId,

          contextSnapshot:
            snapshot(
              request.payload,
            ),

          relatedEntities: {
            lockKeys: [
              ...request.lockKeys,
            ],
          },

          stepNames: [
            'identity-domain-operation',
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
              identityIdempotencyOwnerId:
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
        await this.options.locks
          .acquireMany({
            facilityId,

            ownerId:
              transactionId,

            resources:
              lockResources(
                request.lockKeys,
              ),
          });

      await this.options.transactions
        .setStatus(
          transactionId,
          'IN_PROGRESS',
        );

      await this.options.transactions
        .setStepStatus(
          transactionId,
          0,
          'EXECUTING',
        );

      const context:
        IdentityTransactionContext = {
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
                    [`identityCheckpoints.${state}`]: {
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
              PersistedIdentityCompensation = {
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

                    'identityCompensations.key': {
                      $ne:
                        compensation.key,
                    },
                  },
                  {
                    $push: {
                      identityCompensations:
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

                    'identityCompensations.key':
                      compensation.key,
                  });

              if (
                existing ===
                null
              ) {
                throw new Error(
                  'Identity compensation could not be persisted',
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

        await this.options.transactions
          .setStepStatus(
            transactionId,
            0,
            'EXECUTED',
          );

        await this.options.transactions
          .setStepStatus(
            transactionId,
            0,
            'VERIFIED',
          );

        await this.options.transactions
          .setStatus(
            transactionId,
            'COMPLETED',
          );
      } catch (error) {
        await this.options.transactions
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

        const compensated =
          await this.compensate(
            transactionId,
            [
              ...compensations.values(),
            ],
          );

        failureHandled =
          true;

        if (
          !compensated
        ) {
          await this.setRecoveryRequired(
            transactionId,

            IDENTITY_RECOVERY_MODES
              .COMPENSATE,

            {
              originalError:
                safeError(
                  error,
                ),

              reason:
                'One or more identity compensations failed',
            },
          );

          throw new AppError({
            code:
              'IDENTITY_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The identity operation failed and requires transaction recovery',

            statusCode:
              500,

            retryable:
              false,

            cause:
              error,
          });
        }

        await this.options.idempotency
          .fail({
            facilityId,

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

        await this.options.transactions
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
        await this.options.idempotency
          .complete({
            facilityId,

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

        await this.options.outbox
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

          IDENTITY_RECOVERY_MODES
            .FINALIZE_COMPLETED,

          {
            reason:
              'The domain operation completed but final idempotency or outbox publication setup failed',

            error:
              safeError(
                error,
              ),
          },
        );

        throw new AppError({
          code:
            'IDENTITY_FINALIZATION_RECOVERY_REQUIRED',

          message:
            'The identity operation completed but finalization requires recovery',

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
      if (
        !failureHandled
      ) {
        if (
          transactionCreated
        ) {
          await this.options.transactions
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

        await this.options.idempotency
          .fail({
            facilityId,

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
      await this.options.locks
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
              identityResultSnapshot:
                snapshot(
                  result,
                ),

              identityDomainCompletedAt:
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
        'Identity transaction result could not be persisted for recovery',
      );
    }
  }

  private async setRecoveryRequired(
    transactionId: string,
    mode: IdentityRecoveryMode,
    details: Record<string, unknown>,
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

            identityRecoveryMode:
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
            identityRecoveryMode:
              '',

            identityRecoveryLeaseOwner:
              '',

            identityRecoveryLeaseToken:
              '',

            identityRecoveryLeaseExpiresAt:
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
      readonly IdentityTransactionCompensation[],
  ): Promise<boolean> {
    await this.options.transactions
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
      [
        ...compensations,
      ].reverse()
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
      PersistedIdentityCompensation[
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