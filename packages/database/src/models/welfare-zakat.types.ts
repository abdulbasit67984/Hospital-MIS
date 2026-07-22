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
export type AssistanceFundStatus = (typeof assistanceFundStatusValues)[number];

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
export type FundTransactionType = (typeof fundTransactionTypeValues)[number];

export const fundTransactionDirectionValues = [
  'CREDIT',
  'DEBIT',
  'MEMO',
] as const;
export type FundTransactionDirection =
  (typeof fundTransactionDirectionValues)[number];

export const assistanceApplicationTypeValues = [
  'WELFARE',
  'ZAKAT',
  'GENERAL_ASSISTANCE',
] as const;
export type AssistanceApplicationType =
  (typeof assistanceApplicationTypeValues)[number];

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

export const assistanceReviewTypeValues = [
  'ELIGIBILITY',
  'FINANCIAL',
  'CLINICAL',
  'SOCIAL_WELFARE',
] as const;
export type AssistanceReviewType = (typeof assistanceReviewTypeValues)[number];

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

export const fundTransferStatusValues = [
  'REQUESTED',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
] as const;
export type FundTransferStatus = (typeof fundTransferStatusValues)[number];

export const fundReturnTypeValues = [
  'REFUND',
  'REPAYMENT',
  'RECOVERY',
] as const;
export type FundReturnType = (typeof fundReturnTypeValues)[number];

export const welfareZakatCurrencyValues = ['PKR'] as const;
export type WelfareZakatCurrency =
  (typeof welfareZakatCurrencyValues)[number];