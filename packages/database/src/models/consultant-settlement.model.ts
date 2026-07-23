import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  consultantSettlementItemTypeValues,
  consultantSettlementPaymentMethodValues,
  consultantSettlementPaymentStatusValues,
  consultantSettlementPeriodTypeValues,
  consultantSettlementStatusValues,
  consultantSharingCurrencyValues,
} from './consultant-sharing.types.js';

import {
  compareConsultantSharingDecimals,
  consultantSharingCommonFields,
  consultantSharingEncryptedText,
  consultantSharingHash,
  consultantSharingMaskedReference,
  consultantSharingNonNegativeDecimal,
  consultantSharingObjectIdArray,
  consultantSharingPositiveDecimal,
  consultantSharingSignedDecimal,
  consultantSharingTimestampedSchemaOptions,
  normalizeConsultantSharingCode,
  nullableConsultantSharingObjectId,
  requireConsultantSharingReason,
  validateConsultantSharingExpression,
  validateConsultantSharingImmutableHash,
  validateConsultantSharingMakerChecker,
  validateConsultantSharingMoneyFields,
  validateConsultantSharingPositiveDecimal,
  validateConsultantSharingSignedDecimal,
  validateDistinctConsultantSharingObjectIds,
} from './consultant-sharing-schema-helpers.js';

export const consultantSettlementSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    settlementNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantStaffId: { ...nullableConsultantSharingObjectId, immutable: true },
    consultantGroupId: { ...nullableConsultantSharingObjectId, immutable: true },
    periodType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSettlementPeriodTypeValues,
    },
    periodFrom: { type: Date, required: true, immutable: true },
    periodThrough: { type: Date, required: true, immutable: true },
    status: {
      type: String,
      required: true,
      enum: consultantSettlementStatusValues,
      default: 'DRAFT',
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSharingCurrencyValues,
      default: 'PKR',
    },
    openingBalance: consultantSharingNonNegativeDecimal,
    broughtForwardBalance: consultantSharingNonNegativeDecimal,
    eligibleRevenue: consultantSharingNonNegativeDecimal,
    consultantShare: consultantSharingNonNegativeDecimal,
    hospitalRetainedAmount: consultantSharingNonNegativeDecimal,
    adjustmentAmount: consultantSharingSignedDecimal,
    refundDeductionAmount: consultantSharingNonNegativeDecimal,
    creditNoteDeductionAmount: consultantSharingNonNegativeDecimal,
    debitNoteAdditionAmount: consultantSharingNonNegativeDecimal,
    claimEffectAmount: consultantSharingSignedDecimal,
    welfareZakatEffectAmount: consultantSharingSignedDecimal,
    taxWithholdingAmount: consultantSharingNonNegativeDecimal,
    otherDeductionAmount: consultantSharingNonNegativeDecimal,
    advanceRecoveryAmount: consultantSharingNonNegativeDecimal,
    overpaymentRecoveryAmount: consultantSharingNonNegativeDecimal,
    grossPayableAmount: consultantSharingNonNegativeDecimal,
    totalDeductionAmount: consultantSharingNonNegativeDecimal,
    netPayableAmount: consultantSharingNonNegativeDecimal,
    paidAmount: consultantSharingNonNegativeDecimal,
    outstandingAmount: consultantSharingNonNegativeDecimal,
    itemCount: { type: Number, required: true, min: 0, default: 0 },
    revenueEntryCount: { type: Number, required: true, min: 0, default: 0 },
    calculationHash: consultantSharingHash,
    inputHash: consultantSharingHash,
    lockedAt: { type: Date, default: null },
    lockedBy: nullableConsultantSharingObjectId,
    approvalMatrixCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    approvalRequestId: nullableConsultantSharingObjectId,
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    submittedBy: nullableConsultantSharingObjectId,
    reviewedBy: nullableConsultantSharingObjectId,
    approvedBy: nullableConsultantSharingObjectId,
    cancelledBy: nullableConsultantSharingObjectId,
    reversedBy: nullableConsultantSharingObjectId,
    closedBy: nullableConsultantSharingObjectId,
    calculatedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    partiallyPaidAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 4_000 },
    reversalReason: { type: String, default: null, trim: true, maxlength: 4_000 },
    disputeReason: { type: String, default: null, trim: true, maxlength: 4_000 },
    internalNotesEncrypted: consultantSharingEncryptedText,
    supportingAttachmentIds: consultantSharingObjectIdArray,
    ledgerTransactionId: nullableConsultantSharingObjectId,
    reversalOfSettlementId: { ...nullableConsultantSharingObjectId, immutable: true },
    reversedBySettlementId: nullableConsultantSharingObjectId,
  },
  consultantSharingTimestampedSchemaOptions('consultantSettlements'),
);

consultantSettlementSchema.pre('validate', function validateSettlement() {
  this.settlementNumber = normalizeConsultantSharingCode(this.settlementNumber);
  this.approvalMatrixCode = normalizeConsultantSharingCode(this.approvalMatrixCode);

  if (this.periodThrough < this.periodFrom) {
    this.invalidate('periodThrough', 'Settlement period end cannot precede its start');
  }

  validateConsultantSharingMoneyFields(this, [
    'openingBalance',
    'broughtForwardBalance',
    'eligibleRevenue',
    'consultantShare',
    'hospitalRetainedAmount',
    'refundDeductionAmount',
    'creditNoteDeductionAmount',
    'debitNoteAdditionAmount',
    'taxWithholdingAmount',
    'otherDeductionAmount',
    'advanceRecoveryAmount',
    'overpaymentRecoveryAmount',
    'grossPayableAmount',
    'totalDeductionAmount',
    'netPayableAmount',
    'paidAmount',
    'outstandingAmount',
  ]);
  validateConsultantSharingSignedDecimal(this, 'adjustmentAmount');
  validateConsultantSharingSignedDecimal(this, 'claimEffectAmount');
  validateConsultantSharingSignedDecimal(this, 'welfareZakatEffectAmount');
  validateConsultantSharingImmutableHash(this, 'calculationHash');
  validateConsultantSharingImmutableHash(this, 'inputHash');
  validateDistinctConsultantSharingObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  validateConsultantSharingMakerChecker(this, 'makerUserId', [
    'reviewedBy',
    'approvedBy',
    'cancelledBy',
    'reversedBy',
  ]);

  validateConsultantSharingExpression(
    this,
    'eligibleRevenue',
    ['consultantShare', 'hospitalRetainedAmount'],
    [],
    'Consultant share and hospital retained amount must equal eligible revenue',
  );
  validateConsultantSharingExpression(
    this,
    'grossPayableAmount',
    [
      'openingBalance',
      'broughtForwardBalance',
      'consultantShare',
      'adjustmentAmount',
      'debitNoteAdditionAmount',
      'claimEffectAmount',
      'welfareZakatEffectAmount',
    ],
    ['refundDeductionAmount', 'creditNoteDeductionAmount'],
    'Gross payable does not reconcile to settlement revenue and adjustments',
  );
  validateConsultantSharingExpression(
    this,
    'totalDeductionAmount',
    [
      'taxWithholdingAmount',
      'otherDeductionAmount',
      'advanceRecoveryAmount',
      'overpaymentRecoveryAmount',
    ],
    [],
    'Total deductions do not reconcile',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableAmount',
    ['grossPayableAmount'],
    ['totalDeductionAmount'],
    'Net payable must equal gross payable less deductions',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableAmount',
    ['paidAmount', 'outstandingAmount'],
    [],
    'Paid and outstanding amounts must equal net payable',
  );

  if (compareConsultantSharingDecimals(this.paidAmount, this.netPayableAmount) > 0) {
    this.invalidate('paidAmount', 'Paid amount cannot exceed approved net payable');
  }
  if (compareConsultantSharingDecimals(this.consultantShare, this.eligibleRevenue) > 0) {
    this.invalidate('consultantShare', 'Consultant share cannot exceed eligible revenue');
  }

  if (['CALCULATED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED'].includes(this.status)) {
    if (this.calculatedAt == null || this.lockedAt == null || this.lockedBy == null) {
      this.invalidate('calculatedAt', 'Calculated settlements must be locked with attribution');
    }
  }
  if (['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED'].includes(this.status)) {
    if (this.submittedAt == null || this.submittedBy == null) {
      this.invalidate('submittedAt', 'Submitted settlements require submitter metadata');
    }
  }
  if (['APPROVED', 'PARTIALLY_PAID', 'PAID', 'CLOSED'].includes(this.status)) {
    if (this.approvedAt == null || this.approvedBy == null || this.approvalRequestId == null) {
      this.invalidate('approvedAt', 'Approved settlements require independent approval metadata');
    }
  }
  if (this.status === 'PARTIALLY_PAID') {
    if (
      this.partiallyPaidAt == null ||
      compareConsultantSharingDecimals(this.paidAmount, '0') <= 0 ||
      compareConsultantSharingDecimals(this.outstandingAmount, '0') <= 0
    ) {
      this.invalidate('partiallyPaidAt', 'Partially paid settlements require paid and outstanding balances');
    }
  }
  if (this.status === 'PAID') {
    if (this.paidAt == null || compareConsultantSharingDecimals(this.outstandingAmount, '0') !== 0) {
      this.invalidate('paidAt', 'Paid settlements require zero outstanding balance');
    }
  }
  if (this.status === 'CANCELLED') {
    if (this.cancelledAt == null || this.cancelledBy == null) {
      this.invalidate('cancelledAt', 'Cancelled settlements require actor and timestamp');
    }
    requireConsultantSharingReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (this.status === 'REVERSED') {
    if (this.reversedAt == null || this.reversedBy == null) {
      this.invalidate('reversedAt', 'Reversed settlements require actor and timestamp');
    }
    requireConsultantSharingReason(this, 'reversalReason', this.reversalReason);
  }
  if (this.status === 'DISPUTED') {
    requireConsultantSharingReason(this, 'disputeReason', this.disputeReason);
  }
});

consultantSettlementSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_settlements_operation', unique: true },
);
consultantSettlementSchema.index(
  { facilityId: 1, settlementNumber: 1 },
  { name: 'uq_consultant_settlements_number', unique: true },
);
consultantSettlementSchema.index(
  { facilityId: 1, consultantId: 1, periodFrom: 1, periodThrough: 1 },
  {
    name: 'uq_consultant_settlements_active_period',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'DRAFT',
          'CALCULATED',
          'SUBMITTED',
          'UNDER_REVIEW',
          'APPROVED',
          'PARTIALLY_PAID',
          'PAID',
          'DISPUTED',
          'CLOSED',
        ],
      },
    },
  },
);
consultantSettlementSchema.index(
  { facilityId: 1, consultantId: 1, status: 1, periodThrough: -1 },
  { name: 'ix_consultant_settlements_consultant' },
);
consultantSettlementSchema.index(
  { facilityId: 1, status: 1, approvedAt: 1, outstandingAmount: 1 },
  { name: 'ix_consultant_settlements_payable_queue' },
);

export const consultantSettlementItemSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    settlementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    itemSequence: { type: Number, required: true, immutable: true, min: 1 },
    sourceKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 8,
      maxlength: 320,
    },
    itemType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSettlementItemTypeValues,
    },
    revenueEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
    adjustmentId: { ...nullableConsultantSharingObjectId, immutable: true },
    reversalId: { ...nullableConsultantSharingObjectId, immutable: true },
    invoiceId: { ...nullableConsultantSharingObjectId, immutable: true },
    invoiceLineId: { ...nullableConsultantSharingObjectId, immutable: true },
    claimId: { ...nullableConsultantSharingObjectId, immutable: true },
    paymentAllocationId: { ...nullableConsultantSharingObjectId, immutable: true },
    eligibleRevenue: { ...consultantSharingNonNegativeDecimal, immutable: true },
    consultantShare: { ...consultantSharingNonNegativeDecimal, immutable: true },
    hospitalShare: { ...consultantSharingNonNegativeDecimal, immutable: true },
    withholdingAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    deductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    signedSettlementImpact: { ...consultantSharingSignedDecimal, immutable: true },
    description: { type: String, required: true, immutable: true, trim: true, minlength: 3, maxlength: 2_000 },
    sourceOccurredAt: { type: Date, required: true, immutable: true },
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantSettlementItems'),
);

consultantSettlementItemSchema.pre('validate', function validateSettlementItem() {
  validateConsultantSharingMoneyFields(this, [
    'eligibleRevenue',
    'consultantShare',
    'hospitalShare',
    'withholdingAmount',
    'deductionAmount',
  ]);
  validateConsultantSharingSignedDecimal(this, 'signedSettlementImpact');
  validateConsultantSharingImmutableHash(this, 'immutableHash');

  if (compareConsultantSharingDecimals(this.consultantShare, this.eligibleRevenue) > 0) {
    this.invalidate('consultantShare', 'Settlement-item consultant share cannot exceed eligible revenue');
  }
  if (this.itemType === 'REVENUE' && this.revenueEntryId == null) {
    this.invalidate('revenueEntryId', 'Revenue settlement items require a revenue entry');
  }
  if (this.itemType === 'ADJUSTMENT' && this.adjustmentId == null) {
    this.invalidate('adjustmentId', 'Adjustment settlement items require an adjustment');
  }
  if (
    ['REFUND_DEDUCTION', 'CREDIT_NOTE_DEDUCTION'].includes(this.itemType) &&
    compareConsultantSharingDecimals(this.signedSettlementImpact, '0') >= 0
  ) {
    this.invalidate('signedSettlementImpact', `${this.itemType} must reduce the settlement`);
  }
  if (
    ['DEBIT_NOTE_ADDITION', 'OPENING_BALANCE', 'BROUGHT_FORWARD'].includes(this.itemType) &&
    compareConsultantSharingDecimals(this.signedSettlementImpact, '0') < 0
  ) {
    this.invalidate('signedSettlementImpact', `${this.itemType} cannot reduce the settlement`);
  }
});

consultantSettlementItemSchema.index(
  { facilityId: 1, settlementId: 1, itemSequence: 1 },
  { name: 'uq_consultant_settlement_items_sequence', unique: true },
);
consultantSettlementItemSchema.index(
  { facilityId: 1, settlementId: 1, sourceKey: 1 },
  { name: 'uq_consultant_settlement_items_source', unique: true },
);
consultantSettlementItemSchema.index(
  { facilityId: 1, settlementId: 1, revenueEntryId: 1 },
  {
    name: 'uq_consultant_settlement_items_revenue_entry',
    unique: true,
    partialFilterExpression: { revenueEntryId: { $type: 'objectId' } },
  },
);
consultantSettlementItemSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_settlement_items_hash', unique: true },
);
consultantSettlementItemSchema.index(
  { facilityId: 1, consultantId: 1, sourceOccurredAt: 1 },
  { name: 'ix_consultant_settlement_items_consultant' },
);

export const consultantSettlementPaymentSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: { type: String, required: true, immutable: true, trim: true, minlength: 8, maxlength: 240 },
    payoutNumber: { type: String, required: true, immutable: true, trim: true, uppercase: true, minlength: 2, maxlength: 120 },
    settlementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    status: {
      type: String,
      required: true,
      enum: consultantSettlementPaymentStatusValues,
      default: 'REQUESTED',
    },
    paymentMethod: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSettlementPaymentMethodValues,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSharingCurrencyValues,
      default: 'PKR',
    },
    amount: { ...consultantSharingPositiveDecimal, immutable: true },
    approvedSettlementBalanceSnapshot: {
      ...consultantSharingNonNegativeDecimal,
      immutable: true,
    },
    taxWithholdingAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    advanceRecoveryAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    overpaymentRecoveryAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    otherDeductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    netDisbursedAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    paymentId: nullableConsultantSharingObjectId,
    cashShiftId: nullableConsultantSharingObjectId,
    cashCounterId: nullableConsultantSharingObjectId,
    ledgerTransactionId: nullableConsultantSharingObjectId,
    paymentReferenceHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    paymentReferenceMasked: consultantSharingMaskedReference,
    payoutProfileReferenceHash: {
      type: String,
      default: null,
      immutable: true,
      select: false,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    payoutProfileReferenceMasked: consultantSharingMaskedReference,
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableConsultantSharingObjectId,
    approvalRequestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestedAt: { type: Date, required: true, immutable: true },
    approvedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    failureCode: { type: String, default: null, trim: true, uppercase: true, maxlength: 120 },
    failureReasonSanitized: { type: String, default: null, trim: true, maxlength: 2_000 },
    returnReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reversalReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reversalOfPaymentId: { ...nullableConsultantSharingObjectId, immutable: true },
    reversedByPaymentId: nullableConsultantSharingObjectId,
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantSettlementPayments'),
);

consultantSettlementPaymentSchema.pre('validate', function validateSettlementPayment() {
  this.payoutNumber = normalizeConsultantSharingCode(this.payoutNumber);
  validateConsultantSharingPositiveDecimal(this, 'amount');
  validateConsultantSharingMoneyFields(this, [
    'approvedSettlementBalanceSnapshot',
    'taxWithholdingAmount',
    'advanceRecoveryAmount',
    'overpaymentRecoveryAmount',
    'otherDeductionAmount',
    'netDisbursedAmount',
  ]);
  validateConsultantSharingExpression(
    this,
    'netDisbursedAmount',
    ['amount'],
    [
      'taxWithholdingAmount',
      'advanceRecoveryAmount',
      'overpaymentRecoveryAmount',
      'otherDeductionAmount',
    ],
    'Net disbursed amount must equal payout less approved deductions',
  );
  validateConsultantSharingMakerChecker(this, 'makerUserId', ['checkerUserId']);
  validateConsultantSharingImmutableHash(this, 'immutableHash');

  if (compareConsultantSharingDecimals(this.amount, this.approvedSettlementBalanceSnapshot) > 0) {
    this.invalidate('amount', 'Payout cannot exceed the approved settlement balance snapshot');
  }
  if (this.paymentMethod === 'CASH' && (this.cashShiftId == null || this.cashCounterId == null)) {
    this.invalidate('cashShiftId', 'Authorized cash payouts require cashier shift and counter');
  }
  if (['APPROVED', 'PROCESSING', 'PAID', 'RETURNED', 'REVERSED'].includes(this.status)) {
    if (this.checkerUserId == null || this.approvedAt == null) {
      this.invalidate('checkerUserId', `${this.status} payouts require independent approval`);
    }
  }
  if (this.status === 'PROCESSING' && this.processedAt == null) {
    this.invalidate('processedAt', 'Processing payouts require a processing timestamp');
  }
  if (this.status === 'PAID') {
    if (this.paidAt == null || this.paymentId == null || this.ledgerTransactionId == null) {
      this.invalidate('paidAt', 'Paid payouts require payment and ledger references');
    }
  }
  if (this.status === 'FAILED') {
    if (this.failedAt == null || this.failureCode == null || this.failureReasonSanitized == null) {
      this.invalidate('failedAt', 'Failed payouts require sanitized failure metadata');
    }
  }
  if (this.status === 'RETURNED') {
    if (this.returnedAt == null) {
      this.invalidate('returnedAt', 'Returned payouts require a timestamp');
    }
    requireConsultantSharingReason(this, 'returnReason', this.returnReason);
  }
  if (this.status === 'CANCELLED') {
    if (this.cancelledAt == null) {
      this.invalidate('cancelledAt', 'Cancelled payouts require a timestamp');
    }
    requireConsultantSharingReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (this.status === 'REVERSED') {
    if (this.reversedAt == null || this.reversalOfPaymentId == null) {
      this.invalidate('reversedAt', 'Reversed payouts require the original payout reference');
    }
    requireConsultantSharingReason(this, 'reversalReason', this.reversalReason);
  }
});

consultantSettlementPaymentSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_settlement_payments_operation', unique: true },
);
consultantSettlementPaymentSchema.index(
  { facilityId: 1, payoutNumber: 1 },
  { name: 'uq_consultant_settlement_payments_number', unique: true },
);
consultantSettlementPaymentSchema.index(
  { facilityId: 1, paymentReferenceHash: 1 },
  { name: 'uq_consultant_settlement_payments_reference', unique: true },
);
consultantSettlementPaymentSchema.index(
  { facilityId: 1, settlementId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_consultant_settlement_payments_settlement' },
);
consultantSettlementPaymentSchema.index(
  { facilityId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_consultant_settlement_payments_approval_queue' },
);
consultantSettlementPaymentSchema.index(
  { facilityId: 1, cashShiftId: 1, status: 1 },
  { name: 'ix_consultant_settlement_payments_cash_shift' },
);

export type ConsultantSettlement = InferSchemaType<typeof consultantSettlementSchema>;
export type ConsultantSettlementItem = InferSchemaType<typeof consultantSettlementItemSchema>;
export type ConsultantSettlementPayment = InferSchemaType<typeof consultantSettlementPaymentSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ConsultantSettlementModel = modelFor(
  'consultantSettlements',
  consultantSettlementSchema,
);
export const ConsultantSettlementItemModel = modelFor(
  'consultantSettlementItems',
  consultantSettlementItemSchema,
);
export const ConsultantSettlementPaymentModel = modelFor(
  'consultantSettlementPayments',
  consultantSettlementPaymentSchema,
);