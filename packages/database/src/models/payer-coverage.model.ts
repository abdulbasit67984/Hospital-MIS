import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  coverageEnrollmentStatusValues,
  coverageLimitPeriodValues,
  coveragePriorityValues,
  coverageRuleEffectValues,
  coverageVerificationStatusValues,
  panelProgramTypeValues,
  payerOrganizationTypeValues,
  payerRecordStatusValues,
  preauthorizationStatusValues,
} from './panels-packages-coverage.types.js';

import {
  normalizePpcCode,
  nullablePpcObjectId,
  ppcCommonFields,
  ppcNonNegativeDecimal,
  ppcNullableDecimal,
  ppcObjectIdArray,
  ppcStringArray,
  ppcTimestampedSchemaOptions,
  requirePpcReason,
  validatePpcEffectiveWindow,
  validatePpcNonNegativeDecimal,
  validatePpcPercentage,
} from './panels-packages-coverage-schema-helpers.js';

export const payerOrganizationSchema = new Schema(
  {
    ...ppcCommonFields,
    organizationCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    organizationType: {
      type: String,
      required: true,
      enum: payerOrganizationTypeValues,
    },
    registrationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    contactEmail: {
      type: String,
      default: null,
      trim: true,
      maxlength: 320,
    },
    contactPhone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 40,
    },
    status: {
      type: String,
      required: true,
      enum: payerRecordStatusValues,
      default: 'DRAFT',
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  ppcTimestampedSchemaOptions('payerOrganizations'),
);

payerOrganizationSchema.pre('validate', function () {
  this.organizationCode = normalizePpcCode(this.organizationCode);
});

payerOrganizationSchema.index(
  { facilityId: 1, organizationCode: 1 },
  { name: 'uq_payer_organizations_facility_code', unique: true },
);
payerOrganizationSchema.index(
  { facilityId: 1, organizationType: 1, status: 1, name: 1 },
  { name: 'ix_payer_organizations_type_status' },
);

export const panelProgramSchema = new Schema(
  {
    ...ppcCommonFields,
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    programCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    programType: {
      type: String,
      required: true,
      enum: panelProgramTypeValues,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: payerRecordStatusValues,
      default: 'DRAFT',
    },
  },
  ppcTimestampedSchemaOptions('panelPrograms'),
);

panelProgramSchema.pre('validate', function () {
  this.programCode = normalizePpcCode(this.programCode);
  validatePpcEffectiveWindow(this, 'effectiveFrom', 'effectiveThrough');
});

panelProgramSchema.index(
  { facilityId: 1, payerOrganizationId: 1, programCode: 1 },
  { name: 'uq_panel_programs_payer_code', unique: true },
);

const coverageRuleSchema = new Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    effect: {
      type: String,
      required: true,
      enum: coverageRuleEffectValues,
    },
    chargeCatalogItemId: nullablePpcObjectId,
    chargeCategoryId: nullablePpcObjectId,
    departmentId: nullablePpcObjectId,
    limitPeriod: {
      type: String,
      default: null,
      enum: [...coverageLimitPeriodValues, null],
    },
    limitQuantity: ppcNullableDecimal,
    limitAmount: ppcNullableDecimal,
    waitingPeriodDays: {
      type: Number,
      required: true,
      min: 0,
      max: 36_500,
      default: 0,
    },
    networkCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    preauthorizationRequired: {
      type: Boolean,
      required: true,
      default: false,
    },
    priority: {
      type: Number,
      required: true,
      min: 0,
      default: 100,
    },
  },
  { _id: true, strict: true },
);

export const panelPlanSchema = new Schema(
  {
    ...ppcCommonFields,
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    panelProgramId: nullablePpcObjectId,
    planCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    deductibleAmount: ppcNonNegativeDecimal,
    copaymentAmount: ppcNonNegativeDecimal,
    coinsurancePercentage: ppcNonNegativeDecimal,
    coveragePercentage: ppcNonNegativeDecimal,
    annualLimit: ppcNullableDecimal,
    lifetimeLimit: ppcNullableDecimal,
    networkCodes: ppcStringArray,
    rules: {
      type: [coverageRuleSchema],
      required: true,
      default: [],
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: payerRecordStatusValues,
      default: 'DRAFT',
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  ppcTimestampedSchemaOptions('panelPlans'),
);

panelPlanSchema.pre('validate', function () {
  this.planCode = normalizePpcCode(this.planCode);
  validatePpcNonNegativeDecimal(
    this,
    'deductibleAmount',
    this.deductibleAmount,
  );
  validatePpcNonNegativeDecimal(
    this,
    'copaymentAmount',
    this.copaymentAmount,
  );
  validatePpcPercentage(
    this,
    'coinsurancePercentage',
    this.coinsurancePercentage,
  );
  validatePpcPercentage(
    this,
    'coveragePercentage',
    this.coveragePercentage,
  );
  if (this.annualLimit != null) {
    validatePpcNonNegativeDecimal(this, 'annualLimit', this.annualLimit);
  }
  if (this.lifetimeLimit != null) {
    validatePpcNonNegativeDecimal(
      this,
      'lifetimeLimit',
      this.lifetimeLimit,
    );
  }
  validatePpcEffectiveWindow(this, 'effectiveFrom', 'effectiveThrough');
});

panelPlanSchema.index(
  { facilityId: 1, payerOrganizationId: 1, planCode: 1 },
  { name: 'uq_panel_plans_payer_code', unique: true },
);
panelPlanSchema.index(
  { facilityId: 1, status: 1, effectiveFrom: -1 },
  { name: 'ix_panel_plans_status_effective' },
);

export const patientCoverageSchema = new Schema(
  {
    ...ppcCommonFields,
    coverageNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    panelPlanId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    priority: {
      type: String,
      required: true,
      enum: coveragePriorityValues,
    },
    policyReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    membershipReferenceEncrypted: {
      type: String,
      default: null,
      select: false,
    },
    membershipReferenceHash: {
      type: String,
      default: null,
      select: false,
    },
    employerReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    authorizationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    eligibleFrom: {
      type: Date,
      required: true,
    },
    eligibleThrough: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: coverageEnrollmentStatusValues,
      default: 'PENDING_VERIFICATION',
    },
    lastVerificationId: nullablePpcObjectId,
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: nullablePpcObjectId,
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: nullablePpcObjectId,
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('patientCoverages'),
);

patientCoverageSchema.pre('validate', function () {
  this.coverageNumber = normalizePpcCode(this.coverageNumber);
  validatePpcEffectiveWindow(this, 'eligibleFrom', 'eligibleThrough');

  if (this.status === 'SUSPENDED') {
    requirePpcReason(this, 'suspensionReason', this.suspensionReason);
  }

  if (this.status === 'CANCELLED') {
    requirePpcReason(this, 'cancellationReason', this.cancellationReason);
  }
});

patientCoverageSchema.index(
  { facilityId: 1, coverageNumber: 1 },
  { name: 'uq_patient_coverages_facility_number', unique: true },
);
patientCoverageSchema.index(
  { facilityId: 1, patientId: 1, priority: 1, status: 1 },
  { name: 'ix_patient_coverages_patient_priority' },
);
patientCoverageSchema.index(
  { facilityId: 1, membershipReferenceHash: 1 },
  { name: 'ix_patient_coverages_membership_hash', sparse: true },
);

export const patientCoverageVerificationSchema = new Schema(
  {
    ...ppcCommonFields,
    patientCoverageId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: coverageVerificationStatusValues,
    },
    verifiedFrom: {
      type: Date,
      required: true,
      immutable: true,
    },
    verifiedThrough: {
      type: Date,
      default: null,
      immutable: true,
    },
    verificationReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    responseSnapshot: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
  },
  ppcTimestampedSchemaOptions('patientCoverageVerifications'),
);

patientCoverageVerificationSchema.index(
  { facilityId: 1, patientCoverageId: 1, createdAt: -1 },
  { name: 'ix_patient_coverage_verifications_history' },
);

export const preauthorizationSchema = new Schema(
  {
    ...ppcCommonFields,
    authorizationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientCoverageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    encounterId: nullablePpcObjectId,
    admissionId: nullablePpcObjectId,
    chargeCatalogItemIds: ppcObjectIdArray,
    requestedAmount: ppcNonNegativeDecimal,
    approvedAmount: ppcNonNegativeDecimal,
    validFrom: {
      type: Date,
      required: true,
    },
    validThrough: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: preauthorizationStatusValues,
      default: 'DRAFT',
    },
    externalReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    denialReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    supportingAttachmentIds: ppcObjectIdArray,
  },
  ppcTimestampedSchemaOptions('preauthorizations'),
);

preauthorizationSchema.pre('validate', function () {
  this.authorizationNumber = normalizePpcCode(this.authorizationNumber);
  validatePpcNonNegativeDecimal(
    this,
    'requestedAmount',
    this.requestedAmount,
  );
  validatePpcNonNegativeDecimal(
    this,
    'approvedAmount',
    this.approvedAmount,
  );
  validatePpcEffectiveWindow(this, 'validFrom', 'validThrough');

  if (this.status === 'DENIED') {
    requirePpcReason(this, 'denialReason', this.denialReason);
  }
});

preauthorizationSchema.index(
  { facilityId: 1, authorizationNumber: 1 },
  { name: 'uq_preauthorizations_facility_number', unique: true },
);
preauthorizationSchema.index(
  { facilityId: 1, patientCoverageId: 1, status: 1, validThrough: 1 },
  { name: 'ix_preauthorizations_coverage_status' },
);

export type PayerOrganization = InferSchemaType<
  typeof payerOrganizationSchema
>;
export type PanelProgram = InferSchemaType<typeof panelProgramSchema>;
export type PanelPlan = InferSchemaType<typeof panelPlanSchema>;
export type PatientCoverage = InferSchemaType<
  typeof patientCoverageSchema
>;
export type PatientCoverageVerification = InferSchemaType<
  typeof patientCoverageVerificationSchema
>;
export type Preauthorization = InferSchemaType<
  typeof preauthorizationSchema
>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const PayerOrganizationModel = modelFor(
  'payerOrganizations',
  payerOrganizationSchema,
);
export const PanelProgramModel = modelFor(
  'panelPrograms',
  panelProgramSchema,
);
export const PanelPlanModel = modelFor('panelPlans', panelPlanSchema);
export const PatientCoverageModel = modelFor(
  'patientCoverages',
  patientCoverageSchema,
);
export const PatientCoverageVerificationModel = modelFor(
  'patientCoverageVerifications',
  patientCoverageVerificationSchema,
);
export const PreauthorizationModel = modelFor(
  'preauthorizations',
  preauthorizationSchema,
);