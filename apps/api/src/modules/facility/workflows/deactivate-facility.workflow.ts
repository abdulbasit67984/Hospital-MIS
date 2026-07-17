import {
  DEPARTMENT_STATUS,
  FACILITY_STATUS,
} from '../facility.constants.js';

import {
  FacilityConcurrencyError,
  FacilityNotFoundError,
  InvalidFacilityHierarchyError,
} from '../facility.errors.js';

import {
  nullableObjectIdToString,
  toFacilityDto,
} from '../facility.mapper.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
} from '../facility.ports.js';

import {
  FACILITY_AUDIT_ACTIONS,
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
  FACILITY_TRANSACTION_CHECKPOINTS,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import type {
  FacilityActorContext,
  FacilityDto,
} from '../facility.types.js';

import {
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface FacilitySessionRevocationResult {
  sessionsRevoked: number;
  refreshTokensRevoked: number;
}

export interface FacilitySessionRevocationPort {
  revokeFacilitySessions(
    input: Readonly<{
      facilityId: string;
      revokedBy: string;
      reason: string;
      revokedAt: Date;
    }>,
  ): Promise<FacilitySessionRevocationResult>;
}

export interface DeactivateFacilityCommand {
  facilityId: string;
  expectedVersion: number;
  reason: string;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

function lifecycleSnapshot(
  facility:
    Awaited<
      ReturnType<
        FacilityRepository['findById']
      >
    > extends infer T
      ? Exclude<T, null>
      : never,
): Record<string, unknown> {
  return {
    status:
      facility.status,

    allowsAuthentication:
      facility.allowsAuthentication,

    deactivatedAt:
      facility.deactivatedAt
        ?.toISOString() ??
      null,

    deactivatedBy:
      nullableObjectIdToString(
        facility.deactivatedBy,
      ),

    deactivationReason:
      facility.deactivationReason,

    version:
      facility.version,

    updatedBy:
      nullableObjectIdToString(
        facility.updatedBy,
      ),

    updatedAt:
      facility.updatedAt
        .toISOString(),
  };
}

export class DeactivateFacilityWorkflow {
  public constructor(
    private readonly facilityRepository:
      FacilityRepository,

    private readonly departmentRepository:
      DepartmentRepository,

    private readonly sessions:
      FacilitySessionRevocationPort,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      DeactivateFacilityCommand,
  ): Promise<FacilityDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    const initial =
      await this.facilityRepository
        .findById(
          command.facilityId,
        );

    if (
      initial === null
    ) {
      throw new FacilityNotFoundError();
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new FacilityConcurrencyError();
    }

    if (
      initial.status ===
      FACILITY_STATUS.INACTIVE
    ) {
      return toFacilityDto(
        initial,
      );
    }

    await this.assertNoActiveDependants(
      command.facilityId,
    );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          FACILITY_TRANSACTION_TYPES
            .DEACTIVATE_FACILITY,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          transactionFacilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `facility:id:${command.facilityId}`,
          `facility:sessions:${command.facilityId}`,
          `facility:departments:${command.facilityId}`,
        ],

        payload: {
          facilityId:
            command.facilityId,

          expectedVersion:
            command.expectedVersion,

          reason:
            command.reason,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.facilityRepository
                .findById(
                  command.facilityId,
                );

            if (
              current === null
            ) {
              throw new FacilityNotFoundError();
            }

            if (
              current.version !==
              command.expectedVersion
            ) {
              throw new FacilityConcurrencyError();
            }

            if (
              current.status ===
              FACILITY_STATUS.INACTIVE
            ) {
              return toFacilityDto(
                current,
              );
            }

            await this.assertNoActiveDependants(
              command.facilityId,
            );

            await transaction
              .registerCompensation({
                key:
                  `restore-facility-lifecycle:${command.facilityId}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .RESTORE_FACILITY_LIFECYCLE,

                payload: {
                  facilityId:
                    command.facilityId,

                  expectedPostVersion:
                    current.version +
                    1,

                  previous:
                    lifecycleSnapshot(
                      current,
                    ),
                },
              });

            const changedAt =
              this.dependencies
                .clock
                .now();

            const updated =
              await this.facilityRepository
                .changeStatus({
                  facilityId:
                    command.facilityId,

                  expectedVersion:
                    current.version,

                  status:
                    FACILITY_STATUS.INACTIVE,

                  actorUserId:
                    command.actor.userId,

                  reason:
                    command.reason,

                  changedAt,
                });

            if (
              updated === null
            ) {
              throw new FacilityConcurrencyError();
            }

            const before =
              toFacilityDto(
                current,
              );

            const after =
              toFacilityDto(
                updated,
              );

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .FACILITY_DEACTIVATED,
              {
                facilityId:
                  command.facilityId,

                version:
                  updated.version,
              },
            );

            const now =
              this.dependencies
                .clock
                .now();

            await this.dependencies
              .audit
              .append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:facility-deactivated`,

                action:
                  FACILITY_AUDIT_ACTIONS
                    .FACILITY_DEACTIVATED,

                entityType:
                  'Facility',

                entityId:
                  command.facilityId,

                ...buildFacilityAuditActorFields(
                  command.actor,
                ),

                facilityId:
                  command.facilityId,

                occurredAt:
                  now,

                reason:
                  command.reason,

                before,

                after,

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  transactionFacilityId,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                facilityId:
                  command.facilityId,
              },
            );

            await this.dependencies
              .outbox
              .enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:facility-deactivated`,

                eventType:
                  FACILITY_OUTBOX_EVENTS
                    .FACILITY_DEACTIVATED,

                aggregateType:
                  'Facility',

                aggregateId:
                  command.facilityId,

                actorUserId:
                  command.actor.userId,

                facilityId:
                  command.facilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  now,

                payload: {
                  before,
                  after,
                  reason:
                    command.reason,
                },
              });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                facilityId:
                  command.facilityId,
              },
            );

            /*
             * Session revocation is deliberately the final domain step.
             * Revocation is idempotent and security-safe, but cannot be
             * compensated by recreating authentication secrets.
             */
            const revocation =
              await this.sessions
                .revokeFacilitySessions({
                  facilityId:
                    command.facilityId,

                  revokedBy:
                    command.actor.userId,

                  reason:
                    `Facility deactivated: ${command.reason}`,

                  revokedAt:
                    now,
                });

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .FACILITY_SESSIONS_REVOKED,
              {
                facilityId:
                  command.facilityId,

                ...revocation,
              },
            );

            return after;
          },
      });
  }

  private async assertNoActiveDependants(
    facilityId: string,
  ): Promise<void> {
    const [
      activeChildren,
      activeDepartments,
    ] = await Promise.all([
      this.facilityRepository
        .countActiveChildren(
          facilityId,
        ),

      this.departmentRepository
        .list({
          facilityId,

          status:
            DEPARTMENT_STATUS.ACTIVE,

          page:
            1,

          pageSize:
            1,

          sortBy:
            'name',

          sortDirection:
            'asc',
        }),
    ]);

    if (
      activeChildren > 0
    ) {
      throw new InvalidFacilityHierarchyError(
        'Deactivate all active child facilities before deactivating this facility',
      );
    }

    if (
      activeDepartments.totalItems >
      0
    ) {
      throw new InvalidFacilityHierarchyError(
        'Deactivate all active departments before deactivating this facility',
      );
    }
  }
}