import type {
  ClinicalDocumentVersionChangeType,
} from '@hospital-mis/database';

import {
  ClinicalEmrMinimumNecessaryAccessError,
  ClinicalNoteConcurrencyError,
  ClinicalNoteNotFoundError,
  EncounterConcurrencyError,
  EncounterNotFoundError,
} from '../clinical-emr.errors.js';

import {
  deleteCreatedClinicalRecordCompensation,
  encounterRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import {
  buildClinicalEmrAuditActorFields,
  type ClinicalEmrMutationDependencies,
  type ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  clinicalNoteAuditSnapshot,
} from '../clinical-emr.projections.js';

import {
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalDocumentContentInput,
  ClinicalEmrActorContext,
  ClinicalNoteRecord,
  EncounterRecord,
} from '../clinical-emr.types.js';

import {
  clinicalEmrDeduplicationKey,
  clinicalNoteContentAssociatedData,
  clinicalNoteVersionAssociatedData,
  newClinicalEmrObjectIdString,
  safeClinicalNoteEventPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  normalizeOptionalClinicalText,
} from '../clinical-emr.normalization.js';

import type {
  ClinicalNoteRepository,
  ClinicalNoteVersionRepository,
} from '../repositories/clinical-note.repository.js';

import type {
  EncounterRepository,
} from '../repositories/encounter.repository.js';

import type {
  ClinicalEmrNumberService,
} from './clinical-emr-number.service.js';

import type {
  ClinicalNoteAttributionService,
} from './clinical-note-attribution.service.js';

export interface NormalizedClinicalNoteContent {
  title: string | null;
  narrativeText: string | null;
  structuredData: Record<string, unknown> | readonly unknown[] | null;
  confidentiality: ClinicalNoteRecord['confidentiality'];
  restrictionReason: string | null;
}

export interface ClinicalNoteWithEncounter {
  note: ClinicalNoteRecord;
  encounter: EncounterRecord;
}

export interface ClinicalNoteVersionAppendInput {
  versionId: string;
  note: ClinicalNoteRecord;
  previousVersionId: string | null;
  changeType: ClinicalDocumentVersionChangeType;
  changeReason: string | null;
  recordedAt: Date;
  actor: ClinicalEmrActorContext;
}

export interface ClinicalNoteMutationPublicationInput {
  transaction: ClinicalEmrTransactionContext;
  actor: ClinicalEmrActorContext;
  occurredAt: Date;
  auditAction: string;
  outboxEventType: string;
  before: ClinicalNoteRecord | null;
  after: ClinicalNoteRecord;
  reason?: string;
  metadata?: Record<string, unknown>;
}

function normalizeNarrative(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .replaceAll(/\r\n?/gu, '\n')
    .trim();

  return normalized.length === 0
    ? null
    : normalized;
}

function cloneStructuredData(
  value: Record<string, unknown> | readonly unknown[] | null | undefined,
): Record<string, unknown> | readonly unknown[] | null {
  if (value == null) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(value),
  ) as Record<string, unknown> | readonly unknown[];
}

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

export class ClinicalNoteCommandService {
  public constructor(
    private readonly notes: ClinicalNoteRepository,
    private readonly versions: ClinicalNoteVersionRepository,
    private readonly encounters: EncounterRepository,
    private readonly numbers: ClinicalEmrNumberService,
    private readonly attribution: ClinicalNoteAttributionService,
    public readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public normalizeContent(
    input: ClinicalDocumentContentInput,
  ): NormalizedClinicalNoteContent {
    const narrativeText = normalizeNarrative(input.narrativeText);
    const structuredData = cloneStructuredData(input.structuredData);

    if (narrativeText === null && structuredData === null) {
      throw new TypeError(
        'Clinical content requires narrativeText, structuredData, or both',
      );
    }

    const confidentiality = input.confidentiality ?? 'ROUTINE';
    const restrictionReason = normalizeOptionalClinicalText(
      input.restrictionReason,
      'restrictionReason',
    );

    if (confidentiality !== 'ROUTINE' && restrictionReason === null) {
      throw new TypeError(
        'Restricted clinical content requires restrictionReason',
      );
    }

    if (confidentiality === 'ROUTINE' && restrictionReason !== null) {
      throw new TypeError(
        'restrictionReason is only valid for restricted clinical content',
      );
    }

    return {
      title: normalizeOptionalClinicalText(input.title, 'title'),
      narrativeText,
      structuredData,
      confidentiality,
      restrictionReason,
    };
  }

  public async requireEncounter(
    actor: ClinicalEmrActorContext,
    encounterId: string,
  ): Promise<EncounterRecord> {
    const encounter = await this.encounters.findById(
      actor.facilityId,
      encounterId,
      true,
    );

    if (encounter === null) {
      throw new EncounterNotFoundError();
    }

    return encounter;
  }

  public async requireNote(
    actor: ClinicalEmrActorContext,
    clinicalNoteId: string,
  ): Promise<ClinicalNoteWithEncounter> {
    const note = await this.notes.findById(
      actor.facilityId,
      clinicalNoteId,
      true,
    );

    if (note === null) {
      throw new ClinicalNoteNotFoundError();
    }

    const encounter = await this.requireEncounter(
      actor,
      note.encounterId.toHexString(),
    );

    return {
      note,
      encounter,
    };
  }

  public async requireAuthorAttribution(
    actor: ClinicalEmrActorContext,
    authorProviderId: string,
  ): Promise<string> {
    return this.attribution.requireActorProvider(
      actor,
      authorProviderId,
    );
  }

  public async resolveActorProvider(
    actor: ClinicalEmrActorContext,
  ): Promise<string> {
    return this.attribution.resolveActorProvider(actor);
  }

  public async assertAccess(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
    documentType: ClinicalNoteRecord['documentType'],
    confidentiality: ClinicalNoteRecord['confidentiality'],
    intendedAction:
      | 'CREATE'
      | 'UPDATE'
      | 'FINALIZE'
      | 'AMEND'
      | 'CORRECT',
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      patientId: encounter.patientId.toHexString(),
      encounterId: encounter._id.toHexString(),
      assignedProviderIds: encounter.assignedProviderIds.map(
        (providerId) => providerId.toHexString(),
      ),
      confidentiality,
      documentType,
      intendedAction,
    });

    if (!decision.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }
  }

  public async allocateNoteNumber(
    encounter: EncounterRecord,
  ) {
    return this.numbers.allocateClinicalNoteNumber({
      facilityId: encounter.facilityId.toHexString(),
      serviceDate: encounter.serviceDate,
    });
  }

  public async appendVersion(
    input: ClinicalNoteVersionAppendInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<void> {
    const noteId = input.note._id.toHexString();
    const versionNumber = input.note.currentVersion;
    const associatedData = clinicalNoteVersionAssociatedData(
      input.actor.facilityId,
      noteId,
      versionNumber,
    );
    const contentAssociatedData = clinicalNoteContentAssociatedData(
      input.actor.facilityId,
      noteId,
      versionNumber,
    );

    const snapshot = {
      clinicalNoteId: noteId,
      noteNumber: input.note.noteNumber,
      encounterId: input.note.encounterId.toHexString(),
      patientId: input.note.patientId.toHexString(),
      authorProviderId: input.note.authorProviderId.toHexString(),
      documentType: input.note.documentType,
      title: input.note.title,
      narrativeText: input.note.narrativeText,
      structuredData: input.note.structuredData,
      status: input.note.status,
      confidentiality: input.note.confidentiality,
      restrictionReason: input.note.restrictionReason,
      finalizedAt: input.note.finalizedAt?.toISOString() ?? null,
      finalizedBy: id(input.note.finalizedBy),
      signedAt: input.note.signedAt?.toISOString() ?? null,
      signedBy: id(input.note.signedBy),
      signatureMethod: input.note.signatureMethod,
      signatureDigest: input.note.signatureDigest,
      amendedAt: input.note.amendedAt?.toISOString() ?? null,
      amendedBy: id(input.note.amendedBy),
      correctedAt: input.note.correctedAt?.toISOString() ?? null,
      correctedBy: id(input.note.correctedBy),
      enteredInErrorAt:
        input.note.enteredInErrorAt?.toISOString() ?? null,
      enteredInErrorBy: id(input.note.enteredInErrorBy),
      addendumToNoteId: id(input.note.addendumToNoteId),
      supersedesNoteId: id(input.note.supersedesNoteId),
      supersededByNoteId: id(input.note.supersededByNoteId),
    };

    const protectedSnapshot = this.dependencies.snapshotCrypto.protect(
      snapshot,
      associatedData,
    );
    const contentHash = this.dependencies.snapshotCrypto.hash(
      {
        title: input.note.title,
        narrativeText: input.note.narrativeText,
        structuredData: input.note.structuredData,
      },
      contentAssociatedData,
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.SNAPSHOT_ENCRYPTED,
      {
        clinicalNoteId: noteId,
        versionNumber,
      },
    );

    await this.versions.create({
      versionId: input.versionId,
      facilityId: input.actor.facilityId,
      clinicalNoteId: noteId,
      encounterId: input.note.encounterId.toHexString(),
      patientId: input.note.patientId.toHexString(),
      versionNumber,
      previousVersionId: input.previousVersionId,
      changeType: input.changeType,
      statusSnapshot: input.note.status,
      documentTypeSnapshot: input.note.documentType,
      confidentialitySnapshot: input.note.confidentiality,
      encryptedSnapshot: protectedSnapshot.encryptedValue,
      snapshotHash: protectedSnapshot.valueHash,
      contentHash,
      changeReason: input.changeReason,
      authorProviderId: input.note.authorProviderId.toHexString(),
      signedBy: id(input.note.signedBy),
      signatureMethod: input.note.signatureMethod,
      signatureDigest: input.note.signatureDigest,
      recordedAt: input.recordedAt,
      recordedBy: input.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: input.actor.correlationId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-clinical-note-version:${input.versionId}`,
        collection: 'clinicalNoteVersions',
        entityId: input.versionId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.IMMUTABLE_VERSION_APPENDED,
      {
        clinicalNoteId: noteId,
        versionNumber,
        changeType: input.changeType,
      },
    );
  }

  public async touchEncounter(
    input: Readonly<{
      encounter: EncounterRecord;
      latestClinicalNoteId: string;
      occurredAt: Date;
      actor: ClinicalEmrActorContext;
      transaction: ClinicalEmrTransactionContext;
      incrementAmendmentCount?: boolean;
    }>,
  ): Promise<EncounterRecord> {
    const encounterId = input.encounter._id.toHexString();
    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'encounters',
      entityId: encounterId,
      expectedPostVersion: input.encounter.version + 1,
      snapshot: encounterRestoreSnapshot(input.encounter),
      transactionId: input.transaction.transactionId,
      snapshotCrypto: this.dependencies.snapshotCrypto,
    });

    const updated = await this.encounters.touchClinicalDocumentActivityWithVersion({
      facilityId: input.actor.facilityId,
      encounterId,
      expectedVersion: input.encounter.version,
      occurredAt: input.occurredAt,
      actorUserId: input.actor.userId,
      latestClinicalNoteId: input.latestClinicalNoteId,
      ...(input.incrementAmendmentCount === undefined
        ? {}
        : {
            incrementAmendmentCount: input.incrementAmendmentCount,
          }),
    });

    if (updated === null) {
      throw new EncounterConcurrencyError();
    }

    await input.transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-encounter:${encounterId}:${updated.version}`,
        restorePayload,
      ),
    );

    return updated;
  }

  public async publishMutation(
    input: ClinicalNoteMutationPublicationInput,
  ): Promise<void> {
    const noteId = input.after._id.toHexString();
    const payload = safeClinicalNoteEventPayload(input.after);

    await this.dependencies.audit.append({
      transactionId: input.transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        input.transaction.transactionId,
        input.auditAction,
        noteId,
      ),
      action: input.auditAction,
      entityType: 'ClinicalNote',
      entityId: noteId,
      ...buildClinicalEmrAuditActorFields(input.actor),
      occurredAt: input.occurredAt,
      ...(input.reason === undefined
        ? {}
        : {
            reason: input.reason,
          }),
      ...(input.before === null
        ? {}
        : {
            before: clinicalNoteAuditSnapshot(input.before),
          }),
      after: clinicalNoteAuditSnapshot(input.after),
      ...(input.metadata === undefined
        ? {}
        : {
            metadata: input.metadata,
          }),
    });

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.AUDIT_APPENDED,
      {
        clinicalNoteId: noteId,
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId: input.transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        input.transaction.transactionId,
        input.outboxEventType,
        noteId,
      ),
      eventType: input.outboxEventType,
      aggregateType: 'ClinicalNote',
      aggregateId: noteId,
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      occurredAt: input.occurredAt,
      payload,
    });

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      {
        clinicalNoteId: noteId,
      },
    );

    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.CLINICAL_NOTE_CHANGED,
        facilityId: input.actor.facilityId,
        patientId: input.after.patientId.toHexString(),
        encounterId: input.after.encounterId.toHexString(),
        providerId: input.after.authorProviderId.toHexString(),
        payload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
        facilityId: input.actor.facilityId,
        patientId: input.after.patientId.toHexString(),
        encounterId: input.after.encounterId.toHexString(),
        payload,
      }),
    ]);

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.REALTIME_PUBLISHED,
      {
        clinicalNoteId: noteId,
      },
    );
  }

  public assertExpectedVersion(
    note: ClinicalNoteRecord,
    expectedVersion: number,
  ): void {
    if (note.version !== expectedVersion) {
      throw new ClinicalNoteConcurrencyError();
    }
  }

  public newId(): string {
    return newClinicalEmrObjectIdString();
  }
}
