import {
  randomUUID,
} from 'node:crypto';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  InventoryApplication,
} from '../modules/inventory/inventory.application.js';

import type {
  InventoryProcurementRealtimeMessage,
} from '../modules/inventory/inventory-procurement.ports.js';

import type {
  BackgroundJobRunner,
  BackgroundJobService,
  LeasedBackgroundJob,
} from './background-job.service.js';

import {
  MongoAuthorizationRepository,
} from '../modules/authorization/authorization.repository.js';

import {
  isPermissionKey,
} from '@hospital-mis/permissions';

import type {
  InventoryActorResolverPort,
} from './inventory-runtime.adapters.js';

export const INVENTORY_BACKGROUND_JOB_TYPES = {
  RESTRICTION_SWEEP:
    'inventory.restriction-sweep',
  RESERVATION_EXPIRY:
    'inventory.reservation-expiry',
  REALTIME_RETRY:
    'inventory.realtime.retry',
  TRANSACTION_RECOVERY:
    'inventory.transaction-finalization-recovery',
} as const;

interface FacilityJobRecord {
  _id: ReturnType<typeof toObjectId>;
  status: 'ACTIVE' | 'INACTIVE';
}

interface UserJobRecord {
  _id: ReturnType<typeof toObjectId>;
  facilityId: ReturnType<typeof toObjectId>;
  staffId?: ReturnType<typeof toObjectId> | null;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
}

interface RoleJobRecord {
  _id: ReturnType<typeof toObjectId>;
  code?: string;
  key?: string;
  roleCode?: string;
  name?: string;
  isActive: boolean;
}

interface UserRoleJobRecord {
  userId: ReturnType<typeof toObjectId>;
  roleId: ReturnType<typeof toObjectId>;
  facilityId?: ReturnType<typeof toObjectId> | null;
  isActive: boolean;
  expiresAt?: Date | null;
}

function jobPayload(
  job: LeasedBackgroundJob,
): Record<string, unknown> {
  if (
    job.payload === null ||
    typeof job.payload !== 'object' ||
    Array.isArray(job.payload)
  ) {
    return {};
  }

  return job.payload as Record<string, unknown>;
}

function timeBucket(
  date: Date,
  minutes: number,
): string {
  return String(
    Math.floor(
      date.getTime() /
        (minutes * 60_000),
    ),
  );
}

export interface InventoryBackgroundJobsOptions {
  database: Db;
  jobs: BackgroundJobService;
  runner: BackgroundJobRunner;
  application: InventoryApplication;
  actorResolver: InventoryActorResolverPort;
  transactionRecovery: Readonly<{
    recoverFinalizations(
      facilityId: string,
      limit?: number,
    ): Promise<number>;
  }>;
  publishRealtime(
    message: InventoryProcurementRealtimeMessage,
  ): Promise<void>;
  workerId?: string;
  enqueueIntervalMilliseconds?: number;
  runIntervalMilliseconds?: number;
}

export class InventoryBackgroundJobs {
  private readonly authorization:
    MongoAuthorizationRepository;

  private enqueueInterval?:
    ReturnType<typeof setInterval>;

  private runInterval?:
    ReturnType<typeof setInterval>;

  private running = false;
  private scheduling = false;

  public constructor(
    private readonly options: InventoryBackgroundJobsOptions,
  ) {
    this.authorization =
      new MongoAuthorizationRepository(
        options.database,
      );

    options.runner.register(
      INVENTORY_BACKGROUND_JOB_TYPES.RESTRICTION_SWEEP,
      (job) => this.handleRestrictionSweep(job),
    );
    options.runner.register(
      INVENTORY_BACKGROUND_JOB_TYPES.RESERVATION_EXPIRY,
      (job) => this.handleReservationExpiry(job),
    );
    options.runner.register(
      INVENTORY_BACKGROUND_JOB_TYPES.REALTIME_RETRY,
      (job) => this.handleRealtimeRetry(job),
    );
    options.runner.register(
      INVENTORY_BACKGROUND_JOB_TYPES.TRANSACTION_RECOVERY,
      (job) => this.handleTransactionRecovery(job),
    );
  }

  public start(): void {
    if (
      this.enqueueInterval !== undefined ||
      this.runInterval !== undefined
    ) {
      return;
    }

    void this.scheduleDueJobs();
    void this.runWorkerCycle();

    this.enqueueInterval = setInterval(
      () => {
        void this.scheduleDueJobs();
      },
      this.options.enqueueIntervalMilliseconds ??
        15 * 60_000,
    );

    this.runInterval = setInterval(
      () => {
        void this.runWorkerCycle();
      },
      this.options.runIntervalMilliseconds ?? 1_000,
    );

    this.enqueueInterval.unref();
    this.runInterval.unref();
  }

  public stop(): void {
    if (this.enqueueInterval !== undefined) {
      clearInterval(this.enqueueInterval);
      this.enqueueInterval = undefined;
    }

    if (this.runInterval !== undefined) {
      clearInterval(this.runInterval);
      this.runInterval = undefined;
    }
  }

  public async scheduleDueJobs(
    now = new Date(),
  ): Promise<number> {
    if (this.scheduling) {
      return 0;
    }

    this.scheduling = true;

    try {
      const facilities = await this.options.database
        .collection<FacilityJobRecord>('facilities')
        .find({
          status: 'ACTIVE',
        })
        .project({
          _id: 1,
          status: 1,
        })
        .toArray();

      let scheduled = 0;

      for (const facility of facilities) {
        const facilityId = facility._id.toHexString();

        scheduled += await this.enqueueUnique(
          facilityId,
          INVENTORY_BACKGROUND_JOB_TYPES.RESERVATION_EXPIRY,
          {
            facilityId,
            limit: 250,
            bucket: timeBucket(now, 15),
          },
          30,
          now,
        );

        scheduled += await this.enqueueUnique(
          facilityId,
          INVENTORY_BACKGROUND_JOB_TYPES.TRANSACTION_RECOVERY,
          {
            facilityId,
            limit: 100,
            bucket: timeBucket(now, 15),
          },
          100,
          now,
        );

        if (
          now.getUTCHours() === 0 ||
          now.getUTCHours() === 12
        ) {
          scheduled += await this.enqueueUnique(
            facilityId,
            INVENTORY_BACKGROUND_JOB_TYPES.RESTRICTION_SWEEP,
            {
              facilityId,
              batchLimit: 500,
              bucket: timeBucket(now, 12 * 60),
            },
            50,
            now,
          );
        }
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
      const workerId =
        this.options.workerId ??
        `api-inventory-jobs:${process.pid}`;

      let processed = false;

      for (let count = 0; count < 50; count += 1) {
        const found = await this.options.runner.runOnce(
          workerId,
        );

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

  private async enqueueUnique(
    facilityId: string,
    jobType: string,
    payload: Record<string, unknown>,
    priority: number,
    now: Date,
  ): Promise<number> {
    const existing = await this.options.database
      .collection('backgroundJobs')
      .findOne({
        facilityId: toObjectId(
          facilityId,
          'facilityId',
        ),
        jobType,
        'payload.bucket': payload['bucket'],
        status: {
          $in: [
            'PENDING',
            'PROCESSING',
            'COMPLETED',
          ],
        },
      });

    if (existing !== null) {
      return 0;
    }

    await this.options.jobs.enqueue({
      facilityId,
      jobType,
      payload,
      priority,
      runAt: now,
      maxAttempts: 8,
    });

    return 1;
  }

  private async handleRestrictionSweep(
    job: LeasedBackgroundJob,
  ): Promise<void> {
    const payload = jobPayload(job);
    const actor = await this.systemActor(job.facilityId);
    const batchLimit = Math.max(
      1,
      Math.min(
        Number(payload['batchLimit'] ?? 500),
        2_000,
      ),
    );

    await this.options.application.services.controls
      .runInventoryRestrictionSweep(
        {
          actor,
          idempotencyKey:
            `inventory-restriction-sweep:${job.facilityId}:${String(
              payload['bucket'] ?? job.jobId,
            )}`,
        },
        batchLimit,
      );
  }

  private async handleReservationExpiry(
    job: LeasedBackgroundJob,
  ): Promise<void> {
    const payload = jobPayload(job);
    const actor = await this.systemActor(job.facilityId);
    const limit = Math.max(
      1,
      Math.min(
        Number(payload['limit'] ?? 250),
        1_000,
      ),
    );

    await this.options.application.services.stock
      .expireReservations(
        {
          actor,
          idempotencyKey:
            `inventory-reservation-expiry:${job.facilityId}:${String(
              payload['bucket'] ?? job.jobId,
            )}`,
        },
        limit,
      );
  }

  private async handleTransactionRecovery(
    job: LeasedBackgroundJob,
  ): Promise<void> {
    const payload = jobPayload(job);
    const limit = Math.max(
      1,
      Math.min(
        Number(payload['limit'] ?? 100),
        500,
      ),
    );

    await this.options.transactionRecovery
      .recoverFinalizations(
        job.facilityId,
        limit,
      );
  }

  private async handleRealtimeRetry(
    job: LeasedBackgroundJob,
  ): Promise<void> {
    const payload = jobPayload(job);

    if (
      typeof payload['eventType'] !== 'string' ||
      typeof payload['facilityId'] !== 'string' ||
      payload['payload'] === null ||
      typeof payload['payload'] !== 'object'
    ) {
      throw new TypeError(
        'Inventory realtime retry job payload is invalid',
      );
    }

    await this.options.publishRealtime(
      payload as unknown as InventoryProcurementRealtimeMessage,
    );
  }

  private async systemActor(
    facilityId: string,
  ) {
    const facilityObjectId = toObjectId(
      facilityId,
      'facilityId',
    );
    const now = new Date();

    const roles = await this.options.database
      .collection<RoleJobRecord>('roles')
      .find({
        isActive: true,
        $or: [
          { facilityId: null },
          { facilityId: facilityObjectId },
        ],
      })
      .project({
        _id: 1,
        code: 1,
        key: 1,
        roleCode: 1,
        name: 1,
        isActive: 1,
      })
      .toArray();

    const privilegedRoleIds = roles
      .filter((role) => {
        const key = (
          role.code ??
          role.key ??
          role.roleCode ??
          role.name ??
          ''
        )
          .normalize('NFKC')
          .trim()
          .toUpperCase()
          .replaceAll(/[^A-Z0-9]+/gu, '_');

        return [
          'SYSTEM_ADMINISTRATOR',
          'HOSPITAL_ADMINISTRATOR',
          'STORE_MANAGER',
          'PHARMACIST',
        ].includes(key);
      })
      .map((role) => role._id);

    const assignments = await this.options.database
      .collection<UserRoleJobRecord>('userRoles')
      .find({
        facilityId: {
          $in: [
            null,
            facilityObjectId,
          ],
        },
        roleId: {
          $in: privilegedRoleIds,
        },
        isActive: true,
        $or: [
          { expiresAt: null },
          {
            expiresAt: {
              $gt: now,
            },
          },
        ],
      })
      .limit(100)
      .toArray();

    for (const assignment of assignments) {
      const user = await this.options.database
        .collection<UserJobRecord>('users')
        .findOne({
          _id: assignment.userId,
          facilityId: facilityObjectId,
          status: 'ACTIVE',
          staffId: {
            $type: 'objectId',
          },
        });

      if (user === null) {
        continue;
      }

      const permissions = await this.authorization
        .resolvePermissionKeys(
          facilityId,
          user._id.toHexString(),
        );

      if (
        !permissions.includes('inventory.read') ||
        !permissions.includes('inventory.batches.manage')
      ) {
        continue;
      }

      return this.options.actorResolver.resolve({
        userId: user._id.toHexString(),
        facilityId,
        correlationId: randomUUID(),
        permissions: new Set(
          permissions.filter(isPermissionKey),
        ),
        userAgent: 'hospital-mis-inventory-background-jobs',
      });
    }

    throw new Error(
      `No active inventory background-job actor is configured for facility ${facilityId}`,
    );
  }
}