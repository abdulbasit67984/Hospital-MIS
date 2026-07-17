import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const departmentTypeValues = [
  'CLINICAL',
  'DIAGNOSTIC',
  'ADMINISTRATIVE',
  'FINANCIAL',
  'PHARMACY',
  'SUPPORT',
  'OTHER',
] as const;

export const departmentStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

const departmentContactSchema = new Schema(
  {
    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
    extension: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const departmentSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    parentDepartmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    managerStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
      match: /^[A-Z][A-Z0-9_-]*$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    departmentType: {
      type: String,
      required: true,
      enum: departmentTypeValues,
      default: 'OTHER',
    },
    isClinical: {
      type: Boolean,
      required: true,
      default: false,
    },
    location: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    costCenterCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },
    contact: {
      type: departmentContactSchema,
      required: true,
      default: () => ({}),
    },
    status: {
      type: String,
      required: true,
      enum: departmentStatusValues,
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
    collection: 'departments',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

departmentSchema.pre('validate', function validateDepartment() {
  if (
    this.parentDepartmentId !== null &&
    String(this.parentDepartmentId) === String(this._id)
  ) {
    this.invalidate(
      'parentDepartmentId',
      'A department cannot be its own parent',
    );
  }

  if (
    this.status === 'INACTIVE' &&
    this.deactivatedAt === null
  ) {
    this.invalidate(
      'deactivatedAt',
      'Inactive departments require deactivatedAt',
    );
  }
});

departmentSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_departments_facility_code',
    unique: true,
  },
);

departmentSchema.index(
  {
    facilityId: 1,
    parentDepartmentId: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_departments_facility_parent_status_name',
  },
);

departmentSchema.index(
  {
    facilityId: 1,
    departmentType: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_departments_facility_type_status_name',
  },
);

departmentSchema.index(
  {
    facilityId: 1,
    managerStaffId: 1,
    status: 1,
  },
  {
    name: 'ix_departments_facility_manager_status',
    partialFilterExpression: {
      managerStaffId: {
        $type: 'objectId',
      },
    },
  },
);

export type DepartmentDocument = InferSchemaType<
  typeof departmentSchema
>;

export const DepartmentModel =
  (mongoose.models['departments'] as
    | Model<DepartmentDocument>
    | undefined) ??
  mongoose.model<DepartmentDocument>(
    'departments',
    departmentSchema,
    'departments',
  );