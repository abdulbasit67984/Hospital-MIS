import type {
  EncounterStatus,
} from '@hospital-mis/database';

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
  ChangeEncounterStatusInput,
  ClinicalEmrActorContext,
  EncounterRecord,
} from '../clinical-emr.types.js';

import {
  assertEncounterTransition,
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

export interface ChangeEncounterStatusCommand {
  encounterId: string;
  input: ChangeEncounterStatusInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

const supportedStatuses = new Set<EncounterStatus>([
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
]);

export class ChangeEncounterStatusWorkflow {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly history: EncounterStatusHistoryRepository,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public async execute(
    command: ChangeEncounterStatusCommand,
  ): Promise<EncounterMutationResult> {
    const preflight = await this.encounters.findById(
      command.actor.facilityId,
      command.encounterId,
      true,
    );

    if (preflight === null) {
      throw new EncounterNotFoundError();
    }

    if (!supportedStatuses.has(command.input.status)) {
      throw new InvalidEncounterTransitionError(
        preflight.status,
        command.input.status,
      );
    }

    assertEncounterTransition(preflight.status, command.input.status);
    await this.assertAccess(command, preflight);

    return this.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CHANGE_ENCOUNTER_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterMutationLockKeys(
        command.actor.facilityId,
        preflight,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        input: command.input,
      },
      journalPayload: safeEncounterMutationJournalPayload(
        'CHANGE_ENCOUNTER_STATUS',
        preflight,
        command.input.status,
      ),
      execute: async (transaction) => this.executeTransaction(
        command,
        transaction,
      ),
    });
  }

  private async assertAccess(
    command: ChangeEncounterStatusCommand,
    encounter: EncounterRecord,
  ): Promise<void> {
    const intendedAction =
      command.input.status === 'COMPLETED' ||
      command.input.status === 'CLOSED'
        ? 'FINALIZE'
        : 'UPDATE';

    const decision = await this.dependencies.accessPolicy.authorize({
      actor: command.actor,
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

  private async executeTransaction(
    command: ChangeEncounterStatusCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<EncounterMutationResult> {
    const current = await this.encounters.findById(
      command.actor.facilityId,
      command.encounterId,
      true,
    );

    if (current === null) {
      throw new EncounterNotFoundError();
    }

    if (current.version !== command.input.expectedVersion) {
      throw new EncounterConcurrencyError();
    }

    assertEncounterTransition(current.status, command.input.status);
    await this.assertAccess(command, current);

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.ACCESS_AUTHORIZED,
      {
        encounterId: command.encounterId,
        targetStatus: command.input.status,
      },
    );

    const occurredAt = this.dependencies.clock.now();
    const reason = command.input.status === 'CANCELLED'
      ? normalizeClinicalText(
          command.input.reason ?? '',
          'reason',
        )
      : command.input.reason == null
        ? null
        : normalizeClinicalText(command.input.reason, 'reason');

    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'encounters',
      entityId: command.encounterId,
      expectedPostVersion: current.version + 1,
      snapshot: encounterRestoreSnapshot(current),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.dependencies.snapshotCrypto,
    });

    const updated = await this.applyTransition(
      current,
      command.input.status,
      reason,
      occurredAt,
      command.actor.userId,
    );

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
        fromStatus: current.status,
        toStatus: updated.status,
        version: updated.version,
      },
    );

    if (
      updated.opdVisitId !== null &&
      (
        updated.status === 'IN_PROGRESS' ||
        updated.status === 'COMPLETED'
      )
    ) {
      const lifecycleInput = {
        facilityId: command.actor.facilityId,
        opdVisitId: updated.opdVisitId.toHexString(),
        queueTokenId: updated.queueTokenId?.toHexString() ?? null,
        providerId: updated.currentOwnerId.toHexString(),
        occurredAt,
        actorUserId: command.actor.userId,
        transactionId: transaction.transactionId,
        correlationId: command.actor.correlationId,
      };

      if (updated.status === 'IN_PROGRESS') {
        await this.dependencies.opdLifecycle.startConsultation(
          lifecycleInput,
          transaction,
        );
      } else {
        await this.dependencies.opdLifecycle.completeConsultation(
          lifecycleInput,
          transaction,
        );
      }
    }

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
      changeSource: command.input.changeSource,
      reason,
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

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
      {
        encounterId: command.encounterId,
        sequence,
        status: updated.status,
      },
    );

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_STATUS_CHANGED,
        command.encounterId,
      ),
      action: CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_STATUS_CHANGED,
      entityType: 'Encounter',
      entityId: command.encounterId,
      ...buildClinicalEmrAuditActorFields(command.actor),
      occurredAt,
      ...(reason === null
        ? {}
        : { reason }),
      before: encounterAuditSnapshot(current),
      after: encounterAuditSnapshot(updated),
      metadata: {
        changeSource: command.input.changeSource,
      },
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.AUDIT_APPENDED,
      { encounterId: command.encounterId },
    );

    const eventPayload = safeEncounterEventPayload(updated);

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_STATUS_CHANGED,
        command.encounterId,
      ),
      eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_STATUS_CHANGED,
      aggregateType: 'Encounter',
      aggregateId: command.encounterId,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      occurredAt,
      payload: eventPayload,
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      { encounterId: command.encounterId },
    );

    await Promise.all([
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.ENCOUNTER_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: updated.patientId.toHexString(),
        encounterId: command.encounterId,
        providerId: updated.currentOwnerId.toHexString(),
        payload: eventPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PROVIDER_WORKLIST_CHANGED,
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        providerId: updated.currentOwnerId.toHexString(),
        payload: eventPayload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
        facilityId: command.actor.facilityId,
        patientId: updated.patientId.toHexString(),
        encounterId: command.encounterId,
        payload: eventPayload,
      }),
    ]);

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.REALTIME_PUBLISHED,
      { encounterId: command.encounterId },
    );

    return toEncounterMutationResult(updated);
  }

  private async applyTransition(
    current: EncounterRecord,
    status: EncounterStatus,
    reason: string | null,
    occurredAt: Date,
    actorUserId: string,
  ): Promise<EncounterRecord | null> {
    const common = {
      facilityId: current.facilityId.toHexString(),
      encounterId: current._id.toHexString(),
      expectedVersion: current.version,
      occurredAt,
      actorUserId,
    };

    switch (status) {
      case 'IN_PROGRESS':
        return this.encounters.startWithVersion(common);

      case 'ON_HOLD':
        return this.encounters.holdWithVersion(common);

      case 'COMPLETED':
        return this.encounters.completeWithVersion(common);

      case 'CLOSED':
        return this.encounters.closeWithVersion(common);

      case 'CANCELLED':
        return this.encounters.cancelWithVersion({
          ...common,
          reason: reason as string,
        });

      default:
        throw new InvalidEncounterTransitionError(current.status, status);
    }
  }
}