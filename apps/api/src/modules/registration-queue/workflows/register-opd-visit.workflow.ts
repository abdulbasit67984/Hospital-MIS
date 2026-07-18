import {
  randomBytes,
} from 'node:crypto';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  DuplicateActiveVisitError,
} from '../registration-queue.errors.js';

import {
  toRegisteredOpdVisitResult,
  type RegisteredOpdVisitResult,
} from '../registration-queue.mapper.js';

import {
  buildRegistrationQueueAuditActorFields,
  type RegistrationQueueMutationDependencies,
  type RegistrationQueueTransactionContext,
} from '../registration-queue.ports.js';

import {
  opdVisitAuditSnapshot,
  queueTokenAuditSnapshot,
  registrationAuditSnapshot,
} from '../registration-queue.projections.js';

import {
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_REALTIME_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  RegisterOpdVisitInput,
  RegistrationQueueActorContext,
} from '../registration-queue.types.js';

import {
  assertQueueDefinitionSupportsInput,
  queuePriorityScoreForInput,
  registrationQueueCreateLockKeys,
  registrationQueueDeduplicationKey,
  registrationQueueOutboxPayload,
  resolveRegistrationTemporalContext,
  safeRegisterOpdVisitJournalPayload,
} from '../registration-queue.workflow-helpers.js';

import type {
  OpdVisitRepository,
} from '../repositories/opd-visit.repository.js';

import type {
  QueueStatusHistoryRepository,
} from '../repositories/queue-status-history.repository.js';

import type {
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

import type {
  RegistrationRepository,
} from '../repositories/registration.repository.js';

import type {
  RegistrationContextService,
} from '../services/registration-context.service.js';

import type {
  RegistrationPatientResolutionService,
} from '../services/registration-patient-resolution.service.js';

import type {
  RegistrationQueueNumberService,
} from '../services/registration-queue-number.service.js';

export interface RegisterOpdVisitCommand {
  input: RegisterOpdVisitInput;
  actor: RegistrationQueueActorContext;
  idempotencyKey: string;
}

function newObjectIdString(): string {
  return randomBytes(
    12,
  ).toString(
    'hex',
  );
}

function newQueueEntryId(): string {
  const bytes =
    randomBytes(
      16,
    );

  bytes[6] =
    (
      bytes[6] ??
      0
    ) & 0x0f |
    0x40;

  bytes[8] =
    (
      bytes[8] ??
      0
    ) & 0x3f |
    0x80;

  const value =
    bytes.toString(
      'hex',
    );

  return [
    value.slice(
      0,
      8,
    ),
    value.slice(
      8,
      12,
    ),
    value.slice(
      12,
      16,
    ),
    value.slice(
      16,
      20,
    ),
    value.slice(
      20,
    ),
  ].join(
    '-',
  );
}

export class RegisterOpdVisitWorkflow {
  public constructor(
    private readonly registrations:
      RegistrationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly patientResolution:
      RegistrationPatientResolutionService,

    private readonly contexts:
      RegistrationContextService,

    private readonly numbers:
      RegistrationQueueNumberService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: RegisterOpdVisitCommand,
  ): Promise<RegisteredOpdVisitResult> {
    const preflightPatient =
      await this.patientResolution.resolve(
        command.actor.facilityId,
        command.input.registration.patientId,
      );

    const preflightContext =
      await this.contexts.resolveRegistrationContext(
        command.actor.facilityId,
        command.input.registration,
      );

    resolveRegistrationTemporalContext(
      command.input.registration,
      preflightContext.facility.timezone,
      this.dependencies.clock.now(),
    );

    if (command.input.queue != null) {
      const preflightQueue =
        await this.contexts.resolveQueueContext(
          command.actor.facilityId,
          preflightContext,
          command.input.queue,
        );

      assertQueueDefinitionSupportsInput(
        preflightQueue.queueDefinition,
        command.input.queue,
      );
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          REGISTRATION_QUEUE_TRANSACTION_TYPES
            .REGISTER_OPD_VISIT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          registrationQueueCreateLockKeys({
            actor:
              command.actor,

            canonicalPatientId:
              preflightPatient.canonicalPatientId,

            registration:
              command.input.registration,

            queueDefinitionId:
              command.input.queue
                ?.queueDefinitionId ??
              null,
          }),

        idempotencyPayload: {
          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload:
          safeRegisterOpdVisitJournalPayload(
            command.input,
          ),

        execute:
          async (
            transaction,
          ) =>
            this.executeTransaction(
              command,
              transaction,
            ),
      });
  }

  private async executeTransaction(
    command: RegisterOpdVisitCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<RegisteredOpdVisitResult> {
    const now =
      this.dependencies.clock.now();

    const patient =
      await this.patientResolution.resolve(
        command.actor.facilityId,
        command.input.registration.patientId,
      );

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .CANONICAL_PATIENT_RESOLVED,
      {
        requestedPatientId:
          patient.requestedPatientId,

        canonicalPatientId:
          patient.canonicalPatientId,

        canonicalRedirected:
          patient.redirected,

        redirectDepth:
          patient.redirectPath.length -
          1,
      },
    );

    const registrationContext =
      await this.contexts.resolveRegistrationContext(
        command.actor.facilityId,
        command.input.registration,
      );

    const temporal =
      resolveRegistrationTemporalContext(
        command.input.registration,
        registrationContext.facility.timezone,
        now,
      );

    const queueContext =
      command.input.queue == null
        ? null
        : await this.contexts.resolveQueueContext(
            command.actor.facilityId,
            registrationContext,
            command.input.queue,
          );

    if (
      queueContext !== null &&
      command.input.queue !==
        null &&
      command.input.queue !==
        undefined
    ) {
      assertQueueDefinitionSupportsInput(
        queueContext.queueDefinition,
        command.input.queue,
      );
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .SERVICE_CONTEXT_VALIDATED,
      {
        departmentId:
          registrationContext.department._id.toHexString(),

        clinicId:
          registrationContext.clinic?._id.toHexString() ??
          null,

        servicePointId:
          registrationContext.servicePoint?._id.toHexString() ??
          null,

        assignedProviderId:
          queueContext?.assignedProviderId ??
          registrationContext.assignedProviderId,

        assignedCounterId:
          queueContext?.assignedCounterId ??
          registrationContext.assignedCounterId,

        queueDefinitionId:
          queueContext?.queueDefinition._id.toHexString() ??
          null,
      },
    );

    const activeVisitKey = [
      patient.canonicalPatientId,
      command.input.registration.serviceDate,
      command.input.registration.departmentId,
      command.input.registration.clinicId ??
        '-',
      command.input.registration.servicePointId ??
        '-',
    ].join(
      ':',
    );

    const existingActiveVisit =
      await this.visits.findActiveByKey(
        command.actor.facilityId,
        activeVisitKey,
      );

    if (
      existingActiveVisit !== null
    ) {
      throw new DuplicateActiveVisitError();
    }

    const registrationNumber =
      await this.numbers.allocateRegistrationNumber({
        facilityId:
          command.actor.facilityId,

        serviceDate:
          command.input.registration.serviceDate,
      });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .REGISTRATION_NUMBER_ALLOCATED,
      {
        serviceDate:
          registrationNumber.serviceDate,

        sequenceValue:
          registrationNumber.sequenceValue,
      },
    );

    const visitNumber =
      await this.numbers.allocateVisitNumber({
        facilityId:
          command.actor.facilityId,

        serviceDate:
          command.input.registration.serviceDate,
      });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .VISIT_NUMBER_ALLOCATED,
      {
        serviceDate:
          visitNumber.serviceDate,

        sequenceValue:
          visitNumber.sequenceValue,
      },
    );

    const queueNumber =
      queueContext === null
        ? null
        : await this.numbers.allocateQueueTokenNumber({
            facilityId:
              command.actor.facilityId,

            queueDefinitionId:
              queueContext.queueDefinition._id.toHexString(),

            serviceDate:
              command.input.registration.serviceDate,
          });

    if (queueNumber !== null) {
      await transaction.checkpoint(
        REGISTRATION_QUEUE_TRANSACTION_STATES
          .QUEUE_TOKEN_ALLOCATED,
        {
          queueDefinitionId:
            queueNumber.queueDefinitionId,

          serviceDate:
            queueNumber.serviceDate,

          sequenceValue:
            queueNumber.sequenceValue,

          tokenLabel:
            queueNumber.tokenLabel,
        },
      );
    }

    const registrationId =
      newObjectIdString();

    const visitId =
      newObjectIdString();

    const queueTokenId =
      queueContext === null
        ? null
        : newObjectIdString();

    const queueEntryId =
      queueContext === null
        ? null
        : newQueueEntryId();

    const queueHistoryId =
      queueContext === null
        ? null
        : newObjectIdString();

    const assignedProviderId =
      queueContext?.assignedProviderId ??
      registrationContext.assignedProviderId;

    const assignedCounterId =
      queueContext?.assignedCounterId ??
      registrationContext.assignedCounterId;

    const registration =
      await this.registrations.create({
        registrationId,

        facilityId:
          command.actor.facilityId,

        registrationNumber:
          registrationNumber.registrationNumber,

        patientId:
          patient.canonicalPatientId,

        requestedPatientId:
          patient.requestedPatientId,

        canonicalRedirected:
          patient.redirected,

        registrationMode:
          command.input.registration.registrationMode,

        registrationSource:
          command.input.registration.registrationSource,

        visitType:
          command.input.registration.visitType,

        serviceDate:
          command.input.registration.serviceDate,

        arrivedAt:
          temporal.arrivedAt,

        checkedInAt:
          temporal.checkedInAt,

        appointmentId:
          command.input.registration.appointmentId ??
          null,

        referralId:
          command.input.registration.referralId ??
          null,

        referralReference:
          command.input.registration.referralReference ??
          null,

        emergencyCaseId:
          command.input.registration.emergencyCaseId ??
          null,

        departmentId:
          command.input.registration.departmentId,

        clinicId:
          command.input.registration.clinicId ??
          null,

        servicePointId:
          command.input.registration.servicePointId ??
          null,

        assignedProviderId:
          registrationContext.assignedProviderId,

        registrationNotes:
          command.input.registration.registrationNotes ??
          null,

        transactionId:
          transaction.transactionId,

        correlationId:
          command.actor.correlationId,

        actorUserId:
          command.actor.userId,
      });

    await this.registerDeleteCompensation(
      transaction,
      REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_REGISTRATION,
      'registration',
      registration._id.toHexString(),
      registration.version,
    );

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .REGISTRATION_CREATED,
      {
        registrationId:
          registration._id.toHexString(),

        registrationNumber:
          registration.registrationNumber,

        version:
          registration.version,
      },
    );

    const visitStatus =
      queueContext !== null
        ? 'QUEUED'
        : temporal.checkedInAt !==
            null
          ? 'CHECKED_IN'
          : 'REGISTERED';

    const visit =
      await this.visits.create({
        visitId,

        facilityId:
          command.actor.facilityId,

        visitNumber:
          visitNumber.visitNumber,

        registrationId:
          registration._id.toHexString(),

        patientId:
          patient.canonicalPatientId,

        requestedPatientId:
          patient.requestedPatientId,

        canonicalRedirected:
          patient.redirected,

        serviceDate:
          command.input.registration.serviceDate,

        visitType:
          command.input.registration.visitType,

        registrationSource:
          command.input.registration.registrationSource,

        status:
          visitStatus,

        departmentId:
          command.input.registration.departmentId,

        clinicId:
          command.input.registration.clinicId ??
          null,

        servicePointId:
          command.input.registration.servicePointId ??
          null,

        assignedProviderId,

        assignedCounterId,

        currentQueueTokenId:
          queueTokenId,

        arrivedAt:
          temporal.arrivedAt,

        checkedInAt:
          temporal.checkedInAt,

        queuedAt:
          queueContext === null
            ? null
            : now,

        transactionId:
          transaction.transactionId,

        correlationId:
          command.actor.correlationId,

        actorUserId:
          command.actor.userId,
      });

    await this.registerDeleteCompensation(
      transaction,
      REGISTRATION_QUEUE_COMPENSATION_TYPES
        .DELETE_OPD_VISIT,
      'opd-visit',
      visit._id.toHexString(),
      visit.version,
    );

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OPD_VISIT_CREATED,
      {
        visitId:
          visit._id.toHexString(),

        visitNumber:
          visit.visitNumber,

        status:
          visit.status,

        version:
          visit.version,
      },
    );

    let queueToken = null;
    let queueHistory = null;

    if (
      queueContext !== null &&
      queueNumber !== null &&
      queueTokenId !== null &&
      queueEntryId !== null &&
      queueHistoryId !== null &&
      command.input.queue != null
    ) {
      queueToken =
        await this.queueTokens.create({
          queueTokenId,

          queueEntryId,

          facilityId:
            command.actor.facilityId,

          registrationId:
            registration._id.toHexString(),

          opdVisitId:
            visit._id.toHexString(),

          patientId:
            patient.canonicalPatientId,

          queueDefinitionId:
            queueContext.queueDefinition._id.toHexString(),

          serviceDate:
            command.input.registration.serviceDate,

          tokenNumber:
            queueNumber.tokenNumber,

          tokenPrefix:
            queueNumber.tokenPrefix,

          tokenLabel:
            queueNumber.tokenLabel,

          priorityClass:
            command.input.queue.priorityClass ??
            'ROUTINE',

          priorityScore:
            queuePriorityScoreForInput(
              command.input.queue,
            ),

          triagePriority:
            command.input.queue.triagePriority ??
            'NOT_TRIAGED',

          emergencyOverride:
            command.input.queue.emergencyOverride ??
            false,

          emergencyOverrideReason:
            command.input.queue.emergencyOverrideReason ??
            null,

          specialCategories: [
            ...(
              command.input.queue.specialCategories ??
              []
            ),
          ],

          assignedProviderId:
            queueContext.assignedProviderId,

          assignedCounterId:
            queueContext.assignedCounterId,

          queuedAt:
            now,

          transactionId:
            transaction.transactionId,

          correlationId:
            command.actor.correlationId,

          actorUserId:
            command.actor.userId,
        });

      await this.registerDeleteCompensation(
        transaction,
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_QUEUE_ENTRY,
        'queue-entry',
        queueToken._id.toHexString(),
        queueToken.version,
      );

      await transaction.checkpoint(
        REGISTRATION_QUEUE_TRANSACTION_STATES
          .QUEUE_ENTRY_CREATED,
        {
          queueTokenId:
            queueToken._id.toHexString(),

          queueEntryId:
            queueToken.queueEntryId,

          queueDefinitionId:
            queueToken.queueDefinitionId.toHexString(),

          tokenLabel:
            queueToken.tokenLabel,

          version:
            queueToken.version,
        },
      );

      queueHistory =
        await this.queueHistory.append({
          historyId:
            queueHistoryId,

          facilityId:
            command.actor.facilityId,

          queueTokenId:
            queueToken._id.toHexString(),

          queueEntryId:
            queueToken.queueEntryId,

          opdVisitId:
            visit._id.toHexString(),

          patientId:
            patient.canonicalPatientId,

          sequence:
            1,

          fromStatus:
            null,

          toStatus:
            'WAITING',

          queueDefinitionId:
            queueToken.queueDefinitionId.toHexString(),

          providerId:
            queueToken.assignedProviderId
              ?.toHexString() ??
            null,

          counterId:
            queueToken.assignedCounterId
              ?.toHexString() ??
            null,

          changeSource:
            'RECEPTION',

          reason:
            'Initial OPD queue entry',

          occurredAt:
            now,

          changedBy:
            command.actor.userId,

          transactionId:
            transaction.transactionId,

          correlationId:
            command.actor.correlationId,
        });

      await this.registerDeleteCompensation(
        transaction,
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_QUEUE_HISTORY,
        'queue-history',
        queueHistory._id.toHexString(),
        queueHistory.version,
      );

      await transaction.checkpoint(
        REGISTRATION_QUEUE_TRANSACTION_STATES
          .QUEUE_HISTORY_APPENDED,
        {
          queueTokenId:
            queueToken._id.toHexString(),

          sequence:
            queueHistory.sequence,

          status:
            queueHistory.toStatus,
        },
      );
    }

    const occurredAt =
      this.dependencies.clock.now();

    const sharedPayload =
      registrationQueueOutboxPayload({
        registrationId:
          registration._id.toHexString(),

        registrationNumber:
          registration.registrationNumber,

        visitId:
          visit._id.toHexString(),

        visitNumber:
          visit.visitNumber,

        patientId:
          patient.canonicalPatientId,

        requestedPatientId:
          patient.requestedPatientId,

        canonicalRedirected:
          patient.redirected,

        serviceDate:
          registration.serviceDate,

        departmentId:
          registration.departmentId.toHexString(),

        clinicId:
          registration.clinicId
            ?.toHexString() ??
          null,

        servicePointId:
          registration.servicePointId
            ?.toHexString() ??
          null,

        assignedProviderId,

        assignedCounterId,

        queueEntryId:
          queueToken?.queueEntryId ??
          null,

        queueDefinitionId:
          queueToken?.queueDefinitionId.toHexString() ??
          null,

        tokenLabel:
          queueToken?.tokenLabel ??
          null,

        occurredAt,
      });

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-registration-created',
          registration._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .REGISTRATION_CREATED,

      aggregateType:
        'Registration',

      aggregateId:
        registration._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload:
        sharedPayload,
    });

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-opd-visit-created',
          visit._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .OPD_VISIT_CREATED,

      aggregateType:
        'OpdVisit',

      aggregateId:
        visit._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload:
        sharedPayload,
    });

    if (queueToken !== null) {
      await this.dependencies.outbox.enqueue({
        transactionId:
          transaction.transactionId,

        deduplicationKey:
          registrationQueueDeduplicationKey(
            transaction.transactionId,
            'outbox-queue-entry-created',
            queueToken.queueEntryId,
          ),

        eventType:
          REGISTRATION_QUEUE_OUTBOX_EVENTS
            .QUEUE_ENTRY_CREATED,

        aggregateType:
          'QueueToken',

        aggregateId:
          queueToken._id.toHexString(),

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        occurredAt,

        payload:
          sharedPayload,
      });
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        registrationId:
          registration._id.toHexString(),

        visitId:
          visit._id.toHexString(),

        queueTokenId:
          queueToken?._id.toHexString() ??
          null,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-registration-created',
          registration._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .REGISTRATION_CREATED,

      entityType:
        'Registration',

      entityId:
        registration._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      before:
        null,

      after:
        registrationAuditSnapshot(
          registration,
        ),

      metadata: {
        idempotencyKey:
          command.idempotencyKey,

        visitId:
          visit._id.toHexString(),

        canonicalRedirected:
          patient.redirected,
      },
    });

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-opd-visit-created',
          visit._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .OPD_VISIT_CREATED,

      entityType:
        'OpdVisit',

      entityId:
        visit._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      before:
        null,

      after:
        opdVisitAuditSnapshot(
          visit,
        ),

      metadata: {
        registrationId:
          registration._id.toHexString(),

        idempotencyKey:
          command.idempotencyKey,
      },
    });

    if (queueToken !== null) {
      await this.dependencies.audit.append({
        transactionId:
          transaction.transactionId,

        deduplicationKey:
          registrationQueueDeduplicationKey(
            transaction.transactionId,
            'audit-queue-entry-created',
            queueToken.queueEntryId,
          ),

        action:
          REGISTRATION_QUEUE_AUDIT_ACTIONS
            .QUEUE_ENTRY_CREATED,

        entityType:
          'QueueToken',

        entityId:
          queueToken._id.toHexString(),

        ...buildRegistrationQueueAuditActorFields(
          command.actor,
        ),

        occurredAt,

        before:
          null,

        after:
          queueTokenAuditSnapshot(
            queueToken,
          ),

        metadata: {
          registrationId:
            registration._id.toHexString(),

          visitId:
            visit._id.toHexString(),

          queueEntryId:
            queueToken.queueEntryId,

          idempotencyKey:
            command.idempotencyKey,
        },
      });
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        registrationId:
          registration._id.toHexString(),

        visitId:
          visit._id.toHexString(),

        queueTokenId:
          queueToken?._id.toHexString() ??
          null,
      },
    );

    if (queueToken !== null) {
      await this.dependencies.realtime
        .publish({
          eventType:
            REGISTRATION_QUEUE_REALTIME_EVENTS
              .QUEUE_ENTRY_CREATED,

          facilityId:
            command.actor.facilityId,

          queueDefinitionId:
            queueToken.queueDefinitionId.toHexString(),

          serviceDate:
            queueToken.serviceDate,

          payload: {
            queueEntryId:
              queueToken.queueEntryId,

            tokenLabel:
              queueToken.tokenLabel,

            status:
              queueToken.status,

            assignedCounterId:
              queueToken.assignedCounterId
                ?.toHexString() ??
              null,

            assignedProviderId:
              queueToken.assignedProviderId
                ?.toHexString() ??
              null,

            lastStatusChangedAt:
              queueToken.lastStatusChangedAt.toISOString(),
          },
        })
        .then(
          async () => {
            await transaction.checkpoint(
              REGISTRATION_QUEUE_TRANSACTION_STATES
                .REALTIME_PUBLISHED,
              {
                queueEntryId:
                  queueToken.queueEntryId,

                queueDefinitionId:
                  queueToken.queueDefinitionId.toHexString(),
              },
            );
          },
        )
        .catch(
          () =>
            undefined,
        );
    }

    return toRegisteredOpdVisitResult({
      registration,
      visit,
      queueToken,
      queueHistory,
    });
  }

  private async registerDeleteCompensation(
    transaction: RegistrationQueueTransactionContext,
    type: string,
    entityType: string,
    entityId: string,
    expectedVersion: number,
  ): Promise<void> {
    await transaction.registerCompensation({
      key:
        `delete-created-${entityType}:${entityId}:v${expectedVersion}`,

      type,

      payload: {
        entityId,

        expectedVersion,

        transactionId:
          transaction.transactionId,
      },
    });
  }
}