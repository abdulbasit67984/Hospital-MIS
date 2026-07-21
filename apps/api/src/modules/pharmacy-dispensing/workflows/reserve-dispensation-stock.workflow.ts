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
  ReserveDispensationStockInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_EVENT_TYPES,
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  PHARMACY_DISPENSING_AUDIT_ACTIONS,
  PHARMACY_DISPENSING_OUTBOX_EVENTS,
} from '../pharmacy-dispensing.transaction.constants.js';

import {
  dispensationMutationLockKeys,
  dispensationSnapshot,
  normalizePharmacyDecimal,
  pharmacyDeduplicationKey,
  pharmacyInventoryCommandContext,
  pharmacySnapshotHash,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

export interface ReserveDispensationStockCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: ReserveDispensationStockInput;
  idempotencyKey: string;
}

export class ReserveDispensationStockWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
  ) {}

  public async execute(
    command: ReserveDispensationStockCommand,
  ): Promise<PharmacyDispensationRecord> {
    const current =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
    );

    if (current.status !== 'VERIFIED') {
      throw new ConflictError(
        'Stock can only be reserved for a verified dispensation',
      );
    }

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          current.pharmacyLocationId.toHexString(),
          {
            patientId:
              current.patientId.toHexString(),
            admissionId:
              current.admissionId?.toHexString() ??
              null,
            wardId:
              current.wardId?.toHexString() ??
              null,
            requireControlledMedicine:
              current.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,
      action:
        current.controlledMedicine
          ? 'CONTROLLED_DISPENSE'
          : 'DISPENSE',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation:
        current,
    });

    const result =
      await this.support.dependencies.transactions.execute({
        transactionType:
          PHARMACY_DISPENSING_TRANSACTION_TYPES.RESERVE,
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
            current,
          ),
        idempotencyPayload: {
          dispensationId:
            command.dispensationId,
          input:
            command.input,
        },
        journalPayload:
          safePharmacyJournalPayload(
            'RESERVE_DISPENSATION_STOCK',
            {
              dispensationId:
                command.dispensationId,
              itemCount:
                command.input.items.length,
            },
          ),
        execute: async (transaction) => {
          const fresh =
            await this.support.requireDispensation(
              command.actor,
              command.dispensationId,
              transaction.session,
            );

          this.support.assertExpectedVersion(
            fresh,
            command.input.expectedVersion,
          );

          if (fresh.status !== 'VERIFIED') {
            throw new ConflictError(
              'The dispensation is no longer eligible for reservation',
            );
          }

          const items =
            await this.support.dependencies.repository
              .listItems(
                command.actor.facilityId,
                command.dispensationId,
                transaction.session,
              );

          const requestedByItem =
            new Map(
              command.input.items.map(
                (item) => [
                  item.dispensationItemId,
                  item.requestedQuantity,
                ],
              ),
            );

          const selected =
            items.filter(
              (item) =>
                requestedByItem.has(
                  item._id.toHexString(),
                ),
            );

          if (
            selected.length !==
            requestedByItem.size
          ) {
            throw new ResourceNotFoundError(
              'One or more dispensing lines were not found',
            );
          }

          for (const item of selected) {
            if (
              item.status !== 'VERIFIED' ||
              item.blockingAlertCount > 0
            ) {
              throw new ConflictError(
                `Dispensing line ${item.lineNumber} is not eligible for stock reservation`,
              );
            }
          }

          const reservationLines = [];

          for (const item of selected) {
            const inventoryItemId =
              item.actualInventoryItemId ??
              (
                await this.support.dependencies
                  .prescriptions
                  .findInventoryItemForFormulary(
                    command.actor.facilityId,
                    (
                      item.actualFormularyItemId ??
                      item.prescribedFormularyItemId
                    ).toHexString(),
                    transaction.session,
                  )
              )?._id ??
              null;

            if (inventoryItemId === null) {
              throw new ResourceNotFoundError(
                `Dispensing line ${item.lineNumber} has no active inventory mapping`,
              );
            }

            const inventoryItem =
              await this.support.dependencies.inventoryQueries
                .findInventoryItem(
                  command.actor.facilityId,
                  inventoryItemId.toHexString(),
                );

            if (
              inventoryItem === null ||
              inventoryItem.status !== 'ACTIVE'
            ) {
              throw new ResourceNotFoundError(
                `Inventory item for dispensing line ${item.lineNumber} is unavailable`,
              );
            }

            const requestedQuantity =
              requestedByItem.get(
                item._id.toHexString(),
              )!;

            if (
              new Decimal(requestedQuantity).gt(
                item.approvedQuantity.toString(),
              )
            ) {
              throw new ConflictError(
                `Reservation quantity for line ${item.lineNumber} exceeds the pharmacist-approved quantity`,
              );
            }

            const stockQuantity =
              this.support.dependencies.inventory
                .unitConversion
                .toStockUnit(
                  inventoryItem,
                  requestedQuantity,
                  item.prescribedQuantityUnitId.toHexString(),
                );

            reservationLines.push({
              item,
              inventoryItem,
              requestedQuantity:
                normalizePharmacyDecimal(
                  requestedQuantity,
                ),
              stockQuantity:
                normalizePharmacyDecimal(
                  stockQuantity,
                ),
            });
          }

          const occurredAt =
            this.support.dependencies.clock.now();

          const reservation =
            await this.support.dependencies.inventory
              .reserveForDispensing(
                pharmacyInventoryCommandContext(
                  command.actor,
                  `${command.idempotencyKey}:inventory-reservation`,
                ),
                {
                  sourceType:
                    'DISPENSATION',
                  sourceId:
                    command.dispensationId,
                  sourceLineId:
                    null,
                  locationId:
                    fresh.sourceStockLocationId.toHexString(),
                  patientId:
                    fresh.patientId.toHexString(),
                  expiresAt:
                    new Date(
                      occurredAt.getTime() +
                        (
                          command.input
                            .reservationMinutes ??
                          30
                        ) *
                          60 *
                          1_000,
                    ).toISOString(),
                  lines:
                    reservationLines.map(
                      (line) => ({
                        itemId:
                          line.inventoryItem._id.toHexString(),
                        requestedStockQuantity:
                          line.stockQuantity,
                      }),
                    ),
                },
                transaction.session,
              );

          if (
            reservation.items.length !==
            reservationLines.length
          ) {
            throw new ConflictError(
              'The inventory reservation result does not match the requested dispensing lines',
            );
          }

          let fullyReserved = 0;

          for (
            let index = 0;
            index < reservationLines.length;
            index += 1
          ) {
            const requested =
              reservationLines[index];
            const reserved =
              reservation.items[index];

            if (
              requested === undefined ||
              reserved === undefined
            ) {
              throw new ConflictError(
                'The inventory reservation result is incomplete',
              );
            }

            if (
              reserved.itemId.toHexString() !==
              requested.inventoryItem._id.toHexString()
            ) {
              throw new ConflictError(
                'The inventory reservation returned lines in an unexpected order',
              );
            }

            const reservedPrescriptionQuantity =
              this.support.dependencies.inventory
                .unitConversion
                .fromStockUnit(
                  requested.inventoryItem,
                  reserved.reservedStockQuantity.toString(),
                  requested.item.prescribedQuantityUnitId.toHexString(),
                );

            const complete =
              new Decimal(
                reservedPrescriptionQuantity,
              ).eq(
                requested.requestedQuantity,
              );

            if (complete) {
              fullyReserved += 1;
            }

            const updatedItem =
              await this.support.dependencies.repository
                .updateItem(
                  command.actor.facilityId,
                  command.dispensationId,
                  requested.item._id.toHexString(),
                  requested.item.version,
                  {
                    $set: {
                      reservedQuantity:
                        normalizePharmacyDecimal(
                          reservedPrescriptionQuantity,
                        ),
                      status:
                        complete
                          ? 'RESERVED'
                          : 'PARTIALLY_RESERVED',
                      allocations:
                        reserved.allocations.map(
                          (allocation) => ({
                            _id:
                              allocation._id,
                            stockReservationItemId:
                              reserved._id,
                            stockReservationAllocationId:
                              allocation._id,
                            inventoryBatchId:
                              allocation.batchId,
                            batchNumberSnapshot:
                              null,
                            expiryDateSnapshot:
                              null,
                            stockUnitId:
                              reserved.stockUnitId,
                            reservedStockQuantity:
                              allocation.reservedStockQuantity,
                            consumedStockQuantity:
                              allocation.consumedStockQuantity,
                            releasedStockQuantity:
                              allocation.releasedStockQuantity,
                            returnedStockQuantity:
                              '0',
                            status:
                              'RESERVED',
                            stockMovementIds:
                              [],
                            reversalStockMovementIds:
                              [],
                          }),
                        ),
                    },
                    $inc: {
                      version: 1,
                    },
                  },
                  command.actor.userId,
                  transaction.session,
                );

            if (updatedItem === null) {
              throw new ConflictError(
                'A dispensing line changed while its inventory was being reserved',
              );
            }
          }

          const nextStatus =
            fullyReserved ===
            reservationLines.length
              ? 'RESERVED'
              : 'PARTIALLY_RESERVED';

          const updated =
            await this.support.dependencies.repository
              .updateDispensation(
                command.actor.facilityId,
                command.dispensationId,
                fresh.version,
                {
                  $set: {
                    stockReservationId:
                      reservation.reservation._id,
                    status:
                      nextStatus,
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
              'The dispensation changed while stock was being reserved',
            );
          }

          await this.support.dependencies.repository
            .appendStatusHistory(
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
                dispensationId:
                  updated._id,
                dispensationItemId:
                  null,
                patientId:
                  updated.patientId,
                sequence:
                  updated.version,
                fromStatus:
                  fresh.status,
                toStatus:
                  updated.status,
                changeSource:
                  'PHARMACY',
                actorStaffId:
                  toObjectId(
                    operational.actor.staffId,
                    'actorStaffId',
                  ),
                reason:
                  'Eligible FEFO stock reserved for pharmacy dispensing',
                snapshotHash:
                  pharmacySnapshotHash(
                    dispensationSnapshot(
                      updated,
                    ),
                  ),
                occurredAt,
              },
              transaction.session,
            );

          await this.support.dependencies.audit.append(
            {
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                pharmacyDeduplicationKey(
                  transaction.transactionId,
                  PHARMACY_DISPENSING_AUDIT_ACTIONS.RESERVATION_CREATED,
                  updated._id.toHexString(),
                ),
              action:
                PHARMACY_DISPENSING_AUDIT_ACTIONS.RESERVATION_CREATED,
              entityType:
                'DISPENSATION',
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
              before:
                dispensationSnapshot(
                  fresh,
                ),
              after:
                dispensationSnapshot(
                  updated,
                ),
              metadata: {
                reservationId:
                  reservation.reservation._id.toHexString(),
                reservationNumber:
                  reservation.reservation.reservationNumber,
                fullyReservedLineCount:
                  fullyReserved,
                lineCount:
                  reservationLines.length,
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
                  PHARMACY_DISPENSING_OUTBOX_EVENTS.RESERVATION_CREATED,
                  updated._id.toHexString(),
                ),
              eventType:
                PHARMACY_DISPENSING_OUTBOX_EVENTS.RESERVATION_CREATED,
              aggregateType:
                'DISPENSATION',
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
                dispensationId:
                  updated._id.toHexString(),
                reservationId:
                  reservation.reservation._id.toHexString(),
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
          PHARMACY_DISPENSING_REALTIME_EVENTS.WORKLIST_CHANGED,
        facilityId:
          command.actor.facilityId,
        pharmacyLocationId:
          result.pharmacyLocationId.toHexString(),
        payload: {
          event:
            PHARMACY_DISPENSING_EVENT_TYPES.RESERVATION_CREATED,
          dispensationId:
            result._id.toHexString(),
          status:
            result.status,
        },
      })
      .catch(() => undefined);

    return result;
  }
}