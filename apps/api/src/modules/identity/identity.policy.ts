import type {
  PolicyDecision,
  RecordAccessPolicy,
} from '../authorization/authorization.middleware.js';

import type {
  RoleDto,
  StaffDto,
  UserDto,
  UserRoleDto,
} from './identity.types.js';

export interface UserWithRoleAssignmentsRecord {
  user:
    UserDto;

  roleAssignments:
    UserRoleDto[];
}

function allow():
  PolicyDecision {
  return {
    allowed:
      true,
  };
}

function deny(
  reason:
    string,
): PolicyDecision {
  return {
    allowed:
      false,

    reason,
  };
}

function activeAssignment(
  assignment:
    UserRoleDto,
): boolean {
  if (
    !assignment.isActive
  ) {
    return false;
  }

  if (
    assignment.expiresAt ===
    null
  ) {
    return true;
  }

  return (
    new Date(
      assignment.expiresAt,
    ).getTime() >
    Date.now()
  );
}

export class IdentityRoleRecordPolicy
implements RecordAccessPolicy<RoleDto> {
  public readonly name =
    'identity-role-facility-policy';

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<RoleDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.scope ===
      'GLOBAL'
    ) {
      return allow();
    }

    if (
      context.record.facilityId ===
      context.principal.facilityId
    ) {
      return allow();
    }

    return deny(
      'The role belongs to another facility',
    );
  }
}

export class IdentityStaffRecordPolicy
implements RecordAccessPolicy<StaffDto> {
  public readonly name =
    'identity-staff-facility-policy';

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<StaffDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.facilityId ===
      context.principal.facilityId
    ) {
      return allow();
    }

    return deny(
      'The staff record belongs to another facility',
    );
  }
}

export class IdentityUserRecordPolicy
implements RecordAccessPolicy<
  UserWithRoleAssignmentsRecord
> {
  public readonly name =
    'identity-user-facility-policy';

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<
          UserWithRoleAssignmentsRecord
        >[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.user.id ===
      context.principal.userId
    ) {
      return allow();
    }

    const hasAccessibleAssignment =
      context.record.roleAssignments.some(
        (
          assignment,
        ) =>
          activeAssignment(
            assignment,
          ) &&
          (
            assignment.facilityId ===
              null ||
            assignment.facilityId ===
              context.principal.facilityId
          ),
      );

    if (
      hasAccessibleAssignment
    ) {
      return allow();
    }

    return deny(
      'The user has no active global or current-facility assignment',
    );
  }
}

export class IdentityUserRoleRecordPolicy
implements RecordAccessPolicy<UserRoleDto> {
  public readonly name =
    'identity-user-role-facility-policy';

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<UserRoleDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.userId ===
      context.principal.userId
    ) {
      return allow();
    }

    if (
      context.record.facilityId ===
        null ||
      context.record.facilityId ===
        context.principal.facilityId
    ) {
      return allow();
    }

    return deny(
      'The role assignment belongs to another facility',
    );
  }
}

export interface IdentityRecordPolicies {
  role:
    IdentityRoleRecordPolicy;

  staff:
    IdentityStaffRecordPolicy;

  user:
    IdentityUserRecordPolicy;

  userRole:
    IdentityUserRoleRecordPolicy;
}

export function createIdentityRecordPolicies():
  IdentityRecordPolicies {
  return {
    role:
      new IdentityRoleRecordPolicy(),

    staff:
      new IdentityStaffRecordPolicy(),

    user:
      new IdentityUserRecordPolicy(),

    userRole:
      new IdentityUserRoleRecordPolicy(),
  };
}