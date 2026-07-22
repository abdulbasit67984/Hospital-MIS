import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  normalizeBillingCode,
} from './billing-schema-helpers.js';

import {
  claimBatchStatusValues,
  claimStatusValues,
  claimSubmissionChannelValues,
  claimSubmissionStatusValues,
  claimVersionTypeValues,
  claimWorkQueueStatusValues,
  claimWorkQueueTypeValues,
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

export const claimStatusHistorySchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...claimStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: claimStatusValues,
    },
    reason: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 4_000,
    },
    payerReasonCode: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    payerReasonDescription: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 2_000,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    makerUserId: nullableClaimObjectId,
    checkerUserId: nullableClaimObjectId,
    approvalRequestId: nullableClaimObjectId,
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    immutableHash: claimHash,
  },
  claimTimestampedSchemaOptions('claimStatusHistories'),
);

claimStatusHistorySchema.pre('validate', function validateStatusHistory() {
  if (this.fromStatus === this.toStatus) {
    this.invalidate(
      'toStatus',
      'Claim status history must change the status',
    );
  }

  if (
    [
      'DENIED',
      'REJECTED',
      'RETURNED',
      'CANCELLED',
      'REVERSED',
      'VOIDED',
    ].includes(this.toStatus)
  ) {
    requireClaimReason(this, 'reason', this.reason);
  }

  if (
    this.checkerUserId != null &&
    this.makerUserId != null &&
    this.checkerUserId.equals(this.makerUserId)
  ) {
    this.invalidate(
      'checkerUserId',
      'Maker and checker must be different users',
    );
  }
});

claimStatusHistorySchema.index(
  { facilityId: 1, claimId: 1, occurredAt: 1 },
  { name: 'ix_claim_status_histories_claim' },
);
claimStatusHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_claim_status_histories_hash', unique: true },
);

export const claimVersionHistorySchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    versionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    versionType: {
      type: String,
      required: true,
      immutable: true,
      enum: claimVersionTypeValues,
    },
    priorClaimId: nullableClaimObjectId,
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    snapshotHash: claimHash,
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 4_000,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  claimTimestampedSchemaOptions('claimVersionHistories'),
);

claimVersionHistorySchema.pre('validate', function normalizeVersionNumber() {
  this.claimNumber = normalizeBillingCode(this.claimNumber);
});

claimVersionHistorySchema.index(
  { facilityId: 1, claimId: 1, versionNumber: 1 },
  { name: 'uq_claim_version_histories_number', unique: true },
);
claimVersionHistorySchema.index(
  { facilityId: 1, snapshotHash: 1 },
  { name: 'uq_claim_version_histories_hash', unique: true },
);

export const claimBatchSchema = new Schema(
  {
    ...claimCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    batchNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    panelPlanId: nullableClaimObjectId,
    submissionChannel: {
      type: String,
      required: true,
      enum: claimSubmissionChannelValues,
    },
    destinationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    clearinghouseReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    status: {
      type: String,
      required: true,
      enum: claimBatchStatusValues,
      default: 'DRAFT',
    },
    claimIds: {
      ...claimObjectIdArray,
      validate: {
        validator: (values: readonly unknown[]) =>
          values.length >= 1 && values.length <= 5_000,
        message: 'Claim batches require between 1 and 5,000 claims',
      },
    },
    claimCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5_000,
    },
    claimedAmount: claimNonNegativeDecimal,
    approvedAmount: claimNonNegativeDecimal,
    paidAmount: claimNonNegativeDecimal,
    submissionStatus: {
      type: String,
      default: null,
      enum: [...claimSubmissionStatusValues, null],
    },
    approvalRequestId: nullableClaimObjectId,
    approvedBy: nullableClaimObjectId,
    approvedAt: {
      type: Date,
      default: null,
    },
    submittedBy: nullableClaimObjectId,
    submittedAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    notesEncrypted: claimEncryptedText,
  },
  claimTimestampedSchemaOptions('claimBatches'),
);

claimBatchSchema.pre('validate', function validateClaimBatch() {
  this.batchNumber = normalizeBillingCode(this.batchNumber);
  validateClaimMoneyFields(this, [
    'claimedAmount',
    'approvedAmount',
    'paidAmount',
  ]);

  if (new Set(this.claimIds.map(String)).size !== this.claimIds.length) {
    this.invalidate(
      'claimIds',
      'A claim can occur only once in a submission batch',
    );
  }

  if (this.claimCount !== this.claimIds.length) {
    this.invalidate(
      'claimCount',
      'Claim count must equal the number of claim identifiers',
    );
  }

  try {
    if (
      compareClaimDecimals(this.paidAmount, this.approvedAmount) > 0
    ) {
      this.invalidate(
        'paidAmount',
        'Batch paid amount cannot exceed the approved amount',
      );
    }
  } catch (error) {
    this.invalidate(
      'claimedAmount',
      error instanceof Error
        ? error.message
        : 'Batch financial values must be valid decimals',
    );
  }

  if (
    ['APPROVED', 'SUBMISSION_PENDING', 'SUBMITTED'].includes(this.status) &&
    (this.approvedBy == null || this.approvedAt == null)
  ) {
    this.invalidate(
      'approvedBy',
      'Approved or submitted claim batches require checker approval metadata',
    );
  }
});

claimBatchSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_claim_batches_operation', unique: true },
);
claimBatchSchema.index(
  { facilityId: 1, batchNumber: 1 },
  { name: 'uq_claim_batches_number', unique: true },
);
claimBatchSchema.index(
  {
    facilityId: 1,
    payerOrganizationId: 1,
    status: 1,
    createdAt: -1,
  },
  { name: 'ix_claim_batches_payer_status' },
);
claimBatchSchema.index(
  { facilityId: 1, claimIds: 1 },
  { name: 'ix_claim_batches_claim' },
);

export const claimSubmissionSchema = new Schema(
  {
    ...claimCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    claimBatchId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    submissionAttempt: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    submissionChannel: {
      type: String,
      required: true,
      immutable: true,
      enum: claimSubmissionChannelValues,
    },
    status: {
      type: String,
      required: true,
      enum: claimSubmissionStatusValues,
      default: 'QUEUED',
    },
    outboundPayloadHash: claimHash,
    outboundAttachmentId: nullableClaimObjectId,
    destinationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    clearinghouseReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    externalSubmissionReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    payerReferenceNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    acknowledgementReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    rejectionCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    retryCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    lastErrorCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  claimTimestampedSchemaOptions('claimSubmissions'),
);

claimSubmissionSchema.pre('validate', function validateClaimSubmission() {
  if (
    ['SENT', 'ACKNOWLEDGED'].includes(this.status) &&
    this.externalSubmissionReference == null
  ) {
    this.invalidate(
      'externalSubmissionReference',
      'Sent submissions require an external submission reference',
    );
  }

  if (
    this.status === 'ACKNOWLEDGED' &&
    this.acknowledgementReference == null
  ) {
    this.invalidate(
      'acknowledgementReference',
      'Acknowledged submissions require an acknowledgement reference',
    );
  }

  if (
    ['FAILED_RETRYABLE', 'FAILED_FINAL', 'DEAD_LETTER'].includes(
      this.status,
    ) &&
    this.lastErrorCode == null
  ) {
    this.invalidate(
      'lastErrorCode',
      'Failed submissions require a sanitized error code',
    );
  }
});

claimSubmissionSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_claim_submissions_operation', unique: true },
);
claimSubmissionSchema.index(
  { facilityId: 1, claimBatchId: 1, submissionAttempt: 1 },
  { name: 'uq_claim_submissions_attempt', unique: true },
);
claimSubmissionSchema.index(
  { facilityId: 1, status: 1, nextRetryAt: 1 },
  { name: 'ix_claim_submissions_retry' },
);
claimSubmissionSchema.index(
  { facilityId: 1, externalSubmissionReference: 1 },
  {
    name: 'uq_claim_submissions_external_reference',
    unique: true,
    partialFilterExpression: {
      externalSubmissionReference: { $type: 'string' },
    },
  },
);

export const claimWorkItemSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    appealId: nullableClaimObjectId,
    workQueueType: {
      type: String,
      required: true,
      enum: claimWorkQueueTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: claimWorkQueueStatusValues,
      default: 'OPEN',
    },
    assignedToUserId: nullableClaimObjectId,
    assignedBy: nullableClaimObjectId,
    priority: {
      type: Number,
      required: true,
      min: 0,
      max: 1_000,
      default: 100,
    },
    followUpAt: {
      type: Date,
      default: null,
    },
    escalationLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 20,
      default: 0,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    escalatedBy: nullableClaimObjectId,
    escalatedToUserId: nullableClaimObjectId,
    reasonEncrypted: claimEncryptedText,
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: nullableClaimObjectId,
  },
  claimTimestampedSchemaOptions('claimWorkItems'),
);

claimWorkItemSchema.pre('validate', function validateClaimWorkItem() {
  if (
    ['ASSIGNED', 'IN_PROGRESS'].includes(this.status) &&
    this.assignedToUserId == null
  ) {
    this.invalidate(
      'assignedToUserId',
      'Assigned work items require an assignee',
    );
  }

  if (this.status === 'ESCALATED') {
    if (
      this.escalationLevel < 1 ||
      this.escalatedAt == null ||
      this.escalatedBy == null ||
      this.escalatedToUserId == null
    ) {
      this.invalidate(
        'escalationLevel',
        'Escalated work items require level, actor, target, and timestamp metadata',
      );
    }
  }

  if (this.status === 'RESOLVED') {
    if (this.resolvedAt == null || this.resolvedBy == null) {
      this.invalidate(
        'resolvedAt',
        'Resolved work items require actor and timestamp metadata',
      );
    }
  }
});

claimWorkItemSchema.index(
  {
    facilityId: 1,
    claimId: 1,
    claimLineId: 1,
    appealId: 1,
    workQueueType: 1,
    status: 1,
  },
  { name: 'ix_claim_work_items_target_status' },
);
claimWorkItemSchema.index(
  {
    facilityId: 1,
    assignedToUserId: 1,
    status: 1,
    priority: -1,
    followUpAt: 1,
  },
  { name: 'ix_claim_work_items_assignee_queue' },
);
claimWorkItemSchema.index(
  {
    facilityId: 1,
    workQueueType: 1,
    status: 1,
    followUpAt: 1,
  },
  { name: 'ix_claim_work_items_type_follow_up' },
);
claimWorkItemSchema.index(
  {
    facilityId: 1,
    status: 1,
    escalationLevel: -1,
    escalatedAt: 1,
  },
  { name: 'ix_claim_work_items_escalation' },
);

export type ClaimStatusHistory = InferSchemaType<
  typeof claimStatusHistorySchema
>;
export type ClaimVersionHistory = InferSchemaType<
  typeof claimVersionHistorySchema
>;
export type ClaimBatch = InferSchemaType<typeof claimBatchSchema>;
export type ClaimSubmission = InferSchemaType<
  typeof claimSubmissionSchema
>;
export type ClaimWorkItem = InferSchemaType<
  typeof claimWorkItemSchema
>;

function modelFor<T>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ClaimStatusHistoryModel = modelFor(
  'claimStatusHistories',
  claimStatusHistorySchema,
);
export const ClaimVersionHistoryModel = modelFor(
  'claimVersionHistories',
  claimVersionHistorySchema,
);
export const ClaimBatchModel = modelFor(
  'claimBatches',
  claimBatchSchema,
);
export const ClaimSubmissionModel = modelFor(
  'claimSubmissions',
  claimSubmissionSchema,
);
export const ClaimWorkItemModel = modelFor(
  'claimWorkItems',
  claimWorkItemSchema,
);