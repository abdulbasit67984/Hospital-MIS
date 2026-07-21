import {
  randomUUID,
} from 'node:crypto';

import mongoose from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  AppError,
} from '@hospital-mis/shared';

import type {
  PharmacyTransactionCompensation,
  PharmacyTransactionContext,
  PharmacyTransactionManagerPort,
  PharmacyTransactionRequest,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.ports.js';

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
  RecoverableInfrastructure,
  RecoveryCycleResult,
} from './recovery-loop.js';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function serialize(value: unknown, depth = 0): JsonValue {
  if (depth > 24) {
    throw new TypeError('Pharmacy transaction result exceeds serialization depth');
  }

  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Pharmacy transaction result contains a non-finite number');
    }
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate['toHexString'] === 'function') {
      return (candidate['toHexString'] as () => string)();
    }

    if (candidate['_bsontype'] === 'Decimal128' && typeof candidate['toString'] === 'function') {
      return (candidate['toString'] as () => string)();
    }

    if (typeof candidate['toObject'] === 'function') {
      return serialize((candidate['toObject'] as () => unknown)(), depth + 1);
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        serialize(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

function errorSummary(error: unknown): Record<string, string> {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message:
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : 'Unknown pharmacy transaction failure',
  };
}

interface FinalizationMetadata {
  ownerId: string;
  response: JsonValue;
}

export class MongoPharmacyDispensingTransactionManagerAdapter
implements PharmacyTransactionManagerPort, RecoverableInfrastructure {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly locks: OperationLockService,
    private readonly outbox: OutboxService,
  ) {}

  public async execute<T>(request: PharmacyTransactionRequest<T>): Promise<T> {
    const claim = await this.idempotency.begin({
      facilityId: request.facilityId,
      scope: request.transactionType,
      key: request.idempotencyKey,
      requestPayload: request.idempotencyPayload,
    });

    if (claim.kind === 'REPLAY') {
      return claim.response as T;
    }

    const transactionId = randomUUID();
    const session = await mongoose.startSession();
    const checkpoints: Array<{ state: string; data?: Record<string, unknown> }> = [];
    const compensations: PharmacyTransactionCompensation[] = [];
    let acquiredLocks: readonly AcquiredLock[] = [];
    let transactionCreated = false;
    let domainCommitted = false;
    let result: T | undefined;

    const persistProgress = async (): Promise<void> => {
      await this.database.collection('applicationTransactions').updateOne(
        { transactionId },
        {
          $set: {
            'relatedEntities.pharmacyCheckpoints': checkpoints,
            'relatedEntities.pharmacyCompensations': compensations,
          },
          $inc: { version: 1 },
          $currentDate: { updatedAt: true },
        },
      );
    };

    const context: PharmacyTransactionContext = {
      transactionId,
      idempotencyKey: request.idempotencyKey,
      session,
      checkpoint: async (state, data) => {
        checkpoints.push({ state, ...(data === undefined ? {} : { data }) });
        await persistProgress();
      },
      registerCompensation: async (compensation) => {
        compensations.push(compensation);
        await persistProgress();
      },
    };

    try {
      await this.transactions.create({
        facilityId: request.facilityId,
        transactionId,
        transactionType: request.transactionType,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.correlationId,
        initiatedBy: request.actorUserId,
        contextSnapshot: request.journalPayload,
        relatedEntities: {
          lockKeys: request.lockKeys,
          pharmacyCheckpoints: [],
          pharmacyCompensations: [],
        },
        stepNames: ['EXECUTE_PHARMACY_DOMAIN_TRANSACTION'],
      });
      transactionCreated = true;

      acquiredLocks = await this.locks.acquireMany({
        facilityId: request.facilityId,
        ownerId: transactionId,
        resources: request.lockKeys.map((resourceKey) => ({
          resourceType: 'PHARMACY_DISPENSING',
          resourceKey,
        })),
      });

      await this.transactions.setStatus(transactionId, 'IN_PROGRESS');
      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTING');

      await session.withTransaction(async () => {
        result = await request.execute(context);
      });
      domainCommitted = true;

      await this.transactions.setStepStatus(transactionId, 0, 'EXECUTED');
      await this.transactions.setStepStatus(transactionId, 0, 'VERIFIED');
      await this.transactions.setStatus(transactionId, 'COMPLETED');

      if (result === undefined) {
        throw new Error('Pharmacy transaction completed without a result');
      }

      try {
        await this.idempotency.complete({
          facilityId: request.facilityId,
          scope: request.transactionType,
          key: request.idempotencyKey,
          ownerId: claim.ownerId,
          response: serialize(result) as never,
        });
        await this.outbox.releaseTransactionEvents(transactionId);
      } catch (error) {
        await this.markFinalizationRecovery({
          request,
          transactionId,
          ownerId: claim.ownerId,
          response: serialize(result),
          error,
        });

        throw new AppError({
          code: 'PHARMACY_TRANSACTION_FINALIZATION_PENDING',
          message:
            'The pharmacy operation committed and finalization will be recovered safely',
          statusCode: 503,
          retryable: true,
          cause: error,
        });
      }

      return result;
    } catch (error) {
      if (!domainCommitted) {
        if (transactionCreated) {
          await this.transactions
            .setStepStatus(transactionId, 0, 'FAILED', errorSummary(error))
            .catch(() => undefined);
          await this.transactions
            .setStatus(transactionId, 'FAILED', {
              error: errorSummary(error),
              compensations,
            })
            .catch(() => undefined);
        }

        await this.idempotency
          .fail({
            facilityId: request.facilityId,
            scope: request.transactionType,
            key: request.idempotencyKey,
            ownerId: claim.ownerId,
            error: errorSummary(error),
          })
          .catch(() => undefined);
      }

      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
      await this.locks.releaseMany(acquiredLocks).catch(() => undefined);
    }
  }

  public markStaleTransactions(staleBefore: Date): Promise<number> {
    return this.transactions.markStaleForRecovery(staleBefore);
  }

  public async recoverAvailable(input: Readonly<{
    workerId: string;
    maxTransactions: number;
    now: Date;
  }>): Promise<RecoveryCycleResult> {
    void input.workerId;
    void input.now;

    const records = await this.database
      .collection<{
        facilityId: ReturnType<typeof toObjectId>;
        transactionId: string;
        transactionType: string;
        idempotencyKey: string;
        status: string;
        recoveryStatus?: string;
        relatedEntities?: {
          finalization?: FinalizationMetadata;
        };
      }>('applicationTransactions')
      .find({
        status: 'RECOVERY_REQUIRED',
        recoveryStatus: 'PHARMACY_FINALIZATION_PENDING',
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(Math.max(1, Math.min(input.maxTransactions, 500)))
      .toArray();

    let recovered = 0;
    let failed = 0;

    for (const record of records) {
      const finalization = record.relatedEntities?.finalization;

      if (finalization === undefined) {
        failed += 1;
        continue;
      }

      try {
        const idempotencyRecord = await this.database
          .collection<{ status: string }>('idempotencyKeys')
          .findOne({
            facilityId: record.facilityId,
            scope: record.transactionType,
            key: record.idempotencyKey,
          });

        if (idempotencyRecord === null) {
          throw new Error('Pharmacy recovery idempotency record is unavailable');
        }

        if (idempotencyRecord.status === 'IN_PROGRESS') {
          await this.idempotency.complete({
            facilityId: record.facilityId.toHexString(),
            scope: record.transactionType,
            key: record.idempotencyKey,
            ownerId: finalization.ownerId,
            response: finalization.response as never,
          });
        } else if (idempotencyRecord.status !== 'COMPLETED') {
          throw new Error(
            `Pharmacy finalization cannot continue from idempotency status ${idempotencyRecord.status}`,
          );
        }

        await this.outbox.releaseTransactionEvents(record.transactionId);
        await this.transactions.setStatus(record.transactionId, 'COMPLETED', {
          recoveredFinalization: true,
        });
        await this.database.collection('applicationTransactions').updateOne(
          { transactionId: record.transactionId },
          {
            $unset: {
              recoveryStatus: '',
              'relatedEntities.finalization': '',
            },
            $inc: { version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
        recovered += 1;
      } catch (error) {
        failed += 1;
        await this.database.collection('applicationTransactions').updateOne(
          { transactionId: record.transactionId },
          {
            $set: {
              recoveryStatus: 'PHARMACY_FINALIZATION_PENDING',
              errorDetails: errorSummary(error),
            },
            $inc: { retryCount: 1, version: 1 },
            $currentDate: { updatedAt: true },
          },
        );
      }
    }

    return { recovered, failed };
  }

  private async markFinalizationRecovery<T>(input: Readonly<{
    request: PharmacyTransactionRequest<T>;
    transactionId: string;
    ownerId: string;
    response: JsonValue;
    error: unknown;
  }>): Promise<void> {
    await this.database.collection('applicationTransactions').updateOne(
      { transactionId: input.transactionId },
      {
        $set: {
          status: 'RECOVERY_REQUIRED',
          recoveryStatus: 'PHARMACY_FINALIZATION_PENDING',
          errorDetails: errorSummary(input.error),
          'relatedEntities.finalization': {
            ownerId: input.ownerId,
            response: input.response,
          },
        },
        $inc: { retryCount: 1, version: 1 },
        $currentDate: { updatedAt: true },
      },
    );
  }
}