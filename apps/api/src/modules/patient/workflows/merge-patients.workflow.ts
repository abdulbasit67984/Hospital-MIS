import {
  createObjectId,
  type PatientMergeEvidenceCode,
} from '@hospital-mis/database';

import {
  ConflictError,
  RequestValidationError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  patientMutationAuditSnapshot,
} from '../patient.mutation.mapper.js';

import {
  patientRestoreSnapshot,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

import type {
  MergePatientsInput,
  PatientMergeResultDto,
} from '../patient.merge.js';

import {
  buildPatientAuditActorFields,
  type PatientMutationDependencies,
  type PatientTransactionContext,
} from '../patient.ports.js';

import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_COMPENSATION_TYPES,
  PATIENT_OUTBOX_EVENTS,
  PATIENT_TRANSACTION_CHECKPOINTS,
  PATIENT_TRANSACTION_TYPES,
} from '../patient.transaction.constants.js';

import {
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  PatientActorContext,
  PatientIdentifierRecord,
  PatientRecord,
} from '../patient.types.js';

import type {
  PatientMergeRepository,
} from '../repositories/patient-merge.repository.js';

export interface MergePatientsCommand {
  sourcePatientId: string;
  input: MergePatientsInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

interface MergeState {
  source: PatientRecord;
  target: PatientRecord;
  sourceMrn: PatientIdentifierRecord;
  targetMrn: PatientIdentifierRecord;
}

function patientNotFound(
  role:
    | 'source'
    | 'target',
): ResourceNotFoundError {
  return new ResourceNotFoundError(
    `${role === 'source' ? 'Source' : 'Target'} patient was not found`,
  );
}

function patientConcurrency(
  role:
    | 'source'
    | 'target',
): ConflictError {
  return new ConflictError(
    `${role === 'source' ? 'Source' : 'Target'} patient changed before the merge could be completed`,
  );
}

function assertDistinctPatients(
  sourcePatientId: string,
  targetPatientId: string,
): void {
  if (
    sourcePatientId ===
    targetPatientId
  ) {
    throw new RequestValidationError([
      {
        code:
          'patient_merge_same_record',

        message:
          'A patient cannot be merged into itself',

        path:
          'body.targetPatientId',
      },
    ]);
  }
}

function assertMergeablePatient(
  patient: PatientRecord,
  role:
    | 'source'
    | 'target',
): void {
  if (
    patient.status === 'MERGED' ||
    patient.mergeState === 'MERGED' ||
    patient.mergedIntoPatientId !== null
  ) {
    throw new ConflictError(
      `${role === 'source' ? 'Source' : 'Target'} patient is already merged`,
    );
  }

  if (
    patient.canonicalPatientId !== null
  ) {
    throw new ConflictError(
      `${role === 'source' ? 'Source' : 'Target'} patient already references another canonical record`,
    );
  }
}

function assertExpectedVersion(
  patient: PatientRecord,
  expectedVersion: number,
  role:
    | 'source'
    | 'target',
): void {
  if (
    patient.version !==
    expectedVersion
  ) {
    throw patientConcurrency(
      role,
    );
  }
}

function assertEvidence(
  input:
    MergePatientsInput,
): void {
  if (
    input.acknowledgement !==
    'I_CONFIRM_PATIENT_MERGE'
  ) {
    throw new RequestValidationError([
      {
        code:
          'patient_merge_acknowledgement_required',

        message:
          'Explicit patient merge acknowledgement is required',

        path:
          'body.acknowledgement',
      },
    ]);
  }

  if (
    input.evidenceCodes.length === 0 ||
    new Set(
      input.evidenceCodes,
    ).size !==
      input.evidenceCodes.length
  ) {
    throw new RequestValidationError([
      {
        code:
          'patient_merge_evidence_invalid',

        message:
          'At least one unique patient merge evidence code is required',

        path:
          'body.evidenceCodes',
      },
    ]);
  }

  if (
    input.reason
      .normalize('NFKC')
      .trim()
      .length < 10
  ) {
    throw new RequestValidationError([
      {
        code:
          'patient_merge_reason_required',

        message:
          'A detailed patient merge reason is required',

        path:
          'body.reason',
      },
    ]);
  }
}

function safeMergeSnapshot(
  input: Readonly<{
    mergeId: string;
    sourceBefore: PatientRecord;
    sourceAfter: PatientRecord;
    targetBefore: PatientRecord;
    targetAfter: PatientRecord;
    sourceMrn: PatientIdentifierRecord;
    targetMrn: PatientIdentifierRecord;
    evidenceCodes: readonly string[];
    mergedAt: Date;
  }>,
): Record<string, unknown> {
  return {
    mergeId:
      input.mergeId,

    source: {
      ...patientMutationAuditSnapshot(
        input.sourceAfter,
      ),

      enterprisePatientId:
        input.sourceAfter
          .enterprisePatientId,

      primaryMrn:
        input.sourceMrn.displayValue,

      previousStatus:
        input.sourceBefore.status,

      previousVersion:
        input.sourceBefore.version,
    },

    target: {
      ...patientMutationAuditSnapshot(
        input.targetAfter,
      ),

      enterprisePatientId:
        input.targetAfter
          .enterprisePatientId,

      primaryMrn:
        input.targetMrn.displayValue,

      previousStatus:
        input.targetBefore.status,

      previousVersion:
        input.targetBefore.version,
    },

    evidenceCodes: [
      ...input.evidenceCodes,
    ],

    strategy:
      'CANONICAL_REDIRECT',

    mergedAt:
      input.mergedAt.toISOString(),
  };
}

function toMergeResult(
  input: Readonly<{
    mergeId: string;
    source: PatientRecord;
    target: PatientRecord;
    sourceMrn: PatientIdentifierRecord;
    targetMrn: PatientIdentifierRecord;
    evidenceCodes: readonly PatientMergeEvidenceCode[];
    mergedAt: Date;
  }>,
): PatientMergeResultDto {
  return {
    mergeId:
      input.mergeId,

    status:
      'COMPLETED',

    strategy:
      'CANONICAL_REDIRECT',

    source: {
      patientId:
        input.source._id.toHexString(),

      enterprisePatientId:
        input.source.enterprisePatientId,

      mrn:
        input.sourceMrn.displayValue,

      status:
        'MERGED',

      version:
        input.source.version,
    },

    target: {
      patientId:
        input.target._id.toHexString(),

      enterprisePatientId:
        input.target.enterprisePatientId,

      mrn:
        input.targetMrn.displayValue,

      status:
        input.target.status,

      version:
        input.target.version,
    },

    evidenceCodes: [
      ...input.evidenceCodes,
    ],

    mergedAt:
      input.mergedAt.toISOString(),
  };
}

export class MergePatientsWorkflow {
  public constructor(
    private readonly merges:
      PatientMergeRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      MergePatientsCommand,
  ): Promise<PatientMergeResultDto> {
    assertDistinctPatients(
      command.sourcePatientId,
      command.input.targetPatientId,
    );

    assertEvidence(
      command.input,
    );

    const initial =
      await this.loadState(
        command.actor.facilityId,
        command.sourcePatientId,
        command.input.targetPatientId,
      );

    this.assertState(
      initial,
      command.input,
    );

    if (
      await this.merges
        .findCompletedBySource(
          command.actor.facilityId,
          command.sourcePatientId,
        ) !== null
    ) {
      throw new ConflictError(
        'The source patient already has a completed merge record',
      );
    }

    const snapshotCrypto =
      requirePatientSnapshotCrypto(
        this.dependencies,
      );

    const lockKeys = [
      `patient:id:${command.sourcePatientId}`,
      `patient:id:${command.input.targetPatientId}`,
      `patient:merge-source:${command.sourcePatientId}`,
      `patient:merge-target:${command.input.targetPatientId}`,
    ].sort();

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .MERGE_PATIENTS,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys,

          idempotencyPayload: {
            sourcePatientId:
              command.sourcePatientId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'MERGE_PATIENTS',

            sourcePatientId:
              command.sourcePatientId,

            targetPatientId:
              command.input.targetPatientId,

            expectedSourceVersion:
              command.input
                .expectedSourceVersion,

            expectedTargetVersion:
              command.input
                .expectedTargetVersion,

            evidenceCodes: [
              ...command.input
                .evidenceCodes,
            ],

            strategy:
              'CANONICAL_REDIRECT',
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.loadState(
                  command.actor.facilityId,
                  command.sourcePatientId,
                  command.input
                    .targetPatientId,
                );

              this.assertState(
                current,
                command.input,
              );

              if (
                await this.merges
                  .findCompletedBySource(
                    command.actor
                      .facilityId,
                    command.sourcePatientId,
                  ) !== null
              ) {
                throw new ConflictError(
                  'The source patient already has a completed merge record',
                );
              }

              const mergedAt =
                this.dependencies
                  .clock.now();

              await this.registerPatientRestore(
                transaction,
                current.source,
                snapshotCrypto,
              );

              const sourceAfter =
                await this.merges
                  .markSourceMerged({
                    facilityId:
                      command.actor
                        .facilityId,

                    sourcePatientId:
                      command.sourcePatientId,

                    targetPatientId:
                      command.input
                        .targetPatientId,

                    expectedVersion:
                      command.input
                        .expectedSourceVersion,

                    mergedAt,

                    mergedBy:
                      command.actor.userId,

                    reason:
                      command.input.reason,
                  });

              if (
                sourceAfter === null
              ) {
                throw patientConcurrency(
                  'source',
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .MERGE_SOURCE_MARKED,
                {
                  sourcePatientId:
                    command.sourcePatientId,

                  targetPatientId:
                    command.input
                      .targetPatientId,

                  sourceVersion:
                    sourceAfter.version,
                },
              );

              await this.registerPatientRestore(
                transaction,
                current.target,
                snapshotCrypto,
              );

              const targetAfter =
                await this.merges
                  .markTargetCanonical({
                    facilityId:
                      command.actor
                        .facilityId,

                    targetPatientId:
                      command.input
                        .targetPatientId,

                    expectedVersion:
                      command.input
                        .expectedTargetVersion,

                    actorUserId:
                      command.actor.userId,
                  });

              if (
                targetAfter === null
              ) {
                throw patientConcurrency(
                  'target',
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .MERGE_TARGET_CONFIRMED,
                {
                  targetPatientId:
                    command.input
                      .targetPatientId,

                  targetVersion:
                    targetAfter.version,
                },
              );

              const mergeDocumentId =
                createObjectId()
                  .toHexString();

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-patient-merge:${mergeDocumentId}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_MERGE,

                  payload: {
                    entityId:
                      mergeDocumentId,

                    expectedVersion:
                      0,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const merge =
                await this.merges
                  .createCompleted({
                    mergeDocumentId,

                    facilityId:
                      command.actor
                        .facilityId,

                    sourcePatientId:
                      command.sourcePatientId,

                    targetPatientId:
                      command.input
                        .targetPatientId,

                    sourceEnterprisePatientId:
                      current.source
                        .enterprisePatientId,

                    targetEnterprisePatientId:
                      current.target
                        .enterprisePatientId,

                    sourcePrimaryMrn:
                      current.sourceMrn
                        .displayValue,

                    targetPrimaryMrn:
                      current.targetMrn
                        .displayValue,

                    evidenceCodes:
                      command.input
                        .evidenceCodes,

                    reason:
                      command.input.reason,

                    sourceStatusBefore:
                      current.source.status,

                    targetStatusBefore:
                      current.target.status,

                    sourceVersionBefore:
                      current.source.version,

                    sourceVersionAfter:
                      sourceAfter.version,

                    targetVersionBefore:
                      current.target.version,

                    targetVersionAfter:
                      targetAfter.version,

                    mergedAt,

                    mergedBy:
                      command.actor.userId,

                    transactionId:
                      transaction.transactionId,

                    correlationId:
                      command.actor
                        .correlationId,
                  });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_MERGE_RECORDED,
                {
                  mergeId:
                    merge.mergeId,

                  sourcePatientId:
                    command.sourcePatientId,

                  targetPatientId:
                    command.input
                      .targetPatientId,
                },
              );

              const auditSnapshot =
                safeMergeSnapshot({
                  mergeId:
                    merge.mergeId,

                  sourceBefore:
                    current.source,

                  sourceAfter,

                  targetBefore:
                    current.target,

                  targetAfter,

                  sourceMrn:
                    current.sourceMrn,

                  targetMrn:
                    current.targetMrn,

                  evidenceCodes:
                    command.input
                      .evidenceCodes,

                  mergedAt,
                });

              await this.dependencies
                .audit.append({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:audit:patients-merged`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENTS_MERGED,

                  entityType:
                    'PatientMerge',

                  entityId:
                    merge.mergeId,

                  ...buildPatientAuditActorFields(
                    command.actor,
                  ),

                  occurredAt:
                    mergedAt,

                  reason:
                    command.input.reason,

                  before: {
                    source:
                      patientMutationAuditSnapshot(
                        current.source,
                      ),

                    target:
                      patientMutationAuditSnapshot(
                        current.target,
                      ),
                  },

                  after:
                    auditSnapshot,

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    evidenceCodes: [
                      ...command.input
                        .evidenceCodes,
                    ],

                    strategy:
                      'CANONICAL_REDIRECT',
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  mergeId:
                    merge.mergeId,
                },
              );

              await this.dependencies
                .outbox.enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:patients-merged`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENTS_MERGED,

                  aggregateType:
                    'Patient',

                  aggregateId:
                    targetAfter._id
                      .toHexString(),

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    command.actor.facilityId,

                  correlationId:
                    command.actor
                      .correlationId,

                  occurredAt:
                    mergedAt,

                  payload: {
                    mergeId:
                      merge.mergeId,

                    sourcePatientId:
                      sourceAfter._id
                        .toHexString(),

                    sourceEnterprisePatientId:
                      sourceAfter
                        .enterprisePatientId,

                    sourceMrn:
                      current.sourceMrn
                        .displayValue,

                    targetPatientId:
                      targetAfter._id
                        .toHexString(),

                    targetEnterprisePatientId:
                      targetAfter
                        .enterprisePatientId,

                    targetMrn:
                      current.targetMrn
                        .displayValue,

                    strategy:
                      'CANONICAL_REDIRECT',

                    evidenceCodes: [
                      ...command.input
                        .evidenceCodes,
                    ],

                    sourceVersion:
                      sourceAfter.version,

                    targetVersion:
                      targetAfter.version,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  mergeId:
                    merge.mergeId,
                },
              );

              return toMergeResult({
                mergeId:
                  merge.mergeId,

                source:
                  sourceAfter,

                target:
                  targetAfter,

                sourceMrn:
                  current.sourceMrn,

                targetMrn:
                  current.targetMrn,

                evidenceCodes:
                  command.input
                    .evidenceCodes,

                mergedAt,
              });
            },
        });
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }

  private async loadState(
    facilityId: string,
    sourcePatientId: string,
    targetPatientId: string,
  ): Promise<MergeState> {
    const [
      source,
      target,
      sourceMrn,
      targetMrn,
    ] = await Promise.all([
      this.merges.findPatientForMerge(
        facilityId,
        sourcePatientId,
      ),

      this.merges.findPatientForMerge(
        facilityId,
        targetPatientId,
      ),

      this.merges.findPrimaryMrn(
        facilityId,
        sourcePatientId,
      ),

      this.merges.findPrimaryMrn(
        facilityId,
        targetPatientId,
      ),
    ]);

    if (source === null) {
      throw patientNotFound(
        'source',
      );
    }

    if (target === null) {
      throw patientNotFound(
        'target',
      );
    }

    if (sourceMrn === null) {
      throw new ConflictError(
        'Source patient has no active primary medical record number',
      );
    }

    if (targetMrn === null) {
      throw new ConflictError(
        'Target patient has no active primary medical record number',
      );
    }

    return {
      source,
      target,
      sourceMrn,
      targetMrn,
    };
  }

  private assertState(
    state: MergeState,
    input: MergePatientsInput,
  ): void {
    assertMergeablePatient(
      state.source,
      'source',
    );

    assertMergeablePatient(
      state.target,
      'target',
    );

    assertExpectedVersion(
      state.source,
      input.expectedSourceVersion,
      'source',
    );

    assertExpectedVersion(
      state.target,
      input.expectedTargetVersion,
      'target',
    );

    if (
      state.source.enterprisePatientId ===
      state.target.enterprisePatientId
    ) {
      throw new ConflictError(
        'Source and target patient enterprise identifiers must differ',
      );
    }

    if (
      state.sourceMrn.displayValue ===
      state.targetMrn.displayValue
    ) {
      throw new ConflictError(
        'Source and target patient medical record numbers must differ',
      );
    }
  }

  private async registerPatientRestore(
    transaction:
      PatientTransactionContext,

    patient:
      PatientRecord,

    snapshotCrypto:
      NonNullable<
        PatientMutationDependencies[
          'snapshotCrypto'
        ]
      >,
  ): Promise<void> {
    const patientId =
      patient._id.toHexString();

    const restorePayload =
      protectedRestorePayload({
        crypto:
          snapshotCrypto,

        transactionId:
          transaction.transactionId,

        entityType:
          'patient',

        entityId:
          patientId,

        expectedPostVersion:
          patient.version + 1,

        snapshot:
          patientRestoreSnapshot(
            patient,
          ),
      });

    await transaction
      .registerCompensation({
        key:
          `restore-patient:${patientId}:v${patient.version}`,

        type:
          PATIENT_COMPENSATION_TYPES
            .RESTORE_PATIENT,

        payload: {
          ...restorePayload,

          transactionId:
            transaction.transactionId,
        },
      });
  }
}