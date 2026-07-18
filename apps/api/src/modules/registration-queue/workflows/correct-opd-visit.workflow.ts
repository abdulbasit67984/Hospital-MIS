import {
  randomBytes,
} from 'node:crypto';

import {
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  DuplicateActiveVisitError,
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
  RegistrationConcurrencyError,
  RegistrationNotFoundError,
  VisitCorrectionConflictError,
} from '../registration-queue.errors.js';

import {
  opdVisitQueueRestoreSnapshot,
  protectedRegistrationQueueRestorePayload,
  queueTokenRestoreSnapshot,
  registrationRestoreSnapshot,
  requireRegistrationQueueSnapshotCrypto,
} from '../registration-queue.mutation-snapshots.js';

import {
  buildActiveVisitKey,
  registrationQueueLockKey,
} from '../registration-queue.normalization.js';

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
  toRegisteredOpdVisitResult,
  type RegisteredOpdVisitResult,
} from '../registration-queue.mapper.js';

import {
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_REALTIME_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  CorrectOpdVisitInput,
  RegistrationQueueActorContext,
} from '../registration-queue.types.js';

import {
  assertQueueDefinitionSupportsInput,
  queuePriorityScoreForInput,
  registrationQueueCreateLockKeys,
  registrationQueueDeduplicationKey,
  resolveRegistrationTemporalContext,
} from '../registration-queue.workflow-helpers.js';

import type {
  OpdVisitRepository,
} from '../repositories/opd-visit.repository.js';

import type {
  QueueStatusHistoryRepository,
} from '../repositories/queue-status-history.repository.js';

import type {
  QueueTokenMutationRepository,
} from '../repositories/queue-token-mutation.repository.js';

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

export interface CorrectOpdVisitCommand {
  visitId: string;
  input: CorrectOpdVisitInput;
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

export class CorrectOpdVisitWorkflow {
  public constructor(
    private readonly registrations:
      RegistrationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueMutations:
      QueueTokenMutationRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly patients:
      RegistrationPatientResolutionService,

    private readonly contexts:
      RegistrationContextService,

    private readonly numbers:
      RegistrationQueueNumberService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: CorrectOpdVisitCommand,
  ): Promise<RegisteredOpdVisitResult> {
    const preflightVisit =
      await this.visits.findById(
        command.actor.facilityId,
        command.visitId,
        true,
      );

    if (preflightVisit === null) {
      throw new OpdVisitNotFoundError();
    }

    const preflightPatient =
      await this.patients.resolve(
        command.actor.facilityId,
        command.input.replacement.patientId,
      );

    const preflightContext =
      await this.contexts.resolveRegistrationContext(
        command.actor.facilityId,
        command.input.replacement,
      );

    resolveRegistrationTemporalContext(
      command.input.replacement,
      preflightContext.facility.timezone,
      this.dependencies.clock.now(),
    );

    if (command.input.queue != null) {
      const queueContext =
        await this.contexts.resolveQueueContext(
          command.actor.facilityId,
          preflightContext,
          command.input.queue,
        );

      assertQueueDefinitionSupportsInput(
        queueContext.queueDefinition,
        command.input.queue,
      );
    }

    const lockKeys =
      registrationQueueCreateLockKeys({
        actor:
          command.actor,

        canonicalPatientId:
          preflightPatient.canonicalPatientId,

        registration:
          command.input.replacement,

        queueDefinitionId:
          command.input.queue
            ?.queueDefinitionId ??
          null,
      });

    lockKeys.push(
      registrationQueueLockKey(
        REGISTRATION_QUEUE_LOCK_NAMESPACE
          .ACTIVE_VISIT,
        command.actor.facilityId,
        preflightVisit._id.toHexString(),
      ),

      registrationQueueLockKey(
        'registration-queue:registration',
        command.actor.facilityId,
        preflightVisit.registrationId.toHexString(),
      ),
    );

    const preflightQueue =
      await this.queueTokens.findActiveByVisitId(
        command.actor.facilityId,
        command.visitId,
      );

    if (preflightQueue !== null) {
      lockKeys.push(
        registrationQueueLockKey(
          REGISTRATION_QUEUE_LOCK_NAMESPACE
            .QUEUE_ENTRY,
          command.actor.facilityId,
          preflightQueue._id.toHexString(),
        ),
      );
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          REGISTRATION_QUEUE_TRANSACTION_TYPES
            .CORRECT_OPD_VISIT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          ...new Set(
            lockKeys,
          ),
        ],

        idempotencyPayload: {
          visitId:
            command.visitId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'CORRECT_OPD_VISIT',

          sourceVisitId:
            command.visitId,

          replacementServiceDate:
            command.input.replacement.serviceDate,

          replacementDepartmentId:
            command.input.replacement.departmentId,

          replacementClinicId:
            command.input.replacement.clinicId ??
            null,

          replacementServicePointId:
            command.input.replacement.servicePointId ??
            null,

          replacementQueueRequested:
            command.input.queue != null,

          replacementQueueDefinitionId:
            command.input.queue
              ?.queueDefinitionId ??
            null,
        },

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
    command: CorrectOpdVisitCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<RegisteredOpdVisitResult> {
    const sourceVisit =
      await this.visits.findById(
        command.actor.facilityId,
        command.visitId,
        true,
      );

    if (sourceVisit === null) {
      throw new OpdVisitNotFoundError();
    }

    if (
      sourceVisit.version !==
      command.input.expectedVersion
    ) {
      throw new OpdVisitConcurrencyError();
    }

    if (
      ![
        'REGISTERED',
        'CHECKED_IN',
        'QUEUED',
        'IN_SERVICE',
      ].includes(
        sourceVisit.status,
      )
    ) {
      throw new VisitCorrectionConflictError();
    }

    const sourceRegistration =
      await this.registrations.findById(
        command.actor.facilityId,
        sourceVisit.registrationId.toHexString(),
        true,
      );

    if (sourceRegistration === null) {
      throw new RegistrationNotFoundError();
    }

    if (
      sourceRegistration.status !==
      'ACTIVE'
    ) {
      throw new VisitCorrectionConflictError();
    }

    const sourceQueue =
      await this.queueTokens.findActiveByVisitId(
        command.actor.facilityId,
        sourceVisit._id.toHexString(),
      );

    if (
      sourceQueue !== null &&
      !QUEUE_ENTRY_TRANSITIONS[
        sourceQueue.status
      ].includes(
        'CANCELLED',
      )
    ) {
      throw new VisitCorrectionConflictError();
    }

    const patient =
      await this.patients.resolve(
        command.actor.facilityId,
        command.input.replacement.patientId,
      );

    const registrationContext =
      await this.contexts.resolveRegistrationContext(
        command.actor.facilityId,
        command.input.replacement,
      );

    const temporal =
      resolveRegistrationTemporalContext(
        command.input.replacement,
        registrationContext.facility.timezone,
        this.dependencies.clock.now(),
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
      command.input.queue != null
    ) {
      assertQueueDefinitionSupportsInput(
        queueContext.queueDefinition,
        command.input.queue,
      );
    }

    const replacementActiveVisitKey =
      buildActiveVisitKey({
        patientId:
          patient.canonicalPatientId,

        serviceDate:
          command.input.replacement.serviceDate,

        departmentId:
          command.input.replacement.departmentId,

        clinicId:
          command.input.replacement.clinicId ??
          null,

        servicePointId:
          command.input.replacement.servicePointId ??
          null,
      });

    const activeVisit =
      await this.visits.findActiveByKey(
        command.actor.facilityId,
        replacementActiveVisitKey,
      );

    if (
      activeVisit !== null &&
      activeVisit._id.toHexString() !==
        sourceVisit._id.toHexString()
    ) {
      throw new DuplicateActiveVisitError();
    }

    const registrationNumber =
      await this.numbers.allocateRegistrationNumber({
        facilityId:
          command.actor.facilityId,

        serviceDate:
          command.input.replacement.serviceDate,
      });

    const visitNumber =
      await this.numbers.allocateVisitNumber({
        facilityId:
          command.actor.facilityId,

        serviceDate:
          command.input.replacement.serviceDate,
      });

    const queueNumber =
      queueContext === null
        ? null
        : await this.numbers.allocateQueueTokenNumber({
            facilityId:
              command.actor.facilityId,

            queueDefinitionId:
              queueContext.queueDefinition._id.toHexString(),

            serviceDate:
              command.input.replacement.serviceDate,
          });

    const replacementRegistrationId =
      newObjectIdString();

    const replacementVisitId =
      newObjectIdString();

    const replacementQueueTokenId =
      queueContext === null
        ? null
        : newObjectIdString();

    const replacementQueueEntryId =
      queueContext === null
        ? null
        : newQueueEntryId();

    const crypto =
      requireRegistrationQueueSnapshotCrypto(
        this.dependencies,
      );

    await transaction.registerCompensation({
      key:
        `restore-registration:${sourceRegistration._id.toHexString()}:v${sourceRegistration.version + 1}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .RESTORE_REGISTRATION,

      payload:
        protectedRegistrationQueueRestorePayload({
          crypto,

          transactionId:
            transaction.transactionId,

          entityType:
            'registration',

          entityId:
            sourceRegistration._id.toHexString(),

          expectedPostVersion:
            sourceRegistration.version + 1,

          snapshot:
            registrationRestoreSnapshot(
              sourceRegistration,
            ),
        }),
    });

    await transaction.registerCompensation({
      key:
        `restore-opd-visit:${sourceVisit._id.toHexString()}:v${sourceVisit.version + 1}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .RESTORE_OPD_VISIT,

      payload:
        protectedRegistrationQueueRestorePayload({
          crypto,

          transactionId:
            transaction.transactionId,

          entityType:
            'opd-visit',

          entityId:
            sourceVisit._id.toHexString(),

          expectedPostVersion:
            sourceVisit.version + 1,

          snapshot:
            opdVisitQueueRestoreSnapshot(
              sourceVisit,
            ),
        }),
    });

    if (sourceQueue !== null) {
      await transaction.registerCompensation({
        key:
          `restore-queue-entry:${sourceQueue._id.toHexString()}:v${sourceQueue.version + 1}`,

        type:
          REGISTRATION_QUEUE_COMPENSATION_TYPES
            .RESTORE_QUEUE_ENTRY,

        payload:
          protectedRegistrationQueueRestorePayload({
            crypto,

            transactionId:
              transaction.transactionId,

            entityType:
              'queue-entry',

            entityId:
              sourceQueue._id.toHexString(),

            expectedPostVersion:
              sourceQueue.version + 1,

            snapshot:
              queueTokenRestoreSnapshot(
                sourceQueue,
              ),
          }),
      });
    }

    const occurredAt =
      this.dependencies.clock.now();

    let cancelledSourceQueue = null;

    if (sourceQueue !== null) {
      cancelledSourceQueue =
        await this.queueMutations
          .transitionWithVersion({
            facilityId:
              command.actor.facilityId,

            queueTokenId:
              sourceQueue._id.toHexString(),

            opdVisitId:
              sourceQueue.opdVisitId.toHexString(),

            expectedVersion:
              sourceQueue.version,

            fromStatuses: [
              sourceQueue.status,
            ],

            status:
              'CANCELLED',

            assignedProviderId:
              sourceQueue.assignedProviderId
                ?.toHexString() ??
              null,

            assignedCounterId:
              sourceQueue.assignedCounterId
                ?.toHexString() ??
              null,

            occurredAt,

            actorUserId:
              command.actor.userId,

            reason:
              command.input.reason,

            incrementSkip:
              false,

            incrementRecall:
              false,
          });

      if (
        cancelledSourceQueue ===
        null
      ) {
        throw new QueueEntryConcurrencyError();
      }

      const sourceSequence =
        await this.queueHistory.nextSequence(
          command.actor.facilityId,
          sourceQueue._id.toHexString(),
        );

      const sourceHistory =
        await this.queueHistory.append({
          historyId:
            newObjectIdString(),

          facilityId:
            command.actor.facilityId,

          queueTokenId:
            sourceQueue._id.toHexString(),

          queueEntryId:
            sourceQueue.queueEntryId,

          opdVisitId:
            sourceQueue.opdVisitId.toHexString(),

          patientId:
            sourceQueue.patientId.toHexString(),

          sequence:
            sourceSequence,

          fromStatus:
            sourceQueue.status,

          toStatus:
            'CANCELLED',

          queueDefinitionId:
            sourceQueue.queueDefinitionId.toHexString(),

          providerId:
            sourceQueue.assignedProviderId
              ?.toHexString() ??
            null,

          counterId:
            sourceQueue.assignedCounterId
              ?.toHexString() ??
            null,

          changeSource:
            'RECEPTION',

          reason:
            command.input.reason,

          occurredAt,

          changedBy:
            command.actor.userId,

          transactionId:
            transaction.transactionId,

          correlationId:
            command.actor.correlationId,
        });

      await transaction.registerCompensation({
        key:
          `delete-correction-source-history:${sourceHistory._id.toHexString()}:v${sourceHistory.version}`,

        type:
          REGISTRATION_QUEUE_COMPENSATION_TYPES
            .DELETE_QUEUE_HISTORY,

        payload: {
          entityId:
            sourceHistory._id.toHexString(),

          expectedVersion:
            sourceHistory.version,

          transactionId:
            transaction.transactionId,
        },
      });
    }

    const correctedSourceVisit =
      await this.visits.markCorrectedWithVersion({
        facilityId:
          command.actor.facilityId,

        visitId:
          sourceVisit._id.toHexString(),

        expectedVersion:
          sourceVisit.version,

        replacementVisitId,

        reason:
          command.input.reason,

        actorUserId:
          command.actor.userId,
      });

    if (
      correctedSourceVisit ===
      null
    ) {
      throw new OpdVisitConcurrencyError();
    }

    const supersededSourceRegistration =
      await this.registrations.markSupersededWithVersion({
        facilityId:
          command.actor.facilityId,

        registrationId:
          sourceRegistration._id.toHexString(),

        expectedVersion:
          sourceRegistration.version,

        replacementRegistrationId,

        reason:
          command.input.reason,

        actorUserId:
          command.actor.userId,
      });

    if (
      supersededSourceRegistration ===
      null
    ) {
      throw new RegistrationConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OPD_VISIT_CORRECTED,
      {
        sourceVisitId:
          correctedSourceVisit._id.toHexString(),

        replacementVisitId,

        sourceRegistrationId:
          supersededSourceRegistration._id.toHexString(),

        replacementRegistrationId,
      },
    );

    const assignedProviderId =
      queueContext?.assignedProviderId ??
      registrationContext.assignedProviderId;

    const assignedCounterId =
      queueContext?.assignedCounterId ??
      registrationContext.assignedCounterId;

    const replacementRegistration =
      await this.registrations.create({
        registrationId:
          replacementRegistrationId,

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
          command.input.replacement.registrationMode,

        registrationSource:
          command.input.replacement.registrationSource,

        visitType:
          command.input.replacement.visitType,

        serviceDate:
          command.input.replacement.serviceDate,

        arrivedAt:
          temporal.arrivedAt,

        checkedInAt:
          temporal.checkedInAt,

        appointmentId:
          command.input.replacement.appointmentId ??
          null,

        referralId:
          command.input.replacement.referralId ??
          null,

        referralReference:
          command.input.replacement.referralReference ??
          null,

        emergencyCaseId:
          command.input.replacement.emergencyCaseId ??
          null,

        departmentId:
          command.input.replacement.departmentId,

        clinicId:
          command.input.replacement.clinicId ??
          null,

        servicePointId:
          command.input.replacement.servicePointId ??
          null,

        assignedProviderId:
          registrationContext.assignedProviderId,

        registrationNotes:
          command.input.replacement.registrationNotes ??
          null,

        supersedesRegistrationId:
          sourceRegistration._id.toHexString(),

        correctionReason:
          command.input.reason,

        transactionId:
          transaction.transactionId,

        correlationId:
          command.actor.correlationId,

        actorUserId:
          command.actor.userId,
      });

    await transaction.registerCompensation({
      key:
        `delete-correction-registration:${replacementRegistration._id.toHexString()}:v${replacementRegistration.version}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_REGISTRATION,

      payload: {
        entityId:
          replacementRegistration._id.toHexString(),

        expectedVersion:
          replacementRegistration.version,

        transactionId:
          transaction.transactionId,
      },
    });

    const replacementVisitStatus =
      queueContext !== null
        ? 'QUEUED'
        : temporal.checkedInAt !==
            null
          ? 'CHECKED_IN'
          : 'REGISTERED';

    const replacementVisit =
      await this.visits.create({
        visitId:
          replacementVisitId,

        facilityId:
          command.actor.facilityId,

        visitNumber:
          visitNumber.visitNumber,

        registrationId:
          replacementRegistration._id.toHexString(),

        patientId:
          patient.canonicalPatientId,

        requestedPatientId:
          patient.requestedPatientId,

        canonicalRedirected:
          patient.redirected,

        serviceDate:
          command.input.replacement.serviceDate,

        visitType:
          command.input.replacement.visitType,

        registrationSource:
          command.input.replacement.registrationSource,

        status:
          replacementVisitStatus,

        departmentId:
          command.input.replacement.departmentId,

        clinicId:
          command.input.replacement.clinicId ??
          null,

        servicePointId:
          command.input.replacement.servicePointId ??
          null,

        assignedProviderId,

        assignedCounterId,

        currentQueueTokenId:
          replacementQueueTokenId,

        arrivedAt:
          temporal.arrivedAt,

        checkedInAt:
          temporal.checkedInAt,

        queuedAt:
          queueContext === null
            ? null
            : occurredAt,

        supersedesVisitId:
          sourceVisit._id.toHexString(),

        correctionReason:
          command.input.reason,

        transactionId:
          transaction.transactionId,

        correlationId:
          command.actor.correlationId,

        actorUserId:
          command.actor.userId,
      });

    await transaction.registerCompensation({
      key:
        `delete-correction-visit:${replacementVisit._id.toHexString()}:v${replacementVisit.version}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_OPD_VISIT,

      payload: {
        entityId:
          replacementVisit._id.toHexString(),

        expectedVersion:
          replacementVisit.version,

        transactionId:
          transaction.transactionId,
      },
    });

    let replacementQueue = null;
    let replacementHistory = null;

    if (
      queueContext !== null &&
      queueNumber !== null &&
      replacementQueueTokenId !==
        null &&
      replacementQueueEntryId !==
        null &&
      command.input.queue != null
    ) {
      replacementQueue =
        await this.queueTokens.create({
          queueTokenId:
            replacementQueueTokenId,

          queueEntryId:
            replacementQueueEntryId,

          facilityId:
            command.actor.facilityId,

          registrationId:
            replacementRegistration._id.toHexString(),

          opdVisitId:
            replacementVisit._id.toHexString(),

          patientId:
            patient.canonicalPatientId,

          queueDefinitionId:
            queueContext.queueDefinition._id.toHexString(),

          serviceDate:
            replacementVisit.serviceDate,

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
            occurredAt,

          transactionId:
            transaction.transactionId,

          correlationId:
            command.actor.correlationId,

          actorUserId:
            command.actor.userId,
        });

      await transaction.registerCompensation({
        key:
          `delete-correction-queue:${replacementQueue._id.toHexString()}:v${replacementQueue.version}`,

        type:
          REGISTRATION_QUEUE_COMPENSATION_TYPES
            .DELETE_QUEUE_ENTRY,

        payload: {
          entityId:
            replacementQueue._id.toHexString(),

          expectedVersion:
            replacementQueue.version,

          transactionId:
            transaction.transactionId,
        },
      });

      replacementHistory =
        await this.queueHistory.append({
          historyId:
            newObjectIdString(),

          facilityId:
            command.actor.facilityId,

          queueTokenId:
            replacementQueue._id.toHexString(),

          queueEntryId:
            replacementQueue.queueEntryId,

          opdVisitId:
            replacementVisit._id.toHexString(),

          patientId:
            replacementQueue.patientId.toHexString(),

          sequence:
            1,

          fromStatus:
            null,

          toStatus:
            'WAITING',

          queueDefinitionId:
            replacementQueue.queueDefinitionId.toHexString(),

          providerId:
            replacementQueue.assignedProviderId
              ?.toHexString() ??
            null,

          counterId:
            replacementQueue.assignedCounterId
              ?.toHexString() ??
            null,

          changeSource:
            'RECEPTION',

          reason:
            'Corrected OPD visit queue entry',

          occurredAt,

          changedBy:
            command.actor.userId,

          transactionId:
            transaction.transactionId,

          correlationId:
            command.actor.correlationId,
        });

      await transaction.registerCompensation({
        key:
          `delete-correction-queue-history:${replacementHistory._id.toHexString()}:v${replacementHistory.version}`,

        type:
          REGISTRATION_QUEUE_COMPENSATION_TYPES
            .DELETE_QUEUE_HISTORY,

        payload: {
          entityId:
            replacementHistory._id.toHexString(),

          expectedVersion:
            replacementHistory.version,

          transactionId:
            transaction.transactionId,
        },
      });
    }

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-opd-visit-corrected',
          sourceVisit._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .OPD_VISIT_CORRECTED,

      entityType:
        'OpdVisit',

      entityId:
        sourceVisit._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      reason:
        command.input.reason,

      before: {
        registration:
          registrationAuditSnapshot(
            sourceRegistration,
          ),

        visit:
          opdVisitAuditSnapshot(
            sourceVisit,
          ),

        queue:
          sourceQueue === null
            ? null
            : queueTokenAuditSnapshot(
                sourceQueue,
              ),
      },

      after: {
        sourceRegistration:
          registrationAuditSnapshot(
            supersededSourceRegistration,
          ),

        sourceVisit:
          opdVisitAuditSnapshot(
            correctedSourceVisit,
          ),

        sourceQueue:
          cancelledSourceQueue === null
            ? null
            : queueTokenAuditSnapshot(
                cancelledSourceQueue,
              ),

        replacementRegistration:
          registrationAuditSnapshot(
            replacementRegistration,
          ),

        replacementVisit:
          opdVisitAuditSnapshot(
            replacementVisit,
          ),

        replacementQueue:
          replacementQueue === null
            ? null
            : queueTokenAuditSnapshot(
                replacementQueue,
              ),
      },

      metadata: {
        idempotencyKey:
          command.idempotencyKey,

        replacementRegistrationId:
          replacementRegistration._id.toHexString(),

        replacementVisitId:
          replacementVisit._id.toHexString(),

        replacementQueueEntryId:
          replacementQueue?.queueEntryId ??
          null,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        sourceVisitId:
          sourceVisit._id.toHexString(),

        replacementVisitId:
          replacementVisit._id.toHexString(),
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-opd-visit-corrected',
          sourceVisit._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .OPD_VISIT_CORRECTED,

      aggregateType:
        'OpdVisit',

      aggregateId:
        sourceVisit._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        sourceRegistrationId:
          sourceRegistration._id.toHexString(),

        sourceVisitId:
          sourceVisit._id.toHexString(),

        sourceQueueEntryId:
          sourceQueue?.queueEntryId ??
          null,

        replacementRegistrationId:
          replacementRegistration._id.toHexString(),

        replacementRegistrationNumber:
          replacementRegistration.registrationNumber,

        replacementVisitId:
          replacementVisit._id.toHexString(),

        replacementVisitNumber:
          replacementVisit.visitNumber,

        replacementQueueEntryId:
          replacementQueue?.queueEntryId ??
          null,

        replacementTokenLabel:
          replacementQueue?.tokenLabel ??
          null,

        patientId:
          replacementVisit.patientId.toHexString(),

        serviceDate:
          replacementVisit.serviceDate,

        occurredAt:
          occurredAt.toISOString(),
      },
    });

    if (cancelledSourceQueue !== null) {
      await this.dependencies.outbox.enqueue({
        transactionId:
          transaction.transactionId,

        deduplicationKey:
          registrationQueueDeduplicationKey(
            transaction.transactionId,
            'outbox-correction-source-queue-cancelled',
            cancelledSourceQueue.queueEntryId,
          ),

        eventType:
          REGISTRATION_QUEUE_OUTBOX_EVENTS
            .QUEUE_STATUS_CHANGED,

        aggregateType:
          'QueueToken',

        aggregateId:
          cancelledSourceQueue._id.toHexString(),

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        occurredAt,

        payload: {
          queueEntryId:
            cancelledSourceQueue.queueEntryId,

          queueDefinitionId:
            cancelledSourceQueue.queueDefinitionId.toHexString(),

          serviceDate:
            cancelledSourceQueue.serviceDate,

          status:
            cancelledSourceQueue.status,

          occurredAt:
            occurredAt.toISOString(),
        },
      });
    }

    if (replacementQueue !== null) {
      await this.dependencies.outbox.enqueue({
        transactionId:
          transaction.transactionId,

        deduplicationKey:
          registrationQueueDeduplicationKey(
            transaction.transactionId,
            'outbox-correction-queue-created',
            replacementQueue.queueEntryId,
          ),

        eventType:
          REGISTRATION_QUEUE_OUTBOX_EVENTS
            .QUEUE_ENTRY_CREATED,

        aggregateType:
          'QueueToken',

        aggregateId:
          replacementQueue._id.toHexString(),

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        occurredAt,

        payload: {
          queueEntryId:
            replacementQueue.queueEntryId,

          queueDefinitionId:
            replacementQueue.queueDefinitionId.toHexString(),

          serviceDate:
            replacementQueue.serviceDate,

          tokenLabel:
            replacementQueue.tokenLabel,

          status:
            replacementQueue.status,

          occurredAt:
            occurredAt.toISOString(),
        },
      });
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        sourceVisitId:
          sourceVisit._id.toHexString(),

        replacementVisitId:
          replacementVisit._id.toHexString(),

        replacementQueueEntryId:
          replacementQueue?.queueEntryId ??
          null,
      },
    );

    if (cancelledSourceQueue !== null) {
      await this.dependencies.realtime
        .publish({
          eventType:
            REGISTRATION_QUEUE_REALTIME_EVENTS
              .QUEUE_STATUS_CHANGED,

          facilityId:
            command.actor.facilityId,

          queueDefinitionId:
            cancelledSourceQueue.queueDefinitionId.toHexString(),

          serviceDate:
            cancelledSourceQueue.serviceDate,

          payload: {
            queueEntryId:
              cancelledSourceQueue.queueEntryId,

            tokenLabel:
              cancelledSourceQueue.tokenLabel,

            status:
              cancelledSourceQueue.status,

            lastStatusChangedAt:
              cancelledSourceQueue.lastStatusChangedAt.toISOString(),
          },
        })
        .catch(
          () =>
            undefined,
        );
    }

    if (replacementQueue !== null) {
      await this.dependencies.realtime
        .publish({
          eventType:
            REGISTRATION_QUEUE_REALTIME_EVENTS
              .QUEUE_ENTRY_CREATED,

          facilityId:
            command.actor.facilityId,

          queueDefinitionId:
            replacementQueue.queueDefinitionId.toHexString(),

          serviceDate:
            replacementQueue.serviceDate,

          payload: {
            queueEntryId:
              replacementQueue.queueEntryId,

            tokenLabel:
              replacementQueue.tokenLabel,

            status:
              replacementQueue.status,

            assignedProviderId:
              replacementQueue.assignedProviderId
                ?.toHexString() ??
              null,

            assignedCounterId:
              replacementQueue.assignedCounterId
                ?.toHexString() ??
              null,

            lastStatusChangedAt:
              replacementQueue.lastStatusChangedAt.toISOString(),
          },
        })
        .catch(
          () =>
            undefined,
        );
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .REALTIME_PUBLISHED,
      {
        sourceQueueEntryId:
          cancelledSourceQueue
            ?.queueEntryId ??
          null,

        replacementQueueEntryId:
          replacementQueue
            ?.queueEntryId ??
          null,
      },
    );

    return toRegisteredOpdVisitResult({
      registration:
        replacementRegistration,

      visit:
        replacementVisit,

      queueToken:
        replacementQueue,

      queueHistory:
        replacementHistory,
    });
  }
}