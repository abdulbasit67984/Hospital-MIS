import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CreateDispensationReversalInput,
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationReversalRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
  PHARMACY_REVERSAL_NUMBER_SEQUENCE_NAMESPACE,
} from '../pharmacy-dispensing.constants.js';

import {
  dispensationMutationLockKeys,
  pharmacyDeduplicationKey,
  pharmacyOperationKey,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

function formatReversalNumber(
  occurredAt: Date,
  sequence: number,
): string {
  return [
    'DREV',
    occurredAt.getUTCFullYear(),
    String(sequence).padStart(8, '0'),
  ].join('-');
}

export interface RequestDispensationReversalCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: CreateDispensationReversalInput;
  idempotencyKey: string;
}

export class RequestDispensationReversalWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
  ) {}

  public async execute(
    command: RequestDispensationReversalCommand,
  ): Promise<PharmacyDispensationReversalRecord> {
    const dispensation =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    this.support.assertExpectedVersion(
      dispensation,
      command.input.expectedDispensationVersion,
    );

    if (
      ![
        'PARTIALLY_DISPENSED',
        'COMPLETED',
        'PARTIALLY_RETURNED',
      ].includes(
        dispensation.status,
      )
    ) {
      throw new ConflictError(
        'Only a completed or partially completed dispensation can be reversed',
      );
    }

    if (
      dispensation.controlledMedicine &&
      command.input.witnessStaffId == null
    ) {
      throw new ConflictError(
        'Controlled-medicine reversal requires a witness',
      );
    }

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          dispensation.pharmacyLocationId.toHexString(),
          {
            patientId:
              dispensation.patientId.toHexString(),

            requireControlledMedicine:
              dispensation.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,

      action:
        'REVERSAL',

      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },

      dispensation,

      witnessStaffId:
        command.input.witnessStaffId,
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

      lockKeys:
        dispensationMutationLockKeys(
          command.actor.facilityId,
          dispensation,
        ),

      idempotencyPayload: {
        dispensationId:
          command.dispensationId,

        input:
          command.input,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'REQUEST_DISPENSATION_REVERSAL',
          {
            dispensationId:
              command.dispensationId,

            controlledMedicine:
              dispensation.controlledMedicine,
          },
        ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const items =
          await this.support.dependencies.repository
            .listItems(
              command.actor.facilityId,
              command.dispensationId,
              transaction.session,
            );

        const selected =
          command.input.dispensationItemIds ===
          undefined
            ? items.filter(
                (item) =>
                  [
                    'DISPENSED',
                    'PARTIALLY_DISPENSED',
                  ].includes(
                    item.status,
                  ),
              )
            : items.filter(
                (item) =>
                  command.input
                    .dispensationItemIds!
                    .includes(
                      item._id.toHexString(),
                    ),
              );

        if (selected.length === 0) {
          throw new ConflictError(
            'The reversal contains no eligible dispensing lines',
          );
        }

        const sequence =
          await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            PHARMACY_REVERSAL_NUMBER_SEQUENCE_NAMESPACE,
          );

        const created =
          await this.support.dependencies.repository
            .createReversal(
              {
                facilityId:
                  toObjectId(
                    command.actor.facilityId,
                    'facilityId',
                  ),

                transactionId:
                  transaction.transactionId,

                correlationId:
                  command.actor.correlationId,

                schemaVersion: 1,
                version: 0,

                createdBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),

                updatedBy:
                  toObjectId(
                    command.actor.userId,
                    'actorUserId',
                  ),

                reversalNumber:
                  formatReversalNumber(
                    occurredAt,
                    sequence.value,
                  ),

                operationKey:
                  pharmacyOperationKey(
                    command.actor.facilityId,
                    'reversal',
                    command.idempotencyKey,
                  ),

                originalDispensationId:
                  dispensation._id,

                patientId:
                  dispensation.patientId,

                pharmacyLocationId:
                  dispensation.pharmacyLocationId,

                status:
                  'REQUESTED',

                lineCount:
                  selected.length,

                controlledMedicine:
                  dispensation.controlledMedicine,

                witnessRequired:
                  dispensation.controlledMedicine,

                witnessStaffId:
                  command.input.witnessStaffId ==
                  null
                    ? null
                    : toObjectId(
                        command.input.witnessStaffId,
                        'witnessStaffId',
                      ),

                requestedByStaffId:
                  toObjectId(
                    operational.actor.staffId,
                    'requestedByStaffId',
                  ),

                requestedAt:
                  occurredAt,

                reason:
                  command.input.reason,

                currency:
                  dispensation.currency,

                grossAmount:
                  dispensation.grossAmount,

                discountAmount:
                  dispensation.discountAmount,

                taxAmount:
                  dispensation.taxAmount,

                netAmount:
                  dispensation.netAmount,

                finalizationState:
                  'NOT_STARTED',
              },

              transaction.session,
            );

        const updated =
          await this.support.dependencies.repository
            .updateDispensation(
              command.actor.facilityId,
              command.dispensationId,
              dispensation.version,
              {
                $set: {
                  status:
                    'REVERSAL_PENDING',
                },

                $inc: {
                  version: 1,
                },
              },

              command.actor.userId,
              transaction.session,
            );

        if (updated === null) {
          throw new ConflictError(
            'The dispensation changed while its reversal was being requested',
          );
        }

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,

            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                'pharmacy.dispensation_reversal.requested',
                created._id.toHexString(),
              ),

            action:
              'pharmacy.dispensation_reversal.requested',

            entityType:
              'DISPENSATION_REVERSAL',

            entityId:
              created._id.toHexString(),

            actorUserId:
              command.actor.userId,

            actorStaffId:
              operational.actor.staffId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            reason:
              command.input.reason,

            metadata: {
              dispensationId:
                dispensation._id.toHexString(),

              lineCount:
                selected.length,

              controlledMedicine:
                dispensation.controlledMedicine,
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
                'pharmacy.dispensation_reversal.requested.v1',
                created._id.toHexString(),
              ),

            eventType:
              'pharmacy.dispensation_reversal.requested.v1',

            aggregateType:
              'DISPENSATION_REVERSAL',

            aggregateId:
              created._id.toHexString(),

            actorUserId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            payload: {
              reversalId:
                created._id.toHexString(),

              dispensationId:
                dispensation._id.toHexString(),

              pharmacyLocationId:
                dispensation.pharmacyLocationId.toHexString(),

              status:
                created.status,
            },
          },

          transaction.session,
        );

        return created;
      },
    });
  }
}