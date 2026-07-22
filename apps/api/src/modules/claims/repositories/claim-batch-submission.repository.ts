import type {
  FilterQuery,
} from 'mongoose';

import {
  ClaimBatchModel,
  ClaimSubmissionModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  ClaimsListQuery,
} from '../claims.contracts.js';

import type {
  ClaimBatchRepositoryPort,
  ClaimSubmissionRepositoryPort,
} from '../claims.ports.js';

import type {
  ClaimBatchRecord,
  ClaimSubmissionRecord,
  ClaimsMongoSession,
} from '../claims.persistence.types.js';

import {
  normalizeClaimPagination,
} from '../claims.normalization.js';

import {
  claimRecord,
  claimSortDirection,
  nullableClaimObjectIdValue,
  throwMappedClaimsPersistenceError,
  withClaimsSession,
} from './claims-repository.support.js';

function normalizeBatchUpdate(
  update: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const decimalFields = new Set([
    'claimedAmount',
    'approvedAmount',
    'paidAmount',
  ]);
  const objectIdFields = new Set([
    'approvalRequestId',
    'approvedBy',
    'submittedBy',
  ]);

  return Object.fromEntries(
    Object.entries(update).map(([key, value]) => {
      if (decimalFields.has(key) && typeof value === 'string') {
        return [key, decimal128(value)];
      }
      if (
        objectIdFields.has(key) &&
        (typeof value === 'string' || value === null)
      ) {
        return [key, nullableClaimObjectIdValue(value, key)];
      }
      return [key, value];
    }),
  );
}

function normalizeSubmissionInput(
  actor: Parameters<ClaimSubmissionRepositoryPort['createAttempt']>[0],
  input: Readonly<Record<string, unknown>>,
  transaction: Parameters<ClaimSubmissionRepositoryPort['createAttempt']>[2],
): Readonly<Record<string, unknown>> {
  const normalized: Record<string, unknown> = {
    facilityId: toObjectId(actor.facilityId, 'facilityId'),
    transactionId: transaction.transactionId,
    correlationId: actor.correlationId,
    schemaVersion: 1,
    version: 0,
    createdBy: toObjectId(actor.userId, 'createdBy'),
    updatedBy: toObjectId(actor.userId, 'updatedBy'),
    submittedBy: toObjectId(actor.userId, 'submittedBy'),
  };

  for (const [key, value] of Object.entries(input)) {
    if (
      ['claimBatchId', 'outboundAttachmentId'].includes(key) &&
      (typeof value === 'string' || value === null)
    ) {
      normalized[key] = nullableClaimObjectIdValue(value, key);
      continue;
    }
    normalized[key] = value;
  }

  return normalized;
}

export class MongoClaimBatchRepository
implements ClaimBatchRepositoryPort {
  public async create(
    actor: Parameters<ClaimBatchRepositoryPort['create']>[0],
    input: Parameters<ClaimBatchRepositoryPort['create']>[1],
    batchNumber: string,
    totals: Parameters<ClaimBatchRepositoryPort['create']>[3],
    metadata: Parameters<ClaimBatchRepositoryPort['create']>[4],
    transaction: Parameters<ClaimBatchRepositoryPort['create']>[5],
  ): Promise<ClaimBatchRecord> {
    try {
      const [created] = await ClaimBatchModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          operationKey: metadata.operationKey,
          batchNumber,
          payerOrganizationId: toObjectId(
            input.payerOrganizationId,
            'payerOrganizationId',
          ),
          panelPlanId: nullableClaimObjectIdValue(
            input.panelPlanId,
            'panelPlanId',
          ),
          submissionChannel: input.submissionChannel,
          destinationReference: input.destinationReference ?? null,
          clearinghouseReference: input.clearinghouseReference ?? null,
          status: 'DRAFT',
          claimIds: input.claimIds.map((claimId) =>
            toObjectId(claimId, 'claimId'),
          ),
          claimCount: totals.claimCount,
          claimedAmount: decimal128(totals.claimedAmount),
          approvedAmount: decimal128(totals.approvedAmount),
          paidAmount: decimal128(totals.paidAmount),
          submissionStatus: null,
          approvalRequestId: null,
          approvedBy: null,
          approvedAt: null,
          submittedBy: null,
          submittedAt: null,
          acknowledgedAt: null,
          notesEncrypted: metadata.notesEncrypted,
        }],
        { session: transaction.session },
      );

      return claimRecord<ClaimBatchRecord>(created!.toObject());
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    batchId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimBatchRecord | null> {
    return claimRecord<ClaimBatchRecord | null>(
      await withClaimsSession(
        ClaimBatchModel.findOne({
          _id: toObjectId(batchId, 'claimBatchId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findActiveContainingClaim(
    facilityId: string,
    claimId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimBatchRecord | null> {
    return claimRecord<ClaimBatchRecord | null>(
      await withClaimsSession(
        ClaimBatchModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimIds: toObjectId(claimId, 'claimId'),
          status: { $nin: ['COMPLETED', 'CANCELLED', 'REVERSED'] },
        })
          .sort({ createdAt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: ClaimsListQuery,
  ): Promise<Readonly<{
    records: readonly ClaimBatchRecord[];
    totalItems: number;
  }>> {
    const { pageSize, skip } = normalizeClaimPagination(query);
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.payerOrganizationId === undefined
        ? {}
        : {
            payerOrganizationId: toObjectId(
              query.payerOrganizationId,
              'payerOrganizationId',
            ),
          }),
      ...(query.panelPlanId === undefined
        ? {}
        : { panelPlanId: toObjectId(query.panelPlanId, 'panelPlanId') }),
      ...(query.includeClosed === true
        ? {}
        : { status: { $nin: ['COMPLETED', 'CANCELLED', 'REVERSED'] } }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined
                ? {}
                : { $gte: new Date(query.from) }),
              ...(query.to === undefined
                ? {}
                : { $lte: new Date(query.to) }),
            },
          }),
    };

    const [records, totalItems] = await Promise.all([
      ClaimBatchModel.find(filter)
        .sort({ createdAt: claimSortDirection(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      ClaimBatchModel.countDocuments(filter).exec(),
    ]);

    return {
      records: claimRecord<ClaimBatchRecord[]>(records),
      totalItems,
    };
  }

  public async updateStatus(
    facilityId: string,
    batchId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: Parameters<ClaimBatchRepositoryPort['updateStatus']>[5],
  ): Promise<ClaimBatchRecord | null> {
    try {
      return claimRecord<ClaimBatchRecord | null>(
        await ClaimBatchModel.findOneAndUpdate(
          {
            _id: toObjectId(batchId, 'claimBatchId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
          },
          {
            $set: {
              ...normalizeBatchUpdate(update),
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
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }
}

export class MongoClaimSubmissionRepository
implements ClaimSubmissionRepositoryPort {
  public async createAttempt(
    actor: Parameters<ClaimSubmissionRepositoryPort['createAttempt']>[0],
    input: Readonly<Record<string, unknown>>,
    transaction: Parameters<ClaimSubmissionRepositoryPort['createAttempt']>[2],
  ): Promise<ClaimSubmissionRecord> {
    try {
      const [created] = await ClaimSubmissionModel.create(
        [normalizeSubmissionInput(actor, input, transaction)],
        { session: transaction.session },
      );

      return claimRecord<ClaimSubmissionRecord>(created!.toObject());
    } catch (error) {
      throwMappedClaimsPersistenceError(error);
    }
  }

  public async findLatestForBatch(
    facilityId: string,
    batchId: string,
    session?: ClaimsMongoSession,
  ): Promise<ClaimSubmissionRecord | null> {
    return claimRecord<ClaimSubmissionRecord | null>(
      await withClaimsSession(
        ClaimSubmissionModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          claimBatchId: toObjectId(batchId, 'claimBatchId'),
        })
          .sort({ submissionAttempt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async updateStatus(
    facilityId: string,
    submissionId: string,
    expectedVersion: number,
    update: Readonly<Record<string, unknown>>,
    actorUserId: string,
    transaction: Parameters<ClaimSubmissionRepositoryPort['updateStatus']>[5],
  ): Promise<ClaimSubmissionRecord | null> {
    return claimRecord<ClaimSubmissionRecord | null>(
      await ClaimSubmissionModel.findOneAndUpdate(
        {
          _id: toObjectId(submissionId, 'submissionId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            ...update,
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

  public async recordAcknowledgement(
    facilityId: string,
    submissionId: string,
    input: Parameters<ClaimSubmissionRepositoryPort['recordAcknowledgement']>[2],
    actorUserId: string,
    transaction: Parameters<ClaimSubmissionRepositoryPort['recordAcknowledgement']>[4],
  ): Promise<ClaimSubmissionRecord | null> {
    return this.updateStatus(
      facilityId,
      submissionId,
      input.expectedVersion,
      {
        status: 'ACKNOWLEDGED',
        acknowledgementReference: input.acknowledgementReference,
        payerReferenceNumber: input.payerReferenceNumber ?? null,
        clearinghouseReference: input.clearinghouseReference ?? null,
        acknowledgedAt: new Date(input.acknowledgedAt),
        completedAt: new Date(input.acknowledgedAt),
        rejectionCode: input.accepted
          ? null
          : input.rejectionCode ?? 'PAYER_REJECTED',
        rejectionReason: input.accepted
          ? null
          : input.rejectionReason ?? 'Payer rejected the submission',
      },
      actorUserId,
      transaction,
    );
  }
}