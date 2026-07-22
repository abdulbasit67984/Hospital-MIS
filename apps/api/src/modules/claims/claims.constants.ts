export type ClaimObjectIdString = string;
export type ClaimCurrency = 'PKR';
export type ClaimSortDirection = 'asc' | 'desc';

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

export type ClaimBatchStatus = (typeof claimBatchStatusValues)[number];

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

export type ClaimDiagnosisType = (typeof claimDiagnosisTypeValues)[number];

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

export type ClaimLineStatus = (typeof claimLineStatusValues)[number];

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

export type ClaimAppealStatus = (typeof claimAppealStatusValues)[number];

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

export const claimSortFieldValues = [
  'claimNumber',
  'serviceFrom',
  'submittedAt',
  'followUpAt',
  'outstandingAmount',
  'createdAt',
  'updatedAt',
] as const;

export type ClaimSortField = (typeof claimSortFieldValues)[number];

export const claimAgingBucketValues = [
  'CURRENT',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_91_120',
  'DAYS_121_180',
  'DAYS_181_PLUS',
] as const;

export type ClaimAgingBucket = (typeof claimAgingBucketValues)[number];

export const CLAIM_PERMISSION_KEYS = {
  READ: 'claims.read',
  READ_SENSITIVE: 'claims.read_sensitive',
  PREPARE: 'claims.prepare',
  UPDATE: 'claims.update',
  VALIDATE: 'claims.validate',
  MARK_READY: 'claims.mark_ready',
  BATCH_MANAGE: 'claims.batches.manage',
  SUBMISSION_REQUEST: 'claims.submission.request',
  SUBMISSION_APPROVE: 'claims.submission.approve',
  SUBMIT: 'claims.submit',
  STATUS_MANAGE: 'claims.status_manage',
  ACKNOWLEDGEMENT_RECORD: 'claims.acknowledgements.record',
  ADJUDICATION_RECORD: 'claims.adjudications.record',
  REMITTANCE_IMPORT: 'claims.remittances.import',
  PAYMENT_RECORD: 'claims.payment_record',
  PAYMENT_MATCH: 'claims.payments.match',
  ADJUSTMENT_REQUEST: 'claims.adjustments.request',
  ADJUSTMENT_APPROVE: 'claims.adjustments.approve',
  WRITE_OFF_REQUEST: 'claims.write_off.request',
  WRITE_OFF_APPROVE: 'claims.write_off.approve',
  DENIAL_MANAGE: 'claims.denials.manage',
  APPEAL_PREPARE: 'claims.appeals.prepare',
  APPEAL_APPROVE: 'claims.appeals.approve',
  APPEAL_SUBMIT: 'claims.appeals.submit',
  ASSIGN: 'claims.assign',
  ESCALATE: 'claims.escalate',
  CANCEL_REQUEST: 'claims.cancel.request',
  CANCEL_APPROVE: 'claims.cancel.approve',
  REVERSE_REQUEST: 'claims.reverse.request',
  REVERSE_APPROVE: 'claims.reverse.approve',
  VOID_REQUEST: 'claims.void.request',
  VOID_APPROVE: 'claims.void.approve',
  RECOVER: 'claims.recovery.manage',
  REPORT_READ: 'claims.reports.read',
  REPORT_EXPORT: 'claims.reports.export',
} as const;

export type ClaimPermissionKey =
  (typeof CLAIM_PERMISSION_KEYS)[keyof typeof CLAIM_PERMISSION_KEYS];

export type ClaimAccessAction = keyof typeof CLAIM_PERMISSION_KEYS;

export const CLAIM_OPERATIONAL_ROLE_KEYS = [
  'CLAIMS_OFFICER',
  'BILLING_OFFICER',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
  'DEPARTMENT_MANAGER',
  'AUDITOR',
] as const;

export const CLAIM_TERMINAL_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  'CLOSED',
  'CANCELLED',
  'REVERSED',
  'VOIDED',
]);

export const CLAIM_MUTABLE_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  'DRAFT',
  'RETURNED',
  'REJECTED',
]);

export const CLAIM_ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<ClaimStatus, readonly ClaimStatus[]>
> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['DRAFT', 'SUBMISSION_PENDING', 'CANCELLED'],
  SUBMISSION_PENDING: ['READY', 'SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACKNOWLEDGED', 'REJECTED', 'RETURNED', 'UNDER_REVIEW'],
  ACKNOWLEDGED: ['UNDER_REVIEW', 'REJECTED', 'RETURNED'],
  UNDER_REVIEW: [
    'APPROVED',
    'PARTIALLY_APPROVED',
    'DENIED',
    'REJECTED',
    'RETURNED',
  ],
  APPROVED: ['PAID', 'CLOSED', 'REVERSED'],
  PARTIALLY_APPROVED: ['APPROVED', 'PAID', 'CLOSED', 'REVERSED'],
  DENIED: [
    'RESUBMITTED',
    'PARTIALLY_APPROVED',
    'APPROVED',
    'CLOSED',
    'REVERSED',
  ],
  REJECTED: ['DRAFT', 'RESUBMITTED', 'CANCELLED'],
  RETURNED: ['DRAFT', 'RESUBMITTED', 'CANCELLED'],
  RESUBMITTED: ['ACKNOWLEDGED', 'UNDER_REVIEW', 'REJECTED', 'RETURNED'],
  PAID: ['CLOSED', 'REVERSED'],
  CLOSED: [],
  CANCELLED: ['REVERSED'],
  REVERSED: [],
  VOIDED: [],
};

export const CLAIM_SENSITIVE_APPROVAL_ACTIONS: ReadonlySet<ClaimAccessAction> =
  new Set([
    'SUBMISSION_APPROVE',
    'ADJUSTMENT_APPROVE',
    'WRITE_OFF_APPROVE',
    'APPEAL_APPROVE',
    'CANCEL_APPROVE',
    'REVERSE_APPROVE',
    'VOID_APPROVE',
  ]);

export const CLAIM_NUMBER_SEQUENCE_KEY = 'CLAIM_NUMBER';
export const CLAIM_BATCH_NUMBER_SEQUENCE_KEY = 'CLAIM_BATCH_NUMBER';
export const CLAIM_APPEAL_NUMBER_SEQUENCE_KEY = 'CLAIM_APPEAL_NUMBER';
export const CLAIM_REMITTANCE_NUMBER_SEQUENCE_KEY = 'CLAIM_REMITTANCE_NUMBER';

export const CLAIM_CURRENCY: ClaimCurrency = 'PKR';
export const CLAIM_MONEY_SCALE = 2;
export const CLAIM_PERCENTAGE_SCALE = 4;
export const CLAIM_MAX_LINES = 2_000;
export const CLAIM_MAX_DIAGNOSES = 50;
export const CLAIM_MAX_ATTACHMENTS = 100;
export const CLAIM_MAX_BATCH_SIZE = 5_000;
export const CLAIM_MAX_ADJUDICATION_LINES = 5_000;
export const CLAIM_MAX_REMITTANCE_LINES = 10_000;
export const CLAIM_MAX_APPEAL_EVIDENCE = 100;
export const CLAIM_MAX_PAGE_SIZE = 200;
export const CLAIM_DEFAULT_PAGE_SIZE = 25;

export const CLAIM_SAFE_REALTIME_FIELDS = [
  'claimId',
  'claimBatchId',
  'status',
  'previousStatus',
  'version',
  'eventAt',
] as const;

export function isClaimStatusTransitionAllowed(
  from: ClaimStatus,
  to: ClaimStatus,
): boolean {
  return CLAIM_ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}