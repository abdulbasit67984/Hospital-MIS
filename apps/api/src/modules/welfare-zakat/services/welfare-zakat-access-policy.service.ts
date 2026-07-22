import type { PermissionKey } from '@hospital-mis/permissions';

import {
  WELFARE_ZAKAT_PERMISSION_KEYS,
  type WelfareZakatPermissionKey,
} from '../welfare-zakat.constants.js';
import type { WelfareZakatAccessPolicyPort } from '../welfare-zakat.ports.js';

const independentApprovalPermissions = new Set<string>([
  WELFARE_ZAKAT_PERMISSION_KEYS.FUND_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.FUND_STATUS_MANAGE,
  WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSACTION_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.FUND_TRANSFER_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.DONATION_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_DECIDE,
  WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_CANCEL,
  WELFARE_ZAKAT_PERMISSION_KEYS.APPROVAL_REVERSE,
  WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.ALLOCATION_REVERSE_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.REFUND_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.REPAYMENT_APPROVE,
  WELFARE_ZAKAT_PERMISSION_KEYS.RECOVERY_MANAGE,
  WELFARE_ZAKAT_PERMISSION_KEYS.RECONCILE,
]);

function isWelfareZakatPermission(
  permission: string,
): permission is WelfareZakatPermissionKey {
  return Object.values(WELFARE_ZAKAT_PERMISSION_KEYS).includes(
    permission as WelfareZakatPermissionKey,
  );
}

export class WelfareZakatAccessPolicyService
implements WelfareZakatAccessPolicyPort {
  public async authorize(
    input: Parameters<WelfareZakatAccessPolicyPort['authorize']>[0],
  ): Promise<Readonly<{
    allowed: boolean;
    denialReason: string | null;
    requiresIndependentApproval: boolean;
  }>> {
    const permission = input.permission as PermissionKey | string;
    const requiresIndependentApproval =
      (isWelfareZakatPermission(permission) &&
        independentApprovalPermissions.has(permission)) ||
      input.sensitiveFinancialAction === true;

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
        denialReason:
          'Welfare and Zakat access is restricted to the active facility',
        requiresIndependentApproval,
      };
    }

    if (
      input.assigneeUserId !== undefined &&
      input.assigneeUserId !== null &&
      input.assigneeUserId !== input.actor.userId &&
      !input.actor.permissionKeys.has(WELFARE_ZAKAT_PERMISSION_KEYS.ASSIGN)
    ) {
      return {
        allowed: false,
        denialReason:
          'Access to another user\'s assistance work item requires welfare_zakat.assign',
        requiresIndependentApproval,
      };
    }

    if (
      input.makerUserId !== undefined &&
      input.makerUserId !== null &&
      input.makerUserId === input.actor.userId &&
      requiresIndependentApproval
    ) {
      return {
        allowed: false,
        denialReason:
          'The maker cannot approve or post their own Welfare or Zakat operation',
        requiresIndependentApproval: true,
      };
    }

    if (
      requiresIndependentApproval &&
      (input.actor.breakGlassReason !== undefined ||
        input.actor.roleKeys.includes('BREAK_GLASS'))
    ) {
      return {
        allowed: false,
        denialReason:
          'Break-glass access cannot approve or post Welfare and Zakat financial operations',
        requiresIndependentApproval: true,
      };
    }

    return {
      allowed: true,
      denialReason: null,
      requiresIndependentApproval,
    };
  }
}