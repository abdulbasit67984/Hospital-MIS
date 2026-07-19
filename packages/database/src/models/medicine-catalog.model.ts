import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  formularyItemStatusValues,
  formularyRestrictionTypeValues,
  medicineCatalogStatusValues,
  medicineFormCategoryValues,
  medicineRouteCodeValues,
  prescriptionFrequencyKindValues,
  unitOfMeasureDimensionValues,
} from './formulary-prescription.types.js';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/gu, '_');
}

function applyCatalogLifecycleValidation(
  document: {
    status: string;
    deactivatedAt?: Date | null;
    deactivatedBy?: mongoose.Types.ObjectId | null;
    deactivationReason?: string | null;
    invalidate(path: string, message: string): void;
  },
  subject: string,
): void {
  if (document.status === 'INACTIVE') {
    if (
      document.deactivatedAt == null ||
      document.deactivatedBy == null ||
      document.deactivationReason == null
    ) {
      document.invalidate(
        'status',
        `Inactive ${subject} require deactivation attribution and reason`,
      );
    }

    return;
  }

  if (
    document.deactivatedAt != null ||
    document.deactivatedBy != null ||
    document.deactivationReason != null
  ) {
    document.invalidate(
      'status',
      `Active ${subject} cannot retain deactivation metadata`,
    );
  }
}

const commonCatalogFields = {
  facilityId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  status: {
    type: String,
    required: true,
    enum: medicineCatalogStatusValues,
    default: 'ACTIVE',
  },
  deactivatedAt: {
    type: Date,
    default: null,
  },
  deactivatedBy: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  deactivationReason: {
    type: String,
    default: null,
    trim: true,
    minlength: 5,
    maxlength: 1_000,
  },
  schemaVersion: {
    type: Number,
    required: true,
    immutable: true,
    default: 1,
    min: 1,
  },
  version: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
} as const;

const brandNameSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 300,
    },
    manufacturerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      required: true,
      enum: medicineCatalogStatusValues,
      default: 'ACTIVE',
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const medicineSchema = new Schema(
  {
    ...commonCatalogFields,
    medicineCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },
    genericName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    normalizedGenericName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
    },
    brandNames: {
      type: [brandNameSchema],
      required: true,
      default: [],
    },
    synonyms: {
      type: [String],
      required: true,
      default: [],
    },
    therapeuticClass: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    atcCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
    },
  },
  {
    collection: 'medicines',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

medicineSchema.pre('validate', function validateMedicine() {
  this.medicineCode = normalizeCode(this.medicineCode);
  this.normalizedGenericName = normalizeText(this.genericName);
  this.synonyms = [
    ...new Set(
      this.synonyms.map((value) => value.trim()).filter(Boolean),
    ),
  ];

  const seenBrands = new Set<string>();
  for (const brand of this.brandNames) {
    brand.normalizedName = normalizeText(brand.name);

    if (seenBrands.has(brand.normalizedName)) {
      this.invalidate(
        'brandNames',
        'A medicine cannot contain duplicate normalized brand names',
      );
    }

    seenBrands.add(brand.normalizedName);
  }

  applyCatalogLifecycleValidation(this, 'medicines');
});

medicineSchema.index(
  {
    facilityId: 1,
    medicineCode: 1,
  },
  {
    name: 'uq_medicines_facility_code',
    unique: true,
  },
);

medicineSchema.index(
  {
    facilityId: 1,
    normalizedGenericName: 1,
  },
  {
    name: 'uq_medicines_facility_generic_name',
    unique: true,
  },
);

medicineSchema.index(
  {
    facilityId: 1,
    'brandNames.normalizedName': 1,
    status: 1,
  },
  {
    name: 'ix_medicines_facility_brand_status',
  },
);

medicineSchema.index(
  {
    facilityId: 1,
    status: 1,
    normalizedGenericName: 1,
  },
  {
    name: 'ix_medicines_facility_status_name',
  },
);

export const medicineFormSchema = new Schema(
  {
    ...commonCatalogFields,
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 50,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 200,
    },
    category: {
      type: String,
      required: true,
      enum: medicineFormCategoryValues,
    },
  },
  {
    collection: 'medicineForms',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

medicineFormSchema.pre('validate', function validateMedicineForm() {
  this.code = normalizeCode(this.code);
  this.normalizedName = normalizeText(this.name);
  applyCatalogLifecycleValidation(this, 'medicine forms');
});

medicineFormSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_medicine_forms_facility_code',
    unique: true,
  },
);

medicineFormSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_medicine_forms_facility_name',
    unique: true,
  },
);

export const unitOfMeasureSchema = new Schema(
  {
    ...commonCatalogFields,
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 30,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 150,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    dimension: {
      type: String,
      required: true,
      enum: unitOfMeasureDimensionValues,
    },
    decimalScale: {
      type: Number,
      required: true,
      default: 3,
      min: 0,
      max: 6,
    },
  },
  {
    collection: 'unitsOfMeasure',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

unitOfMeasureSchema.pre('validate', function validateUnitOfMeasure() {
  this.code = normalizeCode(this.code);
  this.normalizedName = normalizeText(this.name);
  applyCatalogLifecycleValidation(this, 'units of measure');
});

unitOfMeasureSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_units_of_measure_facility_code',
    unique: true,
  },
);

unitOfMeasureSchema.index(
  {
    facilityId: 1,
    dimension: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_units_of_measure_facility_dimension_name',
  },
);

export const medicineRouteSchema = new Schema(
  {
    ...commonCatalogFields,
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      enum: medicineRouteCodeValues,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 150,
    },
  },
  {
    collection: 'medicineRoutes',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

medicineRouteSchema.pre('validate', function validateMedicineRoute() {
  this.code = normalizeCode(this.code);
  this.normalizedName = normalizeText(this.name);
  applyCatalogLifecycleValidation(this, 'medicine routes');
});

medicineRouteSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_medicine_routes_facility_code',
    unique: true,
  },
);

medicineRouteSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_medicine_routes_facility_name',
    unique: true,
  },
);

export const medicineStrengthSchema = new Schema(
  {
    ...commonCatalogFields,
    medicineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineFormId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    displayText: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },
    normalizedDisplayText: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 150,
    },
    numeratorValue: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    numeratorUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    denominatorValue: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    denominatorUnitId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
  },
  {
    collection: 'medicineStrengths',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

medicineStrengthSchema.pre('validate', function validateMedicineStrength() {
  this.normalizedDisplayText = normalizeText(this.displayText);

  const numerator = Number(this.numeratorValue.toString());
  if (!Number.isFinite(numerator) || numerator <= 0) {
    this.invalidate('numeratorValue', 'Numerator strength must be positive');
  }

  const denominatorPairComplete =
    this.denominatorValue != null && this.denominatorUnitId != null;
  const denominatorPairAbsent =
    this.denominatorValue == null && this.denominatorUnitId == null;

  if (!denominatorPairComplete && !denominatorPairAbsent) {
    this.invalidate(
      'denominatorValue',
      'Denominator value and unit must either both be present or both be absent',
    );
  }

  if (this.denominatorValue != null) {
    const denominator = Number(this.denominatorValue.toString());
    if (!Number.isFinite(denominator) || denominator <= 0) {
      this.invalidate(
        'denominatorValue',
        'Denominator strength must be positive',
      );
    }
  }

  applyCatalogLifecycleValidation(this, 'medicine strengths');
});

medicineStrengthSchema.index(
  {
    facilityId: 1,
    medicineId: 1,
    medicineFormId: 1,
    normalizedDisplayText: 1,
  },
  {
    name: 'uq_medicine_strengths_selection',
    unique: true,
  },
);

medicineStrengthSchema.index(
  {
    facilityId: 1,
    medicineId: 1,
    status: 1,
    normalizedDisplayText: 1,
  },
  {
    name: 'ix_medicine_strengths_medicine_status',
  },
);

export const prescriptionFrequencySchema = new Schema(
  {
    ...commonCatalogFields,
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 50,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 200,
    },
    kind: {
      type: String,
      required: true,
      enum: prescriptionFrequencyKindValues,
    },
    timesPerDay: {
      type: Number,
      default: null,
      min: 1,
      max: 48,
    },
    intervalMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 43_200,
    },
    defaultAdministrationTimes: {
      type: [String],
      required: true,
      default: [],
    },
    allowsAsNeeded: {
      type: Boolean,
      required: true,
      default: false,
    },
    maxAdministrationsPerDay: {
      type: Number,
      default: null,
      min: 1,
      max: 48,
    },
    patientInstructionTemplate: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  {
    collection: 'prescriptionFrequencies',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

prescriptionFrequencySchema.pre(
  'validate',
  function validatePrescriptionFrequency() {
    this.code = normalizeCode(this.code);
    this.normalizedName = normalizeText(this.name);
    this.defaultAdministrationTimes = [
      ...new Set(this.defaultAdministrationTimes.map((value) => value.trim())),
    ];

    for (const time of this.defaultAdministrationTimes) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
        this.invalidate(
          'defaultAdministrationTimes',
          'Administration times must use 24-hour HH:mm format',
        );
      }
    }

    if (this.kind === 'SCHEDULED' && this.timesPerDay == null) {
      this.invalidate('timesPerDay', 'Scheduled frequencies require timesPerDay');
    }

    if (this.kind === 'INTERVAL' && this.intervalMinutes == null) {
      this.invalidate(
        'intervalMinutes',
        'Interval frequencies require intervalMinutes',
      );
    }

    if (this.kind === 'AS_NEEDED' && !this.allowsAsNeeded) {
      this.invalidate(
        'allowsAsNeeded',
        'As-needed frequencies must allow as-needed administration',
      );
    }

    applyCatalogLifecycleValidation(this, 'prescription frequencies');
  },
);

prescriptionFrequencySchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_prescription_frequencies_facility_code',
    unique: true,
  },
);

prescriptionFrequencySchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_prescription_frequencies_facility_name',
    unique: true,
  },
);

export const formularyItemSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    formularyCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
    },
    medicineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineFormId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineStrengthId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    brandName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    normalizedBrandName: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 300,
    },
    allowedRouteIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    defaultRouteId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    doseUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    quantityUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    stockTracked: {
      type: Boolean,
      required: true,
      default: false,
    },
    restrictionType: {
      type: String,
      required: true,
      enum: formularyRestrictionTypeValues,
      default: 'NONE',
    },
    restrictedDepartmentIds: {
      type: [Schema.Types.ObjectId],
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
    highAlert: {
      type: Boolean,
      required: true,
      default: false,
    },
    controlledMedicine: {
      type: Boolean,
      required: true,
      default: false,
    },
    prescribingNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    searchText: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 2_000,
    },
    activeSelectionKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      select: false,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveUntil: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: formularyItemStatusValues,
      default: 'ACTIVE',
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    deactivationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    schemaVersion: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    collection: 'formularyItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

formularyItemSchema.pre('validate', function validateFormularyItem() {
  this.formularyCode = normalizeCode(this.formularyCode);
  this.normalizedBrandName =
    this.brandName == null ? null : normalizeText(this.brandName);
  this.searchText = normalizeText(this.searchText);

  const routeIds = [
    ...new Set(this.allowedRouteIds.map((routeId) => routeId.toHexString())),
  ];

  if (!routeIds.includes(this.defaultRouteId.toHexString())) {
    routeIds.push(this.defaultRouteId.toHexString());
  }

  this.allowedRouteIds = routeIds.map(
    (routeId) => new mongoose.Types.ObjectId(routeId),
  );

  if (this.effectiveUntil != null && this.effectiveUntil <= this.effectiveFrom) {
    this.invalidate(
      'effectiveUntil',
      'Formulary effectiveUntil must be later than effectiveFrom',
    );
  }

  if (
    this.minimumAgeYears != null &&
    this.maximumAgeYears != null &&
    this.maximumAgeYears < this.minimumAgeYears
  ) {
    this.invalidate(
      'maximumAgeYears',
      'Maximum prescribing age cannot be lower than minimum prescribing age',
    );
  }

  if (
    this.restrictionType === 'DEPARTMENT_ONLY' &&
    this.restrictedDepartmentIds.length === 0
  ) {
    this.invalidate(
      'restrictedDepartmentIds',
      'Department-only formulary items require at least one department',
    );
  }

  if (this.stockTracked && this.inventoryItemId == null) {
    this.invalidate(
      'inventoryItemId',
      'Stock-tracked formulary items require an inventory item link',
    );
  }

  this.activeSelectionKey =
    this.status === 'ACTIVE'
      ? [
          this.medicineId.toHexString(),
          this.medicineFormId.toHexString(),
          this.medicineStrengthId.toHexString(),
          this.normalizedBrandName ?? '-',
        ].join(':')
      : null;

  applyCatalogLifecycleValidation(this, 'formulary items');
});

formularyItemSchema.index(
  {
    facilityId: 1,
    formularyCode: 1,
  },
  {
    name: 'uq_formulary_items_facility_code',
    unique: true,
  },
);

formularyItemSchema.index(
  {
    facilityId: 1,
    activeSelectionKey: 1,
  },
  {
    name: 'uq_formulary_items_active_selection',
    unique: true,
    partialFilterExpression: {
      activeSelectionKey: {
        $type: 'string',
      },
    },
  },
);

formularyItemSchema.index(
  {
    facilityId: 1,
    status: 1,
    searchText: 1,
  },
  {
    name: 'ix_formulary_items_facility_status_search',
  },
);

formularyItemSchema.index(
  {
    facilityId: 1,
    inventoryItemId: 1,
  },
  {
    name: 'ix_formulary_items_inventory_item',
    partialFilterExpression: {
      inventoryItemId: {
        $type: 'objectId',
      },
    },
  },
);

export type Medicine = InferSchemaType<typeof medicineSchema>;
export type MedicineForm = InferSchemaType<typeof medicineFormSchema>;
export type UnitOfMeasure = InferSchemaType<typeof unitOfMeasureSchema>;
export type MedicineRoute = InferSchemaType<typeof medicineRouteSchema>;
export type MedicineStrength = InferSchemaType<typeof medicineStrengthSchema>;
export type PrescriptionFrequency = InferSchemaType<
  typeof prescriptionFrequencySchema
>;
export type FormularyItem = InferSchemaType<typeof formularyItemSchema>;

export const MedicineModel =
  (mongoose.models['medicines'] as Model<Medicine> | undefined) ??
  mongoose.model<Medicine>('medicines', medicineSchema, 'medicines');

export const MedicineFormModel =
  (mongoose.models['medicineForms'] as Model<MedicineForm> | undefined) ??
  mongoose.model<MedicineForm>(
    'medicineForms',
    medicineFormSchema,
    'medicineForms',
  );

export const UnitOfMeasureModel =
  (mongoose.models['unitsOfMeasure'] as Model<UnitOfMeasure> | undefined) ??
  mongoose.model<UnitOfMeasure>(
    'unitsOfMeasure',
    unitOfMeasureSchema,
    'unitsOfMeasure',
  );

export const MedicineRouteModel =
  (mongoose.models['medicineRoutes'] as Model<MedicineRoute> | undefined) ??
  mongoose.model<MedicineRoute>(
    'medicineRoutes',
    medicineRouteSchema,
    'medicineRoutes',
  );

export const MedicineStrengthModel =
  (mongoose.models['medicineStrengths'] as Model<MedicineStrength> | undefined) ??
  mongoose.model<MedicineStrength>(
    'medicineStrengths',
    medicineStrengthSchema,
    'medicineStrengths',
  );

export const PrescriptionFrequencyModel =
  (mongoose.models['prescriptionFrequencies'] as
    | Model<PrescriptionFrequency>
    | undefined) ??
  mongoose.model<PrescriptionFrequency>(
    'prescriptionFrequencies',
    prescriptionFrequencySchema,
    'prescriptionFrequencies',
  );

export const FormularyItemModel =
  (mongoose.models['formularyItems'] as Model<FormularyItem> | undefined) ??
  mongoose.model<FormularyItem>(
    'formularyItems',
    formularyItemSchema,
    'formularyItems',
  );