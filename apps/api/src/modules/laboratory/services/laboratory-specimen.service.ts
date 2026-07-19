import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CollectLaboratorySpecimenInput,
  LaboratoryActorContext,
  PrintLaboratorySpecimenLabelInput,
  ReceiveLaboratorySpecimenInput,
  RejectLaboratorySpecimenInput,
} from '../laboratory.types.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratorySpecimenRecord,
} from '../laboratory.persistence.types.js';

import {
  LABORATORY_LOCK_NAMESPACE,
  LABORATORY_NUMBER_SEQUENCE_NAMESPACE,
  LABORATORY_TRANSACTION_TYPES,
} from '../laboratory.constants.js';

import {
  LABORATORY_REALTIME_EVENTS,
  LABORATORY_TRANSACTION_STATES,
} from '../laboratory.transaction.constants.js';

import {
  LaboratoryOrderItemConcurrencyError,
  LaboratoryOrderItemNotFoundError,
  LaboratorySpecimenConcurrencyError,
  LaboratorySpecimenNotFoundError,
} from '../laboratory.errors.js';

import {
  assertLaboratorySpecimenTransition,
} from '../laboratory.lifecycle.js';

import {
  laboratoryContentHash,
  nullableLaboratoryDecimal128,
} from '../laboratory.normalization.js';

import {
  formatLaboratoryNumber,
  laboratoryLockKey,
} from '../laboratory.workflow-helpers.js';

import {
  LaboratoryCommandService,
} from './laboratory-command.service.js';

import {
  LaboratorySpecimenRepository,
} from '../repositories/laboratory-specimen.repository.js';

interface SpecimenMutationCommand<T> {
  actor: LaboratoryActorContext;
  specimenId: string;
  input: T;
  idempotencyKey: string;
}

interface AccessionCommand {
  actor: LaboratoryActorContext;
  orderItemId: string;
  requirementCode: string;
  idempotencyKey: string;
}

export class LaboratorySpecimenService {
  public constructor(
    private readonly support: LaboratoryCommandService,
    private readonly specimens: LaboratorySpecimenRepository,
  ) {}

  private async requireSpecimen(
    actor: LaboratoryActorContext,
    specimenId: string,
  ): Promise<LaboratorySpecimenRecord> {
    const specimen = await this.specimens.findById(
      actor.facilityId,
      specimenId,
    );

    if (specimen === null) {
      throw new LaboratorySpecimenNotFoundError();
    }

    return specimen;
  }

  private async requireOrderItem(
    actor: LaboratoryActorContext,
    orderItemId: string,
  ): Promise<LaboratoryOrderItemRecord> {
    const item = await this.support.orders.findItemById(
      actor.facilityId,
      orderItemId,
    );

    if (item === null) {
      throw new LaboratoryOrderItemNotFoundError();
    }

    return item;
  }

  private async appendHistory(
    actor: LaboratoryActorContext,
    transactionId: string,
    specimen: LaboratorySpecimenRecord,
    fromStatus: LaboratorySpecimenRecord['status'] | null,
    toStatus: LaboratorySpecimenRecord['status'],
    occurredAt: Date,
    reasonCode: string | null,
    reason: string | null,
  ): Promise<void> {
    const existing = await this.specimens.listHistory(
      actor.facilityId,
      specimen._id.toHexString(),
    );

    const actorId = toObjectId(
      actor.userId,
      'actorUserId',
    );

    await this.specimens.appendHistory({
      facilityId: specimen.facilityId,
      labSpecimenId: specimen._id,
      labOrderId: specimen.labOrderId,
      patientId: specimen.patientId,
      encounterId: specimen.encounterId,
      sequence: existing.length + 1,
      fromStatus,
      toStatus,
      changeSource: 'LABORATORY_STAFF',
      reasonCode,
      reason,
      stateHash: laboratoryContentHash({
        specimenId: specimen._id.toHexString(),
        status: toStatus,
        version: specimen.version,
        occurredAt,
      }),
      occurredAt,
      changedBy: actorId,
      transactionId,
      correlationId: actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  private async publish(
    actor: LaboratoryActorContext,
    specimen: LaboratorySpecimenRecord,
  ): Promise<void> {
    await this.support.dependencies.realtime.publish({
      eventType:
        LABORATORY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
      facilityId: actor.facilityId,
      patientId: specimen.patientId.toHexString(),
      encounterId: specimen.encounterId.toHexString(),
      orderId: specimen.labOrderId.toHexString(),
      specimenId: specimen._id.toHexString(),
      payload: {
        specimenId: specimen._id.toHexString(),
        orderId: specimen.labOrderId.toHexString(),
        status: specimen.status,
        version: specimen.version,
      },
    });
  }

  public async accession(
    command: AccessionCommand,
  ): Promise<LaboratorySpecimenRecord> {
    const item = await this.requireOrderItem(
      command.actor,
      command.orderItemId,
    );

    const order = await this.support.requireOrder(
      command.actor,
      item.labOrderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      'ORDER_MANAGE',
      {
        order,
      },
    );

    const requirement =
      item.specimenRequirementsSnapshot.find(
        (candidate) =>
          candidate.requirementCode ===
          command.requirementCode.trim().toUpperCase(),
      );

    if (requirement === undefined) {
      throw new Error(
        'The requested specimen requirement is not part of the standardized Laboratory order item',
      );
    }

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.ACCEPT_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        laboratoryLockKey(
          LABORATORY_LOCK_NAMESPACE.ORDER_ITEM,
          command.actor.facilityId,
          command.orderItemId,
        ),
      ],
      idempotencyPayload: {
        orderItemId: command.orderItemId,
        requirementCode: command.requirementCode,
      },
      journalPayload: {
        operation: 'ACCESSION_SPECIMEN',
        orderId: order._id.toHexString(),
        orderItemId: command.orderItemId,
      },

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const year = occurredAt.getUTCFullYear();

        const accessionAllocation =
          await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            `${LABORATORY_NUMBER_SEQUENCE_NAMESPACE.ACCESSION}:${year}`,
          );

        const specimenAllocation =
          await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            `${LABORATORY_NUMBER_SEQUENCE_NAMESPACE.SPECIMEN}:${year}`,
          );

        const accessionNumber =
          formatLaboratoryNumber(
            'ACC',
            year,
            accessionAllocation.value,
          );

        const specimenIdentifier =
          formatLaboratoryNumber(
            'SP',
            year,
            specimenAllocation.value,
          );

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const existing =
          await this.specimens.listForOrderItem(
            command.actor.facilityId,
            command.orderItemId,
          );

        const specimen = await this.specimens.create({
          facilityId: toObjectId(
            command.actor.facilityId,
            'facilityId',
          ),
          accessionNumber,
          specimenIdentifier,
          labelCode:
            `${accessionNumber}-${specimenIdentifier}`,
          labOrderId: order._id,
          labOrderItemIds: [item._id],
          patientId: order.patientId,
          encounterId: order.encounterId,
          requirementCodeSnapshot:
            requirement.requirementCode,
          specimenTypeCodeSnapshot:
            requirement.specimenTypeCode,
          specimenTypeNameSnapshot:
            requirement.specimenTypeName,
          containerCodeSnapshot:
            requirement.containerCode,
          containerNameSnapshot:
            requirement.containerName,
          expectedMinimumVolume:
            requirement.minimumVolume,
          expectedVolumeUnitCode:
            requirement.volumeUnitCode,
          collectedVolume: null,
          collectedVolumeUnitCode: null,
          collectionMethod: null,
          collectionSite: null,
          status: 'PLANNED',
          labelPrintCount: 0,
          labelPrintedAt: null,
          labelPrintedBy: null,
          collectedAt: null,
          collectedBy: null,
          collectorStaffId: null,
          receivedAt: null,
          receivedBy: null,
          processingStartedAt: null,
          processingStartedBy: null,
          completedAt: null,
          completedBy: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReasonCode: null,
          rejectionReason: null,
          recollectionRequestedAt: null,
          recollectionRequestedBy: null,
          recollectionReason: null,
          recollectionOfSpecimenId:
            existing.at(-1)?._id ?? null,
          replacementSpecimenId: null,
          collectionAttempt: existing.length + 1,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
          lastStatusChangedAt: occurredAt,
          lastStatusChangedBy: actorId,
          transactionId: transaction.transactionId,
          correlationId: command.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorId,
          updatedBy: actorId,
        });

        const updatedItem =
          await this.support.orders.transitionItem(
            command.actor.facilityId,
            command.orderItemId,
            item.version,
            [
              'ACCEPTED',
              'COLLECTION_PENDING',
              'RECOLLECTION_REQUIRED',
            ],
            {
              status: 'COLLECTION_PENDING',
              activeSpecimenId: specimen._id,
              specimenCount: item.specimenCount + 1,
              recollectionCount:
                existing.length === 0
                  ? item.recollectionCount
                  : item.recollectionCount + 1,
              updatedBy: actorId,
            },
          );

        if (updatedItem === null) {
          throw new LaboratoryOrderItemConcurrencyError();
        }

        await this.appendHistory(
          command.actor,
          transaction.transactionId,
          specimen,
          null,
          'PLANNED',
          occurredAt,
          null,
          null,
        );

        await transaction.checkpoint(
          LABORATORY_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
          {
            specimenId: specimen._id.toHexString(),
            status: specimen.status,
          },
        );

        await this.publish(command.actor, specimen);

        return specimen;
      },
    });
  }

  public async printLabel(
    command: SpecimenMutationCommand<PrintLaboratorySpecimenLabelInput>,
  ): Promise<LaboratorySpecimenRecord> {
    const current = await this.requireSpecimen(
      command.actor,
      command.specimenId,
    );

    const order = await this.support.requireOrder(
      command.actor,
      current.labOrderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      'ORDER_MANAGE',
      {
        order,
      },
    );

    assertLaboratorySpecimenTransition(
      current.status,
      'LABEL_PRINTED',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.PRINT_SPECIMEN_LABEL,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        laboratoryLockKey(
          LABORATORY_LOCK_NAMESPACE.SPECIMEN,
          command.actor.facilityId,
          command.specimenId,
        ),
      ],
      idempotencyPayload: command.input,
      journalPayload: {
        operation: 'PRINT_SPECIMEN_LABEL',
        specimenId: command.specimenId,
      },

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.specimens.transitionStatus(
            command.actor.facilityId,
            command.specimenId,
            command.input.expectedVersion,
            ['PLANNED'],
            {
              status: 'LABEL_PRINTED',
              labelPrintCount:
                current.labelPrintCount + 1,
              labelPrintedAt: occurredAt,
              labelPrintedBy: actorId,
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratorySpecimenConcurrencyError();
        }

        await this.appendHistory(
          command.actor,
          transaction.transactionId,
          updated,
          current.status,
          updated.status,
          occurredAt,
          null,
          null,
        );

        await this.publish(command.actor, updated);

        return updated;
      },
    });
  }

  public async collect(
    command: SpecimenMutationCommand<CollectLaboratorySpecimenInput>,
  ): Promise<LaboratorySpecimenRecord> {
    const current = await this.requireSpecimen(
      command.actor,
      command.specimenId,
    );

    const order = await this.support.requireOrder(
      command.actor,
      current.labOrderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      'SPECIMEN_COLLECT',
      {
        order,
      },
    );

    assertLaboratorySpecimenTransition(
      current.status,
      'COLLECTED',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.COLLECT_SPECIMEN,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        laboratoryLockKey(
          LABORATORY_LOCK_NAMESPACE.SPECIMEN,
          command.actor.facilityId,
          command.specimenId,
        ),
      ],
      idempotencyPayload: command.input,
      journalPayload: {
        operation: 'COLLECT_SPECIMEN',
        specimenId: command.specimenId,
      },

      execute: async (transaction) => {
        const occurredAt =
          new Date(command.input.collectedAt);

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.specimens.transitionStatus(
            command.actor.facilityId,
            command.specimenId,
            command.input.expectedVersion,
            ['PLANNED', 'LABEL_PRINTED'],
            {
              status: 'COLLECTED',
              collectedVolume:
                nullableLaboratoryDecimal128(
                  command.input.collectedVolume,
                ),
              collectedVolumeUnitCode:
                command.input.collectedVolumeUnitCode ?? null,
              collectionMethod:
                command.input.collectionMethod,
              collectionSite:
                command.input.collectionSite ?? null,
              collectedAt: occurredAt,
              collectedBy: actorId,
              collectorStaffId: toObjectId(
                command.input.collectorStaffId,
                'collectorStaffId',
              ),
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratorySpecimenConcurrencyError();
        }

        for (const itemId of updated.labOrderItemIds) {
          const item = await this.requireOrderItem(
            command.actor,
            itemId.toHexString(),
          );

          await this.support.orders.transitionItem(
            command.actor.facilityId,
            itemId.toHexString(),
            item.version,
            ['COLLECTION_PENDING', 'ACCEPTED'],
            {
              status: 'SPECIMEN_COLLECTED',
              updatedBy: actorId,
            },
          );
        }

        await this.appendHistory(
          command.actor,
          transaction.transactionId,
          updated,
          current.status,
          updated.status,
          occurredAt,
          null,
          null,
        );

        await this.publish(command.actor, updated);

        return updated;
      },
    });
  }

  public async receive(
    command: SpecimenMutationCommand<ReceiveLaboratorySpecimenInput>,
  ): Promise<LaboratorySpecimenRecord> {
    const current = await this.requireSpecimen(
      command.actor,
      command.specimenId,
    );

    const order = await this.support.requireOrder(
      command.actor,
      current.labOrderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      'SPECIMEN_RECEIVE',
      {
        order,
      },
    );

    assertLaboratorySpecimenTransition(
      current.status,
      'RECEIVED',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.RECEIVE_SPECIMEN,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        laboratoryLockKey(
          LABORATORY_LOCK_NAMESPACE.SPECIMEN,
          command.actor.facilityId,
          command.specimenId,
        ),
      ],
      idempotencyPayload: command.input,
      journalPayload: {
        operation: 'RECEIVE_SPECIMEN',
        specimenId: command.specimenId,
      },

      execute: async (transaction) => {
        const occurredAt =
          new Date(command.input.receivedAt);

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.specimens.transitionStatus(
            command.actor.facilityId,
            command.specimenId,
            command.input.expectedVersion,
            ['COLLECTED'],
            {
              status: 'RECEIVED',
              receivedAt: occurredAt,
              receivedBy: actorId,
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratorySpecimenConcurrencyError();
        }

        for (const itemId of updated.labOrderItemIds) {
          const item = await this.requireOrderItem(
            command.actor,
            itemId.toHexString(),
          );

          await this.support.orders.transitionItem(
            command.actor.facilityId,
            itemId.toHexString(),
            item.version,
            ['SPECIMEN_COLLECTED'],
            {
              status: 'SPECIMEN_RECEIVED',
              updatedBy: actorId,
            },
          );
        }

        await this.appendHistory(
          command.actor,
          transaction.transactionId,
          updated,
          current.status,
          updated.status,
          occurredAt,
          null,
          null,
        );

        await this.publish(command.actor, updated);

        return updated;
      },
    });
  }

  public async reject(
    command: SpecimenMutationCommand<RejectLaboratorySpecimenInput>,
  ): Promise<LaboratorySpecimenRecord> {
    const current = await this.requireSpecimen(
      command.actor,
      command.specimenId,
    );

    const order = await this.support.requireOrder(
      command.actor,
      current.labOrderId.toHexString(),
    );

    await this.support.assertAccess(
      command.actor,
      'SPECIMEN_REJECT',
      {
        order,
      },
    );

    const targetStatus =
      command.input.requestRecollection === true
        ? 'RECOLLECTION_REQUIRED'
        : 'REJECTED';

    assertLaboratorySpecimenTransition(
      current.status,
      targetStatus,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        command.input.requestRecollection === true
          ? LABORATORY_TRANSACTION_TYPES.REQUEST_RECOLLECTION
          : LABORATORY_TRANSACTION_TYPES.REJECT_SPECIMEN,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: [
        laboratoryLockKey(
          LABORATORY_LOCK_NAMESPACE.SPECIMEN,
          command.actor.facilityId,
          command.specimenId,
        ),
      ],
      idempotencyPayload: command.input,
      journalPayload: {
        operation: 'REJECT_SPECIMEN',
        specimenId: command.specimenId,
        targetStatus,
      },

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.specimens.transitionStatus(
            command.actor.facilityId,
            command.specimenId,
            command.input.expectedVersion,
            ['COLLECTED', 'RECEIVED', 'PROCESSING'],
            {
              status: targetStatus,
              rejectedAt: occurredAt,
              rejectedBy: actorId,
              rejectionReasonCode:
                command.input.reasonCode
                  .trim()
                  .toUpperCase(),
              rejectionReason:
                command.input.reason.trim(),
              recollectionRequestedAt:
                command.input.requestRecollection === true
                  ? occurredAt
                  : null,
              recollectionRequestedBy:
                command.input.requestRecollection === true
                  ? actorId
                  : null,
              recollectionReason:
                command.input.requestRecollection === true
                  ? command.input.reason.trim()
                  : null,
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratorySpecimenConcurrencyError();
        }

        for (const itemId of updated.labOrderItemIds) {
          const item = await this.requireOrderItem(
            command.actor,
            itemId.toHexString(),
          );

          await this.support.orders.transitionItem(
            command.actor.facilityId,
            itemId.toHexString(),
            item.version,
            [
              'SPECIMEN_COLLECTED',
              'SPECIMEN_RECEIVED',
              'IN_PROGRESS',
            ],
            {
              status:
                command.input.requestRecollection === true
                  ? 'RECOLLECTION_REQUIRED'
                  : 'REJECTED',
              rejectedAt: occurredAt,
              rejectedBy: actorId,
              rejectionReasonCode:
                command.input.reasonCode
                  .trim()
                  .toUpperCase(),
              rejectionReason:
                command.input.reason.trim(),
              updatedBy: actorId,
            },
          );
        }

        await this.appendHistory(
          command.actor,
          transaction.transactionId,
          updated,
          current.status,
          updated.status,
          occurredAt,
          command.input.reasonCode,
          command.input.reason,
        );

        await this.publish(command.actor, updated);

        return updated;
      },
    });
  }
}