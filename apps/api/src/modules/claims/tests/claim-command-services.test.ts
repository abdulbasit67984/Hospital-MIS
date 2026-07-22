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
  ClaimFinancialReconciliationError,
  ClaimMakerCheckerError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import type {
  ClaimBatchRecord,
  ClaimRecord,
  ClaimWorkItemRecord,
} from '../claims.persistence.types.js';

import type {
  ClaimsTransactionContext,
} from '../claims.ports.js';

import {
  ClaimBatchService,
  type ClaimBatchServiceDependencies,
} from '../services/claim-batch.service.js';

import {
  ClaimWorkQueueService,
  type ClaimWorkQueueServiceDependencies,
} from '../services/claim-work-queue.service.js';

const facilityId = '64b000000000000000000001';
const makerUserId = '64b000000000000000000002';
const checkerUserId = '64b000000000000000000003';
const payerId = '64b000000000000000000004';
const otherPayerId = '64b000000000000000000005';
const panelPlanId = '64b000000000000000000006';
const claimOneId = '64b000000000000000000007';
const claimTwoId = '64b000000000000000000008';
const batchId = '64b000000000000000000009';
const workItemId = '64b000000000000000000010';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function actor(userId = checkerUserId): ClaimsActorContext {
  return {
    userId,
    staffId: null,
    facilityId,
    correlationId: 'claims-batch-3-test',
    permissionKeys: new Set(['claims.read', 'claims.batch.manage']),
    roleKeys: ['CLAIMS_OFFICER'],
  };
}

function transaction(): ClaimsTransactionContext {
  return {
    transactionId: 'claims-batch-3-transaction',
    session: {} as ClaimsTransactionContext['session'],
  };
}

function claimFixture(
  id: string,
  payerOrganizationId: string,
): ClaimRecord {
  return {
    _id: objectId(id),
    payerOrganizationId: objectId(payerOrganizationId),
    panelPlanId: objectId(panelPlanId),
    status: 'READY',
  } as unknown as ClaimRecord;
}

function batchFixture(createdBy = makerUserId): ClaimBatchRecord {
  return {
    _id: objectId(batchId),
    facilityId: objectId(facilityId),
    createdBy: objectId(createdBy),
    status: 'DRAFT',
    version: 2,
  } as unknown as ClaimBatchRecord;
}

function workItemFixture(): ClaimWorkItemRecord {
  return {
    _id: objectId(workItemId),
    facilityId: objectId(facilityId),
    claimId: objectId(claimOneId),
    status: 'OPEN',
    version: 3,
  } as unknown as ClaimWorkItemRecord;
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

function batchDependencies(
  overrides: Partial<ClaimBatchServiceDependencies> = {},
): ClaimBatchServiceDependencies {
  return {
    claims: {
      findByIds: vi.fn().mockResolvedValue([]),
    },
    batches: {
      findById: vi.fn().mockResolvedValue(null),
    },
    accessPolicy: allowedPolicy(),
    approval: {
      assertApproved: vi.fn().mockResolvedValue(undefined),
    },
    transactionManager: transactionManager(),
    audit: {
      record: vi.fn().mockResolvedValue(undefined),
    },
    outbox: {
      enqueue: vi.fn().mockResolvedValue(undefined),
    },
    clock: {
      now: () => new Date('2026-07-22T08:00:00.000Z'),
    },
    numberSequence: {
      next: vi.fn().mockResolvedValue('CLB-2026-000001'),
    },
    encryption: {
      encrypt: vi.fn().mockResolvedValue('encrypted'),
    },
    ...overrides,
  } as unknown as ClaimBatchServiceDependencies;
}

function workQueueDependencies(
  overrides: Partial<ClaimWorkQueueServiceDependencies> = {},
): ClaimWorkQueueServiceDependencies {
  return {
    claims: {
      findById: vi.fn().mockResolvedValue(
        claimFixture(claimOneId, payerId),
      ),
      updateStatus: vi.fn().mockResolvedValue(
        claimFixture(claimOneId, payerId),
      ),
    },
    workQueue: {
      findById: vi.fn().mockResolvedValue(workItemFixture()),
      assign: vi.fn().mockResolvedValue(null),
    },
    accessPolicy: allowedPolicy(),
    transactionManager: transactionManager(),
    audit: {
      record: vi.fn().mockResolvedValue(undefined),
    },
    outbox: {
      enqueue: vi.fn().mockResolvedValue(undefined),
    },
    clock: {
      now: () => new Date('2026-07-22T08:00:00.000Z'),
    },
    encryption: {
      encrypt: vi.fn().mockResolvedValue('encrypted'),
    },
    ...overrides,
  } as unknown as ClaimWorkQueueServiceDependencies;
}

describe('Claims command services', () => {
  it('rejects a claim batch containing claims for different payers', async () => {
    const service = new ClaimBatchService(batchDependencies({
      claims: {
        findByIds: vi.fn().mockResolvedValue([
          claimFixture(claimOneId, payerId),
          claimFixture(claimTwoId, otherPayerId),
        ]),
      } as unknown as ClaimBatchServiceDependencies['claims'],
    }));

    await expect(service.create(
      actor(makerUserId),
      'claims-batch-create-key',
      {
        payerOrganizationId: payerId,
        panelPlanId,
        submissionChannel: 'ELECTRONIC',
        claimIds: [claimOneId, claimTwoId],
      },
    )).rejects.toBeInstanceOf(ClaimFinancialReconciliationError);
  });

  it('enforces maker-checker separation when approving a batch', async () => {
    const approval = vi.fn().mockResolvedValue(undefined);
    const service = new ClaimBatchService(batchDependencies({
      batches: {
        findById: vi.fn().mockResolvedValue(batchFixture(makerUserId)),
      } as unknown as ClaimBatchServiceDependencies['batches'],
      approval: {
        assertApproved: approval,
      },
    }));

    await expect(service.approve(
      actor(makerUserId),
      batchId,
      'claims-batch-approve-key',
      {
        expectedVersion: 2,
        approvalRequestId: '64b000000000000000000011',
        reason: 'Approve tested submission batch',
      },
    )).rejects.toBeInstanceOf(ClaimMakerCheckerError);

    expect(approval).not.toHaveBeenCalled();
  });

  it('surfaces optimistic concurrency conflicts for work-item assignment', async () => {
    const service = new ClaimWorkQueueService(workQueueDependencies());

    await expect(service.assign(
      actor(),
      workItemId,
      'claims-work-item-assign-key',
      {
        expectedVersion: 3,
        assignedToUserId: checkerUserId,
        followUpAt: '2026-07-23T08:00:00.000Z',
        priority: 7,
        reason: 'Assign for payer follow-up',
      },
    )).rejects.toBeInstanceOf(ClaimVersionConflictError);
  });
});