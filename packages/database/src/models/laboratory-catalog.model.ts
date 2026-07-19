import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  laboratoryCatalogStatusValues,
  laboratoryReferenceRangeKindValues,
  laboratoryReferenceSexValues,
  laboratoryResultValueTypeValues,
} from './laboratory.types.js';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

function decimalNumber(value: mongoose.Types.Decimal128): number {
  return Number(value.toString());
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
    enum: laboratoryCatalogStatusValues,
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
    maxlength: 2_000,
    select: false,
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

function validateCatalogLifecycle(
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

export const labTestCategorySchema = new Schema(
  {
    ...commonCatalogFields,
    categoryCode: {
      type: String,
      required: true,
      immutable: true,
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
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
    },
    displayOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100_000,
    },
  },
  {
    collection: 'labTestCategories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labTestCategorySchema.pre('validate', function validateLabTestCategory() {
  this.categoryCode = normalizeCode(this.categoryCode);
  this.normalizedName = normalizeText(this.name);
  validateCatalogLifecycle(this, 'laboratory test categories');
});

labTestCategorySchema.index(
  {
    facilityId: 1,
    categoryCode: 1,
  },
  {
    name: 'uq_lab_test_categories_facility_code',
    unique: true,
  },
);

labTestCategorySchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_lab_test_categories_facility_name',
    unique: true,
  },
);

labTestCategorySchema.index(
  {
    facilityId: 1,
    status: 1,
    displayOrder: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_lab_test_categories_facility_status_order',
  },
);

const specimenRequirementSchema = new Schema(
  {
    requirementCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },
    specimenTypeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },
    specimenTypeName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },
    containerCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    containerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    minimumVolume: {
      type: Schema.Types.Decimal128,
      default: null,
      min: 0,
    },
    volumeUnitCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    fastingRequired: {
      type: Boolean,
      required: true,
      default: false,
    },
    collectionInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    handlingInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    maximumTransportMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 43_200,
    },
    preferred: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

specimenRequirementSchema.pre('validate', function validateSpecimenRequirement() {
  this.requirementCode = normalizeCode(this.requirementCode);
  this.specimenTypeCode = normalizeCode(this.specimenTypeCode);

  if (this.containerCode != null) {
    this.containerCode = normalizeCode(this.containerCode);
  }

  if ((this.minimumVolume == null) !== (this.volumeUnitCode == null)) {
    this.invalidate(
      'minimumVolume',
      'Minimum specimen volume and its unit must be provided together',
    );
  }
});

const codedReferenceValueSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    display: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },
    codingSystem: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    normal: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const referenceRangeSchema = new Schema(
  {
    rangeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },
    kind: {
      type: String,
      required: true,
      enum: laboratoryReferenceRangeKindValues,
    },
    sex: {
      type: String,
      required: true,
      enum: laboratoryReferenceSexValues,
      default: 'ANY',
    },
    minimumAgeDays: {
      type: Number,
      default: null,
      min: 0,
      max: 54_750,
    },
    maximumAgeDays: {
      type: Number,
      default: null,
      min: 0,
      max: 54_750,
    },
    lowerBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    upperBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    criticalLowerBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    criticalUpperBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    textualReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    codedValues: {
      type: [codedReferenceValueSchema],
      required: true,
      default: [],
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

referenceRangeSchema.pre('validate', function validateReferenceRange() {
  this.rangeCode = normalizeCode(this.rangeCode);

  if (
    this.minimumAgeDays != null &&
    this.maximumAgeDays != null &&
    this.minimumAgeDays > this.maximumAgeDays
  ) {
    this.invalidate(
      'maximumAgeDays',
      'Maximum reference age cannot be lower than minimum reference age',
    );
  }

  if (this.kind === 'NUMERIC_INTERVAL') {
    if (this.lowerBound == null && this.upperBound == null) {
      this.invalidate(
        'kind',
        'Numeric reference ranges require a lower or upper bound',
      );
    }

    if (
      this.lowerBound != null &&
      this.upperBound != null &&
      decimalNumber(this.lowerBound) > decimalNumber(this.upperBound)
    ) {
      this.invalidate(
        'upperBound',
        'Reference range upper bound cannot be lower than its lower bound',
      );
    }

    if (this.textualReference != null || this.codedValues.length > 0) {
      this.invalidate(
        'kind',
        'Numeric reference ranges cannot retain textual or coded alternatives',
      );
    }

    return;
  }

  if (this.kind === 'TEXTUAL') {
    if (this.textualReference == null) {
      this.invalidate(
        'textualReference',
        'Textual reference ranges require reference text',
      );
    }

    if (
      this.lowerBound != null ||
      this.upperBound != null ||
      this.criticalLowerBound != null ||
      this.criticalUpperBound != null ||
      this.codedValues.length > 0
    ) {
      this.invalidate(
        'kind',
        'Textual reference ranges cannot retain numeric or coded values',
      );
    }

    return;
  }

  if (this.codedValues.length < 1) {
    this.invalidate(
      'codedValues',
      'Coded reference ranges require at least one allowed code',
    );
  }

  if (
    this.lowerBound != null ||
    this.upperBound != null ||
    this.criticalLowerBound != null ||
    this.criticalUpperBound != null ||
    this.textualReference != null
  ) {
    this.invalidate(
      'kind',
      'Coded reference ranges cannot retain numeric or textual values',
    );
  }
});

const resultComponentDefinitionSchema = new Schema(
  {
    componentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 500,
    },
    valueType: {
      type: String,
      required: true,
      enum: laboratoryResultValueTypeValues,
    },
    unitCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    unitName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    decimalScale: {
      type: Number,
      required: true,
      default: 2,
      min: 0,
      max: 12,
    },
    referenceRanges: {
      type: [referenceRangeSchema],
      required: true,
      default: [],
    },
    required: {
      type: Boolean,
      required: true,
      default: true,
    },
    displayOrder: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    structuredSchemaKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

resultComponentDefinitionSchema.pre(
  'validate',
  function validateResultComponentDefinition() {
    this.componentCode = normalizeCode(this.componentCode);
    this.normalizedName = normalizeText(this.name);

    if (
      this.valueType === 'STRUCTURED' &&
      this.structuredSchemaKey == null
    ) {
      this.invalidate(
        'structuredSchemaKey',
        'Structured result components require a registered schema key',
      );
    }

    if (
      this.valueType !== 'STRUCTURED' &&
      this.structuredSchemaKey != null
    ) {
      this.invalidate(
        'structuredSchemaKey',
        'Only structured result components may define a schema key',
      );
    }
  },
);

export const labTestSchema = new Schema(
  {
    ...commonCatalogFields,
    testCode: {
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
      maxlength: 500,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
    },
    aliases: {
      type: [String],
      required: true,
      default: [],
    },
    normalizedAliases: {
      type: [String],
      required: true,
      default: [],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    categoryCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    categoryNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
    },
    methodCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    methodName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    requiresSpecimen: {
      type: Boolean,
      required: true,
      default: true,
    },
    specimenRequirements: {
      type: [specimenRequirementSchema],
      required: true,
      default: [],
    },
    components: {
      type: [resultComponentDefinitionSchema],
      required: true,
      default: [],
    },
    routineTurnaroundMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 43_200,
    },
    urgentTurnaroundMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 43_200,
    },
    statTurnaroundMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 43_200,
    },
    availableDepartmentIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    orderable: {
      type: Boolean,
      required: true,
      default: true,
    },
    requiresResultValidation: {
      type: Boolean,
      required: true,
      default: true,
    },
    requiresResultVerification: {
      type: Boolean,
      required: true,
      default: true,
    },
    criticalNotificationRequired: {
      type: Boolean,
      required: true,
      default: true,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
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
  },
  {
    collection: 'labTests',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labTestSchema.pre('validate', function validateLabTest() {
  this.testCode = normalizeCode(this.testCode);
  this.normalizedName = normalizeText(this.name);
  this.categoryCodeSnapshot = normalizeCode(this.categoryCodeSnapshot);

  const aliasMap = new Map<string, string>();
  for (const alias of this.aliases) {
    const trimmed = alias.trim();
    if (trimmed.length > 0) {
      aliasMap.set(normalizeText(trimmed), trimmed);
    }
  }
  this.aliases = [...aliasMap.values()];
  this.normalizedAliases = [...aliasMap.keys()];

  const uniqueDepartments = new Map(
    this.availableDepartmentIds.map((id) => [id.toHexString(), id]),
  );
  this.availableDepartmentIds = [...uniqueDepartments.values()];

  if (this.requiresSpecimen && this.specimenRequirements.length < 1) {
    this.invalidate(
      'specimenRequirements',
      'Specimen-based laboratory tests require at least one standardized specimen requirement',
    );
  }

  if (!this.requiresSpecimen && this.specimenRequirements.length > 0) {
    this.invalidate(
      'specimenRequirements',
      'Tests that do not require a specimen cannot retain specimen requirements',
    );
  }

  if (this.components.length < 1) {
    this.invalidate(
      'components',
      'Laboratory tests require at least one standardized result component',
    );
  }

  const componentCodes = new Set<string>();
  for (const component of this.components) {
    if (componentCodes.has(component.componentCode)) {
      this.invalidate(
        'components',
        'Laboratory tests cannot contain duplicate component codes',
      );
    }
    componentCodes.add(component.componentCode);
  }

  const requirementCodes = new Set<string>();
  let preferredRequirementCount = 0;
  for (const requirement of this.specimenRequirements) {
    if (requirementCodes.has(requirement.requirementCode)) {
      this.invalidate(
        'specimenRequirements',
        'Laboratory tests cannot contain duplicate specimen requirement codes',
      );
    }
    requirementCodes.add(requirement.requirementCode);
    preferredRequirementCount += requirement.preferred ? 1 : 0;
  }

  if (preferredRequirementCount > 1) {
    this.invalidate(
      'specimenRequirements',
      'A laboratory test may have only one preferred specimen requirement',
    );
  }

  if (
    this.effectiveThrough != null &&
    this.effectiveThrough < this.effectiveFrom
  ) {
    this.invalidate(
      'effectiveThrough',
      'Laboratory test effective-through time cannot precede effective-from time',
    );
  }

  if (!this.orderable && this.status === 'ACTIVE') {
    const hasAvailabilityEnd =
      this.effectiveThrough != null && this.effectiveThrough <= new Date();

    if (!hasAvailabilityEnd && this.deactivationReason == null) {
      this.invalidate(
        'orderable',
        'An active but non-orderable laboratory test requires an availability reason or ended effective period',
      );
    }
  }

  validateCatalogLifecycle(this, 'laboratory tests');
});

labTestSchema.index(
  {
    facilityId: 1,
    testCode: 1,
  },
  {
    name: 'uq_lab_tests_facility_code',
    unique: true,
  },
);

labTestSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_lab_tests_facility_name',
    unique: true,
  },
);

labTestSchema.index(
  {
    facilityId: 1,
    categoryId: 1,
    status: 1,
    orderable: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_lab_tests_category_availability_name',
  },
);

labTestSchema.index(
  {
    facilityId: 1,
    normalizedAliases: 1,
    status: 1,
    orderable: 1,
  },
  {
    name: 'ix_lab_tests_alias_availability',
  },
);

labTestSchema.index(
  {
    facilityId: 1,
    availableDepartmentIds: 1,
    status: 1,
    orderable: 1,
  },
  {
    name: 'ix_lab_tests_department_availability',
  },
);

labTestSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
  },
  {
    name: 'ix_lab_tests_charge_catalog_item',
    partialFilterExpression: {
      chargeCatalogItemId: {
        $type: 'objectId',
      },
    },
  },
);

export type LabTestCategory = InferSchemaType<typeof labTestCategorySchema>;
export type LabTest = InferSchemaType<typeof labTestSchema>;

export const LabTestCategoryModel =
  (mongoose.models['labTestCategories'] as Model<LabTestCategory> | undefined) ??
  mongoose.model<LabTestCategory>(
    'labTestCategories',
    labTestCategorySchema,
    'labTestCategories',
  );

export const LabTestModel =
  (mongoose.models['labTests'] as Model<LabTest> | undefined) ??
  mongoose.model<LabTest>('labTests', labTestSchema, 'labTests');