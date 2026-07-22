import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  assistanceFundRestrictionValues,
  assistanceFundStatusValues,
  assistanceFundTypeValues,
  assistanceLimitScopeValues,
  assistancePeriodTypeValues,
  assistanceServiceCategoryValues,
  eligibilityOutcomeValues,
  eligibilityRuleEffectValues,
  eligibilityRuleOperatorValues,
  fundTransactionDirectionValues,
  fundTransactionTypeValues,
  fundTransferStatusValues,
  welfareZakatCurrencyValues,
} from './welfare-zakat.types.js';

import {
  assistanceCommonFields,
  assistanceEncryptedText,
  assistanceHash,
  assistanceNonNegativeDecimal,
  assistanceObjectIdArray,
  assistancePositiveDecimal,
  assistanceStringArray,
  assistanceTimestampedSchemaOptions,
  compareAssistanceDecimals,
  compareAssistanceDecimalSum,
  normalizeAssistanceCode,
  nullableAssistanceHash,
  nullableAssistanceObjectId,
  nullableMaskedAssistanceReference,
  requireAssistanceReason,
  validateAssistanceDateRange,
  validateAssistanceExpression,
  validateAssistanceMoneyFields,
  validateAssistancePositiveDecimal,
  validateDistinctObjectIds,
  validateMakerChecker,
} from './welfare-zakat-schema-helpers.js';

const eligibilityRuleSchema = new Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 1_000,
    },
    field: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    operator: {
      type: String,
      required: true,
      enum: eligibilityRuleOperatorValues,
    },
    effect: {
      type: String,
      required: true,
      enum: eligibilityRuleEffectValues,
    },
    value: {
      type: Schema.Types.Mixed,
      default: null,
    },
    values: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    minimum: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
    },
    maximum: {
      type: String,
      default: null,
      trim: true,
      maxlength: 80,
    },
    priority: {
      type: Number,
      required: true,
      min: 0,
      max: 100_000,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
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
      maxlength: 1_000,
    },
  },
  { _id: true, strict: true },
);

eligibilityRuleSchema.pre('validate', function () {
  this.ruleCode = normalizeAssistanceCode(this.ruleCode);
  if (this.failureCode != null) {
    this.failureCode = normalizeAssistanceCode(this.failureCode);
  }

  if (this.operator === 'BETWEEN' && (this.minimum == null || this.maximum == null)) {
    this.invalidate('minimum', 'BETWEEN rules require minimum and maximum values');
  }

  if (
    ['IN', 'NOT_IN', 'CONTAINS_ANY', 'CONTAINS_ALL'].includes(this.operator) &&
    this.values.length === 0
  ) {
    this.invalidate('values', `${this.operator} rules require at least one comparison value`);
  }
});

const assistanceLimitSchema = new Schema(
  {
    scope: {
      type: String,
      required: true,
      enum: assistanceLimitScopeValues,
    },
    amount: assistancePositiveDecimal,
    periodType: {
      type: String,
      required: true,
      enum: assistancePeriodTypeValues,
    },
    rollingDays: {
      type: Number,
      default: null,
      min: 1,
      max: 3_650,
    },
    serviceCategory: {
      type: String,
      default: null,
      enum: [...assistanceServiceCategoryValues, null],
    },
    serviceCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    appliesPerPatient: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: true, strict: true },
);

assistanceLimitSchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'amount');
  if (this.serviceCode != null) {
    this.serviceCode = normalizeAssistanceCode(this.serviceCode);
  }
  if (this.periodType === 'ROLLING_DAYS' && this.rollingDays == null) {
    this.invalidate('rollingDays', 'ROLLING_DAYS limits require rollingDays');
  }
  if (this.scope === 'SERVICE' && this.serviceCategory == null && this.serviceCode == null) {
    this.invalidate(
      'serviceCategory',
      'SERVICE limits require a service category or service code',
    );
  }
});

export const assistanceFundSchema = new Schema(
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
    fundCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 240,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    fundType: {
      type: String,
      required: true,
      enum: assistanceFundTypeValues,
    },
    categoryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    restriction: {
      type: String,
      required: true,
      enum: assistanceFundRestrictionValues,
    },
    fundingSourceReferenceHash: nullableAssistanceHash,
    fundingSourceReferenceMasked: nullableMaskedAssistanceReference,
    donorReferenceHash: nullableAssistanceHash,
    donorReferenceMasked: nullableMaskedAssistanceReference,
    donationReferenceHash: nullableAssistanceHash,
    grantReferenceHash: nullableAssistanceHash,
    restrictionNarrativeEncrypted: assistanceEncryptedText,
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: assistanceFundStatusValues,
      default: 'DRAFT',
    },
    currency: {
      type: String,
      required: true,
      enum: welfareZakatCurrencyValues,
      default: 'PKR',
    },
    openingBalance: assistanceNonNegativeDecimal,
    inflowAmount: assistanceNonNegativeDecimal,
    transferInAmount: assistanceNonNegativeDecimal,
    transferOutAmount: assistanceNonNegativeDecimal,
    adjustmentIncreaseAmount: assistanceNonNegativeDecimal,
    adjustmentDecreaseAmount: assistanceNonNegativeDecimal,
    ledgerBalance: assistanceNonNegativeDecimal,
    reservedBalance: assistanceNonNegativeDecimal,
    committedBalance: assistanceNonNegativeDecimal,
    availableBalance: assistanceNonNegativeDecimal,
    utilizedBalance: assistanceNonNegativeDecimal,
    reversedBalance: assistanceNonNegativeDecimal,
    refundAmount: assistanceNonNegativeDecimal,
    repaymentAmount: assistanceNonNegativeDecimal,
    recoveryAmount: assistanceNonNegativeDecimal,
    writeOffAmount: assistanceNonNegativeDecimal,
    defaultEligibilityOutcome: {
      type: String,
      required: true,
      enum: eligibilityOutcomeValues,
      default: 'MANUAL_REVIEW',
    },
    eligibilityRules: {
      type: [eligibilityRuleSchema],
      required: true,
      default: [],
    },
    allowedDepartmentIds: assistanceObjectIdArray,
    excludedDepartmentIds: assistanceObjectIdArray,
    allowedServiceCategories: {
      type: [String],
      required: true,
      default: [],
      enum: assistanceServiceCategoryValues,
    },
    excludedServiceCategories: {
      type: [String],
      required: true,
      default: [],
      enum: assistanceServiceCategoryValues,
    },
    allowedServiceCodes: assistanceStringArray,
    excludedServiceCodes: assistanceStringArray,
    allowedPatientCategoryCodes: assistanceStringArray,
    excludedPatientCategoryCodes: assistanceStringArray,
    allowedDiagnosisCodes: assistanceStringArray,
    excludedDiagnosisCodes: assistanceStringArray,
    limits: {
      type: [assistanceLimitSchema],
      required: true,
      default: [],
    },
    requiresZakatDeclaration: {
      type: Boolean,
      required: true,
      default: false,
    },
    requiresSocialWelfareReview: {
      type: Boolean,
      required: true,
      default: false,
    },
    requiresClinicalReview: {
      type: Boolean,
      required: true,
      default: false,
    },
    approvalMatrixCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    facilitySpecific: {
      type: Boolean,
      required: true,
      default: true,
    },
    activationApprovalRequestId: nullableAssistanceObjectId,
    activatedAt: { type: Date, default: null },
    activatedBy: nullableAssistanceObjectId,
    suspendedAt: { type: Date, default: null },
    suspendedBy: nullableAssistanceObjectId,
    suspensionReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    closedAt: { type: Date, default: null },
    closedBy: nullableAssistanceObjectId,
    closureReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('assistanceFunds'),
);

assistanceFundSchema.pre('validate', function () {
  this.fundCode = normalizeAssistanceCode(this.fundCode);
  this.categoryCode = normalizeAssistanceCode(this.categoryCode);
  this.approvalMatrixCode = normalizeAssistanceCode(this.approvalMatrixCode);
  this.allowedServiceCodes = this.allowedServiceCodes.map(normalizeAssistanceCode);
  this.excludedServiceCodes = this.excludedServiceCodes.map(normalizeAssistanceCode);
  this.allowedPatientCategoryCodes = this.allowedPatientCategoryCodes.map(normalizeAssistanceCode);
  this.excludedPatientCategoryCodes = this.excludedPatientCategoryCodes.map(normalizeAssistanceCode);
  this.allowedDiagnosisCodes = this.allowedDiagnosisCodes.map(normalizeAssistanceCode);
  this.excludedDiagnosisCodes = this.excludedDiagnosisCodes.map(normalizeAssistanceCode);

  validateAssistanceDateRange(this, 'effectiveFrom', 'effectiveThrough');
  validateAssistanceMoneyFields(this, [
    'openingBalance',
    'inflowAmount',
    'transferInAmount',
    'transferOutAmount',
    'adjustmentIncreaseAmount',
    'adjustmentDecreaseAmount',
    'ledgerBalance',
    'reservedBalance',
    'committedBalance',
    'availableBalance',
    'utilizedBalance',
    'reversedBalance',
    'refundAmount',
    'repaymentAmount',
    'recoveryAmount',
    'writeOffAmount',
  ]);

  try {
    if (
      compareAssistanceDecimalSum(
        [this.refundAmount, this.repaymentAmount, this.recoveryAmount],
        this.reversedBalance,
      ) > 0
    ) {
      this.invalidate(
        'reversedBalance',
        'Refunds, repayments, and recoveries cannot exceed total reversed utilization',
      );
    }
  } catch (error) {
    this.invalidate(
      'reversedBalance',
      error instanceof Error ? error.message : 'Reversed balance is invalid',
    );
  }

  if (compareAssistanceDecimals(this.reversedBalance, this.utilizedBalance) > 0) {
    this.invalidate(
      'reversedBalance',
      'Reversed utilization cannot exceed cumulative utilization',
    );
  }
  validateAssistanceExpression(
    this,
    'ledgerBalance',
    [
      'openingBalance',
      'inflowAmount',
      'transferInAmount',
      'adjustmentIncreaseAmount',
      'reversedBalance',
    ],
    [
      'transferOutAmount',
      'adjustmentDecreaseAmount',
      'utilizedBalance',
      'writeOffAmount',
    ],
    'Ledger balance does not reconcile with cumulative fund activity',
  );
  validateAssistanceExpression(
    this,
    'availableBalance',
    ['ledgerBalance'],
    ['reservedBalance', 'committedBalance'],
    'Available balance must equal ledger balance less reserved and committed balances',
  );

  validateDistinctObjectIds(this, 'allowedDepartmentIds', this.allowedDepartmentIds);
  validateDistinctObjectIds(this, 'excludedDepartmentIds', this.excludedDepartmentIds);

  const ruleCodes = this.eligibilityRules.map((rule: { ruleCode: string }) => rule.ruleCode);
  if (new Set(ruleCodes).size !== ruleCodes.length) {
    this.invalidate('eligibilityRules', 'Eligibility rule codes must be unique within a fund');
  }

  if (this.restriction === 'RESTRICTED' && this.restrictionNarrativeEncrypted == null) {
    this.invalidate(
      'restrictionNarrativeEncrypted',
      'Restricted funds require an encrypted restriction narrative',
    );
  }
  if (this.fundType === 'ZAKAT' && !this.requiresZakatDeclaration) {
    this.invalidate(
      'requiresZakatDeclaration',
      'Zakat funds must require a Zakat declaration',
    );
  }
  if (this.status === 'ACTIVE' && this.activationApprovalRequestId == null) {
    this.invalidate(
      'activationApprovalRequestId',
      'Active funds require an approved activation request',
    );
  }
  if (this.status === 'SUSPENDED') {
    requireAssistanceReason(this, 'suspensionReason', this.suspensionReason);
  }
  if (this.status === 'CLOSED') {
    requireAssistanceReason(this, 'closureReason', this.closureReason);
    if (
      compareAssistanceDecimals(this.reservedBalance, '0') !== 0 ||
      compareAssistanceDecimals(this.committedBalance, '0') !== 0
    ) {
      this.invalidate('status', 'Funds with active reservations or commitments cannot be closed');
    }
  }
});

assistanceFundSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_assistance_funds_operation', unique: true },
);
assistanceFundSchema.index(
  { facilityId: 1, fundCode: 1 },
  { name: 'uq_assistance_funds_code', unique: true },
);
assistanceFundSchema.index(
  { facilityId: 1, status: 1, fundType: 1, effectiveFrom: 1, effectiveThrough: 1 },
  { name: 'ix_assistance_funds_eligibility' },
);
assistanceFundSchema.index(
  { facilityId: 1, availableBalance: 1, status: 1 },
  { name: 'ix_assistance_funds_available_balance' },
);

export const fundTransactionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    transactionNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    fundId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    transactionType: {
      type: String,
      required: true,
      immutable: true,
      enum: fundTransactionTypeValues,
    },
    direction: {
      type: String,
      required: true,
      immutable: true,
      enum: fundTransactionDirectionValues,
    },
    amount: {
      ...assistancePositiveDecimal,
      immutable: true,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: welfareZakatCurrencyValues,
      default: 'PKR',
    },
    balanceBefore: {
      ...assistanceNonNegativeDecimal,
      immutable: true,
    },
    balanceAfter: {
      ...assistanceNonNegativeDecimal,
      immutable: true,
    },
    applicationId: nullableAssistanceObjectId,
    approvalId: nullableAssistanceObjectId,
    reservationId: nullableAssistanceObjectId,
    allocationId: nullableAssistanceObjectId,
    transferId: nullableAssistanceObjectId,
    invoiceId: nullableAssistanceObjectId,
    invoiceLineId: nullableAssistanceObjectId,
    paymentId: nullableAssistanceObjectId,
    refundId: nullableAssistanceObjectId,
    creditNoteId: nullableAssistanceObjectId,
    debitNoteId: nullableAssistanceObjectId,
    claimId: nullableAssistanceObjectId,
    claimAdjustmentId: nullableAssistanceObjectId,
    donorReferenceHash: nullableAssistanceHash,
    donorReferenceMasked: nullableMaskedAssistanceReference,
    donationReferenceHash: nullableAssistanceHash,
    receiptReferenceHash: nullableAssistanceHash,
    receiptReferenceMasked: nullableMaskedAssistanceReference,
    fundingSourceReferenceHash: nullableAssistanceHash,
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
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    makerUserId: nullableAssistanceObjectId,
    checkerUserId: nullableAssistanceObjectId,
    approvalRequestId: nullableAssistanceObjectId,
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
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    immutableHash: assistanceHash,
    reversalOfTransactionId: nullableAssistanceObjectId,
    reversedByTransactionId: nullableAssistanceObjectId,
  },
  assistanceTimestampedSchemaOptions('fundTransactions'),
);

fundTransactionSchema.pre('validate', function () {
  this.transactionNumber = normalizeAssistanceCode(this.transactionNumber);
  validateAssistancePositiveDecimal(this, 'amount');
  validateAssistanceMoneyFields(this, ['balanceBefore', 'balanceAfter']);
  validateDistinctObjectIds(this, 'attachmentIds', this.attachmentIds);
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);

  const creditTypes = new Set([
    'OPENING_BALANCE',
    'DONATION',
    'GRANT',
    'OTHER_INFLOW',
    'TRANSFER_IN',
    'ADJUSTMENT_INCREASE',
    'UTILIZATION_REVERSAL',
    'REFUND_TO_FUND',
    'REPAYMENT_TO_FUND',
    'RECOVERY_TO_FUND',
  ]);
  const debitTypes = new Set([
    'TRANSFER_OUT',
    'ADJUSTMENT_DECREASE',
    'UTILIZATION',
    'WRITE_OFF',
  ]);
  const memoTypes = new Set([
    'RESERVATION',
    'RESERVATION_RELEASE',
    'ALLOCATION_COMMITMENT',
    'ALLOCATION_RELEASE',
  ]);

  if (creditTypes.has(this.transactionType) && this.direction !== 'CREDIT') {
    this.invalidate('direction', `${this.transactionType} must use CREDIT direction`);
  }
  if (debitTypes.has(this.transactionType) && this.direction !== 'DEBIT') {
    this.invalidate('direction', `${this.transactionType} must use DEBIT direction`);
  }
  if (memoTypes.has(this.transactionType) && this.direction !== 'MEMO') {
    this.invalidate('direction', `${this.transactionType} must use MEMO direction`);
  }

  if (this.direction === 'CREDIT') {
    validateAssistanceExpression(
      this,
      'balanceAfter',
      ['balanceBefore', 'amount'],
      [],
      'Credit transaction balanceAfter must equal balanceBefore plus amount',
    );
  }
  if (this.direction === 'DEBIT') {
    validateAssistanceExpression(
      this,
      'balanceAfter',
      ['balanceBefore'],
      ['amount'],
      'Debit transaction balanceAfter must equal balanceBefore less amount',
    );
  }
  if (this.direction === 'MEMO' && compareAssistanceDecimals(this.balanceBefore, this.balanceAfter) !== 0) {
    this.invalidate('balanceAfter', 'Memo transactions must not change the ledger balance');
  }
});

fundTransactionSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_fund_transactions_operation', unique: true },
);
fundTransactionSchema.index(
  { facilityId: 1, transactionNumber: 1 },
  { name: 'uq_fund_transactions_number', unique: true },
);
fundTransactionSchema.index(
  { facilityId: 1, fundId: 1, occurredAt: 1, _id: 1 },
  { name: 'ix_fund_transactions_ledger' },
);
fundTransactionSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_fund_transactions_hash', unique: true },
);
fundTransactionSchema.index(
  { facilityId: 1, reversalOfTransactionId: 1 },
  {
    name: 'uq_fund_transactions_reversal',
    unique: true,
    partialFilterExpression: { reversalOfTransactionId: { $type: 'objectId' } },
  },
);

export const fundTransferSchema = new Schema(
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
    transferNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    sourceFundId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    destinationFundId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    amount: assistancePositiveDecimal,
    currency: {
      type: String,
      required: true,
      enum: welfareZakatCurrencyValues,
      default: 'PKR',
    },
    status: {
      type: String,
      required: true,
      enum: fundTransferStatusValues,
      default: 'REQUESTED',
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    makerUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    checkerUserId: nullableAssistanceObjectId,
    sourceTransactionId: nullableAssistanceObjectId,
    destinationTransactionId: nullableAssistanceObjectId,
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    attachmentIds: assistanceObjectIdArray,
    postedAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    reversedBy: nullableAssistanceObjectId,
    reversalReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('fundTransfers'),
);

fundTransferSchema.pre('validate', function () {
  this.transferNumber = normalizeAssistanceCode(this.transferNumber);
  validateAssistancePositiveDecimal(this, 'amount');
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);
  validateDistinctObjectIds(this, 'attachmentIds', this.attachmentIds);

  if (String(this.sourceFundId) === String(this.destinationFundId)) {
    this.invalidate('destinationFundId', 'Source and destination funds must differ');
  }
  if (['APPROVED', 'POSTED', 'REVERSED'].includes(this.status) && this.checkerUserId == null) {
    this.invalidate('checkerUserId', `${this.status} transfers require an independent checker`);
  }
  if (this.status === 'POSTED' && (this.sourceTransactionId == null || this.destinationTransactionId == null)) {
    this.invalidate(
      'sourceTransactionId',
      'Posted transfers require both source and destination ledger transactions',
    );
  }
  if (this.status === 'REVERSED') {
    requireAssistanceReason(this, 'reversalReason', this.reversalReason);
  }
});

fundTransferSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_fund_transfers_operation', unique: true },
);
fundTransferSchema.index(
  { facilityId: 1, transferNumber: 1 },
  { name: 'uq_fund_transfers_number', unique: true },
);
fundTransferSchema.index(
  { facilityId: 1, status: 1, createdAt: 1 },
  { name: 'ix_fund_transfers_approval_queue' },
);

export type AssistanceFund = InferSchemaType<typeof assistanceFundSchema>;
export type FundTransaction = InferSchemaType<typeof fundTransactionSchema>;
export type FundTransfer = InferSchemaType<typeof fundTransferSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const AssistanceFundModel = modelFor('assistanceFunds', assistanceFundSchema);
export const FundTransactionModel = modelFor('fundTransactions', fundTransactionSchema);
export const FundTransferModel = modelFor('fundTransfers', fundTransferSchema);