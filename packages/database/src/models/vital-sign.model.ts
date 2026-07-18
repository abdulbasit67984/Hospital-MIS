import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  clinicalConfidentialityValues,
} from './clinical-emr.types.js';

export const vitalSignStatusValues = [
  'RECORDED',
  'CORRECTED',
  'ENTERED_IN_ERROR',
] as const;

export const vitalSignSourceValues = [
  'MANUAL',
  'DEVICE',
  'IMPORTED',
] as const;

export const vitalSignBodyPositionValues = [
  'SITTING',
  'SUPINE',
  'STANDING',
  'PRONE',
  'LATERAL',
  'UNSPECIFIED',
] as const;

export const vitalSignTemperatureSiteValues = [
  'ORAL',
  'AXILLARY',
  'TYMPANIC',
  'RECTAL',
  'TEMPORAL',
  'OTHER',
  'UNSPECIFIED',
] as const;

export type VitalSignStatus =
  (typeof vitalSignStatusValues)[number];

export type VitalSignSource =
  (typeof vitalSignSourceValues)[number];

export type VitalSignBodyPosition =
  (typeof vitalSignBodyPositionValues)[number];

export type VitalSignTemperatureSite =
  (typeof vitalSignTemperatureSiteValues)[number];

function decimalNumber(
  value: { toString(): string } | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function requireRange(
  document: {
    invalidate(path: string, message: string): void;
  },
  path: string,
  value: number | null,
  minimum: number,
  maximum: number,
): void {
  if (value === null) {
    return;
  }

  if (value < minimum || value > maximum) {
    document.invalidate(
      path,
      `${path} must be between ${minimum} and ${maximum}`,
    );
  }
}

export const vitalSignSchema = new Schema(
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
    admissionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    sourceClinicalNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    observerProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    source: {
      type: String,
      required: true,
      enum: vitalSignSourceValues,
      default: 'MANUAL',
      immutable: true,
    },
    deviceIdentifier: {
      type: String,
      default: null,
      trim: true,
      minlength: 2,
      maxlength: 200,
      immutable: true,
    },
    measuredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    bodyPosition: {
      type: String,
      required: true,
      enum: vitalSignBodyPositionValues,
      default: 'UNSPECIFIED',
      immutable: true,
    },
    temperatureCelsius: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    temperatureSite: {
      type: String,
      required: true,
      enum: vitalSignTemperatureSiteValues,
      default: 'UNSPECIFIED',
      immutable: true,
    },
    pulsePerMinute: {
      type: Number,
      default: null,
      min: 0,
      max: 400,
      immutable: true,
    },
    respiratoryRatePerMinute: {
      type: Number,
      default: null,
      min: 0,
      max: 150,
      immutable: true,
    },
    systolicBloodPressureMmHg: {
      type: Number,
      default: null,
      min: 20,
      max: 350,
      immutable: true,
    },
    diastolicBloodPressureMmHg: {
      type: Number,
      default: null,
      min: 10,
      max: 250,
      immutable: true,
    },
    oxygenSaturationPercent: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    bloodGlucoseMgDl: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    painScore: {
      type: Number,
      default: null,
      min: 0,
      max: 10,
      immutable: true,
    },
    weightKg: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    heightCm: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    bmi: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    oxygenDeliveryMethod: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      immutable: true,
    },
    oxygenFlowLitresPerMinute: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      immutable: true,
      select: false,
    },
    confidentiality: {
      type: String,
      required: true,
      enum: clinicalConfidentialityValues,
      default: 'ROUTINE',
      immutable: true,
    },
    restrictionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
      immutable: true,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: vitalSignStatusValues,
      default: 'RECORDED',
    },
    correctedAt: {
      type: Date,
      default: null,
    },
    correctedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    correctionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    supersedesVitalSignId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByVitalSignId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    enteredInErrorAt: {
      type: Date,
      default: null,
    },
    enteredInErrorBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    enteredInErrorReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
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
    collection: 'vitalSigns',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

vitalSignSchema.pre('validate', function validateVitalSign() {
  const measurementValues = [
    this.temperatureCelsius,
    this.pulsePerMinute,
    this.respiratoryRatePerMinute,
    this.systolicBloodPressureMmHg,
    this.diastolicBloodPressureMmHg,
    this.oxygenSaturationPercent,
    this.bloodGlucoseMgDl,
    this.painScore,
    this.weightKg,
    this.heightCm,
    this.bmi,
  ];

  if (measurementValues.every((value) => value == null)) {
    this.invalidate(
      'temperatureCelsius',
      'At least one clinical measurement is required',
    );
  }

  if (
    (this.systolicBloodPressureMmHg == null) !==
    (this.diastolicBloodPressureMmHg == null)
  ) {
    this.invalidate(
      'systolicBloodPressureMmHg',
      'Systolic and diastolic blood pressure must be recorded together',
    );
  }

  if (
    this.systolicBloodPressureMmHg != null &&
    this.diastolicBloodPressureMmHg != null &&
    this.systolicBloodPressureMmHg <= this.diastolicBloodPressureMmHg
  ) {
    this.invalidate(
      'systolicBloodPressureMmHg',
      'Systolic blood pressure must exceed diastolic blood pressure',
    );
  }

  requireRange(
    this,
    'temperatureCelsius',
    decimalNumber(this.temperatureCelsius),
    20,
    50,
  );
  requireRange(
    this,
    'oxygenSaturationPercent',
    decimalNumber(this.oxygenSaturationPercent),
    0,
    100,
  );
  requireRange(
    this,
    'bloodGlucoseMgDl',
    decimalNumber(this.bloodGlucoseMgDl),
    0,
    2_500,
  );
  requireRange(
    this,
    'weightKg',
    decimalNumber(this.weightKg),
    0.1,
    1_000,
  );
  requireRange(
    this,
    'heightCm',
    decimalNumber(this.heightCm),
    10,
    300,
  );
  requireRange(
    this,
    'bmi',
    decimalNumber(this.bmi),
    1,
    150,
  );
  requireRange(
    this,
    'oxygenFlowLitresPerMinute',
    decimalNumber(this.oxygenFlowLitresPerMinute),
    0,
    100,
  );

  if (this.recordedAt < this.measuredAt) {
    this.invalidate(
      'recordedAt',
      'recordedAt cannot precede measuredAt',
    );
  }

  if (this.source === 'DEVICE' && this.deviceIdentifier == null) {
    this.invalidate(
      'deviceIdentifier',
      'Device-originated measurements require deviceIdentifier',
    );
  }

  if (this.source !== 'DEVICE' && this.deviceIdentifier != null) {
    this.invalidate(
      'deviceIdentifier',
      'deviceIdentifier is only valid for device-originated measurements',
    );
  }

  if (
    this.confidentiality !== 'ROUTINE' &&
    this.restrictionReason == null
  ) {
    this.invalidate(
      'restrictionReason',
      'Restricted vital signs require a minimum-necessary access reason',
    );
  }

  if (
    this.confidentiality === 'ROUTINE' &&
    this.restrictionReason != null
  ) {
    this.invalidate(
      'restrictionReason',
      'restrictionReason is only valid for restricted vital signs',
    );
  }

  if (this.status === 'RECORDED') {
    if (
      this.correctedAt != null ||
      this.correctedBy != null ||
      this.correctionReason != null ||
      this.supersededByVitalSignId != null ||
      this.enteredInErrorAt != null ||
      this.enteredInErrorBy != null ||
      this.enteredInErrorReason != null
    ) {
      this.invalidate(
        'status',
        'Recorded vital signs cannot contain correction or entered-in-error metadata',
      );
    }
  }

  if (this.status === 'CORRECTED') {
    if (
      this.correctedAt == null ||
      this.correctedBy == null ||
      this.correctionReason == null ||
      this.supersededByVitalSignId == null
    ) {
      this.invalidate(
        'status',
        'Corrected vital signs require attribution, reason, and replacement linkage',
      );
    }
  }

  if (this.status === 'ENTERED_IN_ERROR') {
    if (
      this.enteredInErrorAt == null ||
      this.enteredInErrorBy == null ||
      this.enteredInErrorReason == null
    ) {
      this.invalidate(
        'status',
        'Vital signs entered in error require attribution and reason',
      );
    }

    if (this.supersededByVitalSignId != null) {
      this.invalidate(
        'supersededByVitalSignId',
        'Entered-in-error vital signs cannot reference a replacement',
      );
    }
  }

  if (
    this.supersedesVitalSignId != null &&
    this.supersedesVitalSignId.equals(this._id)
  ) {
    this.invalidate(
      'supersedesVitalSignId',
      'A vital-sign record cannot supersede itself',
    );
  }
});

vitalSignSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    measuredAt: -1,
  },
  {
    name: 'ix_vital_signs_facility_encounter_measured',
  },
);

vitalSignSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    measuredAt: -1,
  },
  {
    name: 'ix_vital_signs_facility_patient_measured',
  },
);

vitalSignSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    measuredAt: -1,
  },
  {
    name: 'ix_vital_signs_facility_admission_measured',
    partialFilterExpression: {
      admissionId: {
        $type: 'objectId',
      },
    },
  },
);

vitalSignSchema.index(
  {
    facilityId: 1,
    observerProviderId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_vital_signs_facility_observer_recorded',
  },
);

vitalSignSchema.index(
  {
    facilityId: 1,
    supersedesVitalSignId: 1,
  },
  {
    name: 'uq_vital_signs_facility_supersedes',
    unique: true,
    partialFilterExpression: {
      supersedesVitalSignId: {
        $type: 'objectId',
      },
    },
  },
);

export type VitalSignDocument =
  InferSchemaType<typeof vitalSignSchema>;

export const VitalSignModel =
  (mongoose.models['vitalSigns'] as
    | Model<VitalSignDocument>
    | undefined) ??
  mongoose.model<VitalSignDocument>(
    'vitalSigns',
    vitalSignSchema,
    'vitalSigns',
  );