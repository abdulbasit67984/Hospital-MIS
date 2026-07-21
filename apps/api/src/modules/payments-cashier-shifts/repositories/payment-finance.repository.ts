import Decimal from 'decimal.js';

import type {
  FilterQuery,
} from 'mongoose';

import {
  DepositApplicationModel,
  DepositModel,
  DepositTransferModel,
  PaymentAllocationModel,
  PaymentIntentModel,
  PaymentModel,
  PaymentReceiptModel,
  ReceiptReprintModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AllocatePaymentInput,
  ApplyDepositInput,
  CollectPaymentInput,
  CreateDepositInput,
  CreatePaymentIntentInput,
  PaymentCashierListQuery,
  PaymentTenderInput,
  TransferDepositInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentAllocationConflictError,
  throwMappedPaymentCashierPersistenceError,
} from '../payments-cashier-shifts.errors.js';

import type {
  DepositRepositoryPort,
  PaymentReceiptRepositoryPort,
  PaymentRepositoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  DepositApplicationRecord,
  DepositRecord,
  DepositTransferRecord,
  PaymentAllocationRecord,
  PaymentCashierMongoSession,
  PaymentIntentRecord,
  PaymentReceiptRecord,
  PaymentRecord,
  PaymentTenderRecord,
  PaymentUpdate,
  ReceiptReprintRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  escapePaymentCashierRegex,
  normalizeNullablePaymentCashierText,
  normalizePaymentCashierCode,
  nullablePaymentCashierObjectId,
  paymentCashierDate,
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

function paymentSelect() {
  return '+externalReference +failureMessage +payerName +notes +tenders.externalReference +tenders.failureMessage';
}

function intentSelect() {
  return '+externalReference +failureMessage +payerName';
}

export interface PreparedPaymentTenderSnapshot {
  paymentMethodConfigurationId:
    string;
  paymentMethodCodeSnapshot:
    string;
  paymentMethodKindSnapshot:
    string;
  amount:
    string;
  externalReference:
    string | null;
  maskedReference:
    string | null;
  referenceType:
    string | null;
}

export interface PreparedPaymentCreation {
  operationKey:
    string;
  paymentNumber:
    string;
  receiptNumber:
    string;
  patientId:
    string;
  authoritativeAmount:
    string;
  authoritativeAllocatedAmount:
    string;
  authoritativeUnallocatedAmount:
    string;
  paymentMethod:
    string;
  paymentMethodConfigurationId:
    string | null;
  externalReference:
    string | null;
  tenders:
    readonly PreparedPaymentTenderSnapshot[];
  actorUserId:
    string;
  actorStaffId:
    string;
  receivedAt:
    Date;
  transactionId:
    string;
  correlationId:
    string;
}

export interface PaymentFinancialRepositoryPort
extends Omit<
  PaymentRepositoryPort,
  'createIntent' | 'createPayment'
> {
  createIntent(
    facilityId:
      string,
    input:
      CreatePaymentIntentInput,
    prepared:
      Readonly<{
        operationKey: string;
        intentNumber: string;
        patientId: string;
        paymentMethod: string;
        cashierStaffId: string | null;
        expiresAt: Date;
        externalReference: string | null;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentIntentRecord>;

  createPayment(
    facilityId:
      string,
    input:
      CollectPaymentInput,
    prepared:
      PreparedPaymentCreation,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentRecord>;
}

export class MongoPaymentRepository
implements PaymentFinancialRepositoryPort {
  public async findIntentById(
    facilityId: string,
    intentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentIntentRecord | null> {
    return record<PaymentIntentRecord | null>(
      await withSession(
        PaymentIntentModel.findOne({
          _id:
            toObjectId(
              intentId,
              'intentId',
            ),
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
          .select(
            intentSelect(),
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findIntentByOperationKey(
    facilityId: string,
    operationKey: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentIntentRecord | null> {
    return record<PaymentIntentRecord | null>(
      await withSession(
        PaymentIntentModel.findOne({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          operationKey,
        })
          .select(
            intentSelect(),
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async createIntent(
    facilityId: string,
    input:
      CreatePaymentIntentInput,
    prepared:
      Readonly<{
        operationKey: string;
        intentNumber: string;
        patientId: string;
        paymentMethod: string;
        cashierStaffId: string | null;
        expiresAt: Date;
        externalReference: string | null;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentIntentRecord> {
    try {
      const actorUserId = toObjectId(
        prepared.actorUserId,
        'actorUserId',
      );
      const [created] =
        await PaymentIntentModel.create(
          [
            {
              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
              transactionId:
                prepared.transactionId,
              correlationId:
                prepared.correlationId,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
              operationKey:
                prepared.operationKey,
              intentNumber:
                normalizePaymentCashierCode(
                  prepared.intentNumber,
                ),
              patientAccountId:
                toObjectId(
                  input.patientAccountId,
                  'patientAccountId',
                ),
              patientId:
                toObjectId(
                  prepared.patientId,
                  'patientId',
                ),
              invoiceId:
                nullablePaymentCashierObjectId(
                  input.invoiceId,
                  'invoiceId',
                ),
              cashierStaffId:
                nullablePaymentCashierObjectId(
                  prepared.cashierStaffId,
                  'cashierStaffId',
                ),
              cashShiftId:
                nullablePaymentCashierObjectId(
                  input.cashShiftId,
                  'cashShiftId',
                ),
              cashCounterId:
                nullablePaymentCashierObjectId(
                  input.cashCounterId,
                  'cashCounterId',
                ),
              paymentMethodConfigurationId:
                toObjectId(
                  input.paymentMethodConfigurationId,
                  'paymentMethodConfigurationId',
                ),
              paymentMethod:
                prepared.paymentMethod,
              purpose:
                input.purpose,
              amount:
                paymentCashierDecimal128(
                  input.amount,
                  'amount',
                ),
              currency:
                input.currency ??
                'PKR',
              externalReference:
                prepared.externalReference,
              payerName:
                normalizeNullablePaymentCashierText(
                  input.payerName,
                ),
              responsiblePartyType:
                input.responsiblePartyType == null
                  ? null
                  : normalizePaymentCashierCode(
                      input.responsiblePartyType,
                    ),
              status:
                'PENDING',
              expiresAt:
                prepared.expiresAt,
              authorizedAt:
                null,
              capturedAt:
                null,
              cancelledAt:
                null,
              cancelledBy:
                null,
              cancellationReason:
                null,
              reversedAt:
                null,
              reversedBy:
                null,
              reversalReason:
                null,
              completedPaymentId:
                null,
              failureCode:
                null,
              failureMessage:
                null,
            },
          ],
          {
            session,
          },
        );

      return record<PaymentIntentRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async updateIntent(
    facilityId: string,
    intentId: string,
    expectedVersion: number,
    update:
      Partial<PaymentIntentRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentIntentRecord | null> {
    try {
      return record<PaymentIntentRecord | null>(
        await PaymentIntentModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                intentId,
                'intentId',
              ),
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              expectedVersion,
          },
          {
            $set:
              update,
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .select(
            intentSelect(),
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async listExpiredIntents(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<PaymentIntentRecord[]> {
    return record<PaymentIntentRecord[]>(
      await PaymentIntentModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
        status: {
          $in: [
            'PENDING',
            'AUTHORIZED',
          ],
        },
        expiresAt: {
          $lte:
            before,
        },
      })
        .sort({
          expiresAt:
            1,
        })
        .limit(
          limit,
        )
        .select(
          intentSelect(),
        )
        .lean()
        .exec(),
    );
  }

  public async findPaymentById(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentRecord | null> {
    return record<PaymentRecord | null>(
      await withSession(
        PaymentModel.findOne({
          _id:
            toObjectId(
              paymentId,
              'paymentId',
            ),
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
          .select(
            paymentSelect(),
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findPaymentByOperationKey(
    facilityId: string,
    operationKey: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentRecord | null> {
    return record<PaymentRecord | null>(
      await withSession(
        PaymentModel.findOne({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          operationKey,
        })
          .select(
            paymentSelect(),
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async listPayments(
    facilityId: string,
    query:
      PaymentCashierListQuery,
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
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId:
              toObjectId(
                query.patientId,
                'patientId',
              ),
          }),
      ...(query.patientAccountId === undefined
        ? {}
        : {
            patientAccountId:
              toObjectId(
                query.patientAccountId,
                'patientAccountId',
              ),
          }),
      ...(query.invoiceId === undefined
        ? {}
        : {
            invoiceId:
              toObjectId(
                query.invoiceId,
                'invoiceId',
              ),
          }),
      ...(query.counterId === undefined
        ? {}
        : {
            cashCounterId:
              toObjectId(
                query.counterId,
                'counterId',
              ),
          }),
      ...(query.cashierUserId === undefined
        ? {}
        : {
            receivedBy:
              toObjectId(
                query.cashierUserId,
                'cashierUserId',
              ),
          }),
      ...(query.paymentMethodConfigurationId === undefined
        ? {}
        : {
            'tenders.paymentMethodConfigurationId':
              toObjectId(
                query.paymentMethodConfigurationId,
                'paymentMethodConfigurationId',
              ),
          }),
      ...(query.status === undefined ||
      query.status.length === 0
        ? {}
        : {
            status: {
              $in:
                query.status,
            },
          }),
      ...(query.from === undefined &&
      query.to === undefined
        ? {}
        : {
            receivedAt: {
              ...(query.from === undefined
                ? {}
                : {
                    $gte:
                      paymentCashierDate(
                        query.from,
                        'from',
                      ),
                  }),
              ...(query.to === undefined
                ? {}
                : {
                    $lte:
                      paymentCashierDate(
                        query.to,
                        'to',
                      ),
                  }),
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            $or: [
              {
                paymentNumber: {
                  $regex:
                    escapePaymentCashierRegex(
                      query.search,
                    ),
                  $options:
                    'i',
                },
              },
              {
                receiptNumber: {
                  $regex:
                    escapePaymentCashierRegex(
                      query.search,
                    ),
                  $options:
                    'i',
                },
              },
            ],
          }),
    };

    const sortField =
      query.sortBy === 'number'
        ? 'paymentNumber'
        : query.sortBy === 'amount'
          ? 'amount'
          : query.sortBy === 'status'
            ? 'status'
            : query.sortBy === 'occurredAt'
              ? 'receivedAt'
              : 'createdAt';

    const [items, totalItems] =
      await Promise.all([
        PaymentModel.find(
          filter,
        )
          .sort({
            [sortField]:
              sortDirection(
                query.sortDirection,
              ),
          })
          .skip(
            skip,
          )
          .limit(
            pageSize,
          )
          .select(
            paymentSelect(),
          )
          .lean()
          .exec(),
        PaymentModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return paymentCashierPage(
      record<PaymentRecord[]>(
        items,
      ),
      page,
      pageSize,
      totalItems,
    );
  }

  public async createPayment(
    facilityId: string,
    input:
      CollectPaymentInput,
    prepared:
      PreparedPaymentCreation,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentRecord> {
    try {
      const actorUserId = toObjectId(
        prepared.actorUserId,
        'actorUserId',
      );
      const tenders =
        prepared.tenders.map(
          (
            tender,
            index,
          ) => ({
            operationKey:
              `${prepared.operationKey}:tender:${index + 1}`,
            sequence:
              index + 1,
            paymentMethodConfigurationId:
              toObjectId(
                tender.paymentMethodConfigurationId,
                'paymentMethodConfigurationId',
              ),
            paymentMethodCodeSnapshot:
              normalizePaymentCashierCode(
                tender.paymentMethodCodeSnapshot,
              ),
            paymentMethodKindSnapshot:
              normalizePaymentCashierCode(
                tender.paymentMethodKindSnapshot,
              ),
            amount:
              paymentCashierDecimal128(
                tender.amount,
                `tenders.${index}.amount`,
              ),
            currency:
              input.currency ??
              'PKR',
            externalReference:
              tender.externalReference,
            maskedReference:
              tender.maskedReference,
            referenceType:
              tender.referenceType == null
                ? null
                : normalizePaymentCashierCode(
                    tender.referenceType,
                  ),
            status:
              'POSTED',
            settledAt:
              prepared.receivedAt,
            failureCode:
              null,
            failureMessage:
              null,
            version:
              0,
          }),
        );

      const [created] =
        await PaymentModel.create(
          [
            {
              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
              transactionId:
                prepared.transactionId,
              correlationId:
                prepared.correlationId,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
              operationKey:
                prepared.operationKey,
              paymentNumber:
                normalizePaymentCashierCode(
                  prepared.paymentNumber,
                ),
              receiptNumber:
                normalizePaymentCashierCode(
                  prepared.receiptNumber,
                ),
              paymentIntentId:
                nullablePaymentCashierObjectId(
                  input.paymentIntentId,
                  'paymentIntentId',
                ),
              patientAccountId:
                toObjectId(
                  input.patientAccountId,
                  'patientAccountId',
                ),
              patientId:
                toObjectId(
                  prepared.patientId,
                  'patientId',
                ),
              invoiceId:
                nullablePaymentCashierObjectId(
                  input.invoiceId,
                  'invoiceId',
                ),
              cashierStaffId:
                toObjectId(
                  prepared.actorStaffId,
                  'actorStaffId',
                ),
              cashShiftId:
                toObjectId(
                  input.cashShiftId,
                  'cashShiftId',
                ),
              cashCounterId:
                toObjectId(
                  input.cashCounterId,
                  'cashCounterId',
                ),
              paymentMethodConfigurationId:
                nullablePaymentCashierObjectId(
                  prepared.paymentMethodConfigurationId,
                  'paymentMethodConfigurationId',
                ),
              paymentMethod:
                prepared.paymentMethod,
              amount:
                paymentCashierDecimal128(
                  prepared.authoritativeAmount,
                  'amount',
                ),
              currency:
                input.currency ??
                'PKR',
              externalReference:
                prepared.externalReference,
              tenders,
              payerName:
                normalizeNullablePaymentCashierText(
                  input.payerName,
                ),
              responsiblePartyType:
                input.responsiblePartyType == null
                  ? null
                  : normalizePaymentCashierCode(
                      input.responsiblePartyType,
                    ),
              notes:
                normalizeNullablePaymentCashierText(
                  input.notes,
                ),
              allocatedAmount:
                paymentCashierDecimal128(
                  prepared.authoritativeAllocatedAmount,
                  'allocatedAmount',
                ),
              unallocatedAmount:
                paymentCashierDecimal128(
                  prepared.authoritativeUnallocatedAmount,
                  'unallocatedAmount',
                ),
              refundedAmount:
                paymentCashierDecimal128(
                  '0',
                  'refundedAmount',
                ),
              status:
                'COMPLETED',
              receivedAt:
                prepared.receivedAt,
              postedAt:
                prepared.receivedAt,
              postedBy:
                actorUserId,
              failureCode:
                null,
              failureMessage:
                null,
              reversalId:
                null,
            },
          ],
          {
            session,
          },
        );

      return record<PaymentRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async updatePayment(
    facilityId: string,
    paymentId: string,
    expectedVersion: number,
    update:
      PaymentUpdate,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentRecord | null> {
    try {
      return record<PaymentRecord | null>(
        await PaymentModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                paymentId,
                'paymentId',
              ),
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              expectedVersion,
          },
          {
            $set:
              update,
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .select(
            paymentSelect(),
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async createTenders(
    facilityId: string,
    paymentId: string,
    tenders:
      readonly PaymentTenderInput[],
    _metadata:
      Readonly<{
        operationKeyPrefix: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentTenderRecord[]> {
    const persisted =
      await this.listTenders(
        facilityId,
        paymentId,
        session,
      );

    if (persisted.length !== tenders.length) {
      throw new PaymentAllocationConflictError(
        'Persisted payment tenders do not match the requested split-tender operation',
      );
    }

    for (let index = 0; index < tenders.length; index += 1) {
      const requested = tenders[index]!;
      const actual = persisted[index]!;

      if (
        actual.paymentMethodConfigurationId.toHexString() !==
          requested.paymentMethodConfigurationId ||
        !new Decimal(
          actual.amount.toString(),
        ).equals(
          requested.amount,
        )
      ) {
        throw new PaymentAllocationConflictError(
          'Persisted payment tenders do not reconcile with the requested payment methods and amounts',
        );
      }
    }

    return persisted;
  }

  public async listTenders(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentTenderRecord[]> {
    const payment =
      await this.findPaymentById(
        facilityId,
        paymentId,
        session,
      );

    if (payment === null) {
      return [];
    }

    const raw = payment as PaymentRecord & {
      tenders?: readonly Readonly<{
        _id: { toHexString(): string };
        operationKey: string;
        sequence: number;
        paymentMethodConfigurationId: {
          toHexString(): string;
        };
        paymentMethodCodeSnapshot: string;
        paymentMethodKindSnapshot: string;
        amount: PaymentRecord['amount'];
        currency: string;
        externalReference: string | null;
        maskedReference: string | null;
        referenceType: string | null;
        status: PaymentTenderRecord['status'];
        settledAt: Date | null;
        failureCode: string | null;
        failureMessage: string | null;
        version: number;
      }>[];
    };

    return (raw.tenders ?? []).map(
      (tender) => ({
        _id:
          toObjectId(
            tender._id.toHexString(),
            'tenderId',
          ),
        facilityId:
          payment.facilityId,
        transactionId:
          payment.transactionId,
        correlationId:
          payment.correlationId,
        schemaVersion:
          payment.schemaVersion,
        version:
          tender.version,
        createdBy:
          payment.createdBy,
        updatedBy:
          payment.updatedBy,
        createdAt:
          payment.createdAt,
        updatedAt:
          payment.updatedAt,
        operationKey:
          tender.operationKey,
        paymentId:
          payment._id,
        sequence:
          tender.sequence,
        paymentMethodConfigurationId:
          toObjectId(
            tender.paymentMethodConfigurationId.toHexString(),
            'paymentMethodConfigurationId',
          ),
        paymentMethodCodeSnapshot:
          tender.paymentMethodCodeSnapshot,
        paymentMethodKindSnapshot:
          tender.paymentMethodKindSnapshot,
        amount:
          tender.amount,
        currency:
          tender.currency,
        externalReference:
          tender.externalReference,
        maskedReference:
          tender.maskedReference,
        referenceType:
          tender.referenceType,
        status:
          tender.status,
        settledAt:
          tender.settledAt,
        failureCode:
          tender.failureCode,
        failureMessage:
          tender.failureMessage,
      }),
    );
  }

  public async listAllocations(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentAllocationRecord[]> {
    return record<PaymentAllocationRecord[]>(
      await withSession(
        PaymentAllocationModel.find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          paymentId:
            toObjectId(
              paymentId,
              'paymentId',
            ),
        })
          .sort({
            allocatedAt:
              1,
          })
          .lean(),
        session,
      ).exec(),
    );
  }

  public async createAllocations(
    facilityId: string,
    paymentId: string,
    patientAccountId: string,
    allocations:
      AllocatePaymentInput['allocations'],
    metadata:
      Readonly<{
        operationKeyPrefix: string;
        actorUserId: string;
        allocatedAt: Date;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentAllocationRecord[]> {
    if (allocations.length === 0) {
      return [];
    }

    try {
      const actorUserId = toObjectId(
        metadata.actorUserId,
        'actorUserId',
      );
      const documents =
        allocations.map(
          (
            allocation,
            index,
          ) => ({
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            transactionId:
              metadata.transactionId,
            correlationId:
              metadata.correlationId,
            schemaVersion:
              1,
            version:
              0,
            createdBy:
              actorUserId,
            updatedBy:
              actorUserId,
            operationKey:
              `${metadata.operationKeyPrefix}:allocation:${index + 1}`,
            paymentId:
              toObjectId(
                paymentId,
                'paymentId',
              ),
            patientAccountId:
              toObjectId(
                patientAccountId,
                'patientAccountId',
              ),
            invoiceId:
              nullablePaymentCashierObjectId(
                allocation.invoiceId,
                'invoiceId',
              ),
            accountChargeId:
              nullablePaymentCashierObjectId(
                allocation.accountChargeId,
                'accountChargeId',
              ),
            amount:
              paymentCashierDecimal128(
                allocation.amount,
                `allocations.${index}.amount`,
              ),
            status:
              'ACTIVE',
            allocatedAt:
              metadata.allocatedAt,
            allocatedBy:
              actorUserId,
            reversedAt:
              null,
            reversedBy:
              null,
            reversalReason:
              null,
          }),
        );

      const created =
        await PaymentAllocationModel.create(
          documents,
          {
            session,
          },
        );

      return created.map(
        (item) =>
          record<PaymentAllocationRecord>(
            item.toObject(),
          ),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async reverseAllocations(
    facilityId: string,
    allocationIds:
      readonly string[],
    reason: string,
    actorUserId: string,
    reversedAt: Date,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentAllocationRecord[]> {
    if (allocationIds.length === 0) {
      return [];
    }

    try {
      await PaymentAllocationModel.updateMany(
        {
          _id: {
            $in:
              allocationIds.map(
                (allocationId) =>
                  toObjectId(
                    allocationId,
                    'allocationId',
                  ),
              ),
          },
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
          status:
            'ACTIVE',
        },
        {
          $set: {
            status:
              'REVERSED',
            reversedAt,
            reversedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
            reversalReason:
              reason,
            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },
          $inc: {
            version:
              1,
          },
        },
        {
          session,
          runValidators:
            true,
        },
      ).exec();

      return record<PaymentAllocationRecord[]>(
        await PaymentAllocationModel.find({
          _id: {
            $in:
              allocationIds.map(
                (allocationId) =>
                  toObjectId(
                    allocationId,
                    'allocationId',
                  ),
              ),
          },
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
          .session(
            session,
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }
}

export class MongoPaymentReceiptRepository
implements PaymentReceiptRepositoryPort {
  public async findById(
    facilityId: string,
    receiptId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentReceiptRecord | null> {
    return record<PaymentReceiptRecord | null>(
      await withSession(
        PaymentReceiptModel.findOne({
          _id:
            toObjectId(
              receiptId,
              'receiptId',
            ),
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
          .select(
            '+payerDisplayName',
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async findByPaymentId(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<PaymentReceiptRecord | null> {
    return record<PaymentReceiptRecord | null>(
      await withSession(
        PaymentReceiptModel.findOne({
          paymentId:
            toObjectId(
              paymentId,
              'paymentId',
            ),
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        })
          .select(
            '+payerDisplayName',
          )
          .lean(),
        session,
      ).exec(),
    );
  }

  public async create(
    input:
      Omit<
        PaymentReceiptRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentReceiptRecord> {
    try {
      const [created] =
        await PaymentReceiptModel.create(
          [input],
          {
            session,
          },
        );

      return record<PaymentReceiptRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async createReprint(
    input:
      Omit<
        ReceiptReprintRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,
    session:
      PaymentCashierMongoSession,
  ): Promise<ReceiptReprintRecord> {
    try {
      const [created] =
        await ReceiptReprintModel.create(
          [input],
          {
            session,
          },
        );

      return record<ReceiptReprintRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async updateStatus(
    facilityId: string,
    receiptId: string,
    expectedVersion: number,
    update:
      Partial<PaymentReceiptRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<PaymentReceiptRecord | null> {
    try {
      return record<PaymentReceiptRecord | null>(
        await PaymentReceiptModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                receiptId,
                'receiptId',
              ),
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              expectedVersion,
          },
          {
            $set:
              update,
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .select(
            '+payerDisplayName',
          )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }
}

export interface DepositFinancialRepositoryPort
extends Omit<
  DepositRepositoryPort,
  'create'
> {
  findByPaymentId(
    facilityId: string,
    paymentId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<DepositRecord | null>;

  create(
    facilityId:
      string,
    input:
      CreateDepositInput,
    prepared:
      Readonly<{
        operationKey: string;
        depositNumber: string;
        patientId: string;
        originalAmount: string;
        currency: string;
        receivedAt: Date;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<DepositRecord>;
}

export class MongoDepositRepository
implements DepositFinancialRepositoryPort {
  public async findByPaymentId(
    facilityId: string,
    paymentId: string,
    session?: PaymentCashierMongoSession,
  ): Promise<DepositRecord | null> {
    return record<DepositRecord | null>(
      await withSession(
        DepositModel.findOne({
          facilityId: toObjectId(facilityId, 'facilityId'),
          paymentId: toObjectId(paymentId, 'paymentId'),
          status: { $ne: 'REVERSED' },
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async findById(
    facilityId: string,
    depositId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<DepositRecord | null> {
    return record<DepositRecord | null>(
      await withSession(
        DepositModel.findOne({
          _id:
            toObjectId(
              depositId,
              'depositId',
            ),
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async list(
    facilityId: string,
    query:
      PaymentCashierListQuery,
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
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId:
              toObjectId(
                query.patientId,
                'patientId',
              ),
          }),
      ...(query.patientAccountId === undefined
        ? {}
        : {
            patientAccountId:
              toObjectId(
                query.patientAccountId,
                'patientAccountId',
              ),
          }),
      ...(query.status === undefined ||
      query.status.length === 0
        ? {}
        : {
            status: {
              $in:
                query.status,
            },
          }),
      ...(query.search === undefined
        ? {}
        : {
            depositNumber: {
              $regex:
                escapePaymentCashierRegex(
                  query.search,
                ),
              $options:
                'i',
            },
          }),
    };

    const [items, totalItems] =
      await Promise.all([
        DepositModel.find(
          filter,
        )
          .sort({
            receivedAt:
              sortDirection(
                query.sortDirection,
              ),
          })
          .skip(
            skip,
          )
          .limit(
            pageSize,
          )
          .lean()
          .exec(),
        DepositModel.countDocuments(
          filter,
        ).exec(),
      ]);

    return paymentCashierPage(
      record<DepositRecord[]>(
        items,
      ),
      page,
      pageSize,
      totalItems,
    );
  }

  public async create(
    facilityId: string,
    input:
      CreateDepositInput,
    prepared:
      Readonly<{
        operationKey: string;
        depositNumber: string;
        patientId: string;
        originalAmount: string;
        currency: string;
        receivedAt: Date;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<DepositRecord> {
    try {
      const actorUserId = toObjectId(
        prepared.actorUserId,
        'actorUserId',
      );
      const [created] =
        await DepositModel.create(
          [
            {
              facilityId:
                toObjectId(
                  facilityId,
                  'facilityId',
                ),
              transactionId:
                prepared.transactionId,
              correlationId:
                prepared.correlationId,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
              operationKey:
                prepared.operationKey,
              depositNumber:
                normalizePaymentCashierCode(
                  prepared.depositNumber,
                ),
              patientId:
                toObjectId(
                  prepared.patientId,
                  'patientId',
                ),
              patientAccountId:
                nullablePaymentCashierObjectId(
                  input.patientAccountId,
                  'patientAccountId',
                ),
              depositType:
                input.depositType,
              admissionId:
                nullablePaymentCashierObjectId(
                  input.admissionId,
                  'admissionId',
                ),
              procedureReferenceId:
                nullablePaymentCashierObjectId(
                  input.procedureReferenceId,
                  'procedureReferenceId',
                ),
              responsiblePartyType:
                null,
              paymentId:
                toObjectId(
                  input.paymentId,
                  'paymentId',
                ),
              originalAmount:
                paymentCashierDecimal128(
                  prepared.originalAmount,
                  'originalAmount',
                ),
              availableAmount:
                paymentCashierDecimal128(
                  prepared.originalAmount,
                  'availableAmount',
                ),
              appliedAmount:
                paymentCashierDecimal128(
                  '0',
                  'appliedAmount',
                ),
              refundedAmount:
                paymentCashierDecimal128(
                  '0',
                  'refundedAmount',
                ),
              transferredAmount:
                paymentCashierDecimal128(
                  '0',
                  'transferredAmount',
                ),
              forfeitedAmount:
                paymentCashierDecimal128(
                  '0',
                  'forfeitedAmount',
                ),
              currency:
                prepared.currency,
              status:
                'AVAILABLE',
              receivedAt:
                prepared.receivedAt,
              expiresAt:
                input.expiresAt == null
                  ? null
                  : paymentCashierDate(
                      input.expiresAt,
                      'expiresAt',
                    ),
              releasedAt:
                null,
              releasedBy:
                null,
              releaseReason:
                null,
              reversalId:
                null,
            },
          ],
          {
            session,
          },
        );

      return record<DepositRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async update(
    facilityId: string,
    depositId: string,
    expectedVersion: number,
    update:
      Partial<DepositRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<DepositRecord | null> {
    try {
      return record<DepositRecord | null>(
        await DepositModel.findOneAndUpdate(
          {
            _id:
              toObjectId(
                depositId,
                'depositId',
              ),
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),
            version:
              expectedVersion,
          },
          {
            $set:
              update,
            $inc: {
              version:
                1,
            },
          },
          {
            new:
              true,
            session,
            runValidators:
              true,
          },
        )
          .lean()
          .exec(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async createApplication(
    input:
      ApplyDepositInput,
    prepared:
      Readonly<{
        operationKey: string;
        applicationNumber: string;
        deposit: DepositRecord;
        patientId: string;
        actorUserId: string;
        appliedAt: Date;
        paymentAllocationId: string;
        financialLedgerTransactionId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<DepositApplicationRecord> {
    try {
      const actorUserId = toObjectId(
        prepared.actorUserId,
        'actorUserId',
      );
      const [created] =
        await DepositApplicationModel.create(
          [
            {
              facilityId:
                prepared.deposit.facilityId,
              transactionId:
                prepared.transactionId,
              correlationId:
                prepared.correlationId,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
              operationKey:
                prepared.operationKey,
              applicationNumber:
                normalizePaymentCashierCode(
                  prepared.applicationNumber,
                ),
              depositId:
                prepared.deposit._id,
              patientId:
                toObjectId(
                  prepared.patientId,
                  'patientId',
                ),
              sourcePatientAccountId:
                prepared.deposit.patientAccountId,
              targetPatientAccountId:
                toObjectId(
                  input.targetPatientAccountId,
                  'targetPatientAccountId',
                ),
              targetInvoiceId:
                nullablePaymentCashierObjectId(
                  input.targetInvoiceId,
                  'targetInvoiceId',
                ),
              amount:
                paymentCashierDecimal128(
                  input.amount,
                  'amount',
                ),
              currency:
                prepared.deposit.currency,
              appliedAt:
                prepared.appliedAt,
              appliedBy:
                actorUserId,
              cashCounterId:
                null,
              cashShiftId:
                null,
              paymentAllocationId:
                toObjectId(
                  prepared.paymentAllocationId,
                  'paymentAllocationId',
                ),
              financialLedgerTransactionId:
                toObjectId(
                  prepared.financialLedgerTransactionId,
                  'financialLedgerTransactionId',
                ),
              recordType:
                'APPLICATION',
              originalApplicationId:
                null,
              reversalReason:
                null,
            },
          ],
          {
            session,
          },
        );

      return record<DepositApplicationRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }

  public async createTransfer(
    input:
      TransferDepositInput,
    prepared:
      Readonly<{
        operationKey: string;
        transferNumber: string;
        deposit: DepositRecord;
        destinationDepositId: string;
        approvedBy: string;
        transferredAt: Date;
        financialLedgerTransactionId: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,
    session:
      PaymentCashierMongoSession,
  ): Promise<DepositTransferRecord> {
    try {
      const actorUserId = toObjectId(
        prepared.actorUserId,
        'actorUserId',
      );
      const [created] =
        await DepositTransferModel.create(
          [
            {
              facilityId:
                prepared.deposit.facilityId,
              transactionId:
                prepared.transactionId,
              correlationId:
                prepared.correlationId,
              schemaVersion:
                1,
              version:
                0,
              createdBy:
                actorUserId,
              updatedBy:
                actorUserId,
              operationKey:
                prepared.operationKey,
              transferNumber:
                normalizePaymentCashierCode(
                  prepared.transferNumber,
                ),
              sourceDepositId:
                prepared.deposit._id,
              sourcePatientId:
                prepared.deposit.patientId,
              sourcePatientAccountId:
                prepared.deposit.patientAccountId,
              destinationPatientId:
                toObjectId(
                  input.destinationPatientId,
                  'destinationPatientId',
                ),
              destinationPatientAccountId:
                nullablePaymentCashierObjectId(
                  input.destinationPatientAccountId,
                  'destinationPatientAccountId',
                ),
              destinationDepositId:
                toObjectId(
                  prepared.destinationDepositId,
                  'destinationDepositId',
                ),
              amount:
                paymentCashierDecimal128(
                  input.amount,
                  'amount',
                ),
              currency:
                prepared.deposit.currency,
              reasonCode:
                normalizePaymentCashierCode(
                  input.reasonCode,
                ),
              reason:
                input.reason.trim(),
              approvalRequestId:
                toObjectId(
                  input.approvalRequestId,
                  'approvalRequestId',
                ),
              requestedBy:
                actorUserId,
              approvedBy:
                toObjectId(
                  prepared.approvedBy,
                  'approvedBy',
                ),
              transferredAt:
                prepared.transferredAt,
              financialLedgerTransactionId:
                toObjectId(
                  prepared.financialLedgerTransactionId,
                  'financialLedgerTransactionId',
                ),
              recordType:
                'TRANSFER',
              originalTransferId:
                null,
              reversalReason:
                null,
            },
          ],
          {
            session,
          },
        );

      return record<DepositTransferRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedPaymentCashierPersistenceError(
        error,
      );
    }
  }
}