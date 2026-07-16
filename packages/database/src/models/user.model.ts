import {
  randomUUID,
} from 'node:crypto';

import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const identityUserStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'LOCKED',
  'SUSPENDED',
  'DISABLED',
] as const;

export const userSchema = new Schema(
  {
    /**
     * Optional home facility retained for Phase 3 authentication
     * compatibility. Facility authorization is ultimately resolved from
     * active user-role assignments.
     */
    facilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    publicId: {
      type: String,
      required: true,
      immutable: true,
      default: randomUUID,
      trim: true,
    },

    staffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    username: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 80,
    },

    normalizedUsername: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 80,
    },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    normalizedEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    displayName: {
      type: String,
      required: true,
      default(
        this: {
          username?: string;
        },
      ) {
        return this.username ?? 'Hospital MIS User';
      },
      trim: true,
      minlength: 1,
      maxlength: 260,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    status: {
      type: String,
      required: true,
      enum: identityUserStatusValues,
      default: 'ACTIVE',
    },

    mustChangePassword: {
      type: Boolean,
      required: true,
      default: true,
    },

    /**
     * Canonical authentication lockout counter. Phase 4 identity DTOs may
     * continue exposing the legacy failedLoginAttempts response property,
     * but it is derived from this stored value and is never persisted twice.
     */
    failedLoginCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    permissionVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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

    disabledAt: {
      type: Date,
      default: null,
    },

    disabledBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    disabledReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
  },
  {
    collection: 'users',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index(
  {
    publicId: 1,
  },
  {
    name: 'uq_users_public_id',
    unique: true,
  },
);

userSchema.index(
  {
    normalizedUsername: 1,
  },
  {
    name: 'uq_users_normalized_username',
    unique: true,
  },
);

userSchema.index(
  {
    normalizedEmail: 1,
  },
  {
    name: 'uq_users_normalized_email',
    unique: true,
    partialFilterExpression: {
      normalizedEmail: {
        $type: 'string',
      },
    },
  },
);

userSchema.index(
  {
    staffId: 1,
  },
  {
    name: 'uq_users_staff_id',
    unique: true,
    partialFilterExpression: {
      staffId: {
        $type: 'objectId',
      },
    },
  },
);

userSchema.index(
  {
    facilityId: 1,
    status: 1,
    username: 1,
  },
  {
    name: 'ix_users_facility_status_username',
  },
);

userSchema.index(
  {
    status: 1,
    lockedUntil: 1,
  },
  {
    name: 'ix_users_status_locked_until',
  },
);

export type UserDocument = InferSchemaType<
  typeof userSchema
>;

export const UserModel =
  (mongoose.models['users'] as
    | Model<UserDocument>
    | undefined) ??
  mongoose.model<UserDocument>(
    'users',
    userSchema,
    'users',
  );