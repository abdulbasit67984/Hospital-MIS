import { ConsultantWorkItemModel } from '@hospital-mis/database';

import type { ConsultantWorkQueueRepositoryPort } from '../consultant-sharing.ports.js';
import {
  consultantSharingIdString,
  consultantSharingMongoSession,
  consultantSharingObjectId,
  nullableConsultantSharingIdString,
  nullableConsultantSharingIso,
  nullableConsultantSharingObjectId,
} from './consultant-sharing-repository.support.js';

function projectWorkItem(record: Readonly<Record<string, unknown>>) {
  return {
    id: consultantSharingIdString(record._id),
    facilityId: consultantSharingIdString(record.facilityId),
    workQueueType: String(record.workQueueType),
    status: String(record.status),
    agreementId: nullableConsultantSharingIdString(record.agreementId),
    agreementRuleId: nullableConsultantSharingIdString(record.agreementRuleId),
    revenueEntryId: nullableConsultantSharingIdString(record.revenueEntryId),
    adjustmentId: nullableConsultantSharingIdString(record.adjustmentId),
    reversalId: nullableConsultantSharingIdString(record.reversalId),
    settlementId: nullableConsultantSharingIdString(record.settlementId),
    settlementPaymentId: nullableConsultantSharingIdString(record.settlementPaymentId),
    disputeId: nullableConsultantSharingIdString(record.disputeId),
    assignedToUserId: nullableConsultantSharingIdString(record.assignedToUserId),
    priority: Number(record.priority),
    followUpAt: nullableConsultantSharingIso(record.followUpAt),
    deadlineAt: nullableConsultantSharingIso(record.deadlineAt),
    escalationLevel: Number(record.escalationLevel),
    version: Number(record.version),
  } as const;
}

export class MongoConsultantWorkQueueRepository
  implements ConsultantWorkQueueRepositoryPort {
  public async create(
    input: Parameters<ConsultantWorkQueueRepositoryPort['create']>[0],
  ) {
    const [record] = await ConsultantWorkItemModel.create(
      [{
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        agreementId: nullableConsultantSharingObjectId(input.target.agreementId, 'agreementId'),
        agreementRuleId: nullableConsultantSharingObjectId(input.target.agreementRuleId, 'agreementRuleId'),
        revenueEntryId: nullableConsultantSharingObjectId(input.target.revenueEntryId, 'revenueEntryId'),
        adjustmentId: nullableConsultantSharingObjectId(input.target.adjustmentId, 'adjustmentId'),
        reversalId: nullableConsultantSharingObjectId(input.target.reversalId, 'reversalId'),
        settlementId: nullableConsultantSharingObjectId(input.target.settlementId, 'settlementId'),
        settlementPaymentId: nullableConsultantSharingObjectId(input.target.settlementPaymentId, 'settlementPaymentId'),
        disputeId: nullableConsultantSharingObjectId(input.target.disputeId, 'disputeId'),
        workQueueType: input.workQueueType,
        status: input.assignedToUserId == null ? 'OPEN' : 'ASSIGNED',
        assignedToUserId: nullableConsultantSharingObjectId(input.assignedToUserId, 'assignedToUserId'),
        assignedBy: input.assignedToUserId == null
          ? null
          : consultantSharingObjectId(input.actor.userId, 'assignedBy'),
        assignedAt: input.assignedToUserId == null ? null : input.occurredAt,
        priority: input.priority,
        followUpAt: input.followUpAt,
        deadlineAt: input.deadlineAt,
        escalationLevel: 0,
        escalatedAt: null,
        escalatedBy: null,
        escalatedToUserId: null,
        reasonEncrypted: input.reasonEncrypted,
        resolvedAt: null,
        resolvedBy: null,
      }],
      { session: consultantSharingMongoSession(input.transaction) },
    );
    return projectWorkItem(record.toObject() as Readonly<Record<string, unknown>>);
  }

  public async listAssigned(
    input: Parameters<ConsultantWorkQueueRepositoryPort['listAssigned']>[0],
  ) {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 25)));
    const filter: Record<string, unknown> = {
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      status: { $nin: ['RESOLVED', 'CANCELLED'] },
    };
    if (input.assignedToUserId != null) {
      filter.assignedToUserId = consultantSharingObjectId(input.assignedToUserId, 'assignedToUserId');
    }
    const [records, totalItems] = await Promise.all([
      ConsultantWorkItemModel.find(filter)
        .sort({ priority: -1, deadlineAt: 1, createdAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      ConsultantWorkItemModel.countDocuments(filter).exec(),
    ]);
    return {
      items: records.map((record) => projectWorkItem(record as Readonly<Record<string, unknown>>)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async assign(
    input: Parameters<ConsultantWorkQueueRepositoryPort['assign']>[0],
  ) {
    const record = await ConsultantWorkItemModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.workItemId, 'workItemId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: { $nin: ['RESOLVED', 'CANCELLED'] },
      },
      {
        $set: {
          status: 'ASSIGNED',
          assignedToUserId: consultantSharingObjectId(input.assignedToUserId, 'assignedToUserId'),
          assignedBy: consultantSharingObjectId(input.actor.userId, 'assignedBy'),
          assignedAt: input.occurredAt,
          followUpAt: input.followUpAt,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        runValidators: true,
        session: consultantSharingMongoSession(input.transaction),
      },
    ).lean().exec();
    return record == null
      ? null
      : projectWorkItem(record as Readonly<Record<string, unknown>>);
  }

  public async escalate(
    input: Parameters<ConsultantWorkQueueRepositoryPort['escalate']>[0],
  ) {
    const record = await ConsultantWorkItemModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.workItemId, 'workItemId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: { $nin: ['RESOLVED', 'CANCELLED'] },
      },
      {
        $set: {
          status: 'ESCALATED',
          escalatedAt: input.occurredAt,
          escalatedBy: consultantSharingObjectId(input.actor.userId, 'escalatedBy'),
          escalatedToUserId: consultantSharingObjectId(input.escalatedToUserId, 'escalatedToUserId'),
          reasonEncrypted: input.reasonEncrypted,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1, escalationLevel: 1 },
      },
      {
        new: true,
        runValidators: true,
        session: consultantSharingMongoSession(input.transaction),
      },
    ).lean().exec();
    return record == null
      ? null
      : projectWorkItem(record as Readonly<Record<string, unknown>>);
  }
}