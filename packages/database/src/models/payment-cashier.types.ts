export const paymentMethodCodeValues = [
  'CASH',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'BANK_DEPOSIT',
  'CHEQUE',
  'MOBILE_WALLET',
  'ONLINE_PAYMENT',
  'CORPORATE_SETTLEMENT',
  'PANEL_SETTLEMENT',
  'OTHER',
] as const;

export const paymentMethodKindValues = [
  'CASH',
  'CARD',
  'BANK',
  'WALLET',
  'ONLINE',
  'SETTLEMENT',
  'OTHER',
] as const;

export const paymentSettlementModeValues = [
  'IMMEDIATE',
  'DELAYED',
  'EXTERNAL',
] as const;

export const cashCounterTypeValues = [
  'REGISTRATION',
  'PHARMACY',
  'BILLING',
  'EMERGENCY',
  'OTHER',
] as const;

export const activeShiftPolicyValues = [
  'CASHIER_AND_COUNTER',
  'CASHIER',
  'COUNTER',
] as const;

export const cashierShiftStatusValues = [
  'OPEN',
  'SUSPENDED',
  'CLOSING_IN_PROGRESS',
  'CLOSED',
] as const;

export const shiftReconciliationStatusValues = [
  'DRAFT',
  'BLOCKED',
  'PENDING_APPROVAL',
  'APPROVED',
  'CLOSED',
] as const;

export const paymentReceiptStatusValues = [
  'ISSUED',
  'REVERSED',
  'REFUNDED',
  'CORRECTED',
] as const;

export const receiptCopyTypeValues = [
  'DUPLICATE',
  'REPRINT',
] as const;

export const cashMovementTypeValues = [
  'OPENING_FLOAT',
  'CASH_COLLECTION',
  'CASH_REFUND',
  'CASH_PAID_OUT',
  'CASH_DROP',
  'SAFE_DEPOSIT',
  'COUNTER_TRANSFER',
  'SHIFT_TRANSFER',
] as const;

export const cashMovementStatusValues = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
] as const;

export const paymentOperationalEntityTypeValues = [
  'PAYMENT_METHOD_CONFIGURATION',
  'CASH_COUNTER',
  'CASH_SHIFT',
  'SHIFT_RECONCILIATION',
  'PAYMENT_INTENT',
  'PAYMENT',
  'PAYMENT_ALLOCATION',
  'DEPOSIT',
  'RECEIPT',
  'REFUND_REQUEST',
  'REFUND',
  'PAYMENT_REVERSAL',
  'CASH_MOVEMENT',
] as const;

export const paymentOperationalActionValues = [
  'CREATED',
  'UPDATED',
  'ACTIVATED',
  'DEACTIVATED',
  'OPENED',
  'SUSPENDED',
  'RESUMED',
  'CLOSING_STARTED',
  'CLOSING_BLOCKED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CLOSED',
  'REOPENED',
  'AUTHORIZED',
  'CAPTURED',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'ALLOCATED',
  'REALLOCATED',
  'APPLIED',
  'RELEASED',
  'TRANSFERRED',
  'ISSUED',
  'REPRINTED',
  'REFUNDED',
  'REVERSED',
  'CORRECTED',
  'POSTED',
  'RECOVERED',
] as const;

export type PaymentMethodCode =
  (typeof paymentMethodCodeValues)[number];

export type PaymentMethodKind =
  (typeof paymentMethodKindValues)[number];

export type CashCounterType =
  (typeof cashCounterTypeValues)[number];

export type CashierShiftStatus =
  (typeof cashierShiftStatusValues)[number];

export type CashMovementType =
  (typeof cashMovementTypeValues)[number];