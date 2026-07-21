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
  normalizeBillingCode,
  nullableBillingObjectId,
  validateAllOrNone,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  allocationStatusValues,
  depositStatusValues,
  paymentIntentStatusValues,
  paymentMethodValues,
  paymentReversalStatusValues,
  paymentStatusValues,
  refundRequestStatusValues,
  refundStatusValues,
} from './billing.types.js';

const paymentReferenceFields = {
  patientAccountId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  patientId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  invoiceId: nullableBillingObjectId,
  cashierStaffId: nullableBillingObjectId,
  cashShiftId: nullableBillingObjectId,
  cashCounterId: nullableBillingObjectId,
  paymentMethod: {
    type: String,
    required: true,
    enum: paymentMethodValues,
  },
  amount: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
    default: 'PKR',
  },
  externalReference: {
    type: String,
    default: null,
    trim: true,
    maxlength: 240,
    select: false,
  },
} as const;

export const paymentIntentSchema = new Schema(
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
    intentNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    ...paymentReferenceFields,
    status: {
      type: String,
      required: true,
      enum: paymentIntentStatusValues,
      default: 'PENDING',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    authorizedAt: {
      type: Date,
      default: null,
    },
    completedPaymentId: nullableBillingObjectId,
    failureCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    failureMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  billingTimestampedSchemaOptions('paymentIntents'),
);

paymentIntentSchema.pre('validate', function () {
  this.intentNumber = normalizeBillingCode(this.intentNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);

  if (
    this.status === 'AUTHORIZED' &&
    this.authorizedAt == null
  ) {
    this.invalidate(
      'authorizedAt',
      'Authorized payment intents require an authorization timestamp',
    );
  }
  if (
    this.status === 'COMPLETED' &&
    this.completedPaymentId == null
  ) {
    this.invalidate(
      'completedPaymentId',
      'Completed payment intents require the resulting payment reference',
    );
  }
  if (
    this.status === 'FAILED' &&
    (this.failureCode == null || this.failureMessage == null)
  ) {
    this.invalidate(
      'status',
      'Failed payment intents require a failure code and message',
    );
  }
});

paymentIntentSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_payment_intents_operation', unique: true },
);
paymentIntentSchema.index(
  { facilityId: 1, intentNumber: 1 },
  { name: 'uq_payment_intents_facility_number', unique: true },
);
paymentIntentSchema.index(
  { facilityId: 1, status: 1, expiresAt: 1 },
  { name: 'ix_payment_intents_status_expiry' },
);

export const paymentSchema = new Schema(
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
    paymentIntentId: nullableBillingObjectId,
    ...paymentReferenceFields,
    allocatedAmount: billingNonNegativeDecimal,
    unallocatedAmount: billingNonNegativeDecimal,
    refundedAmount: billingNonNegativeDecimal,
    status: {
      type: String,
      required: true,
      enum: paymentStatusValues,
      default: 'PENDING',
    },
    receivedAt: {
      type: Date,
      required: true,
    },
    postedAt: {
      type: Date,
      default: null,
    },
    postedBy: nullableBillingObjectId,
    failureCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    failureMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    reversalId: nullableBillingObjectId,
  },
  billingTimestampedSchemaOptions('payments'),
);

paymentSchema.pre('validate', function () {
  this.receiptNumber = normalizeBillingCode(this.receiptNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  for (const field of [
    'allocatedAmount',
    'unallocatedAmount',
    'refundedAmount',
  ] as const) {
    validateNonNegativeInventoryDecimal(this, field, this.get(field));
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [this.allocatedAmount, this.unallocatedAmount, this.refundedAmount],
        [],
        this.amount,
      )
    ) {
      this.invalidate(
        'amount',
        'Payment amount must equal allocated, unallocated, and refunded amounts',
      );
    }
  } catch (error) {
    this.invalidate(
      'amount',
      error instanceof Error
        ? error.message
        : 'Payment totals must contain valid decimal values',
    );
  }

  if (
    this.status === 'POSTED' &&
    (this.postedAt == null || this.postedBy == null)
  ) {
    this.invalidate(
      'status',
      'Posted payments require posting attribution',
    );
  }
  if (
    this.status === 'FAILED' &&
    (this.failureCode == null || this.failureMessage == null)
  ) {
    this.invalidate(
      'status',
      'Failed payments require a failure code and message',
    );
  }
  if (
    this.status === 'REVERSED' &&
    this.reversalId == null
  ) {
    this.invalidate(
      'reversalId',
      'Reversed payments require a payment-reversal reference',
    );
  }
});

paymentSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_payments_operation', unique: true },
);
paymentSchema.index(
  { facilityId: 1, receiptNumber: 1 },
  { name: 'uq_payments_facility_receipt', unique: true },
);
paymentSchema.index(
  { facilityId: 1, patientAccountId: 1, status: 1, receivedAt: -1 },
  { name: 'ix_payments_account_status_received' },
);
paymentSchema.index(
  { facilityId: 1, cashShiftId: 1, paymentMethod: 1, receivedAt: -1 },
  { name: 'ix_payments_shift_method' },
);
paymentSchema.index(
  { facilityId: 1, externalReference: 1 },
  {
    name: 'uq_payments_external_reference',
    unique: true,
    partialFilterExpression: {
      externalReference: { $type: 'string' },
    },
  },
);

export const paymentAllocationSchema = new Schema(
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
    paymentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    invoiceId: nullableBillingObjectId,
    accountChargeId: nullableBillingObjectId,
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: allocationStatusValues,
      default: 'ACTIVE',
    },
    allocatedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    allocatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableBillingObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('paymentAllocations'),
);

paymentAllocationSchema.pre('validate', function () {
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  if (this.invoiceId == null && this.accountChargeId == null) {
    this.invalidate(
      'invoiceId',
      'Payment allocations require an invoice or account-charge target',
    );
  }
  if (this.status === 'REVERSED') {
    validateAllOrNone(
      this,
      ['reversedAt', 'reversedBy', 'reversalReason'],
      'Reversed allocations require actor, timestamp, and reason',
    );
  }
});

paymentAllocationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_payment_allocations_operation', unique: true },
);
paymentAllocationSchema.index(
  { facilityId: 1, paymentId: 1, status: 1, allocatedAt: 1 },
  { name: 'ix_payment_allocations_payment_status' },
);
paymentAllocationSchema.index(
  { facilityId: 1, invoiceId: 1, status: 1 },
  { name: 'ix_payment_allocations_invoice_status' },
);

export const depositSchema = new Schema(
  {
    ...billingCommonFields,
    depositNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAccountId: nullableBillingObjectId,
    paymentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    originalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    availableAmount: billingNonNegativeDecimal,
    appliedAmount: billingNonNegativeDecimal,
    refundedAmount: billingNonNegativeDecimal,
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    status: {
      type: String,
      required: true,
      enum: depositStatusValues,
      default: 'AVAILABLE',
    },
    receivedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  billingTimestampedSchemaOptions('deposits'),
);

depositSchema.pre('validate', function () {
  this.depositNumber = normalizeBillingCode(this.depositNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(
    this,
    'originalAmount',
    this.originalAmount,
  );
  for (const field of [
    'availableAmount',
    'appliedAmount',
    'refundedAmount',
  ] as const) {
    validateNonNegativeInventoryDecimal(this, field, this.get(field));
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [this.availableAmount, this.appliedAmount, this.refundedAmount],
        [],
        this.originalAmount,
      )
    ) {
      this.invalidate(
        'originalAmount',
        'Deposit original amount must equal available, applied, and refunded amounts',
      );
    }
  } catch (error) {
    this.invalidate(
      'originalAmount',
      error instanceof Error
        ? error.message
        : 'Deposit totals must contain valid decimal values',
    );
  }
});

depositSchema.index(
  { facilityId: 1, depositNumber: 1 },
  { name: 'uq_deposits_facility_number', unique: true },
);
depositSchema.index(
  { facilityId: 1, patientId: 1, status: 1, receivedAt: -1 },
  { name: 'ix_deposits_patient_status' },
);

export const refundRequestSchema = new Schema(
  {
    ...billingCommonFields,
    requestNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    paymentId: nullableBillingObjectId,
    depositId: nullableBillingObjectId,
    creditNoteId: nullableBillingObjectId,
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: refundRequestStatusValues,
      default: 'PENDING',
    },
    completedRefundId: nullableBillingObjectId,
  },
  billingTimestampedSchemaOptions('refundRequests'),
);

refundRequestSchema.pre('validate', function () {
  this.requestNumber = normalizeBillingCode(this.requestNumber);
  this.reasonCode = normalizeBillingCode(this.reasonCode);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);

  if (
    this.paymentId == null &&
    this.depositId == null &&
    this.creditNoteId == null
  ) {
    this.invalidate(
      'paymentId',
      'Refund requests require a payment, deposit, or credit-note source',
    );
  }
  if (
    this.status === 'COMPLETED' &&
    this.completedRefundId == null
  ) {
    this.invalidate(
      'completedRefundId',
      'Completed refund requests require the resulting refund reference',
    );
  }
});

refundRequestSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_refund_requests_operation', unique: true },
);
refundRequestSchema.index(
  { facilityId: 1, requestNumber: 1 },
  { name: 'uq_refund_requests_facility_number', unique: true },
);
refundRequestSchema.index(
  { facilityId: 1, status: 1, createdAt: 1 },
  { name: 'ix_refund_requests_queue' },
);

export const refundSchema = new Schema(
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
    refundNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    refundRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    paymentId: nullableBillingObjectId,
    depositId: nullableBillingObjectId,
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: paymentMethodValues,
    },
    externalReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: refundStatusValues,
      default: 'PENDING',
    },
    postedAt: {
      type: Date,
      default: null,
    },
    postedBy: nullableBillingObjectId,
    failureCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    failureMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  billingTimestampedSchemaOptions('refunds'),
);

refundSchema.pre('validate', function () {
  this.refundNumber = normalizeBillingCode(this.refundNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  if (
    this.status === 'POSTED' &&
    (this.postedAt == null || this.postedBy == null)
  ) {
    this.invalidate(
      'status',
      'Posted refunds require posting attribution',
    );
  }
  if (
    this.status === 'FAILED' &&
    (this.failureCode == null || this.failureMessage == null)
  ) {
    this.invalidate(
      'status',
      'Failed refunds require a failure code and message',
    );
  }
});

refundSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_refunds_operation', unique: true },
);
refundSchema.index(
  { facilityId: 1, refundNumber: 1 },
  { name: 'uq_refunds_facility_number', unique: true },
);
refundSchema.index(
  { facilityId: 1, patientAccountId: 1, status: 1, createdAt: -1 },
  { name: 'ix_refunds_account_status' },
);

export const paymentReversalSchema = new Schema(
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
    reversalNumber: {
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
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: paymentReversalStatusValues,
      default: 'REQUESTED',
    },
    postedAt: {
      type: Date,
      default: null,
    },
    postedBy: nullableBillingObjectId,
    failureCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
  },
  billingTimestampedSchemaOptions('paymentReversals'),
);

paymentReversalSchema.pre('validate', function () {
  this.reversalNumber = normalizeBillingCode(this.reversalNumber);
  this.reasonCode = normalizeBillingCode(this.reasonCode);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  if (
    this.status === 'POSTED' &&
    (this.postedAt == null || this.postedBy == null)
  ) {
    this.invalidate(
      'status',
      'Posted payment reversals require posting attribution',
    );
  }
  if (
    this.status === 'FAILED' &&
    this.failureCode == null
  ) {
    this.invalidate(
      'failureCode',
      'Failed payment reversals require a failure code',
    );
  }
});

paymentReversalSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_payment_reversals_operation', unique: true },
);
paymentReversalSchema.index(
  { facilityId: 1, reversalNumber: 1 },
  { name: 'uq_payment_reversals_facility_number', unique: true },
);
paymentReversalSchema.index(
  { facilityId: 1, paymentId: 1, status: 1 },
  { name: 'ix_payment_reversals_payment_status' },
);

export type PaymentIntent = InferSchemaType<typeof paymentIntentSchema>;
export type Payment = InferSchemaType<typeof paymentSchema>;
export type PaymentAllocation = InferSchemaType<
  typeof paymentAllocationSchema
>;
export type Deposit = InferSchemaType<typeof depositSchema>;
export type RefundRequest = InferSchemaType<typeof refundRequestSchema>;
export type Refund = InferSchemaType<typeof refundSchema>;
export type PaymentReversal = InferSchemaType<
  typeof paymentReversalSchema
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

export const PaymentIntentModel = modelFor(
  'paymentIntents',
  paymentIntentSchema,
);
export const PaymentModel = modelFor('payments', paymentSchema);
export const PaymentAllocationModel = modelFor(
  'paymentAllocations',
  paymentAllocationSchema,
);
export const DepositModel = modelFor('deposits', depositSchema);
export const RefundRequestModel = modelFor(
  'refundRequests',
  refundRequestSchema,
);
export const RefundModel = modelFor('refunds', refundSchema);
export const PaymentReversalModel = modelFor(
  'paymentReversals',
  paymentReversalSchema,
);