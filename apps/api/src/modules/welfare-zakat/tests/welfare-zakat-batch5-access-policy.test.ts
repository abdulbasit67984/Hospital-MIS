import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  WelfareZakatActorContext,
} from '../welfare-zakat.contracts.js';
import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
} from '../welfare-zakat.constants.js';
import {
  WelfareZakatAccessPolicyService,
} from '../services/welfare-zakat-access-policy.service.js';

function actor(
  permissions: readonly string[],
  options: Readonly<{
    userId?: string;
    facilityId?: string;
    breakGlassReason?: string;
  }> = {},
): WelfareZakatActorContext {
  return {
    userId: options.userId ?? '507f1f77bcf86cd799439011',
    staffId: null,
    facilityId: options.facilityId ?? '507f1f77bcf86cd799439012',
    correlationId: 'welfare-zakat-access-test',
    permissionKeys: new Set(permissions),
    roleKeys: options.breakGlassReason === undefined ? [] : ['BREAK_GLASS'],
    ...(options.breakGlassReason === undefined
      ? {}
      : { breakGlassReason: options.breakGlassReason }),
  };
}

describe('Welfare and Zakat access policy', () => {
  it('denies a missing exact permission', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor([]),
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.APPLICATION_REVIEW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('Missing permission');
  });

  it('denies cross-facility access despite a valid permission', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor([WELFARE_ZAKAT_PERMISSION_KEYS.READ]),
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.READ,
      resourceFacilityId: '507f1f77bcf86cd799439099',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('active facility');
  });

  it('requires assign permission for another user work item', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor([WELFARE_ZAKAT_PERMISSION_KEYS.READ]),
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.READ,
      assigneeUserId: '507f1f77bcf86cd799439099',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.denialReason).toContain('welfare_zakat.assign');
  });

  it('enforces maker-checker separation for financial approvals', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const currentActor = actor([
      WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
    ]);
    const decision = await policy.authorize({
      actor: currentActor,
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
      makerUserId: currentActor.userId,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.requiresIndependentApproval).toBe(true);
    expect(decision.denialReason).toContain('maker');
  });

  it('does not let break-glass access post a financial action', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const decision = await policy.authorize({
      actor: actor(
        [WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE],
        { breakGlassReason: 'Emergency clinical access only' },
      ),
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.requiresIndependentApproval).toBe(true);
    expect(decision.denialReason).toContain('Break-glass');
  });

  it('allows a facility-scoped operational action', async () => {
    const policy = new WelfareZakatAccessPolicyService();
    const currentActor = actor([
      WELFARE_ZAKAT_PERMISSION_KEYS.ELIGIBILITY_EVALUATE,
    ]);
    const decision = await policy.authorize({
      actor: currentActor,
      permission: WELFARE_ZAKAT_PERMISSION_KEYS.ELIGIBILITY_EVALUATE,
      resourceFacilityId: currentActor.facilityId,
    });

    expect(decision).toEqual({
      allowed: true,
      denialReason: null,
      requiresIndependentApproval: false,
    });
  });
});