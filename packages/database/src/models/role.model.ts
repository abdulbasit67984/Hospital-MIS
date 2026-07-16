import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const roleScopeValues = [
  'GLOBAL',
  'FACILITY',
] as const;

export const roleSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 80,
      match: /^[A-Z][A-Z0-9_]*$/,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    scope: {
      type: String,
      required: true,
      enum: roleScopeValues,
    },

    isSystem: {
      type: Boolean,
      required: true,
      default: false,
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
    collection: 'roles',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

roleSchema.pre(
  'validate',
  function validateRoleScope() {
    if (
      this.scope === 'GLOBAL' &&
      this.facilityId != null
    ) {
      this.invalidate(
        'facilityId',
        'Global roles must not have a facilityId',
      );
    }

    if (
      this.scope === 'FACILITY' &&
      this.facilityId == null
    ) {
      this.invalidate(
        'facilityId',
        'Facility-scoped roles require a facilityId',
      );
    }
  },
);

roleSchema.index(
  {
    scope: 1,
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_roles_scope_facility_code',
    unique: true,
  },
);

roleSchema.index(
  {
    facilityId: 1,
    isActive: 1,
    name: 1,
  },
  {
    name: 'ix_roles_facility_active_name',
  },
);

roleSchema.index(
  {
    scope: 1,
    isActive: 1,
    name: 1,
  },
  {
    name: 'ix_roles_scope_active_name',
  },
);

export type RoleDocument = InferSchemaType<
  typeof roleSchema
>;

export const RoleModel =
  (mongoose.models['roles'] as
    | Model<RoleDocument>
    | undefined) ??
  mongoose.model<RoleDocument>(
    'roles',
    roleSchema,
    'roles',
  );