import { describe, expect, it, vi } from 'vitest';

import type {
  ConsultantRevenueEntryView,
  ConsultantSettlementView,
  ConsultantSharingActorContext,
} from '../consultant-sharing.contracts.js';
import { ConsultantRevenueAdjustmentService } from '../services/consultant-revenue-adjustment.service.js';
import { ConsultantPayoutService } from '../services/consultant-payout.service.js';
import { ConsultantReconciliationService } from '../services/consultant-reconciliation.service.js';
import { ConsultantSettlementService } from '../services/consultant-settlement.service.js';

const objectId = (digit: string): string => digit.repeat(24);
const now = new Date('2026-07-23T08:00:00.000Z');

const actor: ConsultantSharingActorContext = {
  userId: objectId('1'),
  staffId: objectId('2'),
  facilityId: objectId('3'),
  correlationId: 'consultant-sharing-batch-4-test',
  permissionKeys: new Set(),
  roleKeys: ['FINANCE_MANAGER'],
};

const allowDecision = {
  allowed: true,
  requiredPermission: 'consultants.read' as const,
  accessMode: 'FULL' as const,
  requiresIndependentApproval: false,
  auditSensitiveRead: false,
  minimumNecessaryFields: [] as const,
};

const transaction = {
  session: null,
  transactionId: 'consultant-sharing-test-transaction',
  startedAt: now,
};

function runtimeDependencies() {
  return {
    accessPolicy: { authorize: vi.fn().mockResolvedValue(allowDecision) },
    transactions: { withTransaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction)) },
    idempotency: { execute: vi.fn(async (input: { operation(): Promise<unknown> }) => input.operation()) },
    locks: { withLock: vi.fn(async (input: { operation(): Promise<unknown> }) => input.operation()) },
    audit: { record: vi.fn().mockResolvedValue(undefined) },
    outbox: { publish: vi.fn().mockResolvedValue(undefined) },
    clock: { now: vi.fn(() => now) },
  };
}

function revenueEntry(overrides: Partial<ConsultantRevenueEntryView> = {}): ConsultantRevenueEntryView {
  return {
    id: objectId('4'),
    facilityId: actor.facilityId,
    consultantId: objectId('5'),
    agreementId: objectId('6'),
    agreementRuleId: objectId('7'),
    invoiceId: objectId('8'),
    invoiceLineId: objectId('9'),
    entryType: 'EARNED',
    status: 'POSTED',
    eligibleRevenue: '1000.00',
    consultantShare: '300.00',
    hospitalShare: '700.00',
    taxWithholdingAmount: '10.00',
    deductionAmount: '10.00',
    netPayableAmount: '280.00',
    settledAmount: '0.00',
    outstandingAmount: '280.00',
    settlementId: null,
    reversalOfEntryId: null,
    calculationHash: 'a'.repeat(64),
    occurredAt: now.toISOString(),
    version: 0,
    ...overrides,
  };
}

function settlement(overrides: Partial<ConsultantSettlementView> = {}): ConsultantSettlementView {
  return {
    id: objectId('a'),
    facilityId: actor.facilityId,
    settlementNumber: 'CS-2026-000001',
    consultantId: objectId('5'),
    periodType: 'MONTHLY',
    periodFrom: '2026-07-01T00:00:00.000Z',
    periodThrough: '2026-07-31T23:59:59.999Z',
    status: 'APPROVED',
    currency: 'PKR',
    totals: {
      openingBalance: '0.00',
      broughtForwardBalance: '0.00',
      eligibleRevenue: '1000.00',
      consultantShare: '300.00',
      adjustments: '0.00',
      refundDeductions: '0.00',
      creditNoteDeductions: '0.00',
      debitNoteAdditions: '0.00',
      claimDeductions: '0.00',
      welfareZakatDeductions: '0.00',
      taxWithholding: '0.00',
      otherDeductions: '0.00',
      advanceRecovery: '0.00',
      overpaymentRecovery: '0.00',
      paidAmount: '200.00',
      grossPayable: '300.00',
      totalDeductions: '0.00',
      netPayable: '300.00',
      outstandingAmount: '100.00',
    },
    submittedBy: objectId('b'),
    approvedBy: objectId('c'),
    submittedAt: now.toISOString(),
    approvedAt: now.toISOString(),
    paidAt: null,
    ledgerTransactionId: objectId('d'),
    itemCount: 1,
    revenueEntryCount: 1,
    version: 2,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe('consultant-sharing Batch 4 financial integration', () => {
  it('rejects manual adjustments whose consultant and hospital deltas do not reconcile', async () => {
    const service = new ConsultantRevenueAdjustmentService({
      ...runtimeDependencies(),
      revenueEntries: {} as never,
      adjustments: {} as never,
      reversals: {} as never,
      approval: {} as never,
      ledger: {} as never,
      attachments: { assertAttachmentIdsUsable: vi.fn() },
      sequence: {} as never,
    });

    await expect(service.requestAdjustment(actor, 'adjustment-idempotency-key', {
      revenueEntryId: objectId('4'),
      eligibleRevenueDelta: '100.00',
      consultantShareDelta: '40.00',
      hospitalShareDelta: '50.00',
      reasonCode: 'CORRECTION',
      reason: 'Correct an authoritative allocation',
      approvalRequestId: objectId('e'),
    })).rejects.toThrow(/must equal the eligible-revenue delta/iu);
  });

  it('calculates a settlement from immutable revenue and reversal entries with exact decimal totals', async () => {
    const sourceEntries = [
      revenueEntry(),
      revenueEntry({
        id: objectId('f'),
        entryType: 'REVERSAL',
        eligibleRevenue: '200.00',
        consultantShare: '60.00',
        hospitalShare: '140.00',
        taxWithholdingAmount: '0.00',
        deductionAmount: '0.00',
        netPayableAmount: '60.00',
        outstandingAmount: '60.00',
        calculationHash: 'b'.repeat(64),
      }),
    ];
    const create = vi.fn(async (input: { totals: ConsultantSettlementView['totals'] }) => settlement({
      status: 'CALCULATED',
      totals: input.totals,
      submittedBy: null,
      approvedBy: null,
      submittedAt: null,
      approvedAt: null,
      ledgerTransactionId: null,
      version: 0,
    }));
    const appendMany = vi.fn().mockResolvedValue(2);
    const reserveForSettlement = vi.fn().mockResolvedValue(2);
    const service = new ConsultantSettlementService({
      ...runtimeDependencies(),
      settlements: {
        findByDuplicateKey: vi.fn().mockResolvedValue(null),
        create,
      } as never,
      sources: {
        listUnsettled: vi.fn().mockResolvedValue(sourceEntries),
        reserveForSettlement,
      } as never,
      items: { appendMany } as never,
      approval: {} as never,
      ledger: {} as never,
      sequence: { next: vi.fn().mockResolvedValue('CS-2026-000001') },
    });

    const result = await service.calculate(actor, 'settlement-idempotency-key', {
      consultantId: objectId('5'),
      periodType: 'MONTHLY',
      periodFrom: new Date('2026-07-01T00:00:00.000Z'),
      periodThrough: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result.settlement.totals).toMatchObject({
      eligibleRevenue: '800.00',
      consultantShare: '240.00',
      refundDeductions: '60.00',
      taxWithholding: '10.00',
      otherDeductions: '10.00',
      netPayable: '160.00',
      outstandingAmount: '160.00',
    });
    expect(appendMany).toHaveBeenCalledOnce();
    expect(reserveForSettlement).toHaveBeenCalledWith(expect.objectContaining({
      revenueEntryIds: [objectId('4'), objectId('f')],
    }));
  });

  it('prevents a requested consultant payout from exceeding the approved settlement balance', async () => {
    const service = new ConsultantPayoutService({
      ...runtimeDependencies(),
      settlements: { findById: vi.fn().mockResolvedValue(settlement()) } as never,
      payments: { create: vi.fn() } as never,
      approval: {} as never,
      payout: {} as never,
      ledger: {} as never,
      sequence: { next: vi.fn().mockResolvedValue('CP-2026-000001') },
    });

    await expect(service.request(actor, 'payout-idempotency-key', {
      settlementId: objectId('a'),
      paymentMethod: 'BANK_TRANSFER',
      paymentMethodId: objectId('b'),
      amount: '100.01',
      paymentReference: 'BANK-TRANSFER-0001',
      approvalRequestId: objectId('e'),
    })).rejects.toThrow(/exceed the approved outstanding settlement balance/iu);
  });

  it('rejects payout requests whose deductions exceed the authorized amount', async () => {
    const service = new ConsultantPayoutService({
      ...runtimeDependencies(),
      settlements: {} as never,
      payments: {} as never,
      approval: {} as never,
      payout: {} as never,
      ledger: {} as never,
      sequence: {} as never,
    });

    await expect(service.request(actor, 'payout-deduction-idempotency-key', {
      settlementId: objectId('a'),
      paymentMethod: 'DIGITAL_PAYMENT',
      paymentMethodId: objectId('b'),
      amount: '100.00',
      taxWithholdingAmount: '60.00',
      otherDeductionAmount: '50.00',
      paymentReference: 'DIGITAL-0001',
      approvalRequestId: objectId('e'),
    })).rejects.toThrow(/deductions exceed the payout amount/iu);
  });


  it('reverses a paid consultant payout and restores the settlement outstanding balance atomically', async () => {
    const paidSettlement = settlement({
      status: 'PARTIALLY_PAID',
      totals: {
        ...settlement().totals,
        paidAmount: '200.00',
        outstandingAmount: '100.00',
      },
      version: 4,
    });
    const originalPayment = {
      id: objectId('1'),
      facilityId: actor.facilityId,
      payoutNumber: 'CP-2026-000001',
      settlementId: paidSettlement.id,
      consultantId: paidSettlement.consultantId,
      status: 'PAID' as const,
      paymentMethod: 'BANK_TRANSFER' as const,
      currency: 'PKR',
      amount: '100.00',
      netDisbursedAmount: '100.00',
      paymentId: objectId('2'),
      reversalOfPaymentId: null,
      reversedByPaymentId: null,
      makerUserId: objectId('4'),
      approvalRequestId: objectId('5'),
      ledgerTransactionId: objectId('6'),
      paidAt: now.toISOString(),
      version: 2,
    };
    const reversalPayment = {
      ...originalPayment,
      id: objectId('7'),
      payoutNumber: 'CPR-2026-000001',
      status: 'REVERSED' as const,
      paymentId: objectId('8'),
      reversalOfPaymentId: originalPayment.id,
      makerUserId: objectId('9'),
      approvalRequestId: objectId('a'),
      ledgerTransactionId: objectId('b'),
      paidAt: null,
      version: 0,
    };
    const reversePayment = vi.fn(async (input: { authoritativeTotals: ConsultantSettlementView['totals'] }) => settlement({
      ...paidSettlement,
      status: 'PARTIALLY_PAID',
      totals: input.authoritativeTotals,
      version: 5,
    }));
    const service = new ConsultantPayoutService({
      ...runtimeDependencies(),
      settlements: {
        findById: vi.fn().mockResolvedValue(paidSettlement),
        reversePayment,
      } as never,
      payments: {
        findById: vi.fn().mockResolvedValue(originalPayment),
        createReversal: vi.fn().mockResolvedValue(reversalPayment),
      } as never,
      approval: { requireApproved: vi.fn().mockResolvedValue(undefined) },
      payout: {
        reversePayout: vi.fn().mockResolvedValue({
          paymentReversalId: objectId('8'),
          status: 'REVERSED',
          amount: '100.00',
          occurredAt: now.toISOString(),
        }),
      } as never,
      ledger: {
        postPayoutReversal: vi.fn().mockResolvedValue({ ledgerTransactionId: objectId('b') }),
      } as never,
      sequence: { next: vi.fn().mockResolvedValue('CPR-2026-000001') },
    });

    const result = await service.reverse(actor, 'payout-reversal-idempotency-key', {
      settlementPaymentId: originalPayment.id,
      expectedSettlementVersion: 4,
      makerUserId: objectId('9'),
      approvalRequestId: objectId('a'),
      reason: 'Bank confirmed the payout was returned',
    });

    expect(result.reversalPayment.status).toBe('REVERSED');
    expect(result.settlement.totals).toMatchObject({
      paidAmount: '100.00',
      outstandingAmount: '200.00',
    });
    expect(reversePayment).toHaveBeenCalledWith(expect.objectContaining({
      originalPaymentId: originalPayment.id,
      amount: '100.00',
    }));
  });

  it('marks reconciliation as failed when revenue, settlement, or ledger variances remain', async () => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new ConsultantReconciliationService({
      repository: {
        reconcileRevenue: vi.fn().mockResolvedValue([{
          revenueEntryId: objectId('4'),
          consultantId: objectId('5'),
          expectedStatus: 'POSTED',
          expectedOutstandingAmount: '100.00',
          persistedOutstandingAmount: '99.00',
          variance: '1.00',
          settlementId: null,
        }]),
        reconcileSettlements: vi.fn().mockResolvedValue([]),
        reconcileLedger: vi.fn().mockResolvedValue([{
          entityType: 'REVENUE_ENTRY',
          entityId: objectId('4'),
          expectedAmount: '300.00',
          ledgerAmount: '299.50',
          variance: '0.50',
          ledgerTransactionIds: [objectId('d')],
        }]),
      },
      accessPolicy: { authorize: vi.fn().mockResolvedValue(allowDecision) },
      audit,
      clock: { now: vi.fn(() => now) },
    });

    const result = await service.run({
      actor,
      from: new Date('2026-07-01T00:00:00.000Z'),
      through: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(result).toMatchObject({ reconciled: false, totalVariance: '1.50' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CONSULTANT_RECONCILIATION_RUN',
      after: expect.objectContaining({ reconciled: false, totalVariance: '1.50' }),
    }));
  });
});