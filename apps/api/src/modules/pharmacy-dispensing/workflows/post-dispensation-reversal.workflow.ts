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
  PharmacyDispensationReversalRecord,
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
  PharmacyReversalFinalizationService,
} from '../services/pharmacy-reversal-finalization.service.js';

import {
  ControlledMedicineRegisterService,
} from '../services/controlled-medicine-register.service.js';

import {
  PharmacyReturnReversalRepository,
} from '../repositories/pharmacy-return-reversal.repository.js';

export interface PostDispensationReversalCommand {
  actor: PharmacyDispensingActorContext;
  reversalId: string;
  expectedVersion: number;
  idempotencyKey: string;
  dispensationItemIds?: readonly string[];
}

export class PostDispensationReversalWorkflow {
  public constructor(
    private readonly support: PharmacyDispensingCommandService,
    private readonly repository: PharmacyReturnReversalRepository,
    private readonly finalization: PharmacyReversalFinalizationService,
    private readonly controlledRegister: ControlledMedicineRegisterService,
  ) {}

  public async execute(
    command: PostDispensationReversalCommand,
  ): Promise<PharmacyDispensationReversalRecord> {
    const current = await this.repository.findReversal(
      command.actor.facilityId,
      command.reversalId,
    );

    if (current === null) {
      throw new ResourceNotFoundError('The dispensing reversal was not found');
    }

    if (current.version !== command.expectedVersion) {
      throw new ConflictError('The dispensing reversal changed before posting');
    }

    if (!['REQUESTED', 'APPROVED', 'RECOVERY_REQUIRED'].includes(current.status)) {
      throw new ConflictError(
        'The dispensing reversal cannot be posted in its current status',
      );
    }

    const dispensation = await this.support.requireDispensation(
      command.actor,
      current.originalDispensationId.toHexString(),
    );
    const operational = await this.support.dependencies.context.resolveOperationalContext(
      command.actor,
      current.pharmacyLocationId.toHexString(),
      {
        patientId: current.patientId.toHexString(),
        requireControlledMedicine: current.controlledMedicine,
      },
    );

    await this.support.assertAccess({
      actor: command.actor,
      action: 'REVERSAL',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation,
      witnessStaffId: current.witnessStaffId?.toHexString() ?? null,
    });

    if (current.controlledMedicine && current.witnessStaffId === null) {
      throw new ConflictError('Controlled-medicine reversal requires a witness');
    }

    const result = await this.support.dependencies.transactions.execute({
      transactionType: PHARMACY_DISPENSING_TRANSACTION_TYPES.REVERSE,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        pharmacyLockKey(
          'pharmacy-dispensing:reversal',
          command.actor.facilityId,
          command.reversalId,
        ),
        pharmacyLockKey(
          'pharmacy-dispensing:dispensation',
          command.actor.facilityId,
          dispensation._id.toHexString(),
        ),
      ].sort(),
      idempotencyPayload: {
        reversalId: command.reversalId,
        expectedVersion: command.expectedVersion,
        dispensationItemIds: command.dispensationItemIds ?? null,
      },
      journalPayload: safePharmacyJournalPayload(
        'POST_DISPENSATION_REVERSAL',
        {
          reversalId: command.reversalId,
          originalDispensationId: dispensation._id.toHexString(),
        },
      ),
      execute: async (transaction) => {
        const fresh = await this.repository.findReversal(
          command.actor.facilityId,
          command.reversalId,
          transaction.session,
        );

        if (fresh === null) {
          throw new ResourceNotFoundError('The dispensing reversal was not found');
        }

        if (fresh.version !== command.expectedVersion) {
          throw new ConflictError('The dispensing reversal changed during posting');
        }

        const items = await this.support.dependencies.repository.listItems(
          command.actor.facilityId,
          dispensation._id.toHexString(),
          transaction.session,
        );
        const prepared = this.finalization.prepare(
          dispensation,
          items,
          command.dispensationItemIds,
        );
        const allReversibleItemIds = items
          .filter((item) =>
            ['DISPENSED', 'PARTIALLY_DISPENSED', 'PARTIALLY_RETURNED'].includes(
              item.status,
            ),
          )
          .map((item) => item._id.toHexString());

        if (
          prepared.lines.length !== allReversibleItemIds.length ||
          prepared.lines.some(
            (line) => !allReversibleItemIds.includes(line.item._id.toHexString()),
          )
        ) {
          throw new ConflictError(
            'The current Inventory integration reverses one complete dispensation; partial reversal must be represented as a patient return',
          );
        }

        const occurredAt = this.support.dependencies.clock.now();
        const stockResult = await this.support.dependencies.inventory.reverseDispensing(
          pharmacyInventoryCommandContext(
            command.actor,
            `${command.idempotencyKey}:inventory-reversal`,
          ),
          {
            dispensationId: dispensation._id.toHexString(),
            reason: fresh.reason,
          },
          transaction.session,
        );
        const billingResult = await this.support.dependencies.billing.reverseDispensingCharges(
          `${command.idempotencyKey}:billing-reversal`,
          dispensation._id.toHexString(),
          fresh.reason,
          transaction.session,
        );
        const prescription = await this.support.dependencies.prescriptions.findPrescription(
          command.actor.facilityId,
          dispensation.prescriptionId.toHexString(),
          transaction.session,
        );
        const prescriptionItems = await this.support.dependencies.prescriptions.listPrescriptionItems(
          command.actor.facilityId,
          dispensation.prescriptionId.toHexString(),
          transaction.session,
        );

        if (prescription === null) {
          throw new ConflictError('The source prescription was not found during reversal');
        }

        const prescriptionById = new Map(
          prescriptionItems.map((item) => [item._id.toHexString(), item]),
        );
        const prescriptionUpdates = [];
        let movementIndex = 0;

        for (const line of prepared.lines) {
          const originalPrescriptionItem = prescriptionById.get(
            line.item.prescriptionItemId.toHexString(),
          );

          if (originalPrescriptionItem === undefined) {
            throw new ConflictError(
              `The source prescription line for dispensing line ${line.item.lineNumber} was not found`,
            );
          }

          const correctedPrescriptionQuantity = new Decimal(
            originalPrescriptionItem.dispensedQuantity.toString(),
          ).minus(line.reversibleQuantity);

          if (correctedPrescriptionQuantity.lt(0)) {
            throw new ConflictError(
              'Prescription dispensing progress cannot become negative during reversal',
            );
          }

          const newReversedQuantity = new Decimal(
            line.item.reversedQuantity.toString(),
          ).plus(line.reversibleQuantity);
          const updatedAllocations = line.item.allocations.map((allocation) => {
            const selected = line.allocationReversals.find(
              (candidate) => candidate.allocationId === allocation._id.toHexString(),
            );

            if (selected === undefined) {
              return allocation;
            }

            const movementId = stockResult.reversedMovementIds[movementIndex] ?? null;
            movementIndex += 1;

            return {
              ...allocation,
              returnedStockQuantity: normalizePharmacyDecimal(
                new Decimal(allocation.returnedStockQuantity.toString()).plus(
                  selected.stockQuantity,
                ),
              ) as never,
              reversalStockMovementIds:
                movementId === null
                  ? allocation.reversalStockMovementIds
                  : [
                      ...allocation.reversalStockMovementIds,
                      toObjectId(movementId, 'stockMovementId'),
                    ],
              status: 'REVERSED',
            };
          });
          const updatedItem = await this.support.dependencies.repository.updateItem(
            command.actor.facilityId,
            dispensation._id.toHexString(),
            line.item._id.toHexString(),
            line.item.version,
            {
              $set: {
                reversedQuantity: normalizePharmacyDecimal(newReversedQuantity),
                status: 'REVERSED',
                allocations: updatedAllocations,
              },
              $inc: { version: 1 },
            },
            command.actor.userId,
            transaction.session,
          );

          if (updatedItem === null) {
            throw new ConflictError(
              'A dispensing line changed during reversal posting',
            );
          }

          if (updatedItem.controlledMedicine) {
            for (const allocationReversal of line.allocationReversals) {
              const allocation = updatedItem.allocations.find(
                (candidate) =>
                  candidate._id.toHexString() === allocationReversal.allocationId,
              );

              if (allocation === undefined || fresh.witnessStaffId === null) {
                throw new ConflictError(
                  'Controlled reversal allocation or witness attribution is missing',
                );
              }

              const inventoryItemId =
                updatedItem.actualInventoryItemId ?? line.item.actualInventoryItemId;

              if (inventoryItemId === null) {
                throw new ConflictError(
                  'Controlled reversal inventory attribution is missing',
                );
              }

              await this.controlledRegister.recordReversal({
                actor: command.actor,
                operational,
                dispensation,
                item: updatedItem,
                allocation,
                inventoryItemId: inventoryItemId.toHexString(),
                stockQuantity: allocationReversal.stockQuantity,
                stockMovementId:
                  stockResult.reversedMovementIds[movementIndex - 1] ?? null,
                witnessStaffId: fresh.witnessStaffId.toHexString(),
                transactionId: transaction.transactionId,
                idempotencyKey: command.idempotencyKey,
                occurredAt,
                session: transaction.session,
                sourceType: 'REVERSAL',
                sourceId: fresh._id.toHexString(),
                reason: fresh.reason,
              });
            }
          }

          prescriptionUpdates.push({
            prescriptionItemId: originalPrescriptionItem._id.toHexString(),
            expectedVersion: originalPrescriptionItem.version,
            dispensedQuantity: normalizePharmacyDecimal(correctedPrescriptionQuantity),
            lastDispensedAt: occurredAt,
            lastDispensationId: dispensation._id.toHexString(),
          });
        }

        const correctedPrescription =
          await this.support.dependencies.prescriptions.updateDispensingProgress(
            command.actor.facilityId,
            prescription._id.toHexString(),
            prescription.version,
            prescriptionUpdates,
            command.actor.userId,
            transaction.transactionId,
            command.actor.correlationId,
            transaction.session,
          );

        if (correctedPrescription === null) {
          throw new ConflictError(
            'The source prescription changed during reversal correction',
          );
        }

        const updatedDispensation =
          await this.support.dependencies.repository.updateDispensation(
            command.actor.facilityId,
            dispensation._id.toHexString(),
            dispensation.version,
            {
              $set: {
                status: 'REVERSED',
                finalizationState: 'COMPLETED',
                finalizationUpdatedAt: occurredAt,
                recoveryReason: null,
                lastFailureCode: null,
              },
              $inc: { version: 1 },
            },
            command.actor.userId,
            transaction.session,
          );

        if (updatedDispensation === null) {
          throw new ConflictError('The dispensation changed during reversal posting');
        }

        const updatedReversal = await this.repository.updateReversal(
          command.actor.facilityId,
          command.reversalId,
          fresh.version,
          {
            $set: {
              status: 'POSTED',
              grossAmount: prepared.grossAmount,
              discountAmount: prepared.discountAmount,
              taxAmount: prepared.taxAmount,
              netAmount: prepared.netAmount,
              billingOperationKey: `${command.idempotencyKey}:billing-reversal`,
              billingSourceRecordId: toObjectId(
                billingResult.billingRecordId,
                'billingRecordId',
              ),
              inventoryReversalOperationKey:
                `${command.idempotencyKey}:inventory-reversal`,
              inventoryReversalMovementIds: stockResult.reversedMovementIds.map(
                (movementId) => toObjectId(movementId, 'stockMovementId'),
              ),
              finalizationState: 'COMPLETED',
              finalizationAttemptCount: fresh.finalizationAttemptCount + 1,
              finalizationUpdatedAt: occurredAt,
              recoveryReason: null,
              lastFailureCode: null,
            },
            $inc: { version: 1 },
          },
          command.actor.userId,
          transaction.session,
        );

        if (updatedReversal === null) {
          throw new ConflictError(
            'The dispensing reversal changed during final posting',
          );
        }

        await this.support.dependencies.audit.append(
          {
            transactionId: transaction.transactionId,
            deduplicationKey: pharmacyDeduplicationKey(
              transaction.transactionId,
              'pharmacy.dispensation_reversal.posted',
              updatedReversal._id.toHexString(),
            ),
            action: 'pharmacy.dispensation_reversal.posted',
            entityType: 'DISPENSATION_REVERSAL',
            entityId: updatedReversal._id.toHexString(),
            actorUserId: command.actor.userId,
            actorStaffId: operational.actor.staffId,
            facilityId: command.actor.facilityId,
            correlationId: command.actor.correlationId,
            occurredAt,
            reason: updatedReversal.reason,
            metadata: {
              originalDispensationId: dispensation._id.toHexString(),
              stockMovementIds: stockResult.reversedMovementIds,
              billingRecordId: billingResult.billingRecordId,
              lineCount: prepared.lines.length,
              netAmount: prepared.netAmount,
            },
          },
          transaction.session,
        );
        await this.support.dependencies.outbox.enqueue(
          {
            transactionId: transaction.transactionId,
            deduplicationKey: pharmacyDeduplicationKey(
              transaction.transactionId,
              'pharmacy.dispensation_reversal.posted.v1',
              updatedReversal._id.toHexString(),
            ),
            eventType: 'pharmacy.dispensation_reversal.posted.v1',
            aggregateType: 'DISPENSATION_REVERSAL',
            aggregateId: updatedReversal._id.toHexString(),
            actorUserId: command.actor.userId,
            facilityId: command.actor.facilityId,
            correlationId: command.actor.correlationId,
            occurredAt,
            payload: {
              reversalId: updatedReversal._id.toHexString(),
              originalDispensationId: dispensation._id.toHexString(),
              pharmacyLocationId: dispensation.pharmacyLocationId.toHexString(),
              status: updatedReversal.status,
            },
          },
          transaction.session,
        );

        return updatedReversal;
      },
    });

    await this.support.dependencies.realtime
      .publish({
        eventType: PHARMACY_DISPENSING_REALTIME_EVENTS.WORKLIST_CHANGED,
        facilityId: command.actor.facilityId,
        pharmacyLocationId: result.pharmacyLocationId.toHexString(),
        payload: {
          event: 'pharmacy.dispensation_reversal.posted.v1',
          reversalId: result._id.toHexString(),
          status: result.status,
        },
      })
      .catch(() => undefined);

    return result;
  }
}