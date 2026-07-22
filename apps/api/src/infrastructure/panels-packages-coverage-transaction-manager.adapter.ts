import {
  AsyncLocalStorage,
} from 'node:async_hooks';

import {
  randomUUID,
} from 'node:crypto';

import mongoose from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  AppError,
} from '@hospital-mis/shared';

import type {
  PpcTransactionContext,
  PpcTransactionManagerPort,
} from '../modules/panels-packages-coverage/panels-packages-coverage.ports.js';

import type {
  ApplicationTransactionRepository,
} from './application-transaction.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OperationLockService,
} from './operation-lock.service.js';

import type {
  OutboxService,
} from './outbox.service.js';

const transactionStorage =
  new AsyncLocalStorage<PpcTransactionContext>();

export function currentPpcTransactionContext():
PpcTransactionContext {
  const context = transactionStorage.getStore();

  if (context === undefined) {
    throw new Error(
      'Panels, packages, and coverage transaction context is unavailable',
    );
  }

  return context;
}

function jsonSafe(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 24) {
    return null;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => jsonSafe(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue['toHexString'] === 'function') {
      return (objectValue['toHexString'] as () => string)();
    }

    if (
      objectValue['_bsontype'] === 'Decimal128' &&
      typeof objectValue['toString'] === 'function'
    ) {
      return (objectValue['toString'] as () => string)();
    }

    if (typeof objectValue['toObject'] === 'function') {
      return jsonSafe(
        (objectValue['toObject'] as () => unknown)(),
        depth + 1,
      );
    }

    return Object.fromEntries(
      Object.entries(objectValue).map(([key, nested]) => [
        key,
        jsonSafe(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

function safeError(
  error: unknown,
): Readonly<{
  name: string;
  message: string;
}> {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message:
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : 'Unknown panels, packages, and coverage failure',
  };
}

export class MongoPanelsPackagesCoverageTransactionManagerAdapter
implements PpcTransactionManagerPort {
  public constructor(
    private readonly database: Db,
    private readonly transactions: ApplicationTransactionRepository,
    private readonly idempotency: IdempotencyService,
    private readonly locks: OperationLockService,
    private readonly outbox: OutboxService,
  ) {}

  public async execute<T>(
    input: Parameters<PpcTransactionManagerPort['execute']>[0],
  ): Promise<T> {
    const claim = await this.idempotency.begin({
      facilityId: input.facilityId,
      scope: input.transactionType,
      key: input.idempotencyKey,
      requestPayload: input.idempotencyPayload,
    });

    if (claim.kind === 'REPLAY') {
      return claim.response as T;
    }

    const transactionId = randomUUID();

    await this.transactions.create({
      facilityId: input.facilityId,
      transactionId,
      transactionType: input.transactionType,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      initiatedBy: input.actorUserId,
      contextSnapshot: jsonSafe(input.journalPayload),
      relatedEntities: {
        module: 'PANELS_PACKAGES_COVERAGE',
      },
      stepNames: ['MONGODB_DOMAIN_TRANSACTION'],
    });

    const acquiredLocks = await this.locks.acquireMany({
      facilityId: input.facilityId,
      ownerId: transactionId,
      resources: input.lockKeys.map((resourceKey) => ({
        resourceType: 'PANELS_PACKAGES_COVERAGE',
        resourceKey,
      })),
    });

    const session = await mongoose.startSession();
    let committed = false;
    let result: T | undefined;

    try {
      await this.transactions.setStatus(transactionId, 'IN_PROGRESS');
      await this.transactions.setStepStatus(
        transactionId,
        0,
        'EXECUTING',
      );

      await session.withTransaction(async () => {
        const context = {
          transactionId,
          session,
        };

        result = await transactionStorage.run(
          context,
          () => input.execute(context),
        );
      });

      committed = true;

      await this.transactions.setStepStatus(
        transactionId,
        0,
        'EXECUTED',
      );
      await this.transactions.setStepStatus(
        transactionId,
        0,
        'VERIFIED',
      );
      await this.transactions.setStatus(transactionId, 'COMPLETED');
      await this.outbox.releaseTransactionEvents(transactionId);

      if (result === undefined) {
        throw new Error(
          'Panels, packages, and coverage transaction completed without a result',
        );
      }

      await this.idempotency.complete({
        facilityId: input.facilityId,
        scope: input.transactionType,
        key: input.idempotencyKey,
        ownerId: claim.ownerId,
        response: jsonSafe(result) as never,
      });

      return result;
    } catch (error) {
      if (committed) {
        await this.database
          .collection('applicationTransactions')
          .updateOne(
            {
              transactionId,
            },
            {
              $set: {
                status: 'RECOVERY_REQUIRED',
                recoveryStatus:
                  'PPC_POST_COMMIT_FINALIZATION_PENDING',
                errorDetails: safeError(error),
              },
              $inc: {
                version: 1,
              },
              $currentDate: {
                updatedAt: true,
              },
            },
          );

        throw new AppError({
          code: 'PPC_TRANSACTION_RECOVERY_REQUIRED',
          message:
            'The financial operation committed and requires finalization recovery',
          statusCode: 500,
          retryable: false,
          cause: error,
        });
      }

      await this.transactions
        .setStepStatus(
          transactionId,
          0,
          'FAILED',
          safeError(error),
        )
        .catch(() => undefined);

      await this.transactions
        .setStatus(
          transactionId,
          'FAILED',
          safeError(error),
        )
        .catch(() => undefined);

      await this.idempotency
        .fail({
          facilityId: input.facilityId,
          scope: input.transactionType,
          key: input.idempotencyKey,
          ownerId: claim.ownerId,
          error: safeError(error) as never,
        })
        .catch(() => undefined);

      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
      await this.locks.releaseMany(acquiredLocks);
    }
  }
}