export type WelfareZakatObjectIdString = string;
export type WelfareZakatCurrency = 'PKR';
export type WelfareZakatSortDirection = 'asc' | 'desc';

export const assistanceFundTypeValues = [
  'WELFARE',
  'ZAKAT',
  'CHARITY',
  'DONOR_PROGRAM',
] as const;

export type AssistanceFundType = (typeof assistanceFundTypeValues)[number];

export const assistanceFundRestrictionValues = [
  'UNRESTRICTED',
  'RESTRICTED',
] as const;

export type AssistanceFundRestriction =
  (typeof assistanceFundRestrictionValues)[number];

export const assistanceFundStatusValues = [
  'DRAFT',
  'APPROVAL_PENDING',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type AssistanceFundStatus =
  (typeof assistanceFundStatusValues)[number];

export const fundTransactionTypeValues = [
  'OPENING_BALANCE',
  'DONATION',
  'GRANT',
  'OTHER_INFLOW',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_INCREASE',
  'ADJUSTMENT_DECREASE',
  'RESERVATION',
  'RESERVATION_RELEASE',
  'ALLOCATION_COMMITMENT',
  'ALLOCATION_RELEASE',
  'UTILIZATION',
  'UTILIZATION_REVERSAL',
  'REFUND_TO_FUND',
  'REPAYMENT_TO_FUND',
  'RECOVERY_TO_FUND',
  'WRITE_OFF',
] as const;

export type FundTransactionType =
  (typeof fundTransactionTypeValues)[number];

export const fundTransactionDirectionValues = [
  'CREDIT',
  'DEBIT',
  'MEMO',
] as const;

export type FundTransactionDirection =
  (typeof fundTransactionDirectionValues)[number];

export const assistanceApplicationStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'ELIGIBLE',
  'INELIGIBLE',
  'APPROVAL_PENDING',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'CLOSED',
  'REOPENED',
] as const;

export type AssistanceApplicationStatus =
  (typeof assistanceApplicationStatusValues)[number];

export const assistanceApplicationTypeValues = [
  'WELFARE',
  'ZAKAT',
  'GENERAL_ASSISTANCE',
] as const;

export type AssistanceApplicationType =
  (typeof assistanceApplicationTypeValues)[number];

export const assistanceReviewTypeValues = [
  'ELIGIBILITY',
  'FINANCIAL',
  'CLINICAL',
  'SOCIAL_WELFARE',
] as const;

export type AssistanceReviewType =
  (typeof assistanceReviewTypeValues)[number];

export const eligibilityOutcomeValues = [
  'ELIGIBLE',
  'INELIGIBLE',
  'MANUAL_REVIEW',
] as const;

export type EligibilityOutcome = (typeof eligibilityOutcomeValues)[number];

export const eligibilityRuleOperatorValues = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'BETWEEN',
  'EXISTS',
  'NOT_EXISTS',
  'CONTAINS_ANY',
  'CONTAINS_ALL',
] as const;

export type EligibilityRuleOperator =
  (typeof eligibilityRuleOperatorValues)[number];

export const eligibilityRuleEffectValues = [
  'ALLOW',
  'DENY',
  'REQUIRE_REVIEW',
] as const;

export type EligibilityRuleEffect =
  (typeof eligibilityRuleEffectValues)[number];

export const assistanceApprovalStatusValues = [
  'DRAFT',
  'PENDING',
  'PARTIALLY_APPROVED',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'REVERSED',
] as const;

export type AssistanceApprovalStatus =
  (typeof assistanceApprovalStatusValues)[number];

export const assistanceReservationStatusValues = [
  'ACTIVE',
  'PARTIALLY_CONSUMED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
  'REVERSED',
] as const;

export type AssistanceReservationStatus =
  (typeof assistanceReservationStatusValues)[number];

export const assistanceAllocationStatusValues = [
  'DRAFT',
  'RESERVED',
  'APPROVAL_PENDING',
  'CONFIRMED',
  'PARTIALLY_UTILIZED',
  'UTILIZED',
  'PARTIALLY_REVERSED',
  'REVERSED',
  'CANCELLED',
  'EXPIRED',
  'RECOVERY_PENDING',
  'RECOVERED',
] as const;

export type AssistanceAllocationStatus =
  (typeof assistanceAllocationStatusValues)[number];

export const assistanceReversalStatusValues = [
  'REQUESTED',
  'APPROVAL_PENDING',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
] as const;

export type AssistanceReversalStatus =
  (typeof assistanceReversalStatusValues)[number];

export const assistanceWorkQueueTypeValues = [
  'APPLICATION_COMPLETENESS',
  'ELIGIBILITY_REVIEW',
  'FINANCIAL_REVIEW',
  'CLINICAL_REVIEW',
  'SOCIAL_WELFARE_REVIEW',
  'INFORMATION_FOLLOW_UP',
  'APPROVAL',
  'ALLOCATION',
  'RECONCILIATION',
  'RECOVERY',
  'EXPIRY',
] as const;

export type AssistanceWorkQueueType =
  (typeof assistanceWorkQueueTypeValues)[number];

export const assistanceWorkQueueStatusValues = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_APPLICANT',
  'WAITING_ON_INTERNAL',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
] as const;

export type AssistanceWorkQueueStatus =
  (typeof assistanceWorkQueueStatusValues)[number];

export const assistanceAttachmentPurposeValues = [
  'IDENTITY_EVIDENCE',
  'GUARDIAN_EVIDENCE',
  'INCOME_EVIDENCE',
  'EMPLOYMENT_EVIDENCE',
  'HOUSEHOLD_EVIDENCE',
  'ZAKAT_DECLARATION',
  'SOCIAL_WELFARE_ASSESSMENT',
  'MEDICAL_NECESSITY',
  'PRESCRIPTION',
  'LAB_RESULT',
  'RADIOLOGY_REPORT',
  'ESTIMATE',
  'INVOICE',
  'CLAIM_DOCUMENT',
  'DONATION_RECEIPT',
  'GRANT_DOCUMENT',
  'TRANSFER_APPROVAL',
  'ALLOCATION_SUPPORT',
  'REVERSAL_SUPPORT',
  'REFUND_SUPPORT',
  'REPAYMENT_SUPPORT',
  'OTHER',
] as const;

export type AssistanceAttachmentPurpose =
  (typeof assistanceAttachmentPurposeValues)[number];

export const assistanceServiceCategoryValues = [
  'REGISTRATION',
  'CONSULTATION',
  'ENCOUNTER',
  'ADMISSION',
  'BED',
  'PROCEDURE',
  'SURGERY',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'PACKAGE',
  'MISCELLANEOUS',
] as const;

export type AssistanceServiceCategory =
  (typeof assistanceServiceCategoryValues)[number];

export const assistancePeriodTypeValues = [
  'CALENDAR_MONTH',
  'CALENDAR_YEAR',
  'FINANCIAL_YEAR',
  'ROLLING_DAYS',
  'LIFETIME',
] as const;

export type AssistancePeriodType =
  (typeof assistancePeriodTypeValues)[number];

export const assistanceLimitScopeValues = [
  'PATIENT',
  'APPLICATION',
  'APPROVAL',
  'INVOICE',
  'INVOICE_LINE',
  'SERVICE',
  'FUND',
] as const;

export type AssistanceLimitScope =
  (typeof assistanceLimitScopeValues)[number];

export const assistanceSortFieldValues = [
  'applicationNumber',
  'fundCode',
  'submittedAt',
  'followUpAt',
  'approvalExpiresAt',
  'availableBalance',
  'createdAt',
  'updatedAt',
] as const;

export type AssistanceSortField =
  (typeof assistanceSortFieldValues)[number];

export const WELFARE_ZAKAT_PERMISSION_KEYS = {
  READ: 'welfare_zakat.read',
  READ_SENSITIVE: 'welfare_zakat.read_sensitive',
  FUND_READ: 'welfare_zakat.funds.read',
  FUND_CREATE: 'welfare_zakat.funds.create',
  FUND_APPROVE: 'welfare_zakat.funds.approve',
  FUND_STATUS_MANAGE: 'welfare_zakat.funds.status_manage',
  FUND_TRANSACTION_RECORD: 'welfare_zakat.fund_transactions.record',
  FUND_TRANSACTION_APPROVE: 'welfare_zakat.fund_transactions.approve',
  FUND_TRANSFER_REQUEST: 'welfare_zakat.transfers.request',
  FUND_TRANSFER_APPROVE: 'welfare_zakat.transfers.approve',
  DONATION_RECORD: 'welfare_zakat.donations.record',
  DONATION_APPROVE: 'welfare_zakat.donations.approve',
  APPLICATION_CREATE: 'welfare_zakat.applications.create',
  APPLICATION_UPDATE: 'welfare_zakat.applications.update',
  APPLICATION_SUBMIT: 'welfare_zakat.applications.submit',
  APPLICATION_REVIEW: 'welfare_zakat.applications.review',
  APPLICATION_REOPEN: 'welfare_zakat.applications.reopen',
  APPLICATION_CANCEL: 'welfare_zakat.applications.cancel',
  ASSIGN: 'welfare_zakat.assign',
  ESCALATE: 'welfare_zakat.escalate',
  ELIGIBILITY_EVALUATE: 'welfare_zakat.eligibility.evaluate',
  APPROVAL_REQUEST: 'welfare_zakat.approvals.request',
  APPROVAL_DECIDE: 'welfare_zakat.approvals.decide',
  APPROVAL_CANCEL: 'welfare_zakat.approvals.cancel',
  APPROVAL_REVERSE: 'welfare_zakat.approvals.reverse',
  RESERVATION_CREATE: 'welfare_zakat.reservations.create',
  RESERVATION_RELEASE: 'welfare_zakat.reservations.release',
  ALLOCATION_CREATE: 'welfare_zakat.allocations.create',
  ALLOCATION_APPROVE: 'welfare_zakat.allocations.approve',
  ALLOCATION_CONFIRM: 'welfare_zakat.allocations.confirm',
  ALLOCATION_REVERSE_REQUEST: 'welfare_zakat.allocations.reverse.request',
  ALLOCATION_REVERSE_APPROVE: 'welfare_zakat.allocations.reverse.approve',
  REFUND_REQUEST: 'welfare_zakat.refunds.request',
  REFUND_APPROVE: 'welfare_zakat.refunds.approve',
  REPAYMENT_REQUEST: 'welfare_zakat.repayments.request',
  REPAYMENT_APPROVE: 'welfare_zakat.repayments.approve',
  RECOVERY_MANAGE: 'welfare_zakat.recovery.manage',
  RECONCILE: 'welfare_zakat.reconcile',
  REPORT_READ: 'welfare_zakat.reports.read',
  REPORT_EXPORT: 'welfare_zakat.reports.export',
} as const;

export type WelfareZakatPermissionKey =
  (typeof WELFARE_ZAKAT_PERMISSION_KEYS)[keyof typeof WELFARE_ZAKAT_PERMISSION_KEYS];

export type WelfareZakatAccessAction = keyof typeof WELFARE_ZAKAT_PERMISSION_KEYS;

export const WELFARE_ZAKAT_OPERATIONAL_ROLE_KEYS = [
  'BILLING_OFFICER',
  'SOCIAL_WELFARE_OFFICER',
  'ZAKAT_OFFICER',
  'FINANCE_MANAGER',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
  'DEPARTMENT_MANAGER',
  'AUDITOR',
] as const;

export const ASSISTANCE_FUND_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<AssistanceFundStatus, readonly AssistanceFundStatus[]>
> = {
  DRAFT: ['APPROVAL_PENDING', 'CANCELLED'],
  APPROVAL_PENDING: ['ACTIVE', 'DRAFT', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'CLOSED', 'EXPIRED'],
  SUSPENDED: ['ACTIVE', 'CLOSED', 'EXPIRED'],
  CLOSED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const ASSISTANCE_APPLICATION_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<AssistanceApplicationStatus, readonly AssistanceApplicationStatus[]>
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'INFORMATION_REQUESTED', 'CANCELLED'],
  UNDER_REVIEW: [
    'INFORMATION_REQUESTED',
    'ELIGIBLE',
    'INELIGIBLE',
    'CANCELLED',
  ],
  INFORMATION_REQUESTED: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
  ELIGIBLE: ['APPROVAL_PENDING', 'EXPIRED', 'CANCELLED'],
  INELIGIBLE: ['REOPENED', 'CLOSED'],
  APPROVAL_PENDING: [
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED',
  ],
  APPROVED: ['CLOSED', 'EXPIRED', 'CANCELLED'],
  PARTIALLY_APPROVED: ['APPROVED', 'CLOSED', 'EXPIRED', 'CANCELLED'],
  REJECTED: ['REOPENED', 'CLOSED'],
  EXPIRED: ['REOPENED', 'CLOSED'],
  CANCELLED: ['REOPENED', 'CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['UNDER_REVIEW', 'INFORMATION_REQUESTED', 'CANCELLED'],
};

export const ASSISTANCE_APPROVAL_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<AssistanceApprovalStatus, readonly AssistanceApprovalStatus[]>
> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  PARTIALLY_APPROVED: ['APPROVED', 'EXPIRED', 'CANCELLED', 'REVERSED'],
  APPROVED: ['EXPIRED', 'CANCELLED', 'REVERSED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  REVERSED: [],
};

export const ASSISTANCE_ALLOCATION_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<AssistanceAllocationStatus, readonly AssistanceAllocationStatus[]>
> = {
  DRAFT: ['RESERVED', 'APPROVAL_PENDING', 'CANCELLED'],
  RESERVED: ['APPROVAL_PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  APPROVAL_PENDING: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['PARTIALLY_UTILIZED', 'UTILIZED', 'CANCELLED', 'EXPIRED'],
  PARTIALLY_UTILIZED: [
    'UTILIZED',
    'PARTIALLY_REVERSED',
    'REVERSED',
    'RECOVERY_PENDING',
  ],
  UTILIZED: ['PARTIALLY_REVERSED', 'REVERSED', 'RECOVERY_PENDING'],
  PARTIALLY_REVERSED: ['REVERSED', 'RECOVERY_PENDING', 'RECOVERED'],
  REVERSED: [],
  CANCELLED: [],
  EXPIRED: [],
  RECOVERY_PENDING: ['RECOVERED', 'PARTIALLY_REVERSED', 'REVERSED'],
  RECOVERED: [],
};

export const WELFARE_ZAKAT_SENSITIVE_APPROVAL_ACTIONS: ReadonlySet<WelfareZakatAccessAction> =
  new Set([
    'FUND_APPROVE',
    'FUND_STATUS_MANAGE',
    'FUND_TRANSACTION_APPROVE',
    'FUND_TRANSFER_APPROVE',
    'DONATION_APPROVE',
    'APPROVAL_DECIDE',
    'APPROVAL_CANCEL',
    'APPROVAL_REVERSE',
    'ALLOCATION_APPROVE',
    'ALLOCATION_REVERSE_APPROVE',
    'REFUND_APPROVE',
    'REPAYMENT_APPROVE',
  ]);

export const WELFARE_ZAKAT_CURRENCY: WelfareZakatCurrency = 'PKR';
export const WELFARE_ZAKAT_MONEY_SCALE = 2;
export const WELFARE_ZAKAT_PERCENTAGE_SCALE = 4;
export const WELFARE_ZAKAT_APPLICATION_NUMBER_SEQUENCE_KEY =
  'ASSISTANCE_APPLICATION_NUMBER';
export const WELFARE_ZAKAT_FUND_TRANSACTION_NUMBER_SEQUENCE_KEY =
  'ASSISTANCE_FUND_TRANSACTION_NUMBER';
export const WELFARE_ZAKAT_APPROVAL_NUMBER_SEQUENCE_KEY =
  'ASSISTANCE_APPROVAL_NUMBER';
export const WELFARE_ZAKAT_ALLOCATION_NUMBER_SEQUENCE_KEY =
  'ASSISTANCE_ALLOCATION_NUMBER';
export const WELFARE_ZAKAT_TRANSFER_NUMBER_SEQUENCE_KEY =
  'ASSISTANCE_FUND_TRANSFER_NUMBER';
export const WELFARE_ZAKAT_MAX_ATTACHMENTS = 100;
export const WELFARE_ZAKAT_MAX_DEPENDANTS = 50;
export const WELFARE_ZAKAT_MAX_HOUSEHOLD_MEMBERS = 100;
export const WELFARE_ZAKAT_MAX_ELIGIBILITY_RULES = 250;
export const WELFARE_ZAKAT_MAX_INVOICE_LINES = 2_000;
export const WELFARE_ZAKAT_MAX_PAGE_SIZE = 200;
export const WELFARE_ZAKAT_DEFAULT_PAGE_SIZE = 25;

export const WELFARE_ZAKAT_SAFE_REALTIME_FIELDS = [
  'fundId',
  'applicationId',
  'approvalId',
  'allocationId',
  'status',
  'previousStatus',
  'version',
  'eventAt',
] as const;

export function isAssistanceFundStatusTransitionAllowed(
  from: AssistanceFundStatus,
  to: AssistanceFundStatus,
): boolean {
  return ASSISTANCE_FUND_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function isAssistanceApplicationStatusTransitionAllowed(
  from: AssistanceApplicationStatus,
  to: AssistanceApplicationStatus,
): boolean {
  return ASSISTANCE_APPLICATION_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function isAssistanceApprovalStatusTransitionAllowed(
  from: AssistanceApprovalStatus,
  to: AssistanceApprovalStatus,
): boolean {
  return ASSISTANCE_APPROVAL_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function isAssistanceAllocationStatusTransitionAllowed(
  from: AssistanceAllocationStatus,
  to: AssistanceAllocationStatus,
): boolean {
  return ASSISTANCE_ALLOCATION_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}