import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  isPermissionKey,
  permissionDefinitions,
  permissionKeys,
  requirePermissionKey,
} from './index.js';

const unifiedBillingPermissionKeys = [
  'billing.catalog.read',
  'billing.catalog.manage',
  'billing.catalog.view_cost',
  'billing.pricing.read',
  'billing.pricing.manage',
  'billing.packages.read',
  'billing.packages.manage',
  'billing.accounts.read',
  'billing.accounts.create',
  'billing.accounts.manage',
  'billing.accounts.suspend',
  'billing.accounts.finalize',
  'billing.charges.read',
  'billing.charges.create',
  'billing.charges.post',
  'billing.charges.cancel',
  'billing.charges.reverse',
  'billing.charges.adjust',
  'billing.charges.write_off',
  'billing.charges.transfer',
  'billing.charges.manual',
  'billing.invoice.read',
  'billing.invoice.create',
  'billing.invoice.finalize',
  'billing.invoice.cancel',
  'billing.invoice.correct',
  'billing.invoice.print',
  'billing.discount.request',
  'billing.discount.approve',
  'billing.price_override.request',
  'billing.price_override.approve',
  'billing.payment.read',
  'billing.payment.receive',
  'billing.payment.allocate',
  'billing.payment.reverse',
  'billing.refund.request',
  'billing.refund.approve',
  'billing.refund.process',
  'billing.credit_note.create',
  'billing.credit_note.post',
  'billing.debit_note.create',
  'billing.debit_note.post',
  'billing.financial_discharge',
  'billing.reports.read',
  'billing.reports.export',
  'billing.reports.cost_margin',
] as const;

describe('Unified billing permissions', () => {
  it('registers every granular billing permission exactly once', () => {
    for (const permission of unifiedBillingPermissionKeys) {
      expect(permissionKeys).toContain(permission);
      expect(isPermissionKey(permission)).toBe(true);
      expect(requirePermissionKey(permission)).toBe(permission);
      expect(
        permissionKeys.filter(
          (candidate) => candidate === permission,
        ),
      ).toHaveLength(1);
    }
  });

  it('classifies billing permissions as sensitive financial access', () => {
    const definitions =
      permissionDefinitions.filter(
        (definition) =>
          definition.key.startsWith('billing.'),
      );

    expect(
      definitions.map(
        (definition) => definition.key,
      ),
    ).toEqual([
      ...unifiedBillingPermissionKeys,
    ]);

    for (const definition of definitions) {
      expect(definition.module).toBe('billing');
      expect(
        ['SENSITIVE', 'HIGHLY_SENSITIVE'],
      ).toContain(definition.sensitivity);
    }
  });

  it('marks cost, finalization, correction, approval, and reversal access highly sensitive', () => {
    const highlySensitive = new Set(
      permissionDefinitions
        .filter(
          (definition) =>
            definition.module === 'billing' &&
            definition.sensitivity === 'HIGHLY_SENSITIVE',
        )
        .map(
          (definition) => definition.key,
        ),
    );

    expect(highlySensitive.size).toBeGreaterThan(0);

    for (
      const permission of [
        'billing.catalog.view_cost',
        'billing.accounts.finalize',
        'billing.charges.reverse',
        'billing.charges.adjust',
        'billing.charges.write_off',
        'billing.discount.approve',
        'billing.price_override.approve',
        'billing.payment.reverse',
        'billing.refund.approve',
        'billing.refund.process',
        'billing.credit_note.post',
        'billing.debit_note.post',
        'billing.reports.cost_margin',
      ] as const
    ) {
      expect(highlySensitive.has(permission)).toBe(true);
    }
  });

  it('rejects destructive or unregistered billing permissions', () => {
    expect(
      isPermissionKey(
        'billing.invoice.delete',
      ),
    ).toBe(false);

    expect(
      isPermissionKey(
        'billing.charges.edit_finalized',
      ),
    ).toBe(false);

    expect(() =>
      requirePermissionKey(
        'billing.payment.delete',
      ),
    ).toThrow(
      'Unknown permission key: billing.payment.delete',
    );
  });
});