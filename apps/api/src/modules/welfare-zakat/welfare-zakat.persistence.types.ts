import type {
  ClientSession,
  Types,
} from 'mongoose';

import type {
  AssistanceAllocationStatus,
  AssistanceApplicationStatus,
  AssistanceApplicationType,
  AssistanceApprovalStatus,
  AssistanceAttachmentPurpose,
  AssistanceFundRestriction,
  AssistanceFundStatus,
  AssistanceFundType,
  AssistanceLimitScope,
  AssistancePeriodType,
  AssistanceReservationStatus,
  AssistanceReviewType,
  AssistanceReversalStatus,
  AssistanceServiceCategory,
  AssistanceWorkQueueStatus,
  AssistanceWorkQueueType,
  EligibilityOutcome,
  EligibilityRuleEffect,
  EligibilityRuleOperator,
  FundTransactionDirection,
  FundTransactionType,
  WelfareZakatCurrency,
} from './welfare-zakat.constants.js';

export type WelfareZakatMongoSession = ClientSession;

export interface WelfareZakatPersistenceMetadata {
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

export interface FundEligibilityRuleRecord {
  _id: Types.ObjectId;
  ruleCode: string;
  description: string;
  field: string;
  operator: EligibilityRuleOperator;
  effect: EligibilityRuleEffect;
  value: string | number | boolean | null;
  values: readonly (string | number | boolean | null)[];
  minimum: string | null;
  maximum: string | null;
  priority: number;
  active: boolean;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface AssistanceLimitRecord {
  _id: Types.ObjectId;
  scope: AssistanceLimitScope;
  amount: Types.Decimal128;
  periodType: AssistancePeriodType;
  rollingDays: number | null;
  serviceCategory: AssistanceServiceCategory | null;
  serviceCode: string | null;
  appliesPerPatient: boolean;
}

export interface AssistanceFundRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  fundCode: string;
  name: string;
  description: string | null;
  fundType: AssistanceFundType;
  categoryCode: string;
  restriction: AssistanceFundRestriction;
  fundingSourceReferenceHash: string | null;
  fundingSourceReferenceMasked: string | null;
  donorReferenceHash: string | null;
  donorReferenceMasked: string | null;
  donationReferenceHash: string | null;
  grantReferenceHash: string | null;
  restrictionNarrativeEncrypted: string | null;
  effectiveFrom: Date;
  effectiveThrough: Date | null;
  status: AssistanceFundStatus;
  currency: WelfareZakatCurrency;
  openingBalance: Types.Decimal128;
  inflowAmount: Types.Decimal128;
  transferInAmount: Types.Decimal128;
  transferOutAmount: Types.Decimal128;
  adjustmentIncreaseAmount: Types.Decimal128;
  adjustmentDecreaseAmount: Types.Decimal128;
  ledgerBalance: Types.Decimal128;
  reservedBalance: Types.Decimal128;
  committedBalance: Types.Decimal128;
  availableBalance: Types.Decimal128;
  utilizedBalance: Types.Decimal128;
  reversedBalance: Types.Decimal128;
  refundAmount: Types.Decimal128;
  repaymentAmount: Types.Decimal128;
  recoveryAmount: Types.Decimal128;
  writeOffAmount: Types.Decimal128;
  defaultEligibilityOutcome: EligibilityOutcome;
  eligibilityRules: readonly FundEligibilityRuleRecord[];
  allowedDepartmentIds: readonly Types.ObjectId[];
  excludedDepartmentIds: readonly Types.ObjectId[];
  allowedServiceCategories: readonly AssistanceServiceCategory[];
  excludedServiceCategories: readonly AssistanceServiceCategory[];
  allowedServiceCodes: readonly string[];
  excludedServiceCodes: readonly string[];
  allowedPatientCategoryCodes: readonly string[];
  excludedPatientCategoryCodes: readonly string[];
  allowedDiagnosisCodes: readonly string[];
  excludedDiagnosisCodes: readonly string[];
  limits: readonly AssistanceLimitRecord[];
  requiresZakatDeclaration: boolean;
  requiresSocialWelfareReview: boolean;
  requiresClinicalReview: boolean;
  approvalMatrixCode: string;
  facilitySpecific: boolean;
  activationApprovalRequestId: Types.ObjectId | null;
  activatedAt: Date | null;
  activatedBy: Types.ObjectId | null;
  suspendedAt: Date | null;
  suspendedBy: Types.ObjectId | null;
  suspensionReason: string | null;
  closedAt: Date | null;
  closedBy: Types.ObjectId | null;
  closureReason: string | null;
}

export interface FundTransactionRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  transactionNumber: string;
  fundId: Types.ObjectId;
  transactionType: FundTransactionType;
  direction: FundTransactionDirection;
  amount: Types.Decimal128;
  currency: WelfareZakatCurrency;
  balanceBefore: Types.Decimal128;
  balanceAfter: Types.Decimal128;
  applicationId: Types.ObjectId | null;
  approvalId: Types.ObjectId | null;
  reservationId: Types.ObjectId | null;
  allocationId: Types.ObjectId | null;
  transferId: Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  invoiceLineId: Types.ObjectId | null;
  paymentId: Types.ObjectId | null;
  refundId: Types.ObjectId | null;
  creditNoteId: Types.ObjectId | null;
  debitNoteId: Types.ObjectId | null;
  claimId: Types.ObjectId | null;
  claimAdjustmentId: Types.ObjectId | null;
  donorReferenceHash: string | null;
  donorReferenceMasked: string | null;
  donationReferenceHash: string | null;
  receiptReferenceHash: string | null;
  receiptReferenceMasked: string | null;
  fundingSourceReferenceHash: string | null;
  reason: string;
  attachmentIds: readonly Types.ObjectId[];
  actorUserId: Types.ObjectId;
  makerUserId: Types.ObjectId | null;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  occurredAt: Date;
  immutableHash: string;
  reversalOfTransactionId: Types.ObjectId | null;
  reversedByTransactionId: Types.ObjectId | null;
}

export interface AssistanceApplicationAttachmentRecord {
  _id: Types.ObjectId;
  attachmentId: Types.ObjectId;
  purpose: AssistanceAttachmentPurpose;
  description: string | null;
  immutableSnapshotHash: string;
}

export interface AssistanceApplicationRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  duplicateKey: string;
  applicationNumber: string;
  applicationType: AssistanceApplicationType;
  patientId: Types.ObjectId;
  guardianId: Types.ObjectId | null;
  encounterId: Types.ObjectId | null;
  admissionId: Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  claimId: Types.ObjectId | null;
  preferredFundId: Types.ObjectId | null;
  status: AssistanceApplicationStatus;
  applicantSnapshotEncrypted: string;
  householdSnapshotEncrypted: string;
  employmentSnapshotEncrypted: string;
  financialConditionSnapshotEncrypted: string;
  zakatDeclarationSnapshotEncrypted: string | null;
  questionnaireSnapshotEncrypted: string;
  requestedServicesSnapshotEncrypted: string | null;
  notesEncrypted: string | null;
  attachments: readonly AssistanceApplicationAttachmentRecord[];
  householdSize: number;
  dependantCount: number;
  monthlyHouseholdIncome: Types.Decimal128;
  monthlyHouseholdExpenses: Types.Decimal128;
  monthlyDisposableIncome: Types.Decimal128;
  perCapitaIncome: Types.Decimal128;
  requestedAmount: Types.Decimal128 | null;
  recommendedAmount: Types.Decimal128 | null;
  approvedAmount: Types.Decimal128;
  reservedAmount: Types.Decimal128;
  committedAmount: Types.Decimal128;
  utilizedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
  releasedAmount: Types.Decimal128;
  remainingApprovedAmount: Types.Decimal128;
  completenessSatisfied: boolean;
  missingItems: readonly string[];
  eligibilityOutcome: EligibilityOutcome | null;
  eligibilitySnapshotId: Types.ObjectId | null;
  financialYearCode: string;
  assignedToUserId: Types.ObjectId | null;
  assignedBy: Types.ObjectId | null;
  followUpAt: Date | null;
  reviewDeadlineAt: Date | null;
  approvalDeadlineAt: Date | null;
  submittedAt: Date | null;
  submittedBy: Types.ObjectId | null;
  expiresAt: Date | null;
  closedAt: Date | null;
  closedBy: Types.ObjectId | null;
  closureReason: string | null;
  reopenedAt: Date | null;
  reopenedBy: Types.ObjectId | null;
  reopenReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
}

export interface AssistanceApplicationHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  applicationId: Types.ObjectId;
  fromStatus: AssistanceApplicationStatus | null;
  toStatus: AssistanceApplicationStatus;
  applicationVersion: number;
  snapshot: Readonly<Record<string, unknown>>;
  snapshotHash: string;
  reason: string;
  actorUserId: Types.ObjectId;
  makerUserId: Types.ObjectId | null;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  occurredAt: Date;
  immutableHash: string;
}

export interface AssistanceReviewRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  applicationId: Types.ObjectId;
  reviewType: AssistanceReviewType;
  reviewSequence: number;
  outcome: EligibilityOutcome;
  assessmentEncrypted: string;
  findingsEncrypted: string;
  recommendedFundId: Types.ObjectId | null;
  recommendedAmount: Types.Decimal128 | null;
  attachmentIds: readonly Types.ObjectId[];
  reviewerUserId: Types.ObjectId;
  reviewerStaffId: Types.ObjectId | null;
  transactionId: string;
  correlationId: string;
  reviewedAt: Date;
  immutableHash: string;
}

export interface EligibilityEvaluationSnapshotRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  applicationId: Types.ObjectId;
  fundId: Types.ObjectId;
  applicationVersion: number;
  fundVersion: number;
  outcome: EligibilityOutcome;
  eligible: boolean;
  manualReviewRequired: boolean;
  matchedRuleCodes: readonly string[];
  failedRuleCodes: readonly string[];
  reasons: readonly string[];
  contextHash: string;
  evaluatedBy: Types.ObjectId;
  evaluatedAt: Date;
  transactionId: string;
  correlationId: string;
  immutableHash: string;
}

export interface AssistanceApprovalRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  approvalNumber: string;
  applicationId: Types.ObjectId;
  fundId: Types.ObjectId;
  status: AssistanceApprovalStatus;
  requestedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  reservedAmount: Types.Decimal128;
  committedAmount: Types.Decimal128;
  utilizedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
  releasedAmount: Types.Decimal128;
  remainingAmount: Types.Decimal128;
  approvedFrom: Date;
  approvedThrough: Date | null;
  approvedServiceCategories: readonly AssistanceServiceCategory[];
  approvedServiceCodes: readonly string[];
  approvedInvoiceLineIds: readonly Types.ObjectId[];
  conditionsEncrypted: string | null;
  notesEncrypted: string | null;
  approvalMatrixCode: string;
  approvalRequestId: Types.ObjectId;
  makerUserId: Types.ObjectId;
  checkerUserIds: readonly Types.ObjectId[];
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  rejectionReason: string | null;
  expiresAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface AssistanceApprovalHistoryRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  approvalId: Types.ObjectId;
  fromStatus: AssistanceApprovalStatus | null;
  toStatus: AssistanceApprovalStatus;
  requestedAmount: Types.Decimal128;
  approvedAmount: Types.Decimal128;
  remainingAmount: Types.Decimal128;
  makerUserId: Types.ObjectId;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId;
  reason: string;
  transactionId: string;
  correlationId: string;
  occurredAt: Date;
  immutableHash: string;
}

export interface AssistanceReservationRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  applicationId: Types.ObjectId;
  approvalId: Types.ObjectId;
  fundId: Types.ObjectId;
  patientId: Types.ObjectId;
  patientAccountId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  status: AssistanceReservationStatus;
  reservedAmount: Types.Decimal128;
  consumedAmount: Types.Decimal128;
  releasedAmount: Types.Decimal128;
  remainingAmount: Types.Decimal128;
  priority: number;
  expiresAt: Date;
  reservedAt: Date;
  reservedBy: Types.ObjectId;
  releasedAt: Date | null;
  releasedBy: Types.ObjectId | null;
  releaseReason: string | null;
}

export interface AssistanceAllocationLineRecord {
  _id: Types.ObjectId;
  invoiceLineId: Types.ObjectId;
  amount: Types.Decimal128;
  utilizedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
  refundedAmount: Types.Decimal128;
  repaidAmount: Types.Decimal128;
  recoveredAmount: Types.Decimal128;
  remainingAmount: Types.Decimal128;
  reason: string;
  supportingAttachmentIds: readonly Types.ObjectId[];
}

export interface AssistanceAllocationRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  duplicateKey: string;
  allocationNumber: string;
  fundId: Types.ObjectId;
  patientId: Types.ObjectId;
  applicationId: Types.ObjectId;
  approvalId: Types.ObjectId;
  reservationId: Types.ObjectId | null;
  patientAccountId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  claimId: Types.ObjectId | null;
  status: AssistanceAllocationStatus;
  currency: WelfareZakatCurrency;
  amount: Types.Decimal128;
  utilizedAmount: Types.Decimal128;
  reversedAmount: Types.Decimal128;
  refundedAmount: Types.Decimal128;
  repaidAmount: Types.Decimal128;
  recoveredAmount: Types.Decimal128;
  releasedAmount: Types.Decimal128;
  remainingAmount: Types.Decimal128;
  priority: number;
  reason: string;
  supportingAttachmentIds: readonly Types.ObjectId[];
  lines: readonly AssistanceAllocationLineRecord[];
  allocatedBy: Types.ObjectId;
  approvedBy: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId | null;
  allocatedAt: Date;
  confirmedAt: Date | null;
  utilizedAt: Date | null;
  expiresAt: Date | null;
  reversalStatus: AssistanceReversalStatus | null;
}

export interface FundAllocationReversalRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  allocationId: Types.ObjectId;
  invoiceLineId: Types.ObjectId | null;
  amount: Types.Decimal128;
  status: AssistanceReversalStatus;
  reason: string;
  supportingAttachmentIds: readonly Types.ObjectId[];
  makerUserId: Types.ObjectId;
  checkerUserId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId;
  transactionId: string;
  correlationId: string;
  requestedAt: Date;
  postedAt: Date | null;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface FundReturnRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  operationKey: string;
  returnType: 'REFUND' | 'REPAYMENT' | 'RECOVERY';
  allocationId: Types.ObjectId;
  fundId: Types.ObjectId;
  amount: Types.Decimal128;
  paymentId: Types.ObjectId | null;
  refundId: Types.ObjectId | null;
  creditNoteId: Types.ObjectId | null;
  debitNoteId: Types.ObjectId | null;
  claimAdjustmentId: Types.ObjectId | null;
  approvalRequestId: Types.ObjectId;
  makerUserId: Types.ObjectId;
  checkerUserId: Types.ObjectId | null;
  reason: string;
  attachmentIds: readonly Types.ObjectId[];
  transactionId: string;
  correlationId: string;
  postedAt: Date;
  immutableHash: string;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface FundTransferRecord extends WelfareZakatPersistenceMetadata {
  operationKey: string;
  transferNumber: string;
  sourceFundId: Types.ObjectId;
  destinationFundId: Types.ObjectId;
  amount: Types.Decimal128;
  currency: WelfareZakatCurrency;
  status: 'REQUESTED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'CANCELLED' | 'REVERSED';
  approvalRequestId: Types.ObjectId;
  makerUserId: Types.ObjectId;
  checkerUserId: Types.ObjectId | null;
  sourceTransactionId: Types.ObjectId | null;
  destinationTransactionId: Types.ObjectId | null;
  reason: string;
  attachmentIds: readonly Types.ObjectId[];
  postedAt: Date | null;
  reversedAt: Date | null;
  reversedBy: Types.ObjectId | null;
  reversalReason: string | null;
}

export interface AssistanceWorkItemRecord extends WelfareZakatPersistenceMetadata {
  applicationId: Types.ObjectId;
  approvalId: Types.ObjectId | null;
  allocationId: Types.ObjectId | null;
  workQueueType: AssistanceWorkQueueType;
  status: AssistanceWorkQueueStatus;
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