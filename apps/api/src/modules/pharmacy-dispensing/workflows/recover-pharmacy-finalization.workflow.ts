import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationRecord,
  PharmacyDispensationReversalRecord,
  PharmacyPatientReturnRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  pharmacyDeduplicationKey,
  pharmacyLockKey,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

import {
  PharmacyReturnReversalRepository,
} from '../repositories/pharmacy-return-reversal.repository.js';

export type PharmacyRecoverableEntityType =
  | 'DISPENSATION'
  | 'PATIENT_RETURN'
  | 'DISPENSATION_REVERSAL';

export interface RecoverPharmacyFinalizationCommand {
  actor:
    PharmacyDispensingActorContext;

  entityType:
    PharmacyRecoverableEntityType;

  entityId:
    string;

  expectedVersion:
    number;

  recoveryReason:
    string;

  idempotencyKey:
    string;
}

type RecoverableRecord =
  | PharmacyDispensationRecord
  | PharmacyPatientReturnRecord
  | PharmacyDispensationReversalRecord;

export class RecoverPharmacyFinalizationWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly returnsAndReversals:
      PharmacyReturnReversalRepository,
  ) {}

  private async requireRecord(
    command:
      RecoverPharmacyFinalizationCommand,
  ): Promise<RecoverableRecord> {
    switch (command.entityType) {
      case 'DISPENSATION': {
        return this.support.requireDispensation(
          command.actor,
          command.entityId,
        );
      }

      case 'PATIENT_RETURN': {
        const record =
          await this.returnsAndReversals.findReturn(
            command.actor.facilityId,
            command.entityId,
          );

        if (record === null) {
          throw new ResourceNotFoundError(
            'The patient return was not found',
          );
        }

        return record;
      }

      case 'DISPENSATION_REVERSAL': {
        const record =
          await this.returnsAndReversals.findReversal(
            command.actor.facilityId,
            command.entityId,
          );

        if (record === null) {
          throw new ResourceNotFoundError(
            'The dispensing reversal was not found',
          );
        }

        return record;
      }
    }
  }

  public async execute(
    command:
      RecoverPharmacyFinalizationCommand,
  ): Promise<RecoverableRecord> {
    const record =
      await this.requireRecord(command);

    if (
      record.version !==
      command.expectedVersion
    ) {
      throw new ConflictError(
        'The recoverable pharmacy record changed before recovery started',
      );
    }

    if (
      ![
        'RECOVERY_REQUIRED',
        'COMPENSATION_REQUIRED',
      ].includes(
        record.finalizationState,
      )
    ) {
      throw new ConflictError(
        'The pharmacy record is not marked for recovery',
      );
    }

    await this.support.assertAccess({
      actor:
        command.actor,

      action:
        'CONFIGURATION_MANAGE',
    });

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.REVERSE,

      idempotencyKey:
        command.idempotencyKey,

      actorUserId:
        command.actor.userId,

      facilityId:
        command.actor.facilityId,

      correlationId:
        command.actor.correlationId,

      lockKeys: [
        pharmacyLockKey(
          'pharmacy-dispensing:recovery',
          command.actor.facilityId,
          command.entityType,
          command.entityId,
        ),
      ],

      idempotencyPayload: {
        entityType:
          command.entityType,

        entityId:
          command.entityId,

        expectedVersion:
          command.expectedVersion,

        recoveryReason:
          command.recoveryReason,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'RECOVER_PHARMACY_FINALIZATION',
          {
            entityType:
              command.entityType,

            entityId:
              command.entityId,

            previousFinalizationState:
              record.finalizationState,
          },
        ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        let updated:
          RecoverableRecord | null = null;

        if (
          command.entityType ===
          'DISPENSATION'
        ) {
          updated =
            await this.support.dependencies.repository
              .updateDispensation(
                command.actor.facilityId,
                command.entityId,
                command.expectedVersion,
                {
                  $set: {
                    finalizationState:
                      'NOT_STARTED',

                    finalizationUpdatedAt:
                      occurredAt,

                    recoveryReason:
                      command.recoveryReason,

                    lastFailureCode:
                      null,
                  },

                  $inc: {
                    version: 1,
                    finalizationAttemptCount: 1,
                  },
                },

                command.actor.userId,
                transaction.session,
              );
        } else if (
          command.entityType ===
          'PATIENT_RETURN'
        ) {
          updated =
            await this.returnsAndReversals.updateReturn(
              command.actor.facilityId,
              command.entityId,
              command.expectedVersion,
              {
                $set: {
                  finalizationState:
                    'NOT_STARTED',

                  finalizationUpdatedAt:
                    occurredAt,

                  recoveryReason:
                    command.recoveryReason,

                  lastFailureCode:
                    null,
                },

                $inc: {
                  version: 1,
                  finalizationAttemptCount: 1,
                },
              },

              command.actor.userId,
              transaction.session,
            );
        } else {
          updated =
            await this.returnsAndReversals.updateReversal(
              command.actor.facilityId,
              command.entityId,
              command.expectedVersion,
              {
                $set: {
                  finalizationState:
                    'NOT_STARTED',

                  finalizationUpdatedAt:
                    occurredAt,

                  recoveryReason:
                    command.recoveryReason,

                  lastFailureCode:
                    null,
                },

                $inc: {
                  version: 1,
                  finalizationAttemptCount: 1,
                },
              },

              command.actor.userId,
              transaction.session,
            );
        }

        if (updated === null) {
          throw new ConflictError(
            'The pharmacy record changed during recovery preparation',
          );
        }

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,

            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                'pharmacy.finalization.recovery_prepared',
                command.entityId,
              ),

            action:
              'pharmacy.finalization.recovery_prepared',

            entityType:
              command.entityType,

            entityId:
              command.entityId,

            actorUserId:
              command.actor.userId,

            actorStaffId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            reason:
              command.recoveryReason,

            before: {
              finalizationState:
                record.finalizationState,

              version:
                record.version,
            },

            after: {
              finalizationState:
                updated.finalizationState,

              version:
                updated.version,
            },
          },

          transaction.session,
        );

        await this.support.dependencies.outbox.enqueue(
          {
            transactionId:
              transaction.transactionId,

            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                'pharmacy.finalization.recovery_prepared.v1',
                command.entityId,
              ),

            eventType:
              'pharmacy.finalization.recovery_prepared.v1',

            aggregateType:
              command.entityType,

            aggregateId:
              command.entityId,

            actorUserId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            payload: {
              entityType:
                command.entityType,

              entityId:
                command.entityId,

              finalizationState:
                updated.finalizationState,
            },
          },

          transaction.session,
        );

        return updated;
      },
    });
  }
}