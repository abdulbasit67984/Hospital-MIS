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
  WelfareZakatSortDirection,
  AssistanceSortField,
  AssistanceWorkQueueStatus,
  AssistanceWorkQueueType,
  EligibilityOutcome,
  EligibilityRuleEffect,
  EligibilityRuleOperator,
  FundTransactionDirection,
  FundTransactionType,
  WelfareZakatAccessAction,
  WelfareZakatCurrency,
  WelfareZakatObjectIdString,
  WelfareZakatPermissionKey,
} from './welfare-zakat.constants.js';

export interface WelfareZakatActorContext {
  userId: WelfareZakatObjectIdString;
  staffId: WelfareZakatObjectIdString | null;
  facilityId: WelfareZakatObjectIdString;
  correlationId: string;
  permissionKeys: ReadonlySet<string>;
  roleKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface WelfareZakatAccessRequest {
  actor: WelfareZakatActorContext;
  action: WelfareZakatAccessAction;
  resourceFacilityId?: WelfareZakatObjectIdString;
  makerUserId?: WelfareZakatObjectIdString | null;
  assigneeUserId?: WelfareZakatObjectIdString | null;
  sensitiveFinancialAction?: boolean;
}

export interface WelfareZakatAccessDecision {
  allowed: boolean;
  requiredPermission: WelfareZakatPermissionKey;
  accessMode: 'FULL' | 'ASSIGNED' | 'READ_ONLY' | 'DENIED';
  requiresIndependentApproval: boolean;
  auditSensitiveRead: boolean;
  minimumNecessaryFields: readonly string[];
  denialReason?: string;
}

export interface WelfareZakatPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type WelfareZakatReportName =
  | 'fund-register'
  | 'fund-balances'
  | 'fund-transactions'
  | 'donations-inflows'
  | 'application-register'
  | 'application-status'
  | 'eligibility'
  | 'approvals'
  | 'allocations'
  | 'utilization'
  | 'remaining-balances'
  | 'reversals'
  | 'patient-assistance'
  | 'department-service-utilization'
  | 'donor-utilization'
  | 'restricted-funds'
  | 'expiring-approvals'
  | 'fund-reconciliation'
  | 'invoice-allocation-reconciliation';

export interface WelfareZakatReportQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  fundId?: WelfareZakatObjectIdString;
  fundType?: readonly AssistanceFundType[];
  fundStatus?: readonly AssistanceFundStatus[];
  applicationStatus?: readonly AssistanceApplicationStatus[];
  approvalStatus?: readonly AssistanceApprovalStatus[];
  allocationStatus?: readonly AssistanceAllocationStatus[];
  patientId?: WelfareZakatObjectIdString;
  departmentId?: WelfareZakatObjectIdString;
  serviceCategory?: readonly AssistanceServiceCategory[];
  donorReference?: string;
  financialYearCode?: string;
}

export interface WelfareZakatReportPage {
  report: WelfareZakatReportName;
  items: readonly Readonly<Record<string, unknown>>[];
  page: number;
  pageSize: number;
  total: number;
  generatedAt: string;
}

export interface WelfareZakatRecoveryRunInput {
  limit: number;
  staleAfterMinutes: number;
}

export interface WelfareZakatListQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  fundId?: WelfareZakatObjectIdString;
  patientId?: WelfareZakatObjectIdString;
  applicationId?: WelfareZakatObjectIdString;
  approvalId?: WelfareZakatObjectIdString;
  invoiceId?: WelfareZakatObjectIdString;
  claimId?: WelfareZakatObjectIdString;
  fundType?: readonly AssistanceFundType[];
  fundStatus?: readonly AssistanceFundStatus[];
  applicationStatus?: readonly AssistanceApplicationStatus[];
  approvalStatus?: readonly AssistanceApprovalStatus[];
  allocationStatus?: readonly AssistanceAllocationStatus[];
  assignedToUserId?: WelfareZakatObjectIdString;
  workQueueType?: readonly AssistanceWorkQueueType[];
  followUpDueBefore?: string;
  expiringBefore?: string;
  includeClosed?: boolean;
  search?: string;
  sortBy?: AssistanceSortField;
  sortDirection?: WelfareZakatSortDirection;
}

export type EligibilityScalar = string | number | boolean | null;

export interface EligibilityRuleInput {
  ruleCode: string;
  description: string;
  field: string;
  operator: EligibilityRuleOperator;
  effect: EligibilityRuleEffect;
  value?: EligibilityScalar;
  values?: readonly EligibilityScalar[];
  minimum?: string;
  maximum?: string;
  priority: number;
  active: boolean;
  failureCode?: string;
  failureMessage?: string;
}

export interface AssistanceLimitInput {
  scope: AssistanceLimitScope;
  amount: string;
  periodType: AssistancePeriodType;
  rollingDays?: number | null;
  serviceCategory?: AssistanceServiceCategory | null;
  serviceCode?: string | null;
  appliesPerPatient: boolean;
}

export interface FundEligibilityPolicyInput {
  defaultOutcome: EligibilityOutcome;
  rules: readonly EligibilityRuleInput[];
  allowedDepartmentIds?: readonly WelfareZakatObjectIdString[];
  excludedDepartmentIds?: readonly WelfareZakatObjectIdString[];
  allowedServiceCategories?: readonly AssistanceServiceCategory[];
  excludedServiceCategories?: readonly AssistanceServiceCategory[];
  allowedServiceCodes?: readonly string[];
  excludedServiceCodes?: readonly string[];
  allowedPatientCategoryCodes?: readonly string[];
  excludedPatientCategoryCodes?: readonly string[];
  allowedDiagnosisCodes?: readonly string[];
  excludedDiagnosisCodes?: readonly string[];
  limits?: readonly AssistanceLimitInput[];
  requiresZakatDeclaration?: boolean;
  requiresSocialWelfareReview?: boolean;
  requiresClinicalReview?: boolean;
}

export interface EligibilityEvaluationContext {
  patientId: WelfareZakatObjectIdString;
  patientCategoryCode: string | null;
  ageYears: number | null;
  guardianPresent: boolean;
  householdSize: number;
  dependants: number;
  monthlyHouseholdIncome: string;
  monthlyHouseholdExpenses: string;
  monthlyDisposableIncome: string;
  perCapitaIncome: string;
  employmentStatus: string | null;
  zakatDeclaredEligible: boolean | null;
  socialWelfareAssessmentCompleted: boolean;
  clinicalReviewCompleted: boolean;
  departmentId: WelfareZakatObjectIdString | null;
  serviceCategory: AssistanceServiceCategory | null;
  serviceCode: string | null;
  diagnosisCodes: readonly string[];
  invoiceAmount: string;
  patientResponsibilityAmount: string;
  currentPeriodUtilization: string;
  lifetimeUtilization: string;
  attributes: Readonly<Record<string, EligibilityScalar | readonly EligibilityScalar[]>>;
}

export interface EligibilityRuleResult {
  ruleCode: string;
  matched: boolean;
  effect: EligibilityRuleEffect;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface EligibilityEvaluationResult {
  outcome: EligibilityOutcome;
  eligible: boolean;
  manualReviewRequired: boolean;
  matchedRuleCodes: readonly string[];
  failedRuleCodes: readonly string[];
  reasons: readonly string[];
  ruleResults: readonly EligibilityRuleResult[];
}

export interface AssistanceFundRestrictionInput {
  restriction: AssistanceFundRestriction;
  fundingSourceReference?: string | null;
  donorReference?: string | null;
  donationReference?: string | null;
  grantReference?: string | null;
  restrictionNarrative?: string | null;
}

export interface CreateAssistanceFundInput {
  fundCode: string;
  name: string;
  description?: string | null;
  fundType: AssistanceFundType;
  categoryCode: string;
  restriction: AssistanceFundRestrictionInput;
  effectiveFrom: string;
  effectiveThrough?: string | null;
  openingBalance: string;
  currency?: WelfareZakatCurrency;
  eligibilityPolicy: FundEligibilityPolicyInput;
  approvalMatrixCode: string;
  facilitySpecific: boolean;
  reason: string;
}

export interface UpdateAssistanceFundInput {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  categoryCode?: string;
  restriction?: AssistanceFundRestrictionInput;
  effectiveFrom?: string;
  effectiveThrough?: string | null;
  eligibilityPolicy?: FundEligibilityPolicyInput;
  approvalMatrixCode?: string;
  reason: string;
}

export interface ChangeAssistanceFundStatusInput {
  expectedVersion: number;
  toStatus: AssistanceFundStatus;
  approvalRequestId?: WelfareZakatObjectIdString | null;
  reason: string;
}

export interface AssistanceAttachmentInput {
  attachmentId: WelfareZakatObjectIdString;
  purpose: AssistanceAttachmentPurpose;
  description?: string | null;
}

export interface RecordFundInflowInput {
  expectedFundVersion: number;
  transactionType: 'DONATION' | 'GRANT' | 'OTHER_INFLOW';
  amount: string;
  receivedAt: string;
  donorReference?: string | null;
  donationReference?: string | null;
  receiptReference?: string | null;
  fundingSourceReference?: string | null;
  restrictionNarrative?: string | null;
  attachmentIds?: readonly WelfareZakatObjectIdString[];
  approvalRequestId?: WelfareZakatObjectIdString | null;
  reason: string;
}

export interface RequestFundTransferInput {
  expectedSourceFundVersion: number;
  expectedDestinationFundVersion: number;
  sourceFundId: WelfareZakatObjectIdString;
  destinationFundId: WelfareZakatObjectIdString;
  amount: string;
  transferAt?: string;
  approvalRequestId: WelfareZakatObjectIdString;
  attachmentIds?: readonly WelfareZakatObjectIdString[];
  reason: string;
}

export interface ApplicantInformationInput {
  applicantRelationshipToPatient: string;
  applicantName: string;
  applicantPhone?: string | null;
  applicantIdentifierReference?: string | null;
  guardianId?: WelfareZakatObjectIdString | null;
}

export interface HouseholdMemberInput {
  relationship: string;
  ageYears?: number | null;
  employed: boolean;
  monthlyIncome: string;
  dependant: boolean;
}

export interface EmploymentInformationInput {
  employmentStatus: string;
  employerName?: string | null;
  occupation?: string | null;
  monthlyIncome: string;
  otherMonthlyIncome: string;
}

export interface FinancialConditionInput {
  monthlyHouseholdIncome: string;
  monthlyHouseholdExpenses: string;
  assetsEstimatedValue: string;
  liabilitiesEstimatedValue: string;
  medicalDebt: string;
  otherFinancialSupport: string;
  narrative?: string | null;
}

export interface ZakatDeclarationInput {
  declarationProvided: boolean;
  declaresEligible: boolean | null;
  declarationDate?: string | null;
  declarationReference?: string | null;
  disqualifyingReason?: string | null;
}

export interface CreateAssistanceApplicationInput {
  applicationType: AssistanceApplicationType;
  patientId: WelfareZakatObjectIdString;
  guardianId?: WelfareZakatObjectIdString | null;
  encounterId?: WelfareZakatObjectIdString | null;
  admissionId?: WelfareZakatObjectIdString | null;
  invoiceId?: WelfareZakatObjectIdString | null;
  claimId?: WelfareZakatObjectIdString | null;
  preferredFundId?: WelfareZakatObjectIdString | null;
  applicant: ApplicantInformationInput;
  householdMembers: readonly HouseholdMemberInput[];
  employment: EmploymentInformationInput;
  financialCondition: FinancialConditionInput;
  zakatDeclaration?: ZakatDeclarationInput | null;
  questionnaireAnswers: Readonly<Record<string, string | number | boolean | null>>;
  requestedAmount?: string | null;
  requestedServices?: readonly Readonly<{
    invoiceLineId?: WelfareZakatObjectIdString | null;
    serviceCategory: AssistanceServiceCategory;
    serviceCode?: string | null;
    requestedAmount?: string | null;
  }>[];
  attachments?: readonly AssistanceAttachmentInput[];
  notes?: string | null;
  financialYearCode: string;
}

export interface UpdateAssistanceApplicationInput {
  expectedVersion: number;
  preferredFundId?: WelfareZakatObjectIdString | null;
  applicant?: ApplicantInformationInput;
  householdMembers?: readonly HouseholdMemberInput[];
  employment?: EmploymentInformationInput;
  financialCondition?: FinancialConditionInput;
  zakatDeclaration?: ZakatDeclarationInput | null;
  questionnaireAnswers?: Readonly<Record<string, string | number | boolean | null>>;
  requestedAmount?: string | null;
  attachments?: readonly AssistanceAttachmentInput[];
  notes?: string | null;
  reason: string;
}

export interface SubmitAssistanceApplicationInput {
  expectedVersion: number;
  completenessAttestation: boolean;
  reason: string;
}

export interface RecordAssistanceReviewInput {
  expectedVersion: number;
  reviewType: AssistanceReviewType;
  outcome: EligibilityOutcome;
  assessment: string;
  findings: readonly string[];
  recommendedFundId?: WelfareZakatObjectIdString | null;
  recommendedAmount?: string | null;
  followUpAt?: string | null;
  attachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface RequestApplicationInformationInput {
  expectedVersion: number;
  requestedItems: readonly string[];
  responseDueAt: string;
  reason: string;
}

export interface AssignAssistanceWorkItemInput {
  expectedVersion: number;
  assignedToUserId: WelfareZakatObjectIdString;
  followUpAt?: string | null;
  reason: string;
}

export interface EscalateAssistanceWorkItemInput {
  expectedVersion: number;
  escalatedToUserId?: WelfareZakatObjectIdString | null;
  escalationLevel: number;
  followUpAt?: string | null;
  reason: string;
}

export interface RequestAssistanceApprovalInput {
  expectedApplicationVersion: number;
  fundId: WelfareZakatObjectIdString;
  requestedAmount: string;
  approvedFrom: string;
  approvedThrough?: string | null;
  approvedServiceCategories?: readonly AssistanceServiceCategory[];
  approvedServiceCodes?: readonly string[];
  approvedInvoiceLineIds?: readonly WelfareZakatObjectIdString[];
  conditions?: readonly string[];
  approvalMatrixCode: string;
  reason: string;
  attachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface DecideAssistanceApprovalInput {
  expectedVersion: number;
  decision: 'APPROVE' | 'PARTIALLY_APPROVE' | 'REJECT';
  approvedAmount?: string | null;
  approvedFrom?: string | null;
  approvedThrough?: string | null;
  approvedServiceCategories?: readonly AssistanceServiceCategory[];
  approvedServiceCodes?: readonly string[];
  approvedInvoiceLineIds?: readonly WelfareZakatObjectIdString[];
  conditions?: readonly string[];
  decisionReason: string;
}

export interface CancelOrReverseAssistanceApprovalInput {
  expectedVersion: number;
  approvalRequestId: WelfareZakatObjectIdString;
  reason: string;
}

export interface AssistanceAllocationLineInput {
  invoiceLineId: WelfareZakatObjectIdString;
  amount: string;
  reason: string;
  supportingAttachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface ReserveAssistanceAllocationInput {
  expectedFundVersion: number;
  expectedApprovalVersion: number;
  applicationId: WelfareZakatObjectIdString;
  approvalId: WelfareZakatObjectIdString;
  fundId: WelfareZakatObjectIdString;
  patientId: WelfareZakatObjectIdString;
  patientAccountId: WelfareZakatObjectIdString;
  invoiceId: WelfareZakatObjectIdString;
  amount: string;
  expiresAt: string;
  priority: number;
  reason: string;
}

export interface CreateAssistanceAllocationInput {
  expectedFundVersion: number;
  expectedApprovalVersion: number;
  applicationId: WelfareZakatObjectIdString;
  approvalId: WelfareZakatObjectIdString;
  reservationId?: WelfareZakatObjectIdString | null;
  fundId: WelfareZakatObjectIdString;
  patientId: WelfareZakatObjectIdString;
  patientAccountId: WelfareZakatObjectIdString;
  invoiceId: WelfareZakatObjectIdString;
  claimId?: WelfareZakatObjectIdString | null;
  priority: number;
  lines: readonly AssistanceAllocationLineInput[];
  reason: string;
  supportingAttachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface ConfirmAssistanceAllocationInput {
  expectedVersion: number;
  expectedFundVersion: number;
  expectedApprovalVersion: number;
  approvalRequestId?: WelfareZakatObjectIdString | null;
  reason: string;
}

export interface ReverseAssistanceAllocationInput {
  expectedVersion: number;
  amount: string;
  invoiceLineId?: WelfareZakatObjectIdString | null;
  approvalRequestId: WelfareZakatObjectIdString;
  reason: string;
  supportingAttachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface ReturnFundsInput {
  expectedAllocationVersion: number;
  amount: string;
  paymentId?: WelfareZakatObjectIdString | null;
  refundId?: WelfareZakatObjectIdString | null;
  creditNoteId?: WelfareZakatObjectIdString | null;
  debitNoteId?: WelfareZakatObjectIdString | null;
  claimAdjustmentId?: WelfareZakatObjectIdString | null;
  approvalRequestId: WelfareZakatObjectIdString;
  reason: string;
  supportingAttachmentIds?: readonly WelfareZakatObjectIdString[];
}

export interface FundBalanceView {
  openingBalance: string;
  inflowAmount: string;
  transferInAmount: string;
  transferOutAmount: string;
  adjustmentIncreaseAmount: string;
  adjustmentDecreaseAmount: string;
  ledgerBalance: string;
  reservedBalance: string;
  committedBalance: string;
  availableBalance: string;
  utilizedBalance: string;
  reversedBalance: string;
  refundAmount: string;
  repaymentAmount: string;
  recoveryAmount: string;
  writeOffAmount: string;
}

export interface AssistanceFundView {
  id: string;
  facilityId: string;
  fundCode: string;
  name: string;
  description: string | null;
  fundType: AssistanceFundType;
  categoryCode: string;
  restriction: AssistanceFundRestriction;
  donorReferenceMasked: string | null;
  fundingSourceReferenceMasked: string | null;
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: AssistanceFundStatus;
  currency: WelfareZakatCurrency;
  balances: FundBalanceView;
  approvalMatrixCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FundTransactionView {
  id: string;
  fundId: string;
  transactionNumber: string;
  transactionType: FundTransactionType;
  direction: FundTransactionDirection;
  amount: string;
  balanceAfter: string;
  applicationId: string | null;
  approvalId: string | null;
  reservationId: string | null;
  allocationId: string | null;
  invoiceId: string | null;
  invoiceLineId: string | null;
  donorReferenceMasked: string | null;
  receiptReferenceMasked: string | null;
  occurredAt: string;
  actorUserId: string;
  makerUserId: string | null;
  checkerUserId: string | null;
  reversalOfTransactionId: string | null;
}

export interface AssistanceApplicationView {
  id: string;
  facilityId: string;
  applicationNumber: string;
  applicationType: AssistanceApplicationType;
  patientId: string;
  guardianId: string | null;
  encounterId: string | null;
  admissionId: string | null;
  invoiceId: string | null;
  claimId: string | null;
  preferredFundId: string | null;
  status: AssistanceApplicationStatus;
  completenessSatisfied: boolean;
  eligibilityOutcome: EligibilityOutcome | null;
  requestedAmount: string | null;
  recommendedAmount: string | null;
  approvedAmount: string;
  reservedAmount: string;
  utilizedAmount: string;
  remainingApprovedAmount: string;
  financialYearCode: string;
  assignedToUserId: string | null;
  followUpAt: string | null;
  submittedAt: string | null;
  reviewDeadlineAt: string | null;
  approvalDeadlineAt: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssistanceApprovalView {
  id: string;
  applicationId: string;
  approvalNumber: string;
  fundId: string;
  status: AssistanceApprovalStatus;
  requestedAmount: string;
  approvedAmount: string;
  reservedAmount: string;
  committedAmount: string;
  utilizedAmount: string;
  reversedAmount: string;
  releasedAmount: string;
  remainingAmount: string;
  approvedFrom: string;
  approvedThrough: string | null;
  approvalMatrixCode: string;
  makerUserId: string;
  checkerUserIds: readonly string[];
  expiresAt: string | null;
  version: number;
}

export interface AssistanceReservationView {
  id: string;
  applicationId: string;
  approvalId: string;
  fundId: string;
  patientId: string;
  invoiceId: string;
  status: AssistanceReservationStatus;
  reservedAmount: string;
  consumedAmount: string;
  releasedAmount: string;
  remainingAmount: string;
  expiresAt: string;
  version: number;
}

export interface AssistanceAllocationLineView {
  id: string;
  invoiceLineId: string;
  amount: string;
  utilizedAmount: string;
  reversedAmount: string;
  refundableAmount: string;
}

export interface AssistanceAllocationView {
  id: string;
  facilityId: string;
  allocationNumber: string;
  fundId: string;
  patientId: string;
  applicationId: string;
  approvalId: string;
  reservationId: string | null;
  patientAccountId: string;
  invoiceId: string;
  claimId: string | null;
  status: AssistanceAllocationStatus;
  amount: string;
  utilizedAmount: string;
  reversedAmount: string;
  refundedAmount: string;
  repaidAmount: string;
  recoveredAmount: string;
  remainingAmount: string;
  priority: number;
  allocatedBy: string;
  approvedBy: string | null;
  allocatedAt: string;
  confirmedAt: string | null;
  lines: readonly AssistanceAllocationLineView[];
  reversalStatus: AssistanceReversalStatus | null;
  version: number;
}

export interface AssistanceWorkItemView {
  id: string;
  applicationId: string;
  approvalId: string | null;
  allocationId: string | null;
  workQueueType: AssistanceWorkQueueType;
  status: AssistanceWorkQueueStatus;
  assignedToUserId: string | null;
  priority: number;
  followUpAt: string | null;
  escalatedAt: string | null;
  version: number;
}