import {
  ClinicalEmrMinimumNecessaryAccessError,
  ClinicalNoteNotFoundError,
  EncounterConcurrencyError,
  EncounterNotFoundError,
} from '../clinical-emr.errors.js';

import {
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
  CLINICAL_EMR_TRANSACTION_STATES,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  ClinicalNoteRecord,
  EncounterRecord,
} from '../clinical-emr.types.js';

import {
  clinicalEmrDeduplicationKey,
  newClinicalEmrObjectIdString,
} from '../clinical-emr.workflow-helpers.js';

import type {
  ClinicalNoteRepository,
} from '../repositories/clinical-note.repository.js';

import type {
  EncounterRepository,
} from '../repositories/encounter.repository.js';

import type {
  ClinicalNoteAttributionService,
} from './clinical-note-attribution.service.js';

export interface ClinicalListMutationPublicationInput<TRecord> {
  transaction: ClinicalEmrTransactionContext;
  actor: ClinicalEmrActorContext;
  occurredAt: Date;
  auditAction: string;
  outboxEventType: string;
  realtimeEventTypes: readonly string[];
  aggregateType: string;
  entityType: string;
  entityId: string;
  patientId: string;
  encounterId: string | null;
  providerId: string | null;
  before: TRecord | null;
  after: TRecord;
  beforeSnapshot(record: TRecord): Record<string, unknown>;
  afterSnapshot(record: TRecord): Record<string, unknown>;
  eventPayload(record: TRecord): Record<string, unknown>;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class ClinicalListCommandService {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly notes: ClinicalNoteRepository,
    private readonly attribution: ClinicalNoteAttributionService,
    public readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

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

  public async requireClinicalNoteReference(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
    clinicalNoteId: string | null,
  ): Promise<ClinicalNoteRecord | null> {
    if (clinicalNoteId === null) {
      return null;
    }

    const note = await this.notes.findById(
      actor.facilityId,
      clinicalNoteId,
      false,
    );

    if (
      note === null ||
      note.encounterId.toHexString() !== encounter._id.toHexString() ||
      note.patientId.toHexString() !== encounter.patientId.toHexString() ||
      note.status === 'ENTERED_IN_ERROR'
    ) {
      throw new ClinicalNoteNotFoundError();
    }

    return note;
  }

  public async requireProvider(
    actor: ClinicalEmrActorContext,
  ): Promise<string> {
    return this.attribution.resolveActorProvider(actor);
  }

  public async assertAccess(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
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
      confidentiality: encounter.confidentiality,
      intendedAction,
    });

    if (!decision.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }
  }

  public async touchEncounter(
    input: Readonly<{
      encounter: EncounterRecord;
      occurredAt: Date;
      actor: ClinicalEmrActorContext;
      transaction: ClinicalEmrTransactionContext;
      latestDiagnosisAt?: Date;
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

    const updated = await this.encounters.touchClinicalActivityWithVersion({
      facilityId: input.actor.facilityId,
      encounterId,
      expectedVersion: input.encounter.version,
      occurredAt: input.occurredAt,
      actorUserId: input.actor.userId,
      ...(input.latestDiagnosisAt === undefined
        ? {}
        : {
            latestDiagnosisAt: input.latestDiagnosisAt,
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

  public async publishMutation<TRecord>(
    input: ClinicalListMutationPublicationInput<TRecord>,
  ): Promise<void> {
    const payload = input.eventPayload(input.after);

    await this.dependencies.audit.append({
      transactionId: input.transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        input.transaction.transactionId,
        input.auditAction,
        input.entityId,
      ),
      action: input.auditAction,
      entityType: input.entityType,
      entityId: input.entityId,
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
            before: input.beforeSnapshot(input.before),
          }),
      after: input.afterSnapshot(input.after),
      ...(input.metadata === undefined
        ? {}
        : {
            metadata: input.metadata,
          }),
    });

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.AUDIT_APPENDED,
      {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId: input.transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        input.transaction.transactionId,
        input.outboxEventType,
        input.entityId,
      ),
      eventType: input.outboxEventType,
      aggregateType: input.aggregateType,
      aggregateId: input.entityId,
      actorUserId: input.actor.userId,
      facilityId: input.actor.facilityId,
      correlationId: input.actor.correlationId,
      occurredAt: input.occurredAt,
      payload,
    });

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    );

    await Promise.all(
      input.realtimeEventTypes.map(async (eventType) =>
        this.dependencies.realtime.publish({
          eventType,
          facilityId: input.actor.facilityId,
          patientId: input.patientId,
          ...(input.encounterId === null
            ? {}
            : {
                encounterId: input.encounterId,
              }),
          ...(input.providerId === null
            ? {}
            : {
                providerId: input.providerId,
              }),
          payload,
        }),
      ),
    );

    await input.transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.REALTIME_PUBLISHED,
      {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    );
  }

  public newId(): string {
    return newClinicalEmrObjectIdString();
  }
}