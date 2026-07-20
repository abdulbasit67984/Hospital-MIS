import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  admissionPriorityValues,
  admissionRecommendationStatusValues,
  admissionTypeValues,
  isolationCapabilityValues,
  wardTypeValues,
} from './inpatient.types.js';

import {
  inpatientCommonFields,
  normalizeCode,
  uniqueCodes,
} from './inpatient-schema-helpers.js';

const diagnosisSnapshotSchema =
  new Schema(
    {
      diagnosisId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      diagnosisCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      diagnosisSystem: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      diagnosisDisplay: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 1_000,
      },

      primary: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },
    },
    {
      _id: false,
      strict: true,
    },
  );

diagnosisSnapshotSchema.pre(
  'validate',
  function validateDiagnosisSnapshot() {
    this.diagnosisCode =
      normalizeCode(
        this.diagnosisCode,
      );

    this.diagnosisSystem =
      normalizeCode(
        this.diagnosisSystem,
      );
  },
);

export const admissionRecommendationSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      recommendationNumber: {
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

      requestedPatientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      canonicalRedirected: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      encounterId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      registrationId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      opdVisitId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      queueTokenId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      orderingProviderUserId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      orderingProviderStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      orderingDepartmentId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      orderingServicePointId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      admissionType: {
        type: String,
        required: true,
        enum: admissionTypeValues,
      },

      priority: {
        type: String,
        required: true,
        enum: admissionPriorityValues,
        default: 'ROUTINE',
      },

      requestedWardTypes: {
        type: [String],
        required: true,
        enum: wardTypeValues,
        default: [],
      },

      requestedSpecialtyCodes: {
        type: [String],
        required: true,
        default: [],
      },

      requestedIsolationCapabilities: {
        type: [String],
        required: true,
        enum:
          isolationCapabilityValues,
        default: [],
      },

      clinicalIndication: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50_000,
        select: false,
      },

      diagnosisSnapshots: {
        type: [diagnosisSnapshotSchema],
        required: true,
        default: [],
        select: false,
      },

      expectedLengthOfStayDays: {
        type: Number,
        default: null,
        min: 0,
        max: 10_000,
      },

      requestedAdmissionAt: {
        type: Date,
        default: null,
      },

      recommendedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        required: true,
        enum:
          admissionRecommendationStatusValues,
        default: 'ORDERED',
      },

      acceptedAt: {
        type: Date,
        default: null,
      },

      acceptedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      acceptedByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      rejectedAt: {
        type: Date,
        default: null,
      },

      rejectedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      rejectedByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      rejectionReason: {
        type: String,
        default: null,
        trim: true,
        minlength: 5,
        maxlength: 5_000,
        select: false,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      cancelledBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      cancelledByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      cancellationReason: {
        type: String,
        default: null,
        trim: true,
        minlength: 5,
        maxlength: 5_000,
        select: false,
      },

      expiresAt: {
        type: Date,
        default: null,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      convertedAt: {
        type: Date,
        default: null,
      },

      convertedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      patientCoverageId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      preauthorizationId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      treatmentPackageId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      attachmentIds: {
        type: [
          Schema.Types.ObjectId,
        ],
        required: true,
        default: [],
      },
    },
    {
      collection:
        'admissionRecommendations',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

admissionRecommendationSchema.pre(
  'validate',
  function validateAdmissionRecommendation() {
    this.recommendationNumber =
      normalizeCode(
        this.recommendationNumber,
      );

    this.requestedWardTypes =
      uniqueCodes(
        this.requestedWardTypes,
      );

    this.requestedSpecialtyCodes =
      uniqueCodes(
        this.requestedSpecialtyCodes,
      );

    this.requestedIsolationCapabilities =
      uniqueCodes(
        this
          .requestedIsolationCapabilities,
      );

    const primaryDiagnosisCount =
      this.diagnosisSnapshots.filter(
        (diagnosis) =>
          diagnosis.primary,
      ).length;

    if (
      primaryDiagnosisCount > 1
    ) {
      this.invalidate(
        'diagnosisSnapshots',
        'Admission recommendations may contain only one primary diagnosis snapshot',
      );
    }

    if (
      this.requestedAdmissionAt != null &&
      this.requestedAdmissionAt <
        this.recommendedAt
    ) {
      this.invalidate(
        'requestedAdmissionAt',
        'Requested admission time cannot precede recommendation time',
      );
    }

    if (
      this.expiresAt != null &&
      this.expiresAt <=
        this.recommendedAt
    ) {
      this.invalidate(
        'expiresAt',
        'Recommendation expiry must follow recommendation time',
      );
    }

    if (
      this.status === 'ACCEPTED' &&
      (
        this.acceptedAt == null ||
        this.acceptedBy == null ||
        this.acceptedByStaffId == null
      )
    ) {
      this.invalidate(
        'status',
        'Accepted recommendations require acceptance attribution',
      );
    }

    if (
      this.status === 'REJECTED' &&
      (
        this.rejectedAt == null ||
        this.rejectedBy == null ||
        this.rejectedByStaffId == null ||
        this.rejectionReason == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected recommendations require rejection attribution and reason',
      );
    }

    if (
      this.status === 'CANCELLED' &&
      (
        this.cancelledAt == null ||
        this.cancelledBy == null ||
        this.cancelledByStaffId == null ||
        this.cancellationReason == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled recommendations require cancellation attribution and reason',
      );
    }

    if (
      this.status === 'CONVERTED' &&
      (
        this.admissionId == null ||
        this.convertedAt == null ||
        this.convertedBy == null
      )
    ) {
      this.invalidate(
        'status',
        'Converted recommendations require admission and conversion attribution',
      );
    }

    if (
      this.status !== 'CONVERTED' &&
      (
        this.admissionId != null ||
        this.convertedAt != null ||
        this.convertedBy != null
      )
    ) {
      this.invalidate(
        'status',
        'Only converted recommendations may retain admission conversion metadata',
      );
    }
  },
);

admissionRecommendationSchema.index(
  {
    facilityId: 1,
    recommendationNumber: 1,
  },
  {
    name:
      'uq_admission_recommendations_facility_number',
    unique: true,
  },
);

admissionRecommendationSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    status: 1,
    recommendedAt: -1,
  },
  {
    name:
      'ix_admission_recommendations_encounter_status',
  },
);

admissionRecommendationSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    recommendedAt: -1,
  },
  {
    name:
      'ix_admission_recommendations_patient_status',
  },
);

admissionRecommendationSchema.index(
  {
    facilityId: 1,
    orderingDepartmentId: 1,
    priority: 1,
    status: 1,
    recommendedAt: 1,
  },
  {
    name:
      'ix_admission_recommendations_worklist',
  },
);

admissionRecommendationSchema.index(
  {
    facilityId: 1,
    expiresAt: 1,
    status: 1,
  },
  {
    name:
      'ix_admission_recommendations_expiry',

    partialFilterExpression: {
      expiresAt: {
        $type: 'date',
      },
    },
  },
);

export type AdmissionRecommendation =
  InferSchemaType<
    typeof admissionRecommendationSchema
  >;

export const AdmissionRecommendationModel =
  (
    mongoose.models[
      'admissionRecommendations'
    ] as
      | Model<AdmissionRecommendation>
      | undefined
  ) ??
  mongoose.model<AdmissionRecommendation>(
    'admissionRecommendations',
    admissionRecommendationSchema,
    'admissionRecommendations',
  );