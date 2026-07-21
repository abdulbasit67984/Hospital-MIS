import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  ClientSession,
} from 'mongoose';

import type {
  AllocatePaymentInput,
  ApplyDepositInput,
  CashierShiftView,
  CollectPaymentInput,
  CreateCashCounterInput,
  CreateCashMovementInput,
  CreateDepositInput,
  CreatePaymentIntentInput,
  CreatePaymentMethodConfigurationInput,
  CreatePaymentReversalInput,
  CreateRefundRequestInput,
  PaymentCashierAccessDecision,
  PaymentCashierAccessRequest,
  PaymentCashierActorContext,
  PaymentCashierListQuery,
  PaymentCashierPage,
  PaymentTenderInput,
  TransferDepositInput,
} from './payments-cashier-shifts.contracts.js';

import type {
  CashCounterRecord,
  CashCounterUpdate,
  CashierShiftRecord,
  CashierShiftUpdate,
  CashMovementRecord,
  DepositApplicationRecord,
  DepositRecord,
  DepositTransferRecord,
  FinancialApprovalRecord,
  FinancialLedgerTransactionRecord,
  InvoiceFinancialRecord,
  PatientAccountFinancialRecord,
  PaymentActorIdentityRecord,
  PaymentAllocationRecord,
  PaymentCashierMongoSession,
  PaymentIntentRecord,
  PaymentMethodConfigurationRecord,
  PaymentMethodConfigurationUpdate,
  PaymentOperationalHistoryRecord,
  PaymentReceiptRecord,
  PaymentRecord,
  PaymentTenderRecord,
  PaymentReversalRecord,
  PaymentStaffRecord,
  PaymentUpdate,
  ReceiptReprintRecord,
  RefundRecord,
  RefundRequestRecord,
  ShiftReconciliationRecord,
} from './payments-cashier-shifts.persistence.types.js';

export interface PaymentCashierActorResolverInput {
  userId: string;
  facilityId: string;
  correlationId: string;
  permissions:
    ReadonlySet<PermissionKey>;
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface PaymentCashierActorResolverPort {
  resolve(
    input:
      PaymentCashierActorResolverInput,
  ): Promise<PaymentCashierActorContext>;
}

export interface PaymentCashierAccessPolicyPort {
  decide(
    request:
      PaymentCashierAccessRequest,
  ): PaymentCashierAccessDecision;

  require(
    request:
      PaymentCashierAccessRequest,
  ): PaymentCashierAccessDecision;
}

export interface PaymentCashierContextRepositoryPort {
  findActorIdentity(
    userId: string,
  ): Promise<
    PaymentActorIdentityRecord | null
  >;

  findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<
    PaymentStaffRecord | null
  >;

  listAssignedCounterIds(
    facilityId: string,
    userId: string,
  ): Promise<string[]>;
}

export interface PaymentConfigurationRepositoryPort {
  findPaymentMethodById(
    facilityId: string,
    paymentMethodConfigurationId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentMethodConfigurationRecord | null
  >;

  findPaymentMethodByCode(
    facilityId: string,
    code: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentMethodConfigurationRecord | null
  >;

  listPaymentMethods(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      PaymentMethodConfigurationRecord
    >
  >;

  createPaymentMethod(
    input:
      CreatePaymentMethodConfigurationInput,

    metadata:
      Readonly<{
        facilityId: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentMethodConfigurationRecord
  >;

  updatePaymentMethod(
    facilityId: string,
    paymentMethodConfigurationId: string,
    expectedVersion: number,
    update:
      PaymentMethodConfigurationUpdate,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentMethodConfigurationRecord | null
  >;

  findCounterById(
    facilityId: string,
    counterId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    CashCounterRecord | null
  >;

  findCounterByCode(
    facilityId: string,
    counterCode: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    CashCounterRecord | null
  >;

  listCounters(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      CashCounterRecord
    >
  >;

  createCounter(
    input:
      CreateCashCounterInput,

    metadata:
      Readonly<{
        facilityId: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashCounterRecord
  >;

  updateCounter(
    facilityId: string,
    counterId: string,
    expectedVersion: number,
    update:
      CashCounterUpdate,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashCounterRecord | null
  >;
}

export interface CashierShiftRepositoryPort {
  findById(
    facilityId: string,
    shiftId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    CashierShiftRecord | null
  >;

  findActiveForPolicy(
    facilityId: string,
    counterId: string,
    cashierUserId: string,
    policy: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    CashierShiftRecord | null
  >;

  list(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      CashierShiftRecord
    >
  >;

  create(
    record:
      Omit<
        CashierShiftRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashierShiftRecord
  >;

  update(
    facilityId: string,
    shiftId: string,
    expectedVersion: number,
    update:
      CashierShiftUpdate,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashierShiftRecord | null
  >;

  createReconciliation(
    record:
      Omit<
        ShiftReconciliationRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    ShiftReconciliationRecord
  >;

  findReconciliationByShift(
    facilityId: string,
    shiftId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    ShiftReconciliationRecord | null
  >;

  updateReconciliation(
    facilityId: string,
    reconciliationId: string,
    expectedVersion: number,
    update:
      Partial<ShiftReconciliationRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    ShiftReconciliationRecord | null
  >;
}

export interface PaymentRepositoryPort {
  findIntentById(
    facilityId: string,
    intentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentIntentRecord | null
  >;

  findIntentByOperationKey(
    facilityId: string,
    operationKey: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentIntentRecord | null
  >;

  createIntent(
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
  ): Promise<
    PaymentIntentRecord
  >;

  updateIntent(
    facilityId: string,
    intentId: string,
    expectedVersion: number,
    update:
      Partial<PaymentIntentRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentIntentRecord | null
  >;

  listExpiredIntents(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<
    PaymentIntentRecord[]
  >;

  findPaymentById(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentRecord | null
  >;

  findPaymentByOperationKey(
    facilityId: string,
    operationKey: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentRecord | null
  >;

  listPayments(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      PaymentRecord
    >
  >;

  createPayment(
    input:
      CollectPaymentInput,

    prepared:
      Readonly<{
        operationKey: string;
        paymentNumber: string;
        receiptNumber: string;
        patientId: string;
        authoritativeAmount: string;
        paymentMethod: string;
        externalReference: string | null;
        actorUserId: string;
        actorStaffId: string;
        receivedAt: Date;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentRecord
  >;

  updatePayment(
    facilityId: string,
    paymentId: string,
    expectedVersion: number,
    update:
      PaymentUpdate,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentRecord | null
  >;

  createTenders(
    facilityId: string,
    paymentId: string,
    tenders:
      readonly PaymentTenderInput[],

    metadata:
      Readonly<{
        operationKeyPrefix: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentTenderRecord[]
  >;

  listTenders(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentTenderRecord[]
  >;

  listAllocations(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentAllocationRecord[]
  >;

  createAllocations(
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
  ): Promise<
    PaymentAllocationRecord[]
  >;

  reverseAllocations(
    facilityId: string,
    allocationIds:
      readonly string[],
    reason: string,
    actorUserId: string,
    reversedAt: Date,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentAllocationRecord[]
  >;
}

export interface PaymentReceiptRepositoryPort {
  findById(
    facilityId: string,
    receiptId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReceiptRecord | null
  >;

  findByPaymentId(
    facilityId: string,
    paymentId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReceiptRecord | null
  >;

  create(
    record:
      Omit<
        PaymentReceiptRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReceiptRecord
  >;

  createReprint(
    record:
      Omit<
        ReceiptReprintRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    ReceiptReprintRecord
  >;

  updateStatus(
    facilityId: string,
    receiptId: string,
    expectedVersion: number,
    update:
      Partial<PaymentReceiptRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReceiptRecord | null
  >;
}

export interface DepositRepositoryPort {
  findById(
    facilityId: string,
    depositId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    DepositRecord | null
  >;

  list(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      DepositRecord
    >
  >;

  create(
    input:
      CreateDepositInput,

    prepared:
      Readonly<{
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
  ): Promise<
    DepositRecord
  >;

  update(
    facilityId: string,
    depositId: string,
    expectedVersion: number,
    update:
      Partial<DepositRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    DepositRecord | null
  >;

  createApplication(
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
  ): Promise<
    DepositApplicationRecord
  >;

  createTransfer(
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
  ): Promise<
    DepositTransferRecord
  >;
}

export interface RefundReversalRepositoryPort {
  findRefundRequestById(
    facilityId: string,
    requestId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRequestRecord | null
  >;

  createRefundRequest(
    input:
      CreateRefundRequestInput,

    prepared:
      Readonly<{
        operationKey: string;
        requestNumber: string;
        patientId: string;
        currency: string;
        approvalRequestId: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRequestRecord
  >;

  updateRefundRequest(
    facilityId: string,
    requestId: string,
    expectedVersion: number,
    update:
      Partial<RefundRequestRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRequestRecord | null
  >;

  findRefundById(
    facilityId: string,
    refundId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRecord | null
  >;

  createRefund(
    record:
      Omit<
        RefundRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRecord
  >;

  updateRefund(
    facilityId: string,
    refundId: string,
    expectedVersion: number,
    update:
      Partial<RefundRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    RefundRecord | null
  >;

  findReversalById(
    facilityId: string,
    reversalId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReversalRecord | null
  >;

  createReversal(
    input:
      CreatePaymentReversalInput,

    prepared:
      Readonly<{
        operationKey: string;
        reversalNumber: string;
        patientAccountId: string;
        approvalRequestId: string;
        actorUserId: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReversalRecord
  >;

  updateReversal(
    facilityId: string,
    reversalId: string,
    expectedVersion: number,
    update:
      Partial<PaymentReversalRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentReversalRecord | null
  >;
}

export interface CashMovementRepositoryPort {
  findById(
    facilityId: string,
    movementId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<
    CashMovementRecord | null
  >;

  list(
    facilityId: string,
    query:
      PaymentCashierListQuery,
  ): Promise<
    PaymentCashierPage<
      CashMovementRecord
    >
  >;

  create(
    input:
      CreateCashMovementInput,

    prepared:
      Readonly<{
        operationKey: string;
        movementNumber: string;
        expectedCashEffect: string;
        actorUserId: string;
        requestedAt: Date;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashMovementRecord
  >;

  update(
    facilityId: string,
    movementId: string,
    expectedVersion: number,
    update:
      Partial<CashMovementRecord>,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    CashMovementRecord | null
  >;
}

export interface UnifiedBillingPaymentsPort {
  resolvePatientAccount(
    facilityId: string,
    patientAccountId: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    PatientAccountFinancialRecord | null
  >;

  resolveInvoice(
    facilityId: string,
    invoiceId: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    InvoiceFinancialRecord | null
  >;

  validateAllocations(
    facilityId: string,
    patientAccountId: string,
    allocations:
      AllocatePaymentInput['allocations'],

    session:
      PaymentCashierMongoSession,
  ): Promise<
    Readonly<{
      authoritativeAllocationTotal: string;
      account:
        PatientAccountFinancialRecord;
      invoices:
        readonly InvoiceFinancialRecord[];
    }>
  >;

  applyPayment(
    facilityId: string,
    payment: PaymentRecord,
    allocations:
      readonly PaymentAllocationRecord[],
    session:
      PaymentCashierMongoSession,
  ): Promise<void>;

  reversePaymentEffects(
    facilityId: string,
    payment: PaymentRecord,
    allocations:
      readonly PaymentAllocationRecord[],
    amount: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<void>;

  applyRefundEffects(
    facilityId: string,
    refund: RefundRecord,

    reversedAllocations:
      readonly PaymentAllocationRecord[],

    session:
      PaymentCashierMongoSession,
  ): Promise<void>;

  assertFinancialDischargeEligibility(
    facilityId: string,
    patientAccountId: string,
    session?:
      PaymentCashierMongoSession,
  ): Promise<void>;
}

export interface FinancialApprovalPort {
  createRequest(
    input:
      Readonly<{
        facilityId: string;
        approvalType: string;
        paymentId?: string | null;
        requestedAmount?: string | null;
        reason: string;
        requestedBy: string;
        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    FinancialApprovalRecord
  >;

  requireApproved(
    facilityId: string,
    approvalRequestId: string,
    expectedType: string,
    makerUserId: string,
    session:
      PaymentCashierMongoSession,
  ): Promise<
    FinancialApprovalRecord
  >;
}

export interface PaymentLedgerPort {
  postBalancedTransaction(
    input:
      Readonly<{
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
        paymentMethodConfigurationId?:
          string | null;
        currency: string;
        description: string;
        postedAt: Date;
        postedBy: string;

        entries:
          readonly Readonly<{
            ledgerAccountId: string;
            direction:
              | 'DEBIT'
              | 'CREDIT';
            amount: string;
            description: string;
          }>[];

        transactionId: string;
        correlationId: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    FinancialLedgerTransactionRecord
  >;
}

export interface PaymentOperationalHistoryPort {
  append(
    record:
      Omit<
        PaymentOperationalHistoryRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >,

    session:
      PaymentCashierMongoSession,
  ): Promise<
    PaymentOperationalHistoryRecord
  >;
}

export interface PaymentCashierSequencePort {
  next(
    facilityId: string,
    sequenceKey: string,
    at: Date,
    session:
      PaymentCashierMongoSession,
  ): Promise<string>;
}

export interface PaymentCashierIdempotencyPort {
  begin(
    input:
      Readonly<{
        facilityId: string;
        operation: string;
        idempotencyKey: string;
        requestHash: string;
        actorUserId: string;
        correlationId: string;
      }>,
  ): Promise<
    Readonly<{
      state:
        | 'ACQUIRED'
        | 'REPLAY'
        | 'IN_PROGRESS'
        | 'CONFLICT';

      operationKey:
        string;

      response?:
        unknown;
    }>
  >;

  complete(
    operationKey: string,
    response: unknown,
  ): Promise<void>;

  fail(
    operationKey: string,
    errorCode: string,
  ): Promise<void>;
}

export interface PaymentCashierDistributedLockPort {
  withLock<T>(
    resourceKey: string,
    ownerKey: string,
    work: () => Promise<T>,
  ): Promise<T>;
}

export interface PaymentCashierTransactionManagerPort {
  run<T>(
    context:
      Readonly<{
        facilityId: string;
        actorUserId: string;
        correlationId: string;
        operation: string;
        operationKey: string;
      }>,

    work:
      (
        session: ClientSession,
        transactionId: string,
      ) => Promise<T>,
  ): Promise<T>;
}

export interface PaymentCashierAuditPort {
  record(
    input:
      Readonly<{
        facilityId: string;
        actorUserId: string;
        actorStaffId: string;
        action: string;
        entityType: string;
        entityId: string;
        reason?: string | null;

        before?:
          Record<string, unknown> | null;

        after?:
          Record<string, unknown> | null;

        correlationId: string;
        transactionId: string;
        ipAddress?: string;
        userAgent?: string;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<void>;
}

export interface PaymentCashierOutboxPort {
  publish(
    input:
      Readonly<{
        facilityId: string;
        aggregateType: string;
        aggregateId: string;
        eventType: string;
        payload:
          Record<string, unknown>;
        correlationId: string;
        transactionId: string;
        occurredAt: Date;
      }>,

    session:
      PaymentCashierMongoSession,
  ): Promise<void>;
}

export interface PaymentCashierRealtimePort {
  publishMinimumNecessary(
    event:
      Readonly<{
        facilityId: string;
        eventType: string;
        entityId: string;
        counterId?: string | null;
        shiftId?: string | null;
        status?: string;
        occurredAt: string;
      }>,
  ): Promise<void>;
}

export interface PaymentCashierJournalPort {
  recordStep(
    input:
      Readonly<{
        transactionId: string;
        facilityId: string;
        operationKey: string;
        step: string;

        status:
          | 'STARTED'
          | 'COMPLETED'
          | 'FAILED'
          | 'RECOVERED';

        entityType?: string;
        entityId?: string;
        errorCode?: string;

        metadata?:
          Record<string, unknown>;
      }>,

    session?:
      PaymentCashierMongoSession,
  ): Promise<void>;

  listIncomplete(
    facilityId: string,
    operationTypes:
      readonly string[],
    limit: number,
  ): Promise<
    readonly Readonly<{
      transactionId: string;
      operationKey: string;
      operationType: string;
      lastCompletedStep:
        string | null;
    }>[]
  >;
}

export interface PaymentCashierReportPort {
  buildShiftSummary(
    facilityId: string,
    shiftId: string,
    actor:
      PaymentCashierActorContext,
  ): Promise<
    CashierShiftView
  >;

  exportCsv(
    facilityId: string,
    reportType: string,
    query:
      PaymentCashierListQuery,
    actor:
      PaymentCashierActorContext,
  ): Promise<
    Readonly<{
      filename: string;
      contentType: 'text/csv';
      content: string;
    }>
  >;
}

export interface PaymentMethodTenderValidationPort {
  validate(
    method:
      PaymentMethodConfigurationRecord,

    tender:
      PaymentTenderInput,

    context:
      Readonly<{
        currency: string;
        counter: CashCounterRecord;
        shift: CashierShiftRecord;
        actor:
          PaymentCashierActorContext;
        at: Date;
      }>,
  ): Promise<void>;
}