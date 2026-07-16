import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
  IDENTITY_TRANSACTION_TYPES,
  ROLE_SCOPE,
} from '../identity.constants.js';
import {
  IdentityConflictError,
  IdentityValidationError,
} from '../identity.errors.js';
import {
  normalizeOptionalText,
  normalizeRoleCode,
  toNullableObjectId,
  toObjectId,
  toRoleDto,
} from '../identity.mapper.js';
import {
  throwMappedIdentityPersistenceError,
} from '../identity.persistence-errors.js';
import type {
  IdentityMutationDependencies,
} from '../identity.ports.js';
import {
  buildAuditActorFields,
} from '../identity.ports.js';
import {
  IDENTITY_COMPENSATION_TYPES,
  IDENTITY_TRANSACTION_CHECKPOINTS,
} from '../identity.transaction.constants.js';
import type {
  CreateRoleInput,
  IdentityActorContext,
  RoleDto,
} from '../identity.types.js';
import type {
  PermissionRepository,
} from '../repositories/permission.repository.js';
import type {
  RolePermissionRepository,
} from '../repositories/role-permission.repository.js';
import type {
  RoleRepository,
} from '../repositories/role.repository.js';

export interface CreateRoleCommand {
  input: CreateRoleInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface CreateRoleResult {
  role: RoleDto;
  permissionIds: string[];
}

export class CreateRoleWorkflow {
  public constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly rolePermissionRepository:
      RolePermissionRepository,
    private readonly dependencies:
      IdentityMutationDependencies,
  ) {}

  public async execute(
    command: CreateRoleCommand,
  ): Promise<CreateRoleResult> {
    const input = this.normalizeInput(command.input);
    const permissionIds = [
      ...new Set(input.permissionIds ?? []),
    ];

    await this.assertScopeIsValid(input);
    await this.assertCodeIsAvailable(input);
    await this.assertPermissionsAreActive(
      permissionIds,
    );

    const facilityLockSegment =
      input.facilityId ?? 'GLOBAL';

    try {
      return await this.dependencies.transactionManager.execute(
        {
          transactionType:
            IDENTITY_TRANSACTION_TYPES.CREATE_ROLE,
          idempotencyKey: command.idempotencyKey,
          actorUserId: command.actor.userId,
          facilityId:
            input.facilityId ??
            command.actor.facilityId ??
            null,
          lockKeys: [
            `identity:role-code:${input.scope}:${facilityLockSegment}:${input.code}`,
          ],
          payload: {
            input: {
              ...input,
              permissionIds,
            },
          },
          execute: async (transaction) => {
            /*
             * Repeat uniqueness validation after acquiring the lease. This
             * provides a friendly error while the unique index remains the
             * final consistency boundary.
             */
            await this.assertCodeIsAvailable(input);

            const now = this.dependencies.clock.now();

            const role = await this.roleRepository.create({
              facilityId: toNullableObjectId(
                input.facilityId,
                'facilityId',
              ),
              code: input.code,
              name: input.name,
              description: input.description,
              scope: input.scope,
              isSystem: false,
              isActive: true,
              createdBy: toObjectId(
                command.actor.userId,
                'actor.userId',
              ),
            });

            const roleId = role._id.toHexString();

            await transaction.registerCompensation({
              key: `delete-created-role:${roleId}`,
              type:
                IDENTITY_COMPENSATION_TYPES.DELETE_CREATED_ROLE,
              payload: {
                roleId,
                expectedVersion: role.version,
                transactionId: transaction.transactionId,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS.ROLE_CREATED,
              {
                roleId,
              },
            );

            for (const permissionId of permissionIds) {
              /*
               * Register before mutation. The corresponding compensation
               * handler must be idempotent when the assignment was never
               * created.
               */
              await transaction.registerCompensation({
                key: `delete-role-permission:${roleId}:${permissionId}`,
                type:
                  IDENTITY_COMPENSATION_TYPES
                    .DELETE_CREATED_ROLE_PERMISSION,
                payload: {
                  roleId,
                  permissionId,
                  transactionId:
                    transaction.transactionId,
                },
              });

              await this.rolePermissionRepository.grant({
                roleId,
                permissionId,
                grantedBy: command.actor.userId,
              });
            }

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .PERMISSIONS_APPLIED,
              {
                roleId,
                permissionIds,
              },
            );

            const roleDto = toRoleDto(role);

            await this.dependencies.audit.append({
              transactionId: transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:audit:role-created`,
              action:
                IDENTITY_AUDIT_ACTIONS.ROLE_CREATED,
              entityType: 'Role',
              entityId: roleId,
              ...buildAuditActorFields(command.actor),
              occurredAt: now,
              before: null,
              after: {
                ...roleDto,
                permissionIds,
              },
              metadata: {
                idempotencyKey:
                  command.idempotencyKey,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                roleId,
              },
            );

            await this.dependencies.outbox.enqueue({
              transactionId: transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:outbox:role-created`,
              eventType:
                IDENTITY_OUTBOX_EVENTS.ROLE_CREATED,
              aggregateType: 'Role',
              aggregateId: roleId,
              actorUserId: command.actor.userId,
              facilityId:
                input.facilityId ??
                command.actor.facilityId ??
                null,
              correlationId:
                command.actor.correlationId,
              occurredAt: now,
              payload: {
                role: roleDto,
                permissionIds,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                roleId,
              },
            );

            return {
              role: roleDto,
              permissionIds,
            };
          },
        },
      );
    } catch (error) {
      throwMappedIdentityPersistenceError(error, {
        entityName: 'Role',
        fallbackMessage:
          'A role with the same code already exists in this scope',
        fallbackCode:
          'IDENTITY_ROLE_CODE_ALREADY_EXISTS',
      });
    }
  }

  private normalizeInput(
    input: CreateRoleInput,
  ): CreateRoleInput {
    return {
      ...input,
      facilityId: input.facilityId ?? null,
      code: normalizeRoleCode(input.code),
      name: input.name.trim(),
      description: normalizeOptionalText(
        input.description,
      ),
      permissionIds: [
        ...new Set(input.permissionIds ?? []),
      ],
    };
  }

  private async assertScopeIsValid(
    input: CreateRoleInput,
  ): Promise<void> {
    if (
      input.scope === ROLE_SCOPE.GLOBAL &&
      input.facilityId
    ) {
      throw new IdentityValidationError(
        'A global role cannot be attached to a facility',
        {
          scope: input.scope,
          facilityId: input.facilityId,
        },
      );
    }

    if (
      input.scope === ROLE_SCOPE.FACILITY &&
      !input.facilityId
    ) {
      throw new IdentityValidationError(
        'A facility-scoped role requires a facilityId',
        {
          scope: input.scope,
        },
      );
    }
  }

  private async assertCodeIsAvailable(
    input: CreateRoleInput,
  ): Promise<void> {
    const existing = await this.roleRepository.findByCode({
      code: input.code,
      scope: input.scope,
      facilityId: input.facilityId,
    });

    if (existing) {
      throw new IdentityConflictError(
        'A role with the same code already exists in this scope',
        'IDENTITY_ROLE_CODE_ALREADY_EXISTS',
        {
          existingRoleId:
            existing._id.toHexString(),
          code: input.code,
          scope: input.scope,
          facilityId: input.facilityId ?? null,
        },
      );
    }
  }

  private async assertPermissionsAreActive(
    permissionIds: string[],
  ): Promise<void> {
    if (permissionIds.length === 0) {
      return;
    }

    const permissions =
      await this.permissionRepository.findByIds(
        permissionIds,
        {
          activeOnly: true,
        },
      );

    const existingIds = new Set(
      permissions.map((permission) =>
        permission._id.toHexString(),
      ),
    );

    const missingPermissionIds =
      permissionIds.filter(
        (permissionId) =>
          !existingIds.has(permissionId),
      );

    if (missingPermissionIds.length > 0) {
      throw new IdentityValidationError(
        'One or more permissions do not exist or are inactive',
        {
          missingPermissionIds,
        },
      );
    }
  }
}