import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  CLAIM_REPORT_NAMES,
  ClaimReportingService,
  claimsCsvCell,
} from '../services/claim-reporting.service.js';

import {
  claimsReportNameSchema,
  claimsReportQuerySchema,
} from '../claims.validation.js';

describe('claims reporting foundation', () => {
  it('registers every required Claims report exactly once', () => {
    expect(new Set(CLAIM_REPORT_NAMES).size).toBe(8);
    expect(CLAIM_REPORT_NAMES).toEqual([
      'claim-register',
      'claim-status',
      'claim-aging',
      'denials',
      'appeals',
      'payer-performance',
      'outstanding-sponsor-balances',
      'remittance-reconciliation',
    ]);
  });

  it('protects CSV exports from spreadsheet formula execution', () => {
    expect(claimsCsvCell('=HYPERLINK("https://invalid")')).toBe(
      '"\'=HYPERLINK(""https://invalid"")"',
    );
    expect(claimsCsvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
  });

  it('validates report names and bounded pagination', () => {
    expect(claimsReportNameSchema.parse('claim-aging')).toBe('claim-aging');
    expect(() => claimsReportNameSchema.parse('patient-identities')).toThrow();
    expect(claimsReportQuerySchema.parse({ page: '2', pageSize: '100' })).toMatchObject({
      page: 2,
      pageSize: 100,
    });
    expect(() => claimsReportQuerySchema.parse({ pageSize: '1001' })).toThrow();
  });

  it('replays an existing report-export job for the same idempotency key', async () => {
    const enqueue = vi.fn(async () => 'job-new');
    const findOne = vi.fn(async () => ({
      jobId: 'job-existing',
      status: 'COMPLETED',
    }));
    const service = new ClaimReportingService({
      database: {
        collection: vi.fn(() => ({ findOne })),
      } as never,
      accessPolicy: {
        authorize: vi.fn(async () => ({ allowed: true, denialReason: null })),
      },
      jobs: { enqueue } as never,
      clock: { now: () => new Date('2026-07-22T00:00:00.000Z') },
    });

    const result = await service.queueCsvExport(
      {
        userId: '507f1f77bcf86cd799439011',
        staffId: null,
        facilityId: '507f1f77bcf86cd799439012',
        correlationId: 'corr-report-1',
        permissionKeys: new Set(['claims.reports.export']),
        roleKeys: [],
      },
      'idempotency-report-1',
      'claim-register',
      { page: 1, pageSize: 50 },
    );

    expect(result).toEqual({
      jobId: 'job-existing',
      status: 'COMPLETED',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

});