import type { FilterQuery } from 'mongoose';

import {
  AssistanceApplicationHistoryModel,
  AssistanceApplicationModel,
  AssistanceReviewModel,
  EligibilityEvaluationSnapshotModel,
  decimalStringToDecimal128,
  toObjectId,
} from '@hospital-mis/database';

import type { WelfareZakatListQuery } from '../welfare-zakat.contracts.js';
import type {
  AssistanceApplicationHistoryRepositoryPort,
  AssistanceApplicationRepositoryPort,
  AssistanceReviewRepositoryPort,
} from '../welfare-zakat.ports.js';
import type {
  AssistanceApplicationHistoryRecord,
  AssistanceApplicationRecord,
  AssistanceReviewRecord,
  EligibilityEvaluationSnapshotRecord,
  WelfareZakatMongoSession,
} from '../welfare-zakat.persistence.types.js';
import {
  normalizeAssistanceCode,
  normalizeAssistancePagination,
  stableAssistancePayloadHash,
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

const applicationFinancialFields = new Set([
  'monthlyHouseholdIncome',
  'monthlyHouseholdExpenses',
  'monthlyDisposableIncome',
  'perCapitaIncome',
  'requestedAmount',
  'recommendedAmount',
  'approvedAmount',
  'reservedAmount',
  'committedAmount',
  'utilizedAmount',
  'reversedAmount',
  'releasedAmount',
  'remainingApprovedAmount',
]);

function applicationFilter(
  facilityId: string,
  query: WelfareZakatListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: toObjectId(facilityId, 'facilityId'),
  };
  if (query.applicationId != null) filter._id = toObjectId(query.applicationId, 'applicationId');
  if (query.patientId != null) filter.patientId = toObjectId(query.patientId, 'patientId');
  if (query.invoiceId != null) filter.invoiceId = toObjectId(query.invoiceId, 'invoiceId');
  if (query.claimId != null) filter.claimId = toObjectId(query.claimId, 'claimId');
  if (query.assignedToUserId != null) filter.assignedToUserId = toObjectId(query.assignedToUserId, 'assignedToUserId');
  if (query.applicationStatus != null && query.applicationStatus.length > 0) {
    filter.status = { $in: query.applicationStatus };
  } else if (query.includeClosed !== true) {
    filter.status = { $nin: ['CLOSED', 'CANCELLED'] };
  }
  if (query.followUpDueBefore != null) filter.followUpAt = { $lte: new Date(query.followUpDueBefore) };
  if (query.expiringBefore != null) filter.expiresAt = { $lte: new Date(query.expiringBefore) };
  if (query.search != null && query.search.trim().length > 0) {
    const expression = new RegExp(escapeWelfareZakatRegex(query.search.trim()), 'iu');
    filter.$or = [{ applicationNumber: expression }, { financialYearCode: expression }];
  }
  if (query.from != null || query.to != null) {
    filter.createdAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }
  return filter;
}

function transitionMetadata(
  status: string,
  actorUserId: string,
  reason: string,
  occurredAt: Date,
): Readonly<Record<string, unknown>> {
  if (status === 'SUBMITTED') {
    return { submittedAt: occurredAt, submittedBy: toObjectId(actorUserId, 'submittedBy') };
  }
  if (status === 'CANCELLED') {
    return { cancelledAt: occurredAt, cancelledBy: toObjectId(actorUserId, 'cancelledBy'), cancellationReason: reason };
  }
  if (status === 'CLOSED') {
    return { closedAt: occurredAt, closedBy: toObjectId(actorUserId, 'closedBy'), closureReason: reason };
  }
  if (status === 'REOPENED') {
    return { reopenedAt: occurredAt, reopenedBy: toObjectId(actorUserId, 'reopenedBy'), reopenReason: reason };
  }
  return {};
}

export class MongoAssistanceApplicationRepository
implements AssistanceApplicationRepositoryPort {
  public async create(
    actor: Parameters<AssistanceApplicationRepositoryPort['create']>[0],
    input: Parameters<AssistanceApplicationRepositoryPort['create']>[1],
    authoritative: Parameters<AssistanceApplicationRepositoryPort['create']>[2],
    transaction: Parameters<AssistanceApplicationRepositoryPort['create']>[3],
  ): Promise<AssistanceApplicationRecord> {
    try {
      const [created] = await AssistanceApplicationModel.create(
        [{
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          transactionId: transaction.transactionId,
          correlationId: actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: toObjectId(actor.userId, 'createdBy'),
          updatedBy: toObjectId(actor.userId, 'updatedBy'),
          operationKey: authoritative.operationKey,
          duplicateKey: authoritative.duplicateKey,
          applicationNumber: normalizeAssistanceCode(authoritative.applicationNumber),
          applicationType: input.applicationType,
          patientId: toObjectId(input.patientId, 'patientId'),
          guardianId: nullableWelfareZakatObjectId(input.guardianId, 'guardianId'),
          encounterId: nullableWelfareZakatObjectId(input.encounterId, 'encounterId'),
          admissionId: nullableWelfareZakatObjectId(input.admissionId, 'admissionId'),
          invoiceId: nullableWelfareZakatObjectId(input.invoiceId, 'invoiceId'),
          claimId: nullableWelfareZakatObjectId(input.claimId, 'claimId'),
          preferredFundId: nullableWelfareZakatObjectId(input.preferredFundId, 'preferredFundId'),
          status: 'DRAFT',
          applicantSnapshotEncrypted: authoritative.applicantSnapshotEncrypted,
          householdSnapshotEncrypted: authoritative.householdSnapshotEncrypted,
          employmentSnapshotEncrypted: authoritative.employmentSnapshotEncrypted,
          financialConditionSnapshotEncrypted: authoritative.financialConditionSnapshotEncrypted,
          zakatDeclarationSnapshotEncrypted: authoritative.zakatDeclarationSnapshotEncrypted,
          questionnaireSnapshotEncrypted: authoritative.questionnaireSnapshotEncrypted,
          requestedServicesSnapshotEncrypted: authoritative.requestedServicesSnapshotEncrypted,
          notesEncrypted: authoritative.notesEncrypted,
          attachments: (input.attachments ?? []).map((attachment) => ({
            attachmentId: toObjectId(attachment.attachmentId, 'attachmentId'),
            purpose: attachment.purpose,
            description: attachment.description ?? null,
            immutableSnapshotHash: stableAssistancePayloadHash(attachment),
          })),
          householdSize: authoritative.householdSize,
          dependantCount: authoritative.dependantCount,
          monthlyHouseholdIncome: decimalStringToDecimal128(authoritative.monthlyHouseholdIncome),
          monthlyHouseholdExpenses: decimalStringToDecimal128(authoritative.monthlyHouseholdExpenses),
          monthlyDisposableIncome: decimalStringToDecimal128(authoritative.monthlyDisposableIncome),
          perCapitaIncome: decimalStringToDecimal128(authoritative.perCapitaIncome),
          requestedAmount: input.requestedAmount == null ? null : decimalStringToDecimal128(input.requestedAmount),
          recommendedAmount: null,
          approvedAmount: decimalStringToDecimal128('0'),
          reservedAmount: decimalStringToDecimal128('0'),
          committedAmount: decimalStringToDecimal128('0'),
          utilizedAmount: decimalStringToDecimal128('0'),
          reversedAmount: decimalStringToDecimal128('0'),
          releasedAmount: decimalStringToDecimal128('0'),
          remainingApprovedAmount: decimalStringToDecimal128('0'),
          completenessSatisfied: false,
          missingItems: [],
          eligibilityOutcome: null,
          eligibilitySnapshotId: null,
          financialYearCode: normalizeAssistanceCode(input.financialYearCode),
          assignedToUserId: null,
          assignedBy: null,
          followUpAt: null,
          reviewDeadlineAt: null,
          approvalDeadlineAt: null,
          submittedAt: null,
          submittedBy: null,
          expiresAt: null,
          closedAt: null,
          closedBy: null,
          closureReason: null,
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
        }],
        { session: transaction.session },
      );
      return welfareZakatRecord<AssistanceApplicationRecord>(created!.toObject());
    } catch (error) {
      throwMappedWelfareZakatPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    applicationId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApplicationRecord | null> {
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await withWelfareZakatSession(
        AssistanceApplicationModel.findOne({
          _id: welfareZakatObjectId(applicationId, 'applicationId'),
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
        })
          .select('+applicantSnapshotEncrypted +householdSnapshotEncrypted +employmentSnapshotEncrypted +financialConditionSnapshotEncrypted +zakatDeclarationSnapshotEncrypted +questionnaireSnapshotEncrypted +requestedServicesSnapshotEncrypted +notesEncrypted')
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findDuplicate(
    facilityId: string,
    duplicateKey: string,
    session?: WelfareZakatMongoSession,
  ): Promise<AssistanceApplicationRecord | null> {
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await withWelfareZakatSession(
        AssistanceApplicationModel.findOne({
          facilityId: welfareZakatObjectId(facilityId, 'facilityId'),
          duplicateKey,
          status: { $in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'ELIGIBLE', 'APPROVAL_PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REOPENED'] },
        }).sort({ createdAt: -1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: WelfareZakatListQuery,
    session?: WelfareZakatMongoSession,
  ): Promise<Readonly<{ records: readonly AssistanceApplicationRecord[]; total: number }>> {
    const pagination = normalizeAssistancePagination(query);
    const filter = applicationFilter(facilityId, query);
    const sortField = query.sortBy === 'submittedAt' || query.sortBy === 'followUpAt'
      ? query.sortBy
      : 'updatedAt';
    const sort = { [sortField]: welfareZakatSortDirection(query.sortDirection), _id: -1 as const };
    const [records, total] = await Promise.all([
      withWelfareZakatSession(
        AssistanceApplicationModel.find(filter)
          .sort(sort)
          .skip(pagination.skip)
          .limit(pagination.pageSize)
          .lean(),
        session,
      ).exec(),
      withWelfareZakatSession(AssistanceApplicationModel.countDocuments(filter), session).exec(),
    ]);
    return { records: welfareZakatRecord<readonly AssistanceApplicationRecord[]>(records), total: Number(total) };
  }

  public async updateDraft(
    actor: Parameters<AssistanceApplicationRepositoryPort['updateDraft']>[0],
    applicationId: string,
    expectedVersion: number,
    input: Parameters<AssistanceApplicationRepositoryPort['updateDraft']>[3],
    encrypted: Parameters<AssistanceApplicationRepositoryPort['updateDraft']>[4],
    transaction: Parameters<AssistanceApplicationRepositoryPort['updateDraft']>[5],
  ): Promise<AssistanceApplicationRecord | null> {
    const set: Record<string, unknown> = {
      updatedBy: toObjectId(actor.userId, 'updatedBy'),
      transactionId: transaction.transactionId,
      correlationId: actor.correlationId,
      ...encrypted,
    };
    for (const field of applicationFinancialFields) {
      const value = set[field];
      if (typeof value === 'string') set[field] = decimalStringToDecimal128(value);
    }
    if (input.preferredFundId !== undefined) set.preferredFundId = nullableWelfareZakatObjectId(input.preferredFundId, 'preferredFundId');
    if (input.requestedAmount !== undefined) set.requestedAmount = input.requestedAmount == null ? null : decimalStringToDecimal128(input.requestedAmount);
    if (input.attachments !== undefined) {
      set.attachments = input.attachments.map((attachment) => ({
        attachmentId: toObjectId(attachment.attachmentId, 'attachmentId'),
        purpose: attachment.purpose,
        description: attachment.description ?? null,
        immutableSnapshotHash: stableAssistancePayloadHash(attachment),
      }));
    }
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await AssistanceApplicationModel.findOneAndUpdate(
        {
          _id: toObjectId(applicationId, 'applicationId'),
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          version: expectedVersion,
          status: { $in: ['DRAFT', 'INFORMATION_REQUESTED', 'REOPENED'] },
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: transaction.session },
      ).lean().exec(),
    );
  }

  public async transition(
    input: Parameters<AssistanceApplicationRepositoryPort['transition']>[0],
  ): Promise<AssistanceApplicationRecord | null> {
    const set: Record<string, unknown> = {
      status: input.toStatus,
      updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
      transactionId: input.transaction.transactionId,
      correlationId: input.actor.correlationId,
      ...transitionMetadata(input.toStatus, input.actor.userId, input.reason, input.occurredAt),
      ...(input.updates ?? {}),
    };
    for (const field of applicationFinancialFields) {
      const value = set[field];
      if (typeof value === 'string') set[field] = decimalStringToDecimal128(value);
    }
    const objectIdFields = new Set(['eligibilitySnapshotId', 'assignedToUserId', 'assignedBy']);
    for (const field of objectIdFields) {
      const value = set[field];
      if (typeof value === 'string' || value === null) {
        set[field] = nullableWelfareZakatObjectId(value, field);
      }
    }
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await AssistanceApplicationModel.findOneAndUpdate(
        {
          _id: toObjectId(input.applicationId, 'applicationId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: input.fromStatus,
        },
        { $set: set, $inc: { version: 1 } },
        { new: true, runValidators: true, session: input.transaction.session },
      ).lean().exec(),
    );
  }

  public async updateFinancialSummary(
    input: Parameters<AssistanceApplicationRepositoryPort['updateFinancialSummary']>[0],
  ): Promise<AssistanceApplicationRecord | null> {
    const amounts = Object.fromEntries(
      Object.entries(input.amounts)
        .filter(([key]) => applicationFinancialFields.has(key))
        .map(([key, value]) => [key, decimalStringToDecimal128(value)]),
    );
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await AssistanceApplicationModel.findOneAndUpdate(
        {
          _id: toObjectId(input.applicationId, 'applicationId'),
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


  public async recordEligibility(
    input: Parameters<AssistanceApplicationRepositoryPort['recordEligibility']>[0],
  ): Promise<AssistanceApplicationRecord | null> {
    return welfareZakatRecord<AssistanceApplicationRecord | null>(
      await AssistanceApplicationModel.findOneAndUpdate(
        {
          _id: toObjectId(input.applicationId, 'applicationId'),
          facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
          version: input.expectedVersion,
          status: { $nin: ['CLOSED', 'CANCELLED'] },
        },
        {
          $set: {
            eligibilityOutcome: input.outcome,
            eligibilitySnapshotId: toObjectId(input.eligibilitySnapshotId, 'eligibilitySnapshotId'),
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
}

export class MongoAssistanceApplicationHistoryRepository
implements AssistanceApplicationHistoryRepositoryPort {
  public async append(
    input: Parameters<AssistanceApplicationHistoryRepositoryPort['append']>[0],
  ): Promise<AssistanceApplicationHistoryRecord> {
    const [created] = await AssistanceApplicationHistoryModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        applicationId: input.application._id,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        applicationVersion: input.application.version,
        snapshot: input.snapshot,
        snapshotHash: input.snapshotHash,
        reason: input.reason,
        actorUserId: toObjectId(input.actor.userId, 'actorUserId'),
        makerUserId: nullableWelfareZakatObjectId(input.makerUserId, 'makerUserId'),
        checkerUserId: nullableWelfareZakatObjectId(input.checkerUserId, 'checkerUserId'),
        approvalRequestId: nullableWelfareZakatObjectId(input.approvalRequestId, 'approvalRequestId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        occurredAt: input.occurredAt,
        immutableHash: input.immutableHash,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<AssistanceApplicationHistoryRecord>(created!.toObject());
  }
}

export class MongoAssistanceReviewRepository implements AssistanceReviewRepositoryPort {
  public async appendReview(
    input: Parameters<AssistanceReviewRepositoryPort['appendReview']>[0],
  ): Promise<AssistanceReviewRecord> {
    const [created] = await AssistanceReviewModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        applicationId: toObjectId(input.applicationId, 'applicationId'),
        reviewType: input.input.reviewType,
        reviewSequence: input.reviewSequence,
        outcome: input.input.outcome,
        assessmentEncrypted: input.assessmentEncrypted,
        findingsEncrypted: input.findingsEncrypted,
        recommendedFundId: nullableWelfareZakatObjectId(input.input.recommendedFundId, 'recommendedFundId'),
        recommendedAmount: input.input.recommendedAmount == null ? null : decimalStringToDecimal128(input.input.recommendedAmount),
        attachmentIds: (input.input.attachmentIds ?? []).map((id) => toObjectId(id, 'attachmentId')),
        reviewerUserId: toObjectId(input.actor.userId, 'reviewerUserId'),
        reviewerStaffId: nullableWelfareZakatObjectId(input.actor.staffId, 'reviewerStaffId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        reviewedAt: input.reviewedAt,
        immutableHash: input.immutableHash,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<AssistanceReviewRecord>(created!.toObject());
  }

  public async appendEligibilitySnapshot(
    input: Parameters<AssistanceReviewRepositoryPort['appendEligibilitySnapshot']>[0],
  ): Promise<EligibilityEvaluationSnapshotRecord> {
    const [created] = await EligibilityEvaluationSnapshotModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        applicationId: toObjectId(input.applicationId, 'applicationId'),
        fundId: toObjectId(input.fundId, 'fundId'),
        applicationVersion: input.applicationVersion,
        fundVersion: input.fundVersion,
        outcome: input.result.outcome,
        eligible: input.result.eligible,
        manualReviewRequired: input.result.manualReviewRequired,
        matchedRuleCodes: input.result.matchedRuleCodes,
        failedRuleCodes: input.result.failedRuleCodes,
        reasons: input.result.reasons,
        contextHash: input.contextHash,
        evaluatedBy: toObjectId(input.actor.userId, 'evaluatedBy'),
        evaluatedAt: input.evaluatedAt,
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        immutableHash: input.immutableHash,
      }],
      { session: input.transaction.session },
    );
    return welfareZakatRecord<EligibilityEvaluationSnapshotRecord>(created!.toObject());
  }

  public async latestEligibilitySnapshot(
    facilityId: string,
    applicationId: string,
    fundId: string,
    session?: WelfareZakatMongoSession,
  ): Promise<EligibilityEvaluationSnapshotRecord | null> {
    return welfareZakatRecord<EligibilityEvaluationSnapshotRecord | null>(
      await withWelfareZakatSession(
        EligibilityEvaluationSnapshotModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          applicationId: toObjectId(applicationId, 'applicationId'),
          fundId: toObjectId(fundId, 'fundId'),
        }).sort({ evaluatedAt: -1, _id: -1 }).lean(),
        session,
      ).exec(),
    );
  }
}