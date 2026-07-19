import type {
  FilterQuery,
} from 'mongoose';

import type {
  LaboratoryBillingStatus,
  LaboratoryOrderItemStatus,
  LaboratoryOrderStatus,
} from '@hospital-mis/database';

import {
  LabOrderItemModel,
  LabOrderModel,
  LabOrderStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  LaboratoryOrderItemLifecyclePersistenceUpdate,
  LaboratoryOrderLifecyclePersistenceUpdate,
  LaboratoryOrderRepositoryPort,
} from '../laboratory.ports.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryOrderStatusHistoryRecord,
} from '../laboratory.persistence.types.js';

import type {
  LaboratoryOrderListQuery,
} from '../laboratory.types.js';

import {
  throwMappedLaboratoryPersistenceError,
} from '../laboratory.persistence-errors.js';

const ORDER_SELECT = [
  '_id',
  'facilityId',
  'orderNumber',
  'patientId',
  'requestedPatientId',
  'canonicalRedirected',
  'encounterId',
  'registrationId',
  'opdVisitId',
  'queueTokenId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'orderingProviderId',
  'priority',
  'status',
  '+clinicalIndication',
  '+orderingNotes',
  'orderedAt',
  'acceptedAt',
  'acceptedBy',
  'collectionCompletedAt',
  'processingStartedAt',
  'completedAt',
  'verifiedAt',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'itemCount',
  'activeItemCount',
  'collectedItemCount',
  'completedItemCount',
  'verifiedItemCount',
  'rejectedItemCount',
  'criticalResultCount',
  'lastStatusChangedAt',
  'lastStatusChangedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ORDER_ITEM_SELECT = [
  '_id',
  'facilityId',
  'labOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'labTestId',
  'testCodeSnapshot',
  'testNameSnapshot',
  'categoryCodeSnapshot',
  'categoryNameSnapshot',
  'methodCodeSnapshot',
  'methodNameSnapshot',
  'requiresSpecimen',
  'specimenRequirementsSnapshot',
  '+specimenRequirementsSnapshot.collectionInstructions',
  '+specimenRequirementsSnapshot.handlingInstructions',
  '+resultComponentsSnapshot',
  '+testDefinitionHash',
  'turnaroundMinutes',
  'dueAt',
  'status',
  'activeSpecimenId',
  'specimenCount',
  'recollectionCount',
  'resultId',
  'acceptedAt',
  'acceptedBy',
  'processingStartedAt',
  'completedAt',
  'verifiedAt',
  'rejectedAt',
  'rejectedBy',
  'rejectionReasonCode',
  '+rejectionReason',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'chargeCatalogItemId',
  'accountChargeId',
  'billingStatus',
  'billingFailureCode',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const ORDER_HISTORY_SELECT = [
  '_id',
  'facilityId',
  'labOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'fromStatus',
  'toStatus',
  'changeSource',
  'reasonCode',
  '+reason',
  'occurredAt',
  'changedBy',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function record<T>(
  value: unknown,
): T {
  return value as T;
}

export class LaboratoryOrderRepository
implements LaboratoryOrderRepositoryPort {
  public async findById(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderRecord | null> {
    return record<LaboratoryOrderRecord | null>(
      await LabOrderModel.findOne({
        _id: toObjectId(orderId, 'orderId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(ORDER_SELECT)
        .lean()
        .exec(),
    );
  }

  public async findByNumber(
    facilityId: string,
    orderNumber: string,
  ): Promise<LaboratoryOrderRecord | null> {
    return record<LaboratoryOrderRecord | null>(
      await LabOrderModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        orderNumber: orderNumber.trim().toUpperCase(),
      })
        .select(ORDER_SELECT)
        .lean()
        .exec(),
    );
  }

  public async list(
    facilityId: string,
    query: LaboratoryOrderListQuery,
  ): Promise<{
    items: LaboratoryOrderRecord[];
    total: number;
  }> {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.patientId !== undefined) {
      filter['patientId'] = toObjectId(query.patientId, 'patientId');
    }

    if (query.encounterId !== undefined) {
      filter['encounterId'] = toObjectId(query.encounterId, 'encounterId');
    }

    if (query.orderingProviderId !== undefined) {
      filter['orderingProviderId'] = toObjectId(
        query.orderingProviderId,
        'orderingProviderId',
      );
    }

    if (query.departmentId !== undefined) {
      filter['departmentId'] = toObjectId(
        query.departmentId,
        'departmentId',
      );
    }

    if (query.status !== undefined) {
      filter['status'] = query.status;
    }

    if (query.priority !== undefined) {
      filter['priority'] = query.priority;
    }

    if (
      query.orderedFrom !== undefined ||
      query.orderedTo !== undefined
    ) {
      filter['orderedAt'] = {
        ...(query.orderedFrom === undefined
          ? {}
          : {
              $gte: new Date(query.orderedFrom),
            }),
        ...(query.orderedTo === undefined
          ? {}
          : {
              $lte: new Date(query.orderedTo),
            }),
      };
    }

    const direction = query.sortDirection === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      LabOrderModel.find(filter)
        .select(ORDER_SELECT)
        .sort({
          [query.sortBy]: direction,
          _id: direction,
        })
        .skip(skip)
        .limit(query.pageSize)
        .lean()
        .exec(),

      LabOrderModel.countDocuments(filter).exec(),
    ]);

    return {
      items: record<LaboratoryOrderRecord[]>(items),
      total,
    };
  }

  public async listItems(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderItemRecord[]> {
    return record<LaboratoryOrderItemRecord[]>(
      await LabOrderItemModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        labOrderId: toObjectId(orderId, 'orderId'),
      })
        .select(ORDER_ITEM_SELECT)
        .sort({
          sequence: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async findItemById(
    facilityId: string,
    orderItemId: string,
  ): Promise<LaboratoryOrderItemRecord | null> {
    return record<LaboratoryOrderItemRecord | null>(
      await LabOrderItemModel.findOne({
        _id: toObjectId(orderItemId, 'orderItemId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(ORDER_ITEM_SELECT)
        .lean()
        .exec(),
    );
  }

  public async listHistory(
    facilityId: string,
    orderId: string,
  ): Promise<LaboratoryOrderStatusHistoryRecord[]> {
    return record<LaboratoryOrderStatusHistoryRecord[]>(
      await LabOrderStatusHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        labOrderId: toObjectId(orderId, 'orderId'),
      })
        .select(ORDER_HISTORY_SELECT)
        .sort({
          sequence: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async create(
    order: Omit<
      LaboratoryOrderRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    items: ReadonlyArray<
      Omit<
        LaboratoryOrderItemRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    order: LaboratoryOrderRecord;
    items: LaboratoryOrderItemRecord[];
  }> {
    const session = await LabOrderModel.db.startSession();

    let stage: 'ORDER' | 'ITEMS' = 'ORDER';
    let createdOrder: LaboratoryOrderRecord | null = null;
    let createdItems: LaboratoryOrderItemRecord[] = [];

    try {
      await session.withTransaction(async () => {
        stage = 'ORDER';

        const [orderDocument] = await LabOrderModel.create(
          [order],
          {
            session,
          },
        );

        if (orderDocument === undefined) {
          throw new Error('Laboratory order was not created');
        }

        createdOrder = record<LaboratoryOrderRecord>(
          orderDocument.toObject(),
        );

        stage = 'ITEMS';

        const itemDocuments = await LabOrderItemModel.insertMany(
          items.map((item) => ({
            ...item,
            labOrderId: orderDocument._id,
          })),
          {
            ordered: true,
            session,
          },
        );

        createdItems = record<LaboratoryOrderItemRecord[]>(
          itemDocuments.map((document) => document.toObject()),
        );
      });
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        stage === 'ORDER'
          ? 'CREATE_ORDER'
          : 'CREATE_ORDER_ITEM',
      );
    } finally {
      await session.endSession();
    }

    if (createdOrder === null) {
      throw new Error(
        'Laboratory order transaction completed without an order',
      );
    }

    return {
      order: createdOrder,
      items: createdItems,
    };
  }

  public async transitionStatus(
    facilityId: string,
    orderId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryOrderStatus[],
    update: LaboratoryOrderLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderRecord | null> {
    return record<LaboratoryOrderRecord | null>(
      await LabOrderModel.findOneAndUpdate(
        {
          _id: toObjectId(orderId, 'orderId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: {
            $in: fromStatuses,
          },
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(ORDER_SELECT)
        .lean()
        .exec(),
    );
  }

  public async transitionItemsForOrder(
    facilityId: string,
    orderId: string,
    fromStatuses: readonly LaboratoryOrderItemStatus[],
    update: LaboratoryOrderItemLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderItemRecord[]> {
    await LabOrderItemModel.updateMany(
      {
        facilityId: toObjectId(facilityId, 'facilityId'),
        labOrderId: toObjectId(orderId, 'orderId'),
        status: {
          $in: fromStatuses,
        },
      },
      {
        $set: update,
        $inc: {
          version: 1,
        },
      },
      {
        runValidators: true,
      },
    ).exec();

    return this.listItems(facilityId, orderId);
  }

  public async transitionItem(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    fromStatuses: readonly LaboratoryOrderItemStatus[],
    update: LaboratoryOrderItemLifecyclePersistenceUpdate,
  ): Promise<LaboratoryOrderItemRecord | null> {
    return record<LaboratoryOrderItemRecord | null>(
      await LabOrderItemModel.findOneAndUpdate(
        {
          _id: toObjectId(orderItemId, 'orderItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: {
            $in: fromStatuses,
          },
          version: expectedVersion,
        },
        {
          $set: update,
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(ORDER_ITEM_SELECT)
        .lean()
        .exec(),
    );
  }

  public async updateItemBilling(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    billingStatus: LaboratoryBillingStatus,
    accountChargeId: string | null,
    actorUserId: string,
  ): Promise<LaboratoryOrderItemRecord | null> {
    return record<LaboratoryOrderItemRecord | null>(
      await LabOrderItemModel.findOneAndUpdate(
        {
          _id: toObjectId(orderItemId, 'orderItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            billingStatus,
            accountChargeId:
              accountChargeId === null
                ? null
                : toObjectId(accountChargeId, 'accountChargeId'),
            billingFailureCode: null,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
          },
          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(ORDER_ITEM_SELECT)
        .lean()
        .exec(),
    );
  }

  public async appendHistory(
    history: Omit<
      LaboratoryOrderStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<LaboratoryOrderStatusHistoryRecord> {
    try {
      const document = await LabOrderStatusHistoryModel.create(history);

      return record<LaboratoryOrderStatusHistoryRecord>(
        document.toObject(),
      );
    } catch (error) {
      throwMappedLaboratoryPersistenceError(
        error,
        'CREATE_ORDER_HISTORY',
      );
    }
  }
}