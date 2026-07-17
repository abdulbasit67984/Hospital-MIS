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
  normalizeCreateDepartmentInput,
  requireActorFacilityId,
  throwMappedFacilityPersistenceError,
} from '../facility.workflow-helpers.js';

import {
  DepartmentCodeConflictError,
} from '../facility.errors.js';

import {
  toDepartmentDto,
} from '../facility.mapper.js';

import type {
  CreateDepartmentInput,
  DepartmentDto,
  FacilityActorContext,
} from '../facility.types.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

export interface CreateDepartmentCommand {
  input: CreateDepartmentInput;
  actor: FacilityActorContext;
  idempotencyKey: string;
}

export class CreateDepartmentWorkflow {
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
      CreateDepartmentCommand,
  ): Promise<DepartmentDto> {
    const input =
      normalizeCreateDepartmentInput(
        command.input,
      );

    const transactionFacilityId =
      requireActorFacilityId(
        command.actor,
      );

    await assertFacilityActive(
      this.facilityRepository,
      input.facilityId,
    );

    await assertDepartmentParentChain(
      this.departmentRepository,
      input.facilityId,
      input.parentDepartmentId ??
        null,
    );

    await assertDepartmentManager(
      input.facilityId,
      input.managerStaffId ??
        null,
    );

    await this.assertCodeAvailable(
      input.facilityId,
      input.code,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            FACILITY_TRANSACTION_TYPES
              .CREATE_DEPARTMENT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            transactionFacilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `department:code:${input.facilityId}:${input.code}`,
            `department:parent:${input.facilityId}:${input.parentDepartmentId ?? 'ROOT'}`,
          ],

          payload: {
            input,
          },

          execute:
            async (
              transaction,
            ) => {
              await assertFacilityActive(
                this.facilityRepository,
                input.facilityId,
              );

              await assertDepartmentParentChain(
                this.departmentRepository,
                input.facilityId,
                input.parentDepartmentId ??
                  null,
              );

              await assertDepartmentManager(
                input.facilityId,
                input.managerStaffId ??
                  null,
              );

              await this.assertCodeAvailable(
                input.facilityId,
                input.code,
              );

              const created =
                await this.departmentRepository
                  .create({
                    ...input,

                    createdBy:
                      command.actor.userId,
                  });

              const departmentId =
                created._id.toHexString();

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-department:${departmentId}`,

                  type:
                    FACILITY_COMPENSATION_TYPES
                      .DELETE_CREATED_DEPARTMENT,

                  payload: {
                    departmentId,

                    expectedVersion:
                      created.version,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .DEPARTMENT_CREATED,
                {
                  departmentId,

                  facilityId:
                    input.facilityId,
                },
              );

              const department =
                toDepartmentDto(
                  created,
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
                    `${transaction.transactionId}:audit:department-created`,

                  action:
                    FACILITY_AUDIT_ACTIONS
                      .DEPARTMENT_CREATED,

                  entityType:
                    'Department',

                  entityId:
                    departmentId,

                  ...buildFacilityAuditActorFields(
                    command.actor,
                  ),

                  facilityId:
                    input.facilityId,

                  occurredAt:
                    now,

                  before:
                    null,

                  after:
                    department,

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
                  departmentId,
                },
              );

              await this.dependencies
                .outbox
                .enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:department-created`,

                  eventType:
                    FACILITY_OUTBOX_EVENTS
                      .DEPARTMENT_CREATED,

                  aggregateType:
                    'Department',

                  aggregateId:
                    departmentId,

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    input.facilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    department,
                  },
                });

              await transaction.checkpoint(
                FACILITY_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  departmentId,
                },
              );

              return department;
            },
        });
    } catch (error) {
      throwMappedFacilityPersistenceError(
        error,
        'Department',
        input.code,
      );
    }
  }

  private async assertCodeAvailable(
    facilityId: string,
    code: string,
  ): Promise<void> {
    const existing =
      await this.departmentRepository
        .findByCode(
          facilityId,
          code,
        );

    if (existing !== null) {
      throw new DepartmentCodeConflictError(
        code,
      );
    }
  }
}