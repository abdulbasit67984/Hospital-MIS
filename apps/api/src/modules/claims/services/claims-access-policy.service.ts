import type { PermissionKey } from '@hospital-mis/permissions';

import {
  CLAIM_PERMISSION_KEYS,
  type ClaimPermissionKey,
} from '../claims.constants.js';

import type {
  ClaimsAccessPolicyPort,
} from '../claims.ports.js';

const independentlyApprovedPermissions = new Set<string>([
  CLAIM_PERMISSION_KEYS.SUBMISSION_APPROVE,
  CLAIM_PERMISSION_KEYS.ADJUDICATION_RECORD,
  CLAIM_PERMISSION_KEYS.REMITTANCE_IMPORT,
  CLAIM_PERMISSION_KEYS.PAYMENT_MATCH,
  CLAIM_PERMISSION_KEYS.ADJUSTMENT_APPROVE,
  CLAIM_PERMISSION_KEYS.WRITE_OFF_APPROVE,
  CLAIM_PERMISSION_KEYS.APPEAL_APPROVE,
  CLAIM_PERMISSION_KEYS.CANCEL_APPROVE,
  CLAIM_PERMISSION_KEYS.REVERSE_APPROVE,
  CLAIM_PERMISSION_KEYS.VOID_APPROVE,
  CLAIM_PERMISSION_KEYS.RECOVER,
]);

function isClaimsPermission(value: string): value is ClaimPermissionKey {
  return Object.values(CLAIM_PERMISSION_KEYS).includes(
    value as ClaimPermissionKey,
  );
}

export class ClaimsAccessPolicyService implements ClaimsAccessPolicyPort {
  public async authorize(
    input: Parameters<ClaimsAccessPolicyPort['authorize']>[0],
  ): Promise<Readonly<{
    allowed: boolean;
    denialReason: string | null;
    requiresIndependentApproval: boolean;
  }>> {
    const permission = input.permission as PermissionKey | string;
    const requiresIndependentApproval =
      isClaimsPermission(permission) &&
      independentlyApprovedPermissions.has(permission);

    if (!input.actor.permissionKeys.has(permission)) {
      return {
        allowed: false,
        denialReason: `Missing permission ${permission}`,
        requiresIndependentApproval,
      };
    }

    if (
      input.resourceFacilityId !== undefined &&
      input.resourceFacilityId !== input.actor.facilityId
    ) {
      return {
        allowed: false,
        denialReason: 'Claims access is restricted to the active facility',
        requiresIndependentApproval,
      };
    }

    if (
      input.assigneeUserId !== undefined &&
      input.assigneeUserId !== null &&
      input.assigneeUserId !== input.actor.userId &&
      !input.actor.permissionKeys.has(CLAIM_PERMISSION_KEYS.ASSIGN)
    ) {
      return {
        allowed: false,
        denialReason: 'Access to another user\'s claim work item requires claims.assign',
        requiresIndependentApproval,
      };
    }

    if (
      input.makerUserId !== undefined &&
      input.makerUserId !== null &&
      input.makerUserId === input.actor.userId &&
      (requiresIndependentApproval || input.sensitiveFinancialAction === true)
    ) {
      return {
        allowed: false,
        denialReason: 'The maker cannot approve their own claims operation',
        requiresIndependentApproval: true,
      };
    }

    if (
      (independentlyApprovedPermissions.has(permission) ||
        input.sensitiveFinancialAction === true) &&
      (input.actor.breakGlassReason !== undefined ||
        input.actor.roleKeys.includes('BREAK_GLASS'))
    ) {
      return {
        allowed: false,
        denialReason:
          'Break-glass access cannot approve or post sensitive claims financial operations',
        requiresIndependentApproval,
      };
    }

    return {
      allowed: true,
      denialReason: null,
      requiresIndependentApproval,
    };
  }
}