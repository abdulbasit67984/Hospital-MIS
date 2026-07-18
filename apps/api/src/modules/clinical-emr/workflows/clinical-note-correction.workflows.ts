import {
  ClinicalAddendumConflictError,
  ClinicalCorrectionConflictError,
  ClinicalNoteConcurrencyError,
} from '../clinical-emr.errors.js';

import {
  toClinicalNoteMutationResult,
  type ClinicalNoteMutationResult,
} from '../clinical-emr.mapper.js';

import {
  clinicalNoteRestoreSnapshot,
  deleteCreatedClinicalRecordCompensation,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../clinical-emr.transaction.constants.js';

import type {
  AddClinicalNoteAddendumInput,
  ClinicalEmrActorContext,
  CorrectClinicalNoteInput,
  EnterClinicalNoteInErrorInput,
} from '../clinical-emr.types.js';

import {
  assertClinicalDocumentTransition,
  clinicalNoteCreateLockKeys,
  clinicalNoteMutationLockKeys,
  safeClinicalNoteJournalPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  normalizeClinicalText,
} from '../clinical-emr.normalization.js';

import type {
  ClinicalNoteRepository,
} from '../repositories/clinical-note.repository.js';

import type {
  ClinicalNoteCommandService,
} from '../services/clinical-note-command.service.js';

export interface CorrectClinicalNoteCommand {
  clinicalNoteId: string;
  input: CorrectClinicalNoteInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface CorrectClinicalNoteResult {
  corrected: ClinicalNoteMutationResult;
  replacement: ClinicalNoteMutationResult;
}

export interface AddClinicalNoteAddendumCommand {
  input: AddClinicalNoteAddendumInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface EnterClinicalNoteInErrorCommand {
  clinicalNoteId: string;
  input: EnterClinicalNoteInErrorInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class CorrectClinicalNoteWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: CorrectClinicalNoteCommand,
  ): Promise<CorrectClinicalNoteResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );

    try {
      assertClinicalDocumentTransition(current.note.status, 'CORRECTED');
    } catch {
      throw new ClinicalCorrectionConflictError();
    }

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      command.input.confidentiality ?? current.note.confidentiality,
      'CORRECT',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_CLINICAL_NOTE,
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
        'CORRECT_CLINICAL_NOTE',
        {
          encounter: current.encounter,
          note: current.note,
          targetStatus: 'CORRECTED',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: CorrectClinicalNoteCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<CorrectClinicalNoteResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );

    try {
      assertClinicalDocumentTransition(current.note.status, 'CORRECTED');
    } catch {
      throw new ClinicalCorrectionConflictError();
    }

    const content = this.support.normalizeContent(command.input);
    const reason = normalizeClinicalText(command.input.reason, 'reason');
    const replacementAuthorProviderId =
      await this.support.resolveActorProvider(command.actor);

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      content.confidentiality,
      'CORRECT',
    );

    const occurredAt = this.support.dependencies.clock.now();
    const number = await this.support.allocateNoteNumber(current.encounter);
    const replacementNoteId = this.support.newId();
    const replacementInitialVersionId = this.support.newId();
    const replacementFinalVersionId = this.support.newId();
    const originalCorrectionVersionId = this.support.newId();

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.NUMBER_ALLOCATED,
      {
        sequenceKey: number.sequenceKey,
        sequenceValue: number.sequenceValue,
      },
    );

    const replacementDraft = await this.notes.create({
      noteId: replacementNoteId,
      initialVersionId: replacementInitialVersionId,
      facilityId: command.actor.facilityId,
      noteNumber: number.number,
      encounterId: current.encounter._id.toHexString(),
      patientId: current.encounter.patientId.toHexString(),
      authorProviderId: replacementAuthorProviderId,
      documentType: current.note.documentType,
      title: content.title,
      narrativeText: content.narrativeText,
      structuredData: content.structuredData,
      confidentiality: content.confidentiality,
      restrictionReason: content.restrictionReason,
      supersedesNoteId: current.note._id.toHexString(),
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
      actorUserId: command.actor.userId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-clinical-note:${replacementNoteId}`,
        collection: 'clinicalNotes',
        entityId: replacementNoteId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await this.support.appendVersion(
      {
        versionId: replacementInitialVersionId,
        note: replacementDraft,
        previousVersionId: null,
        changeType: 'CREATED',
        changeReason: reason,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    const replacementRestorePayload = protectedClinicalEmrRestorePayload({
      collection: 'clinicalNotes',
      entityId: replacementNoteId,
      expectedPostVersion: 1,
      snapshot: clinicalNoteRestoreSnapshot(replacementDraft),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.support.dependencies.snapshotCrypto,
    });

    const replacementFinal = await this.notes.finalizeWithVersion({
      facilityId: command.actor.facilityId,
      clinicalNoteId: replacementNoteId,
      expectedVersion: 0,
      nextClinicalVersion: 2,
      versionId: replacementFinalVersionId,
      occurredAt,
      actorUserId: command.actor.userId,
      signatureMethod: null,
      signatureDigest: null,
    });

    if (replacementFinal === null) {
      throw new ClinicalNoteConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-replacement-note:${replacementNoteId}`,
        replacementRestorePayload,
      ),
    );

    await this.support.appendVersion(
      {
        versionId: replacementFinalVersionId,
        note: replacementFinal,
        previousVersionId: replacementInitialVersionId,
        changeType: 'FINALIZED',
        changeReason: reason,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    const originalRestorePayload = protectedClinicalEmrRestorePayload({
      collection: 'clinicalNotes',
      entityId: command.clinicalNoteId,
      expectedPostVersion: current.note.version + 1,
      snapshot: clinicalNoteRestoreSnapshot(current.note),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.support.dependencies.snapshotCrypto,
    });

    const corrected = await this.notes.markCorrectedWithVersion({
      facilityId: command.actor.facilityId,
      clinicalNoteId: command.clinicalNoteId,
      expectedVersion: current.note.version,
      nextClinicalVersion: current.note.currentVersion + 1,
      versionId: originalCorrectionVersionId,
      replacementNoteId,
      reason,
      occurredAt,
      actorUserId: command.actor.userId,
    });

    if (corrected === null) {
      throw new ClinicalNoteConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-original-note:${command.clinicalNoteId}`,
        originalRestorePayload,
      ),
    );

    await this.support.appendVersion(
      {
        versionId: originalCorrectionVersionId,
        note: corrected,
        previousVersionId: current.note.latestVersionId?.toHexString() ?? null,
        changeType: 'CORRECTED',
        changeReason: reason,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    await this.support.touchEncounter({
      encounter: current.encounter,
      latestClinicalNoteId: replacementNoteId,
      occurredAt,
      actor: command.actor,
      transaction,
      incrementAmendmentCount: true,
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_CREATED,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_CREATED,
      before: null,
      after: replacementFinal,
      reason,
      metadata: {
        correctionReplacement: true,
        supersedesNoteId: command.clinicalNoteId,
      },
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_CORRECTED,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_CORRECTED,
      before: current.note,
      after: corrected,
      reason,
      metadata: {
        replacementNoteId,
      },
    });

    return {
      corrected: toClinicalNoteMutationResult(corrected),
      replacement: toClinicalNoteMutationResult(replacementFinal),
    };
  }
}

export class AddClinicalNoteAddendumWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: AddClinicalNoteAddendumCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const parent = await this.support.requireNote(
      command.actor,
      command.input.parentNoteId,
    );

    if (!['FINAL', 'AMENDED'].includes(parent.note.status)) {
      throw new ClinicalAddendumConflictError();
    }

    await this.support.requireAuthorAttribution(
      command.actor,
      command.input.authorProviderId,
    );

    await this.support.assertAccess(
      command.actor,
      parent.encounter,
      'ADDENDUM',
      command.input.confidentiality ?? parent.note.confidentiality,
      'AMEND',
    );

    const lockKeys = [
      ...new Set([
        ...clinicalNoteCreateLockKeys(
          command.actor.facilityId,
          parent.encounter,
        ),
        ...clinicalNoteMutationLockKeys(
          command.actor.facilityId,
          parent.encounter,
          parent.note,
        ),
      ]),
    ];

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.ADD_CLINICAL_NOTE_ADDENDUM,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys,
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safeClinicalNoteJournalPayload(
        'ADD_CLINICAL_NOTE_ADDENDUM',
        {
          encounter: parent.encounter,
          note: parent.note,
          documentType: 'ADDENDUM',
          targetStatus: 'DRAFT',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: AddClinicalNoteAddendumCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalNoteMutationResult> {
    const parent = await this.support.requireNote(
      command.actor,
      command.input.parentNoteId,
    );

    if (!['FINAL', 'AMENDED'].includes(parent.note.status)) {
      throw new ClinicalAddendumConflictError();
    }

    await this.support.requireAuthorAttribution(
      command.actor,
      command.input.authorProviderId,
    );

    const content = this.support.normalizeContent(command.input);

    await this.support.assertAccess(
      command.actor,
      parent.encounter,
      'ADDENDUM',
      content.confidentiality,
      'AMEND',
    );

    const number = await this.support.allocateNoteNumber(parent.encounter);
    const noteId = this.support.newId();
    const versionId = this.support.newId();
    const occurredAt = this.support.dependencies.clock.now();

    const created = await this.notes.create({
      noteId,
      initialVersionId: versionId,
      facilityId: command.actor.facilityId,
      noteNumber: number.number,
      encounterId: parent.encounter._id.toHexString(),
      patientId: parent.encounter.patientId.toHexString(),
      authorProviderId: command.input.authorProviderId,
      documentType: 'ADDENDUM',
      title: content.title,
      narrativeText: content.narrativeText,
      structuredData: content.structuredData,
      confidentiality: content.confidentiality,
      restrictionReason: content.restrictionReason,
      addendumToNoteId: parent.note._id.toHexString(),
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

    await this.support.appendVersion(
      {
        versionId,
        note: created,
        previousVersionId: null,
        changeType: 'ADDENDUM',
        changeReason: null,
        recordedAt: occurredAt,
        actor: command.actor,
      },
      transaction,
    );

    await this.support.touchEncounter({
      encounter: parent.encounter,
      latestClinicalNoteId: noteId,
      occurredAt,
      actor: command.actor,
      transaction,
      incrementAmendmentCount: true,
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction:
        CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_ADDENDUM_CREATED,
      outboxEventType:
        CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_ADDENDUM_CREATED,
      before: null,
      after: created,
      metadata: {
        parentNoteId: parent.note._id.toHexString(),
        parentNoteStatus: parent.note.status,
      },
    });

    return toClinicalNoteMutationResult(created);
  }
}

export class EnterClinicalNoteInErrorWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: EnterClinicalNoteInErrorCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );
    assertClinicalDocumentTransition(
      current.note.status,
      'ENTERED_IN_ERROR',
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      current.note.confidentiality,
      'CORRECT',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.ENTER_CLINICAL_NOTE_IN_ERROR,
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
        'ENTER_CLINICAL_NOTE_IN_ERROR',
        {
          encounter: current.encounter,
          note: current.note,
          targetStatus: 'ENTERED_IN_ERROR',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: EnterClinicalNoteInErrorCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );
    assertClinicalDocumentTransition(
      current.note.status,
      'ENTERED_IN_ERROR',
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      current.note.confidentiality,
      'CORRECT',
    );

    const occurredAt = this.support.dependencies.clock.now();
    const reason = normalizeClinicalText(command.input.reason, 'reason');
    const versionId = this.support.newId();
    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'clinicalNotes',
      entityId: command.clinicalNoteId,
      expectedPostVersion: current.note.version + 1,
      snapshot: clinicalNoteRestoreSnapshot(current.note),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.support.dependencies.snapshotCrypto,
    });

    const updated = await this.notes.markEnteredInErrorWithVersion({
      facilityId: command.actor.facilityId,
      clinicalNoteId: command.clinicalNoteId,
      expectedVersion: current.note.version,
      nextClinicalVersion: current.note.currentVersion + 1,
      versionId,
      reason,
      occurredAt,
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
        status: updated.status,
        currentVersion: updated.currentVersion,
      },
    );

    await this.support.appendVersion(
      {
        versionId,
        note: updated,
        previousVersionId: current.note.latestVersionId?.toHexString() ?? null,
        changeType: 'ENTERED_IN_ERROR',
        changeReason: reason,
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
      incrementAmendmentCount: true,
    });

    await this.support.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction:
        CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_ENTERED_IN_ERROR,
      outboxEventType:
        CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_ENTERED_IN_ERROR,
      before: current.note,
      after: updated,
      reason,
      metadata: {
        previousStatus: current.note.status,
      },
    });

    return toClinicalNoteMutationResult(updated);
  }
}