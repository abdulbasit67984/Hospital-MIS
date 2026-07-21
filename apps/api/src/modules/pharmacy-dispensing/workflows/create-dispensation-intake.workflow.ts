import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreateDispensationIntakeInput,
  PharmacyDispensationView,
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_EVENT_TYPES,
  PHARMACY_DISPENSING_NUMBER_SEQUENCE_NAMESPACE,
  PHARMACY_DISPENSING_REALTIME_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  PHARMACY_DISPENSING_AUDIT_ACTIONS,
  PHARMACY_DISPENSING_OUTBOX_EVENTS,
  PHARMACY_DISPENSING_TRANSACTION_STATES,
} from '../pharmacy-dispensing.transaction.constants.js';

import {
  dispensationSnapshot,
  formatDispensationNumber,
  pharmacyDeduplicationKey,
  pharmacyOperationKey,
  pharmacySnapshotHash,
  prescriptionDispensingLockKeys,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

export interface CreateDispensationIntakeCommand {
  actor: PharmacyDispensingActorContext;
  input: CreateDispensationIntakeInput;
  idempotencyKey: string;
}

function defaultExpiry(
  queuedAt: Date,
  prescriptionExpiry: Date | null,
  requestedExpiry: string | undefined,
): Date {
  const operationalExpiry =
    requestedExpiry === undefined
      ? new Date(
          queuedAt.getTime() +
            8 * 60 * 60 * 1_000,
        )
      : new Date(requestedExpiry);

  if (
    prescriptionExpiry !== null &&
    prescriptionExpiry.getTime() <
      operationalExpiry.getTime()
  ) {
    return prescriptionExpiry;
  }

  return operationalExpiry;
}

export class CreateDispensationIntakeWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
  ) {}

  public async execute(
    command: CreateDispensationIntakeCommand,
  ): Promise<PharmacyDispensationRecord> {
    const now =
      this.support.dependencies.clock.now();

    const initial =
      await this.support.prepareIntake(
        command.actor,
        command.input,
        now,
      );

    const operationalContext =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          command.input.pharmacyLocationId,
          {
            patientId:
              initial.prescription.patientId.toHexString(),
            encounterId:
              initial.prescription.encounterId.toHexString(),
            admissionId:
              command.input.admissionId ??
              null,
            wardId:
              command.input.wardId ??
              null,
            requireControlledMedicine:
              initial.items.some(
                (item) =>
                  item.formulary.controlledMedicine ||
                  item.inventory.controlledMedicine,
              ),
          },
        );

    await this.support.assertAccess({
      actor: command.actor,
      action: 'VERIFY',
      location: {
        ...operationalContext.location,
        allowsGeneralStock: true,
      },
      patientId:
        initial.prescription.patientId.toHexString(),
      admissionId:
        command.input.admissionId ?? null,
    });

    const result =
      await this.support.dependencies.transactions.execute({
        transactionType:
          PHARMACY_DISPENSING_TRANSACTION_TYPES.INTAKE,
        idempotencyKey:
          command.idempotencyKey,
        actorUserId:
          command.actor.userId,
        facilityId:
          command.actor.facilityId,
        correlationId:
          command.actor.correlationId,
        lockKeys:
          prescriptionDispensingLockKeys(
            command.actor.facilityId,
            command.input.prescriptionId,
            initial.prescription.patientId.toHexString(),
          ),
        idempotencyPayload: {
          prescriptionId:
            command.input.prescriptionId,
          expectedPrescriptionVersion:
            command.input.expectedPrescriptionVersion,
          context:
            command.input.context,
          pharmacyLocationId:
            command.input.pharmacyLocationId,
          admissionId:
            command.input.admissionId ?? null,
          wardId:
            command.input.wardId ?? null,
          items:
            command.input.items ?? null,
        },
        journalPayload:
          safePharmacyJournalPayload(
            'CREATE_DISPENSATION_INTAKE',
            {
              prescriptionId:
                command.input.prescriptionId,
              patientId:
                initial.prescription.patientId.toHexString(),
              context:
                command.input.context,
              pharmacyLocationId:
                command.input.pharmacyLocationId,
              lineCount:
                initial.items.length,
            },
          ),
        execute: async (transaction) => {
          const occurredAt =
            this.support.dependencies.clock.now();

          const prepared =
            await this.support.prepareIntake(
              command.actor,
              command.input,
              occurredAt,
              transaction.session,
            );

          await transaction.checkpoint(
            PHARMACY_DISPENSING_TRANSACTION_STATES.PRESCRIPTION_VALIDATED,
            {
              prescriptionId:
                prepared.prescription._id.toHexString(),
              prescriptionVersion:
                prepared.prescription.version,
              lineCount:
                prepared.items.length,
            },
          );

          const sequence =
            await this.support.dependencies.sequence.next(
              command.actor.facilityId,
              PHARMACY_DISPENSING_NUMBER_SEQUENCE_NAMESPACE,
            );

          const dispensationNumber =
            formatDispensationNumber(
              occurredAt,
              sequence.value,
            );

          const operationKey =
            pharmacyOperationKey(
              command.actor.facilityId,
              'intake',
              command.idempotencyKey,
            );

          const expiresAt =
            defaultExpiry(
              occurredAt,
              prepared.prescription.expiresAt,
              command.input.expiresAt,
            );

          const aggregate =
            await this.support.dependencies.repository
              .createAggregate(
                command.input,
                {
                  dispensationNumber,
                  patientId:
                    prepared.prescription.patientId.toHexString(),
                  prescription:
                    prepared.prescription,
                  prescriptionItems:
                    prepared.items.map(
                      (item) =>
                        item.prescriptionItem,
                    ),
                  itemContexts:
                    prepared.itemContexts,
                  actorUserId:
                    command.actor.userId,
                  transactionId:
                    transaction.transactionId,
                  correlationId:
                    command.actor.correlationId,
                  queuedAt:
                    occurredAt,
                  expiresAt,
                  operationKey,
                },
                transaction.session,
              );

          await transaction.checkpoint(
            PHARMACY_DISPENSING_TRANSACTION_STATES.DISPENSATION_CREATED,
            {
              dispensationId:
                aggregate.dispensation._id.toHexString(),
              dispensationNumber:
                aggregate.dispensation.dispensationNumber,
            },
          );

          const snapshot =
            dispensationSnapshot(
              aggregate.dispensation,
            );

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
                  aggregate.dispensation._id,
                dispensationItemId:
                  null,
                patientId:
                  aggregate.dispensation.patientId,
                sequence: 1,
                fromStatus:
                  null,
                toStatus:
                  'PENDING_REVIEW',
                changeSource:
                  'PHARMACY',
                actorStaffId:
                  toObjectId(
                    operationalContext.actor.staffId,
                    'actorStaffId',
                  ),
                reason:
                  'Prescription received by pharmacy',
                snapshotHash:
                  pharmacySnapshotHash(
                    snapshot,
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
                  PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_CREATED,
                  aggregate.dispensation._id.toHexString(),
                ),
              action:
                PHARMACY_DISPENSING_AUDIT_ACTIONS.DISPENSATION_CREATED,
              entityType:
                'DISPENSATION',
              entityId:
                aggregate.dispensation._id.toHexString(),
              actorUserId:
                command.actor.userId,
              actorStaffId:
                operationalContext.actor.staffId,
              facilityId:
                command.actor.facilityId,
              correlationId:
                command.actor.correlationId,
              ...(command.actor.ipAddress === undefined
                ? {}
                : {
                    ipAddress:
                      command.actor.ipAddress,
                  }),
              ...(command.actor.userAgent === undefined
                ? {}
                : {
                    userAgent:
                      command.actor.userAgent,
                  }),
              occurredAt,
              after:
                snapshot,
              metadata: {
                prescriptionId:
                  prepared.prescription._id.toHexString(),
                lineCount:
                  aggregate.items.length,
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
                  PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_CREATED,
                  aggregate.dispensation._id.toHexString(),
                ),
              eventType:
                PHARMACY_DISPENSING_OUTBOX_EVENTS.DISPENSATION_CREATED,
              aggregateType:
                'DISPENSATION',
              aggregateId:
                aggregate.dispensation._id.toHexString(),
              actorUserId:
                command.actor.userId,
              facilityId:
                command.actor.facilityId,
              correlationId:
                command.actor.correlationId,
              occurredAt,
              payload: {
                dispensationId:
                  aggregate.dispensation._id.toHexString(),
                prescriptionId:
                  aggregate.dispensation.prescriptionId.toHexString(),
                pharmacyLocationId:
                  aggregate.dispensation.pharmacyLocationId.toHexString(),
                status:
                  aggregate.dispensation.status,
                priority:
                  aggregate.dispensation.priority,
              },
            },
            transaction.session,
          );

          await transaction.checkpoint(
            PHARMACY_DISPENSING_TRANSACTION_STATES.OUTBOX_RECORDED,
          );

          return aggregate.dispensation;
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
            PHARMACY_DISPENSING_EVENT_TYPES.INTAKE_CREATED,
          dispensationId:
            result._id.toHexString(),
          status:
            result.status,
          priority:
            result.priority,
        },
      })
      .catch(() => undefined);

    return result;
  }
}