import {
  Types,
  type FilterQuery,
  type UpdateQuery,
} from 'mongoose';

import {
  CreditNoteModel,
  FinancialApprovalRequestModel,
  PaymentReversalModel,
  RefundModel,
  RefundRequestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreatePaymentReversalInput,
  CreateRefundRequestInput,
  PaymentCashierListQuery,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentCashierConcurrencyError,
  throwMappedPaymentCashierPersistenceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  FinancialApprovalRecord,
  PaymentCashierMongoSession,
  PaymentReversalRecord,
  RefundRecord,
  RefundRequestRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  escapePaymentCashierRegex,
  normalizeNullablePaymentCashierText,
  normalizePaymentCashierCode,
  normalizePaymentCashierText,
  nullablePaymentCashierObjectId,
  paymentCashierDecimal128,
  paymentCashierPage,
  paymentCashierPagination,
} from '../payments-cashier-shifts.normalization.js';

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function withSession<
  T extends {
    session(
      session:
        PaymentCashierMongoSession,
    ): T;
  },
>(
  query: T,
  session?:
    PaymentCashierMongoSession,
): T {
  return session === undefined
    ? query
    : query.session(
        session,
      );
}

function sortDirection(
  value:
    | 'asc'
    | 'desc'
    | undefined,
): 1 | -1 {
  return value === 'asc'
    ? 1
    : -1;
}

export interface CreditNoteRefundSourceRecord {
  _id:
    Types.ObjectId;
  facilityId:
    Types.ObjectId;
  patientAccountId:
    Types.ObjectId;
  patientId:
    Types.ObjectId;
  amount:
    Types.Decimal128;
  currency:
    string;
  status:
    string;
  version:
    number;
}

export interface CreateRefundRequestPrepared {
  operationKey:
    string;
  requestNumber:
    string;
  approvalOperationKey:
    string;
  approvalRequestNumber:
    string;
  patientId:
    string;
  currency:
    string;
  actorUserId:
    string;
  requestedAt:
    Date;
  transactionId:
    string;
  correlationId:
    string;
}

export interface CreatePaymentReversalPrepared {
  operationKey:
    string;
  reversalNumber:
    string;
  approvalOperationKey:
    string;
  approvalRequestNumber:
    string;
  patientAccountId:
    string;
  actorUserId:
    string;
  requestedAt:
    Date;
  transactionId:
    string;
  correlationId:
    string;
}

export interface RefundReversalControlRepositoryPort {
  findRefundRequestById(
    facilityId: string,
    requestId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord | null>;

  listRefundRequests(
    facilityId: string,
    query: PaymentCashierListQuery,
  ): Promise<Readonly<{
    items: readonly RefundRequestRecord[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }>>;

  createRefundRequestWithApproval(
    facilityId: string,
    input: CreateRefundRequestInput,
    prepared: CreateRefundRequestPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord>;

  decideRefundRequest(
    facilityId: string,
    requestId: string,
    expectedVersion: number,
    approvalRequestId: string,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord>;

  updateRefundRequest(
    facilityId: string,
    requestId: string,
    expectedVersion: number,
    update: Partial<RefundRequestRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord | null>;

  findRefundById(
    facilityId: string,
    refundId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<RefundRecord | null>;

  createRefund(
    recordInput: Omit<
      RefundRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRecord>;

  updateRefund(
    facilityId: string,
    refundId: string,
    expectedVersion: number,
    update: Partial<RefundRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRecord | null>;

  findReversalById(
    facilityId: string,
    reversalId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord | null>;

  createPaymentReversalWithApproval(
    facilityId: string,
    input: CreatePaymentReversalInput,
    prepared: CreatePaymentReversalPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord>;

  decidePaymentReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    approvalRequestId: string,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord>;

  updateReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    update: Partial<PaymentReversalRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord | null>;

  findApprovalById(
    facilityId: string,
    approvalRequestId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord | null>;

  findPostedCreditNote(
    facilityId: string,
    creditNoteId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CreditNoteRefundSourceRecord | null>;

  sumPostedCreditNoteRefunds(
    facilityId: string,
    creditNoteId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<string>;
}

export class MongoRefundReversalRepository
implements RefundReversalControlRepositoryPort {
  public async findRefundRequestById(
    facilityId: string,
    requestId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord | null> {
    return record<RefundRequestRecord | null>(
      await withSession(
        RefundRequestModel.findOne({
          _id: toObjectId(requestId, 'requestId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listRefundRequests(
    facilityId: string,
    query: PaymentCashierListQuery,
  ) {
    const {
      page,
      pageSize,
      skip,
    } = paymentCashierPagination(
      query.page ?? 1,
      query.pageSize ?? 25,
    );

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.patientAccountId === undefined
        ? {}
        : {
            patientAccountId: toObjectId(
              query.patientAccountId,
              'patientAccountId',
            ),
          }),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId: toObjectId(query.patientId, 'patientId'),
          }),
      ...(query.status === undefined || query.status.length === 0
        ? {}
        : {
            status: {
              $in: query.status,
            },
          }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined
                ? {}
                : {
                    $gte: new Date(query.from),
                  }),
              ...(query.to === undefined
                ? {}
                : {
                    $lte: new Date(query.to),
                  }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                requestNumber: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
              {
                reasonCode: {
                  $regex: escapePaymentCashierRegex(query.search),
                  $options: 'i',
                },
              },
            ],
          }),
    };

    const sortField = query.sortBy === 'number'
      ? 'requestNumber'
      : query.sortBy === 'amount'
        ? 'amount'
        : query.sortBy === 'status'
          ? 'status'
          : 'createdAt';

    const [items, totalItems] = await Promise.all([
      RefundRequestModel.find(filter)
        .sort({
          [sortField]: sortDirection(query.sortDirection),
        })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      RefundRequestModel.countDocuments(filter).exec(),
    ]);

    return paymentCashierPage(
      record<RefundRequestRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createRefundRequestWithApproval(
    facilityId: string,
    input: CreateRefundRequestInput,
    prepared: CreateRefundRequestPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord> {
    try {
      const requestId = new Types.ObjectId();
      const approvalId = new Types.ObjectId();
      const actorId = toObjectId(prepared.actorUserId, 'actorUserId');
      const facilityObjectId = toObjectId(facilityId, 'facilityId');

      await FinancialApprovalRequestModel.create(
        [
          {
            _id: approvalId,
            facilityId: facilityObjectId,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
            requestNumber: normalizePaymentCashierCode(
              prepared.approvalRequestNumber,
            ),
            operationKey: prepared.approvalOperationKey,
            approvalType: 'REFUND',
            entityType: 'REFUND_REQUEST',
            entityId: requestId,
            patientAccountId: toObjectId(
              input.patientAccountId,
              'patientAccountId',
            ),
            amount: paymentCashierDecimal128(input.amount, 'amount'),
            thresholdAmountSnapshot: paymentCashierDecimal128(
              input.amount,
              'thresholdAmountSnapshot',
            ),
            requestedBy: actorId,
            requestedAt: prepared.requestedAt,
            reason: normalizePaymentCashierText(input.reason),
            status: 'PENDING',
            decidedBy: null,
            decidedAt: null,
            decisionReason: null,
            expiresAt: null,
            makerCheckerSatisfied: false,
          },
        ],
        { session },
      );

      const [created] = await RefundRequestModel.create(
        [
          {
            _id: requestId,
            facilityId: facilityObjectId,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
            requestNumber: normalizePaymentCashierCode(
              prepared.requestNumber,
            ),
            operationKey: prepared.operationKey,
            patientAccountId: toObjectId(
              input.patientAccountId,
              'patientAccountId',
            ),
            patientId: toObjectId(prepared.patientId, 'patientId'),
            paymentId: nullablePaymentCashierObjectId(
              input.paymentId,
              'paymentId',
            ),
            depositId: nullablePaymentCashierObjectId(
              input.depositId,
              'depositId',
            ),
            creditNoteId: nullablePaymentCashierObjectId(
              input.creditNoteId,
              'creditNoteId',
            ),
            amount: paymentCashierDecimal128(input.amount, 'amount'),
            currency: normalizePaymentCashierCode(prepared.currency),
            reasonCode: normalizePaymentCashierCode(input.reasonCode),
            reason: normalizePaymentCashierText(input.reason),
            supportingReference: normalizeNullablePaymentCashierText(
              input.supportingReference,
            ),
            approvalRequestId: approvalId,
            status: 'PENDING',
            completedRefundId: null,
          },
        ],
        { session },
      );

      return record<RefundRequestRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async decideRefundRequest(
    facilityId: string,
    requestId: string,
    expectedVersion: number,
    approvalRequestId: string,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord> {
    const checkerId = toObjectId(checkerUserId, 'checkerUserId');
    const facilityObjectId = toObjectId(facilityId, 'facilityId');
    const requestObjectId = toObjectId(requestId, 'requestId');
    const approvalObjectId = toObjectId(
      approvalRequestId,
      'approvalRequestId',
    );
    const normalizedReason = normalizePaymentCashierText(decisionReason);

    const approval = await FinancialApprovalRequestModel.findOneAndUpdate(
      {
        _id: approvalObjectId,
        facilityId: facilityObjectId,
        entityId: requestObjectId,
        approvalType: 'REFUND',
        status: 'PENDING',
        requestedBy: { $ne: checkerId },
      },
      {
        $set: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedBy: checkerId,
          decidedAt,
          decisionReason: normalizedReason,
          makerCheckerSatisfied: true,
          updatedBy: checkerId,
          transactionId,
          correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (approval === null) {
      throw new PaymentCashierConcurrencyError(
        'The refund approval is no longer pending or violates maker-checker rules',
      );
    }

    const request = await RefundRequestModel.findOneAndUpdate(
      {
        _id: requestObjectId,
        facilityId: facilityObjectId,
        approvalRequestId: approvalObjectId,
        status: 'PENDING',
        version: expectedVersion,
      },
      {
        $set: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          updatedBy: checkerId,
          transactionId,
          correlationId,
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

    if (request === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return record<RefundRequestRecord>(request);
  }

  public async updateRefundRequest(
    facilityId: string,
    requestId: string,
    expectedVersion: number,
    update: Partial<RefundRequestRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRequestRecord | null> {
    try {
      return record<RefundRequestRecord | null>(
        await RefundRequestModel.findOneAndUpdate(
          {
            _id: toObjectId(requestId, 'requestId'),
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

  public async findRefundById(
    facilityId: string,
    refundId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<RefundRecord | null> {
    return record<RefundRecord | null>(
      await withSession(
        RefundModel.findOne({
          _id: toObjectId(refundId, 'refundId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).select('+externalReference +failureMessage').lean(),
        session,
      ).exec(),
    );
  }

  public async createRefund(
    recordInput: Omit<
      RefundRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRecord> {
    try {
      const [created] = await RefundModel.create([recordInput], { session });
      return record<RefundRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async updateRefund(
    facilityId: string,
    refundId: string,
    expectedVersion: number,
    update: Partial<RefundRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<RefundRecord | null> {
    try {
      return record<RefundRecord | null>(
        await RefundModel.findOneAndUpdate(
          {
            _id: toObjectId(refundId, 'refundId'),
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
          .select('+externalReference +failureMessage')
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async findReversalById(
    facilityId: string,
    reversalId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord | null> {
    return record<PaymentReversalRecord | null>(
      await withSession(
        PaymentReversalModel.findOne({
          _id: toObjectId(reversalId, 'reversalId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async createPaymentReversalWithApproval(
    facilityId: string,
    input: CreatePaymentReversalInput,
    prepared: CreatePaymentReversalPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord> {
    try {
      const reversalId = new Types.ObjectId();
      const approvalId = new Types.ObjectId();
      const actorId = toObjectId(prepared.actorUserId, 'actorUserId');
      const facilityObjectId = toObjectId(facilityId, 'facilityId');

      await FinancialApprovalRequestModel.create(
        [
          {
            _id: approvalId,
            facilityId: facilityObjectId,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
            requestNumber: normalizePaymentCashierCode(
              prepared.approvalRequestNumber,
            ),
            operationKey: prepared.approvalOperationKey,
            approvalType: 'PAYMENT_REVERSAL',
            entityType: 'PAYMENT_REVERSAL',
            entityId: reversalId,
            patientAccountId: toObjectId(
              prepared.patientAccountId,
              'patientAccountId',
            ),
            amount: paymentCashierDecimal128(input.amount, 'amount'),
            thresholdAmountSnapshot: paymentCashierDecimal128(
              input.amount,
              'thresholdAmountSnapshot',
            ),
            requestedBy: actorId,
            requestedAt: prepared.requestedAt,
            reason: normalizePaymentCashierText(input.reason),
            status: 'PENDING',
            decidedBy: null,
            decidedAt: null,
            decisionReason: null,
            expiresAt: null,
            makerCheckerSatisfied: false,
          },
        ],
        { session },
      );

      const [created] = await PaymentReversalModel.create(
        [
          {
            _id: reversalId,
            facilityId: facilityObjectId,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
            operationKey: prepared.operationKey,
            reversalNumber: normalizePaymentCashierCode(
              prepared.reversalNumber,
            ),
            paymentId: toObjectId(input.paymentId, 'paymentId'),
            patientAccountId: toObjectId(
              prepared.patientAccountId,
              'patientAccountId',
            ),
            amount: paymentCashierDecimal128(input.amount, 'amount'),
            reasonCode: normalizePaymentCashierCode(input.reasonCode),
            reason: normalizePaymentCashierText(input.reason),
            replacementPaymentId: nullablePaymentCashierObjectId(
              input.replacementPaymentId,
              'replacementPaymentId',
            ),
            approvalRequestId: approvalId,
            status: 'REQUESTED',
            cashCounterId: null,
            cashShiftId: null,
            cashierUserId: null,
            postedAt: null,
            postedBy: null,
            failureCode: null,
          },
        ],
        { session },
      );

      return record<PaymentReversalRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async decidePaymentReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    approvalRequestId: string,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord> {
    const checkerId = toObjectId(checkerUserId, 'checkerUserId');
    const facilityObjectId = toObjectId(facilityId, 'facilityId');
    const reversalObjectId = toObjectId(reversalId, 'reversalId');
    const approvalObjectId = toObjectId(
      approvalRequestId,
      'approvalRequestId',
    );
    const normalizedReason = normalizePaymentCashierText(decisionReason);

    const approval = await FinancialApprovalRequestModel.findOneAndUpdate(
      {
        _id: approvalObjectId,
        facilityId: facilityObjectId,
        entityId: reversalObjectId,
        approvalType: 'PAYMENT_REVERSAL',
        status: 'PENDING',
        requestedBy: { $ne: checkerId },
      },
      {
        $set: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedBy: checkerId,
          decidedAt,
          decisionReason: normalizedReason,
          makerCheckerSatisfied: true,
          updatedBy: checkerId,
          transactionId,
          correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (approval === null) {
      throw new PaymentCashierConcurrencyError(
        'The reversal approval is no longer pending or violates maker-checker rules',
      );
    }

    const reversal = await PaymentReversalModel.findOneAndUpdate(
      {
        _id: reversalObjectId,
        facilityId: facilityObjectId,
        approvalRequestId: approvalObjectId,
        status: 'REQUESTED',
        version: expectedVersion,
      },
      {
        $set: {
          status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          updatedBy: checkerId,
          transactionId,
          correlationId,
        },
        $inc: { version: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      },
    )
      .lean()
      .exec();

    if (reversal === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return record<PaymentReversalRecord>(reversal);
  }

  public async updateReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    update: Partial<PaymentReversalRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentReversalRecord | null> {
    try {
      return record<PaymentReversalRecord | null>(
        await PaymentReversalModel.findOneAndUpdate(
          {
            _id: toObjectId(reversalId, 'reversalId'),
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

  public async findApprovalById(
    facilityId: string,
    approvalRequestId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord | null> {
    return record<FinancialApprovalRecord | null>(
      await withSession(
        FinancialApprovalRequestModel.findOne({
          _id: toObjectId(approvalRequestId, 'approvalRequestId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findPostedCreditNote(
    facilityId: string,
    creditNoteId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CreditNoteRefundSourceRecord | null> {
    return record<CreditNoteRefundSourceRecord | null>(
      await withSession(
        CreditNoteModel.findOne({
          _id: toObjectId(creditNoteId, 'creditNoteId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          status: 'POSTED',
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async sumPostedCreditNoteRefunds(
    facilityId: string,
    creditNoteId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<string> {
    const query = RefundModel.aggregate<{
      total: Types.Decimal128;
    }>([
      {
        $match: {
          facilityId: toObjectId(facilityId, 'facilityId'),
          creditNoteId: toObjectId(creditNoteId, 'creditNoteId'),
          status: 'POSTED',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    if (session !== undefined) {
      query.session(session);
    }

    const [result] = await query.exec();
    return result?.total.toString() ?? '0';
  }
}