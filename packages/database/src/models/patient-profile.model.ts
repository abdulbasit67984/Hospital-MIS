import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  patientAddressStatusValues,
  patientAddressTypeValues,
  patientAlertSeverityValues,
  patientAlertStatusValues,
  patientAlertTypeValues,
  patientAlertVisibilityValues,
  patientContactPurposeValues,
  patientContactStatusValues,
  patientContactTypeValues,
} from './patient-guardian.types.js';

export const patientContactSchema = new Schema(
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
    contactType: {
      type: String,
      required: true,
      enum: patientContactTypeValues,
    },
    purpose: {
      type: String,
      required: true,
      enum: patientContactPurposeValues,
      default: 'PRIMARY',
    },
    normalizedValue: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 254,
      select: false,
    },
    displayValue: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 254,
    },
    contactName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    relationshipToPatient: {
      type: String,
      default: null,
      trim: true,
      maxlength: 160,
    },
    relatedGuardianId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    consentToContact: {
      type: Boolean,
      required: true,
      default: true,
    },
    isVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: patientContactStatusValues,
      default: 'ACTIVE',
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
    collection: 'patientContacts',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientContactSchema.pre(
  'validate',
  function validatePatientContact() {
    if (
      this.contactType === 'EMAIL' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(this.normalizedValue)
    ) {
      this.invalidate(
        'normalizedValue',
        'Email contacts require a valid normalized email',
      );
    }

    if (
      this.contactType === 'PHONE' &&
      !/^\+?\d{7,15}$/u.test(this.normalizedValue)
    ) {
      this.invalidate(
        'normalizedValue',
        'Phone contacts require 7 to 15 digits with an optional leading plus sign',
      );
    }

    if (this.isVerified) {
      if (this.verifiedAt == null) {
        this.invalidate(
          'verifiedAt',
          'Verified contacts require verifiedAt',
        );
      }

      if (this.verifiedBy == null) {
        this.invalidate(
          'verifiedBy',
          'Verified contacts require verifiedBy',
        );
      }
    }

    if (
      this.isEmergencyContact &&
      this.contactName == null &&
      this.relatedGuardianId == null
    ) {
      this.invalidate(
        'contactName',
        'Emergency contacts require a contact name or linked guardian',
      );
    }
  },
);

patientContactSchema.index(
  {
    patientId: 1,
    contactType: 1,
    isPrimary: 1,
  },
  {
    name: 'uq_patient_contacts_active_primary_type',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      isPrimary: true,
    },
  },
);

patientContactSchema.index(
  {
    facilityId: 1,
    contactType: 1,
    normalizedValue: 1,
    status: 1,
  },
  {
    name: 'ix_patient_contacts_facility_type_value_status',
  },
);

patientContactSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    isEmergencyContact: 1,
    status: 1,
  },
  {
    name: 'ix_patient_contacts_facility_patient_emergency_status',
  },
);

export const patientAddressSchema = new Schema(
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
    addressType: {
      type: String,
      required: true,
      enum: patientAddressTypeValues,
      default: 'HOME',
    },
    line1: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
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
    landmark: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
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
    isPrimary: {
      type: Boolean,
      required: true,
      default: false,
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validTo: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: patientAddressStatusValues,
      default: 'ACTIVE',
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
    collection: 'patientAddresses',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientAddressSchema.pre(
  'validate',
  function validatePatientAddress() {
    if (
      this.validFrom != null &&
      this.validTo != null &&
      this.validTo.getTime() <= this.validFrom.getTime()
    ) {
      this.invalidate(
        'validTo',
        'Address validity end must be after validFrom',
      );
    }
  },
);

patientAddressSchema.index(
  {
    patientId: 1,
    addressType: 1,
    isPrimary: 1,
  },
  {
    name: 'uq_patient_addresses_active_primary_type',
    unique: true,
    partialFilterExpression: {
      status: 'ACTIVE',
      isPrimary: true,
    },
  },
);

patientAddressSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    addressType: 1,
  },
  {
    name: 'ix_patient_addresses_facility_patient_status_type',
  },
);

patientAddressSchema.index(
  {
    facilityId: 1,
    countryCode: 1,
    province: 1,
    city: 1,
    status: 1,
  },
  {
    name: 'ix_patient_addresses_facility_region_status',
  },
);

export const patientAlertSchema = new Schema(
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
    alertType: {
      type: String,
      required: true,
      enum: patientAlertTypeValues,
    },
    severity: {
      type: String,
      required: true,
      enum: patientAlertSeverityValues,
      default: 'INFO',
    },
    visibility: {
      type: String,
      required: true,
      enum: patientAlertVisibilityValues,
      default: 'STANDARD',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    details: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4_000,
      select: false,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: patientAlertStatusValues,
      default: 'ACTIVE',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    resolutionReason: {
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
    collection: 'patientAlerts',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

patientAlertSchema.pre('validate', function validatePatientAlert() {
  if (
    this.effectiveTo != null &&
    this.effectiveTo.getTime() <= this.effectiveFrom.getTime()
  ) {
    this.invalidate(
      'effectiveTo',
      'Alert expiry must be after effectiveFrom',
    );
  }

  if (this.status === 'RESOLVED') {
    if (this.resolvedAt == null) {
      this.invalidate(
        'resolvedAt',
        'Resolved alerts require resolvedAt',
      );
    }

    if (this.resolvedBy == null) {
      this.invalidate(
        'resolvedBy',
        'Resolved alerts require resolvedBy',
      );
    }
  }
});

patientAlertSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    status: 1,
    severity: -1,
    effectiveFrom: -1,
  },
  {
    name: 'ix_patient_alerts_facility_patient_status_severity',
  },
);

patientAlertSchema.index(
  {
    facilityId: 1,
    status: 1,
    effectiveTo: 1,
  },
  {
    name: 'ix_patient_alerts_facility_status_expiry',
    partialFilterExpression: {
      effectiveTo: {
        $type: 'date',
      },
    },
  },
);

export type PatientContactDocument = InferSchemaType<
  typeof patientContactSchema
>;

export type PatientAddressDocument = InferSchemaType<
  typeof patientAddressSchema
>;

export type PatientAlertDocument = InferSchemaType<
  typeof patientAlertSchema
>;

export const PatientContactModel =
  (mongoose.models['patientContacts'] as
    | Model<PatientContactDocument>
    | undefined) ??
  mongoose.model<PatientContactDocument>(
    'patientContacts',
    patientContactSchema,
    'patientContacts',
  );

export const PatientAddressModel =
  (mongoose.models['patientAddresses'] as
    | Model<PatientAddressDocument>
    | undefined) ??
  mongoose.model<PatientAddressDocument>(
    'patientAddresses',
    patientAddressSchema,
    'patientAddresses',
  );

export const PatientAlertModel =
  (mongoose.models['patientAlerts'] as
    | Model<PatientAlertDocument>
    | undefined) ??
  mongoose.model<PatientAlertDocument>(
    'patientAlerts',
    patientAlertSchema,
    'patientAlerts',
  );