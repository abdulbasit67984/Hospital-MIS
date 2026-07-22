import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST,
} from '../panels-packages-coverage.routes.js';

import {
  CoverageFinancialControlService,
} from '../services/coverage-financial-control.service.js';

import {
  PanelsPackagesCoverageReportService,
} from '../services/panels-packages-coverage-report.service.js';

describe('panels packages coverage final integration', () => {
  it('registers reporting, override, refund, and recovery routes', () => {
    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/coverage-determinations/:determinationId/override',
      'coverage.override',
    ]);

    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/refund-effects',
      'packages.reverse',
    ]);

    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'GET',
      '/reports/:report.csv',
      'coverage.reports.export',
    ]);

    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/recovery/run',
      'coverage.override',
    ]);
  });

  it('registers maker-checker lifecycle routes for all masters', () => {
    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/panels/:panelId/status',
      'panels.activate',
    ]);
    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/treatment-packages/:packageId/status',
      'packages.activate',
    ]);
    expect(PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/coverage-plans/:planId/status',
      'coverage.activate',
    ]);
  });

  it('queues long-running CSV reports as background jobs', async () => {
    const enqueue = vi.fn(async () => 'job-1');
    const reports = new PanelsPackagesCoverageReportService({
      database: {} as never,
      accessPolicy: {
        authorize: vi.fn(async () => ({
          allowed: true,
          denialReason: null,
        })),
      },
      jobs: {
        enqueue,
      } as never,
      clock: {
        now: () => new Date('2026-07-22T00:00:00Z'),
      },
    });

    const result = await reports.queueCsvExport(
      {
        userId: '507f1f77bcf86cd799439011',
        staffId: null,
        facilityId: '507f1f77bcf86cd799439012',
        correlationId: 'corr-1',
        permissionKeys: ['coverage.reports.export'],
        roleKeys: [],
      },
      'coverage-utilization',
      {
        page: 1,
        pageSize: 500,
      },
    );

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'PENDING',
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'PPC_REPORT_EXPORT',
      }),
    );
  });

  it('requires override permission before a financial mutation', async () => {
    const service = new CoverageFinancialControlService({
      accessPolicy: {
        authorize: vi.fn(async () => ({
          allowed: false,
          denialReason: 'Missing permission coverage.override',
        })),
      },
      transactionManager: {
        execute: vi.fn(),
      } as never,
      audit: {
        record: vi.fn(),
      },
      outbox: {
        enqueue: vi.fn(),
      },
      billing: {} as never,
    });

    await expect(
      service.reverseDetermination(
        {
          userId: '507f1f77bcf86cd799439011',
          staffId: null,
          facilityId: '507f1f77bcf86cd799439012',
          correlationId: 'corr-1',
          permissionKeys: [],
          roleKeys: [],
        },
        '507f1f77bcf86cd799439013',
        'idempotency-1',
        {
          expectedVersion: 0,
          expectedInvoiceVersion: 0,
          reason: 'Authorized financial correction',
        },
      ),
    ).rejects.toThrow('Missing permission coverage.override');
  });

  it('keeps sensitive membership and policy data out of route paths', () => {
    const serialized = JSON.stringify(
      PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST,
    );

    expect(serialized).not.toContain('membershipReference');
    expect(serialized).not.toContain('policyReference');
    expect(serialized).not.toContain('authorizationReference');
  });
});