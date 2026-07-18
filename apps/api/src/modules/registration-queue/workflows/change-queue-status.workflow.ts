import {
  randomBytes,
} from 'node:crypto';

import {
  ACTIVE_QUEUE_ENTRY_STATUSES,
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  InvalidQueueEntryTransitionError,
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
  QueueEntryNotFoundError,
  QueueRecallLimitExceededError,
} from '../registration-queue.errors.js';

import {
  opdVisitQueueRestoreSnapshot,
  protectedRegistrationQueueRestorePayload,
  queueTokenRestoreSnapshot,
  requireRegistrationQueueSnapshotCrypto,
} from '../registration-queue.mutation-snapshots.js';

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
  registrationQueueLockKey,
} from '../registration-queue.normalization.js';

import {
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_REALTIME_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  ChangeQueueStatusInput,
  RegistrationQueueActorContext,
} from '../registration-queue.types.js';

import {
  registrationQueueDeduplicationKey,
} from '../registration-queue.workflow-helpers.js';

import {
  toQueueEntryMutationResult,
  type QueueEntryMutationResult,
} from '../queue-workflow.mapper.js';

import type {
  OpdVisitRepository,
} from '../repositories/opd-visit.repository.js';

import type {
  OpdVisitQueueMutationRepository,
} from '../repositories/opd-visit-queue-mutation.repository.js';

import type {
  QueueStatusHistoryRepository,
} from '../repositories/queue-status-history.repository.js';

import type {
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

import type {
  QueueTokenMutationRepository,
} from '../repositories/queue-token-mutation.repository.js';

import type {
  QueueMutationContextService,
} from '../services/queue-mutation-context.service.js';

export interface ChangeQueueStatusCommand {
  queueEntryId: string;
  input: ChangeQueueStatusInput;
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

export class ChangeQueueStatusWorkflow {
  public constructor(
    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueMutations:
      QueueTokenMutationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly visitMutations:
      OpdVisitQueueMutationRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly contexts:
      QueueMutationContextService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: ChangeQueueStatusCommand,
  ): Promise<QueueEntryMutationResult> {
    const preflight =
      await this.queueTokens.findByEntryId(
        command.actor.facilityId,
        command.queueEntryId,
        true,
      );

    if (preflight === null) {
      throw new QueueEntryNotFoundError();
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          REGISTRATION_QUEUE_TRANSACTION_TYPES
            .CHANGE_QUEUE_STATUS,

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
              .QUEUE_ENTRY,
            command.actor.facilityId,
            preflight._id.toHexString(),
          ),

          registrationQueueLockKey(
            REGISTRATION_QUEUE_LOCK_NAMESPACE
              .ACTIVE_VISIT,
            command.actor.facilityId,
            preflight.opdVisitId.toHexString(),
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
            'CHANGE_QUEUE_STATUS',

          queueEntryId:
            command.queueEntryId,

          targetStatus:
            command.input.status,

          changeSource:
            command.input.changeSource,

          hasCounterAssignment:
            command.input.counterId !==
            undefined,

          hasProviderAssignment:
            command.input.providerId !==
            undefined,
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
    command: ChangeQueueStatusCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<QueueEntryMutationResult> {
    const current =
      await this.queueTokens.findByEntryId(
        command.actor.facilityId,
        command.queueEntryId,
        true,
      );

    if (current === null) {
      throw new QueueEntryNotFoundError();
    }

    if (
      current.version !==
      command.input.expectedVersion
    ) {
      throw new QueueEntryConcurrencyError();
    }

    const allowed =
      QUEUE_ENTRY_TRANSITIONS[
        current.status
      ];

    if (
      !allowed.includes(
        command.input.status,
      )
    ) {
      throw new InvalidQueueEntryTransitionError(
        current.status,
        command.input.status,
      );
    }

    const context =
      await this.contexts.resolve({
        facilityId:
          command.actor.facilityId,

        queueDefinitionId:
          current.queueDefinitionId.toHexString(),

        currentProviderId:
          current.assignedProviderId
            ?.toHexString() ??
          null,

        currentCounterId:
          current.assignedCounterId
            ?.toHexString() ??
          null,

        requestedProviderId:
          command.input.providerId,

        requestedCounterId:
          command.input.counterId,
      });

    const recalling =
      current.status ===
        'SKIPPED' &&
      (
        command.input.status ===
          'WAITING' ||
        command.input.status ===
          'CALLED'
      );

    if (
      recalling &&
      current.recallCount >=
        context.queueDefinition
          .maximumRecallCount
    ) {
      throw new QueueRecallLimitExceededError();
    }

    const visit =
      await this.visits.findById(
        command.actor.facilityId,
        current.opdVisitId.toHexString(),
        true,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    const crypto =
      requireRegistrationQueueSnapshotCrypto(
        this.dependencies,
      );

    await transaction.registerCompensation({
      key:
        `restore-queue-entry:${current._id.toHexString()}:v${current.version + 1}`,

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
            current._id.toHexString(),

          expectedPostVersion:
            current.version + 1,

          snapshot:
            queueTokenRestoreSnapshot(
              current,
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

    const updatedQueue =
      await this.queueMutations
        .transitionWithVersion({
          facilityId:
            command.actor.facilityId,

          queueTokenId:
            current._id.toHexString(),

          opdVisitId:
            current.opdVisitId.toHexString(),

          expectedVersion:
            current.version,

          fromStatuses: [
            current.status,
          ],

          status:
            command.input.status,

          assignedProviderId:
            context.assignedProviderId,

          assignedCounterId:
            context.assignedCounterId,

          occurredAt,

          actorUserId:
            command.actor.userId,

          reason:
            command.input.reason ??
            null,

          incrementSkip:
            command.input.status ===
            'SKIPPED',

          incrementRecall:
            recalling,
        });

    if (updatedQueue === null) {
      throw new QueueEntryConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .QUEUE_STATUS_CHANGED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),

        queueEntryId:
          updatedQueue.queueEntryId,

        fromStatus:
          current.status,

        toStatus:
          updatedQueue.status,

        version:
          updatedQueue.version,
      },
    );

    const updatedVisit =
      await this.visitMutations
        .applyQueueStatusWithVersion({
          facilityId:
            command.actor.facilityId,

          visitId:
            visit._id.toHexString(),

          queueTokenId:
            updatedQueue._id.toHexString(),

          expectedVersion:
            visit.version,

          queueStatus:
            updatedQueue.status,

          assignedProviderId:
            context.assignedProviderId,

          assignedCounterId:
            context.assignedCounterId,

          existingActiveVisitKey:
            visit.activeVisitKey,

          existingCheckedInAt:
            visit.checkedInAt,

          existingQueuedAt:
            visit.queuedAt,

          existingServiceStartedAt:
            visit.serviceStartedAt,

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

        version:
          updatedVisit.version,
      },
    );

    const sequence =
      await this.queueHistory.nextSequence(
        command.actor.facilityId,
        updatedQueue._id.toHexString(),
      );

    const history =
      await this.queueHistory.append({
        historyId:
          newObjectIdString(),

        facilityId:
          command.actor.facilityId,

        queueTokenId:
          updatedQueue._id.toHexString(),

        queueEntryId:
          updatedQueue.queueEntryId,

        opdVisitId:
          updatedQueue.opdVisitId.toHexString(),

        patientId:
          updatedQueue.patientId.toHexString(),

        sequence,

        fromStatus:
          current.status,

        toStatus:
          updatedQueue.status,

        queueDefinitionId:
          updatedQueue.queueDefinitionId.toHexString(),

        providerId:
          updatedQueue.assignedProviderId
            ?.toHexString() ??
          null,

        counterId:
          updatedQueue.assignedCounterId
            ?.toHexString() ??
          null,

        changeSource:
          command.input.changeSource,

        reason:
          command.input.reason ??
          null,

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
        `delete-queue-history:${history._id.toHexString()}:v${history.version}`,

      type:
        REGISTRATION_QUEUE_COMPENSATION_TYPES
          .DELETE_QUEUE_HISTORY,

      payload: {
        entityId:
          history._id.toHexString(),

        expectedVersion:
          history.version,

        transactionId:
          transaction.transactionId,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .QUEUE_HISTORY_APPENDED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),

        sequence:
          history.sequence,

        status:
          history.toStatus,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-queue-status-changed',
          updatedQueue.queueEntryId,
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .QUEUE_STATUS_CHANGED,

      entityType:
        'QueueToken',

      entityId:
        updatedQueue._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      ...(command.input.reason ===
      undefined ||
      command.input.reason ===
      null
        ? {}
        : {
            reason:
              command.input.reason,
          }),

      before:
        queueTokenAuditSnapshot(
          current,
        ),

      after:
        queueTokenAuditSnapshot(
          updatedQueue,
        ),

      metadata: {
        visitBefore:
          opdVisitAuditSnapshot(
            visit,
          ),

        visitAfter:
          opdVisitAuditSnapshot(
            updatedVisit,
          ),

        historySequence:
          history.sequence,

        idempotencyKey:
          command.idempotencyKey,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),

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
          'outbox-queue-status-changed',
          updatedQueue.queueEntryId,
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .QUEUE_STATUS_CHANGED,

      aggregateType:
        'QueueToken',

      aggregateId:
        updatedQueue._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        queueTokenId:
          updatedQueue._id.toHexString(),

        queueEntryId:
          updatedQueue.queueEntryId,

        visitId:
          updatedVisit._id.toHexString(),

        patientId:
          updatedQueue.patientId.toHexString(),

        queueDefinitionId:
          updatedQueue.queueDefinitionId.toHexString(),

        serviceDate:
          updatedQueue.serviceDate,

        tokenLabel:
          updatedQueue.tokenLabel,

        fromStatus:
          current.status,

        toStatus:
          updatedQueue.status,

        assignedProviderId:
          updatedQueue.assignedProviderId
            ?.toHexString() ??
          null,

        assignedCounterId:
          updatedQueue.assignedCounterId
            ?.toHexString() ??
          null,

        occurredAt:
          occurredAt.toISOString(),
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),
      },
    );

    await this.dependencies.realtime
      .publish({
        eventType:
          REGISTRATION_QUEUE_REALTIME_EVENTS
            .QUEUE_STATUS_CHANGED,

        facilityId:
          command.actor.facilityId,

        queueDefinitionId:
          updatedQueue.queueDefinitionId.toHexString(),

        serviceDate:
          updatedQueue.serviceDate,

        payload: {
          queueEntryId:
            updatedQueue.queueEntryId,

          tokenLabel:
            updatedQueue.tokenLabel,

          status:
            updatedQueue.status,

          assignedCounterId:
            updatedQueue.assignedCounterId
              ?.toHexString() ??
            null,

          assignedProviderId:
            updatedQueue.assignedProviderId
              ?.toHexString() ??
            null,

          calledAt:
            updatedQueue.calledAt
              ?.toISOString() ??
            null,

          servingAt:
            updatedQueue.servingAt
              ?.toISOString() ??
            null,

          lastStatusChangedAt:
            updatedQueue.lastStatusChangedAt.toISOString(),
        },
      })
      .then(
        async () => {
          await transaction.checkpoint(
            REGISTRATION_QUEUE_TRANSACTION_STATES
              .REALTIME_PUBLISHED,
            {
              queueEntryId:
                updatedQueue.queueEntryId,
            },
          );
        },
      )
      .catch(
        () =>
          undefined,
      );

    return toQueueEntryMutationResult({
      queueToken:
        updatedQueue,

      visit:
        updatedVisit,

      history,
    });
  }
}