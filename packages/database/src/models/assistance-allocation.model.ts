import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  assistanceAllocationStatusValues,
  assistanceReversalStatusValues,
  fundReturnTypeValues,
  welfareZakatCurrencyValues,
} from './welfare-zakat.types.js';

import {
  assistanceCommonFields,
  assistanceDecimalExpressionEquals,
  assistanceHash,
  assistanceNonNegativeDecimal,
  assistanceObjectIdArray,
  assistancePositiveDecimal,
  assistanceTimestampedSchemaOptions,
  compareAssistanceDecimals,
  normalizeAssistanceCode,
  nullableAssistanceObjectId,
  requireAssistanceReason,
  validateAssistanceExpression,
  validateAssistanceMoneyFields,
  validateAssistancePositiveDecimal,
  validateDistinctObjectIds,
  validateMakerChecker,
} from './welfare-zakat-schema-helpers.js';

const allocationLineSchema = new Schema(
  {
    invoiceLineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    amount: assistancePositiveDecimal,
    utilizedAmount: assistanceNonNegativeDecimal,
    reversedAmount: assistanceNonNegativeDecimal,
    refundedAmount: assistanceNonNegativeDecimal,
    repaidAmount: assistanceNonNegativeDecimal,
    recoveredAmount: assistanceNonNegativeDecimal,
    remainingAmount: assistanceNonNegativeDecimal,
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    supportingAttachmentIds: assistanceObjectIdArray,
  },
  { _id: true, strict: true },
);

allocationLineSchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'amount');
  validateAssistanceMoneyFields(this, [
    'utilizedAmount',
    'reversedAmount',
    'refundedAmount',
    'repaidAmount',
    'recoveredAmount',
    'remainingAmount',
  ]);
  validateAssistanceExpression(
    this,
    'remainingAmount',
    ['amount', 'reversedAmount', 'refundedAmount', 'repaidAmount', 'recoveredAmount'],
    ['utilizedAmount'],
    'Allocation-line remaining amount does not reconcile',
  );
  validateDistinctObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
});

export const invoiceFundAllocationSchema = new Schema(
  {
    ...assistanceCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    duplicateKey: assistanceHash,
    allocationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    fundId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvalId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reservationId: nullableAssistanceObjectId,
    patientAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoiceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    claimId: nullableAssistanceObjectId,
    status: {
      type: String,
      required: true,
      enum: assistanceAllocationStatusValues,
      default: 'DRAFT',
    },
    currency: {
      type: String,
      required: true,
      enum: welfareZakatCurrencyValues,
      default: 'PKR',
    },
    amount: assistancePositiveDecimal,
    utilizedAmount: assistanceNonNegativeDecimal,
    reversedAmount: assistanceNonNegativeDecimal,
    refundedAmount: assistanceNonNegativeDecimal,
    repaidAmount: assistanceNonNegativeDecimal,
    recoveredAmount: assistanceNonNegativeDecimal,
    releasedAmount: assistanceNonNegativeDecimal,
    remainingAmount: assistanceNonNegativeDecimal,
    priority: { type: Number, required: true, min: 0, max: 10_000 },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    supportingAttachmentIds: assistanceObjectIdArray,
    lines: {
      type: [allocationLineSchema],
      required: true,
      validate: {
        validator: (values: readonly unknown[]) => values.length > 0,
        message: 'At least one invoice-line allocation is required',
      },
    },
    allocatedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvedBy: nullableAssistanceObjectId,
    approvalRequestId: nullableAssistanceObjectId,
    allocatedAt: { type: Date, required: true, immutable: true },
    confirmedAt: { type: Date, default: null },
    utilizedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    reversalStatus: {
      type: String,
      default: null,
      enum: [...assistanceReversalStatusValues, null],
    },
  },
  assistanceTimestampedSchemaOptions('invoiceFundAllocations'),
);

invoiceFundAllocationSchema.pre('validate', function () {
  this.allocationNumber = normalizeAssistanceCode(this.allocationNumber);
  validateAssistancePositiveDecimal(this, 'amount');
  validateAssistanceMoneyFields(this, [
    'utilizedAmount',
    'reversedAmount',
    'refundedAmount',
    'repaidAmount',
    'recoveredAmount',
    'releasedAmount',
    'remainingAmount',
  ]);
  validateAssistanceExpression(
    this,
    'remainingAmount',
    ['amount', 'reversedAmount', 'refundedAmount', 'repaidAmount', 'recoveredAmount'],
    ['utilizedAmount', 'releasedAmount'],
    'Allocation remaining amount does not reconcile',
  );
  validateDistinctObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  const invoiceLineIds = this.lines.map((line: { invoiceLineId: unknown }) => line.invoiceLineId);
  validateDistinctObjectIds(this, 'lines', invoiceLineIds);

  try {
    if (
      !assistanceDecimalExpressionEquals(
        this.lines.map((line: { amount: unknown }) => line.amount),
        [],
        this.amount,
      )
    ) {
      this.invalidate('lines', 'Allocation-line amounts must equal the allocation amount');
    }
  } catch (error) {
    this.invalidate(
      'lines',
      error instanceof Error ? error.message : 'Allocation lines contain invalid decimal amounts',
    );
  }

  if (this.status === 'RESERVED' && this.reservationId == null) {
    this.invalidate('reservationId', 'Reserved allocations require a reservation');
  }
  if (['CONFIRMED', 'PARTIALLY_UTILIZED', 'UTILIZED'].includes(this.status)) {
    if (this.approvedBy == null || this.approvalRequestId == null || this.confirmedAt == null) {
      this.invalidate(
        'approvedBy',
        'Confirmed allocations require independent approval and confirmation metadata',
      );
    }
    if (this.approvedBy != null && String(this.approvedBy) === String(this.allocatedBy)) {
      this.invalidate('approvedBy', 'Allocator and allocation approver must be different users');
    }
  }
  if (this.status === 'UTILIZED' && compareAssistanceDecimals(this.remainingAmount, '0') !== 0) {
    this.invalidate('remainingAmount', 'Utilized allocations must have zero remaining amount');
  }
});

invoiceFundAllocationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_invoice_fund_allocations_operation', unique: true },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, allocationNumber: 1 },
  { name: 'uq_invoice_fund_allocations_number', unique: true },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, duplicateKey: 1 },
  {
    name: 'uq_invoice_fund_allocations_duplicate',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'RESERVED',
          'APPROVAL_PENDING',
          'CONFIRMED',
          'PARTIALLY_UTILIZED',
          'UTILIZED',
          'PARTIALLY_REVERSED',
          'RECOVERY_PENDING',
        ],
      },
    },
  },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, invoiceId: 1, status: 1, priority: 1 },
  { name: 'ix_invoice_fund_allocations_invoice' },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, fundId: 1, status: 1, allocatedAt: 1 },
  { name: 'ix_invoice_fund_allocations_fund' },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, approvalId: 1, status: 1 },
  { name: 'ix_invoice_fund_allocations_approval' },
);
invoiceFundAllocationSchema.index(
  { facilityId: 1, expiresAt: 1, status: 1 },
  { name: 'ix_invoice_fund_allocations_expiry' },
);

export const fundAllocationReversalSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    allocationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoiceLineId: nullableAssistanceObjectId,
    amount: { ...assistancePositiveDecimal, immutable: true },
    status: {
      type: String,
      required: true,
      enum: assistanceReversalStatusValues,
      default: 'REQUESTED',
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    supportingAttachmentIds: {
      ...assistanceObjectIdArray,
      immutable: true,
    },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableAssistanceObjectId,
    approvalRequestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    requestedAt: { type: Date, required: true, immutable: true },
    postedAt: { type: Date, default: null },
    immutableHash: assistanceHash,
    reversedAt: { type: Date, default: null },
    reversedBy: nullableAssistanceObjectId,
    reversalReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('fundAllocationReversals'),
);

fundAllocationReversalSchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'amount');
  validateDistinctObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);
  if (['APPROVED', 'POSTED', 'REVERSED'].includes(this.status) && this.checkerUserId == null) {
    this.invalidate('checkerUserId', `${this.status} reversals require an independent checker`);
  }
  if (this.status === 'POSTED' && this.postedAt == null) {
    this.invalidate('postedAt', 'Posted reversals require a posting timestamp');
  }
  if (this.status === 'REVERSED') {
    requireAssistanceReason(this, 'reversalReason', this.reversalReason);
  }
});
fundAllocationReversalSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_fund_allocation_reversals_operation', unique: true },
);
fundAllocationReversalSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_fund_allocation_reversals_hash', unique: true },
);
fundAllocationReversalSchema.index(
  { facilityId: 1, allocationId: 1, invoiceLineId: 1, status: 1 },
  { name: 'ix_fund_allocation_reversals_target' },
);

export const fundReturnSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    returnType: {
      type: String,
      required: true,
      immutable: true,
      enum: fundReturnTypeValues,
    },
    allocationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fundId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    amount: { ...assistancePositiveDecimal, immutable: true },
    paymentId: nullableAssistanceObjectId,
    refundId: nullableAssistanceObjectId,
    creditNoteId: nullableAssistanceObjectId,
    debitNoteId: nullableAssistanceObjectId,
    claimAdjustmentId: nullableAssistanceObjectId,
    approvalRequestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableAssistanceObjectId,
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    attachmentIds: {
      ...assistanceObjectIdArray,
      immutable: true,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    postedAt: { type: Date, required: true, immutable: true },
    immutableHash: assistanceHash,
    reversedAt: { type: Date, default: null },
    reversedBy: nullableAssistanceObjectId,
    reversalReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('fundReturns'),
);

fundReturnSchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'amount');
  validateDistinctObjectIds(this, 'attachmentIds', this.attachmentIds);
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);
  if (this.checkerUserId == null) {
    this.invalidate('checkerUserId', 'Fund returns require an independent checker');
  }
  const sourceIds = [
    this.paymentId,
    this.refundId,
    this.creditNoteId,
    this.debitNoteId,
    this.claimAdjustmentId,
  ].filter((value) => value != null);
  if (sourceIds.length === 0) {
    this.invalidate(
      'paymentId',
      'Fund returns require at least one authoritative financial source reference',
    );
  }
  if (this.reversedAt != null) {
    requireAssistanceReason(this, 'reversalReason', this.reversalReason);
  }
});
fundReturnSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_fund_returns_operation', unique: true },
);
fundReturnSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_fund_returns_hash', unique: true },
);
fundReturnSchema.index(
  { facilityId: 1, allocationId: 1, postedAt: 1 },
  { name: 'ix_fund_returns_allocation' },
);

export type InvoiceFundAllocation = InferSchemaType<typeof invoiceFundAllocationSchema>;
export type FundAllocationReversal = InferSchemaType<typeof fundAllocationReversalSchema>;
export type FundReturn = InferSchemaType<typeof fundReturnSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const InvoiceFundAllocationModel = modelFor(
  'invoiceFundAllocations',
  invoiceFundAllocationSchema,
);
export const FundAllocationReversalModel = modelFor(
  'fundAllocationReversals',
  fundAllocationReversalSchema,
);
export const FundReturnModel = modelFor('fundReturns', fundReturnSchema);