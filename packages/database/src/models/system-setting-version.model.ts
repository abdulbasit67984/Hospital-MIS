import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  settingScopeValues,
} from './setting-definition.model.js';
import {
  encryptedSettingValueSchema,
} from './system-setting.model.js';

export const settingChangeTypeValues = [
  'CREATED',
  'UPDATED',
  'DEACTIVATED',
  'REACTIVATED',
  'MIGRATED',
] as const;

export const settingChangeSourceValues = [
  'USER',
  'SYSTEM',
  'MIGRATION',
] as const;

export const systemSettingVersionSchema = new Schema(
  {
    settingId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
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
    revision: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    changeType: {
      type: String,
      required: true,
      immutable: true,
      enum: settingChangeTypeValues,
    },
    changeSource: {
      type: String,
      required: true,
      immutable: true,
      enum: settingChangeSourceValues,
    },
    value: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
      select: false,
    },
    encryptedValue: {
      type: encryptedSettingValueSchema,
      default: null,
      immutable: true,
      select: false,
    },
    valueHash: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      lowercase: true,
      maxlength: 128,
      select: false,
    },
    isSensitive: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    changeReason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 1000,
    },
    correlationId: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 160,
    },
    changedAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
    },
    schemaVersion: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    createdAt: {
      type: Date,
      required: true,
      immutable: true,
      default: Date.now,
    },
  },
  {
    collection: 'systemSettingVersions',
    strict: true,
    timestamps: false,
    versionKey: false,
  },
);

systemSettingVersionSchema.pre(
  'validate',
  function validateSystemSettingVersion() {
    if (this.scope === 'GLOBAL' && this.facilityId !== null) {
      this.invalidate(
        'facilityId',
        'Global setting versions must not have a facilityId',
      );
    }

    if (this.scope === 'FACILITY' && this.facilityId === null) {
      this.invalidate(
        'facilityId',
        'Facility setting versions require a facilityId',
      );
    }

    if (this.isSensitive) {
      if (
        this.value !== null &&
        this.value !== undefined
      ) {
        this.invalidate(
          'value',
          'Sensitive setting history cannot contain plaintext values',
        );
      }

      if (this.encryptedValue === null) {
        this.invalidate(
          'encryptedValue',
          'Sensitive setting history requires an encrypted value',
        );
      }
    } else if (this.encryptedValue !== null) {
      this.invalidate(
        'encryptedValue',
        'Non-sensitive setting history cannot contain encrypted values',
      );
    }
  },
);

systemSettingVersionSchema.index(
  {
    settingId: 1,
    revision: 1,
  },
  {
    name: 'uq_system_setting_versions_setting_revision',
    unique: true,
  },
);

systemSettingVersionSchema.index(
  {
    scope: 1,
    facilityId: 1,
    key: 1,
    revision: -1,
  },
  {
    name: 'ix_system_setting_versions_scope_facility_key_revision',
  },
);

systemSettingVersionSchema.index(
  {
    changedBy: 1,
    changedAt: -1,
  },
  {
    name: 'ix_system_setting_versions_actor_changed_at',
    partialFilterExpression: {
      changedBy: {
        $type: 'objectId',
      },
    },
  },
);

export type SystemSettingVersionDocument = InferSchemaType<
  typeof systemSettingVersionSchema
>;

export const SystemSettingVersionModel =
  (mongoose.models['systemSettingVersions'] as
    | Model<SystemSettingVersionDocument>
    | undefined) ??
  mongoose.model<SystemSettingVersionDocument>(
    'systemSettingVersions',
    systemSettingVersionSchema,
    'systemSettingVersions',
  );