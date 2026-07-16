import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityNotFoundError,
  IdentityVersionConflictError,
} from '../identity.errors.js';
import {
  nullableObjectIdToString,
  toUserDto,
} from '../identity.mapper.js';
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
  UserDto,
} from '../identity.types.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface ResetUserPasswordInput {
  password: string;
  mustChangePassword?: boolean;
  reason: string;
  revokeSessions?: boolean;
}

export interface ResetUserPasswordCommand {
  userId: string;
  input: ResetUserPasswordInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface ResetUserPasswordResult {
  user: UserDto;
  revokedSessionCount: number;
}

export class ResetUserPasswordWorkflow {
  public constructor(
    private readonly userRepository:
      UserRepository,
    private readonly dependencies:
      IdentityUserMutationDependencies,
  ) {}

  public async execute(
    command: ResetUserPasswordCommand,
  ): Promise<ResetUserPasswordResult> {
    const current =
      await this.userRepository.findCredentialById(
        command.userId,
      );

    if (!current) {
      throw new IdentityNotFoundError(
        'User',
        command.userId,
      );
    }

    /*
     * Hash before transaction creation. Plaintext is never written to the
     * transaction, audit, outbox, or recovery collections.
     */
    const passwordHash =
      await this.dependencies.passwordHasher.hash(
        command.input.password,
      );

    const mustChangePassword =
      command.input.mustChangePassword ?? true;

    const revokeSessions =
      command.input.revokeSessions ?? true;

    return this.dependencies.transactionManager.execute(
      {
        transactionType:
          IDENTITY_ADDITIONAL_TRANSACTION_TYPES
            .RESET_USER_PASSWORD,
        idempotencyKey:
          command.idempotencyKey,
        actorUserId:
          command.actor.userId,
        facilityId:
          command.actor.facilityId ??
          null,
        lockKeys: [
          `identity:user:${command.userId}`,
          `identity:user-sessions:${command.userId}`,
        ],
        payload: {
          userId: command.userId,
          mustChangePassword,
          revokeSessions,
          reason:
            command.input.reason.trim(),
        },
        execute: async (transaction) => {
          const before =
            await this.userRepository
              .findCredentialById(
                command.userId,
              );

          if (!before) {
            throw new IdentityNotFoundError(
              'User',
              command.userId,
            );
          }

          if (
            before.version !==
            current.version
          ) {
            throw new IdentityVersionConflictError(
              'User',
              command.userId,
              current.version,
            );
          }

          /*
           * The existing hash is required only for compensation. It must
           * never be included in API responses, audit records, or events.
           *
           * Restrict access to the application-transaction collection as
           * strictly as the users collection.
           */
          await transaction.registerCompensation({
            key:
              `restore-user-password:${command.userId}:` +
              `${before.version}`,
            type:
              IDENTITY_COMPENSATION_TYPES
                .RESTORE_USER,
            payload: {
              userId: command.userId,
              expectedPostVersion:
                before.version + 1,
              previous: {
                passwordHash:
                  before.passwordHash,
                passwordChangedAt:
                  before.passwordChangedAt?.toISOString() ??
                  null,
                mustChangePassword:
                  before.mustChangePassword,
                failedLoginAttempts:
                  before.failedLoginAttempts,
                lockedUntil:
                  before.lockedUntil?.toISOString() ??
                  null,
                version: before.version,
                updatedBy:
                  nullableObjectIdToString(
                    before.updatedBy,
                  ),
                updatedAt:
                  before.updatedAt.toISOString(),
              },
              transactionId:
                transaction.transactionId,
            },
          });

          const updated =
            await this.userRepository.updatePassword(
              {
                userId: command.userId,
                passwordHash,
                mustChangePassword,
                expectedVersion:
                  before.version,
                actorUserId:
                  command.actor.userId,
              },
            );

          if (!updated) {
            throw new IdentityVersionConflictError(
              'User',
              command.userId,
              before.version,
            );
          }

          await transaction.checkpoint(
            IDENTITY_TRANSACTION_CHECKPOINTS
              .USER_PASSWORD_UPDATED,
            {
              userId: command.userId,
              version: updated.version,
            },
          );

          let revokedSessionCount = 0;

          if (revokeSessions) {
            const result =
              await this.dependencies.sessions
                .revokeAllForUser({
                  userId: command.userId,
                  revokedBy:
                    command.actor.userId,
                  reason:
                    command.input.reason.trim(),
                  transactionId:
                    transaction.transactionId,
                });

            revokedSessionCount =
              result.revokedSessionCount;

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
            toUserDto(before);
          const afterDto =
            toUserDto(updated);

          await this.dependencies.audit.append({
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              `${transaction.transactionId}:audit:user-password-reset`,
            action:
              IDENTITY_AUDIT_ACTIONS
                .USER_PASSWORD_RESET,
            entityType: 'User',
            entityId: command.userId,
            ...buildAuditActorFields(
              command.actor,
            ),
            occurredAt: now,
            before: {
              user: beforeDto,
            },
            after: {
              user: afterDto,
            },
            metadata: {
              idempotencyKey:
                command.idempotencyKey,
              reason:
                command.input.reason.trim(),
              revokedSessionCount,
              passwordIncluded: false,
              passwordHashIncluded: false,
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
              `${transaction.transactionId}:outbox:user-password-reset`,
            eventType:
              IDENTITY_OUTBOX_EVENTS
                .USER_PASSWORD_RESET,
            aggregateType: 'User',
            aggregateId: command.userId,
            actorUserId:
              command.actor.userId,
            facilityId:
              command.actor.facilityId ??
              null,
            correlationId:
              command.actor.correlationId,
            occurredAt: now,
            payload: {
              userId: command.userId,
              passwordChangedAt:
                afterDto.passwordChangedAt,
              mustChangePassword:
                afterDto.mustChangePassword,
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
  }
}