import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

export const facilityTypeValues = [
  'HOSPITAL',
  'BRANCH',
  'CLINIC',
  'DIAGNOSTIC_CENTER',
  'PHARMACY',
  'OTHER',
] as const;

export const facilityStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

const facilityIdentifierSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 60,
      match: /^[A-Z][A-Z0-9_]*$/,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    normalizedValue: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 160,
    },
    issuingAuthority: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
    },
    isPrimary: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const facilityAddressSchema = new Schema(
  {
    line1: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    line2: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    city: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    district: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    province: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    postalCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: 'PK',
      match: /^[A-Z]{2}$/,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const facilityContactSchema = new Schema(
  {
    primaryPhone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
    secondaryPhone: {
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
    website: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    emergencyPhone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const facilitySchema = new Schema(
  {
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
      maxlength: 200,
    },
    legalName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    facilityType: {
      type: String,
      required: true,
      enum: facilityTypeValues,
      default: 'HOSPITAL',
    },
    parentFacilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    identifiers: {
      type: [facilityIdentifierSchema],
      required: true,
      default: [],
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      default: 'Asia/Karachi',
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
      match: /^[A-Z]{3}$/,
    },
    locale: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 35,
      default: 'en-PK',
    },
    supportedLocales: {
      type: [String],
      required: true,
      default: ['en-PK'],
      validate: {
        validator: (values: string[]) =>
          values.length > 0 &&
          values.every(
            (value) =>
              typeof value === 'string' &&
              value.trim().length >= 2 &&
              value.trim().length <= 35,
          ),
        message:
          'supportedLocales must contain at least one valid locale',
      },
    },
    address: {
      type: facilityAddressSchema,
      required: true,
      default: () => ({}),
    },
    contact: {
      type: facilityContactSchema,
      required: true,
      default: () => ({}),
    },
    status: {
      type: String,
      required: true,
      enum: facilityStatusValues,
      default: 'ACTIVE',
    },
    allowsAuthentication: {
      type: Boolean,
      required: true,
      default: true,
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
    collection: 'facilities',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

facilitySchema.pre('validate', function validateFacility() {
  const normalizedLocales = [
    ...new Set(
      this.supportedLocales.map((value) => value.trim()),
    ),
  ];

  if (!normalizedLocales.includes(this.locale)) {
    normalizedLocales.unshift(this.locale);
  }

  this.supportedLocales = normalizedLocales;

  const primaryIdentifierCount = this.identifiers.filter(
    (identifier) => identifier.isPrimary,
  ).length;

  if (primaryIdentifierCount > 1) {
    this.invalidate(
      'identifiers',
      'A facility can have only one primary identifier',
    );
  }

  if (
    this.parentFacilityId !== null &&
    String(this.parentFacilityId) === String(this._id)
  ) {
    this.invalidate(
      'parentFacilityId',
      'A facility cannot be its own parent',
    );
  }

  if (this.status === 'INACTIVE') {
    this.allowsAuthentication = false;

    if (this.deactivatedAt === null) {
      this.invalidate(
        'deactivatedAt',
        'Inactive facilities require deactivatedAt',
      );
    }
  }
});

facilitySchema.index(
  { code: 1 },
  {
    name: 'uq_facilities_code',
    unique: true,
  },
);

facilitySchema.index(
  {
    parentFacilityId: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_facilities_parent_status_name',
  },
);

facilitySchema.index(
  {
    status: 1,
    allowsAuthentication: 1,
    name: 1,
  },
  {
    name: 'ix_facilities_status_authentication_name',
  },
);

facilitySchema.index(
  {
    'identifiers.normalizedValue': 1,
    status: 1,
  },
  {
    name: 'ix_facilities_identifier_status',
    partialFilterExpression: {
      'identifiers.normalizedValue': {
        $type: 'string',
      },
    },
  },
);

export type FacilityDocument = InferSchemaType<
  typeof facilitySchema
>;

export const FacilityModel =
  (mongoose.models['facilities'] as
    | Model<FacilityDocument>
    | undefined) ??
  mongoose.model<FacilityDocument>(
    'facilities',
    facilitySchema,
    'facilities',
  );