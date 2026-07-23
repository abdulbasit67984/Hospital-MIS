import type {
  ConsultantAgreementStatus,
  ConsultantCalculationMethod,
  ConsultantDiscountTreatment,
  ConsultantDisputeStatus,
  ConsultantEncounterType,
  ConsultantEngagementType,
  ConsultantParticipantAllocationMethod,
  ConsultantParticipantRole,
  ConsultantPatientType,
  ConsultantRecognitionBasis,
  ConsultantResponsibilityTreatment,
  ConsultantRevenueEntryStatus,
  ConsultantRevenueEntryType,
  ConsultantServiceCategory,
  ConsultantSettlementPeriodType,
  ConsultantSettlementStatus,
  ConsultantSharingAccessAction,
  ConsultantSharingCurrency,
  ConsultantSharingObjectIdString,
  ConsultantSharingPermissionKey,
  ConsultantSharingSortDirection,
  ConsultantSortField,
} from './consultant-sharing.constants.js';

export interface ConsultantSharingActorContext {
  userId: ConsultantSharingObjectIdString;
  staffId: ConsultantSharingObjectIdString | null;
  facilityId: ConsultantSharingObjectIdString;
  correlationId: string;
  permissionKeys: ReadonlySet<string>;
  roleKeys: readonly string[];
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface ConsultantSharingAccessRequest {
  actor: ConsultantSharingActorContext;
  action: ConsultantSharingAccessAction;
  resourceFacilityId?: ConsultantSharingObjectIdString;
  consultantStaffId?: ConsultantSharingObjectIdString | null;
  consultantId?: ConsultantSharingObjectIdString | null;
  makerUserId?: ConsultantSharingObjectIdString | null;
  assigneeUserId?: ConsultantSharingObjectIdString | null;
  sensitiveFinancialAction?: boolean;
}

export interface ConsultantSharingAccessDecision {
  allowed: boolean;
  requiredPermission: ConsultantSharingPermissionKey;
  accessMode: 'FULL' | 'DEPARTMENT' | 'SELF' | 'READ_ONLY' | 'DENIED';
  requiresIndependentApproval: boolean;
  auditSensitiveRead: boolean;
  minimumNecessaryFields: readonly string[];
  denialReason?: string;
}

export interface ConsultantSharingPage<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ConsultantSharingListQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  consultantId?: ConsultantSharingObjectIdString;
  departmentId?: ConsultantSharingObjectIdString;
  serviceId?: ConsultantSharingObjectIdString;
  agreementId?: ConsultantSharingObjectIdString;
  settlementId?: ConsultantSharingObjectIdString;
  payerOrganizationId?: ConsultantSharingObjectIdString;
  panelProgramId?: ConsultantSharingObjectIdString;
  packageId?: ConsultantSharingObjectIdString;
  claimId?: ConsultantSharingObjectIdString;
  status?: readonly string[];
  sortBy?: ConsultantSortField;
  sortDirection?: ConsultantSharingSortDirection;
}

export interface ConsultantAgreementTier {
  tierCode: string;
  fromInclusive: string;
  toInclusive: string | null;
  percentage: string | null;
  fixedAmount: string | null;
  priority: number;
}

export interface ConsultantRevenueEligibilityPolicy {
  discountTreatment: ConsultantDiscountTreatment;
  patientResponsibilityTreatment: ConsultantResponsibilityTreatment;
  sponsorResponsibilityTreatment: ConsultantResponsibilityTreatment;
  packageResponsibilityTreatment: ConsultantResponsibilityTreatment;
  welfareZakatTreatment: ConsultantResponsibilityTreatment;
  taxTreatment: ConsultantResponsibilityTreatment;
  serviceChargeTreatment: ConsultantResponsibilityTreatment;
  deductRefunds: boolean;
  deductCreditNotes: boolean;
  includeDebitNotes: boolean;
  deductWriteOffs: boolean;
  applyClaimAdjustments: boolean;
  deductNonShareableCharges: boolean;
  deductCosts: boolean;
  deductConsumables: boolean;
  deductOtherApprovedDeductions: boolean;
}

export interface ConsultantAgreementParticipantRule {
  participantId: ConsultantSharingObjectIdString;
  participantRole: ConsultantParticipantRole;
  customRoleCode: string | null;
  allocationMethod: ConsultantParticipantAllocationMethod;
  percentage: string | null;
  fixedAmount: string | null;
  priority: number;
  receivesResidual: boolean;
}

export interface ConsultantAgreementRuleDefinition {
  id: ConsultantSharingObjectIdString;
  agreementId: ConsultantSharingObjectIdString;
  agreementVersion: number;
  ruleVersion: number;
  ruleCode: string;
  ruleName: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  priority: number;
  isFallback: boolean;
  effectiveFrom: string;
  effectiveThrough: string | null;
  facilityId: ConsultantSharingObjectIdString;
  consultantId: ConsultantSharingObjectIdString;
  consultantGroupId: ConsultantSharingObjectIdString | null;
  departmentId: ConsultantSharingObjectIdString | null;
  serviceId: ConsultantSharingObjectIdString | null;
  serviceCategory: ConsultantServiceCategory | null;
  chargeCatalogItemId: ConsultantSharingObjectIdString | null;
  procedureId: ConsultantSharingObjectIdString | null;
  patientType: ConsultantPatientType | null;
  encounterType: ConsultantEncounterType | null;
  admissionType: string | null;
  payerOrganizationId: ConsultantSharingObjectIdString | null;
  panelProgramId: ConsultantSharingObjectIdString | null;
  packageId: ConsultantSharingObjectIdString | null;
  claimType: string | null;
  calculationMethod: ConsultantCalculationMethod;
  recognitionBasis: ConsultantRecognitionBasis;
  percentage: string | null;
  fixedAmount: string | null;
  minimumShare: string | null;
  maximumShare: string | null;
  perServiceCap: string | null;
  perCaseCap: string | null;
  periodCap: string | null;
  guaranteedAmount: string | null;
  thresholdAmount: string | null;
  tiers: readonly ConsultantAgreementTier[];
  participants: readonly ConsultantAgreementParticipantRule[];
  eligibilityPolicy: ConsultantRevenueEligibilityPolicy;
  currency: ConsultantSharingCurrency;
  calculationFingerprint: string;
}

export interface ConsultantAgreementView {
  id: ConsultantSharingObjectIdString;
  facilityId: ConsultantSharingObjectIdString;
  agreementNumber: string;
  agreementName: string;
  description: string | null;
  consultantId: ConsultantSharingObjectIdString;
  consultantStaffId: ConsultantSharingObjectIdString | null;
  consultantGroupId: ConsultantSharingObjectIdString | null;
  engagementType: ConsultantEngagementType;
  status: ConsultantAgreementStatus;
  priority: number;
  effectiveFrom: string;
  effectiveThrough: string | null;
  agreementVersion: number;
  supersedesAgreementId: ConsultantSharingObjectIdString | null;
  supportingAttachmentIds: readonly ConsultantSharingObjectIdString[];
  submittedBy: ConsultantSharingObjectIdString | null;
  reviewedBy: ConsultantSharingObjectIdString | null;
  approvedBy: ConsultantSharingObjectIdString | null;
  activatedBy: ConsultantSharingObjectIdString | null;
  suspendedBy: ConsultantSharingObjectIdString | null;
  terminatedBy: ConsultantSharingObjectIdString | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  terminatedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultantAgreementRuleView extends ConsultantAgreementRuleDefinition {}

export interface ConsultantAgreementMatchContext {
  facilityId: ConsultantSharingObjectIdString;
  consultantId: ConsultantSharingObjectIdString;
  consultantGroupId?: ConsultantSharingObjectIdString | null;
  financialEventAt: string;
  departmentId?: ConsultantSharingObjectIdString | null;
  serviceId?: ConsultantSharingObjectIdString | null;
  serviceCategory?: ConsultantServiceCategory | null;
  chargeCatalogItemId?: ConsultantSharingObjectIdString | null;
  procedureId?: ConsultantSharingObjectIdString | null;
  patientType?: ConsultantPatientType | null;
  encounterType?: ConsultantEncounterType | null;
  admissionType?: string | null;
  payerOrganizationId?: ConsultantSharingObjectIdString | null;
  panelProgramId?: ConsultantSharingObjectIdString | null;
  packageId?: ConsultantSharingObjectIdString | null;
  claimType?: string | null;
}

export interface ConsultantAgreementMatchCandidate {
  agreementId: ConsultantSharingObjectIdString;
  agreementNumber: string;
  agreementVersion: number;
  agreementStatus: ConsultantAgreementStatus;
  agreementPriority: number;
  rule: ConsultantAgreementRuleDefinition;
}

export interface ConsultantAgreementMatchRanking {
  ruleId: ConsultantSharingObjectIdString;
  agreementId: ConsultantSharingObjectIdString;
  rulePriority: number;
  specificityScore: number;
  matchedDimensions: readonly string[];
  agreementPriority: number;
  agreementVersion: number;
  ruleVersion: number;
  fallback: boolean;
}

export interface ConsultantAgreementMatchResult {
  selected: ConsultantAgreementMatchCandidate;
  ranking: ConsultantAgreementMatchRanking;
  evaluatedCandidateCount: number;
  effectiveCandidateCount: number;
  selectionReason: string;
}

export interface AuthoritativeConsultantFinancialActivity {
  sourceFinancialEventId: string;
  sourceFinancialEventType: string;
  sourceLedgerEntryId: ConsultantSharingObjectIdString | null;
  sourceModule: string;
  sourceRecordId: ConsultantSharingObjectIdString;
  facilityId: ConsultantSharingObjectIdString;
  patientId: ConsultantSharingObjectIdString;
  encounterId: ConsultantSharingObjectIdString | null;
  admissionId: ConsultantSharingObjectIdString | null;
  invoiceId: ConsultantSharingObjectIdString;
  invoiceLineId: ConsultantSharingObjectIdString;
  paymentAllocationId: ConsultantSharingObjectIdString | null;
  refundId: ConsultantSharingObjectIdString | null;
  creditNoteId: ConsultantSharingObjectIdString | null;
  debitNoteId: ConsultantSharingObjectIdString | null;
  claimId: ConsultantSharingObjectIdString | null;
  packageId: ConsultantSharingObjectIdString | null;
  payerOrganizationId: ConsultantSharingObjectIdString | null;
  panelProgramId: ConsultantSharingObjectIdString | null;
  departmentId: ConsultantSharingObjectIdString | null;
  serviceId: ConsultantSharingObjectIdString | null;
  serviceCategory: ConsultantServiceCategory;
  chargeCatalogItemId: ConsultantSharingObjectIdString;
  procedureId: ConsultantSharingObjectIdString | null;
  currency: ConsultantSharingCurrency;
  financialEventAt: string;
  invoiceFinalized: boolean;
  serviceCompleted: boolean;
  invoiceFullyPaid: boolean;
  unitQuantity: string;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  patientResponsibilityAmount: string;
  sponsorResponsibilityAmount: string;
  packageResponsibilityAmount: string;
  welfareZakatAmount: string;
  taxAmount: string;
  serviceChargeAmount: string;
  refundAmount: string;
  creditNoteAmount: string;
  debitNoteAmount: string;
  writeOffAmount: string;
  claimAdjustmentAmount: string;
  nonShareableAmount: string;
  costDeductionAmount: string;
  consumableDeductionAmount: string;
  otherApprovedDeductionAmount: string;
  collectedAmount: string;
  collectionBasisAmount: string;
  claimApprovedAmount: string;
  claimBasisAmount: string;
  claimPaidAmount: string;
}

export interface ConsultantEligibleRevenueBreakdown {
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  includedPatientResponsibility: string;
  includedSponsorResponsibility: string;
  includedPackageResponsibility: string;
  includedWelfareZakatAmount: string;
  grossBasisAdjustment: string;
  taxDeduction: string;
  serviceChargeDeduction: string;
  refundDeduction: string;
  creditNoteDeduction: string;
  debitNoteAddition: string;
  writeOffDeduction: string;
  claimAdjustment: string;
  nonShareableDeduction: string;
  costDeduction: string;
  consumableDeduction: string;
  otherApprovedDeduction: string;
  eligibleRevenueBeforeRecognition: string;
}

export interface ConsultantRecognitionResult {
  recognitionBasis: ConsultantRecognitionBasis;
  eligibleRevenueBeforeRecognition: string;
  recognitionRatio: string;
  recognizedEligibleRevenue: string;
  pendingEligibleRevenue: string;
  recognitionSatisfied: boolean;
}

export interface ConsultantParticipantAllocationInput {
  participantId: ConsultantSharingObjectIdString;
  participantRole: ConsultantParticipantRole;
  customRoleCode?: string | null;
  allocationMethod: ConsultantParticipantAllocationMethod;
  percentage?: string | null;
  fixedAmount?: string | null;
  priority: number;
  receivesResidual?: boolean;
}

export interface ConsultantParticipantShare {
  participantId: ConsultantSharingObjectIdString;
  participantRole: ConsultantParticipantRole;
  customRoleCode: string | null;
  allocationMethod: ConsultantParticipantAllocationMethod;
  percentage: string | null;
  fixedAmount: string | null;
  shareAmount: string;
  priority: number;
  residual: boolean;
}

export interface ConsultantShareCalculationInput {
  eligibleRevenue: string;
  method: ConsultantCalculationMethod;
  percentage?: string | null;
  fixedAmount?: string | null;
  unitQuantity?: string;
  thresholdAmount?: string | null;
  minimumShare?: string | null;
  maximumShare?: string | null;
  perServiceCap?: string | null;
  perCaseCap?: string | null;
  periodRemainingCap?: string | null;
  guaranteedAmount?: string | null;
  tiers?: readonly ConsultantAgreementTier[];
  participantRules?: readonly ConsultantParticipantAllocationInput[];
}

export interface ConsultantShareCalculationResult {
  eligibleRevenue: string;
  calculationMethod: ConsultantCalculationMethod;
  percentage: string | null;
  fixedAmount: string | null;
  selectedTierCode: string | null;
  uncappedConsultantPool: string;
  consultantPool: string;
  participantShares: readonly ConsultantParticipantShare[];
  consultantShare: string;
  hospitalShare: string;
  capApplied: string | null;
  minimumApplied: boolean;
  guaranteedAmountApplied: boolean;
}

export interface ConsultantRevenueCalculationTrace {
  facilityId: ConsultantSharingObjectIdString;
  consultantId: ConsultantSharingObjectIdString;
  agreementId: ConsultantSharingObjectIdString;
  agreementVersion: number;
  agreementRuleId: ConsultantSharingObjectIdString;
  ruleVersion: number;
  patientId: ConsultantSharingObjectIdString;
  encounterId: ConsultantSharingObjectIdString | null;
  admissionId: ConsultantSharingObjectIdString | null;
  invoiceId: ConsultantSharingObjectIdString;
  invoiceLineId: ConsultantSharingObjectIdString;
  chargeSource: string;
  serviceId: ConsultantSharingObjectIdString | null;
  departmentId: ConsultantSharingObjectIdString | null;
  procedureId: ConsultantSharingObjectIdString | null;
  payerOrganizationId: ConsultantSharingObjectIdString | null;
  panelProgramId: ConsultantSharingObjectIdString | null;
  packageId: ConsultantSharingObjectIdString | null;
  claimId: ConsultantSharingObjectIdString | null;
  sourceFinancialEventId: string;
  sourceLedgerEntryId: ConsultantSharingObjectIdString | null;
  inputHash: string;
  calculationHash: string;
  calculatedAt: string;
  calculatedBy: ConsultantSharingObjectIdString | 'SYSTEM';
  matchReason: string;
  eligibleRevenue: ConsultantEligibleRevenueBreakdown;
  recognition: ConsultantRecognitionResult;
  shares: ConsultantShareCalculationResult;
}

export interface ConsultantRevenueEntryView {
  id: ConsultantSharingObjectIdString;
  facilityId: ConsultantSharingObjectIdString;
  consultantId: ConsultantSharingObjectIdString;
  agreementId: ConsultantSharingObjectIdString;
  agreementRuleId: ConsultantSharingObjectIdString;
  invoiceId: ConsultantSharingObjectIdString;
  invoiceLineId: ConsultantSharingObjectIdString;
  entryType: ConsultantRevenueEntryType;
  status: ConsultantRevenueEntryStatus;
  eligibleRevenue: string;
  consultantShare: string;
  hospitalShare: string;
  taxWithholdingAmount: string;
  deductionAmount: string;
  netPayableAmount: string;
  settledAmount: string;
  outstandingAmount: string;
  settlementId: ConsultantSharingObjectIdString | null;
  reversalOfEntryId: ConsultantSharingObjectIdString | null;
  calculationHash: string;
  occurredAt: string;
  version: number;
}

export interface ConsultantSettlementTotalsInput {
  openingBalance: string;
  broughtForwardBalance: string;
  eligibleRevenue: string;
  consultantShare: string;
  adjustments: string;
  refundDeductions: string;
  creditNoteDeductions: string;
  debitNoteAdditions: string;
  claimDeductions: string;
  welfareZakatDeductions: string;
  taxWithholding: string;
  otherDeductions: string;
  advanceRecovery: string;
  overpaymentRecovery: string;
  paidAmount: string;
}

export interface ConsultantSettlementTotalsResult
  extends ConsultantSettlementTotalsInput {
  grossPayable: string;
  totalDeductions: string;
  netPayable: string;
  outstandingAmount: string;
}

export interface ConsultantSettlementView {
  id: ConsultantSharingObjectIdString;
  facilityId: ConsultantSharingObjectIdString;
  settlementNumber: string;
  consultantId: ConsultantSharingObjectIdString;
  periodType: ConsultantSettlementPeriodType;
  periodFrom: string;
  periodThrough: string;
  status: ConsultantSettlementStatus;
  currency: ConsultantSharingCurrency;
  totals: ConsultantSettlementTotalsResult;
  submittedBy: ConsultantSharingObjectIdString | null;
  approvedBy: ConsultantSharingObjectIdString | null;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  ledgerTransactionId: ConsultantSharingObjectIdString | null;
  itemCount: number;
  revenueEntryCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultantDisputeView {
  id: ConsultantSharingObjectIdString;
  facilityId: ConsultantSharingObjectIdString;
  disputeNumber: string;
  consultantId: ConsultantSharingObjectIdString;
  makerUserId: ConsultantSharingObjectIdString;
  targetType: 'REVENUE_ENTRY' | 'SETTLEMENT' | 'SETTLEMENT_ITEM' | 'PAYMENT' | 'AGREEMENT' | 'AGREEMENT_RULE';
  settlementId: ConsultantSharingObjectIdString | null;
  revenueEntryId: ConsultantSharingObjectIdString | null;
  status: ConsultantDisputeStatus;
  reasonCode: string;
  reason: string;
  requestedAdjustmentAmount: string;
  approvedAdjustmentAmount: string;
  assignedToUserId: ConsultantSharingObjectIdString | null;
  followUpAt: string | null;
  resolvedAt: string | null;
  version: number;
}

export type ConsultantFinancialChangeKind =
  | 'REFUND'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'CLAIM_ADJUSTMENT'
  | 'PACKAGE_ADJUSTMENT'
  | 'WELFARE_ZAKAT_ADJUSTMENT'
  | 'PAYMENT_REVERSAL'
  | 'INVOICE_CANCELLATION'
  | 'WRITE_OFF'
  | 'SERVICE_CANCELLATION'
  | 'MANUAL_CORRECTION';

export interface ConsultantFinancialChangeReference {
  kind: ConsultantFinancialChangeKind;
  sourceFinancialEventId: string;
  sourceRecordId: string;
  invoiceLineId: string;
  consultantId: string;
  refundId?: string | null;
  creditNoteId?: string | null;
  debitNoteId?: string | null;
  claimAdjustmentId?: string | null;
  welfareZakatReversalId?: string | null;
  occurredAt: string;
  reasonCode: string;
  reason: string;
}

export interface ConsultantRevenueAdjustmentView {
  id: string;
  facilityId: string;
  adjustmentNumber: string;
  revenueEntryId: string;
  consultantId: string;
  settlementId: string | null;
  disputeId: string | null;
  status:
    | 'REQUESTED'
    | 'APPROVAL_PENDING'
    | 'APPROVED'
    | 'POSTED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'REVERSED';
  eligibleRevenueDelta: string;
  consultantShareDelta: string;
  hospitalShareDelta: string;
  taxWithholdingDelta: string;
  deductionDelta: string;
  netPayableDelta: string;
  reasonCode: string;
  makerUserId: string;
  approvalRequestId: string;
  requestedAt: string;
  approvedAt: string | null;
  postedAt: string | null;
  postedRevenueEntryId: string | null;
  version: number;
}

export interface ConsultantRevenueReversalView {
  id: string;
  facilityId: string;
  reversalNumber: string;
  revenueEntryId: string;
  consultantId: string;
  status:
    | 'REQUESTED'
    | 'APPROVAL_PENDING'
    | 'APPROVED'
    | 'POSTED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'REVERSED';
  eligibleRevenueAmount: string;
  consultantShareAmount: string;
  hospitalShareAmount: string;
  taxWithholdingAmount: string;
  deductionAmount: string;
  netPayableAmount: string;
  sourceFinancialEventId: string;
  makerUserId: string;
  approvalRequestId: string;
  requestedAt: string;
  approvedAt: string | null;
  postedAt: string | null;
  reversalRevenueEntryId: string | null;
  version: number;
}

export interface ConsultantSettlementItemInput {
  sourceKey: string;
  itemType:
    | 'REVENUE'
    | 'ADJUSTMENT'
    | 'REFUND_DEDUCTION'
    | 'CREDIT_NOTE_DEDUCTION'
    | 'DEBIT_NOTE_ADDITION'
    | 'CLAIM_ADJUSTMENT'
    | 'WELFARE_ZAKAT_ADJUSTMENT'
    | 'TAX_WITHHOLDING'
    | 'OTHER_DEDUCTION'
    | 'ADVANCE_RECOVERY'
    | 'OVERPAYMENT_RECOVERY'
    | 'OPENING_BALANCE'
    | 'BROUGHT_FORWARD';
  revenueEntryId: string | null;
  adjustmentId: string | null;
  reversalId: string | null;
  invoiceId: string | null;
  invoiceLineId: string | null;
  claimId: string | null;
  paymentAllocationId: string | null;
  eligibleRevenue: string;
  consultantShare: string;
  hospitalShare: string;
  withholdingAmount: string;
  deductionAmount: string;
  signedSettlementImpact: string;
  description: string;
  sourceOccurredAt: Date;
}

export interface ConsultantSettlementPaymentView {
  id: string;
  facilityId: string;
  payoutNumber: string;
  settlementId: string;
  consultantId: string;
  status:
    | 'REQUESTED'
    | 'APPROVAL_PENDING'
    | 'APPROVED'
    | 'PROCESSING'
    | 'PAID'
    | 'FAILED'
    | 'RETURNED'
    | 'CANCELLED'
    | 'REVERSED';
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'DIGITAL_PAYMENT' | 'CHEQUE' | 'OTHER';
  currency: string;
  amount: string;
  taxWithholdingAmount: string;
  advanceRecoveryAmount: string;
  overpaymentRecoveryAmount: string;
  otherDeductionAmount: string;
  netDisbursedAmount: string;
  paymentId: string | null;
  reversalOfPaymentId: string | null;
  reversedByPaymentId: string | null;
  makerUserId: string;
  approvalRequestId: string;
  ledgerTransactionId: string | null;
  paidAt: string | null;
  version: number;
}

export interface ConsultantRevenueReconciliationLine {
  revenueEntryId: string;
  consultantId: string;
  expectedStatus: ConsultantRevenueEntryStatus;
  expectedOutstandingAmount: string;
  persistedOutstandingAmount: string;
  variance: string;
  settlementId: string | null;
}

export interface ConsultantSettlementReconciliationLine {
  settlementId: string;
  consultantId: string;
  expectedStatus: ConsultantSettlementStatus;
  expectedTotals: ConsultantSettlementTotalsResult;
  persistedTotals: ConsultantSettlementTotalsResult;
  netPayableVariance: string;
  paidVariance: string;
  outstandingVariance: string;
}

export interface ConsultantLedgerReconciliationLine {
  entityType: 'REVENUE_ENTRY' | 'SETTLEMENT' | 'PAYOUT';
  entityId: string;
  expectedAmount: string;
  ledgerAmount: string;
  variance: string;
  ledgerTransactionIds: readonly string[];
}

export interface ConsultantReconciliationResult {
  facilityId: string;
  from: string;
  through: string;
  revenue: readonly ConsultantRevenueReconciliationLine[];
  settlements: readonly ConsultantSettlementReconciliationLine[];
  ledger: readonly ConsultantLedgerReconciliationLine[];
  totalVariance: string;
  reconciled: boolean;
  generatedAt: string;
}

export interface ConsultantSettlementCalculationResult {
  settlement: ConsultantSettlementView;
  items: readonly ConsultantSettlementItemInput[];
  sourceEntries: readonly ConsultantRevenueEntryView[];
}

export interface ConsultantDisputeTransitionView {
  disputeId: string;
  previousStatus: ConsultantDisputeStatus;
  status: ConsultantDisputeStatus;
  version: number;
}