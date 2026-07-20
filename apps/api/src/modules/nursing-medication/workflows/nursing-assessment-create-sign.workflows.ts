import {
  Types,
} from 'mongoose';

import {
  NURSING_BACKDATE_REASON_THRESHOLD_MINUTES,
  NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE,
} from '../nursing-medication.constants.js';

import type {
  CreateNursingAssessmentInput,
  NursingMedicationCommand,
  NursingMedicationEntityCommand,
  SignNursingAssessmentInput,
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
  createNursingAssessmentBodySchema,
  signNursingAssessmentBodySchema,
} from '../nursing-medication.validation.js';

import {
  assessmentEventPayload,
  nursingAssessmentCreateLockKeys,
  nursingAssessmentMutationLockKeys,
  safeAssessmentJournalPayload,
} from '../nursing-medication.workflow-helpers.js';

import type {
  NursingMedicationTransactionContext,
} from '../nursing-medication.workflow-ports.js';

import {
  NursingMedicationCommandService,
} from '../services/nursing-medication-command.service.js';

function assessmentVersionSnapshot(
  record: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...record,
  };
}

function documentationMode(
  status: string,
): 'NEW_ENTRY' | 'LATE_ENTRY' {
  return [
    'CLINICALLY_DISCHARGED',
    'FINANCIAL_CLEARANCE_PENDING',
    'DISCHARGED',
  ].includes(
    status,
  )
    ? 'LATE_ENTRY'
    : 'NEW_ENTRY';
}

function assertAssessmentTime(
  assessedAt: Date,
  recordedAt: Date,
  backdatedEntryReason: string | null,
): void {
  if (
    assessedAt.getTime() >
    recordedAt.getTime()
  ) {
    throw new NursingClinicalContextMismatchError(
      'Nursing assessment time cannot be in the future',
    );
  }

  const threshold =
    NURSING_BACKDATE_REASON_THRESHOLD_MINUTES *
    60 *
    1_000;

  if (
    recordedAt.getTime() -
      assessedAt.getTime() >
      threshold &&
    backdatedEntryReason === null
  ) {
    throw new NursingClinicalContextMismatchError(
      'Backdated nursing assessments require a documented reason',
    );
  }
}

export class CreateNursingAssessmentWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationCommand<CreateNursingAssessmentInput>,
  ): Promise<NursingAssessmentClinicalView> {
    const input =
      createNursingAssessmentBodySchema.parse(
        command.input,
      );

    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    await this.support.assertAccess(
      'ASSESSMENT_CREATE',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.CREATE_ASSESSMENT,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        nursingAssessmentCreateLockKeys(
          context,
          input.assessmentType,
        ),
      idempotencyPayload: {
        facilityId:
          command.actor.facilityId,
        input,
      },
      journalPayload:
        safeAssessmentJournalPayload(
          'CREATE_ASSESSMENT',
          {
            context,
            assessmentType:
              input.assessmentType,
            targetStatus:
              'DRAFT',
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
    command: NursingMedicationCommand<CreateNursingAssessmentInput>,
    input: ReturnType<
      typeof createNursingAssessmentBodySchema.parse
    >,
    transaction: NursingMedicationTransactionContext,
  ): Promise<NursingAssessmentClinicalView> {
    const context =
      await this.support.resolveAdmission(
        command.actor,
        input.admissionId,
      );

    const access =
      await this.support.assertAccess(
        'ASSESSMENT_CREATE',
        command.actor,
        context,
      );

    const staffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const recordedAt =
      this.support.dependencies.clock.now();

    const assessedAt =
      new Date(
        input.assessedAt,
      );

    const backdatedEntryReason =
      this.support.nullableText(
        input.backdatedEntryReason,
      );

    assertAssessmentTime(
      assessedAt,
      recordedAt,
      backdatedEntryReason,
    );

    assertNursingDocumentationAllowed(
      context,
      documentationMode(
        context.admissionStatus,
      ),
      backdatedEntryReason,
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.CONTEXT_RESOLVED,
      {
        admissionId:
          context.admissionId,
        wardId:
          context.location.wardId,
      },
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.ACCESS_AUTHORIZED,
      {
        accessMode:
          access.accessMode,
        assessmentType:
          input.assessmentType,
      },
    );

    const allocation =
      await this.support.allocateNumber(
        command.actor.facilityId,
        NURSING_MEDICATION_NUMBER_SEQUENCE_NAMESPACE.ASSESSMENT,
        'NAS',
        recordedAt,
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

    const rootAssessmentId =
      this.support.newId();

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
      await this.support.assessments.create({
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
        assessmentNumber:
          allocation.number,
        assessmentType:
          input.assessmentType,
        templateCode:
          input.templateCode == null
            ? null
            : this.support.normalizedCode(
                input.templateCode,
              ),
        templateVersion:
          input.templateVersion ?? null,
        sections:
          input.sections.map(
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
            input.summary,
          ),
        overallRiskLevel:
          input.overallRiskLevel,
        requiresEscalation:
          input.requiresEscalation,
        escalationReason:
          this.support.nullableText(
            input.escalationReason,
          ),
        assessedAt,
        recordedAt,
        backdatedEntryReason,
        assessedByUserId:
          actorUserId,
        assessedByStaffId:
          actorStaffId,
        status:
          'DRAFT',
        signedAt:
          null,
        signedByUserId:
          null,
        signedByStaffId:
          null,
        revisionNumber:
          1,
        rootAssessmentId:
          this.support.objectId(
            rootAssessmentId,
            'rootAssessmentId',
          ),
        supersedesAssessmentId:
          null,
        supersededByAssessmentId:
          null,
        correctionReason:
          null,
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

    const assessmentId =
      created._id.toHexString();

    await transaction.registerCompensation(
      deleteCreatedNursingRecordCompensation(
        `delete-nursing-assessment:${assessmentId}`,
        {
          facilityId:
            context.facilityId,
          collection:
            'nursingAssessments',
          entityId:
            assessmentId,
          expectedVersion:
            0,
          transactionId:
            transaction.transactionId,
        },
      ),
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.COMPENSATION_REGISTERED,
      {
        collection:
          'nursingAssessments',
        entityId:
          assessmentId,
      },
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
      {
        assessmentId,
        assessmentNumber:
          created.assessmentNumber,
      },
    );

    const payload =
      assessmentEventPayload(
        created,
      );

    await this.support.publishMutation({
      transaction,
      actor:
        command.actor,
      occurredAt:
        recordedAt,
      auditAction:
        NURSING_MEDICATION_AUDIT_ACTIONS.ASSESSMENT_CREATED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.ASSESSMENT_CREATED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.ASSESSMENT_WORKLIST_CHANGED,
      entityType:
        'NursingAssessment',
      entityId:
        assessmentId,
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

    return projectNursingAssessmentClinical(
      created,
    );
  }
}

export class SignNursingAssessmentWorkflow {
  public constructor(
    private readonly support:
      NursingMedicationCommandService,
  ) {}

  public async execute(
    command: NursingMedicationEntityCommand<SignNursingAssessmentInput>,
  ): Promise<NursingAssessmentClinicalView> {
    const input =
      signNursingAssessmentBodySchema.parse(
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
      'SIGNED',
    );

    await this.support.assertAccess(
      'ASSESSMENT_SIGN',
      command.actor,
      context,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        NURSING_MEDICATION_TRANSACTION_TYPES.SIGN_ASSESSMENT,
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
          'SIGN_ASSESSMENT',
          {
            context,
            assessmentId:
              command.entityId,
            targetStatus:
              'SIGNED',
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
    command: NursingMedicationEntityCommand<SignNursingAssessmentInput>,
    input: ReturnType<
      typeof signNursingAssessmentBodySchema.parse
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
      'SIGNED',
    );

    const access =
      await this.support.assertAccess(
        'ASSESSMENT_SIGN',
        command.actor,
        context,
      );

    const staffId =
      await this.support.actorStaffId(
        command.actor,
      );

    const occurredAt =
      this.support.dependencies.clock.now();

    assertNursingDocumentationAllowed(
      context,
      'CORRECTION',
      'Signing an existing nursing assessment',
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.LIFECYCLE_VALIDATED,
      {
        assessmentId:
          command.entityId,
        fromStatus:
          current.status,
        toStatus:
          'SIGNED',
      },
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
      await this.support.assessments.update(
        context.facilityId,
        command.entityId,
        current.version,
        [
          'DRAFT',
        ],
        {
          status:
            'SIGNED',
          signedAt:
            occurredAt,
          signedByUserId:
            actorUserId,
          signedByStaffId:
            actorStaffId,
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
        `restore-nursing-assessment:${command.entityId}`,
        restorePayload,
      ),
    );

    await transaction.checkpoint(
      NURSING_MEDICATION_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
      {
        assessmentId:
          command.entityId,
        version:
          updated.version,
        status:
          updated.status,
      },
    );

    const version =
      await this.support.assessments.createVersion({
        facilityId:
          updated.facilityId,
        admissionId:
          updated.admissionId,
        patientId:
          updated.patientId,
        encounterId:
          updated.encounterId,
        wardId:
          updated.wardId,
        roomId:
          updated.roomId,
        bedId:
          updated.bedId,
        transactionId:
          transaction.transactionId,
        correlationId:
          command.actor.correlationId,
        schemaVersion:
          1,
        createdBy:
          actorUserId,
        nursingAssessmentId:
          updated._id,
        rootAssessmentId:
          updated.rootAssessmentId,
        revisionNumber:
          updated.revisionNumber,
        snapshot:
          assessmentVersionSnapshot(
            updated as unknown as Record<string, unknown>,
          ),
        capturedAt:
          occurredAt,
        capturedByUserId:
          actorUserId,
        capturedByStaffId:
          actorStaffId,
        reason:
          'Nursing assessment signed',
      });

    await transaction.registerCompensation(
      deleteCreatedNursingRecordCompensation(
        `delete-nursing-assessment-version:${version._id.toHexString()}`,
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
          command.entityId,
        revisionNumber:
          updated.revisionNumber,
        versionId:
          version._id.toHexString(),
      },
    );

    const before =
      assessmentEventPayload(
        current,
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
        NURSING_MEDICATION_AUDIT_ACTIONS.ASSESSMENT_SIGNED,
      outboxEventType:
        NURSING_MEDICATION_OUTBOX_EVENTS.ASSESSMENT_SIGNED,
      realtimeEventType:
        NURSING_MEDICATION_REALTIME_EVENTS.ASSESSMENT_WORKLIST_CHANGED,
      entityType:
        'NursingAssessment',
      entityId:
        command.entityId,
      context,
      before,
      after,
      eventPayload:
        after,
      metadata: {
        accessMode:
          access.accessMode,
        revisionNumber:
          updated.revisionNumber,
      },
    });

    return projectNursingAssessmentClinical(
      updated,
    );
  }
}