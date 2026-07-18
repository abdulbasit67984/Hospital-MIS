import {
  InvalidEncounterTransitionError,
  PatientAllergyConcurrencyError,
} from '../clinical-emr.errors.js';

import {
  toPatientAllergyMutationResult,
  type PatientAllergyMutationResult,
} from '../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
  patientAllergyRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  patientAllergyAuditSnapshot,
} from '../clinical-emr.projections.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CorrectPatientAllergyInput,
  EncounterRecord,
  PatientAllergyRecord,
  RecordPatientAllergyInput,
  UpdatePatientAllergyInput,
} from '../clinical-emr.types.js';

import {
  assertPatientAllergyTransition,
  patientAllergyCreateLockKeys,
  patientAllergyMutationLockKeys,
  safePatientAllergyEventPayload,
  safePatientAllergyJournalPayload,
} from '../clinical-emr.workflow-helpers.js';

import type {
  NormalizedPatientAllergyInput,
  PatientAllergyCommandService,
} from '../services/patient-allergy-command.service.js';

const activeEncounterStatuses = new Set([
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
]);

function reasonForUpdate(
  input: UpdatePatientAllergyInput,
): string | null {
  const reason = input.reason?.trim() ?? '';

  if (input.status === 'ACTIVE') {
    return reason.length === 0 ? null : reason;
  }

  if (reason.length < 5) {
    throw new TypeError(
      `${input.status} allergy transitions require a reason of at least 5 characters`,
    );
  }

  return reason;
}

async function createAllergyRecord(
  input: Readonly<{
    support: PatientAllergyCommandService;
    normalized: NormalizedPatientAllergyInput;
    encounter: EncounterRecord;
    patientId: string;
    actor: ClinicalEmrActorContext;
    transaction: ClinicalEmrTransactionContext;
    occurredAt: Date;
    supersedesPatientAllergyId?: string | null;
    patientAllergyId?: string;
    versionId?: string;
  }>,
): Promise<PatientAllergyRecord> {
  const patientAllergyId =
    input.patientAllergyId ?? input.support.common.newId();
  const versionId = input.versionId ?? input.support.common.newId();

  const created = await input.support.allergies.create({
    patientAllergyId,
    initialVersionId: versionId,
    facilityId: input.actor.facilityId,
    patientId: input.patientId,
    recordType: input.normalized.recordType,
    allergyId: input.normalized.allergyId,
    category: input.normalized.category,
    allergenText: input.normalized.allergenText,
    verificationStatus: input.normalized.verificationStatus,
    severity: input.normalized.severity,
    reactions: input.normalized.reactions,
    onsetDate: input.normalized.onsetDate,
    lastReactionAt: input.normalized.lastReactionAt,
    clinicalNoteId: input.normalized.clinicalNoteId,
    sourceEncounterId: input.encounter._id.toHexString(),
    notes: input.normalized.notes,
    recordedAt: input.occurredAt,
    recordedBy: input.actor.userId,
    supersedesPatientAllergyId:
      input.supersedesPatientAllergyId ?? null,
    transactionId: input.transaction.transactionId,
    correlationId: input.actor.correlationId,
  });

  await input.transaction.registerCompensation(
    deleteCreatedClinicalRecordCompensation({
      key: `delete-patient-allergy:${patientAllergyId}`,
      collection: 'patientAllergies',
      entityId: patientAllergyId,
      expectedVersion: 0,
      transactionId: input.transaction.transactionId,
    }),
  );

  await input.transaction.checkpoint(
    CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
    {
      patientAllergyId,
      patientId: input.patientId,
    },
  );

  await input.support.appendVersion(
    {
      versionId,
      allergy: created,
      previousVersionId: null,
      changeReason: null,
      occurredAt: input.occurredAt,
      actor: input.actor,
    },
    input.transaction,
  );

  return created;
}

async function publishAllergyMutation(
  input: Readonly<{
    support: PatientAllergyCommandService;
    transaction: ClinicalEmrTransactionContext;
    actor: ClinicalEmrActorContext;
    occurredAt: Date;
    auditAction: string;
    before: PatientAllergyRecord | null;
    after: PatientAllergyRecord;
    providerId: string;
    reason?: string;
  }>,
): Promise<void> {
  await input.support.common.publishMutation({
    transaction: input.transaction,
    actor: input.actor,
    occurredAt: input.occurredAt,
    auditAction: input.auditAction,
    outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.ALLERGY_LIST_CHANGED,
    realtimeEventTypes: [
      CLINICAL_EMR_REALTIME_EVENTS.ALLERGY_WARNING_CHANGED,
      CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
    ],
    aggregateType: 'PatientAllergy',
    entityType: 'PatientAllergy',
    entityId: input.after._id.toHexString(),
    patientId: input.after.patientId.toHexString(),
    encounterId: input.after.sourceEncounterId?.toHexString() ?? null,
    providerId: input.providerId,
    before: input.before,
    after: input.after,
    beforeSnapshot: patientAllergyAuditSnapshot,
    afterSnapshot: patientAllergyAuditSnapshot,
    eventPayload: safePatientAllergyEventPayload,
    ...(input.reason === undefined
      ? {}
      : {
          reason: input.reason,
        }),
  });
}

export interface RecordPatientAllergyCommand {
  input: RecordPatientAllergyInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class RecordPatientAllergyWorkflow {
  public constructor(
    private readonly support: PatientAllergyCommandService,
  ) {}

  public async execute(
    command: RecordPatientAllergyCommand,
  ): Promise<PatientAllergyMutationResult> {
    const context = await this.support.resolveWriteContext(
      command.actor,
      command.input.patientId,
      command.input.sourceEncounterId,
    );

    if (!activeEncounterStatuses.has(context.encounter.status)) {
      throw new InvalidEncounterTransitionError(
        context.encounter.status,
        'IN_PROGRESS',
      );
    }

    const providerId = await this.support.common.requireProvider(
      command.actor,
    );
    await this.support.common.assertAccess(
      command.actor,
      context.encounter,
      'CREATE',
    );

    const normalized = await this.support.normalizeInput(
      command.actor,
      command.input,
    );

    await this.support.common.requireClinicalNoteReference(
      command.actor,
      context.encounter,
      normalized.clinicalNoteId,
    );
    await this.support.assertNoKnownConflict(
      command.actor,
      context.patientId,
      normalized,
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.RECORD_PATIENT_ALLERGY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientAllergyCreateLockKeys(
        command.actor.facilityId,
        context.patientId,
        normalized.recordType,
        normalized.category,
        normalized.allergenText,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safePatientAllergyJournalPayload(
        'RECORD_PATIENT_ALLERGY',
        context.patientId,
      ),
      execute: async (transaction) => {
        const currentContext = await this.support.resolveWriteContext(
          command.actor,
          command.input.patientId,
          command.input.sourceEncounterId,
        );

        if (!activeEncounterStatuses.has(currentContext.encounter.status)) {
          throw new InvalidEncounterTransitionError(
            currentContext.encounter.status,
            'IN_PROGRESS',
          );
        }

        await this.support.assertNoKnownConflict(
          command.actor,
          currentContext.patientId,
          normalized,
        );

        const occurredAt = this.support.common.dependencies.clock.now();
        const created = await createAllergyRecord({
          support: this.support,
          normalized,
          encounter: currentContext.encounter,
          patientId: currentContext.patientId,
          actor: command.actor,
          transaction,
          occurredAt,
        });

        await this.support.common.touchEncounter({
          encounter: currentContext.encounter,
          occurredAt,
          actor: command.actor,
          transaction,
        });

        await publishAllergyMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.ALLERGY_RECORDED,
          before: null,
          after: created,
          providerId,
        });

        return toPatientAllergyMutationResult(created);
      },
    });
  }
}

export interface UpdatePatientAllergyCommand {
  patientAllergyId: string;
  input: UpdatePatientAllergyInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class UpdatePatientAllergyWorkflow {
  public constructor(
    private readonly support: PatientAllergyCommandService,
  ) {}

  public async execute(
    command: UpdatePatientAllergyCommand,
  ): Promise<PatientAllergyMutationResult> {
    const existing = await this.support.requireAllergy(
      command.actor,
      command.patientAllergyId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );
    assertPatientAllergyTransition(existing.status, command.input.status);

    const context = await this.support.resolveWriteContext(
      command.actor,
      existing.patientId.toHexString(),
      existing.sourceEncounterId?.toHexString() ?? null,
    );
    const providerId = await this.support.common.requireProvider(
      command.actor,
    );
    await this.support.common.assertAccess(
      command.actor,
      context.encounter,
      command.input.status === 'ENTERED_IN_ERROR'
        ? 'CORRECT'
        : 'UPDATE',
    );

    const normalized = await this.support.normalizeInput(
      command.actor,
      {
        recordType: existing.recordType,
        allergyId: existing.allergyId?.toHexString() ?? null,
        category: existing.category,
        allergenText: existing.allergenText,
        verificationStatus: command.input.verificationStatus,
        severity: command.input.severity,
        reactions: command.input.reactions,
        onsetDate:
          command.input.onsetDate === undefined
            ? existing.onsetDate
            : command.input.onsetDate,
        lastReactionAt:
          command.input.lastReactionAt === undefined
            ? existing.lastReactionAt?.toISOString() ?? null
            : command.input.lastReactionAt,
        clinicalNoteId: existing.clinicalNoteId?.toHexString() ?? null,
        notes:
          command.input.notes === undefined
            ? existing.notes
            : command.input.notes,
      },
    );

    if (command.input.status === 'ACTIVE') {
      await this.support.assertNoKnownConflict(
        command.actor,
        context.patientId,
        normalized,
        command.patientAllergyId,
      );
    }

    return this.support.common.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.UPDATE_PATIENT_ALLERGY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientAllergyMutationLockKeys(
        command.actor.facilityId,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        patientAllergyId: command.patientAllergyId,
        input: command.input,
      },
      journalPayload: safePatientAllergyJournalPayload(
        'UPDATE_PATIENT_ALLERGY',
        context.patientId,
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireAllergy(
          command.actor,
          command.patientAllergyId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );
        assertPatientAllergyTransition(current.status, command.input.status);

        if (command.input.status === 'ACTIVE') {
          await this.support.assertNoKnownConflict(
            command.actor,
            context.patientId,
            normalized,
            command.patientAllergyId,
          );
        }

        const occurredAt = this.support.common.dependencies.clock.now();
        const versionId = this.support.common.newId();
        const reason = reasonForUpdate(command.input);
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'patientAllergies',
          entityId: command.patientAllergyId,
          expectedPostVersion: current.version + 1,
          snapshot: patientAllergyRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const updated = await this.support.allergies.updateWithVersion({
          facilityId: command.actor.facilityId,
          patientAllergyId: command.patientAllergyId,
          expectedVersion: current.version,
          nextClinicalVersion: current.currentVersion + 1,
          versionId,
          recordType: current.recordType,
          category: current.category,
          allergenText: current.allergenText,
          status: command.input.status,
          verificationStatus: normalized.verificationStatus,
          severity: normalized.severity,
          reactions: normalized.reactions,
          onsetDate: normalized.onsetDate,
          lastReactionAt: normalized.lastReactionAt,
          notes: normalized.notes,
          reason,
          occurredAt,
          actorUserId: command.actor.userId,
        });

        if (updated === null) {
          throw new PatientAllergyConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-patient-allergy:${command.patientAllergyId}:${updated.version}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            patientAllergyId: command.patientAllergyId,
            status: updated.status,
            currentVersion: updated.currentVersion,
          },
        );

        await this.support.appendVersion(
          {
            versionId,
            allergy: updated,
            previousVersionId:
              current.latestVersionId?.toHexString() ?? null,
            changeReason: reason,
            occurredAt,
            actor: command.actor,
          },
          transaction,
        );

        await publishAllergyMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.ALLERGY_UPDATED,
          before: current,
          after: updated,
          providerId,
          ...(reason === null ? {} : { reason }),
        });

        return toPatientAllergyMutationResult(updated);
      },
    });
  }
}

export interface CorrectPatientAllergyCommand {
  patientAllergyId: string;
  input: CorrectPatientAllergyInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface CorrectPatientAllergyResult {
  original: PatientAllergyMutationResult;
  replacement: PatientAllergyMutationResult;
}

export class CorrectPatientAllergyWorkflow {
  public constructor(
    private readonly support: PatientAllergyCommandService,
  ) {}

  public async execute(
    command: CorrectPatientAllergyCommand,
  ): Promise<CorrectPatientAllergyResult> {
    const existing = await this.support.requireAllergy(
      command.actor,
      command.patientAllergyId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );

    const context = await this.support.resolveWriteContext(
      command.actor,
      existing.patientId.toHexString(),
      existing.sourceEncounterId?.toHexString() ?? null,
    );
    const providerId = await this.support.common.requireProvider(
      command.actor,
    );
    await this.support.common.assertAccess(
      command.actor,
      context.encounter,
      'CORRECT',
    );

    const normalized = await this.support.normalizeInput(
      command.actor,
      command.input.replacement,
    );
    await this.support.assertNoKnownConflict(
      command.actor,
      context.patientId,
      normalized,
      command.patientAllergyId,
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_PATIENT_ALLERGY,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientAllergyMutationLockKeys(
        command.actor.facilityId,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        patientAllergyId: command.patientAllergyId,
        input: command.input,
      },
      journalPayload: safePatientAllergyJournalPayload(
        'CORRECT_PATIENT_ALLERGY',
        context.patientId,
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireAllergy(
          command.actor,
          command.patientAllergyId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );

        await this.support.assertNoKnownConflict(
          command.actor,
          context.patientId,
          normalized,
          command.patientAllergyId,
        );

        const reason = command.input.reason.trim();

        if (reason.length < 5) {
          throw new TypeError(
            'Allergy correction reason must contain at least 5 characters',
          );
        }

        const occurredAt = this.support.common.dependencies.clock.now();
        const originalVersionId = this.support.common.newId();
        const replacementAllergyId = this.support.common.newId();
        const replacementVersionId = this.support.common.newId();
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'patientAllergies',
          entityId: command.patientAllergyId,
          expectedPostVersion: current.version + 1,
          snapshot: patientAllergyRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const corrected =
          await this.support.allergies.markCorrectedWithVersion({
            facilityId: command.actor.facilityId,
            patientAllergyId: command.patientAllergyId,
            expectedVersion: current.version,
            nextClinicalVersion: current.currentVersion + 1,
            versionId: originalVersionId,
            replacementPatientAllergyId: replacementAllergyId,
            reason,
            actorUserId: command.actor.userId,
          });

        if (corrected === null) {
          throw new PatientAllergyConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-patient-allergy:${command.patientAllergyId}:${corrected.version}`,
            restorePayload,
          ),
        );

        await this.support.appendVersion(
          {
            versionId: originalVersionId,
            allergy: corrected,
            previousVersionId:
              current.latestVersionId?.toHexString() ?? null,
            changeReason: reason,
            occurredAt,
            actor: command.actor,
          },
          transaction,
        );

        const replacement = await createAllergyRecord({
          support: this.support,
          normalized,
          encounter: context.encounter,
          patientId: context.patientId,
          actor: command.actor,
          transaction,
          occurredAt,
          supersedesPatientAllergyId: command.patientAllergyId,
          patientAllergyId: replacementAllergyId,
          versionId: replacementVersionId,
        });

        if (activeEncounterStatuses.has(context.encounter.status)) {
          await this.support.common.touchEncounter({
            encounter: context.encounter,
            occurredAt,
            actor: command.actor,
            transaction,
          });
        }

        await publishAllergyMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.ALLERGY_CORRECTED,
          before: current,
          after: corrected,
          providerId,
          reason,
        });

        await publishAllergyMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.ALLERGY_RECORDED,
          before: null,
          after: replacement,
          providerId,
        });

        return {
          original: toPatientAllergyMutationResult(corrected),
          replacement: toPatientAllergyMutationResult(replacement),
        };
      },
    });
  }
}