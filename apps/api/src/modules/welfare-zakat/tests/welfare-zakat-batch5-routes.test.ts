import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import {
  WELFARE_ZAKAT_ROUTE_MANIFEST,
} from '../welfare-zakat.routes.js';
import {
  welfareZakatIdempotencyHeaderSchema,
  welfareZakatPositiveMoneySchema,
} from '../welfare-zakat.validation.js';

const requiredDomains = [
  '/funds',
  '/applications',
  '/approvals',
  '/reservations',
  '/allocations',
  '/reversals',
  '/work-items',
] as const;

describe('Welfare and Zakat HTTP boundaries', () => {
  it('publishes a unique permission-protected route manifest', () => {
    const routeKeys = WELFARE_ZAKAT_ROUTE_MANIFEST.map(
      ([method, path]) => `${method}:${path}`,
    );

    expect(new Set(routeKeys).size).toBe(routeKeys.length);

    for (const [, , permission] of WELFARE_ZAKAT_ROUTE_MANIFEST) {
      expect(permissionKeys).toContain(permission);
    }
  });

  it('registers every required operational domain', () => {
    for (const domain of requiredDomains) {
      expect(
        WELFARE_ZAKAT_ROUTE_MANIFEST.some(([, path]) =>
          path.startsWith(domain)),
      ).toBe(true);
    }
  });

  it('registers sensitive financial routes with exact permissions', () => {
    expect(WELFARE_ZAKAT_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/funds/:id/donations',
      WELFARE_ZAKAT_PERMISSION_KEYS.DONATION_RECORD,
    ]);
    expect(WELFARE_ZAKAT_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/allocations/:id/confirm',
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE,
    ]);
    expect(WELFARE_ZAKAT_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/reversals/:id/approve',
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
    ]);
    expect(WELFARE_ZAKAT_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/allocations/:id/refunds',
      WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE,
    ]);
    expect(WELFARE_ZAKAT_ROUTE_MANIFEST).toContainEqual([
      'POST',
      '/funds/:id/reconcile',
      WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE,
    ]);
  });

  it('requires idempotency headers for mutation contracts', () => {
    expect(welfareZakatIdempotencyHeaderSchema.safeParse({}).success).toBe(false);
    expect(welfareZakatIdempotencyHeaderSchema.safeParse({
      'idempotency-key': 'welfare-zakat-batch5-0001',
    }).success).toBe(true);
  });

  it('rejects zero-value partial reservation releases', () => {
    expect(welfareZakatPositiveMoneySchema.safeParse('0.00').success).toBe(false);
    expect(welfareZakatPositiveMoneySchema.safeParse('0.01').success).toBe(true);
  });

  it('keeps sensitive applicant and financial values out of route paths', () => {
    const serialized = JSON.stringify(WELFARE_ZAKAT_ROUTE_MANIFEST);
    for (const prohibited of [
      'cnic',
      'income',
      'household',
      'donorReference',
      'zakatDeclaration',
      'bankAccount',
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });
});