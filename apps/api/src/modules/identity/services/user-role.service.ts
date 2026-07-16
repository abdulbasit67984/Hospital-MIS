import {
  IdentityNotFoundError,
} from '../identity.errors.js';

import {
  toUserRoleDto,
} from '../identity.mapper.js';

import type {
  UserRoleDto,
} from '../identity.types.js';

import type {
  UserRoleRepository,
} from '../repositories/user-role.repository.js';

import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface UserRoleListOptions {
  facilityId?:
    string;

  includeExpired?:
    boolean;

  activeOnly?:
    boolean;
}

export class UserRoleService {
  public constructor(
    private readonly userRepository:
      UserRepository,

    private readonly userRoleRepository:
      UserRoleRepository,
  ) {}

  public async getById(
    userRoleId:
      string,
  ): Promise<UserRoleDto> {
    const assignment =
      await this
        .userRoleRepository
        .findById(
          userRoleId,
        );

    if (
      !assignment
    ) {
      throw new IdentityNotFoundError(
        'User role assignment',
        userRoleId,
      );
    }

    return toUserRoleDto(
      assignment,
    );
  }

  public async listForUser(
    userId:
      string,

    options:
      UserRoleListOptions = {},
  ): Promise<UserRoleDto[]> {
    if (
      !(
        await this
          .userRepository
          .existsById(
            userId,
          )
      )
    ) {
      throw new IdentityNotFoundError(
        'User',
        userId,
      );
    }

    const assignments =
      await this
        .userRoleRepository
        .findAssignments(
          userId,
          options,
        );

    return assignments.map(
      toUserRoleDto,
    );
  }
}