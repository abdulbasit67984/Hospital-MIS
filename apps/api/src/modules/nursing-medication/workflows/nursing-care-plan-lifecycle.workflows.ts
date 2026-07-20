import type {
  CancelNursingCarePlanInput,
  CompleteNursingCarePlanInput,
  CorrectNursingCarePlanInput,
  NursingMedicationEntityCommand,
} from '../nursing-medication.contracts.js';

import {
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import {
  NursingCarePlanConcurrencyError,
} from '../nursing-medication.errors.js';

import {
  assertNursingCarePlanTransition,
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
} from '../nursing-medication.lifecycle.js';

import {
  deleteCreatedNursingRecordCompensation,
  nursingCarePlanRestoreSnapshot,
  protectNursingRestorePayload,
  restoreNursingRecordCompensation,
} from '../nursing-medication.mutation-snapshots.js';

import {
  projectNursingCarePlanSummary,
  type NursingCarePlanSummaryView,
} from '../nursing-medication.projections.js';

import {
  NURSING_MEDICATION_AUDIT_ACTIONS,
  NURSING_MEDICATION_OUTBOX_EVENTS,
  NURSING_MEDICATION_REALTIME_EVENTS,
  NURSING_MEDICATION_TRANSACTION_STATES,
  NURSING_MEDICATION_TRANSACTION_TYPES,
} from '../nursing-medication.transaction.constants.js';

import {
  cancelNursingCarePlanBodySchema,
  completeNursingCarePlanBodySchema,
  correctNursingCarePlanBodySchema,
} from '../nursing-medication.validation.js';

import {
  carePlanEventPayload,
  nursingCarePlanMutationLockKeys,
  safeCarePlanJournalPayload,
} from '../nursing-medication.workflow-helpers.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

import {
  appendNursingCarePlanVersion,
  normalizedCarePlanProblems,
} from './nursing-care-plan-create-review.workflows.js';

export class CompleteNursingCarePlanWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<CompleteNursingCarePlanInput>,
  ): Promise<NursingCarePlanSummaryView> {
    const input =
      completeNursingCarePlanBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireCarePlan(
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
      'CARE_PLAN',
    );

    assertNursingCarePlanTransition(
      current.status,
      'COMPLETED',
    );

    await this.support.assertAccess(
      'CARE_PLAN_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.COMPLETE_CARE_PLAN,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingCarePlanMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        carePlanId:
          command.entityId,
        input,
      },
      journalPayload:
        safeCarePlanJournalPayload(
          'COMPLETE_CARE_PLAN',
          {
            context,
            carePlanId:
              command.entityId,
            targetStatus:
              'COMPLETED',
            expectedVersion:
              input.expectedVersion,
          },
        ),
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.support.requireCarePlan(
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
            'CARE_PLAN',
          );

          assertNursingCarePlanTransition(
            locked.status,
            'COMPLETED',
          );

          const access =
            await this.support.assertAccess(
              'CARE_PLAN_MANAGE',
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

          const restorePayload =
            protectNursingRestorePayload({
              facilityId:
                lockedContext.facilityId,
              collection:
                'nursingCarePlans',
              entityId:
                command.entityId,
              expectedPostVersion:
                locked.version + 1,
              transactionId:
                transaction.transactionId,
              snapshot:
                nursingCarePlanRestoreSnapshot(
                  locked,
                ),
              snapshotCrypto:
                this.support.dependencies.snapshotCrypto,
            });

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

          const updated =
            await this.support.care.updateCarePlan(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                'ACTIVE',
                'ON_HOLD',
              ],
              {
                status:
                  'COMPLETED',
                outcomeEvaluation:
                  this.support.normalizedText(
                    input.outcomeEvaluation,
                  ),
                completedAt:
                  occurredAt,
                completedByStaffId:
                  actorStaffId,
                lastReviewedAt:
                  occurredAt,
                lastReviewedByStaffId:
                  actorStaffId,
                revisionNumber:
                  locked.revisionNumber + 1,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated === null
          ) {
            throw new NursingCarePlanConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreNursingRecordCompensation(
              `restore-completed-nursing-care-plan:${command.entityId}`,
              restorePayload,
            ),
          );

          await transaction.checkpoint(
            NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
            {
              carePlanId:
                command.entityId,
              status:
                updated.status,
              revisionNumber:
                updated.revisionNumber,
            },
          );

          await appendNursingCarePlanVersion({
            support:
              this.support,
            transaction,
            actorUserId,
            actorStaffId,
            occurredAt,
            reason:
              'Nursing care plan completed',
            carePlan:
              updated,
          });

          const before =
            carePlanEventPayload(
              locked,
            );

          const after =
            carePlanEventPayload(
              updated,
            );

          await this.support.publishMutation({
            transaction,
            actor:
              command.actor,
            occurredAt,
            auditAction:
              NURSING_MEDICATION_AUDIT_ACTIONS.CARE_PLAN_COMPLETED,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.CARE_PLAN_COMPLETED,
            realtimeEventType:
              NURSING_MEDICATION_REALTIME_EVENTS.CARE_PLAN_WORKLIST_CHANGED,
            entityType:
              'NursingCarePlan',
            entityId:
              command.entityId,
            context:
              lockedContext,
            before,
            after,
            eventPayload:
              after,
            metadata: {
              accessMode:
                access.accessMode,
            },
          });

          return projectNursingCarePlanSummary(
            updated,
          );
        },
    });
  }
}

export class CancelNursingCarePlanWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<CancelNursingCarePlanInput>,
  ): Promise<NursingCarePlanSummaryView> {
    const input =
      cancelNursingCarePlanBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireCarePlan(
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
      'CARE_PLAN',
    );

    assertNursingCarePlanTransition(
      current.status,
      'CANCELLED',
    );

    await this.support.assertAccess(
      'CARE_PLAN_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CANCEL_CARE_PLAN,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingCarePlanMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        carePlanId:
          command.entityId,
        input,
      },
      journalPayload:
        safeCarePlanJournalPayload(
          'CANCEL_CARE_PLAN',
          {
            context,
            carePlanId:
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
            await this.support.requireCarePlan(
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
            'CARE_PLAN',
          );

          assertNursingCarePlanTransition(
            locked.status,
            'CANCELLED',
          );

          const access =
            await this.support.assertAccess(
              'CARE_PLAN_MANAGE',
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

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

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
                'nursingCarePlans',
              entityId:
                command.entityId,
              expectedPostVersion:
                locked.version + 1,
              transactionId:
                transaction.transactionId,
              snapshot:
                nursingCarePlanRestoreSnapshot(
                  locked,
                ),
              snapshotCrypto:
                this.support.dependencies.snapshotCrypto,
            });

          const updated =
            await this.support.care.updateCarePlan(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                'DRAFT',
                'ACTIVE',
                'ON_HOLD',
              ],
              {
                status:
                  'CANCELLED',
                cancellationReason:
                  this.support.normalizedText(
                    input.reason,
                  ),
                lastReviewedAt:
                  occurredAt,
                lastReviewedByStaffId:
                  actorStaffId,
                revisionNumber:
                  locked.revisionNumber + 1,
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated === null
          ) {
            throw new NursingCarePlanConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreNursingRecordCompensation(
              `restore-cancelled-nursing-care-plan:${command.entityId}`,
              restorePayload,
            ),
          );

          await appendNursingCarePlanVersion({
            support:
              this.support,
            transaction,
            actorUserId,
            actorStaffId,
            occurredAt,
            reason:
              input.reason,
            carePlan:
              updated,
          });

          const before =
            carePlanEventPayload(
              locked,
            );

          const after =
            carePlanEventPayload(
              updated,
            );

          await this.support.publishMutation({
            transaction,
            actor:
              command.actor,
            occurredAt,
            auditAction:
              NURSING_MEDICATION_AUDIT_ACTIONS.CARE_PLAN_CANCELLED,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.CARE_PLAN_CANCELLED,
            realtimeEventType:
              NURSING_MEDICATION_REALTIME_EVENTS.CARE_PLAN_WORKLIST_CHANGED,
            entityType:
              'NursingCarePlan',
            entityId:
              command.entityId,
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
            },
          });

          return projectNursingCarePlanSummary(
            updated,
          );
        },
    });
  }
}

export class CorrectNursingCarePlanWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<CorrectNursingCarePlanInput>,
  ): Promise<NursingCarePlanSummaryView> {
    const input =
      correctNursingCarePlanBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireCarePlan(
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
      'CARE_PLAN',
    );

    assertNursingCarePlanTransition(
      current.status,
      'CORRECTED',
    );

    await this.support.assertAccess(
      'CARE_PLAN_CORRECT',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CORRECT_CARE_PLAN,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingCarePlanMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        carePlanId:
          command.entityId,
        input,
      },
      journalPayload:
        safeCarePlanJournalPayload(
          'CORRECT_CARE_PLAN',
          {
            context,
            carePlanId:
              command.entityId,
            targetStatus:
              'CORRECTED',
            expectedVersion:
              input.expectedVersion,
            problemCount:
              input.replacement.problems.length,
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
    command: NursingMedicationEntityCommand<CorrectNursingCarePlanInput>,
    input: ReturnType<
      typeof correctNursingCarePlanBodySchema.parse
    >,
    transaction: NursingMedicationTransactionContext,
  ): Promise<NursingCarePlanSummaryView> {
    const locked =
      await this.support.requireCarePlan(
        command.actor,
        command.entityId,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        locked.admissionId.toHexString(),
      );

    assertNursingRecordContext(
      context,
      locked,
    );

    this.support.assertExpectedVersion(
      locked,
      input.expectedVersion,
      'CARE_PLAN',
    );

    assertNursingCarePlanTransition(
      locked.status,
      'CORRECTED',
    );

    const access =
      await this.support.assertAccess(
        'CARE_PLAN_CORRECT',
        command.actor,
        context,
      );

    assertNursingDocumentationAllowed(
      context,
      'CORRECTION',
      input.reason,
    );

    const staffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    const allocation =
      await this.support.allocateNumber(
        context.facilityId,
        NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE.CARE_PLAN,
        'NCP',
        occurredAt,
      );

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

    const replacement =
      await this.support.care.createCarePlan({
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
        carePlanNumber:
          allocation.number,
        title:
          this.support.normalizedText(
            input.replacement.title,
          ),
        status:
          locked.status,
        problems:
          normalizedCarePlanProblems(
            this.support,
            input.replacement.problems,
            {
              occurredAt,
              staffId:
                actorStaffId,
            },
          ),
        assignedNurseStaffId:
          input.replacement.assignedNurseStaffId ==
          null
            ? locked.assignedNurseStaffId
            : this.support.objectId(
                input.replacement.assignedNurseStaffId,
                'assignedNurseStaffId',
              ),
        assignedTeamCode:
          input.replacement.assignedTeamCode ==
          null
            ? locked.assignedTeamCode
            : this.support.normalizedCode(
                input.replacement.assignedTeamCode,
              ),
        startedAt:
          new Date(
            input.replacement.startedAt,
          ),
        targetCompletionAt:
          input.replacement.targetCompletionAt ==
          null
            ? null
            : new Date(
                input.replacement.targetCompletionAt,
              ),
        nextReviewAt:
          input.replacement.nextReviewAt ==
          null
            ? null
            : new Date(
                input.replacement.nextReviewAt,
              ),
        lastReviewedAt:
          occurredAt,
        lastReviewedByStaffId:
          actorStaffId,
        outcomeEvaluation:
          locked.outcomeEvaluation,
        completedAt:
          locked.completedAt,
        completedByStaffId:
          locked.completedByStaffId,
        cancellationReason:
          locked.cancellationReason,
        revisionNumber:
          locked.revisionNumber + 1,
        rootCarePlanId:
          locked.rootCarePlanId,
        supersedesCarePlanId:
          locked._id,
        supersededByCarePlanId:
          null,
        correctionReason:
          this.support.normalizedText(
            input.reason,
          ),
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
        `delete-corrected-nursing-care-plan:${replacementId}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingCarePlans',
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
          context.facilityId,
        collection:
          'nursingCarePlans',
        entityId:
          command.entityId,
        expectedPostVersion:
          locked.version + 1,
        transactionId:
          transaction.transactionId,
        snapshot:
          nursingCarePlanRestoreSnapshot(
            locked,
          ),
        snapshotCrypto:
          this.support.dependencies.snapshotCrypto,
      });

    const correctedOriginal =
      await this.support.care.updateCarePlan(
        context.facilityId,
        command.entityId,
        locked.version,
        [
          'DRAFT',
          'ACTIVE',
          'ON_HOLD',
          'COMPLETED',
          'CANCELLED',
        ],
        {
          status:
            'CORRECTED',
          supersededByCarePlanId:
            replacement._id,
          correctionReason:
            this.support.normalizedText(
              input.reason,
            ),
          updatedBy:
            actorUserId,
        },
      );

    if (
      correctedOriginal === null
    ) {
      throw new NursingCarePlanConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreNursingRecordCompensation(
        `restore-original-nursing-care-plan:${command.entityId}`,
        restorePayload,
      ),
    );

    await appendNursingCarePlanVersion({
      support:
        this.support,
      transaction,
      actorUserId,
      actorStaffId,
      occurredAt,
      reason:
        input.reason,
      carePlan:
        replacement,
    });

    const before =
      carePlanEventPayload(
        locked,
      );

    const after = {
      ...carePlanEventPayload(
        replacement,
      ),
      correctedCarePlanId:
        command.entityId,
    };

    await this.support.publishMutation({
      transaction,
      actor:
        command.actor,
      occurredAt,
      auditAction:
        NURSING_MEDICATION_AUDIT_ACTIONS.CARE_PLAN_CORRECTED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.CARE_PLAN_CORRECTED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.CARE_PLAN_WORKLIST_CHANGED,
      entityType:
        'NursingCarePlan',
      entityId:
        replacementId,
      context,
      before,
      after,
      eventPayload:
        after,
      reason:
        input.reason,
      metadata: {
        accessMode:
          access.accessMode,
        correctedCarePlanId:
          command.entityId,
      },
    });

    return projectNursingCarePlanSummary(
      replacement,
    );
  }
}