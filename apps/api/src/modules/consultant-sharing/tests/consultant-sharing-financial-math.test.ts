import { describe, expect, it } from 'vitest';

import type {
  AuthoritativeConsultantFinancialActivity,
  ConsultantRevenueEligibilityPolicy,
} from '../consultant-sharing.contracts.js';
import {
  allocateConsultantParticipantShares,
  calculateConsultantDeltaAdjustment,
  calculateConsultantRecognition,
  calculateConsultantSettlementTotals,
  calculateConsultantShare,
  deriveConsultantEligibleRevenue,
} from '../consultant-sharing.financial-math.js';

const id = (digit: string): string => digit.repeat(24);

const activity: AuthoritativeConsultantFinancialActivity = {
  sourceFinancialEventId: 'financial-event-1',
  sourceFinancialEventType: 'INVOICE_FINALIZED',
  sourceLedgerEntryId: id('1'),
  sourceModule: 'UNIFIED_BILLING',
  sourceRecordId: id('2'),
  facilityId: id('3'),
  patientId: id('4'),
  encounterId: id('5'),
  admissionId: null,
  invoiceId: id('6'),
  invoiceLineId: id('7'),
  paymentAllocationId: id('8'),
  refundId: null,
  creditNoteId: null,
  debitNoteId: null,
  claimId: id('9'),
  packageId: null,
  payerOrganizationId: id('a'),
  panelProgramId: id('b'),
  departmentId: id('c'),
  serviceId: id('d'),
  serviceCategory: 'SURGERY',
  chargeCatalogItemId: id('e'),
  procedureId: id('f'),
  currency: 'PKR',
  financialEventAt: '2026-07-23T01:00:00.000Z',
  invoiceFinalized: true,
  serviceCompleted: true,
  invoiceFullyPaid: false,
  unitQuantity: '1.000000',
  grossAmount: '10000.00',
  discountAmount: '1000.00',
  netAmount: '9900.00',
  patientResponsibilityAmount: '2000.00',
  sponsorResponsibilityAmount: '5000.00',
  packageResponsibilityAmount: '1000.00',
  welfareZakatAmount: '1900.00',
  taxAmount: '900.00',
  serviceChargeAmount: '200.00',
  refundAmount: '100.00',
  creditNoteAmount: '50.00',
  debitNoteAmount: '25.00',
  writeOffAmount: '75.00',
  claimAdjustmentAmount: '-100.00',
  nonShareableAmount: '100.00',
  costDeductionAmount: '500.00',
  consumableDeductionAmount: '250.00',
  otherApprovedDeductionAmount: '50.00',
  collectedAmount: '4950.00',
  collectionBasisAmount: '9900.00',
  claimApprovedAmount: '4000.00',
  claimBasisAmount: '5000.00',
  claimPaidAmount: '2500.00',
};

const policy: ConsultantRevenueEligibilityPolicy = {
  discountTreatment: 'DEDUCT_FROM_ELIGIBLE',
  patientResponsibilityTreatment: 'INCLUDE',
  sponsorResponsibilityTreatment: 'INCLUDE',
  packageResponsibilityTreatment: 'INCLUDE',
  welfareZakatTreatment: 'EXCLUDE',
  taxTreatment: 'EXCLUDE',
  serviceChargeTreatment: 'EXCLUDE',
  deductRefunds: true,
  deductCreditNotes: true,
  includeDebitNotes: true,
  deductWriteOffs: true,
  applyClaimAdjustments: true,
  deductNonShareableCharges: true,
  deductCosts: true,
  deductConsumables: true,
  deductOtherApprovedDeductions: true,
};

describe('consultant-sharing exact financial math', () => {
  it('derives eligible revenue from reconciled authoritative invoice allocations', () => {
    const result = deriveConsultantEligibleRevenue(activity, policy);
    expect(result.includedWelfareZakatAmount).toBe('0.00');
    expect(result.taxDeduction).toBe('900.00');
    expect(result.eligibleRevenueBeforeRecognition).toBe('5700.00');
  });

  it('recognizes partial collection and claim payment using exact ratios', () => {
    expect(
      calculateConsultantRecognition(activity, '5700.00', 'COLLECTION_BASIS'),
    ).toMatchObject({
      recognitionRatio: '50.000000',
      recognizedEligibleRevenue: '2850.00',
      pendingEligibleRevenue: '2850.00',
      recognitionSatisfied: true,
    });

    expect(
      calculateConsultantRecognition(activity, '5700.00', 'CLAIM_PAYMENT_BASIS'),
    ).toMatchObject({
      recognitionRatio: '50.000000',
      recognizedEligibleRevenue: '2850.00',
    });
  });

  it('calculates percentage, fixed, tiered, and progressive shares', () => {
    expect(
      calculateConsultantShare({
        eligibleRevenue: '1000.00',
        method: 'PERCENTAGE_OF_ELIGIBLE_REVENUE',
        percentage: '30',
      }),
    ).toMatchObject({
      consultantShare: '300.00',
      hospitalShare: '700.00',
    });

    expect(
      calculateConsultantShare({
        eligibleRevenue: '1000.00',
        method: 'FIXED_PER_PROCEDURE',
        fixedAmount: '125.50',
        unitQuantity: '2',
      }),
    ).toMatchObject({
      consultantShare: '251.00',
      hospitalShare: '749.00',
    });

    const tiers = [
      {
        tierCode: 'T1',
        fromInclusive: '0.00',
        toInclusive: '999.99',
        percentage: '10',
        fixedAmount: null,
        priority: 1,
      },
      {
        tierCode: 'T2',
        fromInclusive: '1000.00',
        toInclusive: null,
        percentage: '20',
        fixedAmount: '50.00',
        priority: 1,
      },
    ] as const;

    expect(
      calculateConsultantShare({
        eligibleRevenue: '1500.00',
        method: 'TIERED_PERCENTAGE',
        tiers,
      }),
    ).toMatchObject({
      selectedTierCode: 'T2',
      consultantShare: '350.00',
      hospitalShare: '1150.00',
    });

    expect(
      calculateConsultantShare({
        eligibleRevenue: '1500.00',
        method: 'PROGRESSIVE_TIERS',
        tiers,
      }),
    ).toMatchObject({
      selectedTierCode: 'T2',
      consultantShare: '250.00',
      hospitalShare: '1250.00',
    });
  });

  it('allocates multiple consultants exactly and prevents over-allocation', () => {
    expect(
      allocateConsultantParticipantShares('400.00', [
        {
          participantId: id('1'),
          participantRole: 'SURGEON',
          allocationMethod: 'PERCENTAGE',
          percentage: '50',
          priority: 100,
        },
        {
          participantId: id('2'),
          participantRole: 'ANESTHETIST',
          allocationMethod: 'FIXED',
          fixedAmount: '75.00',
          priority: 90,
        },
        {
          participantId: id('3'),
          participantRole: 'ASSISTANT_SURGEON',
          allocationMethod: 'RESIDUAL',
          priority: 80,
          receivesResidual: true,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ participantId: id('1'), shareAmount: '200.00' }),
      expect.objectContaining({ participantId: id('2'), shareAmount: '75.00' }),
      expect.objectContaining({ participantId: id('3'), shareAmount: '125.00' }),
    ]);

    expect(() =>
      allocateConsultantParticipantShares('100.00', [
        {
          participantId: id('1'),
          participantRole: 'SURGEON',
          allocationMethod: 'FIXED',
          fixedAmount: '101.00',
          priority: 1,
        },
      ]),
    ).toThrow(/exceed eligible revenue/iu);
  });

  it('reconciles settlement totals and produces delta adjustments', () => {
    expect(
      calculateConsultantSettlementTotals({
        openingBalance: '100.00',
        broughtForwardBalance: '50.00',
        eligibleRevenue: '5000.00',
        consultantShare: '1500.00',
        adjustments: '25.00',
        refundDeductions: '100.00',
        creditNoteDeductions: '50.00',
        debitNoteAdditions: '75.00',
        claimDeductions: '25.00',
        welfareZakatDeductions: '0.00',
        taxWithholding: '150.00',
        otherDeductions: '25.00',
        advanceRecovery: '100.00',
        overpaymentRecovery: '25.00',
        paidAmount: '500.00',
      }),
    ).toMatchObject({
      grossPayable: '1750.00',
      totalDeductions: '475.00',
      netPayable: '1275.00',
      outstandingAmount: '775.00',
    });

    expect(
      calculateConsultantDeltaAdjustment({
        originalConsultantShare: '300.00',
        recalculatedConsultantShare: '250.00',
        originalHospitalShare: '700.00',
        recalculatedHospitalShare: '750.00',
      }),
    ).toEqual({ consultantDelta: '-50.00', hospitalDelta: '50.00' });
  });
});


describe('consultant-sharing Batch 3 application safeguards', () => {
  it('rejects cross-facility and break-glass financial approvals', async () => {
    const { ConsultantSharingAccessPolicyService } = await import(
      '../services/consultant-sharing-access-policy.service.js'
    );
    const service = new ConsultantSharingAccessPolicyService();
    const actor = {
      userId: id('1'),
      staffId: id('2'),
      facilityId: id('3'),
      correlationId: 'correlation-1',
      permissionKeys: new Set(['consultants.agreements.approve']),
      roleKeys: ['FINANCE_MANAGER'],
    } as const;

    await expect(service.authorize({
      actor,
      action: 'AGREEMENT_APPROVE',
      resourceFacilityId: id('4'),
      makerUserId: id('5'),
      sensitiveFinancialAction: true,
    })).rejects.toThrow(/cross-facility/iu);

    await expect(service.authorize({
      actor: { ...actor, breakGlassReason: 'Emergency access' },
      action: 'AGREEMENT_APPROVE',
      resourceFacilityId: actor.facilityId,
      makerUserId: id('5'),
      sensitiveFinancialAction: true,
    })).rejects.toThrow(/break-glass/iu);
  });

  it('requires exactly one target when creating a consultant work item', async () => {
    const { ConsultantWorkQueueService } = await import(
      '../services/consultant-work-queue.service.js'
    );
    const actor = {
      userId: id('1'),
      staffId: id('2'),
      facilityId: id('3'),
      correlationId: 'correlation-2',
      permissionKeys: new Set(['consultants.assign']),
      roleKeys: ['FINANCE_MANAGER'],
    } as const;
    const service = new ConsultantWorkQueueService({
      workQueue: {} as never,
      accessPolicy: { authorize: async () => ({
        allowed: true,
        requiredPermission: 'consultants.assign',
        accessMode: 'FULL',
        requiresIndependentApproval: false,
        auditSensitiveRead: false,
        minimumNecessaryFields: [],
      }) },
      transactions: {} as never,
      idempotency: {} as never,
      locks: {} as never,
      encryption: {} as never,
      audit: {} as never,
      outbox: {} as never,
      clock: {} as never,
    });

    await expect(service.create(actor, 'idempotency-1', {
      target: { agreementId: id('4'), settlementId: id('5') },
      workQueueType: 'AGREEMENT_REVIEW',
      reason: 'Conflicting targets',
    })).rejects.toThrow(/exactly one target/iu);
  });
});

describe('consultant revenue calculation orchestration', () => {
  it('selects the deterministic rule and posts partial collection revenue once', async () => {
    const { ConsultantRevenueCalculationService } = await import(
      '../services/consultant-revenue-calculation.service.js'
    );
    const actor = {
      userId: id('1'),
      staffId: id('2'),
      facilityId: activity.facilityId,
      correlationId: 'correlation-calculation',
      permissionKeys: new Set(['consultants.revenue.calculate']),
      roleKeys: ['FINANCE_MANAGER'],
    } as const;
    let appendedTrace: unknown;
    let ledgerPosting: unknown;
    let completionCount = 0;
    const rule = {
      id: id('a'),
      agreementId: id('b'),
      agreementVersion: 1,
      ruleVersion: 1,
      ruleCode: 'SURGERY_COLLECTION',
      ruleName: 'Surgery collection share',
      status: 'ACTIVE' as const,
      priority: 100,
      isFallback: false,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveThrough: null,
      facilityId: activity.facilityId,
      consultantId: id('c'),
      consultantGroupId: null,
      departmentId: activity.departmentId,
      serviceId: activity.serviceId,
      serviceCategory: activity.serviceCategory,
      chargeCatalogItemId: activity.chargeCatalogItemId,
      procedureId: activity.procedureId,
      patientType: 'CORPORATE_PANEL' as const,
      encounterType: 'SURGERY' as const,
      admissionType: null,
      payerOrganizationId: activity.payerOrganizationId,
      panelProgramId: activity.panelProgramId,
      packageId: null,
      claimType: null,
      calculationMethod: 'PERCENTAGE_OF_ELIGIBLE_REVENUE' as const,
      recognitionBasis: 'COLLECTION_BASIS' as const,
      percentage: '20.000000',
      fixedAmount: null,
      minimumShare: null,
      maximumShare: null,
      perServiceCap: null,
      perCaseCap: null,
      periodCap: null,
      guaranteedAmount: null,
      thresholdAmount: null,
      tiers: [],
      participants: [],
      eligibilityPolicy: policy,
      currency: 'PKR' as const,
      calculationFingerprint: 'f'.repeat(64),
    };
    const service = new ConsultantRevenueCalculationService({
      financialActivity: {
        getAuthoritativeActivity: async () => activity,
        listEligibleActivities: async () => [],
      },
      rules: {
        createMany: async () => [],
        listByAgreement: async () => [],
        findConflictCandidates: async () => [],
        findMatchingCandidates: async () => [{
          agreementId: rule.agreementId,
          agreementNumber: 'CSA-0001',
          agreementVersion: 1,
          agreementStatus: 'ACTIVE',
          agreementPriority: 100,
          rule,
        }],
        activateForAgreement: async () => 0,
        supersedeForAgreement: async () => 0,
      },
      identity: {
        resolveConsultant: async () => ({
          consultantId: rule.consultantId,
          staffId: id('d'),
          userId: id('e'),
          consultantGroupId: null,
          departmentIds: [activity.departmentId!],
          active: true,
        }),
      },
      revenueEntries: {
        findById: async () => null,
        findByCalculationKey: async () => null,
        append: async (input) => {
          appendedTrace = input.trace;
          return {
            id: id('f'),
            facilityId: actor.facilityId,
            consultantId: rule.consultantId,
            agreementId: rule.agreementId,
            agreementRuleId: rule.id,
            invoiceId: activity.invoiceId,
            invoiceLineId: activity.invoiceLineId,
            entryType: input.entryType,
            status: input.status,
            eligibleRevenue: input.trace.shares.eligibleRevenue,
            consultantShare: input.trace.shares.consultantShare,
            hospitalShare: input.trace.shares.hospitalShare,
            taxWithholdingAmount: input.taxWithholdingAmount,
            deductionAmount: input.deductionAmount,
            netPayableAmount: input.netPayableAmount,
            reversalOfEntryId: null,
            calculationHash: input.calculationKey,
            occurredAt: input.occurredAt.toISOString(),
            version: 0,
          };
        },
        list: async () => ({ items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }),
        markStatus: async () => null,
      },
      calculationRuns: {
        start: async () => id('9'),
        complete: async () => { completionCount += 1; },
        fail: async () => undefined,
      },
      ledger: {
        postConsultantLiability: async (input) => {
          ledgerPosting = input;
          return { ledgerEntryId: id('8') };
        },
        postSettlement: async () => ({ ledgerEntryIds: [] }),
      },
      periodCaps: { getRemainingCap: async () => null },
      accessPolicy: {
        authorize: async () => ({
          allowed: true,
          requiredPermission: 'consultants.revenue.calculate',
          accessMode: 'FULL',
          requiresIndependentApproval: false,
          auditSensitiveRead: false,
          minimumNecessaryFields: [],
        }),
      },
      transactions: {
        withTransaction: async (operation) => operation({
          session: {},
          transactionId: 'transaction-1',
          startedAt: new Date('2026-07-23T02:00:00.000Z'),
        }),
      },
      idempotency: { execute: async (input) => input.operation() },
      locks: { withLock: async (input) => input.operation() },
      audit: { record: async () => undefined },
      outbox: { publish: async () => undefined },
      clock: { now: () => new Date('2026-07-23T02:00:00.000Z') },
    });

    const entry = await service.calculate(actor, 'idempotency-calculate-1', {
      sourceFinancialEventId: activity.sourceFinancialEventId,
      invoiceLineId: activity.invoiceLineId,
      consultantId: rule.consultantId,
    });

    expect(entry).toMatchObject({
      status: 'POSTED',
      entryType: 'COLLECTED',
      eligibleRevenue: '2850.00',
      consultantShare: '570.00',
      hospitalShare: '2280.00',
    });
    expect(appendedTrace).toMatchObject({
      agreementRuleId: rule.id,
      recognition: { recognitionRatio: '50.000000' },
      shares: { consultantShare: '570.00', hospitalShare: '2280.00' },
    });
    expect(ledgerPosting).toMatchObject({ consultantShare: '570.00', hospitalShare: '2280.00' });
    expect(completionCount).toBe(1);
  });
});