import { randomUUID } from 'node:crypto';

import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  guardianStatusValues,
  patientGenderIdentityValues,
  patientSexAtBirthValues,
} from './patient-guardian.types.js';

const localizedGuardianNameSchema = new Schema(
  {
    locale: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 35,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },
    normalizedFullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const guardianAddressSchema = new Schema(
  {
    line1: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },
    line2: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
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
      select: false,
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

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function guardianFullName(guardian: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [guardian.firstName, guardian.middleName, guardian.lastName]
    .filter(
      (part): part is string =>
        typeof part === 'string' && part.trim().length > 0,
    )
    .map((part) => part.trim())
    .join(' ');
}

export const guardianSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    enterpriseGuardianId: {
      type: String,
      required: true,
      immutable: true,
      default: randomUUID,
      trim: true,
      match:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    middleName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    lastName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 360,
    },
    normalizedFullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 360,
      select: false,
    },
    localizedNames: {
      type: [localizedGuardianNameSchema],
      required: true,
      default: [],
    },
    cnicNormalized: {
      type: String,
      default: null,
      trim: true,
      match: /^\d{13}$/,
      select: false,
    },
    cnicDisplayValue: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
    dateOfBirth: {
      type: Date,
      default: null,
      select: false,
    },
    sexAtBirth: {
      type: String,
      enum: patientSexAtBirthValues,
      default: 'UNKNOWN',
    },
    genderIdentity: {
      type: String,
      enum: patientGenderIdentityValues,
      default: 'NOT_DISCLOSED',
    },
    phoneNormalized: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
      select: false,
    },
    phoneDisplayValue: {
      type: String,
      default: null,
      trim: true,
      maxlength: 30,
    },
    emailNormalized: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
      select: false,
    },
    address: {
      type: guardianAddressSchema,
      required: true,
      default: () => ({}),
    },
    preferredLocale: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 35,
      default: 'en-PK',
    },
    status: {
      type: String,
      required: true,
      enum: guardianStatusValues,
      default: 'ACTIVE',
    },
    mergedIntoGuardianId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    mergedAt: {
      type: Date,
      default: null,
    },
    mergedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
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
    collection: 'guardians',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

guardianSchema.pre('validate', function validateGuardian() {
  const fullName = guardianFullName(this);

  if (fullName.length === 0) {
    this.invalidate('firstName', 'A guardian name is required');
  } else {
    this.displayName = fullName;
    this.normalizedFullName = normalizeSearchText(fullName);
  }

  for (const localizedName of this.localizedNames) {
    localizedName.normalizedFullName = normalizeSearchText(
      localizedName.fullName,
    );
  }

  if (
    this.cnicNormalized != null &&
    !/^\d{13}$/u.test(this.cnicNormalized)
  ) {
    this.invalidate(
      'cnicNormalized',
      'Guardian CNIC must contain exactly 13 digits',
    );
  }

  if (this.status === 'MERGED') {
    if (this.mergedIntoGuardianId == null) {
      this.invalidate(
        'mergedIntoGuardianId',
        'Merged guardians require a canonical guardian',
      );
    }

    if (this.mergedAt == null) {
      this.invalidate('mergedAt', 'Merged guardians require mergedAt');
    }

    if (this.mergedBy == null) {
      this.invalidate('mergedBy', 'Merged guardians require mergedBy');
    }
  } else if (
    this.mergedIntoGuardianId != null ||
    this.mergedAt != null ||
    this.mergedBy != null
  ) {
    this.invalidate(
      'status',
      'Merge metadata is only valid for merged guardians',
    );
  }

  if (
    this.mergedIntoGuardianId != null &&
    String(this.mergedIntoGuardianId) === String(this._id)
  ) {
    this.invalidate(
      'mergedIntoGuardianId',
      'A guardian cannot merge into itself',
    );
  }
});

guardianSchema.index(
  { enterpriseGuardianId: 1 },
  {
    name: 'uq_guardians_enterprise_guardian_id',
    unique: true,
  },
);

guardianSchema.index(
  {
    facilityId: 1,
    cnicNormalized: 1,
  },
  {
    name: 'uq_guardians_facility_cnic',
    unique: true,
    partialFilterExpression: {
      cnicNormalized: {
        $type: 'string',
      },
      status: 'ACTIVE',
    },
  },
);

guardianSchema.index(
  {
    facilityId: 1,
    normalizedFullName: 1,
    status: 1,
  },
  {
    name: 'ix_guardians_facility_name_status',
  },
);

guardianSchema.index(
  {
    facilityId: 1,
    phoneNormalized: 1,
    status: 1,
  },
  {
    name: 'ix_guardians_facility_phone_status',
    partialFilterExpression: {
      phoneNormalized: {
        $type: 'string',
      },
    },
  },
);

guardianSchema.index(
  { mergedIntoGuardianId: 1 },
  {
    name: 'ix_guardians_merged_into',
    partialFilterExpression: {
      mergedIntoGuardianId: {
        $type: 'objectId',
      },
    },
  },
);

export type GuardianDocument = InferSchemaType<typeof guardianSchema>;

export const GuardianModel =
  (mongoose.models['guardians'] as Model<GuardianDocument> | undefined) ??
  mongoose.model<GuardianDocument>(
    'guardians',
    guardianSchema,
    'guardians',
  );