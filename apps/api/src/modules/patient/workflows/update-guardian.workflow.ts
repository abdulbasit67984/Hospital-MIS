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
  guardianMutationAuditSnapshot,
  toGuardianMutationDto,
  type GuardianMutationDto,
} from '../patient.mutation.mapper.js';

import {
  guardianChangedFields,
  guardianRestoreSnapshot,
  guardianUpdateLockKeys,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

import {
  GuardianConcurrencyError,
  GuardianNotFoundError,
  MinorGuardianRequiredError,
} from '../patient.errors.js';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  PatientActorContext,
  UpdateGuardianInput,
} from '../patient.types.js';

import type {
  GuardianRepository,
} from '../repositories/guardian.repository.js';

import type {
  PatientGuardianMutationRepository,
} from '../repositories/patient-guardian-mutation.repository.js';

export interface UpdateGuardianCommand {
  guardianId: string;
  input: UpdateGuardianInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class UpdateGuardianWorkflow {
  public constructor(
    private readonly guardians:
      GuardianRepository,

    private readonly patientGuardians:
      PatientGuardianMutationRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: UpdateGuardianCommand,
  ): Promise<GuardianMutationDto> {
    const initial =
      await this.guardians.findById(
        command.actor.facilityId,
        command.guardianId,
        PATIENT_ACCESS_LEVEL.MATCHING,
      );

    if (initial === null) {
      throw new GuardianNotFoundError();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw new GuardianConcurrencyError();
    }

    if (
      command.input.cnic === null &&
      await this.patientGuardians
        .hasActiveMinorRelationship(
          command.actor.facilityId,
          command.guardianId,
        )
    ) {
      throw new MinorGuardianRequiredError();
    }

    const changedFields =
      guardianChangedFields(
        command.input as unknown as Record<
          string,
          unknown
        >,
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
              .UPDATE_GUARDIAN,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            guardianUpdateLockKeys(
              command.guardianId,
              command.input.cnic,
            ),

          idempotencyPayload: {
            guardianId:
              command.guardianId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'UPDATE_GUARDIAN',

            guardianId:
              command.guardianId,

            expectedVersion:
              command.input.expectedVersion,

            changedFields,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.guardians.findById(
                  command.actor.facilityId,
                  command.guardianId,
                  PATIENT_ACCESS_LEVEL.MATCHING,
                );

              if (current === null) {
                throw new GuardianNotFoundError();
              }

              if (
                current.version !==
                command.input.expectedVersion
              ) {
                throw new GuardianConcurrencyError();
              }

              if (
                command.input.cnic === null &&
                await this.patientGuardians
                  .hasActiveMinorRelationship(
                    command.actor.facilityId,
                    command.guardianId,
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
                    'guardian',

                  entityId:
                    command.guardianId,

                  expectedPostVersion:
                    current.version + 1,

                  snapshot:
                    guardianRestoreSnapshot(
                      current,
                    ),
                });

              await transaction
                .registerCompensation({
                  key:
                    `restore-guardian:${command.guardianId}:v${current.version}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .RESTORE_GUARDIAN,

                  payload: {
                    ...restorePayload,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const updated =
                await this.guardians
                  .updateWithVersion(
                    command.actor.facilityId,
                    command.guardianId,
                    command.input,
                    command.actor.userId,
                  );

              if (updated === null) {
                throw new GuardianConcurrencyError();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .GUARDIAN_UPDATED,
                {
                  guardianId:
                    command.guardianId,

                  version:
                    updated.version,

                  changedFields,
                },
              );

              const now =
                this.dependencies.clock.now();

              const before =
                guardianMutationAuditSnapshot(
                  current,
                );

              const after =
                guardianMutationAuditSnapshot(
                  updated,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:guardian-updated`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .GUARDIAN_UPDATED,

                entityType:
                  'Guardian',

                entityId:
                  command.guardianId,

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
                  guardianId:
                    command.guardianId,
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:guardian-updated`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .GUARDIAN_UPDATED,

                aggregateType:
                  'Guardian',

                aggregateId:
                  command.guardianId,

                actorUserId:
                  command.actor.userId,

                facilityId:
                  command.actor.facilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  now,

                payload: {
                  guardianId:
                    command.guardianId,

                  facilityId:
                    command.actor.facilityId,

                  status:
                    updated.status,

                  hasCnic:
                    updated.cnicNormalized !== null,

                  hasPhone:
                    updated.phoneNormalized !== null,

                  version:
                    updated.version,

                  changedFields,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  guardianId:
                    command.guardianId,
                },
              );

              return toGuardianMutationDto(
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