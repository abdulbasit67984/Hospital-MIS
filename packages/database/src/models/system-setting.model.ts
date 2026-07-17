import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  settingScopeValues,
} from './setting-definition.model.js';

export const encryptedSettingAlgorithmValues = [
  'AES-256-GCM',
] as const;

const encryptedSettingValueSchema = new Schema(
  {
    algorithm: {
      type: String,
      required: true,
      enum: encryptedSettingAlgorithmValues,
      default: 'AES-256-GCM',
    },
    keyVersion: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    initializationVector: {
      type: String,
      required: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    authenticationTag: {
      type: String,
      required: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    ciphertext: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const systemSettingSchema = new Schema(
  {
    definitionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
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
    scope: {
      type: String,
      required: true,
      immutable: true,
      enum: settingScopeValues,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    value: {
      type: Schema.Types.Mixed,
      default: null,
    },
    encryptedValue: {
      type: encryptedSettingValueSchema,
      default: null,
      select: false,
    },
    valueHash: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 128,
      select: false,
    },
    isSensitive: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },
    revision: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
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
    collection: 'systemSettings',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

systemSettingSchema.pre('validate', function validateSystemSetting() {
  if (this.scope === 'GLOBAL' && this.facilityId !== null) {
    this.invalidate(
      'facilityId',
      'Global settings must not have a facilityId',
    );
  }

  if (this.scope === 'FACILITY' && this.facilityId === null) {
    this.invalidate(
      'facilityId',
      'Facility-scoped settings require a facilityId',
    );
  }

  if (this.isSensitive) {
    if (
      this.value !== null &&
      this.value !== undefined
    ) {
      this.invalidate(
        'value',
        'Sensitive settings cannot store plaintext values',
      );
    }

    if (this.encryptedValue === null) {
      this.invalidate(
        'encryptedValue',
        'Sensitive settings require an encrypted value',
      );
    }
  } else if (this.encryptedValue !== null) {
    this.invalidate(
      'encryptedValue',
      'Non-sensitive settings cannot store encrypted values',
    );
  }
});

systemSettingSchema.index(
  {
    scope: 1,
    facilityId: 1,
    key: 1,
  },
  {
    name: 'uq_system_settings_scope_facility_key',
    unique: true,
  },
);

systemSettingSchema.index(
  {
    definitionId: 1,
    scope: 1,
    facilityId: 1,
  },
  {
    name: 'ix_system_settings_definition_scope_facility',
  },
);

systemSettingSchema.index(
  {
    facilityId: 1,
    isActive: 1,
    key: 1,
  },
  {
    name: 'ix_system_settings_facility_active_key',
  },
);

export type SystemSettingDocument = InferSchemaType<
  typeof systemSettingSchema
>;

export const SystemSettingModel =
  (mongoose.models['systemSettings'] as
    | Model<SystemSettingDocument>
    | undefined) ??
  mongoose.model<SystemSettingDocument>(
    'systemSettings',
    systemSettingSchema,
    'systemSettings',
  );

export { encryptedSettingValueSchema };