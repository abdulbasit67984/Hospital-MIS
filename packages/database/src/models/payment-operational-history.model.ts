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
} from './billing-schema-helpers.js';

import {
  paymentOperationalActionValues,
  paymentOperationalEntityTypeValues,
} from './payment-cashier.types.js';

export const paymentOperationalHistorySchema = new Schema(
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

    eventNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },

    entityType: {
      type: String,
      required: true,
      immutable: true,
      enum: paymentOperationalEntityTypeValues,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    action: {
      type: String,
      required: true,
      immutable: true,
      enum: paymentOperationalActionValues,
    },

    statusFrom: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    statusTo: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    amount: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },

    currency: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    reasonCode: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    reason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
    },

    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    actorStaffId: nullableBillingObjectId,
    approvalRequestId: nullableBillingObjectId,
    cashCounterId: nullableBillingObjectId,
    cashShiftId: nullableBillingObjectId,
    paymentMethodConfigurationId:
      nullableBillingObjectId,
    patientId: nullableBillingObjectId,
    patientAccountId: nullableBillingObjectId,
    invoiceId: nullableBillingObjectId,
    paymentId: nullableBillingObjectId,
    refundId: nullableBillingObjectId,
    receiptId: nullableBillingObjectId,

    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },

    metadata: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
      default: {},
    },
  },
  billingTimestampedSchemaOptions(
    'paymentOperationalHistories',
  ),
);

paymentOperationalHistorySchema.pre(
  'validate',
  function validatePaymentOperationalHistory() {
    this.eventNumber = normalizeBillingCode(
      this.eventNumber,
    );

    if (this.currency != null) {
      this.currency = normalizeBillingCode(
        this.currency,
      );
    }

    if (this.reasonCode != null) {
      this.reasonCode = normalizeBillingCode(
        this.reasonCode,
      );
    }

    if (
      (this.statusFrom == null) !==
      (this.statusTo == null)
    ) {
      this.invalidate(
        'statusTo',
        'Status history must include both previous and next status values',
      );
    }

    if (
      this.amount != null &&
      this.currency == null
    ) {
      this.invalidate(
        'currency',
        'Financial history amounts require a currency',
      );
    }

    if (
      [
        'DEACTIVATED',
        'SUSPENDED',
        'CLOSING_BLOCKED',
        'REJECTED',
        'CANCELLED',
        'REFUNDED',
        'REVERSED',
        'CORRECTED',
      ].includes(this.action) &&
      this.reason == null
    ) {
      this.invalidate(
        'reason',
        'Sensitive payment history actions require a reason',
      );
    }
  },
);

paymentOperationalHistorySchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_payment_operational_histories_operation',
    unique: true,
  },
);

paymentOperationalHistorySchema.index(
  { facilityId: 1, eventNumber: 1 },
  {
    name: 'uq_payment_operational_histories_number',
    unique: true,
  },
);

paymentOperationalHistorySchema.index(
  {
    facilityId: 1,
    entityType: 1,
    entityId: 1,
    occurredAt: 1,
  },
  { name: 'ix_payment_operational_histories_entity' },
);

paymentOperationalHistorySchema.index(
  {
    facilityId: 1,
    cashShiftId: 1,
    occurredAt: 1,
  },
  { name: 'ix_payment_operational_histories_shift' },
);

paymentOperationalHistorySchema.index(
  {
    facilityId: 1,
    actorUserId: 1,
    occurredAt: -1,
  },
  { name: 'ix_payment_operational_histories_actor' },
);

export type PaymentOperationalHistory = InferSchemaType<
  typeof paymentOperationalHistorySchema
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

export const PaymentOperationalHistoryModel = modelFor(
  'paymentOperationalHistories',
  paymentOperationalHistorySchema,
);