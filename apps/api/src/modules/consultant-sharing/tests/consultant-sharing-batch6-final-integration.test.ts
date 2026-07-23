import { describe, expect, it } from 'vitest';

import { permissionKeys } from '@hospital-mis/permissions';

import { CONSULTANT_SHARING_PERMISSION_KEYS as P } from '../consultant-sharing.constants.js';
import {
  CONSULTANT_SHARING_BACKGROUND_JOB_TYPES,
} from '../jobs/consultant-sharing-background-jobs.js';
import { CONSULTANT_SHARING_ROUTE_MANIFEST } from '../consultant-sharing.routes.js';
import {
  consultantSharingRecoveryRunSchema,
  consultantSharingReportParamsSchema,
  consultantSharingReportQuerySchema,
} from '../consultant-sharing.validation.js';

describe('Consultant Sharing final module integration', () => {
  it('registers unique report, recovery, reconciliation, and export routes', () => {
    const keys = CONSULTANT_SHARING_ROUTE_MANIFEST.map(
      ([method, path]) => `${method}:${path}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(CONSULTANT_SHARING_ROUTE_MANIFEST).toEqual(expect.arrayContaining([
      ['GET', '/reports/:report', P.REPORT_READ],
      ['GET', '/reports/:report/export', P.REPORT_EXPORT],
      ['POST', '/reports/:report/export-jobs', P.REPORT_EXPORT],
      ['POST', '/maintenance/recovery', P.RECOVERY_MANAGE],
      ['POST', '/reconciliation', P.RECONCILE],
    ]));
  });

  it('registers every long-running Consultant Sharing job type once', () => {
    expect(CONSULTANT_SHARING_BACKGROUND_JOB_TYPES).toHaveLength(10);
    expect(new Set(CONSULTANT_SHARING_BACKGROUND_JOB_TYPES).size).toBe(10);
    expect(CONSULTANT_SHARING_BACKGROUND_JOB_TYPES).toEqual(expect.arrayContaining([
      'CONSULTANT_SHARING_REPORT_EXPORT',
      'CONSULTANT_SHARING_REVENUE_RECOGNITION',
      'CONSULTANT_SHARING_CALCULATION_RECOVERY',
      'CONSULTANT_SHARING_AGREEMENT_EXPIRY',
      'CONSULTANT_SHARING_SETTLEMENT_FINALIZATION',
      'CONSULTANT_SHARING_RECONCILIATION',
      'CONSULTANT_SHARING_RECOVERY_SWEEP',
    ]));
  });

  it('keeps report and recovery permissions centralized', () => {
    expect(permissionKeys).toEqual(expect.arrayContaining([
      P.REPORT_READ,
      P.REPORT_EXPORT,
      P.RECONCILE,
      P.RECOVERY_MANAGE,
    ]));
  });

  it('validates supported reports and bounded recovery requests', () => {
    expect(consultantSharingReportParamsSchema.safeParse({
      report: 'revenue-by-consultant',
    }).success).toBe(true);
    expect(consultantSharingReportParamsSchema.safeParse({
      report: 'arbitrary-financial-dump',
    }).success).toBe(false);
    expect(consultantSharingReportQuerySchema.safeParse({
      page: '1',
      pageSize: '50',
      expiringWithinDays: '30',
    }).success).toBe(true);
    expect(consultantSharingRecoveryRunSchema.safeParse({
      limit: 200,
      includeAgreementExpiry: true,
      includeCalculationRecovery: true,
      includeSettlementReconciliation: true,
      includeLedgerReconciliation: true,
    }).success).toBe(true);
    expect(consultantSharingRecoveryRunSchema.safeParse({ limit: 1001 }).success)
      .toBe(false);
  });
});