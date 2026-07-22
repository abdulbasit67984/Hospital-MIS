import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ClaimsActorContext,
} from '../claims.contracts.js';

import {
  ClaimAdjudicationReconciliationError,
  ClaimFinancialReconciliationError,
  ClaimMakerCheckerError,
} from '../claims.errors.js';

import type {
  ClaimAdjustmentRecord,
  ClaimDenialRecord,
  ClaimLineRecord,
  ClaimRecord,
} from '../claims.persistence.types.js';

import type {
  ClaimsTransactionContext,
} from '../claims.ports.js';

import {
  ClaimAdjudicationService,
  type ClaimAdjudicationServiceDependencies,
} from '../services/claim-adjudication.service.js';

import {
  ClaimAdjustmentService,
  type ClaimAdjustmentServiceDependencies,
} from '../services/claim-adjustment.service.js';

import {
  ClaimDenialAppealService,
  type ClaimDenialAppealServiceDependencies,
} from '../services/claim-denial-appeal.service.js';

import {
  ClaimRemittancePaymentService,
  type ClaimRemittancePaymentServiceDependencies,
} from '../services/claim-remittance-payment.service.js';

const facilityId = '64c000000000000000000001';
const makerUserId = '64c000000000000000000002';
const checkerUserId = '64c000000000000000000003';
const claimId = '64c000000000000000000004';
const secondClaimId = '64c000000000000000000005';
const payerId = '64c000000000000000000006';
const otherPayerId = '64c000000000000000000007';
const lineId = '64c000000000000000000008';
const adjustmentId = '64c000000000000000000009';
const denialId = '64c000000000000000000010';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function decimal(value: string): Types.Decimal128 {
  return Types.Decimal128.fromString(value);
}

function actor(userId = checkerUserId): ClaimsActorContext {
  return {
    userId,
    staffId: null,
    facilityId,
    correlationId: 'claims-batch-4-test',
    permissionKeys: new Set([
      'claims.adjudication.record',
      'claims.remittance.import',
      'claims.adjustment.approve',
      'claims.appeal.prepare',
    ]),
    roleKeys: ['CLAIMS_OFFICER'],
  };
}

function transaction(): ClaimsTransactionContext {
  return {
    transactionId: 'claims-batch-4-transaction',
    session: {} as ClaimsTransactionContext['session'],
  };
}

function transactionManager() {
  return {
    execute: async <T>(input: Readonly<{
      execute(context: ClaimsTransactionContext): Promise<T>;
    }>): Promise<T> => input.execute(transaction()),
  };
}

function allowedPolicy() {
  return {
    authorize: vi.fn().mockResolvedValue({
      allowed: true,
      denialReason: null,
      requiresIndependentApproval: false,
    }),
  };
}

function claimFixture(
  id = claimId,
  payerOrganizationId = payerId,
  status: ClaimRecord['status'] = 'UNDER_REVIEW',
): ClaimRecord {
  return {
    _id: objectId(id),
    facilityId: objectId(facilityId),
    patientId: objectId('64c000000000000000000011'),
    patientAccountId: objectId('64c000000000000000000012'),
    invoiceId: objectId('64c000000000000000000013'),
    payerOrganizationId: objectId(payerOrganizationId),
    status,
    version: 3,
    currency: 'PKR',
    claimedAmount: decimal('100.00'),
    approvedAmount: decimal('0.00'),
    deniedAmount: decimal('0.00'),
    disallowedAmount: decimal('0.00'),
    returnedAmount: decimal('0.00'),
    contractualAdjustmentAmount: decimal('0.00'),
    payerWithholdingAmount: decimal('0.00'),
    writeOffAmount: decimal('0.00'),
    paidAmount: decimal('0.00'),
    outstandingAmount: decimal('0.00'),
    debitNoteAmount: decimal('0.00'),
    creditNoteAmount: decimal('0.00'),
    refundAmount: decimal('0.00'),
    repaymentAmount: decimal('0.00'),
  } as unknown as ClaimRecord;
}

function lineFixture(): ClaimLineRecord {
  return {
    _id: objectId(lineId),
    facilityId: objectId(facilityId),
    claimId: objectId(claimId),
    version: 1,
    claimedAmount: decimal('100.00'),
  } as unknown as ClaimLineRecord;
}

function adjustmentFixture(): ClaimAdjustmentRecord {
  return {
    _id: objectId(adjustmentId),
    facilityId: objectId(facilityId),
    claimId: objectId(claimId),
    makerUserId: objectId(makerUserId),
    adjustmentType: 'WRITE_OFF',
    status: 'REQUESTED',
    version: 2,
  } as unknown as ClaimAdjustmentRecord;
}

function denialFixture(): ClaimDenialRecord {
  return {
    _id: objectId(denialId),
    facilityId: objectId(facilityId),
    claimId: objectId(claimId),
    claimLineId: objectId(lineId),
    deniedAmount: decimal('100.00'),
    appealEligible: true,
    appealDeadline: new Date('2026-07-20T00:00:00.000Z'),
    resolved: false,
  } as unknown as ClaimDenialRecord;
}

describe('Claims financial workflows', () => {
  it('requires adjudication input for every authoritative claim line', async () => {
    const service = new ClaimAdjudicationService({
      claims: {
        findById: vi.fn().mockResolvedValue(claimFixture()),
      },
      lines: {
        listByClaim: vi.fn().mockResolvedValue([lineFixture()]),
      },
      workflow: {
        transition: vi.fn(),
      },
      accessPolicy: allowedPolicy(),
      transactionManager: transactionManager(),
    } as unknown as ClaimAdjudicationServiceDependencies);

    await expect(service.record(
      actor(),
      claimId,
      'claims-adjudication-idempotency-key',
      {
        expectedVersion: 3,
        payerReferenceNumber: 'PAYER-CLAIM-1001',
        adjudicatedAt: '2026-07-22T08:00:00.000Z',
        lines: [],
      },
    )).rejects.toBeInstanceOf(ClaimAdjudicationReconciliationError);
  });

  it('rejects remittances that mix claims from different payers', async () => {
    const service = new ClaimRemittancePaymentService({
      claims: {
        findByIds: vi.fn().mockResolvedValue([
          claimFixture(claimId, payerId),
          claimFixture(secondClaimId, otherPayerId),
        ]),
      },
      remittances: {
        findByReference: vi.fn().mockResolvedValue(null),
      },
      accessPolicy: allowedPolicy(),
      transactionManager: transactionManager(),
    } as unknown as ClaimRemittancePaymentServiceDependencies);

    await expect(service.importRemittance(
      actor(),
      'claims-remittance-idempotency-key',
      {
        payerOrganizationId: payerId,
        remittanceReference: 'RA-1001',
        remittanceDate: '2026-07-22T08:00:00.000Z',
        totalPaymentAmount: '100.00',
        currency: 'PKR',
        allocations: [
          {
            claimId,
            paidAmount: '50.00',
            contractualAdjustmentAmount: '0.00',
            disallowedAmount: '0.00',
          },
          {
            claimId: secondClaimId,
            paidAmount: '50.00',
            contractualAdjustmentAmount: '0.00',
            disallowedAmount: '0.00',
          },
        ],
      },
    )).rejects.toBeInstanceOf(ClaimFinancialReconciliationError);
  });

  it('blocks adjustment makers from approving their own request', async () => {
    const approval = vi.fn().mockResolvedValue(undefined);
    const service = new ClaimAdjustmentService({
      adjustments: {
        findById: vi.fn().mockResolvedValue(adjustmentFixture()),
      },
      accessPolicy: allowedPolicy(),
      approval: {
        assertApproved: approval,
      },
    } as unknown as ClaimAdjustmentServiceDependencies);

    await expect(service.approveAndPost(
      actor(makerUserId),
      adjustmentId,
      'claims-adjustment-approval-key',
      {
        expectedVersion: 2,
        approvalRequestId: '64c000000000000000000014',
        reason: 'Approve validated write-off request',
      },
    )).rejects.toBeInstanceOf(ClaimMakerCheckerError);

    expect(approval).not.toHaveBeenCalled();
  });

  it('rejects appeals after the payer deadline', async () => {
    const service = new ClaimDenialAppealService({
      claims: {
        findById: vi.fn().mockResolvedValue(
          claimFixture(claimId, payerId, 'DENIED'),
        ),
      },
      denials: {
        findByIds: vi.fn().mockResolvedValue([denialFixture()]),
      },
      accessPolicy: allowedPolicy(),
      transactionManager: transactionManager(),
      clock: {
        now: () => new Date('2026-07-22T08:00:00.000Z'),
      },
    } as unknown as ClaimDenialAppealServiceDependencies);

    await expect(service.createAppeal(
      actor(),
      claimId,
      'claims-appeal-idempotency-key',
      {
        expectedVersion: 3,
        denialIds: [denialId],
        appealDeadline: '2026-07-20T00:00:00.000Z',
        grounds: 'Medical necessity documentation supports reconsideration.',
        requestedAmount: '100.00',
        evidenceAttachmentIds: ['64c000000000000000000015'],
      },
    )).rejects.toBeInstanceOf(ClaimFinancialReconciliationError);
  });
});