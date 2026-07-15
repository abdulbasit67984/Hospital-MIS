import {
  createHash,
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

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{
      [key: string]:
        JsonValue;
    }>;

type IdempotencyDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  scope: string;
  key: string;
  requestHash: string;

  status:
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED';

  ownerId: string;

  responseSnapshot?:
    JsonValue;

  errorSnapshot?:
    JsonValue;

  expiresAt: Date;
  purgeAt: Date;

  version: number;
};

export type IdempotencyClaim =
  | Readonly<{
      kind: 'ACQUIRED';
      ownerId: string;
    }>
  | Readonly<{
      kind: 'REPLAY';
      response:
        JsonValue;
    }>;

function canonicalize(
  value: unknown,
): JsonValue {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (
    typeof value === 'number'
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new Error(
        'Non-finite numbers cannot be hashed',
      );
    }

    return value;
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    typeof value === 'object'
  ) {
    const entries =
      Object.entries(value)
        .sort(
          (
            [first],
            [second],
          ) =>
            first.localeCompare(
              second,
            ),
        );

    return Object.fromEntries(
      entries.map(
        ([key, item]) => [
          key,
          canonicalize(item),
        ],
      ),
    );
  }

  return String(value);
}

export function requestHash(
  payload: unknown,
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        canonicalize(
          payload,
        ),
      ),
      'utf8',
    )
    .digest('hex');
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

export class IdempotencyInProgressError
extends AppError {
  constructor() {
    super({
      code:
        'IDEMPOTENCY_IN_PROGRESS',

      message:
        'An operation with this idempotency key is already in progress',

      statusCode:
        409,

      retryable:
        true,
    });
  }
}

export class IdempotencyService {
  constructor(
    private readonly database: Db,
  ) {}

  async begin(
    input: Readonly<{
      facilityId: string;
      scope: string;
      key: string;
      requestPayload: unknown;
      expiresInMilliseconds?: number;
      retentionMilliseconds?: number;
      now?: Date;
    }>,
  ): Promise<IdempotencyClaim> {
    const now =
      input.now ??
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
          (
            input.expiresInMilliseconds ??
            10 * 60 * 1000
          ),
      );

    const purgeAt =
      new Date(
        now.getTime() +
          (
            input.retentionMilliseconds ??
            30 * 24 * 60 * 60 * 1000
          ),
      );

    const ownerId =
      randomUUID();

    const hash =
      requestHash(
        input.requestPayload,
      );

    const collection =
      this.database
        .collection<IdempotencyDocument>(
          'idempotencyKeys',
        );

    try {
      await collection.insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        scope:
          input.scope,

        key:
          input.key,

        requestHash:
          hash,

        status:
          'IN_PROGRESS',

        ownerId,

        expiresAt,
        purgeAt,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });

      return {
        kind:
          'ACQUIRED',

        ownerId,
      };
    } catch (error) {
      if (
        !isDuplicateKey(error)
      ) {
        throw error;
      }
    }

    const existing =
      await collection.findOne({
        facilityId:
          toObjectId(
            input.facilityId,
          ),

        scope:
          input.scope,

        key:
          input.key,
      });

    if (
      existing === null
    ) {
      throw new ConflictError(
        'Idempotency record disappeared during processing',
      );
    }

    if (
      existing.requestHash !==
      hash
    ) {
      throw new ConflictError(
        'The idempotency key was already used with a different request',
      );
    }

    if (
      existing.status ===
        'COMPLETED' &&
      existing.responseSnapshot !==
        undefined
    ) {
      return {
        kind:
          'REPLAY',

        response:
          existing.responseSnapshot,
      };
    }

    if (
      existing.status ===
        'IN_PROGRESS' &&
      existing.expiresAt >
        now
    ) {
      throw new IdempotencyInProgressError();
    }

    const takeover =
      await collection.findOneAndUpdate(
        {
          _id:
            existing._id,

          version:
            existing.version,

          $or: [
            {
              status:
                'FAILED',
            },

            {
              status:
                'IN_PROGRESS',

              expiresAt: {
                $lte:
                  now,
              },
            },
          ],
        },

        {
          $set: {
            status:
              'IN_PROGRESS',

            ownerId,

            expiresAt,

            purgeAt,
          },

          $unset: {
            responseSnapshot:
              '',

            errorSnapshot:
              '',

            completedAt:
              '',

            failedAt:
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

        {
          returnDocument:
            'after',
        },
      );

    if (
      takeover === null
    ) {
      throw new IdempotencyInProgressError();
    }

    return {
      kind:
        'ACQUIRED',

      ownerId,
    };
  }

  async complete(
    input: Readonly<{
      facilityId: string;
      scope: string;
      key: string;
      ownerId: string;
      response: JsonValue;
      now?: Date;
    }>,
  ): Promise<void> {
    const result =
      await this.database
        .collection<IdempotencyDocument>(
          'idempotencyKeys',
        )
        .updateOne(
          {
            facilityId:
              toObjectId(
                input.facilityId,
              ),

            scope:
              input.scope,

            key:
              input.key,

            ownerId:
              input.ownerId,

            status:
              'IN_PROGRESS',
          },

          {
            $set: {
              status:
                'COMPLETED',

              responseSnapshot:
                input.response,

              completedAt:
                input.now ??
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
      result.modifiedCount !== 1
    ) {
      throw new ConflictError(
        'Idempotency operation ownership was lost before completion',
      );
    }
  }

  async fail(
    input: Readonly<{
      facilityId: string;
      scope: string;
      key: string;
      ownerId: string;
      error: JsonValue;
      now?: Date;
    }>,
  ): Promise<void> {
    await this.database
      .collection<IdempotencyDocument>(
        'idempotencyKeys',
      )
      .updateOne(
        {
          facilityId:
            toObjectId(
              input.facilityId,
            ),

          scope:
            input.scope,

          key:
            input.key,

          ownerId:
            input.ownerId,

          status:
            'IN_PROGRESS',
        },

        {
          $set: {
            status:
              'FAILED',

            errorSnapshot:
              input.error,

            failedAt:
              input.now ??
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
  }
}