import {
  ConflictError,
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
  DuplicateReviewResolutionDto,
  ResolveDuplicateReviewInput,
} from '../patient.merge.js';

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
  PatientActorContext,
} from '../patient.types.js';

import type {
  PatientMergeRepository,
} from '../repositories/patient-merge.repository.js';

export interface ResolveDuplicateReviewCommand {
  patientId: string;
  input: ResolveDuplicateReviewInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

function patientNotFound():
  ResourceNotFoundError {
  return new ResourceNotFoundError(
    'Patient was not found',
  );
}

function patientConcurrency():
  ConflictError {
  return new ConflictError(
    'The patient changed before duplicate review could be resolved',
  );
}

export class ResolveDuplicateReviewWorkflow {
  public constructor(
    private readonly merges:
      PatientMergeRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      ResolveDuplicateReviewCommand,
  ): Promise<DuplicateReviewResolutionDto> {
    const initial =
      await this.merges
        .findPatientForMerge(
          command.actor.facilityId,
          command.patientId,
        );

    if (initial === null) {
      throw patientNotFound();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw patientConcurrency();
    }

    if (
      initial.status === 'MERGED' ||
      initial.mergeState === 'MERGED'
    ) {
      throw new ConflictError(
        'Duplicate review cannot be changed for a merged patient',
      );
    }

    const required =
      command.input.decision ===
      'RETAIN_FOR_REVIEW';

    const snapshotCrypto =
      requirePatientSnapshotCrypto(
        this.dependencies,
      );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          PATIENT_TRANSACTION_TYPES
            .RESOLVE_DUPLICATE_REVIEW,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          `patient:id:${command.patientId}`,
          `patient:duplicate-review:${command.patientId}`,
        ],

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
            'RESOLVE_DUPLICATE_REVIEW',

          patientId:
            command.patientId,

          expectedVersion:
            command.input.expectedVersion,

          decision:
            command.input.decision,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.merges
                .findPatientForMerge(
                  command.actor
                    .facilityId,
                  command.patientId,
                );

            if (current === null) {
              throw patientNotFound();
            }

            if (
              current.version !==
              command.input
                .expectedVersion
            ) {
              throw patientConcurrency();
            }

            if (
              current.status === 'MERGED' ||
              current.mergeState === 'MERGED'
            ) {
              throw new ConflictError(
                'Duplicate review cannot be changed for a merged patient',
              );
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
              await this.merges
                .setDuplicateReviewState({
                  facilityId:
                    command.actor.facilityId,

                  patientId:
                    command.patientId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  required,

                  actorUserId:
                    command.actor.userId,
                });

            if (updated === null) {
              throw patientConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .DUPLICATE_REVIEW_RESOLVED,
              {
                patientId:
                  command.patientId,

                decision:
                  command.input.decision,

                duplicateReviewRequired:
                  updated
                    .duplicateReviewRequired,

                version:
                  updated.version,
              },
            );

            const now =
              this.dependencies
                .clock.now();

            await this.dependencies
              .audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-duplicate-review-resolved`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_DUPLICATE_REVIEW_RESOLVED,

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

                before:
                  patientMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientMutationAuditSnapshot(
                    updated,
                  ),

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  decision:
                    command.input.decision,
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

            await this.dependencies
              .outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-duplicate-review-resolved`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_DUPLICATE_REVIEW_RESOLVED,

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

                  enterprisePatientId:
                    updated
                      .enterprisePatientId,

                  decision:
                    command.input.decision,

                  duplicateReviewRequired:
                    updated
                      .duplicateReviewRequired,

                  mergeState:
                    updated.mergeState,

                  version:
                    updated.version,
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

            return {
              patientId:
                updated._id.toHexString(),

              facilityId:
                updated.facilityId
                  .toHexString(),

              decision:
                command.input.decision,

              duplicateReviewRequired:
                updated
                  .duplicateReviewRequired,

              mergeState:
                updated.mergeState ===
                'DUPLICATE_SUSPECTED'
                  ? 'DUPLICATE_SUSPECTED'
                  : 'CANONICAL',

              version:
                updated.version,

              updatedAt:
                updated.updatedAt
                  .toISOString(),
            };
          },
      });
  }
}