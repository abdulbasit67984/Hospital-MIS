import { Types } from 'mongoose';

import {
  AssistanceApprovalHistoryModel,
  AssistanceApprovalModel,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AssistanceApprovalHistoryRepositoryPort,
  AssistanceApprovalRepositoryPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApprovalHistoryRecord,
  AssistanceApprovalRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import { normalizeAssistanceCode } from '../welfare-zakat.normalization.js';
import {
  nullableWelfareZakatObjectId,
  welfareZakatRecord,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

const approvalFinancialFields = new Set([
  'requestedAmount',
  'approvedAmount',
  'reservedAmount',
  'committedAmount',
  'utilizedAmount',
  'reversedAmount',
  'releasedAmount',
  'remainingAmount',
]);

function decisionStatus(decision: 'APPROVE' | 'PARTIALLY_APPROVE' | 'REJECT') {
  if (decision === 'APPROVE') return 'APPROVED' as const;
  if (decision === 'PARTIALLY_APPROVE') return 'PARTIALLY_APPROVED' as const;
  return 'REJECTED' as const;
}

export class MongoAssistanceApprovalRepository
implements AssistanceApprovalRepositoryPort {
  public async create(
    input: Parameters<AssistanceApprovalRepositoryPort['create']>[0],
  ): Promise<AssistanceApprovalRecord> {
    const approvalId = new Types.ObjectId();
    const [created] = await AssistanceApprovalModel.create(
      [{
        _id: approvalId,
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'createdBy'),
        updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        approvalNumber: normalizeAssistanceCode(input.approvalNumber),
        applicationId: input.application._id,
        fundId: input.fund._id,
        status: 'PENDING',
        requestedAmount: decimalStringToDecimal128(input.input.requestedAmount),
        approvedAmount: decimalStringToDecimal128('0'),
        reservedAmount: decimalStringToDecimal128('0'),
        committedAmount: decimalStringToDecimal128('0'),
        utilizedAmount: decimalStringToDecimal128('0'),
        reversedAmount: decimalStringToDecimal128('0'),
        releasedAmount: decimalStringToDecimal128('0'),
        remainingAmount: decimalStringToDecimal128('0'),
        approvedFrom: new Date(input.input.approvedFrom),
        approvedThrough:
          input.input.approvedThrough == null
            ? null
            : new Date(input.input.approvedThrough),
        approvedServiceCategories: input.input.approvedServiceCategories ?? [],
        approvedServiceCodes: (input.input.approvedServiceCodes ?? []).map(
          normalizeAssistanceCode,
        ),
        approvedInvoiceLineIds: (input.input.approvedInvoiceLineIds ?? []).map(
          (id) => toObjectId(id, 'approvedInvoiceLineId'),
        ),
        conditionsEncrypted: input.conditionsEncrypted,
        notesEncrypted: input.notesEncrypted,
        approvalMatrixCode: normalizeAssistanceCode(input.input.approvalMatrixCode),
        approvalRequestId: approvalId,
        makerUserId: toObjectId(input.actor.userId, 'makerUserId'),
        checkerUserIds: [],
        approvedAt: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        expiresAt: input.expiresAt,
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
        reversedAt: null,
        reversedBy: null,
        reversalReason: null,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<AssistanceApprovalRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    approvalId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApprovalRecord | null> {
    return welfareZakatRecord<AssistanceApprovalRecord | null>(
      await withWelfareZakatSession(
        AssistanceApprovalModel.findOne({
          _id: toObjectId(approvalId, 'approvalId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listByApplication(
    facilityId: string,
    applicationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<readonly AssistanceApprovalRecord[]> {
    return welfareZakatRecord<readonly AssistanceApprovalRecord[]>(
      await withWelfareZakatSession(
        AssistanceApprovalModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          applicationId: toObjectId(applicationId, 'applicationId'),
        }).sort({ createdAt: -1, _id: -1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async decide(
    input: Parameters<AssistanceApprovalRepositoryPort['decide']>[0],
  ): Promise<AssistanceApprovalRecord | null> {
    const toStatus = decisionStatus(input.decision.decision);
    const approvedAmount = decimalStringToDecimal128(input.authoritativeApprovedAmount);
    const set: Record<string, unknown> = {
      status: toStatus,
      approvedAmount,
      remainingAmount: approvedAmount,
      approvedFrom:
        input.decision.approvedFrom == null
          ? undefined
          : new Date(input.decision.approvedFrom),
      approvedThrough:
        input.decision.approvedThrough === undefined
          ? undefined
          : input.decision.approvedThrough == null
            ? null
            : new Date(input.decision.approvedThrough),
      approvedServiceCategories: input.decision.approvedServiceCategories,
      approvedServiceCodes: input.decision.approvedServiceCodes?.map(
        normalizeAssistanceCode,
      ),
      approvedInvoiceLineIds: input.decision.approvedInvoiceLineIds?.map((id) =>
        toObjectId(id, 'approvedInvoiceLineId'),
      ),
      checkerUserIds: [toObjectId(input.checkerUserId, 'checkerUserId')],
      ...(input.conditionsEncrypted === undefined ? {} : { conditionsEncrypted: input.conditionsEncrypted }),
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
    };
    if (toStatus === 'REJECTED') {
      set.approvedAmount = decimalStringToDecimal128('0');
      set.remainingAmount = decimalStringToDecimal128('0');
      set.rejectedAt = input.decidedAt;
      set.rejectedBy = toObjectId(input.checkerUserId, 'rejectedBy');
      set.rejectionReason = input.decision.decisionReason;
    } else {
      set.approvedAt = input.decidedAt;
      set.rejectionReason = null;
    }
    for (const key of Object.keys(set)) {
      if (set[key] === undefined) delete set[key];
    }

    return welfareZakatRecord<AssistanceApprovalRecord | null>(
      await AssistanceApprovalModel.findOneAndUpdate(
        {
          _id: toObjectId(input.approvalId, 'approvalId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: input.fromStatus,
          makerUserId: { $ne: toObjectId(input.checkerUserId, 'checkerUserId') },
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }

  public async applyFinancialSummary(
    input: Parameters<AssistanceApprovalRepositoryPort['applyFinancialSummary']>[0],
  ): Promise<AssistanceApprovalRecord | null> {
    const amounts = Object.fromEntries(
      Object.entries(input.amounts)
        .filter(([key]) => approvalFinancialFields.has(key))
        .map(([key, value]) => [key, decimalStringToDecimal128(value)]),
    );
    return welfareZakatRecord<AssistanceApprovalRecord | null>(
      await AssistanceApprovalModel.findOneAndUpdate(
        {
          _id: toObjectId(input.approvalId, 'approvalId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        {
          $set: {
            ...amounts,
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

  public async expire(
    input: Parameters<AssistanceApprovalRepositoryPort['expire']>[0],
  ): Promise<AssistanceApprovalRecord | null> {
    return welfareZakatRecord<AssistanceApprovalRecord | null>(
      await AssistanceApprovalModel.findOneAndUpdate(
        {
          _id: toObjectId(input.approvalId, 'approvalId'),
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: { $in: ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'] },
        },
        {
          $set: {
            status: 'EXPIRED',
            expiresAt: input.expiredAt,
            updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
            transactionId: input.transaction.transactionId,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }
}

export class MongoAssistanceApprovalHistoryRepository
implements AssistanceApprovalHistoryRepositoryPort {
  public async append(
    input: Parameters<AssistanceApprovalHistoryRepositoryPort['append']>[0],
  ): Promise<AssistanceApprovalHistoryRecord> {
    const [created] = await AssistanceApprovalHistoryModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        approvalId: input.approval._id,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        requestedAmount: input.approval.requestedAmount,
        approvedAmount: input.approval.approvedAmount,
        remainingAmount: input.approval.remainingAmount,
        makerUserId: input.approval.makerUserId,
        checkerUserId: nullableWelfareZakatObjectId(input.checkerUserId, 'checkerUserId'),
        approvalRequestId: input.approval.approvalRequestId,
        reason: input.reason,
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        occurredAt: input.occurredAt,
        immutableHash: input.immutableHash,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<AssistanceApprovalHistoryRecord>(created!.toObject());
  }
}