import {
    IDENTITY_AUDIT_ACTIONS,
    IDENTITY_OUTBOX_EVENTS,
    IDENTITY_TRANSACTION_TYPES,
} from '../identity.constants.js';
import {
    IdentityNotFoundError,
    IdentityValidationError,
    IdentityVersionConflictError,
} from '../identity.errors.js';
import {
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
    IDENTITY_COMPENSATION_TYPES,
    IDENTITY_TRANSACTION_CHECKPOINTS,
} from '../identity.transaction.constants.js';
import type {
    IdentityActorContext,
    ReplaceRolePermissionsInput,
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

export interface ReplaceRolePermissionsCommand {
    roleId: string;
    input: ReplaceRolePermissionsInput;
    actor: IdentityActorContext;
    idempotencyKey: string;
}

export interface ReplaceRolePermissionsResult {
    role: RoleDto;
    permissionIds: string[];
    addedPermissionIds: string[];
    removedPermissionIds: string[];
}

export class ReplaceRolePermissionsWorkflow {
    public constructor(
        private readonly roleRepository: RoleRepository,
        private readonly permissionRepository: PermissionRepository,
        private readonly rolePermissionRepository:
            RolePermissionRepository,
        private readonly dependencies:
            IdentityMutationDependencies,
    ) { }

    public async execute(
        command: ReplaceRolePermissionsCommand,
    ): Promise<ReplaceRolePermissionsResult> {
        const requestedPermissionIds = [
            ...new Set(command.input.permissionIds),
        ].sort();

        return this.dependencies.transactionManager.execute({
            transactionType:
                IDENTITY_TRANSACTION_TYPES
                    .UPDATE_ROLE_PERMISSIONS,
            idempotencyKey: command.idempotencyKey,
            actorUserId: command.actor.userId,
            facilityId: command.actor.facilityId ?? null,
            lockKeys: [
                `identity:role:${command.roleId}`,
                `identity:role-permissions:${command.roleId}`,
            ],
            payload: {
                roleId: command.roleId,
                expectedRoleVersion:
                    command.input.expectedRoleVersion,
                permissionIds: requestedPermissionIds,
            },
            execute: async (transaction) => {
                const role =
                    await this.roleRepository.findById(
                        command.roleId,
                    );

                if (!role) {
                    throw new IdentityNotFoundError(
                        'Role',
                        command.roleId,
                    );
                }

                if (
                    role.version !==
                    command.input.expectedRoleVersion
                ) {
                    throw new IdentityVersionConflictError(
                        'Role',
                        command.roleId,
                        command.input.expectedRoleVersion,
                    );
                }

                await this.assertPermissionsAreActive(
                    requestedPermissionIds,
                );

                const currentPermissionIds = (
                    await this.rolePermissionRepository.findPermissionIds(
                        command.roleId,
                    )
                ).sort();

                const currentSet = new Set(
                    currentPermissionIds,
                );
                const requestedSet = new Set(
                    requestedPermissionIds,
                );

                const addedPermissionIds =
                    requestedPermissionIds.filter(
                        (permissionId) =>
                            !currentSet.has(permissionId),
                    );

                const removedPermissionIds =
                    currentPermissionIds.filter(
                        (permissionId) =>
                            !requestedSet.has(permissionId),
                    );

                if (
                    addedPermissionIds.length === 0 &&
                    removedPermissionIds.length === 0
                ) {
                    return {
                        role: toRoleDto(role),
                        permissionIds: currentPermissionIds,
                        addedPermissionIds: [],
                        removedPermissionIds: [],
                    };
                }

                const currentAssignments =
                    await this.rolePermissionRepository.findAssignments(
                        command.roleId,
                    );

                const assignmentByPermissionId = new Map(
                    currentAssignments.map((assignment) => [
                        assignment.permissionId.toHexString(),
                        assignment,
                    ]),
                );

                for (const permissionId of removedPermissionIds) {
                    const assignment =
                        assignmentByPermissionId.get(permissionId);

                    if (!assignment) {
                        continue;
                    }

                    await transaction.registerCompensation({
                        key: `restore-role-permission:${command.roleId}:${permissionId}`,
                        type:
                            IDENTITY_COMPENSATION_TYPES
                                .RESTORE_ROLE_PERMISSION,
                        payload: {
                            roleId: command.roleId,
                            permissionId,
                            grantedBy:
                                assignment.grantedBy.toHexString(),
                            grantedAt:
                                assignment.grantedAt.toISOString(),
                            transactionId:
                                transaction.transactionId,
                        },
                    });

                    await this.rolePermissionRepository.revoke({
                        roleId: command.roleId,
                        permissionId,
                    });
                }

                for (const permissionId of addedPermissionIds) {
                    await transaction.registerCompensation({
                        key: `delete-role-permission:${command.roleId}:${permissionId}`,
                        type:
                            IDENTITY_COMPENSATION_TYPES
                                .DELETE_CREATED_ROLE_PERMISSION,
                        payload: {
                            roleId: command.roleId,
                            permissionId,
                            transactionId:
                                transaction.transactionId,
                        },
                    });

                    await this.rolePermissionRepository.grant({
                        roleId: command.roleId,
                        permissionId,
                        grantedBy: command.actor.userId,
                    });
                }

                await transaction.registerCompensation({
                    key: `restore-role-version:${command.roleId}`,
                    type:
                        IDENTITY_COMPENSATION_TYPES.RESTORE_ROLE,
                    payload: {
                        roleId: command.roleId,
                        expectedPostVersion: role.version + 1,
                        previous: {
                            name: role.name,
                            description: role.description ?? null,
                            isActive: role.isActive,
                            version: role.version,
                            updatedBy: nullableObjectIdToString(
                                role.updatedBy,
                            ),
                            updatedAt: role.updatedAt.toISOString(),
                        },
                        transactionId:
                            transaction.transactionId,
                    },
                });

                const updatedRole =
                    await this.roleRepository.incrementVersion(
                        command.roleId,
                        command.input.expectedRoleVersion,
                        command.actor.userId,
                    );

                if (!updatedRole) {
                    throw new IdentityVersionConflictError(
                        'Role',
                        command.roleId,
                        command.input.expectedRoleVersion,
                    );
                }

                await transaction.checkpoint(
                    IDENTITY_TRANSACTION_CHECKPOINTS
                        .PERMISSIONS_APPLIED,
                    {
                        roleId: command.roleId,
                        version: updatedRole.version,
                        addedPermissionIds,
                        removedPermissionIds,
                    },
                );

                const now = this.dependencies.clock.now();
                const roleDto = toRoleDto(updatedRole);

                await this.dependencies.audit.append({
                    transactionId: transaction.transactionId,
                    deduplicationKey:
                        `${transaction.transactionId}:audit:role-permissions-changed`,
                    action:
                        IDENTITY_AUDIT_ACTIONS
                            .ROLE_PERMISSIONS_CHANGED,
                    entityType: 'Role',
                    entityId: command.roleId,
                    ...buildAuditActorFields(command.actor),
                    occurredAt: now,
                    before: {
                        role: toRoleDto(role),
                        permissionIds: currentPermissionIds,
                    },
                    after: {
                        role: roleDto,
                        permissionIds:
                            requestedPermissionIds,
                    },
                    metadata: {
                        idempotencyKey: command.idempotencyKey,
                        addedPermissionIds,
                        removedPermissionIds,
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
                        `${transaction.transactionId}:outbox:role-permissions-changed`,
                    eventType:
                        IDENTITY_OUTBOX_EVENTS
                            .ROLE_PERMISSIONS_CHANGED,
                    aggregateType: 'Role',
                    aggregateId: command.roleId,
                    actorUserId: command.actor.userId,
                    facilityId:
                        updatedRole.facilityId?.toHexString() ??
                        command.actor.facilityId ??
                        null,
                    correlationId:
                        command.actor.correlationId,
                    occurredAt: now,
                    payload: {
                        role: roleDto,
                        permissionIds:
                            requestedPermissionIds,
                        addedPermissionIds,
                        removedPermissionIds,
                    },
                });

                await transaction.checkpoint(
                    IDENTITY_TRANSACTION_CHECKPOINTS
                        .OUTBOX_ENQUEUED,
                    {
                        roleId: command.roleId,
                    },
                );

                return {
                    role: roleDto,
                    permissionIds:
                        requestedPermissionIds,
                    addedPermissionIds,
                    removedPermissionIds,
                };
            },
        });
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