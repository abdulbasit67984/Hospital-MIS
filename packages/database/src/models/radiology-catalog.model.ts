import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  radiologyCatalogStatusValues,
  radiologyContrastRequirementValues,
  radiologyContrastRouteValues,
  radiologyLateralityRequirementValues,
  radiologyLateralityValues,
  radiologyModalityTypeValues,
  radiologySafetyRequirementValues,
} from './radiology.types.js';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

function uniqueStrings(values: string[]): string[] {
  const normalized = new Map<string, string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      normalized.set(normalizeText(trimmed), trimmed);
    }
  }

  return [...normalized.values()];
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
    enum: radiologyCatalogStatusValues,
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

const transactionFields = {
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

export const radiologyModalitySchema = new Schema(
  {
    ...commonCatalogFields,
    ...transactionFields,
    modalityCode: {
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
    modalityType: {
      type: String,
      required: true,
      enum: radiologyModalityTypeValues,
    },
    dicomModalityCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 16,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
    },
    availableDepartmentIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    supportsContrast: {
      type: Boolean,
      required: true,
      default: false,
    },
    supportsPacsIntegration: {
      type: Boolean,
      required: true,
      default: true,
    },
    pacsRoutingCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    orderable: {
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
  },
  {
    collection: 'radiologyModalities',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyModalitySchema.pre('validate', function validateRadiologyModality() {
  this.modalityCode = normalizeCode(this.modalityCode);
  this.normalizedName = normalizeText(this.name);
  this.dicomModalityCode = normalizeCode(this.dicomModalityCode);

  if (this.pacsRoutingCode != null) {
    this.pacsRoutingCode = normalizeCode(this.pacsRoutingCode);
  }

  const uniqueDepartments = new Map(
    this.availableDepartmentIds.map((id) => [id.toHexString(), id]),
  );
  this.availableDepartmentIds = [...uniqueDepartments.values()];

  if (this.availableDepartmentIds.length < 1) {
    this.invalidate(
      'availableDepartmentIds',
      'Radiology modalities require at least one available department',
    );
  }

  if (!this.supportsPacsIntegration && this.pacsRoutingCode != null) {
    this.invalidate(
      'pacsRoutingCode',
      'Modalities without PACS integration cannot retain a PACS routing code',
    );
  }

  if (
    this.effectiveThrough != null &&
    this.effectiveThrough < this.effectiveFrom
  ) {
    this.invalidate(
      'effectiveThrough',
      'Radiology modality effective-through time cannot precede effective-from time',
    );
  }

  validateCatalogLifecycle(this, 'radiology modalities');
});

radiologyModalitySchema.index(
  {
    facilityId: 1,
    modalityCode: 1,
  },
  {
    name: 'uq_radiology_modalities_facility_code',
    unique: true,
  },
);

radiologyModalitySchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_radiology_modalities_facility_name',
    unique: true,
  },
);

radiologyModalitySchema.index(
  {
    facilityId: 1,
    modalityType: 1,
    status: 1,
    orderable: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_radiology_modalities_type_availability',
  },
);

radiologyModalitySchema.index(
  {
    facilityId: 1,
    availableDepartmentIds: 1,
    status: 1,
    orderable: 1,
  },
  {
    name: 'ix_radiology_modalities_department_availability',
  },
);

const bodyRegionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

bodyRegionSchema.pre('validate', function validateBodyRegion() {
  this.code = normalizeCode(this.code);
});

export const radiologyProcedureSchema = new Schema(
  {
    ...commonCatalogFields,
    ...transactionFields,
    procedureCode: {
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
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
    },
    modalityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    modalityCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    modalityNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    modalityTypeSnapshot: {
      type: String,
      required: true,
      enum: radiologyModalityTypeValues,
    },
    dicomModalityCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 16,
    },
    bodyRegions: {
      type: [bodyRegionSchema],
      required: true,
      default: [],
    },
    lateralityRequirement: {
      type: String,
      required: true,
      enum: radiologyLateralityRequirementValues,
      default: 'NOT_APPLICABLE',
    },
    permittedLateralities: {
      type: [String],
      required: true,
      enum: radiologyLateralityValues,
      default: ['NOT_APPLICABLE'],
    },
    contrastRequirement: {
      type: String,
      required: true,
      enum: radiologyContrastRequirementValues,
      default: 'NONE',
    },
    permittedContrastRoutes: {
      type: [String],
      required: true,
      enum: radiologyContrastRouteValues,
      default: [],
    },
    preparationInstructions: {
      type: [String],
      required: true,
      default: [],
    },
    contraindications: {
      type: [String],
      required: true,
      default: [],
    },
    safetyScreeningRequirements: {
      type: [String],
      required: true,
      enum: radiologySafetyRequirementValues,
      default: [],
    },
    expectedDurationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1_440,
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
    schedulingRequired: {
      type: Boolean,
      required: true,
      default: true,
    },
    requiresTechnician: {
      type: Boolean,
      required: true,
      default: true,
    },
    requiresRadiologist: {
      type: Boolean,
      required: true,
      default: true,
    },
    orderable: {
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
  },
  {
    collection: 'radiologyProcedures',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyProcedureSchema.pre('validate', function validateRadiologyProcedure() {
  this.procedureCode = normalizeCode(this.procedureCode);
  this.normalizedName = normalizeText(this.name);
  this.modalityCodeSnapshot = normalizeCode(this.modalityCodeSnapshot);
  this.dicomModalityCodeSnapshot = normalizeCode(
    this.dicomModalityCodeSnapshot,
  );

  const aliasMap = new Map<string, string>();
  for (const alias of this.aliases) {
    const trimmed = alias.trim();
    if (trimmed.length > 0) {
      aliasMap.set(normalizeText(trimmed), trimmed);
    }
  }
  this.aliases = [...aliasMap.values()];
  this.normalizedAliases = [...aliasMap.keys()];

  this.preparationInstructions = uniqueStrings(this.preparationInstructions);
  this.contraindications = uniqueStrings(this.contraindications);
  this.permittedLateralities = [...new Set(this.permittedLateralities)];
  this.permittedContrastRoutes = [...new Set(this.permittedContrastRoutes)];
  this.safetyScreeningRequirements = [
    ...new Set(this.safetyScreeningRequirements),
  ];

  const uniqueDepartments = new Map(
    this.availableDepartmentIds.map((id) => [id.toHexString(), id]),
  );
  this.availableDepartmentIds = [...uniqueDepartments.values()];

  const bodyRegionCodes = new Set<string>();
  for (const bodyRegion of this.bodyRegions) {
    bodyRegion.code = normalizeCode(bodyRegion.code);

    if (bodyRegionCodes.has(bodyRegion.code)) {
      this.invalidate(
        'bodyRegions',
        'Radiology procedures cannot contain duplicate body-region codes',
      );
    }
    bodyRegionCodes.add(bodyRegion.code);
  }

  if (this.bodyRegions.length < 1) {
    this.invalidate(
      'bodyRegions',
      'Radiology procedures require at least one standardized body region',
    );
  }

  if (this.availableDepartmentIds.length < 1) {
    this.invalidate(
      'availableDepartmentIds',
      'Radiology procedures require at least one available department',
    );
  }

  if (this.lateralityRequirement === 'NOT_APPLICABLE') {
    if (
      this.permittedLateralities.length !== 1 ||
      this.permittedLateralities[0] !== 'NOT_APPLICABLE'
    ) {
      this.invalidate(
        'permittedLateralities',
        'Non-lateral radiology procedures may only permit NOT_APPLICABLE',
      );
    }
  } else {
    if (
      this.permittedLateralities.length < 1 ||
      this.permittedLateralities.includes('NOT_APPLICABLE')
    ) {
      this.invalidate(
        'permittedLateralities',
        'Lateral radiology procedures require one or more applicable lateralities',
      );
    }
  }

  if (
    this.contrastRequirement === 'NONE' &&
    this.permittedContrastRoutes.length > 0
  ) {
    this.invalidate(
      'permittedContrastRoutes',
      'Non-contrast procedures cannot retain contrast routes',
    );
  }

  if (
    this.contrastRequirement !== 'NONE' &&
    this.permittedContrastRoutes.length < 1
  ) {
    this.invalidate(
      'permittedContrastRoutes',
      'Contrast-capable procedures require at least one permitted contrast route',
    );
  }

  if (
    ['REQUIRED', 'CONDITIONAL'].includes(this.contrastRequirement) &&
    !this.safetyScreeningRequirements.includes('CONTRAST_ALLERGY')
  ) {
    this.invalidate(
      'safetyScreeningRequirements',
      'Required or conditional contrast procedures require contrast-allergy screening',
    );
  }

  if (
    this.urgentTurnaroundMinutes != null &&
    this.urgentTurnaroundMinutes > this.routineTurnaroundMinutes
  ) {
    this.invalidate(
      'urgentTurnaroundMinutes',
      'Urgent radiology turnaround cannot exceed routine turnaround',
    );
  }

  const statUpperBound =
    this.urgentTurnaroundMinutes ?? this.routineTurnaroundMinutes;
  if (
    this.statTurnaroundMinutes != null &&
    this.statTurnaroundMinutes > statUpperBound
  ) {
    this.invalidate(
      'statTurnaroundMinutes',
      'STAT radiology turnaround cannot exceed urgent or routine turnaround',
    );
  }

  if (
    this.effectiveThrough != null &&
    this.effectiveThrough < this.effectiveFrom
  ) {
    this.invalidate(
      'effectiveThrough',
      'Radiology procedure effective-through time cannot precede effective-from time',
    );
  }

  validateCatalogLifecycle(this, 'radiology procedures');
});

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    procedureCode: 1,
  },
  {
    name: 'uq_radiology_procedures_facility_code',
    unique: true,
  },
);

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_radiology_procedures_facility_name',
    unique: true,
  },
);

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    modalityId: 1,
    status: 1,
    orderable: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_radiology_procedures_modality_availability',
  },
);

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    availableDepartmentIds: 1,
    status: 1,
    orderable: 1,
  },
  {
    name: 'ix_radiology_procedures_department_availability',
  },
);

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    normalizedAliases: 1,
    status: 1,
    orderable: 1,
  },
  {
    name: 'ix_radiology_procedures_alias_availability',
  },
);

radiologyProcedureSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
  },
  {
    name: 'ix_radiology_procedures_charge_catalog_item',
    partialFilterExpression: {
      chargeCatalogItemId: {
        $type: 'objectId',
      },
    },
  },
);

export type RadiologyModality = InferSchemaType<
  typeof radiologyModalitySchema
>;
export type RadiologyProcedure = InferSchemaType<
  typeof radiologyProcedureSchema
>;

export const RadiologyModalityModel =
  (mongoose.models['radiologyModalities'] as
    | Model<RadiologyModality>
    | undefined) ??
  mongoose.model<RadiologyModality>(
    'radiologyModalities',
    radiologyModalitySchema,
    'radiologyModalities',
  );

export const RadiologyProcedureModel =
  (mongoose.models['radiologyProcedures'] as
    | Model<RadiologyProcedure>
    | undefined) ??
  mongoose.model<RadiologyProcedure>(
    'radiologyProcedures',
    radiologyProcedureSchema,
    'radiologyProcedures',
  );