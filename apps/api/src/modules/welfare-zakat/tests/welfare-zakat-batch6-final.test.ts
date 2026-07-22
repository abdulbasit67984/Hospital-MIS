import { describe, expect, it, vi } from 'vitest';

import {
  FundTransferModel,
} from '@hospital-mis/database';

import { WelfareZakatBackgroundJobs } from '../../../infrastructure/welfare-zakat-background-jobs.js';
import { AssistanceRecoveryService } from '../services/assistance-recovery.service.js';
import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import { createWelfareZakatApplication } from '../welfare-zakat.application.js';
import { reconcileFundTransfer } from '../welfare-zakat.financial-math.js';
import { WELFARE_ZAKAT_ROUTE_MANIFEST } from '../welfare-zakat.routes.js';
import {
  decideFundTransferSchema,
  requestFundTransferSchema,
  reverseFundTransferSchema,
  welfareZakatReportParamsSchema,
} from '../welfare-zakat.validation.js';
import {
  WELFARE_ZAKAT_REPORT_NAMES,
} from '../services/assistance-reporting.service.js';

const sourceFundId = '64b000000000000000000001';
const destinationFundId = '64b000000000000000000002';
const approvalRequestId = '64b000000000000000000003';

function transferRequest() {
  return {
    expectedSourceFundVersion: 3,
    expectedDestinationFundVersion: 2,
    sourceFundId,
    destinationFundId,
    amount: '1250.75',
    approvalRequestId,
    reason: 'Move approved unrestricted assistance to the treatment fund',
  };
}

describe('Welfare and Zakat Batch 6 conclusion', () => {
  it('publishes every required report name without duplicates', () => {
    expect(WELFARE_ZAKAT_REPORT_NAMES).toHaveLength(19);
    expect(new Set(WELFARE_ZAKAT_REPORT_NAMES).size).toBe(19);

    for (const report of WELFARE_ZAKAT_REPORT_NAMES) {
      expect(welfareZakatReportParamsSchema.safeParse({ report }).success).toBe(true);
    }
  });

  it('registers transfer, reporting, export, and recovery routes once', () => {
    const routeKeys = WELFARE_ZAKAT_ROUTE_MANIFEST.map(
      ([method, path]) => `${method} ${path}`,
    );

    expect(new Set(routeKeys).size).toBe(routeKeys.length);
    expect(routeKeys).toContain('POST /transfers');
    expect(routeKeys).toContain('POST /transfers/:id/decisions');
    expect(routeKeys).toContain('POST /transfers/:id/reverse');
    expect(routeKeys).toContain('GET /reports/:report');
    expect(routeKeys).toContain('GET /reports/:report/export');
    expect(routeKeys).toContain('POST /reports/:report/export-jobs');
    expect(routeKeys).toContain('POST /maintenance/recovery');
  });

  it('protects final financial routes with dedicated permissions', () => {
    const permissionByRoute = new Map(
      WELFARE_ZAKAT_ROUTE_MANIFEST.map(
        ([method, path, permission]) => [`${method} ${path}`, permission],
      ),
    );

    expect(permissionByRoute.get('POST /transfers')).toBe(
      WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_REQUEST,
    );
    expect(permissionByRoute.get('POST /transfers/:id/decisions')).toBe(
      WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE,
    );
    expect(permissionByRoute.get('GET /reports/:report/export')).toBe(
      WELFARE_ZAKAT_PERMISSION_KEYS.REPORT_EXPORT,
    );
    expect(permissionByRoute.get('POST /maintenance/recovery')).toBe(
      WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE,
    );
  });

  it('rejects transfers between the same fund and accepts exact-decimal requests', () => {
    expect(requestFundTransferSchema.safeParse(transferRequest()).success).toBe(true);
    expect(
      requestFundTransferSchema.safeParse({
        ...transferRequest(),
        destinationFundId: sourceFundId,
      }).success,
    ).toBe(false);
  });

  it('requires optimistic versions for transfer approval and reversal', () => {
    expect(
      decideFundTransferSchema.safeParse({
        expectedTransferVersion: 0,
        expectedSourceFundVersion: 3,
        expectedDestinationFundVersion: 2,
        decision: 'APPROVE',
        reason: 'Independent finance checker approved the transfer',
      }).success,
    ).toBe(true);

    expect(
      reverseFundTransferSchema.safeParse({
        expectedTransferVersion: 1,
        expectedSourceFundVersion: 4,
        expectedDestinationFundVersion: 3,
        approvalRequestId,
        reason: 'Approved reversal after reconciliation identified an incorrect transfer',
      }).success,
    ).toBe(true);
  });

  it('reconciles transfer debit and credit using exact decimal arithmetic', () => {
    expect(() => reconcileFundTransfer({
      requestedAmount: '0.30',
      sourceAvailableAmount: '1.00',
      sourceDebitAmount: '0.30',
      destinationCreditAmount: '0.30',
    })).not.toThrow();

    expect(() => reconcileFundTransfer({
      requestedAmount: '0.30',
      sourceAvailableAmount: '1.00',
      sourceDebitAmount: '0.30',
      destinationCreditAmount: '0.29',
    })).toThrow();
  });

  it('retains transfer operation and number uniqueness indexes', () => {
    const indexNames = FundTransferModel.schema.indexes().map(([, options]) => options.name);
    expect(indexNames).toContain('uq_fund_transfers_operation');
    expect(indexNames).toContain('uq_fund_transfers_number');
    expect(indexNames).toContain('ix_fund_transfers_approval_queue');
  });

  it('registers report export and maintenance background handlers', () => {
    const handlers = new Map<string, (job: never) => Promise<void>>();
    const jobRunner = {
      register: vi.fn((jobType: string, handler: (job: never) => Promise<void>) => {
        handlers.set(jobType, handler);
      }),
      runOnce: vi.fn(async () => false),
    };

    new WelfareZakatBackgroundJobs({
      maintenance: { sweep: vi.fn(async () => ({
        applicationsExpired: 0,
        approvalsExpired: 0,
        reservationsExpired: 0,
        fundsReconciled: 0,
        allocationsReconciled: 0,
        failures: 0,
      })) } as never,
      reports: { generateQueuedExport: vi.fn(async () => undefined) } as never,
      jobRunner: jobRunner as never,
    });

    expect(handlers.has('WELFARE_ZAKAT_REPORT_EXPORT')).toBe(true);
    expect(handlers.has('WELFARE_ZAKAT_MAINTENANCE_SWEEP')).toBe(true);
  });


  it('replays a completed manual recovery result for the same idempotency key', async () => {
    const documents: Record<string, unknown>[] = [];
    const matches = (document: Record<string, unknown>, filter: Record<string, unknown>) =>
      Object.entries(filter).every(([key, value]) => String(document[key]) === String(value));
    const collection = {
      findOne: vi.fn(async (filter: Record<string, unknown>) =>
        documents.find((document) => matches(document, filter)) ?? null),
      insertOne: vi.fn(async (document: Record<string, unknown>) => {
        documents.push({ ...document });
        return { acknowledged: true };
      }),
      updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const document = documents.find((candidate) => matches(candidate, filter));
        if (document == null) return { modifiedCount: 0 };
        const set = update['$set'] as Record<string, unknown> | undefined;
        if (set != null) Object.assign(document, set);
        document['version'] = Number(document['version'] ?? 0) + 1;
        return { modifiedCount: 1 };
      }),
    };
    const service = new AssistanceRecoveryService({
      database: { collection: vi.fn(() => collection) } as never,
      operationalOutbox: { releaseTransactionEvents: vi.fn(async () => undefined) } as never,
      accessPolicy: { authorize: vi.fn(async () => ({
        allowed: true,
        denialReason: null,
        requiresIndependentApproval: true,
      })) },
      clock: { now: vi.fn(() => new Date('2026-07-22T10:00:00.000Z')) },
    });
    vi.spyOn(service, 'markStaleTransactions').mockResolvedValue(2);
    vi.spyOn(service, 'recoverAvailable').mockResolvedValue({ recovered: 1, failed: 0 });
    const actor = {
      userId: '64b000000000000000000010',
      staffId: null,
      facilityId: '64b000000000000000000011',
      correlationId: 'correlation-1',
      permissionKeys: new Set([WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE]),
      roleKeys: ['FINANCE_MANAGER'],
    };

    const first = await service.runManual(actor, 'recovery-key-0001', {
      limit: 20,
      staleAfterMinutes: 30,
    });
    const replay = await service.runManual(actor, 'recovery-key-0001', {
      limit: 20,
      staleAfterMinutes: 30,
    });

    expect(first).toEqual({ markedStale: 2, recovered: 1, failed: 0 });
    expect(replay).toEqual(first);
    expect(service.markStaleTransactions).toHaveBeenCalledTimes(1);
    expect(service.recoverAvailable).toHaveBeenCalledTimes(1);
  });

  it('freezes the concluded application service composition', () => {
    const services = {
      funds: {},
      donations: {},
      applications: {},
      eligibility: {},
      approvals: {},
      reservations: {},
      allocations: {},
      reversalsAndReturns: {},
      workQueue: {},
      reconciliation: {},
      transfers: {},
      reports: {},
      maintenance: {},
      recovery: {},
    } as never;

    const application = createWelfareZakatApplication(services);
    expect(Object.isFrozen(application.services)).toBe(true);
    expect(Object.keys(application.services)).toHaveLength(14);
  });
});