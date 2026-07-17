import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const settingScopeValues = [
  'GLOBAL',
  'FACILITY',
] as const;

export const settingCategoryValues = [
  'FACILITY_IDENTITY',
  'REGIONAL',
  'LOCALIZATION',
  'OPERATIONS',
  'NUMBERING',
  'BILLING',
  'SECURITY',
  'INTEGRATIONS',
  'NOTIFICATIONS',
  'REPORTING',
  'OTHER',
] as const;

export const settingDataTypeValues = [
  'STRING',
  'INTEGER',
  'NUMBER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMEZONE',
  'CURRENCY',
  'LOCALE',
  'ENUM',
  'JSON',
  'SECRET',
] as const;

const settingLabelSchema = new Schema(
  {
    locale: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 35,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const settingValidationSchema = new Schema(
  {
    required: {
      type: Boolean,
      required: true,
      default: false,
    },
    minLength: {
      type: Number,
      default: null,
      min: 0,
    },
    maxLength: {
      type: Number,
      default: null,
      min: 0,
    },
    pattern: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    minimum: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    maximum: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    allowedValues: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    jsonSchema: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const settingDefinitionSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 160,
      match: /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/,
    },
    category: {
      type: String,
      required: true,
      enum: settingCategoryValues,
      default: 'OTHER',
    },
    dataType: {
      type: String,
      required: true,
      enum: settingDataTypeValues,
    },
    allowedScopes: {
      type: [String],
      required: true,
      enum: settingScopeValues,
      default: ['FACILITY'],
      validate: {
        validator: (values: string[]) =>
          values.length > 0 &&
          new Set(values).size === values.length,
        message:
          'allowedScopes must contain at least one unique scope',
      },
    },
    defaultValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    labels: {
      type: [settingLabelSchema],
      required: true,
      default: [],
      validate: {
        validator: (values: unknown[]) => values.length > 0,
        message: 'At least one localized setting label is required',
      },
    },
    validation: {
      type: settingValidationSchema,
      required: true,
      default: () => ({}),
    },
    isSensitive: {
      type: Boolean,
      required: true,
      default: false,
    },
    isMutable: {
      type: Boolean,
      required: true,
      default: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    cacheTtlSeconds: {
      type: Number,
      required: true,
      default: 300,
      min: 0,
      max: 86_400,
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
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    collection: 'settingDefinitions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

settingDefinitionSchema.pre(
  'validate',
  function validateSettingDefinition() {
    if (
      this.dataType === 'SECRET' &&
      this.isSensitive !== true
    ) {
      this.invalidate(
        'isSensitive',
        'SECRET settings must be marked sensitive',
      );
    }

    if (
      this.isSensitive &&
      this.defaultValue !== null &&
      this.defaultValue !== undefined
    ) {
      this.invalidate(
        'defaultValue',
        'Sensitive settings cannot define a plaintext default value',
      );
    }

    const locales = this.labels.map((label) => label.locale);

    if (new Set(locales).size !== locales.length) {
      this.invalidate(
        'labels',
        'Setting labels must use unique locales',
      );
    }

    if (
      this.validation.minLength !== null &&
      this.validation.maxLength !== null &&
      this.validation.minLength > this.validation.maxLength
    ) {
      this.invalidate(
        'validation.maxLength',
        'maxLength must be greater than or equal to minLength',
      );
    }
  },
);

settingDefinitionSchema.index(
  { key: 1 },
  {
    name: 'uq_setting_definitions_key',
    unique: true,
  },
);

settingDefinitionSchema.index(
  {
    category: 1,
    isActive: 1,
    key: 1,
  },
  {
    name: 'ix_setting_definitions_category_active_key',
  },
);

settingDefinitionSchema.index(
  {
    allowedScopes: 1,
    isActive: 1,
    key: 1,
  },
  {
    name: 'ix_setting_definitions_scope_active_key',
  },
);

export type SettingDefinitionDocument = InferSchemaType<
  typeof settingDefinitionSchema
>;

export const SettingDefinitionModel =
  (mongoose.models['settingDefinitions'] as
    | Model<SettingDefinitionDocument>
    | undefined) ??
  mongoose.model<SettingDefinitionDocument>(
    'settingDefinitions',
    settingDefinitionSchema,
    'settingDefinitions',
  );