mport mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const clinicalReferralTypeValues = [
  'INTERNAL_CONSULTATION',
  'EXTERNAL_REFERRAL',
  'TRANSFER_OF_CARE',
] as const;

export const clinicalReferralPriorityValues = [
  'ROUTINE',
  'URGENT',
  'EMERGENCY',
] as const;

export const clinicalReferralStatusValues = [
  'REQUESTED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
  'CORRECTED',
] as const;

export const clinicalReferralChangeTypeValues = [
  'CREATED',
  'ACCEPTED',
  'STARTED',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
  'CORRECTED',
] as const;

export type ClinicalReferralType =
  (typeof clinicalReferralTypeValues)[number];

export type ClinicalReferralPriority =
  (typeof clinicalReferralPriorityValues)[number];

export type ClinicalReferralStatus =
  (typeof clinicalReferralStatusValues)[number];

export type ClinicalReferralChangeType =
  (typeof clinicalReferralChangeTypeValues)[number];

const referralTargetSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    externalOrganization: {
      type: String,
      default: null,
      trim: true,
      minlength: 2,
      maxlength: 500,
      immutable: true,
    },
    externalProviderName: {
      type: String,
      default: null,
      trim: true,
      minlength: 2,
      maxlength: 300,
      immutable: true,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const clinicalReferralSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    referralNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    referralVersion: {
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
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceEncounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceClinicalNoteId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    requestingProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    assignedProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    referralType: {
      type: String,
      required: true,
      enum: clinicalReferralTypeValues,
      immutable: true,
    },
    priority: {
      type: String,
      required: true,
      enum: clinicalReferralPriorityValues,
      immutable: true,
      default: 'ROUTINE',
    },
    status: {
      type: String,
      required: true,
      enum: clinicalReferralStatusValues,
      immutable: true,
    },
    changeType: {
      type: String,
      required: true,
      enum: clinicalReferralChangeTypeValues,
      immutable: true,
    },
    target: {
      type: referralTargetSchema,
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 10_000,
      select: false,
    },
    clinicalQuestion: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
    responseSummary: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 20_000,
      select: false,
    },
    decisionReason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 5_000,
      select: false,
    },
    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    startedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    completedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    declinedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    changedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    correctionReason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      minlength: 3,
      maxlength: 5_000,
      select: false,
    },
    replacesVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    collection: 'clinicalReferrals',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

clinicalReferralSchema.pre('validate', function validateClinicalReferral() {
  if (this.version !== this.referralVersion - 1) {
    this.invalidate(
      'version',
      'version must equal referralVersion minus one for append-only optimistic concurrency',
    );
  }

  if (this.referralVersion === 1 && this.previousVersionId != null) {
    this.invalidate(
      'previousVersionId',
      'The first referral version cannot reference a previous version',
    );
  }

  if (this.referralVersion > 1 && this.previousVersionId == null) {
    this.invalidate(
      'previousVersionId',
      'Subsequent referral versions require previousVersionId',
    );
  }

  const target = this.target;
  const hasInternalTarget =
    target.facilityId != null ||
    target.departmentId != null ||
    target.clinicId != null ||
    target.servicePointId != null ||
    target.providerId != null;
  const hasExternalTarget =
    target.externalOrganization != null ||
    target.externalProviderName != null;

  if (this.referralType === 'EXTERNAL_REFERRAL') {
    if (!hasExternalTarget || hasInternalTarget) {
      this.invalidate(
        'target',
        'External referrals require an external target and cannot contain internal assignment fields',
      );
    }
  } else if (
    target.facilityId == null ||
    target.departmentId == null ||
    !hasInternalTarget ||
    hasExternalTarget
  ) {
    this.invalidate(
      'target',
      'Internal consultation or transfer referrals require facility and department targets and cannot contain external target fields',
    );
  }

  const expectedChangeByStatus: Record<ClinicalReferralStatus, ClinicalReferralChangeType> = {
    REQUESTED: 'CREATED',
    ACCEPTED: 'ACCEPTED',
    IN_PROGRESS: 'STARTED',
    COMPLETED: 'COMPLETED',
    DECLINED: 'DECLINED',
    CANCELLED: 'CANCELLED',
    CORRECTED: 'CORRECTED',
  };

  if (expectedChangeByStatus[this.status] !== this.changeType) {
    this.invalidate(
      'changeType',
      `changeType ${this.changeType} does not match referral status ${this.status}`,
    );
  }

  if (['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(this.status)) {
    if (
      this.assignedProviderId == null &&
      this.target.providerId == null &&
      this.target.externalProviderName == null
    ) {
      this.invalidate(
        'assignedProviderId',
        'Accepted, in-progress, or completed referrals require a provider assignment',
      );
    }
  }

  if (this.status === 'ACCEPTED' && this.acceptedAt == null) {
    this.invalidate('acceptedAt', 'Accepted referrals require acceptedAt');
  }

  if (
    this.status === 'IN_PROGRESS' &&
    (this.acceptedAt == null || this.startedAt == null)
  ) {
    this.invalidate(
      'startedAt',
      'In-progress referrals require acceptedAt and startedAt',
    );
  }

  if (
    this.status === 'COMPLETED' &&
    (this.acceptedAt == null ||
      this.startedAt == null ||
      this.completedAt == null ||
      this.responseSummary == null)
  ) {
    this.invalidate(
      'completedAt',
      'Completed referrals require acceptance, start, completion, and a response summary',
    );
  }

  if (this.status === 'DECLINED') {
    if (this.declinedAt == null || this.decisionReason == null) {
      this.invalidate(
        'declinedAt',
        'Declined referrals require declinedAt and a decision reason',
      );
    }
  }

  if (this.status === 'CANCELLED') {
    if (this.cancelledAt == null || this.decisionReason == null) {
      this.invalidate(
        'cancelledAt',
        'Cancelled referrals require cancelledAt and a decision reason',
      );
    }
  }

  if (this.status === 'CORRECTED') {
    if (this.correctionReason == null || this.replacesVersionId == null) {
      this.invalidate(
        'correctionReason',
        'Corrected referral versions require a correction reason and replaced version reference',
      );
    }
  }

  if (this.changedAt < this.requestedAt) {
    this.invalidate('changedAt', 'changedAt cannot precede requestedAt');
  }
});

clinicalReferralSchema.index(
  {
    facilityId: 1,
    referralNumber: 1,
    referralVersion: 1,
  },
  {
    name: 'uq_clinical_referrals_number_version',
    unique: true,
  },
);

clinicalReferralSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    requestedAt: -1,
  },
  {
    name: 'ix_clinical_referrals_patient_requested',
  },
);

clinicalReferralSchema.index(
  {
    facilityId: 1,
    sourceEncounterId: 1,
    referralVersion: -1,
  },
  {
    name: 'ix_clinical_referrals_encounter_version',
  },
);

clinicalReferralSchema.index(
  {
    facilityId: 1,
    assignedProviderId: 1,
    status: 1,
    priority: 1,
    changedAt: -1,
  },
  {
    name: 'ix_clinical_referrals_assignee_status_priority',
  },
);

clinicalReferralSchema.index(
  {
    facilityId: 1,
    'target.departmentId': 1,
    status: 1,
    changedAt: -1,
  },
  {
    name: 'ix_clinical_referrals_target_department_status',
  },
);

export type ClinicalReferralDocument =
  InferSchemaType<typeof clinicalReferralSchema>;

export const ClinicalReferralModel =
  (mongoose.models['clinicalReferrals'] as
    | Model<ClinicalReferralDocument>
    | undefined) ??
  mongoose.model<ClinicalReferralDocument>(
    'clinicalReferrals',
    clinicalReferralSchema,
    'clinicalReferrals',
  );