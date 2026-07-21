import {
  randomUUID,
} from 'node:crypto';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  isPermissionKey,
} from '@hospital-mis/permissions';

import type {
  PharmacyDispensingApplication,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.application.js';

import type {
  PharmacyActorResolverPort,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.ports.js';

import {
  pharmacyDeduplicationKey,
  pharmacyInventoryCommandContext,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.workflow-helpers.js';

import {
  MongoAuthorizationRepository,
} from '../modules/authorization/authorization.repository.js';

import type {
  BackgroundJobRunner,
  BackgroundJobService,
  LeasedBackgroundJob,
} from './background-job.service.js';

export const PHARMACY_BACKGROUND_JOB_TYPES = {
  EXPIRE_DISPENSATIONS: 'pharmacy.expire-dispensations',
  REALTIME_RETRY: 'pharmacy.realtime.retry',
} as const;

interface FacilityRecord {
  _id: ReturnType<typeof toObjectId>;
  status: 'ACTIVE' | 'INACTIVE';
}

interface UserRecord {
  _id: ReturnType<typeof toObjectId>;
  facilityId: ReturnType<typeof toObjectId>;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
}

function payload(job: LeasedBackgroundJob): Record<string, unknown> {
  if (job.payload === null || typeof job.payload !== 'object' || Array.isArray(job.payload)) {
    return {};
  }

  return job.payload as Record<string, unknown>;
}

function bucket(date: Date, minutes: number): string {
  return String(Math.floor(date.getTime() / (minutes * 60_000)));
}

export interface PharmacyDispensingBackgroundJobsOptions {
  database: Db;
  jobs: BackgroundJobService;
  runner: BackgroundJobRunner;
  application: PharmacyDispensingApplication;
  actorResolver: PharmacyActorResolverPort;
  publishRealtime(message: {
    eventType: string;
    facilityId: string;
    pharmacyLocationId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  workerId?: string;
  scheduleIntervalMilliseconds?: number;
  runIntervalMilliseconds?: number;
}

export class PharmacyDispensingBackgroundJobs {
  private readonly authorization: MongoAuthorizationRepository;
  private scheduleInterval?: ReturnType<typeof setInterval>;
  private runInterval?: ReturnType<typeof setInterval>;
  private scheduling = false;
  private running = false;

  public constructor(
    private readonly options: PharmacyDispensingBackgroundJobsOptions,
  ) {
    this.authorization = new MongoAuthorizationRepository(options.database);
    options.runner.register(
      PHARMACY_BACKGROUND_JOB_TYPES.EXPIRE_DISPENSATIONS,
      (job) => this.handleExpiration(job),
    );
    options.runner.register(
      PHARMACY_BACKGROUND_JOB_TYPES.REALTIME_RETRY,
      (job) => this.handleRealtimeRetry(job),
    );
  }

  public start(): void {
    if (this.scheduleInterval !== undefined || this.runInterval !== undefined) {
      return;
    }

    void this.scheduleDueJobs();
    void this.runWorkerCycle();

    this.scheduleInterval = setInterval(
      () => void this.scheduleDueJobs(),
      this.options.scheduleIntervalMilliseconds ?? 15 * 60_000,
    );
    this.runInterval = setInterval(
      () => void this.runWorkerCycle(),
      this.options.runIntervalMilliseconds ?? 1_000,
    );
    this.scheduleInterval.unref();
    this.runInterval.unref();
  }

  public stop(): void {
    if (this.scheduleInterval !== undefined) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = undefined;
    }

    if (this.runInterval !== undefined) {
      clearInterval(this.runInterval);
      this.runInterval = undefined;
    }
  }

  public async scheduleDueJobs(now = new Date()): Promise<number> {
    if (this.scheduling) {
      return 0;
    }

    this.scheduling = true;

    try {
      const facilities = await this.options.database
        .collection<FacilityRecord>('facilities')
        .find({ status: 'ACTIVE' })
        .project({ _id: 1, status: 1 })
        .toArray();
      let scheduled = 0;

      for (const facility of facilities) {
        const facilityId = facility._id.toHexString();
        const existing = await this.options.database.collection('backgroundJobs').findOne({
          facilityId: facility._id,
          jobType: PHARMACY_BACKGROUND_JOB_TYPES.EXPIRE_DISPENSATIONS,
          'payload.bucket': bucket(now, 15),
          status: { $in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
        });

        if (existing !== null) {
          continue;
        }

        await this.options.jobs.enqueue({
          facilityId,
          jobType: PHARMACY_BACKGROUND_JOB_TYPES.EXPIRE_DISPENSATIONS,
          payload: {
            facilityId,
            limit: 250,
            bucket: bucket(now, 15),
          },
          priority: 40,
          runAt: now,
          maxAttempts: 8,
        });
        scheduled += 1;
      }

      return scheduled;
    } finally {
      this.scheduling = false;
    }
  }

  public async runWorkerCycle(): Promise<boolean> {
    if (this.running) {
      return false;
    }

    this.running = true;

    try {
      let processed = false;
      const workerId = this.options.workerId ?? `api-pharmacy-jobs:${process.pid}`;

      for (let count = 0; count < 50; count += 1) {
        const found = await this.options.runner.runOnce(workerId);

        if (!found) {
          break;
        }

        processed = true;
      }

      return processed;
    } finally {
      this.running = false;
    }
  }

  private async systemActor(facilityId: string) {
    const user = await this.options.database
      .collection<UserRecord>('users')
      .findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: 'ACTIVE',
      });

    if (user === null) {
      throw new Error('Pharmacy background jobs require an active facility user');
    }

    const permissionValues = await this.authorization.resolvePermissionKeys(
      facilityId,
      user._id.toHexString(),
    );
    const permissions = new Set(
      permissionValues.filter(isPermissionKey),
    );

    return this.options.actorResolver.resolve({
      userId: user._id.toHexString(),
      facilityId,
      correlationId: randomUUID(),
      permissions,
    });
  }

  private async handleExpiration(job: LeasedBackgroundJob): Promise<void> {
    const jobData = payload(job);
    const limit = Math.max(1, Math.min(Number(jobData['limit'] ?? 250), 500));
    const actor = await this.systemActor(job.facilityId);
    const support = this.options.application.services.commandSupport;
    const records = await support.dependencies.worklists.listExpirable(
      job.facilityId,
      new Date(),
      limit,
    );

    for (const record of records) {
      await support.dependencies.transactions.execute({
        transactionType: 'PHARMACY_DISPENSATION_EXPIRY',
        idempotencyKey: `expiry:${record._id.toHexString()}:${record.version}`,
        actorUserId: actor.userId,
        facilityId: actor.facilityId,
        correlationId: actor.correlationId,
        lockKeys: [
          `pharmacy-dispensing:dispensation:${actor.facilityId}:${record._id.toHexString()}`,
        ],
        idempotencyPayload: {
          dispensationId: record._id.toHexString(),
          expectedVersion: record.version,
        },
        journalPayload: {
          module: 'PHARMACY_DISPENSING',
          operation: 'EXPIRE_DISPENSATION',
          dispensationId: record._id.toHexString(),
        },
        execute: async (transaction) => {
          const occurredAt = support.dependencies.clock.now();

          if (record.stockReservationId !== null) {
            const reservation = await this.options.application.services.commandSupport
              .dependencies.inventory.releaseDispensingReservation(
                pharmacyInventoryCommandContext(
                  actor,
                  `expiry-release:${record._id.toHexString()}:${record.version}`,
                ),
                record.stockReservationId.toHexString(),
                {
                  expectedVersion: record.version,
                  reason: 'Pharmacy dispensation expired before completion',
                },
                transaction.session,
              );
            void reservation;
          }

          const updated = await support.dependencies.repository.updateDispensation(
            actor.facilityId,
            record._id.toHexString(),
            record.version,
            {
              $set: {
                status: 'EXPIRED',
                expiredAt: occurredAt,
                finalizationState: 'COMPLETED',
                finalizationUpdatedAt: occurredAt,
              },
              $inc: { version: 1 },
            },
            actor.userId,
            transaction.session,
          );

          if (updated === null) {
            throw new Error('The pharmacy dispensation changed during expiry processing');
          }

          await support.dependencies.outbox.enqueue(
            {
              transactionId: transaction.transactionId,
              deduplicationKey: pharmacyDeduplicationKey(
                transaction.transactionId,
                'pharmacy.dispensation.expired.v1',
                updated._id.toHexString(),
              ),
              eventType: 'pharmacy.dispensation.expired.v1',
              aggregateType: 'DISPENSATION',
              aggregateId: updated._id.toHexString(),
              actorUserId: actor.userId,
              facilityId: actor.facilityId,
              correlationId: actor.correlationId,
              occurredAt,
              payload: {
                dispensationId: updated._id.toHexString(),
                pharmacyLocationId: updated.pharmacyLocationId.toHexString(),
                status: updated.status,
              },
            },
            transaction.session,
          );

          return updated;
        },
      });
    }
  }

  private async handleRealtimeRetry(job: LeasedBackgroundJob): Promise<void> {
    const jobData = payload(job);
    const eventType = String(jobData['eventType'] ?? '');
    const facilityId = String(jobData['facilityId'] ?? job.facilityId);
    const pharmacyLocationId = String(jobData['pharmacyLocationId'] ?? '');
    const eventPayload =
      jobData['payload'] !== null && typeof jobData['payload'] === 'object'
        ? (jobData['payload'] as Record<string, unknown>)
        : {};

    if (eventType.length === 0 || pharmacyLocationId.length === 0) {
      throw new Error('Pharmacy realtime retry payload is incomplete');
    }

    await this.options.publishRealtime({
      eventType,
      facilityId,
      pharmacyLocationId,
      payload: eventPayload,
    });
  }
}