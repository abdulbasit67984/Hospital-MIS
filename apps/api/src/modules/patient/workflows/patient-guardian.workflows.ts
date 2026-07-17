import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  GuardianNotFoundError,
  MinorGuardianRequiredError,
  PatientNotFoundError,
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

import {
  normalizeOptionalText,
} from '../patient.normalization.js';

import {
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  PatientActorContext,
  PatientGuardianLinkInput,
} from '../patient.types.js';

import type {
  GuardianRepository,
} from '../repositories/guardian.repository.js';

import type {
  PatientGuardianMutationRepository,
} from '../repositories/patient-guardian-mutation.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

export interface LinkPatientGuardianCommand {
  patientId: string;
  guardianId: string;

  input: Omit<
    PatientGuardianLinkInput,
    'guardianId'
  >;

  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface VerifyPatientGuardianCommand {
  relationshipId: string;
  expectedVersion: number;
  reason: string;
  verificationNotes?: string | null;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class LinkPatientGuardianWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly guardians:
      GuardianRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: LinkPatientGuardianCommand,
  ): Promise<PatientGuardianMutationDto> {
    const [
      patient,
      guardian,
    ] = await Promise.all([
      this.patients.findById(
        command.actor.facilityId,
        command.patientId,
        PATIENT_ACCESS_LEVEL.STANDARD,
      ),

      this.guardians.findById(
        command.actor.facilityId,
        command.guardianId,
        PATIENT_ACCESS_LEVEL.MATCHING,
      ),
    ]);

    if (patient === null) {
      throw new PatientNotFoundError();
    }

    if (guardian === null) {
      throw new GuardianNotFoundError();
    }

    if (
      patient.status === 'MERGED'
    ) {
      throw new ConflictError(
        'Guardians cannot be linked to a merged patient',
      );
    }

    if (
      guardian.status !== 'ACTIVE'
    ) {
      throw new ConflictError(
        'Only active guardians can be linked to patients',
      );
    }

    if (
      patient.isMinor &&
      guardian.cnicNormalized === null
    ) {
      throw new MinorGuardianRequiredError();
    }

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .LINK_PATIENT_GUARDIAN,

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

            `guardian:id:${command.guardianId}`,

            `patient-guardian:${command.patientId}:${command.guardianId}`,
          ],

          idempotencyPayload: {
            patientId:
              command.patientId,

            guardianId:
              command.guardianId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'LINK_PATIENT_GUARDIAN',

            patientId:
              command.patientId,

            guardianId:
              command.guardianId,

            relationshipType:
              command.input.relationshipType,

            isPrimary:
              command.input.isPrimary ?? false,
          },

          execute:
            async (
              transaction,
            ) => {
              const [
                currentPatient,
                currentGuardian,
              ] = await Promise.all([
                this.patients.findById(
                  command.actor.facilityId,
                  command.patientId,
                  PATIENT_ACCESS_LEVEL.STANDARD,
                ),

                this.guardians.findById(
                  command.actor.facilityId,
                  command.guardianId,
                  PATIENT_ACCESS_LEVEL.MATCHING,
                ),
              ]);

              if (currentPatient === null) {
                throw new PatientNotFoundError();
              }

              if (currentGuardian === null) {
                throw new GuardianNotFoundError();
              }

              if (
                currentPatient.status === 'MERGED'
              ) {
                throw new ConflictError(
                  'Guardians cannot be linked to a merged patient',
                );
              }

              if (
                currentGuardian.status !== 'ACTIVE'
              ) {
                throw new ConflictError(
                  'Only active guardians can be linked to patients',
                );
              }

              if (
                currentPatient.isMinor &&
                currentGuardian.cnicNormalized === null
              ) {
                throw new MinorGuardianRequiredError();
              }

              const relationship =
                await this.guardians.linkToPatient({
                  ...command.input,

                  guardianId:
                    command.guardianId,

                  facilityId:
                    command.actor.facilityId,

                  patientId:
                    command.patientId,

                  createdBy:
                    command.actor.userId,
                });

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-patient-guardian:${relationship._id.toHexString()}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_GUARDIAN,

                  payload: {
                    entityId:
                      relationship._id.toHexString(),

                    expectedVersion:
                      relationship.version,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .GUARDIAN_LINKED,
                {
                  relationshipId:
                    relationship._id.toHexString(),

                  patientId:
                    command.patientId,

                  guardianId:
                    command.guardianId,

                  isPrimary:
                    relationship.isPrimary,
                },
              );

              const now =
                this.dependencies.clock.now();

              const after =
                patientGuardianMutationAuditSnapshot(
                  relationship,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-guardian-linked`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_GUARDIAN_LINKED,

                entityType:
                  'PatientGuardian',

                entityId:
                  relationship._id.toHexString(),

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                before:
                  null,

                after,

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  patientId:
                    command.patientId,

                  guardianId:
                    command.guardianId,

                  relationshipType:
                    relationship.relationshipType,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  relationshipId:
                    relationship._id.toHexString(),
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-guardian-linked`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_GUARDIAN_LINKED,

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

                  guardianId:
                    command.guardianId,

                  relationshipId:
                    relationship._id.toHexString(),

                  relationshipType:
                    relationship.relationshipType,

                  isPrimary:
                    relationship.isPrimary,

                  legalAuthorityStatus:
                    relationship.legalAuthorityStatus,

                  verificationStatus:
                    relationship.verificationStatus,

                  version:
                    relationship.version,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  relationshipId:
                    relationship._id.toHexString(),
                },
              );

              return toPatientGuardianMutationDto(
                relationship,
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

export class VerifyPatientGuardianWorkflow {
  public constructor(
    private readonly patientGuardians:
      PatientGuardianMutationRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: VerifyPatientGuardianCommand,
  ): Promise<PatientGuardianMutationDto> {
    const initial =
      await this.patientGuardians.findById(
        command.actor.facilityId,
        command.relationshipId,
      );

    if (initial === null) {
      throw new ResourceNotFoundError(
        'Patient guardian relationship was not found',
      );
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new ConcurrencyConflictError(
        'The patient guardian relationship changed before verification',
      );
    }

    if (!initial.isActive) {
      throw new ConflictError(
        'Only active patient guardian relationships can be verified',
      );
    }

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
              .VERIFY_PATIENT_GUARDIAN,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `patient-guardian:id:${command.relationshipId}`,
          ],

          idempotencyPayload: {
            relationshipId:
              command.relationshipId,

            expectedVersion:
              command.expectedVersion,

            reason:
              command.reason,

            verificationNotes:
              command.verificationNotes ?? null,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'VERIFY_PATIENT_GUARDIAN',

            relationshipId:
              command.relationshipId,

            expectedVersion:
              command.expectedVersion,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.patientGuardians.findById(
                  command.actor.facilityId,
                  command.relationshipId,
                );

              if (current === null) {
                throw new ResourceNotFoundError(
                  'Patient guardian relationship was not found',
                );
              }

              if (
                current.version !==
                command.expectedVersion
              ) {
                throw new ConcurrencyConflictError(
                  'The patient guardian relationship changed before verification',
                );
              }

              if (!current.isActive) {
                throw new ConflictError(
                  'Only active patient guardian relationships can be verified',
                );
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
                this.dependencies.clock.now();

              const updated =
                await this.patientGuardians
                  .verifyWithVersion({
                    facilityId:
                      command.actor.facilityId,

                    relationshipId:
                      command.relationshipId,

                    expectedVersion:
                      command.expectedVersion,

                    verifiedBy:
                      command.actor.userId,

                    verifiedAt:
                      now,

                    verificationNotes:
                      normalizeOptionalText(
                        command.verificationNotes,
                      ),
                  });

              if (updated === null) {
                throw new ConcurrencyConflictError(
                  'The patient guardian relationship changed before verification',
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .GUARDIAN_VERIFIED,
                {
                  relationshipId:
                    command.relationshipId,

                  patientId:
                    updated.patientId.toHexString(),

                  guardianId:
                    updated.guardianId.toHexString(),

                  version:
                    updated.version,
                },
              );

              const before =
                patientGuardianMutationAuditSnapshot(
                  current,
                );

              const after =
                patientGuardianMutationAuditSnapshot(
                  updated,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-guardian-verified`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_GUARDIAN_VERIFIED,

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
                  command.reason,

                before,

                after,

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  patientId:
                    updated.patientId.toHexString(),

                  guardianId:
                    updated.guardianId.toHexString(),
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

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-guardian-verified`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_GUARDIAN_VERIFIED,

                aggregateType:
                  'Patient',

                aggregateId:
                  updated.patientId.toHexString(),

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
                    updated.patientId.toHexString(),

                  guardianId:
                    updated.guardianId.toHexString(),

                  relationshipId:
                    command.relationshipId,

                  legalAuthorityStatus:
                    updated.legalAuthorityStatus,

                  verificationStatus:
                    updated.verificationStatus,

                  version:
                    updated.version,
                },
              });

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
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }
}