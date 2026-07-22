import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PanelsPackagesCoverageAccessPolicyService,
} from '../services/panels-packages-coverage-access-policy.service.js';

describe('coverage verification and access controls', () => {
  it('blocks break-glass coverage overrides', async () => {
    const policy = new PanelsPackagesCoverageAccessPolicyService();
    const decision = await policy.authorize({
      actor: {
        userId: '507f1f77bcf86cd799439011',
        staffId: null,
        facilityId: '507f1f77bcf86cd799439012',
        correlationId: 'corr-1',
        permissionKeys: ['coverage.override'],
        roleKeys: ['BREAK_GLASS'],
      },
      permission: 'coverage.override',
    });

    expect(decision.allowed).toBe(false);
  });

  it('enforces maker-checker separation', () => {
    const policy = new PanelsPackagesCoverageAccessPolicyService();

    expect(() =>
      policy.assertIndependentChecker('user-1', 'user-1'),
    ).toThrow(
      'The initiating actor cannot approve or override this operation',
    );
  });

  it('allows an explicitly permitted non-sensitive action', async () => {
    const policy = new PanelsPackagesCoverageAccessPolicyService();
    const decision = await policy.authorize({
      actor: {
        userId: '507f1f77bcf86cd799439011',
        staffId: null,
        facilityId: '507f1f77bcf86cd799439012',
        correlationId: 'corr-1',
        permissionKeys: ['coverage.verify'],
        roleKeys: ['CLAIMS_OFFICER'],
      },
      permission: 'coverage.verify',
    });

    expect(decision).toEqual({
      allowed: true,
      denialReason: null,
    });
  });
});