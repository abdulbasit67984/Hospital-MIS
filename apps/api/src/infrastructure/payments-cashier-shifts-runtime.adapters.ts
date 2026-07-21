import {
  createHash,
  randomUUID,
} from 'node:crypto';

import Decimal from 'decimal.js';

import type {
  ClientSession,
} from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  Decimal128,
  FinancialApprovalRequestModel,
  FinancialLedgerAccountModel,
  FinancialLedgerEntryModel,
  FinancialLedgerTransactionModel,
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  sanitizeAuditSnapshot,
} from '../modules/audit/audit.sanitizer.js';

import type {
  PaymentCashierAuditPort,
  PaymentCashierDistributedLockPort,
  PaymentCashierIdempotencyPort,
  PaymentCashierOutboxPort,
  PaymentCashierRealtimePort,
  PaymentCashierSequencePort,
  PaymentLedgerPort,
  FinancialApprovalPort,
} from '../modules/payments-cashier-shifts/payments-cashier-shifts.ports.js';

import type {
  FinancialApprovalRecord,
  FinancialLedgerTransactionRecord,
  PaymentCashierMongoSession,
} from '../modules/payments-cashier-shifts/payments-cashier-shifts.persistence.types.js';

import type {
  IdempotencyService,
} from './idempotency.service.js';

import type {
  OperationLockService,
} from './operation-lock.service.js';

function isDuplicateKey(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000
  );
}

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return null;
  }

  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => jsonSafe(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate['toHexString'] === 'function') {
      return (candidate['toHexString'] as () => string)();
    }

    if (candidate['_bsontype'] === 'Decimal128' && typeof candidate['toString'] === 'function') {
      return (candidate['toString'] as () => string)();
    }

    if (typeof candidate['toObject'] === 'function') {
      return jsonSafe((candidate['toObject'] as () => unknown)(), depth + 1);
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        jsonSafe(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

interface ActiveIdempotencyClaim {
  facilityId: string;
  scope: string;
  key: string;
  ownerId: string;
}

export class MongoPaymentCashierIdempotencyAdapter
implements PaymentCashierIdempotencyPort {
  private readonly claims = new Map<string, ActiveIdempotencyClaim>();

  public constructor(
    private readonly idempotency: IdempotencyService,
  ) {}

  public async begin(input: Readonly<{
    facilityId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    actorUserId: string;
    correlationId: string;
  }>): Promise<Readonly<{
    state: 'ACQUIRED' | 'REPLAY' | 'IN_PROGRESS' | 'CONFLICT';
    operationKey: string;
    response?: unknown;
  }>> {
    const operationKey = `${input.operation}:${input.facilityId}:${createHash('sha256')
      .update(input.idempotencyKey)
      .digest('hex')}`;

    const claim = await this.idempotency.begin({
      facilityId: input.facilityId,
      scope: input.operation,
      key: input.idempotencyKey,
      requestPayload: {
        requestHash: input.requestHash,
      },
    });

    if (claim.kind === 'REPLAY') {
      return {
        state: 'REPLAY',
        operationKey,
        response: claim.response,
      };
    }

    this.claims.set(operationKey, {
      facilityId: input.facilityId,
      scope: input.operation,
      key: input.idempotencyKey,
      ownerId: claim.ownerId,
    });

    return {
      state: 'ACQUIRED',
      operationKey,
    };
  }

  public async complete(
    operationKey: string,
    response: unknown,
  ): Promise<void> {
    const claim = this.claims.get(operationKey);

    if (claim === undefined) {
      return;
    }

    await this.idempotency.complete({
      facilityId: claim.facilityId,
      scope: claim.scope,
      key: claim.key,
      ownerId: claim.ownerId,
      response: jsonSafe(response) as never,
    });

    this.claims.delete(operationKey);
  }

  public async fail(
    operationKey: string,
    errorCode: string,
  ): Promise<void> {
    const claim = this.claims.get(operationKey);

    if (claim === undefined) {
      return;
    }

    await this.idempotency.fail({
      facilityId: claim.facilityId,
      scope: claim.scope,
      key: claim.key,
      ownerId: claim.ownerId,
      error: {
        code: errorCode,
      } as never,
    });

    this.claims.delete(operationKey);
  }
}

export class MongoPaymentCashierLockAdapter
implements PaymentCashierDistributedLockPort {
  public constructor(
    private readonly locks: OperationLockService,
  ) {}

  public async withLock<T>(
    resourceKey: string,
    ownerKey: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const facilityId = ownerKey.split(':')[1];

    if (facilityId === undefined || !/^[a-f\d]{24}$/iu.test(facilityId)) {
      throw new ConflictError('Payment lock owner does not contain a facility context');
    }

    const lock = await this.locks.acquire({
      facilityId,
      ownerId: ownerKey,
      resourceType: 'PAYMENTS_CASHIER_SHIFTS',
      resourceKey,
    });

    try {
      return await work();
    } finally {
      await this.locks.release(lock).catch(() => undefined);
    }
  }
}

const sequencePrefixes: Readonly<Record<string, string>> = {
  'payments.cashier_shift': 'CSH',
  'payments.operational_history': 'POH',
  'payments.payment_intent': 'PIT',
  'payments.payment': 'PAY',
  'payments.receipt': 'RCP',
  'payments.receipt_reprint': 'RPR',
  'payments.deposit': 'DEP',
  'payments.deposit_application': 'DAP',
  'payments.deposit_transfer': 'DTR',
  'payments.refund_request': 'RFR',
  'payments.refund': 'RFD',
  'payments.payment_reversal': 'PRV',
  'payments.cash_movement': 'CMV',
  'payments.shift_reconciliation': 'SRC',
  'payments.financial_approval': 'FAP',
  'payments.financial_journal': 'JRN',
};

export class MongoPaymentCashierSequenceAdapter
implements PaymentCashierSequencePort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async next(
    facilityIdValue: string,
    key: string,
    at: Date,
    session: PaymentCashierMongoSession,
  ): Promise<string> {
    const facilityId = toObjectId(facilityIdValue, 'facilityId');
    const result = await this.database.collection<{
      currentValue: number;
    }>('numberSequences').findOneAndUpdate(
      {
        facilityId,
        key,
      },
      {
        $setOnInsert: {
          _id: createObjectId(),
          facilityId,
          key,
          currentValue: 0,
          schemaVersion: 1,
          version: 0,
          createdAt: at,
        },
        $inc: {
          currentValue: 1,
          version: 1,
        },
        $set: {
          updatedAt: at,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        session,
      },
    );

    if (result === null) {
      throw new ConflictError(`Sequence ${key} could not be allocated`);
    }

    const prefix = sequencePrefixes[key] ?? 'PAY';
    return `${prefix}-${at.getUTCFullYear()}-${String(result.currentValue).padStart(8, '0')}`;
  }
}

export class MongoPaymentCashierAuditAdapter
implements PaymentCashierAuditPort {
  public constructor(
    private readonly database: Db,
    private readonly auditRepository?: AuditRepository,
  ) {}

  public async record(
    input: Readonly<{
      facilityId: string;
      actorUserId: string;
      actorStaffId: string;
      action: string;
      entityType: string;
      entityId: string;
      reason?: string | null;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
      correlationId: string;
      transactionId: string;
      ipAddress?: string;
      userAgent?: string;
    }>,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const occurredAt = new Date();
    const eventId = `${input.transactionId}:${input.action}:${input.entityType}:${input.entityId}`;

    try {
      await this.database.collection('auditLogs').insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        eventId,
        actorId: toObjectId(input.actorUserId, 'actorUserId'),
        action: input.action,
        module: 'PAYMENTS_CASHIER_SHIFTS',
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.reason == null ? {} : { reason: input.reason }),
        ...(input.before == null ? {} : { beforeSnapshot: sanitizeAuditSnapshot(input.before) }),
        ...(input.after == null ? {} : { afterSnapshot: sanitizeAuditSnapshot(input.after) }),
        metadata: sanitizeAuditSnapshot({
          actorStaffId: input.actorStaffId,
        }),
        outcome: 'SUCCESS',
        sensitivity: 'HIGHLY_SENSITIVE',
        correlationId: input.correlationId,
        transactionId: input.transactionId,
        requestSource: 'API',
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
        occurredAt,
        schemaVersion: 1,
        version: 0,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      }, {
        session,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }

    void this.auditRepository;
  }
}

export class MongoPaymentCashierOutboxAdapter
implements PaymentCashierOutboxPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async publish(
    input: Readonly<{
      facilityId: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
      correlationId: string;
      transactionId: string;
      occurredAt: Date;
    }>,
    session: PaymentCashierMongoSession,
  ): Promise<void> {
    const eventId = `${input.transactionId}:${input.eventType}:${input.aggregateId}`;

    try {
      await this.database.collection('outboxEvents').insertOne({
        _id: createObjectId(),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        eventId,
        transactionId: input.transactionId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: {
          ...input.payload,
          correlationId: input.correlationId,
          occurredAt: input.occurredAt.toISOString(),
        },
        status: 'BLOCKED',
        availableAt: input.occurredAt,
        attemptCount: 0,
        schemaVersion: 1,
        version: 0,
        createdAt: input.occurredAt,
        updatedAt: input.occurredAt,
      }, {
        session,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }
  }
}

const prohibitedRealtimeKeys = new Set([
  'patientname',
  'payername',
  'mrn',
  'cnic',
  'cardnumber',
  'cvv',
  'externalreference',
  'bankreference',
  'address',
  'phone',
  'email',
  'reason',
  'notes',
]);

function assertRealtimeSafe(value: unknown, path = 'message'): void {
  if (value == null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertRealtimeSafe(entry, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replaceAll(/[^A-Za-z0-9]/gu, '').toLowerCase();
    if (prohibitedRealtimeKeys.has(normalized)) {
      throw new TypeError(`Payments realtime payload exposes prohibited field ${path}.${key}`);
    }
    assertRealtimeSafe(nested, `${path}.${key}`);
  }
}

export class PaymentCashierRealtimeAdapter
implements PaymentCashierRealtimePort {
  public constructor(
    private readonly publish: (message: Readonly<{
      facilityId: string;
      eventType: string;
      entityId: string;
      counterId?: string | null;
      shiftId?: string | null;
      status?: string;
      occurredAt: string;
    }>) => Promise<void>,
  ) {}

  public async publishMinimumNecessary(message: Readonly<{
    facilityId: string;
    eventType: string;
    entityId: string;
    counterId?: string | null;
    shiftId?: string | null;
    status?: string;
    occurredAt: string;
  }>): Promise<void> {
    assertRealtimeSafe(message);
    await this.publish(message);
  }
}

export class MongoFinancialApprovalAdapter
implements FinancialApprovalPort {
  public constructor(
    private readonly sequences: PaymentCashierSequencePort,
  ) {}

  public async createRequest(
    input: Readonly<{
      facilityId: string;
      approvalType: string;
      paymentId?: string | null;
      requestedAmount?: string | null;
      reason: string;
      requestedBy: string;
      transactionId: string;
      correlationId: string;
    }>,
    session: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord> {
    const now = new Date();
    const requestNumber = await this.sequences.next(
      input.facilityId,
      'payments.financial_approval',
      now,
      session,
    );
    const entityId = input.paymentId == null
      ? createObjectId()
      : toObjectId(input.paymentId, 'paymentId');
    const actorId = toObjectId(input.requestedBy, 'requestedBy');

    const [created] = await FinancialApprovalRequestModel.create([
      {
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        transactionId: input.transactionId,
        correlationId: input.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorId,
        updatedBy: actorId,
        requestNumber,
        operationKey: `${input.transactionId}:approval:${input.approvalType}`,
        approvalType: input.approvalType,
        entityType: input.paymentId == null ? 'FINANCIAL_OPERATION' : 'PAYMENT',
        entityId,
        patientAccountId: null,
        amount: Decimal128.fromString(input.requestedAmount ?? '0'),
        thresholdAmountSnapshot: Decimal128.fromString('0'),
        requestedBy: actorId,
        requestedAt: now,
        reason: input.reason,
        status: 'PENDING',
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
        expiresAt: null,
        makerCheckerSatisfied: false,
      },
    ], {
      session,
    });

    return created.toObject() as FinancialApprovalRecord;
  }

  public async requireApproved(
    facilityId: string,
    approvalRequestId: string,
    expectedType: string,
    makerUserId: string,
    session: PaymentCashierMongoSession,
  ): Promise<FinancialApprovalRecord> {
    const approval = await FinancialApprovalRequestModel.findOne({
      _id: toObjectId(approvalRequestId, 'approvalRequestId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
      approvalType: expectedType,
      status: 'APPROVED',
      makerCheckerSatisfied: true,
      requestedBy: {
        $ne: toObjectId(makerUserId, 'makerUserId'),
      },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    })
      .session(session)
      .lean()
      .exec();

    if (approval === null) {
      throw new ConflictError('An active independent approval is required');
    }

    return approval as FinancialApprovalRecord;
  }
}

export class MongoPaymentLedgerAdapter
implements PaymentLedgerPort {
  public constructor(
    private readonly sequences: PaymentCashierSequencePort,
  ) {}

  public async postBalancedTransaction(
    input: Readonly<{
      operationKey: string;
      facilityId: string;
      sourceEntityType: string;
      sourceEntityId: string;
      patientId?: string | null;
      patientAccountId?: string | null;
      invoiceId?: string | null;
      paymentId?: string | null;
      cashShiftId?: string | null;
      cashCounterId?: string | null;
      paymentMethodConfigurationId?: string | null;
      currency: string;
      description: string;
      postedAt: Date;
      postedBy: string;
      entries: readonly Readonly<{
        ledgerAccountId: string;
        direction: 'DEBIT' | 'CREDIT';
        amount: string;
        description: string;
      }>[];
      transactionId: string;
      correlationId: string;
    }>,
    session: PaymentCashierMongoSession,
  ): Promise<FinancialLedgerTransactionRecord> {
    if (input.entries.length < 2) {
      throw new ConflictError('Financial ledger postings require at least two entries');
    }

    const debit = input.entries
      .filter((entry) => entry.direction === 'DEBIT')
      .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    const credit = input.entries
      .filter((entry) => entry.direction === 'CREDIT')
      .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));

    if (!debit.equals(credit) || !debit.isPositive()) {
      throw new ConflictError('Financial ledger entries must balance exactly');
    }

    const accountIds = input.entries.map((entry) => toObjectId(entry.ledgerAccountId, 'ledgerAccountId'));
    const accounts = await FinancialLedgerAccountModel.find({
      _id: { $in: accountIds },
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      active: true,
      allowDirectPosting: true,
    })
      .session(session)
      .lean()
      .exec();

    if (accounts.length !== new Set(accountIds.map((id) => id.toHexString())).size) {
      throw new ConflictError('A ledger account is inactive or does not allow direct posting');
    }

    const accountCode = new Map(
      accounts.map((account) => [
        account._id.toHexString(),
        account.accountCode,
      ]),
    );
    const journalNumber = await this.sequences.next(
      input.facilityId,
      'payments.financial_journal',
      input.postedAt,
      session,
    );
    const ledgerTransactionId = createObjectId();
    const actorId = toObjectId(input.postedBy, 'postedBy');
    const facilityId = toObjectId(input.facilityId, 'facilityId');

    const [created] = await FinancialLedgerTransactionModel.create([
      {
        _id: ledgerTransactionId,
        facilityId,
        transactionId: input.transactionId,
        correlationId: input.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorId,
        updatedBy: actorId,
        operationKey: input.operationKey,
        journalNumber,
        sourceModule: 'PAYMENTS_CASHIER_SHIFTS',
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: toObjectId(input.sourceEntityId, 'sourceEntityId'),
        patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
        patientAccountId: input.patientAccountId == null ? null : toObjectId(input.patientAccountId, 'patientAccountId'),
        invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
        paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
        cashShiftId: input.cashShiftId == null ? null : toObjectId(input.cashShiftId, 'cashShiftId'),
        cashCounterId: input.cashCounterId == null ? null : toObjectId(input.cashCounterId, 'cashCounterId'),
        currency: input.currency,
        totalDebit: Decimal128.fromString(debit.toFixed()),
        totalCredit: Decimal128.fromString(credit.toFixed()),
        entryCount: input.entries.length,
        status: 'POSTED',
        postedAt: input.postedAt,
        postedBy: actorId,
        description: input.description,
        reversalOfTransactionId: null,
        reversedByTransactionId: null,
        reversalReason: null,
        closedPeriodCode: null,
      },
    ], {
      session,
    });

    await FinancialLedgerEntryModel.create(
      input.entries.map((entry, index) => ({
        facilityId,
        transactionId: input.transactionId,
        correlationId: input.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorId,
        updatedBy: actorId,
        ledgerTransactionId,
        lineNumber: index + 1,
        ledgerAccountId: toObjectId(entry.ledgerAccountId, 'ledgerAccountId'),
        ledgerAccountCodeSnapshot: accountCode.get(entry.ledgerAccountId) ?? 'UNKNOWN',
        direction: entry.direction,
        amount: Decimal128.fromString(new Decimal(entry.amount).toFixed()),
        currency: input.currency,
        patientId: input.patientId == null ? null : toObjectId(input.patientId, 'patientId'),
        patientAccountId: input.patientAccountId == null ? null : toObjectId(input.patientAccountId, 'patientAccountId'),
        invoiceId: input.invoiceId == null ? null : toObjectId(input.invoiceId, 'invoiceId'),
        paymentId: input.paymentId == null ? null : toObjectId(input.paymentId, 'paymentId'),
        departmentId: null,
        serviceLineCode: null,
        chargeCatalogItemId: null,
        description: entry.description,
        postedAt: input.postedAt,
      })),
      {
        session,
        ordered: true,
      },
    );

    return created.toObject() as FinancialLedgerTransactionRecord;
  }
}

export function createPaymentsCashierShiftsRuntimeAdapters(input: Readonly<{
  database: Db;
  auditRepository: AuditRepository;
  idempotency: IdempotencyService;
  locks: OperationLockService;
  publishRealtime(message: Readonly<{
    facilityId: string;
    eventType: string;
    entityId: string;
    counterId?: string | null;
    shiftId?: string | null;
    status?: string;
    occurredAt: string;
  }>): Promise<void>;
}>) {
  const sequence = new MongoPaymentCashierSequenceAdapter(input.database);

  return {
    idempotency: new MongoPaymentCashierIdempotencyAdapter(input.idempotency),
    locks: new MongoPaymentCashierLockAdapter(input.locks),
    sequence,
    audit: new MongoPaymentCashierAuditAdapter(input.database, input.auditRepository),
    outbox: new MongoPaymentCashierOutboxAdapter(input.database),
    realtime: new PaymentCashierRealtimeAdapter(input.publishRealtime),
    approvals: new MongoFinancialApprovalAdapter(sequence),
    ledger: new MongoPaymentLedgerAdapter(sequence),
    clock: Object.freeze({
      now: () => new Date(),
    }),
  };
}

export type PaymentsCashierShiftsRuntimeAdapters = ReturnType<
  typeof createPaymentsCashierShiftsRuntimeAdapters
>;