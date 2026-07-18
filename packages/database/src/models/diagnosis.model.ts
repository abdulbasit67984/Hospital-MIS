import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import {
  diagnosisCatalogStatusValues,
  diagnosisCertaintyValues,
  diagnosisCodeSystemValues,
  encounterDiagnosisRoleValues,
  encounterDiagnosisStatusValues,
  patientProblemStatusValues,
  patientProblemVersionChangeTypeValues,
} from './clinical-emr.types.js';

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/\s+/gu, ' ');
}

const encryptedProblemSnapshotSchema = new Schema(
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

export const diagnosisSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    codeSystem: {
      type: String,
      required: true,
      enum: diagnosisCodeSystemValues,
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
    normalizedCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },
    display: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    normalizedDisplay: {
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
    parentDiagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    billable: {
      type: Boolean,
      required: true,
      default: true,
    },
    status: {
      type: String,
      required: true,
      enum: diagnosisCatalogStatusValues,
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
    collection: 'diagnoses',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

diagnosisSchema.pre('validate', function validateDiagnosis() {
  this.normalizedCode = normalizeCode(this.code);
  this.normalizedDisplay = this.display
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');

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
        'Inactive diagnoses require deactivation attribution and reason',
      );
    }
  } else if (
    this.deactivatedAt != null ||
    this.deactivatedBy != null ||
    this.deactivationReason != null
  ) {
    this.invalidate(
      'status',
      'Active diagnoses cannot retain deactivation metadata',
    );
  }

  if (
    this.parentDiagnosisId != null &&
    this.parentDiagnosisId.equals(this._id)
  ) {
    this.invalidate(
      'parentDiagnosisId',
      'A diagnosis cannot be its own parent',
    );
  }
});

diagnosisSchema.index(
  {
    facilityId: 1,
    codeSystem: 1,
    normalizedCode: 1,
  },
  {
    name: 'uq_diagnoses_facility_system_code',
    unique: true,
  },
);

diagnosisSchema.index(
  {
    facilityId: 1,
    status: 1,
    normalizedDisplay: 1,
  },
  {
    name: 'ix_diagnoses_facility_status_display',
  },
);

diagnosisSchema.index(
  {
    facilityId: 1,
    parentDiagnosisId: 1,
    status: 1,
  },
  {
    name: 'ix_diagnoses_facility_parent_status',
    partialFilterExpression: {
      parentDiagnosisId: {
        $type: 'objectId',
      },
    },
  },
);

export const encounterDiagnosisSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    diagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    codeSystem: {
      type: String,
      required: true,
      enum: diagnosisCodeSystemValues,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },
    normalizedCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },
    display: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    role: {
      type: String,
      required: true,
      enum: encounterDiagnosisRoleValues,
      default: 'SECONDARY',
    },
    certainty: {
      type: String,
      required: true,
      enum: diagnosisCertaintyValues,
      default: 'CONFIRMED',
    },
    status: {
      type: String,
      required: true,
      enum: encounterDiagnosisStatusValues,
      default: 'ACTIVE',
    },
    activeDiagnosisKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 220,
      select: false,
    },
    clinicalNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    onsetDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    isChronic: {
      type: Boolean,
      required: true,
      default: false,
    },
    presentOnAdmission: {
      type: Boolean,
      default: null,
    },
    evidence: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
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
    supersedesEncounterDiagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByEncounterDiagnosisId: {
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
    collection: 'encounterDiagnoses',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

encounterDiagnosisSchema.pre(
  'validate',
  function validateEncounterDiagnosis() {
    this.normalizedCode = normalizeCode(this.code);

    if (this.status === 'ACTIVE') {
      this.activeDiagnosisKey =
        `${this.codeSystem}:${this.normalizedCode}`;
    } else {
      this.activeDiagnosisKey = null;
    }

    if (
      this.status === 'RESOLVED' &&
      this.resolvedAt == null
    ) {
      this.invalidate(
        'resolvedAt',
        'Resolved encounter diagnoses require resolvedAt',
      );
    }

    if (
      ['RULED_OUT', 'ENTERED_IN_ERROR'].includes(this.status) &&
      this.statusReason == null
    ) {
      this.invalidate(
        'statusReason',
        `${this.status} diagnoses require a reason`,
      );
    }

    if (
      this.verifiedAt != null &&
      this.verifiedBy == null
    ) {
      this.invalidate(
        'verifiedBy',
        'verifiedAt requires verifiedBy',
      );
    }

    if (
      this.supersedesEncounterDiagnosisId != null &&
      this.supersedesEncounterDiagnosisId.equals(this._id)
    ) {
      this.invalidate(
        'supersedesEncounterDiagnosisId',
        'An encounter diagnosis cannot supersede itself',
      );
    }
  },
);

encounterDiagnosisSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    activeDiagnosisKey: 1,
  },
  {
    name: 'uq_encounter_diagnoses_active_code',
    unique: true,
    partialFilterExpression: {
      activeDiagnosisKey: {
        $type: 'string',
      },
    },
  },
);

encounterDiagnosisSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    role: 1,
    status: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_encounter_diagnoses_encounter_role_status_recorded',
  },
);

encounterDiagnosisSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_encounter_diagnoses_patient_status_recorded',
  },
);

export const patientProblemSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    problemNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    diagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    sourceEncounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceEncounterDiagnosisId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    codeSystem: {
      type: String,
      required: true,
      enum: diagnosisCodeSystemValues,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },
    normalizedCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
      immutable: true,
    },
    display: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    status: {
      type: String,
      required: true,
      enum: patientProblemStatusValues,
      default: 'ACTIVE',
    },
    activeProblemKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 220,
      select: false,
    },
    onsetDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    summary: {
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
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    supersedesProblemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByProblemId: {
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
    collection: 'patientProblems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientProblemSchema.pre(
  'validate',
  function validatePatientProblem() {
    this.normalizedCode = normalizeCode(this.code);

    if (this.status === 'ACTIVE') {
      this.activeProblemKey =
        `${this.codeSystem}:${this.normalizedCode}`;
    } else {
      this.activeProblemKey = null;
    }

    if (
      this.status === 'RESOLVED' &&
      this.resolvedAt == null
    ) {
      this.invalidate(
        'resolvedAt',
        'Resolved problems require resolvedAt',
      );
    }

    if (
      ['INACTIVE', 'ENTERED_IN_ERROR'].includes(this.status) &&
      this.statusReason == null
    ) {
      this.invalidate(
        'statusReason',
        `${this.status} problems require a reason`,
      );
    }

    if (
      this.supersedesProblemId != null &&
      this.supersedesProblemId.equals(this._id)
    ) {
      this.invalidate(
        'supersedesProblemId',
        'A problem cannot supersede itself',
      );
    }
  },
);

patientProblemSchema.index(
  {
    facilityId: 1,
    problemNumber: 1,
  },
  {
    name: 'uq_patient_problems_facility_number',
    unique: true,
  },
);

patientProblemSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    activeProblemKey: 1,
  },
  {
    name: 'uq_patient_problems_active_code',
    unique: true,
    partialFilterExpression: {
      activeProblemKey: {
        $type: 'string',
      },
    },
  },
);

patientProblemSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_patient_problems_patient_status_recorded',
  },
);

export const patientProblemVersionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientProblemId: {
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
    changeType: {
      type: String,
      required: true,
      enum: patientProblemVersionChangeTypeValues,
      immutable: true,
    },
    statusSnapshot: {
      type: String,
      required: true,
      enum: patientProblemStatusValues,
      immutable: true,
    },
    encryptedSnapshot: {
      type: encryptedProblemSnapshotSchema,
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
    collection: 'patientProblemVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientProblemVersionSchema.pre(
  'validate',
  function validatePatientProblemVersion() {
    if (
      this.versionNumber === 1 &&
      this.previousVersionId != null
    ) {
      this.invalidate(
        'previousVersionId',
        'The first problem version cannot have a previous version',
      );
    }

    if (
      this.versionNumber > 1 &&
      this.previousVersionId == null
    ) {
      this.invalidate(
        'previousVersionId',
        'Subsequent problem versions require previousVersionId',
      );
    }

    if (
      ['CORRECTED', 'ENTERED_IN_ERROR'].includes(this.changeType) &&
      this.changeReason == null
    ) {
      this.invalidate(
        'changeReason',
        `${this.changeType} problem versions require a reason`,
      );
    }
  },
);

patientProblemVersionSchema.index(
  {
    facilityId: 1,
    patientProblemId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_patient_problem_versions_problem_version',
    unique: true,
  },
);

patientProblemVersionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_patient_problem_versions_patient_recorded',
  },
);

export type DiagnosisDocument =
  InferSchemaType<typeof diagnosisSchema>;

export type EncounterDiagnosisDocument =
  InferSchemaType<typeof encounterDiagnosisSchema>;

export type PatientProblemDocument =
  InferSchemaType<typeof patientProblemSchema>;

export type PatientProblemVersionDocument =
  InferSchemaType<typeof patientProblemVersionSchema>;

export const DiagnosisModel =
  (mongoose.models['diagnoses'] as
    | Model<DiagnosisDocument>
    | undefined) ??
  mongoose.model<DiagnosisDocument>(
    'diagnoses',
    diagnosisSchema,
    'diagnoses',
  );

export const EncounterDiagnosisModel =
  (mongoose.models['encounterDiagnoses'] as
    | Model<EncounterDiagnosisDocument>
    | undefined) ??
  mongoose.model<EncounterDiagnosisDocument>(
    'encounterDiagnoses',
    encounterDiagnosisSchema,
    'encounterDiagnoses',
  );

export const PatientProblemModel =
  (mongoose.models['patientProblems'] as
    | Model<PatientProblemDocument>
    | undefined) ??
  mongoose.model<PatientProblemDocument>(
    'patientProblems',
    patientProblemSchema,
    'patientProblems',
  );

export const PatientProblemVersionModel =
  (mongoose.models['patientProblemVersions'] as
    | Model<PatientProblemVersionDocument>
    | undefined) ??
  mongoose.model<PatientProblemVersionDocument>(
    'patientProblemVersions',
    patientProblemVersionSchema,
    'patientProblemVersions',
  );