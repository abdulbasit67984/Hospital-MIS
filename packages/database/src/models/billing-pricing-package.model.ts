import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingNonNegativeDecimal,
  billingNullableDecimal,
  billingTimestampedSchemaOptions,
  compareInventoryDecimals,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateEffectiveWindow,
  validateNonNegativeInventoryDecimal,
  validatePercentage,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  billingContextValues,
  packageEnrollmentStatusValues,
  packageStatusValues,
  packageUtilizationStatusValues,
  priceListStatusValues,
  priceListTypeValues,
  rateStatusValues,
  roundingModeValues,
  taxCalculationModeValues,
} from './billing.types.js';

export const taxCategorySchema = new Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    calculationMode: {
      type: String,
      required: true,
      enum: taxCalculationModeValues,
    },
    ratePercentage: {
      ...billingNonNegativeDecimal,
      default: '0',
    },
    roundingMode: {
      type: String,
      required: true,
      enum: roundingModeValues,
      default: 'HALF_UP',
    },
    roundingScale: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      default: 2,
    },
    exemptionReasonRequired: {
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
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  billingTimestampedSchemaOptions('taxCategories'),
);

taxCategorySchema.pre('validate', function () {
  this.code = normalizeBillingCode(this.code);
  validatePercentage(this, 'ratePercentage', this.ratePercentage);
  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );

  if (
    this.calculationMode === 'EXEMPT' &&
    compareInventoryDecimals(this.ratePercentage, '0') !== 0
  ) {
    this.invalidate(
      'ratePercentage',
      'Exempt tax categories must use a zero rate',
    );
  }
});

taxCategorySchema.index(
  { facilityId: 1, code: 1 },
  { name: 'uq_tax_categories_facility_code', unique: true },
);
taxCategorySchema.index(
  { facilityId: 1, active: 1, effectiveFrom: -1 },
  { name: 'ix_tax_categories_active_effective' },
);

const priceListSnapshotFields = {
  code: {
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
  priceListType: {
    type: String,
    required: true,
    enum: priceListTypeValues,
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
  patientCategoryCode: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  payerCategoryCode: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  payerOrganizationId: nullableBillingObjectId,
  panelPlanId: nullableBillingObjectId,
  departmentId: nullableBillingObjectId,
  locationId: nullableBillingObjectId,
  billingContext: {
    type: String,
    default: null,
    enum: [...billingContextValues, null],
  },
  afterHoursOnly: {
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

export const priceListSchema = new Schema(
  {
    ...billingCommonFields,
    ...priceListSnapshotFields,
    status: {
      type: String,
      required: true,
      enum: priceListStatusValues,
      default: 'DRAFT',
    },
    priority: {
      type: Number,
      required: true,
      min: 0,
      default: 100,
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    latestVersionId: nullableBillingObjectId,
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: nullableBillingObjectId,
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
  billingTimestampedSchemaOptions('priceLists'),
);

priceListSchema.pre('validate', function () {
  this.code = normalizeBillingCode(this.code);
  this.currency = normalizeBillingCode(this.currency);
  if (this.patientCategoryCode != null) {
    this.patientCategoryCode = normalizeBillingCode(
      this.patientCategoryCode,
    );
  }
  if (this.payerCategoryCode != null) {
    this.payerCategoryCode = normalizeBillingCode(
      this.payerCategoryCode,
    );
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
        'Draft price lists cannot retain active version metadata',
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
      'Non-draft price lists require an immutable version and activation attribution',
    );
  }
});

priceListSchema.index(
  { facilityId: 1, code: 1 },
  { name: 'uq_price_lists_facility_code', unique: true },
);
priceListSchema.index(
  {
    facilityId: 1,
    status: 1,
    priceListType: 1,
    billingContext: 1,
    priority: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_price_lists_resolution' },
);

export const priceListVersionSchema = new Schema(
  {
    ...billingCommonFields,
    priceListId: {
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
    ...priceListSnapshotFields,
    statusSnapshot: {
      type: String,
      required: true,
      enum: priceListStatusValues,
      immutable: true,
    },
    prioritySnapshot: {
      type: Number,
      required: true,
      min: 0,
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
  billingTimestampedSchemaOptions('priceListVersions'),
);

priceListVersionSchema.pre('validate', function () {
  this.code = normalizeBillingCode(this.code);
  this.currency = normalizeBillingCode(this.currency);
  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );
});

priceListVersionSchema.index(
  { facilityId: 1, priceListId: 1, versionNumber: 1 },
  {
    name: 'uq_price_list_versions_list_version',
    unique: true,
  },
);

export const serviceRateSchema = new Schema(
  {
    ...billingCommonFields,
    rateCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    chargeCatalogVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    priceListId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    priceListVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    amount: billingNonNegativeDecimal,
    minimumAmount: billingNullableDecimal,
    maximumAmount: billingNullableDecimal,
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    taxCategoryId: nullableBillingObjectId,
    billingContext: {
      type: String,
      default: null,
      enum: [...billingContextValues, null],
    },
    patientCategoryCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    payerCategoryCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    payerOrganizationId: nullableBillingObjectId,
    panelPlanId: nullableBillingObjectId,
    departmentId: nullableBillingObjectId,
    locationId: nullableBillingObjectId,
    contractReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    afterHoursOnly: {
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
    status: {
      type: String,
      required: true,
      enum: rateStatusValues,
      default: 'DRAFT',
    },
    changeReason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    supersedesRateId: nullableBillingObjectId,
  },
  billingTimestampedSchemaOptions('serviceRates'),
);

serviceRateSchema.pre('validate', function () {
  this.rateCode = normalizeBillingCode(this.rateCode);
  this.currency = normalizeBillingCode(this.currency);
  validateNonNegativeInventoryDecimal(this, 'amount', this.amount);
  for (const field of ['minimumAmount', 'maximumAmount'] as const) {
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
});

serviceRateSchema.index(
  { facilityId: 1, rateCode: 1 },
  { name: 'uq_service_rates_facility_code', unique: true },
);
serviceRateSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
    priceListId: 1,
    status: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_service_rates_resolution' },
);
serviceRateSchema.index(
  {
    facilityId: 1,
    payerOrganizationId: 1,
    panelPlanId: 1,
    billingContext: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_service_rates_payer_context' },
);

export const treatmentPackageSchema = new Schema(
  {
    ...billingCommonFields,
    packageCode: {
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
    priceListId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    packageType: {
      type: String,
      required: true,
      enum: [
        'ADMISSION',
        'PROCEDURE',
        'SURGERY',
        'MATERNITY',
        'DIAGNOSTIC',
        'WELLNESS',
        'GENERAL',
        'CUSTOM',
      ],
    },
    pricingMode: {
      type: String,
      required: true,
      enum: ['FIXED_PRICE', 'DISCOUNTED'],
      default: 'FIXED_PRICE',
    },
    fixedPrice: billingNonNegativeDecimal,
    discountPercentage: billingNullableDecimal,
    usageLimit: billingNullableDecimal,
    eligibility: {
      patientCategoryCodes: {
        type: [String],
        required: true,
        default: [],
      },
      minimumAgeYears: {
        type: Number,
        default: null,
        min: 0,
        max: 150,
      },
      maximumAgeYears: {
        type: Number,
        default: null,
        min: 0,
        max: 150,
      },
      genderCodes: {
        type: [String],
        required: true,
        default: [],
      },
      admissionRequired: {
        type: Boolean,
        required: true,
        default: false,
      },
      departmentIds: {
        type: [Schema.Types.ObjectId],
        required: true,
        default: [],
      },
      payerOrganizationIds: {
        type: [Schema.Types.ObjectId],
        required: true,
        default: [],
      },
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
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
    validityDays: {
      type: Number,
      required: true,
      min: 1,
    },
    payerOrganizationId: nullableBillingObjectId,
    panelPlanId: nullableBillingObjectId,
    patientCategoryCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    billingContext: {
      type: String,
      default: null,
      enum: [...billingContextValues, null],
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
      enum: packageStatusValues,
      default: 'DRAFT',
    },
  },
  billingTimestampedSchemaOptions('treatmentPackages'),
);

treatmentPackageSchema.pre('validate', function () {
  this.packageCode = normalizeBillingCode(this.packageCode);
  this.currency = normalizeBillingCode(this.currency);
  validateNonNegativeInventoryDecimal(
    this,
    'fixedPrice',
    this.fixedPrice,
  );

  if (this.discountPercentage != null) {
    validatePercentage(
      this,
      'discountPercentage',
      this.discountPercentage,
    );
  }

  if (this.usageLimit != null) {
    validatePositiveInventoryDecimal(
      this,
      'usageLimit',
      this.usageLimit,
    );
  }

  if (
    this.pricingMode === 'DISCOUNTED' &&
    this.discountPercentage == null
  ) {
    this.invalidate(
      'discountPercentage',
      'Discounted packages require a discount percentage',
    );
  }

  if (
    this.eligibility.minimumAgeYears != null &&
    this.eligibility.maximumAgeYears != null &&
    this.eligibility.maximumAgeYears <
      this.eligibility.minimumAgeYears
  ) {
    this.invalidate(
      'eligibility.maximumAgeYears',
      'Maximum age cannot be lower than minimum age',
    );
  }

  validateEffectiveWindow(
    this,
    'effectiveFrom',
    'effectiveThrough',
  );
});

treatmentPackageSchema.index(
  { facilityId: 1, packageCode: 1 },
  {
    name: 'uq_treatment_packages_facility_code',
    unique: true,
  },
);
treatmentPackageSchema.index(
  {
    facilityId: 1,
    status: 1,
    packageType: 1,
    payerOrganizationId: 1,
    priceListId: 1,
    effectiveFrom: -1,
  },
  { name: 'ix_treatment_packages_resolution' },
);

export const treatmentPackageItemSchema = new Schema(
  {
    ...billingCommonFields,
    treatmentPackageId: {
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
    includedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    overageAllowed: {
      type: Boolean,
      required: true,
      default: true,
    },
    overageRateId: nullableBillingObjectId,
    allocationAmount: billingNonNegativeDecimal,
    included: {
      type: Boolean,
      required: true,
      default: true,
    },
    quantityLimit: billingNullableDecimal,
    amountLimit: billingNullableDecimal,
    discountPercentage: billingNullableDecimal,
    requiresAuthorization: {
      type: Boolean,
      required: true,
      default: false,
    },
    requiredComponent: {
      type: Boolean,
      required: true,
      default: false,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  billingTimestampedSchemaOptions('treatmentPackageItems'),
);

treatmentPackageItemSchema.pre('validate', function () {
  validatePositiveInventoryDecimal(
    this,
    'includedQuantity',
    this.includedQuantity,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'allocationAmount',
    this.allocationAmount,
  );

  if (this.quantityLimit != null) {
    validatePositiveInventoryDecimal(
      this,
      'quantityLimit',
      this.quantityLimit,
    );
  }

  if (this.amountLimit != null) {
    validateNonNegativeInventoryDecimal(
      this,
      'amountLimit',
      this.amountLimit,
    );
  }

  if (this.discountPercentage != null) {
    validatePercentage(
      this,
      'discountPercentage',
      this.discountPercentage,
    );
  }
});

treatmentPackageItemSchema.index(
  { facilityId: 1, treatmentPackageId: 1, lineNumber: 1 },
  {
    name: 'uq_treatment_package_items_line',
    unique: true,
  },
);
treatmentPackageItemSchema.index(
  {
    facilityId: 1,
    treatmentPackageId: 1,
    chargeCatalogItemId: 1,
    active: 1,
  },
  { name: 'ix_treatment_package_items_charge' },
);

export const packageEnrollmentSchema = new Schema(
  {
    ...billingCommonFields,
    enrollmentNumber: {
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
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    treatmentPackageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    encounterId: nullableBillingObjectId,
    admissionId: nullableBillingObjectId,
    enrolledAt: {
      type: Date,
      required: true,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validThrough: {
      type: Date,
      required: true,
    },
    packagePriceSnapshot: billingNonNegativeDecimal,
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
      enum: packageEnrollmentStatusValues,
      default: 'ACTIVE',
    },
    authorizationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: nullableBillingObjectId,
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
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
  },
  billingTimestampedSchemaOptions('packageEnrollments'),
);

packageEnrollmentSchema.pre('validate', function () {
  this.enrollmentNumber = normalizeBillingCode(
    this.enrollmentNumber,
  );
  this.currency = normalizeBillingCode(this.currency);
  validateNonNegativeInventoryDecimal(
    this,
    'packagePriceSnapshot',
    this.packagePriceSnapshot,
  );
  validateEffectiveWindow(this, 'validFrom', 'validThrough');

  if (
    this.status === 'CANCELLED' &&
    this.cancellationReason == null
  ) {
    this.invalidate(
      'cancellationReason',
      'Cancelled package enrollments require a reason',
    );
  }
});

packageEnrollmentSchema.index(
  { facilityId: 1, enrollmentNumber: 1 },
  {
    name: 'uq_package_enrollments_facility_number',
    unique: true,
  },
);
packageEnrollmentSchema.index(
  {
    facilityId: 1,
    patientAccountId: 1,
    status: 1,
    validThrough: 1,
  },
  { name: 'ix_package_enrollments_account_status' },
);

export const packageUtilizationSchema = new Schema(
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
    packageEnrollmentId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    treatmentPackageItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    accountChargeId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    consumedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    overageQuantity: billingNonNegativeDecimal,
    status: {
      type: String,
      required: true,
      enum: packageUtilizationStatusValues,
      default: 'RESERVED',
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    packageAllocatedAmount: billingNonNegativeDecimal,
    refundId: nullableBillingObjectId,
    creditNoteId: nullableBillingObjectId,
    reversedBy: nullableBillingObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  billingTimestampedSchemaOptions('packageUtilizations'),
);

packageUtilizationSchema.pre('validate', function () {
  validatePositiveInventoryDecimal(
    this,
    'consumedQuantity',
    this.consumedQuantity,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'overageQuantity',
    this.overageQuantity,
  );

  if (
    this.status === 'REVERSED' &&
    (this.reversedAt == null || this.reversalReason == null)
  ) {
    this.invalidate(
      'status',
      'Reversed package utilization requires timestamp and reason',
    );
  }
});

packageUtilizationSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_package_utilizations_operation',
    unique: true,
  },
);
packageUtilizationSchema.index(
  {
    facilityId: 1,
    packageEnrollmentId: 1,
    treatmentPackageItemId: 1,
    status: 1,
  },
  { name: 'ix_package_utilizations_component_status' },
);

export type TaxCategory = InferSchemaType<typeof taxCategorySchema>;
export type PriceList = InferSchemaType<typeof priceListSchema>;
export type PriceListVersion = InferSchemaType<
  typeof priceListVersionSchema
>;
export type ServiceRate = InferSchemaType<typeof serviceRateSchema>;
export type TreatmentPackage = InferSchemaType<
  typeof treatmentPackageSchema
>;
export type TreatmentPackageItem = InferSchemaType<
  typeof treatmentPackageItemSchema
>;
export type PackageEnrollment = InferSchemaType<
  typeof packageEnrollmentSchema
>;
export type PackageUtilization = InferSchemaType<
  typeof packageUtilizationSchema
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

export const TaxCategoryModel = modelFor(
  'taxCategories',
  taxCategorySchema,
);
export const PriceListModel = modelFor(
  'priceLists',
  priceListSchema,
);
export const PriceListVersionModel = modelFor(
  'priceListVersions',
  priceListVersionSchema,
);
export const ServiceRateModel = modelFor(
  'serviceRates',
  serviceRateSchema,
);
export const TreatmentPackageModel = modelFor(
  'treatmentPackages',
  treatmentPackageSchema,
);
export const TreatmentPackageItemModel = modelFor(
  'treatmentPackageItems',
  treatmentPackageItemSchema,
);
export const PackageEnrollmentModel = modelFor(
  'packageEnrollments',
  packageEnrollmentSchema,
);
export const PackageUtilizationModel = modelFor(
  'packageUtilizations',
  packageUtilizationSchema,
);