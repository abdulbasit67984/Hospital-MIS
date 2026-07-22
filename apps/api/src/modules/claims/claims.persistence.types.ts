import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  ClaimAdjudicationDecision,
  ClaimAgingBucket,
  ClaimAppealStatus,
  ClaimAttachmentPurpose,
  ClaimBatchStatus,
  ClaimCurrency,
  ClaimDenialCategory,
  ClaimDiagnosisType,
  ClaimLineStatus,
  ClaimPayerType,
  ClaimReadinessIssueSeverity,
  ClaimServiceCategory,
  ClaimStatus,
  ClaimSubmissionChannel,
  ClaimSubmissionStatus,
  ClaimVersionType,
  ClaimWorkQueueStatus,
  ClaimWorkQueueType,
} from './claims.constants.js';

export type ClaimsMongoSession = ClientSession;

export interface ClaimsPersistenceMetadata {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimDiagnosisRecord {
  _id: Types.ObjectId;
  diagnosisId: Types.ObjectId | null;
  codeSystem: string;
  code: string;
  description: string;
  diagnosisType: ClaimDiagnosisType;
  sequence: number;
  presentOnAdmission: boolean | null;
}

export interface ClaimReadinessIssueRecord {
  code: string;
  severity: ClaimReadinessIssueSeverity;
  scope: 'CLAIM' | 'LINE' | 'ATTACHMENT' | 'DIAGNOSIS';
  claimLineId: Types.ObjectId | null;
  field: string | null;
  message: string;
}

export interface ClaimRecord extends ClaimsPersistenceMetadata {
  operationKey: string;
  duplicateKey: string;
  claimNumber: string;
  claimVersionNumber: number;
  claimVersionType: ClaimVersionType;
  originalClaimId: Types.ObjectId | null;
  priorClaimVersionId: Types.ObjectId | null;
  patientId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  encounterId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  invoiceId: Types.ObjectId;
  coverageDeterminationId: Types.ObjectId;
  payerOrganizationId: Types.ObjectId;
  payerType: ClaimPayerType;
  panelPlanId: Types.ObjectId;
  patientCoverageId: Types.ObjectId;
  policyReferenceHash: string | null;
  policyReferenceMasked: string | null;
  membershipReferenceHash: string | null;
  membershipReferenceMasked: string | null;
  employerReferenceHash: string | null;
  authorizationReferenceHash: string | null;
  preauthorizationIds: readonly Types.ObjectId[];
  status: ClaimStatus;
  serviceFrom: Date;
  serviceThrough: Date;
  filingDeadline: Date | null;
  currency: ClaimCurrency;
  grossAmount: Types.Decimal128;
  packageAmount: Types.Decimal128;
  deductibleAmount: Types.Decimal128;
  copaymentAmount: Types.Decimal128;
  coinsuranceAmount: Types.Decimal128;
  excludedAmount: Types.Decimal128;
  patientOtherAmount: Types.Decimal128;
  patientResponsibilityAmount: Types.Decimal128;
  claimedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  deniedAmount: Types.Decimal128;
  disallowedAmount: Types.Decimal128;
  returnedAmount: Types.Decimal128;
  contractualAdjustmentAmount: Types.Decimal128;
  writeOffAmount: Types.Decimal128;
  payerWithholdingAmount: Types.Decimal128;
  debitNoteAmount: Types.Decimal128;
  creditNoteAmount: Types.Decimal128;
  refundAmount: Types.Decimal128;
  repaymentAmount: Types.Decimal128;
  paidAmount: Types.Decimal128;
  unappliedPaymentAmount: Types.Decimal128;
  outstandingAmount: Types.Decimal128;
  overpaymentAmount: Types.Decimal128;
  diagnoses: readonly ClaimDiagnosisRecord[];
  readinessSnapshotId: Types.ObjectId | null;
  readinessIssues: readonly ClaimReadinessIssueRecord[];
  readinessCheckedAt: Date | null;
  readinessCheckedBy: Types.ObjectId | null;
  payerReferenceNumber: string | null;
  clearinghouseReference: string | null;
  assignedToUserId: Types.ObjectId | null;
  followUpAt: Date | null;
  agingAnchorAt: Date;
  agingDays: number;
  agingBucket: ClaimAgingBucket;
  internalNoteEncrypted: string | null;
  payerNoteEncrypted: string | null;
  medicalNecessitySummaryEncrypted: string | null;
  submittedAt: Date | null;
  submittedBy: Types.ObjectId | null;
  acknowledgedAt: Date | null;
  adjudicatedAt: Date | null;
  paidAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
  voidedAt: Date | null;
  voidedBy: Types.ObjectId | null;
  voidReason: string | null;
}

export interface ClaimLineRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  duplicateKey: string;
  lineNumber: number;
  invoiceLineId: Types.ObjectId;
  coverageAllocationId: Types.ObjectId | null;
  chargeCatalogItemId: Types.ObjectId;
  sourceModule: string;
  sourceRecordId: Types.ObjectId | null;
  encounterId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  procedureId: Types.ObjectId | null;
  laboratoryOrderId: Types.ObjectId | null;
  radiologyOrderId: Types.ObjectId | null;
  dispensationId: Types.ObjectId | null;
  packageEnrollmentId: Types.ObjectId | null;
  serviceCategory: ClaimServiceCategory;
  serviceFrom: Date;
  serviceThrough: Date | null;
  providerId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  chargeCatalogCode: string;
  serviceCodeSystem: string;
  serviceCode: string;
  revenueCode: string | null;
  modifiers: readonly string[];
  units: Types.Decimal128;
  diagnosisSequences: readonly number[];
  preauthorizationId: Types.ObjectId | null;
  status: ClaimLineStatus;
  grossAmount: Types.Decimal128;
  packageAmount: Types.Decimal128;
  deductibleAmount: Types.Decimal128;
  copaymentAmount: Types.Decimal128;
  coinsuranceAmount: Types.Decimal128;
  excludedAmount: Types.Decimal128;
  patientOtherAmount: Types.Decimal128;
  patientResponsibilityAmount: Types.Decimal128;
  claimedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  deniedAmount: Types.Decimal128;
  disallowedAmount: Types.Decimal128;
  returnedAmount: Types.Decimal128;
  contractualAdjustmentAmount: Types.Decimal128;
  writeOffAmount: Types.Decimal128;
  payerWithholdingAmount: Types.Decimal128;
  paidAmount: Types.Decimal128;
  outstandingAmount: Types.Decimal128;
  medicalNecessityNoteEncrypted: string | null;
  internalNoteEncrypted: string | null;
  payerLineReference: string | null;
  denialCategory: ClaimDenialCategory | null;
  denialReasonCode: string | null;
  denialReasonDescription: string | null;
}

export interface ClaimDocumentRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  attachmentId: Types.ObjectId;
  purpose: ClaimAttachmentPurpose;
  description: string | null;
  required: boolean;
  includedInLatestSubmission: boolean;
  immutableSnapshotHash: string;
}

export interface ClaimValidationSnapshotRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  claimVersion: number;
  checkedAt: Date;
  checkedBy: Types.ObjectId;
  complete: boolean;
  eligible: boolean;
  duplicateFree: boolean;
  scrubbed: boolean;
  submissionReady: boolean;
  authoritativePayloadHash: string;
  issues: readonly ClaimReadinessIssueRecord[];
}

export interface ClaimStatusHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  claimId: Types.ObjectId;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  reason: string | null;
  payerReasonCode: string | null;
  payerReasonDescription: string | null;
  actorUserId: Types.ObjectId;
  makerUserId: Types.ObjectId | null;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  occurredAt: Date;
  immutableHash: string;
}

export interface ClaimVersionHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  claimId: Types.ObjectId;
  claimNumber: string;
  versionNumber: number;
  versionType: ClaimVersionType;
  priorClaimId: Types.ObjectId | null;
  snapshot: Readonly<Record<string, unknown>>;
  snapshotHash: string;
  reason: string;
  actorUserId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  occurredAt: Date;
}

export interface ClaimBatchRecord extends ClaimsPersistenceMetadata {
  operationKey: string;
  batchNumber: string;
  payerOrganizationId: Types.ObjectId;
  panelPlanId: Types.ObjectId | null;
  submissionChannel: ClaimSubmissionChannel;
  destinationReference: string | null;
  clearinghouseReference: string | null;
  status: ClaimBatchStatus;
  claimIds: readonly Types.ObjectId[];
  claimCount: number;
  claimedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  paidAmount: Types.Decimal128;
  submissionStatus: ClaimSubmissionStatus | null;
  approvalRequestId: Types.ObjectId | null;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  submittedBy: Types.ObjectId | null;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  notesEncrypted: string | null;
}

export interface ClaimSubmissionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  claimBatchId: Types.ObjectId;
  submissionAttempt: number;
  submissionChannel: ClaimSubmissionChannel;
  status: ClaimSubmissionStatus;
  outboundPayloadHash: string;
  outboundAttachmentId: Types.ObjectId | null;
  destinationReference: string | null;
  clearinghouseReference: string | null;
  externalSubmissionReference: string | null;
  payerReferenceNumber: string | null;
  acknowledgementReference: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  lastErrorCode: string | null;
  submittedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  createdAt: Date;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
}

export interface ClaimAdjudicationLineRecord {
  _id: Types.ObjectId;
  claimLineId: Types.ObjectId;
  decision: ClaimAdjudicationDecision;
  claimedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  deniedAmount: Types.Decimal128;
  disallowedAmount: Types.Decimal128;
  returnedAmount: Types.Decimal128;
  contractualAdjustmentAmount: Types.Decimal128;
  payerLineReference: string | null;
  denialCategory: ClaimDenialCategory | null;
  reasonCode: string | null;
  reasonDescription: string | null;
}

export interface ClaimAdjudicationRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  claimId: Types.ObjectId;
  adjudicationSequence: number;
  payerReferenceNumber: string;
  decisionReference: string | null;
  claimedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  deniedAmount: Types.Decimal128;
  disallowedAmount: Types.Decimal128;
  returnedAmount: Types.Decimal128;
  contractualAdjustmentAmount: Types.Decimal128;
  lines: readonly ClaimAdjudicationLineRecord[];
  explanationOfBenefitsAttachmentId: Types.ObjectId | null;
  notesEncrypted: string | null;
  recordedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  adjudicatedAt: Date;
  recordedAt: Date;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface ClaimDenialRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  adjudicationId: Types.ObjectId;
  category: ClaimDenialCategory;
  reasonCode: string | null;
  reasonDescription: string;
  deniedAmount: Types.Decimal128;
  appealEligible: boolean;
  appealDeadline: Date | null;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
  resolution: string | null;
  transactionId: string;
  correlationId: string;
  createdAt: Date;
}

export interface ClaimAppealRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  appealNumber: string;
  denialIds: readonly Types.ObjectId[];
  status: ClaimAppealStatus;
  appealDeadline: Date;
  groundsEncrypted: string;
  requestedAmount: Types.Decimal128;
  approvedAdditionalAmount: Types.Decimal128;
  evidenceAttachmentIds: readonly Types.ObjectId[];
  approvalRequestId: Types.ObjectId | null;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  submissionChannel: ClaimSubmissionChannel | null;
  submissionReference: string | null;
  payerDecisionReference: string | null;
  assignedToUserId: Types.ObjectId | null;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  decidedAt: Date | null;
  closedAt: Date | null;
}

export interface ClaimRemittanceAllocationRecord {
  _id: Types.ObjectId;
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  paidAmount: Types.Decimal128;
  contractualAdjustmentAmount: Types.Decimal128;
  disallowedAmount: Types.Decimal128;
  withholdingAmount: Types.Decimal128;
  payerClaimReference: string | null;
  payerLineReference: string | null;
}

export interface ClaimRemittanceRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  remittanceNumber: string;
  payerOrganizationId: Types.ObjectId;
  remittanceReference: string;
  remittanceDate: Date;
  sponsorPaymentId: Types.ObjectId | null;
  sponsorPaymentReference: string | null;
  currency: ClaimCurrency;
  totalPaymentAmount: Types.Decimal128;
  allocatedAmount: Types.Decimal128;
  unappliedAmount: Types.Decimal128;
  attachmentId: Types.ObjectId | null;
  allocations: readonly ClaimRemittanceAllocationRecord[];
  importedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  importedAt: Date;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface ClaimPaymentAllocationRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  remittanceId: Types.ObjectId;
  sponsorPaymentId: Types.ObjectId;
  amount: Types.Decimal128;
  postedBy: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  postedAt: Date;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface ClaimAdjustmentRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  adjustmentType: string;
  amount: Types.Decimal128;
  reason: string;
  makerUserId: Types.ObjectId;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId | null;
  status: 'REQUESTED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'REVERSED';
  requestedAt: Date;
  postedAt: Date | null;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface ClaimWorkItemRecord extends ClaimsPersistenceMetadata {
  claimId: Types.ObjectId;
  claimLineId: Types.ObjectId | null;
  appealId: Types.ObjectId | null;
  workQueueType: ClaimWorkQueueType;
  status: ClaimWorkQueueStatus;
  assignedToUserId: Types.ObjectId | null;
  assignedBy: Types.ObjectId | null;
  priority: number;
  followUpAt: Date | null;
  escalationLevel: number;
  escalatedAt: Date | null;
  escalatedBy: Types.ObjectId | null;
  escalatedToUserId: Types.ObjectId | null;
  reasonEncrypted: string | null;
  resolvedAt: Date | null;
  resolvedBy: Types.ObjectId | null;
}