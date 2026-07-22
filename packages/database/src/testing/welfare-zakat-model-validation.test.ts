import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  FundReturnModel,
  InvoiceFundAllocationModel,
} from '../models/assistance-allocation.model.js';

import {
  AssistanceApplicationModel,
} from '../models/assistance-application.model.js';

import {
  AssistanceApprovalModel,
} from '../models/assistance-approval.model.js';

import {
  AssistanceFundModel,
  FundTransactionModel,
  FundTransferModel,
} from '../models/assistance-fund.model.js';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();
  return {
    facilityId: objectId(),
    transactionId: `tx-${objectId().toHexString()}`,
    correlationId: `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function assistanceFundInput() {
  return {
    ...commonFields(),
    operationKey: 'fund-create-operation-0001',
    fundCode: 'wf-general-2026',
    name: 'General Welfare Fund',
    description: 'Unrestricted patient welfare assistance',
    fundType: 'WELFARE' as const,
    categoryCode: 'general',
    restriction: 'UNRESTRICTED' as const,
    fundingSourceReferenceHash: null,
    fundingSourceReferenceMasked: null,
    donorReferenceHash: null,
    donorReferenceMasked: null,
    donationReferenceHash: null,
    grantReferenceHash: null,
    restrictionNarrativeEncrypted: null,
    effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'DRAFT' as const,
    currency: 'PKR' as const,
    openingBalance: '1000.00',
    inflowAmount: '500.00',
    transferInAmount: '0.00',
    transferOutAmount: '100.00',
    adjustmentIncreaseAmount: '0.00',
    adjustmentDecreaseAmount: '0.00',
    ledgerBalance: '1200.00',
    reservedBalance: '100.00',
    committedBalance: '100.00',
    availableBalance: '1000.00',
    utilizedBalance: '200.00',
    reversedBalance: '0.00',
    refundAmount: '0.00',
    repaymentAmount: '0.00',
    recoveryAmount: '0.00',
    writeOffAmount: '0.00',
    defaultEligibilityOutcome: 'MANUAL_REVIEW' as const,
    eligibilityRules: [],
    allowedDepartmentIds: [],
    excludedDepartmentIds: [],
    allowedServiceCategories: [],
    excludedServiceCategories: [],
    allowedServiceCodes: [],
    excludedServiceCodes: [],
    allowedPatientCategoryCodes: [],
    excludedPatientCategoryCodes: [],
    allowedDiagnosisCodes: [],
    excludedDiagnosisCodes: [],
    limits: [],
    requiresZakatDeclaration: false,
    requiresSocialWelfareReview: true,
    requiresClinicalReview: false,
    approvalMatrixCode: 'wf-standard',
    facilitySpecific: true,
    activationApprovalRequestId: null,
    activatedAt: null,
    activatedBy: null,
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    closedAt: null,
    closedBy: null,
    closureReason: null,
  };
}

describe('Welfare and Zakat model validation', () => {
  it('accepts an exactly reconciled fund balance without floating-point arithmetic', async () => {
    const fund = new AssistanceFundModel(assistanceFundInput());
    await expect(fund.validate()).resolves.toBeUndefined();
    expect(fund.fundCode).toBe('WF-GENERAL-2026');
  });

  it('rejects a fund whose available balance is not authoritative', async () => {
    const fund = new AssistanceFundModel({
      ...assistanceFundInput(),
      availableBalance: '999.99',
    });
    await expect(fund.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        availableBalance: expect.anything(),
      }),
    });
  });

  it('requires Zakat declarations and restricted-use evidence', async () => {
    const fund = new AssistanceFundModel({
      ...assistanceFundInput(),
      fundType: 'ZAKAT',
      restriction: 'RESTRICTED',
      requiresZakatDeclaration: false,
      restrictionNarrativeEncrypted: null,
    });
    await expect(fund.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        requiresZakatDeclaration: expect.anything(),
        restrictionNarrativeEncrypted: expect.anything(),
      }),
    });
  });

  it('enforces immutable ledger direction and exact before/after balances', async () => {
    const actorId = objectId();
    const transaction = new FundTransactionModel({
      facilityId: objectId(),
      operationKey: 'fund-transaction-operation-0001',
      transactionNumber: 'ftx-2026-000001',
      fundId: objectId(),
      transactionType: 'DONATION',
      direction: 'DEBIT',
      amount: '100.00',
      currency: 'PKR',
      balanceBefore: '500.00',
      balanceAfter: '400.00',
      applicationId: null,
      approvalId: null,
      reservationId: null,
      allocationId: null,
      transferId: null,
      invoiceId: null,
      invoiceLineId: null,
      paymentId: null,
      refundId: null,
      creditNoteId: null,
      debitNoteId: null,
      claimId: null,
      claimAdjustmentId: null,
      donorReferenceHash: null,
      donorReferenceMasked: null,
      donationReferenceHash: 'a'.repeat(64),
      receiptReferenceHash: 'b'.repeat(64),
      receiptReferenceMasked: '***0001',
      fundingSourceReferenceHash: null,
      reason: 'Donation received for patient support',
      attachmentIds: [],
      actorUserId: actorId,
      makerUserId: actorId,
      checkerUserId: objectId(),
      approvalRequestId: objectId(),
      transactionId: 'tx-ledger-1',
      correlationId: 'corr-ledger-1',
      occurredAt: new Date(),
      immutableHash: 'c'.repeat(64),
      reversalOfTransactionId: null,
      reversedByTransactionId: null,
    });
    await expect(transaction.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        direction: expect.anything(),
      }),
    });
  });

  it('rejects Zakat applications without encrypted declarations', async () => {
    const application = new AssistanceApplicationModel({
      ...commonFields(),
      operationKey: 'application-create-operation-0001',
      duplicateKey: 'd'.repeat(64),
      applicationNumber: 'wza-2026-000001',
      applicationType: 'ZAKAT',
      patientId: objectId(),
      guardianId: null,
      encounterId: null,
      admissionId: null,
      invoiceId: objectId(),
      claimId: null,
      preferredFundId: objectId(),
      status: 'DRAFT',
      applicantSnapshotEncrypted: 'encrypted-applicant-snapshot',
      householdSnapshotEncrypted: 'encrypted-household-snapshot',
      employmentSnapshotEncrypted: 'encrypted-employment-snapshot',
      financialConditionSnapshotEncrypted: 'encrypted-financial-condition',
      zakatDeclarationSnapshotEncrypted: null,
      questionnaireSnapshotEncrypted: 'encrypted-questionnaire-snapshot',
      requestedServicesSnapshotEncrypted: null,
      notesEncrypted: null,
      attachments: [],
      householdSize: 4,
      dependantCount: 2,
      monthlyHouseholdIncome: '30000.00',
      monthlyHouseholdExpenses: '25000.00',
      monthlyDisposableIncome: '5000.00',
      perCapitaIncome: '7500.00',
      requestedAmount: '20000.00',
      recommendedAmount: null,
      approvedAmount: '0.00',
      reservedAmount: '0.00',
      committedAmount: '0.00',
      utilizedAmount: '0.00',
      reversedAmount: '0.00',
      releasedAmount: '0.00',
      remainingApprovedAmount: '0.00',
      completenessSatisfied: false,
      missingItems: ['ZAKAT_DECLARATION'],
      eligibilityOutcome: null,
      eligibilitySnapshotId: null,
      financialYearCode: 'fy-2026',
      assignedToUserId: null,
      assignedBy: null,
      followUpAt: null,
      reviewDeadlineAt: null,
      approvalDeadlineAt: null,
      submittedAt: null,
      submittedBy: null,
      expiresAt: null,
      closedAt: null,
      closedBy: null,
      closureReason: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
    });
    await expect(application.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        zakatDeclarationSnapshotEncrypted: expect.anything(),
      }),
    });
  });

  it('enforces maker-checker separation on approvals and fund transfers', async () => {
    const maker = objectId();
    const approval = new AssistanceApprovalModel({
      ...commonFields(),
      operationKey: 'approval-operation-0001',
      approvalNumber: 'wzap-2026-000001',
      applicationId: objectId(),
      fundId: objectId(),
      status: 'APPROVED',
      requestedAmount: '1000.00',
      approvedAmount: '1000.00',
      reservedAmount: '0.00',
      committedAmount: '0.00',
      utilizedAmount: '0.00',
      reversedAmount: '0.00',
      releasedAmount: '0.00',
      remainingAmount: '1000.00',
      approvedFrom: new Date('2026-07-01T00:00:00.000Z'),
      approvedThrough: null,
      approvedServiceCategories: [],
      approvedServiceCodes: [],
      approvedInvoiceLineIds: [],
      conditionsEncrypted: null,
      notesEncrypted: null,
      approvalMatrixCode: 'standard',
      approvalRequestId: objectId(),
      makerUserId: maker,
      checkerUserIds: [maker],
      approvedAt: new Date(),
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      expiresAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });

    const transfer = new FundTransferModel({
      ...commonFields(),
      operationKey: 'fund-transfer-operation-0001',
      transferNumber: 'wzt-2026-000001',
      sourceFundId: objectId(),
      destinationFundId: objectId(),
      amount: '500.00',
      currency: 'PKR',
      status: 'APPROVED',
      approvalRequestId: objectId(),
      makerUserId: maker,
      checkerUserId: maker,
      sourceTransactionId: null,
      destinationTransactionId: null,
      reason: 'Approved restricted fund transfer',
      attachmentIds: [],
      postedAt: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });

    await expect(approval.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ checkerUserIds: expect.anything() }),
    });
    await expect(transfer.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ checkerUserId: expect.anything() }),
    });
  });

  it('rejects allocation lines that do not exactly equal the allocation amount', async () => {
    const allocation = new InvoiceFundAllocationModel({
      ...commonFields(),
      operationKey: 'allocation-operation-0001',
      duplicateKey: 'e'.repeat(64),
      allocationNumber: 'wzal-2026-000001',
      fundId: objectId(),
      patientId: objectId(),
      applicationId: objectId(),
      approvalId: objectId(),
      reservationId: objectId(),
      patientAccountId: objectId(),
      invoiceId: objectId(),
      claimId: null,
      status: 'RESERVED',
      currency: 'PKR',
      amount: '100.00',
      utilizedAmount: '0.00',
      reversedAmount: '0.00',
      refundedAmount: '0.00',
      repaidAmount: '0.00',
      recoveredAmount: '0.00',
      releasedAmount: '0.00',
      remainingAmount: '100.00',
      priority: 1,
      reason: 'Approved assistance allocation',
      supportingAttachmentIds: [],
      lines: [
        {
          invoiceLineId: objectId(),
          amount: '99.99',
          utilizedAmount: '0.00',
          reversedAmount: '0.00',
          refundedAmount: '0.00',
          repaidAmount: '0.00',
          recoveredAmount: '0.00',
          remainingAmount: '99.99',
          reason: 'Partial invoice line support',
          supportingAttachmentIds: [],
        },
      ],
      allocatedBy: objectId(),
      approvedBy: null,
      approvalRequestId: null,
      allocatedAt: new Date(),
      confirmedAt: null,
      utilizedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      reversalStatus: null,
    });
    await expect(allocation.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ lines: expect.anything() }),
    });
  });

  it('requires authoritative financial references for immutable fund returns', async () => {
    const maker = objectId();
    const returnRecord = new FundReturnModel({
      facilityId: objectId(),
      operationKey: 'fund-return-operation-0001',
      returnType: 'REFUND',
      allocationId: objectId(),
      fundId: objectId(),
      amount: '50.00',
      paymentId: null,
      refundId: null,
      creditNoteId: null,
      debitNoteId: null,
      claimAdjustmentId: null,
      approvalRequestId: objectId(),
      makerUserId: maker,
      checkerUserId: objectId(),
      reason: 'Return of refunded welfare allocation',
      attachmentIds: [],
      transactionId: 'tx-return-1',
      correlationId: 'corr-return-1',
      postedAt: new Date(),
      immutableHash: 'f'.repeat(64),
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });
    await expect(returnRecord.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ paymentId: expect.anything() }),
    });
  });
});