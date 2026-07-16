import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const permissionSensitivityValues = [
  'STANDARD',
  'SENSITIVE',
  'HIGHLY_SENSITIVE',
] as const;

export const permissionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 160,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },

    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    sensitivity: {
      type: String,
      required: true,
      enum: permissionSensitivityValues,
      default: 'STANDARD',
    },

    isSystem: {
      type: Boolean,
      required: true,
      default: true,
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
  },
  {
    collection: 'permissions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

permissionSchema.index(
  {
    code: 1,
  },
  {
    name: 'uq_permissions_code',
    unique: true,
  },
);

permissionSchema.index(
  {
    module: 1,
    isActive: 1,
    code: 1,
  },
  {
    name: 'ix_permissions_module_active_code',
  },
);

permissionSchema.index(
  {
    isActive: 1,
    name: 1,
  },
  {
    name: 'ix_permissions_active_name',
  },
);

export type PermissionDocument = InferSchemaType<
  typeof permissionSchema
>;

export const PermissionModel =
  (mongoose.models['permissions'] as
    | Model<PermissionDocument>
    | undefined) ??
  mongoose.model<PermissionDocument>(
    'permissions',
    permissionSchema,
    'permissions',
  );