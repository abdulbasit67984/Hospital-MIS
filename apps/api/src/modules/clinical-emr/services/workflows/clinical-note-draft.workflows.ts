import {
  ClinicalNoteConcurrencyError,
  FinalizedClinicalDocumentImmutableError,
  InvalidEncounterTransitionError,
} from '../../clinical-emr.errors.js';

import {
  toClinicalNoteMutationResult,
  type ClinicalNoteMutationResult,
} from '../../clinical-emr.mapper.js';

import {
  clinicalNoteRestoreSnapshot,
  deleteCreatedClinicalRecordCompensation,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../../clinical-emr.ports.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CreateClinicalNoteInput,
  UpdateClinicalNoteInput,
} from '../../clinical-emr.types.js';

import {
  clinicalNoteCreateLockKeys,
  clinicalNoteMutationLockKeys,
  safeClinicalNoteJournalPayload,
} from '../../clinical-emr.workflow-helpers.js';

import type {
  ClinicalNoteRepository,
} from '../../repositories/clinical-note.repository.js';

import type {
  ClinicalNoteCommandService,
} from '../clinical-note-command.service.js';

export interface CreateClinicalNoteCommand {
  input: CreateClinicalNoteInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface UpdateClinicalNoteDraftCommand {
  clinicalNoteId: string;
  input: UpdateClinicalNoteInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

const draftableEncounterStatuses = new Set([
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
]);

export class CreateClinicalNoteWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: CreateClinicalNoteCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const encounter = await this.support.requireEncounter(
      command.actor,
      command.input.encounterId,
    );

    if (!draftableEncounterStatuses.has(encounter.status)) {
      throw new InvalidEncounterTransitionError(
        encounter.status,
        'IN_PROGRESS',
      );
    }

    await this.support.requireAuthorAttribution(
      command.actor,
      command.input.authorProviderId,
    );

    await this.support.assertAccess(
      command.actor,
      encounter,
      command.input.documentType,
      command.input.confidentiality ?? 'ROUTINE',
      'CREATE',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CREATE_CLINICAL_NOTE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: clinicalNoteCreateLockKeys(
        command.actor.facilityId,
        encounter,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safeClinicalNoteJournalPayload(
        'CREATE_CLINICAL_NOTE',
        {
          encounter,
          documentType: command.input.documentType,
          confidentiality: command.input.confidentiality ?? 'ROUTINE',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: CreateClinicalNoteCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalNoteMutationResult> {
    const encounter = await this.support.requireEncounter(
      command.actor,
      command.input.encounterId,
    );

    if (!draftableEncounterStatuses.has(encounter.status)) {
      throw new InvalidEncounterTransitionError(
        encounter.status,
        'IN_PROGRESS',
      );
    }

    await this.support.requireAuthorAttribution(
      command.actor,
      command.input.authorProviderId,
    );

    const content = this.support.normalizeContent(command.input);

    await this.support.assertAccess(
      command.actor,
      encounter,
      command.input.documentType,
      content.confidentiality,
      'CREATE',
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.ACCESS_AUTHORIZED,
      {
        encounterId: encounter._id.toHexString(),
        documentType: command.input.documentType,
      },
    );

    const number = await this.support.allocateNoteNumber(encounter);
    const noteId = this.support.newId();
    const versionId = this.support.newId();
    const occurredAt = this.support.dependencies.clock.now();

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.NUMBER_ALLOCATED,
      {
        sequenceKey: number.sequenceKey,
        sequenceValue: number.sequenceValue,
      },
    );

    const created = await this.notes.create({
      noteId,
      initialVersionId: versionId,
      facilityId: command.actor.facilityId,
      noteNumber: number.number,
      encounterId: encounter._id.toHexString(),
      patientId: encounter.patientId.toHexString(),
      authorProviderId: command.input.authorProviderId,
      documentType: command.input.documentType,
      title: content.title,
      narrativeText: content.narrativeText,
      structuredData: content.structuredData,
      confidentiality: content.confidentiality,
      restrictionReason: content.restrictionReason,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
      actorUserId: command.actor.userId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-clinical-note:${noteId}`,
        collection: 'clinicalNotes',
        entityId: noteId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
      {
        clinicalNoteId: noteId,
        noteNumber: created.noteNumber,
      },
    );

    await this.support.appendVersion(
      {
        versionId,
        note: created,
        previousVersionId: null,
        changeType: 'CREATED',
        changeReason: null,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    await this.support.touchEncounter({
      encounter,
      latestClinicalNoteId: noteId,
      occurredAt,
      actor: command.actor,
      transaction,
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_CREATED,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_CREATED,
      before: null,
      after: created,
      metadata: {
        documentType: created.documentType,
        status: created.status,
      },
    });

    return toClinicalNoteMutationResult(created);
  }
}

export class UpdateClinicalNoteDraftWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: UpdateClinicalNoteDraftCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    if (current.note.status !== 'DRAFT') {
      throw new FinalizedClinicalDocumentImmutableError();
    }

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      current.note.confidentiality,
      'UPDATE',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.UPDATE_CLINICAL_NOTE_DRAFT,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: clinicalNoteMutationLockKeys(
        command.actor.facilityId,
        current.encounter,
        current.note,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        clinicalNoteId: command.clinicalNoteId,
        input: command.input,
      },
      journalPayload: safeClinicalNoteJournalPayload(
        'UPDATE_CLINICAL_NOTE_DRAFT',
        {
          encounter: current.encounter,
          note: current.note,
          targetStatus: 'DRAFT',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: UpdateClinicalNoteDraftCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    if (current.note.status !== 'DRAFT') {
      throw new FinalizedClinicalDocumentImmutableError();
    }

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );

    const content = this.support.normalizeContent(command.input);

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      content.confidentiality,
      'UPDATE',
    );

    const occurredAt = this.support.dependencies.clock.now();
    const versionId = this.support.newId();
    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'clinicalNotes',
      entityId: command.clinicalNoteId,
      expectedPostVersion: current.note.version + 1,
      snapshot: clinicalNoteRestoreSnapshot(current.note),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.support.dependencies.snapshotCrypto,
    });

    const updated = await this.notes.updateDraftWithVersion({
      facilityId: command.actor.facilityId,
      clinicalNoteId: command.clinicalNoteId,
      expectedVersion: current.note.version,
      nextClinicalVersion: current.note.currentVersion + 1,
      versionId,
      title: content.title,
      narrativeText: content.narrativeText,
      structuredData: content.structuredData,
      confidentiality: content.confidentiality,
      restrictionReason: content.restrictionReason,
      actorUserId: command.actor.userId,
    });

    if (updated === null) {
      throw new ClinicalNoteConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-clinical-note:${command.clinicalNoteId}`,
        restorePayload,
      ),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
      {
        clinicalNoteId: command.clinicalNoteId,
        currentVersion: updated.currentVersion,
        version: updated.version,
      },
    );

    await this.support.appendVersion(
      {
        versionId,
        note: updated,
        previousVersionId: current.note.latestVersionId?.toHexString() ?? null,
        changeType: 'UPDATED',
        changeReason: null,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    await this.support.touchEncounter({
      encounter: current.encounter,
      latestClinicalNoteId: command.clinicalNoteId,
      occurredAt,
      actor: command.actor,
      transaction,
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_UPDATED,
      outboxEventType:
        CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_DRAFT_UPDATED,
      before: current.note,
      after: updated,
      metadata: {
        documentType: updated.documentType,
        currentVersion: updated.currentVersion,
      },
    });

    return toClinicalNoteMutationResult(updated);
  }
}