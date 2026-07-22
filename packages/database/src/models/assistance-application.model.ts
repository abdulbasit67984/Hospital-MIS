import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  assistanceApplicationStatusValues,
  assistanceApplicationTypeValues,
  assistanceAttachmentPurposeValues,
  assistanceReviewTypeValues,
  eligibilityOutcomeValues,
} from './welfare-zakat.types.js';

import {
  assistanceCommonFields,
  assistanceHash,
  assistanceNonNegativeDecimal,
  assistanceNullableDecimal,
  assistanceObjectIdArray,
  assistanceRequiredEncryptedText,
  assistanceSignedDecimal,
  assistanceStringArray,
  assistanceTimestampedSchemaOptions,
  normalizeAssistanceCode,
  nullableAssistanceObjectId,
  requireAssistanceReason,
  validateAssistanceExpression,
  validateAssistanceMoneyFields,
  validateDistinctObjectIds,
  validateMakerChecker,
} from './welfare-zakat-schema-helpers.js';

const applicationAttachmentSchema = new Schema(
  {
    attachmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    purpose: {
      type: String,
      required: true,
      immutable: true,
      enum: assistanceAttachmentPurposeValues,
    },
    description: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 1_000,
    },
    immutableSnapshotHash: assistanceHash,
  },
  { _id: true, strict: true },
);

export const assistanceApplicationSchema = new Schema(
  {
    ...assistanceCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    duplicateKey: assistanceHash,
    applicationNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    applicationType: {
      type: String,
      required: true,
      immutable: true,
      enum: assistanceApplicationTypeValues,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    guardianId: nullableAssistanceObjectId,
    encounterId: nullableAssistanceObjectId,
    admissionId: nullableAssistanceObjectId,
    invoiceId: nullableAssistanceObjectId,
    claimId: nullableAssistanceObjectId,
    preferredFundId: nullableAssistanceObjectId,
    status: {
      type: String,
      required: true,
      enum: assistanceApplicationStatusValues,
      default: 'DRAFT',
    },
    applicantSnapshotEncrypted: assistanceRequiredEncryptedText,
    householdSnapshotEncrypted: assistanceRequiredEncryptedText,
    employmentSnapshotEncrypted: assistanceRequiredEncryptedText,
    financialConditionSnapshotEncrypted: assistanceRequiredEncryptedText,
    zakatDeclarationSnapshotEncrypted: {
      type: String,
      default: null,
      select: false,
      minlength: 16,
      maxlength: 64_000,
    },
    questionnaireSnapshotEncrypted: assistanceRequiredEncryptedText,
    requestedServicesSnapshotEncrypted: {
      type: String,
      default: null,
      select: false,
      minlength: 16,
      maxlength: 64_000,
    },
    notesEncrypted: {
      type: String,
      default: null,
      select: false,
      minlength: 16,
      maxlength: 64_000,
    },
    attachments: {
      type: [applicationAttachmentSchema],
      required: true,
      default: [],
    },
    householdSize: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    dependantCount: {
      type: Number,
      required: true,
      min: 0,
      max: 99,
    },
    monthlyHouseholdIncome: assistanceNonNegativeDecimal,
    monthlyHouseholdExpenses: assistanceNonNegativeDecimal,
    monthlyDisposableIncome: assistanceSignedDecimal,
    perCapitaIncome: assistanceNonNegativeDecimal,
    requestedAmount: assistanceNullableDecimal,
    recommendedAmount: assistanceNullableDecimal,
    approvedAmount: assistanceNonNegativeDecimal,
    reservedAmount: assistanceNonNegativeDecimal,
    committedAmount: assistanceNonNegativeDecimal,
    utilizedAmount: assistanceNonNegativeDecimal,
    reversedAmount: assistanceNonNegativeDecimal,
    releasedAmount: assistanceNonNegativeDecimal,
    remainingApprovedAmount: assistanceNonNegativeDecimal,
    completenessSatisfied: {
      type: Boolean,
      required: true,
      default: false,
    },
    missingItems: assistanceStringArray,
    eligibilityOutcome: {
      type: String,
      default: null,
      enum: [...eligibilityOutcomeValues, null],
    },
    eligibilitySnapshotId: nullableAssistanceObjectId,
    financialYearCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    assignedToUserId: nullableAssistanceObjectId,
    assignedBy: nullableAssistanceObjectId,
    followUpAt: { type: Date, default: null },
    reviewDeadlineAt: { type: Date, default: null },
    approvalDeadlineAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    submittedBy: nullableAssistanceObjectId,
    expiresAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closedBy: nullableAssistanceObjectId,
    closureReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reopenedAt: { type: Date, default: null },
    reopenedBy: nullableAssistanceObjectId,
    reopenReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: nullableAssistanceObjectId,
    cancellationReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('assistanceApplications'),
);

assistanceApplicationSchema.pre('validate', function () {
  this.applicationNumber = normalizeAssistanceCode(this.applicationNumber);
  this.financialYearCode = normalizeAssistanceCode(this.financialYearCode);
  this.missingItems = this.missingItems.map(normalizeAssistanceCode);

  validateAssistanceMoneyFields(this, [
    'monthlyHouseholdIncome',
    'monthlyHouseholdExpenses',
    'perCapitaIncome',
    'approvedAmount',
    'reservedAmount',
    'committedAmount',
    'utilizedAmount',
    'reversedAmount',
    'releasedAmount',
    'remainingApprovedAmount',
  ]);
  if (this.requestedAmount != null) {
    validateAssistanceMoneyFields(this, ['requestedAmount']);
  }
  if (this.recommendedAmount != null) {
    validateAssistanceMoneyFields(this, ['recommendedAmount']);
  }

  validateAssistanceExpression(
    this,
    'monthlyDisposableIncome',
    ['monthlyHouseholdIncome'],
    ['monthlyHouseholdExpenses'],
    'Monthly disposable income must equal household income less household expenses',
  );
  validateAssistanceExpression(
    this,
    'remainingApprovedAmount',
    ['approvedAmount', 'reversedAmount', 'releasedAmount'],
    ['reservedAmount', 'committedAmount', 'utilizedAmount'],
    'Remaining approved amount does not reconcile with application utilization',
  );

  const attachmentIds = this.attachments.map((item: { attachmentId: unknown }) => item.attachmentId);
  validateDistinctObjectIds(this, 'attachments', attachmentIds);

  if (this.applicationType === 'ZAKAT' && this.zakatDeclarationSnapshotEncrypted == null) {
    this.invalidate(
      'zakatDeclarationSnapshotEncrypted',
      'Zakat applications require an encrypted Zakat declaration snapshot',
    );
  }
  if (this.status !== 'DRAFT' && !this.completenessSatisfied) {
    this.invalidate('completenessSatisfied', 'Only complete applications may leave draft status');
  }
  if (this.completenessSatisfied && this.missingItems.length > 0) {
    this.invalidate('missingItems', 'Complete applications cannot contain missing items');
  }
  if (this.status === 'SUBMITTED' && (this.submittedAt == null || this.submittedBy == null)) {
    this.invalidate('submittedAt', 'Submitted applications require submission metadata');
  }
  if (this.status === 'INFORMATION_REQUESTED' && this.followUpAt == null) {
    this.invalidate('followUpAt', 'Information requests require a follow-up date');
  }
  if (this.status === 'CLOSED') {
    requireAssistanceReason(this, 'closureReason', this.closureReason);
  }
  if (this.status === 'REOPENED') {
    requireAssistanceReason(this, 'reopenReason', this.reopenReason);
  }
  if (this.status === 'CANCELLED') {
    requireAssistanceReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (
    ['ELIGIBLE', 'INELIGIBLE', 'APPROVAL_PENDING', 'APPROVED', 'PARTIALLY_APPROVED'].includes(
      this.status,
    ) &&
    (this.eligibilityOutcome == null || this.eligibilitySnapshotId == null)
  ) {
    this.invalidate(
      'eligibilitySnapshotId',
      'Eligibility-dependent statuses require an immutable eligibility snapshot',
    );
  }
});

assistanceApplicationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_assistance_applications_operation', unique: true },
);
assistanceApplicationSchema.index(
  { facilityId: 1, applicationNumber: 1 },
  { name: 'uq_assistance_applications_number', unique: true },
);
assistanceApplicationSchema.index(
  {
    facilityId: 1,
    duplicateKey: 1,
    status: 1,
  },
  {
    name: 'ix_assistance_applications_duplicate',
    partialFilterExpression: {
      status: {
        $in: [
          'DRAFT',
          'SUBMITTED',
          'UNDER_REVIEW',
          'INFORMATION_REQUESTED',
          'ELIGIBLE',
          'APPROVAL_PENDING',
          'APPROVED',
          'PARTIALLY_APPROVED',
          'REOPENED',
        ],
      },
    },
  },
);
assistanceApplicationSchema.index(
  { facilityId: 1, patientId: 1, createdAt: -1 },
  { name: 'ix_assistance_applications_patient' },
);
assistanceApplicationSchema.index(
  { facilityId: 1, status: 1, assignedToUserId: 1, followUpAt: 1 },
  { name: 'ix_assistance_applications_work_queue' },
);
assistanceApplicationSchema.index(
  { facilityId: 1, expiresAt: 1, status: 1 },
  { name: 'ix_assistance_applications_expiry' },
);

export const assistanceApplicationHistorySchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...assistanceApplicationStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: assistanceApplicationStatusValues,
    },
    applicationVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    snapshotHash: assistanceHash,
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    actorUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    makerUserId: nullableAssistanceObjectId,
    checkerUserId: nullableAssistanceObjectId,
    approvalRequestId: nullableAssistanceObjectId,
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: assistanceHash,
  },
  assistanceTimestampedSchemaOptions('assistanceApplicationHistories'),
);

assistanceApplicationHistorySchema.pre('validate', function () {
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);
  if (this.fromStatus === this.toStatus) {
    this.invalidate('toStatus', 'Application history must change status');
  }
});
assistanceApplicationHistorySchema.index(
  { facilityId: 1, applicationId: 1, applicationVersion: 1 },
  { name: 'uq_assistance_application_histories_version', unique: true },
);
assistanceApplicationHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_assistance_application_histories_hash', unique: true },
);

export const assistanceReviewSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reviewType: {
      type: String,
      required: true,
      immutable: true,
      enum: assistanceReviewTypeValues,
    },
    reviewSequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    outcome: {
      type: String,
      required: true,
      immutable: true,
      enum: eligibilityOutcomeValues,
    },
    assessmentEncrypted: assistanceRequiredEncryptedText,
    findingsEncrypted: assistanceRequiredEncryptedText,
    recommendedFundId: nullableAssistanceObjectId,
    recommendedAmount: assistanceNullableDecimal,
    attachmentIds: {
      ...assistanceObjectIdArray,
      immutable: true,
    },
    reviewerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reviewerStaffId: nullableAssistanceObjectId,
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    reviewedAt: { type: Date, required: true, immutable: true },
    immutableHash: assistanceHash,
  },
  assistanceTimestampedSchemaOptions('assistanceReviews'),
);

assistanceReviewSchema.pre('validate', function () {
  if (this.recommendedAmount != null) {
    validateAssistanceMoneyFields(this, ['recommendedAmount']);
  }
  validateDistinctObjectIds(this, 'attachmentIds', this.attachmentIds);
  if ((this.recommendedFundId == null) !== (this.recommendedAmount == null)) {
    this.invalidate(
      'recommendedAmount',
      'Recommended fund and recommended amount must be supplied together',
    );
  }
});
assistanceReviewSchema.index(
  { facilityId: 1, applicationId: 1, reviewType: 1, reviewSequence: 1 },
  { name: 'uq_assistance_reviews_sequence', unique: true },
);
assistanceReviewSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_assistance_reviews_hash', unique: true },
);

export const eligibilityEvaluationSnapshotSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fundId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    applicationVersion: { type: Number, required: true, immutable: true, min: 0 },
    fundVersion: { type: Number, required: true, immutable: true, min: 0 },
    outcome: {
      type: String,
      required: true,
      immutable: true,
      enum: eligibilityOutcomeValues,
    },
    eligible: { type: Boolean, required: true, immutable: true },
    manualReviewRequired: { type: Boolean, required: true, immutable: true },
    matchedRuleCodes: {
      ...assistanceStringArray,
      immutable: true,
    },
    failedRuleCodes: {
      ...assistanceStringArray,
      immutable: true,
    },
    reasons: {
      ...assistanceStringArray,
      immutable: true,
    },
    contextHash: assistanceHash,
    evaluatedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    evaluatedAt: { type: Date, required: true, immutable: true },
    transactionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    correlationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 200,
    },
    immutableHash: assistanceHash,
  },
  assistanceTimestampedSchemaOptions('eligibilityEvaluationSnapshots'),
);

eligibilityEvaluationSnapshotSchema.pre('validate', function () {
  this.matchedRuleCodes = this.matchedRuleCodes.map(normalizeAssistanceCode);
  this.failedRuleCodes = this.failedRuleCodes.map(normalizeAssistanceCode);
  if (this.outcome === 'ELIGIBLE' && (!this.eligible || this.manualReviewRequired)) {
    this.invalidate('eligible', 'ELIGIBLE snapshots must be eligible without manual review');
  }
  if (this.outcome === 'INELIGIBLE' && this.eligible) {
    this.invalidate('eligible', 'INELIGIBLE snapshots cannot be eligible');
  }
  if (this.outcome === 'MANUAL_REVIEW' && !this.manualReviewRequired) {
    this.invalidate('manualReviewRequired', 'MANUAL_REVIEW requires manual review');
  }
});
eligibilityEvaluationSnapshotSchema.index(
  {
    facilityId: 1,
    applicationId: 1,
    fundId: 1,
    applicationVersion: 1,
    fundVersion: 1,
    contextHash: 1,
  },
  { name: 'uq_eligibility_evaluation_snapshots_context', unique: true },
);
eligibilityEvaluationSnapshotSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_eligibility_evaluation_snapshots_hash', unique: true },
);

export type AssistanceApplication = InferSchemaType<typeof assistanceApplicationSchema>;
export type AssistanceApplicationHistory = InferSchemaType<
  typeof assistanceApplicationHistorySchema
>;
export type AssistanceReview = InferSchemaType<typeof assistanceReviewSchema>;
export type EligibilityEvaluationSnapshot = InferSchemaType<
  typeof eligibilityEvaluationSnapshotSchema
>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const AssistanceApplicationModel = modelFor(
  'assistanceApplications',
  assistanceApplicationSchema,
);
export const AssistanceApplicationHistoryModel = modelFor(
  'assistanceApplicationHistories',
  assistanceApplicationHistorySchema,
);
export const AssistanceReviewModel = modelFor('assistanceReviews', assistanceReviewSchema);
export const EligibilityEvaluationSnapshotModel = modelFor(
  'eligibilityEvaluationSnapshots',
  eligibilityEvaluationSnapshotSchema,
);