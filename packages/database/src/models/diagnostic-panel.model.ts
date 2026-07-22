import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  diagnosticPanelStatusValues,
  diagnosticPanelTypeValues,
} from './panels-packages-coverage.types.js';

import {
  normalizePpcCode,
  nullablePpcObjectId,
  ppcCommonFields,
  ppcNonNegativeDecimal,
  ppcPositiveDecimal,
  ppcTimestampedSchemaOptions,
  requirePpcReason,
  validatePpcEffectiveWindow,
  validatePpcNonNegativeDecimal,
  validatePpcPositiveDecimal,
} from './panels-packages-coverage-schema-helpers.js';

export const diagnosticPanelSchema = new Schema(
  {
    ...ppcCommonFields,
    panelCode: {
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
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    panelType: {
      type: String,
      required: true,
      enum: diagnosticPanelTypeValues,
    },
    priceListId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    fixedPrice: ppcNonNegativeDecimal,
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
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
      enum: diagnosticPanelStatusValues,
      default: 'DRAFT',
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: nullablePpcObjectId,
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: nullablePpcObjectId,
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
    retiredBy: nullablePpcObjectId,
    retirementReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('diagnosticPanels'),
);

diagnosticPanelSchema.pre('validate', function () {
  this.panelCode = normalizePpcCode(this.panelCode);
  this.currency = normalizePpcCode(this.currency);
  validatePpcNonNegativeDecimal(this, 'fixedPrice', this.fixedPrice);
  validatePpcEffectiveWindow(this, 'effectiveFrom', 'effectiveThrough');

  if (this.status === 'SUSPENDED') {
    requirePpcReason(this, 'suspensionReason', this.suspensionReason);
  }

  if (this.status === 'RETIRED') {
    requirePpcReason(this, 'retirementReason', this.retirementReason);
  }
});

diagnosticPanelSchema.index(
  { facilityId: 1, panelCode: 1 },
  { name: 'uq_diagnostic_panels_facility_code', unique: true },
);
diagnosticPanelSchema.index(
  {
    facilityId: 1,
    status: 1,
    panelType: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_diagnostic_panels_resolution' },
);

export const diagnosticPanelItemSchema = new Schema(
  {
    ...ppcCommonFields,
    diagnosticPanelId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    lineNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    quantity: ppcPositiveDecimal,
    requiredComponent: {
      type: Boolean,
      required: true,
      default: true,
    },
    allocationAmount: ppcNonNegativeDecimal,
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  ppcTimestampedSchemaOptions('diagnosticPanelItems'),
);

diagnosticPanelItemSchema.pre('validate', function () {
  validatePpcPositiveDecimal(this, 'quantity', this.quantity);
  validatePpcNonNegativeDecimal(
    this,
    'allocationAmount',
    this.allocationAmount,
  );
});

diagnosticPanelItemSchema.index(
  { facilityId: 1, diagnosticPanelId: 1, lineNumber: 1 },
  { name: 'uq_diagnostic_panel_items_line', unique: true },
);
diagnosticPanelItemSchema.index(
  {
    facilityId: 1,
    diagnosticPanelId: 1,
    chargeCatalogItemId: 1,
    active: 1,
  },
  { name: 'ix_diagnostic_panel_items_charge' },
);

export const diagnosticPanelVersionSchema = new Schema(
  {
    ...ppcCommonFields,
    diagnosticPanelId: {
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
    snapshot: {
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
    supersedesVersionId: {
      ...nullablePpcObjectId,
      immutable: true,
    },
  },
  ppcTimestampedSchemaOptions('diagnosticPanelVersions'),
);

diagnosticPanelVersionSchema.index(
  { facilityId: 1, diagnosticPanelId: 1, versionNumber: 1 },
  { name: 'uq_diagnostic_panel_versions_number', unique: true },
);

export type DiagnosticPanel = InferSchemaType<
  typeof diagnosticPanelSchema
>;
export type DiagnosticPanelItem = InferSchemaType<
  typeof diagnosticPanelItemSchema
>;
export type DiagnosticPanelVersion = InferSchemaType<
  typeof diagnosticPanelVersionSchema
>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const DiagnosticPanelModel = modelFor(
  'diagnosticPanels',
  diagnosticPanelSchema,
);
export const DiagnosticPanelItemModel = modelFor(
  'diagnosticPanelItems',
  diagnosticPanelItemSchema,
);
export const DiagnosticPanelVersionModel = modelFor(
  'diagnosticPanelVersions',
  diagnosticPanelVersionSchema,
);