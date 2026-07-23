import Decimal from 'decimal.js';

import {
  ConsultantRevenueEntryModel,
  ConsultantSettlementItemModel,
  ConsultantSettlementModel,
  ConsultantSettlementPaymentModel,
} from '@hospital-mis/database';

import type {
  ConsultantRevenueEntryView,
  ConsultantSettlementTotalsResult,
  ConsultantSettlementView,
  ConsultantSharingPage,
} from '../consultant-sharing.contracts.js';
import {
  ConsultantSettlementOverpaymentError,
  ConsultantSettlementReconciliationError,
  ConsultantSharingConcurrencyError,
} from '../consultant-sharing.errors.js';
import type { ConsultantSettlementPaymentView } from '../consultant-sharing.contracts.js';
import { stableConsultantSharingPayloadHash } from '../consultant-sharing.normalization.js';
import type {
  ConsultantSettlementItemRepositoryPort,
  ConsultantSettlementPaymentRepositoryPort,
  ConsultantSettlementRepositoryPort,
  ConsultantSettlementSourceRepositoryPort,
} from '../consultant-sharing.ports.js';
import {
  consultantSharingDecimal,
  consultantSharingDecimalString,
  consultantSharingIdString,
  consultantSharingIso,
  consultantSharingMongoSession,
  consultantSharingObjectId,
  consultantSharingSortDirection,
  nullableConsultantSharingIdString,
  nullableConsultantSharingIso,
  nullableConsultantSharingObjectId,
  throwMappedConsultantSharingPersistenceError,
  withConsultantSharingSession,
} from './consultant-sharing-repository.support.js';

function money(value: Decimal.Value): string {
  const parsed = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!parsed.isFinite()) throw new ConsultantSettlementReconciliationError('Invalid settlement decimal');
  return parsed.toFixed(2);
}

function projectTotals(record: Record<string, unknown>): ConsultantSettlementTotalsResult {
  return {
    openingBalance: consultantSharingDecimalString(record['openingBalance']),
    broughtForwardBalance: consultantSharingDecimalString(record['broughtForwardBalance']),
    eligibleRevenue: consultantSharingDecimalString(record['eligibleRevenue']),
    consultantShare: consultantSharingDecimalString(record['consultantShare']),
    adjustments: consultantSharingDecimalString(record['adjustmentAmount']),
    refundDeductions: consultantSharingDecimalString(record['refundDeductionAmount']),
    creditNoteDeductions: consultantSharingDecimalString(record['creditNoteDeductionAmount']),
    debitNoteAdditions: consultantSharingDecimalString(record['debitNoteAdditionAmount']),
    claimDeductions: money(new Decimal(consultantSharingDecimalString(record['claimEffectAmount'])).negated()),
    welfareZakatDeductions: money(new Decimal(consultantSharingDecimalString(record['welfareZakatEffectAmount'])).negated()),
    taxWithholding: consultantSharingDecimalString(record['taxWithholdingAmount']),
    otherDeductions: consultantSharingDecimalString(record['otherDeductionAmount']),
    advanceRecovery: consultantSharingDecimalString(record['advanceRecoveryAmount']),
    overpaymentRecovery: consultantSharingDecimalString(record['overpaymentRecoveryAmount']),
    paidAmount: consultantSharingDecimalString(record['paidAmount']),
    grossPayable: consultantSharingDecimalString(record['grossPayableAmount']),
    totalDeductions: consultantSharingDecimalString(record['totalDeductionAmount']),
    netPayable: consultantSharingDecimalString(record['netPayableAmount']),
    outstandingAmount: consultantSharingDecimalString(record['outstandingAmount']),
  };
}

function projectSettlement(value: unknown): ConsultantSettlementView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    settlementNumber: String(record['settlementNumber']),
    consultantId: consultantSharingIdString(record['consultantId']),
    periodType: record['periodType'] as ConsultantSettlementView['periodType'],
    periodFrom: consultantSharingIso(record['periodFrom']),
    periodThrough: consultantSharingIso(record['periodThrough']),
    status: record['status'] as ConsultantSettlementView['status'],
    currency: record['currency'] as ConsultantSettlementView['currency'],
    totals: projectTotals(record),
    submittedBy: nullableConsultantSharingIdString(record['submittedBy']),
    approvedBy: nullableConsultantSharingIdString(record['approvedBy']),
    submittedAt: nullableConsultantSharingIso(record['submittedAt']),
    approvedAt: nullableConsultantSharingIso(record['approvedAt']),
    paidAt: nullableConsultantSharingIso(record['paidAt']),
    ledgerTransactionId: nullableConsultantSharingIdString(record['ledgerTransactionId']),
    itemCount: Number(record['itemCount'] ?? 0),
    revenueEntryCount: Number(record['revenueEntryCount'] ?? 0),
    version: Number(record['version'] ?? 0),
    createdAt: consultantSharingIso(record['createdAt']),
    updatedAt: consultantSharingIso(record['updatedAt']),
  };
}

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

function projectPayment(value: unknown): ConsultantSettlementPaymentView {
  const record = value as Record<string, unknown>;
  return {
    id: consultantSharingIdString(record['_id']),
    facilityId: consultantSharingIdString(record['facilityId']),
    payoutNumber: String(record['payoutNumber']),
    settlementId: consultantSharingIdString(record['settlementId']),
    consultantId: consultantSharingIdString(record['consultantId']),
    status: record['status'] as ConsultantSettlementPaymentView['status'],
    paymentMethod: record['paymentMethod'] as ConsultantSettlementPaymentView['paymentMethod'],
    currency: String(record['currency']),
    amount: consultantSharingDecimalString(record['amount']),
    taxWithholdingAmount: consultantSharingDecimalString(record['taxWithholdingAmount']),
    advanceRecoveryAmount: consultantSharingDecimalString(record['advanceRecoveryAmount']),
    overpaymentRecoveryAmount: consultantSharingDecimalString(record['overpaymentRecoveryAmount']),
    otherDeductionAmount: consultantSharingDecimalString(record['otherDeductionAmount']),
    netDisbursedAmount: consultantSharingDecimalString(record['netDisbursedAmount']),
    paymentId: nullableConsultantSharingIdString(record['paymentId']),
    reversalOfPaymentId: nullableConsultantSharingIdString(record['reversalOfPaymentId']),
    reversedByPaymentId: nullableConsultantSharingIdString(record['reversedByPaymentId']),
    makerUserId: consultantSharingIdString(record['makerUserId']),
    approvalRequestId: consultantSharingIdString(record['approvalRequestId']),
    ledgerTransactionId: nullableConsultantSharingIdString(record['ledgerTransactionId']),
    paidAt: nullableConsultantSharingIso(record['paidAt']),
    version: Number(record['version'] ?? 0),
  };
}

export class MongoConsultantSettlementRepository
implements
  ConsultantSettlementRepositoryPort,
  ConsultantSettlementSourceRepositoryPort,
  ConsultantSettlementItemRepositoryPort {
  public async create(
    input: Parameters<ConsultantSettlementRepositoryPort['create']>[0],
  ): Promise<ConsultantSettlementView> {
    const session = consultantSharingMongoSession(input.transaction);
    const source = await ConsultantRevenueEntryModel.findOne({
      _id: { $in: input.revenueEntryIds.map((value) => consultantSharingObjectId(value, 'revenueEntryId')) },
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
    }).session(session).lean().exec();
    const occurredAt = new Date();
    const inputHash = stableConsultantSharingPayloadHash({
      consultantId: input.consultantId,
      periodFrom: input.periodFrom.toISOString(),
      periodThrough: input.periodThrough.toISOString(),
      revenueEntryIds: [...input.revenueEntryIds].sort(),
    });
    const calculationHash = stableConsultantSharingPayloadHash(input.totals);
    try {
      const [created] = await ConsultantSettlementModel.create([{
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        settlementNumber: input.settlementNumber,
        consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
        consultantStaffId: source?.consultantStaffId ?? null,
        consultantGroupId: source?.consultantGroupId ?? null,
        periodType: input.periodType,
        periodFrom: input.periodFrom,
        periodThrough: input.periodThrough,
        status: 'CALCULATED',
        currency: source?.currency ?? 'PKR',
        openingBalance: consultantSharingDecimal(input.totals.openingBalance),
        broughtForwardBalance: consultantSharingDecimal(input.totals.broughtForwardBalance),
        eligibleRevenue: consultantSharingDecimal(input.totals.eligibleRevenue),
        consultantShare: consultantSharingDecimal(input.totals.consultantShare),
        hospitalRetainedAmount: consultantSharingDecimal(
          new Decimal(input.totals.eligibleRevenue).minus(input.totals.consultantShare).toFixed(2),
        ),
        adjustmentAmount: consultantSharingDecimal(input.totals.adjustments),
        refundDeductionAmount: consultantSharingDecimal(input.totals.refundDeductions),
        creditNoteDeductionAmount: consultantSharingDecimal(input.totals.creditNoteDeductions),
        debitNoteAdditionAmount: consultantSharingDecimal(input.totals.debitNoteAdditions),
        claimEffectAmount: consultantSharingDecimal(new Decimal(input.totals.claimDeductions).negated().toFixed(2)),
        welfareZakatEffectAmount: consultantSharingDecimal(new Decimal(input.totals.welfareZakatDeductions).negated().toFixed(2)),
        taxWithholdingAmount: consultantSharingDecimal(input.totals.taxWithholding),
        otherDeductionAmount: consultantSharingDecimal(input.totals.otherDeductions),
        advanceRecoveryAmount: consultantSharingDecimal(input.totals.advanceRecovery),
        overpaymentRecoveryAmount: consultantSharingDecimal(input.totals.overpaymentRecovery),
        grossPayableAmount: consultantSharingDecimal(input.totals.grossPayable),
        totalDeductionAmount: consultantSharingDecimal(input.totals.totalDeductions),
        netPayableAmount: consultantSharingDecimal(input.totals.netPayable),
        paidAmount: consultantSharingDecimal(input.totals.paidAmount),
        outstandingAmount: consultantSharingDecimal(input.totals.outstandingAmount),
        itemCount: input.revenueEntryIds.length,
        revenueEntryCount: input.revenueEntryIds.length,
        calculationHash,
        inputHash: input.duplicateKey,
        lockedAt: occurredAt,
        lockedBy: consultantSharingObjectId(input.actor.userId, 'lockedBy'),
        approvalMatrixCode: 'CONSULTANT_SETTLEMENT',
        approvalRequestId: null,
        makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
        submittedBy: null,
        reviewedBy: null,
        approvedBy: null,
        cancelledBy: null,
        reversedBy: null,
        closedBy: null,
        calculatedAt: occurredAt,
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        partiallyPaidAt: null,
        paidAt: null,
        cancelledAt: null,
        reversedAt: null,
        closedAt: null,
        cancellationReason: null,
        reversalReason: null,
        disputeReason: null,
        internalNotesEncrypted: null,
        supportingAttachmentIds: [],
        ledgerTransactionId: null,
        reversalOfSettlementId: null,
        reversedBySettlementId: null,
      }], { session });
      return projectSettlement(created.toObject());
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async findById(
    input: Parameters<ConsultantSettlementRepositoryPort['findById']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const query = ConsultantSettlementModel.findOne({
      _id: consultantSharingObjectId(input.settlementId, 'settlementId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectSettlement(value);
  }

  public async findByDuplicateKey(
    input: Parameters<ConsultantSettlementRepositoryPort['findByDuplicateKey']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const query = ConsultantSettlementModel.findOne({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      inputHash: input.duplicateKey,
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectSettlement(value);
  }

  public async list(
    input: Parameters<ConsultantSettlementRepositoryPort['list']>[0],
  ): Promise<ConsultantSharingPage<ConsultantSettlementView>> {
    const page = input.query.page ?? 1;
    const pageSize = input.query.pageSize ?? 25;
    const filter: Record<string, unknown> = {
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      ...(input.query.status == null ? {} : { status: input.query.status }),
      ...(input.query.consultantId == null ? {} : { consultantId: consultantSharingObjectId(input.query.consultantId, 'consultantId') }),
    };
    const [values, total] = await Promise.all([
      ConsultantSettlementModel.find(filter)
        .sort({ [input.query.sortBy ?? 'createdAt']: consultantSharingSortDirection(input.query.sortDirection), _id: -1 })
        .skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
      ConsultantSettlementModel.countDocuments(filter).exec(),
    ]);
    return { items: values.map(projectSettlement), page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) };
  }

  public async changeStatus(
    input: Parameters<ConsultantSettlementRepositoryPort['changeStatus']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const metadata: Record<string, unknown> = {};
    if (input.toStatus === 'SUBMITTED') Object.assign(metadata, { submittedBy: consultantSharingObjectId(input.actor.userId, 'submittedBy'), submittedAt: input.occurredAt });
    if (input.toStatus === 'UNDER_REVIEW') Object.assign(metadata, { reviewedBy: consultantSharingObjectId(input.actor.userId, 'reviewedBy'), reviewedAt: input.occurredAt });
    if (input.toStatus === 'APPROVED') Object.assign(metadata, { approvedBy: consultantSharingObjectId(input.actor.userId, 'approvedBy'), approvedAt: input.occurredAt, approvalRequestId: nullableConsultantSharingObjectId(input.approvalRequestId, 'approvalRequestId') });
    if (input.toStatus === 'CANCELLED') Object.assign(metadata, { cancelledBy: consultantSharingObjectId(input.actor.userId, 'cancelledBy'), cancelledAt: input.occurredAt, cancellationReason: input.reason });
    if (input.toStatus === 'REVERSED') Object.assign(metadata, { reversedBy: consultantSharingObjectId(input.actor.userId, 'reversedBy'), reversedAt: input.occurredAt, reversalReason: input.reason });
    if (input.toStatus === 'CLOSED') Object.assign(metadata, { closedBy: consultantSharingObjectId(input.actor.userId, 'closedBy'), closedAt: input.occurredAt });
    const value = await ConsultantSettlementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementId, 'settlementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: input.fromStatus,
        version: input.expectedVersion,
      },
      { $set: { status: input.toStatus, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'), ...metadata }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectSettlement(value);
  }

  public async applyPayment(
    input: Parameters<ConsultantSettlementRepositoryPort['applyPayment']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const nextPaid = new Decimal(input.authoritativeTotals.paidAmount);
    const nextOutstanding = new Decimal(input.authoritativeTotals.outstandingAmount);
    if (nextPaid.greaterThan(input.authoritativeTotals.netPayable)) throw new ConsultantSettlementOverpaymentError();
    const nextStatus = nextOutstanding.isZero() ? 'PAID' : 'PARTIALLY_PAID';
    const value = await ConsultantSettlementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementId, 'settlementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: { $in: ['APPROVED', 'PARTIALLY_PAID'] },
      },
      {
        $set: {
          status: nextStatus,
          paidAmount: consultantSharingDecimal(nextPaid.toFixed(2)),
          outstandingAmount: consultantSharingDecimal(nextOutstanding.toFixed(2)),
          partiallyPaidAt: nextStatus === 'PARTIALLY_PAID' ? input.occurredAt : null,
          paidAt: nextStatus === 'PAID' ? input.occurredAt : null,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectSettlement(value);
  }


  public async reversePayment(
    input: Parameters<ConsultantSettlementRepositoryPort['reversePayment']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const nextPaid = new Decimal(input.authoritativeTotals.paidAmount);
    const nextOutstanding = new Decimal(input.authoritativeTotals.outstandingAmount);
    if (nextPaid.isNegative() || nextOutstanding.isNegative()) {
      throw new ConsultantSettlementReconciliationError('Payment reversal cannot create negative settlement balances');
    }
    const nextStatus = nextPaid.isZero() ? 'APPROVED' : 'PARTIALLY_PAID';
    const value = await ConsultantSettlementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementId, 'settlementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: { $in: ['PAID', 'PARTIALLY_PAID'] },
        paidAmount: { $gte: consultantSharingDecimal(input.amount) },
      },
      {
        $set: {
          status: nextStatus,
          paidAmount: consultantSharingDecimal(nextPaid.toFixed(2)),
          outstandingAmount: consultantSharingDecimal(nextOutstanding.toFixed(2)),
          partiallyPaidAt: nextStatus === 'PARTIALLY_PAID' ? input.occurredAt : null,
          paidAt: null,
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectSettlement(value);
  }

  public async attachLedgerTransaction(
    input: Parameters<ConsultantSettlementRepositoryPort['attachLedgerTransaction']>[0],
  ): Promise<ConsultantSettlementView | null> {
    const value = await ConsultantSettlementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementId, 'settlementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        ledgerTransactionId: null,
      },
      {
        $set: {
          ledgerTransactionId: consultantSharingObjectId(input.ledgerTransactionId, 'ledgerTransactionId'),
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectSettlement(value);
  }

  public async listUnsettled(
    input: Parameters<ConsultantSettlementSourceRepositoryPort['listUnsettled']>[0],
  ): Promise<readonly ConsultantRevenueEntryView[]> {
    const query = ConsultantRevenueEntryModel.find({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
      status: { $in: ['POSTED', 'ADJUSTED'] },
      settlementId: null,
      outstandingAmount: { $gt: consultantSharingDecimal('0.00') },
      occurredAt: { $gte: input.periodFrom, $lte: input.periodThrough },
    }).sort({ occurredAt: 1, _id: 1 }).lean();
    const values = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return values.map(projectRevenueEntry);
  }

  public async reserveForSettlement(
    input: Parameters<ConsultantSettlementSourceRepositoryPort['reserveForSettlement']>[0],
  ): Promise<number> {
    const ids = input.revenueEntryIds.map((value) => consultantSharingObjectId(value, 'revenueEntryId'));
    const result = await ConsultantRevenueEntryModel.updateMany(
      {
        _id: { $in: ids },
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        settlementId: null,
        status: { $in: ['POSTED', 'ADJUSTED'] },
      },
      [{
        $set: {
          settlementId: consultantSharingObjectId(input.settlementId, 'settlementId'),
          settledAmount: '$netPayableAmount',
          outstandingAmount: consultantSharingDecimal('0.00'),
          status: 'SETTLED',
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          version: { $add: ['$version', 1] },
        },
      }],
      { session: consultantSharingMongoSession(input.transaction) },
    ).exec();
    if (result.modifiedCount !== ids.length) throw new ConsultantSharingConcurrencyError();
    return result.modifiedCount;
  }

  public async releaseSettlementReservation(
    input: Parameters<ConsultantSettlementSourceRepositoryPort['releaseSettlementReservation']>[0],
  ): Promise<number> {
    const result = await ConsultantRevenueEntryModel.updateMany(
      {
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        settlementId: consultantSharingObjectId(input.settlementId, 'settlementId'),
        status: 'SETTLED',
      },
      [{
        $set: {
          settlementId: null,
          settledAmount: consultantSharingDecimal('0.00'),
          outstandingAmount: '$netPayableAmount',
          status: 'POSTED',
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          version: { $add: ['$version', 1] },
        },
      }],
      { session: consultantSharingMongoSession(input.transaction) },
    ).exec();
    return result.modifiedCount;
  }

  public async appendMany(
    input: Parameters<ConsultantSettlementItemRepositoryPort['appendMany']>[0],
  ): Promise<number> {
    if (input.items.length === 0) return 0;
    const documents = input.items.map((item, index) => ({
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      settlementId: consultantSharingObjectId(input.settlementId, 'settlementId'),
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
      itemSequence: index + 1,
      sourceKey: item.sourceKey.toLowerCase(),
      itemType: item.itemType,
      revenueEntryId: nullableConsultantSharingObjectId(item.revenueEntryId, 'revenueEntryId'),
      adjustmentId: nullableConsultantSharingObjectId(item.adjustmentId, 'adjustmentId'),
      reversalId: nullableConsultantSharingObjectId(item.reversalId, 'reversalId'),
      invoiceId: nullableConsultantSharingObjectId(item.invoiceId, 'invoiceId'),
      invoiceLineId: nullableConsultantSharingObjectId(item.invoiceLineId, 'invoiceLineId'),
      claimId: nullableConsultantSharingObjectId(item.claimId, 'claimId'),
      paymentAllocationId: nullableConsultantSharingObjectId(item.paymentAllocationId, 'paymentAllocationId'),
      eligibleRevenue: consultantSharingDecimal(item.eligibleRevenue),
      consultantShare: consultantSharingDecimal(item.consultantShare),
      hospitalShare: consultantSharingDecimal(item.hospitalShare),
      withholdingAmount: consultantSharingDecimal(item.withholdingAmount),
      deductionAmount: consultantSharingDecimal(item.deductionAmount),
      signedSettlementImpact: consultantSharingDecimal(item.signedSettlementImpact),
      description: item.description,
      sourceOccurredAt: item.sourceOccurredAt,
      immutableHash: stableConsultantSharingPayloadHash({ settlementId: input.settlementId, ...item }),
    }));
    await ConsultantSettlementItemModel.create(documents, { session: consultantSharingMongoSession(input.transaction) });
    return documents.length;
  }

}

export class MongoConsultantSettlementPaymentRepository
implements ConsultantSettlementPaymentRepositoryPort {
  public async create(
    input: Parameters<ConsultantSettlementPaymentRepositoryPort['create']>[0],
  ): Promise<ConsultantSettlementPaymentView> {
    if (new Decimal(input.amount).greaterThan(input.settlement.totals.outstandingAmount)) {
      throw new ConsultantSettlementOverpaymentError();
    }
    const [created] = await ConsultantSettlementPaymentModel.create([{
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      operationKey: input.operationKey,
      payoutNumber: input.payoutNumber,
      settlementId: consultantSharingObjectId(input.settlement.id, 'settlementId'),
      consultantId: consultantSharingObjectId(input.settlement.consultantId, 'consultantId'),
      status: 'APPROVAL_PENDING',
      paymentMethod: input.paymentMethod,
      currency: input.settlement.currency,
      amount: consultantSharingDecimal(input.amount),
      approvedSettlementBalanceSnapshot: consultantSharingDecimal(input.settlement.totals.outstandingAmount),
      taxWithholdingAmount: consultantSharingDecimal(input.taxWithholdingAmount),
      advanceRecoveryAmount: consultantSharingDecimal(input.advanceRecoveryAmount),
      overpaymentRecoveryAmount: consultantSharingDecimal(input.overpaymentRecoveryAmount),
      otherDeductionAmount: consultantSharingDecimal(input.otherDeductionAmount),
      netDisbursedAmount: consultantSharingDecimal(input.netDisbursedAmount),
      paymentId: null,
      cashShiftId: nullableConsultantSharingObjectId(input.cashShiftId, 'cashShiftId'),
      cashCounterId: nullableConsultantSharingObjectId(input.cashCounterId, 'cashCounterId'),
      ledgerTransactionId: null,
      paymentReferenceHash: input.paymentReferenceHash,
      paymentReferenceMasked: input.paymentReferenceMasked,
      payoutProfileReferenceHash: input.payoutProfileReferenceHash,
      payoutProfileReferenceMasked: input.payoutProfileReferenceMasked,
      makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
      checkerUserId: null,
      approvalRequestId: consultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
      requestedAt: input.requestedAt,
      approvedAt: null,
      processedAt: null,
      paidAt: null,
      failedAt: null,
      returnedAt: null,
      cancelledAt: null,
      reversedAt: null,
      failureCode: null,
      failureReasonSanitized: null,
      returnReason: null,
      cancellationReason: null,
      reversalReason: null,
      reversalOfPaymentId: null,
      reversedByPaymentId: null,
      immutableHash: stableConsultantSharingPayloadHash({ settlementId: input.settlement.id, payoutNumber: input.payoutNumber, amount: input.amount }),
    }], { session: consultantSharingMongoSession(input.transaction) });
    return projectPayment(created.toObject());
  }

  public async findById(
    input: Parameters<ConsultantSettlementPaymentRepositoryPort['findById']>[0],
  ): Promise<ConsultantSettlementPaymentView | null> {
    const query = ConsultantSettlementPaymentModel.findOne({
      _id: consultantSharingObjectId(input.settlementPaymentId, 'settlementPaymentId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const value = await withConsultantSharingSession(query, consultantSharingMongoSession(input.transaction)).exec();
    return value == null ? null : projectPayment(value);
  }

  public async approve(
    input: Parameters<ConsultantSettlementPaymentRepositoryPort['approve']>[0],
  ): Promise<ConsultantSettlementPaymentView | null> {
    const value = await ConsultantSettlementPaymentModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementPaymentId, 'settlementPaymentId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: 'APPROVAL_PENDING',
        makerUserId: { $ne: consultantSharingObjectId(input.checkerUserId, 'checkerUserId') },
      },
      { $set: { status: 'APPROVED', checkerUserId: consultantSharingObjectId(input.checkerUserId, 'checkerUserId'), approvedAt: input.approvedAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectPayment(value);
  }

  public async markPaid(
    input: Parameters<ConsultantSettlementPaymentRepositoryPort['markPaid']>[0],
  ): Promise<ConsultantSettlementPaymentView | null> {
    const value = await ConsultantSettlementPaymentModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.settlementPaymentId, 'settlementPaymentId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: { $in: ['APPROVED', 'PROCESSING'] },
      },
      { $set: { status: 'PAID', paymentId: consultantSharingObjectId(input.paymentId, 'paymentId'), ledgerTransactionId: consultantSharingObjectId(input.ledgerTransactionId, 'ledgerTransactionId'), paidAt: input.paidAt, processedAt: input.paidAt, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { new: true, runValidators: true, session: consultantSharingMongoSession(input.transaction), lean: true },
    ).exec();
    return value == null ? null : projectPayment(value);
  }


  public async createReversal(
    input: Parameters<ConsultantSettlementPaymentRepositoryPort['createReversal']>[0],
  ): Promise<ConsultantSettlementPaymentView> {
    const session = consultantSharingMongoSession(input.transaction);
    const original = await ConsultantSettlementPaymentModel.findOne({
      _id: consultantSharingObjectId(input.originalPayment.id, 'originalSettlementPaymentId'),
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      status: 'PAID',
      reversedByPaymentId: null,
    }).session(session).lean().exec();
    if (original == null || original.paymentId == null) {
      throw new ConsultantSettlementReconciliationError('Only an unreversed paid consultant payout can be reversed');
    }
    const [created] = await ConsultantSettlementPaymentModel.create([{
      facilityId: original.facilityId,
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      schemaVersion: 1,
      version: 0,
      createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      operationKey: input.operationKey,
      payoutNumber: input.reversalPayoutNumber,
      settlementId: original.settlementId,
      consultantId: original.consultantId,
      status: 'REVERSED',
      paymentMethod: original.paymentMethod,
      currency: original.currency,
      amount: original.amount,
      approvedSettlementBalanceSnapshot: original.amount,
      taxWithholdingAmount: consultantSharingDecimal('0.00'),
      advanceRecoveryAmount: consultantSharingDecimal('0.00'),
      overpaymentRecoveryAmount: consultantSharingDecimal('0.00'),
      otherDeductionAmount: consultantSharingDecimal('0.00'),
      netDisbursedAmount: original.netDisbursedAmount,
      paymentId: consultantSharingObjectId(input.paymentReversalId, 'paymentReversalId'),
      cashShiftId: original.cashShiftId,
      cashCounterId: original.cashCounterId,
      ledgerTransactionId: consultantSharingObjectId(input.ledgerTransactionId, 'ledgerTransactionId'),
      paymentReferenceHash: stableConsultantSharingPayloadHash({ operationKey: input.operationKey, paymentReversalId: input.paymentReversalId }),
      paymentReferenceMasked: 'REVERSAL',
      payoutProfileReferenceHash: null,
      payoutProfileReferenceMasked: null,
      makerUserId: consultantSharingObjectId(input.makerUserId, 'makerUserId'),
      checkerUserId: consultantSharingObjectId(input.actor.userId, 'checkerUserId'),
      approvalRequestId: consultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
      requestedAt: input.occurredAt,
      approvedAt: input.occurredAt,
      processedAt: input.occurredAt,
      paidAt: null,
      failedAt: null,
      returnedAt: null,
      cancelledAt: null,
      reversedAt: input.occurredAt,
      failureCode: null,
      failureReasonSanitized: null,
      returnReason: null,
      cancellationReason: null,
      reversalReason: input.reason,
      reversalOfPaymentId: original._id,
      reversedByPaymentId: null,
      immutableHash: stableConsultantSharingPayloadHash({ originalSettlementPaymentId: input.originalPayment.id, paymentReversalId: input.paymentReversalId, amount: consultantSharingDecimalString(original.amount) }),
    }], { session });
    const update = await ConsultantSettlementPaymentModel.updateOne(
      { _id: original._id, facilityId: original.facilityId, status: 'PAID', reversedByPaymentId: null },
      { $set: { reversedByPaymentId: created._id, updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy') }, $inc: { version: 1 } },
      { session, runValidators: true },
    ).exec();
    if (update.modifiedCount !== 1) throw new ConsultantSharingConcurrencyError();
    return projectPayment(created.toObject());
  }

}