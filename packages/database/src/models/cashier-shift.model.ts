import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingDecimalExpressionEquals,
  billingNonNegativeDecimal,
  billingTimestampedSchemaOptions,
  compareInventoryDecimals,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateNonNegativeInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  cashierShiftStatusValues,
  shiftReconciliationStatusValues,
} from './payment-cashier.types.js';

const paymentMethodTotalSchema = new Schema(
  {
    paymentMethodConfigurationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    paymentMethodCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    collectedAmount: billingNonNegativeDecimal,
    refundedAmount: billingNonNegativeDecimal,
    reversedAmount: billingNonNegativeDecimal,
    netAmount: billingNonNegativeDecimal,

    transactionCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

paymentMethodTotalSchema.pre(
  'validate',
  function validatePaymentMethodTotal() {
    this.paymentMethodCodeSnapshot = normalizeBillingCode(
      this.paymentMethodCodeSnapshot,
    );

    for (const field of [
      'collectedAmount',
      'refundedAmount',
      'reversedAmount',
      'netAmount',
    ] as const) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      if (
        !billingDecimalExpressionEquals(
          [this.collectedAmount],
          [this.refundedAmount, this.reversedAmount],
          this.netAmount,
        )
      ) {
        this.invalidate(
          'netAmount',
          'Payment-method net amount must equal collections less refunds and reversals',
        );
      }
    } catch (error) {
      this.invalidate(
        'netAmount',
        error instanceof Error
          ? error.message
          : 'Payment-method totals must contain valid decimal values',
      );
    }
  },
);

export const cashShiftSchema = new Schema(
  {
    ...billingCommonFields,

    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },

    shiftNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    cashCounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    cashierUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    cashierStaffId: nullableBillingObjectId,
    supervisorUserId: nullableBillingObjectId,

    currency: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },

    status: {
      type: String,
      required: true,
      enum: cashierShiftStatusValues,
      default: 'OPEN',
    },

    openedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    openingFloat: billingNonNegativeDecimal,

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspendedBy: nullableBillingObjectId,

    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    closingStartedAt: {
      type: Date,
      default: null,
    },

    closingStartedBy: nullableBillingObjectId,

    closedAt: {
      type: Date,
      default: null,
    },

    closedBy: nullableBillingObjectId,

    expectedCash: billingNonNegativeDecimal,
    declaredCash: billingNonNegativeDecimal,

    cashVariance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    nonCashTotal: billingNonNegativeDecimal,

    paymentMethodTotals: {
      type: [paymentMethodTotalSchema],
      required: true,
      default: [],
    },

    refundTotal: billingNonNegativeDecimal,
    reversalTotal: billingNonNegativeDecimal,
    depositTotal: billingNonNegativeDecimal,
    advanceTotal: billingNonNegativeDecimal,

    firstReceiptNumber: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },

    lastReceiptNumber: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },

    receiptCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    paymentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
      select: false,
    },

    handoverToUserId: nullableBillingObjectId,

    handoverAt: {
      type: Date,
      default: null,
    },

    handoverNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
      select: false,
    },

    shiftReconciliationId: nullableBillingObjectId,
    closingApprovalRequestId: nullableBillingObjectId,
    varianceApprovalRequestId: nullableBillingObjectId,

    reopenedFromShiftId: nullableBillingObjectId,
    reopenApprovalRequestId: nullableBillingObjectId,

    reopenReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('cashShifts'),
);

cashShiftSchema.pre(
  'validate',
  function validateCashShift() {
    this.shiftNumber = normalizeBillingCode(
      this.shiftNumber,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );

    for (const field of [
      'openingFloat',
      'expectedCash',
      'declaredCash',
      'nonCashTotal',
      'refundTotal',
      'reversalTotal',
      'depositTotal',
      'advanceTotal',
    ] as const) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      if (
        !billingDecimalExpressionEquals(
          [this.expectedCash, this.cashVariance],
          [],
          this.declaredCash,
        )
      ) {
        this.invalidate(
          'cashVariance',
          'Declared cash must equal expected cash plus cash variance',
        );
      }
    } catch (error) {
      this.invalidate(
        'cashVariance',
        error instanceof Error
          ? error.message
          : 'Shift cash totals must contain valid decimal values',
      );
    }

    if (this.status === 'SUSPENDED') {
      if (
        this.suspendedAt == null ||
        this.suspendedBy == null ||
        this.suspensionReason == null
      ) {
        this.invalidate(
          'status',
          'Suspended shifts require timestamp, actor, and reason',
        );
      }
    }

    if (this.status === 'CLOSING_IN_PROGRESS') {
      if (
        this.closingStartedAt == null ||
        this.closingStartedBy == null ||
        this.shiftReconciliationId == null
      ) {
        this.invalidate(
          'status',
          'Closing shifts require closing attribution and reconciliation',
        );
      }
    }

    if (this.status === 'CLOSED') {
      if (
        this.closedAt == null ||
        this.closedBy == null ||
        this.shiftReconciliationId == null ||
        this.closingApprovalRequestId == null
      ) {
        this.invalidate(
          'status',
          'Closed shifts require closure attribution, reconciliation, and approval',
        );
      }
    }

    const hasFirstReceipt =
      this.firstReceiptNumber != null;
    const hasLastReceipt =
      this.lastReceiptNumber != null;

    if (
      (hasFirstReceipt || hasLastReceipt) &&
      (!hasFirstReceipt ||
        !hasLastReceipt ||
        this.receiptCount < 1)
    ) {
      this.invalidate(
        'receiptCount',
        'Receipt ranges require first and last receipt numbers and a positive count',
      );
    }

    if (
      this.handoverToUserId != null &&
      (this.handoverAt == null ||
        this.handoverNotes == null)
    ) {
      this.invalidate(
        'handoverAt',
        'Shift handover requires timestamp and notes',
      );
    }
  },
);

cashShiftSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_cash_shifts_operation',
    unique: true,
  },
);

cashShiftSchema.index(
  { facilityId: 1, shiftNumber: 1 },
  {
    name: 'uq_cash_shifts_number',
    unique: true,
  },
);

cashShiftSchema.index(
  {
    facilityId: 1,
    cashCounterId: 1,
    cashierUserId: 1,
    status: 1,
  },
  {
    name: 'uq_cash_shifts_active_counter_cashier',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'OPEN',
          'SUSPENDED',
          'CLOSING_IN_PROGRESS',
        ],
      },
    },
  },
);

cashShiftSchema.index(
  { facilityId: 1, cashierUserId: 1, status: 1 },
  { name: 'ix_cash_shifts_cashier_status' },
);

cashShiftSchema.index(
  { facilityId: 1, cashCounterId: 1, openedAt: -1 },
  { name: 'ix_cash_shifts_counter_opened' },
);

export const shiftReconciliationSchema = new Schema(
  {
    ...billingCommonFields,

    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },

    reconciliationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    cashShiftId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    cashCounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    cashierUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      required: true,
      enum: shiftReconciliationStatusValues,
      default: 'DRAFT',
    },

    currency: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },

    calculatedAt: {
      type: Date,
      required: true,
    },

    calculatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    openingFloat: billingNonNegativeDecimal,
    cashCollections: billingNonNegativeDecimal,
    cashRefunds: billingNonNegativeDecimal,
    cashPaidOut: billingNonNegativeDecimal,
    cashDrops: billingNonNegativeDecimal,
    safeDeposits: billingNonNegativeDecimal,
    cashTransfersIn: billingNonNegativeDecimal,
    cashTransfersOut: billingNonNegativeDecimal,
    expectedClosingCash: billingNonNegativeDecimal,
    declaredClosingCash: billingNonNegativeDecimal,

    cashVariance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },

    nonCashTotal: billingNonNegativeDecimal,

    paymentMethodTotals: {
      type: [paymentMethodTotalSchema],
      required: true,
      default: [],
    },

    paymentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    receiptCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    failedPaymentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    unallocatedPaymentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    unresolvedRefundCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    incompleteJournalCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    blockingIssueCodes: {
      type: [String],
      required: true,
      default: [],
    },

    varianceReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    overrideReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    overrideApprovalRequestId: nullableBillingObjectId,
    varianceApprovalRequestId: nullableBillingObjectId,

    approvedAt: {
      type: Date,
      default: null,
    },

    approvedBy: nullableBillingObjectId,

    closedAt: {
      type: Date,
      default: null,
    },

    snapshotHash: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
  },
  billingTimestampedSchemaOptions(
    'shiftReconciliations',
  ),
);

shiftReconciliationSchema.pre(
  'validate',
  function validateShiftReconciliation() {
    this.reconciliationNumber = normalizeBillingCode(
      this.reconciliationNumber,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );
    this.blockingIssueCodes = this.blockingIssueCodes.map(
      (code) => normalizeBillingCode(code),
    );

    for (const field of [
      'openingFloat',
      'cashCollections',
      'cashRefunds',
      'cashPaidOut',
      'cashDrops',
      'safeDeposits',
      'cashTransfersIn',
      'cashTransfersOut',
      'expectedClosingCash',
      'declaredClosingCash',
      'nonCashTotal',
    ] as const) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      if (
        !billingDecimalExpressionEquals(
          [
            this.openingFloat,
            this.cashCollections,
            this.cashTransfersIn,
          ],
          [
            this.cashRefunds,
            this.cashPaidOut,
            this.cashDrops,
            this.safeDeposits,
            this.cashTransfersOut,
          ],
          this.expectedClosingCash,
        )
      ) {
        this.invalidate(
          'expectedClosingCash',
          'Expected cash must reconcile opening float, collections, refunds, payouts, drops, deposits, and transfers',
        );
      }

      if (
        !billingDecimalExpressionEquals(
          [this.expectedClosingCash, this.cashVariance],
          [],
          this.declaredClosingCash,
        )
      ) {
        this.invalidate(
          'cashVariance',
          'Declared closing cash must equal expected cash plus variance',
        );
      }
    } catch (error) {
      this.invalidate(
        'expectedClosingCash',
        error instanceof Error
          ? error.message
          : 'Reconciliation totals must contain valid decimal values',
      );
    }

    if (
      compareInventoryDecimals(
        this.cashVariance,
        '0',
      ) !== 0 &&
      this.varianceReason == null
    ) {
      this.invalidate(
        'varianceReason',
        'Non-zero cash variance requires a reason',
      );
    }

    const blockingCount =
      this.blockingIssueCodes.length +
      this.failedPaymentCount +
      this.unresolvedRefundCount +
      this.incompleteJournalCount;

    if (
      this.status === 'BLOCKED' &&
      blockingCount === 0
    ) {
      this.invalidate(
        'status',
        'Blocked reconciliation requires at least one blocking discrepancy',
      );
    }

    if (
      ['APPROVED', 'CLOSED'].includes(this.status) &&
      (this.approvedAt == null ||
        this.approvedBy == null)
    ) {
      this.invalidate(
        'approvedAt',
        'Approved reconciliation requires independent approval attribution',
      );
    }

    if (
      this.status === 'CLOSED' &&
      this.closedAt == null
    ) {
      this.invalidate(
        'closedAt',
        'Closed reconciliation requires a closure timestamp',
      );
    }

    if (
      blockingCount > 0 &&
      ['APPROVED', 'CLOSED'].includes(this.status) &&
      (this.overrideReason == null ||
        this.overrideApprovalRequestId == null)
    ) {
      this.invalidate(
        'overrideApprovalRequestId',
        'Blocking discrepancies require an approved override before closure',
      );
    }
  },
);

shiftReconciliationSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_shift_reconciliations_operation',
    unique: true,
  },
);

shiftReconciliationSchema.index(
  { facilityId: 1, reconciliationNumber: 1 },
  {
    name: 'uq_shift_reconciliations_number',
    unique: true,
  },
);

shiftReconciliationSchema.index(
  { facilityId: 1, cashShiftId: 1 },
  {
    name: 'uq_shift_reconciliations_shift',
    unique: true,
  },
);

shiftReconciliationSchema.index(
  { facilityId: 1, status: 1, calculatedAt: 1 },
  { name: 'ix_shift_reconciliations_status' },
);

export type CashShift = InferSchemaType<
  typeof cashShiftSchema
>;

export type ShiftReconciliation = InferSchemaType<
  typeof shiftReconciliationSchema
>;

function modelFor<T>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const CashShiftModel = modelFor(
  'cashShifts',
  cashShiftSchema,
);

export const ShiftReconciliationModel = modelFor(
  'shiftReconciliations',
  shiftReconciliationSchema,
);