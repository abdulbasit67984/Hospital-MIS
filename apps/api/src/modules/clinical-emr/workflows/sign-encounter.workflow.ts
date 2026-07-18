import {
  ClinicalEmrMinimumNecessaryAccessError,
  EncounterConcurrencyError,
  EncounterNotFoundError,
  InvalidEncounterTransitionError,
} from '../clinical-emr.errors.js';

import {
  toEncounterMutationResult,
  type EncounterMutationResult,
} from '../clinical-emr.mapper.js';

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
  encounterAuditSnapshot,
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
  EncounterRecord,
  SignEncounterInput,
} from '../clinical-emr.types.js';

import {
  clinicalEmrDeduplicationKey,
  encounterMutationLockKeys,
  newClinicalEmrObjectIdString,
  safeEncounterEventPayload,
  safeEncounterMutationJournalPayload,
} from '../clinical-emr.workflow-helpers.js';

import {
  normalizeClinicalText,
} from '../clinical-emr.normalization.js';

import type {
  EncounterStatusHistoryRepository,
} from '../repositories/encounter-status-history.repository.js';

import type {
  EncounterRepository,
} from '../repositories/encounter.repository.js';

export interface SignEncounterCommand {
  encounterId: string;
  input: SignEncounterInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class SignEncounterWorkflow {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly history: EncounterStatusHistoryRepository,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public async execute(
    command: SignEncounterCommand,
  ): Promise<EncounterMutationResult> {
    const preflight = await this.requireEncounter(command);

    if (preflight.status !== 'COMPLETED') {
      throw new InvalidEncounterTransitionError(preflight.status, 'SIGNED');
    }

    await this.assertAccess(command.actor, preflight);

    return this.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.SIGN_ENCOUNTER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterMutationLockKeys(command.actor.facilityId, preflight),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        expectedVersion: command.input.expectedVersion,
        signatureMethod: command.input.signatureMethod,
        signatureDigest: command.input.signatureDigest,
      },
      journalPayload: {
        ...safeEncounterMutationJournalPayload(
          'SIGN_ENCOUNTER',
          preflight,
          'SIGNED',
        ),
        signatureMethod: command.input.signatureMethod,
      },
      execute: async (transaction) => this.executeTransaction(command, transaction),
    });
  }

  private async requireEncounter(
    command: SignEncounterCommand,
  ): Promise<EncounterRecord> {
    const record = await this.encounters.findById(
      command.actor.facilityId,
      command.encounterId,
      true,
    );

    if (record === null) {
      throw new EncounterNotFoundError();
    }

    return record;
  }

  private async assertAccess(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
  ): Promise<void> {
    const decision = await this.dependencies.accessPolicy.authorize({
      actor,
      patientId: encounter.patientId.toHexString(),
      encounterId: encounter._id.toHexString(),
      assignedProviderIds: encounter.assignedProviderIds.map(
        (providerId) => providerId.toHexString(),
      ),
      confidentiality: encounter.confidentiality,
      intendedAction: 'FINALIZE',
    });

    if (!decision.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }
  }

  private async executeTransaction(
    command: SignEncounterCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<EncounterMutationResult> {
    const current = await this.requireEncounter(command);

    if (current.version !== command.input.expectedVersion) {
      throw new EncounterConcurrencyError();
    }

    if (current.status !== 'COMPLETED') {
      throw new InvalidEncounterTransitionError(current.status, 'SIGNED');
    }

    await this.assertAccess(command.actor, current);

    const occurredAt = this.dependencies.clock.now();
    const signatureDigest = normalizeClinicalText(
      command.input.signatureDigest,
      'signatureDigest',
    );

    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'encounters',
      entityId: command.encounterId,
      expectedPostVersion: current.version + 1,
      snapshot: encounterRestoreSnapshot(current),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.dependencies.snapshotCrypto,
    });

    const updated = await this.encounters.signWithVersion({
      facilityId: command.actor.facilityId,
      encounterId: command.encounterId,
      expectedVersion: current.version,
      occurredAt,
      actorUserId: command.actor.userId,
      signatureDigest,
    });

    if (updated === null) {
      throw new EncounterConcurrencyError();
    }

    await transaction.registerCompensation(
      restoreClinicalRecordCompensation(
        `restore-encounter:${command.encounterId}`,
        restorePayload,
      ),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
      {
        encounterId: command.encounterId,
        status: updated.status,
        version: updated.version,
      },
    );

    const sequence = await this.history.nextSequence(
      command.actor.facilityId,
      command.encounterId,
    );
    const historyId = newClinicalEmrObjectIdString();

    await this.history.create({
      historyId,
      facilityId: command.actor.facilityId,
      encounterId: command.encounterId,
      patientId: current.patientId.toHexString(),
      sequence,
      fromStatus: current.status,
      toStatus: updated.status,
      previousOwnerId: current.currentOwnerId.toHexString(),
      newOwnerId: updated.currentOwnerId.toHexString(),
      previousOwnerRole: current.currentOwnerRole,
      newOwnerRole: updated.currentOwnerRole,
      changeSource: 'PROVIDER',
      reason: null,
      occurredAt,
      changedBy: command.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: command.actor.correlationId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-encounter-history:${historyId}`,
        collection: 'encounterStatusHistories',
        entityId: historyId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_SIGNED,
        command.encounterId,
      ),
      action: CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_SIGNED,
      entityType: 'Encounter',
      entityId: command.encounterId,
      ...buildClinicalEmrAuditActorFields(command.actor),
      occurredAt,
      before: encounterAuditSnapshot(current),
      after: encounterAuditSnapshot(updated),
      metadata: {
        signatureMethod: command.input.signatureMethod,
      },
    });

    const payload = safeEncounterEventPayload(updated);

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_SIGNED,
        command.encounterId,
      ),
      eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_SIGNED,
      aggregateType: 'Encounter',
      aggregateId: command.encounterId,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      occurredAt,
      payload,
    });

    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.ENCOUNTER_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: updated.patientId.toHexString(),
        encounterId: command.encounterId,
        providerId: updated.currentOwnerId.toHexString(),
        payload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: updated.patientId.toHexString(),
        encounterId: command.encounterId,
        payload,
      }),
    ]);

    return toEncounterMutationResult(updated);
  }
}