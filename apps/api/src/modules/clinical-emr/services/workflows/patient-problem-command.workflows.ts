import type {
  PatientProblemVersionChangeType,
} from '@hospital-mis/database';

import {
  InvalidEncounterTransitionError,
  PatientProblemConcurrencyError,
} from '../../clinical-emr.errors.js';

import {
  toPatientProblemMutationResult,
  type PatientProblemMutationResult,
} from '../../clinical-emr.mapper.js';

import {
  deleteCreatedClinicalRecordCompensation,
  patientProblemRestoreSnapshot,
  protectedClinicalEmrRestorePayload,
  restoreClinicalRecordCompensation,
} from '../../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../../clinical-emr.ports.js';

import {
  patientProblemAuditSnapshot,
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
  CorrectPatientProblemInput,
  CreatePatientProblemInput,
  EncounterRecord,
  PatientProblemRecord,
  UpdatePatientProblemInput,
} from '../../clinical-emr.types.js';

import {
  assertPatientProblemTransition,
  patientProblemCreateLockKeys,
  patientProblemMutationLockKeys,
  safePatientProblemEventPayload,
  safePatientProblemJournalPayload,
} from '../../clinical-emr.workflow-helpers.js';

import type {
  NormalizedPatientProblemInput,
  PatientProblemCommandService,
} from '../patient-problem-command.service.js';

const activeEncounterStatuses = new Set([
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

function resolvedAt(
  input: UpdatePatientProblemInput,
  occurredAt: Date,
): Date | null {
  if (input.status !== 'RESOLVED') {
    return null;
  }

  if (input.resolvedAt == null) {
    return occurredAt;
  }

  const value = new Date(input.resolvedAt);

  if (Number.isNaN(value.getTime())) {
    throw new TypeError('resolvedAt must be a valid ISO date-time');
  }

  return value;
}

function requiredReason(
  input: UpdatePatientProblemInput,
): string | null {
  const reason = input.reason?.trim() ?? '';

  if (input.status === 'ACTIVE') {
    return reason.length === 0 ? null : reason;
  }

  if (reason.length < 5) {
    throw new TypeError(
      `${input.status} problem transitions require a reason of at least 5 characters`,
    );
  }

  return reason;
}

function versionChangeType(
  before: PatientProblemRecord,
  after: PatientProblemRecord,
): PatientProblemVersionChangeType {
  if (after.status === 'ENTERED_IN_ERROR') {
    return 'ENTERED_IN_ERROR';
  }

  if (after.status === 'RESOLVED') {
    return 'RESOLVED';
  }

  if (after.status === 'ACTIVE' && before.status !== 'ACTIVE') {
    return 'REOPENED';
  }

  return 'UPDATED';
}

async function createProblemRecord(
  input: Readonly<{
    support: PatientProblemCommandService;
    normalized: NormalizedPatientProblemInput;
    encounter: EncounterRecord;
    actor: ClinicalEmrActorContext;
    transaction: ClinicalEmrTransactionContext;
    occurredAt: Date;
    supersedesProblemId?: string | null;
    patientProblemId?: string;
    versionId?: string;
  }>,
): Promise<PatientProblemRecord> {
  const allocation = await input.support.allocateNumber(input.encounter);
  const patientProblemId =
    input.patientProblemId ?? input.support.common.newId();
  const versionId = input.versionId ?? input.support.common.newId();

  await input.transaction.checkpoint(
    CLINICAL_EMR_TRANSACTION_STATES.NUMBER_ALLOCATED,
    {
      sequenceKey: allocation.sequenceKey,
      sequenceValue: allocation.sequenceValue,
    },
  );

  const created = await input.support.problems.create({
    patientProblemId,
    initialVersionId: versionId,
    facilityId: input.actor.facilityId,
    problemNumber: allocation.number,
    patientId: input.encounter.patientId.toHexString(),
    diagnosisId: input.normalized.diagnosisId,
    sourceEncounterId: input.encounter._id.toHexString(),
    sourceEncounterDiagnosisId:
      input.normalized.sourceEncounterDiagnosisId,
    codeSystem: input.normalized.codeSystem,
    code: input.normalized.code,
    display: input.normalized.display,
    onsetDate: normalizedDate(input.normalized.onsetDate, 'onsetDate'),
    summary: input.normalized.summary,
    recordedAt: input.occurredAt,
    recordedBy: input.actor.userId,
    supersedesProblemId: input.supersedesProblemId ?? null,
    transactionId: input.transaction.transactionId,
    correlationId: input.actor.correlationId,
  });

  await input.transaction.registerCompensation(
    deleteCreatedClinicalRecordCompensation({
      key: `delete-patient-problem:${patientProblemId}`,
      collection: 'patientProblems',
      entityId: patientProblemId,
      expectedVersion: 0,
      transactionId: input.transaction.transactionId,
    }),
  );

  await input.transaction.checkpoint(
    CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_CREATED,
    {
      patientProblemId,
      problemNumber: created.problemNumber,
    },
  );

  await input.support.appendVersion(
    {
      versionId,
      problem: created,
      previousVersionId: null,
      changeType: 'CREATED',
      changeReason: null,
      occurredAt: input.occurredAt,
      actor: input.actor,
    },
    input.transaction,
  );

  return created;
}

async function publishProblemMutation(
  input: Readonly<{
    support: PatientProblemCommandService;
    transaction: ClinicalEmrTransactionContext;
    actor: ClinicalEmrActorContext;
    occurredAt: Date;
    auditAction: string;
    before: PatientProblemRecord | null;
    after: PatientProblemRecord;
    providerId: string;
    reason?: string;
  }>,
): Promise<void> {
  await input.support.common.publishMutation({
    transaction: input.transaction,
    actor: input.actor,
    occurredAt: input.occurredAt,
    auditAction: input.auditAction,
    outboxEventType: CLINICAL_EMR_OUTBOX_EVENTS.PROBLEM_LIST_CHANGED,
    realtimeEventTypes: [
      CLINICAL_EMR_REALTIME_EVENTS.PROBLEM_LIST_CHANGED,
      CLINICAL_EMR_REALTIME_EVENTS.PATIENT_TIMELINE_CHANGED,
    ],
    aggregateType: 'PatientProblem',
    entityType: 'PatientProblem',
    entityId: input.after._id.toHexString(),
    patientId: input.after.patientId.toHexString(),
    encounterId: input.after.sourceEncounterId.toHexString(),
    providerId: input.providerId,
    before: input.before,
    after: input.after,
    beforeSnapshot: patientProblemAuditSnapshot,
    afterSnapshot: patientProblemAuditSnapshot,
    eventPayload: safePatientProblemEventPayload,
    ...(input.reason === undefined
      ? {}
      : {
          reason: input.reason,
        }),
  });
}

export interface CreatePatientProblemCommand {
  input: CreatePatientProblemInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class CreatePatientProblemWorkflow {
  public constructor(
    private readonly support: PatientProblemCommandService,
  ) {}

  public async execute(
    command: CreatePatientProblemCommand,
  ): Promise<PatientProblemMutationResult> {
    const encounter = await this.support.common.requireEncounter(
      command.actor,
      command.input.sourceEncounterId,
    );

    if (!activeEncounterStatuses.has(encounter.status)) {
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
      encounter,
      command.input,
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CREATE_PATIENT_PROBLEM,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientProblemCreateLockKeys(
        command.actor.facilityId,
        encounter,
        normalized.codeSystem,
        normalized.code,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        input: command.input,
      },
      journalPayload: safePatientProblemJournalPayload(
        'CREATE_PATIENT_PROBLEM',
        undefined,
        encounter,
      ),
      execute: async (transaction) => {
        const currentEncounter =
          await this.support.common.requireEncounter(
            command.actor,
            command.input.sourceEncounterId,
          );

        if (!activeEncounterStatuses.has(currentEncounter.status)) {
          throw new InvalidEncounterTransitionError(
            currentEncounter.status,
            'IN_PROGRESS',
          );
        }

        const occurredAt = this.support.common.dependencies.clock.now();
        const created = await createProblemRecord({
          support: this.support,
          normalized,
          encounter: currentEncounter,
          actor: command.actor,
          transaction,
          occurredAt,
        });

        await this.support.common.touchEncounter({
          encounter: currentEncounter,
          occurredAt,
          actor: command.actor,
          transaction,
        });

        await publishProblemMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.PROBLEM_CREATED,
          before: null,
          after: created,
          providerId,
        });

        return toPatientProblemMutationResult(created);
      },
    });
  }
}

export interface UpdatePatientProblemCommand {
  patientProblemId: string;
  input: UpdatePatientProblemInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export class UpdatePatientProblemWorkflow {
  public constructor(
    private readonly support: PatientProblemCommandService,
  ) {}

  public async execute(
    command: UpdatePatientProblemCommand,
  ): Promise<PatientProblemMutationResult> {
    const existing = await this.support.requireProblem(
      command.actor,
      command.patientProblemId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );
    assertPatientProblemTransition(existing.status, command.input.status);

    const encounter = await this.support.common.requireEncounter(
      command.actor,
      existing.sourceEncounterId.toHexString(),
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
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.UPDATE_PATIENT_PROBLEM,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientProblemMutationLockKeys(
        command.actor.facilityId,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        patientProblemId: command.patientProblemId,
        input: command.input,
      },
      journalPayload: safePatientProblemJournalPayload(
        'UPDATE_PATIENT_PROBLEM',
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireProblem(
          command.actor,
          command.patientProblemId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );
        assertPatientProblemTransition(current.status, command.input.status);

        const occurredAt = this.support.common.dependencies.clock.now();
        const versionId = this.support.common.newId();
        const reason = requiredReason(command.input);
        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'patientProblems',
          entityId: command.patientProblemId,
          expectedPostVersion: current.version + 1,
          snapshot: patientProblemRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const updated = await this.support.problems.updateWithVersion({
          facilityId: command.actor.facilityId,
          patientProblemId: command.patientProblemId,
          expectedVersion: current.version,
          nextClinicalVersion: current.currentVersion + 1,
          versionId,
          codeSystem: current.codeSystem,
          code: current.code,
          status: command.input.status,
          summary:
            command.input.summary === undefined
              ? current.summary
              : command.input.summary?.trim() || null,
          onsetDate:
            command.input.onsetDate === undefined
              ? current.onsetDate
              : normalizedDate(command.input.onsetDate, 'onsetDate'),
          resolvedAt: resolvedAt(command.input, occurredAt),
          reason,
          actorUserId: command.actor.userId,
        });

        if (updated === null) {
          throw new PatientProblemConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-patient-problem:${command.patientProblemId}:${updated.version}`,
            restorePayload,
          ),
        );

        await transaction.checkpoint(
          CLINICAL_EMR_TRANSACTION_STATES.CURRENT_PROJECTION_UPDATED,
          {
            patientProblemId: command.patientProblemId,
            status: updated.status,
            currentVersion: updated.currentVersion,
          },
        );

        await this.support.appendVersion(
          {
            versionId,
            problem: updated,
            previousVersionId:
              current.latestVersionId?.toHexString() ?? null,
            changeType: versionChangeType(current, updated),
            changeReason: reason,
            occurredAt,
            actor: command.actor,
          },
          transaction,
        );

        await publishProblemMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.PROBLEM_UPDATED,
          before: current,
          after: updated,
          providerId,
          ...(reason === null ? {} : { reason }),
        });

        return toPatientProblemMutationResult(updated);
      },
    });
  }
}

export interface CorrectPatientProblemCommand {
  patientProblemId: string;
  input: CorrectPatientProblemInput;
  actor: ClinicalEmrActorContext;
  idempotencyKey: string;
}

export interface CorrectPatientProblemResult {
  original: PatientProblemMutationResult;
  replacement: PatientProblemMutationResult;
}

export class CorrectPatientProblemWorkflow {
  public constructor(
    private readonly support: PatientProblemCommandService,
  ) {}

  public async execute(
    command: CorrectPatientProblemCommand,
  ): Promise<CorrectPatientProblemResult> {
    const existing = await this.support.requireProblem(
      command.actor,
      command.patientProblemId,
    );
    this.support.assertExpectedVersion(
      existing,
      command.input.expectedVersion,
    );

    const encounter = await this.support.common.requireEncounter(
      command.actor,
      existing.sourceEncounterId.toHexString(),
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
      encounter,
      {
        ...command.input.replacement,
        sourceEncounterDiagnosisId: null,
      },
    );

    return this.support.common.dependencies.transactionManager.execute({
      transactionType: CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_PATIENT_PROBLEM,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: patientProblemMutationLockKeys(
        command.actor.facilityId,
        existing,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        patientProblemId: command.patientProblemId,
        input: command.input,
      },
      journalPayload: safePatientProblemJournalPayload(
        'CORRECT_PATIENT_PROBLEM',
        existing,
      ),
      execute: async (transaction) => {
        const current = await this.support.requireProblem(
          command.actor,
          command.patientProblemId,
        );
        this.support.assertExpectedVersion(
          current,
          command.input.expectedVersion,
        );

        const occurredAt = this.support.common.dependencies.clock.now();
        const originalVersionId = this.support.common.newId();
        const replacementProblemId = this.support.common.newId();
        const replacementVersionId = this.support.common.newId();
        const reason = command.input.reason.trim();

        if (reason.length < 5) {
          throw new TypeError(
            'Problem correction reason must contain at least 5 characters',
          );
        }

        const restorePayload = protectedClinicalEmrRestorePayload({
          collection: 'patientProblems',
          entityId: command.patientProblemId,
          expectedPostVersion: current.version + 1,
          snapshot: patientProblemRestoreSnapshot(current),
          transactionId: transaction.transactionId,
          snapshotCrypto: this.support.common.dependencies.snapshotCrypto,
        });

        const corrected = await this.support.problems.markCorrectedWithVersion({
          facilityId: command.actor.facilityId,
          patientProblemId: command.patientProblemId,
          expectedVersion: current.version,
          nextClinicalVersion: current.currentVersion + 1,
          versionId: originalVersionId,
          replacementProblemId,
          reason,
          actorUserId: command.actor.userId,
        });

        if (corrected === null) {
          throw new PatientProblemConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreClinicalRecordCompensation(
            `restore-patient-problem:${command.patientProblemId}:${corrected.version}`,
            restorePayload,
          ),
        );

        await this.support.appendVersion(
          {
            versionId: originalVersionId,
            problem: corrected,
            previousVersionId:
              current.latestVersionId?.toHexString() ?? null,
            changeType: 'CORRECTED',
            changeReason: reason,
            occurredAt,
            actor: command.actor,
          },
          transaction,
        );

        const replacement = await createProblemRecord({
          support: this.support,
          normalized,
          encounter,
          actor: command.actor,
          transaction,
          occurredAt,
          supersedesProblemId: command.patientProblemId,
          patientProblemId: replacementProblemId,
          versionId: replacementVersionId,
        });

        if (activeEncounterStatuses.has(encounter.status)) {
          await this.support.common.touchEncounter({
            encounter,
            occurredAt,
            actor: command.actor,
            transaction,
          });
        }

        await publishProblemMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.PROBLEM_CORRECTED,
          before: current,
          after: corrected,
          providerId,
          reason,
        });

        await publishProblemMutation({
          support: this.support,
          transaction,
          actor: command.actor,
          occurredAt,
          auditAction: CLINICAL_EMR_AUDIT_ACTIONS.PROBLEM_CREATED,
          before: null,
          after: replacement,
          providerId,
        });

        return {
          original: toPatientProblemMutationResult(corrected),
          replacement: toPatientProblemMutationResult(replacement),
        };
      },
    });
  }
}