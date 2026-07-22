import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionDefinitions,
  permissionKeys,
} from './index.js';

import {
  panelsPackagesCoverageHighlySensitivePermissions,
  panelsPackagesCoveragePermissionKeys,
} from './panels-packages-coverage-permissions.js';

describe('panels packages coverage permissions', () => {
  it('registers every module permission in the central catalog', () => {
    for (const permission of panelsPackagesCoveragePermissionKeys) {
      expect(permissionKeys).toContain(permission);
    }
  });

  it('marks approvals, cancellations, reversals, and overrides highly sensitive', () => {
    const sensitivity = new Map(
      permissionDefinitions.map((definition) => [
        definition.key,
        definition.sensitivity,
      ]),
    );

    for (
      const permission of
      panelsPackagesCoverageHighlySensitivePermissions
    ) {
      expect(sensitivity.get(permission)).toBe('HIGHLY_SENSITIVE');
    }
  });

  it('does not define a package self-approval permission', () => {
    expect(permissionKeys).not.toContain('packages.self_approve');
    expect(permissionKeys).not.toContain('coverage.self_override');
  });
});