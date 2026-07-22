import type {
  ClaimAccessAction,
  ClaimAdjudicationDecision,
  ClaimAgingBucket,
  ClaimAppealStatus,
  ClaimAttachmentPurpose,
  ClaimBatchStatus,
  ClaimCurrency,
  ClaimDenialCategory,
  ClaimDiagnosisType,
  ClaimLineStatus,
  ClaimObjectIdString,
  ClaimPayerType,
  ClaimPermissionKey,
  ClaimReadinessIssueSeverity,
  ClaimServiceCategory,
  ClaimSortDirection,
  ClaimSortField,
  ClaimStatus,
  ClaimSubmissionChannel,
  ClaimSubmissionStatus,
  ClaimVersionType,
  ClaimWorkQueueStatus,
  ClaimWorkQueueType,
} from './claims.constants.js';

export interface ClaimsActorContext {
  userId: ClaimObjectIdString;
  staffId: ClaimObjectIdString | null;
  facilityId: ClaimObjectIdString;
  correlationId: string;
  permissionKeys: ReadonlySet<string>;
  roleKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface ClaimsAccessRequest {
  actor: ClaimsActorContext;
  action: ClaimAccessAction;
  resourceFacilityId?: ClaimObjectIdString;
  makerUserId?: ClaimObjectIdString | null;
  assigneeUserId?: ClaimObjectIdString | null;
  sensitiveFinancialAction?: boolean;
}

export interface ClaimsAccessDecision {
  allowed: boolean;
  requiredPermission: ClaimPermissionKey;
  accessMode: 'FULL' | 'ASSIGNED' | 'READ_ONLY' | 'DENIED';
  requiresIndependentApproval: boolean;
  auditSensitiveRead: boolean;
  minimumNecessaryFields: readonly string[];
  denialReason?: string;
}

export interface ClaimsPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type ClaimsReportName =
  | 'claim-register'
  | 'claim-status'
  | 'claim-aging'
  | 'denials'
  | 'appeals'
  | 'payer-performance'
  | 'outstanding-sponsor-balances'
  | 'remittance-reconciliation';

export interface ClaimsReportQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  payerOrganizationId?: ClaimObjectIdString;
  panelPlanId?: ClaimObjectIdString;
  departmentId?: ClaimObjectIdString;
  status?: readonly ClaimStatus[];
  agingBucket?: readonly ClaimAgingBucket[];
  denialCategory?: readonly ClaimDenialCategory[];
  appealStatus?: readonly ClaimAppealStatus[];
}

export interface ClaimsReportPage {
  report: ClaimsReportName;
  items: readonly Readonly<Record<string, unknown>>[];
  page: number;
  pageSize: number;
  total: number;
  generatedAt: string;
}

export interface ClaimsRecoveryRunInput {
  limit: number;
  staleAfterMinutes: number;
}

export interface ClaimsListQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  payerOrganizationId?: ClaimObjectIdString;
  panelPlanId?: ClaimObjectIdString;
  patientId?: ClaimObjectIdString;
  patientCoverageId?: ClaimObjectIdString;
  invoiceId?: ClaimObjectIdString;
  claimBatchId?: ClaimObjectIdString;
  status?: readonly ClaimStatus[];
  payerType?: readonly ClaimPayerType[];
  serviceCategory?: readonly ClaimServiceCategory[];
  agingBucket?: readonly ClaimAgingBucket[];
  assignedToUserId?: ClaimObjectIdString;
  workQueueType?: readonly ClaimWorkQueueType[];
  followUpDueBefore?: string;
  includeClosed?: boolean;
  search?: string;
  sortBy?: ClaimSortField;
  sortDirection?: ClaimSortDirection;
}

export interface ClaimDiagnosisInput {
  diagnosisId?: ClaimObjectIdString | null;
  codeSystem: string;
  code: string;
  description: string;
  diagnosisType: ClaimDiagnosisType;
  sequence: number;
  presentOnAdmission?: boolean | null;
}

export interface ClaimLineCodingInput {
  serviceCodeSystem: string;
  serviceCode: string;
  revenueCode?: string | null;
  modifiers?: readonly string[];
  units?: string | null;
}

export interface ClaimLineSelectionInput {
  invoiceLineId: ClaimObjectIdString;
  coverageAllocationId?: ClaimObjectIdString | null;
  serviceFrom?: string | null;
  serviceThrough?: string | null;
  providerId?: ClaimObjectIdString | null;
  departmentId?: ClaimObjectIdString | null;
  serviceCategory?: ClaimServiceCategory | null;
  codingOverride?: ClaimLineCodingInput | null;
  diagnosisSequences?: readonly number[];
  medicalNecessityNote?: string | null;
  internalNote?: string | null;
}

export interface ClaimAttachmentInput {
  attachmentId: ClaimObjectIdString;
  purpose: ClaimAttachmentPurpose;
  lineInvoiceId?: ClaimObjectIdString | null;
  description?: string | null;
}

export interface CreateClaimInput {
  invoiceId: ClaimObjectIdString;
  coverageDeterminationId: ClaimObjectIdString;
  payerOrganizationId: ClaimObjectIdString;
  panelPlanId: ClaimObjectIdString;
  patientCoverageId: ClaimObjectIdString;
  claimVersionType: ClaimVersionType;
  originalClaimId?: ClaimObjectIdString | null;
  preauthorizationIds?: readonly ClaimObjectIdString[];
  diagnoses: readonly ClaimDiagnosisInput[];
  lines: readonly ClaimLineSelectionInput[];
  attachments?: readonly ClaimAttachmentInput[];
  internalNote?: string | null;
  payerNote?: string | null;
  medicalNecessitySummary?: string | null;
  filingDeadline?: string | null;
}

export interface UpdateDraftClaimInput {
  expectedVersion: number;
  diagnoses?: readonly ClaimDiagnosisInput[];
  lines?: readonly ClaimLineSelectionInput[];
  attachments?: readonly ClaimAttachmentInput[];
  preauthorizationIds?: readonly ClaimObjectIdString[];
  internalNote?: string | null;
  payerNote?: string | null;
  medicalNecessitySummary?: string | null;
  filingDeadline?: string | null;
  reason: string;
}

export interface ValidateClaimInput {
  expectedVersion: number;
  asOf?: string;
}

export interface MarkClaimReadyInput {
  expectedVersion: number;
  validationSnapshotId: ClaimObjectIdString;
  reason: string;
}

export interface CreateClaimBatchInput {
  payerOrganizationId: ClaimObjectIdString;
  panelPlanId?: ClaimObjectIdString | null;
  submissionChannel: ClaimSubmissionChannel;
  destinationReference?: string | null;
  clearinghouseReference?: string | null;
  claimIds: readonly ClaimObjectIdString[];
  notes?: string | null;
}

export interface ApproveClaimBatchInput {
  expectedVersion: number;
  approvalRequestId: ClaimObjectIdString;
  reason: string;
}

export interface SubmitClaimBatchInput {
  expectedVersion: number;
  approvalRequestId: ClaimObjectIdString;
  idempotencyKey: string;
  submittedAt?: string;
}

export interface RecordSubmissionAcknowledgementInput {
  expectedVersion: number;
  acknowledgementReference: string;
  payerReferenceNumber?: string | null;
  clearinghouseReference?: string | null;
  acknowledgedAt: string;
  accepted: boolean;
  rejectionCode?: string | null;
  rejectionReason?: string | null;
  rawAttachmentId?: ClaimObjectIdString | null;
}

export interface ClaimAdjudicationLineInput {
  claimLineId: ClaimObjectIdString;
  decision: ClaimAdjudicationDecision;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount?: string;
  payerLineReference?: string | null;
  denialCategory?: ClaimDenialCategory | null;
  reasonCode?: string | null;
  reasonDescription?: string | null;
}

export interface RecordClaimAdjudicationInput {
  expectedVersion: number;
  payerReferenceNumber: string;
  adjudicatedAt: string;
  decisionReference?: string | null;
  explanationOfBenefitsAttachmentId?: ClaimObjectIdString | null;
  lines: readonly ClaimAdjudicationLineInput[];
  notes?: string | null;
}

export interface RemittanceAllocationInput {
  claimId: ClaimObjectIdString;
  claimLineId?: ClaimObjectIdString | null;
  paidAmount: string;
  contractualAdjustmentAmount: string;
  disallowedAmount: string;
  withholdingAmount?: string;
  payerClaimReference?: string | null;
  payerLineReference?: string | null;
}

export interface ImportRemittanceInput {
  payerOrganizationId: ClaimObjectIdString;
  remittanceReference: string;
  remittanceDate: string;
  paymentId?: ClaimObjectIdString | null;
  sponsorPaymentReference?: string | null;
  totalPaymentAmount: string;
  currency?: ClaimCurrency;
  attachmentId?: ClaimObjectIdString | null;
  allocations: readonly RemittanceAllocationInput[];
}

export interface PostClaimPaymentInput {
  expectedVersion: number;
  remittanceId: ClaimObjectIdString;
  sponsorPaymentId: ClaimObjectIdString;
  allocations: readonly Readonly<{
    claimLineId?: ClaimObjectIdString | null;
    amount: string;
  }>[];
  unappliedAmount: string;
  reason: string;
}

export interface RequestClaimAdjustmentInput {
  expectedVersion: number;
  claimLineId?: ClaimObjectIdString | null;
  adjustmentType:
    | 'CONTRACTUAL'
    | 'DISALLOWED'
    | 'PAYER_WITHHOLDING'
    | 'ROUNDING'
    | 'DEBIT_NOTE'
    | 'CREDIT_NOTE'
    | 'REFUND'
    | 'REPAYMENT';
  amount: string;
  reason: string;
  supportingAttachmentIds?: readonly ClaimObjectIdString[];
}

export interface RequestClaimWriteOffInput {
  expectedVersion: number;
  claimLineId?: ClaimObjectIdString | null;
  amount: string;
  reason: string;
  approvalRequestId: ClaimObjectIdString;
}

export interface CreateClaimAppealInput {
  expectedVersion: number;
  denialIds: readonly ClaimObjectIdString[];
  appealDeadline: string;
  grounds: string;
  requestedAmount: string;
  evidenceAttachmentIds: readonly ClaimObjectIdString[];
}

export interface ApproveClaimAppealInput {
  expectedVersion: number;
  approvalRequestId: ClaimObjectIdString;
  decisionReason: string;
}

export interface SubmitClaimAppealInput {
  expectedVersion: number;
  approvalRequestId: ClaimObjectIdString;
  submissionChannel: ClaimSubmissionChannel;
  submissionReference: string;
  submittedAt: string;
}

export interface RecordClaimAppealDecisionInput {
  expectedVersion: number;
  decision:
    | 'UPHELD'
    | 'OVERTURNED'
    | 'PARTIALLY_OVERTURNED';
  decidedAt: string;
  approvedAdditionalAmount: string;
  payerDecisionReference?: string | null;
  attachmentId?: ClaimObjectIdString | null;
  reason: string;
}

export interface AssignClaimWorkItemInput {
  expectedVersion: number;
  assignedToUserId: ClaimObjectIdString;
  followUpAt?: string | null;
  priority?: number;
  reason: string;
}

export interface EscalateClaimWorkItemInput {
  expectedVersion: number;
  escalatedToUserId?: ClaimObjectIdString | null;
  followUpAt: string;
  reason: string;
}

export interface SensitiveClaimActionInput {
  expectedVersion: number;
  approvalRequestId: ClaimObjectIdString;
  reason: string;
}

export interface ClaimReadinessIssueView {
  code: string;
  severity: ClaimReadinessIssueSeverity;
  scope: 'CLAIM' | 'LINE' | 'ATTACHMENT' | 'DIAGNOSIS';
  claimLineId: ClaimObjectIdString | null;
  field: string | null;
  message: string;
}

export interface ClaimLineFinancialView {
  grossAmount: string;
  packageAmount: string;
  deductibleAmount: string;
  copaymentAmount: string;
  coinsuranceAmount: string;
  excludedAmount: string;
  patientOtherAmount: string;
  patientResponsibilityAmount: string;
  claimedAmount: string;
  approvedAmount: string;
  deniedAmount: string;
  disallowedAmount: string;
  returnedAmount: string;
  contractualAdjustmentAmount: string;
  writeOffAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface ClaimLineView {
  id: ClaimObjectIdString;
  claimId: ClaimObjectIdString;
  lineNumber: number;
  invoiceLineId: ClaimObjectIdString;
  chargeCatalogItemId: ClaimObjectIdString;
  sourceModule: string;
  sourceRecordId: ClaimObjectIdString | null;
  serviceCategory: ClaimServiceCategory;
  serviceFrom: string;
  serviceThrough: string | null;
  serviceCodeSystem: string;
  serviceCode: string;
  revenueCode: string | null;
  modifiers: readonly string[];
  providerId: ClaimObjectIdString | null;
  departmentId: ClaimObjectIdString | null;
  status: ClaimLineStatus;
  financials: ClaimLineFinancialView;
  version: number;
}

export interface ClaimFinancialSummaryView extends ClaimLineFinancialView {
  currency: ClaimCurrency;
}

export interface ClaimView {
  id: ClaimObjectIdString;
  facilityId: ClaimObjectIdString;
  claimNumber: string;
  claimVersionNumber: number;
  claimVersionType: ClaimVersionType;
  originalClaimId: ClaimObjectIdString | null;
  patientId: ClaimObjectIdString;
  invoiceId: ClaimObjectIdString;
  coverageDeterminationId: ClaimObjectIdString;
  payerOrganizationId: ClaimObjectIdString;
  payerType: ClaimPayerType;
  panelPlanId: ClaimObjectIdString;
  patientCoverageId: ClaimObjectIdString;
  policyReferenceMasked: string | null;
  membershipReferenceMasked: string | null;
  status: ClaimStatus;
  serviceFrom: string;
  serviceThrough: string;
  filingDeadline: string | null;
  payerReferenceNumber: string | null;
  assignedToUserId: ClaimObjectIdString | null;
  followUpAt: string | null;
  financials: ClaimFinancialSummaryView;
  lines: readonly ClaimLineView[];
  readinessIssues: readonly ClaimReadinessIssueView[];
  submittedAt: string | null;
  adjudicatedAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimBatchView {
  id: ClaimObjectIdString;
  facilityId: ClaimObjectIdString;
  batchNumber: string;
  payerOrganizationId: ClaimObjectIdString;
  panelPlanId: ClaimObjectIdString | null;
  submissionChannel: ClaimSubmissionChannel;
  status: ClaimBatchStatus;
  claimCount: number;
  claimedAmount: string;
  approvedAmount: string;
  paidAmount: string;
  submissionStatus: ClaimSubmissionStatus | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimAppealView {
  id: ClaimObjectIdString;
  claimId: ClaimObjectIdString;
  appealNumber: string;
  status: ClaimAppealStatus;
  appealDeadline: string;
  requestedAmount: string;
  approvedAdditionalAmount: string;
  assignedToUserId: ClaimObjectIdString | null;
  submittedAt: string | null;
  decidedAt: string | null;
  version: number;
}

export interface ClaimWorkItemView {
  id: ClaimObjectIdString;
  claimId: ClaimObjectIdString;
  workQueueType: ClaimWorkQueueType;
  status: ClaimWorkQueueStatus;
  assignedToUserId: ClaimObjectIdString | null;
  priority: number;
  followUpAt: string | null;
  escalatedAt: string | null;
  version: number;
}