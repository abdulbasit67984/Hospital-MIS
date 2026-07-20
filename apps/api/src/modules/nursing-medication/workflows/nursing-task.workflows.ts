import {
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CarryForwardNursingTaskInput,
  ChangeNursingTaskStatusInput,
  CreateNursingTaskInput,
  NursingMedicationCommand,
  NursingMedicationEntityCommand,
} from '../nursing-medication.contracts.js';

import {
  NursingClinicalContextMismatchError,
  NursingTaskConcurrencyError,
} from '../nursing-medication.errors.js';

import {
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
  assertNursingTaskTransition,
} from '../nursing-medication.lifecycle.js';

import {
  deleteCreatedNursingRecordCompensation,
  nursingTaskRestoreSnapshot,
  protectNursingRestorePayload,
  restoreNursingRecordCompensation,
} from '../nursing-medication.mutation-snapshots.js';

import {
  projectNursingTaskSummary,
  type NursingTaskSummaryView,
} from '../nursing-medication.projections.js';

import {
  NURSING_MEDICATION_AUDIT_ACTIONS,
  NURSING_MEDICATION_OUTBOX_EVENTS,
  NURSING_MEDICATION_REALTIME_EVENTS,
  NURSING_MEDICATION_TRANSACTION_STATES,
  NURSING_MEDICATION_TRANSACTION_TYPES,
} from '../nursing-medication.transaction.constants.js';

import {
  carryForwardNursingTaskBodySchema,
  changeNursingTaskStatusBodySchema,
  createNursingTaskBodySchema,
} from '../nursing-medication.validation.js';

import {
  nursingTaskCreateLockKeys,
  nursingTaskMutationLockKeys,
  safeTaskJournalPayload,
  taskEventPayload,
} from '../nursing-medication.workflow-helpers.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

async function assertTaskSourceContext(
  support: NursingMedicationCommandService,
  actor: NursingMedicationCommand<CreateNursingTaskInput>['actor'],
  admissionId: string,
  carePlanId: string | null | undefined,
): Promise<void> {
  if (
    carePlanId == null
  ) {
    return;
  }

  const carePlan =
    await support.requireCarePlan(
      actor,
      carePlanId,
    );

  if (
    carePlan.admissionId.toHexString() !==
    admissionId
  ) {
    throw new NursingClinicalContextMismatchError(
      'The nursing task care plan belongs to another admission',
    );
  }
}

export class CreateNursingTaskWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationCommand<CreateNursingTaskInput>,
  ): Promise<NursingTaskSummaryView> {
    const input =
      createNursingTaskBodySchema.parse(
        command.input,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await assertTaskSourceContext(
      this.support,
      command.actor,
      input.admissionId,
      input.carePlanId,
    );

    await this.support.assertAccess(
      'TASK_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CREATE_TASK,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingTaskCreateLockKeys(
          context,
          input.recurrenceKey,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        input,
      },
      journalPayload:
        safeTaskJournalPayload(
          'CREATE_TASK',
          {
            context,
            sourceType:
              input.sourceType,
            targetStatus:
              'PENDING',
          },
        ),
      execute:
        async (
          transaction,
        ) =>
          this.executeTransaction(
            command,
            input,
            transaction,
          ),
    });
  }

  private async executeTransaction(
    command: NursingMedicationCommand<CreateNursingTaskInput>,
    input: ReturnType<
      typeof createNursingTaskBodySchema.parse
    >,
    transaction: NursingMedicationTransactionContext,
  ): Promise<NursingTaskSummaryView> {
    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await assertTaskSourceContext(
      this.support,
      command.actor,
      input.admissionId,
      input.carePlanId,
    );

    const access =
      await this.support.assertAccess(
        'TASK_MANAGE',
        command.actor,
        context,
      );

    assertNursingDocumentationAllowed(
      context,
      'NEW_ENTRY',
    );

    const occurredAt =
      this.support.dependencies.clock.now();

    const dueAt =
      new Date(
        input.dueAt,
      );

    if (
      dueAt.getTime() <
      occurredAt.getTime() -
        24 * 60 * 60 * 1_000
    ) {
      throw new NursingClinicalContextMismatchError(
        'A new nursing task cannot be created more than 24 hours overdue',
      );
    }

    const allocation =
      await this.support.allocateNumber(
        context.facilityId,
        NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE.TASK,
        'NTK',
        occurredAt,
      );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.NUMBER_ALLOCATED,
      {
        sequenceKey:
          allocation.sequenceKey,
        sequenceValue:
          allocation.sequenceValue,
      },
    );

    const actorUserId =
      this.support.objectId(
        command.actor.userId,
        'actorUserId',
      );

    const created =
      await this.support.care.createTask({
        facilityId:
          this.support.objectId(
            context.facilityId,
            'facilityId',
          ),
        admissionId:
          this.support.objectId(
            context.admissionId,
            'admissionId',
          ),
        patientId:
          this.support.objectId(
            context.patient.patientId,
            'patientId',
          ),
        encounterId:
          this.support.objectId(
            context.encounterId,
            'encounterId',
          ),
        wardId:
          this.support.objectId(
            context.location.wardId,
            'wardId',
          ),
        roomId:
          context.location.roomId ===
          null
            ? null
            : this.support.objectId(
                context.location.roomId,
                'roomId',
              ),
        bedId:
          context.location.bedId ===
          null
            ? null
            : this.support.objectId(
                context.location.bedId,
                'bedId',
              ),
        taskNumber:
          allocation.number,
        sourceType:
          input.sourceType,
        sourceRecordId:
          input.sourceRecordId ==
          null
            ? null
            : this.support.objectId(
                input.sourceRecordId,
                'sourceRecordId',
              ),
        carePlanId:
          input.carePlanId ==
          null
            ? null
            : this.support.objectId(
                input.carePlanId,
                'carePlanId',
              ),
        carePlanInterventionId:
          input.carePlanInterventionId ==
          null
            ? null
            : this.support.objectId(
                input.carePlanInterventionId,
                'carePlanInterventionId',
              ),
        title:
          this.support.normalizedText(
            input.title,
          ),
        instructions:
          this.support.nullableText(
            input.instructions,
          ),
        priority:
          input.priority,
        status:
          'PENDING',
        assignedStaffId:
          input.assignedStaffId ==
          null
            ? null
            : this.support.objectId(
                input.assignedStaffId,
                'assignedStaffId',
              ),
        assignedTeamCode:
          input.assignedTeamCode ==
          null
            ? null
            : this.support.normalizedCode(
                input.assignedTeamCode,
              ),
        scheduledAt:
          input.scheduledAt ==
          null
            ? null
            : new Date(
                input.scheduledAt,
              ),
        dueAt,
        recurrenceKey:
          input.recurrenceKey ==
          null
            ? null
            : this.support.normalizedCode(
                input.recurrenceKey,
              ),
        carriedForwardFromTaskId:
          null,
        carriedForwardToTaskId:
          null,
        startedAt:
          null,
        completedAt:
          null,
        completedByUserId:
          null,
        completedByStaffId:
          null,
        dispositionReasonCode:
          null,
        dispositionReason:
          null,
        escalatedAt:
          null,
        escalatedToStaffId:
          null,
        escalationReason:
          null,
        transactionId:
          transaction.transactionId,
        correlationId:
          command.actor.correlationId,
        idempotencyKey:
          command.idempotencyKey,
        schemaVersion:
          1,
        version:
          0,
        createdBy:
          actorUserId,
        updatedBy:
          actorUserId,
      });

    const taskId =
      created._id.toHexString();

    await transaction.registerCompensation(
      deleteCreatedNursingRecordCompensation(
        `delete-nursing-task:${taskId}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingTasks',
          entityId:
            taskId,
          expectedVersion:
            0,
          transactionId:
            transaction.transactionId,
        },
      ),
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
      {
        taskId,
        taskNumber:
          created.taskNumber,
      },
    );

    const payload =
      taskEventPayload(
        created,
      );

    await this.support.publishMutation({
      transaction,
      actor:
        command.actor,
      occurredAt,
      auditAction:
        NURSING_MEDICATION_AUDIT_ACTIONS.TASK_CREATED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.TASK_CREATED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.TASK_WORKLIST_CHANGED,
      entityType:
        'NursingTask',
      entityId:
        taskId,
      context,
      before:
        null,
      after:
        payload,
      eventPayload:
        payload,
      metadata: {
        accessMode:
          access.accessMode,
      },
    });

    return projectNursingTaskSummary(
      created,
    );
  }
}

export class ChangeNursingTaskStatusWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<ChangeNursingTaskStatusInput>,
  ): Promise<NursingTaskSummaryView> {
    const input =
      changeNursingTaskStatusBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireTask(
        command.actor,
        command.entityId,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      current,
    );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'TASK',
    );

    assertNursingTaskTransition(
      current.status,
      input.status,
    );

    await this.support.assertAccess(
      'TASK_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CHANGE_TASK_STATUS,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingTaskMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        taskId:
          command.entityId,
        input,
      },
      journalPayload:
        safeTaskJournalPayload(
          'CHANGE_TASK_STATUS',
          {
            context,
            taskId:
              command.entityId,
            targetStatus:
              input.status,
            expectedVersion:
              input.expectedVersion,
          },
        ),
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.support.requireTask(
              command.actor,
              command.entityId,
            );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingRecordContext(
            lockedContext,
            locked,
          );

          this.support.assertExpectedVersion(
            locked,
            input.expectedVersion,
            'TASK',
          );

          assertNursingTaskTransition(
            locked.status,
            input.status,
          );

          const access =
            await this.support.assertAccess(
              'TASK_MANAGE',
              command.actor,
              lockedContext,
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'NEW_ENTRY',
          );

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

          const occurredAt =
            this.support.dependencies.clock.now();

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const actorStaffId =
            this.support.objectId(
              staffId,
              'staffId',
            );

          const restorePayload =
            protectNursingRestorePayload({
              facilityId:
                lockedContext.facilityId,
              collection:
                'nursingTasks',
              entityId:
                command.entityId,
              expectedPostVersion:
                locked.version + 1,
              transactionId:
                transaction.transactionId,
              snapshot:
                nursingTaskRestoreSnapshot(
                  locked,
                ),
              snapshotCrypto:
                this.support.dependencies.snapshotCrypto,
            });

          const updated =
            await this.support.care.updateTask(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                locked.status,
              ],
              {
                status:
                  input.status,
                startedAt:
                  input.status ===
                  'IN_PROGRESS'
                    ? locked.startedAt ??
                      occurredAt
                    : locked.startedAt,
                completedAt:
                  input.status ===
                  'COMPLETED'
                    ? occurredAt
                    : null,
                completedByUserId:
                  input.status ===
                  'COMPLETED'
                    ? actorUserId
                    : null,
                completedByStaffId:
                  input.status ===
                  'COMPLETED'
                    ? actorStaffId
                    : null,
                dueAt:
                  input.status ===
                    'DELAYED' &&
                  input.delayedUntil !=
                    null
                    ? new Date(
                        input.delayedUntil,
                      )
                    : locked.dueAt,
                dispositionReasonCode:
                  input.dispositionReasonCode ==
                  null
                    ? null
                    : this.support.normalizedCode(
                        input.dispositionReasonCode,
                      ),
                dispositionReason:
                  this.support.nullableText(
                    input.dispositionReason,
                  ),
                escalatedAt:
                  input.status ===
                  'ESCALATED'
                    ? occurredAt
                    : null,
                escalatedToStaffId:
                  input.status ===
                    'ESCALATED' &&
                  input.escalatedToStaffId !=
                    null
                    ? this.support.objectId(
                        input.escalatedToStaffId,
                        'escalatedToStaffId',
                      )
                    : null,
                escalationReason:
                  input.status ===
                  'ESCALATED'
                    ? this.support.nullableText(
                        input.escalationReason,
                      )
                    : null,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated === null
          ) {
            throw new NursingTaskConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreNursingRecordCompensation(
              `restore-nursing-task-status:${command.entityId}`,
              restorePayload,
            ),
          );

          await transaction.checkpoint(
            NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
            {
              taskId:
                command.entityId,
              status:
                updated.status,
              version:
                updated.version,
            },
          );

          const before =
            taskEventPayload(
              locked,
            );

          const after =
            taskEventPayload(
              updated,
            );

          await this.support.publishMutation({
            transaction,
            actor:
              command.actor,
            occurredAt,
            auditAction:
              NURSING_MEDICATION_AUDIT_ACTIONS.TASK_STATUS_CHANGED,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.TASK_STATUS_CHANGED,
            realtimeEventType:
              NURSING_MEDICATION_REALTIME_EVENTS.TASK_WORKLIST_CHANGED,
            entityType:
              'NursingTask',
            entityId:
              command.entityId,
            context:
              lockedContext,
            before,
            after,
            eventPayload:
              after,
            reason:
              input.dispositionReason ??
              input.escalationReason ??
              undefined,
            metadata: {
              accessMode:
                access.accessMode,
            },
          });

          return projectNursingTaskSummary(
            updated,
          );
        },
    });
  }
}

export class CarryForwardNursingTaskWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<CarryForwardNursingTaskInput>,
  ): Promise<NursingTaskSummaryView> {
    const input =
      carryForwardNursingTaskBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireTask(
        command.actor,
        command.entityId,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        current.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      current,
    );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'TASK',
    );

    assertNursingTaskTransition(
      current.status,
      'CANCELLED',
    );

    await this.support.assertAccess(
      'TASK_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CARRY_FORWARD_TASK,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingTaskMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        taskId:
          command.entityId,
        input,
      },
      journalPayload:
        safeTaskJournalPayload(
          'CARRY_FORWARD_TASK',
          {
            context,
            taskId:
              command.entityId,
            targetStatus:
              'CANCELLED',
            expectedVersion:
              input.expectedVersion,
          },
        ),
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.support.requireTask(
              command.actor,
              command.entityId,
            );

          const lockedContext =
            await this.support.resolveAdmission(
              command.actor,
              locked.admissionId.toHexString(),
            );

          assertNursingRecordContext(
            lockedContext,
            locked,
          );

          this.support.assertExpectedVersion(
            locked,
            input.expectedVersion,
            'TASK',
          );

          assertNursingTaskTransition(
            locked.status,
            'CANCELLED',
          );

          const access =
            await this.support.assertAccess(
              'TASK_MANAGE',
              command.actor,
              lockedContext,
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'CORRECTION',
            input.reason,
          );

          const occurredAt =
            this.support.dependencies.clock.now();

          const allocation =
            await this.support.allocateNumber(
              lockedContext.facilityId,
              NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE.TASK,
              'NTK',
              occurredAt,
            );

          const actorUserId =
            this.support.objectId(
              command.actor.userId,
              'actorUserId',
            );

          const replacement =
            await this.support.care.createTask({
              facilityId:
                locked.facilityId,
              admissionId:
                locked.admissionId,
              patientId:
                locked.patientId,
              encounterId:
                locked.encounterId,
              wardId:
                this.support.objectId(
                  lockedContext.location.wardId,
                  'wardId',
                ),
              roomId:
                lockedContext.location.roomId ===
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.roomId,
                      'roomId',
                    ),
              bedId:
                lockedContext.location.bedId ===
                null
                  ? null
                  : this.support.objectId(
                      lockedContext.location.bedId,
                      'bedId',
                    ),
              taskNumber:
                allocation.number,
              sourceType:
                locked.sourceType,
              sourceRecordId:
                locked.sourceRecordId,
              carePlanId:
                locked.carePlanId,
              carePlanInterventionId:
                locked.carePlanInterventionId,
              title:
                locked.title,
              instructions:
                locked.instructions,
              priority:
                locked.priority,
              status:
                'PENDING',
              assignedStaffId:
                input.assignedStaffId ==
                null
                  ? locked.assignedStaffId
                  : this.support.objectId(
                      input.assignedStaffId,
                      'assignedStaffId',
                    ),
              assignedTeamCode:
                input.assignedTeamCode ==
                null
                  ? locked.assignedTeamCode
                  : this.support.normalizedCode(
                      input.assignedTeamCode,
                    ),
              scheduledAt:
                new Date(
                  input.dueAt,
                ),
              dueAt:
                new Date(
                  input.dueAt,
                ),
              recurrenceKey:
                locked.recurrenceKey ===
                null
                  ? null
                  : `${locked.recurrenceKey}_CF_${occurredAt.getTime()}`,
              carriedForwardFromTaskId:
                locked._id,
              carriedForwardToTaskId:
                null,
              startedAt:
                null,
              completedAt:
                null,
              completedByUserId:
                null,
              completedByStaffId:
                null,
              dispositionReasonCode:
                null,
              dispositionReason:
                null,
              escalatedAt:
                null,
              escalatedToStaffId:
                null,
              escalationReason:
                null,
              transactionId:
                transaction.transactionId,
              correlationId:
                command.actor.correlationId,
              idempotencyKey:
                command.idempotencyKey,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
            });

          const replacementId =
            replacement._id.toHexString();

          await transaction.registerCompensation(
            deleteCreatedNursingRecordCompensation(
              `delete-carried-forward-nursing-task:${replacementId}`,
              {
                facilityId:
                  lockedContext.facilityId,
                collection:
                  'nursingTasks',
                entityId:
                  replacementId,
                expectedVersion:
                  0,
                transactionId:
                  transaction.transactionId,
              },
            ),
          );

          const restorePayload =
            protectNursingRestorePayload({
              facilityId:
                lockedContext.facilityId,
              collection:
                'nursingTasks',
              entityId:
                command.entityId,
              expectedPostVersion:
                locked.version + 1,
              transactionId:
                transaction.transactionId,
              snapshot:
                nursingTaskRestoreSnapshot(
                  locked,
                ),
              snapshotCrypto:
                this.support.dependencies.snapshotCrypto,
            });

          const original =
            await this.support.care.updateTask(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                locked.status,
              ],
              {
                status:
                  'CANCELLED',
                carriedForwardToTaskId:
                  replacement._id,
                dispositionReasonCode:
                  'SHIFT_CARRY_FORWARD',
                dispositionReason:
                  this.support.normalizedText(
                    input.reason,
                  ),
                updatedBy:
                  actorUserId,
              },
            );

          if (
            original === null
          ) {
            throw new NursingTaskConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreNursingRecordCompensation(
              `restore-carried-forward-source-task:${command.entityId}`,
              restorePayload,
            ),
          );

          await transaction.checkpoint(
            NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
            {
              sourceTaskId:
                command.entityId,
              replacementTaskId:
                replacementId,
            },
          );

          const before =
            taskEventPayload(
              locked,
            );

          const after = {
            ...taskEventPayload(
              replacement,
            ),
            carriedForwardFromTaskId:
              command.entityId,
          };

          await this.support.publishMutation({
            transaction,
            actor:
              command.actor,
            occurredAt,
            auditAction:
              NURSING_MEDICATION_AUDIT_ACTIONS.TASK_CARRIED_FORWARD,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.TASK_CARRIED_FORWARD,
            realtimeEventType:
              NURSING_MEDICATION_REALTIME_EVENTS.TASK_WORKLIST_CHANGED,
            entityType:
              'NursingTask',
            entityId:
              replacementId,
            context:
              lockedContext,
            before,
            after,
            eventPayload:
              after,
            reason:
              input.reason,
            metadata: {
              accessMode:
                access.accessMode,
              sourceTaskId:
                command.entityId,
            },
          });

          return projectNursingTaskSummary(
            replacement,
          );
        },
    });
  }
}