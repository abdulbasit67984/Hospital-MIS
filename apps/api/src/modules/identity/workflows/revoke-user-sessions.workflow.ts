import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityNotFoundError,
} from '../identity.errors.js';
import type {
  IdentityUserMutationDependencies,
} from '../identity.ports.js';
import {
  buildAuditActorFields,
} from '../identity.ports.js';
import {
  IDENTITY_TRANSACTION_CHECKPOINTS,
} from '../identity.transaction.constants.js';
import type {
  IdentityActorContext,
  UserDto,
} from '../identity.types.js';
import {
  toUserDto,
} from '../identity.mapper.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface RevokeUserSessionsInput {
  reason: string;
  excludeSessionId?: string;
}

export interface RevokeUserSessionsCommand {
  userId: string;
  input: RevokeUserSessionsInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface RevokeUserSessionsWorkflowResult {
  user: UserDto;
  revokedSessionCount: number;
}

const REVOKE_USER_SESSIONS_TRANSACTION_TYPE =
  'IDENTITY_REVOKE_USER_SESSIONS';

export class RevokeUserSessionsWorkflow {
  public constructor(
    private readonly userRepository:
      UserRepository,
    private readonly dependencies:
      IdentityUserMutationDependencies,
  ) {}

  public async execute(
    command: RevokeUserSessionsCommand,
  ): Promise<RevokeUserSessionsWorkflowResult> {
    return this.dependencies.transactionManager.execute(
      {
        transactionType:
          REVOKE_USER_SESSIONS_TRANSACTION_TYPE,
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
          reason:
            command.input.reason.trim(),
          excludeSessionId:
            command.input.excludeSessionId ??
            null,
        },
        execute: async (transaction) => {
          const user =
            await this.userRepository.findById(
              command.userId,
            );

          if (!user) {
            throw new IdentityNotFoundError(
              'User',
              command.userId,
            );
          }

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
                excludeSessionId:
                  command.input.excludeSessionId,
              });

          await transaction.checkpoint(
            IDENTITY_TRANSACTION_CHECKPOINTS
              .USER_SESSIONS_REVOKED,
            {
              userId: command.userId,
              revokedSessionCount:
                result.revokedSessionCount,
            },
          );

          const now =
            this.dependencies.clock.now();
          const userDto = toUserDto(user);

          await this.dependencies.audit.append({
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              `${transaction.transactionId}:audit:user-sessions-revoked`,
            action:
              IDENTITY_AUDIT_ACTIONS
                .USER_SESSIONS_REVOKED,
            entityType: 'User',
            entityId: command.userId,
            ...buildAuditActorFields(
              command.actor,
            ),
            occurredAt: now,
            before: null,
            after: {
              userId: command.userId,
              revokedSessionCount:
                result.revokedSessionCount,
            },
            metadata: {
              idempotencyKey:
                command.idempotencyKey,
              reason:
                command.input.reason.trim(),
              excludedSession:
                Boolean(
                  command.input
                    .excludeSessionId,
                ),
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
              `${transaction.transactionId}:outbox:user-sessions-revoked`,
            eventType:
              IDENTITY_OUTBOX_EVENTS
                .USER_SESSIONS_REVOKED,
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
              revokedSessionCount:
                result.revokedSessionCount,
              reason:
                command.input.reason.trim(),
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
            user: userDto,
            revokedSessionCount:
              result.revokedSessionCount,
          };
        },
      },
    );
  }
}