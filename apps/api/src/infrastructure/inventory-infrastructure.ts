import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createInventoryApplication,
} from '../modules/inventory/inventory.application.js';

import type {
  InventoryProcurementRealtimeMessage,
} from '../modules/inventory/inventory-procurement.ports.js';

import {
  InventoryBackgroundJobs,
} from './inventory-background-jobs.js';

import {
  createInventoryRuntimeAdapters,
} from './inventory-runtime.adapters.js';

import {
  MongoInventoryCompensationExecutor,
  MongoInventoryTransactionManagerAdapter,
} from './inventory-transaction-manager.adapter.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

export interface CreateInventoryInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: ReturnType<
    typeof createOperationalInfrastructure
  >;
  publishRealtime(
    message: InventoryProcurementRealtimeMessage,
  ): Promise<void>;
}

export function createInventoryInfrastructure(
  options: CreateInventoryInfrastructureOptions,
) {
  const runtime = createInventoryRuntimeAdapters({
    database: options.database,
    auditRepository: options.auditRepository,
    sequence:
      options.operationalInfrastructure.sequences,
    jobs: options.operationalInfrastructure.jobs,
    publishRealtime: options.publishRealtime,
  });

  const compensationExecutor =
    new MongoInventoryCompensationExecutor(
      options.database,
    );

  const transactionManager =
    new MongoInventoryTransactionManagerAdapter(
      options.database,
      options.operationalInfrastructure
        .transactionRepository,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.locks,
      options.operationalInfrastructure.outbox,
      compensationExecutor,
    );

  const application = createInventoryApplication({
    transactionManager,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    sequence: runtime.sequence,
    approvalLimits: runtime.approvalLimits,
    attachments: runtime.attachments,
    clock: runtime.clock,
  });

  compensationExecutor.setStockPosting(
    application.services.stockPosting,
  );

  const backgroundJobs = new InventoryBackgroundJobs({
    database: options.database,
    jobs: options.operationalInfrastructure.jobs,
    runner: options.operationalInfrastructure.jobRunner,
    application,
    actorResolver: runtime.actorResolver,
    transactionRecovery: transactionManager,
    publishRealtime: options.publishRealtime,
  });

  return {
    application,
    runtime,
    transactionManager,
    compensationExecutor,
    backgroundJobs,
    dispensing:
      application.integrations.dispensing,
    receiptStockPosting:
      application.integrations.receiptStockPosting,
  };
}

export type InventoryInfrastructure = ReturnType<
  typeof createInventoryInfrastructure
>;