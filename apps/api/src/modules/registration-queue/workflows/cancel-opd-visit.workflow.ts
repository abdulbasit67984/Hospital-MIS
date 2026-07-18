import {
  randomBytes,
} from 'node:crypto';

import {
  QUEUE_ENTRY_TRANSITIONS,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
  RegistrationConcurrencyError,
  RegistrationNotFoundError,
  VisitCancellationConflictError,
} from '../registration-queue.errors.js';

import {
  opdVisitQueueRestoreSnapshot,
  protectedRegistrationQueueRestorePayload,
  queueTokenRestoreSnapshot,
  registrationRestoreSnapshot,
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
  registrationAuditSnapshot,
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
  CancelOpdVisitInput,
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

import type {
  RegistrationRepository,
} from '../repositories/registration.repository.js';

export interface CancelOpdVisitCommand {
  visitId: string;
  input: CancelOpdVisitInput;
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

export class CancelOpdVisitWorkflow {
  public constructor(
    private readonly registrations:
      RegistrationRepository,

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
    command: CancelOpdVisitCommand,
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

      registrationQueueLockKey(
        'registration-queue:registration',
        command.actor.facilityId,
        preflightVisit.registrationId.toHexString(),
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
            .CANCEL_OPD_VISIT,

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
            'CANCEL_OPD_VISIT',

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
    command: CancelOpdVisitCommand,
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
        'IN_SERVICE',
      ].includes(
        visit.status,
      )
    ) {
      throw new VisitCancellationConflictError();
    }

    const registration =
      await this.registrations.findById(
        command.actor.facilityId,
        visit.registrationId.toHexString(),
        true,
      );

    if (registration === null) {
      throw new RegistrationNotFoundError();
    }

    if (
      registration.status !==
      'ACTIVE'
    ) {
      throw new VisitCancellationConflictError();
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
        'CANCELLED',
      )
    ) {
      throw new VisitCancellationConflictError();
    }

    const crypto =
      requireRegistrationQueueSnapshotCrypto(
        this.dependencies,
      );

    await transaction.registerCompensation({
      key:
        `restore-registration:${registration._id.toHexString()}:v${registration.version + 1}`,

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
            registration._id.toHexString(),

          expectedPostVersion:
            registration.version + 1,

          snapshot:
            registrationRestoreSnapshot(
              registration,
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
              'CANCELLED',

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
            'CANCELLED',

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
          `delete-queue-cancellation-history:${history._id.toHexString()}:v${history.version}`,

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
        .cancelWithVersion({
          facilityId:
            command.actor.facilityId,

          visitId:
            visit._id.toHexString(),

          expectedVersion:
            visit.version,

          reason:
            command.input.reason,

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

    const updatedRegistration =
      await this.registrations.cancelWithVersion({
        facilityId:
          command.actor.facilityId,

        registrationId:
          registration._id.toHexString(),

        expectedVersion:
          registration.version,

        cancelledAt:
          occurredAt,

        cancelledBy:
          command.actor.userId,

        reason:
          command.input.reason,
      });

    if (updatedRegistration === null) {
      throw new RegistrationConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .REGISTRATION_CANCELLED,
      {
        registrationId:
          updatedRegistration._id.toHexString(),

        status:
          updatedRegistration.status,

        version:
          updatedRegistration.version,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-opd-visit-cancelled',
          updatedVisit._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .OPD_VISIT_CANCELLED,

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
        registrationBefore:
          registrationAuditSnapshot(
            registration,
          ),

        registrationAfter:
          registrationAuditSnapshot(
            updatedRegistration,
          ),

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

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-registration-cancelled',
          updatedRegistration._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .REGISTRATION_CANCELLED,

      entityType:
        'Registration',

      entityId:
        updatedRegistration._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      reason:
        command.input.reason,

      before:
        registrationAuditSnapshot(
          registration,
        ),

      after:
        registrationAuditSnapshot(
          updatedRegistration,
        ),

      metadata: {
        visitId:
          updatedVisit._id.toHexString(),

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

        registrationId:
          updatedRegistration._id.toHexString(),

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
          'outbox-opd-visit-cancelled',
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
          updatedRegistration._id.toHexString(),

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

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-registration-cancelled',
          updatedRegistration._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .REGISTRATION_CANCELLED,

      aggregateType:
        'Registration',

      aggregateId:
        updatedRegistration._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        registrationId:
          updatedRegistration._id.toHexString(),

        registrationNumber:
          updatedRegistration.registrationNumber,

        visitId:
          updatedVisit._id.toHexString(),

        patientId:
          updatedRegistration.patientId.toHexString(),

        serviceDate:
          updatedRegistration.serviceDate,

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
            'outbox-queue-cancelled',
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

        registrationId:
          updatedRegistration._id.toHexString(),

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
        updatedRegistration,

      visit:
        updatedVisit,

      queue:
        updatedQueue,

      history,
    });
  }
}