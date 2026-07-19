import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreateRadiologyOrderInput,
  RadiologyActorContext,
} from '../radiology.types.js';

import type {
  RadiologyOrderItemRecord,
  RadiologyOrderItemStatusHistoryRecord,
  RadiologyOrderRecord,
  RadiologyOrderStatusHistoryRecord,
} from '../radiology.persistence.types.js';

import {
  RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE,
  RADIOLOGY_TRANSACTION_TYPES,
} from '../radiology.constants.js';

import {
  RADIOLOGY_AUDIT_ACTIONS,
  RADIOLOGY_OUTBOX_EVENTS,
  RADIOLOGY_REALTIME_EVENTS,
  RADIOLOGY_TRANSACTION_STATES,
} from '../radiology.transaction.constants.js';

import {
  deleteCreatedRadiologyRecordCompensation,
  deleteCreatedRadiologyRecordSetCompensation,
} from '../radiology.mutation-snapshots.js';

import {
  buildRadiologySequenceKey,
  formatRadiologyNumber,
  radiologyContentHash,
  turnaroundMinutesForRadiologyPriority,
} from '../radiology.normalization.js';

import {
  radiologyOrderCreateLockKeys,
  safeRadiologyOrderAuditSnapshot,
  safeRadiologyOrderEventPayload,
  safeRadiologyOrderJournalPayload,
} from '../radiology.workflow-helpers.js';

import {
  createRadiologyOrderBodySchema,
} from '../radiology.validation.js';

import {
  RadiologyCommandService,
} from '../services/radiology-command.service.js';

export interface CreateRadiologyOrderCommand {
  actor: RadiologyActorContext;
  input: CreateRadiologyOrderInput;
  idempotencyKey: string;
}

export class CreateRadiologyOrderWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: CreateRadiologyOrderCommand,
  ): Promise<{
    order: RadiologyOrderRecord;
    items: RadiologyOrderItemRecord[];
  }> {
    const input = createRadiologyOrderBodySchema.parse(command.input);

    await this.support.resolveOrderClinicalContext(
      command.actor,
      input.encounterId,
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CREATE_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyOrderCreateLockKeys(
        command.actor.facilityId,
        input.encounterId,
      ),
      idempotencyPayload: {
        facilityId: command.actor.facilityId,
        encounterId: input.encounterId,
        requestHash: radiologyContentHash(input),
      },
      journalPayload: safeRadiologyOrderJournalPayload(
        'CREATE_ORDER',
        {
          encounterId: input.encounterId,
          status: 'ORDERED',
          priority: input.priority,
          itemCount: input.items.length,
        },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const context = await this.support.resolveOrderClinicalContext(
          command.actor,
          input.encounterId,
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CONTEXT_VALIDATED,
          {
            encounterId: context.encounterId,
            departmentId: context.departmentId,
          },
        );

        const selections = await this.support.resolveOrderableSelections(
          command.actor,
          context,
          input.items,
          occurredAt,
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.CATALOG_REFERENCES_VALIDATED,
          {
            procedureCount: selections.length,
          },
        );

        const year = occurredAt.getUTCFullYear();
        const allocation = await this.support.dependencies.sequence.next(
          command.actor.facilityId,
          buildRadiologySequenceKey(
            RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE.ORDER,
            year,
          ),
        );
        const orderNumber = formatRadiologyNumber(
          'RAD',
          year,
          allocation.value,
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.NUMBER_ALLOCATED,
          {
            sequenceKey: allocation.key,
          },
        );

        const actorUserId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );
        const providerStaffId = toObjectId(
          context.orderingProviderId,
          'orderingProviderId',
        );
        const facilityId = toObjectId(
          command.actor.facilityId,
          'facilityId',
        );
        const orderId = new Types.ObjectId();
        const orderHistoryId = new Types.ObjectId();
        const itemHistoryIds: Types.ObjectId[] = [];

        const orderInput: Omit<
          RadiologyOrderRecord,
          'createdAt' | 'updatedAt'
        > = {
          _id: orderId,
          facilityId,
          orderNumber,
          patientId: toObjectId(context.patientId, 'patientId'),
          requestedPatientId: toObjectId(
            context.requestedPatientId,
            'requestedPatientId',
          ),
          canonicalRedirected: context.canonicalRedirected,
          encounterId: toObjectId(context.encounterId, 'encounterId'),
          registrationId:
            context.registrationId === null
              ? null
              : toObjectId(context.registrationId, 'registrationId'),
          opdVisitId:
            context.opdVisitId === null
              ? null
              : toObjectId(context.opdVisitId, 'opdVisitId'),
          queueTokenId:
            context.queueTokenId === null
              ? null
              : toObjectId(context.queueTokenId, 'queueTokenId'),
          departmentId: toObjectId(context.departmentId, 'departmentId'),
          clinicId:
            context.clinicId === null
              ? null
              : toObjectId(context.clinicId, 'clinicId'),
          servicePointId:
            context.servicePointId === null
              ? null
              : toObjectId(context.servicePointId, 'servicePointId'),
          orderingProviderId: providerStaffId,
          priority: input.priority,
          status: 'ORDERED',
          clinicalIndication: input.clinicalIndication.trim(),
          orderingNotes: input.orderingNotes?.trim() ?? null,
          orderedAt: occurredAt,
          acceptedAt: null,
          acceptedBy: null,
          scheduledAt: null,
          checkedInAt: null,
          examinationStartedAt: null,
          examinationCompletedAt: null,
          verifiedAt: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReasonCode: null,
          rejectionReason: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
          itemCount: selections.length,
          activeItemCount: selections.length,
          scheduledItemCount: 0,
          completedItemCount: 0,
          reportedItemCount: 0,
          verifiedItemCount: 0,
          rejectedItemCount: 0,
          lastStatusChangedAt: occurredAt,
          lastStatusChangedBy: providerStaffId,
          transactionId: transaction.transactionId,
          correlationId: command.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        };

        const itemInputs: Array<
          Omit<RadiologyOrderItemRecord, 'createdAt' | 'updatedAt'>
        > = selections.map((selection, index) => {
          const snapshot = this.support.procedureDefinitionSnapshot(
            selection,
            occurredAt,
          );
          const itemId = new Types.ObjectId();
          const turnaroundMinutes =
            turnaroundMinutesForRadiologyPriority(
              selection.procedure,
              input.priority,
            );

          return {
            _id: itemId,
            facilityId,
            radiologyOrderId: orderId,
            patientId: orderInput.patientId,
            encounterId: orderInput.encounterId,
            sequence: index + 1,
            radiologyProcedureId: selection.procedure._id,
            procedureDefinitionSnapshot: snapshot,
            procedureDefinitionHash:
              this.support.procedureDefinitionHash(snapshot),
            requestedLaterality: selection.input.requestedLaterality,
            contrastRequested: selection.input.contrastRequested,
            requestedContrastRoute:
              selection.input.requestedContrastRoute ?? null,
            specialInstructions:
              selection.input.specialInstructions?.trim() ?? null,
            priority: input.priority,
            status: 'ORDERED',
            orderedAt: occurredAt,
            dueAt: new Date(
              occurredAt.getTime() + turnaroundMinutes * 60_000,
            ),
            preparationStatus:
              snapshot.preparationInstructions.length === 0
                ? 'NOT_REQUIRED'
                : 'PENDING',
            safetyScreeningStatus:
              snapshot.safetyScreeningRequirements.length === 0
                ? 'NOT_REQUIRED'
                : 'PENDING',
            appointmentId: null,
            imagingStudyId: null,
            reportId: null,
            accessionNumber: null,
            externalStudyIdentifier: null,
            acceptedAt: null,
            acceptedBy: null,
            scheduledAt: null,
            checkedInAt: null,
            examinationStartedAt: null,
            examinationCompletedAt: null,
            verifiedAt: null,
            rejectedAt: null,
            rejectedBy: null,
            rejectionReasonCode: null,
            rejectionReason: null,
            cancelledAt: null,
            cancelledBy: null,
            cancellationReason: null,
            chargeCatalogItemId: selection.procedure.chargeCatalogItemId,
            accountChargeId: null,
            billingStatus:
              selection.procedure.chargeCatalogItemId === null
                ? 'NOT_REQUESTED'
                : 'PENDING',
            billingFailureCode: null,
            transactionId: transaction.transactionId,
            correlationId: command.actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          };
        });

        const orderHistory: Omit<
          RadiologyOrderStatusHistoryRecord,
          'createdAt' | 'updatedAt'
        > = {
          _id: orderHistoryId,
          facilityId,
          radiologyOrderId: orderId,
          patientId: orderInput.patientId,
          encounterId: orderInput.encounterId,
          sequence: 1,
          fromStatus: null,
          toStatus: 'ORDERED',
          changeSource: 'ORDERING_PROVIDER',
          reasonCode: null,
          reason: null,
          occurredAt,
          changedBy: providerStaffId,
          transactionId: transaction.transactionId,
          correlationId: command.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        };

        const itemHistories: Array<
          Omit<
            RadiologyOrderItemStatusHistoryRecord,
            'createdAt' | 'updatedAt'
          >
        > = itemInputs.map((item) => {
          const historyId = new Types.ObjectId();
          itemHistoryIds.push(historyId);

          return {
            _id: historyId,
            facilityId,
            radiologyOrderId: orderId,
            radiologyOrderItemId: item._id,
            patientId: item.patientId,
            encounterId: item.encounterId,
            sequence: 1,
            fromStatus: null,
            toStatus: 'ORDERED',
            changeSource: 'ORDERING_PROVIDER',
            reasonCode: null,
            reason: null,
            occurredAt,
            changedBy: providerStaffId,
            transactionId: transaction.transactionId,
            correlationId: command.actor.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          };
        });

        const created = await this.support.orders.create(
          orderInput,
          itemInputs,
          orderHistory,
          itemHistories,
        );

        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordSetCompensation(
            `delete-order-item-histories:${orderId.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyOrderItemStatusHistories',
              entityIds: itemHistoryIds.map((id) => id.toHexString()),
              transactionId: transaction.transactionId,
            },
          ),
        );
        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordCompensation(
            `delete-order-history:${orderHistoryId.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyOrderStatusHistories',
              entityId: orderHistoryId.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );
        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordSetCompensation(
            `delete-order-items:${orderId.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyOrderItems',
              entityIds: created.items.map((item) => item._id.toHexString()),
              transactionId: transaction.transactionId,
            },
          ),
        );
        await transaction.registerCompensation(
          deleteCreatedRadiologyRecordCompensation(
            `delete-order:${orderId.toHexString()}`,
            {
              facilityId: command.actor.facilityId,
              collection: 'radiologyOrders',
              entityId: orderId.toHexString(),
              transactionId: transaction.transactionId,
            },
          ),
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.ITEMS_CREATED,
          {
            orderId: orderId.toHexString(),
            itemCount: created.items.length,
          },
        );
        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
          {
            orderId: orderId.toHexString(),
            orderHistorySequence: 1,
            itemHistoryCount: itemHistories.length,
          },
        );

        await this.support.requestOrderCharges(
          command.actor,
          transaction,
          created.order,
          created.items.map((item) => ({
            orderItemId: item._id.toHexString(),
            chargeCatalogItemId:
              item.chargeCatalogItemId?.toHexString() ?? null,
            expectedVersion: item.version,
          })),
          occurredAt,
        );

        const persistedItems = await this.support.orders.listItems(
          command.actor.facilityId,
          orderId.toHexString(),
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_AUDIT_ACTIONS.ORDER_CREATED,
            orderId.toHexString(),
          ),
          action: RADIOLOGY_AUDIT_ACTIONS.ORDER_CREATED,
          entityType: 'RadiologyOrder',
          entityId: orderId.toHexString(),
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before: null,
          after: safeRadiologyOrderAuditSnapshot(created.order),
          metadata: {
            procedureIds: selections.map((selection) =>
              selection.procedure._id.toHexString(),
            ),
          },
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey: this.support.deduplicationKey(
            transaction.transactionId,
            RADIOLOGY_OUTBOX_EVENTS.ORDER_CREATED,
            orderId.toHexString(),
          ),
          eventType: RADIOLOGY_OUTBOX_EVENTS.ORDER_CREATED,
          aggregateType: 'RadiologyOrder',
          aggregateId: orderId.toHexString(),
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload: safeRadiologyOrderEventPayload(created.order),
        });

        await this.support.publishOrderRealtime(
          command.actor,
          created.order,
          RADIOLOGY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
        );
        await this.support.publishOrderRealtime(
          command.actor,
          created.order,
          RADIOLOGY_REALTIME_EVENTS.ENCOUNTER_RADIOLOGY_CHANGED,
        );

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.REALTIME_PUBLISHED,
          {
            orderId: orderId.toHexString(),
          },
        );

        return {
          order: created.order,
          items: persistedItems,
        };
      },
    });
  }
}