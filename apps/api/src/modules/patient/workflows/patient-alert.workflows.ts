import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  patientAlertMutationAuditSnapshot,
  toPatientAlertMutationDto,
  type PatientAlertMutationDto,
} from '../patient.mutation.mapper.js';

import {
  patientAlertLockKeys,
  patientAlertRestoreSnapshot,
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
  CreatePatientAlertInput,
  ResolvePatientAlertInput,
} from '../patient-profile.mutation.types.js';

import type {
  PatientActorContext,
} from '../patient.types.js';

import type {
  PatientProfileRepository,
} from '../repositories/patient-profile.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

export interface CreatePatientAlertCommand {
  patientId: string;
  input: CreatePatientAlertInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface ResolvePatientAlertCommand {
  alertId: string;
  input: ResolvePatientAlertInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

function alertNotFound():
  ResourceNotFoundError {
  return new ResourceNotFoundError(
    'Patient alert was not found',
  );
}

function alertConcurrency():
  ConcurrencyConflictError {
  return new ConcurrencyConflictError(
    'The patient alert changed before the operation could be completed',
  );
}

export class CreatePatientAlertWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly profiles:
      PatientProfileRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      CreatePatientAlertCommand,
  ): Promise<PatientAlertMutationDto> {
    const patient =
      await this.patients.findById(
        command.actor.facilityId,
        command.patientId,
        PATIENT_ACCESS_LEVEL.STANDARD,
      );

    if (patient === null) {
      throw new ResourceNotFoundError(
        'Patient was not found',
      );
    }

    if (
      patient.status === 'MERGED'
    ) {
      throw new ConflictError(
        'Alerts cannot be added to a merged patient',
      );
    }

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .CREATE_PATIENT_ALERT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientAlertLockKeys(
              command.patientId,
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
              'CREATE_PATIENT_ALERT',

            patientId:
              command.patientId,

            alertType:
              command.input.alertType,

            severity:
              command.input.severity,

            visibility:
              command.input.visibility,

            hasExpiry:
              command.input.effectiveTo !=
              null,
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

              if (
                currentPatient === null
              ) {
                throw new ResourceNotFoundError(
                  'Patient was not found',
                );
              }

              if (
                currentPatient.status ===
                'MERGED'
              ) {
                throw new ConflictError(
                  'Alerts cannot be added to a merged patient',
                );
              }

              const now =
                this.dependencies
                  .clock.now();

              const created =
                await this.profiles
                  .createAlert({
                    ...command.input,

                    facilityId:
                      command.actor
                        .facilityId,

                    patientId:
                      command.patientId,

                    createdBy:
                      command.actor.userId,

                    defaultEffectiveFrom:
                      now,
                  });

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-patient-alert:${created._id.toHexString()}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_ALERT,

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
                  .PATIENT_ALERT_CREATED,
                {
                  patientId:
                    command.patientId,

                  alertId:
                    created._id.toHexString(),

                  alertType:
                    created.alertType,

                  severity:
                    created.severity,

                  visibility:
                    created.visibility,
                },
              );

              await this.dependencies
                .audit.append({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:audit:patient-alert-created`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENT_ALERT_CREATED,

                  entityType:
                    'PatientAlert',

                  entityId:
                    created._id.toHexString(),

                  ...buildPatientAuditActorFields(
                    command.actor,
                  ),

                  occurredAt:
                    now,

                  ...(command.input.reason ===
                  undefined
                    ? {}
                    : {
                        reason:
                          command.input.reason,
                      }),

                  before:
                    null,

                  after:
                    patientAlertMutationAuditSnapshot(
                      created,
                    ),

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    patientId:
                      command.patientId,
                  },
                });

              await this.dependencies
                .outbox.enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:patient-alert-created`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENT_ALERT_CREATED,

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

                    alertId:
                      created._id.toHexString(),

                    alertType:
                      created.alertType,

                    severity:
                      created.severity,

                    visibility:
                      created.visibility,

                    status:
                      created.status,

                    effectiveFrom:
                      created.effectiveFrom
                        .toISOString(),

                    effectiveTo:
                      created.effectiveTo
                        ?.toISOString() ??
                      null,

                    version:
                      created.version,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  alertId:
                    created._id.toHexString(),
                },
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  alertId:
                    created._id.toHexString(),
                },
              );

              return toPatientAlertMutationDto(
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

export class ResolvePatientAlertWorkflow {
  public constructor(
    private readonly profiles:
      PatientProfileRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      ResolvePatientAlertCommand,
  ): Promise<PatientAlertMutationDto> {
    const initial =
      await this.profiles.findAlertById(
        command.actor.facilityId,
        command.alertId,
        true,
      );

    if (initial === null) {
      throw alertNotFound();
    }

    if (
      initial.version !==
      command.input.expectedVersion
    ) {
      throw alertConcurrency();
    }

    if (
      initial.status !== 'ACTIVE'
    ) {
      throw new ConflictError(
        'Only active patient alerts can be resolved',
      );
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
            .RESOLVE_PATIENT_ALERT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          patientAlertLockKeys(
            initial.patientId
              .toHexString(),
            command.alertId,
          ),

        idempotencyPayload: {
          alertId:
            command.alertId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'RESOLVE_PATIENT_ALERT',

          alertId:
            command.alertId,

          patientId:
            initial.patientId
              .toHexString(),

          expectedVersion:
            command.input.expectedVersion,

          alertType:
            initial.alertType,

          severity:
            initial.severity,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.profiles
                .findAlertById(
                  command.actor.facilityId,
                  command.alertId,
                  true,
                );

            if (current === null) {
              throw alertNotFound();
            }

            if (
              current.version !==
              command.input
                .expectedVersion
            ) {
              throw alertConcurrency();
            }

            if (
              current.status !== 'ACTIVE'
            ) {
              throw new ConflictError(
                'Only active patient alerts can be resolved',
              );
            }

            const restorePayload =
              protectedRestorePayload({
                crypto:
                  snapshotCrypto,

                transactionId:
                  transaction.transactionId,

                entityType:
                  'patient-alert',

                entityId:
                  command.alertId,

                expectedPostVersion:
                  current.version + 1,

                snapshot:
                  patientAlertRestoreSnapshot(
                    current,
                  ),
              });

            await transaction
              .registerCompensation({
                key:
                  `restore-patient-alert:${command.alertId}:v${current.version}`,

                type:
                  PATIENT_COMPENSATION_TYPES
                    .RESTORE_PATIENT_ALERT,

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
              await this.profiles
                .resolveAlertWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  alertId:
                    command.alertId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  resolutionReason:
                    command.input
                      .resolutionReason,

                  resolvedBy:
                    command.actor.userId,

                  resolvedAt:
                    now,
                });

            if (updated === null) {
              throw alertConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .PATIENT_ALERT_RESOLVED,
              {
                alertId:
                  command.alertId,

                patientId:
                  updated.patientId
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
                  `${transaction.transactionId}:audit:patient-alert-resolved`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_ALERT_RESOLVED,

                entityType:
                  'PatientAlert',

                entityId:
                  command.alertId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input
                    .resolutionReason,

                before:
                  patientAlertMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientAlertMutationAuditSnapshot(
                    updated,
                  ),

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  patientId:
                    updated.patientId
                      .toHexString(),
                },
              });

            await this.dependencies
              .outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-alert-resolved`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_ALERT_RESOLVED,

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

                  alertId:
                    command.alertId,

                  alertType:
                    updated.alertType,

                  severity:
                    updated.severity,

                  visibility:
                    updated.visibility,

                  status:
                    updated.status,

                  resolvedAt:
                    updated.resolvedAt
                      ?.toISOString() ??
                    null,

                  version:
                    updated.version,
                },
              });

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                alertId:
                  command.alertId,
              },
            );

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                alertId:
                  command.alertId,
              },
            );

            return toPatientAlertMutationDto(
              updated,
            );
          },
      });
  }
}