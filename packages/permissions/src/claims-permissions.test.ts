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

const claimsPermissionKeys = [
  'claims.read',
  'claims.read_sensitive',
  'claims.prepare',
  'claims.update',
  'claims.validate',
  'claims.mark_ready',
  'claims.batches.manage',
  'claims.submission.request',
  'claims.submission.approve',
  'claims.submit',
  'claims.status_manage',
  'claims.acknowledgements.record',
  'claims.adjudications.record',
  'claims.remittances.import',
  'claims.payment_record',
  'claims.payments.match',
  'claims.adjustments.request',
  'claims.adjustments.approve',
  'claims.write_off.request',
  'claims.write_off.approve',
  'claims.denials.manage',
  'claims.appeals.prepare',
  'claims.appeals.approve',
  'claims.appeals.submit',
  'claims.assign',
  'claims.escalate',
  'claims.cancel.request',
  'claims.cancel.approve',
  'claims.reverse.request',
  'claims.reverse.approve',
  'claims.void.request',
  'claims.void.approve',
  'claims.recovery.manage',
  'claims.reports.read',
  'claims.reports.export',
] as const;

const highlySensitive = new Set([
  'claims.read_sensitive',
  'claims.submission.approve',
  'claims.adjudications.record',
  'claims.remittances.import',
  'claims.payments.match',
  'claims.adjustments.approve',
  'claims.write_off.approve',
  'claims.appeals.approve',
  'claims.cancel.approve',
  'claims.reverse.approve',
  'claims.void.approve',
  'claims.recovery.manage',
]);

describe('Claims permissions', () => {
  it('registers every granular permission exactly once', () => {
    for (const permission of claimsPermissionKeys) {
      expect(permissionKeys).toContain(permission);
      expect(isPermissionKey(permission)).toBe(true);
      expect(requirePermissionKey(permission)).toBe(permission);
      expect(permissionKeys.filter((key) => key === permission)).toHaveLength(1);
    }
  });

  it('classifies claims access as sensitive and approval operations as highly sensitive', () => {
    const definitions = permissionDefinitions.filter(
      (definition) => definition.key.startsWith('claims.'),
    );
    expect(definitions).toHaveLength(claimsPermissionKeys.length);
    for (const definition of definitions) {
      expect(definition.module).toBe('claims');
      expect(definition.sensitivity).toBe(
        highlySensitive.has(definition.key)
          ? 'HIGHLY_SENSITIVE'
          : 'SENSITIVE',
      );
    }
  });

  it('does not register destructive or self-approval permissions', () => {
    expect(isPermissionKey('claims.delete')).toBe(false);
    expect(isPermissionKey('claims.self_approve')).toBe(false);
    expect(isPermissionKey('claims.history.edit')).toBe(false);
  });
});