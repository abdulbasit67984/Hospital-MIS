import {
  EncounterDiagnosisConcurrencyError,
  InvalidEncounterTransitionError,
} from '../../clinical-emr.errors.js';

import {
  toEncounterDiagnosisMutationResult,
  type EncounterDiagnosisMutationResult,
} from '../../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
  encounterDiagnosisRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../../clinical-emr.ports.js';

import {
  encounterDiagnosisAuditSnapshot,
} from '../../clinical-emr.projections.js';

import {
  CLINICAL_EMR_AUDIT_ACTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_REALTIME_EVENTS,
  CLINICAL_EMR_TRANSACTION_STATES,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../../clinical-emr.transaction.constants.js';

import type {
  ChangeEncounterDiagnosisStatusInput,
  ClinicalEmrActorContext,
  CorrectEncounterDiagnosisInput,
  EncounterDiagnosisRecord,
  RecordEncounterDiagnosisInput,
  VerifyEncounterDiagnosisInput,
} from '../../clinical-emr.types.js';

import {
  encounterDiagnosisCreateLockKeys,
  encounterDiagnosisMutationLockKeys,
  safeDiagnosisJournalPayload,
  safeEncounterDiagnosisEventPayload,
} from '../../clinical-emr.workflow-helpers.js';

import type {
  DiagnosisCommandService,
  NormalizedEncounterDiagnosisInput,
} from '../diagnosis-command.service.js';

const mutableEncounterStatuses = new Set([
  'CREATED',
  'IN_PROGRESS',
  'ON_HOLD',
]);

function normalizedDate(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new TypeError(`${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new TypeError(`${field} is not a valid calendar date`);
  }

  return normalized;
}

function requiredReason(
  value: string,
  field = 'reason',
): string {
  const normalized = value.trim();

  if (normalized.length < 5) {
    throw new TypeError(`${field} must contain at least 5 characters`);
  }

  if (normalized.length > 2_000) {
    throw new TypeError(`${field} must contain at most 2000 characters`);
  }

  return normalized;
}

function resolvedAtDate(
  input: ChangeEncounterDiagnosisStatusInput,
  occurredAt: Date,
): Date | null {
  if (input.status !== 'RESOLVED') {
    return null;
  }

  if (input.resolvedAt == null) {
    return occurredAt;
  }

  const date = new Date(input.resolvedAt);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('resolvedAt must be a valid ISO date-time');
  }

  return date;
}

async function createDiagnosisRecord(
  input: Readonly<{
    support: DiagnosisCommandService;
    normalized: NormalizedEncounterDiagnosisInput;
    encounterId: string;
    patientId: string;
    providerId: string;
    actor: ClinicalEmrActorContext;
    transaction: ClinicalEmrTransactionContext;
    occurredAt: Date;
    supersedesEncounterDiagnosisId?: string | null;
    encounterDiagnosisId?: string;
  }>,
): Promise<EncounterDiagnosisRecord> {
  const encounterDiagnosisId =
    input.encounterDiagnosisId ?? input.support.common.newId();

  const created = await input.support.encounterDiagnoses.create({
    encounterDiagnosisId,
    facilityId: input.actor.facilityId,
    encounterId: input.encounterId,
    patientId: input.patientId,
    diagnosisId: input.normalized.diagnosisId,
    codeSystem: input.normalized.codeSystem,
    code: input.normalized.code,
    display: input.normalized.display,
    role: input.normalized.role,
    certainty: input.normalized.certainty,
    clinicalNoteId: input.normalized.clinicalNoteId,
    onsetDate: normalizedDate(input.normalized.onsetDate, 'onsetDate'),
    isChronic: input.normalized.isChronic,
    presentOnAdmission: input.normalized.presentOnAdmission,
    evidence: input.normalized.evidence,
    recordedAt: input.occurredAt,
    recordedBy: input.actor.userId,
    supersedesEncounterDiagnosisId:
      input.supersedesEncounterDiagnosisId ?? null,
    transactionId: input.transaction.transactionId,
    correlationId: input.actor.correlationId,
  });

  await input.transaction.registerCompensation(
    deleteCreatedClinicalRecordCompensation({
      key: `delete-encounter-diagnosis:${encounterDiagnosisId}`,
      collection: 'encounterDiagnoses',
      entityId: encounterDiagnosisId,
      expectedVersion: 0,
      transactionId: input.transaction.transactionId,
    }),
  );

  await input.transaction.checkpoint(
    CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
    {
      encounterDiagnosisId,
      encounterId: input.encounterId,
    },
  );

  return created;
}

async function publishDiagnosisMutation(
  input: Readonly<{
    support: DiagnosisCommandService;
    transaction: ClinicalEmrTransactionContext;
    actor: ClinicalEmrActorContext;
    occurredAt: Date;
    auditAction: string;
    before: EncounterDiagnosisRecord | null;
    after: EncounterDiagnosisRecord;
    providerId: string;
    reason?: string;
  }>,
): Promise<void> {
  await input.support.common.publishMutation({
    transaction: input.transaction,
    actor: input.actor,
    occurredAt: input.occurredAt,
    auditAction: input.auditAction,
    outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.DIAGNOSIS_CHANGED,
    realtimeEventTypes: [
      CLINICAL_EMR_REALTIME_EVENTS.DIAGNOSIS_CHANGED,
      CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
    ],
    aggregateType: 'EncounterDiagnosis',
    entityType: 'EncounterDiagnosis',
    entityId: input.after._id.toHexString(),
    patientId: input.after.patientId.toHexString(),
    encounterId: input.after.encounterId.toHexString(),
    providerId: input.providerId,
    before: input.before,
    after: input.after,
    beforeSnapshot: encounterDiagnosisAuditSnapshot,
    afterSnapshot: encounterDiagnosisAuditSnapshot,
    eventPayload: safeEncounterDiagnosisEventPayload,
    ...(input.reason === undefined
      ? {}
      : {
          reason: input.reason,
        }),
  });
}

export interface RecordEncounterDiagnosisCommand {
  input: RecordEncounterDiagnosisInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class RecordEncounterDiagnosisWorkflow {
  public constructor(
    private readonly support: DiagnosisCommandService,
  ) {}

  public async execute(
    command: RecordEncounterDiagnosisCommand,
  ): Promise<EncounterDiagnosisMutationResult> {
    const encounter = await this.support.common.requireEncounter(
      command.actor,
      command.input.encounterId,
    );

    if (!mutableEncounterStatuses.has(encounter.status)) {
      throw new InvalidEncounterTransitionError(
        encounter.status,
        'IN_PROGRESS',
      );
    }

    const providerId = await this.support.common.requireProvider(
      command.actor,
    );

    await this.support.common.assertAccess(
      command.actor,
      encounter,
      'CREATE',
    );

    const normalized = await this.support.normalizeInput(
      command.actor,
      command.input,
    );

    await this.support.common.requireClinicalNoteReference(
      command.actor,
      encounter,
      normalized.clinicalNoteId,
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.RECORD_ENCOUNTER_DIAGNOSIS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterDiagnosisCreateLockKeys(
        command.actor.facilityId,
        encounter,
        normalized.codeSystem,
        normalized.code,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safeDiagnosisJournalPayload(
        'RECORD_ENCOUNTER_DIAGNOSIS',
        encounter,
      ),
      execute: async (transaction) => {
        const currentEncounter =
          await this.support.common.requireEncounter(
            command.actor,
            command.input.encounterId,
          );

        if (!mutableEncounterStatuses.has(currentEncounter.status)) {
          throw new InvalidEncounterTransitionError(
            currentEncounter.status,
            'IN_PROGRESS',
          );
        }

        await this.support.common.assertAccess(
          command.actor,
          currentEncounter,
          'CREATE',
        );

        const created = await createDiagnosisRecord({
          support: this.support,
          normalized,
          encounterId: currentEncounter._id.toHexString(),
          patientId: currentEncounter.patientId.toHexString(),
          providerId,
          actor: command.actor,
          transaction,
          occurredAt: this.support.common.dependencies.clock.now(),
        });

        const occurredAt = created.recordedAt;

        await this.support.common.touchEncounter({
          encounter: currentEncounter,
          occurredAt,
          actor: command.actor,
          transaction,
          latestDiagnosisAt: occurredAt,
        });

        await publishDiagnosisMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.DIAGNOSIS_RECORDED,
          before: null,
          after: created,
          providerId,
        });

        return toEncounterDiagnosisMutationResult(created);
      },
    });
  }
}

export interface VerifyEncounterDiagnosisCommand {
  encounterDiagnosisId: string;
  input: VerifyEncounterDiagnosisInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class VerifyEncounterDiagnosisWorkflow {
  public constructor(
    private readonly support: DiagnosisCommandService,
  ) {}

  public async execute(
    command: VerifyEncounterDiagnosisCommand,
  ): Promise<EncounterDiagnosisMutationResult> {
    const existing = await this.support.requireEncounterDiagnosis(
      command.actor,
      command.encounterDiagnosisId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );

    const encounter = await this.support.common.requireEncounter(
      command.actor,
      existing.encounterId.toHexString(),
    );
    const providerId = await this.support.common.requireProvider(
      command.actor,
    );

    await this.support.common.assertAccess(
      command.actor,
      encounter,
      'FINALIZE',
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.VERIFY_ENCOUNTER_DIAGNOSIS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterDiagnosisMutationLockKeys(
        command.actor.facilityId,
        encounter,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterDiagnosisId: command.encounterDiagnosisId,
        expectedVersion: command.input.expectedVersion,
      },
      journalPayload: safeDiagnosisJournalPayload(
        'VERIFY_ENCOUNTER_DIAGNOSIS',
        encounter,
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireEncounterDiagnosis(
          command.actor,
          command.encounterDiagnosisId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );

        const occurredAt = this.support.common.dependencies.clock.now();
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'encounterDiagnoses',
          entityId: command.encounterDiagnosisId,
          expectedPostVersion: current.version + 1,
          snapshot: encounterDiagnosisRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const updated =
          await this.support.encounterDiagnoses.verifyWithVersion({
            facilityId: command.actor.facilityId,
            encounterDiagnosisId: command.encounterDiagnosisId,
            expectedVersion: current.version,
            occurredAt,
            actorUserId: command.actor.userId,
          });

        if (updated === null) {
          throw new EncounterDiagnosisConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-encounter-diagnosis:${command.encounterDiagnosisId}:${updated.version}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            encounterDiagnosisId: command.encounterDiagnosisId,
            version: updated.version,
          },
        );

        await publishDiagnosisMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.DIAGNOSIS_VERIFIED,
          before: current,
          after: updated,
          providerId,
        });

        return toEncounterDiagnosisMutationResult(updated);
      },
    });
  }
}

export interface ChangeEncounterDiagnosisStatusCommand {
  encounterDiagnosisId: string;
  input: ChangeEncounterDiagnosisStatusInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class ChangeEncounterDiagnosisStatusWorkflow {
  public constructor(
    private readonly support: DiagnosisCommandService,
  ) {}

  public async execute(
    command: ChangeEncounterDiagnosisStatusCommand,
  ): Promise<EncounterDiagnosisMutationResult> {
    const existing = await this.support.requireEncounterDiagnosis(
      command.actor,
      command.encounterDiagnosisId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );

    const encounter = await this.support.common.requireEncounter(
      command.actor,
      existing.encounterId.toHexString(),
    );
    const providerId = await this.support.common.requireProvider(
      command.actor,
    );

    await this.support.common.assertAccess(
      command.actor,
      encounter,
      command.input.status === 'ENTERED_IN_ERROR'
        ? 'CORRECT'
        : 'UPDATE',
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.CHANGE_ENCOUNTER_DIAGNOSIS_STATUS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterDiagnosisMutationLockKeys(
        command.actor.facilityId,
        encounter,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterDiagnosisId: command.encounterDiagnosisId,
        input: command.input,
      },
      journalPayload: safeDiagnosisJournalPayload(
        'CHANGE_ENCOUNTER_DIAGNOSIS_STATUS',
        encounter,
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireEncounterDiagnosis(
          command.actor,
          command.encounterDiagnosisId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );

        const occurredAt = this.support.common.dependencies.clock.now();
        const reason = requiredReason(command.input.reason);
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'encounterDiagnoses',
          entityId: command.encounterDiagnosisId,
          expectedPostVersion: current.version + 1,
          snapshot: encounterDiagnosisRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const updated =
          await this.support.encounterDiagnoses.changeStatusWithVersion({
            facilityId: command.actor.facilityId,
            encounterDiagnosisId: command.encounterDiagnosisId,
            expectedVersion: current.version,
            status: command.input.status,
            reason,
            resolvedAt: resolvedAtDate(command.input, occurredAt),
            replacementEncounterDiagnosisId: null,
            actorUserId: command.actor.userId,
          });

        if (updated === null) {
          throw new EncounterDiagnosisConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-encounter-diagnosis:${command.encounterDiagnosisId}:${updated.version}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            encounterDiagnosisId: command.encounterDiagnosisId,
            status: updated.status,
          },
        );

        await publishDiagnosisMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction:
            CLINICAL_EMR_AUDIT_ACTIONS.DIAGNOSIS_STATUS_CHANGED,
          before: current,
          after: updated,
          providerId,
          reason,
        });

        return toEncounterDiagnosisMutationResult(updated);
      },
    });
  }
}

export interface CorrectEncounterDiagnosisCommand {
  encounterDiagnosisId: string;
  input: CorrectEncounterDiagnosisInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface CorrectEncounterDiagnosisResult {
  original: EncounterDiagnosisMutationResult;
  replacement: EncounterDiagnosisMutationResult;
}

export class CorrectEncounterDiagnosisWorkflow {
  public constructor(
    private readonly support: DiagnosisCommandService,
  ) {}

  public async execute(
    command: CorrectEncounterDiagnosisCommand,
  ): Promise<CorrectEncounterDiagnosisResult> {
    const existing = await this.support.requireEncounterDiagnosis(
      command.actor,
      command.encounterDiagnosisId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );

    const encounter = await this.support.common.requireEncounter(
      command.actor,
      existing.encounterId.toHexString(),
    );
    const providerId = await this.support.common.requireProvider(
      command.actor,
    );

    await this.support.common.assertAccess(
      command.actor,
      encounter,
      'CORRECT',
    );

    const normalized = await this.support.normalizeInput(
      command.actor,
      command.input.replacement,
    );
    const reason = requiredReason(command.input.reason);

    await this.support.common.requireClinicalNoteReference(
      command.actor,
      encounter,
      normalized.clinicalNoteId,
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType:
        CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_ENCOUNTER_DIAGNOSIS,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: encounterDiagnosisMutationLockKeys(
        command.actor.facilityId,
        encounter,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterDiagnosisId: command.encounterDiagnosisId,
        input: command.input,
      },
      journalPayload: safeDiagnosisJournalPayload(
        'CORRECT_ENCOUNTER_DIAGNOSIS',
        encounter,
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireEncounterDiagnosis(
          command.actor,
          command.encounterDiagnosisId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );

        const occurredAt = this.support.common.dependencies.clock.now();
        const replacementId = this.support.common.newId();
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'encounterDiagnoses',
          entityId: command.encounterDiagnosisId,
          expectedPostVersion: current.version + 1,
          snapshot: encounterDiagnosisRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const corrected =
          await this.support.encounterDiagnoses.changeStatusWithVersion({
            facilityId: command.actor.facilityId,
            encounterDiagnosisId: command.encounterDiagnosisId,
            expectedVersion: current.version,
            status: 'ENTERED_IN_ERROR',
            reason,
            resolvedAt: null,
            replacementEncounterDiagnosisId: replacementId,
            actorUserId: command.actor.userId,
          });

        if (corrected === null) {
          throw new EncounterDiagnosisConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-encounter-diagnosis:${command.encounterDiagnosisId}:${corrected.version}`,
            restorePayload,
          ),
        );

        const replacement = await createDiagnosisRecord({
          support: this.support,
          normalized,
          encounterId: encounter._id.toHexString(),
          patientId: encounter.patientId.toHexString(),
          providerId,
          actor: command.actor,
          transaction,
          occurredAt,
          supersedesEncounterDiagnosisId: command.encounterDiagnosisId,
          encounterDiagnosisId: replacementId,
        });

        if (mutableEncounterStatuses.has(encounter.status)) {
          await this.support.common.touchEncounter({
            encounter,
            occurredAt,
            actor: command.actor,
            transaction,
            latestDiagnosisAt: occurredAt,
          });
        }

        await publishDiagnosisMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.DIAGNOSIS_CORRECTED,
          before: current,
          after: corrected,
          providerId,
          reason,
        });

        await publishDiagnosisMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.DIAGNOSIS_RECORDED,
          before: null,
          after: replacement,
          providerId,
        });

        return {
          original: toEncounterDiagnosisMutationResult(corrected),
          replacement: toEncounterDiagnosisMutationResult(replacement),
        };
      },
    });
  }
}