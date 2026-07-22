import type { Db } from '@hospital-mis/database';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import { createWelfareZakatApplication } from '../modules/welfare-zakat/welfare-zakat.application.js';
import { MongoWelfareZakatFinancialIntegration } from '../modules/welfare-zakat/integrations/welfare-zakat-financial.integration.js';
import { MongoAssistanceAllocationRepository } from '../modules/welfare-zakat/repositories/assistance-allocation.repository.js';
import { MongoFundTransferRepository } from '../modules/welfare-zakat/repositories/assistance-fund-transfer.repository.js';
import {
  MongoAssistanceApplicationHistoryRepository,
  MongoAssistanceApplicationRepository,
  MongoAssistanceReviewRepository,
} from '../modules/welfare-zakat/repositories/assistance-application.repository.js';
import {
  MongoAssistanceApprovalHistoryRepository,
  MongoAssistanceApprovalRepository,
} from '../modules/welfare-zakat/repositories/assistance-approval.repository.js';
import {
  MongoAssistanceFundRepository,
  MongoFundTransactionRepository,
} from '../modules/welfare-zakat/repositories/assistance-fund.repository.js';
import { MongoAssistanceReservationRepository } from '../modules/welfare-zakat/repositories/assistance-reservation.repository.js';
import {
  MongoAssistanceReversalRepository,
  MongoFundReturnRepository,
} from '../modules/welfare-zakat/repositories/assistance-reversal-return.repository.js';
import { MongoAssistanceWorkQueueRepository } from '../modules/welfare-zakat/repositories/assistance-work-queue.repository.js';
import { AssistanceAllocationService } from '../modules/welfare-zakat/services/assistance-allocation.service.js';
import { AssistanceApplicationService } from '../modules/welfare-zakat/services/assistance-application.service.js';
import { AssistanceApprovalService } from '../modules/welfare-zakat/services/assistance-approval.service.js';
import { AssistanceDonationService } from '../modules/welfare-zakat/services/assistance-donation.service.js';
import { AssistanceEligibilityService } from '../modules/welfare-zakat/services/assistance-eligibility.service.js';
import { AssistanceFundService } from '../modules/welfare-zakat/services/assistance-fund.service.js';
import { AssistanceFundTransferService } from '../modules/welfare-zakat/services/assistance-fund-transfer.service.js';
import { AssistanceMaintenanceService } from '../modules/welfare-zakat/services/assistance-maintenance.service.js';
import { AssistanceRecoveryService } from '../modules/welfare-zakat/services/assistance-recovery.service.js';
import { AssistanceReportingService } from '../modules/welfare-zakat/services/assistance-reporting.service.js';
import { AssistanceReconciliationService } from '../modules/welfare-zakat/services/assistance-reconciliation.service.js';
import { AssistanceReservationService } from '../modules/welfare-zakat/services/assistance-reservation.service.js';
import { AssistanceReversalReturnService } from '../modules/welfare-zakat/services/assistance-reversal-return.service.js';
import { AssistanceWorkQueueService } from '../modules/welfare-zakat/services/assistance-work-queue.service.js';
import { WelfareZakatAccessPolicyService } from '../modules/welfare-zakat/services/welfare-zakat-access-policy.service.js';
import type { createOperationalInfrastructure } from './operational-infrastructure.js';
import { WelfareZakatBackgroundJobs } from './welfare-zakat-background-jobs.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';
import {
  MongoWelfareZakatAttachmentAdapter,
  MongoWelfareZakatAuditAdapter,
  MongoWelfareZakatEligibilityContextAdapter,
  MongoWelfareZakatFinancialApprovalAdapter,
  MongoWelfareZakatNumberSequenceAdapter,
  MongoWelfareZakatOutboxAdapter,
  MongoWelfareZakatPatientContextAdapter,
  MongoWelfareZakatTransactionManagerAdapter,
  SystemWelfareZakatClock,
  WelfareZakatSensitiveEncryptionAdapter,
} from './welfare-zakat-runtime.adapters.js';

type OperationalInfrastructure = ReturnType<
  typeof createOperationalInfrastructure
>;

export interface WelfareZakatInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: OperationalInfrastructure;
  snapshotCrypto: SensitiveSettingCryptoService;
}

const eventRules = {
  DONATION: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_DONATION_INCOME',
    description: 'Welfare or Zakat donation received',
  },
  GRANT: {
    debitAccountCode: 'WELFARE_FUND_RECEIVABLE',
    creditAccountCode: 'WELFARE_GRANT_INCOME',
    description: 'Welfare or Zakat grant recognized',
  },
  OTHER_INFLOW: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_OTHER_INCOME',
    description: 'Other approved assistance-fund inflow',
  },
  ASSISTANCE_UTILIZATION: {
    debitAccountCode: 'WELFARE_ASSISTANCE_EXPENSE',
    creditAccountCode: 'PATIENT_RECEIVABLE',
    description: 'Approved Welfare or Zakat assistance utilized',
  },
  ASSISTANCE_UTILIZATION_REVERSAL: {
    debitAccountCode: 'PATIENT_RECEIVABLE',
    creditAccountCode: 'WELFARE_ASSISTANCE_EXPENSE',
    description: 'Welfare or Zakat utilization reversed',
  },
  ASSISTANCE_REFUND_TO_FUND: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_ASSISTANCE_RECOVERY',
    description: 'Refund returned to the assistance fund',
  },
  ASSISTANCE_REPAYMENT_TO_FUND: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_ASSISTANCE_RECOVERY',
    description: 'Patient repayment returned to the assistance fund',
  },
  ASSISTANCE_RECOVERY_TO_FUND: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_ASSISTANCE_RECOVERY',
    description: 'Incorrect or excess allocation recovered to the fund',
  },
  ASSISTANCE_FUND_TRANSFER_OUT: {
    debitAccountCode: 'WELFARE_INTERFUND_TRANSFER_CLEARING',
    creditAccountCode: 'WELFARE_FUND_CASH',
    description: 'Approved assistance-fund transfer sent',
  },
  ASSISTANCE_FUND_TRANSFER_IN: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_INTERFUND_TRANSFER_CLEARING',
    description: 'Approved assistance-fund transfer received',
  },
  ASSISTANCE_FUND_TRANSFER_REVERSAL_IN: {
    debitAccountCode: 'WELFARE_FUND_CASH',
    creditAccountCode: 'WELFARE_INTERFUND_TRANSFER_CLEARING',
    description: 'Assistance-fund transfer reversal restored to source fund',
  },
  ASSISTANCE_FUND_TRANSFER_REVERSAL_OUT: {
    debitAccountCode: 'WELFARE_INTERFUND_TRANSFER_CLEARING',
    creditAccountCode: 'WELFARE_FUND_CASH',
    description: 'Assistance-fund transfer reversal removed from destination fund',
  },
} as const;

export function createWelfareZakatInfrastructure(
  options: WelfareZakatInfrastructureOptions,
) {
  const clock = new SystemWelfareZakatClock();
  const accessPolicy = new WelfareZakatAccessPolicyService();
  const transactionManager =
    new MongoWelfareZakatTransactionManagerAdapter(
      options.database,
      options.operationalInfrastructure.transactionRepository,
      options.operationalInfrastructure.idempotency,
      options.operationalInfrastructure.locks,
      options.operationalInfrastructure.outbox,
    );
  const audit = new MongoWelfareZakatAuditAdapter(
    options.database,
    options.auditRepository,
  );
  const outbox = new MongoWelfareZakatOutboxAdapter(options.database);
  const sequences = new MongoWelfareZakatNumberSequenceAdapter(
    options.operationalInfrastructure.sequences,
  );
  const encryption = new WelfareZakatSensitiveEncryptionAdapter(
    options.snapshotCrypto,
  );
  const attachments = new MongoWelfareZakatAttachmentAdapter(options.database);
  const financialApprovals =
    new MongoWelfareZakatFinancialApprovalAdapter(options.database);
  const patientContext = new MongoWelfareZakatPatientContextAdapter(
    options.database,
  );
  const eligibilityContext = new MongoWelfareZakatEligibilityContextAdapter(
    options.database,
    encryption,
  );
  const financial = new MongoWelfareZakatFinancialIntegration({ eventRules });

  const fundsRepository = new MongoAssistanceFundRepository();
  const fundTransactionsRepository = new MongoFundTransactionRepository();
  const applicationsRepository = new MongoAssistanceApplicationRepository();
  const applicationHistoriesRepository =
    new MongoAssistanceApplicationHistoryRepository();
  const reviewsRepository = new MongoAssistanceReviewRepository();
  const approvalsRepository = new MongoAssistanceApprovalRepository();
  const approvalHistoriesRepository =
    new MongoAssistanceApprovalHistoryRepository();
  const reservationsRepository = new MongoAssistanceReservationRepository();
  const allocationsRepository = new MongoAssistanceAllocationRepository();
  const reversalsRepository = new MongoAssistanceReversalRepository();
  const fundReturnsRepository = new MongoFundReturnRepository();
  const workQueueRepository = new MongoAssistanceWorkQueueRepository();
  const fundTransfersRepository = new MongoFundTransferRepository();

  const funds = new AssistanceFundService({
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    sequences,
    encryption,
    financialApprovals,
  });

  const donations = new AssistanceDonationService({
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    accessPolicy,
    transactionManager,
    attachments,
    audit,
    outbox,
    clock,
    sequences,
    financialApprovals,
    financialLedger: financial,
  });

  const applications = new AssistanceApplicationService({
    applications: applicationsRepository,
    histories: applicationHistoriesRepository,
    reviews: reviewsRepository,
    funds: fundsRepository,
    workQueue: workQueueRepository,
    patientContext,
    accessPolicy,
    transactionManager,
    attachments,
    audit,
    outbox,
    clock,
    sequences,
    encryption,
  });

  const eligibility = new AssistanceEligibilityService({
    applications: applicationsRepository,
    applicationHistories: applicationHistoriesRepository,
    funds: fundsRepository,
    reviews: reviewsRepository,
    context: eligibilityContext,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
  });

  const approvals = new AssistanceApprovalService({
    applications: applicationsRepository,
    applicationHistories: applicationHistoriesRepository,
    approvals: approvalsRepository,
    approvalHistories: approvalHistoriesRepository,
    funds: fundsRepository,
    workQueue: workQueueRepository,
    accessPolicy,
    transactionManager,
    attachments,
    audit,
    outbox,
    clock,
    sequences,
    encryption,
    financialApprovals,
  });

  const reservations = new AssistanceReservationService({
    transactionManager,
    accessPolicy,
    clock,
    numberSequence: sequences,
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    applications: applicationsRepository,
    approvals: approvalsRepository,
    reservations: reservationsRepository,
    billing: financial,
    coverageClaims: financial,
    eligibilityLimits: eligibilityContext,
    audit,
    outbox,
  });

  const allocations = new AssistanceAllocationService({
    transactionManager,
    accessPolicy,
    clock,
    numberSequence: sequences,
    attachments,
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    applications: applicationsRepository,
    approvals: approvalsRepository,
    reservations: reservationsRepository,
    allocations: allocationsRepository,
    billing: financial,
    coverageClaims: financial,
    eligibilityLimits: eligibilityContext,
    financialApprovals,
    financialLedger: financial,
    financialDischarge: financial,
    reconciliation: financial,
    audit,
    outbox,
  });

  const reversalsAndReturns = new AssistanceReversalReturnService({
    transactionManager,
    accessPolicy,
    clock,
    numberSequence: sequences,
    attachments,
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    approvals: approvalsRepository,
    allocations: allocationsRepository,
    reversals: reversalsRepository,
    fundReturns: fundReturnsRepository,
    billing: financial,
    financialApprovals,
    financialLedger: financial,
    financialDischarge: financial,
    audit,
    outbox,
  });

  const transfers = new AssistanceFundTransferService({
    funds: fundsRepository,
    fundTransactions: fundTransactionsRepository,
    transfers: fundTransfersRepository,
    accessPolicy,
    transactionManager,
    attachments,
    audit,
    outbox,
    clock,
    sequences,
    financialApprovals,
    financialLedger: financial,
  });

  const workQueue = new AssistanceWorkQueueService({
    workQueue: workQueueRepository,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    encryption,
  });

  const reconciliation = new AssistanceReconciliationService({
    transactionManager,
    accessPolicy,
    clock,
    funds: fundsRepository,
    allocations: allocationsRepository,
    billing: financial,
    reconciliation: financial,
    audit,
    outbox,
  });

  const reports = new AssistanceReportingService({
    database: options.database,
    accessPolicy,
    jobs: options.operationalInfrastructure.jobs,
    clock,
  });

  const recovery = new AssistanceRecoveryService({
    database: options.database,
    operationalOutbox: options.operationalInfrastructure.outbox,
    accessPolicy,
    clock,
  });

  const maintenance = new AssistanceMaintenanceService({
    transactionManager,
    applications: applicationsRepository,
    applicationHistories: applicationHistoriesRepository,
    approvals: approvalsRepository,
    approvalHistories: approvalHistoriesRepository,
    reservations: reservationsRepository,
    reservationService: reservations,
    reconciliationService: reconciliation,
    audit,
    outbox,
    clock,
  });

  const backgroundJobs = new WelfareZakatBackgroundJobs({
    maintenance,
    reports,
    jobRunner: options.operationalInfrastructure.jobRunner,
  });

  const application = createWelfareZakatApplication({
    funds,
    donations,
    applications,
    eligibility,
    approvals,
    reservations,
    allocations,
    reversalsAndReturns,
    workQueue,
    reconciliation,
    transfers,
    reports,
    maintenance,
    recovery,
  });

  return {
    application,
    accessPolicy,
    transactionManager,
    repositories: {
      funds: fundsRepository,
      fundTransactions: fundTransactionsRepository,
      applications: applicationsRepository,
      applicationHistories: applicationHistoriesRepository,
      reviews: reviewsRepository,
      approvals: approvalsRepository,
      approvalHistories: approvalHistoriesRepository,
      reservations: reservationsRepository,
      allocations: allocationsRepository,
      reversals: reversalsRepository,
      fundReturns: fundReturnsRepository,
      workQueue: workQueueRepository,
      fundTransfers: fundTransfersRepository,
    },
    runtime: {
      audit,
      outbox,
      clock,
      sequences,
      encryption,
      attachments,
      financialApprovals,
      patientContext,
      eligibilityContext,
      financial,
    },
    reports,
    maintenance,
    recovery,
    backgroundJobs,
  };
}

export type WelfareZakatInfrastructure = ReturnType<
  typeof createWelfareZakatInfrastructure
>;