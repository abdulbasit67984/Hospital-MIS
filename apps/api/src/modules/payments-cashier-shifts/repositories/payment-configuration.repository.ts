import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  CashCounterModel,
  DepartmentModel,
  FinancialLedgerAccountModel,
  PaymentMethodConfigurationModel,
  StaffModel,
  UserModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentCashierListQuery,
} from '../payments-cashier-shifts.contracts.js';

import {
  throwMappedPaymentCashierPersistenceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentConfigurationRepositoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashCounterRecord,
  CashCounterUpdate,
  PaymentCashierMongoSession,
  PaymentMethodConfigurationRecord,
  PaymentMethodConfigurationUpdate,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  escapePaymentCashierRegex,
  normalizeNullablePaymentCashierText,
  normalizePaymentCashierCode,
  normalizePaymentCashierText,
  nullablePaymentCashierObjectId,
  paymentCashierDecimal128,
  paymentCashierObjectId,
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

export interface PaymentConfigurationMutationMetadata {
  actorUserId: string;
  transactionId: string;
  correlationId: string;
}

export interface PaymentConfigurationReferenceQueries {
  departmentExists(
    facilityId: string,
    departmentId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<boolean>;

  ledgerAccountsExist(
    facilityId: string,
    ledgerAccountIds: readonly string[],
    session?: PaymentCashierMongoSession,
  ): Promise<boolean>;

  activeUsersExist(
    facilityId: string,
    userIds: readonly string[],
    session?: PaymentCashierMongoSession,
  ): Promise<boolean>;

  activePaymentMethodsExist(
    facilityId: string,
    paymentMethodConfigurationIds: readonly string[],
    currency: string,
    session?: PaymentCashierMongoSession,
  ): Promise<boolean>;

  updatePaymentMethodWithMetadata(
    facilityId: string,
    paymentMethodConfigurationId: string,
    expectedVersion: number,
    update: PaymentMethodConfigurationUpdate,
    metadata: PaymentConfigurationMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord | null>;

  updateCounterWithMetadata(
    facilityId: string,
    counterId: string,
    expectedVersion: number,
    update: CashCounterUpdate,
    metadata: PaymentConfigurationMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord | null>;
}

export type PaymentConfigurationRepository =
  PaymentConfigurationRepositoryPort &
  PaymentConfigurationReferenceQueries;

export class MongoPaymentConfigurationRepository
implements PaymentConfigurationRepository {
  public async findPaymentMethodById(
    facilityId: string,
    paymentMethodConfigurationId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord | null> {
    return record<PaymentMethodConfigurationRecord | null>(
      await withSession(
        PaymentMethodConfigurationModel.findOne({
          _id: toObjectId(
            paymentMethodConfigurationId,
            'paymentMethodConfigurationId',
          ),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findPaymentMethodByCode(
    facilityId: string,
    code: string,
    session?: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord | null> {
    return record<PaymentMethodConfigurationRecord | null>(
      await withSession(
        PaymentMethodConfigurationModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          code: normalizePaymentCashierCode(code),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listPaymentMethods(
    facilityId: string,
    query: PaymentCashierListQuery,
  ) {
    const { page, pageSize, skip } = paymentCashierPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );

    const activeValues = query.status?.flatMap((value) => {
      const normalized = value.trim().toUpperCase();
      return normalized === 'ACTIVE'
        ? [true]
        : normalized === 'INACTIVE'
          ? [false]
          : [];
    });

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(activeValues === undefined || activeValues.length === 0
        ? {}
        : { active: { $in: [...new Set(activeValues)] } }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                code: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
              {
                name: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
            ],
          }),
    };

    const sortField = query.sortBy === 'status'
      ? 'active'
      : query.sortBy === 'number'
        ? 'code'
        : query.sortBy === 'occurredAt'
          ? 'effectiveFrom'
          : 'createdAt';

    const [items, totalItems] = await Promise.all([
      PaymentMethodConfigurationModel.find(filter)
        .sort({ [sortField]: sortDirection(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      PaymentMethodConfigurationModel.countDocuments(filter).exec(),
    ]);

    return paymentCashierPage(
      record<PaymentMethodConfigurationRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createPaymentMethod(
    input: Parameters<PaymentConfigurationRepositoryPort['createPaymentMethod']>[0],
    metadata: Parameters<PaymentConfigurationRepositoryPort['createPaymentMethod']>[1],
    session: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord> {
    try {
      const [created] = await PaymentMethodConfigurationModel.create(
        [
          {
            facilityId: toObjectId(metadata.facilityId, 'facilityId'),
            transactionId: metadata.transactionId,
            correlationId: metadata.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
            updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
            code: normalizePaymentCashierCode(input.code),
            name: normalizePaymentCashierText(input.name),
            description: normalizeNullablePaymentCashierText(input.description),
            methodCode: input.methodCode,
            methodKind: input.methodKind,
            active: true,
            effectiveFrom: new Date(input.effectiveFrom),
            effectiveThrough:
              input.effectiveThrough == null
                ? null
                : new Date(input.effectiveThrough),
            allowedCurrencies: [...input.allowedCurrencies],
            externalReferenceRequired: input.externalReferenceRequired ?? false,
            bankReferenceRequired: input.bankReferenceRequired ?? false,
            cardReferenceRequired: input.cardReferenceRequired ?? false,
            cashEquivalent: input.cashEquivalent ?? false,
            refundEligible: input.refundEligible ?? true,
            reversalEligible: input.reversalEligible ?? true,
            settlementMode: input.settlementMode ?? 'IMMEDIATE',
            settlementDelayHours: input.settlementDelayHours ?? null,
            permissionCodes: [...(input.permissionCodes ?? [])],
            cashLedgerAccountId: nullablePaymentCashierObjectId(
              input.cashLedgerAccountId,
              'cashLedgerAccountId',
            ),
            clearingLedgerAccountId: nullablePaymentCashierObjectId(
              input.clearingLedgerAccountId,
              'clearingLedgerAccountId',
            ),
            receivableLedgerAccountId: nullablePaymentCashierObjectId(
              input.receivableLedgerAccountId,
              'receivableLedgerAccountId',
            ),
            externalProviderCode:
              input.externalProviderCode == null
                ? null
                : normalizePaymentCashierCode(input.externalProviderCode),
            requiresOpenCashierShift: input.requiresOpenCashierShift ?? true,
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          },
        ],
        { session },
      );

      return record<PaymentMethodConfigurationRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async updatePaymentMethod(
    facilityId: string,
    paymentMethodConfigurationId: string,
    expectedVersion: number,
    update: PaymentMethodConfigurationUpdate,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord | null> {
    return this.updatePaymentMethodWithMetadata(
      facilityId,
      paymentMethodConfigurationId,
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

  public async updatePaymentMethodWithMetadata(
    facilityId: string,
    paymentMethodConfigurationId: string,
    expectedVersion: number,
    update: PaymentMethodConfigurationUpdate,
    metadata: PaymentConfigurationMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentMethodConfigurationRecord | null> {
    try {
      const result = await PaymentMethodConfigurationModel.findOneAndUpdate(
        {
          _id: toObjectId(
            paymentMethodConfigurationId,
            'paymentMethodConfigurationId',
          ),
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

      return record<PaymentMethodConfigurationRecord | null>(result);
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async findCounterById(
    facilityId: string,
    counterId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord | null> {
    return record<CashCounterRecord | null>(
      await withSession(
        CashCounterModel.findOne({
          _id: toObjectId(counterId, 'counterId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findCounterByCode(
    facilityId: string,
    counterCode: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord | null> {
    return record<CashCounterRecord | null>(
      await withSession(
        CashCounterModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          counterCode: normalizePaymentCashierCode(counterCode),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listCounters(
    facilityId: string,
    query: PaymentCashierListQuery,
  ) {
    const { page, pageSize, skip } = paymentCashierPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );

    const activeValues = query.status?.flatMap((value) => {
      const normalized = value.trim().toUpperCase();
      return normalized === 'ACTIVE'
        ? [true]
        : normalized === 'INACTIVE'
          ? [false]
          : [];
    });

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(activeValues === undefined || activeValues.length === 0
        ? {}
        : { active: { $in: [...new Set(activeValues)] } }),
      ...(query.cashierUserId === undefined
        ? {}
        : {
            assignedUserIds: toObjectId(
              query.cashierUserId,
              'cashierUserId',
            ),
          }),
      ...(query.paymentMethodConfigurationId === undefined
        ? {}
        : {
            allowedPaymentMethodConfigurationIds: toObjectId(
              query.paymentMethodConfigurationId,
              'paymentMethodConfigurationId',
            ),
          }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                counterCode: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
              {
                name: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
              {
                location: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
            ],
          }),
    };

    const sortField = query.sortBy === 'status'
      ? 'active'
      : query.sortBy === 'number'
        ? 'counterCode'
        : 'createdAt';

    const [items, totalItems] = await Promise.all([
      CashCounterModel.find(filter)
        .sort({ [sortField]: sortDirection(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      CashCounterModel.countDocuments(filter).exec(),
    ]);

    return paymentCashierPage(
      record<CashCounterRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createCounter(
    input: Parameters<PaymentConfigurationRepositoryPort['createCounter']>[0],
    metadata: Parameters<PaymentConfigurationRepositoryPort['createCounter']>[1],
    session: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord> {
    try {
      const [created] = await CashCounterModel.create(
        [
          {
            facilityId: toObjectId(metadata.facilityId, 'facilityId'),
            transactionId: metadata.transactionId,
            correlationId: metadata.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: toObjectId(metadata.actorUserId, 'actorUserId'),
            updatedBy: toObjectId(metadata.actorUserId, 'actorUserId'),
            counterCode: normalizePaymentCashierCode(input.counterCode),
            name: normalizePaymentCashierText(input.name),
            location: normalizePaymentCashierText(input.location),
            departmentId: nullablePaymentCashierObjectId(
              input.departmentId,
              'departmentId',
            ),
            counterType: input.counterType,
            active: true,
            assignedUserIds: (input.assignedUserIds ?? []).map((userId) =>
              paymentCashierObjectId(userId, 'assignedUserIds'),
            ),
            allowedPaymentMethodConfigurationIds:
              input.allowedPaymentMethodConfigurationIds.map((methodId) =>
                paymentCashierObjectId(
                  methodId,
                  'allowedPaymentMethodConfigurationIds',
                ),
              ),
            currency: input.currency ?? 'PKR',
            cashHoldingLimit: paymentCashierDecimal128(
              input.cashHoldingLimit,
              'cashHoldingLimit',
            ),
            openingFloatRequired: input.openingFloatRequired ?? true,
            minimumOpeningFloat: paymentCashierDecimal128(
              input.minimumOpeningFloat ?? '0',
              'minimumOpeningFloat',
            ),
            maximumOpeningFloat: paymentCashierDecimal128(
              input.maximumOpeningFloat ?? '0',
              'maximumOpeningFloat',
            ),
            activeShiftPolicy: input.activeShiftPolicy ?? 'CASHIER_AND_COUNTER',
            supervisorApprovalRequiredForClose:
              input.supervisorApprovalRequiredForClose ?? true,
            negativeExpectedCashAllowed:
              input.negativeExpectedCashAllowed ?? false,
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          },
        ],
        { session },
      );

      return record<CashCounterRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async updateCounter(
    facilityId: string,
    counterId: string,
    expectedVersion: number,
    update: CashCounterUpdate,
    session: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord | null> {
    return this.updateCounterWithMetadata(
      facilityId,
      counterId,
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

  public async updateCounterWithMetadata(
    facilityId: string,
    counterId: string,
    expectedVersion: number,
    update: CashCounterUpdate,
    metadata: PaymentConfigurationMutationMetadata,
    session: PaymentCashierMongoSession,
  ): Promise<CashCounterRecord | null> {
    try {
      const result = await CashCounterModel.findOneAndUpdate(
        {
          _id: toObjectId(counterId, 'counterId'),
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

      return record<CashCounterRecord | null>(result);
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async departmentExists(
    facilityId: string,
    departmentId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<boolean> {
    return (
      (await withSession(
        DepartmentModel.exists({
          _id: toObjectId(departmentId, 'departmentId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: 'ACTIVE',
        }),
        session,
      )) !== null
    );
  }

  public async ledgerAccountsExist(
    facilityId: string,
    ledgerAccountIds: readonly string[],
    session?: PaymentCashierMongoSession,
  ): Promise<boolean> {
    const uniqueIds = [...new Set(ledgerAccountIds)];

    if (uniqueIds.length === 0) {
      return true;
    }

    const query = FinancialLedgerAccountModel.countDocuments({
      _id: {
        $in: uniqueIds.map((id) => toObjectId(id, 'ledgerAccountId')),
      },
      facilityId: toObjectId(facilityId, 'facilityId'),
      active: true,
    });

    const count = await withSession(query, session).exec();
    return count === uniqueIds.length;
  }

  public async activeUsersExist(
    facilityId: string,
    userIds: readonly string[],
    session?: PaymentCashierMongoSession,
  ): Promise<boolean> {
    const uniqueIds = [...new Set(userIds)];

    if (uniqueIds.length === 0) {
      return true;
    }

    const users = record<
      Array<{
        _id: { toHexString(): string };
        staffId: { toHexString(): string } | null;
      }>
    >(
      await withSession(
        UserModel.find({
          _id: {
            $in: uniqueIds.map((id) => toObjectId(id, 'assignedUserId')),
          },
          status: 'ACTIVE',
          staffId: { $type: 'objectId' },
        })
          .select('_id staffId')
          .lean(),
        session,
      ).exec(),
    );

    if (users.length !== uniqueIds.length) {
      return false;
    }

    const staffIds = users.flatMap((user) =>
      user.staffId === null
        ? []
        : [toObjectId(user.staffId.toHexString(), 'staffId')],
    );

    const staffQuery = StaffModel.countDocuments({
      _id: { $in: staffIds },
      facilityId: toObjectId(facilityId, 'facilityId'),
      isActive: true,
      employmentStatus: 'ACTIVE',
    });

    const activeStaffCount = await withSession(staffQuery, session).exec();
    return activeStaffCount === uniqueIds.length;
  }

  public async activePaymentMethodsExist(
    facilityId: string,
    paymentMethodConfigurationIds: readonly string[],
    currency: string,
    session?: PaymentCashierMongoSession,
  ): Promise<boolean> {
    const uniqueIds = [...new Set(paymentMethodConfigurationIds)];

    if (uniqueIds.length === 0) {
      return false;
    }

    const now = new Date();
    const query = PaymentMethodConfigurationModel.countDocuments({
      _id: {
        $in: uniqueIds.map((id) =>
          toObjectId(id, 'paymentMethodConfigurationId'),
        ),
      },
      facilityId: toObjectId(facilityId, 'facilityId'),
      active: true,
      effectiveFrom: { $lte: now },
      $or: [
        { effectiveThrough: null },
        { effectiveThrough: { $gte: now } },
      ],
      allowedCurrencies: currency,
    });

    const count = await withSession(query, session).exec();
    return count === uniqueIds.length;
  }
}