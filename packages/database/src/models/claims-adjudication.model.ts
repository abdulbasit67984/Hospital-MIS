import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingDecimalExpressionEquals,
  normalizeBillingCode,
} from './billing-schema-helpers.js';

import {
  claimAdjudicationDecisionValues,
  claimAppealStatusValues,
  claimDenialCategoryValues,
  claimSubmissionChannelValues,
} from './claims.types.js';

import {
  claimCommonFields,
  claimEncryptedText,
  claimHash,
  claimNonNegativeDecimal,
  claimObjectIdArray,
  claimTimestampedSchemaOptions,
  compareClaimDecimals,
  nullableClaimObjectId,
  requireClaimReason,
  validateClaimMoneyFields,
} from './claims-schema-helpers.js';

const claimAdjudicationLineSchema = new Schema(
  {
    claimLineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    decision: {
      type: String,
      required: true,
      immutable: true,
      enum: claimAdjudicationDecisionValues,
    },
    claimedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    approvedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    deniedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    disallowedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    returnedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    contractualAdjustmentAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    payerLineReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    denialCategory: {
      type: String,
      default: null,
      immutable: true,
      enum: [...claimDenialCategoryValues, null],
    },
    reasonCode: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    reasonDescription: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
    },
  },
  {
    _id: true,
    strict: true,
  },
);

claimAdjudicationLineSchema.pre(
  'validate',
  function validateAdjudicationLine() {
    validateClaimMoneyFields(this, [
      'claimedAmount',
      'approvedAmount',
      'deniedAmount',
      'disallowedAmount',
      'returnedAmount',
      'contractualAdjustmentAmount',
    ]);

    try {
      if (
        !billingDecimalExpressionEquals(
          [
            this.approvedAmount,
            this.deniedAmount,
            this.disallowedAmount,
            this.returnedAmount,
          ],
          [],
          this.claimedAmount,
        )
      ) {
        this.invalidate(
          'approvedAmount',
          'Adjudication amounts must reconcile to the claimed line amount',
        );
      }

      if (
        compareClaimDecimals(
          this.contractualAdjustmentAmount,
          this.approvedAmount,
        ) > 0
      ) {
        this.invalidate(
          'contractualAdjustmentAmount',
          'Contractual adjustment cannot exceed the approved amount',
        );
      }
    } catch (error) {
      this.invalidate(
        'claimedAmount',
        error instanceof Error
          ? error.message
          : 'Adjudication amounts must be valid decimals',
      );
    }

    if (
      ['DENIED', 'REJECTED', 'RETURNED'].includes(this.decision) &&
      this.reasonDescription == null
    ) {
      this.invalidate(
        'reasonDescription',
        'Adverse adjudication decisions require a reason',
      );
    }
  },
);

export const claimAdjudicationSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    adjudicationSequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    payerReferenceNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 240,
    },
    decisionReference: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    claimedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    approvedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    deniedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    disallowedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    returnedAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    contractualAdjustmentAmount: {
      ...claimNonNegativeDecimal,
      immutable: true,
    },
    lines: {
      type: [claimAdjudicationLineSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (values: readonly unknown[]) =>
          values.length >= 1 && values.length <= 5_000,
        message: 'Adjudications require between 1 and 5,000 lines',
      },
    },
    explanationOfBenefitsAttachmentId: nullableClaimObjectId,
    notesEncrypted: {
      ...claimEncryptedText,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    adjudicatedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    immutableHash: claimHash,
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableClaimObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claimAdjudications'),
);

claimAdjudicationSchema.pre(
  'validate',
  function validateClaimAdjudication() {
    validateClaimMoneyFields(this, [
      'claimedAmount',
      'approvedAmount',
      'deniedAmount',
      'disallowedAmount',
      'returnedAmount',
      'contractualAdjustmentAmount',
    ]);

    const lineIds = this.lines.map((line) => String(line.claimLineId));
    if (new Set(lineIds).size !== lineIds.length) {
      this.invalidate(
        'lines',
        'An adjudication can include each claim line only once',
      );
    }

    try {
      if (
        !billingDecimalExpressionEquals(
          [
            this.approvedAmount,
            this.deniedAmount,
            this.disallowedAmount,
            this.returnedAmount,
          ],
          [],
          this.claimedAmount,
        )
      ) {
        this.invalidate(
          'approvedAmount',
          'Adjudication totals must reconcile to the claimed amount',
        );
      }

      if (
        compareClaimDecimals(
          this.contractualAdjustmentAmount,
          this.approvedAmount,
        ) > 0
      ) {
        this.invalidate(
          'contractualAdjustmentAmount',
          'Contractual adjustment cannot exceed the approved amount',
        );
      }
    } catch (error) {
      this.invalidate(
        'claimedAmount',
        error instanceof Error
          ? error.message
          : 'Adjudication totals must contain valid decimals',
      );
    }

    if (this.reversedAt != null) {
      requireClaimReason(this, 'reversalReason', this.reversalReason);
      if (this.reversedBy == null) {
        this.invalidate(
          'reversedBy',
          'Reversed adjudications require an actor',
        );
      }
    }
  },
);

claimAdjudicationSchema.index(
  { facilityId: 1, claimId: 1, adjudicationSequence: 1 },
  { name: 'uq_claim_adjudications_sequence', unique: true },
);
claimAdjudicationSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_claim_adjudications_hash', unique: true },
);
claimAdjudicationSchema.index(
  { facilityId: 1, payerReferenceNumber: 1, recordedAt: -1 },
  { name: 'ix_claim_adjudications_payer_reference' },
);

export const claimDenialSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    adjudicationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    category: {
      type: String,
      required: true,
      enum: claimDenialCategoryValues,
    },
    reasonCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    reasonDescription: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4_000,
    },
    deniedAmount: claimNonNegativeDecimal,
    appealEligible: {
      type: Boolean,
      required: true,
      default: false,
    },
    appealDeadline: {
      type: Date,
      default: null,
    },
    resolved: {
      type: Boolean,
      required: true,
      default: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: nullableClaimObjectId,
    resolution: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claimDenials'),
);

claimDenialSchema.pre('validate', function validateClaimDenial() {
  validateClaimMoneyFields(this, ['deniedAmount']);

  if (this.appealEligible && this.appealDeadline == null) {
    this.invalidate(
      'appealDeadline',
      'Appeal-eligible denials require an appeal deadline',
    );
  }

  if (this.resolved) {
    if (this.resolvedAt == null || this.resolvedBy == null) {
      this.invalidate(
        'resolvedAt',
        'Resolved denials require resolution actor and timestamp',
      );
    }
    requireClaimReason(this, 'resolution', this.resolution);
  }
});

claimDenialSchema.index(
  {
    facilityId: 1,
    adjudicationId: 1,
    claimLineId: 1,
    category: 1,
  },
  { name: 'uq_claim_denials_adjudication_line_category', unique: true },
);
claimDenialSchema.index(
  {
    facilityId: 1,
    resolved: 1,
    appealEligible: 1,
    appealDeadline: 1,
  },
  { name: 'ix_claim_denials_appeal_deadline' },
);
claimDenialSchema.index(
  { facilityId: 1, category: 1, createdAt: -1 },
  { name: 'ix_claim_denials_category' },
);

export const claimAppealSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    appealNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    denialIds: {
      ...claimObjectIdArray,
      validate: {
        validator: (values: readonly unknown[]) => values.length >= 1,
        message: 'Appeals require at least one denial',
      },
    },
    status: {
      type: String,
      required: true,
      enum: claimAppealStatusValues,
      default: 'DRAFT',
    },
    appealDeadline: {
      type: Date,
      required: true,
    },
    groundsEncrypted: {
      type: String,
      required: true,
      select: false,
      maxlength: 64_000,
    },
    requestedAmount: claimNonNegativeDecimal,
    approvedAdditionalAmount: claimNonNegativeDecimal,
    evidenceAttachmentIds: {
      ...claimObjectIdArray,
      validate: {
        validator: (values: readonly unknown[]) => values.length <= 100,
        message: 'Appeals can include at most 100 evidence attachments',
      },
    },
    approvalRequestId: nullableClaimObjectId,
    approvedBy: nullableClaimObjectId,
    approvedAt: {
      type: Date,
      default: null,
    },
    submissionChannel: {
      type: String,
      default: null,
      enum: [...claimSubmissionChannelValues, null],
    },
    submissionReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    payerDecisionReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    assignedToUserId: nullableClaimObjectId,
    submittedAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  claimTimestampedSchemaOptions('claimAppeals'),
);

claimAppealSchema.pre('validate', function validateClaimAppeal() {
  this.appealNumber = normalizeBillingCode(this.appealNumber);
  validateClaimMoneyFields(this, [
    'requestedAmount',
    'approvedAdditionalAmount',
  ]);

  if (new Set(this.denialIds.map(String)).size !== this.denialIds.length) {
    this.invalidate(
      'denialIds',
      'Appeal denial identifiers cannot contain duplicates',
    );
  }

  if (
    compareClaimDecimals(
      this.approvedAdditionalAmount,
      this.requestedAmount,
    ) > 0
  ) {
    this.invalidate(
      'approvedAdditionalAmount',
      'Approved additional amount cannot exceed the appeal request',
    );
  }

  if (
    [
      'APPROVED_FOR_SUBMISSION',
      'SUBMITTED',
      'ACKNOWLEDGED',
      'UNDER_REVIEW',
      'UPHELD',
      'OVERTURNED',
      'PARTIALLY_OVERTURNED',
      'CLOSED',
    ].includes(this.status) &&
    (this.approvedBy == null || this.approvedAt == null)
  ) {
    this.invalidate(
      'approvedBy',
      'Approved appeal workflows require checker metadata',
    );
  }

  if (
    ['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW'].includes(this.status) &&
    (this.submissionChannel == null || this.submissionReference == null)
  ) {
    this.invalidate(
      'submissionReference',
      'Submitted appeals require a channel and submission reference',
    );
  }
});

claimAppealSchema.index(
  { facilityId: 1, appealNumber: 1 },
  { name: 'uq_claim_appeals_number', unique: true },
);
claimAppealSchema.index(
  { facilityId: 1, claimId: 1, status: 1, createdAt: -1 },
  { name: 'ix_claim_appeals_claim_status' },
);
claimAppealSchema.index(
  {
    facilityId: 1,
    assignedToUserId: 1,
    status: 1,
    appealDeadline: 1,
  },
  { name: 'ix_claim_appeals_assignment_deadline' },
);

export type ClaimAdjudication = InferSchemaType<
  typeof claimAdjudicationSchema
>;
export type ClaimDenial = InferSchemaType<typeof claimDenialSchema>;
export type ClaimAppeal = InferSchemaType<typeof claimAppealSchema>;

function modelFor<T>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ClaimAdjudicationModel = modelFor(
  'claimAdjudications',
  claimAdjudicationSchema,
);
export const ClaimDenialModel = modelFor(
  'claimDenials',
  claimDenialSchema,
);
export const ClaimAppealModel = modelFor(
  'claimAppeals',
  claimAppealSchema,
);