import {
  Types,
} from 'mongoose';

import {
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CreateNursingCarePlanInput,
  NursingCarePlanProblemInput,
  NursingMedicationCommand,
  NursingMedicationEntityCommand,
  ReviewNursingCarePlanInput,
} from '../nursing-medication.contracts.js';

import {
  NursingCarePlanConcurrencyError,
} from '../nursing-medication.errors.js';

import {
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
  createNursingCarePlanBodySchema,
  reviewNursingCarePlanBodySchema,
} from '../nursing-medication.validation.js';

import {
  carePlanEventPayload,
  nursingCarePlanCreateLockKeys,
  nursingCarePlanMutationLockKeys,
  safeCarePlanJournalPayload,
} from '../nursing-medication.workflow-helpers.js';

import type {
  NursingCarePlanRecord,
} from '../nursing-medication.persistence.types.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

export function normalizedCarePlanProblems(
  support: NursingMedicationCommandService,
  problems: readonly NursingCarePlanProblemInput[],
  evaluation?: Readonly<{
    occurredAt: Date;
    staffId: Types.ObjectId;
  }>,
) {
  return problems.map(
    (problem) => ({
      problemId:
        support.objectId(
          problem.problemId ??
            support.newId(),
          'problemId',
        ),
      problemCode:
        problem.problemCode == null
          ? null
          : support.normalizedCode(
              problem.problemCode,
            ),
      description:
        support.normalizedText(
          problem.description,
        ),
      identifiedAt:
        new Date(
          problem.identifiedAt,
        ),
      sourceAssessmentId:
        problem.sourceAssessmentId ==
        null
          ? null
          : support.objectId(
              problem.sourceAssessmentId,
              'sourceAssessmentId',
            ),
      status:
        problem.status ??
        'ACTIVE',
      goals:
        (problem.goals ?? []).map(
          (goal) => ({
            goalId:
              support.objectId(
                goal.goalId ??
                  support.newId(),
                'goalId',
              ),
            description:
              support.normalizedText(
                goal.description,
              ),
            expectedOutcome:
              support.normalizedText(
                goal.expectedOutcome,
              ),
            targetDate:
              goal.targetDate == null
                ? null
                : new Date(
                    goal.targetDate,
                  ),
            status:
              goal.status ??
              'PLANNED',
            evaluation:
              support.nullableText(
                goal.evaluation,
              ),
            evaluatedAt:
              goal.evaluation == null
                ? null
                : evaluation?.occurredAt ??
                  null,
            evaluatedByStaffId:
              goal.evaluation == null
                ? null
                : evaluation?.staffId ??
                  null,
          }),
        ),
      interventions:
        (
          problem.interventions ??
          []
        ).map(
          (intervention) => ({
            interventionId:
              support.objectId(
                intervention.interventionId ??
                  support.newId(),
                'interventionId',
              ),
            description:
              support.normalizedText(
                intervention.description,
              ),
            frequency: {
              type:
                intervention.frequency.type,
              intervalMinutes:
                intervention.frequency.intervalMinutes ??
                null,
              timesOfDay:
                [
                  ...(intervention.frequency.timesOfDay ??
                    []),
                ],
              shiftCodes:
                (
                  intervention.frequency.shiftCodes ??
                  []
                ).map(
                  (code) =>
                    support.normalizedCode(
                      code,
                    ),
                ),
              instruction:
                support.nullableText(
                  intervention.frequency.instruction,
                ),
            },
            assignedStaffId:
              intervention.assignedStaffId ==
              null
                ? null
                : support.objectId(
                    intervention.assignedStaffId,
                    'assignedStaffId',
                  ),
            assignedTeamCode:
              intervention.assignedTeamCode ==
              null
                ? null
                : support.normalizedCode(
                    intervention.assignedTeamCode,
                  ),
            startsAt:
              new Date(
                intervention.startsAt,
              ),
            endsAt:
              intervention.endsAt ==
              null
                ? null
                : new Date(
                    intervention.endsAt,
                  ),
            active:
              intervention.active ??
              true,
          }),
        ),
    }),
  );
}

export async function appendNursingCarePlanVersion(
  input: Readonly<{
    support: NursingMedicationCommandService;
    transaction: NursingMedicationTransactionContext;
    actorUserId: Types.ObjectId;
    actorStaffId: Types.ObjectId;
    occurredAt: Date;
    reason: string;
    carePlan: NursingCarePlanRecord;
  }>,
): Promise<void> {
  const version =
    await input.support.care.createCarePlanVersion({
      facilityId:
        input.carePlan.facilityId,
      admissionId:
        input.carePlan.admissionId,
      patientId:
        input.carePlan.patientId,
      encounterId:
        input.carePlan.encounterId,
      wardId:
        input.carePlan.wardId,
      roomId:
        input.carePlan.roomId,
      bedId:
        input.carePlan.bedId,
      transactionId:
        input.transaction.transactionId,
      correlationId:
        input.carePlan.correlationId,
      schemaVersion:
        1,
      createdBy:
        input.actorUserId,
      nursingCarePlanId:
        input.carePlan._id,
      rootCarePlanId:
        input.carePlan.rootCarePlanId,
      revisionNumber:
        input.carePlan.revisionNumber,
      snapshot:
        input.carePlan as unknown as Record<string, unknown>,
      capturedAt:
        input.occurredAt,
      capturedByUserId:
        input.actorUserId,
      capturedByStaffId:
        input.actorStaffId,
      reason:
        input.reason,
    });

  await input.transaction.registerCompensation(
    deleteCreatedNursingRecordCompensation(
      `delete-nursing-care-plan-version:${version._id.toHexString()}`,
      {
        facilityId:
          input.carePlan.facilityId.toHexString(),
        collection:
          'nursingCarePlanVersions',
        entityId:
          version._id.toHexString(),
        expectedVersion:
          null,
        transactionId:
          input.transaction.transactionId,
      },
    ),
  );

  await input.transaction.checkpoint(
    NURSING_MEDICATION_TRANSACTION_STATES.IMMUTABLE_VERSION_APPENDED,
    {
      carePlanId:
        input.carePlan._id.toHexString(),
      versionId:
        version._id.toHexString(),
      revisionNumber:
        input.carePlan.revisionNumber,
    },
  );
}

export class CreateNursingCarePlanWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationCommand<CreateNursingCarePlanInput>,
  ): Promise<NursingCarePlanSummaryView> {
    const input =
      createNursingCarePlanBodySchema.parse(
        command.input,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.support.assertAccess(
      'CARE_PLAN_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CREATE_CARE_PLAN,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingCarePlanCreateLockKeys(
          context,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        input,
      },
      journalPayload:
        safeCarePlanJournalPayload(
          'CREATE_CARE_PLAN',
          {
            context,
            targetStatus:
              'ACTIVE',
            problemCount:
              input.problems.length,
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
    command: NursingMedicationCommand<CreateNursingCarePlanInput>,
    input: ReturnType<
      typeof createNursingCarePlanBodySchema.parse
    >,
    transaction: NursingMedicationTransactionContext,
  ): Promise<NursingCarePlanSummaryView> {
    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    const access =
      await this.support.assertAccess(
        'CARE_PLAN_MANAGE',
        command.actor,
        context,
      );

    const staffId =
      await this.support.actorStaffId(
        command.actor,
      );

    assertNursingDocumentationAllowed(
      context,
      'NEW_ENTRY',
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

    const actorStaffId =
      this.support.objectId(
        staffId,
        'staffId',
      );

    const created =
      await this.support.care.createCarePlan({
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
        carePlanNumber:
          allocation.number,
        title:
          this.support.normalizedText(
            input.title,
          ),
        status:
          'ACTIVE',
        problems:
          normalizedCarePlanProblems(
            this.support,
            input.problems,
          ),
        assignedNurseStaffId:
          input.assignedNurseStaffId ==
          null
            ? actorStaffId
            : this.support.objectId(
                input.assignedNurseStaffId,
                'assignedNurseStaffId',
              ),
        assignedTeamCode:
          input.assignedTeamCode ==
          null
            ? null
            : this.support.normalizedCode(
                input.assignedTeamCode,
              ),
        startedAt:
          new Date(
            input.startedAt,
          ),
        targetCompletionAt:
          input.targetCompletionAt ==
          null
            ? null
            : new Date(
                input.targetCompletionAt,
              ),
        nextReviewAt:
          input.nextReviewAt ==
          null
            ? null
            : new Date(
                input.nextReviewAt,
              ),
        lastReviewedAt:
          occurredAt,
        lastReviewedByStaffId:
          actorStaffId,
        outcomeEvaluation:
          null,
        completedAt:
          null,
        completedByStaffId:
          null,
        cancellationReason:
          null,
        revisionNumber:
          1,
        rootCarePlanId:
          this.support.objectId(
            this.support.newId(),
            'rootCarePlanId',
          ),
        supersedesCarePlanId:
          null,
        supersededByCarePlanId:
          null,
        correctionReason:
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

    const carePlanId =
      created._id.toHexString();

    await transaction.registerCompensation(
      deleteCreatedNursingRecordCompensation(
        `delete-nursing-care-plan:${carePlanId}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingCarePlans',
          entityId:
            carePlanId,
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
        carePlanId,
        carePlanNumber:
          created.carePlanNumber,
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
        'Nursing care plan created',
      carePlan:
        created,
    });

    const payload =
      carePlanEventPayload(
        created,
      );

    await this.support.publishMutation({
      transaction,
      actor:
        command.actor,
      occurredAt,
      auditAction:
        NURSING_MEDICATION_AUDIT_ACTIONS.CARE_PLAN_CREATED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.CARE_PLAN_CREATED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.CARE_PLAN_WORKLIST_CHANGED,
      entityType:
        'NursingCarePlan',
      entityId:
        carePlanId,
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

    return projectNursingCarePlanSummary(
      created,
    );
  }
}

export class ReviewNursingCarePlanWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<ReviewNursingCarePlanInput>,
  ): Promise<NursingCarePlanSummaryView> {
    const input =
      reviewNursingCarePlanBodySchema.parse(
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

    if (
      ![
        'ACTIVE',
        'ON_HOLD',
      ].includes(
        current.status,
      )
    ) {
      throw new NursingCarePlanConcurrencyError();
    }

    await this.support.assertAccess(
      'CARE_PLAN_MANAGE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.REVIEW_CARE_PLAN,
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
          'REVIEW_CARE_PLAN',
          {
            context,
            carePlanId:
              command.entityId,
            targetStatus:
              current.status,
            expectedVersion:
              input.expectedVersion,
            problemCount:
              input.problems.length,
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
                problems:
                  normalizedCarePlanProblems(
                    this.support,
                    input.problems,
                    {
                      occurredAt,
                      staffId:
                        actorStaffId,
                    },
                  ),
                nextReviewAt:
                  input.nextReviewAt ==
                  null
                    ? null
                    : new Date(
                        input.nextReviewAt,
                      ),
                lastReviewedAt:
                  occurredAt,
                lastReviewedByStaffId:
                  actorStaffId,
                outcomeEvaluation:
                  this.support.nullableText(
                    input.outcomeEvaluation,
                  ),
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
              `restore-reviewed-nursing-care-plan:${command.entityId}`,
              restorePayload,
            ),
          );

          await transaction.checkpoint(
            NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
            {
              carePlanId:
                command.entityId,
              revisionNumber:
                updated.revisionNumber,
              version:
                updated.version,
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
              'Nursing care plan reviewed',
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
              NURSING_MEDICATION_AUDIT_ACTIONS.CARE_PLAN_REVIEWED,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.CARE_PLAN_REVIEWED,
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