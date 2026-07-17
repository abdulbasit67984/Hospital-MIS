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
  PatientTransactionCompensation,
  PatientTransactionContext,
  PatientTransactionManagerPort,
  PatientTransactionRequest,
} from '../modules/patient/patient.ports.js';

import {
  PATIENT_RECOVERY_MODES,
  type PatientRecoveryMode,
} from '../modules/patient/patient.transaction.constants.js';

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
  PatientCompensationExecutorPort,
} from './patient-compensation.executor.js';

type PersistedPatientCompensation =
  PatientTransactionCompensation & {
    status:
      | 'PENDING'
      | 'COMPENSATING'
      | 'COMPENSATED'
      | 'FAILED';
    registeredAt: Date;
    completedAt?: Date | null;
    error?: Record<string, string> | null;
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
        ? error.message.slice(0, 1500)
        : 'Unknown patient transaction error',
  };
}

function snapshot(
  value: unknown,
): unknown {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(value),
  ) as unknown;
}

function lockResources(
  lockKeys: readonly string[],
) {
  return [...new Set(lockKeys)].map(
    (resourceKey) => ({
      resourceType:
        'patient-guardian',
      resourceKey,
    }),
  );
}

function assertCheckpointName(
  state: string,
): void {
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/u.test(state)
  ) {
    throw new Error(
      `Invalid patient transaction checkpoint: ${state}`,
    );
  }
}

export interface PatientTransactionManagerAdapterOptions {
  database: Db;
  transactions: ApplicationTransactionRepository;
  idempotency: IdempotencyService;
  locks: OperationLockService;
  outbox: OutboxService;
  compensationExecutor: PatientCompensationExecutorPort;
}

export class MongoPatientTransactionManagerAdapter
implements PatientTransactionManagerPort {
  public constructor(
    private readonly options:
      PatientTransactionManagerAdapterOptions,
  ) {}

  public async execute<T>(
    request: PatientTransactionRequest<T>,
  ): Promise<T> {
    if (request.facilityId.length === 0) {
      throw new BadRequestError(
        'An authenticated facility context is required for patient mutations',
      );
    }

    const claim =
      await this.options.idempotency.begin({
        facilityId:
          request.facilityId,
        scope:
          request.transactionType,
        key:
          request.idempotencyKey,
        requestPayload:
          request.idempotencyPayload,
      });

    if (claim.kind === 'REPLAY') {
      return claim.response as T;
    }

    const transactionId =
      randomUUID();

    const compensations =
      new Map<
        string,
        PatientTransactionCompensation
      >();

    let acquiredLocks:
      readonly AcquiredLock[] = [];

    let transactionCreated =
      false;

    let failureHandled =
      false;

    try {
      await this.options.transactions.create({
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
          'patient-domain-operation',
        ],
      });

      transactionCreated = true;

      await this.options.database
        .collection('applicationTransactions')
        .updateOne(
          {
            transactionId,
          },
          {
            $set: {
              patientIdempotencyOwnerId:
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
        await this.options.locks.acquireMany({
          facilityId:
            request.facilityId,
          ownerId:
            transactionId,
          resources:
            lockResources(
              request.lockKeys,
            ),
        });

      await this.options.transactions.setStatus(
        transactionId,
        'IN_PROGRESS',
      );

      await this.options.transactions.setStepStatus(
        transactionId,
        0,
        'EXECUTING',
      );

      const context:
        PatientTransactionContext = {
        transactionId,
        idempotencyKey:
          request.idempotencyKey,
        checkpoint:
          async (
            state,
            data,
          ) => {
            assertCheckpointName(state);

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
                      [`patientCheckpoints.${state}`]: {
                        data:
                          snapshot(
                            data ?? null,
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

            if (result.matchedCount !== 1) {
              throw new Error(
                'Patient transaction checkpoint could not be persisted',
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
              PersistedPatientCompensation = {
              ...compensation,
              payload:
                snapshot(
                  compensation.payload,
                ) as Record<string, unknown>,
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
                    'patientCompensations.key': {
                      $ne:
                        compensation.key,
                    },
                  },
                  {
                    $push: {
                      patientCompensations:
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

            if (result.matchedCount !== 1) {
              const existing =
                await this.options.database
                  .collection(
                    'applicationTransactions',
                  )
                  .findOne({
                    transactionId,
                    'patientCompensations.key':
                      compensation.key,
                  });

              if (existing === null) {
                throw new Error(
                  'Patient compensation could not be persisted',
                );
              }
            }

            compensations.set(
              compensation.key,
              compensation,
            );
          },
      };

      let result: T;

      try {
        result =
          await request.execute(context);

        await this.persistCompletedDomainResult(
          transactionId,
          result,
        );

        await this.options.transactions.setStepStatus(
          transactionId,
          0,
          'EXECUTED',
        );

        await this.options.transactions.setStepStatus(
          transactionId,
          0,
          'VERIFIED',
        );

        await this.options.transactions.setStatus(
          transactionId,
          'COMPLETED',
        );
      } catch (error) {
        await this.options.transactions
          .setStepStatus(
            transactionId,
            0,
            'FAILED',
            safeError(error),
          )
          .catch(() => undefined);

        let compensated = false;

        try {
          compensated =
            await this.compensate(
              transactionId,
              [...compensations.values()],
            );
        } catch (compensationError) {
          failureHandled = true;

          await this.setRecoveryRequired(
            transactionId,
            PATIENT_RECOVERY_MODES.COMPENSATE,
            {
              originalError:
                safeError(error),
              compensationError:
                safeError(compensationError),
              reason:
                'Patient compensation execution was interrupted',
            },
          );

          throw new AppError({
            code:
              'PATIENT_TRANSACTION_RECOVERY_REQUIRED',
            message:
              'The patient operation failed and requires transaction recovery',
            statusCode:
              500,
            retryable:
              false,
            cause:
              error,
          });
        }

        failureHandled = true;

        if (!compensated) {
          await this.setRecoveryRequired(
            transactionId,
            PATIENT_RECOVERY_MODES.COMPENSATE,
            {
              originalError:
                safeError(error),
              reason:
                'One or more patient compensations failed',
            },
          );

          throw new AppError({
            code:
              'PATIENT_TRANSACTION_RECOVERY_REQUIRED',
            message:
              'The patient operation failed and requires transaction recovery',
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
          'Patient transaction was compensated',
        );

        await this.options.idempotency
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
              safeError(error) as never,
          })
          .catch(() => undefined);

        await this.options.transactions
          .setStatus(
            transactionId,
            'COMPENSATED',
            {
              originalError:
                safeError(error),
            },
          )
          .catch(() => undefined);

        throw error;
      }

      try {
        await this.options.idempotency.complete({
          facilityId:
            request.facilityId,
          scope:
            request.transactionType,
          key:
            request.idempotencyKey,
          ownerId:
            claim.ownerId,
          response:
            snapshot(result) as never,
        });

        await this.options.outbox
          .releaseTransactionEvents(
            transactionId,
          );

        await this.clearRecoveryMetadata(
          transactionId,
        );
      } catch (error) {
        failureHandled = true;

        await this.setRecoveryRequired(
          transactionId,
          PATIENT_RECOVERY_MODES
            .FINALIZE_COMPLETED,
          {
            reason:
              'The patient operation completed but idempotency or outbox finalization failed',
            error:
              safeError(error),
          },
        );

        throw new AppError({
          code:
            'PATIENT_FINALIZATION_RECOVERY_REQUIRED',
          message:
            'The patient operation completed but finalization requires recovery',
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
        if (transactionCreated) {
          await this.options.transactions
            .setStatus(
              transactionId,
              'FAILED',
              safeError(error),
            )
            .catch(() => undefined);
        }

        await this.options.idempotency
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
              safeError(error) as never,
          })
          .catch(() => undefined);
      }

      throw error;
    } finally {
      await this.options.locks.releaseMany(
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
        .collection('applicationTransactions')
        .updateOne(
          {
            transactionId,
          },
          {
            $set: {
              patientResultSnapshot:
                snapshot(result),
              patientDomainCompletedAt:
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

    if (update.matchedCount !== 1) {
      throw new Error(
        'Patient transaction result could not be persisted for recovery',
      );
    }
  }

  private async setRecoveryRequired(
    transactionId: string,
    mode: PatientRecoveryMode,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.options.database
      .collection('applicationTransactions')
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
            patientRecoveryMode:
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
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId,
        },
        {
          $unset: {
            patientRecoveryMode:
              '',
            patientRecoveryLeaseOwner:
              '',
            patientRecoveryLeaseToken:
              '',
            patientRecoveryLeaseExpiresAt:
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
      readonly PatientTransactionCompensation[],
  ): Promise<boolean> {
    await this.options.transactions
      .setStatus(
        transactionId,
        'COMPENSATING',
      )
      .catch(() => undefined);

    let succeeded =
      true;

    for (
      const compensation of
      [...compensations].reverse()
    ) {
      await this.setCompensationStatus(
        transactionId,
        compensation.key,
        'COMPENSATING',
      );

      try {
        await this.options
          .compensationExecutor
          .execute(compensation);

        await this.setCompensationStatus(
          transactionId,
          compensation.key,
          'COMPENSATED',
        );
      } catch (error) {
        succeeded = false;

        await this.setCompensationStatus(
          transactionId,
          compensation.key,
          'FAILED',
          safeError(error),
        );
      }
    }

    return succeeded;
  }

  private async setCompensationStatus(
    transactionId: string,
    compensationKey: string,
    status:
      PersistedPatientCompensation['status'],
    error?: Record<string, string>,
  ): Promise<void> {
    await this.options.database
      .collection('applicationTransactions')
      .updateOne(
        {
          transactionId,
          'patientCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'patientCompensations.$[item].status':
              status,
            'patientCompensations.$[item].completedAt':
              status === 'COMPENSATED' ||
              status === 'FAILED'
                ? new Date()
                : null,
            'patientCompensations.$[item].error':
              error ?? null,
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
      .collection('outboxEvents')
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