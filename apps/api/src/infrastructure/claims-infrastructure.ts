import { ClaimRecoveryService } from '../modules/claims/services/claim-recovery.service.js';
import { ClaimReportingService } from '../modules/claims/services/claim-reporting.service.js';
import { ClaimsBackgroundJobs } from './claims-background-jobs.js';
import type { Db } from '@hospital-mis/database';

import type { AuditRepository } from '../modules/audit/audit.repository.js';
import { createClaimsApplication } from '../modules/claims/claims.application.js';
import { MongoClaimsFinancialAdapter } from '../modules/claims/integrations/claims-financial.adapter.js';
import { MongoClaimsPaymentAdapter } from '../modules/claims/integrations/claims-payment.adapter.js';
import {
  MongoClaimAdjudicationRepository,
  MongoClaimDenialRepository,
} from '../modules/claims/repositories/claim-adjudication-denial.repository.js';
import { MongoClaimAppealRepository } from '../modules/claims/repositories/claim-appeal.repository.js';
import {
  MongoClaimBatchRepository,
  MongoClaimSubmissionRepository,
} from '../modules/claims/repositories/claim-batch-submission.repository.js';
import {
  MongoClaimValidationRepository,
  MongoClaimWorkflowHistoryRepository,
} from '../modules/claims/repositories/claim-history-validation.repository.js';
import {
  MongoClaimDocumentRepository,
  MongoClaimLineRepository,
} from '../modules/claims/repositories/claim-line-document.repository.js';
import {
  MongoClaimAdjustmentRepository,
  MongoClaimPaymentAllocationRepository,
  MongoClaimRemittanceRepository,
} from '../modules/claims/repositories/claim-remittance-payment-adjustment.repository.js';
import { MongoClaimWorkQueueRepository } from '../modules/claims/repositories/claim-work-queue.repository.js';
import { MongoClaimsRepository } from '../modules/claims/repositories/claim.repository.js';
import { ClaimAdjudicationService } from '../modules/claims/services/claim-adjudication.service.js';
import { ClaimAdjustmentService } from '../modules/claims/services/claim-adjustment.service.js';
import { ClaimBatchService } from '../modules/claims/services/claim-batch.service.js';
import { ClaimDenialAppealService } from '../modules/claims/services/claim-denial-appeal.service.js';
import { ClaimPreparationService } from '../modules/claims/services/claim-preparation.service.js';
import { ClaimReconciliationService } from '../modules/claims/services/claim-reconciliation.service.js';
import { ClaimRemittancePaymentService } from '../modules/claims/services/claim-remittance-payment.service.js';
import { ClaimsAccessPolicyService } from '../modules/claims/services/claims-access-policy.service.js';
import { ClaimSensitiveLifecycleService } from '../modules/claims/services/claim-sensitive-lifecycle.service.js';
import { ClaimSubmissionService } from '../modules/claims/services/claim-submission.service.js';
import { ClaimValidationService } from '../modules/claims/services/claim-validation.service.js';
import { ClaimWorkQueueService } from '../modules/claims/services/claim-work-queue.service.js';
import { ClaimWorkflowService } from '../modules/claims/services/claim-workflow.service.js';

import type { createOperationalInfrastructure } from './operational-infrastructure.js';
import {
  ClaimsSensitiveEncryptionAdapter,
  MongoClaimsApprovalAdapter,
  MongoClaimsAttachmentAdapter,
  MongoClaimsAuditAdapter,
  MongoClaimsAuthoritativeBillingAdapter,
  MongoClaimsCoverageUtilizationAdapter,
  MongoClaimsNumberSequenceAdapter,
  MongoClaimsOutboxAdapter,
  MongoClaimsTransactionManagerAdapter,
  SystemClaimsClock,
} from './claims-runtime.adapters.js';
import type { SensitiveSettingCryptoService } from './sensitive-setting-crypto.service.js';

type OperationalInfrastructure = ReturnType<typeof createOperationalInfrastructure>;

export interface ClaimsInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: OperationalInfrastructure;
  snapshotCrypto: SensitiveSettingCryptoService;
}

const eventRules = {
  CLAIM_ADJUDICATED: {
    debitAccountCode: 'CLAIM_ADJUSTMENT_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Payer adjudication adjustment',
  },
  CLAIM_PAYMENT_POSTED: {
    debitAccountCode: 'SPONSOR_PAYMENT_CLEARING',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Sponsor claim payment allocation',
  },
  CLAIM_CONTRACTUAL_POSTED: {
    debitAccountCode: 'CONTRACTUAL_ADJUSTMENT_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Contractual claim adjustment',
  },
  CLAIM_DISALLOWED_POSTED: {
    debitAccountCode: 'CLAIM_DISALLOWANCE_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Payer disallowed claim amount',
  },
  CLAIM_PAYER_WITHHOLDING_POSTED: {
    debitAccountCode: 'PAYER_WITHHOLDING_RECEIVABLE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Payer withholding adjustment',
  },
  CLAIM_ROUNDING_POSTED: {
    debitAccountCode: 'ROUNDING_ADJUSTMENT_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Claim rounding adjustment',
  },
  CLAIM_WRITE_OFF_POSTED: {
    debitAccountCode: 'CLAIM_WRITE_OFF_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Approved sponsor receivable write-off',
  },
  CLAIM_DEBIT_NOTE_POSTED: {
    debitAccountCode: 'SPONSOR_RECEIVABLE',
    creditAccountCode: 'CLAIM_ADJUSTMENT_INCOME',
    description: 'Claim debit note',
  },
  CLAIM_CREDIT_NOTE_POSTED: {
    debitAccountCode: 'CLAIM_ADJUSTMENT_EXPENSE',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Claim credit note',
  },
  CLAIM_REFUND_POSTED: {
    debitAccountCode: 'SPONSOR_RECEIVABLE',
    creditAccountCode: 'SPONSOR_PAYMENT_CLEARING',
    description: 'Sponsor claim refund',
  },
  CLAIM_REPAYMENT_POSTED: {
    debitAccountCode: 'SPONSOR_PAYMENT_CLEARING',
    creditAccountCode: 'SPONSOR_RECEIVABLE',
    description: 'Sponsor claim repayment',
  },
  CLAIM_APPEAL_OVERTURNED: {
    debitAccountCode: 'SPONSOR_RECEIVABLE',
    creditAccountCode: 'CLAIM_APPEAL_RECOVERY_INCOME',
    description: 'Successful claim appeal recovery',
  },
} as const;

export function createClaimsInfrastructure(options: ClaimsInfrastructureOptions) {
  const clock = new SystemClaimsClock();
  const accessPolicy = new ClaimsAccessPolicyService();
  const transactionManager = new MongoClaimsTransactionManagerAdapter(
    options.database,
    options.operationalInfrastructure.transactionRepository,
    options.operationalInfrastructure.idempotency,
    options.operationalInfrastructure.locks,
    options.operationalInfrastructure.outbox,
  );
  const audit = new MongoClaimsAuditAdapter(
    options.database,
    options.auditRepository,
  );
  const outbox = new MongoClaimsOutboxAdapter(options.database);
  const numberSequence = new MongoClaimsNumberSequenceAdapter(
    options.operationalInfrastructure.sequences,
  );
  const encryption = new ClaimsSensitiveEncryptionAdapter(options.snapshotCrypto);
  const attachments = new MongoClaimsAttachmentAdapter(options.database);
  const approval = new MongoClaimsApprovalAdapter(options.database);
  const billing = new MongoClaimsAuthoritativeBillingAdapter(options.database);
  const coverageUtilization = new MongoClaimsCoverageUtilizationAdapter(
    options.database,
  );
  const ledger = new MongoClaimsFinancialAdapter({
    claimReceivable: {
      debitAccountCode: 'SPONSOR_RECEIVABLE',
      creditAccountCode: 'PATIENT_SERVICE_REVENUE',
      description: 'Sponsor claim receivable recognized',
    },
    eventRules,
  });
  const paymentIntegration = new MongoClaimsPaymentAdapter();

  const claims = new MongoClaimsRepository();
  const lines = new MongoClaimLineRepository();
  const documents = new MongoClaimDocumentRepository();
  const history = new MongoClaimWorkflowHistoryRepository();
  const validationRepository = new MongoClaimValidationRepository();
  const batches = new MongoClaimBatchRepository();
  const submissions = new MongoClaimSubmissionRepository();
  const adjudications = new MongoClaimAdjudicationRepository();
  const denials = new MongoClaimDenialRepository();
  const appeals = new MongoClaimAppealRepository();
  const remittances = new MongoClaimRemittanceRepository();
  const paymentAllocations = new MongoClaimPaymentAllocationRepository();
  const adjustments = new MongoClaimAdjustmentRepository();
  const workQueue = new MongoClaimWorkQueueRepository();

  const workflow = new ClaimWorkflowService({
    claims,
    lines,
    validation: validationRepository,
    history,
    accessPolicy,
    approval,
    transactionManager,
    financialLedger: ledger,
    financialDischarge: ledger,
    audit,
    outbox,
    clock,
  });

  const preparation = new ClaimPreparationService({
    claims,
    lines,
    documents,
    history,
    billing,
    coverageUtilization,
    attachments,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    numberSequence,
    encryption,
  });

  const validation = new ClaimValidationService({
    claims,
    lines,
    documents,
    validation: validationRepository,
    workQueue,
    billing,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    encryption,
  });

  const batchService = new ClaimBatchService({
    claims,
    batches,
    accessPolicy,
    approval,
    transactionManager,
    audit,
    outbox,
    clock,
    numberSequence,
    encryption,
  });

  const submission = new ClaimSubmissionService({
    claims,
    batches,
    submissions,
    documents,
    attachments,
    workflow,
    accessPolicy,
    approval,
    transactionManager,
    audit,
    outbox,
    clock,
  });

  const adjudication = new ClaimAdjudicationService({
    claims,
    lines,
    adjudications,
    denials,
    workQueue,
    workflow,
    accessPolicy,
    transactionManager,
    ledger,
    financialDischarge: ledger,
    encryption,
    audit,
    outbox,
    clock,
    appealWindowDays: 30,
  });

  const remittanceService = new ClaimRemittancePaymentService({
    claims,
    lines,
    remittances,
    paymentAllocations,
    paymentIntegration,
    workflow,
    workQueue,
    accessPolicy,
    transactionManager,
    numberSequence,
    attachments,
    ledger,
    financialDischarge: ledger,
    audit,
    outbox,
    clock,
  });

  const adjustmentService = new ClaimAdjustmentService({
    claims,
    lines,
    adjustments,
    accessPolicy,
    approval,
    transactionManager,
    ledger,
    financialDischarge: ledger,
    audit,
    outbox,
    clock,
  });

  const denialsAndAppeals = new ClaimDenialAppealService({
    claims,
    lines,
    denials,
    appeals,
    workQueue,
    workflow,
    accessPolicy,
    approval,
    transactionManager,
    numberSequence,
    attachments,
    encryption,
    ledger,
    financialDischarge: ledger,
    audit,
    outbox,
    clock,
  });

  const workQueueService = new ClaimWorkQueueService({
    claims,
    workQueue,
    accessPolicy,
    transactionManager,
    audit,
    outbox,
    clock,
    encryption,
  });

  const reconciliation = new ClaimReconciliationService({
    claims,
    lines,
    payments: paymentAllocations,
    adjustments,
    billing,
    workflow,
    accessPolicy,
    transactionManager,
    financialDischarge: ledger,
    audit,
    outbox,
    now: () => clock.now(),
  });


  const reporting = new ClaimReportingService({
    database: options.database,
    accessPolicy,
    jobs: options.operationalInfrastructure.jobs,
    clock,
  });

  const recovery = new ClaimRecoveryService({
    database: options.database,
    jobs: options.operationalInfrastructure.jobs,
    operationalOutbox: options.operationalInfrastructure.outbox,
    claims,
    batches,
    submissions,
    workflow,
    accessPolicy,
    transactionManager,
    outbox,
    clock,
  });

  const backgroundJobs = new ClaimsBackgroundJobs({
    recovery,
    reports: reporting,
    jobRunner: options.operationalInfrastructure.jobRunner,
  });

  const sensitiveLifecycle = new ClaimSensitiveLifecycleService({
    claims,
    workflow,
    accessPolicy,
    transactionManager,
  });

  return {
    application: createClaimsApplication({
      preparation,
      validation,
      workflow,
      sensitiveLifecycle,
      batches: batchService,
      submissions: submission,
      adjudication,
      remittances: remittanceService,
      adjustments: adjustmentService,
      denialsAndAppeals,
      workQueue: workQueueService,
      reconciliation,
      reporting,
      recovery,
    }),
    recovery,
    backgroundJobs,
    runtime: {
      transactionManager,
      accessPolicy,
      audit,
      outbox,
      clock,
    },
  };
}