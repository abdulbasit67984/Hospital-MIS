import {
  DEPARTMENT_STATUS,
} from '../facility.constants.js';

import {
  DepartmentConcurrencyError,
  DepartmentNotFoundError,
} from '../facility.errors.js';

import {
  nullableObjectIdToString,
  toDepartmentDto,
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
  DepartmentDto,
  FacilityActorContext,
} from '../facility.types.js';

import {
  assertDepartmentParentChain,
  assertFacilityActive,
  requireActorFacilityId,
} from '../facility.workflow-helpers.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface ActivateDepartmentCommand {
  facilityId: string;
  departmentId: string;
  expectedVersion: number;
  reason: string;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

function lifecycleSnapshot(
  department:
    Awaited<
      ReturnType<
        DepartmentRepository[
          'findByIdInFacility'
        ]
      >
    > extends infer T
      ? Exclude<T, null>
      : never,
): Record<string, unknown> {
  return {
    status:
      department.status,

    deactivatedAt:
      department.deactivatedAt
        ?.toISOString() ??
      null,

    deactivatedBy:
      nullableObjectIdToString(
        department.deactivatedBy,
      ),

    deactivationReason:
      department.deactivationReason,

    version:
      department.version,

    updatedBy:
      nullableObjectIdToString(
        department.updatedBy,
      ),

    updatedAt:
      department.updatedAt
        .toISOString(),
  };
}

export class ActivateDepartmentWorkflow {
  public constructor(
    private readonly departmentRepository:
      DepartmentRepository,

    private readonly facilityRepository:
      FacilityRepository,

    private readonly dependencies:
      FacilityMutationDependencies,
  ) {}

  public async execute(
    command:
      ActivateDepartmentCommand,
  ): Promise<DepartmentDto> {
    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    await assertFacilityActive(
      this.facilityRepository,
      command.facilityId,
    );

    const initial =
      await this.departmentRepository
        .findByIdInFacility(
          command.departmentId,
          command.facilityId,
        );

    if (
      initial === null
    ) {
      throw new DepartmentNotFoundError();
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new DepartmentConcurrencyError();
    }

    if (
      initial.status ===
      DEPARTMENT_STATUS.ACTIVE
    ) {
      return toDepartmentDto(
        initial,
      );
    }

    await assertDepartmentParentChain(
      this.departmentRepository,
      command.facilityId,
      nullableObjectIdToString(
        initial.parentDepartmentId,
      ),
      command.departmentId,
    );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          FACILITY_TRANSACTION_TYPES
            .ACTIVATE_DEPARTMENT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          transactionFacilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `department:id:${command.departmentId}`,
          `department:parent:${command.facilityId}:${nullableObjectIdToString(
            initial.parentDepartmentId,
          ) ?? 'ROOT'}`,
        ],

        payload: {
          facilityId:
            command.facilityId,

          departmentId:
            command.departmentId,

          expectedVersion:
            command.expectedVersion,

          reason:
            command.reason,
        },

        execute:
          async (
            transaction,
          ) => {
            await assertFacilityActive(
              this.facilityRepository,
              command.facilityId,
            );

            const current =
              await this.departmentRepository
                .findByIdInFacility(
                  command.departmentId,
                  command.facilityId,
                );

            if (
              current === null
            ) {
              throw new DepartmentNotFoundError();
            }

            if (
              current.version !==
              command.expectedVersion
            ) {
              throw new DepartmentConcurrencyError();
            }

            if (
              current.status ===
              DEPARTMENT_STATUS.ACTIVE
            ) {
              return toDepartmentDto(
                current,
              );
            }

            await assertDepartmentParentChain(
              this.departmentRepository,
              command.facilityId,
              nullableObjectIdToString(
                current.parentDepartmentId,
              ),
              command.departmentId,
            );

            await transaction
              .registerCompensation({
                key:
                  `restore-department-lifecycle:${command.departmentId}`,

                type:
                  FACILITY_COMPENSATION_TYPES
                    .RESTORE_DEPARTMENT_LIFECYCLE,

                payload: {
                  departmentId:
                    command.departmentId,

                  expectedPostVersion:
                    current.version +
                    1,

                  previous:
                    lifecycleSnapshot(
                      current,
                    ),
                },
              });

            const updated =
              await this.departmentRepository
                .changeStatus({
                  departmentId:
                    command.departmentId,

                  facilityId:
                    command.facilityId,

                  expectedVersion:
                    current.version,

                  status:
                    DEPARTMENT_STATUS.ACTIVE,

                  actorUserId:
                    command.actor.userId,

                  reason:
                    command.reason,

                  changedAt:
                    this.dependencies
                      .clock
                      .now(),
                });

            if (
              updated === null
            ) {
              throw new DepartmentConcurrencyError();
            }

            const before =
              toDepartmentDto(
                current,
              );

            const after =
              toDepartmentDto(
                updated,
              );

            await transaction.checkpoint(
              FACILITY_TRANSACTION_CHECKPOINTS
                .DEPARTMENT_ACTIVATED,
              {
                departmentId:
                  command.departmentId,

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
                  `${transaction.transactionId}:audit:department-activated`,

                action:
                  FACILITY_AUDIT_ACTIONS
                    .DEPARTMENT_ACTIVATED,

                entityType:
                  'Department',

                entityId:
                  command.departmentId,

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
                departmentId:
                  command.departmentId,
              },
            );

            await this.dependencies
              .outbox
              .enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:department-activated`,

                eventType:
                  FACILITY_OUTBOX_EVENTS
                    .DEPARTMENT_ACTIVATED,

                aggregateType:
                  'Department',

                aggregateId:
                  command.departmentId,

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
                departmentId:
                  command.departmentId,
              },
            );

            return after;
          },
      });
  }
}