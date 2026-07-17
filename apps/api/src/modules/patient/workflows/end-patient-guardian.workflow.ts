import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  MinorGuardianRequiredError,
} from '../patient.errors.js';

import {
  patientGuardianMutationAuditSnapshot,
  toPatientGuardianMutationDto,
  type PatientGuardianMutationDto,
} from '../patient.mutation.mapper.js';

import {
  patientGuardianRestoreSnapshot,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

import {
  buildPatientAuditActorFields,
  type PatientMutationDependencies,
} from '../patient.ports.js';

import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_COMPENSATION_TYPES,
  PATIENT_OUTBOX_EVENTS,
  PATIENT_TRANSACTION_CHECKPOINTS,
  PATIENT_TRANSACTION_TYPES,
} from '../patient.transaction.constants.js';

import type {
  EndPatientGuardianInput,
} from '../patient-profile.mutation.types.js';

import type {
  PatientActorContext,
  PatientGuardianRecord,
} from '../patient.types.js';

import type {
  PatientGuardianMutationRepository,
} from '../repositories/patient-guardian-mutation.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

export interface EndPatientGuardianCommand {
  relationshipId: string;
  input: EndPatientGuardianInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

function relationshipNotFound():
  ResourceNotFoundError {
  return new ResourceNotFoundError(
    'Patient guardian relationship was not found',
  );
}

function relationshipConcurrency():
  ConcurrencyConflictError {
  return new ConcurrencyConflictError(
    'The patient guardian relationship changed before it could be ended',
  );
}

function assertActiveRelationship(
  relationship: PatientGuardianRecord,
): void {
  if (!relationship.isActive) {
    throw new ConflictError(
      'The patient guardian relationship is already inactive',
    );
  }
}

export class EndPatientGuardianWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly patientGuardians:
      PatientGuardianMutationRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      EndPatientGuardianCommand,
  ): Promise<PatientGuardianMutationDto> {
    const initial =
      await this.patientGuardians
        .findById(
          command.actor.facilityId,
          command.relationshipId,
        );

    if (initial === null) {
      throw relationshipNotFound();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw relationshipConcurrency();
    }

    assertActiveRelationship(
      initial,
    );

    const patient =
      await this.patients.findById(
        command.actor.facilityId,
        initial.patientId.toHexString(),
        PATIENT_ACCESS_LEVEL.STANDARD,
      );

    if (patient === null) {
      throw new ResourceNotFoundError(
        'Patient was not found',
      );
    }

    if (
      patient.isMinor &&
      !await this.patientGuardians
        .hasAlternativeActiveGuardianWithCnic(
          command.actor.facilityId,
          patient._id.toHexString(),
          command.relationshipId,
        )
    ) {
      throw new MinorGuardianRequiredError();
    }

    const snapshotCrypto =
      requirePatientSnapshotCrypto(
        this.dependencies,
      );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          PATIENT_TRANSACTION_TYPES
            .END_PATIENT_GUARDIAN,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `patient:id:${initial.patientId.toHexString()}`,

          `guardian:id:${initial.guardianId.toHexString()}`,

          `patient-guardian:id:${command.relationshipId}`,
        ],

        idempotencyPayload: {
          relationshipId:
            command.relationshipId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'END_PATIENT_GUARDIAN',

          relationshipId:
            command.relationshipId,

          patientId:
            initial.patientId
              .toHexString(),

          guardianId:
            initial.guardianId
              .toHexString(),

          expectedVersion:
            command.input.expectedVersion,

          relationshipType:
            initial.relationshipType,

          wasPrimary:
            initial.isPrimary,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.patientGuardians
                .findById(
                  command.actor
                    .facilityId,
                  command.relationshipId,
                );

            if (current === null) {
              throw relationshipNotFound();
            }

            if (
              current.version !==
              command.input
                .expectedVersion
            ) {
              throw relationshipConcurrency();
            }

            assertActiveRelationship(
              current,
            );

            const currentPatient =
              await this.patients.findById(
                command.actor.facilityId,
                current.patientId
                  .toHexString(),
                PATIENT_ACCESS_LEVEL.STANDARD,
              );

            if (
              currentPatient === null
            ) {
              throw new ResourceNotFoundError(
                'Patient was not found',
              );
            }

            if (
              currentPatient.isMinor &&
              !await this.patientGuardians
                .hasAlternativeActiveGuardianWithCnic(
                  command.actor
                    .facilityId,
                  currentPatient._id
                    .toHexString(),
                  command.relationshipId,
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
                  'patient-guardian',

                entityId:
                  command.relationshipId,

                expectedPostVersion:
                  current.version + 1,

                snapshot:
                  patientGuardianRestoreSnapshot(
                    current,
                  ),
              });

            await transaction
              .registerCompensation({
                key:
                  `restore-patient-guardian:${command.relationshipId}:v${current.version}`,

                type:
                  PATIENT_COMPENSATION_TYPES
                    .RESTORE_PATIENT_GUARDIAN,

                payload: {
                  ...restorePayload,

                  transactionId:
                    transaction.transactionId,
                },
              });

            const now =
              this.dependencies
                .clock.now();

            const updated =
              await this.patientGuardians
                .endWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  relationshipId:
                    command.relationshipId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  endedBy:
                    command.actor.userId,

                  endedAt:
                    now,

                  endReason:
                    command.input.reason,
                });

            if (updated === null) {
              throw relationshipConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .GUARDIAN_ENDED,
              {
                relationshipId:
                  command.relationshipId,

                patientId:
                  updated.patientId
                    .toHexString(),

                guardianId:
                  updated.guardianId
                    .toHexString(),

                version:
                  updated.version,
              },
            );

            await this.dependencies
              .audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-guardian-ended`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_GUARDIAN_ENDED,

                entityType:
                  'PatientGuardian',

                entityId:
                  command.relationshipId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input.reason,

                before:
                  patientGuardianMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientGuardianMutationAuditSnapshot(
                    updated,
                  ),

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  patientId:
                    updated.patientId
                      .toHexString(),

                  guardianId:
                    updated.guardianId
                      .toHexString(),
                },
              });

            await this.dependencies
              .outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-guardian-ended`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_GUARDIAN_ENDED,

                aggregateType:
                  'Patient',

                aggregateId:
                  updated.patientId
                    .toHexString(),

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
                    updated.patientId
                      .toHexString(),

                  guardianId:
                    updated.guardianId
                      .toHexString(),

                  relationshipId:
                    command.relationshipId,

                  relationshipType:
                    updated.relationshipType,

                  isActive:
                    updated.isActive,

                  legalAuthorityStatus:
                    updated
                      .legalAuthorityStatus,

                  version:
                    updated.version,
                },
              });

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                relationshipId:
                  command.relationshipId,
              },
            );

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                relationshipId:
                  command.relationshipId,
              },
            );

            return toPatientGuardianMutationDto(
              updated,
            );
          },
      });
  }
}