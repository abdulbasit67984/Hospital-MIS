import type {
  Db,
} from '@hospital-mis/database';

import type {
  InventoryApplication,
} from '../modules/inventory/inventory.application.js';

import {
  createPharmacyDispensingApplication,
} from '../modules/pharmacy-dispensing/pharmacy-dispensing.application.js';

import {
  PharmacyDispensationRepository,
} from '../modules/pharmacy-dispensing/repositories/pharmacy-dispensation.repository.js';

import {
  PharmacyDispensingContextRepository,
} from '../modules/pharmacy-dispensing/repositories/pharmacy-dispensing-context.repository.js';

import {
  PharmacyPrescriptionRepository,
} from '../modules/pharmacy-dispensing/repositories/pharmacy-prescription.repository.js';

import {
  PharmacyWorklistRepository,
} from '../modules/pharmacy-dispensing/repositories/pharmacy-worklist.repository.js';

import {
  PharmacyDispensingAccessPolicyService,
} from '../modules/pharmacy-dispensing/services/pharmacy-dispensing-access-policy.service.js';

import {
  PharmacyDispensingContextService,
} from '../modules/pharmacy-dispensing/services/pharmacy-dispensing-context.service.js';

import {
  PharmacyDispensingBackgroundJobs,
} from './pharmacy-dispensing-background-jobs.js';

import {
  createPharmacyRuntimeAdapters,
} from './pharmacy-dispensing-runtime.adapters.js';

import {
  MongoPharmacyDispensingTransactionManagerAdapter,
} from './pharmacy-dispensing-transaction-manager.adapter.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

export interface CreatePharmacyDispensingInfrastructureOptions {
  database: Db;
  inventoryApplication: InventoryApplication;
  operationalInfrastructure: ReturnType<typeof createOperationalInfrastructure>;
  publishRealtime(message: {
    eventType: string;
    facilityId: string;
    pharmacyLocationId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export function createPharmacyDispensingInfrastructure(
  options: CreatePharmacyDispensingInfrastructureOptions,
) {
  const contextRepository = new PharmacyDispensingContextRepository();
  const repository = new PharmacyDispensationRepository();
  const prescriptions = new PharmacyPrescriptionRepository();
  const worklists = new PharmacyWorklistRepository();
  const context = new PharmacyDispensingContextService(contextRepository);
  const accessPolicy = new PharmacyDispensingAccessPolicyService(contextRepository);

  const runtime = createPharmacyRuntimeAdapters({
    database: options.database,
    inventory: options.inventoryApplication,
    sequences: options.operationalInfrastructure.sequences,
    jobs: options.operationalInfrastructure.jobs,
    publishRealtime: options.publishRealtime,
  });

  const transactionManager =
    new MongoPharmacyDispensingTransactionManagerAdapter(
      options.database,
      options.operationalInfrastructure.transactionRepository,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.locks,
      options.operationalInfrastructure.outbox,
    );

  const dependencies = {
    context,
    accessPolicy,
    prescriptions,
    repository,
    worklists,
    inventoryQueries: runtime.inventoryQueries,
    inventory: runtime.inventory,
    pricing: runtime.pricing,
    safety: runtime.safety,
    billing: runtime.billing,
    transactions: transactionManager,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    sequence: runtime.sequence,
    clock: runtime.clock,
  };

  const application = createPharmacyDispensingApplication({
    dependencies,
  });

  const backgroundJobs = new PharmacyDispensingBackgroundJobs({
    database: options.database,
    jobs: options.operationalInfrastructure.jobs,
    runner: options.operationalInfrastructure.jobRunner,
    application,
    actorResolver: runtime.actorResolver,
    publishRealtime: options.publishRealtime,
  });

  return {
    application,
    dependencies,
    runtime,
    transactionManager,
    recovery: transactionManager,
    backgroundJobs,
    repositories: {
      context: contextRepository,
      prescriptions,
      dispensations: repository,
      worklists,
    },
  };
}

export type PharmacyDispensingInfrastructure = ReturnType<
  typeof createPharmacyDispensingInfrastructure
>;