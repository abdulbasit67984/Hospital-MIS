import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingTimestampedSchemaOptions,
  compareInventoryDecimals,
  normalizeBillingCode,
  nullableBillingObjectId,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  cashMovementStatusValues,
  cashMovementTypeValues,
} from './payment-cashier.types.js';

export const cashMovementSchema = new Schema(
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

    movementNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    movementType: {
      type: String,
      required: true,
      immutable: true,
      enum: cashMovementTypeValues,
    },

    status: {
      type: String,
      required: true,
      enum: cashMovementStatusValues,
      default: 'DRAFT',
    },

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

    sourceCounterId: nullableBillingObjectId,
    sourceShiftId: nullableBillingObjectId,
    destinationCounterId: nullableBillingObjectId,
    destinationShiftId: nullableBillingObjectId,

    destinationSafeReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },

    sourceDocumentType: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    sourceDocumentId: nullableBillingObjectId,

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

    approvalRequestId: nullableBillingObjectId,

    approvedBy: nullableBillingObjectId,

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedBy: nullableBillingObjectId,

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },

    postedBy: nullableBillingObjectId,

    postedAt: {
      type: Date,
      default: null,
    },

    financialLedgerTransactionId:
      nullableBillingObjectId,

    expectedCashEffect: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
    },

    reversalOfCashMovementId: nullableBillingObjectId,
    reversedByCashMovementId: nullableBillingObjectId,

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('cashMovements'),
);

cashMovementSchema.pre(
  'validate',
  function validateCashMovement() {
    this.movementNumber = normalizeBillingCode(
      this.movementNumber,
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

    const expectedSign = [
      'OPENING_FLOAT',
      'CASH_COLLECTION',
    ].includes(this.movementType)
      ? 1
      : [
            'CASH_REFUND',
            'CASH_PAID_OUT',
            'CASH_DROP',
            'SAFE_DEPOSIT',
          ].includes(this.movementType)
        ? -1
        : 0;

    const actualSign = compareInventoryDecimals(
      this.expectedCashEffect,
      '0',
    );

    if (
      expectedSign !== 0 &&
      Math.sign(actualSign) !== expectedSign
    ) {
      this.invalidate(
        'expectedCashEffect',
        'Expected-cash effect has an invalid sign for the movement type',
      );
    }

    if (
      ['COUNTER_TRANSFER', 'SHIFT_TRANSFER'].includes(
        this.movementType,
      ) &&
      (this.destinationCounterId == null ||
        this.sourceCounterId == null)
    ) {
      this.invalidate(
        'destinationCounterId',
        'Cash transfers require source and destination counters',
      );
    }

    if (
      this.movementType === 'SHIFT_TRANSFER' &&
      (this.sourceShiftId == null ||
        this.destinationShiftId == null)
    ) {
      this.invalidate(
        'destinationShiftId',
        'Shift transfers require source and destination shifts',
      );
    }

    if (
      this.movementType === 'SAFE_DEPOSIT' &&
      this.destinationSafeReference == null
    ) {
      this.invalidate(
        'destinationSafeReference',
        'Safe deposits require a destination-safe reference',
      );
    }

    if (
      ['APPROVED', 'POSTED'].includes(this.status) &&
      (this.approvedBy == null ||
        this.approvedAt == null ||
        this.approvalRequestId == null)
    ) {
      this.invalidate(
        'approvedBy',
        'Approved cash movements require approval attribution',
      );
    }

    if (
      this.approvedBy != null &&
      this.approvedBy.equals(this.requestedBy)
    ) {
      this.invalidate(
        'approvedBy',
        'Cash-movement maker cannot approve the same movement',
      );
    }

    if (
      this.status === 'POSTED' &&
      (this.postedBy == null ||
        this.postedAt == null ||
        this.financialLedgerTransactionId == null)
    ) {
      this.invalidate(
        'status',
        'Posted cash movements require posting attribution and ledger transaction',
      );
    }

    if (
      this.status === 'REJECTED' &&
      (this.rejectedBy == null ||
        this.rejectedAt == null ||
        this.rejectionReason == null)
    ) {
      this.invalidate(
        'status',
        'Rejected cash movements require rejection attribution and reason',
      );
    }

    if (
      this.status === 'REVERSED' &&
      (this.reversalOfCashMovementId == null ||
        this.reversedByCashMovementId == null ||
        this.reversalReason == null)
    ) {
      this.invalidate(
        'status',
        'Reversed cash movements require original, replacement, and reason references',
      );
    }
  },
);

cashMovementSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_cash_movements_operation',
    unique: true,
  },
);

cashMovementSchema.index(
  { facilityId: 1, movementNumber: 1 },
  {
    name: 'uq_cash_movements_number',
    unique: true,
  },
);

cashMovementSchema.index(
  {
    facilityId: 1,
    sourceShiftId: 1,
    status: 1,
    requestedAt: 1,
  },
  { name: 'ix_cash_movements_source_shift' },
);

cashMovementSchema.index(
  {
    facilityId: 1,
    destinationShiftId: 1,
    status: 1,
    requestedAt: 1,
  },
  { name: 'ix_cash_movements_destination_shift' },
);

cashMovementSchema.index(
  { facilityId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_cash_movements_approval_queue' },
);

export type CashMovement = InferSchemaType<
  typeof cashMovementSchema
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

export const CashMovementModel = modelFor(
  'cashMovements',
  cashMovementSchema,
);