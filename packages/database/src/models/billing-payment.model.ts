import Decimal from 'decimal.js';

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
  depositTypeValues,
  paymentIntentPurposeValues,
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
  paymentMethodConfigurationId: nullableBillingObjectId,
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


const paymentTenderStatusValues = [
  'PENDING',
  'POSTED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'REVERSED',
] as const;

const paymentTenderSchema = new Schema(
  {
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 260,
    },
    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 8,
    },
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
    paymentMethodKindSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    refundedAmount: billingNonNegativeDecimal,
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
    externalReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
      select: false,
    },
    maskedReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 120,
    },
    referenceType: {
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
      enum: paymentTenderStatusValues,
      default: 'POSTED',
    },
    settledAt: {
      type: Date,
      default: null,
    },
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
    version: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: true,
    strict: true,
  },
);

paymentTenderSchema.pre('validate', function () {
  this.paymentMethodCodeSnapshot = normalizeBillingCode(
    this.paymentMethodCodeSnapshot,
  );
  this.paymentMethodKindSnapshot = normalizeBillingCode(
    this.paymentMethodKindSnapshot,
  );
  this.currency = normalizeBillingCode(this.currency);
  if (this.referenceType != null) {
    this.referenceType = normalizeBillingCode(this.referenceType);
  }
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  validateNonNegativeInventoryDecimal(
    this,
    'refundedAmount',
    this.refundedAmount,
  );

  try {
    if (
      new Decimal(this.refundedAmount.toString()).greaterThan(
        this.amount.toString(),
      )
    ) {
      this.invalidate(
        'refundedAmount',
        'Tender refunded amount cannot exceed the tender amount',
      );
    }
  } catch (error) {
    this.invalidate(
      'refundedAmount',
      error instanceof Error
        ? error.message
        : 'Tender refund totals must contain valid decimal values',
    );
  }

  if (
    ['POSTED', 'COMPLETED'].includes(this.status) &&
    this.settledAt == null
  ) {
    this.invalidate(
      'settledAt',
      'Posted payment tenders require a settlement timestamp',
    );
  }
  if (
    this.status === 'FAILED' &&
    (this.failureCode == null || this.failureMessage == null)
  ) {
    this.invalidate(
      'status',
      'Failed payment tenders require a failure code and message',
    );
  }
});

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
    purpose: {
      type: String,
      required: true,
      enum: paymentIntentPurposeValues,
      default: 'ACCOUNT_PAYMENT',
    },
    payerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },
    responsiblePartyType: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
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
    capturedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: nullableBillingObjectId,
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
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
    this.status === 'CAPTURED' &&
    this.capturedAt == null
  ) {
    this.invalidate(
      'capturedAt',
      'Captured payment intents require a capture timestamp',
    );
  }
  if (
    this.status === 'CANCELLED' &&
    (this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null)
  ) {
    this.invalidate(
      'status',
      'Cancelled payment intents require actor, timestamp, and reason',
    );
  }
  if (
    this.status === 'REVERSED' &&
    (this.reversedAt == null ||
      this.reversedBy == null ||
      this.reversalReason == null)
  ) {
    this.invalidate(
      'status',
      'Reversed payment intents require actor, timestamp, and reason',
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
    paymentNumber: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
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
    tenders: {
      type: [paymentTenderSchema],
      required: true,
      default: [],
      validate: {
        validator(value: unknown[]) {
          return value.length <= 8;
        },
        message: 'Payments support a maximum of eight tenders',
      },
    },
    payerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },
    responsiblePartyType: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
      select: false,
    },
    allocatedAmount: billingNonNegativeDecimal,
    unallocatedAmount: billingNonNegativeDecimal,
    refundedAmount: billingNonNegativeDecimal,
    reversedAmount: billingNonNegativeDecimal,
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
  if (this.paymentNumber != null) {
    this.paymentNumber = normalizeBillingCode(this.paymentNumber);
  }
  this.receiptNumber = normalizeBillingCode(this.receiptNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  for (const field of [
    'allocatedAmount',
    'unallocatedAmount',
    'refundedAmount',
    'reversedAmount',
  ] as const) {
    validateNonNegativeInventoryDecimal(this, field, this.get(field));
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          this.allocatedAmount,
          this.unallocatedAmount,
          this.refundedAmount,
          this.reversedAmount,
        ],
        [],
        this.amount,
      )
    ) {
      this.invalidate(
        'amount',
        'Payment amount must equal allocated, unallocated, refunded, and reversed amounts',
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

  if (this.tenders.length > 0) {
    const sequences = this.tenders.map((tender) => tender.sequence);
    if (new Set(sequences).size !== sequences.length) {
      this.invalidate(
        'tenders',
        'Payment tender sequences must be unique',
      );
    }

    try {
      if (
        !billingDecimalExpressionEquals(
          this.tenders.map((tender) => tender.amount),
          [],
          this.amount,
        )
      ) {
        this.invalidate(
          'tenders',
          'Payment tenders must equal the payment amount exactly',
        );
      }
    } catch (error) {
      this.invalidate(
        'tenders',
        error instanceof Error
          ? error.message
          : 'Payment tenders must contain valid decimal values',
      );
    }

    if (
      this.tenders.length > 1 &&
      this.paymentMethod !== 'SPLIT_TENDER'
    ) {
      this.invalidate(
        'paymentMethod',
        'Multiple tenders require the SPLIT_TENDER parent payment method',
      );
    }
  }

  if (
    ['POSTED', 'COMPLETED'].includes(this.status) &&
    (this.postedAt == null || this.postedBy == null)
  ) {
    this.invalidate(
      'status',
      'Completed payments require posting attribution',
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
  { facilityId: 1, paymentNumber: 1 },
  {
    name: 'uq_payments_facility_number',
    unique: true,
    partialFilterExpression: {
      paymentNumber: { $type: 'string' },
    },
  },
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
  { facilityId: 1, 'tenders.externalReference': 1 },
  {
    name: 'uq_payments_tender_external_reference',
    unique: true,
    partialFilterExpression: {
      'tenders.externalReference': { $type: 'string' },
    },
  },
);
paymentSchema.index(
  { facilityId: 1, cashShiftId: 1, 'tenders.paymentMethodConfigurationId': 1, receivedAt: -1 },
  { name: 'ix_payments_shift_tender_method' },
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
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
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
    depositType: {
      type: String,
      required: true,
      immutable: true,
      enum: depositTypeValues,
      default: 'PATIENT',
    },
    admissionId: nullableBillingObjectId,
    procedureReferenceId: nullableBillingObjectId,
    responsiblePartyType: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
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
    transferredAmount: billingNonNegativeDecimal,
    forfeitedAmount: billingNonNegativeDecimal,
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
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedBy: nullableBillingObjectId,
    releaseReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    reversalId: nullableBillingObjectId,
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
    'transferredAmount',
    'forfeitedAmount',
  ] as const) {
    validateNonNegativeInventoryDecimal(this, field, this.get(field));
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          this.availableAmount,
          this.appliedAmount,
          this.refundedAmount,
          this.transferredAmount,
          this.forfeitedAmount,
        ],
        [],
        this.originalAmount,
      )
    ) {
      this.invalidate(
        'originalAmount',
        'Deposit original amount must equal available, applied, transferred, refunded, and forfeited amounts',
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
  if (
    this.depositType === 'ADMISSION' &&
    this.admissionId == null
  ) {
    this.invalidate(
      'admissionId',
      'Admission deposits require an admission reference',
    );
  }
  if (
    this.depositType === 'PROCEDURE' &&
    this.procedureReferenceId == null
  ) {
    this.invalidate(
      'procedureReferenceId',
      'Procedure deposits require a procedure reference',
    );
  }
  if (
    ['REFUNDED', 'FORFEITED', 'REVERSED'].includes(this.status) &&
    (this.releasedAt == null ||
      this.releasedBy == null ||
      this.releaseReason == null)
  ) {
    this.invalidate(
      'status',
      'Released deposits require actor, timestamp, and reason',
    );
  }
  if (
    this.status === 'REVERSED' &&
    this.reversalId == null
  ) {
    this.invalidate(
      'reversalId',
      'Reversed deposits require a reversal reference',
    );
  }
});

depositSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_deposits_operation', unique: true },
);
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
    supportingReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
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
    creditNoteId: nullableBillingObjectId,
    paymentMethodConfigurationId: nullableBillingObjectId,
    cashCounterId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,
    cashierUserId: nullableBillingObjectId,
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
    unallocatedRefundAmount: billingNonNegativeDecimal,
    allocationEffects: {
      type: [
        new Schema(
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
          { _id: false, strict: true },
        ),
      ],
      required: true,
      default: [],
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
    reversalApprovalRequestId: nullableBillingObjectId,
  },
  billingTimestampedSchemaOptions('refunds'),
);

refundSchema.pre('validate', function () {
  this.refundNumber = normalizeBillingCode(this.refundNumber);
  this.currency = normalizeBillingCode(this.currency);
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
  validateNonNegativeInventoryDecimal(
    this,
    'unallocatedRefundAmount',
    this.unallocatedRefundAmount,
  );

  for (const effect of this.allocationEffects) {
    validatePositiveInventoryDecimal(effect, 'amount', effect.amount);
  }

  try {
    const allocationTotal = this.allocationEffects.reduce(
      (total, effect) => total.plus(effect.amount.toString()),
      new Decimal(0),
    );
    const reconciled = allocationTotal.plus(
      this.unallocatedRefundAmount.toString(),
    );

    if (!reconciled.equals(this.amount.toString())) {
      this.invalidate(
        'allocationEffects',
        'Refund allocation effects plus unallocated amount must equal the refund amount',
      );
    }
  } catch (error) {
    this.invalidate(
      'allocationEffects',
      error instanceof Error
        ? error.message
        : 'Refund allocation effects must contain valid decimal values',
    );
  }

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
  if (
    this.status === 'REVERSED' &&
    (
      this.reversedAt == null ||
      this.reversedBy == null ||
      this.reversalReason == null ||
      this.reversalApprovalRequestId == null
    )
  ) {
    this.invalidate(
      'status',
      'Reversed refunds require reversal attribution, reason, and approval',
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
refundSchema.index(
  { facilityId: 1, cashShiftId: 1, status: 1, postedAt: 1 },
  { name: 'ix_refunds_shift_status' },
);
refundSchema.index(
  { facilityId: 1, creditNoteId: 1, status: 1 },
  { name: 'ix_refunds_credit_note_status' },
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
    replacementPaymentId: nullableBillingObjectId,
    cashCounterId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,
    cashierUserId: nullableBillingObjectId,
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
paymentReversalSchema.index(
  { facilityId: 1, cashShiftId: 1, status: 1, postedAt: 1 },
  { name: 'ix_payment_reversals_shift_status' },
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