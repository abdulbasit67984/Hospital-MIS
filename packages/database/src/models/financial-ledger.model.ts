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
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  ledgerAccountTypeValues,
  ledgerEntryDirectionValues,
  ledgerTransactionStatusValues,
} from './billing.types.js';

export const financialLedgerAccountSchema = new Schema(
  {
    ...billingCommonFields,
    accountCode: {
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
      maxlength: 300,
    },
    accountType: {
      type: String,
      required: true,
      enum: ledgerAccountTypeValues,
    },
    parentAccountId: nullableBillingObjectId,
    departmentId: nullableBillingObjectId,
    serviceLineCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowDirectPosting: {
      type: Boolean,
      required: true,
      default: false,
    },
    sensitiveMarginAccount: {
      type: Boolean,
      required: true,
      default: false,
      select: false,
    },
  },
  billingTimestampedSchemaOptions('financialLedgerAccounts'),
);

financialLedgerAccountSchema.pre('validate', function () {
  this.accountCode = normalizeBillingCode(this.accountCode);
  if (this.serviceLineCode != null) {
    this.serviceLineCode = normalizeBillingCode(
      this.serviceLineCode,
    );
  }
});

financialLedgerAccountSchema.index(
  { facilityId: 1, accountCode: 1 },
  {
    name: 'uq_financial_ledger_accounts_code',
    unique: true,
  },
);
financialLedgerAccountSchema.index(
  { facilityId: 1, parentAccountId: 1, active: 1, name: 1 },
  { name: 'ix_financial_ledger_accounts_parent_active' },
);

export const financialLedgerTransactionSchema = new Schema(
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
    journalNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    sourceModule: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
      immutable: true,
    },
    sourceEntityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
      immutable: true,
    },
    sourceEntityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: nullableBillingObjectId,
    patientAccountId: nullableBillingObjectId,
    invoiceId: nullableBillingObjectId,
    paymentId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,
    cashCounterId: nullableBillingObjectId,
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    totalDebit: billingNonNegativeDecimal,
    totalCredit: billingNonNegativeDecimal,
    entryCount: {
      type: Number,
      required: true,
      min: 2,
    },
    status: {
      type: String,
      required: true,
      enum: ledgerTransactionStatusValues,
      default: 'POSTED',
    },
    postedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    postedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    reversalOfTransactionId: nullableBillingObjectId,
    reversedByTransactionId: nullableBillingObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    closedPeriodCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
  },
  billingTimestampedSchemaOptions('financialLedgerTransactions'),
);

financialLedgerTransactionSchema.pre('validate', function () {
  this.journalNumber = normalizeBillingCode(this.journalNumber);
  this.sourceModule = normalizeBillingCode(this.sourceModule);
  this.sourceEntityType = normalizeBillingCode(this.sourceEntityType);
  this.currency = normalizeBillingCode(this.currency);
  validateNonNegativeInventoryDecimal(
    this,
    'totalDebit',
    this.totalDebit,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'totalCredit',
    this.totalCredit,
  );

  try {
    if (
      !billingDecimalExpressionEquals(
        [this.totalDebit],
        [],
        this.totalCredit,
      )
    ) {
      this.invalidate(
        'totalCredit',
        'Operational ledger transactions must balance debits and credits exactly',
      );
    }
  } catch (error) {
    this.invalidate(
      'totalCredit',
      error instanceof Error
        ? error.message
        : 'Ledger totals must contain valid decimal values',
    );
  }

  if (
    this.status === 'REVERSED' &&
    (this.reversalOfTransactionId == null ||
      this.reversedByTransactionId == null ||
      this.reversalReason == null)
  ) {
    this.invalidate(
      'status',
      'Reversed ledger transactions require original, replacement, and reason references',
    );
  }
});

financialLedgerTransactionSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_financial_ledger_transactions_operation',
    unique: true,
  },
);
financialLedgerTransactionSchema.index(
  { facilityId: 1, journalNumber: 1 },
  {
    name: 'uq_financial_ledger_transactions_journal',
    unique: true,
  },
);
financialLedgerTransactionSchema.index(
  {
    facilityId: 1,
    sourceModule: 1,
    sourceEntityType: 1,
    sourceEntityId: 1,
  },
  { name: 'ix_financial_ledger_transactions_source' },
);
financialLedgerTransactionSchema.index(
  { facilityId: 1, postedAt: -1, status: 1 },
  { name: 'ix_financial_ledger_transactions_posted' },
);

export const financialLedgerEntrySchema = new Schema(
  {
    ...billingCommonFields,
    ledgerTransactionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    lineNumber: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },
    ledgerAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    ledgerAccountCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
      immutable: true,
    },
    direction: {
      type: String,
      required: true,
      enum: ledgerEntryDirectionValues,
      immutable: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
      immutable: true,
    },
    patientId: nullableBillingObjectId,
    patientAccountId: nullableBillingObjectId,
    invoiceId: nullableBillingObjectId,
    paymentId: nullableBillingObjectId,
    departmentId: nullableBillingObjectId,
    serviceLineCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    chargeCatalogItemId: nullableBillingObjectId,
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 1_000,
    },
    postedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  billingTimestampedSchemaOptions('financialLedgerEntries'),
);

financialLedgerEntrySchema.pre('validate', function () {
  this.ledgerAccountCodeSnapshot = normalizeBillingCode(
    this.ledgerAccountCodeSnapshot,
  );
  this.currency = normalizeBillingCode(this.currency);
  if (this.serviceLineCode != null) {
    this.serviceLineCode = normalizeBillingCode(
      this.serviceLineCode,
    );
  }
  validatePositiveInventoryDecimal(this, 'amount', this.amount);
});

financialLedgerEntrySchema.index(
  { facilityId: 1, ledgerTransactionId: 1, lineNumber: 1 },
  {
    name: 'uq_financial_ledger_entries_transaction_line',
    unique: true,
  },
);
financialLedgerEntrySchema.index(
  { facilityId: 1, ledgerAccountId: 1, postedAt: -1 },
  { name: 'ix_financial_ledger_entries_account_posted' },
);
financialLedgerEntrySchema.index(
  {
    facilityId: 1,
    patientAccountId: 1,
    invoiceId: 1,
    postedAt: -1,
  },
  { name: 'ix_financial_ledger_entries_patient_invoice' },
);
financialLedgerEntrySchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    serviceLineCode: 1,
    postedAt: -1,
  },
  { name: 'ix_financial_ledger_entries_revenue_reporting' },
);

export type FinancialLedgerAccount = InferSchemaType<
  typeof financialLedgerAccountSchema
>;
export type FinancialLedgerTransaction = InferSchemaType<
  typeof financialLedgerTransactionSchema
>;
export type FinancialLedgerEntry = InferSchemaType<
  typeof financialLedgerEntrySchema
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

export const FinancialLedgerAccountModel = modelFor(
  'financialLedgerAccounts',
  financialLedgerAccountSchema,
);
export const FinancialLedgerTransactionModel = modelFor(
  'financialLedgerTransactions',
  financialLedgerTransactionSchema,
);
export const FinancialLedgerEntryModel = modelFor(
  'financialLedgerEntries',
  financialLedgerEntrySchema,
);