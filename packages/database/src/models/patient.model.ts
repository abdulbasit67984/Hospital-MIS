import { randomUUID } from 'node:crypto';

import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  patientBirthDatePrecisionValues,
  patientGenderIdentityValues,
  patientGuardianRequirementValues,
  patientMergeStateValues,
  patientRegistrationSourceValues,
  patientSexAtBirthValues,
  patientStatusValues,
} from './patient-guardian.types.js';

const localizedPatientNameSchema = new Schema(
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

const patientBirthDateSchema = new Schema(
  {
    value: {
      type: Date,
      default: null,
      select: false,
    },
    precision: {
      type: String,
      required: true,
      enum: patientBirthDatePrecisionValues,
      default: 'UNKNOWN',
    },
    isApproximate: {
      type: Boolean,
      required: true,
      default: false,
    },
    estimatedAgeYears: {
      type: Number,
      default: null,
      min: 0,
      max: 150,
    },
    estimatedAsOfDate: {
      type: Date,
      default: null,
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

function patientFullName(patient: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [patient.firstName, patient.middleName, patient.lastName]
    .filter(
      (part): part is string =>
        typeof part === 'string' && part.trim().length > 0,
    )
    .map((part) => part.trim())
    .join(' ');
}

function patientNameTokens(normalizedFullName: string): string[] {
  return [...new Set(normalizedFullName.split(' ').filter(Boolean))].slice(
    0,
    40,
  );
}

export const patientSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    enterprisePatientId: {
      type: String,
      required: true,
      immutable: true,
      default: randomUUID,
      trim: true,
      match:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    },
    canonicalPatientId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    preferredName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
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
    nameSearchTokens: {
      type: [String],
      required: true,
      default: [],
      select: false,
    },
    localizedNames: {
      type: [localizedPatientNameSchema],
      required: true,
      default: [],
    },
    birthDate: {
      type: patientBirthDateSchema,
      required: true,
      default: () => ({}),
    },
    isMinor: {
      type: Boolean,
      required: true,
    },
    guardianRequirement: {
      type: String,
      required: true,
      enum: patientGuardianRequirementValues,
    },
    sexAtBirth: {
      type: String,
      required: true,
      enum: patientSexAtBirthValues,
    },
    genderIdentity: {
      type: String,
      required: true,
      enum: patientGenderIdentityValues,
      default: 'NOT_DISCLOSED',
    },
    genderDescription: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
      select: false,
    },
    preferredLocale: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 35,
      default: 'en-PK',
    },
    nationalityCountryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: 'PK',
      match: /^[A-Z]{2}$/,
    },
    status: {
      type: String,
      required: true,
      enum: patientStatusValues,
      default: 'ACTIVE',
    },
    mergeState: {
      type: String,
      required: true,
      enum: patientMergeStateValues,
      default: 'CANONICAL',
    },
    mergedIntoPatientId: {
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
    mergeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    deceasedAt: {
      type: Date,
      default: null,
    },
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    identityReviewRequired: {
      type: Boolean,
      required: true,
      default: false,
    },
    duplicateReviewRequired: {
      type: Boolean,
      required: true,
      default: false,
    },
    registrationSource: {
      type: String,
      required: true,
      enum: patientRegistrationSourceValues,
      default: 'RECEPTION',
    },
    registeredAt: {
      type: Date,
      required: true,
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
    collection: 'patients',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientSchema.pre('validate', function validatePatient() {
  const fullName = patientFullName(this);

  if (fullName.length === 0) {
    this.invalidate('firstName', 'A patient name is required');
  } else {
    this.displayName = this.preferredName?.trim() || fullName;
    this.normalizedFullName = normalizeSearchText(fullName);
    this.nameSearchTokens = patientNameTokens(this.normalizedFullName);
  }

  for (const localizedName of this.localizedNames) {
    localizedName.normalizedFullName = normalizeSearchText(
      localizedName.fullName,
    );
  }

  const birthDateValue = this.birthDate.value;
  const precision = this.birthDate.precision;

  if (precision === 'UNKNOWN' && birthDateValue != null) {
    this.invalidate(
      'birthDate.precision',
      'Unknown birth-date precision cannot include a date',
    );
  }

  if (precision !== 'UNKNOWN' && birthDateValue == null) {
    this.invalidate(
      'birthDate.value',
      'Known birth-date precision requires a date',
    );
  }

  if (
    this.birthDate.isApproximate &&
    precision !== 'APPROXIMATE' &&
    precision !== 'YEAR' &&
    precision !== 'MONTH'
  ) {
    this.invalidate(
      'birthDate.isApproximate',
      'Approximate birth dates must use APPROXIMATE, YEAR, or MONTH precision',
    );
  }

  if (this.isMinor && this.guardianRequirement !== 'REQUIRED') {
    this.invalidate(
      'guardianRequirement',
      'Minor patients require a guardian relationship',
    );
  }

  if (!this.isMinor && this.guardianRequirement === 'REQUIRED') {
    this.invalidate(
      'guardianRequirement',
      'Adult patients cannot use the mandatory minor guardian requirement',
    );
  }

  const hasMergedStatus = this.status === 'MERGED';
  const hasMergedState = this.mergeState === 'MERGED';

  if (hasMergedStatus !== hasMergedState) {
    this.invalidate(
      'mergeState',
      'Patient status and merge state must both be MERGED',
    );
  }

  if (hasMergedStatus && hasMergedState) {
    if (this.mergedIntoPatientId == null) {
      this.invalidate(
        'mergedIntoPatientId',
        'Merged patients require a canonical patient',
      );
    }

    if (this.mergedAt == null) {
      this.invalidate('mergedAt', 'Merged patients require mergedAt');
    }

    if (this.mergedBy == null) {
      this.invalidate('mergedBy', 'Merged patients require mergedBy');
    }
  } else if (
    this.mergedIntoPatientId != null ||
    this.mergedAt != null ||
    this.mergedBy != null
  ) {
    this.invalidate(
      'mergeState',
      'Merge metadata is only valid for merged patients',
    );
  }

  if (this.status === 'DECEASED' && this.deceasedAt == null) {
    this.invalidate('deceasedAt', 'Deceased patients require deceasedAt');
  }

  if (
    this.canonicalPatientId != null &&
    String(this.canonicalPatientId) === String(this._id)
  ) {
    this.invalidate(
      'canonicalPatientId',
      'A patient cannot reference itself as canonical',
    );
  }
});

patientSchema.index(
  { enterprisePatientId: 1 },
  {
    name: 'uq_patients_enterprise_patient_id',
    unique: true,
  },
);

patientSchema.index(
  {
    facilityId: 1,
    status: 1,
    normalizedFullName: 1,
    'birthDate.value': 1,
  },
  {
    name: 'ix_patients_facility_status_name_birth_date',
  },
);

patientSchema.index(
  {
    facilityId: 1,
    nameSearchTokens: 1,
    status: 1,
  },
  {
    name: 'ix_patients_facility_name_tokens_status',
  },
);

patientSchema.index(
  {
    facilityId: 1,
    status: 1,
    isMinor: 1,
    registeredAt: -1,
  },
  {
    name: 'ix_patients_facility_status_minor_registered',
  },
);

patientSchema.index(
  {
    canonicalPatientId: 1,
    mergeState: 1,
  },
  {
    name: 'ix_patients_canonical_merge_state',
    partialFilterExpression: {
      canonicalPatientId: {
        $type: 'objectId',
      },
    },
  },
);

patientSchema.index(
  { mergedIntoPatientId: 1 },
  {
    name: 'ix_patients_merged_into',
    partialFilterExpression: {
      mergedIntoPatientId: {
        $type: 'objectId',
      },
    },
  },
);

export type PatientDocument = InferSchemaType<typeof patientSchema>;

export const PatientModel =
  (mongoose.models['patients'] as Model<PatientDocument> | undefined) ??
  mongoose.model<PatientDocument>('patients', patientSchema, 'patients');