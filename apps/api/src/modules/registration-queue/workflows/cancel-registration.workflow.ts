import {
  ConflictError,
} from '@hospital-mis/shared';

import {
  RegistrationConcurrencyError,
  RegistrationNotFoundError,
} from '../registration-queue.errors.js';

import {
  protectedRegistrationQueueRestorePayload,
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
  registrationAuditSnapshot,
} from '../registration-queue.projections.js';

import {
  toRegistrationLifecycleProjection,
  type RegistrationLifecycleProjection,
} from '../registration-visit-lifecycle.mapper.js';

import {
  REGISTRATION_QUEUE_AUDIT_ACTIONS,
  REGISTRATION_QUEUE_COMPENSATION_TYPES,
  REGISTRATION_QUEUE_OUTBOX_EVENTS,
  REGISTRATION_QUEUE_TRANSACTION_STATES,
  REGISTRATION_QUEUE_TRANSACTION_TYPES,
} from '../registration-queue.transaction.constants.js';

import type {
  CancelRegistrationInput,
  RegistrationQueueActorContext,
} from '../registration-queue.types.js';

import {
  registrationQueueDeduplicationKey,
} from '../registration-queue.workflow-helpers.js';

import type {
  OpdVisitRepository,
} from '../repositories/opd-visit.repository.js';

import type {
  RegistrationRepository,
} from '../repositories/registration.repository.js';

export interface CancelRegistrationCommand {
  registrationId: string;
  input: CancelRegistrationInput;
  actor: RegistrationQueueActorContext;
  idempotencyKey: string;
}

export class CancelRegistrationWorkflow {
  public constructor(
    private readonly registrations:
      RegistrationRepository,

    private readonly visits:
      OpdVisitRepository,

    private readonly dependencies:
      RegistrationQueueMutationDependencies,
  ) {}

  public async execute(
    command: CancelRegistrationCommand,
  ): Promise<RegistrationLifecycleProjection> {
    const preflight =
      await this.registrations.findById(
        command.actor.facilityId,
        command.registrationId,
        true,
      );

    if (preflight === null) {
      throw new RegistrationNotFoundError();
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          REGISTRATION_QUEUE_TRANSACTION_TYPES
            .CANCEL_REGISTRATION,

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
            'registration-queue:registration',
            command.actor.facilityId,
            command.registrationId,
          ),
        ],

        idempotencyPayload: {
          registrationId:
            command.registrationId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'CANCEL_REGISTRATION',

          registrationId:
            command.registrationId,
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
    command: CancelRegistrationCommand,
    transaction: RegistrationQueueTransactionContext,
  ): Promise<RegistrationLifecycleProjection> {
    const registration =
      await this.registrations.findById(
        command.actor.facilityId,
        command.registrationId,
        true,
      );

    if (registration === null) {
      throw new RegistrationNotFoundError();
    }

    if (
      registration.version !==
      command.input.expectedVersion
    ) {
      throw new RegistrationConcurrencyError();
    }

    if (
      registration.status !==
      'ACTIVE'
    ) {
      throw new ConflictError(
        'Only an active registration can be cancelled',
      );
    }

    const visit =
      await this.visits.findByRegistrationId(
        command.actor.facilityId,
        registration._id.toHexString(),
        true,
      );

    if (
      visit !== null &&
      [
        'REGISTERED',
        'CHECKED_IN',
        'QUEUED',
        'IN_SERVICE',
      ].includes(
        visit.status,
      )
    ) {
      throw new ConflictError(
        'The registration has an active OPD visit; cancel the OPD visit instead',
      );
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

    const occurredAt =
      this.dependencies.clock.now();

    const updated =
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

    if (updated === null) {
      throw new RegistrationConcurrencyError();
    }

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .REGISTRATION_CANCELLED,
      {
        registrationId:
          updated._id.toHexString(),

        status:
          updated.status,

        version:
          updated.version,
      },
    );

    await this.dependencies.audit.append({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'audit-registration-cancelled',
          updated._id.toHexString(),
        ),

      action:
        REGISTRATION_QUEUE_AUDIT_ACTIONS
          .REGISTRATION_CANCELLED,

      entityType:
        'Registration',

      entityId:
        updated._id.toHexString(),

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
          updated,
        ),

      metadata: {
        idempotencyKey:
          command.idempotencyKey,

        linkedVisitId:
          visit?._id.toHexString() ??
          null,

        linkedVisitStatus:
          visit?.status ??
          null,
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .AUDIT_APPENDED,
      {
        registrationId:
          updated._id.toHexString(),
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        transaction.transactionId,

      deduplicationKey:
        registrationQueueDeduplicationKey(
          transaction.transactionId,
          'outbox-registration-cancelled',
          updated._id.toHexString(),
        ),

      eventType:
        REGISTRATION_QUEUE_OUTBOX_EVENTS
          .REGISTRATION_CANCELLED,

      aggregateType:
        'Registration',

      aggregateId:
        updated._id.toHexString(),

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      occurredAt,

      payload: {
        registrationId:
          updated._id.toHexString(),

        registrationNumber:
          updated.registrationNumber,

        patientId:
          updated.patientId.toHexString(),

        serviceDate:
          updated.serviceDate,

        status:
          updated.status,

        occurredAt:
          occurredAt.toISOString(),
      },
    });

    await transaction.checkpoint(
      REGISTRATION_QUEUE_TRANSACTION_STATES
        .OUTBOX_ENQUEUED,
      {
        registrationId:
          updated._id.toHexString(),
      },
    );

    return toRegistrationLifecycleProjection(
      updated,
    );
  }
}