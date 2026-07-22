import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  ApproveClaimAppealInput,
  AssignClaimWorkItemInput,
  EscalateClaimWorkItemInput,
  ClaimAttachmentInput,
  ClaimDiagnosisInput,
  ClaimsActorContext,
  ClaimsListQuery,
  CreateClaimAppealInput,
  CreateClaimBatchInput,
  CreateClaimInput,
  ImportRemittanceInput,
  RecordClaimAdjudicationInput,
  RecordClaimAppealDecisionInput,
  RequestClaimAdjustmentInput,
  RequestClaimWriteOffInput,
  RecordSubmissionAcknowledgementInput,
  SubmitClaimAppealInput,
} from './claims.contracts.js';

import type {
  ClaimStatus,
  ClaimWorkQueueType,
} from './claims.constants.js';

import type {
  ClaimAdjudicationRecord,
  ClaimAdjustmentRecord,
  ClaimAppealRecord,
  ClaimBatchRecord,
  ClaimDenialRecord,
  ClaimDocumentRecord,
  ClaimLineRecord,
  ClaimPaymentAllocationRecord,
  ClaimRecord,
  ClaimRemittanceRecord,
  ClaimsMongoSession,
  ClaimStatusHistoryRecord,
  ClaimSubmissionRecord,
  ClaimValidationSnapshotRecord,
  ClaimVersionHistoryRecord,
  ClaimWorkItemRecord,
} from './claims.persistence.types.js';

export interface ClaimsTransactionContext {
  transactionId: string;
  session: ClaimsMongoSession;
}

export interface ClaimsTransactionManagerPort {
  execute<T>(input: Readonly<{
    transactionType: string;
    idempotencyKey: string;
    actorUserId: string;
    facilityId: string;
    correlationId: string;
    lockKeys: readonly string[];
    idempotencyPayload: unknown;
    journalPayload: unknown;
    execute(context: ClaimsTransactionContext): Promise<T>;
  }>): Promise<T>;
}

export interface ClaimsAccessPolicyPort {
  authorize(input: Readonly<{
    actor: ClaimsActorContext;
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

export interface ClaimsAuditPort {
  record(input: Readonly<{
    actor: ClaimsActorContext;
    action: string;
    entityType: string;
    entityId: string;
    reason: string | null;
    before: unknown;
    after: unknown;
    transactionId: string;
    session: ClaimsMongoSession;
  }>): Promise<void>;
}

export interface ClaimsOutboxPort {
  enqueue(input: Readonly<{
    facilityId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
    transactionId: string;
    session: ClaimsMongoSession;
  }>): Promise<void>;
}

export interface ClaimsClockPort {
  now(): Date;
}

export interface ClaimsNumberSequencePort {
  next(input: Readonly<{
    facilityId: string;
    sequenceKey: string;
    effectiveAt: Date;
    actorUserId: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<string>;
}

export interface ClaimsEncryptionPort {
  encrypt(value: string): Promise<string>;
}

export interface ClaimsAttachmentPort {
  assertAttachmentsUsable(input: Readonly<{
    facilityId: string;
    actorUserId: string;
    attachments: readonly ClaimAttachmentInput[];
  }>): Promise<void>;
}

export interface ClaimsRepositoryPort {
  create(
    actor: ClaimsActorContext,
    input: CreateClaimInput,
    authoritative: Readonly<{
      claimNumber: string;
      claimVersionNumber: number;
      priorClaimVersionId: string | null;
      operationKey: string;
      duplicateKey: string;
      patientId: string;
      patientAccountId: string;
      encounterId: string | null;
      admissionId: string | null;
      payerType: string;
      policyReferenceHash: string | null;
      policyReferenceMasked: string | null;
      membershipReferenceHash: string | null;
      membershipReferenceMasked: string | null;
      employerReferenceHash: string | null;
      authorizationReferenceHash: string | null;
      serviceFrom: Date;
      serviceThrough: Date;
      currency: string;
      financials: Readonly<Record<string, string>>;
      diagnoses: readonly ClaimDiagnosisInput[];
      agingAnchorAt: Date;
      internalNoteEncrypted: string | null;
      payerNoteEncrypted: string | null;
      medicalNecessitySummaryEncrypted: string | null;
    }>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimRecord>;

  findById(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null>;

  findByNumber(
    facilityId: string,
    claimNumber: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null>;

  findByIds(
    facilityId: string,
    claimIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimRecord[]>;

  findActiveByDuplicateKey(
    facilityId: string,
    duplicateKey: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRecord | null>;

  list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimRecord[];
    totalItems: number;
  }>>;

  updateDraft(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    update: Readonly<{
      diagnoses?: readonly ClaimDiagnosisInput[];
      preauthorizationIds?: readonly string[];
      financials?: Readonly<Record<string, string>>;
      filingDeadline?: Date | null;
      internalNoteEncrypted?: string | null;
      payerNoteEncrypted?: string | null;
      medicalNecessitySummaryEncrypted?: string | null;
    }>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimRecord | null>;

  updateStatus(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimRecord | null>;

  updateFinancials(
    facilityId: string,
    claimId: string,
    expectedVersion: number,
    financials: Readonly<Record<string, string>>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimRecord | null>;
}

export interface ClaimLineRepositoryPort {
  createMany(
    actor: ClaimsActorContext,
    claimId: string,
    lines: readonly Readonly<Record<string, unknown>>[],
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimLineRecord[]>;

  replaceForDraft(
    actor: ClaimsActorContext,
    claimId: string,
    lines: readonly Readonly<Record<string, unknown>>[],
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimLineRecord[]>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimLineRecord[]>;

  findByIds(
    facilityId: string,
    claimId: string,
    lineIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimLineRecord[]>;

  updateFinancials(
    facilityId: string,
    claimLineId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimLineRecord | null>;

  updateStatusesForClaim(
    facilityId: string,
    claimId: string,
    status: string,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<number>;
}

export interface ClaimDocumentRepositoryPort {
  replaceForDraft(
    actor: ClaimsActorContext,
    claimId: string,
    attachments: readonly ClaimAttachmentInput[],
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimDocumentRecord[]>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDocumentRecord[]>;

  appendForSubmission(
    actor: ClaimsActorContext,
    claimIds: readonly string[],
    attachmentId: string,
    description: string,
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimDocumentRecord[]>;
}

export interface ClaimWorkflowHistoryRepositoryPort {
  appendStatus(
    actor: ClaimsActorContext,
    input: Omit<ClaimStatusHistoryRecord, '_id' | 'facilityId'>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimStatusHistoryRecord>;

  appendVersion(
    actor: ClaimsActorContext,
    input: Omit<ClaimVersionHistoryRecord, '_id' | 'facilityId'>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimVersionHistoryRecord>;

  listStatusHistory(
    facilityId: string,
    claimId: string,
  ): Promise<readonly ClaimStatusHistoryRecord[]>;

  listVersionHistory(
    facilityId: string,
    claimId: string,
  ): Promise<readonly ClaimVersionHistoryRecord[]>;
}

export interface ClaimValidationRepositoryPort {
  createSnapshot(
    actor: ClaimsActorContext,
    input: Omit<ClaimValidationSnapshotRecord, keyof import('./claims.persistence.types.js').ClaimsPersistenceMetadata>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimValidationSnapshotRecord>;

  findById(
    facilityId: string,
    snapshotId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimValidationSnapshotRecord | null>;

  findLatestForClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimValidationSnapshotRecord | null>;
}

export interface ClaimBatchRepositoryPort {
  create(
    actor: ClaimsActorContext,
    input: CreateClaimBatchInput,
    batchNumber: string,
    totals: Readonly<{
      claimCount: number;
      claimedAmount: string;
      approvedAmount: string;
      paidAmount: string;
    }>,
    metadata: Readonly<{
      operationKey: string;
      notesEncrypted: string | null;
    }>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimBatchRecord>;

  findById(
    facilityId: string,
    batchId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimBatchRecord | null>;

  findActiveContainingClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimBatchRecord | null>;

  list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimBatchRecord[];
    totalItems: number;
  }>>;

  updateStatus(
    facilityId: string,
    batchId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimBatchRecord | null>;
}

export interface ClaimSubmissionRepositoryPort {
  createAttempt(
    actor: ClaimsActorContext,
    input: Readonly<Record<string, unknown>>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimSubmissionRecord>;

  findLatestForBatch(
    facilityId: string,
    batchId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimSubmissionRecord | null>;

  updateStatus(
    facilityId: string,
    submissionId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimSubmissionRecord | null>;

  recordAcknowledgement(
    facilityId: string,
    submissionId: string,
    input: RecordSubmissionAcknowledgementInput,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimSubmissionRecord | null>;
}

export interface ClaimAdjudicationRepositoryPort {
  create(
    actor: ClaimsActorContext,
    claimId: string,
    input: RecordClaimAdjudicationInput,
    calculated: Readonly<Record<string, unknown>>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAdjudicationRecord>;

  findById(
    facilityId: string,
    adjudicationId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjudicationRecord | null>;

  findLatest(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjudicationRecord | null>;
}

export interface ClaimDenialRepositoryPort {
  createMany(
    actor: ClaimsActorContext,
    denials: readonly Readonly<Record<string, unknown>>[],
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimDenialRecord[]>;

  findByIds(
    facilityId: string,
    claimId: string,
    denialIds: readonly string[],
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDenialRecord[]>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimDenialRecord[]>;

  resolveMany(
    facilityId: string,
    denialIds: readonly string[],
    resolution: string,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<number>;
}

export interface ClaimRemittanceRepositoryPort {
  create(
    actor: ClaimsActorContext,
    input: ImportRemittanceInput,
    remittanceNumber: string,
    calculated: Readonly<Record<string, unknown>>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimRemittanceRecord>;

  findByReference(
    facilityId: string,
    payerOrganizationId: string,
    remittanceReference: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRemittanceRecord | null>;

  findById(
    facilityId: string,
    remittanceId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimRemittanceRecord | null>;
}

export interface ClaimPaymentAllocationRepositoryPort {
  appendMany(
    actor: ClaimsActorContext,
    allocations: readonly Readonly<Record<string, unknown>>[],
    transaction: ClaimsTransactionContext,
  ): Promise<readonly ClaimPaymentAllocationRecord[]>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimPaymentAllocationRecord[]>;
}

export interface ClaimAdjustmentRepositoryPort {
  create(
    actor: ClaimsActorContext,
    claimId: string,
    input: RequestClaimAdjustmentInput | RequestClaimWriteOffInput,
    adjustmentType: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAdjustmentRecord>;

  findById(
    facilityId: string,
    adjustmentId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAdjustmentRecord | null>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimAdjustmentRecord[]>;

  approveAndPost(
    facilityId: string,
    adjustmentId: string,
    expectedVersion: number,
    approvalRequestId: string,
    checkerUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAdjustmentRecord | null>;
}

export interface ClaimAppealRepositoryPort {
  create(
    actor: ClaimsActorContext,
    claimId: string,
    appealNumber: string,
    input: CreateClaimAppealInput,
    encryptedGrounds: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAppealRecord>;

  findById(
    facilityId: string,
    appealId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimAppealRecord | null>;

  approve(
    facilityId: string,
    appealId: string,
    expectedVersion: number,
    input: ApproveClaimAppealInput,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAppealRecord | null>;

  submit(
    facilityId: string,
    appealId: string,
    expectedVersion: number,
    input: SubmitClaimAppealInput,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAppealRecord | null>;

  recordDecision(
    facilityId: string,
    appealId: string,
    input: RecordClaimAppealDecisionInput,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimAppealRecord | null>;

  listByClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<readonly ClaimAppealRecord[]>;
}

export interface ClaimWorkQueueRepositoryPort {
  findById(
    facilityId: string,
    workItemId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimWorkItemRecord | null>;

  list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimWorkItemRecord[];
    totalItems: number;
  }>>;

  upsertOpenItem(
    actor: ClaimsActorContext,
    input: Readonly<{
      claimId: string;
      claimLineId?: string | null;
      appealId?: string | null;
      workQueueType: ClaimWorkQueueType;
      priority: number;
      followUpAt?: Date | null;
      reasonEncrypted?: string | null;
    }>,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimWorkItemRecord>;

  assign(
    facilityId: string,
    workItemId: string,
    input: AssignClaimWorkItemInput,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimWorkItemRecord | null>;

  escalate(
    facilityId: string,
    workItemId: string,
    input: EscalateClaimWorkItemInput,
    actorUserId: string,
    reasonEncrypted: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimWorkItemRecord | null>;

  resolve(
    facilityId: string,
    workItemId: string,
    expectedVersion: number,
    actorUserId: string,
    transaction: ClaimsTransactionContext,
  ): Promise<ClaimWorkItemRecord | null>;
}

export interface ClaimsAuthoritativeBillingPort {
  loadClaimSource(input: Readonly<{
    facilityId: string;
    invoiceId: string;
    coverageDeterminationId: string;
    payerOrganizationId: string;
    panelPlanId: string;
    patientCoverageId: string;
    selectedInvoiceLineIds: readonly string[];
    asOf: Date;
    session: ClaimsMongoSession;
  }>): Promise<Readonly<{
    invoice: Readonly<{
      id: string;
      patientId: string;
      patientAccountId: string;
      encounterId: string | null;
      admissionId: string | null;
      status: string;
      currency: string;
      finalizedAt: Date | null;
    }>;
    coverage: Readonly<{
      id: string;
      status: string;
      payerOrganizationId: string;
      payerType: string;
      panelPlanId: string;
      patientCoverageId: string;
      policyReference: string | null;
      membershipReference: string | null;
      employerReference: string | null;
      authorizationReference: string | null;
    }>;
    lines: readonly Readonly<{
      invoiceLineId: string;
      chargeCatalogItemId: string;
      chargeCatalogCode: string;
      sourceModule: string;
      sourceRecordId: string | null;
      serviceCategory: string;
      serviceFrom: Date;
      serviceThrough: Date | null;
      providerId: string | null;
      departmentId: string | null;
      serviceCodeSystem: string;
      serviceCode: string;
      revenueCode: string | null;
      units: string;
      allocation: Readonly<{
        coverageAllocationId: string | null;
        packageEnrollmentId: string | null;
        grossAmount: string;
        packageAmount: string;
        sponsorAmount: string;
        patientAmount: string;
        deductibleAmount: string;
        copaymentAmount: string;
        coinsuranceAmount: string;
        excludedAmount: string;
      }>;
      preauthorizationId: string | null;
      preauthorizationRequired: boolean;
    }>[];
  }>>;

  assertInvoiceClaimReconciliation(input: Readonly<{
    facilityId: string;
    invoiceId: string;
    claimId: string;
    session: ClaimsMongoSession;
  }>): Promise<void>;
}

export interface ClaimsCoverageUtilizationPort {
  reserveForClaim(input: Readonly<{
    actor: ClaimsActorContext;
    claimId: string;
    coverageDeterminationId: string;
    invoiceLineIds: readonly string[];
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;

  reverseClaimReservation(input: Readonly<{
    actor: ClaimsActorContext;
    claimId: string;
    reason: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;
}

export interface ClaimsPaymentIntegrationPort {
  assertSponsorPayment(input: Readonly<{
    facilityId: string;
    sponsorPaymentId: string;
    payerOrganizationId: string;
    currency: string;
    session: ClaimsMongoSession;
  }>): Promise<Readonly<{
    amount: string;
    availableAmount: string;
    status: string;
  }>>;

  consumeSponsorPayment(input: Readonly<{
    facilityId: string;
    sponsorPaymentId: string;
    amount: string;
    actorUserId: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;
}

export interface ClaimsFinancialLedgerPort {
  postClaimReceivable(input: Readonly<{
    actor: ClaimsActorContext;
    claimId: string;
    payerOrganizationId: string;
    patientAccountId: string;
    invoiceId: string;
    amount: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;

  postClaimFinancialEvent(input: Readonly<{
    actor: ClaimsActorContext;
    claimId: string;
    eventType: string;
    amount: string;
    sourceRecordId: string;
    patientId: string;
    patientAccountId: string;
    invoiceId: string;
    paymentId?: string | null;
    currency: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;
}

export interface ClaimsFinancialDischargePort {
  refreshClearance(input: Readonly<{
    facilityId: string;
    patientAccountId: string;
    invoiceId: string;
    actorUserId: string;
    transaction: ClaimsTransactionContext;
  }>): Promise<void>;
}

export interface ClaimsApprovalPort {
  assertApproved(input: Readonly<{
    facilityId: string;
    approvalRequestId: string;
    action: string;
    entityId: string;
    makerUserId: string;
    checkerUserId: string;
    session: ClaimsMongoSession;
  }>): Promise<void>;
}

export interface ClaimsStatusPollingPort {
  poll(input: Readonly<{
    facilityId: string;
    submission: ClaimSubmissionRecord;
  }>): Promise<Readonly<{
    status: string;
    payerReferenceNumber: string | null;
    acknowledgementReference: string | null;
    rawPayload: unknown;
  }>>;
}

export interface ClaimsWorkflowPort {
  transition(input: Readonly<{
    actor: ClaimsActorContext;
    claim: ClaimRecord;
    toStatus: ClaimStatus;
    reason: string | null;
    makerUserId?: string | null;
    checkerUserId?: string | null;
    approvalRequestId?: string | null;
    transaction: ClaimsTransactionContext;
  }>): Promise<ClaimRecord>;
}