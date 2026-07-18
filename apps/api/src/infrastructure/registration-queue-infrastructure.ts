import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createRegistrationQueueApplication,
} from '../modules/registration-queue/registration-queue.application.js';

import type {
  RegistrationQueueRealtimeMessage,
  RegistrationQueueSnapshotCryptoPort,
} from '../modules/registration-queue/registration-queue.ports.js';

import {
  RegistrationQueueNumberService,
} from '../modules/registration-queue/services/registration-queue-number.service.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  RegistrationQueueCompensationExecutor,
} from './registration-queue-compensation.executor.js';

import {
  RegistrationQueueRecoveryService,
} from './registration-queue-recovery.service.js';

import {
  createRegistrationQueueRuntimeAdapters,
} from './registration-queue-runtime.adapters.js';

import {
  MongoRegistrationQueueTransactionManagerAdapter,
} from './registration-queue-transaction-manager.adapter.js';

export interface CreateRegistrationQueueInfrastructureOptions {
  database:
    Db;

  auditRepository:
    AuditRepository;

  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;

  snapshotCrypto:
    RegistrationQueueSnapshotCryptoPort;

  publishRealtime(
    message:
      RegistrationQueueRealtimeMessage,
  ): Promise<void>;
}

export function createRegistrationQueueInfrastructure(
  options:
    CreateRegistrationQueueInfrastructureOptions,
) {
  const compensationExecutor =
    new RegistrationQueueCompensationExecutor(
      options.database,
      options.snapshotCrypto,
    );

  const transactionManager =
    new MongoRegistrationQueueTransactionManagerAdapter({
      database:
        options.database,

      transactions:
        options.operationalInfrastructure
          .transactionRepository,

      idempotency:
        options.operationalInfrastructure
          .idempotency,

      locks:
        options.operationalInfrastructure
          .locks,

      outbox:
        options.operationalInfrastructure
          .outbox,

      compensationExecutor,
    });

  const recovery =
    new RegistrationQueueRecoveryService({
      database:
        options.database,

      idempotency:
        options.operationalInfrastructure
          .idempotency,

      outbox:
        options.operationalInfrastructure
          .outbox,

      compensationExecutor,
    });

  const runtimeAdapters =
    createRegistrationQueueRuntimeAdapters({
      database:
        options.database,

      auditRepository:
        options.auditRepository,

      publishRealtime:
        options.publishRealtime,
    });

  const numbers =
    RegistrationQueueNumberService
      .fromSequenceService(
        options.operationalInfrastructure
          .sequences,
      );

  const application =
    createRegistrationQueueApplication({
      transactionManager,

      audit:
        runtimeAdapters.audit,

      outbox:
        runtimeAdapters.outbox,

      realtime:
        runtimeAdapters.realtime,

      clock:
        runtimeAdapters.clock,

      snapshotCrypto:
        options.snapshotCrypto,

      numbers,
    });

  return {
    ...application,

    application,
    transactionManager,
    compensationExecutor,
    recovery,
    runtimeAdapters,
    numbers,
  };
}

export * from './registration-queue-compensation.executor.js';
export * from './registration-queue-recovery.service.js';
export * from './registration-queue-runtime.adapters.js';
export * from './registration-queue-transaction-manager.adapter.js';