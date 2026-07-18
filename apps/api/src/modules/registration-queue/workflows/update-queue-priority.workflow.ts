import {
  ACTIVE_QUEUE_ENTRY_STATUSES,
  REGISTRATION_QUEUE_LOCK_NAMESPACE,
} from '../registration-queue.constants.js';

import {
  QueueEntryConcurrencyError,
  QueueEntryNotFoundError,
} from '../registration-queue.errors.js';

import {
  protectedRegistrationQueueRestorePayload,
  queueTokenRestoreSnapshot,
  requireRegistrationQueueSnapshotCrypto,
} from '../registration-queue.mutation-snapshots.js';

import {
  calculateQueuePriorityScore,
  registrationQueueLockKey,
} from '../registration-queue.normalization.js';

import {
  buildRegistrationQueueAuditActorFields,
  type RegistrationQueueMutationDependencies,
  type RegistrationQueueTransactionContext,
} from '../registration-queue.ports.js';

import {
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
  UpdateQueuePriorityInput,
} from '../registration-queue.types.js';

import {
  assertQueueDefinitionSupportsInput,
  registrationQueueDeduplicationKey,
} from '../registration-queue.workflow-helpers.js';

import {
  toQueueEntryMutationResult,
  type QueueEntryMutationResult,
} from '../queue-workflow.mapper.js';

import type {
  QueueTokenRepository,
} from '../repositories/queue-token.repository.js';

import type {
  QueueTokenMutationRepository,
} from '../repositories/queue-token-mutation.repository.js';

import type {
  QueueMutationContextService,
} from '../services/queue-mutation-context.service.js';

export interface UpdateQueuePriorityCommand {
  queueEntryId: string;
  input: UpdateQueuePriorityInput;
  actor: RegistrationQueueActorContext;
  idempotencyKey: string;
}

export class UpdateQueuePriorityWorkflow {
  public constructor(
    private readonly queueTokens:
      QueueTokenRepository,

    private readonly queueMutations:
      QueueTokenMutationRepository,

    private readonly contexts:
      QueueMutationContextService,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: UpdateQueuePriorityCommand,
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
            .UPDATE_QUEUE_PRIORITY,

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
            'UPDATE_QUEUE_PRIORITY',

          queueEntryId:
            command.queueEntryId,

          priorityClass:
            command.input.priorityClass,

          triagePriority:
            command.input.triagePriority,

          emergencyOverride:
            command.input.emergencyOverride,

          specialCategoryCount:
            command.input.specialCategories.length,
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
    command: UpdateQueuePriorityCommand,
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
      });

    assertQueueDefinitionSupportsInput(
      context.queueDefinition,
      {
        queueDefinitionId:
          current.queueDefinitionId.toHexString(),

        priorityClass:
          command.input.priorityClass,

        triagePriority:
          command.input.triagePriority,

        emergencyOverride:
          command.input.emergencyOverride,

        emergencyOverrideReason:
          command.input.emergencyOverrideReason ??
          null,

        specialCategories:
          command.input.specialCategories,
      },
    );

    const priorityScore =
      calculateQueuePriorityScore({
        priorityClass:
          command.input.priorityClass,

        triagePriority:
          command.input.triagePriority,

        emergencyOverride:
          command.input.emergencyOverride,

        specialCategories:
          command.input.specialCategories,
      });

    const sameCategories =
      current.specialCategories.length ===
        command.input.specialCategories.length &&
      current.specialCategories.every(
        (category) =>
          command.input.specialCategories.includes(
            category,
          ),
      );

    if (
      current.priorityClass ===
        command.input.priorityClass &&
      current.priorityScore ===
        priorityScore &&
      current.triagePriority ===
        command.input.triagePriority &&
      current.emergencyOverride ===
        command.input.emergencyOverride &&
      current.emergencyOverrideReason ===
        (
          command.input
            .emergencyOverrideReason ??
          null
        ) &&
      sameCategories
    ) {
      return toQueueEntryMutationResult({
        queueToken:
          current,

        visit:
          null,

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

    const occurredAt =
      this.dependencies.clock.now();

    const updatedQueue =
      await this.queueMutations
        .updatePriorityWithVersion({
          facilityId:
            command.actor.facilityId,

          queueTokenId:
            current._id.toHexString(),

          expectedVersion:
            current.version,

          priorityClass:
            command.input.priorityClass,

          priorityScore,

          triagePriority:
            command.input.triagePriority,

          emergencyOverride:
            command.input.emergencyOverride,

          emergencyOverrideReason:
            command.input.emergencyOverrideReason ??
            null,

          specialCategories: [
            ...command.input.specialCategories,
          ],

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
        .QUEUE_PRIORITY_UPDATED,
      {
        queueTokenId:
          updatedQueue._id.toHexString(),

        priorityClass:
          updatedQueue.priorityClass,

        priorityScore:
          updatedQueue.priorityScore,

        triagePriority:
          updatedQueue.triagePriority,

        emergencyOverride:
          updatedQueue.emergencyOverride,

        version:
          updatedQueue.version,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-queue-priority-updated',
          updatedQueue.queueEntryId,
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .QUEUE_PRIORITY_UPDATED,

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

      before:
        queueTokenAuditSnapshot(
          current,
        ),

      after:
        queueTokenAuditSnapshot(
          updatedQueue,
        ),

      metadata: {
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
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-queue-priority-updated',
          updatedQueue.queueEntryId,
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .QUEUE_PRIORITY_UPDATED,

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
          updatedQueue.opdVisitId.toHexString(),

        patientId:
          updatedQueue.patientId.toHexString(),

        queueDefinitionId:
          updatedQueue.queueDefinitionId.toHexString(),

        serviceDate:
          updatedQueue.serviceDate,

        priorityClass:
          updatedQueue.priorityClass,

        priorityScore:
          updatedQueue.priorityScore,

        triagePriority:
          updatedQueue.triagePriority,

        emergencyOverride:
          updatedQueue.emergencyOverride,

        specialCategories: [
          ...updatedQueue.specialCategories,
        ],

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
            .QUEUE_PRIORITY_UPDATED,

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

          priorityClass:
            updatedQueue.priorityClass,

          priorityScore:
            updatedQueue.priorityScore,

          triagePriority:
            updatedQueue.triagePriority,

          emergencyOverride:
            updatedQueue.emergencyOverride,

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
        null,

      history:
        null,
    });
  }
}