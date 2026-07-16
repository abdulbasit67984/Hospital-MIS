import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
  IDENTITY_TRANSACTION_TYPES,
} from '../identity.constants.js';
import {
  IdentityNotFoundError,
  IdentityVersionConflictError,
  ProtectedIdentityResourceError,
} from '../identity.errors.js';
import {
  toPermissionDto,
  toRoleDto,
} from '../identity.mapper.js';
import { IdentityCompensationRepository } from '../repositories/identity-compensation.repository.js';
import { PermissionRepository } from '../repositories/permission.repository.js';
import {
  RolePermissionRepository,
  type RevokedRolePermissionSnapshot,
} from '../repositories/role-permission.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import type {
  PermissionDto,
  PermissionRecord,
  ReplaceRolePermissionsInput,
  RoleDto,
  RoleRecord,
} from '../identity.types.js';
import type {
  IdentityCommandContext,
} from '../application/identity-application.types.js';
import type {
  IdentityMutationCoordinatorPort,
} from '../application/identity-infrastructure.ports.js';

import {
  assertAllIdsResolved,
  difference,
  uniqueIds,
} from './identity-service.helpers.js';

export interface RolePermissionsResult {
  role: RoleDto;
  permissions: PermissionDto[];
}

interface ReplaceRolePermissionsContext {
  beforeRole: RoleRecord;
  afterRole: RoleRecord | null;
  beforePermissionIds: string[];
  afterPermissions: PermissionRecord[];
  addedPermissionIds: string[];
  removedPermissionIds: string[];
  createdLinks: Array<{
    roleId: string;
    permissionId: string;
  }>;
  revokedLinks: RevokedRolePermissionSnapshot[];
}

export class RolePermissionService {
  public constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository:
      PermissionRepository,
    private readonly rolePermissionRepository:
      RolePermissionRepository,
    private readonly compensationRepository:
      IdentityCompensationRepository,
    private readonly mutationCoordinator:
      IdentityMutationCoordinatorPort,
  ) {}

  public async getRolePermissions(
    roleId: string,
  ): Promise<RolePermissionsResult> {
    const role = await this.roleRepository.findById(roleId);

    if (!role) {
      throw new IdentityNotFoundError('Role', roleId);
    }

    const permissions =
      await this.rolePermissionRepository.findPermissions(
        roleId,
        {
          activeOnly: true,
        },
      );

    return {
      role: toRoleDto(role),
      permissions: permissions.map(toPermissionDto),
    };
  }

  public async replace(
    roleId: string,
    input: ReplaceRolePermissionsInput,
    command: IdentityCommandContext,
  ): Promise<RolePermissionsResult> {
    const role = await this.roleRepository.findById(roleId);

    if (!role) {
      throw new IdentityNotFoundError('Role', roleId);
    }

    if (role.isSystem) {
      throw new ProtectedIdentityResourceError(
        'role',
        roleId,
        'assigned different permissions',
      );
    }

    if (role.version !== input.expectedRoleVersion) {
      throw new IdentityVersionConflictError(
        'Role',
        roleId,
        input.expectedRoleVersion,
      );
    }

    const requestedPermissionIds = uniqueIds(
      input.permissionIds,
    );

    const [permissions