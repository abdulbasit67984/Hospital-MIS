import type {
  FilterQuery,
} from 'mongoose';

import {
  ClaimWorkItemModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimsListQuery,
} from '../claims.contracts.js';

import type {
  ClaimWorkQueueRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimsMongoSession,
  ClaimWorkItemRecord,
} from '../claims.persistence.types.js';

import {
  normalizeClaimPagination,
} from '../claims.normalization.js';

import {
  claimRecord,
  nullableClaimObjectIdValue,
  withClaimsSession,
} from './claims-repository.support.js';

export class MongoClaimWorkQueueRepository
implements ClaimWorkQueueRepositoryPort {
  public async upsertOpenItem(
    actor: Parameters<ClaimWorkQueueRepositoryPort['upsertOpenItem']>[0],
    input: Parameters<ClaimWorkQueueRepositoryPort['upsertOpenItem']>[1],
    transaction: Parameters<ClaimWorkQueueRepositoryPort['upsertOpenItem']>[2],
  ): Promise<ClaimWorkItemRecord> {
    const found = await ClaimWorkItemModel.findOneAndUpdate(
      {
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        claimId: toObjectId(input.claimId, 'claimId'),
        claimLineId: nullableClaimObjectIdValue(
          input.claimLineId,
          'claimLineId',
        ),
        appealId: nullableClaimObjectIdValue(input.appealId, 'appealId'),
        workQueueType: input.workQueueType,
        status: {
          $in: [
            'OPEN',
            'ASSIGNED',
            'IN_PROGRESS',
            'WAITING_ON_PAYER',
            'WAITING_ON_INTERNAL',
            'ESCALATED',
          ],
        },
      },
      {
        $setOnInsert: {
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          claimId: toObjectId(input.claimId, 'claimId'),
          claimLineId: nullableClaimObjectIdValue(
            input.claimLineId,
            'claimLineId',
          ),
          appealId: nullableClaimObjectIdValue(input.appealId, 'appealId'),
          workQueueType: input.workQueueType,
          status: 'OPEN',
          assignedToUserId: null,
          assignedBy: null,
          escalationLevel: 0,
          escalatedAt: null,
          escalatedBy: null,
          escalatedToUserId: null,
          resolvedAt: null,
          resolvedBy: null,
        },
        $set: {
          priority: input.priority,
          followUpAt: input.followUpAt ?? null,
          reasonEncrypted: input.reasonEncrypted ?? null,
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        session: transaction.session,
      },
    )
      .lean()
      .exec();

    return claimRecord<ClaimWorkItemRecord>(found);
  }

  public async findById(
    facilityId: string,
    workItemId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimWorkItemRecord | null> {
    return claimRecord<ClaimWorkItemRecord | null>(
      await withClaimsSession(
        ClaimWorkItemModel.findOne({
          _id: toObjectId(workItemId, 'workItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimWorkItemRecord[];
    totalItems: number;
  }>> {
    const { pageSize, skip } = normalizeClaimPagination(query);
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.workQueueType === undefined ||
      query.workQueueType.length === 0
        ? {}
        : { workQueueType: { $in: query.workQueueType } }),
      ...(query.assignedToUserId === undefined
        ? {}
        : {
            assignedToUserId: toObjectId(
              query.assignedToUserId,
              'assignedToUserId',
            ),
          }),
      ...(query.followUpDueBefore === undefined
        ? {}
        : { followUpAt: { $lte: new Date(query.followUpDueBefore) } }),
      ...(query.includeClosed === true
        ? {}
        : { status: { $nin: ['RESOLVED', 'CANCELLED'] } }),
    };

    if (query.patientId !== undefined || query.payerOrganizationId !== undefined) {
      const claimFilter: FilterQuery<unknown> = {
        facilityId: toObjectId(facilityId, 'facilityId'),
        ...(query.patientId === undefined
          ? {}
          : { patientId: toObjectId(query.patientId, 'patientId') }),
        ...(query.payerOrganizationId === undefined
          ? {}
          : {
              payerOrganizationId: toObjectId(
                query.payerOrganizationId,
                'payerOrganizationId',
              ),
            }),
      };
      const claimIds = await ClaimWorkItemModel.db
        .collection('claims')
        .distinct('_id', claimFilter);
      filter['claimId'] = { $in: claimIds };
    }

    const [records, totalItems] = await Promise.all([
      ClaimWorkItemModel.find(filter)
        .sort({ priority: -1, followUpAt: 1, createdAt: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      ClaimWorkItemModel.countDocuments(filter).exec(),
    ]);

    return {
      records: claimRecord<ClaimWorkItemRecord[]>(records),
      totalItems,
    };
  }

  public async assign(
    facilityId: string,
    workItemId: string,
    input: Parameters<ClaimWorkQueueRepositoryPort['assign']>[2],
    actorUserId: string,
    transaction: Parameters<ClaimWorkQueueRepositoryPort['assign']>[4],
  ): Promise<ClaimWorkItemRecord | null> {
    return claimRecord<ClaimWorkItemRecord | null>(
      await ClaimWorkItemModel.findOneAndUpdate(
        {
          _id: toObjectId(workItemId, 'workItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: { $nin: ['RESOLVED', 'CANCELLED'] },
        },
        {
          $set: {
            status: 'ASSIGNED',
            assignedToUserId: toObjectId(
              input.assignedToUserId,
              'assignedToUserId',
            ),
            assignedBy: toObjectId(actorUserId, 'assignedBy'),
            followUpAt:
              input.followUpAt == null
                ? null
                : new Date(input.followUpAt),
            ...(input.priority === undefined
              ? {}
              : { priority: input.priority }),
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: transaction.session,
        },
      ).lean().exec(),
    );
  }

  public async escalate(
    facilityId: string,
    workItemId: string,
    input: Parameters<ClaimWorkQueueRepositoryPort['escalate']>[2],
    actorUserId: string,
    reasonEncrypted: string,
    transaction: Parameters<ClaimWorkQueueRepositoryPort['escalate']>[5],
  ): Promise<ClaimWorkItemRecord | null> {
    const now = new Date();

    return claimRecord<ClaimWorkItemRecord | null>(
      await ClaimWorkItemModel.findOneAndUpdate(
        {
          _id: toObjectId(workItemId, 'workItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: { $nin: ['RESOLVED', 'CANCELLED'] },
        },
        {
          $set: {
            status: 'ESCALATED',
            escalatedAt: now,
            escalatedBy: toObjectId(actorUserId, 'escalatedBy'),
            escalatedToUserId: toObjectId(
              input.escalatedToUserId ?? actorUserId,
              'escalatedToUserId',
            ),
            followUpAt: new Date(input.followUpAt),
            reasonEncrypted,
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: {
            version: 1,
            escalationLevel: 1,
          },
        },
        {
          new: true,
          runValidators: true,
          session: transaction.session,
        },
      ).lean().exec(),
    );
  }

  public async resolve(
    facilityId: string,
    workItemId: string,
    expectedVersion: number,
    actorUserId: string,
    transaction: Parameters<ClaimWorkQueueRepositoryPort['resolve']>[4],
  ): Promise<ClaimWorkItemRecord | null> {
    const now = new Date();

    return claimRecord<ClaimWorkItemRecord | null>(
      await ClaimWorkItemModel.findOneAndUpdate(
        {
          _id: toObjectId(workItemId, 'workItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
          status: { $nin: ['RESOLVED', 'CANCELLED'] },
        },
        {
          $set: {
            status: 'RESOLVED',
            resolvedAt: now,
            resolvedBy: toObjectId(actorUserId, 'resolvedBy'),
            updatedBy: toObjectId(actorUserId, 'updatedBy'),
            transactionId: transaction.transactionId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: transaction.session,
        },
      ).lean().exec(),
    );
  }
}