import {
  randomBytes,
} from 'node:crypto';

import {
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  InvalidOpdVisitTransitionError,
  InvalidQueueEntryTransitionError,
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
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
  toVisitLifecycleMutationResult,
  type VisitLifecycleMutationResult,
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
  MarkOpdVisitNoShowInput,
  RegistrationQueueActorContext,
} from '../registration-queue.types.js';

import {
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
  QueueTokenMutationRepository,
} from '../repositories/queue-token-mutation.repository.js';

import type {
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

export interface MarkOpdVisitNoShowCommand {
  visitId: string;
  input: MarkOpdVisitNoShowInput;
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

export class MarkOpdVisitNoShowWorkflow {
  public constructor(
    private readonly visits:
      OpdVisitRepository,

    private readonly visitLifecycle:
      OpdVisitLifecycleRepository,

    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueMutations:
      QueueTokenMutationRepository,

    private readonly queueHistory:
      QueueStatusHistoryRepository,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: MarkOpdVisitNoShowCommand,
  ): Promise<VisitLifecycleMutationResult> {
    const preflightVisit =
      await this.visits.findById(
        command.actor.facilityId,
        command.visitId,
        true,
      );

    if (preflightVisit === null) {
      throw new OpdVisitNotFoundError();
    }

    const preflightQueue =
      await this.queueTokens.findActiveByVisitId(
        command.actor.facilityId,
        command.visitId,
      );

    const lockKeys = [
      registrationQueueLockKey(
        REGISTRATION_QUEUE_LOCK_NAMESPACE
          .ACTIVE_VISIT,
        command.actor.facilityId,
        command.visitId,
      ),
    ];

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
            .MARK_OPD_VISIT_NO_SHOW,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys,

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
            'MARK_OPD_VISIT_NO_SHOW',

          visitId:
            command.visitId,

          hasActiveQueueEntry:
            preflightQueue !==
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
    command: MarkOpdVisitNoShowCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<VisitLifecycleMutationResult> {
    const visit =
      await this.visits.findById(
        command.actor.facilityId,
        command.visitId,
        true,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    if (
      visit.version !==
      command.input.expectedVersion
    ) {
      throw new OpdVisitConcurrencyError();
    }

    if (
      ![
        'REGISTERED',
        'CHECKED_IN',
        'QUEUED',
      ].includes(
        visit.status,
      )
    ) {
      throw new InvalidOpdVisitTransitionError(
        visit.status,
        'NO_SHOW',
      );
    }

    const queue =
      await this.queueTokens.findActiveByVisitId(
        command.actor.facilityId,
        visit._id.toHexString(),
      );

    if (
      queue !== null &&
      !QUEUE_ENTRY_TRANSITIONS[
        queue.status
      ].includes(
        'NO_SHOW',
      )
    ) {
      throw new InvalidQueueEntryTransitionError(
        queue.status,
        'NO_SHOW',
      );
    }

    const crypto =
      requireRegistrationQueueSnapshotCrypto(
        this.dependencies,
      );

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

    if (queue !== null) {
      await transaction.registerCompensation({
        key:
          `restore-queue-entry:${queue._id.toHexString()}:v${queue.version + 1}`,

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
              queue._id.toHexString(),

            expectedPostVersion:
              queue.version + 1,

            snapshot:
              queueTokenRestoreSnapshot(
                queue,
              ),
          }),
      });
    }

    const occurredAt =
      this.dependencies.clock.now();

    let updatedQueue = null;
    let history = null;

    if (queue !== null) {
      updatedQueue =
        await this.queueMutations
          .transitionWithVersion({
            facilityId:
              command.actor.facilityId,

            queueTokenId:
              queue._id.toHexString(),

            opdVisitId:
              queue.opdVisitId.toHexString(),

            expectedVersion:
              queue.version,

            fromStatuses: [
              queue.status,
            ],

            status:
              'NO_SHOW',

            assignedProviderId:
              queue.assignedProviderId
                ?.toHexString() ??
              null,

            assignedCounterId:
              queue.assignedCounterId
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

      if (updatedQueue === null) {
        throw new QueueEntryConcurrencyError();
      }

      const sequence =
        await this.queueHistory.nextSequence(
          command.actor.facilityId,
          queue._id.toHexString(),
        );

      history =
        await this.queueHistory.append({
          historyId:
            newObjectIdString(),

          facilityId:
            command.actor.facilityId,

          queueTokenId:
            queue._id.toHexString(),

          queueEntryId:
            queue.queueEntryId,

          opdVisitId:
            queue.opdVisitId.toHexString(),

          patientId:
            queue.patientId.toHexString(),

          sequence,

          fromStatus:
            queue.status,

          toStatus:
            'NO_SHOW',

          queueDefinitionId:
            queue.queueDefinitionId.toHexString(),

          providerId:
            queue.assignedProviderId
              ?.toHexString() ??
            null,

          counterId:
            queue.assignedCounterId
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
          `delete-queue-no-show-history:${history._id.toHexString()}:v${history.version}`,

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
          .QUEUE_STATUS_CHANGED,
        {
          queueTokenId:
            updatedQueue._id.toHexString(),

          fromStatus:
            queue.status,

          toStatus:
            updatedQueue.status,

          version:
            updatedQueue.version,
        },
      );
    }

    const updatedVisit =
      await this.visitLifecycle
        .markNoShowWithVersion({
          facilityId:
            command.actor.facilityId,

          visitId:
            visit._id.toHexString(),

          expectedVersion:
            visit.version,

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

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-opd-visit-no-show',
          updatedVisit._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .OPD_VISIT_NO_SHOW,

      entityType:
        'OpdVisit',

      entityId:
        updatedVisit._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      reason:
        command.input.reason,

      before:
        opdVisitAuditSnapshot(
          visit,
        ),

      after:
        opdVisitAuditSnapshot(
          updatedVisit,
        ),

      metadata: {
        queueBefore:
          queue ===
          null
            ? null
            : queueTokenAuditSnapshot(
                queue,
              ),

        queueAfter:
          updatedQueue ===
          null
            ? null
            : queueTokenAuditSnapshot(
                updatedQueue,
              ),

        idempotencyKey:
          command.idempotencyKey,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        visitId:
          updatedVisit._id.toHexString(),

        queueTokenId:
          updatedQueue?._id.toHexString() ??
          null,
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-opd-visit-no-show',
          updatedVisit._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .OPD_VISIT_STATUS_CHANGED,

      aggregateType:
        'OpdVisit',

      aggregateId:
        updatedVisit._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        visitId:
          updatedVisit._id.toHexString(),

        visitNumber:
          updatedVisit.visitNumber,

        registrationId:
          updatedVisit.registrationId.toHexString(),

        patientId:
          updatedVisit.patientId.toHexString(),

        serviceDate:
          updatedVisit.serviceDate,

        fromStatus:
          visit.status,

        toStatus:
          updatedVisit.status,

        queueEntryId:
          updatedQueue?.queueEntryId ??
          null,

        occurredAt:
          occurredAt.toISOString(),
      },
    });

    if (updatedQueue !== null) {
      await this.dependencies.outbox.enqueue({
        transactionId:
          transaction.transactionId,

        deduplicationKey:
          registrationQueueDeduplicationKey(
            transaction.transactionId,
            'outbox-queue-no-show',
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

          fromStatus:
            queue?.status ??
            null,

          toStatus:
            updatedQueue.status,

          occurredAt:
            occurredAt.toISOString(),
        },
      });
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        visitId:
          updatedVisit._id.toHexString(),

        queueTokenId:
          updatedQueue?._id.toHexString() ??
          null,
      },
    );

    if (updatedQueue !== null) {
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
    }

    return toVisitLifecycleMutationResult({
      registration:
        null,

      visit:
        updatedVisit,

      queue:
        updatedQueue,

      history,
    });
  }
}