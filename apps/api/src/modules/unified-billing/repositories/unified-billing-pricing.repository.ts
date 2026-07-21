import {
  type FilterQuery,
} from 'mongoose';

import {
  PriceListModel,
  PriceListVersionModel,
  ServiceRateModel,
  TaxCategoryModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  throwMappedUnifiedBillingPersistenceError,
} from '../unified-billing.errors.js';

import type {
  PriceListRepositoryPort,
  UnifiedBillingPricingResolutionRequest,
} from '../unified-billing.ports.js';

import type {
  BillingMongoSession,
  PriceListPersistenceUpdate,
  PriceListRecord,
  PriceListVersionRecord,
  ServiceRatePersistenceUpdate,
  ServiceRateRecord,
  TaxCategoryRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectPriceList,
  projectServiceRate,
  projectTaxCategory,
} from '../unified-billing.projections.js';

import {
  billingEffectiveFilter,
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

export class UnifiedBillingPricingRepository
implements PriceListRepositoryPort {
  public async createTaxCategory(
    input: Parameters<PriceListRepositoryPort['createTaxCategory']>[0],
    session: BillingMongoSession,
  ): Promise<TaxCategoryRecord> {
    try {
      const [created] = await TaxCategoryModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<TaxCategoryRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async listTaxCategories(
    facilityId: string,
    includeInactive = false,
  ) {
    const records = record<TaxCategoryRecord[]>(
      await TaxCategoryModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...(includeInactive ? {} : { active: true }),
        })
        .sort({ code: 1 })
        .lean()
        .exec(),
    );

    return records.map(projectTaxCategory);
  }

  public async createPriceList(
    input: Parameters<PriceListRepositoryPort['createPriceList']>[0],
    session: BillingMongoSession,
  ): Promise<PriceListRecord> {
    try {
      const [created] = await PriceListModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<PriceListRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async createPriceListVersion(
    input: Parameters<PriceListRepositoryPort['createPriceListVersion']>[0],
    session: BillingMongoSession,
  ): Promise<PriceListVersionRecord> {
    try {
      const [created] = await PriceListVersionModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<PriceListVersionRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findPriceList(
    facilityId: string,
    priceListId: string,
    session?: BillingMongoSession,
  ): Promise<PriceListRecord | null> {
    return record<PriceListRecord | null>(
      await withSession(
        PriceListModel
          .findOne({
            _id: toObjectId(priceListId, 'priceListId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findPriceListByCode(
    facilityId: string,
    code: string,
    session?: BillingMongoSession,
  ): Promise<PriceListRecord | null> {
    return record<PriceListRecord | null>(
      await withSession(
        PriceListModel
          .findOne({
            facilityId: toObjectId(facilityId, 'facilityId'),
            code: normalizeBillingCode(code),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findPriceListVersion(
    facilityId: string,
    priceListVersionId: string,
    session?: BillingMongoSession,
  ): Promise<PriceListVersionRecord | null> {
    return record<PriceListVersionRecord | null>(
      await withSession(
        PriceListVersionModel
          .findOne({
            _id: toObjectId(priceListVersionId, 'priceListVersionId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async updatePriceList(
    facilityId: string,
    priceListId: string,
    expectedVersion: number,
    update: PriceListPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<PriceListRecord | null> {
    try {
      return record<PriceListRecord | null>(
        await PriceListModel
          .findOneAndUpdate(
            {
              _id: toObjectId(priceListId, 'priceListId'),
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
            { new: true, runValidators: true, session },
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async listPriceLists(
    facilityId: string,
    includeInactive = false,
  ) {
    const records = record<PriceListRecord[]>(
      await PriceListModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...(includeInactive ? {} : { status: 'ACTIVE' }),
        })
        .sort({ priority: 1, code: 1 })
        .lean()
        .exec(),
    );

    return records.map(projectPriceList);
  }

  public async createServiceRate(
    input: Parameters<PriceListRepositoryPort['createServiceRate']>[0],
    session: BillingMongoSession,
  ): Promise<ServiceRateRecord> {
    try {
      const [created] = await ServiceRateModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<ServiceRateRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findServiceRate(
    facilityId: string,
    serviceRateId: string,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null> {
    return record<ServiceRateRecord | null>(
      await withSession(
        ServiceRateModel
          .findOne({
            _id: toObjectId(serviceRateId, 'serviceRateId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findServiceRateByCode(
    facilityId: string,
    rateCode: string,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null> {
    return record<ServiceRateRecord | null>(
      await withSession(
        ServiceRateModel
          .findOne({
            facilityId: toObjectId(facilityId, 'facilityId'),
            rateCode: normalizeBillingCode(rateCode),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findCurrentServiceRate(
    facilityId: string,
    chargeCatalogItemId: string,
    priceListId: string,
    at: Date,
    session?: BillingMongoSession,
  ): Promise<ServiceRateRecord | null> {
    return record<ServiceRateRecord | null>(
      await withSession(
        ServiceRateModel
          .findOne({
            facilityId: toObjectId(facilityId, 'facilityId'),
            chargeCatalogItemId: toObjectId(
              chargeCatalogItemId,
              'chargeCatalogItemId',
            ),
            priceListId: toObjectId(priceListId, 'priceListId'),
            status: 'ACTIVE',
            ...billingEffectiveFilter(at),
          })
          .sort({ effectiveFrom: -1, createdAt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async updateServiceRate(
    facilityId: string,
    serviceRateId: string,
    expectedVersion: number,
    update: ServiceRatePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<ServiceRateRecord | null> {
    try {
      return record<ServiceRateRecord | null>(
        await ServiceRateModel
          .findOneAndUpdate(
            {
              _id: toObjectId(serviceRateId, 'serviceRateId'),
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
            { new: true, runValidators: true, session },
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async listEffectiveRateCandidates(
    request: UnifiedBillingPricingResolutionRequest,
    session?: BillingMongoSession,
  ) {
    const rateFilter: FilterQuery<unknown> = {
      facilityId: toObjectId(request.facilityId, 'facilityId'),
      chargeCatalogItemId: toObjectId(
        request.chargeCatalogItemId ?? request.chargeCode,
        'chargeCatalogItemId',
      ),
      status: 'ACTIVE',
      ...billingEffectiveFilter(request.at),
    };

    const rates = record<ServiceRateRecord[]>(
      await withSession(
        ServiceRateModel
          .find(rateFilter)
          .sort({ effectiveFrom: -1, createdAt: -1 })
          .limit(250)
          .lean(),
        session,
      ).exec(),
    );

    if (rates.length === 0) {
      return [];
    }

    const priceListIds = [...new Set(
      rates.map((rate) => rate.priceListId.toHexString()),
    )];
    const priceLists = record<PriceListRecord[]>(
      await withSession(
        PriceListModel
          .find({
            _id: { $in: priceListIds.map((id) => toObjectId(id, 'priceListId')) },
            facilityId: toObjectId(request.facilityId, 'facilityId'),
            status: 'ACTIVE',
            ...billingEffectiveFilter(request.at),
          })
          .lean(),
        session,
      ).exec(),
    );
    const listsById = new Map(
      priceLists.map((priceList) => [priceList._id.toHexString(), priceList]),
    );

    return rates.flatMap((serviceRate) => {
      const priceList = listsById.get(serviceRate.priceListId.toHexString());
      return priceList === undefined ? [] : [{ priceList, serviceRate }];
    });
  }

  public async listServiceRates(
    facilityId: string,
    priceListId?: string,
  ) {
    const records = record<ServiceRateRecord[]>(
      await ServiceRateModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...(priceListId === undefined
            ? {}
            : { priceListId: toObjectId(priceListId, 'priceListId') }),
        })
        .sort({ effectiveFrom: -1, rateCode: 1 })
        .lean()
        .exec(),
    );

    return records.map(projectServiceRate);
  }

  public async findTaxCategory(
    facilityId: string,
    taxCategoryId: string,
    session?: BillingMongoSession,
  ): Promise<TaxCategoryRecord | null> {
    return record<TaxCategoryRecord | null>(
      await withSession(
        TaxCategoryModel
          .findOne({
            _id: toObjectId(taxCategoryId, 'taxCategoryId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }
}