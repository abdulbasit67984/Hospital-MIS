import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingDecimalExpressionEquals,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateNonNegativeInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  paymentReceiptStatusValues,
  receiptCopyTypeValues,
} from './payment-cashier.types.js';

const receiptPaymentMethodSummarySchema = new Schema(
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

    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    externalReferenceMasked: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 120,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

receiptPaymentMethodSummarySchema.pre(
  'validate',
  function validateReceiptMethodSummary() {
    this.paymentMethodCodeSnapshot = normalizeBillingCode(
      this.paymentMethodCodeSnapshot,
    );
    validateNonNegativeInventoryDecimal(
      this,
      'amount',
      this.amount,
    );
  },
);

const receiptAllocationSummarySchema = new Schema(
  {
    paymentAllocationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    invoiceId: nullableBillingObjectId,
    accountChargeId: nullableBillingObjectId,

    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

receiptAllocationSummarySchema.pre(
  'validate',
  function validateReceiptAllocationSummary() {
    validateNonNegativeInventoryDecimal(
      this,
      'amount',
      this.amount,
    );

    if (
      this.invoiceId == null &&
      this.accountChargeId == null
    ) {
      this.invalidate(
        'invoiceId',
        'Receipt allocations require an invoice or account-charge target',
      );
    }
  },
);

export const paymentReceiptSchema = new Schema(
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

    receiptNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    paymentIntentId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    invoiceIds: {
      ...billingObjectIdArray,
      immutable: true,
    },

    cashCounterId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    cashShiftId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    cashierUserId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    cashierStaffId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    issuedAt: {
      type: Date,
      required: true,
      immutable: true,
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

    totalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    allocatedAmount: {
      ...billingNonNegativeDecimal,
      immutable: true,
    },

    unallocatedAmount: {
      ...billingNonNegativeDecimal,
      immutable: true,
    },

    paymentMethodSummaries: {
      type: [receiptPaymentMethodSummarySchema],
      required: true,
      immutable: true,
      validate: {
        validator(value: unknown[]) {
          return value.length > 0;
        },
        message:
          'Receipts require at least one payment-method summary',
      },
    },

    allocationSummaries: {
      type: [receiptAllocationSummarySchema],
      required: true,
      immutable: true,
      default: [],
    },

    payerDisplayName: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 300,
      select: false,
    },

    responsiblePartyType: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },

    status: {
      type: String,
      required: true,
      enum: paymentReceiptStatusValues,
      default: 'ISSUED',
    },

    originalReceiptId: nullableBillingObjectId,
    replacementReceiptId: nullableBillingObjectId,
    refundId: nullableBillingObjectId,
    paymentReversalId: nullableBillingObjectId,

    statusChangedAt: {
      type: Date,
      default: null,
    },

    statusChangedBy: nullableBillingObjectId,

    statusReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    printableProjectionVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },

    printableProjectionHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
  },
  billingTimestampedSchemaOptions('paymentReceipts'),
);

paymentReceiptSchema.pre(
  'validate',
  function validatePaymentReceipt() {
    this.receiptNumber = normalizeBillingCode(
      this.receiptNumber,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );

    for (const field of [
      'totalAmount',
      'allocatedAmount',
      'unallocatedAmount',
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
          [this.allocatedAmount, this.unallocatedAmount],
          [],
          this.totalAmount,
        )
      ) {
        this.invalidate(
          'totalAmount',
          'Receipt total must equal allocated and unallocated amounts',
        );
      }

      if (
        !billingDecimalExpressionEquals(
          this.paymentMethodSummaries.map(
            (summary) => summary.amount,
          ),
          [],
          this.totalAmount,
        )
      ) {
        this.invalidate(
          'paymentMethodSummaries',
          'Receipt payment-method summaries must equal the receipt total',
        );
      }

      if (
        !billingDecimalExpressionEquals(
          this.allocationSummaries.map(
            (summary) => summary.amount,
          ),
          [],
          this.allocatedAmount,
        )
      ) {
        this.invalidate(
          'allocationSummaries',
          'Receipt allocation summaries must equal the allocated amount',
        );
      }
    } catch (error) {
      this.invalidate(
        'totalAmount',
        error instanceof Error
          ? error.message
          : 'Receipt totals must contain valid decimal values',
      );
    }

    if (
      this.status !== 'ISSUED' &&
      (this.statusChangedAt == null ||
        this.statusChangedBy == null ||
        this.statusReason == null)
    ) {
      this.invalidate(
        'status',
        'Changed receipt status requires actor, timestamp, and reason',
      );
    }

    if (
      this.status === 'REVERSED' &&
      this.paymentReversalId == null
    ) {
      this.invalidate(
        'paymentReversalId',
        'Reversed receipts require a payment-reversal reference',
      );
    }

    if (
      this.status === 'REFUNDED' &&
      this.refundId == null
    ) {
      this.invalidate(
        'refundId',
        'Refunded receipts require a refund reference',
      );
    }

    if (
      this.status === 'CORRECTED' &&
      this.replacementReceiptId == null
    ) {
      this.invalidate(
        'replacementReceiptId',
        'Corrected receipts require a replacement receipt',
      );
    }
  },
);

paymentReceiptSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_payment_receipts_operation',
    unique: true,
  },
);

paymentReceiptSchema.index(
  { facilityId: 1, receiptNumber: 1 },
  {
    name: 'uq_payment_receipts_number',
    unique: true,
  },
);

paymentReceiptSchema.index(
  { facilityId: 1, paymentId: 1 },
  {
    name: 'uq_payment_receipts_payment',
    unique: true,
  },
);

paymentReceiptSchema.index(
  { facilityId: 1, cashShiftId: 1, issuedAt: 1 },
  { name: 'ix_payment_receipts_shift_range' },
);

paymentReceiptSchema.index(
  { facilityId: 1, patientAccountId: 1, issuedAt: -1 },
  { name: 'ix_payment_receipts_account' },
);

export const receiptReprintSchema = new Schema(
  {
    ...billingCommonFields,

    reprintNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    receiptId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    receiptNumberSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    copyType: {
      type: String,
      required: true,
      immutable: true,
      enum: receiptCopyTypeValues,
    },

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    printedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    printedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    cashCounterId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,

    outputFormat: {
      type: String,
      required: true,
      immutable: true,
      enum: ['PRINT', 'PDF'],
    },

    projectionHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
  },
  billingTimestampedSchemaOptions('receiptReprints'),
);

receiptReprintSchema.pre(
  'validate',
  function validateReceiptReprint() {
    this.reprintNumber = normalizeBillingCode(
      this.reprintNumber,
    );
    this.receiptNumberSnapshot = normalizeBillingCode(
      this.receiptNumberSnapshot,
    );
  },
);

receiptReprintSchema.index(
  { facilityId: 1, reprintNumber: 1 },
  {
    name: 'uq_receipt_reprints_number',
    unique: true,
  },
);

receiptReprintSchema.index(
  { facilityId: 1, receiptId: 1, printedAt: -1 },
  { name: 'ix_receipt_reprints_receipt' },
);

receiptReprintSchema.index(
  { facilityId: 1, printedBy: 1, printedAt: -1 },
  { name: 'ix_receipt_reprints_actor' },
);

export type PaymentReceipt = InferSchemaType<
  typeof paymentReceiptSchema
>;

export type ReceiptReprint = InferSchemaType<
  typeof receiptReprintSchema
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

export const PaymentReceiptModel = modelFor(
  'paymentReceipts',
  paymentReceiptSchema,
);

export const ReceiptReprintModel = modelFor(
  'receiptReprints',
  receiptReprintSchema,
);