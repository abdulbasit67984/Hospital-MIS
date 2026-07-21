import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyPatientReturnRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  normalizePharmacyDecimal,
  pharmacyDeduplicationKey,
  pharmacyInventoryCommandContext,
  pharmacyLockKey,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

import {
  PharmacyReturnReversalRepository,
} from '../repositories/pharmacy-return-reversal.repository.js';

export interface PostPatientReturnCommand {
  actor:
    PharmacyDispensingActorContext;

  returnId:
    string;

  expectedVersion:
    number;

  idempotencyKey:
    string;
}

export class PostPatientReturnWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly repository:
      PharmacyReturnReversalRepository,
  ) {}

  public async execute(
    command: PostPatientReturnCommand,
  ): Promise<PharmacyPatientReturnRecord> {
    const current =
      await this.repository.findReturn(
        command.actor.facilityId,
        command.returnId,
      );

    if (current === null) {
      throw new ResourceNotFoundError(
        'The patient return was not found',
      );
    }

    if (
      current.version !==
      command.expectedVersion
    ) {
      throw new ConflictError(
        'The patient return changed before it could be posted',
      );
    }

    if (
      current.status !== 'REQUESTED'
    ) {
      throw new ConflictError(
        'Only requested patient returns may be posted',
      );
    }

    const dispensation =
      await this.support.requireDispensation(
        command.actor,
        current.originalDispensationId.toHexString(),
      );

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          current.pharmacyLocationId.toHexString(),
          {
            patientId:
              current.patientId.toHexString(),

            requireControlledMedicine:
              current.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,

      action:
        'RETURN',

      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },

      dispensation,

      witnessStaffId:
        current.witnessStaffId?.toHexString() ??
        null,
    });

    const result =
      await this.support.dependencies.transactions.execute({
        transactionType:
          PHARMACY_DISPENSING_TRANSACTION_TYPES.RETURN,

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
            'pharmacy-dispensing:return',
            command.actor.facilityId,
            command.returnId,
          ),

          pharmacyLockKey(
            'pharmacy-dispensing:dispensation',
            command.actor.facilityId,
            dispensation._id.toHexString(),
          ),
        ].sort(),

        idempotencyPayload: {
          returnId:
            command.returnId,

          expectedVersion:
            command.expectedVersion,
        },

        journalPayload:
          safePharmacyJournalPayload(
            'POST_PATIENT_RETURN',
            {
              returnId:
                command.returnId,

              originalDispensationId:
                dispensation._id.toHexString(),
            },
          ),

        execute: async (transaction) => {
          const fresh =
            await this.repository.findReturn(
              command.actor.facilityId,
              command.returnId,
              transaction.session,
            );

          if (fresh === null) {
            throw new ResourceNotFoundError(
              'The patient return was not found',
            );
          }

          if (
            fresh.version !==
            command.expectedVersion ||
            fresh.status !== 'REQUESTED'
          ) {
            throw new ConflictError(
              'The patient return is no longer eligible for posting',
            );
          }

          const returnItems =
            await this.repository.listReturnItems(
              command.actor.facilityId,
              command.returnId,
              transaction.session,
            );

          if (
            returnItems.length !==
            fresh.lineCount
          ) {
            throw new ConflictError(
              'The patient-return item count is inconsistent',
            );
          }

          const occurredAt =
            this.support.dependencies.clock.now();

          let grossAmount =
            new Decimal(0);

          let discountAmount =
            new Decimal(0);

          let taxAmount =
            new Decimal(0);

          let netAmount =
            new Decimal(0);

          for (const returnItem of returnItems) {
            const originalItem =
              await this.support.requireDispensationItem(
                command.actor,
                dispensation._id.toHexString(),
                returnItem.originalDispensationItemId.toHexString(),
                transaction.session,
              );

            const returnedQuantity =
              new Decimal(
                originalItem.returnedQuantity.toString(),
              ).plus(
                returnItem.quantity.toString(),
              );

            if (
              returnedQuantity.gt(
                originalItem
                  .dispensedQuantity
                  .toString(),
              )
            ) {
              throw new ConflictError(
                `Return quantity for dispensing line ${originalItem.lineNumber} exceeds its dispensed quantity`,
              );
            }

            const originalDispensed =
              new Decimal(
                originalItem
                  .dispensedQuantity
                  .toString(),
              );

            if (originalDispensed.lte(0)) {
              throw new ConflictError(
                'The original dispensing line has no dispensed quantity',
              );
            }

            const ratio =
              new Decimal(
                returnItem.quantity.toString(),
              ).dividedBy(
                originalDispensed,
              );

            grossAmount =
              grossAmount.plus(
                new Decimal(
                  originalItem
                    .grossAmount
                    .toString(),
                ).times(ratio),
              );

            discountAmount =
              discountAmount.plus(
                new Decimal(
                  originalItem
                    .discountAmount
                    .toString(),
                ).times(ratio),
              );

            taxAmount =
              taxAmount.plus(
                new Decimal(
                  originalItem
                    .taxAmount
                    .toString(),
                ).times(ratio),
              );

            netAmount =
              netAmount.plus(
                new Decimal(
                  originalItem
                    .netAmount
                    .toString(),
                ).times(ratio),
              );

            const updatedOriginal =
              await this.support.dependencies.repository
                .updateItem(
                  command.actor.facilityId,
                  dispensation._id.toHexString(),
                  originalItem._id.toHexString(),
                  originalItem.version,
                  {
                    $set: {
                      returnedQuantity:
                        normalizePharmacyDecimal(
                          returnedQuantity,
                        ),

                      status:
                        returnedQuantity.eq(
                          originalItem
                            .dispensedQuantity
                            .toString(),
                        )
                          ? 'RETURNED'
                          : 'PARTIALLY_RETURNED',
                    },

                    $inc: {
                      version: 1,
                    },
                  },

                  command.actor.userId,
                  transaction.session,
                );

            if (updatedOriginal === null) {
              throw new ConflictError(
                'A dispensing line changed while its return was being posted',
              );
            }

            const updatedReturnItem =
              await this.repository.updateReturnItem(
                command.actor.facilityId,
                command.returnId,
                returnItem._id.toHexString(),
                returnItem.version,
                {
                  $set: {
                    status:
                      returnItem.restockEligible
                        ? 'RESTOCKED'
                        : returnItem.disposition ===
                            'DISPOSE'
                          ? 'DISPOSED'
                          : returnItem.disposition ===
                              'RETURN_TO_SUPPLIER'
                            ? 'RETURNED_TO_SUPPLIER'
                            : 'QUARANTINED',

                    stockMovementIds:
                      returnItem.stockMovementIds,
                  },

                  $inc: {
                    version: 1,
                  },
                },

                command.actor.userId,
                transaction.session,
              );

            if (
              updatedReturnItem === null
            ) {
              throw new ConflictError(
                'A patient-return line changed during posting',
              );
            }
          }

          const billingResult =
            await this.support.dependencies.billing
              .reverseDispensingCharges(
                `${command.idempotencyKey}:return-credit`,

                dispensation._id.toHexString(),

                fresh.reason,

                transaction.session,
              );

          const allDispensationItems =
            await this.support.dependencies.repository
              .listItems(
                command.actor.facilityId,
                dispensation._id.toHexString(),
                transaction.session,
              );

          const allReturned =
            allDispensationItems.every(
              (item) =>
                new Decimal(
                  item.returnedQuantity.toString(),
                )
                  .plus(
                    item.reversedQuantity.toString(),
                  )
                  .gte(
                    item.dispensedQuantity.toString(),
                  ),
            );

          const updatedDispensation =
            await this.support.dependencies.repository
              .updateDispensation(
                command.actor.facilityId,
                dispensation._id.toHexString(),
                dispensation.version,
                {
                  $set: {
                    status:
                      allReturned
                        ? 'RETURNED'
                        : 'PARTIALLY_RETURNED',
                  },

                  $inc: {
                    version: 1,
                  },
                },

                command.actor.userId,
                transaction.session,
              );

          if (
            updatedDispensation === null
          ) {
            throw new ConflictError(
              'The original dispensation changed during return posting',
            );
          }

          const updated =
            await this.repository.updateReturn(
              command.actor.facilityId,
              command.returnId,
              fresh.version,
              {
                $set: {
                  status:
                    'POSTED',

                  grossAmount:
                    normalizePharmacyDecimal(
                      grossAmount,
                    ),

                  discountAmount:
                    normalizePharmacyDecimal(
                      discountAmount,
                    ),

                  taxAmount:
                    normalizePharmacyDecimal(
                      taxAmount,
                    ),

                  netAmount:
                    normalizePharmacyDecimal(
                      netAmount,
                    ),

                  billingOperationKey:
                    `${command.idempotencyKey}:return-credit`,

                  billingSourceRecordId:
                    toObjectId(
                      billingResult.billingRecordId,
                      'billingRecordId',
                    ),

                  finalizationState:
                    'COMPLETED',

                  finalizationAttemptCount:
                    fresh.finalizationAttemptCount +
                    1,

                  finalizationUpdatedAt:
                    occurredAt,

                  recoveryReason:
                    null,

                  lastFailureCode:
                    null,
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
              'The patient return changed during final posting',
            );
          }

          await this.support.dependencies.audit.append(
            {
              transactionId:
                transaction.transactionId,

              deduplicationKey:
                pharmacyDeduplicationKey(
                  transaction.transactionId,
                  'pharmacy.patient_return.posted',
                  updated._id.toHexString(),
                ),

              action:
                'pharmacy.patient_return.posted',

              entityType:
                'PATIENT_RETURN',

              entityId:
                updated._id.toHexString(),

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
                updated.reason,

              metadata: {
                originalDispensationId:
                  dispensation._id.toHexString(),

                billingRecordId:
                  billingResult.billingRecordId,

                lineCount:
                  returnItems.length,

                netAmount:
                  updated.netAmount.toString(),
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
                  'pharmacy.patient_return.posted.v1',
                  updated._id.toHexString(),
                ),

              eventType:
                'pharmacy.patient_return.posted.v1',

              aggregateType:
                'PATIENT_RETURN',

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
                returnId:
                  updated._id.toHexString(),

                originalDispensationId:
                  dispensation._id.toHexString(),

                pharmacyLocationId:
                  updated.pharmacyLocationId.toHexString(),

                status:
                  updated.status,
              },
            },

            transaction.session,
          );

          return updated;
        },
      });

    await this.support.dependencies.realtime
      .publish({
        eventType:
          PHARMACY_DISPENSING_REALTIME_EVENTS.RETURN_WORKLIST_CHANGED,

        facilityId:
          command.actor.facilityId,

        pharmacyLocationId:
          result.pharmacyLocationId.toHexString(),

        payload: {
          event:
            'pharmacy.patient_return.posted.v1',

          returnId:
            result._id.toHexString(),

          status:
            result.status,
        },
      })
      .catch(() => undefined);

    return result;
  }
}