import type { FilterQuery } from 'mongoose';

import {
  ConsultantAgreementHistoryModel,
  ConsultantAgreementModel,
  ConsultantAgreementRuleHistoryModel,
  ConsultantAgreementRuleModel,
} from '@hospital-mis/database';

import type {
  ConsultantAgreementMatchCandidate,
  ConsultantAgreementRuleDefinition,
  ConsultantAgreementView,
  ConsultantSharingListQuery,
} from '../consultant-sharing.contracts.js';
import type {
  ConsultantAgreementHistoryRepositoryPort,
  ConsultantAgreementRepositoryPort,
  ConsultantAgreementRuleRepositoryPort,
} from '../consultant-sharing.ports.js';
import {
  normalizeConsultantSharingCode,
  normalizeConsultantSharingName,
  stableConsultantSharingPayloadHash,
} from '../consultant-sharing.normalization.js';
import {
  projectConsultantAgreement,
  projectConsultantAgreementRule,
} from '../consultant-sharing.projections.js';
import {
  consultantSharingDecimal,
  consultantSharingIdString,
  consultantSharingMongoSession,
  consultantSharingObjectId,
  consultantSharingSortDirection,
  nullableConsultantSharingObjectId,
  throwMappedConsultantSharingPersistenceError,
  withConsultantSharingSession,
} from './consultant-sharing-repository.support.js';

function agreementFilter(
  facilityId: string,
  query: ConsultantSharingListQuery,
): FilterQuery<unknown> {
  const filter: Record<string, unknown> = {
    facilityId: consultantSharingObjectId(facilityId, 'facilityId'),
  };
  if (query.consultantId != null) {
    filter.consultantId = consultantSharingObjectId(query.consultantId, 'consultantId');
  }
  if (query.departmentId != null) {
    filter.departmentIds = consultantSharingObjectId(query.departmentId, 'departmentId');
  }
  if (query.serviceId != null) {
    filter.serviceIds = consultantSharingObjectId(query.serviceId, 'serviceId');
  }
  if (query.agreementId != null) {
    filter._id = consultantSharingObjectId(query.agreementId, 'agreementId');
  }
  if (query.status != null && query.status.length > 0) {
    filter.status = { $in: query.status };
  }
  if (query.from != null || query.to != null) {
    filter.createdAt = {
      ...(query.from == null ? {} : { $gte: new Date(query.from) }),
      ...(query.to == null ? {} : { $lte: new Date(query.to) }),
    };
  }
  return filter;
}

function lifecycleFields(
  target: string,
  actorUserId: string,
  occurredAt: Date,
  reason: string,
): Readonly<Record<string, unknown>> {
  const actor = consultantSharingObjectId(actorUserId, 'actorUserId');
  const fields: Record<string, unknown> = {};
  const map: Readonly<Record<string, readonly [string, string]>> = {
    SUBMITTED: ['submittedBy', 'submittedAt'],
    UNDER_REVIEW: ['reviewedBy', 'reviewedAt'],
    APPROVED: ['approvedBy', 'approvedAt'],
    ACTIVE: ['activatedBy', 'activatedAt'],
    SUSPENDED: ['suspendedBy', 'suspendedAt'],
    TERMINATED: ['terminatedBy', 'terminatedAt'],
    CANCELLED: ['cancelledBy', 'cancelledAt'],
    REOPENED: ['reopenedBy', 'reopenedAt'],
  };
  const pair = map[target];
  if (pair != null) {
    fields[pair[0]] = actor;
    fields[pair[1]] = occurredAt;
  }
  if (target === 'SUSPENDED') fields.suspensionReason = reason;
  if (target === 'TERMINATED') fields.terminationReason = reason;
  if (target === 'CANCELLED') fields.cancellationReason = reason;
  if (target === 'REOPENED') fields.reopenReason = reason;
  return fields;
}

export class MongoConsultantAgreementRepository
  implements ConsultantAgreementRepositoryPort {
  public async create(
    input: Parameters<ConsultantAgreementRepositoryPort['create']>[0],
  ): Promise<ConsultantAgreementView> {
    try {
      const [created] = await ConsultantAgreementModel.create(
        [{
          facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          operationKey: input.operationKey,
          agreementNumber: normalizeConsultantSharingCode(input.agreementNumber),
          agreementName: normalizeConsultantSharingName(input.agreementName),
          description: input.description,
          consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
          consultantStaffId: nullableConsultantSharingObjectId(input.consultantStaffId, 'consultantStaffId'),
          consultantUserId: nullableConsultantSharingObjectId(input.consultantUserId, 'consultantUserId'),
          consultantGroupId: nullableConsultantSharingObjectId(input.consultantGroupId, 'consultantGroupId'),
          engagementType: input.engagementType,
          status: 'DRAFT',
          priority: input.priority,
          effectiveFrom: input.effectiveFrom,
          effectiveThrough: input.effectiveThrough,
          agreementVersion: 1,
          supersedesAgreementId: null,
          supersededByAgreementId: null,
          departmentIds: input.departmentIds.map((id) => consultantSharingObjectId(id, 'departmentId')),
          serviceIds: input.serviceIds.map((id) => consultantSharingObjectId(id, 'serviceId')),
          serviceCategories: input.serviceCategories,
          supportingAttachmentIds: input.supportingAttachmentIds.map((id) => consultantSharingObjectId(id, 'attachmentId')),
          internalNotesEncrypted: input.internalNotesEncrypted,
          approvalNotesEncrypted: null,
          taxProfileReferenceHash: input.taxProfileReferenceHash,
          payoutProfileReferenceHash: input.payoutProfileReferenceHash,
          payoutProfileReferenceMasked: input.payoutProfileReferenceMasked,
          approvalMatrixCode: normalizeConsultantSharingCode(input.approvalMatrixCode),
          approvalRequestId: null,
          makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
        }],
        { session: consultantSharingMongoSession(input.transaction) },
      );
      return projectConsultantAgreement(created.toObject() as never);
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async findById(
    input: Parameters<ConsultantAgreementRepositoryPort['findById']>[0],
  ): Promise<ConsultantAgreementView | null> {
    const query = ConsultantAgreementModel.findOne({
      _id: consultantSharingObjectId(input.agreementId, 'agreementId'),
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
    }).lean();
    const record = await withConsultantSharingSession(
      query,
      consultantSharingMongoSession(input.transaction),
    ).exec();
    return record == null ? null : projectConsultantAgreement(record as never);
  }

  public async list(
    input: Parameters<ConsultantAgreementRepositoryPort['list']>[0],
  ) {
    const page = Math.max(1, Math.trunc(input.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.query.pageSize ?? 25)));
    const filter = agreementFilter(input.facilityId, input.query);
    const sortField = input.query.sortBy ?? 'createdAt';
    const [records, totalItems] = await Promise.all([
      ConsultantAgreementModel.find(filter)
        .sort({ [sortField]: consultantSharingSortDirection(input.query.sortDirection), _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      ConsultantAgreementModel.countDocuments(filter).exec(),
    ]);
    return {
      items: records.map((record) => projectConsultantAgreement(record as never)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async updateDraft(
    input: Parameters<ConsultantAgreementRepositoryPort['updateDraft']>[0],
  ): Promise<ConsultantAgreementView | null> {
    const set: Record<string, unknown> = {
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      ...input.changes,
    };
    if (input.changes.supportingAttachmentIds != null) {
      set.supportingAttachmentIds = input.changes.supportingAttachmentIds.map((id) =>
        consultantSharingObjectId(id, 'attachmentId'),
      );
    }
    const record = await ConsultantAgreementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.agreementId, 'agreementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: { $in: ['DRAFT', 'REOPENED'] },
        version: input.expectedVersion,
      },
      { $set: set, $inc: { version: 1 } },
      {
        new: true,
        runValidators: true,
        session: consultantSharingMongoSession(input.transaction),
      },
    ).lean().exec();
    return record == null ? null : projectConsultantAgreement(record as never);
  }

  public async changeStatus(
    input: Parameters<ConsultantAgreementRepositoryPort['changeStatus']>[0],
  ): Promise<ConsultantAgreementView | null> {
    const set: Record<string, unknown> = {
      status: input.toStatus,
      updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
      ...lifecycleFields(input.toStatus, input.actor.userId, input.occurredAt, input.reason),
    };
    if (input.approvalRequestId != null) {
      set.approvalRequestId = consultantSharingObjectId(input.approvalRequestId, 'approvalRequestId');
    }
    const record = await ConsultantAgreementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.agreementId, 'agreementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: input.fromStatus,
        version: input.expectedVersion,
      },
      { $set: set, $inc: { version: 1 } },
      {
        new: true,
        runValidators: true,
        session: consultantSharingMongoSession(input.transaction),
      },
    ).lean().exec();
    return record == null ? null : projectConsultantAgreement(record as never);
  }

  public async createAmendment(
    input: Parameters<ConsultantAgreementRepositoryPort['createAmendment']>[0],
  ): Promise<ConsultantAgreementView | null> {
    const session = consultantSharingMongoSession(input.transaction);
    const query = ConsultantAgreementModel.findOne({
      _id: consultantSharingObjectId(input.sourceAgreementId, 'sourceAgreementId'),
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      version: input.expectedVersion,
    });
    const source = await withConsultantSharingSession(query, session).exec();
    if (source == null) return null;

    const sourceObject = source.toObject() as Readonly<Record<string, unknown>>;
    const [created] = await ConsultantAgreementModel.create(
      [{
        ...sourceObject,
        _id: undefined,
        operationKey: input.operationKey,
        agreementNumber: normalizeConsultantSharingCode(input.amendmentAgreementNumber),
        status: 'DRAFT',
        effectiveFrom: input.effectiveFrom,
        effectiveThrough: sourceObject.effectiveThrough ?? null,
        agreementVersion: Number(sourceObject.agreementVersion) + 1,
        supersedesAgreementId: source._id,
        supersededByAgreementId: null,
        makerUserId: consultantSharingObjectId(input.actor.userId, 'makerUserId'),
        approvalRequestId: null,
        submittedBy: null,
        reviewedBy: null,
        approvedBy: null,
        activatedBy: null,
        suspendedBy: null,
        terminatedBy: null,
        cancelledBy: null,
        reopenedBy: null,
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        activatedAt: null,
        suspendedAt: null,
        terminatedAt: null,
        cancelledAt: null,
        reopenedAt: null,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        version: 0,
        createdAt: undefined,
        updatedAt: undefined,
      }],
      { session },
    );
    return projectConsultantAgreement(created.toObject() as never);
  }

  public async supersedeForAmendment(
    input: Parameters<ConsultantAgreementRepositoryPort['supersedeForAmendment']>[0],
  ): Promise<ConsultantAgreementView | null> {
    const sourceEffectiveThrough = new Date(input.amendmentEffectiveFrom.getTime() - 1);
    const record = await ConsultantAgreementModel.findOneAndUpdate(
      {
        _id: consultantSharingObjectId(input.sourceAgreementId, 'sourceAgreementId'),
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        status: { $in: ['APPROVED', 'ACTIVE', 'SUSPENDED'] },
        supersededByAgreementId: null,
        effectiveFrom: { $lt: input.amendmentEffectiveFrom },
      },
      {
        $set: {
          status: 'SUPERSEDED',
          effectiveThrough: sourceEffectiveThrough,
          supersededByAgreementId: consultantSharingObjectId(
            input.amendmentAgreementId,
            'amendmentAgreementId',
          ),
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
    return record == null ? null : projectConsultantAgreement(record as never);
  }
}

function decimalOrNull(value: string | null): unknown {
  return value == null ? null : consultantSharingDecimal(value);
}

export class MongoConsultantAgreementRuleRepository
  implements ConsultantAgreementRuleRepositoryPort {
  public async createMany(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['createMany']>[0],
  ): Promise<readonly ConsultantAgreementRuleDefinition[]> {
    try {
      const created = await ConsultantAgreementRuleModel.insertMany(
        input.rules.map((rule) => ({
          facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
          transactionId: input.transaction.transactionId,
          correlationId: input.actor.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          operationKey: stableConsultantSharingPayloadHash({
            agreementId: input.agreement.id,
            agreementVersion: input.agreement.agreementVersion,
            ruleCode: rule.ruleCode,
          }),
          agreementId: consultantSharingObjectId(input.agreement.id, 'agreementId'),
          agreementVersion: input.agreement.agreementVersion,
          ruleVersion: rule.ruleVersion,
          ruleCode: normalizeConsultantSharingCode(rule.ruleCode),
          ruleName: normalizeConsultantSharingName(rule.ruleName),
          status: 'DRAFT',
          priority: rule.priority,
          specificityRank: 0,
          isFallback: rule.isFallback,
          effectiveFrom: new Date(rule.effectiveFrom),
          effectiveThrough: rule.effectiveThrough == null ? null : new Date(rule.effectiveThrough),
          consultantId: consultantSharingObjectId(input.agreement.consultantId, 'consultantId'),
          consultantGroupId: nullableConsultantSharingObjectId(input.agreement.consultantGroupId, 'consultantGroupId'),
          departmentId: nullableConsultantSharingObjectId(rule.departmentId, 'departmentId'),
          serviceId: nullableConsultantSharingObjectId(rule.serviceId, 'serviceId'),
          serviceCategory: rule.serviceCategory,
          chargeCatalogItemId: nullableConsultantSharingObjectId(rule.chargeCatalogItemId, 'chargeCatalogItemId'),
          procedureId: nullableConsultantSharingObjectId(rule.procedureId, 'procedureId'),
          patientType: rule.patientType,
          encounterType: rule.encounterType,
          admissionType: rule.admissionType,
          payerOrganizationId: nullableConsultantSharingObjectId(rule.payerOrganizationId, 'payerOrganizationId'),
          panelProgramId: nullableConsultantSharingObjectId(rule.panelProgramId, 'panelProgramId'),
          packageId: nullableConsultantSharingObjectId(rule.packageId, 'packageId'),
          claimType: rule.claimType,
          calculationMethod: rule.calculationMethod,
          recognitionBasis: rule.recognitionBasis,
          percentage: decimalOrNull(rule.percentage),
          fixedAmount: decimalOrNull(rule.fixedAmount),
          minimumShare: decimalOrNull(rule.minimumShare),
          maximumShare: decimalOrNull(rule.maximumShare),
          perServiceCap: decimalOrNull(rule.perServiceCap),
          perCaseCap: decimalOrNull(rule.perCaseCap),
          periodCap: decimalOrNull(rule.periodCap),
          guaranteedAmount: decimalOrNull(rule.guaranteedAmount),
          thresholdAmount: decimalOrNull(rule.thresholdAmount),
          tiers: rule.tiers.map((tier) => ({
            ...tier,
            fromInclusive: consultantSharingDecimal(tier.fromInclusive),
            toInclusive: decimalOrNull(tier.toInclusive),
            percentage: decimalOrNull(tier.percentage),
            fixedAmount: decimalOrNull(tier.fixedAmount),
          })),
          participants: rule.participants.map((participant) => ({
            ...participant,
            participantId: consultantSharingObjectId(participant.participantId, 'participantId'),
            percentage: decimalOrNull(participant.percentage),
            fixedAmount: decimalOrNull(participant.fixedAmount),
          })),
          ...rule.eligibilityPolicy,
          currency: rule.currency,
          calculationFingerprint: stableConsultantSharingPayloadHash({
            agreementId: input.agreement.id,
            agreementVersion: input.agreement.agreementVersion,
            rule,
          }),
        })),
        { session: consultantSharingMongoSession(input.transaction) },
      );
      return created.map((record) => projectConsultantAgreementRule(record.toObject() as never));
    } catch (error) {
      throwMappedConsultantSharingPersistenceError(error);
    }
  }

  public async listByAgreement(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['listByAgreement']>[0],
  ) {
    const query = ConsultantAgreementRuleModel.find({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      agreementId: consultantSharingObjectId(input.agreementId, 'agreementId'),
    }).sort({ priority: -1, specificityRank: -1, ruleCode: 1 }).lean();
    const records = await withConsultantSharingSession(
      query,
      consultantSharingMongoSession(input.transaction),
    ).exec();
    return records.map((record) => projectConsultantAgreementRule(record as never));
  }

  public async findMatchingCandidates(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['findMatchingCandidates']>[0],
  ): Promise<readonly ConsultantAgreementMatchCandidate[]> {
    const at = input.financialEventAt;
    const session = consultantSharingMongoSession(input.transaction);
    const ruleQuery = ConsultantAgreementRuleModel.find({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
      status: { $in: ['ACTIVE', 'SUPERSEDED'] },
      effectiveFrom: { $lte: at },
      $or: [{ effectiveThrough: null }, { effectiveThrough: { $gte: at } }],
    }).lean();
    const rules = await withConsultantSharingSession(ruleQuery, session).exec();
    if (rules.length === 0) return [];

    const ids = [...new Set(rules.map((rule) => consultantSharingIdString(rule.agreementId)))];
    const agreementQuery = ConsultantAgreementModel.find({
      _id: { $in: ids.map((id) => consultantSharingObjectId(id, 'agreementId')) },
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      status: { $in: ['ACTIVE', 'SUPERSEDED', 'EXPIRED', 'TERMINATED'] },
      effectiveFrom: { $lte: at },
      $or: [{ effectiveThrough: null }, { effectiveThrough: { $gte: at } }],
    }).lean();
    const agreements = await withConsultantSharingSession(agreementQuery, session).exec();
    const byId = new Map(
      agreements.map((agreement) => [consultantSharingIdString(agreement._id), agreement]),
    );

    return rules.flatMap((rule) => {
      const agreement = byId.get(consultantSharingIdString(rule.agreementId));
      if (agreement == null) return [];
      return [{
        agreementId: consultantSharingIdString(agreement._id),
        agreementNumber: String(agreement.agreementNumber),
        agreementVersion: Number(agreement.agreementVersion),
        agreementStatus: String(agreement.status) as ConsultantAgreementMatchCandidate['agreementStatus'],
        agreementPriority: Number(agreement.priority),
        rule: projectConsultantAgreementRule(rule as never),
      } satisfies ConsultantAgreementMatchCandidate];
    });
  }

  public async findConflictCandidates(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['findConflictCandidates']>[0],
  ): Promise<readonly ConsultantAgreementMatchCandidate[]> {
    const session = consultantSharingMongoSession(input.transaction);
    const through = input.effectiveThrough ?? new Date('9999-12-31T23:59:59.999Z');
    const ruleQuery = ConsultantAgreementRuleModel.find({
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      consultantId: consultantSharingObjectId(input.consultantId, 'consultantId'),
      status: 'ACTIVE',
      effectiveFrom: { $lte: through },
      $or: [
        { effectiveThrough: null },
        { effectiveThrough: { $gte: input.effectiveFrom } },
      ],
      ...(input.excludeAgreementIds == null || input.excludeAgreementIds.length === 0
        ? {}
        : {
            agreementId: {
              $nin: input.excludeAgreementIds.map((agreementId) =>
                consultantSharingObjectId(agreementId, 'excludeAgreementId'),
              ),
            },
          }),
    }).lean();
    const rules = await withConsultantSharingSession(ruleQuery, session).exec();
    if (rules.length === 0) return [];

    const agreementIds = [
      ...new Set(rules.map((rule) => consultantSharingIdString(rule.agreementId))),
    ];
    const agreementQuery = ConsultantAgreementModel.find({
      _id: { $in: agreementIds.map((id) => consultantSharingObjectId(id, 'agreementId')) },
      facilityId: consultantSharingObjectId(input.facilityId, 'facilityId'),
      status: 'ACTIVE',
      effectiveFrom: { $lte: through },
      $or: [
        { effectiveThrough: null },
        { effectiveThrough: { $gte: input.effectiveFrom } },
      ],
    }).lean();
    const agreements = await withConsultantSharingSession(agreementQuery, session).exec();
    const byId = new Map(
      agreements.map((agreement) => [consultantSharingIdString(agreement._id), agreement]),
    );

    return rules.flatMap((rule) => {
      const agreement = byId.get(consultantSharingIdString(rule.agreementId));
      if (agreement == null) return [];
      return [{
        agreementId: consultantSharingIdString(agreement._id),
        agreementNumber: String(agreement.agreementNumber),
        agreementVersion: Number(agreement.agreementVersion),
        agreementStatus: 'ACTIVE',
        agreementPriority: Number(agreement.priority),
        rule: projectConsultantAgreementRule(rule as never),
      } satisfies ConsultantAgreementMatchCandidate];
    });
  }

  public async activateForAgreement(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['activateForAgreement']>[0],
  ): Promise<number> {
    const result = await ConsultantAgreementRuleModel.updateMany(
      {
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        agreementId: consultantSharingObjectId(input.agreementId, 'agreementId'),
        status: 'DRAFT',
      },
      {
        $set: {
          status: 'ACTIVE',
          updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        },
        $inc: { version: 1 },
      },
      { session: consultantSharingMongoSession(input.transaction), runValidators: true },
    ).exec();
    return result.modifiedCount;
  }

  public async supersedeForAgreement(
    input: Parameters<ConsultantAgreementRuleRepositoryPort['supersedeForAgreement']>[0],
  ): Promise<number> {
    const baseFilter = {
      facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
      agreementId: consultantSharingObjectId(input.agreementId, 'agreementId'),
      status: { $in: ['ACTIVE', 'DRAFT'] },
    } as const;
    const session = consultantSharingMongoSession(input.transaction);
    const truncated = await ConsultantAgreementRuleModel.updateMany(
        {
          ...baseFilter,
          $or: [
            { effectiveThrough: null },
            { effectiveThrough: { $gt: input.supersededAt } },
          ],
        },
        {
          $set: {
            status: 'SUPERSEDED',
            effectiveThrough: input.supersededAt,
            updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();
    const preserved = await ConsultantAgreementRuleModel.updateMany(
        {
          ...baseFilter,
          effectiveThrough: { $ne: null, $lte: input.supersededAt },
        },
        {
          $set: {
            status: 'SUPERSEDED',
            updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
          },
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      ).exec();
    return truncated.modifiedCount + preserved.modifiedCount;
  }
}

export class MongoConsultantAgreementHistoryRepository
  implements ConsultantAgreementHistoryRepositoryPort {
  public async append(
    input: Parameters<ConsultantAgreementHistoryRepositoryPort['append']>[0],
  ): Promise<void> {
    await ConsultantAgreementHistoryModel.create(
      [{
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        agreementId: consultantSharingObjectId(input.agreementId, 'agreementId'),
        agreementVersion: input.agreementVersion,
        historyType: input.historyType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reasonEncrypted: input.reasonEncrypted,
        snapshot: input.snapshot,
        immutableHash: input.immutableHash,
        occurredAt: input.occurredAt,
        actorUserId: consultantSharingObjectId(input.actor.userId, 'actorUserId'),
        approvalRequestId: nullableConsultantSharingObjectId(input.approvalRequestId, 'approvalRequestId'),
      }],
      { session: consultantSharingMongoSession(input.transaction) },
    );
  }

  public async appendRuleVersions(
    input: Parameters<ConsultantAgreementHistoryRepositoryPort['appendRuleVersions']>[0],
  ): Promise<void> {
    if (input.rules.length === 0) return;
    await ConsultantAgreementRuleHistoryModel.insertMany(
      input.rules.map((rule) => ({
        facilityId: consultantSharingObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transaction.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: consultantSharingObjectId(input.actor.userId, 'createdBy'),
        updatedBy: consultantSharingObjectId(input.actor.userId, 'updatedBy'),
        agreementId: consultantSharingObjectId(rule.agreementId, 'agreementId'),
        agreementRuleId: consultantSharingObjectId(rule.id, 'agreementRuleId'),
        agreementVersion: rule.agreementVersion,
        ruleVersion: rule.ruleVersion,
        snapshot: rule,
        calculationFingerprint: rule.calculationFingerprint,
        immutableHash: stableConsultantSharingPayloadHash(rule),
        occurredAt: input.occurredAt,
        actorUserId: consultantSharingObjectId(input.actor.userId, 'actorUserId'),
      })),
      { session: consultantSharingMongoSession(input.transaction) },
    );
  }
}