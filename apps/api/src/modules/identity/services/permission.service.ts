import type {
  PermissionRepository,
} from '../repositories/permission.repository.js';
import {
  IdentityNotFoundError,
  IdentityValidationError,
} from '../identity.errors.js';
import {
  toPermissionDto,
} from '../identity.mapper.js';
import type {
  IdentityPageResult,
  PermissionDto,
  PermissionListQuery,
} from '../identity.types.js';

export class PermissionService {
  public constructor(
    private readonly permissionRepository: PermissionRepository,
  ) {}

  public async getById(
    permissionId: string,
  ): Promise<PermissionDto> {
    const permission =
      await this.permissionRepository.findById(permissionId);

    if (!permission) {
      throw new IdentityNotFoundError(
        'Permission',
        permissionId,
      );
    }

    return toPermissionDto(permission);
  }

  public async list(
    query: PermissionListQuery,
  ): Promise<IdentityPageResult<PermissionDto>> {
    const page =
      await this.permissionRepository.list(query);

    return {
      ...page,
      items: page.items.map(toPermissionDto),
    };
  }

  /**
   * Shared validation for role mutation workflows.
   *
   * The return order follows the requested ID order rather than the database
   * sort order.
   */
  public async requireActiveByIds(
    permissionIds: string[],
  ): Promise<PermissionDto[]> {
    const uniquePermissionIds = [
      ...new Set(permissionIds),
    ];

    if (uniquePermissionIds.length === 0) {
      return [];
    }

    const permissions =
      await this.permissionRepository.findByIds(
        uniquePermissionIds,
        {
          activeOnly: true,
        },
      );

    const permissionById = new Map(
      permissions.map((permission) => [
        permission._id.toHexString(),
        permission,
      ]),
    );

    const missingPermissionIds =
      uniquePermissionIds.filter(
        (permissionId) =>
          !permissionById.has(permissionId),
      );

    if (missingPermissionIds.length > 0) {
      throw new IdentityValidationError(
        'One or more permissions do not exist or are inactive',
        {
          missingPermissionIds,
        },
      );
    }

    return uniquePermissionIds.map((permissionId) =>
      toPermissionDto(
        permissionById.get(permissionId)!,
      ),
    );
  }
}