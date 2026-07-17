import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  PatientConcurrencyError,
  PatientIdentifierConcurrencyError,
  PatientIdentifierNotFoundError,
  PatientIdentityConflictError,
  PatientNotFoundError,
} from '../patient.errors.js';

import {
  identifierMutationAuditSnapshot,
  toPatientIdentifierMutationDto,
  type PatientIdentifierMutationDto,
} from '../patient.mutation.mapper.js';

import {
  patientIdentifierLockKeys,
  patientIdentifierRestoreSnapshot,
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
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  PatientActorContext,
  PatientIdentifierInput,
} from '../patient.types.js';

import type {
  PatientIdentifierRepository,
} from '../repositories/patient-identifier.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

export interface AddPatientIdentifierCommand {
  patientId: string;
  input: PatientIdentifierInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface VerifyPatientIdentifierCommand {
  identifierId: string;
  expectedVersion: number;
  reason: string;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface RevokePatientIdentifierCommand {
  identifierId: string;
  expectedVersion: number;
  reason: string;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class AddPatientIdentifierWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly identifiers:
      PatientIdentifierRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: AddPatientIdentifierCommand,
  ): Promise<PatientIdentifierMutationDto> {
    const patient =
      await this.patients.findById(
        command.actor.facilityId,
        command.patientId,
        PATIENT_ACCESS_LEVEL.STANDARD,
      );

    if (patient === null) {
      throw new PatientNotFoundError();
    }

    if (
      patient.status === 'MERGED'
    ) {
      throw new ConflictError(
        'Identifiers cannot be added to a merged patient',
      );
    }

    const initialMatches =
      await this.identifiers.findExactMatches({
        facilityId:
          command.actor.facilityId,

        identifiers: [
          {
            identifierType:
              command.input.identifierType,

            value:
              command.input.value,
          },
        ],

        excludePatientId:
          command.patientId,
      });

    if (initialMatches.length > 0) {
      throw new PatientIdentityConflictError(
        command.input.identifierType,
      );
    }

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .ADD_PATIENT_IDENTIFIER,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientIdentifierLockKeys(
              command.patientId,
              command.input.identifierType,
              command.input.value,
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
              'ADD_PATIENT_IDENTIFIER',

            patientId:
              command.patientId,

            identifierType:
              command.input.identifierType,
          },

          execute:
            async (
              transaction,
            ) => {
              const currentPatient =
                await this.patients.findById(
                  command.actor.facilityId,
                  command.patientId,
                  PATIENT_ACCESS_LEVEL.STANDARD,
                );

              if (currentPatient === null) {
                throw new PatientNotFoundError();
              }

              if (
                currentPatient.status === 'MERGED'
              ) {
                throw new ConflictError(
                  'Identifiers cannot be added to a merged patient',
                );
              }

              const matches =
                await this.identifiers.findExactMatches({
                  facilityId:
                    command.actor.facilityId,

                  identifiers: [
                    {
                      identifierType:
                        command.input.identifierType,

                      value:
                        command.input.value,
                    },
                  ],

                  excludePatientId:
                    command.patientId,
                });

              if (matches.length > 0) {
                throw new PatientIdentityConflictError(
                  command.input.identifierType,
                );
              }

              const created =
                await this.identifiers.createIdentity({
                  ...command.input,

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
                    `delete-created-patient-identifier:${created._id.toHexString()}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_IDENTIFIER,

                  payload: {
                    entityId:
                      created._id.toHexString(),

                    expectedVersion:
                      created.version,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_IDENTIFIER_CREATED,
                {
                  patientId:
                    command.patientId,

                  identifierId:
                    created._id.toHexString(),

                  identifierType:
                    created.identifierType,
                },
              );

              const now =
                this.dependencies.clock.now();

              const after =
                identifierMutationAuditSnapshot(
                  created,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-identifier-added`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_IDENTIFIER_ADDED,

                entityType:
                  'PatientIdentifier',

                entityId:
                  created._id.toHexString(),

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

                  identifierType:
                    created.identifierType,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  identifierId:
                    created._id.toHexString(),
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-identifier-added`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_IDENTIFIER_ADDED,

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

                  identifierId:
                    created._id.toHexString(),

                  identifierType:
                    created.identifierType,

                  status:
                    created.status,

                  verificationStatus:
                    created.verificationStatus,

                  version:
                    created.version,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  identifierId:
                    created._id.toHexString(),
                },
              );

              return toPatientIdentifierMutationDto(
                created,
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

export class VerifyPatientIdentifierWorkflow {
  public constructor(
    private readonly identifiers:
      PatientIdentifierRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: VerifyPatientIdentifierCommand,
  ): Promise<PatientIdentifierMutationDto> {
    const initial =
      await this.identifiers.findById(
        command.actor.facilityId,
        command.identifierId,
        true,
      );

    if (initial === null) {
      throw new PatientIdentifierNotFoundError();
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new PatientIdentifierConcurrencyError();
    }

    if (
      initial.status !== 'ACTIVE'
    ) {
      throw new ConflictError(
        'Only active patient identifiers can be verified',
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
              .VERIFY_PATIENT_IDENTIFIER,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `patient-identifier:id:${command.identifierId}`,
          ],

          idempotencyPayload: {
            identifierId:
              command.identifierId,

            expectedVersion:
              command.expectedVersion,

            reason:
              command.reason,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'VERIFY_PATIENT_IDENTIFIER',

            identifierId:
              command.identifierId,

            expectedVersion:
              command.expectedVersion,

            identifierType:
              initial.identifierType,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.identifiers.findById(
                  command.actor.facilityId,
                  command.identifierId,
                  true,
                );

              if (current === null) {
                throw new PatientIdentifierNotFoundError();
              }

              if (
                current.version !==
                command.expectedVersion
              ) {
                throw new PatientIdentifierConcurrencyError();
              }

              if (
                current.status !== 'ACTIVE'
              ) {
                throw new ConflictError(
                  'Only active patient identifiers can be verified',
                );
              }

              const restorePayload =
                protectedRestorePayload({
                  crypto:
                    snapshotCrypto,

                  transactionId:
                    transaction.transactionId,

                  entityType:
                    'patient-identifier',

                  entityId:
                    command.identifierId,

                  expectedPostVersion:
                    current.version + 1,

                  snapshot:
                    patientIdentifierRestoreSnapshot(
                      current,
                    ),
                });

              await transaction
                .registerCompensation({
                  key:
                    `restore-patient-identifier:${command.identifierId}:v${current.version}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .RESTORE_PATIENT_IDENTIFIER,

                  payload: {
                    ...restorePayload,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const now =
                this.dependencies.clock.now();

              const updated =
                await this.identifiers.verifyWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  identifierId:
                    command.identifierId,

                  expectedVersion:
                    command.expectedVersion,

                  verifiedBy:
                    command.actor.userId,

                  verifiedAt:
                    now,
                });

              if (updated === null) {
                throw new PatientIdentifierConcurrencyError();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_IDENTIFIER_VERIFIED,
                {
                  identifierId:
                    command.identifierId,

                  patientId:
                    updated.patientId.toHexString(),

                  version:
                    updated.version,
                },
              );

              const before =
                identifierMutationAuditSnapshot(
                  current,
                );

              const after =
                identifierMutationAuditSnapshot(
                  updated,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-identifier-verified`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_IDENTIFIER_VERIFIED,

                entityType:
                  'PatientIdentifier',

                entityId:
                  command.identifierId,

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

                  identifierType:
                    updated.identifierType,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  identifierId:
                    command.identifierId,
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-identifier-verified`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_IDENTIFIER_VERIFIED,

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

                  identifierId:
                    command.identifierId,

                  identifierType:
                    updated.identifierType,

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
                  identifierId:
                    command.identifierId,
                },
              );

              return toPatientIdentifierMutationDto(
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

export class RevokePatientIdentifierWorkflow {
  public constructor(
    private readonly identifiers:
      PatientIdentifierRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: RevokePatientIdentifierCommand,
  ): Promise<PatientIdentifierMutationDto> {
    const initial =
      await this.identifiers.findById(
        command.actor.facilityId,
        command.identifierId,
        true,
      );

    if (initial === null) {
      throw new PatientIdentifierNotFoundError();
    }

    if (
      initial.version !==
      command.expectedVersion
    ) {
      throw new PatientIdentifierConcurrencyError();
    }

    if (
      initial.identifierType === 'MRN'
    ) {
      throw new ConflictError(
        'Permanent medical record numbers cannot be revoked',
      );
    }

    if (
      initial.status !== 'ACTIVE'
    ) {
      throw new ConflictError(
        'Only active patient identifiers can be revoked',
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
              .REVOKE_PATIENT_IDENTIFIER,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys: [
            `patient-identifier:id:${command.identifierId}`,
          ],

          idempotencyPayload: {
            identifierId:
              command.identifierId,

            expectedVersion:
              command.expectedVersion,

            reason:
              command.reason,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'REVOKE_PATIENT_IDENTIFIER',

            identifierId:
              command.identifierId,

            expectedVersion:
              command.expectedVersion,

            identifierType:
              initial.identifierType,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.identifiers.findById(
                  command.actor.facilityId,
                  command.identifierId,
                  true,
                );

              if (current === null) {
                throw new PatientIdentifierNotFoundError();
              }

              if (
                current.version !==
                command.expectedVersion
              ) {
                throw new PatientIdentifierConcurrencyError();
              }

              if (
                current.identifierType === 'MRN'
              ) {
                throw new ConflictError(
                  'Permanent medical record numbers cannot be revoked',
                );
              }

              if (
                current.status !== 'ACTIVE'
              ) {
                throw new ConflictError(
                  'Only active patient identifiers can be revoked',
                );
              }

              const restorePayload =
                protectedRestorePayload({
                  crypto:
                    snapshotCrypto,

                  transactionId:
                    transaction.transactionId,

                  entityType:
                    'patient-identifier',

                  entityId:
                    command.identifierId,

                  expectedPostVersion:
                    current.version + 1,

                  snapshot:
                    patientIdentifierRestoreSnapshot(
                      current,
                    ),
                });

              await transaction
                .registerCompensation({
                  key:
                    `restore-patient-identifier:${command.identifierId}:v${current.version}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .RESTORE_PATIENT_IDENTIFIER,

                  payload: {
                    ...restorePayload,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              const now =
                this.dependencies.clock.now();

              const updated =
                await this.identifiers.revokeWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  identifierId:
                    command.identifierId,

                  expectedVersion:
                    command.expectedVersion,

                  reason:
                    command.reason,

                  actorUserId:
                    command.actor.userId,
                });

              if (updated === null) {
                throw new PatientIdentifierConcurrencyError();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_IDENTIFIER_REVOKED,
                {
                  identifierId:
                    command.identifierId,

                  patientId:
                    updated.patientId.toHexString(),

                  version:
                    updated.version,
                },
              );

              const before =
                identifierMutationAuditSnapshot(
                  current,
                );

              const after =
                identifierMutationAuditSnapshot(
                  updated,
                );

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-identifier-revoked`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_IDENTIFIER_REVOKED,

                entityType:
                  'PatientIdentifier',

                entityId:
                  command.identifierId,

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

                  identifierType:
                    updated.identifierType,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  identifierId:
                    command.identifierId,
                },
              );

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-identifier-revoked`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_IDENTIFIER_REVOKED,

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

                  identifierId:
                    command.identifierId,

                  identifierType:
                    updated.identifierType,

                  status:
                    updated.status,

                  version:
                    updated.version,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  identifierId:
                    command.identifierId,
                },
              );

              return toPatientIdentifierMutationDto(
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