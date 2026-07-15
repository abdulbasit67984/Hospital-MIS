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

type JobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'CANCELLED';

type JobDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  jobId: string;
  jobType: string;
  payload: unknown;

  status:
    JobStatus;

  priority: number;
  runAt: Date;

  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: Date;

  attemptCount: number;
  maxAttempts: number;

  completedAt?: Date;
  lastError?: unknown;

  version: number;
};

export type LeasedBackgroundJob =
  Readonly<{
    facilityId: string;
    jobId: string;
    jobType: string;
    payload: unknown;
    priority: number;
    attemptCount: number;
    maxAttempts: number;
    leaseOwner: string;
    leaseToken: string;
  }>;

function errorSummary(
  error: unknown,
) {
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
        : 'Unknown job failure',
  };
}

export class BackgroundJobService {
  constructor(
    private readonly database: Db,
  ) {}

  async enqueue(
    input: Readonly<{
      facilityId: string;
      jobType: string;
      payload: unknown;
      priority?: number;
      runAt?: Date;
      maxAttempts?: number;
    }>,
  ): Promise<string> {
    const now =
      new Date();

    const jobId =
      randomUUID();

    await this.database
      .collection<JobDocument>(
        'backgroundJobs',
      )
      .insertOne({
        _id:
          createObjectId(),

        facilityId:
          toObjectId(
            input.facilityId,
          ),

        jobId,

        jobType:
          input.jobType,

        payload:
          input.payload,

        status:
          'PENDING',

        priority:
          input.priority ??
          0,

        runAt:
          input.runAt ??
          now,

        attemptCount:
          0,

        maxAttempts:
          input.maxAttempts ??
          5,

        schemaVersion:
          1,

        version:
          0,

        createdAt:
          now,

        updatedAt:
          now,
      });

    return jobId;
  }

  async leaseNext(
    input: Readonly<{
      workerId: string;
      leaseMilliseconds?: number;
      now?: Date;
    }>,
  ): Promise<
    LeasedBackgroundJob | null
  > {
    const now =
      input.now ??
      new Date();

    const leaseToken =
      randomUUID();

    const job =
      await this.database
        .collection<JobDocument>(
          'backgroundJobs',
        )
        .findOneAndUpdate(
          {
            status: {
              $in: [
                'PENDING',
                'FAILED',
              ],
            },

            runAt: {
              $lte:
                now,
            },

            $expr: {
              $lt: [
                '$attemptCount',
                '$maxAttempts',
              ],
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

              leaseExpiresAt:
                new Date(
                  now.getTime() +
                    (
                      input.leaseMilliseconds ??
                      60_000
                    ),
                ),
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
              priority:
                -1,

              runAt:
                1,

              createdAt:
                1,
            },

            returnDocument:
              'after',
          },
        );

    if (
      job === null
    ) {
      return null;
    }

    return {
      facilityId:
        job.facilityId
          .toHexString(),

      jobId:
        job.jobId,

      jobType:
        job.jobType,

      payload:
        job.payload,

      priority:
        job.priority,

      attemptCount:
        job.attemptCount,

      maxAttempts:
        job.maxAttempts,

      leaseOwner:
        input.workerId,

      leaseToken,
    };
  }

  async complete(
    job:
      LeasedBackgroundJob,
  ): Promise<void> {
    await this.database
      .collection<JobDocument>(
        'backgroundJobs',
      )
      .updateOne(
        {
          jobId:
            job.jobId,

          status:
            'PROCESSING',

          leaseOwner:
            job.leaseOwner,

          leaseToken:
            job.leaseToken,
        },

        {
          $set: {
            status:
              'COMPLETED',

            completedAt:
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

  async fail(
    job:
      LeasedBackgroundJob,

    error:
      unknown,
  ): Promise<void> {
    const deadLetter =
      job.attemptCount >=
      job.maxAttempts;

    const retryDelay =
      Math.min(
        60 * 60 * 1000,

        1000 *
          2 **
            Math.min(
              job.attemptCount,
              10,
            ),
      );

    await this.database
      .collection<JobDocument>(
        'backgroundJobs',
      )
      .updateOne(
        {
          jobId:
            job.jobId,

          status:
            'PROCESSING',

          leaseOwner:
            job.leaseOwner,

          leaseToken:
            job.leaseToken,
        },

        {
          $set: {
            status:
              deadLetter
                ? 'DEAD_LETTER'
                : 'FAILED',

            runAt:
              new Date(
                Date.now() +
                  retryDelay,
              ),

            lastError:
              errorSummary(
                error,
              ),
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

export type BackgroundJobHandler =
  (
    job:
      LeasedBackgroundJob,
  ) => Promise<void>;

export class BackgroundJobRunner {
  private readonly handlers =
    new Map<
      string,
      BackgroundJobHandler
    >();

  constructor(
    private readonly jobs:
      BackgroundJobService,
  ) {}

  register(
    jobType: string,
    handler:
      BackgroundJobHandler,
  ): void {
    if (
      this.handlers.has(
        jobType,
      )
    ) {
      throw new Error(
        `Background-job handler already registered for ${jobType}`,
      );
    }

    this.handlers.set(
      jobType,
      handler,
    );
  }

  async runOnce(
    workerId: string,
  ): Promise<boolean> {
    const job =
      await this.jobs
        .leaseNext({
          workerId,
        });

    if (
      job === null
    ) {
      return false;
    }

    const handler =
      this.handlers.get(
        job.jobType,
      );

    if (
      handler === undefined
    ) {
      await this.jobs.fail(
        job,
        new Error(
          `No handler registered for ${job.jobType}`,
        ),
      );

      return true;
    }

    try {
      await handler(job);
      await this.jobs.complete(
        job,
      );
    } catch (error) {
      await this.jobs.fail(
        job,
        error,
      );
    }

    return true;
  }
}