import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityNotFoundError,
} from '../identity.errors.js';
import {
  toUserDto,
  toUserRoleDto,
} from '../identity.mapper.js';
import type {
  IdentityMutationDependencies,
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
  ReplaceUserRolesInput,
  UserDto,
  UserRoleDto,
} from '../identity.types.js';
import type {
  UserRoleAssignmentPolicy,
} from '../policies/user-role-assignment.policy.js';
import type {
  UserRoleRepository,
  UserRoleStateSnapshot,
} from '../repositories/user-role.repository.js';
import type {
  UserRepository,
} from '../repositories/user.repository.js';

export interface ReplaceUserRolesCommand {
  userId: string;
  input: ReplaceUserRolesInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface ReplaceUserRolesResult {
  user: UserDto;
  roleAssignments: UserRoleDto[];
  addedAssignmentKeys: string[];
  updatedAssignmentKeys: string[];
  removedAssignmentKeys: string[];
}

export class ReplaceUserRolesWorkflow {
  public constructor(
    private readonly userRepository:
      UserRepository,
    private readonly userRoleRepository:
      UserRoleRepository,
    private readonly assignmentPolicy:
      UserRoleAssignmentPolicy,
    private readonly dependencies:
      IdentityMutationDependencies,
  ) {}

  public async execute(
    command: ReplaceUserRolesCommand,
  ): Promise<ReplaceUserRolesResult> {
    const requestedAssignments =
      await this.assignmentPolicy
        .validateForReplacement(
          command.input.assignments,
        );

    const roleLockKeys =
      requestedAssignments.map(
        (assignment) =>
          `identity:role:${assignment.roleId}`,
      );

    return this.dependencies.transactionManager.execute(
      {
        transactionType:
          IDENTITY_ADDITIONAL_TRANSACTION_TYPES
            .REPLACE_USER_ROLES,
        idempotencyKey:
          command.idempotencyKey,
        actorUserId:
          command.actor.userId,
        facilityId:
          command.actor.facilityId ??
          null,
        lockKeys: [
          `identity:user:${command.userId}`,
          `identity:user-roles:${command.userId}`,
          ...roleLockKeys,
        ],
        payload: {
          userId: command.userId,
          reason:
            command.input.reason.trim(),
          assignments:
            requestedAssignments.map(
              (assignment) => ({
                roleId:
                  assignment.roleId,
                facilityId:
                  assignment.facilityId,
                expiresAt:
                  assignment.expiresAt?.toISOString() ??
                  null,
              }),
            ),
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

          /*
           * Repeat role validation after the relevant role locks are held.
           */
          const validatedAssignments =
            await this.assignmentPolicy
              .validateForReplacement(
                command.input.assignments,
              );

          const currentAssignments =
            await this.userRoleRepository
              .findAssignments(
                command.userId,
                {
                  activeOnly: true,
                  includeExpired: true,
                },
              );

          const currentByKey = new Map(
            currentAssignments.map(
              (assignment) => [
                this.assignmentPolicy
                  .getAssignmentKey(
                    assignment.roleId.toHexString(),
                    assignment.facilityId?.toHexString() ??
                      null,
                  ),
                assignment,
              ],
            ),
          );

          const requestedByKey = new Map(
            validatedAssignments.map(
              (assignment) => [
                this.assignmentPolicy
                  .getAssignmentKey(
                    assignment.roleId,
                    assignment.facilityId,
                  ),
                assignment,
              ],
            ),
          );

          const removedAssignmentKeys = [
            ...currentByKey.keys(),
          ].filter(
            (key) =>
              !requestedByKey.has(key),
          );

          const addedAssignmentKeys: string[] =
            [];

          const updatedAssignmentKeys: string[] =
            [];

          for (
            const key of
            removedAssignmentKeys
          ) {
            const assignment =
              currentByKey.get(key)!;

            const snapshot =
              this.userRoleRepository
                .createSnapshot(assignment);

            await this.registerRestoreCompensation(
              transaction,
              snapshot,
              key,
            );

            await this.userRoleRepository.revoke({
              userRoleId:
                assignment._id.toHexString(),
              revokedBy:
                command.actor.userId,
              reason:
                command.input.reason.trim(),
            });
          }

          for (
            const [
              key,
              requested,
            ] of requestedByKey
          ) {
            const current =
              currentByKey.get(key);

            if (
              current &&
              this.datesEqual(
                current.expiresAt ?? null,
                requested.expiresAt,
              )
            ) {
              continue;
            }

            const existing =
              await this.userRoleRepository
                .findByIdentity({
                  userId: command.userId,
                  roleId:
                    requested.roleId,
                  facilityId:
                    requested.facilityId,
                });

            const snapshot =
              this.userRoleRepository
                .createSnapshot(
                  existing,
                  {
                    userId:
                      command.userId,
                    roleId:
                      requested.roleId,
                    facilityId:
                      requested.facilityId,
                  },
                );

            if (snapshot.exists) {
              await this.registerRestoreCompensation(
                transaction,
                snapshot,
                key,
              );
            } else {
              await transaction.registerCompensation({
                key:
                  `delete-created-user-role:${command.userId}:${key}`,
                type:
                  IDENTITY_COMPENSATION_TYPES
                    .DELETE_CREATED_USER_ROLE,
                payload: {
                  userId:
                    command.userId,
                  roleId:
                    requested.roleId,
                  facilityId:
                    requested.facilityId,
                  transactionId:
                    transaction.transactionId,
                },
              });
            }

            const result =
              await this.userRoleRepository.assign(
                {
                  userId:
                    command.userId,
                  roleId:
                    requested.roleId,
                  facilityId:
                    requested.facilityId,
                  assignedBy:
                    command.actor.userId,
                  expiresAt:
                    requested.expiresAt,
                },
              );

            if (result.created) {
              addedAssignmentKeys.push(
                key,
              );
            } else {
              updatedAssignmentKeys.push(
                key,
              );
            }
          }

          const finalAssignments =
            await this.userRoleRepository
              .findAssignments(
                command.userId,
                {
                  activeOnly: true,
                  includeExpired: true,
                },
              );

          const finalDtos =
            finalAssignments.map(
              toUserRoleDto,
            );

          await transaction.checkpoint(
            IDENTITY_TRANSACTION_CHECKPOINTS
              .USER_ROLES_APPLIED,
            {
              userId: command.userId,
              addedAssignmentKeys,
              updatedAssignmentKeys,
              removedAssignmentKeys,
            },
          );

          const now =
            this.dependencies.clock.now();
          const userDto = toUserDto(user);

          await this.dependencies.audit.append({
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              `${transaction.transactionId}:audit:user-roles-changed`,
            action:
              IDENTITY_AUDIT_ACTIONS
                .USER_ROLES_CHANGED,
            entityType: 'User',
            entityId: command.userId,
            ...buildAuditActorFields(
              command.actor,
            ),
            occurredAt: now,
            before: {
              user: userDto,
              roleAssignments:
                currentAssignments.map(
                  toUserRoleDto,
                ),
            },
            after: {
              user: userDto,
              roleAssignments:
                finalDtos,
            },
            metadata: {
              idempotencyKey:
                command.idempotencyKey,
              reason:
                command.input.reason.trim(),
              addedAssignmentKeys,
              updatedAssignmentKeys,
              removedAssignmentKeys,
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
              `${transaction.transactionId}:outbox:user-roles-changed`,
            eventType:
              IDENTITY_OUTBOX_EVENTS
                .USER_ROLES_CHANGED,
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
              roleAssignments:
                finalDtos,
              addedAssignmentKeys,
              updatedAssignmentKeys,
              removedAssignmentKeys,
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
            roleAssignments: finalDtos,
            addedAssignmentKeys,
            updatedAssignmentKeys,
            removedAssignmentKeys,
          };
        },
      },
    );
  }

  private async registerRestoreCompensation(
    transaction: {
      transactionId: string;
      registerCompensation(input: {
        key: string;
        type: string;
        payload: Record<string, unknown>;
      }): Promise<void>;
    },
    snapshot: UserRoleStateSnapshot,
    assignmentKey: string,
  ): Promise<void> {
    await transaction.registerCompensation({
      key:
        `restore-user-role:${snapshot.userId}:` +
        `${assignmentKey}`,
      type:
        IDENTITY_COMPENSATION_TYPES
          .RESTORE_USER_ROLE,
      payload: {
        snapshot,
        transactionId:
          transaction.transactionId,
      },
    });
  }

  private datesEqual(
    left: Date | null,
    right: Date | null,
  ): boolean {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return (
      left.getTime() === right.getTime()
    );
  }
}