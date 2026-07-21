import type {
  CashCounterService,
} from './services/cash-counter.service.js';

import type {
  CashMovementService,
} from './services/cash-movement.service.js';

import type {
  CashierShiftService,
} from './services/cashier-shift.service.js';

import type {
  DepositAdvanceService,
} from './services/deposit-advance.service.js';

import type {
  PaymentCollectionService,
} from './services/payment-collection.service.js';

import type {
  PaymentIntentService,
} from './services/payment-intent.service.js';

import type {
  PaymentMethodConfigurationService,
} from './services/payment-method-configuration.service.js';

import type {
  PaymentQueryReportService,
} from './services/payment-query-report.service.js';

import type {
  PaymentReceiptService,
} from './services/payment-receipt.service.js';

import type {
  PaymentRecoveryService,
} from './services/payment-recovery.service.js';

import type {
  RefundReversalService,
} from './services/refund-reversal.service.js';

import type {
  ShiftReconciliationService,
} from './services/shift-reconciliation.service.js';

export interface PaymentsCashierShiftsApplication {
  readonly services: Readonly<{
    paymentMethods: PaymentMethodConfigurationService;
    counters: CashCounterService;
    shifts: CashierShiftService;
    paymentIntents: PaymentIntentService;
    payments: PaymentCollectionService;
    deposits: DepositAdvanceService;
    refundsAndReversals: RefundReversalService;
    cashMovements: CashMovementService;
    reconciliations: ShiftReconciliationService;
    receipts: PaymentReceiptService;
    reports: PaymentQueryReportService;
    recovery: PaymentRecoveryService;
  }>;
}

export function createPaymentsCashierShiftsApplication(
  services: PaymentsCashierShiftsApplication['services'],
): PaymentsCashierShiftsApplication {
  return {
    services: Object.freeze({
      ...services,
    }),
  };
}
