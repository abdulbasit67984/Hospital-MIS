import {
  PackageEnrollmentModel,
  TreatmentPackageItemModel,
  TreatmentPackageModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  BillingChargeRuleViolationError,
  throwMappedUnifiedBillingPersistenceError,
} from '../unified-billing.errors.js';

import type {
  TreatmentPackageRepositoryPort,
} from '../unified-billing.ports.js';

import type {
  BillingMongoSession,
  TreatmentPackageItemRecord,
  TreatmentPackagePersistenceUpdate,
  TreatmentPackageRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectTreatmentPackage,
} from '../unified-billing.projections.js';

import {
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

export class UnifiedBillingPackageRepository
implements TreatmentPackageRepositoryPort {
  public async createPackage(
    input: Parameters<TreatmentPackageRepositoryPort['createPackage']>[0],
    session: BillingMongoSession,
  ): Promise<TreatmentPackageRecord> {
    try {
      const [created] = await TreatmentPackageModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );

      return record<TreatmentPackageRecord>(created!.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async insertItems(
    items: Parameters<TreatmentPackageRepositoryPort['insertItems']>[0],
    session: BillingMongoSession,
  ): Promise<TreatmentPackageItemRecord[]> {
    if (items.length === 0) {
      return [];
    }

    try {
      const created = await TreatmentPackageItemModel.insertMany(
        items.map((item) => ({
          ...item,
          facilityId: toObjectId(item.facilityId, 'facilityId'),
          createdBy: toObjectId(item.createdBy, 'createdBy'),
          updatedBy: toObjectId(item.updatedBy, 'updatedBy'),
        })),
        { session, ordered: true },
      );

      return created.map((item: { toObject(): unknown }) =>
        record<TreatmentPackageItemRecord>(item.toObject()),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findPackage(
    facilityId: string,
    treatmentPackageId: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null> {
    return record<TreatmentPackageRecord | null>(
      await withSession(
        TreatmentPackageModel
          .findOne({
            _id: toObjectId(treatmentPackageId, 'treatmentPackageId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findPackageByCode(
    facilityId: string,
    packageCode: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null> {
    return record<TreatmentPackageRecord | null>(
      await withSession(
        TreatmentPackageModel
          .findOne({
            facilityId: toObjectId(facilityId, 'facilityId'),
            packageCode: normalizeBillingCode(packageCode),
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async listItems(
    facilityId: string,
    treatmentPackageId: string,
    session?: BillingMongoSession,
  ): Promise<TreatmentPackageItemRecord[]> {
    return record<TreatmentPackageItemRecord[]>(
      await withSession(
        TreatmentPackageItemModel
          .find({
            facilityId: toObjectId(facilityId, 'facilityId'),
            treatmentPackageId: toObjectId(
              treatmentPackageId,
              'treatmentPackageId',
            ),
          })
          .sort({ lineNumber: 1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async updatePackage(
    facilityId: string,
    treatmentPackageId: string,
    expectedVersion: number,
    update: TreatmentPackagePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<TreatmentPackageRecord | null> {
    try {
      return record<TreatmentPackageRecord | null>(
        await TreatmentPackageModel
          .findOneAndUpdate(
            {
              _id: toObjectId(treatmentPackageId, 'treatmentPackageId'),
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

  public async listPackages(
    facilityId: string,
    includeInactive = false,
  ) {
    const packages = record<TreatmentPackageRecord[]>(
      await TreatmentPackageModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...(includeInactive ? {} : { status: 'ACTIVE' }),
        })
        .sort({ packageCode: 1 })
        .lean()
        .exec(),
    );

    if (packages.length === 0) {
      return [];
    }

    const items = record<TreatmentPackageItemRecord[]>(
      await TreatmentPackageItemModel
        .find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          treatmentPackageId: {
            $in: packages.map((item) => item._id),
          },
        })
        .sort({ lineNumber: 1 })
        .lean()
        .exec(),
    );
    const itemsByPackage = new Map<string, TreatmentPackageItemRecord[]>();

    for (const item of items) {
      const key = item.treatmentPackageId.toHexString();
      const current = itemsByPackage.get(key) ?? [];
      current.push(item);
      itemsByPackage.set(key, current);
    }

    return packages.map((item) =>
      projectTreatmentPackage(
        item,
        itemsByPackage.get(item._id.toHexString()) ?? [],
      ),
    );
  }

  public async assertPackageHasNoEnrollment(
    facilityId: string,
    treatmentPackageId: string,
    session: BillingMongoSession,
  ): Promise<void> {
    const exists = await PackageEnrollmentModel.exists({
      facilityId: toObjectId(facilityId, 'facilityId'),
      treatmentPackageId: toObjectId(
        treatmentPackageId,
        'treatmentPackageId',
      ),
    }).session(session);

    if (exists !== null) {
      throw new BillingChargeRuleViolationError(
        'A package with patient enrollment history cannot be destructively changed',
      );
    }
  }
}