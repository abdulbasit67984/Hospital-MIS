import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('@hospital-mis/database', () => ({
  decimal128ToString: (value: { toString(): string } | string) =>
    typeof value === 'string' ? value : value.toString(),
}));

import { AssistanceReconciliationService } from '../services/assistance-reconciliation.service.js';
import { AssistanceReservationService } from '../services/assistance-reservation.service.js';
import { AssistanceReversalReturnService } from '../services/assistance-reversal-return.service.js';
import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceApplicationNotEligibleError,
  AssistanceFinancialReconciliationError,
  AssistanceMakerCheckerViolationError,
} from '../welfare-zakat.errors.js';
import type {
  AssistanceAllocationRecord,
  AssistanceApplicationRecord,
  AssistanceApprovalRecord,
  AssistanceFundRecord,
} from '../welfare-zakat.persistence.types.js';
import type {
  WelfareZakatTransactionContext,
  WelfareZakatTransactionManagerPort,
} from '../welfare-zakat.ports.js';

const facilityId = '64b000000000000000000001';
const actorUserId = '64b000000000000000000002';
const makerUserId = '64b000000000000000000003';
const fundId = '64b000000000000000000004';
const applicationId = '64b000000000000000000005';
const approvalId = '64b000000000000000000006';
const patientId = '64b000000000000000000007';
const patientAccountId = '64b000000000000000000008';
const invoiceId = '64b000000000000000000009';
const allocationId = '64b000000000000000000010';
const refundId = '64b000000000000000000011';

function objectId(value: string) {
  return {
    toHexString: () => value,
    toString: () => value,
    equals: (candidate: { toString(): string }) => candidate.toString() === value,
  };
}

function decimal(value: string) {
  return { toString: () => value };
}

function actor(userId = actorUserId): WelfareZakatActorContext {
  return {
    userId,
    staffId: null,
    facilityId,
    correlationId: 'welfare-zakat-batch-4-service-test',
    permissionKeys: new Set(),
    roleKeys: ['BILLING_OFFICER'],
  };
}

function transaction(): WelfareZakatTransactionContext {
  return {
    transactionId: 'welfare-zakat-batch-4-service-transaction',
    session: {} as WelfareZakatTransactionContext['session'],
  };
}

type TransactionExecutionInput<T> = Readonly<{
  execute(context: WelfareZakatTransactionContext): Promise<T>;
}>;

function transactionManager(): WelfareZakatTransactionManagerPort {
  const execute = vi.fn(async (options: TransactionExecutionInput<unknown>) =>
    options.execute(transaction()));
  return {
    execute: execute as unknown as WelfareZakatTransactionManagerPort['execute'],
  };
}

function accessPolicy() {
  return {
    authorize: vi.fn(async () => ({
      allowed: true,
      denialReason: null,
      requiresIndependentApproval: true,
    })),
  };
}

function clock() {
  return { now: () => new Date('2026-07-22T10:00:00.000Z') };
}

function application(): AssistanceApplicationRecord {
  return {
    _id: objectId(applicationId),
    facilityId: objectId(facilityId),
    patientId: objectId(patientId),
    status: 'APPROVED',
    version: 3,
  } as unknown as AssistanceApplicationRecord;
}

function approval(): AssistanceApprovalRecord {
  return {
    _id: objectId(approvalId),
    facilityId: objectId(facilityId),
    applicationId: objectId(applicationId),
    fundId: objectId(fundId),
    status: 'APPROVED',
    version: 4,
    expiresAt: new Date('2026-12-31T23:59:59.000Z'),
    approvedAmount: decimal('1000.00'),
    reservedAmount: decimal('0.00'),
    committedAmount: decimal('0.00'),
    utilizedAmount: decimal('250.00'),
    reversedAmount: decimal('0.00'),
    releasedAmount: decimal('0.00'),
    remainingAmount: decimal('750.00'),
  } as unknown as AssistanceApprovalRecord;
}

function fund(): AssistanceFundRecord {
  return {
    _id: objectId(fundId),
    facilityId: objectId(facilityId),
    status: 'ACTIVE',
    version: 5,
    currency: 'PKR',
    openingBalance: decimal('10000.00'),
    inflowAmount: decimal('0.00'),
    transferInAmount: decimal('0.00'),
    transferOutAmount: decimal('0.00'),
    adjustmentIncreaseAmount: decimal('0.00'),
    adjustmentDecreaseAmount: decimal('0.00'),
    ledgerBalance: decimal('9750.00'),
    reservedBalance: decimal('0.00'),
    committedBalance: decimal('0.00'),
    availableBalance: decimal('9750.00'),
    utilizedBalance: decimal('250.00'),
    reversedBalance: decimal('0.00'),
    refundAmount: decimal('0.00'),
    repaymentAmount: decimal('0.00'),
    recoveryAmount: decimal('0.00'),
    writeOffAmount: decimal('0.00'),
  } as unknown as AssistanceFundRecord;
}

function allocation(): AssistanceAllocationRecord {
  return {
    _id: objectId(allocationId),
    facilityId: objectId(facilityId),
    fundId: objectId(fundId),
    patientId: objectId(patientId),
    applicationId: objectId(applicationId),
    approvalId: objectId(approvalId),
    reservationId: null,
    patientAccountId: objectId(patientAccountId),
    invoiceId: objectId(invoiceId),
    claimId: null,
    currency: 'PKR',
    status: 'UTILIZED',
    version: 6,
    amount: decimal('250.00'),
    utilizedAmount: decimal('250.00'),
    reversedAmount: decimal('0.00'),
    refundedAmount: decimal('0.00'),
    repaidAmount: decimal('0.00'),
    recoveredAmount: decimal('0.00'),
    releasedAmount: decimal('0.00'),
    remainingAmount: decimal('0.00'),
    allocatedBy: objectId(makerUserId),
    lines: [],
  } as unknown as AssistanceAllocationRecord;
}

describe('Welfare and Zakat Batch 4 service integrations', () => {
  it('does not reserve patient responsibility before sponsor adjudication is complete', async () => {
    const reservationCreate = vi.fn();
    const dependencies = {
      transactionManager: transactionManager(),
      accessPolicy: accessPolicy(),
      clock: clock(),
      numberSequence: {},
      funds: { findById: vi.fn(async () => fund()) },
      fundTransactions: {},
      applications: { findById: vi.fn(async () => application()) },
      approvals: { findById: vi.fn(async () => approval()) },
      reservations: { create: reservationCreate },
      billing: {
        loadAllocationSource: vi.fn(async () => ({
          patientAccount: {
            id: patientAccountId,
            patientId,
            status: 'OPEN',
            currency: 'PKR',
            patientResponsibilityAmount: '500.00',
            welfareAmount: '0.00',
            payerResponsibilityAmount: '500.00',
            outstandingAmount: '500.00',
          },
          invoice: {
            id: invoiceId,
            patientId,
            patientAccountId,
            status: 'FINALIZED',
            currency: 'PKR',
            netAmount: '1000.00',
            payerAmount: '500.00',
            welfareAmount: '0.00',
            patientAmount: '500.00',
            outstandingAmount: '500.00',
            refundableAmount: '0.00',
            finalizedAt: new Date('2026-07-22T08:00:00.000Z'),
          },
          lines: [],
        })),
      },
      coverageClaims: {
        resolveCoordination: vi.fn(async () => ({
          sponsorAdjudicationComplete: false,
          welfareMayApply: false,
          blockingReasons: ['SPONSOR_ADJUDICATION_PENDING'],
          lines: [],
        })),
      },
      eligibilityLimits: {
        calculateLimitRemaining: vi.fn(async () => ({
          patientPeriodRemainingAmount: null,
          patientLifetimeRemainingAmount: null,
          perInvoiceRemainingAmount: null,
          perServiceRemainingAmount: null,
        })),
      },
      audit: {},
      outbox: {},
    };
    const service = new AssistanceReservationService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceReservationService>[0],
    );

    await expect(service.reserve(actor(), 'reserve-idempotency-key', {
      expectedFundVersion: 5,
      expectedApprovalVersion: 4,
      applicationId,
      approvalId,
      fundId,
      patientId,
      patientAccountId,
      invoiceId,
      amount: '100.00',
      expiresAt: '2026-07-30T10:00:00.000Z',
      priority: 1,
      reason: 'Reserve after coordination of benefits',
    })).rejects.toBeInstanceOf(AssistanceApplicationNotEligibleError);

    expect(reservationCreate).not.toHaveBeenCalled();
  });

  it('blocks a second reversal request while one is awaiting approval', async () => {
    const reversalCreate = vi.fn();
    const pendingAllocation = {
      ...allocation(),
      reversalStatus: 'APPROVAL_PENDING',
    } as AssistanceAllocationRecord;
    const dependencies = {
      transactionManager: transactionManager(),
      accessPolicy: accessPolicy(),
      clock: clock(),
      numberSequence: {},
      attachments: { assertAttachmentIdsUsable: vi.fn() },
      funds: {},
      fundTransactions: {},
      approvals: {},
      allocations: { findById: vi.fn(async () => pendingAllocation) },
      reversals: { create: reversalCreate },
      fundReturns: {},
      billing: {},
      financialApprovals: {},
      financialLedger: {},
      financialDischarge: {},
      audit: {},
      outbox: {},
    };
    const service = new AssistanceReversalReturnService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceReversalReturnService>[0],
    );

    await expect(service.requestReversal(
      actor(),
      allocationId,
      'pending-reversal-idempotency-key',
      {
        expectedVersion: 6,
        amount: '25.00',
        approvalRequestId: '64b000000000000000000012',
        reason: 'Correct an incorrect assistance allocation',
      },
    )).rejects.toBeInstanceOf(AssistanceFinancialReconciliationError);

    expect(reversalCreate).not.toHaveBeenCalled();
  });

  it('derives the return maker from the posted source and blocks the same user as checker', async () => {
    const financialApproval = vi.fn();
    const dependencies = {
      transactionManager: transactionManager(),
      accessPolicy: accessPolicy(),
      clock: clock(),
      numberSequence: {},
      attachments: { assertAttachmentIdsUsable: vi.fn() },
      funds: { findById: vi.fn(async () => fund()) },
      fundTransactions: {},
      approvals: { findById: vi.fn(async () => approval()) },
      allocations: { findById: vi.fn(async () => allocation()) },
      reversals: {},
      fundReturns: {},
      billing: {
        assertFundReturnSource: vi.fn(async () => ({
          makerUserId: actorUserId,
          sourceRecordId: refundId,
        })),
      },
      financialApprovals: { assertApproved: financialApproval },
      financialLedger: {},
      financialDischarge: {},
      audit: {},
      outbox: {},
    };
    const service = new AssistanceReversalReturnService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceReversalReturnService>[0],
    );

    await expect(service.postFundReturn(
      actor(),
      allocationId,
      'return-idempotency-key',
      {
        returnType: 'REFUND',
        input: {
          expectedAllocationVersion: 6,
          amount: '50.00',
          refundId,
          approvalRequestId: '64b000000000000000000012',
          reason: 'Posted refund restores the restricted assistance fund',
        },
      },
    )).rejects.toBeInstanceOf(AssistanceMakerCheckerViolationError);

    expect(financialApproval).not.toHaveBeenCalled();
  });

  it('audits and emits only a safe status payload when fund reconciliation fails', async () => {
    const auditRecord = vi.fn();
    const enqueue = vi.fn();
    const dependencies = {
      transactionManager: transactionManager(),
      accessPolicy: accessPolicy(),
      clock: clock(),
      funds: { findById: vi.fn(async () => fund()) },
      allocations: {},
      billing: {},
      reconciliation: {
        reconcileFund: vi.fn(async () => ({
          reconciled: false,
          expectedBalance: '9750.00',
          actualBalance: '9700.00',
          reservedBalance: '0.00',
          committedBalance: '0.00',
          differences: ['LEDGER_BALANCE expected 9750.00 actual 9700.00'],
        })),
      },
      audit: { record: auditRecord },
      outbox: { enqueue },
    };
    const service = new AssistanceReconciliationService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceReconciliationService>[0],
    );

    const result = await service.reconcileFund(
      actor(),
      fundId,
      'reconcile-idempotency-key',
    );

    expect(result.reconciled).toBe(false);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ASSISTANCE_FUND_RECONCILIATION_FAILED',
        entityId: fundId,
      }),
    );
    const outboxInput = enqueue.mock.calls[0]![0];
    expect(outboxInput.payload).toEqual(
      expect.objectContaining({ fundId, status: 'MISMATCH' }),
    );
    expect(JSON.stringify(outboxInput.payload)).not.toContain('9750.00');
    expect(JSON.stringify(outboxInput.payload)).not.toContain('LEDGER_BALANCE');
  });
});