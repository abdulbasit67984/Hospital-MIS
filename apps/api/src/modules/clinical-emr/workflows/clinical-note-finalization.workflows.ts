import {
  ClinicalDocumentSignatureRequiredError,
  ClinicalNoteConcurrencyError,
  InvalidClinicalDocumentTransitionError,
} from '../clinical-emr.errors.js';

import {
  toClinicalNoteMutationResult,
  type ClinicalNoteMutationResult,
} from '../clinical-emr.mapper.js';

import {
  clinicalNoteRestoreSnapshot,
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
  AmendClinicalNoteInput,
  ClinicalEmrActorContext,
  FinalizeClinicalNoteInput,
} from '../clinical-emr.types.js';

import {
  assertClinicalDocumentTransition,
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

export interface FinalizeClinicalNoteCommand {
  clinicalNoteId: string;
  input: FinalizeClinicalNoteInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface AmendClinicalNoteCommand {
  clinicalNoteId: string;
  input: AmendClinicalNoteInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class FinalizeClinicalNoteWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: FinalizeClinicalNoteCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );
    assertClinicalDocumentTransition(current.note.status, 'FINAL');

    await this.support.requireAuthorAttribution(
      command.actor,
      current.note.authorProviderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      current.note.confidentiality,
      'FINALIZE',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.FINALIZE_CLINICAL_NOTE,
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
      journalPayload: {
        ...safeClinicalNoteJournalPayload(
          'FINALIZE_CLINICAL_NOTE',
          {
            encounter: current.encounter,
            note: current.note,
            targetStatus: 'FINAL',
          },
        ),
        signatureMethod: command.input.signatureMethod ?? null,
      },
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: FinalizeClinicalNoteCommand,
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
    assertClinicalDocumentTransition(current.note.status, 'FINAL');

    await this.support.requireAuthorAttribution(
      command.actor,
      current.note.authorProviderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      current.note.confidentiality,
      'FINALIZE',
    );

    const hasMethod = command.input.signatureMethod != null;
    const hasDigest = command.input.signatureDigest != null;

    if (hasMethod !== hasDigest) {
      throw new ClinicalDocumentSignatureRequiredError();
    }

    const signatureMethod = command.input.signatureMethod ?? null;
    const signatureDigest = command.input.signatureDigest == null
      ? null
      : normalizeClinicalText(
          command.input.signatureDigest,
          'signatureDigest',
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

    const updated = await this.notes.finalizeWithVersion({
      facilityId: command.actor.facilityId,
      clinicalNoteId: command.clinicalNoteId,
      expectedVersion: current.note.version,
      nextClinicalVersion: current.note.currentVersion + 1,
      versionId,
      occurredAt,
      actorUserId: command.actor.userId,
      signatureMethod,
      signatureDigest,
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
        changeType: signatureDigest === null ? 'FINALIZED' : 'SIGNED',
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
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_FINALIZED,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_FINALIZED,
      before: current.note,
      after: updated,
      metadata: {
        signed: signatureDigest !== null,
        signatureMethod,
      },
    });

    return toClinicalNoteMutationResult(updated);
  }
}

export class AmendClinicalNoteWorkflow {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly support: ClinicalNoteCommandService,
  ) {}

  public async execute(
    command: AmendClinicalNoteCommand,
  ): Promise<ClinicalNoteMutationResult> {
    const current = await this.support.requireNote(
      command.actor,
      command.clinicalNoteId,
    );

    this.support.assertExpectedVersion(
      current.note,
      command.input.expectedVersion,
    );
    assertClinicalDocumentTransition(current.note.status, 'AMENDED');

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      command.input.confidentiality ?? current.note.confidentiality,
      'AMEND',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.AMEND_CLINICAL_NOTE,
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
        'AMEND_CLINICAL_NOTE',
        {
          encounter: current.encounter,
          note: current.note,
          targetStatus: 'AMENDED',
        },
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: AmendClinicalNoteCommand,
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

    try {
      assertClinicalDocumentTransition(current.note.status, 'AMENDED');
    } catch {
      throw new InvalidClinicalDocumentTransitionError(
        current.note.status,
        'AMENDED',
      );
    }

    const content = this.support.normalizeContent(command.input);
    const reason = normalizeClinicalText(
      command.input.reason,
      'reason',
    );

    await this.support.assertAccess(
      command.actor,
      current.encounter,
      current.note.documentType,
      content.confidentiality,
      'AMEND',
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

    const updated = await this.notes.amendWithVersion({
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
        changeType: 'AMENDED',
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
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.CLINICAL_NOTE_AMENDED,
      outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.CLINICAL_NOTE_AMENDED,
      before: current.note,
      after: updated,
      reason,
      metadata: {
        previousClinicalVersion: current.note.currentVersion,
        currentClinicalVersion: updated.currentVersion,
      },
    });

    return toClinicalNoteMutationResult(updated);
  }
}