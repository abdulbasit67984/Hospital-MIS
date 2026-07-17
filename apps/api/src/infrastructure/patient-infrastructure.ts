import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createPatientApplication,
} from '../modules/patient/patient.application.js';

import type {
  PatientSensitiveSnapshotCryptoPort,
} from '../modules/patient/patient.ports.js';

import {
  MedicalRecordNumberService,
} from '../modules/patient/services/medical-record-number.service.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  PatientCompensationExecutor,
} from './patient-compensation.executor.js';

import {
  PatientMergeCompensationExecutor,
} from './patient-merge-compensation.executor.js';

import {
  PatientRecoveryService,
} from './patient-recovery.service.js';

import {
  createPatientRuntimeAdapters,
} from './patient-runtime.adapters.js';

import {
  MongoPatientTransactionManagerAdapter,
} from './patient-transaction-manager.adapter.js';

export interface CreatePatientInfrastructureOptions {
  database: Db;

  auditRepository:
    AuditRepository;

  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;

  snapshotCrypto:
    PatientSensitiveSnapshotCryptoPort;
}

export function createPatientInfrastructure(
  options:
    CreatePatientInfrastructureOptions,
) {
  const domainCompensationExecutor =
    new PatientCompensationExecutor(
      options.snapshotCrypto,
    );

  const compensationExecutor =
    new PatientMergeCompensationExecutor(
      domainCompensationExecutor,
    );

  const transactionManager =
    new MongoPatientTransactionManagerAdapter({
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
    new PatientRecoveryService({
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
    createPatientRuntimeAdapters({
      database:
        options.database,

      auditRepository:
        options.auditRepository,
    });

  const medicalRecordNumbers =
    MedicalRecordNumberService
      .fromSequenceService(
        options.operationalInfrastructure
          .sequences,
      );

  const application =
    createPatientApplication({
      transactionManager,

      audit:
        runtimeAdapters.audit,

      outbox:
        runtimeAdapters.outbox,

      medicalRecordNumbers,

      snapshotCrypto:
        options.snapshotCrypto,
    });

  return {
    ...application,

    transactionManager,

    domainCompensationExecutor,

    compensationExecutor,

    recovery,

    runtimeAdapters,
  };
}