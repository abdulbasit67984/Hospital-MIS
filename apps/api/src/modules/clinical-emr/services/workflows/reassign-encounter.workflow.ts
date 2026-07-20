import {
  ClinicalEmrMinimumNecessaryAccessError,
  ClinicalEncounterContextMismatchError,
  EncounterConcurrencyError,
  EncounterNotFoundError,
} from '../../clinical-emr.errors.js';

import {
  toEncounterMutationResult,
  type EncounterMutationResult,
} from '../../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
  encounterRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../../clinical-emr.mutation-snapshots.js';

import {
  buildClinicalEmrAuditActorFields,
  type ClinicalEmrMutationDependencies,
  type ClinicalEmrTransactionContext,
} from '../../clinical-emr.ports.js';

import {
  encounterAuditSnapshot,
} from '../../clinical-emr.projections.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  EncounterRecord,
  ReassignEncounterInput,
} from '../../clinical-emr.types.js';

import {
  clinicalEmrDeduplicationKey,
  encounterMutationLockKeys,
  newClinicalEmrObjectIdString,
  safeEncounterEventPayload,
  safeEncounterMutationJournalPayload,
} from '../../clinical-emr.workflow-helpers.js';

import {
  normalizeClinicalText,
} from '../../clinical-emr.normalization.js';

import type {
  EncounterStatusHistoryRepository,
} from '../../repositories/encounter-status-history.repository.js';

import type {
  EncounterRepository,
} from '../../repositories/encounter.repository.js';

import type {
  ClinicalEmrContextReader,
} from '../clinical-emr-context.service.js';

export interface ReassignEncounterCommand {
  encounterId: string;
  input: ReassignEncounterInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class ReassignEncounterWorkflow {
  public constructor(
    private readonly encounters: EncounterRepository,
    private readonly history: EncounterStatusHistoryRepository,
    private readonly contexts: ClinicalEmrContextReader,
    private readonly dependencies: ClinicalEmrMutationDependencies,
  ) {}

  public async execute(
    command: ReassignEncounterCommand,
  ): Promise<EncounterMutationResult> {
    const preflight = await this.requireEncounter(command);
    await this.assertAccess(command.actor, preflight);
    await this.assertProvider(command.actor.facilityId, preflight, command.input.currentOwnerId);

    return this.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.REASSIGN_ENCOUNTER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterMutationLockKeys(command.actor.facilityId, preflight),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        input: command.input,
      },
      journalPayload: {
        ...safeEncounterMutationJournalPayload('REASSIGN_ENCOUNTER', preflight),
        newOwnerRole: command.input.currentOwnerRole,
        assignedProviderCount: command.input.assignedProviderIds.length,
      },
      execute: async (transaction) => this.executeTransaction(command, transaction),
    });
  }

  private async requireEncounter(
    command: ReassignEncounterCommand,
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
      intendedAction: 'UPDATE',
    });

    if (!decision.allowed) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }
  }

  private async assertProvider(
    facilityId: string,
    encounter: EncounterRecord,
    providerId: string,
  ): Promise<void> {
    const provider = await this.contexts.findProvider(facilityId, providerId);

    if (
      provider === null ||
      !provider.isClinical ||
      !provider.isActive ||
      provider.employmentStatus !== 'ACTIVE'
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'The new encounter owner is not an active clinical provider in this facility',
      );
    }

    if (
      provider.departmentId !== null &&
      provider.departmentId !== encounter.departmentId.toHexString()
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'The new encounter owner does not belong to the encounter department',
      );
    }
  }

  private async executeTransaction(
    command: ReassignEncounterCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<EncounterMutationResult> {
    const current = await this.requireEncounter(command);

    if (current.version !== command.input.expectedVersion) {
      throw new EncounterConcurrencyError();
    }

    await this.assertAccess(command.actor, current);
    await this.assertProvider(
      command.actor.facilityId,
      current,
      command.input.currentOwnerId,
    );

    const reason = normalizeClinicalText(command.input.reason, 'reason');
    const occurredAt = this.dependencies.clock.now();
    const restorePayload = protectedClinicalEmrRestorePayload({
      collection: 'encounters',
      entityId: command.encounterId,
      expectedPostVersion: current.version + 1,
      snapshot: encounterRestoreSnapshot(current),
      transactionId: transaction.transactionId,
      snapshotCrypto: this.dependencies.snapshotCrypto,
    });

    const assignedProviderIds = [
      ...new Set([
        ...command.input.assignedProviderIds,
        current.primaryProviderId.toHexString(),
        command.input.currentOwnerId,
      ]),
    ];

    const updated = await this.encounters.reassignWithVersion({
      facilityId: command.actor.facilityId,
      encounterId: command.encounterId,
      expectedVersion: current.version,
      currentOwnerId: command.input.currentOwnerId,
      currentOwnerRole: command.input.currentOwnerRole,
      assignedProviderIds,
      occurredAt,
      actorUserId: command.actor.userId,
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
        ownerProviderId: updated.currentOwnerId.toHexString(),
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
      toStatus: current.status,
      previousOwnerId: current.currentOwnerId.toHexString(),
      newOwnerId: updated.currentOwnerId.toHexString(),
      previousOwnerRole: current.currentOwnerRole,
      newOwnerRole: updated.currentOwnerRole,
      changeSource: 'PROVIDER',
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

    await this.dependencies.audit.append({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_REASSIGNED,
        command.encounterId,
      ),
      action: CLINICAL_EMR_AUDIT_ACTIONS.ENCOUNTER_REASSIGNED,
      entityType: 'Encounter',
      entityId: command.encounterId,
      ...buildClinicalEmrAuditActorFields(command.actor),
      occurredAt,
      reason,
      before: encounterAuditSnapshot(current),
      after: encounterAuditSnapshot(updated),
    });

    const payload = safeEncounterEventPayload(updated);

    await this.dependencies.outbox.enqueue({
      transactionId: transaction.transactionId,
      deduplicationKey: clinicalEmrDeduplicationKey(
        transaction.transactionId,
        CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_REASSIGNED,
        command.encounterId,
      ),
      eventType: CLINICAL_EMR_OUTBOX_EVENTS.ENCOUNTER_REASSIGNED,
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
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PROVIDER_WORKLIST_CHANGED,
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        providerId: current.currentOwnerId.toHexString(),
        payload,
      }),
      this.dependencies.realtime.publish({
        eventType: CLINICAL_EMR_REALTIME_EVENTS.PROVIDER_WORKLIST_CHANGED,
        facilityId: command.actor.facilityId,
        encounterId: command.encounterId,
        providerId: updated.currentOwnerId.toHexString(),
        payload,
      }),
    ]);

    return toEncounterMutationResult(updated);
  }
}