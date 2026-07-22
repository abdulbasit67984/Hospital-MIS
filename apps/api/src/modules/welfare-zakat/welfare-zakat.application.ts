import type { AssistanceAllocationService } from './services/assistance-allocation.service.js';
import type { AssistanceApplicationService } from './services/assistance-application.service.js';
import type { AssistanceApprovalService } from './services/assistance-approval.service.js';
import type { AssistanceDonationService } from './services/assistance-donation.service.js';
import type { AssistanceEligibilityService } from './services/assistance-eligibility.service.js';
import type { AssistanceFundService } from './services/assistance-fund.service.js';
import type { AssistanceFundTransferService } from './services/assistance-fund-transfer.service.js';
import type { AssistanceMaintenanceService } from './services/assistance-maintenance.service.js';
import type { AssistanceRecoveryService } from './services/assistance-recovery.service.js';
import type { AssistanceReportingService } from './services/assistance-reporting.service.js';
import type { AssistanceReconciliationService } from './services/assistance-reconciliation.service.js';
import type { AssistanceReservationService } from './services/assistance-reservation.service.js';
import type { AssistanceReversalReturnService } from './services/assistance-reversal-return.service.js';
import type { AssistanceWorkQueueService } from './services/assistance-work-queue.service.js';

export interface WelfareZakatApplication {
  readonly services: Readonly<{
    funds: AssistanceFundService;
    donations: AssistanceDonationService;
    applications: AssistanceApplicationService;
    eligibility: AssistanceEligibilityService;
    approvals: AssistanceApprovalService;
    reservations: AssistanceReservationService;
    allocations: AssistanceAllocationService;
    reversalsAndReturns: AssistanceReversalReturnService;
    workQueue: AssistanceWorkQueueService;
    reconciliation: AssistanceReconciliationService;
    transfers: AssistanceFundTransferService;
    reports: AssistanceReportingService;
    maintenance: AssistanceMaintenanceService;
    recovery: AssistanceRecoveryService;
  }>;
}

export function createWelfareZakatApplication(
  services: WelfareZakatApplication['services'],
): WelfareZakatApplication {
  return {
    services: Object.freeze({ ...services }),
  };
}