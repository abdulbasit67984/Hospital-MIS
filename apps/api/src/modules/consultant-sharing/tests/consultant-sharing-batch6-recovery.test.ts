import { describe, expect, it, vi } from 'vitest';

import { ConsultantSharingBackgroundJobs } from '../jobs/consultant-sharing-background-jobs.js';
import { ConsultantSharingRecoveryService } from '../services/consultant-sharing-recovery.service.js';

const facilityId = '507f1f77bcf86cd799439011';
const calculationRunId = '507f1f77bcf86cd799439012';
const calculationHash = 'a'.repeat(64);

describe('Consultant Sharing recovery', () => {
  it('closes the original interrupted run after successful recovery', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const service = new ConsultantSharingRecoveryService({
      database: { collection: vi.fn(() => ({ updateOne })) },
    } as never);

    await service.completeCalculationRecovery(
      facilityId,
      calculationRunId,
      calculationHash,
      new Date('2026-07-23T01:00:00.000Z'),
    );

    const [, update] = updateOne.mock.calls[0] as readonly [unknown, Record<string, unknown>];
    expect(update).toMatchObject({
      $set: {
        status: 'COMPLETED',
        outputCalculationHash: calculationHash,
      },
      $unset: { leaseOwner: '', leaseExpiresAt: '' },
    });
  });

  it('dead-letters the original run when recovery attempts are exhausted', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const service = new ConsultantSharingRecoveryService({
      database: { collection: vi.fn(() => ({ updateOne })) },
    } as never);

    await service.failCalculationRecovery(
      facilityId,
      calculationRunId,
      5,
      5,
      new Error('temporary bank integration detail must remain sanitized'),
      new Date('2026-07-23T01:00:00.000Z'),
    );

    const [, update] = updateOne.mock.calls[0] as readonly [unknown, Record<string, unknown>];
    expect(update).toMatchObject({
      $set: {
        status: 'DEAD_LETTERED',
        errorCode: 'RECOVERY_ATTEMPTS_EXHAUSTED',
        nextAttemptAt: null,
      },
      $max: { attemptCount: 5 },
    });
  });

  it('updates recovery state from the registered calculation-recovery handler', async () => {
    const handlers = new Map<string, (job: never) => Promise<void>>();
    const completeCalculationRecovery = vi.fn().mockResolvedValue(undefined);
    const failCalculationRecovery = vi.fn().mockResolvedValue(undefined);
    const calculate = vi.fn().mockResolvedValue({ calculationHash });

    new ConsultantSharingBackgroundJobs({
      jobRunner: {
        register: vi.fn((type: string, handler: (job: never) => Promise<void>) => {
          handlers.set(type, handler);
        }),
      },
      reports: {},
      recovery: {
        completeCalculationRecovery,
        failCalculationRecovery,
      },
      agreementApprovals: {},
      revenueCalculation: { calculate },
      recalculation: {},
      settlements: {},
      reconciliation: {},
    } as never);

    const handler = handlers.get('CONSULTANT_SHARING_CALCULATION_RECOVERY');
    expect(handler).toBeDefined();
    await handler?.({
      facilityId,
      jobId: 'job-1',
      jobType: 'CONSULTANT_SHARING_CALCULATION_RECOVERY',
      payload: {
        calculationRunId,
        sourceFinancialEventId: 'financial-event-1',
        invoiceLineId: '507f1f77bcf86cd799439013',
        consultantId: '507f1f77bcf86cd799439014',
      },
      attemptCount: 1,
      maxAttempts: 5,
      priority: 0,
      leaseOwner: 'test-worker',
      leaseToken: 'test-token',
    } as never);

    expect(calculate).toHaveBeenCalledOnce();
    expect(completeCalculationRecovery).toHaveBeenCalledWith(
      facilityId,
      calculationRunId,
      calculationHash,
      expect.any(Date),
    );
    expect(failCalculationRecovery).not.toHaveBeenCalled();
  });
});