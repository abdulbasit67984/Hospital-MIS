import type {
  Db,
} from '@hospital-mis/database';

import {
  ApplicationTransactionManager,
  MongoApplicationTransactionRepository,
} from './application-transaction.js';

import {
  BackgroundJobRunner,
  BackgroundJobService,
} from './background-job.service.js';

import {
  IdempotencyService,
} from './idempotency.service.js';

import {
  OperationLockService,
} from './operation-lock.service.js';

import {
  OutboxDispatcher,
  OutboxService,
  type LeasedOutboxEvent,
} from './outbox.service.js';

import {
  SequenceService,
} from './sequence.service.js';

export function createOperationalInfrastructure(
  input: Readonly<{
    database: Db;

    publishEvent(
      event:
        LeasedOutboxEvent,
    ): Promise<void>;
  }>,
) {
  const sequences =
    new SequenceService(
      input.database,
    );

  const idempotency =
    new IdempotencyService(
      input.database,
    );

  const locks =
    new OperationLockService(
      input.database,
    );

  const outbox =
    new OutboxService(
      input.database,
    );

  const transactionRepository =
    new MongoApplicationTransactionRepository(
      input.database,
    );

  const transactions =
    new ApplicationTransactionManager(
      transactionRepository,
      idempotency,
      locks,
      outbox,
    );

  const jobs =
    new BackgroundJobService(
      input.database,
    );

  const jobRunner =
    new BackgroundJobRunner(
      jobs,
    );

  const outboxDispatcher =
    new OutboxDispatcher(
      outbox,
      input.publishEvent,
    );

  return {
    sequences,
    idempotency,
    locks,
    outbox,
    outboxDispatcher,
    transactionRepository,
    transactions,
    jobs,
    jobRunner,
  };
}

export * from './application-transaction.js';
export * from './background-job.service.js';
export * from './idempotency.service.js';
export * from './operation-lock.service.js';
export * from './outbox.service.js';
export * from './sequence.service.js';