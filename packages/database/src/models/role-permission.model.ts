import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const rolePermissionSchema = new Schema(
  {
    roleId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    permissionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    grantedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    grantedAt: {
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

    version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    collection: 'rolePermissions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

rolePermissionSchema.index(
  {
    roleId: 1,
    permissionId: 1,
  },
  {
    name: 'uq_role_permissions_role_permission',
    unique: true,
  },
);

rolePermissionSchema.index(
  {
    permissionId: 1,
    roleId: 1,
  },
  {
    name: 'ix_role_permissions_permission_role',
  },
);

export type RolePermissionDocument =
  InferSchemaType<
    typeof rolePermissionSchema
  >;

export const RolePermissionModel =
  (mongoose.models['rolePermissions'] as
    | Model<RolePermissionDocument>
    | undefined) ??
  mongoose.model<RolePermissionDocument>(
    'rolePermissions',
    rolePermissionSchema,
    'rolePermissions',
  );