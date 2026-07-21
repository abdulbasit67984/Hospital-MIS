import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CompleteDispensationInput,
  PharmacyDispensingActorContext,
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

import {
  PharmacyDispensingFinalizationService,
} from '../services/pharmacy-dispensing-finalization.service.js';

import {
  ControlledMedicineRegisterService,
} from '../services/controlled-medicine-register.service.js';

export interface CompleteDispensationCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: CompleteDispensationInput;
  idempotencyKey: string;
}

export class CompleteDispensationWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly finalization:
      PharmacyDispensingFinalizationService,

    private readonly controlledRegister:
      ControlledMedicineRegisterService,
  ) {}

  public async execute(
    command: CompleteDispensationCommand,
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

    if (
      ![
        'RESERVED',
        'PARTIALLY_RESERVED',
        'PARTIALLY_DISPENSED',
      ].includes(current.status)
    ) {
      throw new ConflictError(
        'The dispensation is not ready for stock consumption',
      );
    }

    if (
      current.controlledMedicine &&
      command.input.witnessStaffId == null
    ) {
      throw new ConflictError(
        'Controlled-medicine dispensing requires a witness',
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

            encounterId:
              current.encounterId?.toHexString() ??
              null,

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

      witnessStaffId:
        command.input.witnessStaffId,
    });

    const result =
      await this.support.dependencies.transactions.execute({
        transactionType:
          PHARMACY_DISPENSING_TRANSACTION_TYPES.DISPENSE,

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
            'COMPLETE_DISPENSATION',
            {
              dispensationId:
                command.dispensationId,

              itemCount:
                command.input.items.length,

              controlledMedicine:
                current.controlledMedicine,
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

          if (
            fresh.stockReservationId === null
          ) {
            throw new ConflictError(
              'The stock reservation is missing',
            );
          }

          const items =
            await this.support.dependencies.repository
              .listItems(
                command.actor.facilityId,
                command.dispensationId,
                transaction.session,
              );

          const occurredAt =
            this.support.dependencies.clock.now();

          const prepared =
            await this.finalization.prepare(
              command.actor,
              fresh,
              items,
              command.input,
              occurredAt,
            );

          const billing =
            await this.finalization
              .prepareBillingCharges(
                prepared,
                fresh,
              );

          const reservationLines =
            prepared.lines.map(
              (line) => {
                const reservationItemIds =
                  [
                    ...new Set(
                      line.item.allocations
                        .filter(
                          (allocation) =>
                            line.input.allocations.some(
                              (selected) =>
                                selected.allocationId ===
                                allocation._id.toHexString(),
                            ),
                        )
                        .map(
                          (allocation) =>
                            allocation.stockReservationItemId.toHexString(),
                        ),
                    ),
                  ];

                if (
                  reservationItemIds.length !== 1
                ) {
                  throw new ConflictError(
                    `Dispensing line ${line.item.lineNumber} must map to one inventory reservation line`,
                  );
                }

                return {
                  reservationItemId:
                    reservationItemIds[0]!,

                  stockQuantity:
                    line.stockQuantity,
                };
              },
            );

          await transaction.checkpoint(
            'PHARMACY_FINALIZATION_PREPARED',
            {
              dispensationId:
                fresh._id.toHexString(),

              lineCount:
                prepared.lines.length,
            },
          );

          const stockResult =
            await this.support.dependencies.inventory
              .consumeDispensingReservation(
                pharmacyInventoryCommandContext(
                  command.actor,
                  `${command.idempotencyKey}:consume-stock`,
                ),

                fresh.stockReservationId.toHexString(),

                {
                  expectedVersion:
                    fresh.version,

                  dispensationId:
                    fresh._id.toHexString(),

                  lines:
                    reservationLines,
                },

                transaction.session,
              );

          await transaction.checkpoint(
            'PHARMACY_STOCK_CONSUMED',
            {
              reservationId:
                stockResult.reservationId,

              movementIds:
                stockResult.movementIds,
            },
          );

          const billingResult =
            await this.support.dependencies.billing
              .createDispensingCharges(
                `${command.idempotencyKey}:billing`,

                billing.charges,

                transaction.session,
              );

          await transaction.checkpoint(
            'PHARMACY_BILLING_CREATED',
            {
              billingRecordId:
                billingResult.billingRecordId,
            },
          );

          let completedLineCount = 0;
          let grossTotal = new Decimal(0);
          let discountTotal = new Decimal(0);
          let taxTotal = new Decimal(0);
          let netTotal = new Decimal(0);

          const prescriptionUpdates = [];

          for (const line of prepared.lines) {
            const pricing =
              billing.pricingByLine.get(
                line.item._id.toHexString(),
              );

            if (pricing === undefined) {
              throw new ConflictError(
                'Dispensing-line pricing is unavailable',
              );
            }

            const newDispensedQuantity =
              new Decimal(
                line.item.dispensedQuantity.toString(),
              ).plus(
                line.requestedQuantity,
              );

            const fullyDispensed =
              newDispensedQuantity.eq(
                line.item.approvedQuantity.toString(),
              );

            if (fullyDispensed) {
              completedLineCount += 1;
            }

            const selectedById =
              new Map(
                line.input.allocations.map(
                  (allocation) => [
                    allocation.allocationId,
                    allocation,
                  ],
                ),
              );

            const updatedAllocations =
              line.item.allocations.map(
                (allocation) => {
                  const selected =
                    selectedById.get(
                      allocation._id.toHexString(),
                    );

                  if (selected === undefined) {
                    return allocation;
                  }

                  const consumed =
                    new Decimal(
                      allocation
                        .consumedStockQuantity
                        .toString(),
                    ).plus(
                      selected.stockQuantity,
                    );

                  const fullyConsumed =
                    consumed.eq(
                      allocation
                        .reservedStockQuantity
                        .toString(),
                    );

                  return {
                    ...allocation,

                    consumedStockQuantity:
                      normalizePharmacyDecimal(
                        consumed,
                      ) as never,

                    status:
                      fullyConsumed
                        ? 'CONSUMED'
                        : 'RESERVED',

                    stockMovementIds:
                      [
                        ...allocation.stockMovementIds,
                        ...stockResult.movementIds.map(
                          (movementId) =>
                            toObjectId(
                              movementId,
                              'stockMovementId',
                            ),
                        ),
                      ],
                  };
                },
              );

            const updatedItem =
              await this.support.dependencies.repository
                .updateItem(
                  command.actor.facilityId,
                  command.dispensationId,
                  line.item._id.toHexString(),
                  line.item.version,
                  {
                    $set: {
                      dispensedQuantity:
                        normalizePharmacyDecimal(
                          newDispensedQuantity,
                        ),

                      dispensedQuantityUnitId:
                        toObjectId(
                          line.input.quantityUnitId,
                          'quantityUnitId',
                        ),

                      actualFormularyItemId:
                        line.item.actualFormularyItemId ??
                        line.item.prescribedFormularyItemId,

                      actualMedicineId:
                        line.item.actualMedicineId ??
                        line.item.prescribedMedicineId,

                      actualMedicineFormId:
                        line.item.actualMedicineFormId ??
                        line.item.prescribedMedicineFormId,

                      actualMedicineStrengthId:
                        line.item.actualMedicineStrengthId ??
                        line.item.prescribedMedicineStrengthId,

                      actualInventoryItemId:
                        line.inventory._id,

                      actualMedicineSnapshot:
                        line.item.actualMedicineSnapshot ??
                        line.inventory.name,

                      actualStrengthSnapshot:
                        line.item.actualStrengthSnapshot ??
                        line.item.prescribedStrengthSnapshot,

                      actualFormSnapshot:
                        line.item.actualFormSnapshot ??
                        line.item.prescribedFormSnapshot,

                      allocations:
                        updatedAllocations,

                      unitSellingPrice:
                        pricing.unitSellingPrice,

                      grossAmount:
                        pricing.grossAmount,

                      discountAmount:
                        pricing.discountAmount,

                      taxAmount:
                        pricing.taxAmount,

                      netAmount:
                        pricing.netAmount,

                      pricingSource:
                        pricing.pricingSource,

                      status:
                        fullyDispensed
                          ? 'DISPENSED'
                          : 'PARTIALLY_DISPENSED',

                      dispensedByStaffId:
                        toObjectId(
                          operational.actor.staffId,
                          'dispensedByStaffId',
                        ),

                      dispensedAt:
                        occurredAt,
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
                `Dispensing line ${line.item.lineNumber} changed during finalization`,
              );
            }

            if (
              updatedItem.controlledMedicine
            ) {
              if (
                command.input.witnessStaffId ==
                null
              ) {
                throw new ConflictError(
                  'Controlled-medicine dispensing requires a witness',
                );
              }

              for (
                const allocation of
                updatedItem.allocations
              ) {
                const wasSelected =
                  line.input.allocations.some(
                    (selected) =>
                      selected.allocationId ===
                      allocation._id.toHexString(),
                  );

                if (!wasSelected) {
                  continue;
                }

                await this.controlledRegister
                  .recordDispensing({
                    actor:
                      command.actor,

                    operational,

                    dispensation:
                      fresh,

                    item:
                      updatedItem,

                    allocation,

                    inventoryItemId:
                      line.inventory._id.toHexString(),

                    stockMovementId:
                      stockResult.movementIds[0] ??
                      null,

                    witnessStaffId:
                      command.input.witnessStaffId,

                    transactionId:
                      transaction.transactionId,

                    idempotencyKey:
                      command.idempotencyKey,

                    occurredAt,

                    session:
                      transaction.session,
                  });
              }
            }

            prescriptionUpdates.push({
              prescriptionItemId:
                line.item.prescriptionItemId.toHexString(),

              expectedVersion:
                line.item.version,

              dispensedQuantity:
                normalizePharmacyDecimal(
                  newDispensedQuantity,
                ),

              lastDispensedAt:
                occurredAt,

              lastDispensationId:
                fresh._id.toHexString(),
            });

            grossTotal =
              grossTotal.plus(
                pricing.grossAmount,
              );

            discountTotal =
              discountTotal.plus(
                pricing.discountAmount,
              );

            taxTotal =
              taxTotal.plus(
                pricing.taxAmount,
              );

            netTotal =
              netTotal.plus(
                pricing.netAmount,
              );
          }

          const prescription =
            await this.support.dependencies.prescriptions
              .updateDispensingProgress(
                command.actor.facilityId,
                fresh.prescriptionId.toHexString(),
                fresh.prescriptionVersion,
                prescriptionUpdates,
                command.actor.userId,
                transaction.transactionId,
                command.actor.correlationId,
                transaction.session,
              );

          if (prescription === null) {
            throw new ConflictError(
              'The source prescription changed during dispensing finalization',
            );
          }

          const allItems =
            await this.support.dependencies.repository
              .listItems(
                command.actor.facilityId,
                command.dispensationId,
                transaction.session,
              );

          const allComplete =
            allItems.every(
              (item) =>
                item.status === 'DISPENSED',
            );

          const anyDispensed =
            allItems.some(
              (item) =>
                [
                  'DISPENSED',
                  'PARTIALLY_DISPENSED',
                ].includes(
                  item.status,
                ),
            );

          const nextStatus =
            allComplete
              ? 'COMPLETED'
              : anyDispensed
                ? 'PARTIALLY_DISPENSED'
                : 'IN_PROGRESS';

          const before =
            dispensationSnapshot(
              fresh,
            );

          const updated =
            await this.support.dependencies.repository
              .updateDispensation(
                command.actor.facilityId,
                command.dispensationId,
                fresh.version,
                {
                  $set: {
                    status:
                      nextStatus,

                    firstDispensedAt:
                      fresh.firstDispensedAt ??
                      occurredAt,

                    completedAt:
                      allComplete
                        ? occurredAt
                        : null,

                    dispensedByStaffId:
                      toObjectId(
                        operational.actor.staffId,
                        'dispensedByStaffId',
                      ),

                    completedLineCount:
                      allItems.filter(
                        (item) =>
                          item.status ===
                          'DISPENSED',
                      ).length,

                    grossAmount:
                      normalizePharmacyDecimal(
                        grossTotal,
                      ),

                    discountAmount:
                      normalizePharmacyDecimal(
                        discountTotal,
                      ),

                    taxAmount:
                      normalizePharmacyDecimal(
                        taxTotal,
                      ),

                    netAmount:
                      normalizePharmacyDecimal(
                        netTotal,
                      ),

                    billingOperationKey:
                      `${command.idempotencyKey}:billing`,

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
              'The dispensation changed during final status persistence',
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
                  allComplete
                    ? 'Pharmacy dispensing completed'
                    : 'Pharmacy dispensing partially completed',

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

          const auditAction =
            allComplete
              ? 'pharmacy.dispensation.completed'
              : 'pharmacy.dispensation.partially_dispensed';

          const outboxEvent =
            allComplete
              ? 'pharmacy.dispensation.completed.v1'
              : 'pharmacy.dispensation.partially_dispensed.v1';

          await this.support.dependencies.audit.append(
            {
              transactionId:
                transaction.transactionId,

              deduplicationKey:
                pharmacyDeduplicationKey(
                  transaction.transactionId,
                  auditAction,
                  updated._id.toHexString(),
                ),

              action:
                auditAction,

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

              before,

              after:
                dispensationSnapshot(
                  updated,
                ),

              metadata: {
                stockReservationId:
                  stockResult.reservationId,

                stockMovementIds:
                  stockResult.movementIds,

                billingRecordId:
                  billingResult.billingRecordId,

                dispensedLineCount:
                  prepared.lines.length,

                completedLineCount,
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
                  outboxEvent,
                  updated._id.toHexString(),
                ),

              eventType:
                outboxEvent,

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

                prescriptionId:
                  updated.prescriptionId.toHexString(),

                patientId:
                  updated.patientId.toHexString(),

                pharmacyLocationId:
                  updated.pharmacyLocationId.toHexString(),

                status:
                  updated.status,

                billingRecordId:
                  billingResult.billingRecordId,
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
            result.status === 'COMPLETED'
              ? PHARMACY_DISPENSING_EVENT_TYPES.COMPLETED
              : PHARMACY_DISPENSING_EVENT_TYPES.PARTIALLY_DISPENSED,

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