import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionDefinitions,
} from '@hospital-mis/permissions';

import {
  createWelfareZakatApplication,
  type WelfareZakatApplication,
} from '../welfare-zakat.application.js';
import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';

function serviceGraph(): WelfareZakatApplication['services'] {
  const service = Object.freeze({ marker: 'service' });
  return {
    funds: service,
    donations: service,
    applications: service,
    eligibility: service,
    approvals: service,
    reservations: service,
    allocations: service,
    reversalsAndReturns: service,
    workQueue: service,
    reconciliation: service,
  } as unknown as WelfareZakatApplication['services'];
}

describe('Welfare and Zakat composition and permissions', () => {
  it('creates an immutable application service boundary', () => {
    const services = serviceGraph();
    const application = createWelfareZakatApplication(services);

    expect(Object.isFrozen(application.services)).toBe(true);
    expect(Object.keys(application.services).sort()).toEqual([
      'allocations',
      'applications',
      'approvals',
      'donations',
      'eligibility',
      'funds',
      'reconciliation',
      'reservations',
      'reversalsAndReturns',
      'workQueue',
    ]);
    expect(application.services.funds).toBe(services.funds);
  });

  it('registers every Welfare and Zakat permission centrally', () => {
    const definitions = new Map(
      permissionDefinitions.map((definition) => [definition.key, definition]),
    );

    for (const permission of Object.values(WELFARE_ZAKAT_PERMISSION_KEYS)) {
      expect(definitions.has(permission)).toBe(true);
      expect(definitions.get(permission)?.module).toBe('welfare_zakat');
    }
  });

  it('marks independent financial permissions highly sensitive', () => {
    const definitions = new Map(
      permissionDefinitions.map((definition) => [definition.key, definition]),
    );

    for (const permission of [
      WELFARE_ZAKAT_PERMISSION_KEYS.FUND_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSACTION_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_DECIDE,
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.REPAYMENT_APPROVE,
      WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE,
    ]) {
      expect(definitions.get(permission)?.sensitivity).toBe('HIGHLY_SENSITIVE');
    }
  });

  it('keeps ordinary read permissions below financial approval sensitivity', () => {
    const definitions = new Map(
      permissionDefinitions.map((definition) => [definition.key, definition]),
    );

    expect(
      definitions.get(WELFARE_ZAKAT_PERMISSION_KEYS.READ)?.sensitivity,
    ).toBe('SENSITIVE');
    expect(
      definitions.get(WELFARE_ZAKAT_PERMISSION_KEYS.FUND_READ)?.sensitivity,
    ).toBe('SENSITIVE');
  });
});
