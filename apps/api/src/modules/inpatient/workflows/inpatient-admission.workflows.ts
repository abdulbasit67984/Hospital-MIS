import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AcceptAdmissionInput,
  AcceptAdmissionRecommendationInput,
  CancelAdmissionInput,
  CancelAdmissionRecommendationInput,
  CreateAdmissionInput,
  CreateAdmissionRecommendationInput,
  InpatientActorContext,
  RejectAdmissionRecommendationInput,
} from '../inpatient.types.js';

import type {
  AdmissionRecommendationRecord,
  AdmissionRecord,
} from '../inpatient.persistence.types.js';

import {
  INPATIENT_NUMBER_SEQUENCE_NAMESPACE,
  INPATIENT_TRANSACTION_TYPES,
} from '../inpatient.constants.js';

import {
  INPATIENT_AUDIT_ACTIONS,
  INPATIENT_OUTBOX_EVENTS,
  INPATIENT_REALTIME_EVENTS,
  INPATIENT_TRANSACTION_STATES,
} from '../inpatient.transaction.constants.js';

import {
  assertAdmissionRecommendationTransition,
  assertAdmissionTransition,
} from '../inpatient.lifecycle.js';

import {
  ActivePatientAdmissionConflictError,
  AdmissionConcurrencyError,
  AdmissionRecommendationConcurrencyError,
  InpatientClinicalContextMismatchError,
  InpatientDepartmentUnavailableError,
  InpatientServicePointMismatchError,
  InpatientStaffAttributionError,
} from '../inpatient.errors.js';

import {
  buildInpatientSequenceKey,
  formatInpatientNumber,
} from '../inpatient.normalization.js';

import {
  admissionRecommendationRestoreSnapshot,
  admissionRestoreSnapshot,
  deleteCreatedInpatientRecordCompensation,
  protectInpatientRestorePayload,
  restoreInpatientRecordCompensation,
} from '../inpatient.mutation-snapshots.js';

import {
  admissionMutationLockKeys,
  recommendationCreateLockKeys,
  recommendationMutationLockKeys,
  safeAdmissionRecommendationSnapshot,
  safeAdmissionSnapshot,
  safeInpatientJournalPayload,
} from '../inpatient.workflow-helpers.js';

import {
  acceptAdmissionBodySchema,
  acceptAdmissionRecommendationBodySchema,
  cancelAdmissionBodySchema,
  cancelAdmissionRecommendationBodySchema,
  createAdmissionBodySchema,
  createAdmissionRecommendationBodySchema,
  rejectAdmissionRecommendationBodySchema,
} from '../inpatient.validation.js';

import {
  InpatientCommandService,
} from '../services/inpatient-command.service.js';

interface AdmissionCommand<T> {
  actor:
    InpatientActorContext;

  input:
    T;

  idempotencyKey:
    string;
}

interface RecommendationEntityCommand<T>
extends AdmissionCommand<T> {
  recommendationId:
    string;
}

interface AdmissionEntityCommand<T>
extends AdmissionCommand<T> {
  admissionId:
    string;
}

async function publishAdmissionMutation(
  support:
    InpatientCommandService,

  input:
    Readonly<{
      actor:
        InpatientActorContext;

      transactionId:
        string;

      action:
        string;

      eventType:
        string;

      realtimeEventType:
        string;

      entityType:
        string;

      entityId:
        string;

      occurredAt:
        Date;

      before:
        Record<string, unknown> |
        null;

      after:
        Record<string, unknown>;

      patientId:
        string;

      admissionId?:
        string;
    }>,
): Promise<void> {
  await support.dependencies.audit.append({
    transactionId:
      input.transactionId,

    deduplicationKey:
      support.deduplicationKey(
        input.transactionId,
        input.action,
        input.entityId,
      ),

    action:
      input.action,

    entityType:
      input.entityType,

    entityId:
      input.entityId,

    ...support.auditActorFields(
      input.actor,
    ),

    occurredAt:
      input.occurredAt,

    before:
      input.before,

    after:
      input.after,
  });

  await support.dependencies.outbox.enqueue({
    transactionId:
      input.transactionId,

    deduplicationKey:
      support.deduplicationKey(
        input.transactionId,
        input.eventType,
        input.entityId,
      ),

    eventType:
      input.eventType,

    aggregateType:
      input.entityType,

    aggregateId:
      input.entityId,

    actorUserId:
      input.actor.userId,

    facilityId:
      input.actor.facilityId,

    correlationId:
      input.actor.correlationId,

    occurredAt:
      input.occurredAt,

    payload:
      input.after,
  });

  await support.dependencies.realtime.publish({
    eventType:
      input.realtimeEventType,

    facilityId:
      input.actor.facilityId,

    ...(
      input.admissionId ===
      undefined
        ? {}
        : {
            admissionId:
              input.admissionId,
          }
    ),

    payload: {
      patientId:
        input.patientId,

      ...input.after,
    },
  });
}

function diagnosisSnapshots(
  support:
    InpatientCommandService,

  input:
    readonly {
      diagnosisId?:
        string | null;

      diagnosisCode:
        string;

      diagnosisSystem:
        string;

      diagnosisDisplay:
        string;

      primary?:
        boolean;
    }[],
) {
  return input.map(
    (
      diagnosis,
    ) => ({
      diagnosisId:
        diagnosis.diagnosisId ==
        null
          ? null
          : support.objectId(
              diagnosis.diagnosisId,
              'diagnosisId',
            ),

      diagnosisCode:
        support.normalizedCode(
          diagnosis.diagnosisCode,
        ),

      diagnosisSystem:
        support.normalizedCode(
          diagnosis.diagnosisSystem,
        ),

      diagnosisDisplay:
        support.displayText(
          diagnosis.diagnosisDisplay,
        ),

      primary:
        diagnosis.primary ??
        false,
    }),
  );
}

export class CreateAdmissionRecommendationWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      AdmissionCommand<CreateAdmissionRecommendationInput>,
  ): Promise<
    AdmissionRecommendationRecord
  > {
    const input =
      createAdmissionRecommendationBodySchema
        .parse(
          command.input,
        );

    const context =
      await this.support.context
        .resolveRecommendationContext(
          command.actor,
          input.encounterId,
          input.orderingProviderStaffId,
        );

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_RECOMMEND',
      {
        clinicalContext:
          context.encounter,
      },
    );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_ADMISSION_RECOMMENDATION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          recommendationCreateLockKeys(
            command.actor.facilityId,
            context.patient.patientId,
            context.encounter
              .encounterId,
          ),

        idempotencyPayload: {
          patientId:
            context.patient.patientId,

          encounterId:
            context.encounter
              .encounterId,

          admissionType:
            input.admissionType,

          priority:
            input.priority,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_ADMISSION_RECOMMENDATION',
            {
              patientId:
                context.patient
                  .patientId,

              encounterId:
                context.encounter
                  .encounterId,

              admissionType:
                input.admissionType,

              priority:
                input.priority,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const sequenceKey =
              buildInpatientSequenceKey(
                INPATIENT_NUMBER_SEQUENCE_NAMESPACE
                  .ADMISSION_RECOMMENDATION,
                occurredAt,
              );

            const allocation =
              await this.support.dependencies
                .sequence.next(
                  command.actor
                    .facilityId,
                  sequenceKey,
                );

            const recommendationNumber =
              formatInpatientNumber(
                'ADM-REC',
                occurredAt,
                allocation.value,
              );

            await transaction.checkpoint(
              INPATIENT_TRANSACTION_STATES
                .NUMBER_ALLOCATED,
              {
                sequenceKey,

                sequenceValue:
                  allocation.value,

                recommendationNumber,
              },
            );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const created =
              await this.support.admissions
                .createRecommendation({
                  facilityId:
                    toObjectId(
                      command.actor
                        .facilityId,
                      'facilityId',
                    ),

                  recommendationNumber,

                  patientId:
                    toObjectId(
                      context.patient
                        .patientId,
                      'patientId',
                    ),

                  requestedPatientId:
                    toObjectId(
                      context.patient
                        .requestedPatientId,
                      'requestedPatientId',
                    ),

                  canonicalRedirected:
                    context.patient
                      .canonicalRedirected,

                  encounterId:
                    toObjectId(
                      context.encounter
                        .encounterId,
                      'encounterId',
                    ),

                  registrationId:
                    context.encounter
                      .registrationId ===
                    null
                      ? null
                      : toObjectId(
                          context
                            .encounter
                            .registrationId,
                          'registrationId',
                        ),

                  opdVisitId:
                    context.encounter
                      .opdVisitId ===
                    null
                      ? null
                      : toObjectId(
                          context
                            .encounter
                            .opdVisitId,
                          'opdVisitId',
                        ),

                  queueTokenId:
                    context.encounter
                      .queueTokenId ===
                    null
                      ? null
                      : toObjectId(
                          context
                            .encounter
                            .queueTokenId,
                          'queueTokenId',
                        ),

                  orderingProviderUserId:
                    actorId,

                  orderingProviderStaffId:
                    toObjectId(
                      input
                        .orderingProviderStaffId,
                      'orderingProviderStaffId',
                    ),

                  orderingDepartmentId:
                    toObjectId(
                      context.departmentId,
                      'orderingDepartmentId',
                    ),

                  orderingServicePointId:
                    context.servicePointId ===
                    null
                      ? null
                      : toObjectId(
                          context
                            .servicePointId,
                          'orderingServicePointId',
                        ),

                  admissionType:
                    input.admissionType,

                  priority:
                    input.priority,

                  requestedWardTypes: [
                    ...input
                      .requestedWardTypes,
                  ],

                  requestedSpecialtyCodes:
                    this.support
                      .normalizedCodes(
                        input
                          .requestedSpecialtyCodes,
                      ),

                  requestedIsolationCapabilities: [
                    ...input
                      .requestedIsolationCapabilities,
                  ],

                  clinicalIndication:
                    this.support
                      .displayText(
                        input
                          .clinicalIndication,
                      ),

                  diagnosisSnapshots:
                    diagnosisSnapshots(
                      this.support,
                      input
                        .diagnosisSnapshots,
                    ),

                  expectedLengthOfStayDays:
                    input
                      .expectedLengthOfStayDays ??
                    null,

                  requestedAdmissionAt:
                    input
                      .requestedAdmissionAt ==
                    null
                      ? null
                      : new Date(
                          input
                            .requestedAdmissionAt,
                        ),

                  recommendedAt:
                    occurredAt,

                  status:
                    'ORDERED',

                  acceptedAt:
                    null,

                  acceptedBy:
                    null,

                  acceptedByStaffId:
                    null,

                  rejectedAt:
                    null,

                  rejectedBy:
                    null,

                  rejectedByStaffId:
                    null,

                  rejectionReason:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancelledByStaffId:
                    null,

                  cancellationReason:
                    null,

                  expiresAt:
                    input.expiresAt ==
                    null
                      ? null
                      : new Date(
                          input.expiresAt,
                        ),

                  admissionId:
                    null,

                  convertedAt:
                    null,

                  convertedBy:
                    null,

                  patientCoverageId:
                    input
                      .patientCoverageId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .patientCoverageId,
                          'patientCoverageId',
                        ),

                  preauthorizationId:
                    input
                      .preauthorizationId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .preauthorizationId,
                          'preauthorizationId',
                        ),

                  treatmentPackageId:
                    input
                      .treatmentPackageId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .treatmentPackageId,
                          'treatmentPackageId',
                        ),

                  attachmentIds:
                    this.support.objectIds(
                      input.attachmentIds,
                      'attachmentIds',
                    ),

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-recommendation:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'admissionRecommendations',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await publishAdmissionMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .ADMISSION_RECOMMENDED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .ADMISSION_RECOMMENDED,

                realtimeEventType:
                  INPATIENT_REALTIME_EVENTS
                    .ADMISSION_RECOMMENDATION_WORKLIST_CHANGED,

                entityType:
                  'AdmissionRecommendation',

                entityId:
                  created._id
                    .toHexString(),

                occurredAt,

                before:
                  null,

                after:
                  safeAdmissionRecommendationSnapshot(
                    created,
                  ),

                patientId:
                  created.patientId
                    .toHexString(),
              },
            );

            return created;
          },
      });
  }
}

abstract class RecommendationStatusWorkflow<
  TInput extends {
    expectedVersion:
      number;
  },
> {
  protected abstract readonly targetStatus:
    'ACCEPTED' |
    'REJECTED' |
    'CANCELLED';

  protected abstract readonly transactionType:
    string;

  protected abstract readonly auditAction:
    string;

  protected abstract readonly eventType:
    string;

  public constructor(
    protected readonly support:
      InpatientCommandService,
  ) {}

  protected abstract parse(
    input:
      TInput,
  ): TInput;

  protected abstract update(
    input:
      TInput,

    actorId:
      ReturnType<
        typeof toObjectId
      >,

    actorStaffId:
      ReturnType<
        typeof toObjectId
      >,

    occurredAt:
      Date,
  ): import('../inpatient.ports.js')
    .AdmissionRecommendationPersistenceUpdate;

  public async execute(
    command:
      RecommendationEntityCommand<TInput>,
  ): Promise<
    AdmissionRecommendationRecord
  > {
    const input =
      this.parse(
        command.input,
      );

    const current =
      await this.support
        .requireRecommendation(
          command.actor,
          command.recommendationId,
        );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'RECOMMENDATION',
    );

    assertAdmissionRecommendationTransition(
      current.status,
      this.targetStatus,
    );

    await this.support.assertAccess(
      command.actor,

      this.targetStatus ===
        'ACCEPTED'
        ? 'ADMISSION_ACCEPT'
        : this.targetStatus ===
            'REJECTED'
          ? 'ADMISSION_REJECT'
          : 'ADMISSION_CANCEL',

      {
        recommendation:
          current,
      },
    );

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          this.transactionType,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          recommendationMutationLockKeys(
            command.actor.facilityId,
            current,
          ),

        idempotencyPayload: {
          recommendationId:
            command.recommendationId,

          expectedVersion:
            input.expectedVersion,

          targetStatus:
            this.targetStatus,

          input,
        },

        journalPayload:
          safeInpatientJournalPayload(
            this.transactionType,
            {
              recommendationId:
                command
                  .recommendationId,

              fromStatus:
                current.status,

              toStatus:
                this.targetStatus,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const staffObjectId =
              toObjectId(
                actorStaffId,
                'actorStaffId',
              );

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-recommendation:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'admissionRecommendations',

                      entityId:
                        current._id
                          .toHexString(),

                      expectedPostVersion:
                        current.version +
                        1,

                      transactionId:
                        transaction
                          .transactionId,

                      snapshot:
                        admissionRecommendationRestoreSnapshot(
                          current,
                        ),

                      snapshotCrypto:
                        this.support
                          .dependencies
                          .snapshotCrypto,
                    },
                  ),
                ),
              );

            const updated =
              await this.support.admissions
                .updateRecommendation(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  this.update(
                    input,
                    actorId,
                    staffObjectId,
                    occurredAt,
                  ),
                );

            if (
              updated === null
            ) {
              throw new AdmissionRecommendationConcurrencyError();
            }

            await publishAdmissionMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  this.auditAction,

                eventType:
                  this.eventType,

                realtimeEventType:
                  INPATIENT_REALTIME_EVENTS
                    .ADMISSION_RECOMMENDATION_WORKLIST_CHANGED,

                entityType:
                  'AdmissionRecommendation',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeAdmissionRecommendationSnapshot(
                    current,
                  ),

                after:
                  safeAdmissionRecommendationSnapshot(
                    updated,
                  ),

                patientId:
                  updated.patientId
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class AcceptAdmissionRecommendationWorkflow
extends RecommendationStatusWorkflow<AcceptAdmissionRecommendationInput> {
  protected readonly targetStatus =
    'ACCEPTED' as const;

  protected readonly transactionType =
    INPATIENT_TRANSACTION_TYPES
      .ACCEPT_ADMISSION_RECOMMENDATION;

  protected readonly auditAction =
    INPATIENT_AUDIT_ACTIONS
      .ADMISSION_RECOMMENDATION_ACCEPTED;

  protected readonly eventType =
    INPATIENT_OUTBOX_EVENTS
      .ADMISSION_RECOMMENDATION_ACCEPTED;

  protected parse(
    input:
      AcceptAdmissionRecommendationInput,
  ) {
    return acceptAdmissionRecommendationBodySchema
      .parse(
        input,
      );
  }

  protected update(
    _input:
      AcceptAdmissionRecommendationInput,

    actorId:
      ReturnType<
        typeof toObjectId
      >,

    actorStaffId:
      ReturnType<
        typeof toObjectId
      >,

    occurredAt:
      Date,
  ) {
    return {
      status:
        'ACCEPTED' as const,

      acceptedAt:
        occurredAt,

      acceptedBy:
        actorId,

      acceptedByStaffId:
        actorStaffId,

      updatedBy:
        actorId,
    };
  }
}

export class RejectAdmissionRecommendationWorkflow
extends RecommendationStatusWorkflow<RejectAdmissionRecommendationInput> {
  protected readonly targetStatus =
    'REJECTED' as const;

  protected readonly transactionType =
    INPATIENT_TRANSACTION_TYPES
      .REJECT_ADMISSION_RECOMMENDATION;

  protected readonly auditAction =
    INPATIENT_AUDIT_ACTIONS
      .ADMISSION_RECOMMENDATION_REJECTED;

  protected readonly eventType =
    INPATIENT_OUTBOX_EVENTS
      .ADMISSION_RECOMMENDATION_REJECTED;

  protected parse(
    input:
      RejectAdmissionRecommendationInput,
  ) {
    return rejectAdmissionRecommendationBodySchema
      .parse(
        input,
      );
  }

  protected update(
    input:
      RejectAdmissionRecommendationInput,

    actorId:
      ReturnType<
        typeof toObjectId
      >,

    actorStaffId:
      ReturnType<
        typeof toObjectId
      >,

    occurredAt:
      Date,
  ) {
    return {
      status:
        'REJECTED' as const,

      rejectedAt:
        occurredAt,

      rejectedBy:
        actorId,

      rejectedByStaffId:
        actorStaffId,

      rejectionReason:
        this.support.displayText(
          input.reason,
        ),

      updatedBy:
        actorId,
    };
  }
}

export class CancelAdmissionRecommendationWorkflow
extends RecommendationStatusWorkflow<CancelAdmissionRecommendationInput> {
  protected readonly targetStatus =
    'CANCELLED' as const;

  protected readonly transactionType =
    INPATIENT_TRANSACTION_TYPES
      .CANCEL_ADMISSION_RECOMMENDATION;

  protected readonly auditAction =
    INPATIENT_AUDIT_ACTIONS
      .ADMISSION_RECOMMENDATION_CANCELLED;

  protected readonly eventType =
    INPATIENT_OUTBOX_EVENTS
      .ADMISSION_RECOMMENDATION_CANCELLED;

  protected parse(
    input:
      CancelAdmissionRecommendationInput,
  ) {
    return cancelAdmissionRecommendationBodySchema
      .parse(
        input,
      );
  }

  protected update(
    input:
      CancelAdmissionRecommendationInput,

    actorId:
      ReturnType<
        typeof toObjectId
      >,

    actorStaffId:
      ReturnType<
        typeof toObjectId
      >,

    occurredAt:
      Date,
  ) {
    return {
      status:
        'CANCELLED' as const,

      cancelledAt:
        occurredAt,

      cancelledBy:
        actorId,

      cancelledByStaffId:
        actorStaffId,

      cancellationReason:
        this.support.displayText(
          input.reason,
        ),

      updatedBy:
        actorId,
    };
  }
}

export class CreateAdmissionWorkflow {
  public constructor(
    private readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      AdmissionCommand<CreateAdmissionInput>,
  ): Promise<
    AdmissionRecord
  > {
    const input =
      createAdmissionBodySchema.parse(
        command.input,
      );

    const recommendation =
      await this.support
        .requireRecommendation(
          command.actor,
          input
            .admissionRecommendationId,
        );

    if (
      recommendation.status !==
      'ACCEPTED'
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Only accepted admission recommendations may be converted into admissions',
      );
    }

    await this.support.assertAccess(
      command.actor,
      'ADMISSION_CREATE',
      {
        recommendation,
      },
    );

    await this.support.assertClinicalDepartment(
      command.actor.facilityId,
      input.admittingDepartmentId,
    );

    await this.support.assertServicePoint(
      command.actor.facilityId,
      input.admittingDepartmentId,
      input.admittingServicePointId,
    );

    const activeAdmission =
      await this.support.admissions
        .findActiveAdmissionByPatient(
          command.actor.facilityId,
          recommendation.patientId
            .toHexString(),
        );

    if (
      activeAdmission !==
      null
    ) {
      throw new ActivePatientAdmissionConflictError();
    }

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          INPATIENT_TRANSACTION_TYPES
            .CREATE_ADMISSION,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          recommendationMutationLockKeys(
            command.actor.facilityId,
            recommendation,
          ),

        idempotencyPayload: {
          recommendationId:
            recommendation._id
              .toHexString(),

          patientId:
            recommendation.patientId
              .toHexString(),

          admittingDepartmentId:
            input
              .admittingDepartmentId,
        },

        journalPayload:
          safeInpatientJournalPayload(
            'CREATE_ADMISSION',
            {
              recommendationId:
                recommendation._id
                  .toHexString(),

              patientId:
                recommendation.patientId
                  .toHexString(),
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const allocation =
              await this.support.dependencies
                .sequence.next(
                  command.actor
                    .facilityId,

                  buildInpatientSequenceKey(
                    INPATIENT_NUMBER_SEQUENCE_NAMESPACE
                      .ADMISSION,

                    occurredAt,
                  ),
                );

            const admissionNumber =
              formatInpatientNumber(
                'IPD',
                occurredAt,
                allocation.value,
              );

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const actorStaffId =
              await this.support.actorStaffId(
                command.actor,
              );

            const staffObjectId =
              toObjectId(
                actorStaffId,
                'actorStaffId',
              );

            const created =
              await this.support.admissions
                .createAdmission({
                  facilityId:
                    recommendation
                      .facilityId,

                  admissionNumber,

                  admissionRecommendationId:
                    recommendation._id,

                  patientId:
                    recommendation.patientId,

                  requestedPatientId:
                    recommendation
                      .requestedPatientId,

                  canonicalRedirected:
                    recommendation
                      .canonicalRedirected,

                  encounterId:
                    recommendation.encounterId,

                  registrationId:
                    recommendation
                      .registrationId,

                  opdVisitId:
                    recommendation.opdVisitId,

                  queueTokenId:
                    recommendation
                      .queueTokenId,

                  admittingDepartmentId:
                    toObjectId(
                      input
                        .admittingDepartmentId,
                      'admittingDepartmentId',
                    ),

                  admittingServicePointId:
                    input
                      .admittingServicePointId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .admittingServicePointId,
                          'admittingServicePointId',
                        ),

                  admissionType:
                    recommendation
                      .admissionType,

                  priority:
                    recommendation.priority,

                  status:
                    'PENDING_ACCEPTANCE',

                  isActive:
                    true,

                  requestedAt:
                    occurredAt,

                  acceptedAt:
                    null,

                  acceptedBy:
                    null,

                  acceptedByStaffId:
                    null,

                  admittedAt:
                    null,

                  admittedBy:
                    null,

                  admittedByStaffId:
                    null,

                  clinicallyDischargedAt:
                    null,

                  financiallyClearedAt:
                    null,

                  dischargedAt:
                    null,

                  cancelledAt:
                    null,

                  cancelledBy:
                    null,

                  cancelledByStaffId:
                    null,

                  cancellationReason:
                    null,

                  attendingConsultantUserId:
                    toObjectId(
                      input
                        .attendingConsultantUserId,
                      'attendingConsultantUserId',
                    ),

                  attendingConsultantStaffId:
                    toObjectId(
                      input
                        .attendingConsultantStaffId,
                      'attendingConsultantStaffId',
                    ),

                  careTeam:
                    input.careTeam.map(
                      (
                        member,
                      ) => ({
                        userId:
                          toObjectId(
                            member
                              .userId,
                            'careTeam.userId',
                          ),

                        staffId:
                          toObjectId(
                            member
                              .staffId,
                            'careTeam.staffId',
                          ),

                        roleCode:
                          this.support
                            .normalizedCode(
                              member
                                .roleCode,
                            ),

                        isPrimary:
                          member
                            .isPrimary,

                        assignedAt:
                          occurredAt,

                        assignedBy:
                          actorId,

                        endedAt:
                          null,

                        endedBy:
                          null,
                      }),
                    ),

                  clinicalIndicationSnapshot:
                    recommendation
                      .clinicalIndication,

                  diagnosisSnapshots:
                    recommendation
                      .diagnosisSnapshots,

                  guardianSnapshot:
                    input.guardianSnapshot ==
                    null
                      ? null
                      : {
                          sourceId:
                            input
                              .guardianSnapshot
                              .sourceId ==
                            null
                              ? null
                              : toObjectId(
                                  input
                                    .guardianSnapshot
                                    .sourceId,
                                  'guardianSnapshot.sourceId',
                                ),

                          relationshipCode:
                            this.support
                              .normalizedCode(
                                input
                                  .guardianSnapshot
                                  .relationshipCode,
                              ),

                          displayName:
                            this.support
                              .displayText(
                                input
                                  .guardianSnapshot
                                  .displayName,
                              ),

                          primaryPhoneMasked:
                            this.support
                              .displayText(
                                input
                                  .guardianSnapshot
                                  .primaryPhoneMasked,
                              ),

                          alternatePhoneMasked:
                            this.support
                              .nullableText(
                                input
                                  .guardianSnapshot
                                  .alternatePhoneMasked,
                              ),
                        },

                  emergencyContactSnapshot:
                    input
                      .emergencyContactSnapshot ==
                    null
                      ? null
                      : {
                          sourceId:
                            input
                              .emergencyContactSnapshot
                              .sourceId ==
                            null
                              ? null
                              : toObjectId(
                                  input
                                    .emergencyContactSnapshot
                                    .sourceId,
                                  'emergencyContactSnapshot.sourceId',
                                ),

                          relationshipCode:
                            this.support
                              .normalizedCode(
                                input
                                  .emergencyContactSnapshot
                                  .relationshipCode,
                              ),

                          displayName:
                            this.support
                              .displayText(
                                input
                                  .emergencyContactSnapshot
                                  .displayName,
                              ),

                          primaryPhoneMasked:
                            this.support
                              .displayText(
                                input
                                  .emergencyContactSnapshot
                                  .primaryPhoneMasked,
                              ),

                          alternatePhoneMasked:
                            this.support
                              .nullableText(
                                input
                                  .emergencyContactSnapshot
                                  .alternatePhoneMasked,
                              ),
                        },

                  payerOrganizationId:
                    input
                      .payerOrganizationId ==
                    null
                      ? null
                      : toObjectId(
                          input
                            .payerOrganizationId,
                          'payerOrganizationId',
                        ),

                  panelProgramId:
                    input.panelProgramId ==
                    null
                      ? null
                      : toObjectId(
                          input.panelProgramId,
                          'panelProgramId',
                        ),

                  panelPlanId:
                    input.panelPlanId ==
                    null
                      ? null
                      : toObjectId(
                          input.panelPlanId,
                          'panelPlanId',
                        ),

                  patientCoverageId:
                    input
                      .patientCoverageId ==
                    null
                      ? recommendation
                          .patientCoverageId
                      : toObjectId(
                          input
                            .patientCoverageId,
                          'patientCoverageId',
                        ),

                  preauthorizationId:
                    input
                      .preauthorizationId ==
                    null
                      ? recommendation
                          .preauthorizationId
                      : toObjectId(
                          input
                            .preauthorizationId,
                          'preauthorizationId',
                        ),

                  treatmentPackageId:
                    input
                      .treatmentPackageId ==
                    null
                      ? recommendation
                          .treatmentPackageId
                      : toObjectId(
                          input
                            .treatmentPackageId,
                          'treatmentPackageId',
                        ),

                  depositRequirementReference:
                    this.support
                      .nullableText(
                        input
                          .depositRequirementReference,
                      ),

                  authorizationRequirementReference:
                    this.support
                      .nullableText(
                        input
                          .authorizationRequirementReference,
                      ),

                  billingAccountReference:
                    this.support
                      .nullableText(
                        input
                          .billingAccountReference,
                      ),

                  currentWardId:
                    null,

                  currentRoomId:
                    null,

                  currentBedId:
                    null,

                  currentBedAssignmentId:
                    null,

                  currentBedAssignedAt:
                    null,

                  currentStatusSequence:
                    1,

                  latestStatusHistoryId:
                    null,

                  dischargeId:
                    null,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-admission:${created._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'admissions',

                    entityId:
                      created._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            const history =
              await this.support.admissions
                .createAdmissionStatusHistory({
                  facilityId:
                    created.facilityId,

                  admissionId:
                    created._id,

                  patientId:
                    created.patientId,

                  sequence:
                    1,

                  fromStatus:
                    null,

                  toStatus:
                    'PENDING_ACCEPTANCE',

                  changeType:
                    'CREATED',

                  reasonCode:
                    'ADMISSION_CREATED',

                  reason:
                    null,

                  admissionBedAssignmentId:
                    null,

                  bedId:
                    null,

                  dischargeId:
                    null,

                  occurredAt,

                  performedBy:
                    actorId,

                  performedByStaffId:
                    staffObjectId,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-admission-history:${history._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'admissionStatusHistories',

                    entityId:
                      history._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            const admission =
              await this.support.admissions
                .updateAdmission(
                  command.actor
                    .facilityId,

                  created._id
                    .toHexString(),

                  0,

                  {
                    currentStatusSequence:
                      1,

                    latestStatusHistoryId:
                      history._id,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              admission === null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-recommendation-conversion:${recommendation._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'admissionRecommendations',

                      entityId:
                        recommendation._id
                          .toHexString(),

                      expectedPostVersion:
                        recommendation
                          .version +
                        1,

                      transactionId:
                        transaction
                          .transactionId,

                      snapshot:
                        admissionRecommendationRestoreSnapshot(
                          recommendation,
                        ),

                      snapshotCrypto:
                        this.support
                          .dependencies
                          .snapshotCrypto,
                    },
                  ),
                ),
              );

            const converted =
              await this.support.admissions
                .updateRecommendation(
                  command.actor
                    .facilityId,

                  recommendation._id
                    .toHexString(),

                  recommendation.version,

                  {
                    status:
                      'CONVERTED',

                    admissionId:
                      admission._id,

                    convertedAt:
                      occurredAt,

                    convertedBy:
                      actorId,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              converted === null
            ) {
              throw new AdmissionRecommendationConcurrencyError();
            }

            await publishAdmissionMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  INPATIENT_AUDIT_ACTIONS
                    .ADMISSION_CREATED,

                eventType:
                  INPATIENT_OUTBOX_EVENTS
                    .ADMISSION_CREATED,

                realtimeEventType:
                  INPATIENT_REALTIME_EVENTS
                    .ADMISSION_WORKLIST_CHANGED,

                entityType:
                  'Admission',

                entityId:
                  admission._id
                    .toHexString(),

                occurredAt,

                before:
                  null,

                after:
                  safeAdmissionSnapshot(
                    admission,
                  ),

                patientId:
                  admission.patientId
                    .toHexString(),

                admissionId:
                  admission._id
                    .toHexString(),
              },
            );

            return admission;
          },
      });
  }
}

abstract class AdmissionStatusWorkflow<
  TInput extends {
    expectedVersion:
      number;
  },
> {
  protected abstract readonly targetStatus:
    'ACCEPTED' |
    'CANCELLED';

  protected abstract readonly transactionType:
    string;

  protected abstract readonly auditAction:
    string;

  protected abstract readonly eventType:
    string;

  protected abstract parse(
    input:
      TInput,
  ): TInput;

  protected abstract reason(
    input:
      TInput,
  ): string | null;

  public constructor(
    protected readonly support:
      InpatientCommandService,
  ) {}

  public async execute(
    command:
      AdmissionEntityCommand<TInput>,
  ): Promise<
    AdmissionRecord
  > {
    const input =
      this.parse(
        command.input,
      );

    const current =
      await this.support.requireAdmission(
        command.actor,
        command.admissionId,
      );

    this.support.assertExpectedVersion(
      current,
      input.expectedVersion,
      'ADMISSION',
    );

    assertAdmissionTransition(
      current.status,
      this.targetStatus,
    );

    await this.support.assertAccess(
      command.actor,

      this.targetStatus ===
        'ACCEPTED'
        ? 'ADMISSION_ACCEPT'
        : 'ADMISSION_CANCEL',

      {
        admission:
          current,
      },
    );

    if (
      this.targetStatus ===
        'CANCELLED' &&
      (
        current.currentBedId !==
          null ||
        current.currentBedAssignmentId !==
          null
      )
    ) {
      throw new InpatientClinicalContextMismatchError(
        'Admissions with an active bed assignment must be released through the bed-management workflow before cancellation',
      );
    }

    const actorStaffId =
      await this.support.actorStaffId(
        command.actor,
      );

    return this.support.dependencies
      .transactionManager.execute({
        transactionType:
          this.transactionType,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          admissionMutationLockKeys(
            command.actor.facilityId,
            current,
          ),

        idempotencyPayload: {
          admissionId:
            command.admissionId,

          expectedVersion:
            input.expectedVersion,

          targetStatus:
            this.targetStatus,

          reason:
            this.reason(
              input,
            ),
        },

        journalPayload:
          safeInpatientJournalPayload(
            this.transactionType,
            {
              admissionId:
                command.admissionId,

              fromStatus:
                current.status,

              toStatus:
                this.targetStatus,
            },
          ),

        execute:
          async (
            transaction,
          ) => {
            const occurredAt =
              this.support.dependencies
                .clock.now();

            const actorId =
              toObjectId(
                command.actor.userId,
                'actorUserId',
              );

            const staffObjectId =
              toObjectId(
                actorStaffId,
                'actorStaffId',
              );

            const sequence =
              current
                .currentStatusSequence +
              1;

            const history =
              await this.support.admissions
                .createAdmissionStatusHistory({
                  facilityId:
                    current.facilityId,

                  admissionId:
                    current._id,

                  patientId:
                    current.patientId,

                  sequence,

                  fromStatus:
                    current.status,

                  toStatus:
                    this.targetStatus,

                  changeType:
                    this.targetStatus ===
                    'ACCEPTED'
                      ? 'ACCEPTED'
                      : 'CANCELLED',

                  reasonCode:
                    this.targetStatus ===
                    'ACCEPTED'
                      ? 'ADMISSION_ACCEPTED'
                      : 'ADMISSION_CANCELLED',

                  reason:
                    this.reason(
                      input,
                    ),

                  admissionBedAssignmentId:
                    current
                      .currentBedAssignmentId,

                  bedId:
                    current.currentBedId,

                  dischargeId:
                    null,

                  occurredAt,

                  performedBy:
                    actorId,

                  performedByStaffId:
                    staffObjectId,

                  transactionId:
                    transaction
                      .transactionId,

                  correlationId:
                    command.actor
                      .correlationId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdBy:
                    actorId,

                  updatedBy:
                    actorId,
                });

            await transaction
              .registerCompensation(
                deleteCreatedInpatientRecordCompensation(
                  `delete-admission-status-history:${history._id.toHexString()}`,
                  {
                    facilityId:
                      command.actor
                        .facilityId,

                    collection:
                      'admissionStatusHistories',

                    entityId:
                      history._id
                        .toHexString(),

                    transactionId:
                      transaction
                        .transactionId,
                  },
                ),
              );

            await transaction
              .registerCompensation(
                restoreInpatientRecordCompensation(
                  `restore-admission:${current._id.toHexString()}`,
                  protectInpatientRestorePayload(
                    {
                      facilityId:
                        command.actor
                          .facilityId,

                      collection:
                        'admissions',

                      entityId:
                        current._id
                          .toHexString(),

                      expectedPostVersion:
                        current.version +
                        1,

                      transactionId:
                        transaction
                          .transactionId,

                      snapshot:
                        admissionRestoreSnapshot(
                          current,
                        ),

                      snapshotCrypto:
                        this.support
                          .dependencies
                          .snapshotCrypto,
                    },
                  ),
                ),
              );

            const reason =
              this.reason(
                input,
              );

            const updated =
              await this.support.admissions
                .updateAdmission(
                  command.actor
                    .facilityId,

                  current._id
                    .toHexString(),

                  input.expectedVersion,

                  {
                    status:
                      this.targetStatus,

                    isActive:
                      this.targetStatus !==
                      'CANCELLED',

                    ...(
                      this.targetStatus ===
                      'ACCEPTED'
                        ? {
                            acceptedAt:
                              occurredAt,

                            acceptedBy:
                              actorId,

                            acceptedByStaffId:
                              staffObjectId,
                          }
                        : {
                            cancelledAt:
                              occurredAt,

                            cancelledBy:
                              actorId,

                            cancelledByStaffId:
                              staffObjectId,

                            cancellationReason:
                              reason,
                          }
                    ),

                    currentStatusSequence:
                      sequence,

                    latestStatusHistoryId:
                      history._id,

                    updatedBy:
                      actorId,
                  },
                );

            if (
              updated === null
            ) {
              throw new AdmissionConcurrencyError();
            }

            await publishAdmissionMutation(
              this.support,
              {
                actor:
                  command.actor,

                transactionId:
                  transaction
                    .transactionId,

                action:
                  this.auditAction,

                eventType:
                  this.eventType,

                realtimeEventType:
                  INPATIENT_REALTIME_EVENTS
                    .ADMISSION_WORKLIST_CHANGED,

                entityType:
                  'Admission',

                entityId:
                  updated._id
                    .toHexString(),

                occurredAt,

                before:
                  safeAdmissionSnapshot(
                    current,
                  ),

                after:
                  safeAdmissionSnapshot(
                    updated,
                  ),

                patientId:
                  updated.patientId
                    .toHexString(),

                admissionId:
                  updated._id
                    .toHexString(),
              },
            );

            return updated;
          },
      });
  }
}

export class AcceptAdmissionWorkflow
extends AdmissionStatusWorkflow<AcceptAdmissionInput> {
  protected readonly targetStatus =
    'ACCEPTED' as const;

  protected readonly transactionType =
    INPATIENT_TRANSACTION_TYPES
      .ACCEPT_ADMISSION;

  protected readonly auditAction =
    INPATIENT_AUDIT_ACTIONS
      .ADMISSION_ACCEPTED;

  protected readonly eventType =
    INPATIENT_OUTBOX_EVENTS
      .ADMISSION_ACCEPTED;

  protected parse(
    input:
      AcceptAdmissionInput,
  ) {
    return acceptAdmissionBodySchema
      .parse(
        input,
      );
  }

  protected reason():
    null {
    return null;
  }
}

export class CancelAdmissionWorkflow
extends AdmissionStatusWorkflow<CancelAdmissionInput> {
  protected readonly targetStatus =
    'CANCELLED' as const;

  protected readonly transactionType =
    INPATIENT_TRANSACTION_TYPES
      .CANCEL_ADMISSION;

  protected readonly auditAction =
    INPATIENT_AUDIT_ACTIONS
      .ADMISSION_CANCELLED;

  protected readonly eventType =
    INPATIENT_OUTBOX_EVENTS
      .ADMISSION_CANCELLED;

  protected parse(
    input:
      CancelAdmissionInput,
  ) {
    return cancelAdmissionBodySchema
      .parse(
        input,
      );
  }

  protected reason(
    input:
      CancelAdmissionInput,
  ): string {
    return this.support.displayText(
      input.reason,
    );
  }
}