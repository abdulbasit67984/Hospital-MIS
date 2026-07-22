export const claimStatusValues = [
  'DRAFT',
  'READY',
  'SUBMISSION_PENDING',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'REJECTED',
  'RETURNED',
  'RESUBMITTED',
  'PAID',
  'CLOSED',
  'CANCELLED',
  'REVERSED',
  'VOIDED',
] as const;

export type ClaimStatus = (typeof claimStatusValues)[number];

export const claimVersionTypeValues = [
  'ORIGINAL',
  'CORRECTED',
  'REPLACEMENT',
] as const;

export type ClaimVersionType = (typeof claimVersionTypeValues)[number];

export const claimPayerTypeValues = [
  'INSURANCE',
  'EMPLOYER',
  'GOVERNMENT',
  'CHARITY',
  'CORPORATE_PANEL',
  'OTHER_SPONSOR',
] as const;

export type ClaimPayerType = (typeof claimPayerTypeValues)[number];

export const claimSubmissionChannelValues = [
  'ELECTRONIC_DIRECT',
  'CLEARINGHOUSE',
  'PAYER_PORTAL',
  'EMAIL',
  'COURIER',
  'MANUAL_HAND_DELIVERY',
] as const;

export type ClaimSubmissionChannel =
  (typeof claimSubmissionChannelValues)[number];

export const claimBatchStatusValues = [
  'DRAFT',
  'READY',
  'APPROVAL_PENDING',
  'APPROVED',
  'SUBMISSION_PENDING',
  'SUBMITTED',
  'PARTIALLY_ACKNOWLEDGED',
  'ACKNOWLEDGED',
  'PARTIALLY_REJECTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
  'REVERSED',
] as const;

export type ClaimBatchStatus =
  (typeof claimBatchStatusValues)[number];

export const claimSubmissionStatusValues = [
  'QUEUED',
  'PROCESSING',
  'SENT',
  'ACKNOWLEDGED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'DEAD_LETTER',
  'CANCELLED',
] as const;

export type ClaimSubmissionStatus =
  (typeof claimSubmissionStatusValues)[number];

export const claimDiagnosisTypeValues = [
  'PRIMARY',
  'SECONDARY',
  'ADMITTING',
  'DISCHARGE',
  'EXTERNAL_CAUSE',
] as const;

export type ClaimDiagnosisType =
  (typeof claimDiagnosisTypeValues)[number];

export const claimServiceCategoryValues = [
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

export type ClaimServiceCategory =
  (typeof claimServiceCategoryValues)[number];

export const claimLineStatusValues = [
  'DRAFT',
  'READY',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'REJECTED',
  'RETURNED',
  'PAID',
  'CLOSED',
  'CANCELLED',
  'REVERSED',
] as const;

export type ClaimLineStatus =
  (typeof claimLineStatusValues)[number];

export const claimAdjudicationDecisionValues = [
  'APPROVED',
  'PARTIALLY_APPROVED',
  'DENIED',
  'REJECTED',
  'RETURNED',
] as const;

export type ClaimAdjudicationDecision =
  (typeof claimAdjudicationDecisionValues)[number];

export const claimAdjustmentTypeValues = [
  'CONTRACTUAL',
  'DISALLOWED',
  'PAYER_WITHHOLDING',
  'ROUNDING',
  'WRITE_OFF',
  'DEBIT_NOTE',
  'CREDIT_NOTE',
  'REFUND',
  'REPAYMENT',
] as const;

export type ClaimAdjustmentType =
  (typeof claimAdjustmentTypeValues)[number];

export const claimAdjustmentStatusValues = [
  'REQUESTED',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'REVERSED',
] as const;

export type ClaimAdjustmentStatus =
  (typeof claimAdjustmentStatusValues)[number];

export const claimDenialCategoryValues = [
  'ELIGIBILITY',
  'COVERAGE_EXCLUSION',
  'PREAUTHORIZATION',
  'MEDICAL_NECESSITY',
  'CODING',
  'DUPLICATE',
  'TIMELY_FILING',
  'DOCUMENTATION',
  'PROVIDER',
  'CONTRACTUAL',
  'PATIENT_INFORMATION',
  'PAYER_PROCESSING',
  'OTHER',
] as const;

export type ClaimDenialCategory =
  (typeof claimDenialCategoryValues)[number];

export const claimAppealStatusValues = [
  'DRAFT',
  'EVIDENCE_PENDING',
  'APPROVAL_PENDING',
  'APPROVED_FOR_SUBMISSION',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'UPHELD',
  'OVERTURNED',
  'PARTIALLY_OVERTURNED',
  'WITHDRAWN',
  'CLOSED',
  'CANCELLED',
] as const;

export type ClaimAppealStatus =
  (typeof claimAppealStatusValues)[number];

export const claimWorkQueueStatusValues = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_PAYER',
  'WAITING_ON_INTERNAL',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
] as const;

export type ClaimWorkQueueStatus =
  (typeof claimWorkQueueStatusValues)[number];

export const claimWorkQueueTypeValues = [
  'PREPARATION',
  'COMPLETENESS',
  'SCRUBBING',
  'SUBMISSION',
  'ACKNOWLEDGEMENT',
  'FOLLOW_UP',
  'DENIAL',
  'APPEAL',
  'REMITTANCE',
  'PAYMENT_MATCHING',
  'RECONCILIATION',
  'RECOVERY',
] as const;

export type ClaimWorkQueueType =
  (typeof claimWorkQueueTypeValues)[number];

export const claimAttachmentPurposeValues = [
  'CLAIM_FORM',
  'INVOICE',
  'MEDICAL_RECORD',
  'PRESCRIPTION',
  'LAB_RESULT',
  'RADIOLOGY_REPORT',
  'PROCEDURE_NOTE',
  'DISCHARGE_SUMMARY',
  'PREAUTHORIZATION',
  'ELIGIBILITY_PROOF',
  'MEMBERSHIP_PROOF',
  'MEDICAL_NECESSITY',
  'APPEAL_EVIDENCE',
  'REMITTANCE_ADVICE',
  'EXPLANATION_OF_BENEFITS',
  'OTHER',
] as const;

export type ClaimAttachmentPurpose =
  (typeof claimAttachmentPurposeValues)[number];

export const claimReadinessIssueSeverityValues = [
  'ERROR',
  'WARNING',
  'INFORMATION',
] as const;

export type ClaimReadinessIssueSeverity =
  (typeof claimReadinessIssueSeverityValues)[number];

export const claimReadinessIssueScopeValues = [
  'CLAIM',
  'LINE',
  'ATTACHMENT',
  'DIAGNOSIS',
] as const;

export type ClaimReadinessIssueScope =
  (typeof claimReadinessIssueScopeValues)[number];

export const claimAgingBucketValues = [
  'CURRENT',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_91_120',
  'DAYS_121_180',
  'DAYS_181_PLUS',
] as const;

export type ClaimAgingBucket =
  (typeof claimAgingBucketValues)[number];

export const claimCurrencyValues = ['PKR'] as const;

export type ClaimCurrency =
  (typeof claimCurrencyValues)[number];