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
  RadiologyEncryptedSnapshot,
  RadiologySnapshotCryptoPort,
  RadiologyTransactionCompensation,
  RadiologyTransactionContext,
  RadiologyTransactionManagerPort,
  RadiologyTransactionRequest,
} from '../modules/radiology/radiology.ports.js';

import type {
  RadiologyCompensationExecutor,
} from '../modules/radiology/radiology-compensation.executor.js';

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

const prohibitedJournalKeys =
  new Set([
    'clinicalhistory',
    'findings',
    'impression',
    'recommendations',
    'criticalfindings',
    'description',
    'techniciannotes',
    'complications',
    'responses',
    'conditions',
    'recipientdisplay',
    'recipientdisplaysnapshot',
    'communicationnotes',
    'cancellationreason',
    'rejectionreason',
    'withdrawalreason',
    'correctionreason',
    'addendumtext',
    'viewerreference',
    'storagereference',
    'imagebinary',
    'bytes',
  ]);

function normalizedKey(
  value:
    string,
): string {
  return value
    .normalize(
      'NFKC',
    )
    .replaceAll(
      /[^a-z0-9]/giu,
      '',
    )
    .toLocaleLowerCase(
      'en-US',
    );
}

function assertSafeJournalPayload(
  value:
    unknown,

  path =
    'payload',

  depth =
    0,
): void {
  if (
    depth >
    8
  ) {
    throw new TypeError(
      `Radiology journal payload is too deeply nested at ${path}`,
    );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    if (
      value.length >
      100
    ) {
      throw new TypeError(
        `Radiology journal payload array is too large at ${path}`,
      );
    }

    value.forEach(
      (
        item,
        index,
      ) =>
        assertSafeJournalPayload(
          item,
          `${path}.${index}`,
          depth +
            1,
        ),
    );

    return;
  }

  if (
    value ===
      null ||
    typeof value !==
      'object'
  ) {
    if (
      typeof value ===
        'string' &&
      value.length >
        2_000
    ) {
      throw new TypeError(
        `Radiology journal payload string is too long at ${path}`,
      );
    }

    return;
  }

  for (
    const [
      key,
      nested,
    ] of
    Object.entries(
      value,
    )
  ) {
    if (
      prohibitedJournalKeys.has(
        normalizedKey(
          key,
        ),
      )
    ) {
      throw new TypeError(
        `Sensitive Radiology field ${path}.${key} cannot be journaled`,
      );
    }

    assertSafeJournalPayload(
      nested,
      `${path}.${key}`,
      depth +
        1,
    );
  }
}

function replayAssociatedData(
  facilityId:
    string,

  transactionType:
    string,

  idempotencyKey:
    string,
): string {
  return [
    'radiology',
    'idempotency-result',
    facilityId,
    transactionType,
    idempotencyKey,
  ].join(':');
}

function isEncryptedReplayEnvelope(
  value:
    unknown,
): value is {
  kind: 'RADIOLOGY_ENCRYPTED_RESULT';
  associatedData: string;
  encryptedSnapshot:
    RadiologyEncryptedSnapshot;
  snapshotHash: string;
} {
  return (
    value !==
      null &&
    typeof value ===
      'object' &&
    'kind' in
      value &&
    value.kind ===
      'RADIOLOGY_ENCRYPTED_RESULT' &&
    'associatedData' in
      value &&
    typeof value.associatedData ===
      'string' &&
    'encryptedSnapshot' in
      value &&
    'snapshotHash' in
      value &&
    typeof value.snapshotHash ===
      'string'
  );
}

function safeError(
  error:
    unknown,
): Record<
  string,
  string
> {
  return {
    name:
      error instanceof
      Error
        ? error.name
        : typeof error,

    message:
      error instanceof
      Error
        ? error.message.slice(
            0,
            1_500,
          )
        : 'Unknown Radiology transaction error',
  };
}

function jsonValue(
  value:
    unknown,
): never {
  return JSON.parse(
    JSON.stringify(
      value,
      (
        _key,
        nested,
      ) => {
        if (
          nested instanceof
          Uint8Array
        ) {
          return {
            __hospitalMisType:
              'bytes',

            value:
              Buffer.from(
                nested,
              ).toString(
                'base64',
              ),
          };
        }

        return nested;
      },
    ),
  ) as never;
}

function checkpointName(
  state:
    string,
): void {
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/u.test(
      state,
    )
  ) {
    throw new TypeError(
      `Invalid Radiology transaction checkpoint ${state}`,
    );
  }
}

export interface MongoRadiologyTransactionManagerOptions {
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
    RadiologyCompensationExecutor;

  snapshotCrypto:
    RadiologySnapshotCryptoPort;
}

export class MongoRadiologyTransactionManagerAdapter
  implements RadiologyTransactionManagerPort
{
  public constructor(
    private readonly options:
      MongoRadiologyTransactionManagerOptions,
  ) {}

  public async execute<T>(
    request:
      RadiologyTransactionRequest<T>,
  ): Promise<T> {
    if (
      request.facilityId
        .trim()
        .length ===
      0
    ) {
      throw new BadRequestError(
        'An authenticated facility context is required for Radiology mutations',
      );
    }

    assertSafeJournalPayload(
      request.journalPayload,
    );

    const claim =
      await this.options.idempotency.begin(
        {
          facilityId:
            request.facilityId,

          scope:
            request.transactionType,

          key:
            request.idempotencyKey,

          requestPayload:
            request.idempotencyPayload,
        },
      );

    if (
      claim.kind ===
      'REPLAY'
    ) {
      if (
        !isEncryptedReplayEnvelope(
          claim.response,
        )
      ) {
        throw new Error(
          'Radiology idempotency replay is not encrypted',
        );
      }

      const replay =
        this.options.snapshotCrypto.unprotect<T>(
          claim.response.encryptedSnapshot,
          claim.response.associatedData,
        );

      if (
        !this.options.snapshotCrypto.matchesHash(
          replay,
          claim.response.associatedData,
          claim.response.snapshotHash,
        )
      ) {
        throw new Error(
          'Radiology idempotency replay integrity verification failed',
        );
      }

      return replay;
    }

    const transactionId =
      randomUUID();

    const compensations =
      new Map<
        string,
        RadiologyTransactionCompensation
      >();

    let acquiredLocks:
      AcquiredLock[] =
        [];

    let transactionCreated =
      false;

    try {
      await this.options.transactions.create(
        {
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

          contextSnapshot: {
            module:
              'RADIOLOGY',

            journalPayload:
              request.journalPayload,
          },

          relatedEntities:
            request.journalPayload,

          stepNames: [
            'radiology-domain-operation',
          ],
        },
      );

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
              radiologyIdempotencyOwnerId:
                claim.ownerId,

              radiologyCompensations:
                [],

              radiologyJournalPayload:
                jsonValue(
                  request.journalPayload,
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
        );

      acquiredLocks =
        await this.options.locks.acquireMany(
          {
            facilityId:
              request.facilityId,

            ownerId:
              transactionId,

            resources: [
              ...new Set(
                request.lockKeys,
              ),
            ].map(
              (
                resourceKey,
              ) => ({
                resourceType:
                  'radiology',

                resourceKey,
              }),
            ),
          },
        );

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
        RadiologyTransactionContext = {
          transactionId,

          idempotencyKey:
            request.idempotencyKey,

          checkpoint:
            async (
              state,
              data,
            ) => {
              checkpointName(
                state,
              );

              assertSafeJournalPayload(
                data ??
                  null,
                `checkpoint.${state}`,
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
                        [`radiologyCheckpoints.${state}`]:
                          {
                            data:
                              jsonValue(
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
                  'Radiology transaction checkpoint could not be persisted',
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

              const result =
                await this.options.database
                  .collection(
                    'applicationTransactions',
                  )
                  .updateOne(
                    {
                      transactionId,

                      'radiologyCompensations.key':
                        {
                          $ne:
                            compensation.key,
                        },
                    },
                    {
                      $push: {
                        radiologyCompensations:
                          {
                            ...compensation,

                            payload:
                              jsonValue(
                                compensation.payload,
                              ),

                            status:
                              'PENDING',

                            registeredAt:
                              new Date(),

                            completedAt:
                              null,

                            error:
                              null,
                          },
                      } as never,

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
                  'Radiology compensation registration could not be persisted',
                );
              }

              compensations.set(
                compensation.key,
                compensation,
              );
            },
        };

      const result =
        await request.execute(
          context,
        );

      await this.options.transactions.setStepStatus(
        transactionId,
        0,
        'EXECUTED',
      );

      const associatedData =
        replayAssociatedData(
          request.facilityId,
          request.transactionType,
          request.idempotencyKey,
        );

      const protectedResult =
        this.options.snapshotCrypto.protect(
          result,
          associatedData,
        );

      const replayEnvelope = {
        kind:
          'RADIOLOGY_ENCRYPTED_RESULT' as const,

        associatedData,

        encryptedSnapshot:
          protectedResult.encryptedValue,

        snapshotHash:
          protectedResult.valueHash,
      };

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
              radiologyDomainCompletedAt:
                new Date(),

              radiologyResultEnvelope:
                jsonValue(
                  replayEnvelope,
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

      await this.options.outbox.releaseTransactionEvents(
        transactionId,
      );

      await this.options.idempotency.complete(
        {
          facilityId:
            request.facilityId,

          scope:
            request.transactionType,

          key:
            request.idempotencyKey,

          ownerId:
            claim.ownerId,

          response:
            jsonValue(
              replayEnvelope,
            ),
        },
      );

      return result;
    } catch (
      error
    ) {
      if (
        transactionCreated
      ) {
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
      }

      const compensationSucceeded =
        await this.compensate(
          transactionId,
          [
            ...compensations.values(),
          ].reverse(),
        );

      await this.options.idempotency.fail(
        {
          facilityId:
            request.facilityId,

          scope:
            request.transactionType,

          key:
            request.idempotencyKey,

          ownerId:
            claim.ownerId,

          error:
            jsonValue(
              safeError(
                error,
              ),
            ),
        },
      );

      if (
        transactionCreated
      ) {
        await this.options.transactions.setStatus(
          transactionId,
          compensationSucceeded
            ? 'COMPENSATED'
            : 'RECOVERY_REQUIRED',
          {
            originalError:
              safeError(
                error,
              ),
          },
        );
      }

      if (
        !compensationSucceeded
      ) {
        throw new AppError({
          code:
            'RADIOLOGY_TRANSACTION_RECOVERY_REQUIRED',

          message:
            'The Radiology operation could not be completed and requires recovery',

          statusCode:
            500,

          retryable:
            false,

          cause:
            error,
        });
      }

      throw error;
    } finally {
      await this.options.locks.releaseMany(
        acquiredLocks,
      );
    }
  }

  private async compensate(
    transactionId:
      string,

    compensations:
      readonly RadiologyTransactionCompensation[],
  ): Promise<boolean> {
    if (
      compensations.length ===
      0
    ) {
      return true;
    }

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
      compensations
    ) {
      await this.setCompensationState(
        transactionId,
        compensation.key,
        'COMPENSATING',
      );

      try {
        await this.options.compensationExecutor.execute(
          compensation,
        );

        await this.setCompensationState(
          transactionId,
          compensation.key,
          'COMPENSATED',
        );
      } catch (
        error
      ) {
        succeeded =
          false;

        await this.setCompensationState(
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

  private async setCompensationState(
    transactionId:
      string,

    key:
      string,

    status:
      string,

    error?:
      Record<
        string,
        string
      >,
  ): Promise<void> {
    await this.options.database
      .collection(
        'applicationTransactions',
      )
      .updateOne(
        {
          transactionId,

          'radiologyCompensations.key':
            key,
        },
        {
          $set: {
            'radiologyCompensations.$[item].status':
              status,

            'radiologyCompensations.$[item].completedAt':
              status ===
              'COMPENSATED'
                ? new Date()
                : null,

            'radiologyCompensations.$[item].error':
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
                key,
            },
          ],
        },
      );
  }
}