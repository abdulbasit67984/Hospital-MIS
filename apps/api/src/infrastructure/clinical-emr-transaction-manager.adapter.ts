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
  ClinicalEmrEncryptedSnapshot,
  ClinicalEmrSnapshotCryptoPort,
  ClinicalEmrTransactionCompensation,
  ClinicalEmrTransactionContext,
  ClinicalEmrTransactionManagerPort,
  ClinicalEmrTransactionRequest,
} from '../modules/clinical-emr/clinical-emr.ports.js';

import {
  CLINICAL_EMR_RECOVERY_MODES,
  type ClinicalEmrRecoveryMode,
} from '../modules/clinical-emr/clinical-emr.transaction.constants.js';

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
  ClinicalEmrCompensationExecutorPort,
} from './clinical-emr-compensation.executor.js';

import {
  assertSafeClinicalEventPayload,
} from './clinical-emr-runtime.adapters.js';


type ClinicalEmrEncryptedResultEnvelope = {
  kind: 'CLINICAL_EMR_ENCRYPTED_RESULT';
  associatedData: string;
  encryptedSnapshot: ClinicalEmrEncryptedSnapshot;
  snapshotHash: string;
};

function isEncryptedResultEnvelope(
  value: unknown,
): value is ClinicalEmrEncryptedResultEnvelope {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('kind' in value) ||
    value.kind !== 'CLINICAL_EMR_ENCRYPTED_RESULT' ||
    !('associatedData' in value) ||
    typeof value.associatedData !== 'string' ||
    !('snapshotHash' in value) ||
    typeof value.snapshotHash !== 'string' ||
    !('encryptedSnapshot' in value) ||
    typeof value.encryptedSnapshot !== 'object' ||
    value.encryptedSnapshot === null
  ) {
    return false;
  }

  return true;
}

function resultAssociatedData(
  facilityId: string,
  transactionType: string,
  idempotencyKey: string,
): string {
  return [
    'hospital-mis',
    'clinical-emr',
    'idempotency-result',
    facilityId,
    transactionType,
    idempotencyKey,
  ].join(':');
}

type PersistedClinicalEmrCompensation =
  ClinicalEmrTransactionCompensation & {
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
        : 'Unknown clinical EMR transaction error',
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
        'clinical-emr',

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
      `Invalid clinical EMR transaction checkpoint: ${state}`,
    );
  }
}

export interface ClinicalEmrTransactionManagerAdapterOptions {
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
    ClinicalEmrCompensationExecutorPort;

  snapshotCrypto:
    ClinicalEmrSnapshotCryptoPort;
}

export class MongoClinicalEmrTransactionManagerAdapter
implements ClinicalEmrTransactionManagerPort {
  public constructor(
    private readonly options:
      ClinicalEmrTransactionManagerAdapterOptions,
  ) {}

  public async execute<T>(
    request:
      ClinicalEmrTransactionRequest<T>,
  ): Promise<T> {
    if (
      request.facilityId.length ===
      0
    ) {
      throw new BadRequestError(
        'An authenticated facility context is required for clinical EMR mutations',
      );
    }

    assertSafeClinicalEventPayload(
      request.journalPayload,
    );

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
      return this.decryptReplayResult<T>(
        claim.response,
      );
    }

    const transactionId =
      randomUUID();

    const compensations =
      new Map<
        string,
        ClinicalEmrTransactionCompensation
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
            'clinical-emr-domain-operation',
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
              clinicalEmrIdempotencyOwnerId:
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
        ClinicalEmrTransactionContext = {
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

            if (data !== undefined) {
              assertSafeClinicalEventPayload(data);
            }

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
                      [`clinicalEmrCheckpoints.${state}`]: {
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
                'Clinical EMR transaction checkpoint could not be persisted',
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
              PersistedClinicalEmrCompensation = {
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

                    'clinicalEmrCompensations.key': {
                      $ne:
                        compensation.key,
                    },
                  },
                  {
                    $push: {
                      clinicalEmrCompensations:
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

                    'clinicalEmrCompensations.key':
                      compensation.key,
                  });

              if (
                existing === null
              ) {
                throw new Error(
                  'Clinical EMR compensation could not be persisted',
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
          request.facilityId,
          request.transactionType,
          request.idempotencyKey,
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
            CLINICAL_EMR_RECOVERY_MODES
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
                'Clinical EMR compensation execution was interrupted',
            },
          );

          throw new AppError({
            code:
              'CLINICAL_EMR_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The clinical EMR operation failed and requires transaction recovery',

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
            CLINICAL_EMR_RECOVERY_MODES
              .COMPENSATE,
            {
              originalError:
                safeError(
                  error,
                ),

              reason:
                'One or more clinical EMR compensations failed',
            },
          );

          throw new AppError({
            code:
              'CLINICAL_EMR_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The clinical EMR operation failed and requires transaction recovery',

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
          'Clinical EMR transaction was compensated',
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
              this.encryptResult(
                request.facilityId,
                request.transactionType,
                request.idempotencyKey,
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
          CLINICAL_EMR_RECOVERY_MODES
            .FINALIZE_COMPLETED,
          {
            reason:
              'The clinical EMR operation completed but idempotency or outbox finalization failed',

            error:
              safeError(
                error,
              ),
          },
        );

        throw new AppError({
          code:
            'CLINICAL_EMR_FINALIZATION_RECOVERY_REQUIRED',

          message:
            'The clinical EMR operation completed but finalization requires recovery',

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

  private encryptResult<T>(
    facilityId: string,
    transactionType: string,
    idempotencyKey: string,
    result: T,
  ): ClinicalEmrEncryptedResultEnvelope {
    const associatedData = resultAssociatedData(
      facilityId,
      transactionType,
      idempotencyKey,
    );

    const protectedResult = this.options.snapshotCrypto.protect(
      snapshot(result),
      associatedData,
    );

    return {
      kind: 'CLINICAL_EMR_ENCRYPTED_RESULT',
      associatedData,
      encryptedSnapshot: protectedResult.encryptedValue,
      snapshotHash: protectedResult.valueHash,
    };
  }

  private decryptReplayResult<T>(
    response: unknown,
  ): T {
    if (!isEncryptedResultEnvelope(response)) {
      throw new AppError({
        code: 'CLINICAL_EMR_IDEMPOTENCY_SNAPSHOT_INVALID',
        message: 'The clinical EMR idempotency response could not be verified',
        statusCode: 500,
        expose: false,
      });
    }

    const result = this.options.snapshotCrypto.unprotect<T>(
      response.encryptedSnapshot,
      response.associatedData,
    );

    if (
      !this.options.snapshotCrypto.matchesHash(
        result,
        response.associatedData,
        response.snapshotHash,
      )
    ) {
      throw new AppError({
        code: 'CLINICAL_EMR_IDEMPOTENCY_SNAPSHOT_INVALID',
        message: 'The clinical EMR idempotency response failed integrity verification',
        statusCode: 500,
        expose: false,
      });
    }

    return result;
  }

  private async persistCompletedDomainResult<T>(
    transactionId: string,
    facilityId: string,
    transactionType: string,
    idempotencyKey: string,
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
              clinicalEmrResultSnapshot:
                this.encryptResult(
                  facilityId,
                  transactionType,
                  idempotencyKey,
                  result,
                ),

              clinicalEmrDomainCompletedAt:
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
        'Clinical EMR transaction result could not be persisted for recovery',
      );
    }
  }

  private async setRecoveryRequired(
    transactionId: string,
    mode:
      ClinicalEmrRecoveryMode,
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

            clinicalEmrRecoveryMode:
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
            clinicalEmrRecoveryMode:
              '',

            clinicalEmrRecoveryLeaseOwner:
              '',

            clinicalEmrRecoveryLeaseToken:
              '',

            clinicalEmrRecoveryLeaseExpiresAt:
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
      readonly ClinicalEmrTransactionCompensation[],
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
      PersistedClinicalEmrCompensation['status'],
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

          'clinicalEmrCompensations.key':
            compensationKey,
        },
        {
          $set: {
            'clinicalEmrCompensations.$[item].status':
              status,

            'clinicalEmrCompensations.$[item].completedAt':
              status ===
                'COMPENSATED' ||
              status ===
                'FAILED'
                ? new Date()
                : null,

            'clinicalEmrCompensations.$[item].error':
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