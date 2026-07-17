import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_COMPENSATION_TYPES,
  PATIENT_OUTBOX_EVENTS,
  PATIENT_TRANSACTION_CHECKPOINTS,
  PATIENT_TRANSACTION_TYPES,
} from '../patient.transaction.constants.js';

import {
  buildPatientAuditActorFields,
  type PatientMutationDependencies,
} from '../patient.ports.js';

import {
  patientMutationAuditSnapshot,
  toPatientMutationDto,
  type PatientMutationDto,
} from '../patient.mutation.mapper.js';

import {
  assertPatientUpdateConsistency,
  patientChangedFields,
  patientRestoreSnapshot,
  patientUpdateLockKeys,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

import {
  MinorGuardianRequiredError,
  PatientConcurrencyError,
  PatientNotFoundError,
} from '../patient.errors.js';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  PatientActorContext,
  UpdatePatientInput,
} from '../patient.types.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

import type {
  PatientGuardianMutationRepository,
} from '../repositories/patient-guardian-mutation.repository.js';

export interface UpdatePatientCommand {
  patientId: string;
  input: UpdatePatientInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class UpdatePatientWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly patientGuardians:
      PatientGuardianMutationRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: UpdatePatientCommand,
  ): Promise<PatientMutationDto> {
    const initial =
      await this.patients.findById(
        command.actor.facilityId,
        command.patientId,
        PATIENT_ACCESS_LEVEL.MATCHING,
      );

    if (initial === null) {
      throw new PatientNotFoundError();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw new PatientConcurrencyError();
    }

    const initialNow =
      this.dependencies.clock.now();

    assertPatientUpdateConsistency(
      command.input,
      initial,
      initialNow,
    );

    const resultingMinor =
      command.input.isMinor ??
      initial.isMinor;

    if (
      resultingMinor &&
      !await this.patientGuardians
        .hasActiveGuardianWithCnic(
          command.actor.facilityId,
          command.patientId,
        )
    ) {
      throw new MinorGuardianRequiredError();
    }

    const changedFields =
      patientChangedFields(
        command.input,
      );

    const snapshotCrypto =
      requirePatientSnapshotCrypto(
        this.dependencies,
      );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .UPDATE_PATIENT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientUpdateLockKeys(
              command.actor.facilityId,
              command.patientId,
              command.input,
            ),

          idempotencyPayload: {
            patientId:
              command.patientId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'UPDATE_PATIENT',

            patientId:
              command.patientId,

            expectedVersion:
              command.input.expectedVersion,

            changedFields,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.patients.findById(
                  command.actor.facilityId,
                  command.patientId,
                  PATIENT_ACCESS_LEVEL.MATCHING,
                );

              if (current === null) {
                throw new PatientNotFoundError();
              }

              if (
                current.version !==
                command.input.expectedVersion
              ) {
                throw new PatientConcurrencyError();
              }

              const now =
                this.dependencies.clock.now();

              assertPatientUpdateConsistency(
                command.input,
                current,
                now,
              );

              const currentResultingMinor =
                command.input.isMinor ??
                current.isMinor;

              if (
                currentResultingMinor &&
                !await this.patientGuardians
                  .hasActiveGuardianWithCnic(
                    command.actor.facilityId,
                    command.patientId,
                  )
              ) {
                throw new MinorGuardianRequiredError();
              }

              const restorePayload =
                protectedRestorePayload({
                  crypto:
                    snapshotCrypto,

                  transactionId:
                    transaction.transactionId,

                  entityType:
                    'patient',

                  entityId:
                    command.patientId,

                  expectedPostVersion:
                    current.version + 1,

                  snapshot:
                    patientRestoreSnapshot(
                      current,
                    ),
                });

              await transaction
                .registerCompensation({
                  key:
                    `restore-patient:${command.patientId}:v${current.version}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .RESTORE_PATIENT,

                  payload: {
                    ...restorePayload,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const updated =
                await this.patients
                  .updateWithVersion(
                    command.actor.facilityId,
                    command.patientId,
                    command.input,
                    command.actor.userId,
                  );

              if (updated === null) {
                throw new PatientConcurrencyError();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_UPDATED,
                {
                  patientId:
                    command.patientId,

                  version:
                    updated.version,

                  changedFields,
                },
              );

              const before =
                patientMutationAuditSnapshot(
                  current,
                );

              const after =
                patientMutationAuditSnapshot(
                  updated,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-updated`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_UPDATED,

                entityType:
                  'Patient',

                entityId:
                  command.patientId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input.reason,

                before,

                after,

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  changedFields,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  patientId:
                    command.patientId,
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-updated`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_UPDATED,

                aggregateType:
                  'Patient',

                aggregateId:
                  command.patientId,

                actorUserId:
                  command.actor.userId,

                facilityId:
                  command.actor.facilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  now,

                payload: {
                  patientId:
                    command.patientId,

                  facilityId:
                    command.actor.facilityId,

                  status:
                    updated.status,

                  isMinor:
                    updated.isMinor,

                  guardianRequirement:
                    updated.guardianRequirement,

                  identityReviewRequired:
                    updated.identityReviewRequired,

                  duplicateReviewRequired:
                    updated.duplicateReviewRequired,

                  version:
                    updated.version,

                  changedFields,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  patientId:
                    command.patientId,
                },
              );

              return toPatientMutationDto(
                updated,
              );
            },
        });
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }
}