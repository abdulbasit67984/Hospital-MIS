import {
  FundAllocationReversalModel,
  FundReturnModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AssistanceReversalRepositoryPort,
  FundReturnRepositoryPort,
} from '../welfare-zakat.ports.js';
import type {
  FundAllocationReversalRecord,
  FundReturnRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import {
  nullableWelfareZakatObjectId,
  throwMappedWelfareZakatPersistenceError,
  welfareZakatDecimal,
  welfareZakatObjectId,
  welfareZakatRecord,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

export class MongoAssistanceReversalRepository
implements AssistanceReversalRepositoryPort {
  public async create(
    input: Parameters<AssistanceReversalRepositoryPort['create']>[0],
  ): Promise<FundAllocationReversalRecord> {
    try {
      const [created] = await FundAllocationReversalModel.create(
        [{
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          operationKey: input.operationKey,
          allocationId: input.allocation._id,
          invoiceLineId: nullableWelfareZakatObjectId(
            input.input.invoiceLineId,
            'invoiceLineId',
          ),
          amount: welfareZakatDecimal(input.input.amount),
          status: 'APPROVAL_PENDING',
          reason: input.input.reason,
          supportingAttachmentIds: (input.input.supportingAttachmentIds ?? []).map(
            (id) => toObjectId(id, 'supportingAttachmentId'),
          ),
          makerUserId: toObjectId(input.actor.userId, 'makerUserId'),
          checkerUserId: null,
          approvalRequestId: toObjectId(
            input.input.approvalRequestId,
            'approvalRequestId',
          ),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          requestedAt: input.requestedAt,
          postedAt: null,
          immutableHash: input.immutableHash,
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
        }],
        { session: input.transaction.session },
      );
      return welfareZakatRecord<FundAllocationReversalRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    reversalId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundAllocationReversalRecord | null> {
    return welfareZakatRecord<FundAllocationReversalRecord | null>(
      await withWelfareZakatSession(
        FundAllocationReversalModel.findOne({
          _id: welfareZakatObjectId(reversalId, 'reversalId'),
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async post(
    input: Parameters<AssistanceReversalRepositoryPort['post']>[0],
  ): Promise<FundAllocationReversalRecord | null> {
    const updated = await FundAllocationReversalModel.findOneAndUpdate(
      {
        _id: welfareZakatObjectId(input.reversalId, 'reversalId'),
        facilityId: welfareZakatObjectId(input.actor.facilityId, 'facilityId'),
        status: { $in: ['APPROVAL_PENDING', 'APPROVED'] },
        makerUserId: { $ne: toObjectId(input.checkerUserId, 'checkerUserId') },
      },
      {
        $set: {
          status: 'POSTED',
          checkerUserId: toObjectId(input.checkerUserId, 'checkerUserId'),
          postedAt: input.postedAt,
          updatedAt: input.postedAt,
        },
      },
      {
        session: input.transaction.session,
        returnDocument: 'after',
        runValidators: true,
      },
    ).lean().exec();
    return welfareZakatRecord<FundAllocationReversalRecord | null>(updated);
  }
}

export class MongoFundReturnRepository implements FundReturnRepositoryPort {
  public async create(
    input: Parameters<FundReturnRepositoryPort['create']>[0],
  ): Promise<FundReturnRecord> {
    try {
      const [created] = await FundReturnModel.create(
        [{
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          operationKey: input.operationKey,
          returnType: input.returnType,
          allocationId: input.allocation._id,
          fundId: input.allocation.fundId,
          amount: welfareZakatDecimal(input.input.amount),
          paymentId: nullableWelfareZakatObjectId(input.input.paymentId, 'paymentId'),
          refundId: nullableWelfareZakatObjectId(input.input.refundId, 'refundId'),
          creditNoteId: nullableWelfareZakatObjectId(
            input.input.creditNoteId,
            'creditNoteId',
          ),
          debitNoteId: nullableWelfareZakatObjectId(
            input.input.debitNoteId,
            'debitNoteId',
          ),
          claimAdjustmentId: nullableWelfareZakatObjectId(
            input.input.claimAdjustmentId,
            'claimAdjustmentId',
          ),
          approvalRequestId: toObjectId(
            input.input.approvalRequestId,
            'approvalRequestId',
          ),
          makerUserId: toObjectId(input.makerUserId, 'makerUserId'),
          checkerUserId: toObjectId(input.checkerUserId, 'checkerUserId'),
          reason: input.input.reason,
          attachmentIds: (input.input.supportingAttachmentIds ?? []).map((id) =>
            toObjectId(id, 'supportingAttachmentId'),
          ),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          postedAt: input.postedAt,
          immutableHash: input.immutableHash,
          reversedAt: null,
          reversedBy: null,
          reversalReason: null,
        }],
        { session: input.transaction.session },
      );
      return welfareZakatRecord<FundReturnRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error);
    }
  }
}