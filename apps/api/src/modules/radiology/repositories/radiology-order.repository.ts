import type {
  FilterQuery,
} from 'mongoose';

import {
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderModel,
  RadiologyOrderStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  RadiologyOrderItemLifecyclePersistenceUpdate,
  RadiologyOrderLifecyclePersistenceUpdate,
  RadiologyOrderRepositoryPort,
} from '../radiology.ports.js';

import type {
  RadiologyOrderItemRecord,
  RadiologyOrderItemStatusHistoryRecord,
  RadiologyOrderRecord,
  RadiologyOrderStatusHistoryRecord,
} from '../radiology.persistence.types.js';

import type {
  RadiologyOrderListQuery,
} from '../radiology.types.js';

import {
  throwMappedRadiologyPersistenceError,
} from '../radiology.errors.js';

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
  'scheduledAt',
  'checkedInAt',
  'examinationStartedAt',
  'examinationCompletedAt',
  'verifiedAt',
  'rejectedAt',
  'rejectedBy',
  'rejectionReasonCode',
  '+rejectionReason',
  'cancelledAt',
  'cancelledBy',
  '+cancellationReason',
  'itemCount',
  'activeItemCount',
  'scheduledItemCount',
  'completedItemCount',
  'reportedItemCount',
  'verifiedItemCount',
  'rejectedItemCount',
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
  'radiologyOrderId',
  'patientId',
  'encounterId',
  'sequence',
  'radiologyProcedureId',
  'procedureDefinitionSnapshot',
  'procedureDefinitionHash',
  'requestedLaterality',
  'contrastRequested',
  'requestedContrastRoute',
  '+specialInstructions',
  'priority',
  'status',
  'orderedAt',
  'dueAt',
  'preparationStatus',
  'safetyScreeningStatus',
  'appointmentId',
  'imagingStudyId',
  'reportId',
  'accessionNumber',
  'externalStudyIdentifier',
  'acceptedAt',
  'acceptedBy',
  'scheduledAt',
  'checkedInAt',
  'examinationStartedAt',
  'examinationCompletedAt',
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
  'radiologyOrderId',
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

const ORDER_ITEM_HISTORY_SELECT = [
  '_id',
  'facilityId',
  'radiologyOrderId',
  'radiologyOrderItemId',
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

export class RadiologyOrderRepository
implements RadiologyOrderRepositoryPort {
  public async findById(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderRecord | null> {
    return record<RadiologyOrderRecord | null>(
      await RadiologyOrderModel.findOne({
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
  ): Promise<RadiologyOrderRecord | null> {
    return record<RadiologyOrderRecord | null>(
      await RadiologyOrderModel.findOne({
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
    query: RadiologyOrderListQuery,
  ): Promise<{
    items: RadiologyOrderRecord[];
    total: number;
  }> {
    const facilityObjectId = toObjectId(facilityId, 'facilityId');
    const filter: FilterQuery<unknown> = {
      facilityId: facilityObjectId,
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

    if (query.procedureId !== undefined) {
      const orderIds = await RadiologyOrderItemModel.distinct(
        'radiologyOrderId',
        {
          facilityId: facilityObjectId,
          radiologyProcedureId: toObjectId(
            query.procedureId,
            'procedureId',
          ),
        },
      ).exec();

      filter['_id'] = {
        $in: orderIds,
      };
    }

    const direction = query.sortDirection === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      RadiologyOrderModel.find(filter)
        .select(ORDER_SELECT)
        .sort({
          [query.sortBy]: direction,
          _id: direction,
        })
        .skip(skip)
        .limit(query.pageSize)
        .lean()
        .exec(),
      RadiologyOrderModel.countDocuments(filter).exec(),
    ]);

    return {
      items: record<RadiologyOrderRecord[]>(items),
      total,
    };
  }

  public async listItems(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderItemRecord[]> {
    return record<RadiologyOrderItemRecord[]>(
      await RadiologyOrderItemModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        radiologyOrderId: toObjectId(orderId, 'orderId'),
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
  ): Promise<RadiologyOrderItemRecord | null> {
    return record<RadiologyOrderItemRecord | null>(
      await RadiologyOrderItemModel.findOne({
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
  ): Promise<RadiologyOrderStatusHistoryRecord[]> {
    return record<RadiologyOrderStatusHistoryRecord[]>(
      await RadiologyOrderStatusHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        radiologyOrderId: toObjectId(orderId, 'orderId'),
      })
        .select(ORDER_HISTORY_SELECT)
        .sort({
          sequence: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async listItemHistory(
    facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyOrderItemStatusHistoryRecord[]> {
    return record<RadiologyOrderItemStatusHistoryRecord[]>(
      await RadiologyOrderItemStatusHistoryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        radiologyOrderItemId: toObjectId(orderItemId, 'orderItemId'),
      })
        .select(ORDER_ITEM_HISTORY_SELECT)
        .sort({
          sequence: 1,
        })
        .lean()
        .exec(),
    );
  }

  public async create(
    order: Omit<RadiologyOrderRecord, 'createdAt' | 'updatedAt'>,
    items: ReadonlyArray<
      Omit<RadiologyOrderItemRecord, 'createdAt' | 'updatedAt'>
    >,
    orderHistory: Omit<
      RadiologyOrderStatusHistoryRecord,
      'createdAt' | 'updatedAt'
    >,
    itemHistories: ReadonlyArray<
      Omit<
        RadiologyOrderItemStatusHistoryRecord,
        'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    order: RadiologyOrderRecord;
    items: RadiologyOrderItemRecord[];
  }> {
    const session = await RadiologyOrderModel.db.startSession();
    const stage: {
      value:
        | 'ORDER'
        | 'ITEMS'
        | 'ORDER_HISTORY'
        | 'ITEM_HISTORY';
    } = {
      value: 'ORDER',
    };
    let createdOrder: RadiologyOrderRecord | null = null;
    let createdItems: RadiologyOrderItemRecord[] = [];

    try {
      await session.withTransaction(async () => {
        stage.value = 'ORDER';
        const [orderDocument] = await RadiologyOrderModel.create(
          [order],
          {
            session,
          },
        );

        if (orderDocument === undefined) {
          throw new Error('Radiology order was not created');
        }

        createdOrder = record<RadiologyOrderRecord>(
          orderDocument.toObject(),
        );

        stage.value = 'ITEMS';
        const itemDocuments = await RadiologyOrderItemModel.insertMany(
          items,
          {
            ordered: true,
            session,
          },
        );
        createdItems = record<RadiologyOrderItemRecord[]>(
          itemDocuments.map((document) => document.toObject()),
        );

        stage.value = 'ORDER_HISTORY';
        await RadiologyOrderStatusHistoryModel.create(
          [orderHistory],
          {
            session,
          },
        );

        stage.value = 'ITEM_HISTORY';
        await RadiologyOrderItemStatusHistoryModel.insertMany(
          itemHistories,
          {
            ordered: true,
            session,
          },
        );
      });
    } catch (error) {
      switch (stage.value) {
        case 'ORDER':
          throwMappedRadiologyPersistenceError(error, 'CREATE_ORDER');

        case 'ITEMS':
          throwMappedRadiologyPersistenceError(error, 'CREATE_ORDER_ITEM');

        case 'ORDER_HISTORY':
          throwMappedRadiologyPersistenceError(
            error,
            'CREATE_ORDER_HISTORY',
          );

        case 'ITEM_HISTORY':
          throwMappedRadiologyPersistenceError(
            error,
            'CREATE_ORDER_ITEM_HISTORY',
          );
      }
    } finally {
      await session.endSession();
    }

    if (createdOrder === null) {
      throw new Error(
        'Radiology order transaction completed without an order',
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
    fromStatuses: readonly RadiologyOrderRecord['status'][],
    update: RadiologyOrderLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderRecord | null> {
    return record<RadiologyOrderRecord | null>(
      await RadiologyOrderModel.findOneAndUpdate(
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
    fromStatuses: readonly RadiologyOrderItemRecord['status'][],
    update: RadiologyOrderItemLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderItemRecord[]> {
    await RadiologyOrderItemModel.updateMany(
      {
        facilityId: toObjectId(facilityId, 'facilityId'),
        radiologyOrderId: toObjectId(orderId, 'orderId'),
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
    fromStatuses: readonly RadiologyOrderItemRecord['status'][],
    update: RadiologyOrderItemLifecyclePersistenceUpdate,
  ): Promise<RadiologyOrderItemRecord | null> {
    return record<RadiologyOrderItemRecord | null>(
      await RadiologyOrderItemModel.findOneAndUpdate(
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

  public async updateItemScreening(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    safetyScreeningStatus:
      RadiologyOrderItemRecord['safetyScreeningStatus'],
    preparationStatus: RadiologyOrderItemRecord['preparationStatus'],
    actorUserId: string,
  ): Promise<RadiologyOrderItemRecord | null> {
    return record<RadiologyOrderItemRecord | null>(
      await RadiologyOrderItemModel.findOneAndUpdate(
        {
          _id: toObjectId(orderItemId, 'orderItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            safetyScreeningStatus,
            preparationStatus,
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

  public async updateItemBilling(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    billingStatus: RadiologyOrderItemRecord['billingStatus'],
    accountChargeId: string | null,
    billingFailureCode: string | null,
    actorUserId: string,
  ): Promise<RadiologyOrderItemRecord | null> {
    return record<RadiologyOrderItemRecord | null>(
      await RadiologyOrderItemModel.findOneAndUpdate(
        {
          _id: toObjectId(orderItemId, 'orderItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            billingStatus,
            accountChargeId: accountChargeId === null
              ? null
              : toObjectId(accountChargeId, 'accountChargeId'),
            billingFailureCode,
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
      RadiologyOrderStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderStatusHistoryRecord> {
    try {
      const document = await RadiologyOrderStatusHistoryModel.create(
        history,
      );
      return record<RadiologyOrderStatusHistoryRecord>(
        document.toObject(),
      );
    } catch (error) {
      throwMappedRadiologyPersistenceError(
        error,
        'CREATE_ORDER_HISTORY',
      );
    }
  }

  public async appendItemHistory(
    history: Omit<
      RadiologyOrderItemStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderItemStatusHistoryRecord> {
    try {
      const document = await RadiologyOrderItemStatusHistoryModel.create(
        history,
      );
      return record<RadiologyOrderItemStatusHistoryRecord>(
        document.toObject(),
      );
    } catch (error) {
      throwMappedRadiologyPersistenceError(
        error,
        'CREATE_ORDER_ITEM_HISTORY',
      );
    }
  }
}