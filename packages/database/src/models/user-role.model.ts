import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const userRoleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    roleId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    facilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    assignedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    revocationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
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
    collection: 'userRoles',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

userRoleSchema.pre(
  'validate',
  function validateRevocation() {
    if (this.isActive) {
      this.revokedAt = null;
      this.revokedBy = null;
      this.revocationReason = null;
      return;
    }

    if (this.revokedAt == null) {
      this.invalidate(
        'revokedAt',
        'Inactive user-role assignments require revokedAt',
      );
    }
  },
);

userRoleSchema.index(
  {
    userId: 1,
    roleId: 1,
    facilityId: 1,
  },
  {
    name:
      'uq_user_roles_user_role_facility',
    unique: true,
  },
);

userRoleSchema.index(
  {
    userId: 1,
    facilityId: 1,
    isActive: 1,
    expiresAt: 1,
  },
  {
    name:
      'ix_user_roles_user_facility_active_expiry',
  },
);

userRoleSchema.index(
  {
    roleId: 1,
    facilityId: 1,
    isActive: 1,
  },
  {
    name:
      'ix_user_roles_role_facility_active',
  },
);

userRoleSchema.index(
  {
    expiresAt: 1,
  },
  {
    name: 'ix_user_roles_expiry',
    partialFilterExpression: {
      expiresAt: {
        $type: 'date',
      },
    },
  },
);

export type UserRoleDocument = InferSchemaType<
  typeof userRoleSchema
>;

export const UserRoleModel =
  (mongoose.models['userRoles'] as
    | Model<UserRoleDocument>
    | undefined) ??
  mongoose.model<UserRoleDocument>(
    'userRoles',
    userRoleSchema,
    'userRoles',
  );