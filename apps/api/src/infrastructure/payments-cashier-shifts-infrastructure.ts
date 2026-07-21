import type {
  Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createPaymentsCashierShiftsApplication,
} from '../modules/payments-cashier-shifts/payments-cashier-shifts.application.js';

import {
  MongoCashMovementRepository,
} from '../modules/payments-cashier-shifts/repositories/cash-movement.repository.js';

import {
  MongoCashierShiftRepository,
} from '../modules/payments-cashier-shifts/repositories/cashier-shift.repository.js';

import {
  MongoPaymentCashierContextRepository,
} from '../modules/payments-cashier-shifts/repositories/payment-cashier-context.repository.js';

import {
  MongoPaymentConfigurationRepository,
} from '../modules/payments-cashier-shifts/repositories/payment-configuration.repository.js';

import {
  MongoDepositRepository,
  MongoPaymentReceiptRepository,
  MongoPaymentRepository,
} from '../modules/payments-cashier-shifts/repositories/payment-finance.repository.js';

import {
  MongoPaymentOperationalHistoryRepository,
} from '../modules/payments-cashier-shifts/repositories/payment-operational-history.repository.js';

import {
  MongoRefundReversalRepository,
} from '../modules/payments-cashier-shifts/repositories/refund-reversal.repository.js';

import {
  MongoShiftReconciliationQueryRepository,
} from '../modules/payments-cashier-shifts/repositories/shift-reconciliation-query.repository.js';

import {
  CashCounterService,
} from '../modules/payments-cashier-shifts/services/cash-counter.service.js';

import {
  CashMovementService,
} from '../modules/payments-cashier-shifts/services/cash-movement.service.js';

import {
  CashierShiftService,
} from '../modules/payments-cashier-shifts/services/cashier-shift.service.js';

import {
  CashierShiftStateMachineService,
} from '../modules/payments-cashier-shifts/services/cashier-shift-state-machine.service.js';

import {
  DepositAdvanceService,
} from '../modules/payments-cashier-shifts/services/deposit-advance.service.js';

import {
  PaymentCashierActorResolverService,
} from '../modules/payments-cashier-shifts/services/payment-cashier-actor-resolver.service.js';

import {
  PaymentCashierCommandSupport,
} from '../modules/payments-cashier-shifts/services/payment-cashier-command-support.js';

import {
  PaymentCollectionService,
} from '../modules/payments-cashier-shifts/services/payment-collection.service.js';

import {
  PaymentFinancialControlService,
} from '../modules/payments-cashier-shifts/services/payment-financial-control.service.js';

import {
  PaymentIntentService,
} from '../modules/payments-cashier-shifts/services/payment-intent.service.js';

import {
  PaymentMethodConfigurationService,
} from '../modules/payments-cashier-shifts/services/payment-method-configuration.service.js';

import {
  PaymentMethodTenderValidationService,
} from '../modules/payments-cashier-shifts/services/payment-method-tender-validation.service.js';

import {
  PaymentQueryReportService,
} from '../modules/payments-cashier-shifts/services/payment-query-report.service.js';

import {
  PaymentReceiptService,
} from '../modules/payments-cashier-shifts/services/payment-receipt.service.js';

import {
  PaymentRecoveryService,
} from '../modules/payments-cashier-shifts/services/payment-recovery.service.js';

import {
  PaymentsCashierShiftsAccessPolicyService,
} from '../modules/payments-cashier-shifts/services/payments-cashier-shifts-access-policy.service.js';

import {
  RefundReversalService,
} from '../modules/payments-cashier-shifts/services/refund-reversal.service.js';

import {
  ShiftReconciliationService,
} from '../modules/payments-cashier-shifts/services/shift-reconciliation.service.js';

import {
  MongoUnifiedBillingPaymentsAdapter,
} from '../modules/payments-cashier-shifts/services/unified-billing-payments.adapter.js';

import {
  PaymentsCashierShiftsBackgroundJobs,
} from './payments-cashier-shifts-background-jobs.js';

import {
  createPaymentsCashierShiftsRuntimeAdapters,
} from './payments-cashier-shifts-runtime.adapters.js';

import {
  MongoPaymentsCashierShiftsTransactionManagerAdapter,
} from './payments-cashier-shifts-transaction-manager.adapter.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

export interface CreatePaymentsCashierShiftsInfrastructureOptions {
  database: Db;
  auditRepository: AuditRepository;
  operationalInfrastructure: ReturnType<typeof createOperationalInfrastructure>;
  publishRealtime(message: Readonly<{
    facilityId: string;
    eventType: string;
    entityId: string;
    counterId?: string | null;
    shiftId?: string | null;
    status?: string;
    occurredAt: string;
  }>): Promise<void>;
}

export function createPaymentsCashierShiftsInfrastructure(
  options: CreatePaymentsCashierShiftsInfrastructureOptions,
) {
  const contextRepository = new MongoPaymentCashierContextRepository();
  const configuration = new MongoPaymentConfigurationRepository();
  const shifts = new MongoCashierShiftRepository();
  const history = new MongoPaymentOperationalHistoryRepository();
  const payments = new MongoPaymentRepository();
  const receipts = new MongoPaymentReceiptRepository();
  const deposits = new MongoDepositRepository();
  const controls = new MongoRefundReversalRepository();
  const movements = new MongoCashMovementRepository();
  const reconciliationQuery = new MongoShiftReconciliationQueryRepository();

  const accessPolicy = new PaymentsCashierShiftsAccessPolicyService();
  const actorResolver = new PaymentCashierActorResolverService(contextRepository);
  const stateMachine = new CashierShiftStateMachineService();
  const billing = new MongoUnifiedBillingPaymentsAdapter();
  const tenderValidation = new PaymentMethodTenderValidationService(accessPolicy);
  const financialControl = new PaymentFinancialControlService();

  const runtime = createPaymentsCashierShiftsRuntimeAdapters({
    database: options.database,
    auditRepository: options.auditRepository,
    idempotency: options.operationalInfrastructure.idempotency,
    locks: options.operationalInfrastructure.locks,
    publishRealtime: options.publishRealtime,
  });

  const transactionManager = new MongoPaymentsCashierShiftsTransactionManagerAdapter(
    options.database,
    options.operationalInfrastructure.transactionRepository,
    options.operationalInfrastructure.outbox,
  );

  const commandSupport = new PaymentCashierCommandSupport(
    runtime.idempotency,
    runtime.locks,
    transactionManager,
    history,
    runtime.sequence,
  );

  const paymentMethods = new PaymentMethodConfigurationService({
    repository: configuration,
    accessPolicy,
    commandSupport,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const counters = new CashCounterService({
    repository: configuration,
    shifts,
    accessPolicy,
    commandSupport,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const cashierShifts = new CashierShiftService({
    configuration,
    shifts,
    accessPolicy,
    approvals: runtime.approvals,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    stateMachine,
    clock: runtime.clock,
  });

  const paymentIntents = new PaymentIntentService({
    payments,
    configuration,
    shifts,
    billing,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const paymentCollection = new PaymentCollectionService({
    configuration,
    shifts,
    payments,
    receipts,
    billing,
    tenderValidation,
    ledger: runtime.ledger,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const depositAdvances = new DepositAdvanceService({
    deposits,
    payments,
    configuration,
    billing,
    approvals: runtime.approvals,
    ledger: runtime.ledger,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const refundsAndReversals = new RefundReversalService({
    controls,
    payments,
    deposits,
    receipts,
    configuration,
    shifts,
    financialControl,
    billing,
    ledger: runtime.ledger,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const cashMovements = new CashMovementService({
    movements,
    shifts,
    configuration,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const reconciliations = new ShiftReconciliationService({
    shifts,
    configuration,
    query: reconciliationQuery,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    stateMachine,
    clock: runtime.clock,
  });

  const receiptService = new PaymentReceiptService({
    receipts,
    accessPolicy,
    commandSupport,
    sequences: runtime.sequence,
    audit: runtime.audit,
    outbox: runtime.outbox,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const reports = new PaymentQueryReportService({
    payments,
    controls,
    shifts: cashierShifts,
    reconciliations,
    accessPolicy,
    clock: runtime.clock,
  });

  const recovery = new PaymentRecoveryService({
    accessPolicy,
    recovery: transactionManager,
    realtime: runtime.realtime,
    clock: runtime.clock,
  });

  const application = createPaymentsCashierShiftsApplication({
    paymentMethods,
    counters,
    shifts: cashierShifts,
    paymentIntents,
    payments: paymentCollection,
    deposits: depositAdvances,
    refundsAndReversals,
    cashMovements,
    reconciliations,
    receipts: receiptService,
    reports,
    recovery,
  });

  const backgroundJobs = new PaymentsCashierShiftsBackgroundJobs({
    recovery,
  });

  return {
    application,
    actorResolver,
    accessPolicy,
    transactionManager,
    recovery: transactionManager,
    backgroundJobs,
    runtime,
    repositories: {
      context: contextRepository,
      configuration,
      shifts,
      history,
      payments,
      receipts,
      deposits,
      controls,
      movements,
      reconciliationQuery,
    },
  };
}

export type PaymentsCashierShiftsInfrastructure = ReturnType<
  typeof createPaymentsCashierShiftsInfrastructure
>;
