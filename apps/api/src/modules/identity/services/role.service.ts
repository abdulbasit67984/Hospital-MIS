import {
  IdentityNotFoundError,
} from '../identity.errors.js';
import {
  toPermissionDto,
  toRoleDto,
} from '../identity.mapper.js';
import type {
  IdentityPageResult,
  PermissionDto,
  ReplaceRolePermissionsInput,
  RoleDto,
  RoleListQuery,
  CreateRoleInput,
  IdentityActorContext,
  UpdateRoleInput,
} from '../identity.types.js';
import type {
  RolePermissionRepository,
} from '../repositories/role-permission.repository.js';
import type {
  RoleRepository,
} from '../repositories/role.repository.js';
import type {
  CreateRoleResult,
  CreateRoleWorkflow,
} from '../workflows/create-role.workflow.js';
import type {
  ReplaceRolePermissionsResult,
  ReplaceRolePermissionsWorkflow,
} from '../workflows/replace-role-permissions.workflow.js';
import type {
  UpdateRoleWorkflow,
} from '../workflows/update-role.workflow.js';

export interface RoleMutationContext {
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export class RoleService {
  public constructor(
    private readonly roleRepository: RoleRepository,
    private readonly rolePermissionRepository:
      RolePermissionRepository,
    private readonly createRoleWorkflow:
      CreateRoleWorkflow,
    private readonly updateRoleWorkflow:
      UpdateRoleWorkflow,
    private readonly replaceRolePermissionsWorkflow:
      ReplaceRolePermissionsWorkflow,
  ) {}

  public async getById(
    roleId: string,
  ): Promise<RoleDto> {
    const role =
      await this.roleRepository.findById(roleId);

    if (!role) {
      throw new IdentityNotFoundError(
        'Role',
        roleId,
      );
    }

    return toRoleDto(role);
  }

  public async getWithPermissions(
    roleId: string,
  ): Promise<{
    role: RoleDto;
    permissions: PermissionDto[];
  }> {
    const [role, permissions] =
      await Promise.all([
        this.roleRepository.findById(roleId),
        this.rolePermissionRepository.findPermissions(
          roleId,
          {
            activeOnly: false,
          },
        ),
      ]);

    if (!role) {
      throw new IdentityNotFoundError(
        'Role',
        roleId,
      );
    }

    return {
      role: toRoleDto(role),
      permissions: permissions.map(
        toPermissionDto,
      ),
    };
  }

  public async list(
    query: RoleListQuery,
  ): Promise<IdentityPageResult<RoleDto>> {
    const page =
      await this.roleRepository.list(query);

    return {
      ...page,
      items: page.items.map(toRoleDto),
    };
  }

  public async listPermissions(
    roleId: string,
    options: {
      activeOnly?: boolean;
    } = {},
  ): Promise<PermissionDto[]> {
    const role =
      await this.roleRepository.findById(roleId);

    if (!role) {
      throw new IdentityNotFoundError(
        'Role',
        roleId,
      );
    }

    const permissions =
      await this.rolePermissionRepository.findPermissions(
        roleId,
        {
          activeOnly: options.activeOnly ?? true,
        },
      );

    return permissions.map(toPermissionDto);
  }

  public async create(
    input: CreateRoleInput,
    context: RoleMutationContext,
  ): Promise<CreateRoleResult> {
    return this.createRoleWorkflow.execute({
      input,
      actor: context.actor,
      idempotencyKey: context.idempotencyKey,
    });
  }

  public async update(
    roleId: string,
    input: UpdateRoleInput,
    context: RoleMutationContext,
  ): Promise<RoleDto> {
    return this.updateRoleWorkflow.execute({
      roleId,
      input,
      actor: context.actor,
      idempotencyKey: context.idempotencyKey,
    });
  }

  public async replacePermissions(
    roleId: string,
    input: ReplaceRolePermissionsInput,
    context: RoleMutationContext,
  ): Promise<ReplaceRolePermissionsResult> {
    return this.replaceRolePermissionsWorkflow.execute(
      {
        roleId,
        input,
        actor: context.actor,
        idempotencyKey:
          context.idempotencyKey,
      },
    );
  }
}