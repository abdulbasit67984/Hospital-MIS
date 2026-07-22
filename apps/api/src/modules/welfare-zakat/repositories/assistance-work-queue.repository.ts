import type { FilterQuery } from 'mongoose';

import {
  AssistanceApplicationModel,
  AssistanceWorkItemModel,
  toObjectId,
} from '@hospital-mis/database';

import type { WelfareZakatListQuery } from '../welfare-zakat.contracts.js';
import type { AssistanceWorkQueueRepositoryPort } from '../welfare-zakat.ports.js';
import type {
  AssistanceWorkItemRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import { normalizeAssistancePagination } from '../welfare-zakat.normalization.js';
import {
  nullableWelfareZakatObjectId,
  welfareZakatRecord,
  welfareZakatSortDirection,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

function workItemFilter(
  facilityId: string,
  query: WelfareZakatListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };
  if (query.applicationId != null) filter.applicationId = toObjectId(query.applicationId, 'applicationId');
  if (query.approvalId != null) filter.approvalId = toObjectId(query.approvalId, 'approvalId');
  if (query.assignedToUserId != null) filter.assignedToUserId = toObjectId(query.assignedToUserId, 'assignedToUserId');
  if (query.workQueueType != null && query.workQueueType.length > 0) filter.workQueueType = { $in: query.workQueueType };
  if (query.followUpDueBefore != null) filter.followUpAt = { $lte: new Date(query.followUpDueBefore) };
  if (query.includeClosed !== true) filter.status = { $nin: ['RESOLVED', 'CANCELLED'] };
  return filter;
}

export class MongoAssistanceWorkQueueRepository
implements AssistanceWorkQueueRepositoryPort {
  public async create(
    input: Parameters<AssistanceWorkQueueRepositoryPort['create']>[0],
  ): Promise<AssistanceWorkItemRecord> {
    const [created] = await AssistanceWorkItemModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'createdBy'),
        updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
        applicationId: toObjectId(input.applicationId, 'applicationId'),
        approvalId: nullableWelfareZakatObjectId(input.approvalId, 'approvalId'),
        allocationId: nullableWelfareZakatObjectId(input.allocationId, 'allocationId'),
        workQueueType: input.workQueueType,
        status: 'OPEN',
        assignedToUserId: null,
        assignedBy: null,
        priority: input.priority,
        followUpAt: input.followUpAt ?? null,
        escalationLevel: 0,
        escalatedAt: null,
        escalatedBy: null,
        escalatedToUserId: null,
        reasonEncrypted: input.reasonEncrypted ?? null,
        resolvedAt: null,
        resolvedBy: null,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<AssistanceWorkItemRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    workItemId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceWorkItemRecord | null> {
    return welfareZakatRecord<AssistanceWorkItemRecord | null>(
      await withWelfareZakatSession(
        AssistanceWorkItemModel.findOne({
          _id: toObjectId(workItemId, 'workItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async assign(
    input: Parameters<AssistanceWorkQueueRepositoryPort['assign']>[0],
  ): Promise<AssistanceWorkItemRecord | null> {
    const updated = welfareZakatRecord<AssistanceWorkItemRecord | null>(
      await AssistanceWorkItemModel.findOneAndUpdate(
        {
          _id: toObjectId(input.workItemId, 'workItemId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.input.expectedVersion,
          status: { $nin: ['RESOLVED', 'CANCELLED'] },
        },
        {
          $set: {
            status: 'ASSIGNED',
            assignedToUserId: toObjectId(input.input.assignedToUserId, 'assignedToUserId'),
            assignedBy: toObjectId(input.actor.userId, 'assignedBy'),
            followUpAt: input.input.followUpAt == null ? null : new Date(input.input.followUpAt),
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
    if (updated !== null) {
      await AssistanceApplicationModel.updateOne(
        {
          _id: updated.applicationId,
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          status: { $nin: ['CLOSED', 'CANCELLED'] },
        },
        {
          $set: {
            assignedToUserId: toObjectId(input.input.assignedToUserId, 'assignedToUserId'),
            assignedBy: toObjectId(input.actor.userId, 'assignedBy'),
            followUpAt: input.input.followUpAt == null ? null : new Date(input.input.followUpAt),
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        { session: input.transaction.session, runValidators: true },
      ).exec();
    }
    return updated;
  }

  public async escalate(
    input: Parameters<AssistanceWorkQueueRepositoryPort['escalate']>[0],
  ): Promise<AssistanceWorkItemRecord | null> {
    return welfareZakatRecord<AssistanceWorkItemRecord | null>(
      await AssistanceWorkItemModel.findOneAndUpdate(
        {
          _id: toObjectId(input.workItemId, 'workItemId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.input.expectedVersion,
          status: { $nin: ['RESOLVED', 'CANCELLED'] },
        },
        {
          $set: {
            status: 'ESCALATED',
            escalationLevel: input.input.escalationLevel,
            escalatedAt: input.escalatedAt,
            escalatedBy: toObjectId(input.actor.userId, 'escalatedBy'),
            escalatedToUserId: nullableWelfareZakatObjectId(input.input.escalatedToUserId, 'escalatedToUserId'),
            followUpAt: input.input.followUpAt == null ? null : new Date(input.input.followUpAt),
            reasonEncrypted: input.reasonEncrypted,
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }

  public async list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly AssistanceWorkItemRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter = workItemFilter(facilityId, query);
    const direction = welfareZakatSortDirection(query.sortDirection);
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        AssistanceWorkItemModel.find(filter)
          .sort({ priority: direction, followUpAt: direction, createdAt: direction, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(AssistanceWorkItemModel.countDocuments(filter), session).exec(),
    ]);
    return { records: welfareZakatRecord<readonly AssistanceWorkItemRecord[]>(records), total: Number(total) };
  }
}