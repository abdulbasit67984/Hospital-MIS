import {
  IdentityNotFoundError,
} from '../identity.errors.js';
import {
  toUserDto,
  toUserRoleDto,
} from '../identity.mapper.js';
import type {
  CreateUserInput,
  IdentityActorContext,
  IdentityPageResult,
  ReplaceUserRolesInput,
  UpdateUserInput,
  UserDto,
  UserListQuery,
  UserRoleDto,
} from '../identity.types.js';
import type {
  UserRoleRepository,
} from '../repositories/user-role.repository.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';
import type {
  CreateUserResult,
  CreateUserWorkflow,
} from '../workflows/create-user.workflow.js';
import type {
  ReplaceUserRolesResult,
  ReplaceUserRolesWorkflow,
} from '../workflows/replace-user-roles.workflow.js';
import type {
  ResetUserPasswordInput,
  ResetUserPasswordResult,
  ResetUserPasswordWorkflow,
} from '../workflows/reset-user-password.workflow.js';
import type {
  RevokeUserSessionsInput,
  RevokeUserSessionsWorkflow,
  RevokeUserSessionsWorkflowResult,
} from '../workflows/revoke-user-sessions.workflow.js';
import type {
  UpdateUserResult,
  UpdateUserWorkflow,
} from '../workflows/update-user.workflow.js';

export interface UserMutationContext {
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export class UserService {
  public constructor(
    private readonly userRepository:
      UserRepository,
    private readonly userRoleRepository:
      UserRoleRepository,
    private readonly createUserWorkflow:
      CreateUserWorkflow,
    private readonly updateUserWorkflow:
      UpdateUserWorkflow,
    private readonly resetUserPasswordWorkflow:
      ResetUserPasswordWorkflow,
    private readonly revokeUserSessionsWorkflow:
      RevokeUserSessionsWorkflow,
    private readonly replaceUserRolesWorkflow:
      ReplaceUserRolesWorkflow,
  ) {}

  public async getById(
    userId: string,
  ): Promise<UserDto> {
    const user =
      await this.userRepository.findById(
        userId,
      );

    if (!user) {
      throw new IdentityNotFoundError(
        'User',
        userId,
      );
    }

    return toUserDto(user);
  }

  public async getWithRoles(
    userId: string,
    options: {
      facilityId?: string;
      includeExpired?: boolean;
      activeOnly?: boolean;
    } = {},
  ): Promise<{
    user: UserDto;
    roleAssignments: UserRoleDto[];
  }> {
    const [user, assignments] =
      await Promise.all([
        this.userRepository.findById(
          userId,
        ),

        this.userRoleRepository
          .findAssignments(userId, {
            facilityId:
              options.facilityId,
            includeExpired:
              options.includeExpired ??
              false,
            activeOnly:
              options.activeOnly ?? true,
          }),
      ]);

    if (!user) {
      throw new IdentityNotFoundError(
        'User',
        userId,
      );
    }

    return {
      user: toUserDto(user),
      roleAssignments:
        assignments.map(toUserRoleDto),
    };
  }

  public async list(
    query: UserListQuery,
  ): Promise<
    IdentityPageResult<UserDto>
  > {
    const page =
      await this.userRepository.list(query);

    return {
      ...page,
      items: page.items.map(toUserDto),
    };
  }

  public async create(
    input: CreateUserInput,
    context: UserMutationContext,
  ): Promise<CreateUserResult> {
    return this.createUserWorkflow.execute({
      input,
      actor: context.actor,
      idempotencyKey:
        context.idempotencyKey,
    });
  }

  public async update(
    userId: string,
    input: UpdateUserInput,
    context: UserMutationContext,
  ): Promise<UpdateUserResult> {
    return this.updateUserWorkflow.execute({
      userId,
      input,
      actor: context.actor,
      idempotencyKey:
        context.idempotencyKey,
    });
  }

  public async resetPassword(
    userId: string,
    input: ResetUserPasswordInput,
    context: UserMutationContext,
  ): Promise<ResetUserPasswordResult> {
    return this.resetUserPasswordWorkflow
      .execute({
        userId,
        input,
        actor: context.actor,
        idempotencyKey:
          context.idempotencyKey,
      });
  }

  public async revokeSessions(
    userId: string,
    input: RevokeUserSessionsInput,
    context: UserMutationContext,
  ): Promise<RevokeUserSessionsWorkflowResult> {
    return this.revokeUserSessionsWorkflow
      .execute({
        userId,
        input,
        actor: context.actor,
        idempotencyKey:
          context.idempotencyKey,
      });
  }

  public async replaceRoles(
    userId: string,
    input: ReplaceUserRolesInput,
    context: UserMutationContext,
  ): Promise<ReplaceUserRolesResult> {
    return this.replaceUserRolesWorkflow
      .execute({
        userId,
        input,
        actor: context.actor,
        idempotencyKey:
          context.idempotencyKey,
      });
  }
}