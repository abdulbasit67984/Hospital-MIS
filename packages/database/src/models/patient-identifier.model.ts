import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  patientIdentifierScopeValues,
  patientIdentifierStatusValues,
  patientIdentifierTypeValues,
  patientIdentifierVerificationValues,
} from './patient-guardian.types.js';

export const patientIdentifierSchema = new Schema(
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
    issuingFacilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    identifierType: {
      type: String,
      required: true,
      enum: patientIdentifierTypeValues,
      immutable: true,
    },
    scope: {
      type: String,
      required: true,
      enum: patientIdentifierScopeValues,
      immutable: true,
    },
    normalizedValue: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
      select: false,
    },
    displayValue: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    issuingCountryCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: 'PK',
      match: /^[A-Z]{2}$/,
    },
    issuingAuthority: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
    },
    isPrimaryIdentity: {
      type: Boolean,
      required: true,
      default: false,
    },
    isPrimaryMrn: {
      type: Boolean,
      required: true,
      default: false,
    },
    verificationStatus: {
      type: String,
      required: true,
      enum: patientIdentifierVerificationValues,
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
    validFrom: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: patientIdentifierStatusValues,
      default: 'ACTIVE',
    },
    replacedByIdentifierId: {
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
    collection: 'patientIdentifiers',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientIdentifierSchema.pre(
  'validate',
  function validatePatientIdentifier() {
    if (this.scope === 'FACILITY' && this.issuingFacilityId == null) {
      this.invalidate(
        'issuingFacilityId',
        'Facility-scoped identifiers require an issuing facility',
      );
    }

    if (this.scope === 'ENTERPRISE' && this.issuingFacilityId != null) {
      this.invalidate(
        'issuingFacilityId',
        'Enterprise identifiers must not have an issuing facility',
      );
    }

    if (this.identifierType === 'MRN' && this.scope !== 'FACILITY') {
      this.invalidate(
        'scope',
        'Medical record numbers are facility-scoped identifiers',
      );
    }

    if (this.identifierType === 'MRN' && !this.isPrimaryMrn) {
      this.invalidate(
        'isPrimaryMrn',
        'Active medical record numbers must be primary MRNs',
      );
    }

    if (this.identifierType !== 'MRN' && this.isPrimaryMrn) {
      this.invalidate(
        'isPrimaryMrn',
        'Only medical record numbers can be primary MRNs',
      );
    }

    if (
      (this.identifierType === 'CNIC' ||
        this.identifierType === 'B_FORM') &&
      !/^\d{13}$/u.test(this.normalizedValue)
    ) {
      this.invalidate(
        'normalizedValue',
        `${this.identifierType} values must contain exactly 13 digits`,
      );
    }

    if (
      this.identifierType === 'PASSPORT' &&
      !/^[A-Z0-9]{3,20}$/u.test(this.normalizedValue)
    ) {
      this.invalidate(
        'normalizedValue',
        'Passport values must contain 3 to 20 uppercase letters or digits',
      );
    }

    if (this.verificationStatus === 'VERIFIED') {
      if (this.verifiedAt == null) {
        this.invalidate(
          'verifiedAt',
          'Verified identifiers require verifiedAt',
        );
      }

      if (this.verifiedBy == null) {
        this.invalidate(
          'verifiedBy',
          'Verified identifiers require verifiedBy',
        );
      }
    }

    if (
      this.status === 'REPLACED' &&
      this.replacedByIdentifierId == null
    ) {
      this.invalidate(
        'replacedByIdentifierId',
        'Replaced identifiers require a replacement identifier',
      );
    }

    if (
      this.validFrom != null &&
      this.expiresAt != null &&
      this.expiresAt.getTime() <= this.validFrom.getTime()
    ) {
      this.invalidate(
        'expiresAt',
        'Identifier expiry must be after validFrom',
      );
    }
  },
);

patientIdentifierSchema.index(
  {
    scope: 1,
    identifierType: 1,
    issuingFacilityId: 1,
    normalizedValue: 1,
  },
  {
    name: 'uq_patient_identifiers_active_scope_type_facility_value',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
    },
  },
);

patientIdentifierSchema.index(
  {
    patientId: 1,
    issuingFacilityId: 1,
    isPrimaryMrn: 1,
  },
  {
    name: 'uq_patient_identifiers_primary_mrn',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      isPrimaryMrn: true,
    },
  },
);

patientIdentifierSchema.index(
  {
    patientId: 1,
    isPrimaryIdentity: 1,
  },
  {
    name: 'uq_patient_identifiers_primary_identity',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      isPrimaryIdentity: true,
    },
  },
);

patientIdentifierSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    identifierType: 1,
  },
  {
    name: 'ix_patient_identifiers_facility_patient_status_type',
  },
);

patientIdentifierSchema.index(
  {
    facilityId: 1,
    identifierType: 1,
    displayValue: 1,
    status: 1,
  },
  {
    name: 'ix_patient_identifiers_facility_type_display_status',
  },
);

export type PatientIdentifierDocument = InferSchemaType<
  typeof patientIdentifierSchema
>;

export const PatientIdentifierModel =
  (mongoose.models['patientIdentifiers'] as
    | Model<PatientIdentifierDocument>
    | undefined) ??
  mongoose.model<PatientIdentifierDocument>(
    'patientIdentifiers',
    patientIdentifierSchema,
    'patientIdentifiers',
  );