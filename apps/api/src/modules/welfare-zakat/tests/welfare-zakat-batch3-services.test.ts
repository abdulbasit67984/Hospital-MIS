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

import { AssistanceApprovalService } from '../services/assistance-approval.service.js';
import { AssistanceDonationService } from '../services/assistance-donation.service.js';
import { AssistanceEligibilityService } from '../services/assistance-eligibility.service.js';
import { AssistanceWorkQueueService } from '../services/assistance-work-queue.service.js';
import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  AssistanceApprovalRequiredError,
  AssistanceEscalationTargetRequiredError,
  AssistanceFundInactiveError,
  AssistanceMakerCheckerViolationError,
} from '../welfare-zakat.errors.js';
import type {
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
const makerUserId = actorUserId;
const applicationId = '64b000000000000000000003';
const approvalId = '64b000000000000000000004';
const fundId = '64b000000000000000000005';
const workItemId = '64b000000000000000000006';

function objectId(value: string) {
  return {
    toHexString: () => value,
    toString: () => value,
  };
}

function actor(): WelfareZakatActorContext {
  return {
    userId: actorUserId,
    staffId: null,
    facilityId,
    correlationId: 'welfare-zakat-batch-3-service-test',
    permissionKeys: new Set(),
    roleKeys: ['SOCIAL_WELFARE_OFFICER'],
  };
}

function transaction(): WelfareZakatTransactionContext {
  return {
    transactionId: 'welfare-zakat-batch-3-service-transaction',
    session: {} as WelfareZakatTransactionContext['session'],
  };
}

type TransactionExecutionInput<T> = Readonly<{
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: readonly string[];
  idempotencyPayload: unknown;
  journalPayload: unknown;
  execute(context: WelfareZakatTransactionContext): Promise<T>;
}>;

function transactionManager(): WelfareZakatTransactionManagerPort {
  const execute = vi.fn(async (options: TransactionExecutionInput<unknown>) =>
    options.execute(transaction()));
  return {
    execute: execute as unknown as WelfareZakatTransactionManagerPort['execute'],
  };
}

function allowedAccessPolicy() {
  return {
    authorize: vi.fn(async () => ({
      allowed: true,
      requiredPermission: 'welfare_zakat.read',
      accessMode: 'FULL',
      requiresIndependentApproval: false,
      auditSensitiveRead: false,
      minimumNecessaryFields: [],
    })),
  };
}

function clock() {
  return {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  };
}

describe('Welfare and Zakat Batch 3 services', () => {
  it('requires an approved financial request before recording a donation or inflow', async () => {
    const dependencies = {
      funds: {},
      fundTransactions: {},
      accessPolicy: allowedAccessPolicy(),
      transactionManager: transactionManager(),
      attachments: {
        assertAttachmentIdsUsable: vi.fn(),
      },
      audit: {},
      outbox: {},
      clock: clock(),
      sequences: {},
      financialApprovals: {},
      financialLedger: {},
    };
    const service = new AssistanceDonationService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceDonationService>[0],
    );

    await expect(service.recordInflow(actor(), fundId, 'donation-idempotency-key', {
      expectedFundVersion: 3,
      transactionType: 'DONATION',
      amount: '1000.00',
      receivedAt: '2026-07-22T08:00:00.000Z',
      reason: 'Restricted donation received for eligible treatment',
    })).rejects.toBeInstanceOf(AssistanceApprovalRequiredError);

    expect(dependencies.attachments.assertAttachmentIdsUsable).not.toHaveBeenCalled();
    expect(dependencies.transactionManager.execute).not.toHaveBeenCalled();
  });

  it('prevents the approval maker from acting as the checker', async () => {
    const approval = {
      _id: objectId(approvalId),
      facilityId: objectId(facilityId),
      applicationId: objectId(applicationId),
      fundId: objectId(fundId),
      makerUserId: objectId(makerUserId),
      status: 'PENDING',
    } as unknown as AssistanceApprovalRecord;
    const dependencies = {
      applications: {},
      applicationHistories: {},
      approvals: {
        findById: vi.fn(async () => approval),
      },
      approvalHistories: {},
      funds: {},
      workQueue: {},
      accessPolicy: allowedAccessPolicy(),
      transactionManager: transactionManager(),
      attachments: {},
      audit: {},
      outbox: {},
      clock: clock(),
      sequences: {},
      encryption: {
        encrypt: vi.fn(async (value: string) => value),
      },
      financialApprovals: {},
    };
    const service = new AssistanceApprovalService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceApprovalService>[0],
    );

    await expect(service.decide(actor(), approvalId, 'approval-idempotency-key', {
      expectedVersion: 2,
      decision: 'APPROVE',
      approvedAmount: '500.00',
      decisionReason: 'Eligibility and financial review completed',
    })).rejects.toBeInstanceOf(AssistanceMakerCheckerViolationError);

    expect(dependencies.approvals.findById).toHaveBeenCalledWith(
      facilityId,
      approvalId,
      expect.anything(),
    );
  });

  it('rejects escalation without an explicit destination user', async () => {
    const dependencies = {
      workQueue: {},
      accessPolicy: allowedAccessPolicy(),
      transactionManager: transactionManager(),
      audit: {},
      outbox: {},
      clock: clock(),
      encryption: {
        encrypt: vi.fn(),
      },
    };
    const service = new AssistanceWorkQueueService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceWorkQueueService>[0],
    );

    await expect(service.escalate(actor(), workItemId, 'escalation-idempotency-key', {
      expectedVersion: 1,
      escalationLevel: 2,
      reason: 'Review deadline exceeded',
    })).rejects.toBeInstanceOf(AssistanceEscalationTargetRequiredError);

    expect(dependencies.encryption.encrypt).not.toHaveBeenCalled();
    expect(dependencies.transactionManager.execute).not.toHaveBeenCalled();
  });

  it('blocks eligibility evaluation against an inactive fund', async () => {
    const application = {
      _id: objectId(applicationId),
      facilityId: objectId(facilityId),
      status: 'SUBMITTED',
      version: 4,
    } as unknown as AssistanceApplicationRecord;
    const fund = {
      _id: objectId(fundId),
      facilityId: objectId(facilityId),
      status: 'DRAFT',
      version: 2,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveThrough: null,
    } as unknown as AssistanceFundRecord;
    const dependencies = {
      applications: {
        findById: vi.fn(async () => application),
      },
      applicationHistories: {},
      funds: {
        findById: vi.fn(async () => fund),
      },
      reviews: {},
      context: {
        build: vi.fn(),
      },
      accessPolicy: allowedAccessPolicy(),
      transactionManager: transactionManager(),
      audit: {},
      outbox: {},
      clock: clock(),
    };
    const service = new AssistanceEligibilityService(
      dependencies as unknown as ConstructorParameters<typeof AssistanceEligibilityService>[0],
    );

    await expect(service.evaluate(
      actor(),
      applicationId,
      fundId,
      'eligibility-idempotency-key',
    )).rejects.toBeInstanceOf(AssistanceFundInactiveError);

    expect(dependencies.context.build).not.toHaveBeenCalled();
  });
});