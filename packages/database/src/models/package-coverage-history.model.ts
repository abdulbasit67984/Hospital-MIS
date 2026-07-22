import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  ppcCommonFields,
  ppcNonNegativeDecimal,
  ppcTimestampedSchemaOptions,
} from './panels-packages-coverage-schema-helpers.js';

export const treatmentPackageVersionSchema = new Schema(
  {
    ...ppcCommonFields,
    treatmentPackageId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    packageSnapshot: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    itemSnapshots: {
      type: [Schema.Types.Mixed],
      required: true,
      immutable: true,
      default: [],
    },
    changeReason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('treatmentPackageVersions'),
);

treatmentPackageVersionSchema.index(
  { facilityId: 1, treatmentPackageId: 1, versionNumber: 1 },
  { name: 'uq_treatment_package_versions_number', unique: true },
);

export const packageEnrollmentBalanceSchema = new Schema(
  {
    ...ppcCommonFields,
    packageEnrollmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    treatmentPackageItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    includedQuantity: ppcNonNegativeDecimal,
    reservedQuantity: ppcNonNegativeDecimal,
    consumedQuantity: ppcNonNegativeDecimal,
    reversedQuantity: ppcNonNegativeDecimal,
    includedAmount: ppcNonNegativeDecimal,
    reservedAmount: ppcNonNegativeDecimal,
    consumedAmount: ppcNonNegativeDecimal,
    reversedAmount: ppcNonNegativeDecimal,
  },
  ppcTimestampedSchemaOptions('packageEnrollmentBalances'),
);

packageEnrollmentBalanceSchema.index(
  {
    facilityId: 1,
    packageEnrollmentId: 1,
    treatmentPackageItemId: 1,
  },
  { name: 'uq_package_enrollment_balances_item', unique: true },
);

export const packageOperationalHistorySchema = new Schema(
  {
    ...ppcCommonFields,
    action: {
      type: String,
      required: true,
      immutable: true,
      enum: [
        'ENROLLED',
        'ACTIVATED',
        'SUSPENDED',
        'UTILIZED',
        'CANCELLED',
        'EXPIRED',
        'REVERSED',
        'REFUND_APPLIED',
      ],
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
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
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
  ppcTimestampedSchemaOptions('packageOperationalHistories'),
);

packageOperationalHistorySchema.index(
  { facilityId: 1, entityType: 1, entityId: 1, createdAt: -1 },
  { name: 'ix_package_operational_histories_entity' },
);

export type TreatmentPackageVersion = InferSchemaType<
  typeof treatmentPackageVersionSchema
>;
export type PackageEnrollmentBalance = InferSchemaType<
  typeof packageEnrollmentBalanceSchema
>;
export type PackageOperationalHistory = InferSchemaType<
  typeof packageOperationalHistorySchema
>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const TreatmentPackageVersionModel = modelFor(
  'treatmentPackageVersions',
  treatmentPackageVersionSchema,
);
export const PackageEnrollmentBalanceModel = modelFor(
  'packageEnrollmentBalances',
  packageEnrollmentBalanceSchema,
);
export const PackageOperationalHistoryModel = modelFor(
  'packageOperationalHistories',
  packageOperationalHistorySchema,
);