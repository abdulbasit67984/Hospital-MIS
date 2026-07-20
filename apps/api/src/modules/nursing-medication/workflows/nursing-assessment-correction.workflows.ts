import {
  Types,
} from 'mongoose';

import {
  NURSING_BACKDATE_REASON_THRESHOLD_MINUTES,
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CorrectNursingAssessmentInput,
  MarkNursingAssessmentEnteredInErrorInput,
  NursingMedicationEntityCommand,
} from '../nursing-medication.contracts.js';

import {
  NursingAssessmentConcurrencyError,
  NursingClinicalContextMismatchError,
} from '../nursing-medication.errors.js';

import {
  assertNursingAssessmentTransition,
  assertNursingDocumentationAllowed,
  assertNursingRecordContext,
} from '../nursing-medication.lifecycle.js';

import {
  deleteCreatedNursingRecordCompensation,
  nursingAssessmentRestoreSnapshot,
  protectNursingRestorePayload,
  restoreNursingRecordCompensation,
} from '../nursing-medication.mutation-snapshots.js';

import {
  projectNursingAssessmentClinical,
  type NursingAssessmentClinicalView,
} from '../nursing-medication.projections.js';

import {
  NURSING_MEDICATION_AUDIT_ACTIONS,
  NURSING_MEDICATION_OUTBOX_EVENTS,
  NURSING_MEDICATION_REALTIME_EVENTS,
  NURSING_MEDICATION_TRANSACTION_STATES,
  NURSING_MEDICATION_TRANSACTION_TYPES,
} from '../nursing-medication.transaction.constants.js';

import {
  correctNursingAssessmentBodySchema,
  markNursingAssessmentEnteredInErrorBodySchema,
} from '../nursing-medication.validation.js';

import {
  assessmentEventPayload,
  nursingAssessmentMutationLockKeys,
  safeAssessmentJournalPayload,
} from '../nursing-medication.workflow-helpers.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

function assertReplacementAssessmentTime(
  assessedAt: Date,
  recordedAt: Date,
  backdatedEntryReason: string | null,
): void {
  if (
    assessedAt.getTime() >
    recordedAt.getTime()
  ) {
    throw new NursingClinicalContextMismatchError(
      'Corrected assessment time cannot be in the future',
    );
  }

  if (
    recordedAt.getTime() -
      assessedAt.getTime() >
      NURSING_BACKDATE_REASON_THRESHOLD_MINUTES *
        60 *
        1_000 &&
    backdatedEntryReason === null
  ) {
    throw new NursingClinicalContextMismatchError(
      'Backdated corrected assessments require a documented reason',
    );
  }
}

export class CorrectNursingAssessmentWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<CorrectNursingAssessmentInput>,
  ): Promise<NursingAssessmentClinicalView> {
    const input =
      correctNursingAssessmentBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireAssessment(
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
      'ASSESSMENT',
    );

    assertNursingAssessmentTransition(
      current.status,
      'CORRECTED',
    );

    await this.support.assertAccess(
      'ASSESSMENT_CORRECT',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CORRECT_ASSESSMENT,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingAssessmentMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        assessmentId:
          command.entityId,
        input,
      },
      journalPayload:
        safeAssessmentJournalPayload(
          'CORRECT_ASSESSMENT',
          {
            context,
            assessmentId:
              command.entityId,
            assessmentType:
              input.replacement.assessmentType,
            targetStatus:
              'CORRECTED',
            expectedVersion:
              input.expectedVersion,
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
    command: NursingMedicationEntityCommand<CorrectNursingAssessmentInput>,
    input: ReturnType<
      typeof correctNursingAssessmentBodySchema.parse
    >,
    transaction: NursingMedicationTransactionContext,
  ): Promise<NursingAssessmentClinicalView> {
    const current =
      await this.support.requireAssessment(
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
      'ASSESSMENT',
    );

    assertNursingAssessmentTransition(
      current.status,
      'CORRECTED',
    );

    const access =
      await this.support.assertAccess(
        'ASSESSMENT_CORRECT',
        command.actor,
        context,
      );

    const staffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    const assessedAt =
      new Date(
        input.replacement.assessedAt,
      );

    const backdatedEntryReason =
      this.support.nullableText(
        input.replacement.backdatedEntryReason,
      );

    assertReplacementAssessmentTime(
      assessedAt,
      occurredAt,
      backdatedEntryReason,
    );

    assertNursingDocumentationAllowed(
      context,
      'CORRECTION',
      input.reason,
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.LIFECYCLE_VALIDATED,
      {
        assessmentId:
          command.entityId,
        fromStatus:
          current.status,
        toStatus:
          'CORRECTED',
        replacementRevision:
          current.revisionNumber + 1,
      },
    );

    const allocation =
      await this.support.allocateNumber(
        command.actor.facilityId,
        NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE.ASSESSMENT,
        'NAS',
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

    const replacement =
      await this.support.assessments.create({
        facilityId:
          current.facilityId,
        admissionId:
          current.admissionId,
        patientId:
          current.patientId,
        encounterId:
          current.encounterId,
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
        assessmentNumber:
          allocation.number,
        assessmentType:
          input.replacement.assessmentType,
        templateCode:
          input.replacement.templateCode ==
          null
            ? null
            : this.support.normalizedCode(
                input.replacement.templateCode,
              ),
        templateVersion:
          input.replacement.templateVersion ??
          null,
        sections:
          input.replacement.sections.map(
            (section) => ({
              sectionCode:
                this.support.normalizedCode(
                  section.sectionCode,
                ),
              sectionLabel:
                this.support.normalizedText(
                  section.sectionLabel,
                ),
              values: {
                ...section.values,
              },
              narrative:
                this.support.nullableText(
                  section.narrative,
                ),
              riskLevel:
                section.riskLevel,
              score:
                section.score == null
                  ? null
                  : Types.Decimal128.fromString(
                      section.score,
                    ),
            }),
          ),
        summary:
          this.support.nullableText(
            input.replacement.summary,
          ),
        overallRiskLevel:
          input.replacement.overallRiskLevel,
        requiresEscalation:
          input.replacement.requiresEscalation,
        escalationReason:
          this.support.nullableText(
            input.replacement.escalationReason,
          ),
        assessedAt,
        recordedAt:
          occurredAt,
        backdatedEntryReason,
        assessedByUserId:
          actorUserId,
        assessedByStaffId:
          actorStaffId,
        status:
          'SIGNED',
        signedAt:
          occurredAt,
        signedByUserId:
          actorUserId,
        signedByStaffId:
          actorStaffId,
        revisionNumber:
          current.revisionNumber + 1,
        rootAssessmentId:
          current.rootAssessmentId,
        supersedesAssessmentId:
          current._id,
        supersededByAssessmentId:
          null,
        correctionReason:
          this.support.normalizedText(
            input.reason,
          ),
        enteredInErrorAt:
          null,
        enteredInErrorByUserId:
          null,
        enteredInErrorByStaffId:
          null,
        enteredInErrorReason:
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
        `delete-corrected-nursing-assessment:${replacementId}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingAssessments',
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
          'nursingAssessments',
        entityId:
          command.entityId,
        expectedPostVersion:
          current.version + 1,
        transactionId:
          transaction.transactionId,
        snapshot:
          nursingAssessmentRestoreSnapshot(
            current,
          ),
        snapshotCrypto:
          this.support.dependencies.snapshotCrypto,
      });

    const correctedOriginal =
      await this.support.assessments.update(
        context.facilityId,
        command.entityId,
        current.version,
        [
          'SIGNED',
        ],
        {
          status:
            'CORRECTED',
          supersededByAssessmentId:
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
      throw new NursingAssessmentConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreNursingRecordCompensation(
        `restore-original-nursing-assessment:${command.entityId}`,
        restorePayload,
      ),
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
      {
        originalAssessmentId:
          command.entityId,
        replacementAssessmentId:
          replacementId,
        revisionNumber:
          replacement.revisionNumber,
      },
    );

    const version =
      await this.support.assessments.createVersion({
        facilityId:
          replacement.facilityId,
        admissionId:
          replacement.admissionId,
        patientId:
          replacement.patientId,
        encounterId:
          replacement.encounterId,
        wardId:
          replacement.wardId,
        roomId:
          replacement.roomId,
        bedId:
          replacement.bedId,
        transactionId:
          transaction.transactionId,
        correlationId:
          command.actor.correlationId,
        schemaVersion:
          1,
        createdBy:
          actorUserId,
        nursingAssessmentId:
          replacement._id,
        rootAssessmentId:
          replacement.rootAssessmentId,
        revisionNumber:
          replacement.revisionNumber,
        snapshot:
          replacement as unknown as Record<string, unknown>,
        capturedAt:
          occurredAt,
        capturedByUserId:
          actorUserId,
        capturedByStaffId:
          actorStaffId,
        reason:
          this.support.normalizedText(
            input.reason,
          ),
      });

    await transaction.registerCompensation(
      deleteCreatedNursingRecordCompensation(
        `delete-corrected-assessment-version:${version._id.toHexString()}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingAssessmentVersions',
          entityId:
            version._id.toHexString(),
          expectedVersion:
            null,
          transactionId:
            transaction.transactionId,
        },
      ),
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.IMMUTABLE_VERSION_APPENDED,
      {
        assessmentId:
          replacementId,
        versionId:
          version._id.toHexString(),
        revisionNumber:
          replacement.revisionNumber,
      },
    );

    const before =
      assessmentEventPayload(
        current,
      );

    const after = {
      ...assessmentEventPayload(
        replacement,
      ),
      correctedAssessmentId:
        command.entityId,
    };

    await this.support.publishMutation({
      transaction,
      actor:
        command.actor,
      occurredAt,
      auditAction:
        NURSING_MEDICATION_AUDIT_ACTIONS.ASSESSMENT_CORRECTED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.ASSESSMENT_CORRECTED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.ASSESSMENT_WORKLIST_CHANGED,
      entityType:
        'NursingAssessment',
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
        correctedAssessmentId:
          command.entityId,
      },
    });

    return projectNursingAssessmentClinical(
      replacement,
    );
  }
}

export class MarkNursingAssessmentEnteredInErrorWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<MarkNursingAssessmentEnteredInErrorInput>,
  ): Promise<NursingAssessmentClinicalView> {
    const input =
      markNursingAssessmentEnteredInErrorBodySchema.parse(
        command.input,
      );

    const current =
      await this.support.requireAssessment(
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
      'ASSESSMENT',
    );

    assertNursingAssessmentTransition(
      current.status,
      'ENTERED_IN_ERROR',
    );

    await this.support.assertAccess(
      'ASSESSMENT_CORRECT',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.MARK_ASSESSMENT_ENTERED_IN_ERROR,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingAssessmentMutationLockKeys(
          context,
          current,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        assessmentId:
          command.entityId,
        input,
      },
      journalPayload:
        safeAssessmentJournalPayload(
          'MARK_ASSESSMENT_ENTERED_IN_ERROR',
          {
            context,
            assessmentId:
              command.entityId,
            targetStatus:
              'ENTERED_IN_ERROR',
            expectedVersion:
              input.expectedVersion,
          },
        ),
      execute:
        async (
          transaction,
        ) => {
          const locked =
            await this.support.requireAssessment(
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
            'ASSESSMENT',
          );

          assertNursingAssessmentTransition(
            locked.status,
            'ENTERED_IN_ERROR',
          );

          const access =
            await this.support.assertAccess(
              'ASSESSMENT_CORRECT',
              command.actor,
              lockedContext,
            );

          const staffId =
            await this.support.actorStaffId(
              command.actor,
            );

          assertNursingDocumentationAllowed(
            lockedContext,
            'CORRECTION',
            input.reason,
          );

          const occurredAt =
            this.support.dependencies.clock.now();

          const restorePayload =
            protectNursingRestorePayload({
              facilityId:
                lockedContext.facilityId,
              collection:
                'nursingAssessments',
              entityId:
                command.entityId,
              expectedPostVersion:
                locked.version + 1,
              transactionId:
                transaction.transactionId,
              snapshot:
                nursingAssessmentRestoreSnapshot(
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

          const updated =
            await this.support.assessments.update(
              lockedContext.facilityId,
              command.entityId,
              locked.version,
              [
                'DRAFT',
                'SIGNED',
              ],
              {
                status:
                  'ENTERED_IN_ERROR',
                enteredInErrorAt:
                  occurredAt,
                enteredInErrorByUserId:
                  actorUserId,
                enteredInErrorByStaffId:
                  this.support.objectId(
                    staffId,
                    'staffId',
                  ),
                enteredInErrorReason:
                  this.support.normalizedText(
                    input.reason,
                  ),
                updatedBy:
                  actorUserId,
              },
            );

          if (
            updated === null
          ) {
            throw new NursingAssessmentConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreNursingRecordCompensation(
              `restore-entered-error-assessment:${command.entityId}`,
              restorePayload,
            ),
          );

          await transaction.checkpoint(
            NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
            {
              assessmentId:
                command.entityId,
              status:
                updated.status,
              version:
                updated.version,
            },
          );

          const before =
            assessmentEventPayload(
              locked,
            );

          const after =
            assessmentEventPayload(
              updated,
            );

          await this.support.publishMutation({
            transaction,
            actor:
              command.actor,
            occurredAt,
            auditAction:
              NURSING_MEDICATION_AUDIT_ACTIONS.ASSESSMENT_ENTERED_IN_ERROR,
            outboxEventType:
              NURSING_MEDICATION_OUTBOX_EVENTS.ASSESSMENT_ENTERED_IN_ERROR,
            realtimeEventType:
              NURSING_MEDICATION_REALTIME_EVENTS.ASSESSMENT_WORKLIST_CHANGED,
            entityType:
              'NursingAssessment',
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

          return projectNursingAssessmentClinical(
            updated,
          );
        },
    });
  }
}