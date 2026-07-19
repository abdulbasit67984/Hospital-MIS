import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyOrderItemStatus,
  RadiologyOrderStatus,
} from '@hospital-mis/database';

import type {
  RadiologyTransactionContext,
} from '../radiology.ports.js';

import type {
  AcceptRadiologyOrderInput,
  CancelRadiologyOrderInput,
  RadiologyActorContext,
  RejectRadiologyOrderInput,
} from '../radiology.types.js';

import type {
  RadiologyOrderItemRecord,
  RadiologyOrderRecord,
} from '../radiology.persistence.types.js';

import {
  assertRadiologyOrderItemTransition,
  assertRadiologyOrderTransition,
  canTransitionRadiologyOrderItem,
} from '../radiology.lifecycle.js';

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
  protectRadiologyRestorePayload,
  radiologyOrderItemRestoreSnapshot,
  radiologyOrderRestoreSnapshot,
  restoreRadiologyRecordCompensation,
} from '../radiology.mutation-snapshots.js';

import {
  buildRadiologySequenceKey,
  formatRadiologyNumber,
  radiologyContentHash,
} from '../radiology.normalization.js';

import {
  radiologyOrderMutationLockKeys,
  safeRadiologyOrderAuditSnapshot,
  safeRadiologyOrderEventPayload,
  safeRadiologyOrderJournalPayload,
} from '../radiology.workflow-helpers.js';

import {
  RadiologyOrderConcurrencyError,
  RadiologyOrderItemConcurrencyError,
} from '../radiology.errors.js';

import {
  acceptRadiologyOrderBodySchema,
  cancelRadiologyOrderBodySchema,
  rejectRadiologyOrderBodySchema,
} from '../radiology.validation.js';

import {
  RadiologyCommandService,
} from '../services/radiology-command.service.js';

interface OrderMutationCommand<T> {
  actor: RadiologyActorContext;
  orderId: string;
  input: T;
  idempotencyKey: string;
}

async function appendOrderHistory(
  support: RadiologyCommandService,
  input: {
    actor: RadiologyActorContext;
    transactionId: string;
    order: RadiologyOrderRecord;
    fromStatus: RadiologyOrderStatus;
    toStatus: RadiologyOrderStatus;
    occurredAt: Date;
    changedByStaffId: string;
    reasonCode: string | null;
    reason: string | null;
  },
): Promise<string> {
  const existing = await support.orders.listHistory(
    input.actor.facilityId,
    input.order._id.toHexString(),
  );
  const actorUserId = toObjectId(input.actor.userId, 'actorUserId');
  const history = await support.orders.appendHistory({
    facilityId: input.order.facilityId,
    radiologyOrderId: input.order._id,
    patientId: input.order.patientId,
    encounterId: input.order.encounterId,
    sequence: existing.length + 1,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    changeSource: 'RADIOLOGY_STAFF',
    reasonCode: input.reasonCode,
    reason: input.reason,
    occurredAt: input.occurredAt,
    changedBy: toObjectId(input.changedByStaffId, 'changedByStaffId'),
    transactionId: input.transactionId,
    correlationId: input.actor.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });

  return history._id.toHexString();
}

async function appendItemHistory(
  support: RadiologyCommandService,
  input: {
    actor: RadiologyActorContext;
    transactionId: string;
    order: RadiologyOrderRecord;
    item: RadiologyOrderItemRecord;
    fromStatus: RadiologyOrderItemStatus;
    toStatus: RadiologyOrderItemStatus;
    occurredAt: Date;
    changedByStaffId: string;
    reasonCode: string | null;
    reason: string | null;
  },
): Promise<string> {
  const existing = await support.orders.listItemHistory(
    input.actor.facilityId,
    input.item._id.toHexString(),
  );
  const actorUserId = toObjectId(input.actor.userId, 'actorUserId');
  const history = await support.orders.appendItemHistory({
    facilityId: input.item.facilityId,
    radiologyOrderId: input.order._id,
    radiologyOrderItemId: input.item._id,
    patientId: input.item.patientId,
    encounterId: input.item.encounterId,
    sequence: existing.length + 1,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    changeSource: 'RADIOLOGY_STAFF',
    reasonCode: input.reasonCode,
    reason: input.reason,
    occurredAt: input.occurredAt,
    changedBy: toObjectId(input.changedByStaffId, 'changedByStaffId'),
    transactionId: input.transactionId,
    correlationId: input.actor.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });

  return history._id.toHexString();
}

async function registerHistoryDeletion(
  support: RadiologyCommandService,
  transaction: RadiologyTransactionContext,
  actor: RadiologyActorContext,
  collection:
    | 'radiologyOrderStatusHistories'
    | 'radiologyOrderItemStatusHistories',
  historyId: string,
): Promise<void> {
  await transaction.registerCompensation(
    deleteCreatedRadiologyRecordCompensation(
      `delete-history:${collection}:${historyId}`,
      {
        facilityId: actor.facilityId,
        collection,
        entityId: historyId,
        transactionId: transaction.transactionId,
      },
    ),
  );
}

async function emitOrderMutation(
  support: RadiologyCommandService,
  input: {
    actor: RadiologyActorContext;
    transactionId: string;
    occurredAt: Date;
    current: RadiologyOrderRecord;
    updated: RadiologyOrderRecord;
    auditAction: string;
    outboxEvent: string;
    reason?: string;
  },
): Promise<void> {
  await support.dependencies.audit.append({
    transactionId: input.transactionId,
    deduplicationKey: support.deduplicationKey(
      input.transactionId,
      input.auditAction,
      input.updated._id.toHexString(),
    ),
    action: input.auditAction,
    entityType: 'RadiologyOrder',
    entityId: input.updated._id.toHexString(),
    ...support.auditActorFields(input.actor),
    occurredAt: input.occurredAt,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    before: safeRadiologyOrderAuditSnapshot(input.current),
    after: safeRadiologyOrderAuditSnapshot(input.updated),
  });

  await support.dependencies.outbox.enqueue({
    transactionId: input.transactionId,
    deduplicationKey: support.deduplicationKey(
      input.transactionId,
      input.outboxEvent,
      input.updated._id.toHexString(),
    ),
    eventType: input.outboxEvent,
    aggregateType: 'RadiologyOrder',
    aggregateId: input.updated._id.toHexString(),
    actorUserId: input.actor.userId,
    facilityId: input.actor.facilityId,
    correlationId: input.actor.correlationId,
    occurredAt: input.occurredAt,
    payload: safeRadiologyOrderEventPayload(input.updated),
  });

  await support.publishOrderRealtime(
    input.actor,
    input.updated,
    RADIOLOGY_REALTIME_EVENTS.ORDER_WORKLIST_CHANGED,
  );
  await support.publishOrderRealtime(
    input.actor,
    input.updated,
    RADIOLOGY_REALTIME_EVENTS.ENCOUNTER_RADIOLOGY_CHANGED,
  );
}

export class AcceptRadiologyOrderWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: OrderMutationCommand<AcceptRadiologyOrderInput>,
  ): Promise<RadiologyOrderRecord> {
    const input = acceptRadiologyOrderBodySchema.parse(command.input);
    const current = await this.support.requireOrder(
      command.actor,
      command.orderId,
    );
    await this.support.assertAccess(command.actor, 'ORDER_MANAGE', {
      order: current,
    });
    this.support.assertExpectedVersion(current, input.expectedVersion, 'ORDER');
    assertRadiologyOrderTransition(current.status, 'ACCEPTED');

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.ACCEPT_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyOrderMutationLockKeys(
        command.actor.facilityId,
        current,
      ),
      idempotencyPayload: {
        orderId: command.orderId,
        expectedVersion: input.expectedVersion,
      },
      journalPayload: safeRadiologyOrderJournalPayload(
        'ACCEPT_ORDER',
        {
          orderId: command.orderId,
          encounterId: current.encounterId.toHexString(),
          status: 'ACCEPTED',
          itemCount: current.itemCount,
        },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const staffId = await this.support.accessPolicy.requireActiveActorStaffId(
          command.actor,
        );
        const staffObjectId = toObjectId(staffId, 'staffId');
        const actorUserId = toObjectId(command.actor.userId, 'actorUserId');
        const currentItems = await this.support.orders.listItems(
          command.actor.facilityId,
          command.orderId,
        );

        for (const item of currentItems) {
          assertRadiologyOrderItemTransition(item.status, 'ACCEPTED');
        }

        const orderRestore = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyOrders',
          entityId: command.orderId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyOrderRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.orders.transitionStatus(
          command.actor.facilityId,
          command.orderId,
          input.expectedVersion,
          ['ORDERED'],
          {
            status: 'ACCEPTED',
            acceptedAt: occurredAt,
            acceptedBy: staffObjectId,
            lastStatusChangedAt: occurredAt,
            lastStatusChangedBy: staffObjectId,
            updatedBy: actorUserId,
          },
        );

        if (updated === null) {
          throw new RadiologyOrderConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-order:${command.orderId}`,
            orderRestore,
          ),
        );

        const year = occurredAt.getUTCFullYear();
        const acceptedItems: RadiologyOrderItemRecord[] = [];

        for (const currentItem of currentItems) {
          const allocation = await this.support.dependencies.sequence.next(
            command.actor.facilityId,
            buildRadiologySequenceKey(
              RADIOLOGY_NUMBER_SEQUENCE_NAMESPACE.ACCESSION,
              year,
            ),
          );
          const itemRestore = protectRadiologyRestorePayload({
            facilityId: command.actor.facilityId,
            collection: 'radiologyOrderItems',
            entityId: currentItem._id.toHexString(),
            expectedPostVersion: currentItem.version + 1,
            transactionId: transaction.transactionId,
            snapshot: radiologyOrderItemRestoreSnapshot(currentItem),
            snapshotCrypto: this.support.dependencies.snapshotCrypto,
          });
          const accepted = await this.support.orders.transitionItem(
            command.actor.facilityId,
            currentItem._id.toHexString(),
            currentItem.version,
            ['ORDERED'],
            {
              status: 'ACCEPTED',
              accessionNumber: formatRadiologyNumber(
                'ACC',
                year,
                allocation.value,
              ),
              acceptedAt: occurredAt,
              acceptedBy: staffObjectId,
              updatedBy: actorUserId,
            },
          );

          if (accepted === null) {
            throw new RadiologyOrderItemConcurrencyError();
          }

          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-order-item:${currentItem._id.toHexString()}`,
              itemRestore,
            ),
          );
          acceptedItems.push(accepted);
        }

        const orderHistoryId = await appendOrderHistory(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          order: updated,
          fromStatus: current.status,
          toStatus: 'ACCEPTED',
          occurredAt,
          changedByStaffId: staffId,
          reasonCode: null,
          reason: null,
        });
        await registerHistoryDeletion(
          this.support,
          transaction,
          command.actor,
          'radiologyOrderStatusHistories',
          orderHistoryId,
        );

        for (let index = 0; index < acceptedItems.length; index += 1) {
          const accepted = acceptedItems[index];
          const before = currentItems[index];

          if (accepted === undefined || before === undefined) {
            throw new Error('Radiology acceptance item ordering changed');
          }

          const itemHistoryId = await appendItemHistory(this.support, {
            actor: command.actor,
            transactionId: transaction.transactionId,
            order: updated,
            item: accepted,
            fromStatus: before.status,
            toStatus: 'ACCEPTED',
            occurredAt,
            changedByStaffId: staffId,
            reasonCode: null,
            reason: null,
          });
          await registerHistoryDeletion(
            this.support,
            transaction,
            command.actor,
            'radiologyOrderItemStatusHistories',
            itemHistoryId,
          );
        }

        await transaction.checkpoint(
          RADIOLOGY_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
          {
            orderId: command.orderId,
            itemHistoryCount: acceptedItems.length,
          },
        );

        await emitOrderMutation(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          occurredAt,
          current,
          updated,
          auditAction: RADIOLOGY_AUDIT_ACTIONS.ORDER_ACCEPTED,
          outboxEvent: RADIOLOGY_OUTBOX_EVENTS.ORDER_ACCEPTED,
        });

        return updated;
      },
    });
  }
}

export class RejectRadiologyOrderWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: OrderMutationCommand<RejectRadiologyOrderInput>,
  ): Promise<RadiologyOrderRecord> {
    const input = rejectRadiologyOrderBodySchema.parse(command.input);
    const current = await this.support.requireOrder(
      command.actor,
      command.orderId,
    );
    await this.support.assertAccess(command.actor, 'ORDER_MANAGE', {
      order: current,
    });
    this.support.assertExpectedVersion(current, input.expectedVersion, 'ORDER');
    assertRadiologyOrderTransition(current.status, 'REJECTED');

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.REJECT_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyOrderMutationLockKeys(
        command.actor.facilityId,
        current,
      ),
      idempotencyPayload: {
        orderId: command.orderId,
        expectedVersion: input.expectedVersion,
        reasonHash: radiologyContentHash({
          reasonCode: input.reasonCode,
          reason: input.reason,
        }),
      },
      journalPayload: safeRadiologyOrderJournalPayload(
        'REJECT_ORDER',
        {
          orderId: command.orderId,
          encounterId: current.encounterId.toHexString(),
          status: 'REJECTED',
          itemCount: current.itemCount,
        },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const staffId = await this.support.accessPolicy.requireActiveActorStaffId(
          command.actor,
        );
        const staffObjectId = toObjectId(staffId, 'staffId');
        const actorUserId = toObjectId(command.actor.userId, 'actorUserId');
        const originalItems = await this.support.orders.listItems(
          command.actor.facilityId,
          command.orderId,
        );

        for (const item of originalItems) {
          assertRadiologyOrderItemTransition(item.status, 'REJECTED');
        }

        const billingItems = await this.support.requestOrderChargeCancellations(
          command.actor,
          transaction,
          current,
          input.reason,
          occurredAt,
        );
        const rejectedItems: RadiologyOrderItemRecord[] = [];

        for (let index = 0; index < billingItems.length; index += 1) {
          const billingItem = billingItems[index];
          const originalItem = originalItems[index];

          if (billingItem === undefined || originalItem === undefined) {
            throw new Error('Radiology rejection item ordering changed');
          }

          const rejected = await this.support.orders.transitionItem(
            command.actor.facilityId,
            billingItem._id.toHexString(),
            billingItem.version,
            [originalItem.status],
            {
              status: 'REJECTED',
              rejectedAt: occurredAt,
              rejectedBy: staffObjectId,
              rejectionReasonCode: this.support.normalizedCode(
                input.reasonCode,
              ),
              rejectionReason: input.reason.trim(),
              updatedBy: actorUserId,
            },
          );

          if (rejected === null) {
            throw new RadiologyOrderItemConcurrencyError();
          }

          const restore = protectRadiologyRestorePayload({
            facilityId: command.actor.facilityId,
            collection: 'radiologyOrderItems',
            entityId: originalItem._id.toHexString(),
            expectedPostVersion: rejected.version,
            transactionId: transaction.transactionId,
            snapshot: radiologyOrderItemRestoreSnapshot(originalItem),
            snapshotCrypto: this.support.dependencies.snapshotCrypto,
          });
          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-rejected-item:${originalItem._id.toHexString()}`,
              restore,
            ),
          );
          rejectedItems.push(rejected);
        }

        const orderRestore = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyOrders',
          entityId: command.orderId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyOrderRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.orders.transitionStatus(
          command.actor.facilityId,
          command.orderId,
          input.expectedVersion,
          [current.status],
          {
            status: 'REJECTED',
            rejectedAt: occurredAt,
            rejectedBy: staffObjectId,
            rejectionReasonCode: this.support.normalizedCode(
              input.reasonCode,
            ),
            rejectionReason: input.reason.trim(),
            activeItemCount: 0,
            rejectedItemCount: current.itemCount,
            lastStatusChangedAt: occurredAt,
            lastStatusChangedBy: staffObjectId,
            updatedBy: actorUserId,
          },
        );

        if (updated === null) {
          throw new RadiologyOrderConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-rejected-order:${command.orderId}`,
            orderRestore,
          ),
        );

        const orderHistoryId = await appendOrderHistory(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          order: updated,
          fromStatus: current.status,
          toStatus: 'REJECTED',
          occurredAt,
          changedByStaffId: staffId,
          reasonCode: this.support.normalizedCode(input.reasonCode),
          reason: input.reason.trim(),
        });
        await registerHistoryDeletion(
          this.support,
          transaction,
          command.actor,
          'radiologyOrderStatusHistories',
          orderHistoryId,
        );

        for (let index = 0; index < rejectedItems.length; index += 1) {
          const rejected = rejectedItems[index];
          const before = originalItems[index];

          if (rejected === undefined || before === undefined) {
            throw new Error('Radiology rejection item ordering changed');
          }

          const itemHistoryId = await appendItemHistory(this.support, {
            actor: command.actor,
            transactionId: transaction.transactionId,
            order: updated,
            item: rejected,
            fromStatus: before.status,
            toStatus: 'REJECTED',
            occurredAt,
            changedByStaffId: staffId,
            reasonCode: this.support.normalizedCode(input.reasonCode),
            reason: input.reason.trim(),
          });
          await registerHistoryDeletion(
            this.support,
            transaction,
            command.actor,
            'radiologyOrderItemStatusHistories',
            itemHistoryId,
          );
        }

        await emitOrderMutation(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          occurredAt,
          current,
          updated,
          auditAction: RADIOLOGY_AUDIT_ACTIONS.ORDER_REJECTED,
          outboxEvent: RADIOLOGY_OUTBOX_EVENTS.ORDER_REJECTED,
          reason: input.reason,
        });

        return updated;
      },
    });
  }
}

export class CancelRadiologyOrderWorkflow {
  public constructor(
    private readonly support: RadiologyCommandService,
  ) {}

  public async execute(
    command: OrderMutationCommand<CancelRadiologyOrderInput>,
  ): Promise<RadiologyOrderRecord> {
    const input = cancelRadiologyOrderBodySchema.parse(command.input);
    const current = await this.support.requireOrder(
      command.actor,
      command.orderId,
    );
    await this.support.assertAccess(command.actor, 'ORDER_CANCEL', {
      order: current,
    });
    this.support.assertExpectedVersion(current, input.expectedVersion, 'ORDER');
    assertRadiologyOrderTransition(current.status, 'CANCELLED');

    return this.support.dependencies.transactionManager.execute({
      transactionType: RADIOLOGY_TRANSACTION_TYPES.CANCEL_ORDER,
      idempotencyKey: command.idempotencyKey,
      actorUserId: command.actor.userId,
      facilityId: command.actor.facilityId,
      correlationId: command.actor.correlationId,
      lockKeys: radiologyOrderMutationLockKeys(
        command.actor.facilityId,
        current,
      ),
      idempotencyPayload: {
        orderId: command.orderId,
        expectedVersion: input.expectedVersion,
        reasonHash: radiologyContentHash(input.reason),
      },
      journalPayload: safeRadiologyOrderJournalPayload(
        'CANCEL_ORDER',
        {
          orderId: command.orderId,
          encounterId: current.encounterId.toHexString(),
          status: 'CANCELLED',
          itemCount: current.itemCount,
        },
      ),
      execute: async (transaction) => {
        const occurredAt = this.support.dependencies.clock.now();
        const staffId = await this.support.accessPolicy.requireActiveActorStaffId(
          command.actor,
        );
        const staffObjectId = toObjectId(staffId, 'staffId');
        const actorUserId = toObjectId(command.actor.userId, 'actorUserId');
        const originalItems = await this.support.orders.listItems(
          command.actor.facilityId,
          command.orderId,
        );
        const cancellableOriginalItems = originalItems.filter((item) =>
          canTransitionRadiologyOrderItem(item.status, 'CANCELLED'),
        );

        const billingItems = await this.support.requestOrderChargeCancellations(
          command.actor,
          transaction,
          current,
          input.reason,
          occurredAt,
        );
        const billingById = new Map(
          billingItems.map((item) => [item._id.toHexString(), item]),
        );
        const cancelledItems: Array<{
          before: RadiologyOrderItemRecord;
          after: RadiologyOrderItemRecord;
        }> = [];
        const cancellableIds = new Set(
          cancellableOriginalItems.map((item) => item._id.toHexString()),
        );

        for (const originalItem of originalItems) {
          if (cancellableIds.has(originalItem._id.toHexString())) {
            continue;
          }

          const billingItem = billingById.get(originalItem._id.toHexString());

          if (
            billingItem !== undefined &&
            billingItem.version !== originalItem.version
          ) {
            const restore = protectRadiologyRestorePayload({
              facilityId: command.actor.facilityId,
              collection: 'radiologyOrderItems',
              entityId: originalItem._id.toHexString(),
              expectedPostVersion: billingItem.version,
              transactionId: transaction.transactionId,
              snapshot: radiologyOrderItemRestoreSnapshot(originalItem),
              snapshotCrypto: this.support.dependencies.snapshotCrypto,
            });
            await transaction.registerCompensation(
              restoreRadiologyRecordCompensation(
                `restore-cancelled-billing:${originalItem._id.toHexString()}`,
                restore,
              ),
            );
          }
        }

        for (const originalItem of cancellableOriginalItems) {
          const billingItem = billingById.get(originalItem._id.toHexString());

          if (billingItem === undefined) {
            throw new Error('Radiology cancellation item was not reloaded');
          }

          const cancelled = await this.support.orders.transitionItem(
            command.actor.facilityId,
            originalItem._id.toHexString(),
            billingItem.version,
            [originalItem.status],
            {
              status: 'CANCELLED',
              cancelledAt: occurredAt,
              cancelledBy: staffObjectId,
              cancellationReason: input.reason.trim(),
              updatedBy: actorUserId,
            },
          );

          if (cancelled === null) {
            throw new RadiologyOrderItemConcurrencyError();
          }

          const restore = protectRadiologyRestorePayload({
            facilityId: command.actor.facilityId,
            collection: 'radiologyOrderItems',
            entityId: originalItem._id.toHexString(),
            expectedPostVersion: cancelled.version,
            transactionId: transaction.transactionId,
            snapshot: radiologyOrderItemRestoreSnapshot(originalItem),
            snapshotCrypto: this.support.dependencies.snapshotCrypto,
          });
          await transaction.registerCompensation(
            restoreRadiologyRecordCompensation(
              `restore-cancelled-item:${originalItem._id.toHexString()}`,
              restore,
            ),
          );
          cancelledItems.push({
            before: originalItem,
            after: cancelled,
          });
        }

        const orderRestore = protectRadiologyRestorePayload({
          facilityId: command.actor.facilityId,
          collection: 'radiologyOrders',
          entityId: command.orderId,
          expectedPostVersion: current.version + 1,
          transactionId: transaction.transactionId,
          snapshot: radiologyOrderRestoreSnapshot(current),
          snapshotCrypto: this.support.dependencies.snapshotCrypto,
        });
        const updated = await this.support.orders.transitionStatus(
          command.actor.facilityId,
          command.orderId,
          input.expectedVersion,
          [current.status],
          {
            status: 'CANCELLED',
            cancelledAt: occurredAt,
            cancelledBy: staffObjectId,
            cancellationReason: input.reason.trim(),
            activeItemCount: 0,
            lastStatusChangedAt: occurredAt,
            lastStatusChangedBy: staffObjectId,
            updatedBy: actorUserId,
          },
        );

        if (updated === null) {
          throw new RadiologyOrderConcurrencyError();
        }

        await transaction.registerCompensation(
          restoreRadiologyRecordCompensation(
            `restore-cancelled-order:${command.orderId}`,
            orderRestore,
          ),
        );

        const orderHistoryId = await appendOrderHistory(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          order: updated,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          occurredAt,
          changedByStaffId: staffId,
          reasonCode: null,
          reason: input.reason.trim(),
        });
        await registerHistoryDeletion(
          this.support,
          transaction,
          command.actor,
          'radiologyOrderStatusHistories',
          orderHistoryId,
        );

        for (const item of cancelledItems) {
          const itemHistoryId = await appendItemHistory(this.support, {
            actor: command.actor,
            transactionId: transaction.transactionId,
            order: updated,
            item: item.after,
            fromStatus: item.before.status,
            toStatus: 'CANCELLED',
            occurredAt,
            changedByStaffId: staffId,
            reasonCode: null,
            reason: input.reason.trim(),
          });
          await registerHistoryDeletion(
            this.support,
            transaction,
            command.actor,
            'radiologyOrderItemStatusHistories',
            itemHistoryId,
          );
        }

        await emitOrderMutation(this.support, {
          actor: command.actor,
          transactionId: transaction.transactionId,
          occurredAt,
          current,
          updated,
          auditAction: RADIOLOGY_AUDIT_ACTIONS.ORDER_CANCELLED,
          outboxEvent: RADIOLOGY_OUTBOX_EVENTS.ORDER_CANCELLED,
          reason: input.reason,
        });

        return updated;
      },
    });
  }
}