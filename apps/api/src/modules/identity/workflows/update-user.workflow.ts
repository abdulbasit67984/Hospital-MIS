import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
  USER_STATUS,
} from '../identity.constants.js';
import {
  IdentityConflictError,
  IdentityNotFoundError,
  IdentityVersionConflictError,
} from '../identity.errors.js';
import {
  normalizeEmail,
  nullableObjectIdToString,
  toUserDto,
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
  IdentityActorContext,
  UpdateUserInput,
  UserDto,
} from '../identity.types.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface UpdateUserCommand {
  userId: string;
  input: UpdateUserInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface UpdateUserResult {
  user: UserDto;
  revokedSessionCount: number;
}

export class UpdateUserWorkflow {
  public constructor(
    private readonly userRepository:
      UserRepository,
    private readonly dependencies:
      IdentityUserMutationDependencies,
  ) {}

  public async execute(
    command: UpdateUserCommand,
  ): Promise<UpdateUserResult> {
    const input = this.normalizeInput(
      command.input,
    );

    const hasMutation =
      input.email !== undefined ||
      input.status !== undefined ||
      input.mustChangePassword !==
        undefined;

    if (!hasMutation) {
      const current =
        await this.userRepository.findById(
          command.userId,
        );

      if (!current) {
        throw new IdentityNotFoundError(
          'User',
          command.userId,
        );
      }

      if (
        current.version !==
        input.expectedVersion
      ) {
        throw new IdentityVersionConflictError(
          'User',
          command.userId,
          input.expectedVersion,
        );
      }

      return {
        user: toUserDto(current),
        revokedSessionCount: 0,
      };
    }

    const lockKeys = [
      `identity:user:${command.userId}`,
    ];

    if (input.email) {
      lockKeys.push(
        `identity:user-email:${input.email}`,
      );
    }

    try {
      return await this.dependencies.transactionManager.execute(
        {
          transactionType:
            IDENTITY_ADDITIONAL_TRANSACTION_TYPES
              .UPDATE_USER,
          idempotencyKey:
            command.idempotencyKey,
          actorUserId:
            command.actor.userId,
          facilityId:
            command.actor.facilityId ??
            null,
          lockKeys,
          payload: {
            userId: command.userId,
            input,
          },
          execute: async (transaction) => {
            const current =
              await this.userRepository.findById(
                command.userId,
              );

            if (!current) {
              throw new IdentityNotFoundError(
                'User',
                command.userId,
              );
            }

            if (
              current.version !==
              input.expectedVersion
            ) {
              throw new IdentityVersionConflictError(
                'User',
                command.userId,
                input.expectedVersion,
              );
            }

            if (
              input.email !== undefined &&
              input.email !==
                (current.normalizedEmail ??
                  null)
            ) {
              await this.assertEmailIsAvailable(
                input.email,
                command.userId,
              );
            }

            await transaction.registerCompensation({
              key:
                `restore-user:${command.userId}:` +
                `${current.version}`,
              type:
                IDENTITY_COMPENSATION_TYPES
                  .RESTORE_USER,
              payload: {
                userId: command.userId,
                expectedPostVersion:
                  current.version + 1,
                previous: {
                  email:
                    current.email ?? null,
                  normalizedEmail:
                    current.normalizedEmail ??
                    null,
                  status: current.status,
                  mustChangePassword:
                    current.mustChangePassword,
                  failedLoginAttempts:
                    current.failedLoginAttempts,
                  lockedUntil:
                    current.lockedUntil?.toISOString() ??
                    null,
                  version: current.version,
                  updatedBy:
                    nullableObjectIdToString(
                      current.updatedBy,
                    ),
                  updatedAt:
                    current.updatedAt.toISOString(),
                },
                transactionId:
                  transaction.transactionId,
              },
            });

            const updated =
              await this.userRepository.updateWithVersion(
                command.userId,
                input,
                command.actor.userId,
              );

            if (!updated) {
              throw new IdentityVersionConflictError(
                'User',
                command.userId,
                input.expectedVersion,
              );
            }

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .USER_UPDATED,
              {
                userId: command.userId,
                version: updated.version,
              },
            );

            let revokedSessionCount = 0;

            const statusChanged =
              current.status !==
              updated.status;

            if (
              statusChanged &&
              updated.status !==
                USER_STATUS.ACTIVE
            ) {
              const sessionResult =
                await this.dependencies.sessions
                  .revokeAllForUser({
                    userId: command.userId,
                    revokedBy:
                      command.actor.userId,
                    reason:
                      `User status changed from ` +
                      `${current.status} to ` +
                      `${updated.status}`,
                    transactionId:
                      transaction.transactionId,
                  });

              revokedSessionCount =
                sessionResult.revokedSessionCount;

              await transaction.checkpoint(
                IDENTITY_TRANSACTION_CHECKPOINTS
                  .USER_SESSIONS_REVOKED,
                {
                  userId: command.userId,
                  revokedSessionCount,
                },
              );
            }

            const now =
              this.dependencies.clock.now();
            const beforeDto =
              toUserDto(current);
            const afterDto =
              toUserDto(updated);

            const changedFields =
              this.getChangedFields(
                beforeDto,
                afterDto,
              );

            await this.dependencies.audit.append({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:audit:user-updated`,
              action: statusChanged
                ? IDENTITY_AUDIT_ACTIONS
                    .USER_STATUS_CHANGED
                : IDENTITY_AUDIT_ACTIONS
                    .USER_UPDATED,
              entityType: 'User',
              entityId: command.userId,
              ...buildAuditActorFields(
                command.actor,
              ),
              occurredAt: now,
              before: beforeDto,
              after: afterDto,
              metadata: {
                idempotencyKey:
                  command.idempotencyKey,
                changedFields,
                revokedSessionCount,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                userId: command.userId,
              },
            );

            await this.dependencies.outbox.enqueue({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:outbox:user-updated`,
              eventType: statusChanged
                ? IDENTITY_OUTBOX_EVENTS
                    .USER_STATUS_CHANGED
                : IDENTITY_OUTBOX_EVENTS
                    .USER_UPDATED,
              aggregateType: 'User',
              aggregateId:
                command.userId,
              actorUserId:
                command.actor.userId,
              facilityId:
                command.actor.facilityId ??
                null,
              correlationId:
                command.actor.correlationId,
              occurredAt: now,
              payload: {
                before: beforeDto,
                after: afterDto,
                changedFields,
                revokedSessionCount,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                userId: command.userId,
              },
            );

            return {
              user: afterDto,
              revokedSessionCount,
            };
          },
        },
      );
    } catch (error) {
      throwMappedIdentityPersistenceError(
        error,
        {
          entityName: 'User',
          fallbackMessage:
            'The updated email is already assigned to another user',
          fallbackCode:
            'IDENTITY_USER_EMAIL_ALREADY_EXISTS',
        },
      );
    }
  }

  private normalizeInput(
    input: UpdateUserInput,
  ): UpdateUserInput {
    return {
      ...input,
      email:
        input.email !== undefined
          ? normalizeEmail(input.email)
          : undefined,
    };
  }

  private async assertEmailIsAvailable(
    email: string | null,
    currentUserId: string,
  ): Promise<void> {
    if (!email) {
      return;
    }

    const existing =
      await this.userRepository.findByEmail(
        email,
      );

    if (
      existing &&
      existing._id.toHexString() !==
        currentUserId
    ) {
      throw new IdentityConflictError(
        'The email address is already assigned to another user',
        'IDENTITY_USER_EMAIL_ALREADY_EXISTS',
        {
          email,
          existingUserId:
            existing._id.toHexString(),
        },
      );
    }
  }

  private getChangedFields(
    before: UserDto,
    after: UserDto,
  ): string[] {
    const mutableFields: Array<
      keyof UserDto
    > = [
      'email',
      'status',
      'mustChangePassword',
      'failedLoginAttempts',
      'lockedUntil',
      'version',
    ];

    return mutableFields.filter(
      (field) =>
        before[field] !== after[field],
    );
  }
}