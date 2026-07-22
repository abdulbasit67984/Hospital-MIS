import type { FilterQuery } from 'mongoose';

import {
  FundTransferModel,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import type { WelfareZakatListQuery } from '../welfare-zakat.contracts.js';
import type { FundTransferRepositoryPort } from '../welfare-zakat.ports.js';
import type {
  FundTransferRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import {
  normalizeAssistancePagination,
} from '../welfare-zakat.normalization.js';
import {
  welfareZakatRecord,
  welfareZakatSortDirection,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

function transferFilter(
  facilityId: string,
  query: WelfareZakatListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };

  if (query.fundId != null) {
    const fundId = toObjectId(query.fundId, 'fundId');
    filter.$or = [{ sourceFundId: fundId }, { destinationFundId: fundId }];
  }
  if (query.from != null || query.to != null) {
    filter.createdAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }
  if (query.includeClosed !== true) {
    filter.status = { $nin: ['REJECTED', 'CANCELLED', 'REVERSED'] };
  }

  return filter;
}

export class MongoFundTransferRepository implements FundTransferRepositoryPort {
  public async create(
    input: Parameters<FundTransferRepositoryPort['create']>[0],
  ): Promise<FundTransferRecord> {
    const [created] = await FundTransferModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'createdBy'),
        updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        transferNumber: input.transferNumber,
        sourceFundId: toObjectId(input.input.sourceFundId, 'sourceFundId'),
        destinationFundId: toObjectId(
          input.input.destinationFundId,
          'destinationFundId',
        ),
        amount: decimalStringToDecimal128(input.input.amount),
        currency: 'PKR',
        status: 'REQUESTED',
        approvalRequestId: toObjectId(
          input.input.approvalRequestId,
          'approvalRequestId',
        ),
        makerUserId: toObjectId(input.actor.userId, 'makerUserId'),
        checkerUserId: null,
        sourceTransactionId: null,
        destinationTransactionId: null,
        reason: input.input.reason,
        attachmentIds: (input.input.attachmentIds ?? []).map((id) =>
          toObjectId(id, 'attachmentId'),
        ),
        postedAt: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      }],
      { session: input.transaction.session },
    );

    return welfareZakatRecord<FundTransferRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    transferId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransferRecord | null> {
    return welfareZakatRecord<FundTransferRecord | null>(
      await withWelfareZakatSession(
        FundTransferModel.findOne({
          _id: toObjectId(transferId, 'transferId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly FundTransferRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter = transferFilter(facilityId, query);
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        FundTransferModel.find(filter)
          .sort({ createdAt: welfareZakatSortDirection(query.sortDirection), _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(FundTransferModel.countDocuments(filter), session).exec(),
    ]);

    return {
      records: welfareZakatRecord<readonly FundTransferRecord[]>(records),
      total: Number(total),
    };
  }

  public async post(
    input: Parameters<FundTransferRepositoryPort['post']>[0],
  ): Promise<FundTransferRecord | null> {
    return welfareZakatRecord<FundTransferRecord | null>(
      await FundTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(input.transferId, 'transferId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'REQUESTED',
          makerUserId: { $ne: toObjectId(input.checkerUserId, 'checkerUserId') },
        },
        {
          $set: {
            status: 'POSTED',
            checkerUserId: toObjectId(input.checkerUserId, 'checkerUserId'),
            sourceTransactionId: toObjectId(
              input.sourceTransactionId,
              'sourceTransactionId',
            ),
            destinationTransactionId: toObjectId(
              input.destinationTransactionId,
              'destinationTransactionId',
            ),
            postedAt: input.postedAt,
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: input.transaction.session,
        },
      ).lean().exec(),
    );
  }

  public async reject(
    input: Parameters<FundTransferRepositoryPort['reject']>[0],
  ): Promise<FundTransferRecord | null> {
    return welfareZakatRecord<FundTransferRecord | null>(
      await FundTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(input.transferId, 'transferId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'REQUESTED',
          makerUserId: { $ne: toObjectId(input.checkerUserId, 'checkerUserId') },
        },
        {
          $set: {
            status: 'REJECTED',
            checkerUserId: toObjectId(input.checkerUserId, 'checkerUserId'),
            reason: input.reason,
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: input.transaction.session,
        },
      ).lean().exec(),
    );
  }

  public async reverse(
    input: Parameters<FundTransferRepositoryPort['reverse']>[0],
  ): Promise<FundTransferRecord | null> {
    return welfareZakatRecord<FundTransferRecord | null>(
      await FundTransferModel.findOneAndUpdate(
        {
          _id: toObjectId(input.transferId, 'transferId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: 'POSTED',
        },
        {
          $set: {
            status: 'REVERSED',
            reversedAt: input.reversedAt,
            reversedBy: toObjectId(input.actor.userId, 'reversedBy'),
            reversalReason: input.reason,
            updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
            correlationId: input.actor.correlationId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          runValidators: true,
          session: input.transaction.session,
        },
      ).lean().exec(),
    );
  }
}