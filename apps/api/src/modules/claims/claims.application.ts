import type { ClaimRecoveryService } from './services/claim-recovery.service.js';
import type { ClaimReportingService } from './services/claim-reporting.service.js';
import type { ClaimAdjudicationService } from './services/claim-adjudication.service.js';
import type { ClaimAdjustmentService } from './services/claim-adjustment.service.js';
import type { ClaimBatchService } from './services/claim-batch.service.js';
import type { ClaimDenialAppealService } from './services/claim-denial-appeal.service.js';
import type { ClaimPreparationService } from './services/claim-preparation.service.js';
import type { ClaimReconciliationService } from './services/claim-reconciliation.service.js';
import type { ClaimRemittancePaymentService } from './services/claim-remittance-payment.service.js';
import type { ClaimSensitiveLifecycleService } from './services/claim-sensitive-lifecycle.service.js';
import type { ClaimSubmissionService } from './services/claim-submission.service.js';
import type { ClaimValidationService } from './services/claim-validation.service.js';
import type { ClaimWorkQueueService } from './services/claim-work-queue.service.js';
import type { ClaimWorkflowService } from './services/claim-workflow.service.js';

export interface ClaimsApplication {
  readonly services: Readonly<{
    preparation: ClaimPreparationService;
    validation: ClaimValidationService;
    workflow: ClaimWorkflowService;
    sensitiveLifecycle: ClaimSensitiveLifecycleService;
    batches: ClaimBatchService;
    submissions: ClaimSubmissionService;
    adjudication: ClaimAdjudicationService;
    remittances: ClaimRemittancePaymentService;
    adjustments: ClaimAdjustmentService;
    denialsAndAppeals: ClaimDenialAppealService;
    workQueue: ClaimWorkQueueService;
    reconciliation: ClaimReconciliationService;
    reporting: ClaimReportingService;
    recovery: ClaimRecoveryService;
  }>;
}

export function createClaimsApplication(
  services: ClaimsApplication['services'],
): ClaimsApplication {
  return {
    services: Object.freeze({ ...services }),
  };
}