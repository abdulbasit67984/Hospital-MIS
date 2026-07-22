import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ClaimModel,
  ClaimLineModel,
} from '../models/claims-core.model.js';

import {
  ClaimAdjustmentModel,
  ClaimRemittanceModel,
} from '../models/claims-remittance.model.js';

import {
  ClaimBatchModel,
  ClaimStatusHistoryModel,
  ClaimWorkItemModel,
} from '../models/claims-workflow.model.js';

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

function claimInput() {
  return {
    ...commonFields(),
    operationKey: 'claim-create-operation-0001',
    duplicateKey: 'a'.repeat(64),
    claimNumber: 'clm-2026-000001',
    claimVersionNumber: 1,
    claimVersionType: 'ORIGINAL' as const,
    originalClaimId: null,
    priorClaimVersionId: null,
    patientId: objectId(),
    patientAccountId: objectId(),
    encounterId: null,
    admissionId: null,
    invoiceId: objectId(),
    coverageDeterminationId: objectId(),
    payerOrganizationId: objectId(),
    payerType: 'INSURANCE' as const,
    panelPlanId: objectId(),
    patientCoverageId: objectId(),
    policyReferenceHash: null,
    policyReferenceMasked: null,
    membershipReferenceHash: null,
    membershipReferenceMasked: null,
    employerReferenceHash: null,
    authorizationReferenceHash: null,
    preauthorizationIds: [],
    status: 'DRAFT' as const,
    serviceFrom: new Date('2026-07-01T00:00:00.000Z'),
    serviceThrough: new Date('2026-07-01T23:59:59.000Z'),
    filingDeadline: new Date('2026-08-01T00:00:00.000Z'),
    currency: 'PKR' as const,
    grossAmount: '1000.00',
    packageAmount: '100.00',
    deductibleAmount: '50.00',
    copaymentAmount: '50.00',
    coinsuranceAmount: '0.00',
    excludedAmount: '0.00',
    patientOtherAmount: '0.00',
    patientResponsibilityAmount: '100.00',
    claimedAmount: '800.00',
    approvedAmount: '0.00',
    deniedAmount: '0.00',
    disallowedAmount: '0.00',
    returnedAmount: '0.00',
    contractualAdjustmentAmount: '0.00',
    writeOffAmount: '0.00',
    payerWithholdingAmount: '0.00',
    debitNoteAmount: '0.00',
    creditNoteAmount: '0.00',
    refundAmount: '0.00',
    repaymentAmount: '0.00',
    paidAmount: '0.00',
    unappliedPaymentAmount: '0.00',
    outstandingAmount: '0.00',
    overpaymentAmount: '0.00',
    diagnoses: [
      {
        diagnosisId: objectId(),
        codeSystem: 'ICD-10',
        code: 'J18.9',
        description: 'Pneumonia, unspecified organism',
        diagnosisType: 'PRIMARY' as const,
        sequence: 1,
        presentOnAdmission: true,
      },
    ],
    readinessSnapshotId: null,
    readinessIssues: [],
    readinessCheckedAt: null,
    readinessCheckedBy: null,
    payerReferenceNumber: null,
    clearinghouseReference: null,
    assignedToUserId: null,
    followUpAt: null,
    agingAnchorAt: new Date('2026-07-01T00:00:00.000Z'),
    agingDays: 0,
    agingBucket: 'CURRENT' as const,
    internalNoteEncrypted: null,
    payerNoteEncrypted: null,
    medicalNecessitySummaryEncrypted: null,
    submittedAt: null,
    submittedBy: null,
    acknowledgedAt: null,
    adjudicatedAt: null,
    paidAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    reversedAt: null,
    reversedBy: null,
    reversalReason: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

describe('claims model validation', () => {
  it('accepts a reconciled draft claim with one primary diagnosis', async () => {
    const claim = new ClaimModel(claimInput());

    await expect(claim.validate()).resolves.toBeUndefined();
    expect(claim.claimNumber).toBe('CLM-2026-000001');
  });

  it('rejects client-persisted claim totals that do not reconcile', async () => {
    const claim = new ClaimModel({
      ...claimInput(),
      claimedAmount: '799.99',
    });

    await expect(claim.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        grossAmount: expect.anything(),
      }),
    });
  });

  it('rejects patient responsibility that differs from its authoritative components', async () => {
    const claim = new ClaimModel({
      ...claimInput(),
      deductibleAmount: '40.00',
    });

    await expect(claim.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        patientResponsibilityAmount: expect.anything(),
      }),
    });
  });

  it('rejects simultaneous outstanding and overpayment balances', async () => {
    const claim = new ClaimModel({
      ...claimInput(),
      status: 'APPROVED',
      approvedAmount: '800.00',
      paidAmount: '800.00',
      outstandingAmount: '10.00',
      overpaymentAmount: '10.00',
    });

    await expect(claim.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        overpaymentAmount: expect.anything(),
      }),
    });
  });

  it('rejects claims without exactly one primary diagnosis', async () => {
    const input = claimInput();
    const claim = new ClaimModel({
      ...input,
      diagnoses: input.diagnoses.map((diagnosis) => ({
        ...diagnosis,
        diagnosisType: 'SECONDARY' as const,
      })),
    });

    await expect(claim.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        diagnoses: expect.anything(),
      }),
    });
  });

  it('rejects adjudicated claim lines whose decision amounts do not reconcile', async () => {
    const line = new ClaimLineModel({
      ...commonFields(),
      claimId: objectId(),
      duplicateKey: 'b'.repeat(64),
      lineNumber: 1,
      invoiceLineId: objectId(),
      coverageAllocationId: null,
      chargeCatalogItemId: objectId(),
      sourceModule: 'LABORATORY',
      sourceRecordId: objectId(),
      encounterId: objectId(),
      admissionId: null,
      procedureId: null,
      laboratoryOrderId: objectId(),
      radiologyOrderId: null,
      dispensationId: null,
      packageEnrollmentId: null,
      serviceCategory: 'LABORATORY',
      serviceFrom: new Date('2026-07-01T10:00:00.000Z'),
      serviceThrough: null,
      providerId: objectId(),
      departmentId: objectId(),
      chargeCatalogCode: 'LAB-CBC',
      serviceCodeSystem: 'HOSPITAL',
      serviceCode: 'CBC',
      revenueCode: null,
      modifiers: [],
      units: '1',
      diagnosisSequences: [1],
      preauthorizationId: null,
      status: 'PARTIALLY_APPROVED',
      grossAmount: '1000.00',
      packageAmount: '100.00',
      deductibleAmount: '50.00',
      copaymentAmount: '50.00',
      coinsuranceAmount: '0.00',
      excludedAmount: '0.00',
      patientOtherAmount: '0.00',
      patientResponsibilityAmount: '100.00',
      claimedAmount: '800.00',
      approvedAmount: '500.00',
      deniedAmount: '100.00',
      disallowedAmount: '100.00',
      returnedAmount: '0.00',
      contractualAdjustmentAmount: '0.00',
      writeOffAmount: '0.00',
      payerWithholdingAmount: '0.00',
      paidAmount: '0.00',
      outstandingAmount: '500.00',
      medicalNecessityNoteEncrypted: null,
      internalNoteEncrypted: null,
      payerLineReference: null,
      denialCategory: null,
      denialReasonCode: null,
      denialReasonDescription: null,
    });

    await expect(line.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        approvedAmount: expect.anything(),
      }),
    });
  });

  it('rejects duplicate claims in a submission batch', async () => {
    const claimId = objectId();
    const batch = new ClaimBatchModel({
      ...commonFields(),
      operationKey: 'claim-batch-operation-0001',
      batchNumber: 'batch-2026-000001',
      payerOrganizationId: objectId(),
      panelPlanId: null,
      submissionChannel: 'PAYER_PORTAL',
      destinationReference: 'portal-main',
      clearinghouseReference: null,
      status: 'DRAFT',
      claimIds: [claimId, claimId],
      claimCount: 2,
      claimedAmount: '1000.00',
      approvedAmount: '0.00',
      paidAmount: '0.00',
      submissionStatus: null,
      approvalRequestId: null,
      approvedBy: null,
      approvedAt: null,
      submittedBy: null,
      submittedAt: null,
      acknowledgedAt: null,
      notesEncrypted: null,
    });

    await expect(batch.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        claimIds: expect.anything(),
      }),
    });
  });

  it('enforces maker-checker separation for financial adjustments', async () => {
    const makerId = objectId();
    const adjustment = new ClaimAdjustmentModel({
      ...commonFields(),
      claimId: objectId(),
      claimLineId: null,
      adjustmentType: 'WRITE_OFF',
      amount: '100.00',
      reason: 'Approved administrative write-off',
      makerUserId: makerId,
      checkerUserId: makerId,
      approvalRequestId: objectId(),
      status: 'APPROVED',
      requestedAt: new Date('2026-07-10T00:00:00.000Z'),
      postedAt: null,
      immutableHash: 'c'.repeat(64),
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });

    await expect(adjustment.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        checkerUserId: expect.anything(),
      }),
    });
  });

  it('rejects remittances whose allocated and unapplied amounts do not reconcile', async () => {
    const remittance = new ClaimRemittanceModel({
      ...commonFields(),
      operationKey: 'remittance-import-operation-0001',
      remittanceNumber: 'rem-2026-000001',
      payerOrganizationId: objectId(),
      remittanceReference: 'PAYER-RA-0001',
      remittanceDate: new Date('2026-07-15T00:00:00.000Z'),
      sponsorPaymentId: null,
      sponsorPaymentReference: null,
      currency: 'PKR',
      totalPaymentAmount: '1000.00',
      allocatedAmount: '800.00',
      unappliedAmount: '100.00',
      attachmentId: objectId(),
      allocations: [],
      importedBy: objectId(),
      importedAt: new Date('2026-07-15T01:00:00.000Z'),
      immutableHash: 'd'.repeat(64),
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });

    await expect(remittance.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        allocatedAmount: expect.anything(),
      }),
    });
  });

  it('rejects remittances whose allocation lines do not equal the allocated total', async () => {
    const claimId = objectId();
    const remittance = new ClaimRemittanceModel({
      ...commonFields(),
      operationKey: 'remittance-import-operation-0002',
      remittanceNumber: 'rem-2026-000002',
      payerOrganizationId: objectId(),
      remittanceReference: 'PAYER-RA-0002',
      remittanceDate: new Date('2026-07-16T00:00:00.000Z'),
      sponsorPaymentId: objectId(),
      sponsorPaymentReference: 'SPONSOR-PAYMENT-0002',
      currency: 'PKR',
      totalPaymentAmount: '1000.00',
      allocatedAmount: '800.00',
      unappliedAmount: '200.00',
      attachmentId: objectId(),
      allocations: [
        {
          claimId,
          claimLineId: null,
          paidAmount: '700.00',
          contractualAdjustmentAmount: '0.00',
          disallowedAmount: '0.00',
          withholdingAmount: '0.00',
          payerClaimReference: 'PAYER-CLAIM-0002',
          payerLineReference: null,
        },
      ],
      importedBy: objectId(),
      importedAt: new Date('2026-07-16T01:00:00.000Z'),
      immutableHash: 'f'.repeat(64),
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
    });

    await expect(remittance.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        allocations: expect.anything(),
      }),
    });
  });

  it('enforces complete escalation metadata on work items', async () => {
    const workItem = new ClaimWorkItemModel({
      ...commonFields(),
      claimId: objectId(),
      claimLineId: null,
      appealId: null,
      workQueueType: 'DENIAL',
      status: 'ESCALATED',
      assignedToUserId: objectId(),
      assignedBy: objectId(),
      priority: 200,
      followUpAt: new Date('2026-07-25T00:00:00.000Z'),
      escalationLevel: 1,
      escalatedAt: null,
      escalatedBy: null,
      escalatedToUserId: null,
      reasonEncrypted: null,
      resolvedAt: null,
      resolvedBy: null,
    });

    await expect(workItem.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        escalationLevel: expect.anything(),
      }),
    });
  });

  it('enforces maker-checker separation in status history', async () => {
    const makerId = objectId();
    const history = new ClaimStatusHistoryModel({
      ...commonFields(),
      claimId: objectId(),
      fromStatus: 'READY',
      toStatus: 'SUBMISSION_PENDING',
      reason: 'Approved for claim submission',
      payerReasonCode: null,
      payerReasonDescription: null,
      actorUserId: makerId,
      makerUserId: makerId,
      checkerUserId: makerId,
      approvalRequestId: objectId(),
      occurredAt: new Date('2026-07-20T00:00:00.000Z'),
      immutableHash: 'e'.repeat(64),
    });

    await expect(history.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        checkerUserId: expect.anything(),
      }),
    });
  });
});