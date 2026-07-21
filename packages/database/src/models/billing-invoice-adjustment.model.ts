import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingDecimalExpressionEquals,
  billingMoneyFields,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateAllOrNone,
  validateBillingMoney,
  validateNonNegativeInventoryDecimal,
  validatePercentage,
  validatePositiveInventoryDecimal,
  validateQuantityPriceGross,
} from './billing-schema-helpers.js';

import {
  approvalStatusValues,
  approvalTypeValues,
  discountScopeValues,
  discountTypeValues,
  financialNoteStatusValues,
  invoiceHistoryActionValues,
  invoiceStatusValues,
  invoiceTypeValues,
} from './billing.types.js';

const invoiceTotalsFields = {
  grossAmount: billingNonNegativeDecimal,
  discountAmount: billingNonNegativeDecimal,
  taxAmount: billingNonNegativeDecimal,
  welfareAmount: billingNonNegativeDecimal,
  payerAmount: billingNonNegativeDecimal,
  patientAmount: billingNonNegativeDecimal,
  netAmount: billingNonNegativeDecimal,
  paymentsAppliedAmount: billingNonNegativeDecimal,
  creditsAppliedAmount: billingNonNegativeDecimal,
  outstandingAmount: billingNonNegativeDecimal,
  refundableAmount: billingNonNegativeDecimal,
} as const;

export const invoiceSchema = new Schema(
  {
    ...billingCommonFields,
    invoiceNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    invoiceType: {
      type: String,
      required: true,
      enum: invoiceTypeValues,
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
    status: {
      type: String,
      required: true,
      enum: invoiceStatusValues,
      default: 'DRAFT',
    },
    lineCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    ...invoiceTotalsFields,
    issuedAt: {
      type: Date,
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: nullableBillingObjectId,
    lockedAccountVersion: {
      type: Number,
      default: null,
      min: 0,
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
    originalInvoiceId: nullableBillingObjectId,
    replacementInvoiceId: nullableBillingObjectId,
    taxSummary: {
      type: [
        new Schema(
          {
            taxCategoryId: nullableBillingObjectId,
            taxCodeSnapshot: {
              type: String,
              required: true,
              trim: true,
              uppercase: true,
              maxlength: 100,
            },
            taxableAmount: billingNonNegativeDecimal,
            taxAmount: billingNonNegativeDecimal,
          },
          { _id: true, strict: true },
        ),
      ],
      required: true,
      default: [],
    },
    discountIds: billingObjectIdArray,
    creditNoteIds: billingObjectIdArray,
    debitNoteIds: billingObjectIdArray,
    printableSnapshotVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  billingTimestampedSchemaOptions('invoices'),
);

invoiceSchema.pre('validate', function () {
  this.invoiceNumber = normalizeBillingCode(this.invoiceNumber);
  this.currency = normalizeBillingCode(this.currency);

  for (const field of Object.keys(invoiceTotalsFields)) {
    validateNonNegativeInventoryDecimal(this, field, this.get(field));
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [this.grossAmount, this.taxAmount],
        [this.discountAmount],
        this.netAmount,
      )
    ) {
      this.invalidate(
        'netAmount',
        'Invoice net amount must equal gross amount plus tax less discount',
      );
    }
    if (
      !billingDecimalExpressionEquals(
        [this.patientAmount, this.payerAmount, this.welfareAmount],
        [],
        this.netAmount,
      )
    ) {
      this.invalidate(
        'patientAmount',
        'Patient, payer, and welfare responsibility must equal invoice net amount',
      );
    }
    if (
      !billingDecimalExpressionEquals(
        [this.patientAmount, this.refundableAmount],
        [this.paymentsAppliedAmount, this.creditsAppliedAmount],
        this.outstandingAmount,
      )
    ) {
      this.invalidate(
        'outstandingAmount',
        'Invoice balance reconciliation is invalid',
      );
    }
  } catch (error) {
    this.invalidate(
      'netAmount',
      error instanceof Error
        ? error.message
        : 'Invoice totals must contain valid decimal values',
    );
  }

  if (this.status === 'FINALIZED') {
    if (
      this.issuedAt == null ||
      this.finalizedAt == null ||
      this.finalizedBy == null ||
      this.lockedAccountVersion == null
    ) {
      this.invalidate(
        'status',
        'Finalized invoices require issue, finalization, and account-lock attribution',
      );
    }
  }
  if (
    this.status === 'CANCELLED' &&
    (this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null)
  ) {
    this.invalidate(
      'status',
      'Cancelled invoices require cancellation attribution and reason',
    );
  }
  if (
    this.status === 'CORRECTED' &&
    (this.originalInvoiceId == null ||
      this.replacementInvoiceId == null)
  ) {
    this.invalidate(
      'status',
      'Corrected invoices require original and replacement references',
    );
  }
});

invoiceSchema.index(
  { facilityId: 1, invoiceNumber: 1 },
  { name: 'uq_invoices_facility_number', unique: true },
);
invoiceSchema.index(
  { facilityId: 1, patientAccountId: 1, status: 1, createdAt: -1 },
  { name: 'ix_invoices_account_status' },
);
invoiceSchema.index(
  { facilityId: 1, patientId: 1, finalizedAt: -1 },
  { name: 'ix_invoices_patient_finalized' },
);
invoiceSchema.index(
  { facilityId: 1, status: 1, outstandingAmount: 1 },
  { name: 'ix_invoices_outstanding' },
);

export const invoiceLineSchema = new Schema(
  {
    ...billingCommonFields,
    invoiceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    accountChargeId: {
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
    sourceModuleSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    sourceRecordTypeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    sourceRecordId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceLineId: nullableBillingObjectId,
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    chargeCatalogVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    priceListId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    priceListVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    serviceRateId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    chargeCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    serviceCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    chargeNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
      immutable: true,
    },
    categoryCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    departmentId: nullableBillingObjectId,
    serviceLineCodeSnapshot: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    quantity: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },
    originalRate: billingNonNegativeDecimal,
    authoritativeRate: billingNonNegativeDecimal,
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    ...billingMoneyFields,
    packageEnrollmentId: nullableBillingObjectId,
    payerOrganizationId: nullableBillingObjectId,
    patientCoverageId: nullableBillingObjectId,
    taxCategoryCodeSnapshot: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    discountIds: billingObjectIdArray,
  },
  billingTimestampedSchemaOptions('invoiceLines'),
);

invoiceLineSchema.pre('validate', function () {
  this.sourceModuleSnapshot = normalizeBillingCode(
    this.sourceModuleSnapshot,
  );
  this.sourceRecordTypeSnapshot = normalizeBillingCode(
    this.sourceRecordTypeSnapshot,
  );
  this.chargeCodeSnapshot = normalizeBillingCode(
    this.chargeCodeSnapshot,
  );
  this.serviceCodeSnapshot = normalizeBillingCode(
    this.serviceCodeSnapshot,
  );
  this.categoryCodeSnapshot = normalizeBillingCode(
    this.categoryCodeSnapshot,
  );
  this.currency = normalizeBillingCode(this.currency);
  validateNonNegativeInventoryDecimal(
    this,
    'originalRate',
    this.originalRate,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'authoritativeRate',
    this.authoritativeRate,
  );
  validateBillingMoney(this);
  validateQuantityPriceGross(
    this,
    'quantity',
    'authoritativeRate',
    'grossAmount',
  );
});

invoiceLineSchema.index(
  { facilityId: 1, invoiceId: 1, lineNumber: 1 },
  { name: 'uq_invoice_lines_invoice_line', unique: true },
);
invoiceLineSchema.index(
  { facilityId: 1, invoiceId: 1, accountChargeId: 1 },
  { name: 'uq_invoice_lines_charge', unique: true },
);
invoiceLineSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
    departmentId: 1,
    createdAt: -1,
  },
  { name: 'ix_invoice_lines_revenue_reporting' },
);

export const invoiceStatusHistorySchema = new Schema(
  {
    ...billingCommonFields,
    invoiceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      required: true,
      enum: invoiceHistoryActionValues,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      enum: [...invoiceStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: invoiceStatusValues,
      immutable: true,
    },
    invoiceVersion: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      immutable: true,
    },
    originalInvoiceId: nullableBillingObjectId,
    replacementInvoiceId: nullableBillingObjectId,
    changedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  billingTimestampedSchemaOptions('invoiceStatusHistories'),
);

invoiceStatusHistorySchema.index(
  { facilityId: 1, invoiceId: 1, invoiceVersion: 1 },
  { name: 'uq_invoice_status_history_version', unique: true },
);
invoiceStatusHistorySchema.index(
  { facilityId: 1, changedAt: -1, action: 1 },
  { name: 'ix_invoice_status_history_changed' },
);

const financialNoteFields = {
  noteNumber: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 120,
  },
  patientAccountId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  patientId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  originalFinancialRecordId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  amount: billingNonNegativeDecimal,
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
    enum: financialNoteStatusValues,
    default: 'DRAFT',
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
  postedAt: {
    type: Date,
    default: null,
  },
  postedBy: nullableBillingObjectId,
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
} as const;

export const creditNoteSchema = new Schema(
  {
    ...billingCommonFields,
    ...financialNoteFields,
    affectedAccountChargeIds: billingObjectIdArray,
  },
  billingTimestampedSchemaOptions('creditNotes'),
);

export const debitNoteSchema = new Schema(
  {
    ...billingCommonFields,
    ...financialNoteFields,
    replacementAccountChargeIds: billingObjectIdArray,
  },
  billingTimestampedSchemaOptions('debitNotes'),
);

interface FinancialNoteDocument {
  noteNumber: string;
  currency: string;
  reasonCode: string;
  amount: unknown;
  status: string;
  postedAt?: Date | null;
  postedBy?: unknown | null;
  reversedAt?: Date | null;
  reversedBy?: unknown | null;
  reversalReason?: string | null;
  invalidate(path: string, message: string): void;
}

function validateFinancialNote(
  record: FinancialNoteDocument,
): void {
  record.noteNumber = normalizeBillingCode(record.noteNumber);
  record.currency = normalizeBillingCode(record.currency);
  record.reasonCode = normalizeBillingCode(record.reasonCode);
  validatePositiveInventoryDecimal(
    record,
    'amount',
    record.amount,
  );

  if (
    record.status === 'POSTED' &&
    (record.postedAt == null || record.postedBy == null)
  ) {
    record.invalidate(
      'status',
      'Posted financial notes require posting attribution',
    );
  }
  if (
    record.status === 'REVERSED' &&
    (record.reversedAt == null ||
      record.reversedBy == null ||
      record.reversalReason == null)
  ) {
    record.invalidate(
      'status',
      'Reversed financial notes require reversal attribution and reason',
    );
  }
}

creditNoteSchema.pre('validate', function () {
  validateFinancialNote(this);
});
debitNoteSchema.pre('validate', function () {
  validateFinancialNote(this);
});

for (const [schema, prefix] of [
  [creditNoteSchema, 'credit_notes'],
  [debitNoteSchema, 'debit_notes'],
] as const) {
  schema.index(
    { facilityId: 1, noteNumber: 1 },
    { name: `uq_${prefix}_facility_number`, unique: true },
  );
  schema.index(
    { facilityId: 1, invoiceId: 1, status: 1, createdAt: -1 },
    { name: `ix_${prefix}_invoice_status` },
  );
}

export const discountSchema = new Schema(
  {
    ...billingCommonFields,
    discountNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    invoiceId: nullableBillingObjectId,
    invoiceLineId: nullableBillingObjectId,
    accountChargeId: nullableBillingObjectId,
    scope: {
      type: String,
      required: true,
      enum: discountScopeValues,
    },
    discountType: {
      type: String,
      required: true,
      enum: discountTypeValues,
    },
    requestedValue: billingNonNegativeDecimal,
    approvedAmount: billingNonNegativeDecimal,
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
    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
    appliedBy: nullableBillingObjectId,
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
  billingTimestampedSchemaOptions('discounts'),
);

discountSchema.pre('validate', function () {
  this.discountNumber = normalizeBillingCode(this.discountNumber);
  this.reasonCode = normalizeBillingCode(this.reasonCode);
  if (this.discountType === 'PERCENTAGE') {
    validatePercentage(this, 'requestedValue', this.requestedValue);
  } else {
    validateNonNegativeInventoryDecimal(
      this,
      'requestedValue',
      this.requestedValue,
    );
  }
  validateNonNegativeInventoryDecimal(
    this,
    'approvedAmount',
    this.approvedAmount,
  );

  if (
    this.scope === 'LINE' &&
    this.invoiceLineId == null &&
    this.accountChargeId == null
  ) {
    this.invalidate(
      'scope',
      'Line discounts require an invoice-line or account-charge reference',
    );
  }
  validateAllOrNone(
    this,
    ['reversedAt', 'reversedBy', 'reversalReason'],
    'Discount reversal requires actor, timestamp, and reason',
  );
});

discountSchema.index(
  { facilityId: 1, discountNumber: 1 },
  { name: 'uq_discounts_facility_number', unique: true },
);
discountSchema.index(
  { facilityId: 1, patientAccountId: 1, requestedAt: -1 },
  { name: 'ix_discounts_account_requested' },
);

export const financialApprovalRequestSchema = new Schema(
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
    approvalType: {
      type: String,
      required: true,
      enum: approvalTypeValues,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientAccountId: nullableBillingObjectId,
    amount: billingNonNegativeDecimal,
    thresholdAmountSnapshot: billingNonNegativeDecimal,
    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    status: {
      type: String,
      required: true,
      enum: approvalStatusValues,
      default: 'PENDING',
    },
    decidedBy: nullableBillingObjectId,
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    makerCheckerSatisfied: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  billingTimestampedSchemaOptions('financialApprovalRequests'),
);

financialApprovalRequestSchema.pre('validate', function () {
  this.requestNumber = normalizeBillingCode(this.requestNumber);
  this.entityType = normalizeBillingCode(this.entityType);
  validateNonNegativeInventoryDecimal(this, 'amount', this.amount);
  validateNonNegativeInventoryDecimal(
    this,
    'thresholdAmountSnapshot',
    this.thresholdAmountSnapshot,
  );

  if (this.status === 'PENDING') {
    if (
      this.decidedBy != null ||
      this.decidedAt != null ||
      this.decisionReason != null
    ) {
      this.invalidate(
        'status',
        'Pending approval requests cannot retain decision metadata',
      );
    }
  } else if (
    this.decidedBy == null ||
    this.decidedAt == null ||
    this.decisionReason == null
  ) {
    this.invalidate(
      'status',
      'Decided approval requests require decision attribution and reason',
    );
  }

  if (
    this.decidedBy != null &&
    this.decidedBy.equals(this.requestedBy)
  ) {
    this.invalidate(
      'decidedBy',
      'Sensitive financial operations require an independent checker',
    );
  }
});

financialApprovalRequestSchema.index(
  { facilityId: 1, requestNumber: 1 },
  {
    name: 'uq_financial_approvals_facility_number',
    unique: true,
  },
);
financialApprovalRequestSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_financial_approvals_operation',
    unique: true,
  },
);
financialApprovalRequestSchema.index(
  {
    facilityId: 1,
    status: 1,
    approvalType: 1,
    requestedAt: 1,
  },
  { name: 'ix_financial_approvals_queue' },
);

export const discountApprovalSchema = new Schema(
  {
    ...billingCommonFields,
    discountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    financialApprovalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    approvedAmount: billingNonNegativeDecimal,
    approvedPercentage: billingNonNegativeDecimal,
    status: {
      type: String,
      required: true,
      enum: approvalStatusValues,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    decidedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    decisionReason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      immutable: true,
    },
  },
  billingTimestampedSchemaOptions('discountApprovals'),
);

discountApprovalSchema.pre('validate', function () {
  validateNonNegativeInventoryDecimal(
    this,
    'approvedAmount',
    this.approvedAmount,
  );
  validatePercentage(
    this,
    'approvedPercentage',
    this.approvedPercentage,
  );
});

discountApprovalSchema.index(
  { facilityId: 1, discountId: 1 },
  { name: 'uq_discount_approvals_discount', unique: true },
);
discountApprovalSchema.index(
  { facilityId: 1, decidedAt: -1, decidedBy: 1 },
  { name: 'ix_discount_approvals_decision' },
);

export type Invoice = InferSchemaType<typeof invoiceSchema>;
export type InvoiceLine = InferSchemaType<typeof invoiceLineSchema>;
export type InvoiceStatusHistory = InferSchemaType<
  typeof invoiceStatusHistorySchema
>;
export type CreditNote = InferSchemaType<typeof creditNoteSchema>;
export type DebitNote = InferSchemaType<typeof debitNoteSchema>;
export type Discount = InferSchemaType<typeof discountSchema>;
export type FinancialApprovalRequest = InferSchemaType<
  typeof financialApprovalRequestSchema
>;
export type DiscountApproval = InferSchemaType<
  typeof discountApprovalSchema
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

export const InvoiceModel = modelFor('invoices', invoiceSchema);
export const InvoiceLineModel = modelFor(
  'invoiceLines',
  invoiceLineSchema,
);
export const InvoiceStatusHistoryModel = modelFor(
  'invoiceStatusHistories',
  invoiceStatusHistorySchema,
);
export const CreditNoteModel = modelFor(
  'creditNotes',
  creditNoteSchema,
);
export const DebitNoteModel = modelFor(
  'debitNotes',
  debitNoteSchema,
);
export const DiscountModel = modelFor('discounts', discountSchema);
export const FinancialApprovalRequestModel = modelFor(
  'financialApprovalRequests',
  financialApprovalRequestSchema,
);
export const DiscountApprovalModel = modelFor(
  'discountApprovals',
  discountApprovalSchema,
);