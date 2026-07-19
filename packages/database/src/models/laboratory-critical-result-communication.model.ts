import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  laboratoryCommunicationChannelValues,
  laboratoryCommunicationRecipientTypeValues,
  laboratoryCriticalCommunicationTypeValues,
} from './laboratory.types.js';

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

export const labCriticalResultCommunicationSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labResultId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labResultVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    componentCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    resultFlagSnapshot: {
      type: String,
      required: true,
      enum: [
        'CRITICAL',
        'CRITICAL_HIGH',
        'CRITICAL_LOW',
      ],
      immutable: true,
    },
    communicationType: {
      type: String,
      required: true,
      enum: laboratoryCriticalCommunicationTypeValues,
      immutable: true,
    },
    channel: {
      type: String,
      required: true,
      enum: laboratoryCommunicationChannelValues,
      immutable: true,
    },
    recipientType: {
      type: String,
      required: true,
      enum: laboratoryCommunicationRecipientTypeValues,
      immutable: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    recipientStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    recipientDisplaySnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
      select: false,
    },
    communicationNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    acknowledgementNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
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
      immutable: true,
    },
  },
  {
    collection: 'labCriticalResultCommunications',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labCriticalResultCommunicationSchema.pre(
  'validate',
  function validateCriticalResultCommunication() {
    this.componentCodeSnapshot = normalizeCode(
      this.componentCodeSnapshot,
    );

    if (this.communicationType === 'ACKNOWLEDGED') {
      if (this.acknowledgedAt == null || this.acknowledgedBy == null) {
        this.invalidate(
          'communicationType',
          'Critical-result acknowledgement records require acknowledgement attribution',
        );
      }
    } else if (
      this.acknowledgedAt != null ||
      this.acknowledgedBy != null
    ) {
      this.invalidate(
        'communicationType',
        'Only acknowledgement records may retain acknowledgement attribution',
      );
    }

    const internalRecipient = [
      'ORDERING_PROVIDER',
      'ON_CALL_PROVIDER',
      'NURSE',
    ].includes(this.recipientType);

    if (
      internalRecipient &&
      this.recipientUserId == null &&
      this.recipientStaffId == null
    ) {
      this.invalidate(
        'recipientUserId',
        'Internal critical-result recipients require a user or staff reference',
      );
    }
  },
);

labCriticalResultCommunicationSchema.index(
  {
    facilityId: 1,
    labResultVersionId: 1,
    componentCodeSnapshot: 1,
    sequence: 1,
  },
  {
    name: 'uq_lab_critical_communications_sequence',
    unique: true,
  },
);

labCriticalResultCommunicationSchema.index(
  {
    facilityId: 1,
    labResultId: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_lab_critical_communications_result_time',
  },
);

labCriticalResultCommunicationSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    communicationType: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_lab_critical_communications_patient_type',
  },
);

export type LabCriticalResultCommunication = InferSchemaType<
  typeof labCriticalResultCommunicationSchema
>;

export const LabCriticalResultCommunicationModel =
  (mongoose.models['labCriticalResultCommunications'] as
    | Model<LabCriticalResultCommunication>
    | undefined) ??
  mongoose.model<LabCriticalResultCommunication>(
    'labCriticalResultCommunications',
    labCriticalResultCommunicationSchema,
    'labCriticalResultCommunications',
  );