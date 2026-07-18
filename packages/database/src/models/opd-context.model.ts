import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  clinicStatusValues,
  servicePointStatusValues,
  servicePointTypeValues,
} from './registration-queue.types.js';

export const opdClinicSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
      match: /^[A-Z][A-Z0-9_-]*$/u,
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
      maxlength: 1_000,
    },
    location: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    defaultProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: clinicStatusValues,
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
      maxlength: 1_000,
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
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    collection: 'opdClinics',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

opdClinicSchema.pre('validate', function validateOpdClinic() {
  if (this.status === 'INACTIVE' && this.deactivatedAt == null) {
    this.invalidate(
      'deactivatedAt',
      'Inactive clinics require deactivatedAt',
    );
  }

  if (
    this.status === 'ACTIVE' &&
    (this.deactivatedAt != null || this.deactivatedBy != null)
  ) {
    this.invalidate(
      'status',
      'Active clinics cannot retain deactivation metadata',
    );
  }
});

opdClinicSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_opd_clinics_facility_code',
    unique: true,
  },
);

opdClinicSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_opd_clinics_facility_department_status_name',
  },
);

opdClinicSchema.index(
  {
    facilityId: 1,
    defaultProviderId: 1,
    status: 1,
  },
  {
    name: 'ix_opd_clinics_facility_provider_status',
    partialFilterExpression: {
      defaultProviderId: {
        $type: 'objectId',
      },
    },
  },
);

export const servicePointSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    clinicId: {
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
      match: /^[A-Z][A-Z0-9_-]*$/u,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    servicePointType: {
      type: String,
      required: true,
      enum: servicePointTypeValues,
    },
    location: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    defaultProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    allowsWalkIn: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowsAppointment: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowsReferral: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowsEmergency: {
      type: Boolean,
      required: true,
      default: false,
    },
    status: {
      type: String,
      required: true,
      enum: servicePointStatusValues,
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
      maxlength: 1_000,
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
      required: true,
      immutable: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    collection: 'servicePoints',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

servicePointSchema.pre('validate', function validateServicePoint() {
  if (this.status === 'INACTIVE' && this.deactivatedAt == null) {
    this.invalidate(
      'deactivatedAt',
      'Inactive service points require deactivatedAt',
    );
  }

  if (
    this.status === 'ACTIVE' &&
    (this.deactivatedAt != null || this.deactivatedBy != null)
  ) {
    this.invalidate(
      'status',
      'Active service points cannot retain deactivation metadata',
    );
  }
});

servicePointSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_service_points_facility_code',
    unique: true,
  },
);

servicePointSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointType: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_service_points_facility_context_type_status_name',
  },
);

servicePointSchema.index(
  {
    facilityId: 1,
    defaultProviderId: 1,
    status: 1,
  },
  {
    name: 'ix_service_points_facility_provider_status',
    partialFilterExpression: {
      defaultProviderId: {
        $type: 'objectId',
      },
    },
  },
);

export type OpdClinicDocument =
  InferSchemaType<typeof opdClinicSchema>;

export type ServicePointDocument =
  InferSchemaType<typeof servicePointSchema>;

export const OpdClinicModel =
  (mongoose.models['opdClinics'] as
    | Model<OpdClinicDocument>
    | undefined) ??
  mongoose.model<OpdClinicDocument>(
    'opdClinics',
    opdClinicSchema,
    'opdClinics',
  );

export const ServicePointModel =
  (mongoose.models['servicePoints'] as
    | Model<ServicePointDocument>
    | undefined) ??
  mongoose.model<ServicePointDocument>(
    'servicePoints',
    servicePointSchema,
    'servicePoints',
  );