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

const laboratoryPermissionKeys = [
  'laboratory.catalog.read',
  'laboratory.catalog.manage',
  'laboratory.orders.read',
  'laboratory.orders.create',
  'laboratory.orders.manage',
  'laboratory.orders.cancel',
  'laboratory.specimens.read',
  'laboratory.specimens.collect',
  'laboratory.specimens.receive',
  'laboratory.specimens.reject',
  'laboratory.results.read',
  'laboratory.results.enter',
  'laboratory.results.validate',
  'laboratory.results.verify',
  'laboratory.results.amend',
  'laboratory.results.publish',
  'laboratory.results.print',
  'laboratory.critical_results.notify',
  'laboratory.critical_results.acknowledge',
] as const;

describe('Laboratory permissions', () => {
  it('registers all granular Laboratory permission keys exactly once', () => {
    for (const permission of laboratoryPermissionKeys) {
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

  it('classifies Laboratory permissions as sensitive clinical access', () => {
    const laboratoryDefinitions =
      permissionDefinitions.filter(
        (definition) =>
          definition.key.startsWith('laboratory.'),
      );

    expect(
      laboratoryDefinitions.map(
        (definition) => definition.key,
      ),
    ).toEqual(
      expect.arrayContaining([
        ...laboratoryPermissionKeys,
      ]),
    );

    for (const definition of laboratoryDefinitions) {
      expect(definition.module).toBe('laboratory');
      expect(definition.sensitivity).toBe('SENSITIVE');
    }
  });

  it('rejects unregistered Laboratory permission names', () => {
    expect(
      isPermissionKey(
        'laboratory.results.delete',
      ),
    ).toBe(false);

    expect(() =>
      requirePermissionKey(
        'laboratory.results.delete',
      ),
    ).toThrow(
      'Unknown permission key: laboratory.results.delete',
    );
  });
});