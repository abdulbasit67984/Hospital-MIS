import type {
  AuthConfig,
} from '@hospital-mis/config';

import type {
  Db,
} from '@hospital-mis/database';

import type {
  createOperationalInfrastructure,
} from '../../../infrastructure/operational-infrastructure.js';

import type {
  AuditRepository,
} from '../../audit/audit.repository.js';

import {
  createIdentityApplication,
} from '../identity.application.js';

import {
  IdentityCompensationExecutor,
} from './identity-compensation.executor.js';

import {
  IdentityRecoveryService,
} from './identity-recovery.service.js';

import {
  createIdentityRuntimeAdapters,
} from './identity-runtime.adapters.js';

import {
  MongoIdentityTransactionManagerAdapter,
} from './identity-transaction-manager.adapter.js';

export interface CreateIdentityInfrastructureOptions {
  database:
    Db;

  authConfig:
    AuthConfig;

  auditRepository:
    AuditRepository;

  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;
}

export function createIdentityInfrastructure(
  options:
    CreateIdentityInfrastructureOptions,
) {
  const compensationExecutor =
    new IdentityCompensationExecutor();

  const transactionManager =
    new MongoIdentityTransactionManagerAdapter({
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
    new IdentityRecoveryService({
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
    createIdentityRuntimeAdapters({
      database:
        options.database,

      auditRepository:
        options.auditRepository,

      authConfig:
        options.authConfig,
    });

  const application =
    createIdentityApplication({
      transactionManager,

      audit:
        runtimeAdapters.audit,

      outbox:
        runtimeAdapters.outbox,

      passwordHasher:
        runtimeAdapters.passwordHasher,

      sessions:
        runtimeAdapters.sessions,
    });

  return {
    application,
    transactionManager,
    compensationExecutor,
    recovery,
    ...runtimeAdapters,
  };
}