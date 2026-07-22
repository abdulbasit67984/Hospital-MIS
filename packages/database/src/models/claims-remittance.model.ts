import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingDecimalExpressionEquals,
  normalizeBillingCode,
} from './billing-schema-helpers.js';

import {
  claimAdjustmentStatusValues,
  claimAdjustmentTypeValues,
  claimCurrencyValues,
} from './claims.types.js';

import {
  claimCommonFields,
  claimHash,
  claimNonNegativeDecimal,
  claimPositiveDecimal,
  claimTimestampedSchemaOptions,
  nullableClaimObjectId,
  requireClaimReason,
  validateClaimMoneyFields,
  validateClaimPositiveDecimal,
} from './claims-schema-helpers.js';

const claimRemittanceAllocationSchema = new Schema(
  {
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    paidAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    contractualAdjustmentAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    disallowedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    withholdingAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    payerClaimReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    payerLineReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
  },
  {
    _id: true,
    strict: true,
  },
);

claimRemittanceAllocationSchema.pre(
  'validate',
  function validateRemittanceAllocation() {
    validateClaimMoneyFields(this, [
      'paidAmount',
      'contractualAdjustmentAmount',
      'disallowedAmount',
      'withholdingAmount',
    ]);
  },
);

export const claimRemittanceSchema = new Schema(
  {
    ...claimCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    remittanceNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    remittanceReference: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 240,
    },
    remittanceDate: {
      type: Date,
      required: true,
      immutable: true,
    },
    sponsorPaymentId: nullableClaimObjectId,
    sponsorPaymentReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: claimCurrencyValues,
      default: 'PKR',
    },
    totalPaymentAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    allocatedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    unappliedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    attachmentId: nullableClaimObjectId,
    allocations: {
      type: [claimRemittanceAllocationSchema],
      required: true,
      immutable: true,
      default: [],
      validate: {
        validator: (values: readonly unknown[]) => values.length <= 10_000,
        message: 'Remittances can contain at most 10,000 allocations',
      },
    },
    importedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    importedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    immutableHash: claimHash,
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableClaimObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claimRemittances'),
);

claimRemittanceSchema.pre('validate', function validateClaimRemittance() {
  this.remittanceNumber = normalizeBillingCode(this.remittanceNumber);
  validateClaimMoneyFields(this, [
    'totalPaymentAmount',
    'allocatedAmount',
    'unappliedAmount',
  ]);

  const allocationKeys = this.allocations.map((allocation) =>
    [
      String(allocation.claimId),
      allocation.claimLineId == null
        ? 'HEADER'
        : String(allocation.claimLineId),
    ].join(':'),
  );

  if (new Set(allocationKeys).size !== allocationKeys.length) {
    this.invalidate(
      'allocations',
      'A remittance can allocate to each claim or claim line only once',
    );
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [this.allocatedAmount, this.unappliedAmount],
        [],
        this.totalPaymentAmount,
      )
    ) {
      this.invalidate(
        'allocatedAmount',
        'Allocated plus unapplied amount must equal the remittance payment total',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        this.allocations.map((allocation) => allocation.paidAmount),
        [],
        this.allocatedAmount,
      )
    ) {
      this.invalidate(
        'allocations',
        'The sum of remittance allocation paid amounts must equal the allocated amount',
      );
    }
  } catch (error) {
    this.invalidate(
      'totalPaymentAmount',
      error instanceof Error
        ? error.message
        : 'Remittance amounts must be valid decimals',
    );
  }

  if (this.reversedAt != null) {
    requireClaimReason(this, 'reversalReason', this.reversalReason);
    if (this.reversedBy == null) {
      this.invalidate(
        'reversedBy',
        'Reversed remittances require an actor',
      );
    }
  }
});

claimRemittanceSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_claim_remittances_operation', unique: true },
);
claimRemittanceSchema.index(
  { facilityId: 1, remittanceNumber: 1 },
  { name: 'uq_claim_remittances_number', unique: true },
);
claimRemittanceSchema.index(
  {
    facilityId: 1,
    payerOrganizationId: 1,
    remittanceReference: 1,
  },
  { name: 'uq_claim_remittances_payer_reference', unique: true },
);
claimRemittanceSchema.index(
  { facilityId: 1, sponsorPaymentId: 1, remittanceDate: -1 },
  { name: 'ix_claim_remittances_sponsor_payment' },
);
claimRemittanceSchema.index(
  { facilityId: 1, 'allocations.claimId': 1, remittanceDate: -1 },
  { name: 'ix_claim_remittances_claim' },
);

export const claimPaymentSchema = new Schema(
  {
    ...claimCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    remittanceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sponsorPaymentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    amount: {
      ...claimPositiveDecimal,
      immutable: true,
    },
    postedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    postedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    immutableHash: claimHash,
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableClaimObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claimPayments'),
);

claimPaymentSchema.pre('validate', function validateClaimPayment() {
  validateClaimPositiveDecimal(this, 'amount');

  if (this.reversedAt != null) {
    requireClaimReason(this, 'reversalReason', this.reversalReason);
    if (this.reversedBy == null) {
      this.invalidate(
        'reversedBy',
        'Reversed claim payments require an actor',
      );
    }
  }
});

claimPaymentSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_claim_payments_operation', unique: true },
);
claimPaymentSchema.index(
  {
    facilityId: 1,
    remittanceId: 1,
    claimId: 1,
    claimLineId: 1,
  },
  { name: 'uq_claim_payments_remittance_target', unique: true },
);
claimPaymentSchema.index(
  { facilityId: 1, claimId: 1, postedAt: -1 },
  { name: 'ix_claim_payments_claim' },
);
claimPaymentSchema.index(
  { facilityId: 1, sponsorPaymentId: 1, postedAt: -1 },
  { name: 'ix_claim_payments_sponsor_payment' },
);

export const claimAdjustmentSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    adjustmentType: {
      type: String,
      required: true,
      immutable: true,
      enum: claimAdjustmentTypeValues,
    },
    amount: {
      ...claimPositiveDecimal,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 4_000,
    },
    makerUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    checkerUserId: nullableClaimObjectId,
    approvalRequestId: nullableClaimObjectId,
    status: {
      type: String,
      required: true,
      enum: claimAdjustmentStatusValues,
      default: 'REQUESTED',
    },
    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    postedAt: {
      type: Date,
      default: null,
    },
    immutableHash: claimHash,
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableClaimObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claimAdjustments'),
);

claimAdjustmentSchema.pre('validate', function validateClaimAdjustment() {
  validateClaimPositiveDecimal(this, 'amount');

  if (
    this.checkerUserId != null &&
    this.checkerUserId.equals(this.makerUserId)
  ) {
    this.invalidate(
      'checkerUserId',
      'Claim adjustment maker and checker must be different users',
    );
  }

  if (
    ['APPROVED', 'POSTED'].includes(this.status) &&
    (this.checkerUserId == null || this.approvalRequestId == null)
  ) {
    this.invalidate(
      'checkerUserId',
      'Approved adjustments require independent approval metadata',
    );
  }

  if (this.status === 'POSTED' && this.postedAt == null) {
    this.invalidate(
      'postedAt',
      'Posted adjustments require a posting timestamp',
    );
  }

  if (this.status === 'REVERSED') {
    requireClaimReason(this, 'reversalReason', this.reversalReason);
    if (this.reversedBy == null || this.reversedAt == null) {
      this.invalidate(
        'reversedBy',
        'Reversed adjustments require actor and timestamp metadata',
      );
    }
  }
});

claimAdjustmentSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_claim_adjustments_hash', unique: true },
);
claimAdjustmentSchema.index(
  { facilityId: 1, claimId: 1, status: 1, requestedAt: -1 },
  { name: 'ix_claim_adjustments_claim_status' },
);
claimAdjustmentSchema.index(
  {
    facilityId: 1,
    checkerUserId: 1,
    status: 1,
    requestedAt: 1,
  },
  { name: 'ix_claim_adjustments_approval_queue' },
);

export type ClaimRemittance = InferSchemaType<
  typeof claimRemittanceSchema
>;
export type ClaimPayment = InferSchemaType<typeof claimPaymentSchema>;
export type ClaimAdjustment = InferSchemaType<
  typeof claimAdjustmentSchema
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

export const ClaimRemittanceModel = modelFor(
  'claimRemittances',
  claimRemittanceSchema,
);
export const ClaimPaymentModel = modelFor(
  'claimPayments',
  claimPaymentSchema,
);
export const ClaimAdjustmentModel = modelFor(
  'claimAdjustments',
  claimAdjustmentSchema,
);