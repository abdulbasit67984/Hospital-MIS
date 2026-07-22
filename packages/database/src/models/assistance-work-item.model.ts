import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  assistanceWorkQueueStatusValues,
  assistanceWorkQueueTypeValues,
} from './welfare-zakat.types.js';

import {
  assistanceCommonFields,
  assistanceEncryptedText,
  assistanceTimestampedSchemaOptions,
  nullableAssistanceObjectId,
  requireAssistanceReason,
} from './welfare-zakat-schema-helpers.js';

export const assistanceWorkItemSchema = new Schema(
  {
    ...assistanceCommonFields,
    applicationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    approvalId: nullableAssistanceObjectId,
    allocationId: nullableAssistanceObjectId,
    workQueueType: {
      type: String,
      required: true,
      enum: assistanceWorkQueueTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: assistanceWorkQueueStatusValues,
      default: 'OPEN',
    },
    assignedToUserId: nullableAssistanceObjectId,
    assignedBy: nullableAssistanceObjectId,
    priority: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
      default: 100,
    },
    followUpAt: { type: Date, default: null },
    escalationLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
      default: 0,
    },
    escalatedAt: { type: Date, default: null },
    escalatedBy: nullableAssistanceObjectId,
    escalatedToUserId: nullableAssistanceObjectId,
    reasonEncrypted: assistanceEncryptedText,
    resolvedAt: { type: Date, default: null },
    resolvedBy: nullableAssistanceObjectId,
  },
  assistanceTimestampedSchemaOptions('assistanceWorkItems'),
);

assistanceWorkItemSchema.pre('validate', function () {
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
      this.invalidate(
        'escalationLevel',
        'Escalated work items require level, timestamp, actor, and destination',
      );
    }
  }
  if (['RESOLVED', 'CANCELLED'].includes(this.status)) {
    if (this.resolvedAt == null || this.resolvedBy == null) {
      this.invalidate('resolvedAt', `${this.status} work items require resolution metadata`);
    }
    requireAssistanceReason(this, 'reasonEncrypted', this.reasonEncrypted);
  }
});

assistanceWorkItemSchema.index(
  {
    facilityId: 1,
    applicationId: 1,
    workQueueType: 1,
    status: 1,
  },
  {
    name: 'uq_assistance_work_items_active_queue',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'OPEN',
          'ASSIGNED',
          'IN_PROGRESS',
          'WAITING_ON_APPLICANT',
          'WAITING_ON_INTERNAL',
          'ESCALATED',
        ],
      },
    },
  },
);
assistanceWorkItemSchema.index(
  { facilityId: 1, assignedToUserId: 1, status: 1, priority: 1, followUpAt: 1 },
  { name: 'ix_assistance_work_items_assignee_queue' },
);
assistanceWorkItemSchema.index(
  { facilityId: 1, status: 1, followUpAt: 1 },
  { name: 'ix_assistance_work_items_follow_up' },
);
assistanceWorkItemSchema.index(
  { facilityId: 1, status: 1, escalationLevel: -1, escalatedAt: 1 },
  { name: 'ix_assistance_work_items_escalation' },
);

export type AssistanceWorkItem = InferSchemaType<typeof assistanceWorkItemSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const AssistanceWorkItemModel = modelFor(
  'assistanceWorkItems',
  assistanceWorkItemSchema,
);