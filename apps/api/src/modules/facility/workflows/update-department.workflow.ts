import {
  FACILITY_AUDIT_ACTIONS,
  FACILITY_COMPENSATION_TYPES,
  FACILITY_OUTBOX_EVENTS,
  FACILITY_TRANSACTION_CHECKPOINTS,
  FACILITY_TRANSACTION_TYPES,
} from '../facility.transaction.constants.js';

import {
  buildFacilityAuditActorFields,
  type FacilityMutationDependencies,
} from '../facility.ports.js';

import {
  assertDepartmentManager,
  assertDepartmentParentChain,
  assertFacilityActive,
  departmentChangedFields,
  departmentPreviousSnapshot,
  normalizeUpdateDepartmentInput,
  requireActorFacilityId,
  throwMappedFacilityPersistenceError,
} from '../facility.workflow-helpers.js';

import {
  DepartmentConcurrencyError,
  DepartmentNotFoundError,
} from '../facility.errors.js';

import {
  nullableObjectIdToString,
  toDepartmentDto,
} from '../facility.mapper.js';

import type {
  DepartmentDto,
  FacilityActorContext,
  UpdateDepartmentInput,
} from '../facility.types.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface UpdateDepartmentCommand {
  facilityId: string;
  departmentId: string;
  input: UpdateDepartmentInput;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

export class UpdateDepartmentWorkflow {
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
      UpdateDepartmentCommand,
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

    if (initial === null) {
      throw new DepartmentNotFoundError();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw new DepartmentConcurrencyError();
    }

    const input =
      normalizeUpdateDepartmentInput(
        command.input,
      );

    const parentDepartmentId =
      input.parentDepartmentId ===
      undefined
        ? nullableObjectIdToString(
            initial.parentDepartmentId,
          )
        : input.parentDepartmentId;

    const managerStaffId =
      input.managerStaffId ===
      undefined
        ? nullableObjectIdToString(
            initial.managerStaffId,
          )
        : input.managerStaffId;

    await assertDepartmentParentChain(
      this.departmentRepository,
      command.facilityId,
      parentDepartmentId ??
        null,
      command.departmentId,
    );

    await assertDepartmentManager(
      command.facilityId,
      managerStaffId ??
        null,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            FACILITY_TRANSACTION_TYPES
              .UPDATE_DEPARTMENT,

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
            `department:parent:${command.facilityId}:${parentDepartmentId ?? 'ROOT'}`,
          ],

          payload: {
            facilityId:
              command.facilityId,

            departmentId:
              command.departmentId,

            input,
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

              if (current === null) {
                throw new DepartmentNotFoundError();
              }

              if (
                current.version !==
                input.expectedVersion
              ) {
                throw new DepartmentConcurrencyError();
              }

              const currentParentId =
                input.parentDepartmentId ===
                undefined
                  ? nullableObjectIdToString(
                      current.parentDepartmentId,
                    )
                  : input.parentDepartmentId;

              const currentManagerId =
                input.managerStaffId ===
                undefined
                  ? nullableObjectIdToString(
                      current.managerStaffId,
                    )
                  : input.managerStaffId;

              await assertDepartmentParentChain(
                this.departmentRepository,
                command.facilityId,
                currentParentId ??
                  null,
                command.departmentId,
              );

              await assertDepartmentManager(
                command.facilityId,
                currentManagerId ??
                  null,
              );

              await transaction
                .registerCompensation({
                  key:
                    `restore-department:${command.departmentId}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .RESTORE_DEPARTMENT,

                  payload: {
                    departmentId:
                      command.departmentId,

                    expectedPostVersion:
                      current.version +
                      1,

                    previous:
                      departmentPreviousSnapshot(
                        current,
                      ),

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const updated =
                await this.departmentRepository
                  .updateWithVersion(
                    command.departmentId,
                    command.facilityId,
                    input,
                    command.actor.userId,
                  );

              if (updated === null) {
                throw new DepartmentConcurrencyError();
              }

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .DEPARTMENT_UPDATED,
                {
                  departmentId:
                    command.departmentId,

                  version:
                    updated.version,
                },
              );

              const before =
                toDepartmentDto(
                  current,
                );

              const after =
                toDepartmentDto(
                  updated,
                );

              const changed =
                departmentChangedFields(
                  before,
                  after,
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
                    `${transaction.transactionId}:audit:department-updated`,

                  action:
                    FACILITY_AUDIT_ACTIONS
                      .DEPARTMENT_UPDATED,

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

                  before,

                  after,

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    changedFields:
                      changed,

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
                    `${transaction.transactionId}:outbox:department-updated`,

                  eventType:
                    FACILITY_OUTBOX_EVENTS
                      .DEPARTMENT_UPDATED,

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
                    changedFields:
                      changed,
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
    } catch (error) {
      throwMappedFacilityPersistenceError(
        error,
        'Department',
        initial.code,
      );
    }
  }
}