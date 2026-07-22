import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const database = vi.hoisted(() => ({
  assistanceApplicationFindOneAndUpdate: vi.fn(),
  assistanceApplicationUpdateOne: vi.fn(),
  assistanceWorkItemFindOneAndUpdate: vi.fn(),
}));

vi.mock('@hospital-mis/database', () => ({
  AssistanceApplicationModel: {
    findOneAndUpdate: database.assistanceApplicationFindOneAndUpdate,
    updateOne: database.assistanceApplicationUpdateOne,
  },
  AssistanceApplicationHistoryModel: {},
  AssistanceReviewModel: {},
  EligibilityEvaluationSnapshotModel: {},
  AssistanceWorkItemModel: {
    findOneAndUpdate: database.assistanceWorkItemFindOneAndUpdate,
  },
  decimal128: (value: string) => ({ toString: () => value }),
  toObjectId: (value: string) => ({
    toHexString: () => value,
    toString: () => value,
  }),
}));

import {
  MongoAssistanceApplicationRepository,
} from '../repositories/assistance-application.repository.js';
import {
  MongoAssistanceWorkQueueRepository,
} from '../repositories/assistance-work-queue.repository.js';
import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import type {
  WelfareZakatTransactionContext,
} from '../welfare-zakat.ports.js';

const facilityId = '64b000000000000000000001';
const actorUserId = '64b000000000000000000002';
const assigneeUserId = '64b000000000000000000003';
const applicationId = '64b000000000000000000004';
const workItemId = '64b000000000000000000005';
const snapshotId = '64b000000000000000000006';

function actor(): WelfareZakatActorContext {
  return {
    userId: actorUserId,
    staffId: null,
    facilityId,
    correlationId: 'welfare-zakat-batch-3-repository-test',
    permissionKeys: new Set(),
    roleKeys: ['SOCIAL_WELFARE_OFFICER'],
  };
}

function transaction(): WelfareZakatTransactionContext {
  return {
    transactionId: 'welfare-zakat-batch-3-transaction',
    session: {} as WelfareZakatTransactionContext['session'],
  };
}

function queryResult<T>(value: T) {
  return {
    lean: () => ({
      exec: async () => value,
    }),
  };
}

describe('Welfare and Zakat Batch 3 repositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atomically mirrors a work-item assignment onto the application assignment', async () => {
    const updatedWorkItem = {
      _id: { toHexString: () => workItemId },
      applicationId: { toHexString: () => applicationId },
      facilityId: { toHexString: () => facilityId },
      status: 'ASSIGNED',
      version: 5,
    };
    database.assistanceWorkItemFindOneAndUpdate.mockReturnValue(
      queryResult(updatedWorkItem),
    );
    database.assistanceApplicationUpdateOne.mockReturnValue({
      exec: async () => ({ modifiedCount: 1 }),
    });

    const repository = new MongoAssistanceWorkQueueRepository();
    const result = await repository.assign({
      actor: actor(),
      workItemId,
      input: {
        expectedVersion: 4,
        assignedToUserId: assigneeUserId,
        followUpAt: '2026-07-25T09:00:00.000Z',
        reason: 'Assign to the responsible welfare officer',
      },
      transaction: transaction(),
    });

    expect(result?.status).toBe('ASSIGNED');
    expect(database.assistanceWorkItemFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 4,
      }),
      expect.objectContaining({
        $inc: { version: 1 },
      }),
      expect.objectContaining({
        runValidators: true,
      }),
    );
    expect(database.assistanceApplicationUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: updatedWorkItem.applicationId,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          assignedToUserId: expect.any(Object),
          assignedBy: expect.any(Object),
        }),
        $inc: { version: 1 },
      }),
      expect.objectContaining({
        runValidators: true,
      }),
    );
  });

  it('records an immutable eligibility snapshot reference with optimistic concurrency', async () => {
    const updatedApplication = {
      _id: { toHexString: () => applicationId },
      facilityId: { toHexString: () => facilityId },
      status: 'UNDER_REVIEW',
      eligibilityOutcome: 'MANUAL_REVIEW',
      eligibilitySnapshotId: { toHexString: () => snapshotId },
      version: 8,
    };
    database.assistanceApplicationFindOneAndUpdate.mockReturnValue(
      queryResult(updatedApplication),
    );

    const repository = new MongoAssistanceApplicationRepository();
    const result = await repository.recordEligibility({
      actor: actor(),
      applicationId,
      expectedVersion: 7,
      outcome: 'MANUAL_REVIEW',
      eligibilitySnapshotId: snapshotId,
      transaction: transaction(),
    });

    expect(result?.eligibilityOutcome).toBe('MANUAL_REVIEW');
    expect(database.assistanceApplicationFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 7,
        status: { $nin: ['CLOSED', 'CANCELLED'] },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          eligibilityOutcome: 'MANUAL_REVIEW',
          eligibilitySnapshotId: expect.any(Object),
        }),
        $inc: { version: 1 },
      }),
      expect.objectContaining({
        runValidators: true,
      }),
    );
  });
});