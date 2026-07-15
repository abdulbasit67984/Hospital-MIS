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
} from '@hospital-mis/shared';

export type LockResource =
  Readonly<{
    resourceType: string;
    resourceKey: string;
  }>;

export type AcquiredLock =
  LockResource &
    Readonly<{
      facilityId: string;
      ownerId: string;
      leaseToken: string;
      leaseExpiresAt: Date;
    }>;

type LockDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  resourceType: string;
  resourceKey: string;

  ownerId: string;
  leaseToken: string;
  leaseExpiresAt: Date;

  version: number;
};

export class OperationLockUnavailableError
extends AppError {
  constructor(
    resource:
      LockResource,
  ) {
    super({
      code:
        'OPERATION_LOCK_UNAVAILABLE',

      message:
        `Resource ${resource.resourceType}:${resource.resourceKey} is currently locked`,

      statusCode:
        409,

      retryable:
        true,
    });
  }
}

function isDuplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

export class OperationLockService {
  constructor(
    private readonly database: Db,
  ) {}

  async acquire(
    input:
      LockResource &
      Readonly<{
        facilityId: string;
        ownerId: string;
        leaseMilliseconds?: number;
        now?: Date;
      }>,
  ): Promise<AcquiredLock> {
    const now =
      input.now ??
      new Date();

    const leaseToken =
      randomUUID();

    const leaseExpiresAt =
      new Date(
        now.getTime() +
          (
            input.leaseMilliseconds ??
            30_000
          ),
      );

    const facilityId =
      toObjectId(
        input.facilityId,
      );

    const collection =
      this.database
        .collection<LockDocument>(
          'operationLocks',
        );

    try {
      const document =
        await collection
          .findOneAndUpdate(
            {
              facilityId,

              resourceType:
                input.resourceType,

              resourceKey:
                input.resourceKey,

              $or: [
                {
                  leaseExpiresAt: {
                    $lte:
                      now,
                  },
                },

                {
                  ownerId:
                    input.ownerId,
                },
              ],
            },

            {
              $setOnInsert: {
                _id:
                  createObjectId(),

                facilityId,

                resourceType:
                  input.resourceType,

                resourceKey:
                  input.resourceKey,

                schemaVersion:
                  1,

                version:
                  0,

                createdAt:
                  now,
              },

              $set: {
                ownerId:
                  input.ownerId,

                leaseToken,

                leaseExpiresAt,

                updatedAt:
                  now,
              },

              $inc: {
                version:
                  1,
              },
            },

            {
              upsert:
                true,

              returnDocument:
                'after',
            },
          );

      if (
        document === null
      ) {
        throw new OperationLockUnavailableError(
          input,
        );
      }

      return {
        facilityId:
          input.facilityId,

        resourceType:
          input.resourceType,

        resourceKey:
          input.resourceKey,

        ownerId:
          input.ownerId,

        leaseToken,

        leaseExpiresAt,
      };
    } catch (error) {
      if (
        isDuplicateKey(error)
      ) {
        throw new OperationLockUnavailableError(
          input,
        );
      }

      throw error;
    }
  }

  async acquireMany(
    input: Readonly<{
      facilityId: string;
      ownerId: string;
      resources:
        readonly LockResource[];
      leaseMilliseconds?: number;
    }>,
  ): Promise<
    readonly AcquiredLock[]
  > {
    const ordered = [
      ...input.resources,
    ].sort(
      (
        first,
        second,
      ) =>
        `${first.resourceType}:${first.resourceKey}`
          .localeCompare(
            `${second.resourceType}:${second.resourceKey}`,
          ),
    );

    const acquired:
      AcquiredLock[] = [];

    try {
      for (
        const resource of
        ordered
      ) {
        acquired.push(
          await this.acquire({
            ...resource,

            facilityId:
              input.facilityId,

            ownerId:
              input.ownerId,

            leaseMilliseconds:
              input.leaseMilliseconds,
          }),
        );
      }

      return acquired;
    } catch (error) {
      await this.releaseMany(
        acquired,
      );

      throw error;
    }
  }

  async renew(
    lock:
      AcquiredLock,

    leaseMilliseconds =
      30_000,
  ): Promise<AcquiredLock> {
    const now =
      new Date();

    const leaseExpiresAt =
      new Date(
        now.getTime() +
          leaseMilliseconds,
      );

    const result =
      await this.database
        .collection<LockDocument>(
          'operationLocks',
        )
        .updateOne(
          {
            facilityId:
              toObjectId(
                lock.facilityId,
              ),

            resourceType:
              lock.resourceType,

            resourceKey:
              lock.resourceKey,

            ownerId:
              lock.ownerId,

            leaseToken:
              lock.leaseToken,

            leaseExpiresAt: {
              $gt:
                now,
            },
          },

          {
            $set: {
              leaseExpiresAt,
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
      result.modifiedCount !== 1
    ) {
      throw new OperationLockUnavailableError(
        lock,
      );
    }

    return {
      ...lock,
      leaseExpiresAt,
    };
  }

  async release(
    lock:
      AcquiredLock,
  ): Promise<void> {
    await this.database
      .collection<LockDocument>(
        'operationLocks',
      )
      .deleteOne({
        facilityId:
          toObjectId(
            lock.facilityId,
          ),

        resourceType:
          lock.resourceType,

        resourceKey:
          lock.resourceKey,

        ownerId:
          lock.ownerId,

        leaseToken:
          lock.leaseToken,
      });
  }

  async releaseMany(
    locks:
      readonly AcquiredLock[],
  ): Promise<void> {
    for (
      const lock of
      [...locks].reverse()
    ) {
      await this.release(
        lock,
      ).catch(() => undefined);
    }
  }
}