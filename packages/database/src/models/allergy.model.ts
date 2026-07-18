import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import {
  allergyCatalogStatusValues,
  allergyCategoryValues,
  allergyReactionSeverityValues,
  allergySeverityValues,
  allergyVerificationStatusValues,
  patientAllergyRecordTypeValues,
  patientAllergyStatusValues,
} from './clinical-emr.types.js';

function normalizeAllergen(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

const allergyReactionSchema = new Schema(
  {
    manifestation: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    severity: {
      type: String,
      required: true,
      enum: allergyReactionSeverityValues,
      default: 'UNKNOWN',
    },
    occurredAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const encryptedAllergySnapshotSchema = new Schema(
  {
    algorithm: {
      type: String,
      required: true,
      immutable: true,
      enum: ['AES-256-GCM'],
    },
    keyVersion: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    initializationVector: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    authenticationTag: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    ciphertext: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: 5_000_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const allergySchema = new Schema(
  {
    facilityId: {
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
      minlength: 1,
      maxlength: 80,
    },
    category: {
      type: String,
      required: true,
      enum: allergyCategoryValues,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
    },
    synonyms: {
      type: [String],
      required: true,
      default: [],
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    status: {
      type: String,
      required: true,
      enum: allergyCatalogStatusValues,
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
      minlength: 5,
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
    collection: 'allergies',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

allergySchema.pre('validate', function validateAllergy() {
  this.normalizedName = normalizeAllergen(this.name);

  this.synonyms = [
    ...new Set(
      this.synonyms
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (this.status === 'INACTIVE') {
    if (
      this.deactivatedAt == null ||
      this.deactivatedBy == null ||
      this.deactivationReason == null
    ) {
      this.invalidate(
        'status',
        'Inactive allergens require deactivation attribution and reason',
      );
    }
  } else if (
    this.deactivatedAt != null ||
    this.deactivatedBy != null ||
    this.deactivationReason != null
  ) {
    this.invalidate(
      'status',
      'Active allergens cannot retain deactivation metadata',
    );
  }
});

allergySchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_allergies_facility_code',
    unique: true,
  },
);

allergySchema.index(
  {
    facilityId: 1,
    category: 1,
    normalizedName: 1,
  },
  {
    name: 'uq_allergies_facility_category_name',
    unique: true,
  },
);

allergySchema.index(
  {
    facilityId: 1,
    status: 1,
    normalizedName: 1,
  },
  {
    name: 'ix_allergies_facility_status_name',
  },
);

export const patientAllergySchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    recordType: {
      type: String,
      required: true,
      enum: patientAllergyRecordTypeValues,
      immutable: true,
    },
    allergyId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    category: {
      type: String,
      required: true,
      enum: allergyCategoryValues,
      immutable: true,
    },
    allergenText: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
      immutable: true,
    },
    normalizedAllergenText: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 500,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: patientAllergyStatusValues,
      default: 'ACTIVE',
    },
    verificationStatus: {
      type: String,
      required: true,
      enum: allergyVerificationStatusValues,
      default: 'UNCONFIRMED',
    },
    severity: {
      type: String,
      required: true,
      enum: allergySeverityValues,
      default: 'UNKNOWN',
    },
    reactions: {
      type: [allergyReactionSchema],
      required: true,
      default: [],
    },
    onsetDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    lastReactionAt: {
      type: Date,
      default: null,
    },
    clinicalNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    sourceEncounterId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    activeAllergyKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 700,
      select: false,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    currentVersion: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    latestVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    supersedesPatientAllergyId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByPatientAllergyId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
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
    collection: 'patientAllergies',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientAllergySchema.pre(
  'validate',
  function validatePatientAllergy() {
    this.normalizedAllergenText =
      normalizeAllergen(this.allergenText);

    const isNoKnownRecord = [
      'NO_KNOWN_ALLERGIES',
      'NO_KNOWN_DRUG_ALLERGIES',
    ].includes(this.recordType);

    if (isNoKnownRecord) {
      if (
        this.allergyId != null ||
        this.reactions.length > 0 ||
        this.severity !== 'UNKNOWN'
      ) {
        this.invalidate(
          'recordType',
          'No-known-allergy declarations cannot reference an allergen, reactions, or severity',
        );
      }
    }

    if (this.status === 'ACTIVE') {
      this.activeAllergyKey = [
        this.recordType,
        this.category,
        this.normalizedAllergenText,
      ].join(':');
    } else {
      this.activeAllergyKey = null;
    }

    if (
      ['INACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR'].includes(this.status) &&
      this.statusReason == null
    ) {
      this.invalidate(
        'statusReason',
        `${this.status} allergy records require a reason`,
      );
    }

    if (this.verificationStatus === 'CONFIRMED') {
      if (
        this.verifiedAt == null ||
        this.verifiedBy == null
      ) {
        this.invalidate(
          'verificationStatus',
          'Confirmed allergy records require verification attribution',
        );
      }
    }

    if (
      this.supersedesPatientAllergyId != null &&
      this.supersedesPatientAllergyId.equals(this._id)
    ) {
      this.invalidate(
        'supersedesPatientAllergyId',
        'An allergy record cannot supersede itself',
      );
    }
  },
);

patientAllergySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    activeAllergyKey: 1,
  },
  {
    name: 'uq_patient_allergies_active_key',
    unique: true,
    partialFilterExpression: {
      activeAllergyKey: {
        $type: 'string',
      },
    },
  },
);

patientAllergySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    severity: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_patient_allergies_patient_status_severity_recorded',
  },
);

patientAllergySchema.index(
  {
    facilityId: 1,
    sourceEncounterId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_patient_allergies_source_encounter_recorded',
    partialFilterExpression: {
      sourceEncounterId: {
        $type: 'objectId',
      },
    },
  },
);

export const patientAllergyVersionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAllergyId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    statusSnapshot: {
      type: String,
      required: true,
      enum: patientAllergyStatusValues,
      immutable: true,
    },
    encryptedSnapshot: {
      type: encryptedAllergySnapshotSchema,
      required: true,
      immutable: true,
      select: false,
    },
    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
    },
    changeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
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
      immutable: true,
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
      immutable: true,
    },
  },
  {
    collection: 'patientAllergyVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientAllergyVersionSchema.pre(
  'validate',
  function validatePatientAllergyVersion() {
    if (
      this.versionNumber === 1 &&
      this.previousVersionId != null
    ) {
      this.invalidate(
        'previousVersionId',
        'The first allergy version cannot have a previous version',
      );
    }

    if (
      this.versionNumber > 1 &&
      this.previousVersionId == null
    ) {
      this.invalidate(
        'previousVersionId',
        'Subsequent allergy versions require previousVersionId',
      );
    }

    if (
      ['INACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR'].includes(
        this.statusSnapshot,
      ) &&
      this.changeReason == null
    ) {
      this.invalidate(
        'changeReason',
        `${this.statusSnapshot} allergy versions require a reason`,
      );
    }
  },
);

patientAllergyVersionSchema.index(
  {
    facilityId: 1,
    patientAllergyId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_patient_allergy_versions_allergy_version',
    unique: true,
  },
);

patientAllergyVersionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_patient_allergy_versions_patient_recorded',
  },
);

export type AllergyDocument =
  InferSchemaType<typeof allergySchema>;

export type PatientAllergyDocument =
  InferSchemaType<typeof patientAllergySchema>;

export type PatientAllergyVersionDocument =
  InferSchemaType<typeof patientAllergyVersionSchema>;

export const AllergyModel =
  (mongoose.models['allergies'] as
    | Model<AllergyDocument>
    | undefined) ??
  mongoose.model<AllergyDocument>(
    'allergies',
    allergySchema,
    'allergies',
  );

export const PatientAllergyModel =
  (mongoose.models['patientAllergies'] as
    | Model<PatientAllergyDocument>
    | undefined) ??
  mongoose.model<PatientAllergyDocument>(
    'patientAllergies',
    patientAllergySchema,
    'patientAllergies',
  );

export const PatientAllergyVersionModel =
  (mongoose.models['patientAllergyVersions'] as
    | Model<PatientAllergyVersionDocument>
    | undefined) ??
  mongoose.model<PatientAllergyVersionDocument>(
    'patientAllergyVersions',
    patientAllergyVersionSchema,
    'patientAllergyVersions',
  );