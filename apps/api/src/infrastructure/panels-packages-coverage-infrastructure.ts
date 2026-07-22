import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createPanelsPackagesCoverageApplication,
} from '../modules/panels-packages-coverage/panels-packages-coverage.application.js';

import {
  DiagnosticPanelRepository,
} from '../modules/panels-packages-coverage/repositories/diagnostic-panel.repository.js';

import {
  PayerCoverageRepository,
} from '../modules/panels-packages-coverage/repositories/payer-coverage.repository.js';

import {
  CoverageVerificationRepository,
} from '../modules/panels-packages-coverage/repositories/coverage-verification.repository.js';

import {
  CoverageMasterService,
} from '../modules/panels-packages-coverage/services/coverage-master.service.js';

import {
  CoverageDeterminationService,
} from '../modules/panels-packages-coverage/services/coverage-determination.service.js';

import {
  CoverageFinancialControlService,
} from '../modules/panels-packages-coverage/services/coverage-financial-control.service.js';

import {
  CoverageRuleEvaluatorService,
} from '../modules/panels-packages-coverage/services/coverage-rule-evaluator.service.js';

import {
  CoverageVerificationService,
} from '../modules/panels-packages-coverage/services/coverage-verification.service.js';

import {
  DiagnosticPanelService,
} from '../modules/panels-packages-coverage/services/diagnostic-panel.service.js';

import {
  PackageEnrollmentService,
} from '../modules/panels-packages-coverage/services/package-enrollment.service.js';

import {
  PanelsPackagesCoverageAccessPolicyService,
} from '../modules/panels-packages-coverage/services/panels-packages-coverage-access-policy.service.js';

import {
  PanelsPackagesCoverageReportService,
} from '../modules/panels-packages-coverage/services/panels-packages-coverage-report.service.js';

import {
  PanelsPackagesCoverageBackgroundJobs,
  PanelsPackagesCoverageRecoveryService,
} from '../modules/panels-packages-coverage/services/panels-packages-coverage-recovery.service.js';

import {
  MongoUnifiedBillingCoverageAdapter,
} from '../modules/panels-packages-coverage/services/unified-billing-coverage.adapter.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  MongoCoverageDeterminationDataAdapter,
  MongoPpcAuditAdapter,
  MongoPpcOutboxAdapter,
  MongoPpcPackageRuntimeAdapter,
  MongoPpcReferenceDataAdapter,
  MongoPpcSequenceAdapter,
  SystemPpcClock,
} from './panels-packages-coverage-runtime.adapters.js';

import {
  MongoPanelsPackagesCoverageTransactionManagerAdapter,
} from './panels-packages-coverage-transaction-manager.adapter.js';

import type {
  SensitiveSettingCryptoService,
} from './sensitive-setting-crypto.service.js';

type OperationalInfrastructure = ReturnType<
  typeof createOperationalInfrastructure
>;

export interface PanelsPackagesCoverageInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: OperationalInfrastructure;
  snapshotCrypto: SensitiveSettingCryptoService;
}

export function createPanelsPackagesCoverageInfrastructure(
  options: PanelsPackagesCoverageInfrastructureOptions,
) {
  const clock = new SystemPpcClock();
  const accessPolicy =
    new PanelsPackagesCoverageAccessPolicyService();

  const audit = new MongoPpcAuditAdapter(
    options.database,
    options.auditRepository,
  );
  const outbox = new MongoPpcOutboxAdapter(options.database);
  const referenceData = new MongoPpcReferenceDataAdapter();
  const sequences = new MongoPpcSequenceAdapter(
    options.operationalInfrastructure.sequences,
  );

  const transactionManager =
    new MongoPanelsPackagesCoverageTransactionManagerAdapter(
      options.database,
      options.operationalInfrastructure.transactionRepository,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.locks,
      options.operationalInfrastructure.outbox,
    );

  const panelRepository = new DiagnosticPanelRepository();
  const payerRepository = new PayerCoverageRepository();
  const packageRepository = new MongoPpcPackageRuntimeAdapter();
  const verificationRepository =
    new CoverageVerificationRepository();
  const determinationData =
    new MongoCoverageDeterminationDataAdapter(sequences);
  const billing = new MongoUnifiedBillingCoverageAdapter();

  const panels = new DiagnosticPanelService({
    repository: panelRepository,
    referenceData,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
  });

  const coverageMaster = new CoverageMasterService({
    repository: payerRepository,
    referenceData,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    async encryptSensitiveReference(value) {
      const protectedValue = options.snapshotCrypto.protect(
        value,
        'panels-packages-coverage:membership-reference',
      );

      return JSON.stringify(protectedValue.encryptedValue);
    },
    nextCoverageNumber: (facilityId) =>
      sequences.nextCoverageNumber(facilityId),
  });

  const packages = new PackageEnrollmentService({
    packages: packageRepository,
    referenceData,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    nextEnrollmentNumber: (facilityId) =>
      sequences.nextEnrollmentNumber(facilityId),
  });

  const verification = new CoverageVerificationService({
    repository: verificationRepository,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
  });

  const determinations = new CoverageDeterminationService({
    data: determinationData,
    evaluator: new CoverageRuleEvaluatorService(),
    accessPolicy,
    transactionManager,
    billing,
    audit,
    outbox,
  });

  const financialControls = new CoverageFinancialControlService({
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    billing,
  });

  const reports = new PanelsPackagesCoverageReportService({
    database: options.database,
    accessPolicy,
    jobs: options.operationalInfrastructure.jobs,
    clock,
  });

  const recovery = new PanelsPackagesCoverageRecoveryService(
    options.database,
    options.operationalInfrastructure.outbox,
  );

  const backgroundJobs = new PanelsPackagesCoverageBackgroundJobs({
    recovery,
    jobRunner: options.operationalInfrastructure.jobRunner,
    reports,
  });

  const application = createPanelsPackagesCoverageApplication({
    panels,
    coverageMaster,
    packages,
    verification,
    determinations,
    financialControls,
    reports,
    recovery,
  });

  return {
    application,
    accessPolicy,
    transactionManager,
    recovery,
    backgroundJobs,
    repositories: {
      panels: panelRepository,
      payers: payerRepository,
      packages: packageRepository,
      verification: verificationRepository,
      determinationData,
    },
    runtime: {
      audit,
      outbox,
      referenceData,
      sequences,
      clock,
      billing,
    },
  };
}

export type PanelsPackagesCoverageInfrastructure = ReturnType<
  typeof createPanelsPackagesCoverageInfrastructure
>;