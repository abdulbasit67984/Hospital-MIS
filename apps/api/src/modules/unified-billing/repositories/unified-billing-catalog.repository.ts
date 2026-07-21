import {
  type FilterQuery,
  type UpdateQuery,
} from 'mongoose';

import {
  ChargeCatalogModel,
  ChargeCatalogVersionModel,
  ChargeCategoryModel,
  ChargeRuleModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  UnifiedBillingCatalogListQuery,
} from '../unified-billing.contracts.js';

import {
  throwMappedUnifiedBillingPersistenceError,
} from '../unified-billing.errors.js';

import type {
  ChargeCatalogRepositoryPort,
} from '../unified-billing.ports.js';

import type {
  BillingMongoSession,
  ChargeCatalogPersistenceUpdate,
  ChargeCatalogRecord,
  ChargeCatalogVersionRecord,
  ChargeCategoryPersistenceUpdate,
  ChargeCategoryRecord,
  ChargeRulePersistenceUpdate,
  ChargeRuleRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectChargeCatalogItem,
  projectChargeCategory,
  projectChargeRule,
} from '../unified-billing.projections.js';

import {
  billingEffectiveFilter,
  billingPage,
  billingPagination,
  escapeBillingRegex,
  normalizeBillingCode,
} from '../unified-billing.normalization.js';

function record<T>(value: unknown): T {
  return value as T;
}

function withSession<T extends { session(session: BillingMongoSession): T }>(
  query: T,
  session?: BillingMongoSession,
): T {
  return session === undefined ? query : query.session(session);
}

function sortDirection(value: 'asc' | 'desc' | undefined): 1 | -1 {
  return value === 'asc' ? 1 : -1;
}

export class UnifiedBillingCatalogRepository
implements ChargeCatalogRepositoryPort {
  public async createCategory(
    input: Parameters<ChargeCatalogRepositoryPort['createCategory']>[0],
    session: BillingMongoSession,
  ): Promise<ChargeCategoryRecord> {
    try {
      const [created] = await ChargeCategoryModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
          activatedBy: input.activatedBy,
        }],
        { session },
      );

      return record<ChargeCategoryRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findCategory(
    facilityId: string,
    categoryId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null> {
    return record<ChargeCategoryRecord | null>(
      await withSession(
        ChargeCategoryModel
          .findOne({
            _id: toObjectId(categoryId, 'categoryId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findCategoryByCode(
    facilityId: string,
    code: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null> {
    return record<ChargeCategoryRecord | null>(
      await withSession(
        ChargeCategoryModel
          .findOne({
            facilityId: toObjectId(facilityId, 'facilityId'),
            code: normalizeBillingCode(code),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async listCategories(
    facilityId: string,
    includeInactive = false,
  ) {
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
    };
    const records = record<ChargeCategoryRecord[]>(
      await ChargeCategoryModel
        .find(filter)
        .sort({ name: 1, code: 1 })
        .lean()
        .exec(),
    );

    return records.map(projectChargeCategory);
  }

  public async updateCategory(
    facilityId: string,
    categoryId: string,
    expectedVersion: number,
    update: ChargeCategoryPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeCategoryRecord | null> {
    try {
      return record<ChargeCategoryRecord | null>(
        await ChargeCategoryModel
          .findOneAndUpdate(
            {
              _id: toObjectId(categoryId, 'categoryId'),
              facilityId: toObjectId(facilityId, 'facilityId'),
              version: expectedVersion,
            },
            {
              $set: {
                ...update,
                transactionId,
                correlationId,
              },
              $inc: { version: 1 },
            } satisfies UpdateQuery<unknown>,
            { new: true, session, runValidators: true },
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async createCatalogItem(
    input: Parameters<ChargeCatalogRepositoryPort['createCatalogItem']>[0],
    session: BillingMongoSession,
  ): Promise<ChargeCatalogRecord> {
    try {
      const [created] = await ChargeCatalogModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<ChargeCatalogRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findCatalogItem(
    facilityId: string,
    catalogItemId: string,
    options?: Readonly<{
      includeCost?: boolean;
      session?: BillingMongoSession;
    }>,
  ): Promise<ChargeCatalogRecord | null> {
    let query = ChargeCatalogModel.findOne({
      _id: toObjectId(catalogItemId, 'catalogItemId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    });

    if (options?.includeCost === true) {
      query = query.select('+costAmount');
    }

    return record<ChargeCatalogRecord | null>(
      await withSession(query.lean(), options?.session).exec(),
    );
  }

  public async findCatalogItemByCode(
    facilityId: string,
    chargeCode: string,
    at: Date,
    options?: Readonly<{
      includeCost?: boolean;
      session?: BillingMongoSession;
    }>,
  ): Promise<ChargeCatalogRecord | null> {
    let query = ChargeCatalogModel.findOne({
      facilityId: toObjectId(facilityId, 'facilityId'),
      chargeCode: normalizeBillingCode(chargeCode),
      status: 'ACTIVE',
      ...billingEffectiveFilter(at),
    });

    if (options?.includeCost === true) {
      query = query.select('+costAmount');
    }

    return record<ChargeCatalogRecord | null>(
      await withSession(query.lean(), options?.session).exec(),
    );
  }

  public async updateCatalogItem(
    facilityId: string,
    catalogItemId: string,
    expectedVersion: number,
    update: ChargeCatalogPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeCatalogRecord | null> {
    try {
      return record<ChargeCatalogRecord | null>(
        await ChargeCatalogModel
          .findOneAndUpdate(
            {
              _id: toObjectId(catalogItemId, 'catalogItemId'),
              facilityId: toObjectId(facilityId, 'facilityId'),
              version: expectedVersion,
            },
            {
              $set: {
                ...update,
                transactionId,
                correlationId,
              },
              $inc: { version: 1 },
            },
            { new: true, session, runValidators: true },
          )
          .select('+costAmount')
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async createCatalogVersion(
    input: Parameters<ChargeCatalogRepositoryPort['createCatalogVersion']>[0],
    session: BillingMongoSession,
  ): Promise<ChargeCatalogVersionRecord> {
    try {
      const [created] = await ChargeCatalogVersionModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<ChargeCatalogVersionRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findCatalogVersion(
    facilityId: string,
    catalogVersionId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeCatalogVersionRecord | null> {
    return record<ChargeCatalogVersionRecord | null>(
      await withSession(
        ChargeCatalogVersionModel
          .findOne({
            _id: toObjectId(catalogVersionId, 'catalogVersionId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .select('+costAmount')
          .lean(),
        session,
      ).exec(),
    );
  }

  public async createRule(
    input: Parameters<ChargeCatalogRepositoryPort['createRule']>[0],
    session: BillingMongoSession,
  ): Promise<ChargeRuleRecord> {
    try {
      const [created] = await ChargeRuleModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<ChargeRuleRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findRule(
    facilityId: string,
    ruleId: string,
    session?: BillingMongoSession,
  ): Promise<ChargeRuleRecord | null> {
    return record<ChargeRuleRecord | null>(
      await withSession(
        ChargeRuleModel
          .findOne({
            _id: toObjectId(ruleId, 'ruleId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async updateRule(
    facilityId: string,
    ruleId: string,
    expectedVersion: number,
    update: ChargeRulePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ChargeRuleRecord | null> {
    try {
      return record<ChargeRuleRecord | null>(
        await ChargeRuleModel
          .findOneAndUpdate(
            {
              _id: toObjectId(ruleId, 'ruleId'),
              facilityId: toObjectId(facilityId, 'facilityId'),
              version: expectedVersion,
            },
            {
              $set: {
                ...update,
                transactionId,
                correlationId,
              },
              $inc: { version: 1 },
            },
            { new: true, session, runValidators: true },
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async listRules(
    facilityId: string,
    catalogItemId: string,
    at?: Date,
  ) {
    const records = record<ChargeRuleRecord[]>(
      await ChargeRuleModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          chargeCatalogItemId: toObjectId(catalogItemId, 'catalogItemId'),
          ...(at === undefined ? {} : {
            active: true,
            ...billingEffectiveFilter(at),
          }),
        })
        .sort({ ruleCode: 1 })
        .lean()
        .exec(),
    );

    return records.map(projectChargeRule);
  }

  public async listCatalog(
    facilityId: string,
    query: UnifiedBillingCatalogListQuery,
    includeCost: boolean,
  ) {
    const { page, pageSize, skip } = billingPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
    };

    if (query.status !== undefined) {
      filter['status'] = { $in: query.status };
    }
    if (query.chargeType !== undefined) {
      filter['chargeType'] = { $in: query.chargeType };
    }
    if (query.categoryId !== undefined) {
      filter['categoryId'] = toObjectId(query.categoryId, 'categoryId');
    }
    if (query.departmentId !== undefined) {
      filter['departmentId'] = toObjectId(query.departmentId, 'departmentId');
    }
    if (query.effectiveAt !== undefined) {
      Object.assign(filter, billingEffectiveFilter(new Date(query.effectiveAt)));
    }
    if (query.search !== undefined && query.search.trim().length > 0) {
      const search = new RegExp(escapeBillingRegex(query.search.trim()), 'iu');
      filter['$or'] = [
        { chargeCode: search },
        { serviceCode: search },
        { name: search },
      ];
    }

    const sortField = query.sortBy ?? 'updatedAt';
    const sort = {
      [sortField]: sortDirection(query.sortDirection),
      _id: 1,
    };
    let findQuery = ChargeCatalogModel
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(pageSize);

    if (includeCost) {
      findQuery = findQuery.select('+costAmount');
    }

    const [items, totalItems] = await Promise.all([
      findQuery.lean().exec(),
      ChargeCatalogModel.countDocuments(filter).exec(),
    ]);

    return billingPage(
      record<ChargeCatalogRecord[]>(items).map((item) =>
        projectChargeCatalogItem(item, includeCost),
      ),
      page,
      pageSize,
      totalItems,
    );
  }
}