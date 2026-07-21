import {
  type FilterQuery,
  type UpdateQuery,
} from 'mongoose';

import {
  InvoiceLineModel,
  InvoiceModel,
  InvoiceStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  UnifiedBillingInvoiceListQuery,
} from '../unified-billing.contracts.js';

import {
  throwMappedUnifiedBillingPersistenceError,
} from '../unified-billing.errors.js';

import type {
  InvoiceRepositoryPort,
} from '../unified-billing.ports.js';

import type {
  BillingMongoSession,
  InvoiceLineRecord,
  InvoicePersistenceUpdate,
  InvoiceRecord,
  InvoiceStatusHistoryRecord,
} from '../unified-billing.persistence.types.js';

import {
  projectInvoice,
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

export class UnifiedBillingInvoiceRepository
implements InvoiceRepositoryPort {
  public async create(
    input: Parameters<InvoiceRepositoryPort['create']>[0],
    session: BillingMongoSession,
  ): Promise<InvoiceRecord> {
    try {
      const [created] = await InvoiceModel.create(
        [{
          ...input,
          facilityId: toObjectId(input.facilityId, 'facilityId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
        }],
        { session },
      );
      return record<InvoiceRecord>(created.toObject());
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async insertLines(
    records: readonly Omit<InvoiceLineRecord, '_id'>[],
    session: BillingMongoSession,
  ): Promise<InvoiceLineRecord[]> {
    if (records.length === 0) {
      return [];
    }
    try {
      const created = await InvoiceLineModel.insertMany(records, {
        session,
        ordered: true,
      });
      return created.map((item: { toObject(): unknown }) => record<InvoiceLineRecord>(item.toObject()));
    } catch (error) {
      throwMappedUnifiedBillingPersistenceError(error);
    }
  }

  public async findById(
    facilityId: string,
    invoiceId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceRecord | null> {
    return record<InvoiceRecord | null>(
      await withSession(
        InvoiceModel.findOne({
          _id: toObjectId(invoiceId, 'invoiceId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listLines(
    facilityId: string,
    invoiceId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceLineRecord[]> {
    return record<InvoiceLineRecord[]>(
      await withSession(
        InvoiceLineModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          invoiceId: toObjectId(invoiceId, 'invoiceId'),
        }).sort({ lineNumber: 1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async findLineByAccountCharge(
    facilityId: string,
    accountChargeId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceLineRecord | null> {
    return record<InvoiceLineRecord | null>(
      await withSession(
        InvoiceLineModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          accountChargeId: toObjectId(accountChargeId, 'accountChargeId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async update(
    facilityId: string,
    invoiceId: string,
    expectedVersion: number,
    update: InvoicePersistenceUpdate,
    transactionId: string,
    correlationId: string,
    session: BillingMongoSession,
  ): Promise<InvoiceRecord | null> {
    try {
      return record<InvoiceRecord | null>(
        await InvoiceModel.findOneAndUpdate(
          {
            _id: toObjectId(invoiceId, 'invoiceId'),
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

  public async appendStatusHistory(
    input: Parameters<InvoiceRepositoryPort['appendStatusHistory']>[0],
    session: BillingMongoSession,
  ): Promise<InvoiceStatusHistoryRecord> {
    const [created] = await InvoiceStatusHistoryModel.create(
      [{
        ...input,
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
        originalInvoiceId: input.originalInvoiceId === null
          ? null
          : toObjectId(input.originalInvoiceId, 'originalInvoiceId'),
        replacementInvoiceId: input.replacementInvoiceId === null
          ? null
          : toObjectId(input.replacementInvoiceId, 'replacementInvoiceId'),
        changedBy: toObjectId(input.changedBy, 'changedBy'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        updatedBy: toObjectId(input.updatedBy, 'updatedBy'),
      }],
      { session },
    );
    return record<InvoiceStatusHistoryRecord>(created.toObject());
  }

  public async listRecordsForAccount(
    facilityId: string,
    patientAccountId: string,
    session?: BillingMongoSession,
  ): Promise<InvoiceRecord[]> {
    return record<InvoiceRecord[]>(
      await withSession(
        InvoiceModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          patientAccountId: toObjectId(patientAccountId, 'patientAccountId'),
        }).sort({ createdAt: 1 }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: UnifiedBillingInvoiceListQuery,
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
      ...(query.invoiceType === undefined || query.invoiceType.length === 0
        ? {}
        : { invoiceType: { $in: query.invoiceType } }),
      ...(query.outstandingOnly === true
        ? { outstandingAmount: { $gt: 0 } }
        : {}),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : { invoiceNumber: { $regex: escapeBillingRegex(query.search), $options: 'i' } }),
    };
    const [invoiceRecords, totalItems] = await Promise.all([
      InvoiceModel.find(filter)
        .sort({ [query.sortBy ?? 'updatedAt']: direction(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      InvoiceModel.countDocuments(filter).exec(),
    ]);
    const records = record<InvoiceRecord[]>(invoiceRecords);
    const linesByInvoice = new Map<string, InvoiceLineRecord[]>();
    if (records.length > 0) {
      const lines = record<InvoiceLineRecord[]>(
        await InvoiceLineModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          invoiceId: { $in: records.map((item) => item._id) },
        }).sort({ invoiceId: 1, lineNumber: 1 }).lean().exec(),
      );
      for (const line of lines) {
        const key = line.invoiceId.toString();
        const current = linesByInvoice.get(key) ?? [];
        current.push(line);
        linesByInvoice.set(key, current);
      }
    }
    return billingPage(
      records.map((item) => projectInvoice(
        item,
        linesByInvoice.get(item._id.toString()) ?? [],
      )),
      page,
      pageSize,
      totalItems,
    );
  }
}