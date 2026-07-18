import {
  randomBytes,
} from 'node:crypto';

import {
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  InvalidQueueEntryTransitionError,
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
  QueueEntryNotFoundError,
  QueueTransferConflictError,
} from '../registration-queue.errors.js';

import {
  opdVisitQueueRestoreSnapshot,
  protectedRegistrationQueueRestorePayload,
  queueTokenRestoreSnapshot,
  requireRegistrationQueueSnapshotCrypto,
} from '../registration-queue.mutation-snapshots.js';

import {
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
} from '../registration-queue.projections.js';

import {
  toQueueTransferMutationResult,
  type QueueTransferMutationResult,
} from '../registration-visit-lifecycle.mapper.js';

import {
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_REALTIME_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  RegistrationQueueActorContext,
  TransferQueueEntryInput,
} from '../registration-queue.types.js';

import {
  assertQueueDefinitionSupportsInput,
  registrationQueueDeduplicationKey,
} from '../registration-queue.workflow-helpers.js';

import type {
  OpdVisitLifecycleRepository,
} from '../repositories/opd-visit-lifecycle.repository.js';

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
  QueueTransferRepository,
} from '../repositories/queue-transfer.repository.js';

import type {
  QueueMutationContextService,
} from '../services/queue-mutation-context.service.js';

import type {
  RegistrationQueueNumberService,
} from '../services/registration-queue-number.service.js';

export interface TransferQueueEntryCommand {
  queueEntryId: string;
  input: TransferQueueEntryInput;
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

export class TransferQueueEntryWorkflow {
  public constructor(
    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueTransfers:
      QueueTransferRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly visitLifecycle:
      OpdVisitLifecycleRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly contexts:
      QueueMutationContextService,

    private readonly numbers:
      RegistrationQueueNumberService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: TransferQueueEntryCommand,
  ): Promise<QueueTransferMutationResult> {
    const preflightQueue =
      await this.queueTokens.findByEntryId(
        command.actor.facilityId,
        command.queueEntryId,
        true,
      );

    if (preflightQueue === null) {
      throw new QueueEntryNotFoundError();
    }

    const preflightVisit =
      await this.visits.findById(
        command.actor.facilityId,
        preflightQueue.opdVisitId.toHexString(),
        true,
      );

    if (preflightVisit === null) {
      throw new OpdVisitNotFoundError();
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          REGISTRATION_QUEUE_TRANSACTION_TYPES
            .TRANSFER_QUEUE_ENTRY,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys: [
          registrationQueueLockKey(
            REGISTRATION_QUEUE_LOCK_NAMESPACE
              .QUEUE_TRANSFER,
            command.actor.facilityId,
            preflightQueue._id.toHexString(),
          ),

          registrationQueueLockKey(
            REGISTRATION_QUEUE_LOCK_NAMESPACE
              .ACTIVE_VISIT,
            command.actor.facilityId,
            preflightVisit._id.toHexString(),
          ),

          registrationQueueLockKey(
            REGISTRATION_QUEUE_LOCK_NAMESPACE
              .QUEUE_TOKEN,
            command.actor.facilityId,
            command.input.destinationQueueDefinitionId,
            preflightQueue.serviceDate,
          ),
        ],

        idempotencyPayload: {
          queueEntryId:
            command.queueEntryId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'TRANSFER_QUEUE_ENTRY',

          sourceQueueEntryId:
            command.queueEntryId,

          destinationQueueDefinitionId:
            command.input.destinationQueueDefinitionId,

          destinationProviderProvided:
            command.input.destinationProviderId !==
            undefined,

          destinationCounterProvided:
            command.input.destinationCounterId !==
            undefined,

          transferReason:
            command.input.transferReason,
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
    command: TransferQueueEntryCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<QueueTransferMutationResult> {
    const source =
      await this.queueTokens.findByEntryId(
        command.actor.facilityId,
        command.queueEntryId,
        true,
      );

    if (source === null) {
      throw new QueueEntryNotFoundError();
    }

    if (
      source.version !==
      command.input.expectedVersion
    ) {
      throw new QueueEntryConcurrencyError();
    }

    if (
      !QUEUE_ENTRY_TRANSITIONS[
        source.status
      ].includes(
        'TRANSFERRED',
      )
    ) {
      throw new InvalidQueueEntryTransitionError(
        source.status,
        'TRANSFERRED',
      );
    }

    const visit =
      await this.visits.findById(
        command.actor.facilityId,
        source.opdVisitId.toHexString(),
        true,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    const destination =
      await this.contexts.resolve({
        facilityId:
          command.actor.facilityId,

        queueDefinitionId:
          command.input.destinationQueueDefinitionId,

        currentProviderId:
          null,

        currentCounterId:
          null,

        requestedProviderId:
          command.input.destinationProviderId,

        requestedCounterId:
          command.input.destinationCounterId,
      });

    const destinationQueueDefinitionId =
      destination.queueDefinition._id.toHexString();

    const sourceProviderId =
      source.assignedProviderId
        ?.toHexString() ??
      null;

    const sourceCounterId =
      source.assignedCounterId
        ?.toHexString() ??
      null;

    if (
      source.queueDefinitionId.toHexString() ===
        destinationQueueDefinitionId &&
      sourceProviderId ===
        destination.assignedProviderId &&
      sourceCounterId ===
        destination.assignedCounterId
    ) {
      throw new QueueTransferConflictError(
        'Queue transfer must change the queue, provider, or service counter',
      );
    }

    assertQueueDefinitionSupportsInput(
      destination.queueDefinition,
      {
        queueDefinitionId:
          destinationQueueDefinitionId,

        priorityClass:
          source.priorityClass,

        triagePriority:
          source.triagePriority,

        emergencyOverride:
          source.emergencyOverride,

        emergencyOverrideReason:
          source.emergencyOverrideReason,

        specialCategories:
          source.specialCategories,
      },
    );

    const allocatedToken =
      await this.numbers.allocateQueueTokenNumber({
        facilityId:
          command.actor.facilityId,

        queueDefinitionId:
          destinationQueueDefinitionId,

        serviceDate:
          source.serviceDate,
      });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .QUEUE_TOKEN_ALLOCATED,
      {
        queueDefinitionId:
          destinationQueueDefinitionId,

        serviceDate:
          source.serviceDate,

        sequenceValue:
          allocatedToken.sequenceValue,

        tokenLabel:
          allocatedToken.tokenLabel,
      },
    );

    const destinationQueueTokenId =
      newObjectIdString();

    const destinationQueueEntryId =
      newQueueEntryId();

    const crypto =
      requireRegistrationQueueSnapshotCrypto(
        this.dependencies,
      );

    await transaction.registerCompensation({
      key:
        `restore-queue-entry:${source._id.toHexString()}:v${source.version + 1}`,

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
            source._id.toHexString(),

          expectedPostVersion:
            source.version + 1,

          snapshot:
            queueTokenRestoreSnapshot(
              source,
            ),
        }),
    });

    await transaction.registerCompensation({
      key:
        `restore-opd-visit:${visit._id.toHexString()}:v${visit.version + 1}`,

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
            visit._id.toHexString(),

          expectedPostVersion:
            visit.version + 1,

          snapshot:
            opdVisitQueueRestoreSnapshot(
              visit,
            ),
        }),
    });

    const occurredAt =
      this.dependencies.clock.now();

    const transferredSource =
      await this.queueTransfers
        .markTransferredWithVersion({
          facilityId:
            command.actor.facilityId,

          sourceQueueTokenId:
            source._id.toHexString(),

          expectedVersion:
            source.version,

          destinationQueueTokenId,

          transferReason:
            command.input.transferReason,

          reason:
            command.input.reason,

          occurredAt,

          actorUserId:
            command.actor.userId,
        });

    if (transferredSource === null) {
      throw new QueueEntryConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .SOURCE_QUEUE_TRANSFERRED,
      {
        sourceQueueTokenId:
          transferredSource._id.toHexString(),

        sourceQueueEntryId:
          transferredSource.queueEntryId,

        destinationQueueTokenId,

        transferCount:
          transferredSource.transferCount,

        version:
          transferredSource.version,
      },
    );

    const destinationQueue =
      await this.queueTokens.create({
        queueTokenId:
          destinationQueueTokenId,

        queueEntryId:
          destinationQueueEntryId,

        facilityId:
          command.actor.facilityId,

        registrationId:
          source.registrationId.toHexString(),

        opdVisitId:
          source.opdVisitId.toHexString(),

        patientId:
          source.patientId.toHexString(),

        queueDefinitionId:
          destinationQueueDefinitionId,

        serviceDate:
          source.serviceDate,

        tokenNumber:
          allocatedToken.tokenNumber,

        tokenPrefix:
          allocatedToken.tokenPrefix,

        tokenLabel:
          allocatedToken.tokenLabel,

        priorityClass:
          source.priorityClass,

        priorityScore:
          source.priorityScore,

        triagePriority:
          source.triagePriority,

        emergencyOverride:
          source.emergencyOverride,

        emergencyOverrideReason:
          source.emergencyOverrideReason,

        specialCategories: [
          ...source.specialCategories,
        ],

        assignedProviderId:
          destination.assignedProviderId,

        assignedCounterId:
          destination.assignedCounterId,

        queuedAt:
          occurredAt,

        transferredFromQueueTokenId:
          source._id.toHexString(),

        transferCount:
          transferredSource.transferCount,

        transactionId:
          transaction.transactionId,

        correlationId:
          command.actor.correlationId,

        actorUserId:
          command.actor.userId,
      });

    await transaction.registerCompensation({
      key:
        `delete-destination-queue-entry:${destinationQueue._id.toHexString()}:v${destinationQueue.version}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_QUEUE_ENTRY,

      payload: {
        entityId:
          destinationQueue._id.toHexString(),

        expectedVersion:
          destinationQueue.version,

        transactionId:
          transaction.transactionId,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .DESTINATION_QUEUE_CREATED,
      {
        destinationQueueTokenId:
          destinationQueue._id.toHexString(),

        destinationQueueEntryId:
          destinationQueue.queueEntryId,

        tokenLabel:
          destinationQueue.tokenLabel,

        queueDefinitionId:
          destinationQueue.queueDefinitionId.toHexString(),

        version:
          destinationQueue.version,
      },
    );

    const updatedVisit =
      await this.visitLifecycle
        .transferWithVersion({
          facilityId:
            command.actor.facilityId,

          visitId:
            visit._id.toHexString(),

          expectedVersion:
            visit.version,

          patientId:
            visit.patientId.toHexString(),

          serviceDate:
            visit.serviceDate,

          destinationDepartmentId:
            destination.queueDefinition.departmentId.toHexString(),

          destinationClinicId:
            destination.queueDefinition.clinicId
              ?.toHexString() ??
            null,

          destinationServicePointId:
            destination.queueDefinition.servicePointId
              ?.toHexString() ??
            null,

          destinationProviderId:
            destination.assignedProviderId,

          destinationCounterId:
            destination.assignedCounterId,

          destinationQueueTokenId:
            destinationQueue._id.toHexString(),

          occurredAt,

          actorUserId:
            command.actor.userId,
        });

    if (updatedVisit === null) {
      throw new OpdVisitConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OPD_VISIT_STATUS_CHANGED,
      {
        visitId:
          updatedVisit._id.toHexString(),

        status:
          updatedVisit.status,

        currentQueueTokenId:
          updatedVisit.currentQueueTokenId
            ?.toHexString() ??
          null,

        version:
          updatedVisit.version,
      },
    );

    const sourceSequence =
      await this.queueHistory.nextSequence(
        command.actor.facilityId,
        source._id.toHexString(),
      );

    const sourceHistory =
      await this.queueHistory.append({
        historyId:
          newObjectIdString(),

        facilityId:
          command.actor.facilityId,

        queueTokenId:
          source._id.toHexString(),

        queueEntryId:
          source.queueEntryId,

        opdVisitId:
          source.opdVisitId.toHexString(),

        patientId:
          source.patientId.toHexString(),

        sequence:
          sourceSequence,

        fromStatus:
          source.status,

        toStatus:
          'TRANSFERRED',

        queueDefinitionId:
          source.queueDefinitionId.toHexString(),

        destinationQueueDefinitionId:
          destinationQueueDefinitionId,

        providerId:
          sourceProviderId,

        destinationProviderId:
          destination.assignedProviderId,

        counterId:
          sourceCounterId,

        destinationCounterId:
          destination.assignedCounterId,

        changeSource:
          'RECEPTION',

        transferReason:
          command.input.transferReason,

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
        `delete-source-transfer-history:${sourceHistory._id.toHexString()}:v${sourceHistory.version}`,

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

    const destinationHistory =
      await this.queueHistory.append({
        historyId:
          newObjectIdString(),

        facilityId:
          command.actor.facilityId,

        queueTokenId:
          destinationQueue._id.toHexString(),

        queueEntryId:
          destinationQueue.queueEntryId,

        opdVisitId:
          destinationQueue.opdVisitId.toHexString(),

        patientId:
          destinationQueue.patientId.toHexString(),

        sequence:
          sourceSequence + 1,

        fromStatus:
          null,

        toStatus:
          'WAITING',

        queueDefinitionId:
          destinationQueueDefinitionId,

        providerId:
          destination.assignedProviderId,

        counterId:
          destination.assignedCounterId,

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
        `delete-destination-transfer-history:${destinationHistory._id.toHexString()}:v${destinationHistory.version}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_QUEUE_HISTORY,

      payload: {
        entityId:
          destinationHistory._id.toHexString(),

        expectedVersion:
          destinationHistory.version,

        transactionId:
          transaction.transactionId,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .QUEUE_HISTORY_APPENDED,
      {
        sourceSequence:
          sourceHistory.sequence,

        destinationSequence:
          destinationHistory.sequence,

        sourceQueueEntryId:
          source.queueEntryId,

        destinationQueueEntryId:
          destinationQueue.queueEntryId,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-queue-entry-transferred',
          source.queueEntryId,
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .QUEUE_ENTRY_TRANSFERRED,

      entityType:
        'QueueToken',

      entityId:
        source._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      reason:
        command.input.reason,

      before:
        queueTokenAuditSnapshot(
          source,
        ),

      after: {
        source:
          queueTokenAuditSnapshot(
            transferredSource,
          ),

        destination:
          queueTokenAuditSnapshot(
            destinationQueue,
          ),
      },

      metadata: {
        visitBefore:
          opdVisitAuditSnapshot(
            visit,
          ),

        visitAfter:
          opdVisitAuditSnapshot(
            updatedVisit,
          ),

        transferReason:
          command.input.transferReason,

        sourceHistorySequence:
          sourceHistory.sequence,

        destinationHistorySequence:
          destinationHistory.sequence,

        idempotencyKey:
          command.idempotencyKey,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        sourceQueueTokenId:
          source._id.toHexString(),

        destinationQueueTokenId:
          destinationQueue._id.toHexString(),

        visitId:
          updatedVisit._id.toHexString(),
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-queue-entry-transferred',
          source.queueEntryId,
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .QUEUE_ENTRY_TRANSFERRED,

      aggregateType:
        'QueueToken',

      aggregateId:
        source._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        sourceQueueTokenId:
          source._id.toHexString(),

        sourceQueueEntryId:
          source.queueEntryId,

        sourceQueueDefinitionId:
          source.queueDefinitionId.toHexString(),

        sourceTokenLabel:
          source.tokenLabel,

        destinationQueueTokenId:
          destinationQueue._id.toHexString(),

        destinationQueueEntryId:
          destinationQueue.queueEntryId,

        destinationQueueDefinitionId:
          destinationQueue.queueDefinitionId.toHexString(),

        destinationTokenLabel:
          destinationQueue.tokenLabel,

        visitId:
          updatedVisit._id.toHexString(),

        patientId:
          updatedVisit.patientId.toHexString(),

        serviceDate:
          destinationQueue.serviceDate,

        destinationDepartmentId:
          updatedVisit.departmentId.toHexString(),

        destinationClinicId:
          updatedVisit.clinicId
            ?.toHexString() ??
          null,

        destinationServicePointId:
          updatedVisit.servicePointId
            ?.toHexString() ??
          null,

        destinationProviderId:
          destinationQueue.assignedProviderId
            ?.toHexString() ??
          null,

        destinationCounterId:
          destinationQueue.assignedCounterId
            ?.toHexString() ??
          null,

        transferReason:
          command.input.transferReason,

        occurredAt:
          occurredAt.toISOString(),
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        sourceQueueTokenId:
          source._id.toHexString(),

        destinationQueueTokenId:
          destinationQueue._id.toHexString(),
      },
    );

    await this.dependencies.realtime
      .publish({
        eventType:
          REGISTRATION_QUEUE_REALTIME_EVENTS
            .QUEUE_ENTRY_TRANSFERRED,

        facilityId:
          command.actor.facilityId,

        queueDefinitionId:
          destinationQueue.queueDefinitionId.toHexString(),

        serviceDate:
          destinationQueue.serviceDate,

        payload: {
          sourceQueueEntryId:
            source.queueEntryId,

          sourceTokenLabel:
            source.tokenLabel,

          sourceStatus:
            transferredSource.status,

          destinationQueueEntryId:
            destinationQueue.queueEntryId,

          destinationTokenLabel:
            destinationQueue.tokenLabel,

          destinationStatus:
            destinationQueue.status,

          destinationAssignedProviderId:
            destinationQueue.assignedProviderId
              ?.toHexString() ??
            null,

          destinationAssignedCounterId:
            destinationQueue.assignedCounterId
              ?.toHexString() ??
            null,

          occurredAt:
            occurredAt.toISOString(),
        },
      })
      .then(
        async () => {
          await transaction.checkpoint(
            REGISTRATION_QUEUE_TRANSACTION_STATES
              .REALTIME_PUBLISHED,
            {
              sourceQueueEntryId:
                source.queueEntryId,

              destinationQueueEntryId:
                destinationQueue.queueEntryId,
            },
          );
        },
      )
      .catch(
        () =>
          undefined,
      );

    return toQueueTransferMutationResult({
      sourceQueue:
        transferredSource,

      destinationQueue,

      visit:
        updatedVisit,

      sourceHistory,

      destinationHistory,
    });
  }
}