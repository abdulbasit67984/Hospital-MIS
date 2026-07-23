import type { ConsultantAgreementApprovalService } from './services/consultant-agreement-approval.service.js';
import type { ConsultantAgreementService } from './services/consultant-agreement.service.js';
import type { ConsultantDisputeService } from './services/consultant-dispute.service.js';
import type { ConsultantPayoutService } from './services/consultant-payout.service.js';
import type { ConsultantRecalculationService } from './services/consultant-recalculation.service.js';
import type { ConsultantReconciliationService } from './services/consultant-reconciliation.service.js';
import type { ConsultantRevenueAdjustmentService } from './services/consultant-revenue-adjustment.service.js';
import type { ConsultantRevenueAssignmentService } from './services/consultant-revenue-assignment.service.js';
import type { ConsultantRevenueCalculationService } from './services/consultant-revenue-calculation.service.js';
import type { ConsultantSettlementService } from './services/consultant-settlement.service.js';
import type { ConsultantSharingRecoveryService } from './services/consultant-sharing-recovery.service.js';
import type { ConsultantSharingReportingService } from './services/consultant-sharing-reporting.service.js';
import type { ConsultantWorkQueueService } from './services/consultant-work-queue.service.js';
import type {
  ConsultantRevenueEntryRepositoryPort,
  ConsultantSettlementRepositoryPort,
} from './consultant-sharing.ports.js';

export interface ConsultantSharingApplication {
  readonly services: Readonly<{
    agreements: ConsultantAgreementService;
    agreementApprovals: ConsultantAgreementApprovalService;
    revenueCalculation: ConsultantRevenueCalculationService;
    revenueAssignment: ConsultantRevenueAssignmentService;
    revenueAdjustments: ConsultantRevenueAdjustmentService;
    recalculation: ConsultantRecalculationService;
    settlements: ConsultantSettlementService;
    payouts: ConsultantPayoutService;
    disputes: ConsultantDisputeService;
    workQueue: ConsultantWorkQueueService;
    reconciliation: ConsultantReconciliationService;
    reporting: ConsultantSharingReportingService;
    recovery: ConsultantSharingRecoveryService;
  }>;
  readonly repositories: Readonly<{
    revenueEntries: ConsultantRevenueEntryRepositoryPort;
    settlements: ConsultantSettlementRepositoryPort;
  }>;
}

export function createConsultantSharingApplication(
  input: ConsultantSharingApplication,
): ConsultantSharingApplication {
  return {
    services: Object.freeze({ ...input.services }),
    repositories: Object.freeze({ ...input.repositories }),
  };
}