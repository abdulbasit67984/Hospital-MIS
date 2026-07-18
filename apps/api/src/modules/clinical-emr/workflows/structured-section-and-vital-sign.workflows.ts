import {
  deleteCreatedClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../clinical-emr.transaction.constants.js';

import type {
  ClinicalEmrActorContext,
  CorrectVitalSignsInput,
  EnterVitalSignsInErrorInput,
  RecordStructuredEncounterSectionInput,
  RecordVitalSignsInput,
} from '../clinical-emr.types.js';

import {
  clinicalEmrLockKey,
} from '../clinical-emr.normalization.js';

import {
  CLINICAL_EMR_LOCK_NAMESPACE,
} from '../clinical-emr.constants.js';

import {
  encounterMutationLockKeys,
} from '../clinical-emr.workflow-helpers.js';

import {
  VitalSignConcurrencyError,
  VitalSignCorrectionConflictError,
} from '../clinical-emr.errors.js';

import type {
  CreateClinicalNoteWorkflow,
} from './clinical-note-draft.workflows.js';

import type {
  StructuredEncounterSectionService,
} from '../services/structured-encounter-section.service.js';

import {
  toVitalSignMutationResult,
  type VitalSignMutationResult,
  type VitalSignCommandService,
} from '../services/vital-sign-command.service.js';

export interface RecordStructuredEncounterSectionCommand {
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
  input: RecordStructuredEncounterSectionInput;
}

export interface RecordVitalSignsCommand {
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
  input: RecordVitalSignsInput;
}

export interface CorrectVitalSignsCommand {
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
  vitalSignId: string;
  input: CorrectVitalSignsInput;
}

export interface EnterVitalSignsInErrorCommand {
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
  vitalSignId: string;
  input: EnterVitalSignsInErrorInput;
}

const activeEncounterStatuses = new Set([
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
]);

function vitalSignLockKeys(
  facilityId: string,
  encounter: Parameters<typeof encounterMutationLockKeys>[1],
  recordId: string,
): string[] {
  return [
    ...encounterMutationLockKeys(facilityId, encounter),
    clinicalEmrLockKey(
      CLINICAL_EMR_LOCK_NAMESPACE.VITAL_SIGN,
      facilityId,
      recordId,
    ),
  ];
}

export class RecordStructuredEncounterSectionWorkflow {
  public constructor(
    private readonly sections: StructuredEncounterSectionService,
    private readonly createClinicalNote: CreateClinicalNoteWorkflow,
  ) {}

  public async execute(
    command: RecordStructuredEncounterSectionCommand,
  ) {
    const input = this.sections.buildClinicalNoteInput(command.input);

    return this.createClinicalNote.execute({
      actor: command.actor,
      idempotencyKey: command.idempotencyKey,
      input,
    });
  }
}

export class RecordVitalSignsWorkflow {
  public constructor(
    private readonly service: VitalSignCommandService,
  ) {}

  public async execute(
    command: RecordVitalSignsCommand,
  ): Promise<VitalSignMutationResult> {
    const encounter = await this.service.support.requireEncounter(
      command.actor,
      command.input.encounterId,
    );

    if (!activeEncounterStatuses.has(encounter.status)) {
      throw new VitalSignCorrectionConflictError();
    }

    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CREATE',
    );

    return this.service.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.RECORD_VITAL_SIGNS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: vitalSignLockKeys(
        command.actor.facilityId,
        encounter,
        `new:${command.idempotencyKey}`,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: this.service.safeJournalPayload(
        'RECORD_VITAL_SIGNS',
        command.input,
      ),
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: RecordVitalSignsCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<VitalSignMutationResult> {
    const encounter = await this.service.support.requireEncounter(
      command.actor,
      command.input.encounterId,
    );

    if (!activeEncounterStatuses.has(encounter.status)) {
      throw new VitalSignCorrectionConflictError();
    }

    const sourceNote = await this.service.support.requireClinicalNoteReference(
      command.actor,
      encounter,
      command.input.sourceClinicalNoteId ?? null,
    );
    const providerId = await this.service.support.requireProvider(
      command.actor,
    );

    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CREATE',
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.ACCESS_AUTHORIZED,
      {
        encounterId: encounter._id.toHexString(),
        sourceClinicalNoteId: sourceNote?._id.toHexString() ?? null,
      },
    );

    const occurredAt = this.service.support.dependencies.clock.now();
    const measurement = this.service.normalizeMeasurement(
      command.input,
      encounter.startedAt,
      occurredAt,
    );
    const created = await this.service.createRecord({
      actor: command.actor,
      transaction,
      encounterId: encounter._id.toHexString(),
      patientId: encounter.patientId.toHexString(),
      admissionId: encounter.admissionId?.toHexString() ?? null,
      observerProviderId: providerId,
      sourceClinicalNoteId: sourceNote?._id.toHexString() ?? null,
      measurement,
      recordedAt: occurredAt,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-vital-sign:${created._id.toHexString()}`,
        collection: 'vitalSigns',
        entityId: created._id.toHexString(),
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
      {
        vitalSignId: created._id.toHexString(),
        encounterId: created.encounterId.toHexString(),
      },
    );

    await this.service.support.touchEncounter({
      encounter,
      occurredAt,
      actor: command.actor,
      transaction,
    });

    await this.service.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.VITAL_SIGNS_RECORDED,
      before: null,
      after: created,
    });

    return toVitalSignMutationResult(created);
  }

}

export class CorrectVitalSignsWorkflow {
  public constructor(
    private readonly service: VitalSignCommandService,
  ) {}

  public async execute(
    command: CorrectVitalSignsCommand,
  ): Promise<VitalSignMutationResult> {
    const current = await this.service.requireRecord(
      command.actor,
      command.vitalSignId,
    );
    this.service.assertExpectedVersion(current, command.input.expectedVersion);
    this.service.assertCorrectable(current);

    const encounter = await this.service.support.requireEncounter(
      command.actor,
      current.encounterId.toHexString(),
    );
    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CORRECT',
    );

    return this.service.support.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_VITAL_SIGNS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: vitalSignLockKeys(
        command.actor.facilityId,
        encounter,
        command.vitalSignId,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        vitalSignId: command.vitalSignId,
        input: command.input,
      },
      journalPayload: {
        ...this.service.safeJournalPayload(
          'CORRECT_VITAL_SIGNS',
          {
            ...command.input,
            encounterId: encounter._id.toHexString(),
          },
        ),
        vitalSignId: command.vitalSignId,
        expectedVersion: command.input.expectedVersion,
      },
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: CorrectVitalSignsCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<VitalSignMutationResult> {
    const current = await this.service.requireRecord(
      command.actor,
      command.vitalSignId,
    );
    this.service.assertExpectedVersion(current, command.input.expectedVersion);
    this.service.assertCorrectable(current);

    const encounter = await this.service.support.requireEncounter(
      command.actor,
      current.encounterId.toHexString(),
    );
    const sourceNote = await this.service.support.requireClinicalNoteReference(
      command.actor,
      encounter,
      command.input.sourceClinicalNoteId ?? null,
    );
    const providerId = await this.service.support.requireProvider(
      command.actor,
    );

    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CORRECT',
    );

    const occurredAt = this.service.support.dependencies.clock.now();
    const measurement = this.service.normalizeMeasurement(
      command.input,
      encounter.startedAt,
      occurredAt,
    );
    const replacement = await this.service.createRecord({
      actor: command.actor,
      transaction,
      encounterId: encounter._id.toHexString(),
      patientId: encounter.patientId.toHexString(),
      admissionId: encounter.admissionId?.toHexString() ?? null,
      observerProviderId: providerId,
      sourceClinicalNoteId: sourceNote?._id.toHexString() ?? null,
      measurement,
      recordedAt: occurredAt,
      supersedesVitalSignId: current._id.toHexString(),
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-vital-sign:${replacement._id.toHexString()}`,
        collection: 'vitalSigns',
        entityId: replacement._id.toHexString(),
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    const corrected = await this.service.repository.markCorrectedWithVersion({
      facilityId: command.actor.facilityId,
      vitalSignId: current._id.toHexString(),
      expectedVersion: current.version,
      replacementVitalSignId: replacement._id.toHexString(),
      reason: command.input.reason,
      occurredAt,
      actorUserId: command.actor.userId,
    });

    if (corrected === null) {
      throw new VitalSignConcurrencyError();
    }

    await this.service.registerRestoreCompensation({
      actor: command.actor,
      transaction,
      before: current,
      expectedPostVersion: corrected.version,
    });

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
      {
        vitalSignId: corrected._id.toHexString(),
        replacementVitalSignId: replacement._id.toHexString(),
      },
    );

    await this.service.support.touchEncounter({
      encounter,
      occurredAt,
      actor: command.actor,
      transaction,
    });

    await this.service.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.VITAL_SIGNS_RECORDED,
      before: null,
      after: replacement,
      metadata: {
        correctionOfVitalSignId: current._id.toHexString(),
      },
    });

    await this.service.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction: CLINICAL_EMR_AUDIT_ACTIONS.VITAL_SIGNS_CORRECTED,
      before: current,
      after: corrected,
      reason: command.input.reason,
      metadata: {
        replacementVitalSignId: replacement._id.toHexString(),
      },
    });

    return toVitalSignMutationResult(replacement);
  }
}

export class EnterVitalSignsInErrorWorkflow {
  public constructor(
    private readonly service: VitalSignCommandService,
  ) {}

  public async execute(
    command: EnterVitalSignsInErrorCommand,
  ): Promise<VitalSignMutationResult> {
    const current = await this.service.requireRecord(
      command.actor,
      command.vitalSignId,
    );
    this.service.assertExpectedVersion(current, command.input.expectedVersion);
    this.service.assertCorrectable(current);

    const encounter = await this.service.support.requireEncounter(
      command.actor,
      current.encounterId.toHexString(),
    );
    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CORRECT',
    );

    return this.service.support.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.ENTER_VITAL_SIGNS_IN_ERROR,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: vitalSignLockKeys(
        command.actor.facilityId,
        encounter,
        command.vitalSignId,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        vitalSignId: command.vitalSignId,
        input: command.input,
      },
      journalPayload: {
        operation: 'ENTER_VITAL_SIGNS_IN_ERROR',
        vitalSignId: command.vitalSignId,
        encounterId: encounter._id.toHexString(),
        expectedVersion: command.input.expectedVersion,
      },
      execute: async (transaction) =>
        this.executeTransaction(command, transaction),
    });
  }

  private async executeTransaction(
    command: EnterVitalSignsInErrorCommand,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<VitalSignMutationResult> {
    const current = await this.service.requireRecord(
      command.actor,
      command.vitalSignId,
    );
    this.service.assertExpectedVersion(current, command.input.expectedVersion);
    this.service.assertCorrectable(current);

    const encounter = await this.service.support.requireEncounter(
      command.actor,
      current.encounterId.toHexString(),
    );
    await this.service.support.assertAccess(
      command.actor,
      encounter,
      'CORRECT',
    );

    const occurredAt = this.service.support.dependencies.clock.now();
    const updated =
      await this.service.repository.markEnteredInErrorWithVersion({
        facilityId: command.actor.facilityId,
        vitalSignId: current._id.toHexString(),
        expectedVersion: current.version,
        reason: command.input.reason,
        occurredAt,
        actorUserId: command.actor.userId,
      });

    if (updated === null) {
      throw new VitalSignConcurrencyError();
    }

    await this.service.registerRestoreCompensation({
      actor: command.actor,
      transaction,
      before: current,
      expectedPostVersion: updated.version,
    });

    await this.service.support.touchEncounter({
      encounter,
      occurredAt,
      actor: command.actor,
      transaction,
    });

    await this.service.publishMutation({
      transaction,
      actor: command.actor,
      occurredAt,
      auditAction:
        CLINICAL_EMR_AUDIT_ACTIONS.VITAL_SIGNS_ENTERED_IN_ERROR,
      before: current,
      after: updated,
      reason: command.input.reason,
    });

    return toVitalSignMutationResult(updated);
  }
}