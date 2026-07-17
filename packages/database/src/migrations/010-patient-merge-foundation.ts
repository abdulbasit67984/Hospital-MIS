import {
  randomUUID,
} from 'node:crypto';

import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  patientStatusValues,
} from './patient-guardian.types.js';

export const patientMergeEvidenceCodeValues = [
  'EXACT_CNIC',
  'EXACT_B_FORM',
  'EXACT_PASSPORT',
  'SAME_GUARDIAN_CNIC',
  'SAME_PHONE',
  'NAME_AND_EXACT_BIRTH_DATE',
  'NAME_AND_APPROXIMATE_BIRTH_DATE',
  'MANUAL_RECORD_REVIEW',
  'OTHER_DOCUMENTED_EVIDENCE',
] as const;

export const patientMergeStrategyValues = [
  'CANONICAL_REDIRECT',
] as const;

export const patientMergeStatusValues = [
  'COMPLETED',
] as const;

export type PatientMergeEvidenceCode =
  (typeof patientMergeEvidenceCodeValues)[number];

export type PatientMergeStrategy =
  (typeof patientMergeStrategyValues)[number];

export type PatientMergeStatus =
  (typeof patientMergeStatusValues)[number];

export const patientMergeSchema = new Schema(
  {
    facilityId: {
      type:
        Schema.Types.ObjectId,

      required:
        true,

      immutable:
        true,
    },

    mergeId: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      default:
        randomUUID,

      trim:
        true,

      match:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    },

    sourcePatientId: {
      type:
        Schema.Types.ObjectId,

      required:
        true,

      immutable:
        true,
    },

    targetPatientId: {
      type:
        Schema.Types.ObjectId,

      required:
        true,

      immutable:
        true,
    },

    sourceEnterprisePatientId: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      maxlength:
        80,
    },

    targetEnterprisePatientId: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      maxlength:
        80,
    },

    sourcePrimaryMrn: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      minlength:
        1,

      maxlength:
        160,
    },

    targetPrimaryMrn: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      minlength:
        1,

      maxlength:
        160,
    },

    evidenceCodes: {
      type: [
        {
          type:
            String,

          enum:
            patientMergeEvidenceCodeValues,
        },
      ],

      required:
        true,

      immutable:
        true,

      validate: {
        validator(
          values:
            readonly string[],
        ): boolean {
          return values.length > 0 &&
            values.length <= 20 &&
            new Set(values).size ===
              values.length;
        },

        message:
          'Patient merge evidence must contain 1 to 20 unique evidence codes',
      },
    },

    reason: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      minlength:
        10,

      maxlength:
        2_000,

      select:
        false,
    },

    strategy: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      enum:
        patientMergeStrategyValues,

      default:
        'CANONICAL_REDIRECT',
    },

    status: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      enum:
        patientMergeStatusValues,

      default:
        'COMPLETED',
    },

    sourceStatusBefore: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      enum:
        patientStatusValues,
    },

    targetStatusBefore: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      enum:
        patientStatusValues,
    },

    sourceVersionBefore: {
      type:
        Number,

      required:
        true,

      immutable:
        true,

      min:
        0,
    },

    sourceVersionAfter: {
      type:
        Number,

      required:
        true,

      immutable:
        true,

      min:
        1,
    },

    targetVersionBefore: {
      type:
        Number,

      required:
        true,

      immutable:
        true,

      min:
        0,
    },

    targetVersionAfter: {
      type:
        Number,

      required:
        true,

      immutable:
        true,

      min:
        1,
    },

    mergedAt: {
      type:
        Date,

      required:
        true,

      immutable:
        true,
    },

    mergedBy: {
      type:
        Schema.Types.ObjectId,

      required:
        true,

      immutable:
        true,
    },

    transactionId: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      minlength:
        1,

      maxlength:
        200,
    },

    correlationId: {
      type:
        String,

      required:
        true,

      immutable:
        true,

      trim:
        true,

      minlength:
        1,

      maxlength:
        200,
    },

    schemaVersion: {
      type:
        Number,

      required:
        true,

      immutable:
        true,

      default:
        1,

      min:
        1,
    },

    version: {
      type:
        Number,

      required:
        true,

      default:
        0,

      min:
        0,
    },

    createdBy: {
      type:
        Schema.Types.ObjectId,

      required:
        true,

      immutable:
        true,
    },

    updatedBy: {
      type:
        Schema.Types.ObjectId,

      required:
        true,
    },
  },
  {
    collection:
      'patientMerges',

    strict:
      true,

    timestamps:
      true,

    versionKey:
      false,
  },
);

patientMergeSchema.pre(
  'validate',
  function validatePatientMerge() {
    if (
      this.sourcePatientId != null &&
      this.targetPatientId != null &&
      this.sourcePatientId.equals(
        this.targetPatientId,
      )
    ) {
      this.invalidate(
        'targetPatientId',
        'A patient cannot be merged into itself',
      );
    }

    if (
      this.sourceEnterprisePatientId ===
      this.targetEnterprisePatientId
    ) {
      this.invalidate(
        'targetEnterprisePatientId',
        'Source and target enterprise patient identifiers must differ',
      );
    }

    if (
      this.sourceVersionAfter !==
      this.sourceVersionBefore + 1
    ) {
      this.invalidate(
        'sourceVersionAfter',
        'Source patient version must advance exactly once during merge',
      );
    }

    if (
      this.targetVersionAfter !==
      this.targetVersionBefore + 1
    ) {
      this.invalidate(
        'targetVersionAfter',
        'Target patient version must advance exactly once during merge',
      );
    }
  },
);

patientMergeSchema.index(
  {
    mergeId:
      1,
  },
  {
    name:
      'uq_patient_merges_merge_id',

    unique:
      true,
  },
);

patientMergeSchema.index(
  {
    facilityId:
      1,

    sourcePatientId:
      1,
  },
  {
    name:
      'uq_patient_merges_facility_source',

    unique:
      true,
  },
);

patientMergeSchema.index(
  {
    transactionId:
      1,
  },
  {
    name:
      'uq_patient_merges_transaction',

    unique:
      true,
  },
);

patientMergeSchema.index(
  {
    facilityId:
      1,

    targetPatientId:
      1,

    mergedAt:
      -1,
  },
  {
    name:
      'ix_patient_merges_facility_target_time',
  },
);

patientMergeSchema.index(
  {
    facilityId:
      1,

    sourcePrimaryMrn:
      1,
  },
  {
    name:
      'ix_patient_merges_facility_source_mrn',
  },
);

patientMergeSchema.index(
  {
    facilityId:
      1,

    targetPrimaryMrn:
      1,
  },
  {
    name:
      'ix_patient_merges_facility_target_mrn',
  },
);

export type PatientMergeDocument =
  InferSchemaType<
    typeof patientMergeSchema
  >;

export const PatientMergeModel =
  (
    mongoose.models['patientMerges'] as
      | Model<PatientMergeDocument>
      | undefined
  ) ??
  mongoose.model<PatientMergeDocument>(
    'patientMerges',
    patientMergeSchema,
    'patientMerges',
  );