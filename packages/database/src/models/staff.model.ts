import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const staffEmploymentStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'TERMINATED',
] as const;

export const staffSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    departmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    employeeNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 50,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    middleName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 260,
    },

    cnic: {
      type: String,
      default: null,
      trim: true,
      match: /^\d{13}$/,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    designation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },

    professionalType: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    professionalRegistrationNumber: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },

    joiningDate: {
      type: Date,
      default: null,
    },

    employmentStatus: {
      type: String,
      required: true,
      enum: staffEmploymentStatusValues,
      default: 'ACTIVE',
    },

    isClinical: {
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
    collection: 'staff',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

staffSchema.index(
  {
    facilityId: 1,
    employeeNumber: 1,
  },
  {
    name: 'uq_staff_facility_employee_number',
    unique: true,
  },
);

staffSchema.index(
  {
    cnic: 1,
  },
  {
    name: 'uq_staff_cnic',
    unique: true,
    partialFilterExpression: {
      cnic: {
        $type: 'string',
      },
    },
  },
);

staffSchema.index(
  {
    facilityId: 1,
    professionalRegistrationNumber: 1,
  },
  {
    name:
      'uq_staff_facility_professional_registration',
    unique: true,
    partialFilterExpression: {
      professionalRegistrationNumber: {
        $type: 'string',
      },
    },
  },
);

staffSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    employmentStatus: 1,
    isActive: 1,
    displayName: 1,
  },
  {
    name:
      'ix_staff_facility_department_status_name',
  },
);

staffSchema.index(
  {
    facilityId: 1,
    isClinical: 1,
    isActive: 1,
    displayName: 1,
  },
  {
    name:
      'ix_staff_facility_clinical_active_name',
  },
);

export type StaffDocument = InferSchemaType<
  typeof staffSchema
>;

export const StaffModel =
  (mongoose.models['staff'] as
    | Model<StaffDocument>
    | undefined) ??
  mongoose.model<StaffDocument>(
    'staff',
    staffSchema,
    'staff',
  );