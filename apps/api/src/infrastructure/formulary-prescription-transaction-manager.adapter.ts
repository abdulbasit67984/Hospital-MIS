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

import {
  Types,
} from 'mongoose';

import type {
  FormularyPrescriptionEncryptedSnapshot,
  FormularyPrescriptionSnapshotCryptoPort,
  FormularyPrescriptionTransactionCompensation,
  FormularyPrescriptionTransactionContext,
  FormularyPrescriptionTransactionManagerPort,
  FormularyPrescriptionTransactionRequest,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import {
  FORMULARY_PRESCRIPTION_RECOVERY_MODES,
  type FormularyPrescriptionRecoveryMode,
} from '../modules/formulary-prescriptions/formulary-prescriptions.transaction.constants.js';

import {
  prescriptionIdempotencyResultAssociatedData,
} from '../modules/formulary-prescriptions/formulary-prescriptions.normalization.js';

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
  FormularyPrescriptionCompensationExecutorPort,
} from './formulary-prescription-compensation.executor.js';

import {
  assertSafeFormularyPrescriptionEventPayload,
} from './formulary-prescription-runtime.adapters.js';

type EncryptedResultEnvelope = {
  kind:
    'FORMULARY_PRESCRIPTION_ENCRYPTED_RESULT';

  associatedData:
    string;

  encryptedSnapshot:
    FormularyPrescriptionEncryptedSnapshot;

  snapshotHash:
    string;
};

type PersistedCompensation =
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

type SerializedDomainValue =
  | null
  | boolean
  | number
  | string
  | SerializedDomainValue[]
  | {
      [key: string]:
        SerializedDomainValue;
    };

function isEncryptedResultEnvelope(
  value:
    unknown,
): value is EncryptedResultEnvelope {
  return (
    typeof value ===
      'object' &&
    value !==
      null &&
    'kind' in
      value &&
    value.kind ===
      'FORMULARY_PRESCRIPTION_ENCRYPTED_RESULT' &&
    'associatedData' in
      value &&
    typeof value.associatedData ===
      'string' &&
    'snapshotHash' in
      value &&
    typeof value.snapshotHash ===
      'string' &&
    'encryptedSnapshot' in
      value &&
    typeof value.encryptedSnapshot ===
      'object' &&
    value.encryptedSnapshot !==
      null
  );
}

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
        : 'Unknown formulary and prescription transaction error',
  };
}

function journalSnapshot(
  value:
    unknown,
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

function serializeDomainValue(
  value:
    unknown,
  depth = 0,
): SerializedDomainValue {
  if (
    depth >
    20
  ) {
    throw new TypeError(
      'Idempotency result exceeds the maximum serialization depth',
    );
  }

  if (
    value ===
      null ||
    typeof value ===
      'boolean' ||
    typeof value ===
      'string'
  ) {
    return value;
  }

  if (
    typeof value ===
    'number'
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      throw new TypeError(
        'Idempotency result contains a non-finite number',
      );
    }

    return value;
  }

  if (
    typeof value ===
    'bigint'
  ) {
    return {
      __hospitalMisType:
        'bigint',

      value:
        value.toString(),
    };
  }

  if (
    value instanceof
    Date
  ) {
    return {
      __hospitalMisType:
        'date',

      value:
        value.toISOString(),
    };
  }

  if (
    value instanceof
    Uint8Array
  ) {
    return {
      __hospitalMisType:
        'bytes',

      value:
        Buffer.from(
          value,
        ).toString(
          'base64',
        ),
    };
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      (item) =>
        serializeDomainValue(
          item,
          depth + 1,
        ),
    );
  }

  if (
    typeof value ===
      'object'
  ) {
    const object =
      value as
        Record<string, unknown>;

    if (
      '_bsontype' in
        object &&
      object[
        '_bsontype'
      ] ===
        'Decimal128' &&
      'toString' in
        object &&
      typeof object[
        'toString'
      ] ===
        'function'
    ) {
      return {
        __hospitalMisType:
          'decimal128',

        value:
          (
            object[
              'toString'
            ] as
              () => string
          )(),
      };
    }

    if (
      'toHexString' in
        object &&
      typeof object[
        'toHexString'
      ] ===
        'function'
    ) {
      return {
        __hospitalMisType:
          'objectId',

        value:
          (
            object[
              'toHexString'
            ] as
              () => string
          )(),
      };
    }

    return Object.fromEntries(
      Object.entries(
        object,
      ).map(
        (
          [
            key,
            nestedValue,
          ],
        ) => [
          key,
          serializeDomainValue(
            nestedValue,
            depth + 1,
          ),
        ],
      ),
    );
  }

  throw new TypeError(
    `Unsupported idempotency result type ${typeof value}`,
  );
}

function deserializeDomainValue(
  value:
    SerializedDomainValue,
): unknown {
  if (
    value ===
      null ||
    typeof value ===
      'boolean' ||
    typeof value ===
      'number' ||
    typeof value ===
      'string'
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      deserializeDomainValue,
    );
  }

  if (
    '__hospitalMisType' in
      value &&
    typeof value[
      '__hospitalMisType'
    ] ===
      'string'
  ) {
    const type =
      value[
        '__hospitalMisType'
      ];

    const rawValue =
      value[
        'value'
      ];

    if (
      typeof rawValue !==
      'string'
    ) {
      throw new TypeError(
        'Serialized domain marker does not contain a string value',
      );
    }

    switch (
      type
    ) {
      case 'date':
        return new Date(
          rawValue,
        );

      case 'objectId':
        return new Types.ObjectId(
          rawValue,
        );

      case 'decimal128':
        return Types.Decimal128.fromString(
          rawValue,
        );

      case 'bytes':
        return new Uint8Array(
          Buffer.from(
            rawValue,
            'base64',
          ),
        );

      case 'bigint':
        return BigInt(
          rawValue,
        );

      default:
        throw new TypeError(
          `Unsupported serialized domain marker ${type}`,
        );
    }
  }

  return Object.fromEntries(
    Object.entries(
      value,
    ).map(
      (
        [
          key,
          nestedValue,
        ],
      ) => [
        key,
        deserializeDomainValue(
          nestedValue,
        ),
      ],
    ),
  );
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
        'formulary-prescriptions',

      resourceKey,
    }),
  );
}

function assertCheckpointName(
  state:
    string,
): void {
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/u.test(
      state,
    )
  ) {
    throw new Error(
      `Invalid formulary and prescription transaction checkpoint: ${state}`,
    );
  }
}

export interface FormularyPrescriptionTransactionManagerAdapterOptions {
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
    FormularyPrescriptionCompensationExecutorPort;

  snapshotCrypto:
    FormularyPrescriptionSnapshotCryptoPort;
}

export class MongoFormularyPrescriptionTransactionManagerAdapter
implements FormularyPrescriptionTransactionManagerPort {
  public constructor(
    private readonly options:
      FormularyPrescriptionTransactionManagerAdapterOptions,
  ) {}

  public async execute<T>(
    request:
      FormularyPrescriptionTransactionRequest<T>,
  ): Promise<T> {
    if (
      request.facilityId.length ===
      0
    ) {
      throw new BadRequestError(
        'An authenticated facility context is required for formulary and prescription mutations',
      );
    }

    assertSafeFormularyPrescriptionEventPayload(
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
        FormularyPrescriptionTransactionCompensation
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
            journalSnapshot(
              request.journalPayload,
            ),

          relatedEntities: {
            lockKeys: [
              ...request.lockKeys,
            ],
          },

          stepNames: [
            'formulary-prescription-domain-operation',
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
              formularyPrescriptionIdempotencyOwnerId:
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
        FormularyPrescriptionTransactionContext = {
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

            if (
              data !==
              undefined
            ) {
              assertSafeFormularyPrescriptionEventPayload(
                data,
              );
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
                      [`formularyPrescriptionCheckpoints.${state}`]: {
                        data:
                          journalSnapshot(
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
                'Formulary and prescription transaction checkpoint could not be persisted',
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
              PersistedCompensation = {
              ...compensation,

              payload:
                journalSnapshot(
                  compensation.payload,
                ) as
                  Record<string, unknown>,

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

                    'formularyPrescriptionCompensations.key': {
                      $ne:
                        compensation.key,
                    },
                  },
                  {
                    $push: {
                      formularyPrescriptionCompensations:
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

                    'formularyPrescriptionCompensations.key':
                      compensation.key,
                  });

              if (
                existing ===
                null
              ) {
                throw new Error(
                  'Formulary and prescription compensation could not be persisted',
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
                ...compensations.values(),
              ],
            );
        } catch (
          compensationError
        ) {
          failureHandled =
            true;

          await this.setRecoveryRequired(
            transactionId,
            FORMULARY_PRESCRIPTION_RECOVERY_MODES.COMPENSATE,
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
                'Formulary and prescription compensation execution was interrupted',
            },
          );

          throw new AppError({
            code:
              'FORMULARY_PRESCRIPTION_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The formulary or prescription operation failed and requires transaction recovery',

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

        if (
          !compensated
        ) {
          await this.setRecoveryRequired(
            transactionId,
            FORMULARY_PRESCRIPTION_RECOVERY_MODES.COMPENSATE,
            {
              originalError:
                safeError(
                  error,
                ),

              reason:
                'One or more formulary and prescription compensations failed',
            },
          );

          throw new AppError({
            code:
              'FORMULARY_PRESCRIPTION_TRANSACTION_RECOVERY_REQUIRED',

            message:
              'The formulary or prescription operation failed and requires transaction recovery',

            statusCode:
              500,

            retryable:
              false,

            cause:
              error,
          });
        }

        await this.options
          .compensationExecutor
          .cleanupTransactionArtifacts(
            transactionId,
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
          FORMULARY_PRESCRIPTION_RECOVERY_MODES.FINALIZE_COMPLETED,
          {
            reason:
              'The formulary or prescription operation completed but idempotency or outbox finalization failed',

            error:
              safeError(
                error,
              ),
          },
        );

        throw new AppError({
          code:
            'FORMULARY_PRESCRIPTION_FINALIZATION_RECOVERY_REQUIRED',

          message:
            'The formulary or prescription operation completed but finalization requires recovery',

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
    facilityId:
      string,

    transactionType:
      string,

    idempotencyKey:
      string,

    result:
      T,
  ): EncryptedResultEnvelope {
    const associatedData =
      prescriptionIdempotencyResultAssociatedData(
        facilityId,
        transactionType,
        idempotencyKey,
      );

    const serialized =
      serializeDomainValue(
        result,
      );

    const protectedResult =
      this.options
        .snapshotCrypto
        .protect(
          serialized,
          associatedData,
        );

    return {
      kind:
        'FORMULARY_PRESCRIPTION_ENCRYPTED_RESULT',

      associatedData,

      encryptedSnapshot:
        protectedResult.encryptedValue,

      snapshotHash:
        protectedResult.valueHash,
    };
  }

  private decryptReplayResult<T>(
    response:
      unknown,
  ): T {
    if (
      !isEncryptedResultEnvelope(
        response,
      )
    ) {
      throw new AppError({
        code:
          'FORMULARY_PRESCRIPTION_IDEMPOTENCY_SNAPSHOT_INVALID',

        message:
          'The formulary and prescription idempotency response could not be verified',

        statusCode:
          500,

        expose:
          false,
      });
    }

    const serialized =
      this.options
        .snapshotCrypto
        .unprotect<SerializedDomainValue>(
          response.encryptedSnapshot,
          response.associatedData,
        );

    if (
      !this.options
        .snapshotCrypto
        .matchesHash(
          serialized,
          response.associatedData,
          response.snapshotHash,
        )
    ) {
      throw new AppError({
        code:
          'FORMULARY_PRESCRIPTION_IDEMPOTENCY_SNAPSHOT_INVALID',

        message:
          'The formulary and prescription idempotency response failed integrity verification',

        statusCode:
          500,

        expose:
          false,
      });
    }

    return deserializeDomainValue(
      serialized,
    ) as T;
  }

  private async persistCompletedDomainResult<T>(
    transactionId:
      string,

    facilityId:
      string,

    transactionType:
      string,

    idempotencyKey:
      string,

    result:
      T,
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
              formularyPrescriptionResultSnapshot:
                this.encryptResult(
                  facilityId,
                  transactionType,
                  idempotencyKey,
                  result,
                ),

              formularyPrescriptionDomainCompletedAt:
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
        'Formulary and prescription transaction result could not be persisted for recovery',
      );
    }
  }

  private async setRecoveryRequired(
    transactionId:
      string,

    mode:
      FormularyPrescriptionRecoveryMode,

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

            formularyPrescriptionRecoveryMode:
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
    transactionId:
      string,
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
            formularyPrescriptionRecoveryMode:
              '',

            formularyPrescriptionRecoveryLeaseOwner:
              '',

            formularyPrescriptionRecoveryLeaseToken:
              '',

            formularyPrescriptionRecoveryLeaseExpiresAt:
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
    transactionId:
      string,

    compensations:
      readonly FormularyPrescriptionTransactionCompensation[],
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
    transactionId:
      string,

    compensationKey:
      string,

    status:
      PersistedCompensation['status'],

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
}