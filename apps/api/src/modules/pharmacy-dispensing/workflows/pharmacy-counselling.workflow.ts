import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensingActorContext,
  RecordPharmacyCounsellingInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyCounsellingRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_REALTIME_EVENTS,
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
  PharmacyLabelCounsellingRepository,
} from '../repositories/pharmacy-label-counselling.repository.js';

export interface RecordPharmacyCounsellingCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  input: RecordPharmacyCounsellingInput;
  idempotencyKey: string;
}

export class RecordPharmacyCounsellingWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,

    private readonly repository:
      PharmacyLabelCounsellingRepository,
  ) {}

  public async execute(
    command: RecordPharmacyCounsellingCommand,
  ): Promise<PharmacyCounsellingRecord> {
    const dispensation =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    if (
      ![
        'PARTIALLY_DISPENSED',
        'COMPLETED',
        'PARTIALLY_RETURNED',
        'RETURNED',
      ].includes(
        dispensation.status,
      )
    ) {
      throw new ConflictError(
        'Counselling can only be recorded after medicine has been dispensed',
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

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.COUNSELLING,

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
          'pharmacy-dispensing:counselling',
          command.actor.facilityId,
          command.dispensationId,
        ),
      ],

      idempotencyPayload: {
        dispensationId:
          command.dispensationId,

        input:
          command.input,
      },

      journalPayload:
        safePharmacyJournalPayload(
          'RECORD_PHARMACY_COUNSELLING',
          {
            dispensationId:
              command.dispensationId,

            status:
              command.input.status,

            topicCount:
              command.input.topics?.length ??
              0,
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

        const selectedIds =
          command.input.dispensationItemIds ===
          undefined
            ? items
                .filter(
                  (item) =>
                    [
                      'DISPENSED',
                      'PARTIALLY_DISPENSED',
                    ].includes(
                      item.status,
                    ),
                )
                .map(
                  (item) =>
                    item._id.toHexString(),
                )
            : [
                ...command.input
                  .dispensationItemIds,
              ];

        const availableIds =
          new Set(
            items.map(
              (item) =>
                item._id.toHexString(),
            ),
          );

        if (
          selectedIds.some(
            (id) =>
              !availableIds.has(id),
          )
        ) {
          throw new ConflictError(
            'Counselling references a dispensing item outside this dispensation',
          );
        }

        const completed =
          command.input.status ===
          'COMPLETED';

        const record =
          await this.repository.createCounselling(
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
                dispensation._id,

              patientId:
                dispensation.patientId,

              dispensationItemIds:
                selectedIds.map(
                  (id) =>
                    toObjectId(
                      id,
                      'dispensationItemId',
                    ),
                ),

              counsellingRequired:
                command.input.status !==
                'NOT_REQUIRED',

              status:
                command.input.status,

              topics:
                [
                  ...(command.input.topics ??
                    []),
                ],

              languageCode:
                command.input.languageCode,

              interpreterUsed:
                command.input.interpreterUsed ??
                false,

              interpreterStaffId:
                command.input.interpreterStaffId ==
                null
                  ? null
                  : toObjectId(
                      command.input.interpreterStaffId,
                      'interpreterStaffId',
                    ),

              interpreterName:
                command.input.interpreterName ??
                null,

              counselledPerson:
                command.input.counselledPerson ??
                'PATIENT',

              caregiverName:
                command.input.caregiverName ??
                null,

              acknowledgementMethod:
                command.input.acknowledgementMethod ??
                null,

              acknowledgementAttachmentId:
                command.input
                  .acknowledgementAttachmentId ==
                null
                  ? null
                  : toObjectId(
                      command.input
                        .acknowledgementAttachmentId,
                      'acknowledgementAttachmentId',
                    ),

              completedByStaffId:
                completed
                  ? toObjectId(
                      operational.actor.staffId,
                      'completedByStaffId',
                    )
                  : null,

              completedAt:
                completed
                  ? occurredAt
                  : null,

              declinedReason:
                command.input.declinedReason ??
                null,

              unableReason:
                command.input.unableReason ??
                null,

              notes:
                command.input.notes ??
                null,

              correctionOfCounsellingRecordId:
                null,

              attachmentIds:
                (
                  command.input.attachmentIds ??
                  []
                ).map(
                  (id) =>
                    toObjectId(
                      id,
                      'attachmentId',
                    ),
                ),
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
                'pharmacy.counselling.recorded',
                record._id.toHexString(),
              ),

            action:
              completed
                ? 'pharmacy.counselling.completed'
                : 'pharmacy.counselling.recorded',

            entityType:
              'PHARMACY_COUNSELLING',

            entityId:
              record._id.toHexString(),

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

              status:
                record.status,

              languageCode:
                record.languageCode,

              interpreterUsed:
                record.interpreterUsed,

              topicCount:
                record.topics.length,
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
                'pharmacy.counselling.recorded.v1',
                record._id.toHexString(),
              ),

            eventType:
              completed
                ? 'pharmacy.counselling.completed.v1'
                : 'pharmacy.counselling.recorded.v1',

            aggregateType:
              'PHARMACY_COUNSELLING',

            aggregateId:
              record._id.toHexString(),

            actorUserId:
              command.actor.userId,

            facilityId:
              command.actor.facilityId,

            correlationId:
              command.actor.correlationId,

            occurredAt,

            payload: {
              dispensationId:
                dispensation._id.toHexString(),

              pharmacyLocationId:
                dispensation.pharmacyLocationId.toHexString(),

              status:
                record.status,
            },
          },

          transaction.session,
        );

        return record;
      },
    });
  }
}