import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CLAIMS_ROUTE_MANIFEST,
} from '../claims.routes.js';

import {
  requestClaimAdjustmentSchema,
  claimAppealIdParamsSchema,
  claimsRecoveryRunSchema,
} from '../claims.validation.js';

describe('Claims module final integration', () => {
  it('registers reporting, export, recovery, refund, and repayment routes', () => {
    const routes = new Set(
      CLAIMS_ROUTE_MANIFEST.map(([method, path]) => `${method} ${path}`),
    );
    expect(routes).toContain('GET /reports/:reportName');
    expect(routes).toContain('GET /reports/:reportName.csv');
    expect(routes).toContain('POST /reports/:reportName/export-jobs');
    expect(routes).toContain('POST /recovery/run');
    expect(routes).toContain('POST /:claimId/adjustments');
  });

  it('keeps the CSV report route ahead of the generic report route', () => {
    const paths = CLAIMS_ROUTE_MANIFEST.map(([, path]) => path);
    expect(paths.indexOf('/reports/:reportName.csv')).toBeLessThan(
      paths.indexOf('/reports/:reportName'),
    );
  });

  it('validates appeal routes using the actual appeal-only parameter shape', () => {
    expect(claimAppealIdParamsSchema.parse({
      appealId: '507f1f77bcf86cd799439011',
    })).toEqual({ appealId: '507f1f77bcf86cd799439011' });
  });

  it('accepts auditable refund and repayment adjustment requests', () => {
    const base = {
      expectedVersion: 2,
      amount: '100.00',
      reason: 'Approved sponsor payment correction',
    };
    expect(requestClaimAdjustmentSchema.parse({
      ...base,
      adjustmentType: 'REFUND',
    }).adjustmentType).toBe('REFUND');
    expect(requestClaimAdjustmentSchema.parse({
      ...base,
      adjustmentType: 'REPAYMENT',
    }).adjustmentType).toBe('REPAYMENT');
  });

  it('bounds manual recovery work', () => {
    expect(claimsRecoveryRunSchema.parse({}).limit).toBe(100);
    expect(() => claimsRecoveryRunSchema.parse({ limit: 5001 })).toThrow();
  });
});