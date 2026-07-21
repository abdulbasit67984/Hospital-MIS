import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  CashShiftModel,
  ShiftReconciliationModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierListQuery,
} from '../payments-cashier-shifts.contracts.js';

import {
  throwMappedPaymentCashierPersistenceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  CashierShiftRepositoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashierShiftRecord,
  CashierShiftUpdate,
  PaymentCashierMongoSession,
  ShiftReconciliationRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  escapePaymentCashierRegex,
  paymentCashierPage,
  paymentCashierPagination,
} from '../payments-cashier-shifts.normalization.js';

function record<T>(value: unknown): T {
  return value as T;
}

function withSession<
  T extends {
    session(session: PaymentCashierMongoSession): T;
  },
>(
  query: T,
  session?: PaymentCashierMongoSession,
): T {
  return session === undefined ? query : query.session(session);
}

function sortDirection(
  value: 'asc' | 'desc' | undefined,
): 1 | -1 {
  return value === 'asc' ? 1 : -1;
}

const activeShiftStatuses = [
  'OPEN',
  'SUSPENDED',
  'CLOSING_IN_PROGRESS',
] as const;

export interface CashierShiftMutationMetadata {
  actorUserId: string;
  transactionId: string;
  correlationId: string;
}

export interface CashierShiftExtendedRepositoryPort
extends CashierShiftRepositoryPort {
  updateWithMetadata(
    facilityId: string,
    shiftId: string,
    expectedVersion: number,
    update: CashierShiftUpdate,
    metadata: CashierShiftMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord | null>;

  countActiveForCounter(
    facilityId: string,
    counterId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<number>;

  countActiveForCashier(
    facilityId: string,
    cashierUserId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<number>;
}

export class MongoCashierShiftRepository
implements CashierShiftExtendedRepositoryPort {
  public async findById(
    facilityId: string,
    shiftId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord | null> {
    return record<CashierShiftRecord | null>(
      await withSession(
        CashShiftModel.findOne({
          _id: toObjectId(shiftId, 'shiftId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findActiveForPolicy(
    facilityId: string,
    counterId: string,
    cashierUserId: string,
    policy: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord | null> {
    const scope = policy === 'CASHIER'
      ? {
          cashierUserId: toObjectId(cashierUserId, 'cashierUserId'),
        }
      : policy === 'COUNTER'
        ? {
            cashCounterId: toObjectId(counterId, 'counterId'),
          }
        : {
            cashCounterId: toObjectId(counterId, 'counterId'),
            cashierUserId: toObjectId(cashierUserId, 'cashierUserId'),
          };

    return record<CashierShiftRecord | null>(
      await withSession(
        CashShiftModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          ...scope,
          status: { $in: activeShiftStatuses },
        })
          .sort({ openedAt: -1 })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: PaymentCashierListQuery,
  ) {
    const { page, pageSize, skip } = paymentCashierPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.counterId === undefined
        ? {}
        : { cashCounterId: toObjectId(query.counterId, 'counterId') }),
      ...(query.cashierUserId === undefined
        ? {}
        : {
            cashierUserId: toObjectId(
              query.cashierUserId,
              'cashierUserId',
            ),
          }),
      ...(query.status === undefined || query.status.length === 0
        ? {}
        : { status: { $in: query.status } }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            openedAt: {
              ...(query.from === undefined ? {} : { $gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { $lte: new Date(query.to) }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            shiftNumber: {
              $regex: escapePaymentCashierRegex(query.search),
              $options: 'i',
            },
          }),
    };

    const sortField = query.sortBy === 'number'
      ? 'shiftNumber'
      : query.sortBy === 'status'
        ? 'status'
        : query.sortBy === 'occurredAt'
          ? 'openedAt'
          : query.sortBy === 'amount'
            ? 'expectedCash'
            : 'createdAt';

    const [items, totalItems] = await Promise.all([
      CashShiftModel.find(filter)
        .sort({ [sortField]: sortDirection(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      CashShiftModel.countDocuments(filter).exec(),
    ]);

    return paymentCashierPage(
      record<CashierShiftRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async create(
    input: Omit<CashierShiftRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord> {
    try {
      const [created] = await CashShiftModel.create([input], { session });
      return record<CashierShiftRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async update(
    facilityId: string,
    shiftId: string,
    expectedVersion: number,
    update: CashierShiftUpdate,
    session: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord | null> {
    return this.updateWithMetadata(
      facilityId,
      shiftId,
      expectedVersion,
      update,
      {
        actorUserId: update.updatedBy?.toHexString() ?? '',
        transactionId: '',
        correlationId: '',
      },
      session,
    );
  }

  public async updateWithMetadata(
    facilityId: string,
    shiftId: string,
    expectedVersion: number,
    update: CashierShiftUpdate,
    metadata: CashierShiftMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<CashierShiftRecord | null> {
    try {
      const result = await CashShiftModel.findOneAndUpdate(
        {
          _id: toObjectId(shiftId, 'shiftId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          $set: {
            ...update,
            ...(metadata.actorUserId.length === 0
              ? {}
              : { updatedBy: toObjectId(metadata.actorUserId, 'actorUserId') }),
            ...(metadata.transactionId.length === 0
              ? {}
              : { transactionId: metadata.transactionId }),
            ...(metadata.correlationId.length === 0
              ? {}
              : { correlationId: metadata.correlationId }),
          },
          $inc: { version: 1 },
        } satisfies UpdateQuery<unknown>,
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .lean()
        .exec();

      return record<CashierShiftRecord | null>(result);
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async createReconciliation(
    input: Omit<
      ShiftReconciliationRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PaymentCashierMongoSession,
  ): Promise<ShiftReconciliationRecord> {
    try {
      const [created] = await ShiftReconciliationModel.create([input], {
        session,
      });
      return record<ShiftReconciliationRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async findReconciliationByShift(
    facilityId: string,
    shiftId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<ShiftReconciliationRecord | null> {
    return record<ShiftReconciliationRecord | null>(
      await withSession(
        ShiftReconciliationModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          cashShiftId: toObjectId(shiftId, 'shiftId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async updateReconciliation(
    facilityId: string,
    reconciliationId: string,
    expectedVersion: number,
    update: Partial<ShiftReconciliationRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<ShiftReconciliationRecord | null> {
    try {
      return record<ShiftReconciliationRecord | null>(
        await ShiftReconciliationModel.findOneAndUpdate(
          {
            _id: toObjectId(reconciliationId, 'reconciliationId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
            version: expectedVersion,
          },
          {
            $set: update,
            $inc: { version: 1 },
          } satisfies UpdateQuery<unknown>,
          {
            new: true,
            session,
            runValidators: true,
          },
        )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async countActiveForCounter(
    facilityId: string,
    counterId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<number> {
    const query = CashShiftModel.countDocuments({
      facilityId: toObjectId(facilityId, 'facilityId'),
      cashCounterId: toObjectId(counterId, 'counterId'),
      status: { $in: activeShiftStatuses },
    });

    return withSession(query, session).exec();
  }

  public async countActiveForCashier(
    facilityId: string,
    cashierUserId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<number> {
    const query = CashShiftModel.countDocuments({
      facilityId: toObjectId(facilityId, 'facilityId'),
      cashierUserId: toObjectId(cashierUserId, 'cashierUserId'),
      status: { $in: activeShiftStatuses },
    });

    return withSession(query, session).exec();
  }
}