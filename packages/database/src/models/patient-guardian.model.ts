import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  guardianLegalAuthorityStatusValues,
  guardianRelationshipTypeValues,
  guardianVerificationStatusValues,
} from './patient-guardian.types.js';

export const patientGuardianSchema = new Schema(
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
    guardianId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    relationshipType: {
      type: String,
      required: true,
      enum: guardianRelationshipTypeValues,
    },
    relationshipDescription: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },
    isPrimary: {
      type: Boolean,
      required: true,
      default: false,
    },
    isEmergencyContact: {
      type: Boolean,
      required: true,
      default: false,
    },
    livesWithPatient: {
      type: Boolean,
      required: true,
      default: false,
    },
    isFinanciallyResponsible: {
      type: Boolean,
      required: true,
      default: false,
    },
    legalAuthorityStatus: {
      type: String,
      required: true,
      enum: guardianLegalAuthorityStatusValues,
      default: 'DECLARED',
    },
    canConsentToTreatment: {
      type: Boolean,
      required: true,
      default: false,
    },
    canConsentToDisclosure: {
      type: Boolean,
      required: true,
      default: false,
    },
    canReceiveClinicalInformation: {
      type: Boolean,
      required: true,
      default: false,
    },
    authorityBasis: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    authorityEffectiveFrom: {
      type: Date,
      default: null,
    },
    authorityEffectiveTo: {
      type: Date,
      default: null,
    },
    verificationStatus: {
      type: String,
      required: true,
      enum: guardianVerificationStatusValues,
      default: 'UNVERIFIED',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    verificationNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    supportingAttachmentIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    endReason: {
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
    collection: 'patientGuardians',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientGuardianSchema.pre(
  'validate',
  function validatePatientGuardian() {
    if (
      this.relationshipType === 'OTHER' &&
      (this.relationshipDescription == null ||
        this.relationshipDescription.trim().length === 0)
    ) {
      this.invalidate(
        'relationshipDescription',
        'Other guardian relationships require a description',
      );
    }

    const grantsAuthority =
      this.canConsentToTreatment ||
      this.canConsentToDisclosure ||
      this.canReceiveClinicalInformation;

    if (grantsAuthority && this.legalAuthorityStatus === 'NONE') {
      this.invalidate(
        'legalAuthorityStatus',
        'Consent or information authority requires a declared legal basis',
      );
    }

    if (this.legalAuthorityStatus === 'VERIFIED') {
      if (this.verificationStatus !== 'VERIFIED') {
        this.invalidate(
          'verificationStatus',
          'Verified legal authority requires verified relationship evidence',
        );
      }

      if (this.verifiedAt == null) {
        this.invalidate(
          'verifiedAt',
          'Verified legal authority requires verifiedAt',
        );
      }

      if (this.verifiedBy == null) {
        this.invalidate(
          'verifiedBy',
          'Verified legal authority requires verifiedBy',
        );
      }
    }

    if (
      this.authorityEffectiveFrom != null &&
      this.authorityEffectiveTo != null &&
      this.authorityEffectiveTo.getTime() <=
        this.authorityEffectiveFrom.getTime()
    ) {
      this.invalidate(
        'authorityEffectiveTo',
        'Guardian authority end must be after its effective start',
      );
    }

    if (this.isActive) {
      this.endedAt = null;
      this.endedBy = null;
      this.endReason = null;
    } else if (this.endedAt == null) {
      this.invalidate(
        'endedAt',
        'Inactive guardian relationships require endedAt',
      );
    }
  },
);

patientGuardianSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    guardianId: 1,
  },
  {
    name: 'uq_patient_guardians_active_patient_guardian',
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
  },
);

patientGuardianSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    isPrimary: 1,
  },
  {
    name: 'uq_patient_guardians_active_primary',
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isPrimary: true,
    },
  },
);

patientGuardianSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    isActive: 1,
    isPrimary: -1,
  },
  {
    name: 'ix_patient_guardians_facility_patient_active_primary',
  },
);

patientGuardianSchema.index(
  {
    facilityId: 1,
    guardianId: 1,
    isActive: 1,
  },
  {
    name: 'ix_patient_guardians_facility_guardian_active',
  },
);

patientGuardianSchema.index(
  {
    patientId: 1,
    legalAuthorityStatus: 1,
    verificationStatus: 1,
    isActive: 1,
  },
  {
    name: 'ix_patient_guardians_patient_authority_verification',
  },
);

export type PatientGuardianDocument = InferSchemaType<
  typeof patientGuardianSchema
>;

export const PatientGuardianModel =
  (mongoose.models['patientGuardians'] as
    | Model<PatientGuardianDocument>
    | undefined) ??
  mongoose.model<PatientGuardianDocument>(
    'patientGuardians',
    patientGuardianSchema,
    'patientGuardians',
  );