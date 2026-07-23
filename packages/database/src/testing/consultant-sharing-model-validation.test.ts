import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ConsultantAgreementModel,
  ConsultantAgreementRuleModel,
} from '../models/consultant-agreement.model.js';

import {
  ConsultantDisputeModel,
  ConsultantWorkItemModel,
} from '../models/consultant-dispute.model.js';

import {
  ConsultantRevenueEntryModel,
  ConsultantRevenueReversalModel,
} from '../models/consultant-revenue.model.js';

import {
  ConsultantSettlementModel,
  ConsultantSettlementPaymentModel,
} from '../models/consultant-settlement.model.js';

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

function agreementInput() {
  const makerUserId = objectId();
  return {
    ...commonFields(),
    operationKey: 'consultant-agreement-operation-0001',
    agreementNumber: 'csa-2026-000001',
    agreementName: 'General consultant sharing agreement',
    description: 'Effective-dated agreement for finalized consultation revenue',
    consultantId: objectId(),
    consultantStaffId: objectId(),
    consultantUserId: objectId(),
    consultantGroupId: null,
    engagementType: 'INTERNAL' as const,
    status: 'DRAFT' as const,
    priority: 100,
    effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    effectiveThrough: null,
    agreementVersion: 1,
    supersedesAgreementId: null,
    supersededByAgreementId: null,
    departmentIds: [objectId()],
    serviceIds: [objectId()],
    serviceCategories: ['CONSULTATION'] as const,
    supportingAttachmentIds: [],
    internalNotesEncrypted: null,
    approvalNotesEncrypted: null,
    taxProfileReferenceHash: null,
    payoutProfileReferenceHash: null,
    payoutProfileReferenceMasked: null,
    approvalMatrixCode: 'consultant-standard',
    approvalRequestId: null,
    makerUserId,
    submittedBy: null,
    reviewedBy: null,
    approvedBy: null,
    activatedBy: null,
    suspendedBy: null,
    terminatedBy: null,
    cancelledBy: null,
    reopenedBy: null,
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    activatedAt: null,
    suspendedAt: null,
    terminatedAt: null,
    cancelledAt: null,
    reopenedAt: null,
    suspensionReason: null,
    terminationReason: null,
    cancellationReason: null,
    reopenReason: null,
  };
}

function eligibilityPolicy() {
  return {
    discountTreatment: 'DEDUCT_FROM_ELIGIBLE' as const,
    patientResponsibilityTreatment: 'INCLUDE' as const,
    sponsorResponsibilityTreatment: 'INCLUDE' as const,
    packageResponsibilityTreatment: 'INCLUDE' as const,
    welfareZakatTreatment: 'EXCLUDE' as const,
    taxTreatment: 'EXCLUDE' as const,
    serviceChargeTreatment: 'EXCLUDE' as const,
    deductRefunds: true,
    deductCreditNotes: true,
    includeDebitNotes: true,
    deductWriteOffs: true,
    applyClaimAdjustments: true,
    deductNonShareableCharges: true,
    deductCosts: false,
    deductConsumables: false,
    deductOtherApprovedDeductions: true,
  };
}

function agreementRuleInput() {
  return {
    ...commonFields(),
    operationKey: 'consultant-rule-operation-0001',
    agreementId: objectId(),
    agreementVersion: 1,
    ruleVersion: 1,
    ruleCode: 'consultation-default',
    ruleName: 'Consultation percentage share',
    status: 'DRAFT' as const,
    priority: 100,
    specificityRank: 10,
    isFallback: false,
    effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    effectiveThrough: null,
    consultantId: objectId(),
    consultantGroupId: null,
    departmentId: objectId(),
    serviceId: objectId(),
    serviceCategory: 'CONSULTATION' as const,
    chargeCatalogItemId: objectId(),
    procedureId: null,
    patientType: 'CASH' as const,
    encounterType: 'OUTPATIENT' as const,
    admissionType: null,
    payerOrganizationId: null,
    panelProgramId: null,
    packageId: null,
    claimType: null,
    calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE' as const,
    recognitionBasis: 'ACCRUAL_ON_FINALIZATION' as const,
    percentage: '40.000000',
    fixedAmount: null,
    minimumShare: null,
    maximumShare: null,
    perServiceCap: null,
    perCaseCap: null,
    periodCap: null,
    guaranteedAmount: null,
    thresholdAmount: null,
    tiers: [],
    participants: [
      {
        participantId: objectId(),
        participantStaffId: objectId(),
        participantGroupId: null,
        participantRole: 'PRIMARY_CONSULTANT' as const,
        customRoleCode: null,
        allocationMethod: 'PERCENTAGE' as const,
        percentage: '100.000000',
        fixedAmount: null,
        priority: 1,
        receivesResidual: false,
      },
    ],
    eligibilityPolicy: eligibilityPolicy(),
    excludedDepartmentIds: [],
    excludedServiceIds: [],
    excludedPayerOrganizationIds: [],
    excludedPackageIds: [],
    excludedInvoiceLineTypes: [],
    currency: 'PKR' as const,
    calculationFingerprint: 'a'.repeat(64),
    makerUserId: objectId(),
    approvedBy: null,
    approvalRequestId: null,
    approvedAt: null,
    supersedesRuleId: null,
    supersededByRuleId: null,
    inactiveReason: null,
  };
}

function revenueEntryInput() {
  return {
    ...commonFields(),
    operationKey: 'consultant-revenue-operation-0001',
    calculationRunId: objectId(),
    consultantId: objectId(),
    consultantStaffId: objectId(),
    consultantGroupId: null,
    agreementId: objectId(),
    agreementVersion: 1,
    agreementRuleId: objectId(),
    ruleVersion: 1,
    patientId: objectId(),
    encounterId: objectId(),
    admissionId: null,
    invoiceId: objectId(),
    invoiceLineId: objectId(),
    paymentAllocationId: null,
    refundId: null,
    creditNoteId: null,
    debitNoteId: null,
    claimId: null,
    packageId: null,
    payerOrganizationId: null,
    panelProgramId: null,
    departmentId: objectId(),
    serviceId: objectId(),
    serviceCategory: 'CONSULTATION' as const,
    chargeCatalogItemId: objectId(),
    procedureId: null,
    sourceFinancialEventId: 'invoice-finalized-event-0001',
    sourceFinancialEventType: 'INVOICE_FINALIZED',
    sourceLedgerEntryId: objectId(),
    sourceModule: 'UNIFIED_BILLING',
    sourceRecordId: objectId(),
    direction: 'CREDIT' as const,
    entryType: 'EARNED' as const,
    status: 'POSTED' as const,
    recognitionBasis: 'ACCRUAL_ON_FINALIZATION' as const,
    calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE' as const,
    currency: 'PKR' as const,
    grossAmount: '120.00',
    discountAmount: '20.00',
    welfareZakatAmount: '0.00',
    panelSponsorAmount: '0.00',
    patientAmount: '100.00',
    packageAmount: '0.00',
    refundAmount: '0.00',
    creditNoteAmount: '0.00',
    debitNoteAmount: '0.00',
    writeOffAmount: '0.00',
    claimAdjustmentAmount: '0.00',
    nonShareableAmount: '0.00',
    costDeductionAmount: '0.00',
    consumableDeductionAmount: '0.00',
    otherEligibilityDeductionAmount: '0.00',
    eligibleRevenueBeforeRecognition: '100.00',
    recognitionRatio: '1.00000000',
    eligibleRevenue: '100.00',
    pendingEligibleRevenue: '0.00',
    percentage: '40.000000',
    fixedAmount: null,
    selectedTierCode: null,
    consultantShare: '40.00',
    hospitalShare: '60.00',
    otherParticipantShare: '10.00',
    taxWithholdingAmount: '5.00',
    deductionAmount: '5.00',
    netPayableAmount: '30.00',
    settledAmount: '0.00',
    outstandingAmount: '30.00',
    settlementId: null,
    inputHash: 'b'.repeat(64),
    calculationHash: 'c'.repeat(64),
    immutableHash: 'd'.repeat(64),
    matchReason: 'Most-specific active consultation agreement rule selected',
    calculationTrace: {
      selectedAgreementVersion: 1,
      selectedRuleVersion: 1,
    },
    calculatedBy: 'SYSTEM',
    calculatedAt: new Date(),
    occurredAt: new Date(),
    postedAt: new Date(),
    heldAt: null,
    heldBy: null,
    holdReason: null,
    reversalOfEntryId: null,
    reversedByEntryId: null,
    adjustmentOfEntryId: null,
    supersedesEntryId: null,
  };
}

function settlementInput() {
  return {
    ...commonFields(),
    operationKey: 'consultant-settlement-operation-0001',
    settlementNumber: 'css-2026-000001',
    consultantId: objectId(),
    consultantStaffId: objectId(),
    consultantGroupId: null,
    periodType: 'MONTHLY' as const,
    periodFrom: new Date('2026-07-01T00:00:00.000Z'),
    periodThrough: new Date('2026-07-31T23:59:59.999Z'),
    status: 'DRAFT' as const,
    currency: 'PKR' as const,
    openingBalance: '0.00',
    broughtForwardBalance: '0.00',
    eligibleRevenue: '200.00',
    consultantShare: '100.00',
    hospitalRetainedAmount: '100.00',
    adjustmentAmount: '0.00',
    refundDeductionAmount: '10.00',
    creditNoteDeductionAmount: '5.00',
    debitNoteAdditionAmount: '10.00',
    claimEffectAmount: '0.00',
    welfareZakatEffectAmount: '0.00',
    taxWithholdingAmount: '5.00',
    otherDeductionAmount: '5.00',
    advanceRecoveryAmount: '0.00',
    overpaymentRecoveryAmount: '0.00',
    grossPayableAmount: '95.00',
    totalDeductionAmount: '10.00',
    netPayableAmount: '85.00',
    paidAmount: '20.00',
    outstandingAmount: '65.00',
    itemCount: 5,
    revenueEntryCount: 2,
    calculationHash: 'e'.repeat(64),
    inputHash: 'f'.repeat(64),
    lockedAt: null,
    lockedBy: null,
    approvalMatrixCode: 'consultant-settlement-standard',
    approvalRequestId: null,
    makerUserId: objectId(),
    submittedBy: null,
    reviewedBy: null,
    approvedBy: null,
    cancelledBy: null,
    reversedBy: null,
    closedBy: null,
    calculatedAt: null,
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    partiallyPaidAt: null,
    paidAt: null,
    cancelledAt: null,
    reversedAt: null,
    closedAt: null,
    cancellationReason: null,
    reversalReason: null,
    disputeReason: null,
    internalNotesEncrypted: null,
    supportingAttachmentIds: [],
    ledgerTransactionId: null,
    reversalOfSettlementId: null,
    reversedBySettlementId: null,
  };
}

describe('Consultant sharing model validation', () => {
  it('accepts a draft effective-dated consultant agreement', async () => {
    const agreement = new ConsultantAgreementModel(agreementInput());

    await expect(agreement.validate()).resolves.toBeUndefined();
    expect(agreement.agreementNumber).toBe('CSA-2026-000001');
  });

  it('rejects active agreements without prior independent approval metadata', async () => {
    const agreement = new ConsultantAgreementModel({
      ...agreementInput(),
      status: 'ACTIVE',
      activatedBy: objectId(),
      activatedAt: new Date(),
      approvedBy: null,
      approvedAt: null,
      approvalRequestId: null,
    });

    await expect(agreement.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        approvedBy: expect.anything(),
      }),
    });
  });

  it('enforces independent approval and active-rule approval metadata', async () => {
    const makerUserId = objectId();
    const rule = new ConsultantAgreementRuleModel({
      ...agreementRuleInput(),
      status: 'ACTIVE',
      makerUserId,
      approvedBy: makerUserId,
      approvalRequestId: objectId(),
      approvedAt: new Date(),
    });

    await expect(rule.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        approvedBy: expect.anything(),
      }),
    });
  });

  it('rejects overlapping tiers and scoped fallback rules', async () => {
    const rule = new ConsultantAgreementRuleModel({
      ...agreementRuleInput(),
      isFallback: true,
      calculationMethod: 'TIERED_PERCENTAGE',
      percentage: null,
      departmentId: objectId(),
      tiers: [
        {
          tierCode: 'T1',
          fromInclusive: '0.00',
          toInclusive: '100.00',
          percentage: '30.00',
          fixedAmount: null,
          priority: 1,
        },
        {
          tierCode: 'T2',
          fromInclusive: '100.00',
          toInclusive: '200.00',
          percentage: '40.00',
          fixedAmount: null,
          priority: 2,
        },
      ],
    });

    await expect(rule.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        isFallback: expect.anything(),
        tiers: expect.anything(),
      }),
    });
  });

  it('accepts exactly reconciled consultant revenue without floating-point arithmetic', async () => {
    const entry = new ConsultantRevenueEntryModel(revenueEntryInput());

    await expect(entry.validate()).resolves.toBeUndefined();
  });

  it('rejects consultant and hospital shares that do not equal eligible revenue', async () => {
    const entry = new ConsultantRevenueEntryModel({
      ...revenueEntryInput(),
      hospitalShare: '59.99',
    });

    await expect(entry.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        eligibleRevenue: expect.anything(),
      }),
    });
  });

  it('rejects recognition ratios above the complete-recognition ceiling', async () => {
    const entry = new ConsultantRevenueEntryModel({
      ...revenueEntryInput(),
      recognitionRatio: '1.0001',
    });

    await expect(entry.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        recognitionRatio: expect.anything(),
      }),
    });
  });

  it('requires debit reversal entries to preserve their original revenue reference', async () => {
    const reversalEntry = new ConsultantRevenueEntryModel({
      ...revenueEntryInput(),
      operationKey: 'consultant-revenue-reversal-entry-0001',
      sourceFinancialEventId: 'refund-posted-event-0001',
      direction: 'DEBIT',
      entryType: 'REFUND',
      reversalOfEntryId: null,
      inputHash: '1'.repeat(64),
      calculationHash: '2'.repeat(64),
      immutableHash: '3'.repeat(64),
    });

    await expect(reversalEntry.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        direction: expect.anything(),
      }),
    });
  });

  it('accepts exactly reconciled settlement totals and outstanding balance', async () => {
    const settlement = new ConsultantSettlementModel(settlementInput());

    await expect(settlement.validate()).resolves.toBeUndefined();
  });

  it('rejects settlement consultant and hospital shares that do not reconcile', async () => {
    const settlement = new ConsultantSettlementModel({
      ...settlementInput(),
      hospitalRetainedAmount: '99.99',
    });

    await expect(settlement.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        eligibleRevenue: expect.anything(),
      }),
    });
  });

  it('rejects a payout above the approved settlement balance snapshot', async () => {
    const makerUserId = objectId();
    const payout = new ConsultantSettlementPaymentModel({
      ...commonFields(),
      operationKey: 'consultant-payout-operation-0001',
      payoutNumber: 'csp-2026-000001',
      settlementId: objectId(),
      consultantId: objectId(),
      status: 'REQUESTED',
      paymentMethod: 'BANK_TRANSFER',
      currency: 'PKR',
      amount: '50.00',
      approvedSettlementBalanceSnapshot: '40.00',
      taxWithholdingAmount: '0.00',
      advanceRecoveryAmount: '0.00',
      overpaymentRecoveryAmount: '0.00',
      otherDeductionAmount: '0.00',
      netDisbursedAmount: '50.00',
      paymentId: null,
      cashShiftId: null,
      cashCounterId: null,
      ledgerTransactionId: null,
      paymentReferenceHash: '4'.repeat(64),
      paymentReferenceMasked: '***0001',
      payoutProfileReferenceHash: null,
      payoutProfileReferenceMasked: null,
      makerUserId,
      checkerUserId: null,
      approvalRequestId: objectId(),
      requestedAt: new Date(),
      approvedAt: null,
      processedAt: null,
      paidAt: null,
      failedAt: null,
      returnedAt: null,
      cancelledAt: null,
      reversedAt: null,
      failureCode: null,
      failureReasonSanitized: null,
      returnReason: null,
      cancellationReason: null,
      reversalReason: null,
      reversalOfPaymentId: null,
      reversedByPaymentId: null,
      immutableHash: '5'.repeat(64),
    });

    await expect(payout.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        amount: expect.anything(),
      }),
    });
  });

  it('enforces reversal maker-checker separation', async () => {
    const makerUserId = objectId();
    const reversal = new ConsultantRevenueReversalModel({
      ...commonFields(),
      operationKey: 'consultant-reversal-operation-0001',
      reversalNumber: 'csr-2026-000001',
      revenueEntryId: objectId(),
      consultantId: objectId(),
      status: 'APPROVED',
      eligibleRevenueAmount: '100.00',
      consultantShareAmount: '40.00',
      hospitalShareAmount: '60.00',
      taxWithholdingAmount: '5.00',
      deductionAmount: '5.00',
      netPayableAmount: '30.00',
      sourceFinancialEventId: 'refund-event-0002',
      refundId: objectId(),
      creditNoteId: null,
      claimAdjustmentId: null,
      welfareZakatReversalId: null,
      reasonCode: 'REFUND',
      reason: 'Full refund reverses the consultant revenue entry',
      supportingAttachmentIds: [],
      makerUserId,
      checkerUserId: makerUserId,
      approvalRequestId: objectId(),
      requestedAt: new Date(),
      approvedAt: new Date(),
      postedAt: null,
      reversalRevenueEntryId: null,
      immutableHash: '6'.repeat(64),
    });

    await expect(reversal.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        checkerUserId: expect.anything(),
      }),
    });
  });

  it('requires disputes and work items to identify exactly one valid target', async () => {
    const makerUserId = objectId();
    const dispute = new ConsultantDisputeModel({
      ...commonFields(),
      operationKey: 'consultant-dispute-operation-0001',
      disputeNumber: 'csd-2026-000001',
      consultantId: objectId(),
      targetType: 'REVENUE_ENTRY',
      agreementId: null,
      agreementRuleId: null,
      revenueEntryId: null,
      settlementId: null,
      settlementItemId: null,
      settlementPaymentId: null,
      status: 'OPEN',
      reasonCode: 'AMOUNT_MISMATCH',
      reason: 'Consultant disputes the recognized eligible amount',
      evidenceEncrypted: null,
      reviewerFindingsEncrypted: null,
      resolutionNotesEncrypted: null,
      supportingAttachmentIds: [],
      requestedAdjustmentAmount: '10.00',
      approvedAdjustmentAmount: '0.00',
      postedAdjustmentId: null,
      assignedToUserId: null,
      assignedBy: null,
      assignedAt: null,
      followUpAt: null,
      reviewDeadlineAt: null,
      resolutionDeadlineAt: null,
      escalationLevel: 0,
      escalatedAt: null,
      escalatedBy: null,
      escalatedToUserId: null,
      createdByConsultant: true,
      makerUserId,
      reviewingUserId: null,
      resolvingUserId: null,
      approvalRequestId: null,
      openedAt: new Date(),
      reviewStartedAt: null,
      informationRequestedAt: null,
      decisionAt: null,
      resolvedAt: null,
      cancelledAt: null,
      resolutionCode: null,
      cancellationReason: null,
    });

    const workItem = new ConsultantWorkItemModel({
      ...commonFields(),
      agreementId: objectId(),
      agreementRuleId: null,
      revenueEntryId: objectId(),
      adjustmentId: null,
      reversalId: null,
      settlementId: null,
      settlementPaymentId: null,
      disputeId: null,
      workQueueType: 'AGREEMENT_REVIEW',
      status: 'OPEN',
      assignedToUserId: null,
      assignedBy: null,
      assignedAt: null,
      priority: 100,
      followUpAt: null,
      deadlineAt: null,
      escalationLevel: 0,
      escalatedAt: null,
      escalatedBy: null,
      escalatedToUserId: null,
      reasonEncrypted: null,
      resolvedAt: null,
      resolvedBy: null,
    });

    await expect(dispute.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        revenueEntryId: expect.anything(),
      }),
    });
    await expect(workItem.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        agreementId: expect.anything(),
      }),
    });
  });
});