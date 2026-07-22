import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  CLAIM_PERMISSION_KEYS,
} from '../claims.constants.js';

import type {
  ClaimsActorContext,
} from '../claims.contracts.js';

import {
  CLAIMS_ROUTE_MANIFEST,
} from '../claims.routes.js';

import {
  ClaimsAccessPolicyService,
} from '../services/claims-access-policy.service.js';

const actor = (
  permissions: readonly string[],
  options: Readonly<{
    userId?: string;
    facilityId?: string;
    breakGlassReason?: string;
  }> = {},
): ClaimsActorContext => ({
  userId: options.userId ?? '507f1f77bcf86cd799439011',
  staffId: null,
  facilityId: options.facilityId ?? '507f1f77bcf86cd799439012',
  correlationId: 'claims-policy-test',
  permissionKeys: new Set(permissions),
  roleKeys: options.breakGlassReason === undefined ? [] : ['BREAK_GLASS'],
  ...(options.breakGlassReason === undefined
    ? {}
    : { breakGlassReason: options.breakGlassReason }),
});

describe('Claims route and authorization boundaries', () => {
  it('registers a unique permission-protected route manifest', () => {
    const routeKeys = CLAIMS_ROUTE_MANIFEST.map(
      ([method, path]) => `${method}:${path}`,
    );
    expect(new Set(routeKeys).size).toBe(routeKeys.length);

    for (const [, , permission] of CLAIMS_ROUTE_MANIFEST) {
      expect(permissionKeys).toContain(permission);
    }
  });

  it('registers static resources before the dynamic claim identifier route', () => {
    const routes = CLAIMS_ROUTE_MANIFEST.map(([method, path]) => `${method}:${path}`);
    const dynamicReadIndex = routes.indexOf('GET:/:claimId');
    expect(dynamicReadIndex).toBeGreaterThan(-1);
    for (const route of [
      'GET:/batches',
      'POST:/remittances',
      'GET:/work-items',
      'POST:/appeals/:appealId/approve',
    ]) {
      expect(routes.indexOf(route)).toBeLessThan(dynamicReadIndex);
    }
  });

  it('marks submission approval as independently controlled', async () => {
    const policy = new ClaimsAccessPolicyService();
    const current = actor([CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE]);
    const decision = await policy.authorize({
      actor: current,
      permission: CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE,
      resourceFacilityId: current.facilityId,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresIndependentApproval).toBe(true);
  });

  it('denies cross-facility access even when the permission is present', async () => {
    const policy = new ClaimsAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor([CLAIM_PERMISSION_KEYS.READ]),
      permission: CLAIM_PERMISSION_KEYS.READ,
      resourceFacilityId: '507f1f77bcf86cd799439099',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('active facility');
  });

  it('enforces independent maker-checker separation', async () => {
    const policy = new ClaimsAccessPolicyService();
    const current = actor([CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE]);
    const decision = await policy.authorize({
      actor: current,
      permission: CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE,
      makerUserId: current.userId,
      sensitiveFinancialAction: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requiresIndependentApproval).toBe(true);
  });

  it('prevents break-glass access from approving claims financial actions', async () => {
    const policy = new ClaimsAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor(
        [CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE],
        { breakGlassReason: 'Emergency clinical access only' },
      ),
      permission: CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE,
      sensitiveFinancialAction: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('Break-glass');
  });

  it('allows a facility-scoped operational action with its exact permission', async () => {
    const policy = new ClaimsAccessPolicyService();
    const current = actor([CLAIM_PERMISSION_KEYS.VALIDATE]);
    const decision = await policy.authorize({
      actor: current,
      permission: CLAIM_PERMISSION_KEYS.VALIDATE,
      resourceFacilityId: current.facilityId,
    });
    expect(decision).toEqual({
      allowed: true,
      denialReason: null,
      requiresIndependentApproval: false,
    });
  });
});