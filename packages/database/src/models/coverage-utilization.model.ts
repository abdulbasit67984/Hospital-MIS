import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  coverageDenialReasonValues,
  coverageDeterminationStatusValues,
  coverageHistoryActionValues,
  coverageLimitPeriodValues,
  coverageUtilizationStatusValues,
} from './panels-packages-coverage.types.js';

import {
  nullablePpcObjectId,
  ppcCommonFields,
  ppcNonNegativeDecimal,
  ppcNullableDecimal,
  ppcPositiveDecimal,
  ppcTimestampedSchemaOptions,
  requirePpcReason,
  validatePpcNonNegativeDecimal,
  validatePpcPositiveDecimal,
} from './panels-packages-coverage-schema-helpers.js';

const allocationSchema = new Schema(
  {
    invoiceLineId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientCoverageId: nullablePpcObjectId,
    packageEnrollmentId: nullablePpcObjectId,
    grossAmount: ppcNonNegativeDecimal,
    packageAmount: ppcNonNegativeDecimal,
    deductibleAmount: ppcNonNegativeDecimal,
    copaymentAmount: ppcNonNegativeDecimal,
    coinsuranceAmount: ppcNonNegativeDecimal,
    sponsorAmount: ppcNonNegativeDecimal,
    patientAmount: ppcNonNegativeDecimal,
    deniedAmount: ppcNonNegativeDecimal,
    denialReason: {
      type: String,
      default: null,
      enum: [...coverageDenialReasonValues, null],
    },
  },
  { _id: true, strict: true },
);

export const coverageDeterminationSchema = new Schema(
  {
    ...ppcCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    determinationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    estimationId: nullablePpcObjectId,
    coverageIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      immutable: true,
      validate: {
        validator: (values: readonly unknown[]) =>
          values.length >= 1 && values.length <= 2,
        message: 'One primary and at most one secondary coverage are allowed',
      },
    },
    status: {
      type: String,
      required: true,
      enum: coverageDeterminationStatusValues,
      default: 'ESTIMATED',
    },
    asOf: {
      type: Date,
      required: true,
      immutable: true,
    },
    grossAmount: ppcNonNegativeDecimal,
    packageAmount: ppcNonNegativeDecimal,
    sponsorAmount: ppcNonNegativeDecimal,
    patientAmount: ppcNonNegativeDecimal,
    allocations: {
      type: [allocationSchema],
      required: true,
      default: [],
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: nullablePpcObjectId,
    overriddenAt: {
      type: Date,
      default: null,
    },
    overriddenBy: nullablePpcObjectId,
    overrideAuthorizationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    overrideReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullablePpcObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('coverageDeterminations'),
);

coverageDeterminationSchema.pre('validate', function () {
  for (const field of [
    'grossAmount',
    'packageAmount',
    'sponsorAmount',
    'patientAmount',
  ] as const) {
    validatePpcNonNegativeDecimal(this, field, this.get(field));
  }

  if (this.status === 'OVERRIDDEN') {
    requirePpcReason(this, 'overrideReason', this.overrideReason);

    if (this.overrideAuthorizationReference == null) {
      this.invalidate(
        'overrideAuthorizationReference',
        'Coverage overrides require an authorization reference',
      );
    }
  }

  if (this.status === 'REVERSED') {
    requirePpcReason(this, 'reversalReason', this.reversalReason);
  }
});

coverageDeterminationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_coverage_determinations_operation', unique: true },
);
coverageDeterminationSchema.index(
  { facilityId: 1, determinationNumber: 1 },
  { name: 'uq_coverage_determinations_number', unique: true },
);
coverageDeterminationSchema.index(
  { facilityId: 1, invoiceId: 1, createdAt: -1 },
  { name: 'ix_coverage_determinations_invoice' },
);

export const coverageBenefitBalanceSchema = new Schema(
  {
    ...ppcCommonFields,
    patientCoverageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    panelPlanId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ruleCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    limitPeriod: {
      type: String,
      required: true,
      enum: coverageLimitPeriodValues,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      default: null,
    },
    quantityLimit: ppcNullableDecimal,
    amountLimit: ppcNullableDecimal,
    reservedQuantity: ppcNonNegativeDecimal,
    consumedQuantity: ppcNonNegativeDecimal,
    reversedQuantity: ppcNonNegativeDecimal,
    reservedAmount: ppcNonNegativeDecimal,
    consumedAmount: ppcNonNegativeDecimal,
    reversedAmount: ppcNonNegativeDecimal,
  },
  ppcTimestampedSchemaOptions('coverageBenefitBalances'),
);

coverageBenefitBalanceSchema.index(
  {
    facilityId: 1,
    patientCoverageId: 1,
    ruleCode: 1,
    limitPeriod: 1,
    periodStart: 1,
  },
  { name: 'uq_coverage_benefit_balances_period', unique: true },
);

export const coverageUtilizationSchema = new Schema(
  {
    ...ppcCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    coverageDeterminationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    coverageBenefitBalanceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientCoverageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    invoiceLineId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    quantity: ppcPositiveDecimal,
    sponsorAmount: ppcNonNegativeDecimal,
    status: {
      type: String,
      required: true,
      enum: coverageUtilizationStatusValues,
      default: 'RESERVED',
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    refundId: nullablePpcObjectId,
    creditNoteId: nullablePpcObjectId,
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullablePpcObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('coverageUtilizations'),
);

coverageUtilizationSchema.pre('validate', function () {
  validatePpcPositiveDecimal(this, 'quantity', this.quantity);
  validatePpcNonNegativeDecimal(
    this,
    'sponsorAmount',
    this.sponsorAmount,
  );

  if (this.status === 'REVERSED') {
    requirePpcReason(this, 'reversalReason', this.reversalReason);
  }
});

coverageUtilizationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_coverage_utilizations_operation', unique: true },
);
coverageUtilizationSchema.index(
  {
    facilityId: 1,
    patientCoverageId: 1,
    invoiceLineId: 1,
    status: 1,
  },
  { name: 'ix_coverage_utilizations_line_status' },
);

export const coverageOperationalHistorySchema = new Schema(
  {
    ...ppcCommonFields,
    action: {
      type: String,
      required: true,
      immutable: true,
      enum: coverageHistoryActionValues,
    },
    entityType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 100,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: nullablePpcObjectId,
    invoiceId: nullablePpcObjectId,
    beforeSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
    },
    afterSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
    },
    reason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('coverageOperationalHistories'),
);

coverageOperationalHistorySchema.index(
  { facilityId: 1, entityType: 1, entityId: 1, createdAt: -1 },
  { name: 'ix_coverage_operational_histories_entity' },
);

export type CoverageDetermination = InferSchemaType<
  typeof coverageDeterminationSchema
>;
export type CoverageBenefitBalance = InferSchemaType<
  typeof coverageBenefitBalanceSchema
>;
export type CoverageUtilization = InferSchemaType<
  typeof coverageUtilizationSchema
>;
export type CoverageOperationalHistory = InferSchemaType<
  typeof coverageOperationalHistorySchema
>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const CoverageDeterminationModel = modelFor(
  'coverageDeterminations',
  coverageDeterminationSchema,
);
export const CoverageBenefitBalanceModel = modelFor(
  'coverageBenefitBalances',
  coverageBenefitBalanceSchema,
);
export const CoverageUtilizationModel = modelFor(
  'coverageUtilizations',
  coverageUtilizationSchema,
);
export const CoverageOperationalHistoryModel = modelFor(
  'coverageOperationalHistories',
  coverageOperationalHistorySchema,
);