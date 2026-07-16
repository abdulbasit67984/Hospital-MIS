import {
  ROLE_SCOPE,
} from '../identity.constants.js';
import {
  IdentityValidationError,
  InvalidRoleScopeError,
} from '../identity.errors.js';
import type {
  IdentityClockPort,
} from '../identity.ports.js';
import type {
  CreateUserInput,
  ObjectIdString,
  ReplaceUserRolesInput,
  RoleRecord,
} from '../identity.types.js';
import type {
  RoleRepository,
} from '../repositories/role.repository.js';

export interface RequestedUserRoleAssignment {
  roleId: ObjectIdString;
  facilityId?: ObjectIdString | null;
  expiresAt?: string | null;
}

export interface NormalizedUserRoleAssignment {
  roleId: ObjectIdString;
  facilityId: ObjectIdString | null;
  expiresAt: Date | null;
  role: RoleRecord;
}

export class UserRoleAssignmentPolicy {
  public constructor(
    private readonly roleRepository: RoleRepository,
    private readonly clock: IdentityClockPort,
  ) {}

  public async validateForCreateUser(
    assignments:
      CreateUserInput['roleAssignments'],
  ): Promise<NormalizedUserRoleAssignment[]> {
    return this.validate(assignments ?? []);
  }

  public async validateForReplacement(
    assignments:
      ReplaceUserRolesInput['assignments'],
  ): Promise<NormalizedUserRoleAssignment[]> {
    return this.validate(assignments);
  }

  public async validate(
    requestedAssignments:
      RequestedUserRoleAssignment[],
  ): Promise<NormalizedUserRoleAssignment[]> {
    if (requestedAssignments.length === 0) {
      return [];
    }

    const roleIds = [
      ...new Set(
        requestedAssignments.map(
          (assignment) => assignment.roleId,
        ),
      ),
    ];

    const roles =
      await this.roleRepository.findActiveByIds(
        roleIds,
      );

    const roleById = new Map(
      roles.map((role) => [
        role._id.toHexString(),
        role,
      ]),
    );

    const missingRoleIds = roleIds.filter(
      (roleId) => !roleById.has(roleId),
    );

    if (missingRoleIds.length > 0) {
      throw new IdentityValidationError(
        'One or more roles do not exist or are inactive',
        {
          missingRoleIds,
        },
      );
    }

    const normalizedAssignments =
      requestedAssignments.map(
        (assignment) =>
          this.normalizeAssignment(
            assignment,
            roleById.get(
              assignment.roleId,
            )!,
          ),
      );

    this.assertNoDuplicates(
      normalizedAssignments,
    );

    return normalizedAssignments;
  }

  private normalizeAssignment(
    assignment: RequestedUserRoleAssignment,
    role: RoleRecord,
  ): NormalizedUserRoleAssignment {
    const roleId = role._id.toHexString();
    const roleFacilityId =
      role.facilityId?.toHexString() ?? null;

    let facilityId: string | null;

    if (role.scope === ROLE_SCOPE.GLOBAL) {
      if (assignment.facilityId) {
        throw new InvalidRoleScopeError(
          roleId,
          role.scope,
          assignment.facilityId,
        );
      }

      facilityId = null;
    } else {
      if (!roleFacilityId) {
        throw new IdentityValidationError(
          'A facility-scoped role is missing its facility reference',
          {
            roleId,
          },
        );
      }

      facilityId =
        assignment.facilityId ??
        roleFacilityId;

      if (facilityId !== roleFacilityId) {
        throw new InvalidRoleScopeError(
          roleId,
          role.scope,
          facilityId,
        );
      }
    }

    const expiresAt = assignment.expiresAt
      ? new Date(assignment.expiresAt)
      : null;

    if (
      expiresAt &&
      Number.isNaN(expiresAt.getTime())
    ) {
      throw new IdentityValidationError(
        'A role assignment contains an invalid expiry date',
        {
          roleId,
          expiresAt: assignment.expiresAt,
        },
      );
    }

    if (
      expiresAt &&
      expiresAt.getTime() <=
        this.clock.now().getTime()
    ) {
      throw new IdentityValidationError(
        'Role assignment expiry must be in the future',
        {
          roleId,
          expiresAt:
            expiresAt.toISOString(),
        },
      );
    }

    return {
      roleId,
      facilityId,
      expiresAt,
      role,
    };
  }

  private assertNoDuplicates(
    assignments:
      NormalizedUserRoleAssignment[],
  ): void {
    const seenKeys = new Set<string>();
    const duplicateAssignments: Array<{
      roleId: string;
      facilityId: string | null;
    }> = [];

    for (const assignment of assignments) {
      const key = this.getAssignmentKey(
        assignment.roleId,
        assignment.facilityId,
      );

      if (seenKeys.has(key)) {
        duplicateAssignments.push({
          roleId: assignment.roleId,
          facilityId:
            assignment.facilityId,
        });

        continue;
      }

      seenKeys.add(key);
    }

    if (duplicateAssignments.length > 0) {
      throw new IdentityValidationError(
        'Duplicate role assignments are not allowed',
        {
          duplicateAssignments,
        },
      );
    }
  }

  public getAssignmentKey(
    roleId: string,
    facilityId: string | null,
  ): string {
    return `${roleId}:${facilityId ?? 'GLOBAL'}`;
  }
}