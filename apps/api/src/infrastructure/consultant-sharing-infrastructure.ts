import type { Db } from '@hospital-mis/database';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import { createConsultantSharingApplication } from '../modules/consultant-sharing/consultant-sharing.application.js';
import { ConsultantSharingBackgroundJobs } from '../modules/consultant-sharing/jobs/consultant-sharing-background-jobs.js';
import { MongoConsultantFinancialActivityAdapter } from '../modules/consultant-sharing/integrations/consultant-financial-activity.adapter.js';
import {
  MongoConsultantFinancialPostingAdapter,
  type ConsultantLedgerPostingConfiguration,
} from '../modules/consultant-sharing/integrations/consultant-financial-posting.adapter.js';
import {
  MongoConsultantDisputeRepository,
  MongoConsultantRevenueAdjustmentRepository,
  MongoConsultantRevenueReversalRepository,
} from '../modules/consultant-sharing/repositories/consultant-adjustment-dispute.repository.js';
import {
  MongoConsultantAgreementHistoryRepository,
  MongoConsultantAgreementRepository,
  MongoConsultantAgreementRuleRepository,
} from '../modules/consultant-sharing/repositories/consultant-agreement.repository.js';
import {
  MongoConsultantCalculationRunRepository,
  MongoConsultantRevenueEntryRepository,
} from '../modules/consultant-sharing/repositories/consultant-revenue.repository.js';
import {
  MongoConsultantSettlementPaymentRepository,
  MongoConsultantSettlementRepository,
} from '../modules/consultant-sharing/repositories/consultant-settlement.repository.js';
import { MongoConsultantWorkQueueRepository } from '../modules/consultant-sharing/repositories/consultant-work-queue.repository.js';
import { ConsultantAgreementApprovalService } from '../modules/consultant-sharing/services/consultant-agreement-approval.service.js';
import { ConsultantAgreementService } from '../modules/consultant-sharing/services/consultant-agreement.service.js';
import { ConsultantDisputeService } from '../modules/consultant-sharing/services/consultant-dispute.service.js';
import { ConsultantPayoutService } from '../modules/consultant-sharing/services/consultant-payout.service.js';
import { ConsultantRecalculationService } from '../modules/consultant-sharing/services/consultant-recalculation.service.js';
import {
  ConsultantReconciliationService,
  MongoConsultantReconciliationRepository,
} from '../modules/consultant-sharing/services/consultant-reconciliation.service.js';
import { ConsultantRevenueAdjustmentService } from '../modules/consultant-sharing/services/consultant-revenue-adjustment.service.js';
import { ConsultantRevenueAssignmentService } from '../modules/consultant-sharing/services/consultant-revenue-assignment.service.js';
import { ConsultantRevenueCalculationService } from '../modules/consultant-sharing/services/consultant-revenue-calculation.service.js';
import { ConsultantSettlementService } from '../modules/consultant-sharing/services/consultant-settlement.service.js';
import { ConsultantSharingAccessPolicyService } from '../modules/consultant-sharing/services/consultant-sharing-access-policy.service.js';
import { ConsultantSharingRecoveryService } from '../modules/consultant-sharing/services/consultant-sharing-recovery.service.js';
import { ConsultantSharingReportingService } from '../modules/consultant-sharing/services/consultant-sharing-reporting.service.js';
import { ConsultantWorkQueueService } from '../modules/consultant-sharing/services/consultant-work-queue.service.js';
import type { createOperationalInfrastructure } from './operational-infrastructure.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';
import {
  ConsultantSensitiveEncryptionAdapter,
  MongoConsultantActorIdentityResolver,
  MongoConsultantApprovalAdapter,
  MongoConsultantAttachmentAdapter,
  MongoConsultantAuditAdapter,
  MongoConsultantIdentityAdapter,
  MongoConsultantPayoutExecutionGateway,
  MongoConsultantPeriodCapAdapter,
  MongoConsultantSharingTransactionManagerAdapter,
  OperationalConsultantIdempotencyAdapter,
  OperationalConsultantLockAdapter,
  OperationalConsultantOutboxAdapter,
  OperationalConsultantSequenceAdapter,
  SystemConsultantClock,
} from './consultant-sharing-runtime.adapters.js';

type OperationalInfrastructure = ReturnType<typeof createOperationalInfrastructure>;

export interface ConsultantSharingInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: OperationalInfrastructure;
  snapshotCrypto: SensitiveSettingCryptoService;
  ledgerConfiguration: ConsultantLedgerPostingConfiguration;
}

export function createConsultantSharingInfrastructure(
  options: ConsultantSharingInfrastructureOptions,
) {
  const agreements = new MongoConsultantAgreementRepository();
  const rules = new MongoConsultantAgreementRuleRepository();
  const history = new MongoConsultantAgreementHistoryRepository();
  const revenueEntries = new MongoConsultantRevenueEntryRepository();
  const calculationRuns = new MongoConsultantCalculationRunRepository();
  const settlements = new MongoConsultantSettlementRepository();
  const settlementPayments = new MongoConsultantSettlementPaymentRepository();
  const adjustments = new MongoConsultantRevenueAdjustmentRepository();
  const reversals = new MongoConsultantRevenueReversalRepository();
  const disputes = new MongoConsultantDisputeRepository();
  const workItems = new MongoConsultantWorkQueueRepository();

  const accessPolicy = new ConsultantSharingAccessPolicyService();
  const transactions = new MongoConsultantSharingTransactionManagerAdapter();
  const idempotency = new OperationalConsultantIdempotencyAdapter(
    options.operationalInfrastructure.idempotency,
  );
  const locks = new OperationalConsultantLockAdapter(
    options.operationalInfrastructure.locks,
  );
  const audit = new MongoConsultantAuditAdapter(
    options.database,
    options.auditRepository,
  );
  const outbox = new OperationalConsultantOutboxAdapter(options.database);
  const clock = new SystemConsultantClock();
  const sequence = new OperationalConsultantSequenceAdapter(
    options.operationalInfrastructure.sequences,
  );
  const encryption = new ConsultantSensitiveEncryptionAdapter(
    options.snapshotCrypto,
  );
  const attachments = new MongoConsultantAttachmentAdapter(options.database);
  const identity = new MongoConsultantIdentityAdapter(options.database);
  const actorIdentityResolver = new MongoConsultantActorIdentityResolver(
    options.database,
  );
  const approval = new MongoConsultantApprovalAdapter(options.database);
  const periodCaps = new MongoConsultantPeriodCapAdapter(options.database);
  const financialActivity = new MongoConsultantFinancialActivityAdapter();
  const payoutGateway = new MongoConsultantPayoutExecutionGateway(
    options.database,
  );
  const financialPosting = new MongoConsultantFinancialPostingAdapter(
    options.ledgerConfiguration,
    payoutGateway,
  );
  const reconciliationRepository = new MongoConsultantReconciliationRepository();

  const shared = {
    accessPolicy,
    transactions,
    idempotency,
    locks,
    audit,
    outbox,
    clock,
  } as const;

  const agreementService = new ConsultantAgreementService({
    agreements,
    rules,
    history,
    identity,
    attachments,
    sequences: sequence,
    encryption,
    ...shared,
  });
  const agreementApprovalService = new ConsultantAgreementApprovalService({
    agreements,
    rules,
    history,
    approvals: approval,
    encryption,
    ...shared,
  });
  const revenueCalculationService = new ConsultantRevenueCalculationService({
    financialActivity,
    rules,
    identity,
    revenueEntries,
    calculationRuns,
    ledger: financialPosting,
    periodCaps,
    ...shared,
  });
  const revenueAssignmentService = new ConsultantRevenueAssignmentService({
    identities: identity,
    revenueEntries,
    encryption,
    ...shared,
  });
  const revenueAdjustmentService = new ConsultantRevenueAdjustmentService({
    revenueEntries,
    adjustments,
    reversals,
    approval,
    ledger: financialPosting,
    attachments,
    sequence,
    ...shared,
  });
  const recalculationService = new ConsultantRecalculationService({
    changes: financialActivity,
    rules,
    periodCaps,
    adjustments: revenueAdjustmentService,
    ...shared,
  });
  const settlementService = new ConsultantSettlementService({
    settlements,
    sources: settlements,
    items: settlements,
    approval,
    ledger: financialPosting,
    sequence,
    ...shared,
  });
  const payoutService = new ConsultantPayoutService({
    settlements,
    payments: settlementPayments,
    approval,
    payout: financialPosting,
    ledger: financialPosting,
    sequence,
    ...shared,
  });
  const workQueueService = new ConsultantWorkQueueService({
    workQueue: workItems,
    encryption,
    ...shared,
  });
  const disputeService = new ConsultantDisputeService({
    disputes,
    histories: disputes,
    revenueEntries,
    settlements,
    adjustments: revenueAdjustmentService,
    workQueue: workItems,
    approval,
    attachments,
    encryption,
    sequence,
    ...shared,
  });
  const reconciliationService = new ConsultantReconciliationService({
    repository: reconciliationRepository,
    accessPolicy,
    audit,
    clock,
  });
  const reportingService = new ConsultantSharingReportingService({
    database: options.database,
    accessPolicy,
    audit,
    jobs: options.operationalInfrastructure.jobs,
    clock,
  });
  const recoveryService = new ConsultantSharingRecoveryService({
    database: options.database,
    jobs: options.operationalInfrastructure.jobs,
    accessPolicy,
    idempotency,
    audit,
    clock,
    agreementApprovals: agreementApprovalService,
  });

  const application = createConsultantSharingApplication({
    services: {
      agreements: agreementService,
      agreementApprovals: agreementApprovalService,
      revenueCalculation: revenueCalculationService,
      revenueAssignment: revenueAssignmentService,
      revenueAdjustments: revenueAdjustmentService,
      recalculation: recalculationService,
      settlements: settlementService,
      payouts: payoutService,
      disputes: disputeService,
      workQueue: workQueueService,
      reconciliation: reconciliationService,
      reporting: reportingService,
      recovery: recoveryService,
    },
    repositories: {
      revenueEntries,
      settlements,
    },
  });

  const backgroundJobs = new ConsultantSharingBackgroundJobs({
    reports: reportingService,
    recovery: recoveryService,
    agreementApprovals: agreementApprovalService,
    revenueCalculation: revenueCalculationService,
    recalculation: recalculationService,
    settlements: settlementService,
    reconciliation: reconciliationService,
    jobRunner: options.operationalInfrastructure.jobRunner,
  });

  return {
    application,
    accessPolicy,
    actorIdentityResolver,
    reports: reportingService,
    recovery: recoveryService,
    backgroundJobs,
    repositories: {
      agreements,
      rules,
      revenueEntries,
      settlements,
      settlementPayments,
      disputes,
      workItems,
    },
    runtime: {
      transactions,
      idempotency,
      locks,
      audit,
      outbox,
      clock,
      sequence,
      encryption,
    },
  };
}

export type ConsultantSharingInfrastructure = ReturnType<
  typeof createConsultantSharingInfrastructure
>;