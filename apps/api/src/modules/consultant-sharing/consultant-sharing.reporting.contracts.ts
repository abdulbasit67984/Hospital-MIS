import type { ConsultantSharingListQuery } from './consultant-sharing.contracts.js';

export const CONSULTANT_SHARING_REPORT_NAMES = [
  'agreement-register',
  'active-expiring-agreements',
  'agreement-amendment-history',
  'revenue-by-consultant',
  'revenue-by-department',
  'revenue-by-service',
  'revenue-by-procedure',
  'revenue-by-payer',
  'revenue-by-package',
  'revenue-by-claim',
  'revenue-summary',
  'pending-accrued-collected-revenue',
  'reversed-adjusted-revenue',
  'consultant-liabilities',
  'settlement-register',
  'settlement-status',
  'settlement-outstanding',
  'unpaid-settlement-aging',
  'consultant-payments',
  'tax-withholding',
  'deductions',
  'disputes',
  'refund-and-reversal',
  'agreement-rule-utilization',
  'unmatched-invoice-lines',
  'ambiguous-agreements',
  'consultant-revenue-reconciliation',
  'settlement-reconciliation',
  'financial-ledger-reconciliation',
] as const;

export type ConsultantSharingReportName =
  (typeof CONSULTANT_SHARING_REPORT_NAMES)[number];

export interface ConsultantSharingReportQuery
  extends ConsultantSharingListQuery {
  expiringWithinDays?: number;
  agingBucket?: readonly string[];
}

export interface ConsultantSharingReportPage {
  report: ConsultantSharingReportName;
  items: readonly Readonly<Record<string, unknown>>[];
  page: number;
  pageSize: number;
  total: number;
  generatedAt: string;
}

export interface ConsultantSharingCsvExport {
  filename: string;
  contentType: 'text/csv';
  content: string;
}

export interface ConsultantSharingRecoveryRunInput {
  asOf?: string;
  limit?: number;
  facilityId?: string;
  includeAgreementExpiry?: boolean;
  includeCalculationRecovery?: boolean;
  includeSettlementReconciliation?: boolean;
  includeLedgerReconciliation?: boolean;
}

export interface ConsultantSharingRecoveryRunResult {
  expiredAgreements: number;
  recoveredCalculationRuns: number;
  queuedReconciliations: number;
  queuedJobs: number;
  deadLetteredRuns: number;
  completedAt: string;
}