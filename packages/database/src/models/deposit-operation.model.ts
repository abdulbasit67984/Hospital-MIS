import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

export const depositApplicationSchema = new Schema(
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

    applicationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    depositId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourcePatientAccountId: nullableBillingObjectId,

    targetPatientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    targetInvoiceId: nullableBillingObjectId,

    amount: {
      type: Schema.Types.Decimal128,
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

    appliedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    appliedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    cashCounterId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,

    paymentAllocationId: nullableBillingObjectId,
    financialLedgerTransactionId: nullableBillingObjectId,

    recordType: {
      type: String,
      required: true,
      immutable: true,
      enum: ['APPLICATION', 'REVERSAL'],
      default: 'APPLICATION',
    },

    originalApplicationId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions(
    'depositApplications',
  ),
);

depositApplicationSchema.pre(
  'validate',
  function validateDepositApplication() {
    this.applicationNumber = normalizeBillingCode(
      this.applicationNumber,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );

    validatePositiveInventoryDecimal(
      this,
      'amount',
      this.amount,
    );

    if (
      this.paymentAllocationId == null ||
      this.financialLedgerTransactionId == null
    ) {
      this.invalidate(
        'paymentAllocationId',
        'Deposit application records require allocation and ledger references',
      );
    }

    if (
      this.recordType === 'REVERSAL' &&
      (this.originalApplicationId == null ||
        this.reversalReason == null)
    ) {
      this.invalidate(
        'originalApplicationId',
        'Deposit-application reversals require the original record and a reason',
      );
    }

    if (
      this.recordType === 'APPLICATION' &&
      this.originalApplicationId != null
    ) {
      this.invalidate(
        'originalApplicationId',
        'Ordinary deposit applications cannot reference an original application',
      );
    }
  },
);

depositApplicationSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_deposit_applications_operation',
    unique: true,
  },
);

depositApplicationSchema.index(
  { facilityId: 1, applicationNumber: 1 },
  {
    name: 'uq_deposit_applications_number',
    unique: true,
  },
);

depositApplicationSchema.index(
  { facilityId: 1, depositId: 1, appliedAt: 1 },
  { name: 'ix_deposit_applications_deposit' },
);

export const depositTransferSchema = new Schema(
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

    transferNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    sourceDepositId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourcePatientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    sourcePatientAccountId: nullableBillingObjectId,

    destinationPatientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    destinationPatientAccountId: nullableBillingObjectId,
    destinationDepositId: nullableBillingObjectId,

    amount: {
      type: Schema.Types.Decimal128,
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

    reasonCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },

    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    transferredAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    financialLedgerTransactionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    recordType: {
      type: String,
      required: true,
      immutable: true,
      enum: ['TRANSFER', 'REVERSAL'],
      default: 'TRANSFER',
    },

    originalTransferId: {
      ...nullableBillingObjectId,
      immutable: true,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('depositTransfers'),
);

depositTransferSchema.pre(
  'validate',
  function validateDepositTransfer() {
    this.transferNumber = normalizeBillingCode(
      this.transferNumber,
    );
    this.reasonCode = normalizeBillingCode(
      this.reasonCode,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );

    validatePositiveInventoryDecimal(
      this,
      'amount',
      this.amount,
    );

    if (this.approvedBy.equals(this.requestedBy)) {
      this.invalidate(
        'approvedBy',
        'Deposit-transfer maker cannot approve the same transfer',
      );
    }

    if (
      this.sourcePatientId.equals(
        this.destinationPatientId,
      ) &&
      this.sourcePatientAccountId != null &&
      this.destinationPatientAccountId != null &&
      this.sourcePatientAccountId.equals(
        this.destinationPatientAccountId,
      )
    ) {
      this.invalidate(
        'destinationPatientAccountId',
        'Deposit transfer requires a different eligible destination account',
      );
    }

    if (this.destinationDepositId == null) {
      this.invalidate(
        'destinationDepositId',
        'Deposit-transfer records require the destination deposit record',
      );
    }

    if (
      this.recordType === 'REVERSAL' &&
      (this.originalTransferId == null ||
        this.reversalReason == null)
    ) {
      this.invalidate(
        'originalTransferId',
        'Deposit-transfer reversals require the original record and a reason',
      );
    }

    if (
      this.recordType === 'TRANSFER' &&
      this.originalTransferId != null
    ) {
      this.invalidate(
        'originalTransferId',
        'Ordinary deposit transfers cannot reference an original transfer',
      );
    }
  },
);

depositTransferSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_deposit_transfers_operation',
    unique: true,
  },
);

depositTransferSchema.index(
  { facilityId: 1, transferNumber: 1 },
  {
    name: 'uq_deposit_transfers_number',
    unique: true,
  },
);

depositTransferSchema.index(
  {
    facilityId: 1,
    sourceDepositId: 1,
    transferredAt: 1,
  },
  { name: 'ix_deposit_transfers_source' },
);

export type DepositApplication = InferSchemaType<
  typeof depositApplicationSchema
>;

export type DepositTransfer = InferSchemaType<
  typeof depositTransferSchema
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

export const DepositApplicationModel = modelFor(
  'depositApplications',
  depositApplicationSchema,
);

export const DepositTransferModel = modelFor(
  'depositTransfers',
  depositTransferSchema,
);