import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  AssistanceAttachmentInput,
  AssignAssistanceWorkItemInput,
  CreateAssistanceAllocationInput,
  CreateAssistanceApplicationInput,
  CreateAssistanceFundInput,
  DecideAssistanceApprovalInput,
  EligibilityEvaluationContext,
  EligibilityEvaluationResult,
  EscalateAssistanceWorkItemInput,
  RecordAssistanceReviewInput,
  RecordFundInflowInput,
  RequestAssistanceApprovalInput,
  RequestFundTransferInput,
  ReturnFundsInput,
  ReverseAssistanceAllocationInput,
  UpdateAssistanceApplicationInput,
  UpdateAssistanceFundInput,
  WelfareZakatActorContext,
  WelfareZakatListQuery,
} from './welfare-zakat.contracts.js';
import type {
  AssistanceAllocationStatus,
  AssistanceApplicationStatus,
  AssistanceApprovalStatus,
  AssistanceFundStatus,
  AssistanceReversalStatus,
  AssistanceWorkQueueType,
  EligibilityOutcome,
  FundTransactionType,
} from './welfare-zakat.constants.js';
import type {
  AssistanceAllocationRecord,
  AssistanceApplicationHistoryRecord,
  AssistanceApplicationRecord,
  AssistanceApprovalHistoryRecord,
  AssistanceApprovalRecord,
  AssistanceFundRecord,
  AssistanceReservationRecord,
  AssistanceReviewRecord,
  AssistanceWorkItemRecord,
  EligibilityEvaluationSnapshotRecord,
  FundAllocationReversalRecord,
  FundReturnRecord,
  FundTransactionRecord,
  FundTransferRecord,
  WelfareZakatMongoSession,
} from './welfare-zakat.persistence.types.js';

export interface WelfareZakatTransactionContext {
  transactionId: string;
  session: WelfareZakatMongoSession;
}

export interface WelfareZakatTransactionManagerPort {
  execute<T>(input: Readonly<{
    transactionType: string;
    idempotencyKey: string;
    actorUserId: string;
    facilityId: string;
    correlationId: string;
    lockKeys: readonly string[];
    idempotencyPayload: unknown;
    journalPayload: unknown;
    execute(context: WelfareZakatTransactionContext): Promise<T>;
  }>): Promise<T>;
}

export interface WelfareZakatAccessPolicyPort {
  authorize(input: Readonly<{
    actor: WelfareZakatActorContext;
    permission: PermissionKey | string;
    resourceFacilityId?: string;
    makerUserId?: string | null;
    assigneeUserId?: string | null;
    sensitiveFinancialAction?: boolean;
  }>): Promise<Readonly<{
    allowed: boolean;
    denialReason: string | null;
    requiresIndependentApproval: boolean;
  }>>;
}

export interface WelfareZakatAuditPort {
  record(input: Readonly<{
    actor: WelfareZakatActorContext;
    action: string;
    entityType: string;
    entityId: string;
    reason: string | null;
    before: unknown;
    after: unknown;
    transactionId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<void>;
}

export interface WelfareZakatOutboxPort {
  enqueue(input: Readonly<{
    facilityId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
    transactionId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<void>;
}

export interface WelfareZakatClockPort {
  now(): Date;
}

export interface WelfareZakatNumberSequencePort {
  next(input: Readonly<{
    facilityId: string;
    sequenceKey: string;
    effectiveAt: Date;
    actorUserId: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<string>;
}

export interface WelfareZakatEncryptionPort {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

export interface WelfareZakatAttachmentPort {
  assertAttachmentsUsable(input: Readonly<{
    facilityId: string;
    actorUserId: string;
    attachments: readonly AssistanceAttachmentInput[];
  }>): Promise<void>;

  assertAttachmentIdsUsable(input: Readonly<{
    facilityId: string;
    actorUserId: string;
    attachmentIds: readonly string[];
  }>): Promise<void>;
}

export interface AssistanceFundRepositoryPort {
  create(
    actor: WelfareZakatActorContext,
    input: CreateAssistanceFundInput,
    authoritative: Readonly<{
      operationKey: string;
      fundingSourceReferenceHash: string | null;
      fundingSourceReferenceMasked: string | null;
      donorReferenceHash: string | null;
      donorReferenceMasked: string | null;
      donationReferenceHash: string | null;
      grantReferenceHash: string | null;
      restrictionNarrativeEncrypted: string | null;
    }>,
    transaction: WelfareZakatTransactionContext,
  ): Promise<AssistanceFundRecord>;

  findById(
    facilityId: string,
    fundId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceFundRecord | null>;

  findByCode(
    facilityId: string,
    fundCode: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceFundRecord | null>;

  list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly AssistanceFundRecord[];
    total: number;
  }>>;

  update(
    actor: WelfareZakatActorContext,
    fundId: string,
    expectedVersion: number,
    input: UpdateAssistanceFundInput,
    encrypted: Readonly<{
      fundingSourceReferenceHash?: string | null;
      fundingSourceReferenceMasked?: string | null;
      donorReferenceHash?: string | null;
      donorReferenceMasked?: string | null;
      donationReferenceHash?: string | null;
      grantReferenceHash?: string | null;
      restrictionNarrativeEncrypted?: string | null;
    }>,
    transaction: WelfareZakatTransactionContext,
  ): Promise<AssistanceFundRecord | null>;

  changeStatus(input: Readonly<{
    actor: WelfareZakatActorContext;
    fundId: string;
    expectedVersion: number;
    fromStatus: AssistanceFundStatus;
    toStatus: AssistanceFundStatus;
    approvalRequestId: string | null;
    reason: string;
    occurredAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceFundRecord | null>;

  applyFinancialPosition(input: Readonly<{
    actor: WelfareZakatActorContext;
    fundId: string;
    expectedVersion: number;
    balances: Readonly<Record<string, string>>;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceFundRecord | null>;
}

export interface FundTransactionRepositoryPort {
  append(input: Readonly<{
    actor: WelfareZakatActorContext;
    fund: AssistanceFundRecord;
    transactionNumber: string;
    operationKey: string;
    transactionType: FundTransactionType;
    direction: 'CREDIT' | 'DEBIT' | 'MEMO';
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    applicationId?: string | null;
    approvalId?: string | null;
    reservationId?: string | null;
    allocationId?: string | null;
    transferId?: string | null;
    invoiceId?: string | null;
    invoiceLineId?: string | null;
    paymentId?: string | null;
    refundId?: string | null;
    creditNoteId?: string | null;
    debitNoteId?: string | null;
    claimId?: string | null;
    claimAdjustmentId?: string | null;
    donorReferenceHash?: string | null;
    donorReferenceMasked?: string | null;
    donationReferenceHash?: string | null;
    receiptReferenceHash?: string | null;
    receiptReferenceMasked?: string | null;
    fundingSourceReferenceHash?: string | null;
    reason: string;
    attachmentIds?: readonly string[];
    makerUserId?: string | null;
    checkerUserId?: string | null;
    approvalRequestId?: string | null;
    occurredAt: Date;
    reversalOfTransactionId?: string | null;
    immutableHash: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundTransactionRecord>;

  findById(
    facilityId: string,
    transactionId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransactionRecord | null>;

  listByFund(
    facilityId: string,
    fundId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly FundTransactionRecord[];
    total: number;
  }>>;

  findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransactionRecord | null>;
}

export interface AssistanceApplicationRepositoryPort {
  create(
    actor: WelfareZakatActorContext,
    input: CreateAssistanceApplicationInput,
    authoritative: Readonly<{
      operationKey: string;
      duplicateKey: string;
      applicationNumber: string;
      applicantSnapshotEncrypted: string;
      householdSnapshotEncrypted: string;
      employmentSnapshotEncrypted: string;
      financialConditionSnapshotEncrypted: string;
      zakatDeclarationSnapshotEncrypted: string | null;
      questionnaireSnapshotEncrypted: string;
      requestedServicesSnapshotEncrypted: string | null;
      notesEncrypted: string | null;
      householdSize: number;
      dependantCount: number;
      monthlyHouseholdIncome: string;
      monthlyHouseholdExpenses: string;
      monthlyDisposableIncome: string;
      perCapitaIncome: string;
    }>,
    transaction: WelfareZakatTransactionContext,
  ): Promise<AssistanceApplicationRecord>;

  findById(
    facilityId: string,
    applicationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApplicationRecord | null>;

  findDuplicate(
    facilityId: string,
    duplicateKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApplicationRecord | null>;

  list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly AssistanceApplicationRecord[];
    total: number;
  }>>;

  updateDraft(
    actor: WelfareZakatActorContext,
    applicationId: string,
    expectedVersion: number,
    input: UpdateAssistanceApplicationInput,
    encrypted: Readonly<Record<string, string | null>>,
    transaction: WelfareZakatTransactionContext,
  ): Promise<AssistanceApplicationRecord | null>;

  transition(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    expectedVersion: number;
    fromStatus: AssistanceApplicationStatus;
    toStatus: AssistanceApplicationStatus;
    reason: string;
    makerUserId?: string | null;
    checkerUserId?: string | null;
    approvalRequestId?: string | null;
    occurredAt: Date;
    updates?: Readonly<Record<string, unknown>>;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationRecord | null>;

  updateFinancialSummary(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    expectedVersion: number;
    amounts: Readonly<Record<string, string>>;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationRecord | null>;

  recordEligibility(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    expectedVersion: number;
    outcome: EligibilityOutcome;
    eligibilitySnapshotId: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationRecord | null>;
}

export interface AssistanceApplicationHistoryRepositoryPort {
  append(input: Readonly<{
    actor: WelfareZakatActorContext;
    application: AssistanceApplicationRecord;
    fromStatus: AssistanceApplicationStatus | null;
    toStatus: AssistanceApplicationStatus;
    reason: string;
    makerUserId?: string | null;
    checkerUserId?: string | null;
    approvalRequestId?: string | null;
    snapshot: Readonly<Record<string, unknown>>;
    snapshotHash: string;
    immutableHash: string;
    occurredAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationHistoryRecord>;
}

export interface AssistanceReviewRepositoryPort {
  appendReview(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    reviewSequence: number;
    input: RecordAssistanceReviewInput;
    assessmentEncrypted: string;
    findingsEncrypted: string;
    reviewedAt: Date;
    immutableHash: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceReviewRecord>;

  appendEligibilitySnapshot(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    fundId: string;
    applicationVersion: number;
    fundVersion: number;
    result: EligibilityEvaluationResult;
    contextHash: string;
    evaluatedAt: Date;
    immutableHash: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<EligibilityEvaluationSnapshotRecord>;

  latestEligibilitySnapshot(
    facilityId: string,
    applicationId: string,
    fundId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<EligibilityEvaluationSnapshotRecord | null>;
}

export interface AssistanceApprovalRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    application: AssistanceApplicationRecord;
    fund: AssistanceFundRecord;
    input: RequestAssistanceApprovalInput;
    operationKey: string;
    approvalNumber: string;
    conditionsEncrypted: string | null;
    notesEncrypted: string | null;
    expiresAt: Date | null;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalRecord>;

  findById(
    facilityId: string,
    approvalId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApprovalRecord | null>;

  listByApplication(
    facilityId: string,
    applicationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<readonly AssistanceApprovalRecord[]>;

  decide(input: Readonly<{
    actor: WelfareZakatActorContext;
    approvalId: string;
    expectedVersion: number;
    fromStatus: AssistanceApprovalStatus;
    toStatus: AssistanceApprovalStatus;
    decision: DecideAssistanceApprovalInput;
    authoritativeApprovedAmount: string;
    conditionsEncrypted?: string | null;
    checkerUserId: string;
    decidedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalRecord | null>;

  applyFinancialSummary(input: Readonly<{
    actor: WelfareZakatActorContext;
    approvalId: string;
    expectedVersion: number;
    amounts: Readonly<Record<string, string>>;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalRecord | null>;

  expire(input: Readonly<{
    facilityId: string;
    approvalId: string;
    expectedVersion: number;
    expiredAt: Date;
    actorUserId: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalRecord | null>;
}

export interface AssistanceApprovalHistoryRepositoryPort {
  append(input: Readonly<{
    actor: WelfareZakatActorContext;
    approval: AssistanceApprovalRecord;
    fromStatus: AssistanceApprovalStatus | null;
    toStatus: AssistanceApprovalStatus;
    checkerUserId?: string | null;
    reason: string;
    occurredAt: Date;
    immutableHash: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalHistoryRecord>;
}

export interface AssistanceReservationRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    operationKey: string;
    applicationId: string;
    approvalId: string;
    fundId: string;
    patientId: string;
    patientAccountId: string;
    invoiceId: string;
    amount: string;
    priority: number;
    expiresAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceReservationRecord>;

  findById(
    facilityId: string,
    reservationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceReservationRecord | null>;

  consume(input: Readonly<{
    actor: WelfareZakatActorContext;
    reservationId: string;
    expectedVersion: number;
    amount: string;
    consumedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceReservationRecord | null>;

  release(input: Readonly<{
    actor: WelfareZakatActorContext;
    reservationId: string;
    expectedVersion: number;
    amount: string;
    status: 'RELEASED' | 'EXPIRED' | 'CANCELLED' | 'REVERSED';
    reason: string;
    releasedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceReservationRecord | null>;

  listExpired(
    facilityId: string,
    now: Date,
    limit: number,
  ): Promise<readonly AssistanceReservationRecord[]>;
}

export interface AssistanceAllocationRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    input: CreateAssistanceAllocationInput;
    operationKey: string;
    duplicateKey: string;
    allocationNumber: string;
    authoritativeAmount: string;
    allocatedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceAllocationRecord>;

  findById(
    facilityId: string,
    allocationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceAllocationRecord | null>;

  findDuplicate(
    facilityId: string,
    duplicateKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceAllocationRecord | null>;

  list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly AssistanceAllocationRecord[];
    total: number;
  }>>;

  transition(input: Readonly<{
    actor: WelfareZakatActorContext;
    allocationId: string;
    expectedVersion: number;
    fromStatus: AssistanceAllocationStatus;
    toStatus: AssistanceAllocationStatus;
    reason: string;
    approvedBy?: string | null;
    approvalRequestId?: string | null;
    occurredAt: Date;
    financialUpdates?: Readonly<Record<string, string>>;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceAllocationRecord | null>;

  applyFinancialSummary(input: Readonly<{
    actor: WelfareZakatActorContext;
    allocationId: string;
    expectedVersion: number;
    amounts: Readonly<Record<string, string>>;
    lineAmounts?: readonly Readonly<{
      invoiceLineId: string;
      amounts: Readonly<Record<string, string>>;
    }>[];
    status: AssistanceAllocationStatus;
    reversalStatus?: AssistanceReversalStatus | null;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceAllocationRecord | null>;
}

export interface AssistanceReversalRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    allocation: AssistanceAllocationRecord;
    input: ReverseAssistanceAllocationInput;
    operationKey: string;
    immutableHash: string;
    requestedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundAllocationReversalRecord>;

  findById(
    facilityId: string,
    reversalId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundAllocationReversalRecord | null>;

  post(input: Readonly<{
    actor: WelfareZakatActorContext;
    reversalId: string;
    checkerUserId: string;
    postedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundAllocationReversalRecord | null>;
}

export interface FundReturnRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    returnType: 'REFUND' | 'REPAYMENT' | 'RECOVERY';
    allocation: AssistanceAllocationRecord;
    input: ReturnFundsInput;
    operationKey: string;
    makerUserId: string;
    checkerUserId: string;
    postedAt: Date;
    immutableHash: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundReturnRecord>;
}

export interface FundTransferRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    input: RequestFundTransferInput;
    operationKey: string;
    transferNumber: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundTransferRecord>;

  findById(
    facilityId: string,
    transferId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransferRecord | null>;

  list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly FundTransferRecord[];
    total: number;
  }>>;

  post(input: Readonly<{
    actor: WelfareZakatActorContext;
    transferId: string;
    expectedVersion: number;
    checkerUserId: string;
    sourceTransactionId: string;
    destinationTransactionId: string;
    postedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundTransferRecord | null>;

  reject(input: Readonly<{
    actor: WelfareZakatActorContext;
    transferId: string;
    expectedVersion: number;
    checkerUserId: string;
    reason: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundTransferRecord | null>;

  reverse(input: Readonly<{
    actor: WelfareZakatActorContext;
    transferId: string;
    expectedVersion: number;
    reversedAt: Date;
    reason: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<FundTransferRecord | null>;
}

export interface AssistanceWorkQueueRepositoryPort {
  create(input: Readonly<{
    actor: WelfareZakatActorContext;
    applicationId: string;
    approvalId?: string | null;
    allocationId?: string | null;
    workQueueType: AssistanceWorkQueueType;
    priority: number;
    followUpAt?: Date | null;
    reasonEncrypted?: string | null;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceWorkItemRecord>;

  findById(
    facilityId: string,
    workItemId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceWorkItemRecord | null>;

  assign(input: Readonly<{
    actor: WelfareZakatActorContext;
    workItemId: string;
    input: AssignAssistanceWorkItemInput;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceWorkItemRecord | null>;

  escalate(input: Readonly<{
    actor: WelfareZakatActorContext;
    workItemId: string;
    input: EscalateAssistanceWorkItemInput;
    reasonEncrypted: string;
    escalatedAt: Date;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceWorkItemRecord | null>;

  list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{
    records: readonly AssistanceWorkItemRecord[];
    total: number;
  }>>;
}

export interface WelfareZakatPatientContextPort {
  loadApplicationContext(input: Readonly<{
    facilityId: string;
    patientId: string;
    guardianId?: string | null;
    encounterId?: string | null;
    admissionId?: string | null;
    invoiceId?: string | null;
    claimId?: string | null;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    patientId: string;
    patientStatus: string;
    patientCategoryCode: string | null;
    ageYears: number | null;
    guardianId: string | null;
    guardianRequired: boolean;
    guardianValid: boolean;
    encounterId: string | null;
    admissionId: string | null;
    departmentId: string | null;
    diagnosisCodes: readonly string[];
  }>>;

  assertRecordAccess(input: Readonly<{
    actor: WelfareZakatActorContext;
    patientId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<void>;
}

export interface WelfareZakatAuthoritativeBillingPort {
  loadAllocationSource(input: Readonly<{
    facilityId: string;
    patientId: string;
    patientAccountId: string;
    invoiceId: string;
    invoiceLineIds: readonly string[];
    claimId?: string | null;
    asOf: Date;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    patientAccount: Readonly<{
      id: string;
      patientId: string;
      status: string;
      currency: string;
      patientResponsibilityAmount: string;
      welfareAmount: string;
      payerResponsibilityAmount: string;
      outstandingAmount: string;
    }>;
    invoice: Readonly<{
      id: string;
      patientId: string;
      patientAccountId: string;
      status: string;
      currency: string;
      netAmount: string;
      payerAmount: string;
      welfareAmount: string;
      patientAmount: string;
      outstandingAmount: string;
      refundableAmount: string;
      finalizedAt: Date | null;
    }>;
    lines: readonly Readonly<{
      invoiceLineId: string;
      sourceModule: string;
      sourceRecordId: string | null;
      departmentId: string | null;
      serviceCategory: string;
      serviceCode: string;
      netAmount: string;
      payerAmount: string;
      welfareAmount: string;
      patientAmount: string;
      outstandingAmount: string;
      packageEnrollmentId: string | null;
      patientCoverageId: string | null;
      claimableAmount: string;
      claimApprovedAmount: string;
      claimPaidAmount: string;
    }>[];
  }>>;

  assertFundReturnSource(input: Readonly<{
    facilityId: string;
    allocation: AssistanceAllocationRecord;
    returnType: 'REFUND' | 'REPAYMENT' | 'RECOVERY';
    amount: string;
    paymentId?: string | null;
    refundId?: string | null;
    creditNoteId?: string | null;
    debitNoteId?: string | null;
    claimAdjustmentId?: string | null;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    makerUserId: string;
    sourceRecordId: string;
  }>>;

  applyAllocation(input: Readonly<{
    actor: WelfareZakatActorContext;
    allocationId: string;
    patientAccountId: string;
    invoiceId: string;
    lines: readonly Readonly<{
      invoiceLineId: string;
      amount: string;
    }>[];
    transaction: WelfareZakatTransactionContext;
  }>): Promise<void>;

  reverseAllocation(input: Readonly<{
    actor: WelfareZakatActorContext;
    allocationId: string;
    invoiceId: string;
    invoiceLineId?: string | null;
    amount: string;
    reason: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<void>;

  assertAllocationReconciliation(input: Readonly<{
    facilityId: string;
    allocationId: string;
    invoiceId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<void>;
}

export interface WelfareZakatCoverageClaimsCoordinationPort {
  resolveCoordination(input: Readonly<{
    facilityId: string;
    patientId: string;
    invoiceId: string;
    invoiceLineIds: readonly string[];
    asOf: Date;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    sponsorAdjudicationComplete: boolean;
    welfareMayApply: boolean;
    blockingReasons: readonly string[];
    lines: readonly Readonly<{
      invoiceLineId: string;
      packageAmount: string;
      sponsorAllocatedAmount: string;
      claimableAmount: string;
      claimApprovedAmount: string;
      patientResponsibilityAmount: string;
      existingAssistanceAmount: string;
      maximumAdditionalAssistanceAmount: string;
    }>[];
  }>>;
}

export interface WelfareZakatEligibilityContextPort {
  build(input: Readonly<{
    actor: WelfareZakatActorContext;
    application: AssistanceApplicationRecord;
    fund: AssistanceFundRecord;
    asOf: Date;
    session: WelfareZakatMongoSession;
  }>): Promise<EligibilityEvaluationContext>;

  calculateLimitRemaining(input: Readonly<{
    facilityId: string;
    patientId: string;
    fundId: string;
    applicationId: string;
    invoiceId?: string | null;
    invoiceLineId?: string | null;
    serviceCategory?: string | null;
    serviceCode?: string | null;
    asOf: Date;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    patientPeriodRemainingAmount: string | null;
    patientLifetimeRemainingAmount: string | null;
    perInvoiceRemainingAmount: string | null;
    perServiceRemainingAmount: string | null;
  }>>;
}

export interface WelfareZakatFinancialApprovalPort {
  assertApproved(input: Readonly<{
    facilityId: string;
    approvalRequestId: string;
    action: string;
    entityId: string;
    amount: string;
    makerUserId: string;
    checkerUserId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<void>;
}

export interface WelfareZakatFinancialLedgerPort {
  postFundFinancialEvent(input: Readonly<{
    actor: WelfareZakatActorContext;
    fundId: string;
    eventType: string;
    amount: string;
    sourceRecordId: string;
    patientId?: string | null;
    patientAccountId?: string | null;
    invoiceId?: string | null;
    paymentId?: string | null;
    currency: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<void>;
}

export interface WelfareZakatFinancialDischargePort {
  refreshClearance(input: Readonly<{
    facilityId: string;
    patientAccountId: string;
    invoiceId: string;
    actorUserId: string;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<void>;
}

export interface WelfareZakatReconciliationPort {
  reconcileFund(input: Readonly<{
    facilityId: string;
    fundId: string;
    asOf: Date;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    reconciled: boolean;
    expectedBalance: string;
    actualBalance: string;
    reservedBalance: string;
    committedBalance: string;
    differences: readonly string[];
  }>>;

  reconcileAllocation(input: Readonly<{
    facilityId: string;
    allocationId: string;
    session: WelfareZakatMongoSession;
  }>): Promise<Readonly<{
    reconciled: boolean;
    differences: readonly string[];
  }>>;
}

export interface WelfareZakatWorkflowPort {
  transitionApplication(input: Readonly<{
    actor: WelfareZakatActorContext;
    application: AssistanceApplicationRecord;
    toStatus: AssistanceApplicationStatus;
    reason: string;
    makerUserId?: string | null;
    checkerUserId?: string | null;
    approvalRequestId?: string | null;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationRecord>;

  transitionApproval(input: Readonly<{
    actor: WelfareZakatActorContext;
    approval: AssistanceApprovalRecord;
    toStatus: AssistanceApprovalStatus;
    reason: string;
    checkerUserId?: string | null;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApprovalRecord>;

  recordEligibilityOutcome(input: Readonly<{
    actor: WelfareZakatActorContext;
    application: AssistanceApplicationRecord;
    fund: AssistanceFundRecord;
    outcome: EligibilityOutcome;
    transaction: WelfareZakatTransactionContext;
  }>): Promise<AssistanceApplicationRecord>;
}