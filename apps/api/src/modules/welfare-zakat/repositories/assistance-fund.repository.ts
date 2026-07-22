import type { FilterQuery } from 'mongoose';

import {
  AssistanceFundModel,
  FundTransactionModel,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import type { FundEligibilityPolicyInput, WelfareZakatListQuery } from '../welfare-zakat.contracts.js';
import type {
  AssistanceFundRepositoryPort,
  FundTransactionRepositoryPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceFundRecord,
  FundTransactionRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import {
  normalizeAssistanceCode,
  normalizeAssistancePagination,
  normalizeOptionalAssistanceText,
} from '../welfare-zakat.normalization.js';
import {
  escapeWelfareZakatRegex,
  nullableWelfareZakatObjectId,
  throwMappedWelfareZakatPersistenceError,
  welfareZakatObjectId,
  welfareZakatRecord,
  welfareZakatSortDirection,
  withWelfareZakatSession,
} from './welfare-zakat-repository.support.js';

const fundFinancialFields = new Set([
  'openingBalance',
  'inflowAmount',
  'transferInAmount',
  'transferOutAmount',
  'adjustmentIncreaseAmount',
  'adjustmentDecreaseAmount',
  'ledgerBalance',
  'reservedBalance',
  'committedBalance',
  'availableBalance',
  'utilizedBalance',
  'reversedBalance',
  'refundAmount',
  'repaymentAmount',
  'recoveryAmount',
  'writeOffAmount',
]);

function eligibilityPolicy(input: FundEligibilityPolicyInput) {
  return {
    defaultEligibilityOutcome: input.defaultOutcome,
    eligibilityRules: input.rules.map((rule) => ({
      ruleCode: normalizeAssistanceCode(rule.ruleCode),
      description: rule.description,
      field: rule.field,
      operator: rule.operator,
      effect: rule.effect,
      value: rule.value ?? null,
      values: rule.values ?? [],
      minimum: rule.minimum ?? null,
      maximum: rule.maximum ?? null,
      priority: rule.priority,
      active: rule.active,
      failureCode:
        rule.failureCode == null
          ? null
          : normalizeAssistanceCode(rule.failureCode),
      failureMessage: rule.failureMessage ?? null,
    })),
    allowedDepartmentIds: (input.allowedDepartmentIds ?? []).map((id) =>
      toObjectId(id, 'allowedDepartmentId'),
    ),
    excludedDepartmentIds: (input.excludedDepartmentIds ?? []).map((id) =>
      toObjectId(id, 'excludedDepartmentId'),
    ),
    allowedServiceCategories: input.allowedServiceCategories ?? [],
    excludedServiceCategories: input.excludedServiceCategories ?? [],
    allowedServiceCodes: (input.allowedServiceCodes ?? []).map(normalizeAssistanceCode),
    excludedServiceCodes: (input.excludedServiceCodes ?? []).map(normalizeAssistanceCode),
    allowedPatientCategoryCodes: (input.allowedPatientCategoryCodes ?? []).map(
      normalizeAssistanceCode,
    ),
    excludedPatientCategoryCodes: (input.excludedPatientCategoryCodes ?? []).map(
      normalizeAssistanceCode,
    ),
    allowedDiagnosisCodes: (input.allowedDiagnosisCodes ?? []).map(normalizeAssistanceCode),
    excludedDiagnosisCodes: (input.excludedDiagnosisCodes ?? []).map(normalizeAssistanceCode),
    limits: (input.limits ?? []).map((limit) => ({
      scope: limit.scope,
      amount: decimalStringToDecimal128(limit.amount),
      periodType: limit.periodType,
      rollingDays: limit.rollingDays ?? null,
      serviceCategory: limit.serviceCategory ?? null,
      serviceCode:
        limit.serviceCode == null
          ? null
          : normalizeAssistanceCode(limit.serviceCode),
      appliesPerPatient: limit.appliesPerPatient,
    })),
    requiresZakatDeclaration: input.requiresZakatDeclaration ?? false,
    requiresSocialWelfareReview: input.requiresSocialWelfareReview ?? false,
    requiresClinicalReview: input.requiresClinicalReview ?? false,
  };
}

function fundFilter(
  facilityId: string,
  query: WelfareZakatListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };

  if (query.fundId != null) {
    filter._id = toObjectId(query.fundId, 'fundId');
  }
  if (query.fundType != null && query.fundType.length > 0) {
    filter.fundType = { $in: query.fundType };
  }
  if (query.fundStatus != null && query.fundStatus.length > 0) {
    filter.status = { $in: query.fundStatus };
  } else if (query.includeClosed !== true) {
    filter.status = { $nin: ['CLOSED', 'CANCELLED'] };
  }
  if (query.search != null && query.search.trim().length > 0) {
    const expression = new RegExp(escapeWelfareZakatRegex(query.search.trim()), 'iu');
    filter.$or = [{ fundCode: expression }, { name: expression }, { categoryCode: expression }];
  }
  if (query.from != null || query.to != null) {
    filter.createdAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }

  return filter;
}

export class MongoAssistanceFundRepository implements AssistanceFundRepositoryPort {
  public async create(
    actor: Parameters<AssistanceFundRepositoryPort['create']>[0],
    input: Parameters<AssistanceFundRepositoryPort['create']>[1],
    authoritative: Parameters<AssistanceFundRepositoryPort['create']>[2],
    transaction: Parameters<AssistanceFundRepositoryPort['create']>[3],
  ): Promise<AssistanceFundRecord> {
    try {
      const openingBalance = decimalStringToDecimal128(input.openingBalance);
      const [created] = await AssistanceFundModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          operationKey: authoritative.operationKey,
          fundCode: normalizeAssistanceCode(input.fundCode),
          name: input.name.trim(),
          description: normalizeOptionalAssistanceText(input.description),
          fundType: input.fundType,
          categoryCode: normalizeAssistanceCode(input.categoryCode),
          restriction: input.restriction.restriction,
          fundingSourceReferenceHash: authoritative.fundingSourceReferenceHash,
          fundingSourceReferenceMasked: authoritative.fundingSourceReferenceMasked,
          donorReferenceHash: authoritative.donorReferenceHash,
          donorReferenceMasked: authoritative.donorReferenceMasked,
          donationReferenceHash: authoritative.donationReferenceHash,
          grantReferenceHash: authoritative.grantReferenceHash,
          restrictionNarrativeEncrypted: authoritative.restrictionNarrativeEncrypted,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveThrough:
            input.effectiveThrough == null ? null : new Date(input.effectiveThrough),
          status: 'DRAFT',
          currency: input.currency ?? 'PKR',
          openingBalance,
          inflowAmount: decimalStringToDecimal128('0'),
          transferInAmount: decimalStringToDecimal128('0'),
          transferOutAmount: decimalStringToDecimal128('0'),
          adjustmentIncreaseAmount: decimalStringToDecimal128('0'),
          adjustmentDecreaseAmount: decimalStringToDecimal128('0'),
          ledgerBalance: openingBalance,
          reservedBalance: decimalStringToDecimal128('0'),
          committedBalance: decimalStringToDecimal128('0'),
          availableBalance: openingBalance,
          utilizedBalance: decimalStringToDecimal128('0'),
          reversedBalance: decimalStringToDecimal128('0'),
          refundAmount: decimalStringToDecimal128('0'),
          repaymentAmount: decimalStringToDecimal128('0'),
          recoveryAmount: decimalStringToDecimal128('0'),
          writeOffAmount: decimalStringToDecimal128('0'),
          ...eligibilityPolicy(input.eligibilityPolicy),
          approvalMatrixCode: normalizeAssistanceCode(input.approvalMatrixCode),
          facilitySpecific: input.facilitySpecific,
          activationApprovalRequestId: null,
          activatedAt: null,
          activatedBy: null,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null,
          closedAt: null,
          closedBy: null,
          closureReason: null,
        }],
        { session: transaction.session },
      );
      return welfareZakatRecord<AssistanceFundRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    fundId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceFundRecord | null> {
    return welfareZakatRecord<AssistanceFundRecord | null>(
      await withWelfareZakatSession(
        AssistanceFundModel.findOne({
          _id: welfareZakatObjectId(fundId, 'fundId'),
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findByCode(
    facilityId: string,
    fundCode: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceFundRecord | null> {
    return welfareZakatRecord<AssistanceFundRecord | null>(
      await withWelfareZakatSession(
        AssistanceFundModel.findOne({
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
          fundCode: normalizeAssistanceCode(fundCode),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly AssistanceFundRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter = fundFilter(facilityId, query);
    const sortField = query.sortBy === 'availableBalance' ? 'availableBalance' : 'updatedAt';
    const sort = { [sortField]: welfareZakatSortDirection(query.sortDirection), _id: -1 as const };
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        AssistanceFundModel.find(filter)
          .sort(sort)
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(AssistanceFundModel.countDocuments(filter), session).exec(),
    ]);
    return {
      records: welfareZakatRecord<readonly AssistanceFundRecord[]>(records),
      total: Number(total),
    };
  }

  public async update(
    actor: Parameters<AssistanceFundRepositoryPort['update']>[0],
    fundId: string,
    expectedVersion: number,
    input: Parameters<AssistanceFundRepositoryPort['update']>[3],
    encrypted: Parameters<AssistanceFundRepositoryPort['update']>[4],
    transaction: Parameters<AssistanceFundRepositoryPort['update']>[5],
  ): Promise<AssistanceFundRecord | null> {
    const set: Record<string, unknown> = {
      updatedBy: toObjectId(actor.userId, 'updatedBy'),
      transactionId: transaction.transactionId,
      correlationId: actor.correlationId,
    };
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.description !== undefined) set.description = normalizeOptionalAssistanceText(input.description);
    if (input.categoryCode !== undefined) set.categoryCode = normalizeAssistanceCode(input.categoryCode);
    if (input.effectiveFrom !== undefined) set.effectiveFrom = new Date(input.effectiveFrom);
    if (input.effectiveThrough !== undefined) set.effectiveThrough = input.effectiveThrough == null ? null : new Date(input.effectiveThrough);
    if (input.approvalMatrixCode !== undefined) set.approvalMatrixCode = normalizeAssistanceCode(input.approvalMatrixCode);
    if (input.eligibilityPolicy !== undefined) Object.assign(set, eligibilityPolicy(input.eligibilityPolicy));
    if (input.restriction !== undefined) {
      set.restriction = input.restriction.restriction;
      Object.assign(set, encrypted);
    }

    return welfareZakatRecord<AssistanceFundRecord | null>(
      await AssistanceFundModel.findOneAndUpdate(
        {
          _id: toObjectId(fundId, 'fundId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          version: expectedVersion,
          status: { $in: ['DRAFT', 'SUSPENDED'] },
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: transaction.session },
      ).lean().exec(),
    );
  }

  public async changeStatus(
    input: Parameters<AssistanceFundRepositoryPort['changeStatus']>[0],
  ): Promise<AssistanceFundRecord | null> {
    const set: Record<string, unknown> = {
      status: input.toStatus,
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
    };
    if (input.toStatus === 'ACTIVE') {
      set.activationApprovalRequestId = nullableWelfareZakatObjectId(input.approvalRequestId, 'approvalRequestId');
      set.activatedAt = input.occurredAt;
      set.activatedBy = toObjectId(input.actor.userId, 'activatedBy');
      set.suspendedAt = null;
      set.suspendedBy = null;
      set.suspensionReason = null;
    }
    if (input.toStatus === 'SUSPENDED') {
      set.suspendedAt = input.occurredAt;
      set.suspendedBy = toObjectId(input.actor.userId, 'suspendedBy');
      set.suspensionReason = input.reason;
    }
    if (input.toStatus === 'CLOSED') {
      set.closedAt = input.occurredAt;
      set.closedBy = toObjectId(input.actor.userId, 'closedBy');
      set.closureReason = input.reason;
    }

    return welfareZakatRecord<AssistanceFundRecord | null>(
      await AssistanceFundModel.findOneAndUpdate(
        {
          _id: toObjectId(input.fundId, 'fundId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: input.fromStatus,
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }

  public async applyFinancialPosition(
    input: Parameters<AssistanceFundRepositoryPort['applyFinancialPosition']>[0],
  ): Promise<AssistanceFundRecord | null> {
    const set = Object.fromEntries(
      Object.entries(input.balances)
        .filter(([key]) => fundFinancialFields.has(key))
        .map(([key, value]) => [key, decimalStringToDecimal128(value)]),
    );
    Object.assign(set, {
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
    });
    return welfareZakatRecord<AssistanceFundRecord | null>(
      await AssistanceFundModel.findOneAndUpdate(
        {
          _id: toObjectId(input.fundId, 'fundId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }
}

export class MongoFundTransactionRepository implements FundTransactionRepositoryPort {
  public async append(
    input: Parameters<FundTransactionRepositoryPort['append']>[0],
  ): Promise<FundTransactionRecord> {
    const [created] = await FundTransactionModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        operationKey: input.operationKey,
        transactionNumber: normalizeAssistanceCode(input.transactionNumber),
        fundId: input.fund._id,
        transactionType: input.transactionType,
        direction: input.direction,
        amount: decimalStringToDecimal128(input.amount),
        currency: input.fund.currency,
        balanceBefore: decimalStringToDecimal128(input.balanceBefore),
        balanceAfter: decimalStringToDecimal128(input.balanceAfter),
        applicationId: nullableWelfareZakatObjectId(input.applicationId, 'applicationId'),
        approvalId: nullableWelfareZakatObjectId(input.approvalId, 'approvalId'),
        reservationId: nullableWelfareZakatObjectId(input.reservationId, 'reservationId'),
        allocationId: nullableWelfareZakatObjectId(input.allocationId, 'allocationId'),
        transferId: nullableWelfareZakatObjectId(input.transferId, 'transferId'),
        invoiceId: nullableWelfareZakatObjectId(input.invoiceId, 'invoiceId'),
        invoiceLineId: nullableWelfareZakatObjectId(input.invoiceLineId, 'invoiceLineId'),
        paymentId: nullableWelfareZakatObjectId(input.paymentId, 'paymentId'),
        refundId: nullableWelfareZakatObjectId(input.refundId, 'refundId'),
        creditNoteId: nullableWelfareZakatObjectId(input.creditNoteId, 'creditNoteId'),
        debitNoteId: nullableWelfareZakatObjectId(input.debitNoteId, 'debitNoteId'),
        claimId: nullableWelfareZakatObjectId(input.claimId, 'claimId'),
        claimAdjustmentId: nullableWelfareZakatObjectId(input.claimAdjustmentId, 'claimAdjustmentId'),
        donorReferenceHash: input.donorReferenceHash ?? null,
        donorReferenceMasked: input.donorReferenceMasked ?? null,
        donationReferenceHash: input.donationReferenceHash ?? null,
        receiptReferenceHash: input.receiptReferenceHash ?? null,
        receiptReferenceMasked: input.receiptReferenceMasked ?? null,
        fundingSourceReferenceHash: input.fundingSourceReferenceHash ?? null,
        reason: input.reason,
        attachmentIds: (input.attachmentIds ?? []).map((id) => toObjectId(id, 'attachmentId')),
        actorUserId: toObjectId(input.actor.userId, 'actorUserId'),
        makerUserId: nullableWelfareZakatObjectId(input.makerUserId, 'makerUserId'),
        checkerUserId: nullableWelfareZakatObjectId(input.checkerUserId, 'checkerUserId'),
        approvalRequestId: nullableWelfareZakatObjectId(input.approvalRequestId, 'approvalRequestId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        occurredAt: input.occurredAt,
        immutableHash: input.immutableHash,
        reversalOfTransactionId: nullableWelfareZakatObjectId(input.reversalOfTransactionId, 'reversalOfTransactionId'),
        reversedByTransactionId: null,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<FundTransactionRecord>(created!.toObject());
  }

  public async findById(
    facilityId: string,
    transactionId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransactionRecord | null> {
    return welfareZakatRecord<FundTransactionRecord | null>(
      await withWelfareZakatSession(
        FundTransactionModel.findOne({
          _id: toObjectId(transactionId, 'transactionId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listByFund(
    facilityId: string,
    fundId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly FundTransactionRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      fundId: toObjectId(fundId, 'fundId'),
    };
    if (query.from != null || query.to != null) {
      filter.occurredAt = {
        ...(query.from == null ? {} : { $gte: new Date(query.from) }),
        ...(query.to == null ? {} : { $lte: new Date(query.to) }),
      };
    }
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        FundTransactionModel.find(filter)
          .sort({ occurredAt: welfareZakatSortDirection(query.sortDirection), _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(FundTransactionModel.countDocuments(filter), session).exec(),
    ]);
    return { records: welfareZakatRecord<readonly FundTransactionRecord[]>(records), total: Number(total) };
  }

  public async findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<FundTransactionRecord | null> {
    return welfareZakatRecord<FundTransactionRecord | null>(
      await withWelfareZakatSession(
        FundTransactionModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          operationKey,
        }).lean(),
        session,
      ).exec(),
    );
  }
}