import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensingActorContext,
  PrintDispensingLabelInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensingLabelPrintRecord,
  PharmacyDispensingLabelRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
  PHARMACY_LABEL_NUMBER_SEQUENCE_NAMESPACE,
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
  PharmacyLabelCounsellingRepository,
} from '../repositories/pharmacy-label-counselling.repository.js';

export interface GenerateDispensingLabelCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  dispensationItemId: string;
  languageCode: string;
  idempotencyKey: string;
}

export interface PrintDispensingLabelCommand {
  actor: PharmacyDispensingActorContext;
  labelId: string;
  input: PrintDispensingLabelInput;
  idempotencyKey: string;
}

function formatLabelNumber(
  occurredAt: Date,
  sequence: number,
): string {
  return [
    'LBL',
    occurredAt.getUTCFullYear(),
    String(sequence).padStart(9, '0'),
  ].join('-');
}

export class GenerateDispensingLabelWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly repository:
      PharmacyLabelCounsellingRepository,
  ) {}

  public async execute(
    command: GenerateDispensingLabelCommand,
  ): Promise<PharmacyDispensingLabelRecord> {
    const [dispensation, item] =
      await Promise.all([
        this.support.requireDispensation(
          command.actor,
          command.dispensationId,
        ),

        this.support.requireDispensationItem(
          command.actor,
          command.dispensationId,
          command.dispensationItemId,
        ),
      ]);

    if (
      ![
        'DISPENSED',
        'PARTIALLY_DISPENSED',
      ].includes(item.status)
    ) {
      throw new ConflictError(
        'Labels can only be generated for dispensed medicine',
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
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,

      action:
        'DISPENSE',

      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },

      dispensation,
    });

    const existing =
      await this.repository.findLatestItemLabel(
        command.actor.facilityId,
        command.dispensationItemId,
      );

    if (existing !== null) {
      return existing;
    }

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.PRINT_LABEL,

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
          'pharmacy-dispensing:label',
          command.actor.facilityId,
          command.dispensationItemId,
        ),
      ],

      idempotencyPayload: {
        dispensationId:
          command.dispensationId,

        dispensationItemId:
          command.dispensationItemId,

        languageCode:
          command.languageCode,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'GENERATE_DISPENSING_LABEL',
          {
            dispensationId:
              command.dispensationId,

            dispensationItemId:
              command.dispensationItemId,
          },
        ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const sequence =
          await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            PHARMACY_LABEL_NUMBER_SEQUENCE_NAMESPACE,
          );

        const firstAllocation =
          item.allocations.find(
            (allocation) =>
              new Number(
                allocation
                  .consumedStockQuantity
                  .toString(),
              ).valueOf() > 0,
          ) ??
          item.allocations[0] ??
          null;

        const label =
          await this.repository.createLabel(
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

              labelNumber:
                formatLabelNumber(
                  occurredAt,
                  sequence.value,
                ),

              dispensationId:
                dispensation._id,

              dispensationItemId:
                item._id,

              patientId:
                dispensation.patientId,

              prescriptionId:
                dispensation.prescriptionId,

              pharmacyLocationId:
                dispensation.pharmacyLocationId,

              templateCode:
                'STANDARD_MEDICINE_LABEL',

              templateVersion: 1,

              languageCode:
                command.languageCode,

              status:
                'GENERATED',

              patientDisplayName:
                'PATIENT',

              patientIdentifierSnapshot:
                dispensation.patientId.toHexString(),

              medicineName:
                item.actualMedicineSnapshot ??
                item.prescribedMedicineSnapshot,

              strength:
                item.actualStrengthSnapshot ??
                item.prescribedStrengthSnapshot,

              dosageForm:
                item.actualFormSnapshot ??
                item.prescribedFormSnapshot,

              quantity:
                item.dispensedQuantity,

              quantityUnitLabel:
                item.dispensedQuantityUnitId?.toHexString() ??
                item.prescribedQuantityUnitId.toHexString(),

              instructions:
                item.prescribedInstructionsSnapshot ??
                'Use as directed by the prescriber',

              route:
                item.prescribedRouteSnapshot,

              frequency:
                item.prescribedFrequencySnapshot,

              duration:
                null,

              warnings:
                item.safetyAlerts
                  .filter(
                    (alert) =>
                      alert.disposition !==
                      'RESOLVED',
                  )
                  .map(
                    (alert) => ({
                      code:
                        alert.code,

                      text:
                        alert.message,
                    }),
                  ),

              storageInstructions:
                item.specialHandling.includes(
                  'REFRIGERATED',
                )
                  ? 'Keep refrigerated according to the medicine storage instructions.'
                  : null,

              batchNumber:
                firstAllocation?.batchNumberSnapshot ??
                null,

              expiryDate:
                firstAllocation?.expiryDateSnapshot ??
                null,

              dispensedAt:
                item.dispensedAt ??
                occurredAt,

              pharmacyDisplayName:
                operational.location.name,

              pharmacistDisplayName:
                operational.actor.displayName,

              generatedByStaffId:
                toObjectId(
                  operational.actor.staffId,
                  'generatedByStaffId',
                ),

              generatedAt:
                occurredAt,

              printCount: 0,

              lastPrintedAt:
                null,

              medicationGuideAttachmentIds:
                [],
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
                'pharmacy.label.generated',
                label._id.toHexString(),
              ),

            action:
              'pharmacy.label.generated',

            entityType:
              'DISPENSING_LABEL',

            entityId:
              label._id.toHexString(),

            actorUserId:
              command.actor.userId,

            actorStaffId:
              operational.actor.staffId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            metadata: {
              dispensationId:
                dispensation._id.toHexString(),

              dispensationItemId:
                item._id.toHexString(),

              templateCode:
                label.templateCode,

              templateVersion:
                label.templateVersion,
            },
          },

          transaction.session,
        );

        return label;
      },
    });
  }
}

export class PrintDispensingLabelWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly repository:
      PharmacyLabelCounsellingRepository,
  ) {}

  public async execute(
    command: PrintDispensingLabelCommand,
  ): Promise<{
    label: PharmacyDispensingLabelRecord;
    print: PharmacyDispensingLabelPrintRecord;
  }> {
    const current =
      await this.repository.findLabel(
        command.actor.facilityId,
        command.labelId,
      );

    if (current === null) {
      throw new ResourceNotFoundError(
        'The dispensing label was not found',
      );
    }

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.PRINT_LABEL,

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
          'pharmacy-dispensing:label-print',
          command.actor.facilityId,
          command.labelId,
        ),
      ],

      idempotencyPayload: {
        labelId:
          command.labelId,

        input:
          command.input,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'PRINT_DISPENSING_LABEL',
          {
            labelId:
              command.labelId,

            reason:
              command.input.reason,
          },
        ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const fresh =
          await this.repository.findLabel(
            command.actor.facilityId,
            command.labelId,
            transaction.session,
          );

        if (fresh === null) {
          throw new ResourceNotFoundError(
            'The dispensing label was not found',
          );
        }

        const expectedVersion =
          command.input.expectedLabelVersion ??
          fresh.version;

        const previousPrint =
          await this.repository.findLatestPrint(
            command.actor.facilityId,
            command.labelId,
            transaction.session,
          );

        const reason =
          command.input.reason ??
          (
            previousPrint === null
              ? 'INITIAL'
              : 'REPRINT'
          );

        if (
          reason === 'INITIAL' &&
          previousPrint !== null
        ) {
          throw new ConflictError(
            'This label has already been printed',
          );
        }

        const updated =
          await this.repository.updateLabelPrintState(
            command.actor.facilityId,
            command.labelId,
            expectedVersion,
            command.actor.userId,
            occurredAt,
            transaction.session,
          );

        if (updated === null) {
          throw new ConcurrencyConflictError(
            'The dispensing label changed before it could be printed',
          );
        }

        const print =
          await this.repository.appendPrint(
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

              dispensingLabelId:
                updated._id,

              dispensationId:
                updated.dispensationId,

              dispensationItemId:
                updated.dispensationItemId,

              printSequence:
                previousPrint === null
                  ? 1
                  : previousPrint.printSequence +
                    1,

              reason,

              labelVersion:
                expectedVersion,

              printerIdentifier:
                command.input.printerIdentifier ??
                null,

              workstationIdentifier:
                command.input.workstationIdentifier ??
                null,

              previousPrintId:
                previousPrint?._id ??
                null,

              printedByStaffId:
                toObjectId(
                  command.actor.userId,
                  'printedByStaffId',
                ),

              printedAt:
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
                'pharmacy.label.printed',
                print._id.toHexString(),
              ),

            action:
              'pharmacy.label.printed',

            entityType:
              'DISPENSING_LABEL_PRINT',

            entityId:
              print._id.toHexString(),

            actorUserId:
              command.actor.userId,

            actorStaffId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            metadata: {
              labelId:
                updated._id.toHexString(),

              printSequence:
                print.printSequence,

              reason:
                print.reason,
            },
          },

          transaction.session,
        );

        return {
          label:
            updated,

          print,
        };
      },
    });
  }
}