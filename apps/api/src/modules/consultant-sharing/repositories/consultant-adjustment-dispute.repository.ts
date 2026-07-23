import {
  ConsultantDisputeHistoryModel,
  ConsultantDisputeModel,
  ConsultantRevenueAdjustmentModel,
  ConsultantRevenueEntryModel,
  ConsultantRevenueReversalModel,
} from '@hospital-mis/database';

import type { ConsultantDisputeView, ConsultantRevenueEntryView } from '../consultant-sharing.contracts.js';
import type {
  ConsultantRevenueAdjustmentView,
  ConsultantRevenueReversalView,
} from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import {
  ConsultantRevenueEntryNotFoundError,
  ConsultantRevenueReconciliationError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import type {
  ConsultantDisputeHistoryRepositoryPort,
  ConsultantDisputeRepositoryPort,
  ConsultantRevenueAdjustmentRepositoryPort,
  ConsultantRevenueReversalRepositoryPort,
} from '../consultant-sharing.ports.js';
import {
  consultantSharingDecimal,
  consultantSharingDecimalString,
  consultantSharingIdString,
  consultantSharingIso,
  consultantSharingMongoSession,
  consultantSharingObjectId,
  nullableConsultantSharingIdString,
  nullableConsultantSharingIso,
  nullableConsultantSharingObjectId,
  throwMappedConsultantSharingPersistenceError,
  withConsultantSharingSession,
} from './consultant-sharing-repository.support.js';


function projectRevenueEntry(value: unknown): ConsultantRevenueEntryView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    consultantId: consultantSharingIdString(record['consultantId']),
    agreementId: consultantSharingIdString(record['agreementId']),
    agreementRuleId: consultantSharingIdString(record['agreementRuleId']),
    invoiceId: consultantSharingIdString(record['invoiceId']),
    invoiceLineId: consultantSharingIdString(record['invoiceLineId']),
    entryType: record['entryType'] as ConsultantRevenueEntryView['entryType'],
    status: record['status'] as ConsultantRevenueEntryView['status'],
    eligibleRevenue: consultantSharingDecimalString(record['eligibleRevenue']),
    consultantShare: consultantSharingDecimalString(record['consultantShare']),
    hospitalShare: consultantSharingDecimalString(record['hospitalShare']),
    taxWithholdingAmount: consultantSharingDecimalString(record['taxWithholdingAmount']),
    deductionAmount: consultantSharingDecimalString(record['deductionAmount']),
    netPayableAmount: consultantSharingDecimalString(record['netPayableAmount']),
    settledAmount: consultantSharingDecimalString(record['settledAmount']),
    outstandingAmount: consultantSharingDecimalString(record['outstandingAmount']),
    settlementId: nullableConsultantSharingIdString(record['settlementId']),
    reversalOfEntryId: nullableConsultantSharingIdString(record['reversalOfEntryId']),
    calculationHash: String(record['calculationHash']),
    occurredAt: consultantSharingIso(record['occurredAt']),
    version: Number(record['version'] ?? 0),
  };
}

function projectAdjustment(value: unknown): ConsultantRevenueAdjustmentView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    adjustmentNumber: String(record['adjustmentNumber']),
    revenueEntryId: consultantSharingIdString(record['revenueEntryId']),
    consultantId: consultantSharingIdString(record['consultantId']),
    settlementId: nullableConsultantSharingIdString(record['settlementId']),
    disputeId: nullableConsultantSharingIdString(record['disputeId']),
    status: record['status'] as ConsultantRevenueAdjustmentView['status'],
    eligibleRevenueDelta: consultantSharingDecimalString(record['eligibleRevenueDelta']),
    consultantShareDelta: consultantSharingDecimalString(record['consultantShareDelta']),
    hospitalShareDelta: consultantSharingDecimalString(record['hospitalShareDelta']),
    taxWithholdingDelta: consultantSharingDecimalString(record['taxWithholdingDelta']),
    deductionDelta: consultantSharingDecimalString(record['deductionDelta']),
    netPayableDelta: consultantSharingDecimalString(record['netPayableDelta']),
    reasonCode: String(record['reasonCode']),
    makerUserId: consultantSharingIdString(record['makerUserId']),
    approvalRequestId: consultantSharingIdString(record['approvalRequestId']),
    requestedAt: consultantSharingIso(record['requestedAt']),
    approvedAt: nullableConsultantSharingIso(record['approvedAt']),
    postedAt: nullableConsultantSharingIso(record['postedAt']),
    postedRevenueEntryId: nullableConsultantSharingIdString(record['postedRevenueEntryId']),
    version: Number(record['version'] ?? 0),
  };
}

function projectReversal(value: unknown): ConsultantRevenueReversalView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    reversalNumber: String(record['reversalNumber']),
    revenueEntryId: consultantSharingIdString(record['revenueEntryId']),
    consultantId: consultantSharingIdString(record['consultantId']),
    status: record['status'] as ConsultantRevenueReversalView['status'],
    eligibleRevenueAmount: consultantSharingDecimalString(record['eligibleRevenueAmount']),
    consultantShareAmount: consultantSharingDecimalString(record['consultantShareAmount']),
    hospitalShareAmount: consultantSharingDecimalString(record['hospitalShareAmount']),
    taxWithholdingAmount: consultantSharingDecimalString(record['taxWithholdingAmount']),
    deductionAmount: consultantSharingDecimalString(record['deductionAmount']),
    netPayableAmount: consultantSharingDecimalString(record['netPayableAmount']),
    sourceFinancialEventId: String(record['sourceFinancialEventId']),
    makerUserId: consultantSharingIdString(record['makerUserId']),
    approvalRequestId: consultantSharingIdString(record['approvalRequestId']),
    requestedAt: consultantSharingIso(record['requestedAt']),
    approvedAt: nullableConsultantSharingIso(record['approvedAt']),
    postedAt: nullableConsultantSharingIso(record['postedAt']),
    reversalRevenueEntryId: nullableConsultantSharingIdString(record['reversalRevenueEntryId']),
    version: Number(record['version'] ?? 0),
  };
}

function projectDispute(value: unknown): ConsultantDisputeView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    disputeNumber: String(record['disputeNumber']),
    consultantId: consultantSharingIdString(record['consultantId']),
    makerUserId: consultantSharingIdString(record['createdBy']),
    targetType: record['targetType'] as ConsultantDisputeView['targetType'],
    settlementId: nullableConsultantSharingIdString(record['settlementId']),
    revenueEntryId: nullableConsultantSharingIdString(record['revenueEntryId']),
    status: record['status'] as ConsultantDisputeView['status'],
    reasonCode: String(record['reasonCode']),
    reason: String(record['reason']),
    requestedAdjustmentAmount: consultantSharingDecimalString(record['requestedAdjustmentAmount']),
    approvedAdjustmentAmount: consultantSharingDecimalString(record['approvedAdjustmentAmount']),
    assignedToUserId: nullableConsultantSharingIdString(record['assignedToUserId']),
    followUpAt: nullableConsultantSharingIso(record['followUpAt']),
    resolvedAt: nullableConsultantSharingIso(record['resolvedAt']),
    version: Number(record['version'] ?? 0),
  };
}

export class MongoConsultantRevenueAdjustmentRepository
implements ConsultantRevenueAdjustmentRepositoryPort {
  public async create(
    input: Parameters<ConsultantRevenueAdjustmentRepositoryPort['create']>[0],
  ): Promise<ConsultantRevenueAdjustmentView> {
    try {
      const [created] = await ConsultantRevenueAdjustmentModel.create([{
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        adjustmentNumber: input.adjustmentNumber,
        revenueEntryId: consultantSharingObjectId(input.revenueEntry.id, 'revenueEntryId'),
        consultantId: consultantSharingObjectId(input.revenueEntry.consultantId, 'consultantId'),
        settlementId: nullableConsultantSharingObjectId(input.settlementId, 'settlementId'),
        disputeId: nullableConsultantSharingObjectId(input.disputeId, 'disputeId'),
        status: 'APPROVAL_PENDING',
        eligibleRevenueDelta: consultantSharingDecimal(input.eligibleRevenueDelta),
        consultantShareDelta: consultantSharingDecimal(input.consultantShareDelta),
        hospitalShareDelta: consultantSharingDecimal(input.hospitalShareDelta),
        taxWithholdingDelta: consultantSharingDecimal(input.taxWithholdingDelta),
        deductionDelta: consultantSharingDecimal(input.deductionDelta),
        netPayableDelta: consultantSharingDecimal(input.netPayableDelta),
        reasonCode: input.reasonCode,
        reason: input.reason,
        supportingAttachmentIds: input.attachmentIds.map((value) => consultantSharingObjectId(value, 'attachmentId')),
        makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
        checkerUserId: null,
        approvalRequestId: consultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
        requestedAt: input.requestedAt,
        approvedAt: null,
        postedAt: null,
        postedRevenueEntryId: null,
        immutableHash: stableConsultantSharingPayloadHash({
          revenueEntryId: input.revenueEntry.id,
          eligibleRevenueDelta: input.eligibleRevenueDelta,
          consultantShareDelta: input.consultantShareDelta,
          reasonCode: input.reasonCode,
          operationKey: input.operationKey,
        }),
        reversalOfAdjustmentId: null,
        reversedByAdjustmentId: null,
      }], { session: consultantSharingMongoSession(input.transaction) });
      return projectAdjustment(created.toObject());
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async findById(
    input: Parameters<ConsultantRevenueAdjustmentRepositoryPort['findById']>[0],
  ): Promise<ConsultantRevenueAdjustmentView | null> {
    const query = ConsultantRevenueAdjustmentModel.findOne({
      _id: consultantSharingObjectId(input.adjustmentId, 'adjustmentId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectAdjustment(value);
  }

  public async approve(
    input: Parameters<ConsultantRevenueAdjustmentRepositoryPort['approve']>[0],
  ): Promise<ConsultantRevenueAdjustmentView | null> {
    const value = await ConsultantRevenueAdjustmentModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.adjustmentId, 'adjustmentId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVAL_PENDING',
        makerUserId: { $ne: consultantSharingObjectId(input.checkerUserId, 'checkerUserId') },
      },
      { $set: { status: 'APPROVED', checkerUserId: consultantSharingObjectId(input.checkerUserId, 'checkerUserId'), approvedAt: input.approvedAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectAdjustment(value);
  }

  public async markPosted(
    input: Parameters<ConsultantRevenueAdjustmentRepositoryPort['markPosted']>[0],
  ): Promise<ConsultantRevenueAdjustmentView | null> {
    const value = await ConsultantRevenueAdjustmentModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.adjustmentId, 'adjustmentId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVED',
      },
      { $set: { status: 'POSTED', postedRevenueEntryId: consultantSharingObjectId(input.postedRevenueEntryId, 'postedRevenueEntryId'), postedAt: input.postedAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectAdjustment(value);
  }

  public async createReversal(
    input: Parameters<ConsultantRevenueReversalRepositoryPort['create']>[0],
  ): Promise<ConsultantRevenueReversalView> {
    try {
      const [created] = await ConsultantRevenueReversalModel.create([{
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        reversalNumber: input.reversalNumber,
        revenueEntryId: consultantSharingObjectId(input.revenueEntry.id, 'revenueEntryId'),
        consultantId: consultantSharingObjectId(input.revenueEntry.consultantId, 'consultantId'),
        status: 'APPROVAL_PENDING',
        eligibleRevenueAmount: consultantSharingDecimal(input.revenueEntry.eligibleRevenue),
        consultantShareAmount: consultantSharingDecimal(input.revenueEntry.consultantShare),
        hospitalShareAmount: consultantSharingDecimal(input.revenueEntry.hospitalShare),
        taxWithholdingAmount: consultantSharingDecimal(input.revenueEntry.taxWithholdingAmount),
        deductionAmount: consultantSharingDecimal(input.revenueEntry.deductionAmount),
        netPayableAmount: consultantSharingDecimal(input.revenueEntry.netPayableAmount),
        sourceFinancialEventId: input.source.sourceFinancialEventId,
        refundId: nullableConsultantSharingObjectId(input.source.refundId, 'refundId'),
        creditNoteId: nullableConsultantSharingObjectId(input.source.creditNoteId, 'creditNoteId'),
        claimAdjustmentId: nullableConsultantSharingObjectId(input.source.claimAdjustmentId, 'claimAdjustmentId'),
        welfareZakatReversalId: nullableConsultantSharingObjectId(input.source.welfareZakatReversalId, 'welfareZakatReversalId'),
        reasonCode: input.source.reasonCode,
        reason: input.source.reason,
        supportingAttachmentIds: input.attachmentIds.map((value) => consultantSharingObjectId(value, 'attachmentId')),
        makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
        checkerUserId: null,
        approvalRequestId: consultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
        requestedAt: input.requestedAt,
        approvedAt: null,
        postedAt: null,
        reversalRevenueEntryId: null,
        immutableHash: stableConsultantSharingPayloadHash({
          revenueEntryId: input.revenueEntry.id,
          sourceFinancialEventId: input.source.sourceFinancialEventId,
          operationKey: input.operationKey,
        }),
      }], { session: consultantSharingMongoSession(input.transaction) });
      return projectReversal(created.toObject());
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async findReversalById(
    input: Parameters<ConsultantRevenueReversalRepositoryPort['findById']>[0],
  ): Promise<ConsultantRevenueReversalView | null> {
    const query = ConsultantRevenueReversalModel.findOne({
      _id: consultantSharingObjectId(input.reversalId, 'reversalId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectReversal(value);
  }

  public async approveReversal(
    input: Parameters<ConsultantRevenueReversalRepositoryPort['approve']>[0],
  ): Promise<ConsultantRevenueReversalView | null> {
    const value = await ConsultantRevenueReversalModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.reversalId, 'reversalId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVAL_PENDING',
        makerUserId: { $ne: consultantSharingObjectId(input.checkerUserId, 'checkerUserId') },
      },
      { $set: { status: 'APPROVED', checkerUserId: consultantSharingObjectId(input.checkerUserId, 'checkerUserId'), approvedAt: input.approvedAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectReversal(value);
  }

  public async markReversalPosted(
    input: Parameters<ConsultantRevenueReversalRepositoryPort['markPosted']>[0],
  ): Promise<ConsultantRevenueReversalView | null> {
    const value = await ConsultantRevenueReversalModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.reversalId, 'reversalId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVED',
      },
      { $set: { status: 'POSTED', reversalRevenueEntryId: consultantSharingObjectId(input.reversalRevenueEntryId, 'reversalRevenueEntryId'), postedAt: input.postedAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectReversal(value);
  }

  public async postApprovedEntry(
    input: Parameters<ConsultantRevenueAdjustmentRepositoryPort['postApprovedEntry']>[0],
  ): Promise<Readonly<{ adjustment: ConsultantRevenueAdjustmentView; entry: ConsultantRevenueEntryView }>> {
    const session = consultantSharingMongoSession(input.transaction);
    const adjustmentDocument = await ConsultantRevenueAdjustmentModel.findOne({
      _id: consultantSharingObjectId(input.adjustmentId, 'adjustmentId'),
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      status: 'APPROVED',
    }).session(session).lean().exec();
    if (adjustmentDocument == null) throw new ConsultantRevenueReconciliationError('Approved consultant adjustment was not found');
    const original = await ConsultantRevenueEntryModel.findOne({
      _id: adjustmentDocument.revenueEntryId,
      facilityId: adjustmentDocument.facilityId,
    }).session(session).lean().exec();
    if (original == null) throw new ConsultantRevenueEntryNotFoundError();
    const consultantDelta = consultantSharingDecimalString(adjustmentDocument.consultantShareDelta);
    const eligibleDelta = consultantSharingDecimalString(adjustmentDocument.eligibleRevenueDelta);
    const hospitalDelta = consultantSharingDecimalString(adjustmentDocument.hospitalShareDelta);
    const taxDelta = consultantSharingDecimalString(adjustmentDocument.taxWithholdingDelta);
    const deductionDelta = consultantSharingDecimalString(adjustmentDocument.deductionDelta);
    const netDelta = consultantSharingDecimalString(adjustmentDocument.netPayableDelta);
    const direction = netDelta.startsWith('-') ? 'DEBIT' : 'CREDIT';
    const absolute = (value: string) => value.startsWith('-') ? value.slice(1) : value;
    const calculationHash = stableConsultantSharingPayloadHash({ adjustmentId: input.adjustmentId, originalCalculationHash: original.calculationHash });
    const clone = original.toObject == null ? { ...original } : original.toObject();
    const [created] = await ConsultantRevenueEntryModel.create([{
      ...clone,
      _id: undefined,
      operationKey: `consultant-adjustment-entry:${input.adjustmentId}`,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      direction,
      entryType: 'ADJUSTMENT',
      status: 'POSTED',
      grossAmount: consultantSharingDecimal('0.00'),
      discountAmount: consultantSharingDecimal('0.00'),
      welfareZakatAmount: consultantSharingDecimal('0.00'),
      panelSponsorAmount: consultantSharingDecimal('0.00'),
      patientAmount: consultantSharingDecimal('0.00'),
      packageAmount: consultantSharingDecimal('0.00'),
      refundAmount: consultantSharingDecimal('0.00'),
      creditNoteAmount: consultantSharingDecimal('0.00'),
      debitNoteAmount: consultantSharingDecimal('0.00'),
      writeOffAmount: consultantSharingDecimal('0.00'),
      claimAdjustmentAmount: consultantSharingDecimal('0.00'),
      nonShareableAmount: consultantSharingDecimal('0.00'),
      costDeductionAmount: consultantSharingDecimal('0.00'),
      consumableDeductionAmount: consultantSharingDecimal('0.00'),
      otherEligibilityDeductionAmount: consultantSharingDecimal('0.00'),
      eligibleRevenueBeforeRecognition: consultantSharingDecimal(absolute(eligibleDelta)),
      recognitionRatio: consultantSharingDecimal('1.000000'),
      eligibleRevenue: consultantSharingDecimal(absolute(eligibleDelta)),
      pendingEligibleRevenue: consultantSharingDecimal('0.00'),
      consultantShare: consultantSharingDecimal(absolute(consultantDelta)),
      hospitalShare: consultantSharingDecimal(absolute(hospitalDelta)),
      otherParticipantShare: consultantSharingDecimal('0.00'),
      taxWithholdingAmount: consultantSharingDecimal(absolute(taxDelta)),
      deductionAmount: consultantSharingDecimal(absolute(deductionDelta)),
      netPayableAmount: consultantSharingDecimal(absolute(netDelta)),
      settledAmount: consultantSharingDecimal('0.00'),
      outstandingAmount: consultantSharingDecimal(absolute(netDelta)),
      settlementId: null,
      calculationHash,
      immutableHash: calculationHash,
      calculationTrace: { adjustmentId: input.adjustmentId, sourceCalculationHash: original.calculationHash },
      calculatedBy: consultantSharingObjectId(input.actor.userId, 'calculatedBy'),
      calculatedAt: input.occurredAt,
      occurredAt: input.occurredAt,
      postedAt: input.occurredAt,
      reversalOfEntryId: null,
      reversedByEntryId: null,
      adjustmentOfEntryId: original._id,
      supersedesEntryId: null,
    }], { session });
    await ConsultantRevenueEntryModel.updateOne(
      { _id: original._id, facilityId: original.facilityId, status: { $in: ['POSTED', 'HELD'] } },
      { $set: { status: 'ADJUSTED', updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { session, runValidators: true },
    ).exec();
    const updatedAdjustment = await this.markPosted({ actor: input.actor, adjustmentId: input.adjustmentId, postedRevenueEntryId: created._id.toHexString(), postedAt: input.occurredAt, transaction: input.transaction });
    if (updatedAdjustment == null) throw new ConsultantSharingConcurrencyError();
    return { adjustment: updatedAdjustment, entry: projectRevenueEntry(created.toObject()) };
  }

}

export class MongoConsultantRevenueReversalRepository
implements ConsultantRevenueReversalRepositoryPort {
  public constructor(private readonly delegate = new MongoConsultantRevenueAdjustmentRepository()) {}
  public create(input: Parameters<ConsultantRevenueReversalRepositoryPort['create']>[0]) { return this.delegate.createReversal(input); }
  public findById(input: Parameters<ConsultantRevenueReversalRepositoryPort['findById']>[0]) { return this.delegate.findReversalById(input); }
  public approve(input: Parameters<ConsultantRevenueReversalRepositoryPort['approve']>[0]) { return this.delegate.approveReversal(input); }
  public markPosted(input: Parameters<ConsultantRevenueReversalRepositoryPort['markPosted']>[0]) { return this.delegate.markReversalPosted(input); }
  public async postApprovedEntry(
    input: Parameters<ConsultantRevenueReversalRepositoryPort['postApprovedEntry']>[0],
  ): Promise<Readonly<{ reversal: ConsultantRevenueReversalView; entry: ConsultantRevenueEntryView }>> {
    const session = consultantSharingMongoSession(input.transaction);
    const reversalDocument = await ConsultantRevenueReversalModel.findOne({
      _id: consultantSharingObjectId(input.reversalId, 'reversalId'),
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      status: 'APPROVED',
    }).session(session).lean().exec();
    if (reversalDocument == null) throw new ConsultantRevenueReconciliationError('Approved consultant reversal was not found');
    const original = await ConsultantRevenueEntryModel.findOne({
      _id: reversalDocument.revenueEntryId,
      facilityId: reversalDocument.facilityId,
      status: { $in: ['POSTED', 'HELD', 'ADJUSTED', 'SETTLED'] },
    }).session(session).lean().exec();
    if (original == null) throw new ConsultantRevenueEntryNotFoundError();
    const calculationHash = stableConsultantSharingPayloadHash({ reversalId: input.reversalId, originalCalculationHash: original.calculationHash });
    const clone = original.toObject == null ? { ...original } : original.toObject();
    const [created] = await ConsultantRevenueEntryModel.create([{
      ...clone,
      _id: undefined,
      operationKey: `consultant-reversal-entry:${input.reversalId}`,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      direction: 'DEBIT',
      entryType: 'REVERSAL',
      status: 'POSTED',
      settledAmount: consultantSharingDecimal('0.00'),
      outstandingAmount: consultantSharingDecimal(consultantSharingDecimalString(reversalDocument.netPayableAmount)),
      settlementId: null,
      calculationHash,
      immutableHash: calculationHash,
      calculationTrace: { reversalId: input.reversalId, sourceCalculationHash: original.calculationHash },
      calculatedBy: consultantSharingObjectId(input.actor.userId, 'calculatedBy'),
      calculatedAt: input.occurredAt,
      occurredAt: input.occurredAt,
      postedAt: input.occurredAt,
      reversalOfEntryId: original._id,
      reversedByEntryId: null,
      adjustmentOfEntryId: null,
      supersedesEntryId: null,
    }], { session });
    await ConsultantRevenueEntryModel.updateOne(
      { _id: original._id, facilityId: original.facilityId },
      { $set: { status: 'REVERSED', reversedByEntryId: created._id, outstandingAmount: consultantSharingDecimal('0.00'), updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { session, runValidators: true },
    ).exec();
    const updatedReversal = await this.delegate.markReversalPosted({ actor: input.actor, reversalId: input.reversalId, reversalRevenueEntryId: created._id.toHexString(), postedAt: input.occurredAt, transaction: input.transaction });
    if (updatedReversal == null) throw new ConsultantSharingConcurrencyError();
    return { reversal: updatedReversal, entry: projectRevenueEntry(created.toObject()) };
  }
}

export class MongoConsultantDisputeRepository
implements ConsultantDisputeRepositoryPort, ConsultantDisputeHistoryRepositoryPort {
  public async create(
    input: Parameters<ConsultantDisputeRepositoryPort['create']>[0],
  ): Promise<ConsultantDisputeView> {
    const targetType = input.revenueEntryId != null ? 'REVENUE_ENTRY' : 'SETTLEMENT';
    const [created] = await ConsultantDisputeModel.create([{
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      operationKey: input.operationKey,
      disputeNumber: input.disputeNumber,
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
      targetType,
      agreementId: null,
      agreementRuleId: null,
      revenueEntryId: nullableConsultantSharingObjectId(input.revenueEntryId, 'revenueEntryId'),
      settlementId: nullableConsultantSharingObjectId(input.settlementId, 'settlementId'),
      settlementItemId: null,
      settlementPaymentId: null,
      status: 'OPEN',
      reasonCode: input.reasonCode,
      reason: input.reason,
      evidenceEncrypted: input.evidenceEncrypted,
      reviewerFindingsEncrypted: null,
      resolutionNotesEncrypted: null,
      supportingAttachmentIds: input.attachmentIds.map((value) => consultantSharingObjectId(value, 'attachmentId')),
      requestedAdjustmentAmount: consultantSharingDecimal(input.requestedAdjustmentAmount),
      approvedAdjustmentAmount: consultantSharingDecimal('0.00'),
      postedAdjustmentId: null,
      assignedToUserId: nullableConsultantSharingObjectId(input.assignedToUserId, 'assignedToUserId'),
      assignedBy: input.assignedToUserId == null ? null : consultantSharingObjectId(input.actor.userId, 'assignedBy'),
      assignedAt: input.assignedToUserId == null ? null : new Date(),
      followUpAt: input.followUpAt,
      reviewDeadlineAt: input.reviewDeadlineAt,
      resolutionDeadlineAt: input.resolutionDeadlineAt,
      escalationLevel: 0,
      escalatedAt: null,
      escalatedBy: null,
      escalatedToUserId: null,
      createdByConsultant: false,
      makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
      reviewingUserId: null,
      resolvingUserId: null,
      approvalRequestId: null,
      openedAt: new Date(),
      reviewStartedAt: null,
      informationRequestedAt: null,
      decisionAt: null,
      resolvedAt: null,
      cancelledAt: null,
      resolutionCode: null,
      cancellationReason: null,
    }], { session: consultantSharingMongoSession(input.transaction) });
    return projectDispute(created.toObject());
  }

  public async findById(
    input: Parameters<ConsultantDisputeRepositoryPort['findById']>[0],
  ): Promise<ConsultantDisputeView | null> {
    const query = ConsultantDisputeModel.findOne({
      _id: consultantSharingObjectId(input.disputeId, 'disputeId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectDispute(value);
  }

  public async changeStatus(
    input: Parameters<ConsultantDisputeRepositoryPort['changeStatus']>[0],
  ): Promise<ConsultantDisputeView | null> {
    const metadata: Record<string, unknown> = {};
    if (input.toStatus === 'UNDER_REVIEW') Object.assign(metadata, { reviewingUserId: consultantSharingObjectId(input.actor.userId, 'reviewingUserId'), reviewStartedAt: input.occurredAt });
    if (input.toStatus === 'INFORMATION_REQUESTED') Object.assign(metadata, { informationRequestedAt: input.occurredAt });
    if (['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(input.toStatus)) Object.assign(metadata, { resolvingUserId: consultantSharingObjectId(input.actor.userId, 'resolvingUserId'), decisionAt: input.occurredAt, resolutionCode: input.reason.toUpperCase().slice(0, 120), approvedAdjustmentAmount: consultantSharingDecimal(input.approvedAdjustmentAmount) });
    if (input.toStatus === 'RESOLVED') Object.assign(metadata, { resolvingUserId: consultantSharingObjectId(input.actor.userId, 'resolvingUserId'), resolvedAt: input.occurredAt, resolutionCode: input.reason.toUpperCase().slice(0, 120) });
    if (input.toStatus === 'CANCELLED') Object.assign(metadata, { cancelledAt: input.occurredAt, cancellationReason: input.reason });
    const value = await ConsultantDisputeModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.disputeId, 'disputeId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: input.fromStatus,
        version: input.expectedVersion,
      },
      { $set: { status: input.toStatus, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'), ...metadata }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectDispute(value);
  }

  public async append(
    input: Parameters<ConsultantDisputeHistoryRepositoryPort['append']>[0],
  ): Promise<void> {
    const previousCount = await ConsultantDisputeHistoryModel.countDocuments({
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      disputeId: consultantSharingObjectId(input.dispute.id, 'disputeId'),
    }).session(consultantSharingMongoSession(input.transaction)).exec();
    const snapshot = { ...input.dispute, status: input.toStatus };
    await ConsultantDisputeHistoryModel.create([{
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      disputeId: consultantSharingObjectId(input.dispute.id, 'disputeId'),
      historySequence: previousCount + 1,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      requestedAdjustmentAmount: consultantSharingDecimal(input.dispute.requestedAdjustmentAmount),
      approvedAdjustmentAmount: consultantSharingDecimal(input.dispute.approvedAdjustmentAmount),
      reason: input.reason,
      snapshot,
      snapshotHash: stableConsultantSharingPayloadHash(snapshot),
      attachmentIds: input.attachmentIds.map((value) => consultantSharingObjectId(value, 'attachmentId')),
      actorUserId: consultantSharingObjectId(input.actor.userId, 'actorUserId'),
      approvalRequestId: nullableConsultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
      occurredAt: input.occurredAt,
      immutableHash: stableConsultantSharingPayloadHash({ disputeId: input.dispute.id, sequence: previousCount + 1, snapshot }),
    }], { session: consultantSharingMongoSession(input.transaction) });
  }
}