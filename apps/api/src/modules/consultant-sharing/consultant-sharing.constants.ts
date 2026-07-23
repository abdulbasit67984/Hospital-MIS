export type ConsultantSharingObjectIdString = string;
export type ConsultantSharingCurrency = 'PKR';
export type ConsultantSharingSortDirection = 'asc' | 'desc';

export const consultantEngagementTypeValues = [
  'INTERNAL',
  'VISITING',
  'EXTERNAL',
  'INDIVIDUAL',
  'GROUP',
] as const;

export type ConsultantEngagementType =
  (typeof consultantEngagementTypeValues)[number];

export const consultantAgreementStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
  'SUPERSEDED',
  'REOPENED',
] as const;

export type ConsultantAgreementStatus =
  (typeof consultantAgreementStatusValues)[number];

export const consultantCalculationMethodValues = [
  'PERCENTAGE_OF_ELIGIBLE_REVENUE',
  'FIXED_PER_SERVICE',
  'FIXED_PER_PROCEDURE',
  'FIXED_PER_INVOICE_LINE',
  'FIXED_PER_CASE',
  'PERCENTAGE_PLUS_FIXED',
  'TIERED_PERCENTAGE',
  'SLAB_BASED',
  'THRESHOLD_BASED',
  'PROGRESSIVE_TIERS',
] as const;

export type ConsultantCalculationMethod =
  (typeof consultantCalculationMethodValues)[number];

export const consultantRecognitionBasisValues = [
  'ACCRUAL_ON_FINALIZATION',
  'ACCRUAL_ON_SERVICE_COMPLETION',
  'PAID_BASIS',
  'COLLECTION_BASIS',
  'FULL_PAYMENT_BASIS',
  'CLAIM_APPROVAL_BASIS',
  'CLAIM_PAYMENT_BASIS',
] as const;

export type ConsultantRecognitionBasis =
  (typeof consultantRecognitionBasisValues)[number];

export const consultantRevenueEntryTypeValues = [
  'EARNED',
  'ACCRUED',
  'COLLECTED',
  'PENDING',
  'HELD',
  'DISPUTED',
  'ADJUSTMENT',
  'REVERSAL',
  'REFUND',
  'WRITE_OFF',
  'CLAIM_DEPENDENT',
  'PACKAGE_DEPENDENT',
  'WELFARE_ZAKAT_ADJUSTMENT',
  'TAX_WITHHOLDING',
  'DEDUCTION',
] as const;

export type ConsultantRevenueEntryType =
  (typeof consultantRevenueEntryTypeValues)[number];

export const consultantRevenueEntryStatusValues = [
  'PENDING',
  'POSTED',
  'HELD',
  'DISPUTED',
  'ADJUSTED',
  'REVERSED',
  'SETTLED',
  'CANCELLED',
] as const;

export type ConsultantRevenueEntryStatus =
  (typeof consultantRevenueEntryStatusValues)[number];

export const consultantParticipantRoleValues = [
  'PRIMARY_CONSULTANT',
  'SECONDARY_CONSULTANT',
  'ASSISTING_CONSULTANT',
  'SURGEON',
  'ASSISTANT_SURGEON',
  'ANESTHETIST',
  'REFERRING_CONSULTANT',
  'REPORTING_CONSULTANT',
  'PERFORMING_CONSULTANT',
  'SUPERVISING_CONSULTANT',
  'CONSULTANT_GROUP',
  'CUSTOM',
] as const;

export type ConsultantParticipantRole =
  (typeof consultantParticipantRoleValues)[number];

export const consultantParticipantAllocationMethodValues = [
  'PERCENTAGE',
  'FIXED',
  'RESIDUAL',
] as const;

export type ConsultantParticipantAllocationMethod =
  (typeof consultantParticipantAllocationMethodValues)[number];

export const consultantResponsibilityTreatmentValues = [
  'INCLUDE',
  'EXCLUDE',
] as const;

export type ConsultantResponsibilityTreatment =
  (typeof consultantResponsibilityTreatmentValues)[number];

export const consultantDiscountTreatmentValues = [
  'DEDUCT_FROM_ELIGIBLE',
  'SHARE_ON_GROSS',
] as const;

export type ConsultantDiscountTreatment =
  (typeof consultantDiscountTreatmentValues)[number];

export const consultantSettlementPeriodTypeValues = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
] as const;

export type ConsultantSettlementPeriodType =
  (typeof consultantSettlementPeriodTypeValues)[number];

export const consultantSettlementStatusValues = [
  'DRAFT',
  'CALCULATED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_PAID',
  'PAID',
  'DISPUTED',
  'CANCELLED',
  'REVERSED',
  'CLOSED',
] as const;

export type ConsultantSettlementStatus =
  (typeof consultantSettlementStatusValues)[number];

export const consultantDisputeStatusValues = [
  'OPEN',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'RESOLVED',
  'CANCELLED',
] as const;

export type ConsultantDisputeStatus =
  (typeof consultantDisputeStatusValues)[number];

export const consultantWorkQueueStatusValues = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_INTERNAL',
  'WAITING_ON_CONSULTANT',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
] as const;

export type ConsultantWorkQueueStatus =
  (typeof consultantWorkQueueStatusValues)[number];

export const consultantPatientTypeValues = [
  'CASH',
  'CORPORATE_PANEL',
  'GOVERNMENT_PROGRAM',
  'INSURANCE',
  'WELFARE',
  'ZAKAT',
  'PACKAGE',
  'OTHER',
] as const;

export type ConsultantPatientType =
  (typeof consultantPatientTypeValues)[number];

export const consultantEncounterTypeValues = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
  'DAY_CASE',
  'SURGERY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'OTHER',
] as const;

export type ConsultantEncounterType =
  (typeof consultantEncounterTypeValues)[number];

export const consultantServiceCategoryValues = [
  'REGISTRATION',
  'CONSULTATION',
  'ENCOUNTER',
  'ADMISSION',
  'BED',
  'ROOM',
  'ICU',
  'PROCEDURE',
  'SURGERY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'PACKAGE',
  'MISCELLANEOUS',
] as const;

export type ConsultantServiceCategory =
  (typeof consultantServiceCategoryValues)[number];

export const consultantSortFieldValues = [
  'agreementNumber',
  'agreementName',
  'effectiveFrom',
  'effectiveThrough',
  'consultantShare',
  'eligibleRevenue',
  'settlementNumber',
  'periodFrom',
  'periodThrough',
  'createdAt',
  'updatedAt',
] as const;

export type ConsultantSortField =
  (typeof consultantSortFieldValues)[number];

export const CONSULTANT_SHARING_PERMISSION_KEYS = {
  READ: 'consultants.read',
  READ_SENSITIVE: 'consultants.read_sensitive',
  AGREEMENT_CREATE: 'consultants.agreements.create',
  AGREEMENT_UPDATE: 'consultants.agreements.update',
  AGREEMENT_SUBMIT: 'consultants.agreements.submit',
  AGREEMENT_REVIEW: 'consultants.agreements.review',
  AGREEMENT_APPROVE: 'consultants.agreements.approve',
  AGREEMENT_ACTIVATE: 'consultants.agreements.activate',
  AGREEMENT_SUSPEND: 'consultants.agreements.suspend',
  AGREEMENT_TERMINATE: 'consultants.agreements.terminate',
  AGREEMENT_REOPEN: 'consultants.agreements.reopen',
  AGREEMENT_AMEND: 'consultants.agreements.amend',
  REVENUE_READ: 'consultants.revenue.read',
  REVENUE_HOLD: 'consultants.revenue.hold',
  REVENUE_RELEASE: 'consultants.revenue.release',
  CALCULATE: 'consultants.revenue.calculate',
  RECALCULATE: 'consultants.revenue.recalculate',
  MANUAL_ENTRY_REQUEST: 'consultants.revenue.manual.request',
  MANUAL_ENTRY_APPROVE: 'consultants.revenue.manual.approve',
  ADJUSTMENT_REQUEST: 'consultants.adjustments.request',
  ADJUSTMENT_APPROVE: 'consultants.adjustments.approve',
  REVERSAL_REQUEST: 'consultants.reversals.request',
  REVERSAL_APPROVE: 'consultants.reversals.approve',
  SETTLEMENT_READ: 'consultants.settlements.read',
  SETTLEMENT_CREATE: 'consultants.settlements.create',
  SETTLEMENT_REVIEW: 'consultants.settlements.review',
  SETTLEMENT_CALCULATE: 'consultants.settlements.calculate',
  SETTLEMENT_SUBMIT: 'consultants.settlements.submit',
  SETTLEMENT_APPROVE: 'consultants.settlements.approve',
  SETTLEMENT_CANCEL: 'consultants.settlements.cancel',
  SETTLEMENT_REVERSE: 'consultants.settlements.reverse',
  PAYOUT_REQUEST: 'consultants.payouts.request',
  PAYOUT_APPROVE: 'consultants.payouts.approve',
  PAYOUT_REVERSE: 'consultants.payouts.reverse',
  DISPUTE_CREATE: 'consultants.disputes.create',
  DISPUTE_REVIEW: 'consultants.disputes.review',
  DISPUTE_RESOLVE: 'consultants.disputes.resolve',
  ASSIGN: 'consultants.assign',
  ESCALATE: 'consultants.escalate',
  RECONCILE: 'consultants.reconcile',
  RECOVERY_MANAGE: 'consultants.recovery.manage',
  REPORT_READ: 'consultants.reports.read',
  REPORT_EXPORT: 'consultants.reports.export',
} as const;

export type ConsultantSharingPermissionKey =
  (typeof CONSULTANT_SHARING_PERMISSION_KEYS)[keyof typeof CONSULTANT_SHARING_PERMISSION_KEYS];

export type ConsultantSharingAccessAction =
  keyof typeof CONSULTANT_SHARING_PERMISSION_KEYS;

export const CONSULTANT_SHARING_OPERATIONAL_ROLE_KEYS = [
  'BILLING_OFFICER',
  'FINANCE_MANAGER',
  'HOSPITAL_ADMINISTRATOR',
  'SYSTEM_ADMINISTRATOR',
  'DEPARTMENT_MANAGER',
  'AUDITOR',
  'CONSULTANT',
] as const;

export const CONSULTANT_AGREEMENT_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<ConsultantAgreementStatus, readonly ConsultantAgreementStatus[]>
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ACTIVE', 'DRAFT', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'TERMINATED', 'SUPERSEDED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED', 'EXPIRED'],
  EXPIRED: ['REOPENED'],
  TERMINATED: [],
  CANCELLED: ['REOPENED'],
  SUPERSEDED: [],
  REOPENED: ['DRAFT', 'SUBMITTED', 'CANCELLED'],
};

export const CONSULTANT_SETTLEMENT_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<ConsultantSettlementStatus, readonly ConsultantSettlementStatus[]>
> = {
  DRAFT: ['CALCULATED', 'CANCELLED'],
  CALCULATED: ['SUBMITTED', 'DRAFT', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CALCULATED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'CALCULATED', 'DISPUTED', 'CANCELLED'],
  APPROVED: ['PARTIALLY_PAID', 'PAID', 'DISPUTED', 'REVERSED'],
  PARTIALLY_PAID: ['PAID', 'DISPUTED', 'REVERSED'],
  PAID: ['CLOSED', 'REVERSED'],
  DISPUTED: ['UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  CANCELLED: ['REVERSED'],
  REVERSED: [],
  CLOSED: [],
};

export const CONSULTANT_DISPUTE_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<ConsultantDisputeStatus, readonly ConsultantDisputeStatus[]>
> = {
  OPEN: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: [
    'INFORMATION_REQUESTED',
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'CANCELLED',
  ],
  INFORMATION_REQUESTED: ['UNDER_REVIEW', 'CANCELLED'],
  APPROVED: ['RESOLVED'],
  PARTIALLY_APPROVED: ['RESOLVED'],
  REJECTED: ['RESOLVED'],
  RESOLVED: [],
  CANCELLED: [],
};

export const CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS: ReadonlySet<
  ConsultantSharingAccessAction
> = new Set([
  'AGREEMENT_APPROVE',
  'AGREEMENT_ACTIVATE',
  'AGREEMENT_SUSPEND',
  'AGREEMENT_TERMINATE',
  'MANUAL_ENTRY_APPROVE',
  'ADJUSTMENT_APPROVE',
  'REVERSAL_APPROVE',
  'SETTLEMENT_APPROVE',
  'SETTLEMENT_CANCEL',
  'SETTLEMENT_REVERSE',
  'PAYOUT_APPROVE',
  'PAYOUT_REVERSE',
  'DISPUTE_RESOLVE',
]);

export const CONSULTANT_SHARING_SAFE_REALTIME_FIELDS = [
  'agreementId',
  'ruleId',
  'revenueEntryId',
  'settlementId',
  'disputeId',
  'status',
  'previousStatus',
  'version',
  'eventAt',
] as const;

export const CONSULTANT_AGREEMENT_NUMBER_SEQUENCE_KEY =
  'CONSULTANT_AGREEMENT_NUMBER';
export const CONSULTANT_SETTLEMENT_NUMBER_SEQUENCE_KEY =
  'CONSULTANT_SETTLEMENT_NUMBER';
export const CONSULTANT_DISPUTE_NUMBER_SEQUENCE_KEY =
  'CONSULTANT_DISPUTE_NUMBER';

export const CONSULTANT_SHARING_CURRENCY: ConsultantSharingCurrency = 'PKR';
export const CONSULTANT_SHARING_MONEY_SCALE = 2;
export const CONSULTANT_SHARING_PERCENTAGE_SCALE = 6;
export const CONSULTANT_SHARING_RATE_SCALE = 8;
export const CONSULTANT_SHARING_MAX_PAGE_SIZE = 200;
export const CONSULTANT_SHARING_MAX_RULES = 1_000;
export const CONSULTANT_SHARING_MAX_TIERS = 100;
export const CONSULTANT_SHARING_MAX_PARTICIPANTS = 50;
export const CONSULTANT_SHARING_MAX_ATTACHMENTS = 100;

export function isConsultantAgreementStatusTransitionAllowed(
  from: ConsultantAgreementStatus,
  to: ConsultantAgreementStatus,
): boolean {
  return CONSULTANT_AGREEMENT_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function isConsultantSettlementStatusTransitionAllowed(
  from: ConsultantSettlementStatus,
  to: ConsultantSettlementStatus,
): boolean {
  return CONSULTANT_SETTLEMENT_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function isConsultantDisputeStatusTransitionAllowed(
  from: ConsultantDisputeStatus,
  to: ConsultantDisputeStatus,
): boolean {
  return CONSULTANT_DISPUTE_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}