import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  RegistrationQueueSnapshotCryptoPort,
  RegistrationQueueTransactionCompensation,
} from '../modules/registration-queue/registration-queue.ports.js';

import {
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
} from '../modules/registration-queue/registration-queue.transaction.constants.js';

import type {
  OpdVisitQueueRestoreSnapshot,
  QueueTokenRestoreSnapshot,
  RegistrationQueueEncryptedRestorePayload,
  RegistrationRestoreSnapshot,
} from '../modules/registration-queue/registration-queue.mutation-snapshots.js';

export interface RegistrationQueueCompensationExecutorPort {
  execute(
    compensation:
      RegistrationQueueTransactionCompensation,
  ): Promise<void>;
}

type JsonObject =
  Record<string, unknown>;

function asObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new TypeError(
      `${fieldName} must be an object`,
    );
  }

  return value as JsonObject;
}

function requiredString(
  object: JsonObject,
  fieldName: string,
): string {
  const value =
    object[fieldName];

  if (
    typeof value !== 'string' ||
    value.length === 0
  ) {
    throw new TypeError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function requiredInteger(
  object: JsonObject,
  fieldName: string,
): number {
  const value =
    object[fieldName];

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(
      `${fieldName} must be a non-negative safe integer`,
    );
  }

  return value;
}

function nullableDate(
  value: string | null,
): Date | null {
  return value === null
    ? null
    : new Date(value);
}

function nullableObjectId(
  value: string | null,
  fieldName: string,
) {
  return value === null
    ? null
    : toObjectId(
        value,
        fieldName,
      );
}

export class RegistrationQueueCompensationExecutor
implements RegistrationQueueCompensationExecutorPort {
  public constructor(
    private readonly database:
      Db,

    private readonly crypto:
      RegistrationQueueSnapshotCryptoPort,
  ) {}

  public async execute(
    compensation:
      RegistrationQueueTransactionCompensation,
  ): Promise<void> {
    switch (compensation.type) {
      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_REGISTRATION:
        await this.deleteCreated(
          'registrations',
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_OPD_VISIT:
        await this.deleteCreated(
          'opdVisits',
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_QUEUE_ENTRY:
        await this.deleteCreated(
          'queueTokens',
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_QUEUE_HISTORY:
        await this.deleteCreated(
          'queueStatusHistories',
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .RESTORE_REGISTRATION:
        await this.restoreRegistration(
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .RESTORE_OPD_VISIT:
        await this.restoreVisit(
          compensation.payload,
        );
        return;

      case REGISTRATION_QUEUE_COMPENSATION_TYPES
        .RESTORE_QUEUE_ENTRY:
        await this.restoreQueueToken(
          compensation.payload,
        );
        return;

      default:
        throw new Error(
          `Unsupported registration and queue compensation type: ${compensation.type}`,
        );
    }
  }

  private async deleteCreated(
    collectionName: string,
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const object =
      asObject(
        payload,
        'payload',
      );

    const entityId =
      requiredString(
        object,
        'entityId',
      );

    const expectedVersion =
      requiredInteger(
        object,
        'expectedVersion',
      );

    const transactionId =
      requiredString(
        object,
        'transactionId',
      );

    const collection =
      this.database.collection(
        collectionName,
      );

    const result =
      await collection.deleteOne({
        _id:
          toObjectId(
            entityId,
            'entityId',
          ),

        version:
          expectedVersion,

        transactionId,
      });

    if (result.deletedCount === 1) {
      return;
    }

    const existing =
      await collection.findOne({
        _id:
          toObjectId(
            entityId,
            'entityId',
          ),
      });

    if (existing === null) {
      return;
    }

    throw new ConflictError(
      `Created ${collectionName} record changed before compensation`,
    );
  }

  private protectedPayload(
    payload:
      Record<string, unknown>,
  ): RegistrationQueueEncryptedRestorePayload {
    const object =
      asObject(
        payload,
        'payload',
      );

    const encryptedSnapshot =
      asObject(
        object[
          'encryptedSnapshot'
        ],
        'encryptedSnapshot',
      );

    return {
      entityId:
        requiredString(
          object,
          'entityId',
        ),

      expectedPostVersion:
        requiredInteger(
          object,
          'expectedPostVersion',
        ),

      associatedData:
        requiredString(
          object,
          'associatedData',
        ),

      encryptedSnapshot: {
        algorithm:
          requiredString(
            encryptedSnapshot,
            'algorithm',
          ) as 'AES-256-GCM',

        keyVersion:
          requiredString(
            encryptedSnapshot,
            'keyVersion',
          ),

        initializationVector:
          requiredString(
            encryptedSnapshot,
            'initializationVector',
          ),

        authenticationTag:
          requiredString(
            encryptedSnapshot,
            'authenticationTag',
          ),

        ciphertext:
          requiredString(
            encryptedSnapshot,
            'ciphertext',
          ),
      },

      snapshotHash:
        requiredString(
          object,
          'snapshotHash',
        ),
    };
  }

  private decryptSnapshot<T>(
    payload:
      Record<string, unknown>,
  ): {
    restore:
      RegistrationQueueEncryptedRestorePayload;

    snapshot:
      T;
  } {
    const restore =
      this.protectedPayload(
        payload,
      );

    const snapshot =
      this.crypto.unprotect<T>(
        restore.encryptedSnapshot,
        restore.associatedData,
      );

    if (
      !this.crypto.matchesHash(
        snapshot,
        restore.associatedData,
        restore.snapshotHash,
      )
    ) {
      throw new ConflictError(
        'Registration and queue compensation snapshot integrity check failed',
      );
    }

    return {
      restore,
      snapshot,
    };
  }

  private async restoreRegistration(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const {
      restore,
      snapshot,
    } =
      this.decryptSnapshot<RegistrationRestoreSnapshot>(
        payload,
      );

    const result =
      await this.database
        .collection(
          'registrations',
        )
        .updateOne(
          {
            _id:
              toObjectId(
                restore.entityId,
                'entityId',
              ),

            version:
              restore.expectedPostVersion,
          },
          {
            $set: {
              status:
                snapshot.status,

              checkedInAt:
                nullableDate(
                  snapshot.checkedInAt,
                ),

              departmentId:
                toObjectId(
                  snapshot.departmentId,
                  'departmentId',
                ),

              clinicId:
                nullableObjectId(
                  snapshot.clinicId,
                  'clinicId',
                ),

              servicePointId:
                nullableObjectId(
                  snapshot.servicePointId,
                  'servicePointId',
                ),

              assignedProviderId:
                nullableObjectId(
                  snapshot.assignedProviderId,
                  'assignedProviderId',
                ),

              registrationNotes:
                snapshot.registrationNotes,

              cancelledAt:
                nullableDate(
                  snapshot.cancelledAt,
                ),

              cancelledBy:
                nullableObjectId(
                  snapshot.cancelledBy,
                  'cancelledBy',
                ),

              cancellationReason:
                snapshot.cancellationReason,

              supersededByRegistrationId:
                nullableObjectId(
                  snapshot.supersededByRegistrationId,
                  'supersededByRegistrationId',
                ),

              correctionReason:
                snapshot.correctionReason,

              version:
                snapshot.version,

              updatedBy:
                toObjectId(
                  snapshot.updatedBy,
                  'updatedBy',
                ),

              updatedAt:
                new Date(
                  snapshot.updatedAt,
                ),
            },
          },
        );

    await this.assertRestoreResult(
      'registration',
      restore.entityId,
      result.matchedCount,
      snapshot.version,
    );
  }

  private async restoreVisit(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const {
      restore,
      snapshot,
    } =
      this.decryptSnapshot<OpdVisitQueueRestoreSnapshot>(
        payload,
      );

    const result =
      await this.database
        .collection(
          'opdVisits',
        )
        .updateOne(
          {
            _id:
              toObjectId(
                restore.entityId,
                'entityId',
              ),

            version:
              restore.expectedPostVersion,
          },
          {
            $set: {
              status:
                snapshot.status,

              departmentId:
                toObjectId(
                  snapshot.departmentId,
                  'departmentId',
                ),

              clinicId:
                nullableObjectId(
                  snapshot.clinicId,
                  'clinicId',
                ),

              servicePointId:
                nullableObjectId(
                  snapshot.servicePointId,
                  'servicePointId',
                ),

              assignedProviderId:
                nullableObjectId(
                  snapshot.assignedProviderId,
                  'assignedProviderId',
                ),

              assignedCounterId:
                nullableObjectId(
                  snapshot.assignedCounterId,
                  'assignedCounterId',
                ),

              currentQueueTokenId:
                nullableObjectId(
                  snapshot.currentQueueTokenId,
                  'currentQueueTokenId',
                ),

              activeVisitKey:
                snapshot.activeVisitKey,

              checkedInAt:
                nullableDate(
                  snapshot.checkedInAt,
                ),

              queuedAt:
                nullableDate(
                  snapshot.queuedAt,
                ),

              serviceStartedAt:
                nullableDate(
                  snapshot.serviceStartedAt,
                ),

              completedAt:
                nullableDate(
                  snapshot.completedAt,
                ),

              cancelledAt:
                nullableDate(
                  snapshot.cancelledAt,
                ),

              cancelledBy:
                nullableObjectId(
                  snapshot.cancelledBy,
                  'cancelledBy',
                ),

              cancellationReason:
                snapshot.cancellationReason,

              noShowAt:
                nullableDate(
                  snapshot.noShowAt,
                ),

              noShowMarkedBy:
                nullableObjectId(
                  snapshot.noShowMarkedBy,
                  'noShowMarkedBy',
                ),

              supersededByVisitId:
                nullableObjectId(
                  snapshot.supersededByVisitId,
                  'supersededByVisitId',
                ),

              correctionReason:
                snapshot.correctionReason,

              version:
                snapshot.version,

              updatedBy:
                toObjectId(
                  snapshot.updatedBy,
                  'updatedBy',
                ),

              updatedAt:
                new Date(
                  snapshot.updatedAt,
                ),
            },
          },
        );

    await this.assertRestoreResult(
      'OPD visit',
      restore.entityId,
      result.matchedCount,
      snapshot.version,
    );
  }

  private async restoreQueueToken(
    payload:
      Record<string, unknown>,
  ): Promise<void> {
    const {
      restore,
      snapshot,
    } =
      this.decryptSnapshot<QueueTokenRestoreSnapshot>(
        payload,
      );

    const result =
      await this.database
        .collection(
          'queueTokens',
        )
        .updateOne(
          {
            _id:
              toObjectId(
                restore.entityId,
                'entityId',
              ),

            version:
              restore.expectedPostVersion,
          },
          {
            $set: {
              queueDefinitionId:
                toObjectId(
                  snapshot.queueDefinitionId,
                  'queueDefinitionId',
                ),

              status:
                snapshot.status,

              priorityClass:
                snapshot.priorityClass,

              priorityScore:
                snapshot.priorityScore,

              triagePriority:
                snapshot.triagePriority,

              emergencyOverride:
                snapshot.emergencyOverride,

              emergencyOverrideReason:
                snapshot.emergencyOverrideReason,

              specialCategories: [
                ...snapshot.specialCategories,
              ],

              assignedProviderId:
                nullableObjectId(
                  snapshot.assignedProviderId,
                  'assignedProviderId',
                ),

              assignedCounterId:
                nullableObjectId(
                  snapshot.assignedCounterId,
                  'assignedCounterId',
                ),

              activeEntryKey:
                snapshot.activeEntryKey,

              calledAt:
                nullableDate(
                  snapshot.calledAt,
                ),

              servingAt:
                nullableDate(
                  snapshot.servingAt,
                ),

              skippedAt:
                nullableDate(
                  snapshot.skippedAt,
                ),

              transferredAt:
                nullableDate(
                  snapshot.transferredAt,
                ),

              completedAt:
                nullableDate(
                  snapshot.completedAt,
                ),

              cancelledAt:
                nullableDate(
                  snapshot.cancelledAt,
                ),

              noShowAt:
                nullableDate(
                  snapshot.noShowAt,
                ),

              skipCount:
                snapshot.skipCount,

              recallCount:
                snapshot.recallCount,

              transferCount:
                snapshot.transferCount,

              estimatedWaitMinutes:
                snapshot.estimatedWaitMinutes,

              estimatedServiceAt:
                nullableDate(
                  snapshot.estimatedServiceAt,
                ),

              transferredFromQueueTokenId:
                nullableObjectId(
                  snapshot.transferredFromQueueTokenId,
                  'transferredFromQueueTokenId',
                ),

              transferredToQueueTokenId:
                nullableObjectId(
                  snapshot.transferredToQueueTokenId,
                  'transferredToQueueTokenId',
                ),

              transferReason:
                snapshot.transferReason,

              statusReason:
                snapshot.statusReason,

              lastStatusChangedAt:
                new Date(
                  snapshot.lastStatusChangedAt,
                ),

              lastStatusChangedBy:
                toObjectId(
                  snapshot.lastStatusChangedBy,
                  'lastStatusChangedBy',
                ),

              version:
                snapshot.version,

              updatedBy:
                toObjectId(
                  snapshot.updatedBy,
                  'updatedBy',
                ),

              updatedAt:
                new Date(
                  snapshot.updatedAt,
                ),
            },
          },
        );

    await this.assertRestoreResult(
      'queue entry',
      restore.entityId,
      result.matchedCount,
      snapshot.version,
    );
  }

  private async assertRestoreResult(
    entityType: string,
    entityId: string,
    matchedCount: number,
    restoredVersion: number,
  ): Promise<void> {
    if (matchedCount === 1) {
      return;
    }

    const collectionName =
      entityType ===
      'registration'
        ? 'registrations'
        : entityType ===
            'OPD visit'
          ? 'opdVisits'
          : 'queueTokens';

    const existing =
      await this.database
        .collection(
          collectionName,
        )
        .findOne({
          _id:
            toObjectId(
              entityId,
              'entityId',
            ),
        });

    if (
      existing !== null &&
      existing[
        'version'
      ] === restoredVersion
    ) {
      return;
    }

    throw new ConflictError(
      `${entityType} changed before compensation could restore it`,
    );
  }
}