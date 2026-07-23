import type {
  AuthoritativeConsultantFinancialActivity,
  ConsultantAgreementMatchCandidate,
  ConsultantAgreementRuleDefinition,
  ConsultantAgreementView,
  ConsultantDisputeView,
  ConsultantRevenueCalculationTrace,
  ConsultantRevenueEntryView,
  ConsultantSettlementTotalsResult,
  ConsultantSettlementView,
  ConsultantSharingAccessDecision,
  ConsultantSharingAccessRequest,
  ConsultantSharingActorContext,
  ConsultantSharingListQuery,
  ConsultantSharingPage,
} from './consultant-sharing.contracts.js';
import type {
  ConsultantFinancialChangeReference,
  ConsultantLedgerReconciliationLine,
  ConsultantReconciliationResult,
  ConsultantRevenueAdjustmentView,
  ConsultantRevenueReversalView,
  ConsultantSettlementItemInput,
  ConsultantSettlementPaymentView,
  ConsultantSettlementReconciliationLine,
} from './consultant-sharing.contracts.js';
import type {
  ConsultantAgreementStatus,
  ConsultantDisputeStatus,
  ConsultantRevenueEntryStatus,
  ConsultantRevenueEntryType,
  ConsultantSettlementStatus,
} from './consultant-sharing.constants.js';

export interface ConsultantSharingTransactionContext {
  session: unknown;
  transactionId: string;
  startedAt: Date;
}

export interface ConsultantSharingTransactionManagerPort {
  withTransaction<T>(
    operation: (transaction: ConsultantSharingTransactionContext) => Promise<T>,
  ): Promise<T>;
}

export interface ConsultantAgreementRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementNumber: string;
    agreementName: string;
    description: string | null;
    consultantId: string;
    consultantStaffId: string | null;
    consultantUserId: string | null;
    consultantGroupId: string | null;
    engagementType: string;
    priority: number;
    effectiveFrom: Date;
    effectiveThrough: Date | null;
    departmentIds: readonly string[];
    serviceIds: readonly string[];
    serviceCategories: readonly string[];
    supportingAttachmentIds: readonly string[];
    internalNotesEncrypted: string | null;
    approvalMatrixCode: string;
    taxProfileReferenceHash: string | null;
    payoutProfileReferenceHash: string | null;
    payoutProfileReferenceMasked: string | null;
    operationKey: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView>;

  findById(input: Readonly<{
    facilityId: string;
    agreementId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView | null>;

  list(input: Readonly<{
    facilityId: string;
    query: ConsultantSharingListQuery;
  }>): Promise<ConsultantSharingPage<ConsultantAgreementView>>;

  updateDraft(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementId: string;
    expectedVersion: number;
    changes: Readonly<{
      agreementName?: string;
      description?: string | null;
      priority?: number;
      effectiveFrom?: Date;
      effectiveThrough?: Date | null;
      supportingAttachmentIds?: readonly string[];
      internalNotesEncrypted?: string | null;
    }>;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView | null>;

  changeStatus(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementId: string;
    expectedVersion: number;
    fromStatus: ConsultantAgreementStatus;
    toStatus: ConsultantAgreementStatus;
    reason: string;
    approvalRequestId: string | null;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView | null>;

  createAmendment(input: Readonly<{
    actor: ConsultantSharingActorContext;
    sourceAgreementId: string;
    expectedVersion: number;
    amendmentAgreementNumber: string;
    effectiveFrom: Date;
    reason: string;
    operationKey: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView | null>;

  supersedeForAmendment(input: Readonly<{
    actor: ConsultantSharingActorContext;
    sourceAgreementId: string;
    amendmentAgreementId: string;
    amendmentEffectiveFrom: Date;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantAgreementView | null>;
}

export interface ConsultantAgreementRuleRepositoryPort {
  createMany(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreement: ConsultantAgreementView;
    rules: readonly Omit<
      ConsultantAgreementRuleDefinition,
      | 'id'
      | 'agreementId'
      | 'agreementVersion'
      | 'facilityId'
      | 'consultantId'
      | 'consultantGroupId'
      | 'status'
      | 'calculationFingerprint'
    >[];
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<readonly ConsultantAgreementRuleDefinition[]>;

  listByAgreement(input: Readonly<{
    facilityId: string;
    agreementId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<readonly ConsultantAgreementRuleDefinition[]>;

  findMatchingCandidates(input: Readonly<{
    facilityId: string;
    consultantId: string;
    financialEventAt: Date;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<readonly ConsultantAgreementMatchCandidate[]>;

  findConflictCandidates(input: Readonly<{
    facilityId: string;
    consultantId: string;
    effectiveFrom: Date;
    effectiveThrough: Date | null;
    excludeAgreementIds?: readonly string[];
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<readonly ConsultantAgreementMatchCandidate[]>;

  activateForAgreement(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<number>;

  supersedeForAgreement(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementId: string;
    supersededAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<number>;
}

export interface ConsultantFinancialActivityPort {
  getAuthoritativeActivity(input: Readonly<{
    actor: ConsultantSharingActorContext;
    sourceFinancialEventId: string;
    invoiceLineId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<AuthoritativeConsultantFinancialActivity | null>;

  listEligibleActivities(input: Readonly<{
    facilityId: string;
    consultantId?: string;
    from: Date;
    through: Date;
    limit: number;
    afterSourceFinancialEventId?: string;
  }>): Promise<readonly AuthoritativeConsultantFinancialActivity[]>;
}

export interface ConsultantRevenueEntryRepositoryPort {
  findById(input: Readonly<{
    facilityId: string;
    revenueEntryId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueEntryView | null>;

  findByCalculationKey(input: Readonly<{
    facilityId: string;
    calculationKey: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueEntryView | null>;

  append(input: Readonly<{
    actor: ConsultantSharingActorContext;
    operationKey: string;
    calculationRunId: string;
    calculationKey: string;
    activity: AuthoritativeConsultantFinancialActivity;
    consultantStaffId: string | null;
    consultantGroupId: string | null;
    direction: 'CREDIT' | 'DEBIT';
    entryType: ConsultantRevenueEntryType;
    status: ConsultantRevenueEntryStatus;
    trace: ConsultantRevenueCalculationTrace;
    taxWithholdingAmount: string;
    deductionAmount: string;
    otherParticipantShare: string;
    netPayableAmount: string;
    reversalOfEntryId: string | null;
    adjustmentOfEntryId: string | null;
    reason: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueEntryView>;

  list(input: Readonly<{
    facilityId: string;
    query: ConsultantSharingListQuery;
  }>): Promise<ConsultantSharingPage<ConsultantRevenueEntryView>>;

  markStatus(input: Readonly<{
    actor: ConsultantSharingActorContext;
    revenueEntryId: string;
    expectedVersion: number;
    fromStatus: ConsultantRevenueEntryStatus;
    toStatus: ConsultantRevenueEntryStatus;
    reason: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueEntryView | null>;
}

export interface ConsultantSettlementRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementNumber: string;
    consultantId: string;
    periodType: string;
    periodFrom: Date;
    periodThrough: Date;
    duplicateKey: string;
    totals: ConsultantSettlementTotalsResult;
    revenueEntryIds: readonly string[];
    operationKey: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView>;

  findById(input: Readonly<{
    facilityId: string;
    settlementId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;

  findByDuplicateKey(input: Readonly<{
    facilityId: string;
    duplicateKey: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;

  list(input: Readonly<{
    facilityId: string;
    query: ConsultantSharingListQuery;
  }>): Promise<ConsultantSharingPage<ConsultantSettlementView>>;

  changeStatus(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    expectedVersion: number;
    fromStatus: ConsultantSettlementStatus;
    toStatus: ConsultantSettlementStatus;
    reason: string;
    approvalRequestId: string | null;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;

  applyPayment(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    expectedVersion: number;
    paymentId: string;
    amount: string;
    authoritativeTotals: ConsultantSettlementTotalsResult;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;

  reversePayment(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    expectedVersion: number;
    originalPaymentId: string;
    reversalPaymentId: string;
    amount: string;
    authoritativeTotals: ConsultantSettlementTotalsResult;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;

  attachLedgerTransaction(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    ledgerTransactionId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementView | null>;
}

export interface ConsultantDisputeRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    disputeNumber: string;
    consultantId: string;
    settlementId: string | null;
    revenueEntryId: string | null;
    reasonCode: string;
    reason: string;
    evidenceEncrypted: string | null;
    requestedAdjustmentAmount: string;
    attachmentIds: readonly string[];
    operationKey: string;
    assignedToUserId: string | null;
    followUpAt: Date | null;
    reviewDeadlineAt: Date | null;
    resolutionDeadlineAt: Date | null;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantDisputeView>;

  findById(input: Readonly<{
    facilityId: string;
    disputeId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantDisputeView | null>;

  changeStatus(input: Readonly<{
    actor: ConsultantSharingActorContext;
    disputeId: string;
    expectedVersion: number;
    fromStatus: ConsultantDisputeStatus;
    toStatus: ConsultantDisputeStatus;
    approvedAdjustmentAmount: string;
    reason: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantDisputeView | null>;
}

export interface ConsultantIdentityResolutionPort {
  resolveConsultant(input: Readonly<{
    facilityId: string;
    consultantId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    consultantId: string;
    staffId: string | null;
    userId: string | null;
    consultantGroupId: string | null;
    departmentIds: readonly string[];
    active: boolean;
  }> | null>;
}

export interface ConsultantApprovalPort {
  requireApproved(input: Readonly<{
    actor: ConsultantSharingActorContext;
    approvalRequestId: string;
    action: string;
    entityType: string;
    entityId: string;
    amount?: string;
    makerUserId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantFinancialLedgerPort {
  postConsultantLiability(input: Readonly<{
    actor: ConsultantSharingActorContext;
    revenueEntryId: string;
    consultantId: string;
    invoiceId: string;
    invoiceLineId: string;
    consultantShare: string;
    hospitalShare: string;
    currency: string;
    sourceLedgerEntryId: string | null;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerEntryId: string }>>;

  postSettlement(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    consultantId: string;
    netPayable: string;
    taxWithholding: string;
    totalDeductions: string;
    currency: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string; ledgerEntryIds: readonly string[] }>>;

  reverseSettlement(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    consultantId: string;
    originalLedgerTransactionId: string;
    netPayable: string;
    taxWithholding: string;
    totalDeductions: string;
    currency: string;
    reason: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string; ledgerEntryIds: readonly string[] }>>;
}

export interface ConsultantPayoutPort {
  createPayout(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    consultantId: string;
    amount: string;
    paymentMethodId: string;
    paymentReference: string;
    cashierShiftId: string | null;
    approvalRequestId: string;
    operationKey: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    paymentId: string;
    status: string;
    amount: string;
    occurredAt: string;
  }>>;

  reversePayout(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    consultantId: string;
    paymentId: string;
    amount: string;
    reason: string;
    approvalRequestId: string;
    operationKey: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    paymentReversalId: string;
    status: string;
    amount: string;
    occurredAt: string;
  }>>;
}

export interface ConsultantAuditPort {
  record(input: Readonly<{
    actor: ConsultantSharingActorContext;
    action: string;
    entityType: string;
    entityId: string;
    before?: Readonly<Record<string, unknown>>;
    after?: Readonly<Record<string, unknown>>;
    reason?: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantOutboxPort {
  publish(input: Readonly<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantSequencePort {
  next(input: Readonly<{
    facilityId: string;
    sequenceKey: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<string>;
}

export interface ConsultantIdempotencyPort {
  execute<T>(input: Readonly<{
    scope: string;
    actor: ConsultantSharingActorContext;
    idempotencyKey: string;
    requestHash: string;
    operation: () => Promise<T>;
  }>): Promise<T>;
}

export interface ConsultantOperationLockPort {
  withLock<T>(input: Readonly<{
    lockKey: string;
    ownerId: string;
    ttlMs: number;
    operation: () => Promise<T>;
  }>): Promise<T>;
}


export interface ConsultantEncryptionPort {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

export interface ConsultantAttachmentPort {
  assertAttachmentIdsUsable(input: Readonly<{
    facilityId: string;
    actorUserId: string;
    attachmentIds: readonly string[];
  }>): Promise<void>;
}

export interface ConsultantAgreementHistoryRepositoryPort {
  append(input: Readonly<{
    actor: ConsultantSharingActorContext;
    agreementId: string;
    agreementVersion: number;
    historyType: string;
    fromStatus: string | null;
    toStatus: string | null;
    reasonEncrypted: string;
    snapshot: Readonly<Record<string, unknown>>;
    immutableHash: string;
    occurredAt: Date;
    approvalRequestId: string | null;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;

  appendRuleVersions(input: Readonly<{
    actor: ConsultantSharingActorContext;
    rules: readonly ConsultantAgreementRuleDefinition[];
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantCalculationRunRepositoryPort {
  start(input: Readonly<{
    actor: ConsultantSharingActorContext;
    operationKey: string;
    runType: 'INITIAL_RECOGNITION' | 'RECALCULATION' | 'REFUND_RECALCULATION' | 'CLAIM_RECALCULATION' | 'PACKAGE_RECALCULATION' | 'WELFARE_ZAKAT_RECALCULATION' | 'MANUAL_RECOVERY';
    sourceFinancialEventId: string;
    sourceFinancialEventType: string;
    sourceModule: string;
    sourceRecordId: string;
    invoiceLineId: string;
    consultantId: string;
    inputHash: string;
    startedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<string>;

  complete(input: Readonly<{
    actor: ConsultantSharingActorContext;
    runId: string;
    resultHash: string;
    completedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;

  fail(input: Readonly<{
    actor: ConsultantSharingActorContext;
    runId: string;
    errorCode: string;
    errorMessage: string;
    retryAt: Date | null;
    deadLetter: boolean;
    failedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantWorkItemView {
  id: string;
  facilityId: string;
  workQueueType: string;
  status: string;
  agreementId: string | null;
  agreementRuleId: string | null;
  revenueEntryId: string | null;
  adjustmentId: string | null;
  reversalId: string | null;
  settlementId: string | null;
  settlementPaymentId: string | null;
  disputeId: string | null;
  assignedToUserId: string | null;
  priority: number;
  followUpAt: string | null;
  deadlineAt: string | null;
  escalationLevel: number;
  version: number;
}

export interface ConsultantWorkQueueRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    target: Readonly<{
      agreementId?: string | null;
      agreementRuleId?: string | null;
      revenueEntryId?: string | null;
      adjustmentId?: string | null;
      reversalId?: string | null;
      settlementId?: string | null;
      settlementPaymentId?: string | null;
      disputeId?: string | null;
    }>;
    workQueueType: string;
    assignedToUserId: string | null;
    priority: number;
    followUpAt: Date | null;
    deadlineAt: Date | null;
    reasonEncrypted: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantWorkItemView>;

  listAssigned(input: Readonly<{
    facilityId: string;
    assignedToUserId?: string;
    page?: number;
    pageSize?: number;
  }>): Promise<ConsultantSharingPage<ConsultantWorkItemView>>;

  assign(input: Readonly<{
    actor: ConsultantSharingActorContext;
    workItemId: string;
    expectedVersion: number;
    assignedToUserId: string;
    followUpAt: Date | null;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantWorkItemView | null>;

  escalate(input: Readonly<{
    actor: ConsultantSharingActorContext;
    workItemId: string;
    expectedVersion: number;
    escalatedToUserId: string;
    reasonEncrypted: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantWorkItemView | null>;
}

export interface ConsultantSharingAccessPolicyPort {
  authorize(request: ConsultantSharingAccessRequest): Promise<ConsultantSharingAccessDecision>;
}

export interface ConsultantPeriodCapPort {
  getRemainingCap(input: Readonly<{
    facilityId: string;
    consultantId: string;
    agreementRuleId: string;
    financialEventAt: Date;
    configuredPeriodCap: string | null;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<string | null>;
}

export interface ConsultantClockPort {
  now(): Date;
}


export interface ConsultantSettlementSourceRepositoryPort {
  listUnsettled(input: Readonly<{
    facilityId: string;
    consultantId: string;
    periodFrom: Date;
    periodThrough: Date;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<readonly ConsultantRevenueEntryView[]>;

  reserveForSettlement(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    revenueEntryIds: readonly string[];
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<number>;

  releaseSettlementReservation(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<number>;
}

export interface ConsultantSettlementItemRepositoryPort {
  appendMany(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    consultantId: string;
    items: readonly ConsultantSettlementItemInput[];
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<number>;
}

export interface ConsultantRevenueAdjustmentRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    adjustmentNumber: string;
    revenueEntry: ConsultantRevenueEntryView;
    settlementId: string | null;
    disputeId: string | null;
    eligibleRevenueDelta: string;
    consultantShareDelta: string;
    hospitalShareDelta: string;
    taxWithholdingDelta: string;
    deductionDelta: string;
    netPayableDelta: string;
    reasonCode: string;
    reason: string;
    attachmentIds: readonly string[];
    approvalRequestId: string;
    operationKey: string;
    requestedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueAdjustmentView>;

  findById(input: Readonly<{
    facilityId: string;
    adjustmentId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueAdjustmentView | null>;

  approve(input: Readonly<{
    actor: ConsultantSharingActorContext;
    adjustmentId: string;
    checkerUserId: string;
    approvedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueAdjustmentView | null>;

  markPosted(input: Readonly<{
    actor: ConsultantSharingActorContext;
    adjustmentId: string;
    postedRevenueEntryId: string;
    postedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueAdjustmentView | null>;

  postApprovedEntry(input: Readonly<{
    actor: ConsultantSharingActorContext;
    adjustmentId: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ adjustment: ConsultantRevenueAdjustmentView; entry: ConsultantRevenueEntryView }>>;
}

export interface ConsultantRevenueReversalRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    reversalNumber: string;
    revenueEntry: ConsultantRevenueEntryView;
    source: ConsultantFinancialChangeReference;
    attachmentIds: readonly string[];
    approvalRequestId: string;
    operationKey: string;
    requestedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueReversalView>;

  findById(input: Readonly<{
    facilityId: string;
    reversalId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueReversalView | null>;

  approve(input: Readonly<{
    actor: ConsultantSharingActorContext;
    reversalId: string;
    checkerUserId: string;
    approvedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueReversalView | null>;

  markPosted(input: Readonly<{
    actor: ConsultantSharingActorContext;
    reversalId: string;
    reversalRevenueEntryId: string;
    postedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantRevenueReversalView | null>;

  postApprovedEntry(input: Readonly<{
    actor: ConsultantSharingActorContext;
    reversalId: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ reversal: ConsultantRevenueReversalView; entry: ConsultantRevenueEntryView }>>;
}

export interface ConsultantSettlementPaymentRepositoryPort {
  create(input: Readonly<{
    actor: ConsultantSharingActorContext;
    payoutNumber: string;
    settlement: ConsultantSettlementView;
    paymentMethod: ConsultantSettlementPaymentView['paymentMethod'];
    amount: string;
    taxWithholdingAmount: string;
    advanceRecoveryAmount: string;
    overpaymentRecoveryAmount: string;
    otherDeductionAmount: string;
    netDisbursedAmount: string;
    paymentReferenceHash: string;
    paymentReferenceMasked: string;
    payoutProfileReferenceHash: string | null;
    payoutProfileReferenceMasked: string | null;
    cashShiftId: string | null;
    cashCounterId: string | null;
    approvalRequestId: string;
    operationKey: string;
    requestedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementPaymentView>;

  findById(input: Readonly<{
    facilityId: string;
    settlementPaymentId: string;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementPaymentView | null>;

  approve(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementPaymentId: string;
    checkerUserId: string;
    approvedAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementPaymentView | null>;

  markPaid(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementPaymentId: string;
    paymentId: string;
    ledgerTransactionId: string;
    paidAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementPaymentView | null>;

  createReversal(input: Readonly<{
    actor: ConsultantSharingActorContext;
    reversalPayoutNumber: string;
    originalPayment: ConsultantSettlementPaymentView;
    makerUserId: string;
    paymentReversalId: string;
    ledgerTransactionId: string;
    reason: string;
    approvalRequestId: string;
    operationKey: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<ConsultantSettlementPaymentView>;
}

export interface ConsultantAuthoritativeFinancialChangePort {
  loadChange(input: Readonly<{
    actor: ConsultantSharingActorContext;
    source: ConsultantFinancialChangeReference;
    transaction?: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{
    originalEntry: ConsultantRevenueEntryView;
    changedActivity: AuthoritativeConsultantFinancialActivity;
  }> | null>;
}

export interface ConsultantDisputeHistoryRepositoryPort {
  append(input: Readonly<{
    actor: ConsultantSharingActorContext;
    dispute: ConsultantDisputeView;
    fromStatus: ConsultantDisputeStatus | null;
    toStatus: ConsultantDisputeStatus;
    reason: string;
    attachmentIds: readonly string[];
    approvalRequestId: string | null;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<void>;
}

export interface ConsultantReconciliationRepositoryPort {
  reconcileRevenue(input: Readonly<{
    facilityId: string;
    from: Date;
    through: Date;
  }>): Promise<readonly import('./consultant-sharing.contracts.js').ConsultantRevenueReconciliationLine[]>;

  reconcileSettlements(input: Readonly<{
    facilityId: string;
    from: Date;
    through: Date;
  }>): Promise<readonly ConsultantSettlementReconciliationLine[]>;

  reconcileLedger(input: Readonly<{
    facilityId: string;
    from: Date;
    through: Date;
  }>): Promise<readonly ConsultantLedgerReconciliationLine[]>;
}

export interface ConsultantReconciliationServicePort {
  run(input: Readonly<{
    actor: ConsultantSharingActorContext;
    from: Date;
    through: Date;
  }>): Promise<ConsultantReconciliationResult>;
}

export interface ConsultantFinancialAdjustmentLedgerPort {
  postRevenueAdjustment(input: Readonly<{
    actor: ConsultantSharingActorContext;
    sourceRevenueEntryId: string;
    adjustmentId: string;
    consultantId: string;
    consultantShareDelta: string;
    hospitalShareDelta: string;
    currency: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string }>>;

  postRevenueReversal(input: Readonly<{
    actor: ConsultantSharingActorContext;
    sourceRevenueEntryId: string;
    reversalRevenueEntryId: string;
    consultantId: string;
    consultantShareAmount: string;
    hospitalShareAmount: string;
    currency: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string }>>;

  postPayout(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    settlementPaymentId: string;
    consultantId: string;
    paymentId: string;
    amount: string;
    netDisbursedAmount: string;
    taxWithholdingAmount: string;
    otherDeductionAmount: string;
    currency: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string }>>;

  postPayoutReversal(input: Readonly<{
    actor: ConsultantSharingActorContext;
    settlementId: string;
    originalSettlementPaymentId: string;
    paymentReversalId: string;
    consultantId: string;
    amount: string;
    netDisbursedAmount: string;
    taxWithholdingAmount: string;
    otherDeductionAmount: string;
    currency: string;
    occurredAt: Date;
    transaction: ConsultantSharingTransactionContext;
  }>): Promise<Readonly<{ ledgerTransactionId: string }>>;
}