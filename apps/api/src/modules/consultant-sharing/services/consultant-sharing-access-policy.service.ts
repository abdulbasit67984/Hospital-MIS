import {
  CONSULTANT_SHARING_PERMISSION_KEYS,
  CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS,
} from '../consultant-sharing.constants.js';
import type {
  ConsultantSharingAccessDecision,
  ConsultantSharingAccessRequest,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantSharingBreakGlassProhibitedError,
  ConsultantSharingFacilityMismatchError,
  ConsultantSharingMakerCheckerError,
} from '../consultant-sharing.errors.js';
import type { ConsultantSharingAccessPolicyPort } from '../consultant-sharing.ports.js';

const financialMinimumFields = [
  'id',
  'facilityId',
  'consultantId',
  'status',
  'version',
] as const;

export class ConsultantSharingAccessPolicyService
  implements ConsultantSharingAccessPolicyPort {
  public async authorize(
    request: ConsultantSharingAccessRequest,
  ): Promise<ConsultantSharingAccessDecision> {
    if (
      request.resourceFacilityId != null &&
      request.resourceFacilityId !== request.actor.facilityId
    ) {
      throw new ConsultantSharingFacilityMismatchError();
    }

    const requiredPermission = CONSULTANT_SHARING_PERMISSION_KEYS[request.action];
    const hasPermission = request.actor.permissionKeys.has(requiredPermission);
    const sensitive =
      request.sensitiveFinancialAction === true ||
      CONSULTANT_SHARING_SENSITIVE_APPROVAL_ACTIONS.has(request.action);

    if (sensitive && request.actor.breakGlassReason != null) {
      throw new ConsultantSharingBreakGlassProhibitedError();
    }

    if (
      sensitive &&
      request.makerUserId != null &&
      request.makerUserId === request.actor.userId
    ) {
      throw new ConsultantSharingMakerCheckerError();
    }

    const selfAccess =
      request.consultantStaffId != null &&
      request.actor.staffId != null &&
      request.consultantStaffId === request.actor.staffId &&
      ['READ', 'REPORT_READ'].includes(request.action);

    const auditorRead =
      request.actor.roleKeys.includes('AUDITOR') &&
      ['READ', 'REPORT_READ'].includes(request.action);

    const departmentRead =
      request.actor.roleKeys.includes('DEPARTMENT_MANAGER') &&
      ['READ', 'REPORT_READ'].includes(request.action);

    const allowed = hasPermission || selfAccess || auditorRead || departmentRead;
    const accessMode = hasPermission
      ? 'FULL'
      : selfAccess
        ? 'SELF'
        : auditorRead
          ? 'READ_ONLY'
          : departmentRead
            ? 'DEPARTMENT'
            : 'DENIED';

    return {
      allowed,
      requiredPermission,
      accessMode,
      requiresIndependentApproval: sensitive,
      auditSensitiveRead: request.action === 'READ_SENSITIVE',
      minimumNecessaryFields: financialMinimumFields,
      ...(allowed ? {} : { denialReason: `Missing permission ${requiredPermission}` }),
    };
  }
}