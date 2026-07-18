import {
  ACTIVE_QUEUE_ENTRY_STATUSES,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  OpdVisitConcurrencyError,
  OpdVisitNotFoundError,
  QueueEntryConcurrencyError,
  QueueEntryNotFoundError,
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
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_REALTIME_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  RegistrationQueueActorContext,
  UpdateQueueAssignmentInput,
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
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

import type {
  QueueTokenMutationRepository,
} from '../repositories/queue-token-mutation.repository.js';

import type {
  QueueMutationContextService,
} from '../services/queue-mutation-context.service.js';

export interface UpdateQueueAssignmentCommand {
  queueEntryId: string;
  input: UpdateQueueAssignmentInput;
  actor: RegistrationQueueActorContext;
  idempotencyKey: string;
}

export class UpdateQueueAssignmentWorkflow {
  public constructor(
    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueMutations:
      QueueTokenMutationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly visitMutations:
      OpdVisitQueueMutationRepository,

    private readonly contexts:
      QueueMutationContextService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: UpdateQueueAssignmentCommand,
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
            .UPDATE_QUEUE_ASSIGNMENT,

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
            'UPDATE_QUEUE_ASSIGNMENT',

          queueEntryId:
            command.queueEntryId,

          providerAssignmentProvided:
            command.input.assignedProviderId !==
            undefined,

          counterAssignmentProvided:
            command.input.assignedCounterId !==
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
    command: UpdateQueueAssignmentCommand,
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

    if (
      !ACTIVE_QUEUE_ENTRY_STATUSES.includes(
        current.status as
          (typeof ACTIVE_QUEUE_ENTRY_STATUSES)[number],
      )
    ) {
      throw new QueueEntryConcurrencyError();
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
          command.input.assignedProviderId,

        requestedCounterId:
          command.input.assignedCounterId,
      });

    const currentProviderId =
      current.assignedProviderId
        ?.toHexString() ??
      null;

    const currentCounterId =
      current.assignedCounterId
        ?.toHexString() ??
      null;

    const visit =
      await this.visits.findById(
        command.actor.facilityId,
        current.opdVisitId.toHexString(),
        true,
      );

    if (visit === null) {
      throw new OpdVisitNotFoundError();
    }

    if (
      currentProviderId ===
        context.assignedProviderId &&
      currentCounterId ===
        context.assignedCounterId
    ) {
      return toQueueEntryMutationResult({
        queueToken:
          current,

        visit,

        history:
          null,
      });
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
        .updateAssignmentWithVersion({
          facilityId:
            command.actor.facilityId,

          queueTokenId:
            current._id.toHexString(),

          expectedVersion:
            current.version,

          assignedProviderId:
            context.assignedProviderId,

          assignedCounterId:
            context.assignedCounterId,

          actorUserId:
            command.actor.userId,

          reason:
            command.input.reason,

          occurredAt,
        });

    if (updatedQueue === null) {
      throw new QueueEntryConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .QUEUE_ASSIGNMENT_UPDATED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),

        assignedProviderId:
          updatedQueue.assignedProviderId
            ?.toHexString() ??
          null,

        assignedCounterId:
          updatedQueue.assignedCounterId
            ?.toHexString() ??
          null,

        version:
          updatedQueue.version,
      },
    );

    const updatedVisit =
      await this.visitMutations
        .updateQueueAssignmentWithVersion({
          facilityId:
            command.actor.facilityId,

          visitId:
            visit._id.toHexString(),

          queueTokenId:
            updatedQueue._id.toHexString(),

          expectedVersion:
            visit.version,

          assignedProviderId:
            context.assignedProviderId,

          assignedCounterId:
            context.assignedCounterId,

          actorUserId:
            command.actor.userId,
        });

    if (updatedVisit === null) {
      throw new OpdVisitConcurrencyError();
    }

    const before =
      queueTokenAuditSnapshot(
        current,
      );

    const after =
      queueTokenAuditSnapshot(
        updatedQueue,
      );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-queue-assignment-updated',
          updatedQueue.queueEntryId,
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .QUEUE_ASSIGNMENT_UPDATED,

      entityType:
        'QueueToken',

      entityId:
        updatedQueue._id.toHexString(),

      ...buildRegistrationQueueAuditActorFields(
        command.actor,
      ),

      occurredAt,

      reason:
        command.input.reason,

      before,

      after,

      metadata: {
        visitBefore:
          opdVisitAuditSnapshot(
            visit,
          ),

        visitAfter:
          opdVisitAuditSnapshot(
            updatedVisit,
          ),

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
          'outbox-queue-assignment-updated',
          updatedQueue.queueEntryId,
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .QUEUE_ASSIGNMENT_UPDATED,

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
            .QUEUE_ASSIGNMENT_UPDATED,

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

          assignedProviderId:
            updatedQueue.assignedProviderId
              ?.toHexString() ??
            null,

          assignedCounterId:
            updatedQueue.assignedCounterId
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

    return toQueueEntryMutationResult({
      queueToken:
        updatedQueue,

      visit:
        updatedVisit,

      history:
        null,
    });
  }
}