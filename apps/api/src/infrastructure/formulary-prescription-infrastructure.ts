import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createFormularyPrescriptionApplication,
} from '../modules/formulary-prescriptions/formulary-prescriptions.application.js';

import type {
  MedicineInteractionPort,
  FormularyPrescriptionRealtimeMessage,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import type {
  FormularyPrescriptionMutationDependencies,
} from '../modules/formulary-prescriptions/services/formulary-prescription-command.service.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  FormularyPrescriptionCompensationExecutor,
} from './formulary-prescription-compensation.executor.js';

import {
  FormularyPrescriptionPatientResolutionAdapter,
} from './formulary-prescription-patient-resolution.adapter.js';

import {
  FormularyPrescriptionRecoveryService,
} from './formulary-prescription-recovery.service.js';

import {
  createFormularyPrescriptionRuntimeAdapters,
} from './formulary-prescription-runtime.adapters.js';

import {
  type CompatibleFormularyPrescriptionSnapshotCrypto,
  FormularyPrescriptionSnapshotCryptoAdapter,
} from './formulary-prescription-snapshot-crypto.adapter.js';

import {
  MongoFormularyPrescriptionTransactionManagerAdapter,
} from './formulary-prescription-transaction-manager.adapter.js';

import {
  MongoFormularyStockVisibilityAdapter,
} from './formulary-stock-visibility.adapter.js';

import {
  PrescriptionPdfPrintAdapter,
} from './prescription-pdf-print.adapter.js';

export interface CreateFormularyPrescriptionInfrastructureOptions {
  database:
    Db;

  auditRepository:
    AuditRepository;

  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;

  snapshotCrypto:
    CompatibleFormularyPrescriptionSnapshotCrypto;

  interactions?:
    MedicineInteractionPort | null;

  publishRealtime(
    message:
      FormularyPrescriptionRealtimeMessage,
  ): Promise<void>;
}

export function createFormularyPrescriptionInfrastructure(
  options:
    CreateFormularyPrescriptionInfrastructureOptions,
) {
  const snapshotCrypto =
    new FormularyPrescriptionSnapshotCryptoAdapter(
      options.snapshotCrypto,
    );

  const compensationExecutor =
    new FormularyPrescriptionCompensationExecutor(
      options.database,
      snapshotCrypto,
    );

  const transactionManager =
    new MongoFormularyPrescriptionTransactionManagerAdapter({
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

      snapshotCrypto,
    });

  const runtime =
    createFormularyPrescriptionRuntimeAdapters({
      database:
        options.database,

      auditRepository:
        options.auditRepository,

      sequence:
        options.operationalInfrastructure
          .sequences,

      publishRealtime:
        options.publishRealtime,
    });

  const canonicalPatient =
    new FormularyPrescriptionPatientResolutionAdapter();

  const stock =
    new MongoFormularyStockVisibilityAdapter(
      options.database,
    );

  const print =
    new PrescriptionPdfPrintAdapter(
      options.database,
    );

  const dependencies:
    FormularyPrescriptionMutationDependencies = {
    transactionManager,

    audit:
      runtime.audit,

    outbox:
      runtime.outbox,

    realtime:
      runtime.realtime,

    clock:
      runtime.clock,

    sequence:
      runtime.sequence,

    canonicalPatient,

    snapshotCrypto,
  };

  const application =
    createFormularyPrescriptionApplication({
      dependencies,

      print,

      stock,

      interactions:
        options.interactions ??
        null,
    });

  const recovery =
    new FormularyPrescriptionRecoveryService({
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

  return {
    application,
    dependencies,
    transactionManager,
    compensationExecutor,
    recovery,
    runtime,
    snapshotCrypto,
    canonicalPatient,
    stock,
    print,
  };
}

export type FormularyPrescriptionInfrastructure =
  ReturnType<
    typeof createFormularyPrescriptionInfrastructure
  >;