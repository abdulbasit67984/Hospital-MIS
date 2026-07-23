import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  consultantDisputeStatusValues,
  consultantDisputeTargetTypeValues,
  consultantWorkQueueStatusValues,
  consultantWorkQueueTypeValues,
} from './consultant-sharing.types.js';

import {
  compareConsultantSharingDecimals,
  consultantSharingCommonFields,
  consultantSharingEncryptedText,
  consultantSharingHash,
  consultantSharingNonNegativeDecimal,
  consultantSharingObjectIdArray,
  consultantSharingTimestampedSchemaOptions,
  normalizeConsultantSharingCode,
  nullableConsultantSharingObjectId,
  requireConsultantSharingReason,
  validateConsultantSharingImmutableHash,
  validateConsultantSharingMakerChecker,
  validateConsultantSharingMoneyFields,
  validateDistinctConsultantSharingObjectIds,
} from './consultant-sharing-schema-helpers.js';

export const consultantDisputeSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    disputeNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    targetType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantDisputeTargetTypeValues,
    },
    agreementId: { ...nullableConsultantSharingObjectId, immutable: true },
    agreementRuleId: { ...nullableConsultantSharingObjectId, immutable: true },
    revenueEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
    settlementId: { ...nullableConsultantSharingObjectId, immutable: true },
    settlementItemId: { ...nullableConsultantSharingObjectId, immutable: true },
    settlementPaymentId: { ...nullableConsultantSharingObjectId, immutable: true },
    status: {
      type: String,
      required: true,
      enum: consultantDisputeStatusValues,
      default: 'OPEN',
    },
    reasonCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 4_000,
    },
    evidenceEncrypted: consultantSharingEncryptedText,
    reviewerFindingsEncrypted: consultantSharingEncryptedText,
    resolutionNotesEncrypted: consultantSharingEncryptedText,
    supportingAttachmentIds: consultantSharingObjectIdArray,
    requestedAdjustmentAmount: consultantSharingNonNegativeDecimal,
    approvedAdjustmentAmount: consultantSharingNonNegativeDecimal,
    postedAdjustmentId: nullableConsultantSharingObjectId,
    assignedToUserId: nullableConsultantSharingObjectId,
    assignedBy: nullableConsultantSharingObjectId,
    assignedAt: { type: Date, default: null },
    followUpAt: { type: Date, default: null },
    reviewDeadlineAt: { type: Date, default: null },
    resolutionDeadlineAt: { type: Date, default: null },
    escalationLevel: { type: Number, required: true, min: 0, max: 10, default: 0 },
    escalatedAt: { type: Date, default: null },
    escalatedBy: nullableConsultantSharingObjectId,
    escalatedToUserId: nullableConsultantSharingObjectId,
    createdByConsultant: { type: Boolean, required: true, immutable: true, default: false },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reviewingUserId: nullableConsultantSharingObjectId,
    resolvingUserId: nullableConsultantSharingObjectId,
    approvalRequestId: nullableConsultantSharingObjectId,
    openedAt: { type: Date, required: true, immutable: true },
    reviewStartedAt: { type: Date, default: null },
    informationRequestedAt: { type: Date, default: null },
    decisionAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    resolutionCode: { type: String, default: null, trim: true, uppercase: true, maxlength: 120 },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 4_000 },
  },
  consultantSharingTimestampedSchemaOptions('consultantDisputes'),
);

consultantDisputeSchema.pre('validate', function validateDispute() {
  this.disputeNumber = normalizeConsultantSharingCode(this.disputeNumber);
  this.reasonCode = normalizeConsultantSharingCode(this.reasonCode);
  if (this.resolutionCode != null) {
    this.resolutionCode = normalizeConsultantSharingCode(this.resolutionCode);
  }

  validateConsultantSharingMoneyFields(this, [
    'requestedAdjustmentAmount',
    'approvedAdjustmentAmount',
  ]);
  validateDistinctConsultantSharingObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  validateConsultantSharingMakerChecker(this, 'makerUserId', [
    'reviewingUserId',
    'resolvingUserId',
  ]);

  const expectedTargetPath: Readonly<Record<string, string>> = {
    AGREEMENT: 'agreementId',
    AGREEMENT_RULE: 'agreementRuleId',
    REVENUE_ENTRY: 'revenueEntryId',
    SETTLEMENT: 'settlementId',
    SETTLEMENT_ITEM: 'settlementItemId',
    PAYMENT: 'settlementPaymentId',
  };
  const targetPath = expectedTargetPath[this.targetType];
  if (targetPath != null && this.get(targetPath) == null) {
    this.invalidate(targetPath, `${this.targetType} disputes require their target reference`);
  }

  if (this.status === 'UNDER_REVIEW') {
    if (this.reviewingUserId == null || this.reviewStartedAt == null) {
      this.invalidate('reviewingUserId', 'Under-review disputes require reviewer attribution');
    }
  }
  if (this.status === 'INFORMATION_REQUESTED' && this.informationRequestedAt == null) {
    this.invalidate(
      'informationRequestedAt',
      'Information-requested disputes require a request timestamp',
    );
  }
  if (['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(this.status)) {
    if (
      this.resolvingUserId == null ||
      this.decisionAt == null ||
      this.resolutionCode == null ||
      this.approvalRequestId == null
    ) {
      this.invalidate('decisionAt', 'Dispute decisions require independent approval metadata');
    }
  }
  if (this.status === 'APPROVED') {
    if (
      compareConsultantSharingDecimals(
        this.approvedAdjustmentAmount,
        this.requestedAdjustmentAmount,
      ) !== 0
    ) {
      this.invalidate(
        'approvedAdjustmentAmount',
        'Approved disputes must approve the requested amount in full',
      );
    }
  }
  if (this.status === 'PARTIALLY_APPROVED') {
    if (
      compareConsultantSharingDecimals(this.approvedAdjustmentAmount, '0') <= 0 ||
      compareConsultantSharingDecimals(
        this.approvedAdjustmentAmount,
        this.requestedAdjustmentAmount,
      ) >= 0
    ) {
      this.invalidate(
        'approvedAdjustmentAmount',
        'Partially approved disputes require a non-zero amount below the request',
      );
    }
  }
  if (this.status === 'RESOLVED') {
    if (this.resolvedAt == null || this.resolvingUserId == null || this.resolutionCode == null) {
      this.invalidate('resolvedAt', 'Resolved disputes require resolution metadata');
    }
  }
  if (this.status === 'CANCELLED') {
    if (this.cancelledAt == null) {
      this.invalidate('cancelledAt', 'Cancelled disputes require a timestamp');
    }
    requireConsultantSharingReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (this.escalationLevel > 0) {
    if (this.escalatedAt == null || this.escalatedBy == null || this.escalatedToUserId == null) {
      this.invalidate('escalationLevel', 'Escalated disputes require complete escalation metadata');
    }
  }
});

consultantDisputeSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_disputes_operation', unique: true },
);
consultantDisputeSchema.index(
  { facilityId: 1, disputeNumber: 1 },
  { name: 'uq_consultant_disputes_number', unique: true },
);
consultantDisputeSchema.index(
  { facilityId: 1, consultantId: 1, targetType: 1, revenueEntryId: 1, settlementId: 1, status: 1 },
  { name: 'ix_consultant_disputes_target_status' },
);
consultantDisputeSchema.index(
  { facilityId: 1, assignedToUserId: 1, status: 1, followUpAt: 1 },
  { name: 'ix_consultant_disputes_assignee_queue' },
);
consultantDisputeSchema.index(
  { facilityId: 1, status: 1, resolutionDeadlineAt: 1 },
  { name: 'ix_consultant_disputes_deadline' },
);

export const consultantDisputeHistorySchema = new Schema(
  {
    ...consultantSharingCommonFields,
    disputeId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    historySequence: { type: Number, required: true, immutable: true, min: 1 },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantDisputeStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantDisputeStatusValues,
    },
    requestedAdjustmentAmount: {
      ...consultantSharingNonNegativeDecimal,
      immutable: true,
    },
    approvedAdjustmentAmount: {
      ...consultantSharingNonNegativeDecimal,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 4_000,
    },
    snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
    snapshotHash: consultantSharingHash,
    attachmentIds: { ...consultantSharingObjectIdArray, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvalRequestId: { ...nullableConsultantSharingObjectId, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantDisputeHistories'),
);

consultantDisputeHistorySchema.pre('validate', function validateDisputeHistory() {
  validateConsultantSharingMoneyFields(this, [
    'requestedAdjustmentAmount',
    'approvedAdjustmentAmount',
  ]);
  validateConsultantSharingImmutableHash(this, 'snapshotHash');
  validateConsultantSharingImmutableHash(this, 'immutableHash');
  validateDistinctConsultantSharingObjectIds(this, 'attachmentIds', this.attachmentIds);
  if (this.fromStatus === this.toStatus) {
    this.invalidate('toStatus', 'Dispute history must change the lifecycle status');
  }
});

consultantDisputeHistorySchema.index(
  { facilityId: 1, disputeId: 1, historySequence: 1 },
  { name: 'uq_consultant_dispute_histories_sequence', unique: true },
);
consultantDisputeHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_dispute_histories_hash', unique: true },
);
consultantDisputeHistorySchema.index(
  { facilityId: 1, disputeId: 1, occurredAt: 1 },
  { name: 'ix_consultant_dispute_histories_timeline' },
);

export const consultantWorkItemSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    agreementId: nullableConsultantSharingObjectId,
    agreementRuleId: nullableConsultantSharingObjectId,
    revenueEntryId: nullableConsultantSharingObjectId,
    adjustmentId: nullableConsultantSharingObjectId,
    reversalId: nullableConsultantSharingObjectId,
    settlementId: nullableConsultantSharingObjectId,
    settlementPaymentId: nullableConsultantSharingObjectId,
    disputeId: nullableConsultantSharingObjectId,
    workQueueType: {
      type: String,
      required: true,
      enum: consultantWorkQueueTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: consultantWorkQueueStatusValues,
      default: 'OPEN',
    },
    assignedToUserId: nullableConsultantSharingObjectId,
    assignedBy: nullableConsultantSharingObjectId,
    assignedAt: { type: Date, default: null },
    priority: { type: Number, required: true, min: 0, max: 10_000, default: 100 },
    followUpAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    escalationLevel: { type: Number, required: true, min: 0, max: 10, default: 0 },
    escalatedAt: { type: Date, default: null },
    escalatedBy: nullableConsultantSharingObjectId,
    escalatedToUserId: nullableConsultantSharingObjectId,
    reasonEncrypted: consultantSharingEncryptedText,
    resolvedAt: { type: Date, default: null },
    resolvedBy: nullableConsultantSharingObjectId,
  },
  consultantSharingTimestampedSchemaOptions('consultantWorkItems'),
);

consultantWorkItemSchema.pre('validate', function validateWorkItem() {
  const targetIds = [
    this.agreementId,
    this.agreementRuleId,
    this.revenueEntryId,
    this.adjustmentId,
    this.reversalId,
    this.settlementId,
    this.settlementPaymentId,
    this.disputeId,
  ].filter((value) => value != null);
  if (targetIds.length !== 1) {
    this.invalidate('agreementId', 'Consultant work items must reference exactly one target');
  }
  if (this.status === 'ASSIGNED' && this.assignedToUserId == null) {
    this.invalidate('assignedToUserId', 'Assigned work items require an assignee');
  }
  if (this.status === 'ESCALATED') {
    if (
      this.escalationLevel < 1 ||
      this.escalatedAt == null ||
      this.escalatedBy == null ||
      this.escalatedToUserId == null
    ) {
      this.invalidate('escalationLevel', 'Escalated work items require complete metadata');
    }
  }
  if (['RESOLVED', 'CANCELLED'].includes(this.status)) {
    if (this.resolvedAt == null || this.resolvedBy == null) {
      this.invalidate('resolvedAt', `${this.status} work items require resolution metadata`);
    }
    requireConsultantSharingReason(this, 'reasonEncrypted', this.reasonEncrypted);
  }
});

consultantWorkItemSchema.index(
  {
    facilityId: 1,
    workQueueType: 1,
    agreementId: 1,
    agreementRuleId: 1,
    revenueEntryId: 1,
    adjustmentId: 1,
    reversalId: 1,
    settlementId: 1,
    settlementPaymentId: 1,
    disputeId: 1,
    status: 1,
  },
  {
    name: 'uq_consultant_work_items_active_target',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'OPEN',
          'ASSIGNED',
          'IN_PROGRESS',
          'WAITING_ON_INTERNAL',
          'WAITING_ON_CONSULTANT',
          'ESCALATED',
        ],
      },
    },
  },
);
consultantWorkItemSchema.index(
  { facilityId: 1, assignedToUserId: 1, status: 1, priority: -1, followUpAt: 1 },
  { name: 'ix_consultant_work_items_assignee_queue' },
);
consultantWorkItemSchema.index(
  { facilityId: 1, status: 1, deadlineAt: 1 },
  { name: 'ix_consultant_work_items_deadline' },
);
consultantWorkItemSchema.index(
  { facilityId: 1, status: 1, escalationLevel: -1, escalatedAt: 1 },
  { name: 'ix_consultant_work_items_escalation' },
);

export type ConsultantDispute = InferSchemaType<typeof consultantDisputeSchema>;
export type ConsultantDisputeHistory = InferSchemaType<typeof consultantDisputeHistorySchema>;
export type ConsultantWorkItem = InferSchemaType<typeof consultantWorkItemSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ConsultantDisputeModel = modelFor(
  'consultantDisputes',
  consultantDisputeSchema,
);
export const ConsultantDisputeHistoryModel = modelFor(
  'consultantDisputeHistories',
  consultantDisputeHistorySchema,
);
export const ConsultantWorkItemModel = modelFor(
  'consultantWorkItems',
  consultantWorkItemSchema,
);