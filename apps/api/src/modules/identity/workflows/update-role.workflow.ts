import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityNotFoundError,
  IdentityVersionConflictError,
  ProtectedIdentityResourceError,
} from '../identity.errors.js';
import {
  normalizeOptionalText,
  nullableObjectIdToString,
  toRoleDto,
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
  RoleDto,
  UpdateRoleInput,
} from '../identity.types.js';
import type {
  RoleRepository,
} from '../repositories/role.repository.js';

export interface UpdateRoleCommand {
  roleId: string;
  input: UpdateRoleInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export class UpdateRoleWorkflow {
  public constructor(
    private readonly roleRepository: RoleRepository,
    private readonly dependencies:
      IdentityMutationDependencies,
  ) {}

  public async execute(
    command: UpdateRoleCommand,
  ): Promise<RoleDto> {
    const hasMutation =
      command.input.name !== undefined ||
      command.input.description !== undefined ||
      command.input.isActive !== undefined;

    if (!hasMutation) {
      const current =
        await this.roleRepository.findById(
          command.roleId,
        );

      if (!current) {
        throw new IdentityNotFoundError(
          'Role',
          command.roleId,
        );
      }

      if (
        current.version !==
        command.input.expectedVersion
      ) {
        throw new IdentityVersionConflictError(
          'Role',
          command.roleId,
          command.input.expectedVersion,
        );
      }

      return toRoleDto(current);
    }

    return this.dependencies.transactionManager.execute({
      transactionType:
        IDENTITY_ADDITIONAL_TRANSACTION_TYPES.UPDATE_ROLE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId ?? null,
      lockKeys: [
        `identity:role:${command.roleId}`,
      ],
      payload: {
        roleId: command.roleId,
        input: command.input,
      },
      execute: async (transaction) => {
        const current =
          await this.roleRepository.findById(
            command.roleId,
          );

        if (!current) {
          throw new IdentityNotFoundError(
            'Role',
            command.roleId,
          );
        }

        if (
          current.version !==
          command.input.expectedVersion
        ) {
          throw new IdentityVersionConflictError(
            'Role',
            command.roleId,
            command.input.expectedVersion,
          );
        }

        if (
          current.isSystem &&
          command.input.isActive === false
        ) {
          throw new ProtectedIdentityResourceError(
            'role',
            command.roleId,
            'deactivated',
          );
        }

        const normalizedInput: UpdateRoleInput = {
          ...command.input,
          name:
            command.input.name !== undefined
              ? command.input.name.trim()
              : undefined,
          description:
            command.input.description !== undefined
              ? normalizeOptionalText(
                  command.input.description,
                )
              : undefined,
        };

        /*
         * Register before the mutation. The compensation handler should only
         * restore the snapshot when the role is at expectedPostVersion.
         */
        await transaction.registerCompensation({
          key: `restore-role:${command.roleId}`,
          type:
            IDENTITY_COMPENSATION_TYPES.RESTORE_ROLE,
          payload: {
            roleId: command.roleId,
            expectedPostVersion:
              current.version + 1,
            previous: {
              name: current.name,
              description:
                current.description ?? null,
              isActive: current.isActive,
              version: current.version,
              updatedBy: nullableObjectIdToString(
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
          await this.roleRepository.updateWithVersion(
            command.roleId,
            normalizedInput,
            command.actor.userId,
          );

        if (!updated) {
          throw new IdentityVersionConflictError(
            'Role',
            command.roleId,
            command.input.expectedVersion,
          );
        }

        await transaction.checkpoint(
          IDENTITY_TRANSACTION_CHECKPOINTS
            .ROLE_UPDATED,
          {
            roleId: command.roleId,
            version: updated.version,
          },
        );

        const now = this.dependencies.clock.now();
        const beforeDto = toRoleDto(current);
        const afterDto = toRoleDto(updated);

        const statusChanged =
          current.isActive !== updated.isActive;

        await this.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey:
            `${transaction.transactionId}:audit:role-updated`,
          action: statusChanged
            ? IDENTITY_AUDIT_ACTIONS.ROLE_STATUS_CHANGED
            : IDENTITY_AUDIT_ACTIONS.ROLE_UPDATED,
          entityType: 'Role',
          entityId: command.roleId,
          ...buildAuditActorFields(command.actor),
          occurredAt: now,
          before: beforeDto,
          after: afterDto,
          metadata: {
            idempotencyKey: command.idempotencyKey,
            changedFields: this.getChangedFields(
              beforeDto,
              afterDto,
            ),
          },
        });

        await transaction.checkpoint(
          IDENTITY_TRANSACTION_CHECKPOINTS
            .AUDIT_APPENDED,
          {
            roleId: command.roleId,
          },
        );

        await this.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey:
            `${transaction.transactionId}:outbox:role-updated`,
          eventType:
            IDENTITY_OUTBOX_EVENTS.ROLE_UPDATED,
          aggregateType: 'Role',
          aggregateId: command.roleId,
          actorUserId: command.actor.userId,
          facilityId:
            updated.facilityId?.toHexString() ??
            command.actor.facilityId ??
            null,
          correlationId:
            command.actor.correlationId,
          occurredAt: now,
          payload: {
            before: beforeDto,
            after: afterDto,
            changedFields: this.getChangedFields(
              beforeDto,
              afterDto,
            ),
          },
        });

        await transaction.checkpoint(
          IDENTITY_TRANSACTION_CHECKPOINTS
            .OUTBOX_ENQUEUED,
          {
            roleId: command.roleId,
          },
        );

        return afterDto;
      },
    });
  }

  private getChangedFields(
    before: RoleDto,
    after: RoleDto,
  ): string[] {
    const mutableFields: Array<keyof RoleDto> = [
      'name',
      'description',
      'isActive',
      'version',
    ];

    return mutableFields.filter(
      (field) => before[field] !== after[field],
    );
  }
}