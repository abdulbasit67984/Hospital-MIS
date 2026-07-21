import Decimal from 'decimal.js';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  CreatePatientReturnInput,
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyPatientReturnRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
  PHARMACY_RETURN_NUMBER_SEQUENCE_NAMESPACE,
} from '../pharmacy-dispensing.constants.js';

import {
  dispensationMutationLockKeys,
  normalizePharmacyDecimal,
  pharmacyDeduplicationKey,
  pharmacyOperationKey,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

import {
  PharmacyReturnAssessmentService,
} from '../services/pharmacy-return-assessment.service.js';

import {
  PharmacyReturnReversalRepository,
} from '../repositories/pharmacy-return-reversal.repository.js';

export interface CreatePatientReturnCommand {
  actor:
    PharmacyDispensingActorContext;

  input:
    CreatePatientReturnInput;

  idempotencyKey:
    string;
}

function formatPatientReturnNumber(
  occurredAt: Date,
  sequence: number,
): string {
  return [
    'PRET',
    occurredAt.getUTCFullYear(),
    String(sequence).padStart(8, '0'),
  ].join('-');
}

export class CreatePatientReturnWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly repository:
      PharmacyReturnReversalRepository,

    private readonly assessment:
      PharmacyReturnAssessmentService,
  ) {}

  public async execute(
    command: CreatePatientReturnCommand,
  ): Promise<PharmacyPatientReturnRecord> {
    const dispensation =
      await this.support.requireDispensation(
        command.actor,
        command.input
          .originalDispensationId,
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
        'Medicine can only be returned from a completed or partially completed dispensation',
      );
    }

    if (
      dispensation.controlledMedicine &&
      command.input.witnessStaffId == null
    ) {
      throw new ConflictError(
        'Controlled-medicine returns require a witness',
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

            admissionId:
              dispensation.admissionId?.toHexString() ??
              null,

            requireControlledMedicine:
              dispensation.controlledMedicine,
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
        command.input.witnessStaffId,
    });

    const receivingLocation =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          command.input
            .receivingStockLocationId,
          {
            patientId:
              dispensation.patientId.toHexString(),

            requireControlledMedicine:
              dispensation.controlledMedicine,
          },
        );

    return this.support.dependencies.transactions.execute({
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

      lockKeys:
        dispensationMutationLockKeys(
          command.actor.facilityId,
          dispensation,
        ),

      idempotencyPayload: {
        input:
          command.input,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'CREATE_PATIENT_RETURN',
          {
            originalDispensationId:
              dispensation._id.toHexString(),

            lineCount:
              command.input.items.length,

            controlledMedicine:
              dispensation.controlledMedicine,
          },
        ),

      execute: async (transaction) => {
        const fresh =
          await this.support.requireDispensation(
            command.actor,
            dispensation._id.toHexString(),
            transaction.session,
          );

        const items =
          await this.support.dependencies.repository
            .listItems(
              command.actor.facilityId,
              fresh._id.toHexString(),
              transaction.session,
            );

        const itemById =
          new Map(
            items.map((item) => [
              item._id.toHexString(),
              item,
            ]),
          );

        const assessments =
          command.input.items.map(
            (inputItem) => {
              const originalItem =
                itemById.get(
                  inputItem
                    .originalDispensationItemId,
                );

              if (
                originalItem === undefined
              ) {
                throw new ConflictError(
                  'A returned item does not belong to the original dispensation',
                );
              }

              return this.assessment.assess(
                originalItem,
                inputItem,
              );
            },
          );

        const occurredAt =
          this.support.dependencies.clock.now();

        const sequence =
          await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            PHARMACY_RETURN_NUMBER_SEQUENCE_NAMESPACE,
          );

        const totalReturnedQuantity =
          assessments.reduce(
            (total, assessmentResult) =>
              total.plus(
                assessmentResult.quantity,
              ),
            new Decimal(0),
          );

        const aggregate =
          await this.repository.createReturn(
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

              returnNumber:
                formatPatientReturnNumber(
                  occurredAt,
                  sequence.value,
                ),

              operationKey:
                pharmacyOperationKey(
                  command.actor.facilityId,
                  'patient-return',
                  command.idempotencyKey,
                ),

              originalDispensationId:
                fresh._id,

              patientId:
                fresh.patientId,

              admissionId:
                fresh.admissionId,

              wardId:
                fresh.wardId,

              pharmacyLocationId:
                fresh.pharmacyLocationId,

              receivingStockLocationId:
                toObjectId(
                  receivingLocation.location
                    .locationId,
                  'receivingStockLocationId',
                ),

              status:
                'REQUESTED',

              lineCount:
                assessments.length,

              totalReturnedQuantity:
                normalizePharmacyDecimal(
                  totalReturnedQuantity,
                ) as never,

              controlledMedicine:
                fresh.controlledMedicine,

              witnessRequired:
                fresh.controlledMedicine,

              witnessStaffId:
                command.input.witnessStaffId ==
                null
                  ? null
                  : toObjectId(
                      command.input
                        .witnessStaffId,
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
                fresh.currency,

              grossAmount:
                '0' as never,

              discountAmount:
                '0' as never,

              taxAmount:
                '0' as never,

              netAmount:
                '0' as never,

              billingOperationKey:
                null,

              billingSourceRecordId:
                null,

              finalizationState:
                'NOT_STARTED',

              finalizationAttemptCount: 0,

              finalizationUpdatedAt:
                null,

              recoveryReason:
                null,

              lastFailureCode:
                null,
            },

            assessments.map(
              (
                assessmentResult,
                index,
              ) => ({
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

                patientReturnId:
                  toObjectId(
                    '000000000000000000000000',
                    'patientReturnId',
                  ),

                originalDispensationId:
                  fresh._id,

                originalDispensationItemId:
                  assessmentResult.originalItem._id,

                originalAllocationId:
                  assessmentResult
                    .originalAllocation?._id ??
                  null,

                lineNumber:
                  index + 1,

                inventoryItemId:
                  (
                    assessmentResult
                      .originalItem
                      .actualInventoryItemId ??
                    toObjectId(
                      '000000000000000000000000',
                      'inventoryItemId',
                    )
                  ),

                inventoryBatchId:
                  assessmentResult
                    .originalAllocation
                    ?.inventoryBatchId ??
                  null,

                stockUnitId:
                  assessmentResult
                    .originalAllocation
                    ?.stockUnitId ??
                  assessmentResult
                    .originalItem
                    .prescribedQuantityUnitId,

                quantity:
                  assessmentResult.quantity as never,

                controlledMedicine:
                  assessmentResult
                    .originalItem
                    .controlledMedicine,

                sealStatus:
                  command.input.items[index]!
                    .sealStatus,

                storageIntegrity:
                  command.input.items[index]!
                    .storageIntegrity,

                coldChainIntegrity:
                  command.input.items[index]!
                    .coldChainIntegrity,

                contaminationRisk:
                  command.input.items[index]!
                    .contaminationRisk,

                restockEligible:
                  assessmentResult.restockEligible,

                disposition:
                  assessmentResult.disposition,

                dispositionLocationId:
                  assessmentResult.restockEligible
                    ? toObjectId(
                        receivingLocation.location
                          .locationId,
                        'dispositionLocationId',
                      )
                    : null,

                status:
                  'ASSESSED',

                assessmentNotes:
                  assessmentResult.assessmentReason,

                dispositionReason:
                  assessmentResult.assessmentReason,

                stockMovementIds:
                  [],
              }),
            ),

            transaction.session,
          );

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,

            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                'pharmacy.patient_return.created',
                aggregate.header._id.toHexString(),
              ),

            action:
              'pharmacy.patient_return.created',

            entityType:
              'PATIENT_RETURN',

            entityId:
              aggregate.header._id.toHexString(),

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
              originalDispensationId:
                fresh._id.toHexString(),

              lineCount:
                aggregate.items.length,

              restockEligibleLineCount:
                aggregate.items.filter(
                  (item) =>
                    item.restockEligible,
                ).length,

              controlledMedicine:
                aggregate.header
                  .controlledMedicine,
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
                'pharmacy.patient_return.created.v1',
                aggregate.header._id.toHexString(),
              ),

            eventType:
              'pharmacy.patient_return.created.v1',

            aggregateType:
              'PATIENT_RETURN',

            aggregateId:
              aggregate.header._id.toHexString(),

            actorUserId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            payload: {
              returnId:
                aggregate.header._id.toHexString(),

              originalDispensationId:
                fresh._id.toHexString(),

              pharmacyLocationId:
                fresh.pharmacyLocationId.toHexString(),

              status:
                aggregate.header.status,

              lineCount:
                aggregate.items.length,
            },
          },

          transaction.session,
        );

        return aggregate.header;
      },
    });
  }
}