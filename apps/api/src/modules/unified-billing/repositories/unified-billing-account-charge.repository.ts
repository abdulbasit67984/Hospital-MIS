import {
  type FilterQuery,
  type PipelineStage,
  type UpdateQuery,
} from 'mongoose';

import {
  AccountChargeHistoryModel,
  AccountChargeModel,
  InvoiceLineModel,
  PatientAccountModel,
  PatientAccountStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  UnifiedBillingAccountListQuery,
  UnifiedBillingChargeListQuery,
} from '../unified-billing.contracts.js';

import {
  throwMappedUnifiedBillingPersistenceError,
} from '../unified-billing.errors.js';

import type {
  AccountChargeRepositoryPort,
  PatientAccountRepositoryPort,
} from '../unified-billing.ports.js';

import type {
  AccountChargeHistoryRecord,
  AccountChargePersistenceUpdate,
  AccountChargeRecord,
  BillingMongoSession,
  PatientAccountPersistenceUpdate,
  PatientAccountRecord,
  PatientAccountStatusHistoryRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectAccountCharge,
  projectPatientAccount,
} from '../unified-billing.projections.js';

import {
  billingPage,
  billingPagination,
  escapeBillingRegex,
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

function direction(value: 'asc' | 'desc' | undefined): 1 | -1 {
  return value === 'asc' ? 1 : -1;
}

export class UnifiedBillingPatientAccountRepository
implements PatientAccountRepositoryPort {
  public async create(
    input: Parameters<PatientAccountRepositoryPort['create']>[0],
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord> {
    try {
      const [created] = await PatientAccountModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          patientId: toObjectId(input.patientId.toString(), 'patientId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );
      return record<PatientAccountRecord>(created.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<PatientAccountRecord | null> {
    return record<PatientAccountRecord | null>(
      await withSession(
        PatientAccountModel.findOne({
          _id: toObjectId(patientAccountId, 'patientAccountId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findOpenForSource(
    facilityId: string,
    source: Parameters<PatientAccountRepositoryPort['findOpenForSource']>[1],
    session?: BillingMongoSession,
  ): Promise<PatientAccountRecord | null> {
    const sourceField = source.admissionId !== null
      ? { admissionId: toObjectId(source.admissionId, 'admissionId') }
      : source.encounterId !== null
        ? { encounterId: toObjectId(source.encounterId, 'encounterId') }
        : source.opdVisitId !== null
          ? { opdVisitId: toObjectId(source.opdVisitId, 'opdVisitId') }
          : source.registrationId !== null
            ? { registrationId: toObjectId(source.registrationId, 'registrationId') }
            : { patientId: toObjectId(source.patient.patientId, 'patientId') };

    return record<PatientAccountRecord | null>(
      await withSession(
        PatientAccountModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...sourceField,
          status: { $in: ['OPEN', 'SUSPENDED'] },
        }).sort({ createdAt: -1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async update(
    facilityId: string,
    patientAccountId: string,
    expectedVersion: number,
    update: PatientAccountPersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<PatientAccountRecord | null> {
    try {
      return record<PatientAccountRecord | null>(
        await PatientAccountModel.findOneAndUpdate(
          {
            _id: toObjectId(patientAccountId, 'patientAccountId'),
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
        ).lean().exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async appendStatusHistory(
    input: Parameters<PatientAccountRepositoryPort['appendStatusHistory']>[0],
    session: BillingMongoSession,
  ): Promise<PatientAccountStatusHistoryRecord> {
    const [created] = await PatientAccountStatusHistoryModel.create(
      [{
        ...input,
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        patientAccountId: toObjectId(input.patientAccountId, 'patientAccountId'),
        changedBy: toObjectId(input.changedBy, 'changedBy'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
      }],
      { session },
    );
    return record<PatientAccountStatusHistoryRecord>(created.toObject());
  }

  public async list(
    facilityId: string,
    query: UnifiedBillingAccountListQuery,
  ) {
    const { page, pageSize, skip } = billingPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.status === undefined || query.status.length === 0
        ? {}
        : { status: { $in: query.status } }),
      ...(query.accountType === undefined || query.accountType.length === 0
        ? {}
        : { accountType: { $in: query.accountType } }),
      ...(query.search === undefined
        ? {}
        : { accountNumber: { $regex: escapeBillingRegex(query.search), $options: 'i' } }),
    };
    const [items, totalItems] = await Promise.all([
      PatientAccountModel.find(filter)
        .sort({ [query.sortBy ?? 'updatedAt']: direction(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      PatientAccountModel.countDocuments(filter).exec(),
    ]);
    return billingPage(
      record<PatientAccountRecord[]>(items).map(projectPatientAccount),
      page,
      pageSize,
      totalItems,
    );
  }
}

export class UnifiedBillingAccountChargeRepository
implements AccountChargeRepositoryPort {
  public async create(
    input: Parameters<AccountChargeRepositoryPort['create']>[0],
    session: BillingMongoSession,
  ): Promise<AccountChargeRecord> {
    try {
      const [created] = await AccountChargeModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );
      return record<AccountChargeRecord>(created.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    accountChargeId: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null> {
    return record<AccountChargeRecord | null>(
      await withSession(
        AccountChargeModel.findOne({
          _id: toObjectId(accountChargeId, 'accountChargeId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findByOperationKey(
    facilityId: string,
    operationKey: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null> {
    return record<AccountChargeRecord | null>(
      await withSession(
        AccountChargeModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          operationKey,
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findByDeterministicKey(
    facilityId: string,
    deterministicChargeKey: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord | null> {
    return record<AccountChargeRecord | null>(
      await withSession(
        AccountChargeModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          deterministicChargeKey,
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async update(
    facilityId: string,
    accountChargeId: string,
    expectedVersion: number,
    update: AccountChargePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<AccountChargeRecord | null> {
    try {
      return record<AccountChargeRecord | null>(
        await AccountChargeModel.findOneAndUpdate(
          {
            _id: toObjectId(accountChargeId, 'accountChargeId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
          },
          {
            $set: { ...update, transactionId, correlationId },
            $inc: { version: 1 },
          } satisfies UpdateQuery<unknown>,
          { new: true, session, runValidators: true },
        ).lean().exec(),
      );
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async appendHistory(
    input: Parameters<AccountChargeRepositoryPort['appendHistory']>[0],
    session: BillingMongoSession,
  ): Promise<AccountChargeHistoryRecord> {
    const [created] = await AccountChargeHistoryModel.create(
      [{
        ...input,
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        accountChargeId: toObjectId(input.accountChargeId, 'accountChargeId'),
        originalChargeId: input.originalChargeId === null
          ? null
          : toObjectId(input.originalChargeId, 'originalChargeId'),
        replacementChargeId: input.replacementChargeId === null
          ? null
          : toObjectId(input.replacementChargeId, 'replacementChargeId'),
        approvalRequestId: input.approvalRequestId === null
          ? null
          : toObjectId(input.approvalRequestId, 'approvalRequestId'),
        changedBy: toObjectId(input.changedBy, 'changedBy'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
      }],
      { session },
    );
    return record<AccountChargeHistoryRecord>(created.toObject());
  }

  public async listRecordsForAccount(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord[]> {
    return record<AccountChargeRecord[]>(
      await withSession(
        AccountChargeModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          patientAccountId: toObjectId(patientAccountId, 'patientAccountId'),
        }).sort({ serviceFrom: 1, createdAt: 1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async listPostedUninvoiced(
    facilityId: string,
    patientAccountId: string,
    chargeIds: readonly string[] | undefined,
    session?: BillingMongoSession,
  ): Promise<AccountChargeRecord[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          facilityId: toObjectId(facilityId, 'facilityId'),
          patientAccountId: toObjectId(patientAccountId, 'patientAccountId'),
          status: 'POSTED',
          ...(chargeIds === undefined || chargeIds.length === 0
            ? {}
            : { _id: { $in: chargeIds.map((id) => toObjectId(id, 'chargeId')) } }),
        },
      },
      {
        $lookup: {
          from: InvoiceLineModel.collection.name,
          let: { chargeId: '$_id', facility: '$facilityId' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$accountChargeId', '$$chargeId'] },
              { $eq: ['$facilityId', '$$facility'] },
            ] } } },
            { $limit: 1 },
          ],
          as: 'invoiceLinks',
        },
      },
      { $match: { invoiceLinks: { $size: 0 } } },
      { $unset: 'invoiceLinks' },
      { $sort: { serviceFrom: 1, createdAt: 1 } },
    ];
    const aggregate = AccountChargeModel.aggregate(pipeline);
    if (session !== undefined) {
      aggregate.session(session);
    }
    return record<AccountChargeRecord[]>(await aggregate.exec());
  }

  public async list(
    facilityId: string,
    query: UnifiedBillingChargeListQuery,
    includeCost: boolean,
  ) {
    const { page, pageSize, skip } = billingPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );
    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.patientAccountId === undefined
        ? {}
        : { patientAccountId: toObjectId(query.patientAccountId, 'patientAccountId') }),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.status === undefined || query.status.length === 0
        ? {}
        : { status: { $in: query.status } }),
      ...(query.sourceModule === undefined || query.sourceModule.length === 0
        ? {}
        : { 'source.sourceModule': { $in: query.sourceModule } }),
      ...(query.search === undefined
        ? {}
        : { $or: [
            { chargeCodeSnapshot: { $regex: escapeBillingRegex(query.search), $options: 'i' } },
            { chargeNameSnapshot: { $regex: escapeBillingRegex(query.search), $options: 'i' } },
          ] }),
    };
    const [items, totalItems] = await Promise.all([
      AccountChargeModel.find(filter)
        .sort({ [query.sortBy ?? 'serviceFrom']: direction(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      AccountChargeModel.countDocuments(filter).exec(),
    ]);
    return billingPage(
      record<AccountChargeRecord[]>(items).map((item) => projectAccountCharge(item, includeCost)),
      page,
      pageSize,
      totalItems,
    );
  }
}