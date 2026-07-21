import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingNullableDecimal,
  billingNonNegativeDecimal,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateEffectiveWindow,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  chargeCatalogStatusValues,
  chargeCategoryStatusValues,
  chargeRuleTypeValues,
  chargeTypeValues,
} from './billing.types.js';

const optionalCode = {
  type: String,
  default: null,
  trim: true,
  uppercase: true,
  maxlength: 100,
} as const;

export const chargeCategorySchema = new Schema(
  {
    ...billingCommonFields,
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    parentCategoryId: nullableBillingObjectId,
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
    clinical: {
      type: Boolean,
      required: true,
      default: false,
    },
    departmentId: nullableBillingObjectId,
    serviceLineCode: optionalCode,
    revenueAccountCode: optionalCode,
    status: {
      type: String,
      required: true,
      enum: chargeCategoryStatusValues,
      default: 'ACTIVE',
    },
    activatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    activatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
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
  billingTimestampedSchemaOptions('chargeCategories'),
);

chargeCategorySchema.pre('validate', function () {
  this.code = normalizeBillingCode(this.code);
  if (this.serviceLineCode != null) {
    this.serviceLineCode = normalizeBillingCode(
      this.serviceLineCode,
    );
  }
  if (this.revenueAccountCode != null) {
    this.revenueAccountCode = normalizeBillingCode(
      this.revenueAccountCode,
    );
  }

  if (this.status === 'ACTIVE') {
    if (
      this.deactivatedAt != null ||
      this.deactivatedBy != null ||
      this.deactivationReason != null
    ) {
      this.invalidate(
        'status',
        'Active charge categories cannot retain deactivation metadata',
      );
    }
  } else if (
    this.deactivatedAt == null ||
    this.deactivatedBy == null ||
    this.deactivationReason == null
  ) {
    this.invalidate(
      'status',
      'Inactive or retired charge categories require deactivation attribution and reason',
    );
  }
});

chargeCategorySchema.index(
  { facilityId: 1, code: 1 },
  {
    name: 'uq_charge_categories_facility_code',
    unique: true,
  },
);
chargeCategorySchema.index(
  { facilityId: 1, parentCategoryId: 1, status: 1, name: 1 },
  { name: 'ix_charge_categories_parent_status_name' },
);

const catalogSnapshotFields = {
  chargeCode: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 100,
  },
  serviceCode: {
    type: String,
    required: true,
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
  categoryId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  chargeType: {
    type: String,
    required: true,
    enum: chargeTypeValues,
  },
  clinical: {
    type: Boolean,
    required: true,
    default: false,
  },
  departmentId: nullableBillingObjectId,
  serviceLineCode: optionalCode,
  revenueAccountCode: optionalCode,
  ledgerAccountId: nullableBillingObjectId,
  taxCategoryId: nullableBillingObjectId,
  unitOfMeasureId: nullableBillingObjectId,
  defaultQuantity: {
    type: Schema.Types.Decimal128,
    required: true,
    default: '1',
  },
  minimumQuantity: billingNullableDecimal,
  maximumQuantity: billingNullableDecimal,
  minimumPrice: billingNullableDecimal,
  maximumPrice: billingNullableDecimal,
  costAmount: {
    ...billingNonNegativeDecimal,
    select: false,
  },
  manualPostingAllowed: {
    type: Boolean,
    required: true,
    default: false,
  },
  recurringChargeAllowed: {
    type: Boolean,
    required: true,
    default: false,
  },
  timeBasedCharge: {
    type: Boolean,
    required: true,
    default: false,
  },
  effectiveFrom: {
    type: Date,
    required: true,
  },
  effectiveThrough: {
    type: Date,
    default: null,
  },
} as const;

export const chargeCatalogSchema = new Schema(
  {
    ...billingCommonFields,
    ...catalogSnapshotFields,
    status: {
      type: String,
      required: true,
      enum: chargeCatalogStatusValues,
      default: 'DRAFT',
    },
    currentVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    latestVersionId: nullableBillingObjectId,
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: nullableBillingObjectId,
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
    retiredAt: {
      type: Date,
      default: null,
    },
    retiredBy: nullableBillingObjectId,
    retirementReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('chargeCatalog'),
);

chargeCatalogSchema.pre('validate', function () {
  this.chargeCode = normalizeBillingCode(this.chargeCode);
  this.serviceCode = normalizeBillingCode(this.serviceCode);
  if (this.serviceLineCode != null) {
    this.serviceLineCode = normalizeBillingCode(
      this.serviceLineCode,
    );
  }
  if (this.revenueAccountCode != null) {
    this.revenueAccountCode = normalizeBillingCode(
      this.revenueAccountCode,
    );
  }

  validatePositiveInventoryDecimal(
    this,
    'defaultQuantity',
    this.defaultQuantity,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'costAmount',
    this.costAmount,
  );
  for (const field of [
    'minimumQuantity',
    'maximumQuantity',
    'minimumPrice',
    'maximumPrice',
  ] as const) {
    const value = this.get(field);
    if (value != null) {
      validateNonNegativeInventoryDecimal(this, field, value);
    }
  }
  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );

  if (this.status === 'DRAFT') {
    if (
      this.currentVersion !== 0 ||
      this.latestVersionId != null ||
      this.activatedAt != null ||
      this.activatedBy != null
    ) {
      this.invalidate(
        'status',
        'Draft charge catalog items cannot retain active version metadata',
      );
    }
  } else if (
    this.currentVersion < 1 ||
    this.latestVersionId == null ||
    this.activatedAt == null ||
    this.activatedBy == null
  ) {
    this.invalidate(
      'status',
      'Non-draft charge catalog items require an immutable version and activation attribution',
    );
  }

  if (
    this.status === 'INACTIVE' &&
    (this.deactivatedAt == null ||
      this.deactivatedBy == null ||
      this.deactivationReason == null)
  ) {
    this.invalidate(
      'status',
      'Inactive charge catalog items require deactivation attribution and reason',
    );
  }

  if (
    this.status === 'RETIRED' &&
    (this.retiredAt == null ||
      this.retiredBy == null ||
      this.retirementReason == null)
  ) {
    this.invalidate(
      'status',
      'Retired charge catalog items require retirement attribution and reason',
    );
  }
});

chargeCatalogSchema.index(
  { facilityId: 1, chargeCode: 1 },
  {
    name: 'uq_charge_catalog_facility_code',
    unique: true,
  },
);
chargeCatalogSchema.index(
  { facilityId: 1, serviceCode: 1, status: 1 },
  { name: 'ix_charge_catalog_service_status' },
);
chargeCatalogSchema.index(
  {
    facilityId: 1,
    categoryId: 1,
    chargeType: 1,
    status: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_charge_catalog_category_type_effective' },
);
chargeCatalogSchema.index(
  { facilityId: 1, name: 'text', description: 'text' },
  { name: 'ix_charge_catalog_search' },
);

export const chargeCatalogVersionSchema = new Schema(
  {
    ...billingCommonFields,
    chargeCatalogItemId: {
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
    ...catalogSnapshotFields,
    statusSnapshot: {
      type: String,
      required: true,
      enum: chargeCatalogStatusValues,
      immutable: true,
    },
    changeReason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  billingTimestampedSchemaOptions('chargeCatalogVersions'),
);

chargeCatalogVersionSchema.pre('validate', function () {
  this.chargeCode = normalizeBillingCode(this.chargeCode);
  this.serviceCode = normalizeBillingCode(this.serviceCode);
  validatePositiveInventoryDecimal(
    this,
    'defaultQuantity',
    this.defaultQuantity,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'costAmount',
    this.costAmount,
  );
  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );
});

chargeCatalogVersionSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_charge_catalog_versions_item_version',
    unique: true,
  },
);
chargeCatalogVersionSchema.index(
  { facilityId: 1, chargeCode: 1, effectiveFrom: -1 },
  { name: 'ix_charge_catalog_versions_code_effective' },
);

export const chargeRuleSchema = new Schema(
  {
    ...billingCommonFields,
    ruleCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ruleType: {
      type: String,
      required: true,
      enum: chargeRuleTypeValues,
    },
    relatedChargeCatalogItemId: nullableBillingObjectId,
    thresholdQuantity: billingNullableDecimal,
    thresholdAmount: billingNullableDecimal,
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('chargeRules'),
);

chargeRuleSchema.pre('validate', function () {
  this.ruleCode = normalizeBillingCode(this.ruleCode);
  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );

  if (
    ['REQUIRES', 'MUTUALLY_EXCLUSIVE'].includes(this.ruleType) &&
    this.relatedChargeCatalogItemId == null
  ) {
    this.invalidate(
      'relatedChargeCatalogItemId',
      'Dependency and mutual-exclusion rules require a related charge item',
    );
  }
  if (
    ['MINIMUM_QUANTITY', 'MAXIMUM_QUANTITY'].includes(
      this.ruleType,
    ) &&
    this.thresholdQuantity == null
  ) {
    this.invalidate(
      'thresholdQuantity',
      'Quantity rules require a threshold quantity',
    );
  }
  if (
    ['MINIMUM_PRICE', 'MAXIMUM_PRICE'].includes(this.ruleType) &&
    this.thresholdAmount == null
  ) {
    this.invalidate(
      'thresholdAmount',
      'Price rules require a threshold amount',
    );
  }
  if (this.thresholdQuantity != null) {
    validatePositiveInventoryDecimal(
      this,
      'thresholdQuantity',
      this.thresholdQuantity,
    );
  }
  if (this.thresholdAmount != null) {
    validateNonNegativeInventoryDecimal(
      this,
      'thresholdAmount',
      this.thresholdAmount,
    );
  }
});

chargeRuleSchema.index(
  { facilityId: 1, ruleCode: 1 },
  { name: 'uq_charge_rules_facility_code', unique: true },
);
chargeRuleSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
    active: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_charge_rules_item_active_effective' },
);

export type ChargeCategory = InferSchemaType<
  typeof chargeCategorySchema
>;
export type ChargeCatalogItem = InferSchemaType<
  typeof chargeCatalogSchema
>;
export type ChargeCatalogVersion = InferSchemaType<
  typeof chargeCatalogVersionSchema
>;
export type ChargeRule = InferSchemaType<typeof chargeRuleSchema>;

export const ChargeCategoryModel =
  (mongoose.models['chargeCategories'] as
    | Model<ChargeCategory>
    | undefined) ??
  mongoose.model<ChargeCategory>(
    'chargeCategories',
    chargeCategorySchema,
    'chargeCategories',
  );

export const ChargeCatalogModel =
  (mongoose.models['chargeCatalog'] as
    | Model<ChargeCatalogItem>
    | undefined) ??
  mongoose.model<ChargeCatalogItem>(
    'chargeCatalog',
    chargeCatalogSchema,
    'chargeCatalog',
  );

export const ChargeCatalogVersionModel =
  (mongoose.models['chargeCatalogVersions'] as
    | Model<ChargeCatalogVersion>
    | undefined) ??
  mongoose.model<ChargeCatalogVersion>(
    'chargeCatalogVersions',
    chargeCatalogVersionSchema,
    'chargeCatalogVersions',
  );

export const ChargeRuleModel =
  (mongoose.models['chargeRules'] as
    | Model<ChargeRule>
    | undefined) ??
  mongoose.model<ChargeRule>(
    'chargeRules',
    chargeRuleSchema,
    'chargeRules',
  );