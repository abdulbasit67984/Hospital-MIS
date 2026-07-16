import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
  USER_STATUS,
} from '../identity.constants.js';
import {
  IdentityConflictError,
  IdentityNotFoundError,
  IdentityValidationError,
} from '../identity.errors.js';
import {
  normalizeEmail,
  normalizeUsername,
  toNullableObjectId,
  toObjectId,
  toUserDto,
  toUserRoleDto,
} from '../identity.mapper.js';
import {
  throwMappedIdentityPersistenceError,
} from '../identity.persistence-errors.js';
import type {
  IdentityUserMutationDependencies,
} from '../identity.ports.js';
import {
  buildAuditActorFields,
} from '../identity.ports.js';
import {
  IDENTITY_ADDITIONAL_TRANSACTION_TYPES,
  IDENTITY_COMPENSATION_TYPES,
  IDENTITY_TRANSACTION_CHECKPOINTS,
} from '../identity.transaction.constants.js';
import type {
  CreateUserInput,
  IdentityActorContext,
  UserDto,
  UserRoleDto,
} from '../identity.types.js';
import type {
  UserRoleAssignmentPolicy,
} from '../policies/user-role-assignment.policy.js';
import type {
  StaffRepository,
} from '../repositories/staff.repository.js';
import type {
  UserRoleRepository,
} from '../repositories/user-role.repository.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface CreateUserCommand {
  input: CreateUserInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface CreateUserResult {
  user: UserDto;
  roleAssignments: UserRoleDto[];
}

export class CreateUserWorkflow {
  public constructor(
    private readonly userRepository: UserRepository,
    private readonly staffRepository: StaffRepository,
    private readonly userRoleRepository:
      UserRoleRepository,
    private readonly userRoleAssignmentPolicy:
      UserRoleAssignmentPolicy,
    private readonly dependencies:
      IdentityUserMutationDependencies,
  ) {}

  public async execute(
    command: CreateUserCommand,
  ): Promise<CreateUserResult> {
    const input = this.normalizeInput(command.input);

    await this.assertUsernameIsAvailable(
      input.username,
    );

    await this.assertEmailIsAvailable(
      input.email,
    );

    await this.assertStaffCanReceiveUser(
      input.staffId,
    );

    const normalizedAssignments =
      await this.userRoleAssignmentPolicy
        .validateForCreateUser(
          input.roleAssignments,
        );

    /*
     * Password hashing happens before transaction creation so plaintext is
     * never included in the durable transaction payload.
     */
    const passwordHash =
      await this.dependencies.passwordHasher.hash(
        input.password,
      );

    const lockKeys = [
      `identity:user-username:${normalizeUsername(input.username)}`,
    ];

    if (input.email) {
      lockKeys.push(
        `identity:user-email:${normalizeEmail(input.email)}`,
      );
    }

    if (input.staffId) {
      lockKeys.push(
        `identity:user-staff:${input.staffId}`,
      );
    }

    for (const assignment of normalizedAssignments) {
      lockKeys.push(
        `identity:user-role-target:${assignment.roleId}:${assignment.facilityId ?? 'GLOBAL'}`,
      );
    }

    try {
      return await this.dependencies.transactionManager.execute(
        {
          transactionType:
            IDENTITY_ADDITIONAL_TRANSACTION_TYPES
              .CREATE_USER,
          idempotencyKey: command.idempotencyKey,
          actorUserId: command.actor.userId,
          facilityId:
            command.actor.facilityId ?? null,
          lockKeys,
          payload: {
            user: {
              staffId: input.staffId ?? null,
              username: input.username,
              email: input.email ?? null,
              status: input.status,
              mustChangePassword:
                input.mustChangePassword,
            },
            roleAssignments:
              normalizedAssignments.map(
                (assignment) => ({
                  roleId: assignment.roleId,
                  facilityId:
                    assignment.facilityId,
                  expiresAt:
                    assignment.expiresAt?.toISOString() ??
                    null,
                }),
              ),
          },
          execute: async (transaction) => {
            await this.assertUsernameIsAvailable(
              input.username,
            );

            await this.assertEmailIsAvailable(
              input.email,
            );

            await this.assertStaffCanReceiveUser(
              input.staffId,
            );

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .VALIDATED,
              {
                username:
                  normalizeUsername(
                    input.username,
                  ),
                staffId:
                  input.staffId ?? null,
              },
            );

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .PASSWORD_HASHED,
              {
                username:
                  normalizeUsername(
                    input.username,
                  ),
              },
            );

            const user =
              await this.userRepository.create({
                staffId: toNullableObjectId(
                  input.staffId,
                  'staffId',
                ),
                username: input.username,
                normalizedUsername:
                  normalizeUsername(
                    input.username,
                  ),
                email: input.email ?? null,
                normalizedEmail:
                  normalizeEmail(input.email),
                passwordHash,
                status:
                  input.status ??
                  USER_STATUS.ACTIVE,
                mustChangePassword:
                  input.mustChangePassword ??
                  true,
                createdBy: toObjectId(
                  command.actor.userId,
                  'actor.userId',
                ),
              });

            const userId =
              user._id.toHexString();

            await transaction.registerCompensation({
              key: `delete-created-user:${userId}`,
              type:
                IDENTITY_COMPENSATION_TYPES
                  .DELETE_CREATED_USER,
              payload: {
                userId,
                expectedVersion:
                  user.version,
                transactionId:
                  transaction.transactionId,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .USER_CREATED,
              {
                userId,
                version: user.version,
              },
            );

            const createdAssignments: UserRoleDto[] =
              [];

            for (
              const assignment of
              normalizedAssignments
            ) {
              await transaction.registerCompensation({
                key:
                  `delete-created-user-role:${userId}:` +
                  `${assignment.roleId}:` +
                  `${assignment.facilityId ?? 'GLOBAL'}`,
                type:
                  IDENTITY_COMPENSATION_TYPES
                    .DELETE_CREATED_USER_ROLE,
                payload: {
                  userId,
                  roleId:
                    assignment.roleId,
                  facilityId:
                    assignment.facilityId,
                  transactionId:
                    transaction.transactionId,
                },
              });

              const assignmentResult =
                await this.userRoleRepository.assign(
                  {
                    userId,
                    roleId:
                      assignment.roleId,
                    facilityId:
                      assignment.facilityId,
                    assignedBy:
                      command.actor.userId,
                    expiresAt:
                      assignment.expiresAt,
                  },
                );

              createdAssignments.push(
                toUserRoleDto(
                  assignmentResult.assignment,
                ),
              );
            }

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .USER_ROLES_APPLIED,
              {
                userId,
                assignmentIds:
                  createdAssignments.map(
                    (assignment) =>
                      assignment.id,
                  ),
              },
            );

            const now =
              this.dependencies.clock.now();
            const userDto = toUserDto(user);

            await this.dependencies.audit.append({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:audit:user-created`,
              action:
                IDENTITY_AUDIT_ACTIONS
                  .USER_CREATED,
              entityType: 'User',
              entityId: userId,
              ...buildAuditActorFields(
                command.actor,
              ),
              occurredAt: now,
              before: null,
              after: {
                user: userDto,
                roleAssignments:
                  createdAssignments,
              },
              metadata: {
                idempotencyKey:
                  command.idempotencyKey,
                passwordHashIncluded:
                  false,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                userId,
              },
            );

            await this.dependencies.outbox.enqueue({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:outbox:user-created`,
              eventType:
                IDENTITY_OUTBOX_EVENTS
                  .USER_CREATED,
              aggregateType: 'User',
              aggregateId: userId,
              actorUserId:
                command.actor.userId,
              facilityId:
                command.actor.facilityId ??
                null,
              correlationId:
                command.actor.correlationId,
              occurredAt: now,
              payload: {
                user: userDto,
                roleAssignments:
                  createdAssignments,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                userId,
              },
            );

            return {
              user: userDto,
              roleAssignments:
                createdAssignments,
            };
          },
        },
      );
    } catch (error) {
      throwMappedIdentityPersistenceError(error, {
        entityName: 'User',
        fallbackMessage:
          'A user with the same username, email, or staff account already exists',
        fallbackCode:
          'IDENTITY_USER_ALREADY_EXISTS',
      });
    }
  }

  private normalizeInput(
    input: CreateUserInput,
  ): CreateUserInput {
    return {
      ...input,
      staffId: input.staffId ?? null,
      username: input.username.trim(),
      email: normalizeEmail(input.email),
      status:
        input.status ?? USER_STATUS.ACTIVE,
      mustChangePassword:
        input.mustChangePassword ?? true,
      roleAssignments:
        input.roleAssignments ?? [],
    };
  }

  private async assertUsernameIsAvailable(
    username: string,
  ): Promise<void> {
    const existing =
      await this.userRepository.findByUsername(
        username,
      );

    if (existing) {
      throw new IdentityConflictError(
        'The username is already in use',
        'IDENTITY_USERNAME_ALREADY_EXISTS',
        {
          username:
            normalizeUsername(username),
          existingUserId:
            existing._id.toHexString(),
        },
      );
    }
  }

  private async assertEmailIsAvailable(
    email: string | null | undefined,
  ): Promise<void> {
    if (!email) {
      return;
    }

    const existing =
      await this.userRepository.findByEmail(email);

    if (existing) {
      throw new IdentityConflictError(
        'The email address is already assigned to another user',
        'IDENTITY_USER_EMAIL_ALREADY_EXISTS',
        {
          email: normalizeEmail(email),
          existingUserId:
            existing._id.toHexString(),
        },
      );
    }
  }

  private async assertStaffCanReceiveUser(
    staffId: string | null | undefined,
  ): Promise<void> {
    if (!staffId) {
      return;
    }

    const staff =
      await this.staffRepository.findById(staffId);

    if (!staff) {
      throw new IdentityNotFoundError(
        'Staff',
        staffId,
      );
    }

    if (!staff.isActive) {
      throw new IdentityValidationError(
        'An inactive staff member cannot receive a user account',
        {
          staffId,
          employmentStatus:
            staff.employmentStatus,
        },
      );
    }

    const existingUser =
      await this.userRepository.findByStaffId(
        staffId,
      );

    if (existingUser) {
      throw new IdentityConflictError(
        'The staff member already has a user account',
        'IDENTITY_STAFF_USER_ALREADY_EXISTS',
        {
          staffId,
          existingUserId:
            existingUser._id.toHexString(),
        },
      );
    }
  }
}