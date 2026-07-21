import {
  activeShiftPolicyValues,
  allocationStatusValues,
  cashCounterTypeValues,
  cashierShiftStatusValues,
  cashMovementStatusValues,
  cashMovementTypeValues,
  depositStatusValues,
  paymentIntentStatusValues,
  paymentMethodCodeValues,
  paymentMethodKindValues,
  paymentOperationalActionValues,
  paymentOperationalEntityTypeValues,
  paymentReceiptStatusValues,
  paymentReversalStatusValues,
  paymentSettlementModeValues,
  paymentStatusValues,
  receiptCopyTypeValues,
  refundRequestStatusValues,
  refundStatusValues,
  shiftReconciliationStatusValues,
} from '@hospital-mis/database';

export type PaymentCashierObjectIdString = string;
export type PaymentCashierSortDirection = 'asc' | 'desc';
export type PaymentCashierCurrency = 'PKR';

export type PaymentMethodCode =
  (typeof paymentMethodCodeValues)[number];

export type PaymentMethodKind =
  (typeof paymentMethodKindValues)[number];

export type PaymentSettlementMode =
  (typeof paymentSettlementModeValues)[number];

export type CashCounterType =
  (typeof cashCounterTypeValues)[number];

export type ActiveShiftPolicy =
  (typeof activeShiftPolicyValues)[number];

export type CashierShiftStatus =
  (typeof cashierShiftStatusValues)[number];

export type ShiftReconciliationStatus =
  (typeof shiftReconciliationStatusValues)[number];

export type PaymentIntentStatus =
  (typeof paymentIntentStatusValues)[number];

export type PaymentStatus =
  (typeof paymentStatusValues)[number];

export type PaymentAllocationStatus =
  (typeof allocationStatusValues)[number];

export type DepositStatus =
  (typeof depositStatusValues)[number];

export type RefundRequestStatus =
  (typeof refundRequestStatusValues)[number];

export type RefundStatus =
  (typeof refundStatusValues)[number];

export type PaymentReversalStatus =
  (typeof paymentReversalStatusValues)[number];

export type PaymentReceiptStatus =
  (typeof paymentReceiptStatusValues)[number];

export type ReceiptCopyType =
  (typeof receiptCopyTypeValues)[number];

export type CashMovementType =
  (typeof cashMovementTypeValues)[number];

export type CashMovementStatus =
  (typeof cashMovementStatusValues)[number];

export type PaymentOperationalEntityType =
  (typeof paymentOperationalEntityTypeValues)[number];

export type PaymentOperationalAction =
  (typeof paymentOperationalActionValues)[number];

export const PAYMENT_CASHIER_PERMISSION_KEYS = {
  PAYMENT_METHOD_READ:
    'payments.methods.read',

  PAYMENT_METHOD_MANAGE:
    'payments.methods.manage',

  COUNTER_READ:
    'payments.counters.read',

  COUNTER_MANAGE:
    'payments.counters.manage',

  COUNTER_ASSIGN:
    'payments.counters.assign',

  SHIFT_READ:
    'cash_shifts.read',

  SHIFT_OPEN:
    'cash_shifts.open',

  SHIFT_SUSPEND:
    'cash_shifts.suspend',

  SHIFT_RESUME:
    'cash_shifts.resume',

  SHIFT_HANDOVER:
    'cash_shifts.handover',

  SHIFT_RECONCILE:
    'cash_shifts.reconcile',

  SHIFT_CLOSE:
    'cash_shifts.close',

  SHIFT_REOPEN:
    'cash_shifts.reopen',

  SHIFT_VARIANCE_APPROVE:
    'cash_shifts.approve_variance',

  PAYMENT_INTENT_CREATE:
    'payments.intents.create',

  PAYMENT_INTENT_CANCEL:
    'payments.intents.cancel',

  PAYMENT_INTENT_RECOVER:
    'payments.intents.recover',

  PAYMENT_READ:
    'payments.read',

  PAYMENT_COLLECT:
    'payments.collect',

  PAYMENT_COLLECT_MANUAL:
    'payments.collect_manual',

  PAYMENT_COLLECT_CASH:
    'payments.collect_cash',

  PAYMENT_COLLECT_NON_CASH:
    'payments.collect_non_cash',

  PAYMENT_COLLECT_SPLIT:
    'payments.collect_split_tender',

  PAYMENT_ALLOCATE:
    'payments.allocate',

  PAYMENT_REALLOCATE:
    'payments.reallocate',

  DEPOSIT_READ:
    'payments.deposits.read',

  DEPOSIT_COLLECT:
    'payments.deposits.collect',

  DEPOSIT_APPLY:
    'payments.deposits.apply',

  DEPOSIT_TRANSFER:
    'payments.deposits.transfer',

  DEPOSIT_FORFEIT:
    'payments.deposits.forfeit',

  RECEIPT_READ:
    'payments.receipts.read',

  RECEIPT_PRINT:
    'payments.receipts.print',

  RECEIPT_REPRINT:
    'payments.receipts.reprint',

  REFUND_REQUEST:
    'payments.refunds.request',

  REFUND_APPROVE:
    'payments.refunds.approve',

  REFUND_PROCESS:
    'payments.refunds.process',

  REFUND_REVERSE:
    'payments.refunds.reverse',

  REVERSAL_REQUEST:
    'payments.reversals.request',

  REVERSAL_APPROVE:
    'payments.reversals.approve',

  REVERSAL_PROCESS:
    'payments.reversals.process',

  CASH_MOVEMENT_READ:
    'payments.cash_movements.read',

  CASH_MOVEMENT_CREATE:
    'payments.cash_movements.create',

  CASH_MOVEMENT_APPROVE:
    'payments.cash_movements.approve',

  CASH_MOVEMENT_POST:
    'payments.cash_movements.post',

  RECONCILIATION_READ:
    'payments.reconciliation.read',

  RECONCILIATION_OVERRIDE:
    'payments.reconciliation.override',

  REPORT_READ:
    'payments.reports.read',

  REPORT_EXPORT:
    'payments.reports.export',

  RECOVERY_MANAGE:
    'payments.recovery.manage',
} as const;

export type PaymentCashierPermissionKey =
  (typeof PAYMENT_CASHIER_PERMISSION_KEYS)[keyof typeof PAYMENT_CASHIER_PERMISSION_KEYS];

export const PAYMENT_CASHIER_OPERATIONAL_ROLE_KEYS = [
  'CASHIER',
  'BILLING_OFFICER',
  'RECEPTION_MANAGEMENT',
  'PHARMACIST',
  'SYSTEM_ADMINISTRATOR',
  'HOSPITAL_ADMINISTRATOR',
  'AUDITOR',
] as const;

export type PaymentCashierAccessAction =
  | 'PAYMENT_METHOD_READ'
  | 'PAYMENT_METHOD_MANAGE'
  | 'COUNTER_READ'
  | 'COUNTER_MANAGE'
  | 'COUNTER_ASSIGN'
  | 'SHIFT_READ'
  | 'SHIFT_OPEN'
  | 'SHIFT_SUSPEND'
  | 'SHIFT_RESUME'
  | 'SHIFT_HANDOVER'
  | 'SHIFT_RECONCILE'
  | 'SHIFT_CLOSE'
  | 'SHIFT_REOPEN'
  | 'SHIFT_VARIANCE_APPROVE'
  | 'PAYMENT_INTENT_CREATE'
  | 'PAYMENT_INTENT_CANCEL'
  | 'PAYMENT_INTENT_RECOVER'
  | 'PAYMENT_READ'
  | 'PAYMENT_COLLECT'
  | 'PAYMENT_COLLECT_MANUAL'
  | 'PAYMENT_COLLECT_CASH'
  | 'PAYMENT_COLLECT_NON_CASH'
  | 'PAYMENT_COLLECT_SPLIT'
  | 'PAYMENT_ALLOCATE'
  | 'PAYMENT_REALLOCATE'
  | 'DEPOSIT_READ'
  | 'DEPOSIT_COLLECT'
  | 'DEPOSIT_APPLY'
  | 'DEPOSIT_TRANSFER'
  | 'DEPOSIT_FORFEIT'
  | 'RECEIPT_READ'
  | 'RECEIPT_PRINT'
  | 'RECEIPT_REPRINT'
  | 'REFUND_REQUEST'
  | 'REFUND_APPROVE'
  | 'REFUND_PROCESS'
  | 'REFUND_REVERSE'
  | 'REVERSAL_REQUEST'
  | 'REVERSAL_APPROVE'
  | 'REVERSAL_PROCESS'
  | 'CASH_MOVEMENT_READ'
  | 'CASH_MOVEMENT_CREATE'
  | 'CASH_MOVEMENT_APPROVE'
  | 'CASH_MOVEMENT_POST'
  | 'RECONCILIATION_READ'
  | 'RECONCILIATION_OVERRIDE'
  | 'REPORT_READ'
  | 'REPORT_EXPORT'
  | 'RECOVERY_MANAGE';

export const PAYMENT_CASHIER_ACTION_PERMISSION = {
  PAYMENT_METHOD_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_READ,

  PAYMENT_METHOD_MANAGE:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_METHOD_MANAGE,

  COUNTER_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_READ,

  COUNTER_MANAGE:
    PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_MANAGE,

  COUNTER_ASSIGN:
    PAYMENT_CASHIER_PERMISSION_KEYS.COUNTER_ASSIGN,

  SHIFT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_READ,

  SHIFT_OPEN:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_OPEN,

  SHIFT_SUSPEND:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_SUSPEND,

  SHIFT_RESUME:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_RESUME,

  SHIFT_HANDOVER:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_HANDOVER,

  SHIFT_RECONCILE:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_RECONCILE,

  SHIFT_CLOSE:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_CLOSE,

  SHIFT_REOPEN:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_REOPEN,

  SHIFT_VARIANCE_APPROVE:
    PAYMENT_CASHIER_PERMISSION_KEYS.SHIFT_VARIANCE_APPROVE,

  PAYMENT_INTENT_CREATE:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_CREATE,

  PAYMENT_INTENT_CANCEL:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_CANCEL,

  PAYMENT_INTENT_RECOVER:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_INTENT_RECOVER,

  PAYMENT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_READ,

  PAYMENT_COLLECT:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT,

  PAYMENT_COLLECT_MANUAL:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_MANUAL,

  PAYMENT_COLLECT_CASH:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_CASH,

  PAYMENT_COLLECT_NON_CASH:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_NON_CASH,

  PAYMENT_COLLECT_SPLIT:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_SPLIT,

  PAYMENT_ALLOCATE:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_ALLOCATE,

  PAYMENT_REALLOCATE:
    PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_REALLOCATE,

  DEPOSIT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_READ,

  DEPOSIT_COLLECT:
    PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_COLLECT,

  DEPOSIT_APPLY:
    PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_APPLY,

  DEPOSIT_TRANSFER:
    PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_TRANSFER,

  DEPOSIT_FORFEIT:
    PAYMENT_CASHIER_PERMISSION_KEYS.DEPOSIT_FORFEIT,

  RECEIPT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_READ,

  RECEIPT_PRINT:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_PRINT,

  RECEIPT_REPRINT:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECEIPT_REPRINT,

  REFUND_REQUEST:
    PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_REQUEST,

  REFUND_APPROVE:
    PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_APPROVE,

  REFUND_PROCESS:
    PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_PROCESS,

  REFUND_REVERSE:
    PAYMENT_CASHIER_PERMISSION_KEYS.REFUND_REVERSE,

  REVERSAL_REQUEST:
    PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_REQUEST,

  REVERSAL_APPROVE:
    PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_APPROVE,

  REVERSAL_PROCESS:
    PAYMENT_CASHIER_PERMISSION_KEYS.REVERSAL_PROCESS,

  CASH_MOVEMENT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_READ,

  CASH_MOVEMENT_CREATE:
    PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_CREATE,

  CASH_MOVEMENT_APPROVE:
    PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_APPROVE,

  CASH_MOVEMENT_POST:
    PAYMENT_CASHIER_PERMISSION_KEYS.CASH_MOVEMENT_POST,

  RECONCILIATION_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECONCILIATION_READ,

  RECONCILIATION_OVERRIDE:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECONCILIATION_OVERRIDE,

  REPORT_READ:
    PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_READ,

  REPORT_EXPORT:
    PAYMENT_CASHIER_PERMISSION_KEYS.REPORT_EXPORT,

  RECOVERY_MANAGE:
    PAYMENT_CASHIER_PERMISSION_KEYS.RECOVERY_MANAGE,
} as const satisfies Readonly<
  Record<
    PaymentCashierAccessAction,
    PaymentCashierPermissionKey
  >
>;

export const PAYMENT_CASHIER_READ_ACTIONS = [
  'PAYMENT_METHOD_READ',
  'COUNTER_READ',
  'SHIFT_READ',
  'PAYMENT_READ',
  'DEPOSIT_READ',
  'RECEIPT_READ',
  'RECEIPT_PRINT',
  'CASH_MOVEMENT_READ',
  'RECONCILIATION_READ',
  'REPORT_READ',
] as const satisfies readonly PaymentCashierAccessAction[];

export const PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS = [
  'SHIFT_REOPEN',
  'SHIFT_VARIANCE_APPROVE',
  'PAYMENT_REALLOCATE',
  'DEPOSIT_TRANSFER',
  'DEPOSIT_FORFEIT',
  'REFUND_APPROVE',
  'REFUND_PROCESS',
  'REFUND_REVERSE',
  'REVERSAL_APPROVE',
  'REVERSAL_PROCESS',
  'CASH_MOVEMENT_APPROVE',
  'CASH_MOVEMENT_POST',
  'RECONCILIATION_OVERRIDE',
] as const satisfies readonly PaymentCashierAccessAction[];

export const PAYMENT_CASHIER_BREAK_GLASS_PROHIBITED_ACTIONS = [
  ...PAYMENT_CASHIER_INDEPENDENT_APPROVAL_ACTIONS,
  'PAYMENT_COLLECT_MANUAL',
  'RECEIPT_REPRINT',
  'RECOVERY_MANAGE',
] as const satisfies readonly PaymentCashierAccessAction[];

export const PAYMENT_CASHIER_SORT_FIELDS = [
  'createdAt',
  'occurredAt',
  'amount',
  'status',
  'number',
] as const;

export type PaymentCashierSortField =
  (typeof PAYMENT_CASHIER_SORT_FIELDS)[number];

export const DEFAULT_PAYMENT_CASHIER_PAGE_SIZE = 25;
export const MAX_PAYMENT_CASHIER_PAGE_SIZE = 200;
export const MAX_SPLIT_TENDERS = 8;
export const MAX_PAYMENT_ALLOCATIONS = 100;
export const MAX_COUNTER_ASSIGNEES = 100;
export const MAX_COUNTER_PAYMENT_METHODS = 50;
export const DEFAULT_PAYMENT_INTENT_TTL_MINUTES = 30;
export const MAX_PAYMENT_INTENT_TTL_MINUTES = 1_440;

export const PAYMENT_CASHIER_CURRENCY:
PaymentCashierCurrency = 'PKR';