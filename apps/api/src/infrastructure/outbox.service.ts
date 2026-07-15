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

type OutboxDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  eventId: string;
  transactionId: string;

  eventType: string;
  aggregateType: string;
  aggregateId: string;

  payload: unknown;

  status:
    | 'BLOCKED'
    | 'PENDING'
    | 'PROCESSING'
    | 'PUBLISHED'
    | 'FAILED'
    | 'DEAD_LETTER';

  availableAt: Date;

  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: Date;

  attemptCount: number;
  publishedAt?: Date;
  lastError?: unknown;

  version: number;
};

export type LeasedOutboxEvent =
  Readonly<{
    facilityId: string;
    eventId: string;
    transactionId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    leaseOwner: string;
    leaseToken: string;
    attemptCount: number;
  }>;

function safeError(
  error: unknown,
): Readonly<{
  name: string;
  message: string;
}> {
  return {
    name:
      error instanceof Error
        ? error.name
        : typeof error,

    message:
      error instanceof Error
        ? error.message.slice(
            0,
            1000,
          )
        : 'Unknown outbox error',
  };
}

export class OutboxService {
  constructor(
    private readonly database: Db,
  ) {}

  async enqueueBlocked(
    input: Readonly<{
      facilityId: string;
      transactionId: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: unknown;
      availableAt?: Date;
    }>,
  ): Promise<string> {
    const now =
      new Date();

    const eventId =
      randomUUID();

    await this.database
      .collection<OutboxDocument>(
        'outboxEvents',
      )
      .insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            input.facilityId,
          ),

        eventId,

        transactionId:
          input.transactionId,

        eventType:
          input.eventType,

        aggregateType:
          input.aggregateType,

        aggregateId:
          input.aggregateId,

        payload:
          input.payload,

        status:
          'BLOCKED',

        availableAt:
          input.availableAt ??
          now,

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
      });

    return eventId;
  }

  async releaseTransactionEvents(
    transactionId: string,
  ): Promise<number> {
    const transaction =
      await this.database
        .collection(
          'applicationTransactions',
        )
        .findOne({
          transactionId,

          status:
            'COMPLETED',
        });

    if (
      transaction === null
    ) {
      return 0;
    }

    const result =
      await this.database
        .collection<OutboxDocument>(
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
                'PENDING',
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

  async leaseNext(
    input: Readonly<{
      workerId: string;
      leaseMilliseconds?: number;
      now?: Date;
    }>,
  ): Promise<
    LeasedOutboxEvent | null
  > {
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

    const event =
      await this.database
        .collection<OutboxDocument>(
          'outboxEvents',
        )
        .findOneAndUpdate(
          {
            status: {
              $in: [
                'PENDING',
                'FAILED',
              ],
            },

            availableAt: {
              $lte:
                now,
            },

            $or: [
              {
                leaseExpiresAt: {
                  $exists:
                    false,
                },
              },

              {
                leaseExpiresAt: {
                  $lte:
                    now,
                },
              },
            ],
          },

          {
            $set: {
              status:
                'PROCESSING',

              leaseOwner:
                input.workerId,

              leaseToken,

              leaseExpiresAt,
            },

            $inc: {
              attemptCount:
                1,

              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },

          {
            sort: {
              availableAt:
                1,

              createdAt:
                1,
            },

            returnDocument:
              'after',
          },
        );

    if (
      event === null
    ) {
      return null;
    }

    return {
      facilityId:
        event.facilityId
          .toHexString(),

      eventId:
        event.eventId,

      transactionId:
        event.transactionId,

      eventType:
        event.eventType,

      aggregateType:
        event.aggregateType,

      aggregateId:
        event.aggregateId,

      payload:
        event.payload,

      leaseOwner:
        input.workerId,

      leaseToken,

      attemptCount:
        event.attemptCount,
    };
  }

  async markPublished(
    event:
      LeasedOutboxEvent,
  ): Promise<void> {
    await this.database
      .collection<OutboxDocument>(
        'outboxEvents',
      )
      .updateOne(
        {
          eventId:
            event.eventId,

          status:
            'PROCESSING',

          leaseOwner:
            event.leaseOwner,

          leaseToken:
            event.leaseToken,
        },

        {
          $set: {
            status:
              'PUBLISHED',

            publishedAt:
              new Date(),
          },

          $unset: {
            leaseOwner:
              '',

            leaseToken:
              '',

            leaseExpiresAt:
              '',

            lastError:
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
      );
  }

  async markFailed(
    event:
      LeasedOutboxEvent,

    error:
      unknown,

    maxAttempts =
      10,
  ): Promise<void> {
    const deadLetter =
      event.attemptCount >=
      maxAttempts;

    const retryDelay =
      Math.min(
        60 * 60 * 1000,
        1000 *
          2 **
            Math.min(
              event.attemptCount,
              10,
            ),
      );

    await this.database
      .collection<OutboxDocument>(
        'outboxEvents',
      )
      .updateOne(
        {
          eventId:
            event.eventId,

          status:
            'PROCESSING',

          leaseOwner:
            event.leaseOwner,

          leaseToken:
            event.leaseToken,
        },

        {
          $set: {
            status:
              deadLetter
                ? 'DEAD_LETTER'
                : 'FAILED',

            availableAt:
              new Date(
                Date.now() +
                  retryDelay,
              ),

            lastError:
              safeError(error),
          },

          $unset: {
            leaseOwner:
              '',

            leaseToken:
              '',

            leaseExpiresAt:
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
      );
  }
}

export class OutboxDispatcher {
  constructor(
    private readonly outbox:
      OutboxService,

    private readonly publish:
      (
        event:
          LeasedOutboxEvent,
      ) => Promise<void>,
  ) {}

  async runOnce(
    workerId: string,
  ): Promise<boolean> {
    const event =
      await this.outbox
        .leaseNext({
          workerId,
        });

    if (
      event === null
    ) {
      return false;
    }

    try {
      await this.publish(
        event,
      );

      await this.outbox
        .markPublished(
          event,
        );
    } catch (error) {
      await this.outbox
        .markFailed(
          event,
          error,
        );
    }

    return true;
  }
}