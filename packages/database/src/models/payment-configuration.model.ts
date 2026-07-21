import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  compareInventoryDecimals,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingStringArray,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateEffectiveWindow,
  validateNonNegativeInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  activeShiftPolicyValues,
  cashCounterTypeValues,
  paymentMethodCodeValues,
  paymentMethodKindValues,
  paymentSettlementModeValues,
} from './payment-cashier.types.js';

export const paymentMethodConfigurationSchema = new Schema(
  {
    ...billingCommonFields,

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },

    methodCode: {
      type: String,
      required: true,
      enum: paymentMethodCodeValues,
    },

    methodKind: {
      type: String,
      required: true,
      enum: paymentMethodKindValues,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },

    effectiveFrom: {
      type: Date,
      required: true,
    },

    effectiveThrough: {
      type: Date,
      default: null,
    },

    allowedCurrencies: {
      type: [String],
      required: true,
      default: ['PKR'],
      validate: {
        validator(value: string[]) {
          return (
            value.length > 0 &&
            new Set(value).size === value.length
          );
        },
        message:
          'Payment methods require at least one unique allowed currency',
      },
    },

    externalReferenceRequired: {
      type: Boolean,
      required: true,
      default: false,
    },

    bankReferenceRequired: {
      type: Boolean,
      required: true,
      default: false,
    },

    cardReferenceRequired: {
      type: Boolean,
      required: true,
      default: false,
    },

    cashEquivalent: {
      type: Boolean,
      required: true,
      default: false,
    },

    refundEligible: {
      type: Boolean,
      required: true,
      default: true,
    },

    reversalEligible: {
      type: Boolean,
      required: true,
      default: true,
    },

    settlementMode: {
      type: String,
      required: true,
      enum: paymentSettlementModeValues,
      default: 'IMMEDIATE',
    },

    settlementDelayHours: {
      type: Number,
      default: null,
      min: 1,
      max: 8_760,
    },

    permissionCodes: billingStringArray,

    cashLedgerAccountId: nullableBillingObjectId,
    clearingLedgerAccountId: nullableBillingObjectId,
    receivableLedgerAccountId: nullableBillingObjectId,

    externalProviderCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    requiresOpenCashierShift: {
      type: Boolean,
      required: true,
      default: true,
    },

    deactivatedAt: {
      type: Date,
      default: null,
    },

    deactivatedBy: nullableBillingObjectId,

    deactivationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions(
    'paymentMethodConfigurations',
  ),
);

paymentMethodConfigurationSchema.pre(
  'validate',
  function validatePaymentMethodConfiguration() {
    this.code = normalizeBillingCode(this.code);
    this.allowedCurrencies = this.allowedCurrencies.map(
      (currency) => normalizeBillingCode(currency),
    );
    this.permissionCodes = this.permissionCodes.map(
      (permission) => permission.trim(),
    );

    validateEffectiveWindow(
      this,
      'effectiveFrom',
      'effectiveThrough',
    );

    if (
      this.settlementMode === 'DELAYED' &&
      this.settlementDelayHours == null
    ) {
      this.invalidate(
        'settlementDelayHours',
        'Delayed payment methods require a settlement delay',
      );
    }

    if (
      this.settlementMode !== 'DELAYED' &&
      this.settlementDelayHours != null
    ) {
      this.invalidate(
        'settlementDelayHours',
        'Settlement delay is only valid for delayed settlement methods',
      );
    }

    if (
      this.methodKind === 'CASH' &&
      (!this.cashEquivalent ||
        this.settlementMode !== 'IMMEDIATE')
    ) {
      this.invalidate(
        'cashEquivalent',
        'Cash methods must be cash-equivalent and settle immediately',
      );
    }

    if (
      this.cardReferenceRequired &&
      this.methodKind !== 'CARD'
    ) {
      this.invalidate(
        'cardReferenceRequired',
        'Card reference requirements are only valid for card methods',
      );
    }

    if (
      this.bankReferenceRequired &&
      this.methodKind !== 'BANK'
    ) {
      this.invalidate(
        'bankReferenceRequired',
        'Bank reference requirements are only valid for bank methods',
      );
    }

    if (!this.active) {
      if (
        this.deactivatedAt == null ||
        this.deactivatedBy == null ||
        this.deactivationReason == null
      ) {
        this.invalidate(
          'active',
          'Inactive payment methods require deactivation attribution and reason',
        );
      }
    }
  },
);

paymentMethodConfigurationSchema.index(
  { facilityId: 1, code: 1 },
  {
    name: 'uq_payment_method_configurations_code',
    unique: true,
  },
);

paymentMethodConfigurationSchema.index(
  {
    facilityId: 1,
    active: 1,
    effectiveFrom: 1,
    effectiveThrough: 1,
  },
  { name: 'ix_payment_method_configurations_effective' },
);

export const cashCounterSchema = new Schema(
  {
    ...billingCommonFields,

    counterCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },

    location: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },

    departmentId: nullableBillingObjectId,

    counterType: {
      type: String,
      required: true,
      enum: cashCounterTypeValues,
    },

    active: {
      type: Boolean,
      required: true,
      default: true,
    },

    assignedUserIds: billingObjectIdArray,

    allowedPaymentMethodConfigurationIds:
      billingObjectIdArray,

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },

    cashHoldingLimit: billingNonNegativeDecimal,

    openingFloatRequired: {
      type: Boolean,
      required: true,
      default: true,
    },

    minimumOpeningFloat: billingNonNegativeDecimal,
    maximumOpeningFloat: billingNonNegativeDecimal,

    activeShiftPolicy: {
      type: String,
      required: true,
      enum: activeShiftPolicyValues,
      default: 'CASHIER_AND_COUNTER',
    },

    supervisorApprovalRequiredForClose: {
      type: Boolean,
      required: true,
      default: true,
    },

    negativeExpectedCashAllowed: {
      type: Boolean,
      required: true,
      default: false,
    },

    deactivatedAt: {
      type: Date,
      default: null,
    },

    deactivatedBy: nullableBillingObjectId,

    deactivationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('cashCounters'),
);

cashCounterSchema.pre(
  'validate',
  function validateCashCounter() {
    this.counterCode = normalizeBillingCode(
      this.counterCode,
    );
    this.currency = normalizeBillingCode(
      this.currency,
    );

    for (const field of [
      'cashHoldingLimit',
      'minimumOpeningFloat',
      'maximumOpeningFloat',
    ] as const) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    if (
      compareInventoryDecimals(
        this.minimumOpeningFloat,
        this.maximumOpeningFloat,
      ) > 0
    ) {
      this.invalidate(
        'maximumOpeningFloat',
        'Maximum opening float cannot be less than minimum opening float',
      );
    }

    if (!this.openingFloatRequired) {
      if (
        this.minimumOpeningFloat.toString() !== '0' ||
        this.maximumOpeningFloat.toString() !== '0'
      ) {
        this.invalidate(
          'openingFloatRequired',
          'Counters without opening floats must use zero float limits',
        );
      }
    }

    if (!this.active) {
      if (
        this.deactivatedAt == null ||
        this.deactivatedBy == null ||
        this.deactivationReason == null
      ) {
        this.invalidate(
          'active',
          'Inactive counters require deactivation attribution and reason',
        );
      }
    }
  },
);

cashCounterSchema.index(
  { facilityId: 1, counterCode: 1 },
  {
    name: 'uq_cash_counters_code',
    unique: true,
  },
);

cashCounterSchema.index(
  {
    facilityId: 1,
    active: 1,
    counterType: 1,
    departmentId: 1,
  },
  { name: 'ix_cash_counters_active_type' },
);

cashCounterSchema.index(
  { facilityId: 1, assignedUserIds: 1, active: 1 },
  { name: 'ix_cash_counters_assigned_users' },
);

export type PaymentMethodConfiguration = InferSchemaType<
  typeof paymentMethodConfigurationSchema
>;

export type CashCounter = InferSchemaType<
  typeof cashCounterSchema
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

export const PaymentMethodConfigurationModel = modelFor(
  'paymentMethodConfigurations',
  paymentMethodConfigurationSchema,
);

export const CashCounterModel = modelFor(
  'cashCounters',
  cashCounterSchema,
);