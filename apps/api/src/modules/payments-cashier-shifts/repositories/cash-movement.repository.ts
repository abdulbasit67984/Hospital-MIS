import {
  Types,
  type FilterQuery,
  type UpdateQuery,
} from 'mongoose';

import {
  CashMovementModel,
  FinancialApprovalRequestModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  CreateCashMovementInput,
  PaymentCashierListQuery,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentCashierConcurrencyError,
  throwMappedPaymentCashierPersistenceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  CashMovementRecord,
  FinancialApprovalRecord,
  PaymentCashierMongoSession,
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

export interface CreateCashMovementPrepared {
  operationKey: string;
  movementNumber: string;
  approvalOperationKey: string;
  approvalRequestNumber: string;
  expectedCashEffect: string;
  requiresApproval: boolean;
  actorUserId: string;
  requestedAt: Date;
  transactionId: string;
  correlationId: string;
}

export interface CashMovementControlRepositoryPort {
  findById(
    facilityId: string,
    movementId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord | null>;

  list(
    facilityId: string,
    query: PaymentCashierListQuery,
  ): Promise<Readonly<{
    items: readonly CashMovementRecord[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }>>;

  createWithApproval(
    facilityId: string,
    input: CreateCashMovementInput,
    prepared: CreateCashMovementPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord>;

  decide(
    facilityId: string,
    movementId: string,
    expectedVersion: number,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord>;

  update(
    facilityId: string,
    movementId: string,
    expectedVersion: number,
    update: Partial<CashMovementRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord | null>;

  findApproval(
    facilityId: string,
    approvalRequestId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord | null>;
}

export class MongoCashMovementRepository
implements CashMovementControlRepositoryPort {
  public async findById(
    facilityId: string,
    movementId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord | null> {
    return record<CashMovementRecord | null>(
      await withSession(
        CashMovementModel.findOne({
          _id: toObjectId(movementId, 'movementId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
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

    const counterId = query.counterId == null
      ? null
      : toObjectId(query.counterId, 'counterId');

    const filter: FilterQuery<unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(counterId === null
        ? {}
        : {
            $or: [
              { sourceCounterId: counterId },
              { destinationCounterId: counterId },
            ],
          }),
      ...(query.status === undefined || query.status.length === 0
        ? {}
        : { status: { $in: query.status } }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            requestedAt: {
              ...(query.from === undefined
                ? {}
                : { $gte: new Date(query.from) }),
              ...(query.to === undefined
                ? {}
                : { $lte: new Date(query.to) }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                movementNumber: {
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
      ? 'movementNumber'
      : query.sortBy === 'amount'
        ? 'amount'
        : query.sortBy === 'status'
          ? 'status'
          : query.sortBy === 'occurredAt'
            ? 'requestedAt'
            : 'createdAt';

    const [items, totalItems] = await Promise.all([
      CashMovementModel.find(filter)
        .sort({ [sortField]: sortDirection(query.sortDirection) })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      CashMovementModel.countDocuments(filter).exec(),
    ]);

    return paymentCashierPage(
      record<CashMovementRecord[]>(items),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createWithApproval(
    facilityId: string,
    input: CreateCashMovementInput,
    prepared: CreateCashMovementPrepared,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord> {
    try {
      const movementId = new Types.ObjectId();
      const approvalId = prepared.requiresApproval
        ? new Types.ObjectId()
        : null;
      const actorId = toObjectId(prepared.actorUserId, 'actorUserId');
      const facilityObjectId = toObjectId(facilityId, 'facilityId');

      if (approvalId !== null) {
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
              approvalType: 'CASH_MOVEMENT',
              entityType: 'CASH_MOVEMENT',
              entityId: movementId,
              patientAccountId: null,
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
      }

      const initialStatus = prepared.requiresApproval
        ? 'PENDING_APPROVAL'
        : 'APPROVED';

      const [created] = await CashMovementModel.create(
        [
          {
            _id: movementId,
            facilityId: facilityObjectId,
            transactionId: prepared.transactionId,
            correlationId: prepared.correlationId,
            schemaVersion: 1,
            version: 0,
            createdBy: actorId,
            updatedBy: actorId,
            operationKey: prepared.operationKey,
            movementNumber: normalizePaymentCashierCode(
              prepared.movementNumber,
            ),
            movementType: input.movementType,
            status: initialStatus,
            amount: paymentCashierDecimal128(input.amount, 'amount'),
            currency: normalizePaymentCashierCode(input.currency ?? 'PKR'),
            sourceCounterId: nullablePaymentCashierObjectId(
              input.sourceCounterId,
              'sourceCounterId',
            ),
            sourceShiftId: nullablePaymentCashierObjectId(
              input.sourceShiftId,
              'sourceShiftId',
            ),
            destinationCounterId: nullablePaymentCashierObjectId(
              input.destinationCounterId,
              'destinationCounterId',
            ),
            destinationShiftId: nullablePaymentCashierObjectId(
              input.destinationShiftId,
              'destinationShiftId',
            ),
            destinationSafeReference: normalizeNullablePaymentCashierText(
              input.destinationSafeReference,
            ),
            sourceDocumentType: input.sourceDocumentType == null
              ? null
              : normalizePaymentCashierCode(input.sourceDocumentType),
            sourceDocumentId: nullablePaymentCashierObjectId(
              input.sourceDocumentId,
              'sourceDocumentId',
            ),
            reasonCode: normalizePaymentCashierCode(input.reasonCode),
            reason: normalizePaymentCashierText(input.reason),
            requestedBy: actorId,
            requestedAt: prepared.requestedAt,
            approvalRequestId: approvalId,
            approvedBy: prepared.requiresApproval ? null : actorId,
            approvedAt: prepared.requiresApproval
              ? null
              : prepared.requestedAt,
            rejectedBy: null,
            rejectedAt: null,
            rejectionReason: null,
            postedBy: null,
            postedAt: null,
            financialLedgerTransactionId: null,
            expectedCashEffect: paymentCashierDecimal128(
              prepared.expectedCashEffect,
              'expectedCashEffect',
            ),
            reversalOfCashMovementId: null,
            reversedByCashMovementId: null,
            reversalReason: null,
          },
        ],
        { session },
      );

      return record<CashMovementRecord>(created.toObject());
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(error);
    }
  }

  public async decide(
    facilityId: string,
    movementId: string,
    expectedVersion: number,
    decision: 'APPROVE' | 'REJECT',
    decisionReason: string,
    checkerUserId: string,
    decidedAt: Date,
    transactionId: string,
    correlationId: string,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord> {
    const movement = await this.findById(facilityId, movementId, session);

    if (
      movement === null ||
      movement.version !== expectedVersion ||
      movement.status !== 'PENDING_APPROVAL' ||
      movement.approvalRequestId === null
    ) {
      throw new PaymentCashierConcurrencyError();
    }

    const checkerId = toObjectId(checkerUserId, 'checkerUserId');
    const normalizedReason = normalizePaymentCashierText(decisionReason);

    const approval = await FinancialApprovalRequestModel.findOneAndUpdate(
      {
        _id: movement.approvalRequestId,
        facilityId: toObjectId(facilityId, 'facilityId'),
        entityId: movement._id,
        approvalType: 'CASH_MOVEMENT',
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
        'Cash-movement approval is no longer pending or violates maker-checker rules',
      );
    }

    const update = decision === 'APPROVE'
      ? {
          status: 'APPROVED',
          approvedBy: checkerId,
          approvedAt: decidedAt,
          updatedBy: checkerId,
          transactionId,
          correlationId,
        }
      : {
          status: 'REJECTED',
          rejectedBy: checkerId,
          rejectedAt: decidedAt,
          rejectionReason: normalizedReason,
          updatedBy: checkerId,
          transactionId,
          correlationId,
        };

    const updated = await CashMovementModel.findOneAndUpdate(
      {
        _id: movement._id,
        facilityId: movement.facilityId,
        version: expectedVersion,
        status: 'PENDING_APPROVAL',
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
      .exec();

    if (updated === null) {
      throw new PaymentCashierConcurrencyError();
    }

    return record<CashMovementRecord>(updated);
  }

  public async update(
    facilityId: string,
    movementId: string,
    expectedVersion: number,
    update: Partial<CashMovementRecord>,
    session: PaymentCashierMongoSession,
  ): Promise<CashMovementRecord | null> {
    try {
      return record<CashMovementRecord | null>(
        await CashMovementModel.findOneAndUpdate(
          {
            _id: toObjectId(movementId, 'movementId'),
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

  public async findApproval(
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
}