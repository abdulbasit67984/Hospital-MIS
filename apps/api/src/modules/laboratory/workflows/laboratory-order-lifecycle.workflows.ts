import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  AcceptLaboratoryOrderInput,
  CancelLaboratoryOrderInput,
  LaboratoryActorContext,
} from '../laboratory.types.js';

import type {
  LaboratoryOrderRecord,
} from '../laboratory.persistence.types.js';

import {
  assertLaboratoryOrderTransition,
} from '../laboratory.lifecycle.js';

import {
  LABORATORY_TRANSACTION_TYPES,
} from '../laboratory.constants.js';

import {
  LABORATORY_AUDIT_ACTIONS,
  LABORATORY_OUTBOX_EVENTS,
  LABORATORY_REALTIME_EVENTS,
  LABORATORY_TRANSACTION_STATES,
} from '../laboratory.transaction.constants.js';

import {
  LaboratoryOrderConcurrencyError,
} from '../laboratory.errors.js';

import {
  laboratoryOrderMutationLockKeys,
  safeLaboratoryOrderAuditSnapshot,
  safeLaboratoryOrderEventPayload,
  safeLaboratoryOrderJournalPayload,
} from '../laboratory.workflow-helpers.js';

import {
  LaboratoryCommandService,
} from '../services/laboratory-command.service.js';

interface OrderMutationCommand<T> {
  actor: LaboratoryActorContext;
  orderId: string;
  input: T;
  idempotencyKey: string;
}

async function appendOrderHistory(
  support: LaboratoryCommandService,
  input: {
    actor: LaboratoryActorContext;
    transactionId: string;
    order: LaboratoryOrderRecord;
    fromStatus: LaboratoryOrderRecord['status'];
    toStatus: LaboratoryOrderRecord['status'];
    sequence: number;
    occurredAt: Date;
    reasonCode: string | null;
    reason: string | null;
  },
): Promise<void> {
  const actorId = toObjectId(
    input.actor.userId,
    'actorUserId',
  );

  await support.orders.appendHistory({
    facilityId: input.order.facilityId,
    labOrderId: input.order._id,
    patientId: input.order.patientId,
    encounterId: input.order.encounterId,
    sequence: input.sequence,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    changeSource: 'LABORATORY_STAFF',
    reasonCode: input.reasonCode,
    reason: input.reason,
    occurredAt: input.occurredAt,
    changedBy: actorId,
    transactionId: input.transactionId,
    correlationId: input.actor.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export class AcceptLaboratoryOrderWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: OrderMutationCommand<AcceptLaboratoryOrderInput>,
  ): Promise<LaboratoryOrderRecord> {
    const current = await this.support.requireOrder(
      command.actor,
      command.orderId,
    );

    await this.support.assertAccess(
      command.actor,
      'ORDER_MANAGE',
      {
        order: current,
      },
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'ORDER',
    );

    assertLaboratoryOrderTransition(
      current.status,
      'ACCEPTED',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.ACCEPT_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryOrderMutationLockKeys(
        command.actor.facilityId,
        current,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryOrderJournalPayload(
        'ACCEPT_ORDER',
        {
          orderId: command.orderId,
          encounterId:
            current.encounterId.toHexString(),
          status: 'ACCEPTED',
        },
      ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.support.orders.transitionStatus(
            command.actor.facilityId,
            command.orderId,
            command.input.expectedVersion,
            ['ORDERED'],
            {
              status: 'ACCEPTED',
              acceptedAt: occurredAt,
              acceptedBy: actorId,
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratoryOrderConcurrencyError();
        }

        await this.support.orders.transitionItemsForOrder(
          command.actor.facilityId,
          command.orderId,
          ['ORDERED'],
          {
            status: 'ACCEPTED',
            acceptedAt: occurredAt,
            acceptedBy: actorId,
            updatedBy: actorId,
          },
        );

        const history =
          await this.support.orders.listHistory(
            command.actor.facilityId,
            command.orderId,
          );

        await appendOrderHistory(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          order: updated,
          fromStatus: current.status,
          toStatus: 'ACCEPTED',
          sequence: history.length + 1,
          occurredAt,
          reasonCode: null,
          reason: null,
        });

        await transaction.checkpoint(
          LABORATORY_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
          {
            orderId: command.orderId,
            status: 'ACCEPTED',
          },
        );

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_AUDIT_ACTIONS.ORDER_ACCEPTED,
              command.orderId,
            ),
          action:
            LABORATORY_AUDIT_ACTIONS.ORDER_ACCEPTED,
          entityType: 'LabOrder',
          entityId: command.orderId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          before:
            safeLaboratoryOrderAuditSnapshot(current),
          after:
            safeLaboratoryOrderAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_OUTBOX_EVENTS.ORDER_ACCEPTED,
              command.orderId,
            ),
          eventType:
            LABORATORY_OUTBOX_EVENTS.ORDER_ACCEPTED,
          aggregateType: 'LabOrder',
          aggregateId: command.orderId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload:
            safeLaboratoryOrderEventPayload(updated),
        });

        await this.support.publishOrderRealtime(
          command.actor,
          updated,
          LABORATORY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
        );

        return updated;
      },
    });
  }
}

export class CancelLaboratoryOrderWorkflow {
  public constructor(
    private readonly support: LaboratoryCommandService,
  ) {}

  public async execute(
    command: OrderMutationCommand<CancelLaboratoryOrderInput>,
  ): Promise<LaboratoryOrderRecord> {
    const current = await this.support.requireOrder(
      command.actor,
      command.orderId,
    );

    await this.support.assertAccess(
      command.actor,
      'ORDER_CANCEL',
      {
        order: current,
      },
    );

    this.support.assertExpectedVersion(
      current,
      command.input.expectedVersion,
      'ORDER',
    );

    assertLaboratoryOrderTransition(
      current.status,
      'CANCELLED',
    );

    return this.support.dependencies.transactionManager.execute({
      transactionType:
        LABORATORY_TRANSACTION_TYPES.CANCEL_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: laboratoryOrderMutationLockKeys(
        command.actor.facilityId,
        current,
      ),
      idempotencyPayload: command.input,
      journalPayload: safeLaboratoryOrderJournalPayload(
        'CANCEL_ORDER',
        {
          orderId: command.orderId,
          encounterId:
            current.encounterId.toHexString(),
          status: 'CANCELLED',
        },
      ),

      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const actorId = toObjectId(
          command.actor.userId,
          'actorUserId',
        );

        const updated =
          await this.support.orders.transitionStatus(
            command.actor.facilityId,
            command.orderId,
            command.input.expectedVersion,
            [
              'ORDERED',
              'ACCEPTED',
              'PARTIALLY_COLLECTED',
              'SAMPLE_COLLECTED',
              'IN_PROGRESS',
              'PARTIALLY_COMPLETED',
              'RECOLLECTION_REQUIRED',
            ],
            {
              status: 'CANCELLED',
              cancelledAt: occurredAt,
              cancelledBy: actorId,
              cancellationReason:
                command.input.reason.trim(),
              activeItemCount: 0,
              lastStatusChangedAt: occurredAt,
              lastStatusChangedBy: actorId,
              updatedBy: actorId,
            },
          );

        if (updated === null) {
          throw new LaboratoryOrderConcurrencyError();
        }

        await this.support.orders.transitionItemsForOrder(
          command.actor.facilityId,
          command.orderId,
          [
            'ORDERED',
            'ACCEPTED',
            'COLLECTION_PENDING',
            'SPECIMEN_COLLECTED',
            'SPECIMEN_RECEIVED',
            'IN_PROGRESS',
            'RESULT_ENTERED',
            'REJECTED',
            'RECOLLECTION_REQUIRED',
          ],
          {
            status: 'CANCELLED',
            cancelledAt: occurredAt,
            cancelledBy: actorId,
            cancellationReason:
              command.input.reason.trim(),
            billingStatus: 'CANCELLED',
            updatedBy: actorId,
          },
        );

        await this.support.requestOrderChargeCancellations(
          command.actor,
          transaction,
          current,
          command.input.reason,
          occurredAt,
        );

        const history =
          await this.support.orders.listHistory(
            command.actor.facilityId,
            command.orderId,
          );

        await appendOrderHistory(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          order: updated,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          sequence: history.length + 1,
          occurredAt,
          reasonCode: 'ORDER_CANCELLED',
          reason: command.input.reason,
        });

        await this.support.dependencies.audit.append({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_AUDIT_ACTIONS.ORDER_CANCELLED,
              command.orderId,
            ),
          action:
            LABORATORY_AUDIT_ACTIONS.ORDER_CANCELLED,
          entityType: 'LabOrder',
          entityId: command.orderId,
          ...this.support.auditActorFields(command.actor),
          occurredAt,
          reason: command.input.reason,
          before:
            safeLaboratoryOrderAuditSnapshot(current),
          after:
            safeLaboratoryOrderAuditSnapshot(updated),
        });

        await this.support.dependencies.outbox.enqueue({
          transactionId: transaction.transactionId,
          deduplicationKey:
            this.support.deduplicationKey(
              transaction.transactionId,
              LABORATORY_OUTBOX_EVENTS.ORDER_CANCELLED,
              command.orderId,
            ),
          eventType:
            LABORATORY_OUTBOX_EVENTS.ORDER_CANCELLED,
          aggregateType: 'LabOrder',
          aggregateId: command.orderId,
          actorUserId: command.actor.userId,
          facilityId: command.actor.facilityId,
          correlationId: command.actor.correlationId,
          occurredAt,
          payload:
            safeLaboratoryOrderEventPayload(updated),
        });

        await this.support.publishOrderRealtime(
          command.actor,
          updated,
          LABORATORY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
        );

        return updated;
      },
    });
  }
}