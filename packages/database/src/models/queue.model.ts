import {
  randomUUID,
} from 'node:crypto';

import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  activeQueueEntryStatusValues,
  queueDefinitionStatusValues,
  queueEntryStatusValues,
  queuePriorityClassValues,
  queuePublicDisplayModeValues,
  queueResetPolicyValues,
  queueSpecialCategoryValues,
  queueStatusChangeSourceValues,
  queueTransferReasonValues,
  serviceCounterStatusValues,
  serviceCounterTypeValues,
  triagePriorityValues,
} from './registration-queue.types.js';

function objectIdText(value: unknown): string {
  if (
    value != null &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }

  return String(value);
}

export const queueDefinitionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
      match: /^[A-Z][A-Z0-9_-]*$/u,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    displayLabel: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    tokenPrefix: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
      match: /^[A-Z0-9]*$/u,
      default: '',
    },
    resetPolicy: {
      type: String,
      required: true,
      enum: queueResetPolicyValues,
      default: 'SERVICE_DATE',
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      default: 'Asia/Karachi',
    },
    estimatedServiceMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1_440,
      default: 15,
    },
    maximumRecallCount: {
      type: Number,
      required: true,
      min: 0,
      max: 20,
      default: 2,
    },
    allowPriority: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowEmergencyOverride: {
      type: Boolean,
      required: true,
      default: true,
    },
    publicDisplayEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    publicDisplayMode: {
      type: String,
      required: true,
      enum: queuePublicDisplayModeValues,
      default: 'TOKEN_AND_COUNTER',
    },
    status: {
      type: String,
      required: true,
      enum: queueDefinitionStatusValues,
      default: 'ACTIVE',
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    deactivationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
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
    collection: 'queueDefinitions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

queueDefinitionSchema.pre(
  'validate',
  function validateQueueDefinition() {
    if (
      this.status === 'INACTIVE' &&
      this.deactivatedAt == null
    ) {
      this.invalidate(
        'deactivatedAt',
        'Inactive queue definitions require deactivatedAt',
      );
    }

    if (
      this.status === 'ACTIVE' &&
      (
        this.deactivatedAt != null ||
        this.deactivatedBy != null
      )
    ) {
      this.invalidate(
        'status',
        'Active queue definitions cannot retain deactivation metadata',
      );
    }
  },
);

queueDefinitionSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_queue_definitions_facility_code',
    unique: true,
  },
);

queueDefinitionSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointId: 1,
    providerId: 1,
    status: 1,
  },
  {
    name: 'ix_queue_definitions_facility_context_status',
  },
);

export const serviceCounterSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    code: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 40,
      match: /^[A-Z][A-Z0-9_-]*$/u,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    counterType: {
      type: String,
      required: true,
      enum: serviceCounterTypeValues,
      default: 'QUEUE',
    },
    queueDefinitionIds: {
      type: [
        Schema.Types.ObjectId,
      ],
      required: true,
      default: [],
      validate: {
        validator(
          values: readonly unknown[],
        ): boolean {
          const normalized =
            values.map(objectIdText);

          return (
            normalized.length <= 100 &&
            new Set(normalized).size ===
              normalized.length
          );
        },
        message:
          'Counter queue assignments must contain unique queue definitions',
      },
    },
    status: {
      type: String,
      required: true,
      enum: serviceCounterStatusValues,
      default: 'ACTIVE',
    },
    activeUserId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    activeProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    openedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
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
    collection: 'serviceCounters',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

serviceCounterSchema.pre(
  'validate',
  function validateServiceCounter() {
    if (
      this.openedAt != null &&
      this.closedAt != null &&
      this.closedAt < this.openedAt
    ) {
      this.invalidate(
        'closedAt',
        'Counter closure cannot precede opening',
      );
    }

    if (
      this.status !== 'ACTIVE' &&
      this.activeUserId != null
    ) {
      this.invalidate(
        'activeUserId',
        'Only active counters may retain an active user assignment',
      );
    }
  },
);

serviceCounterSchema.index(
  {
    facilityId: 1,
    code: 1,
  },
  {
    name: 'uq_service_counters_facility_code',
    unique: true,
  },
);

serviceCounterSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    clinicId: 1,
    servicePointId: 1,
    status: 1,
    name: 1,
  },
  {
    name: 'ix_service_counters_facility_context_status_name',
  },
);

serviceCounterSchema.index(
  {
    facilityId: 1,
    queueDefinitionIds: 1,
    status: 1,
  },
  {
    name: 'ix_service_counters_facility_queue_status',
  },
);

export const queueTokenSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    queueEntryId: {
      type: String,
      required: true,
      immutable: true,
      default: randomUUID,
      trim: true,
      match:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    opdVisitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    queueDefinitionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    serviceDate: {
      type: String,
      required: true,
      immutable: true,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    tokenNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 9_999_999,
    },
    tokenPrefix: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
      match: /^[A-Z0-9]*$/u,
      default: '',
    },
    tokenLabel: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 30,
    },
    status: {
      type: String,
      required: true,
      enum: queueEntryStatusValues,
      default: 'WAITING',
    },
    priorityClass: {
      type: String,
      required: true,
      enum: queuePriorityClassValues,
      default: 'ROUTINE',
    },
    priorityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100_000,
      default: 0,
    },
    triagePriority: {
      type: String,
      required: true,
      enum: triagePriorityValues,
      default: 'NOT_TRIAGED',
    },
    emergencyOverride: {
      type: Boolean,
      required: true,
      default: false,
    },
    emergencyOverrideReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 1_000,
      select: false,
    },
    specialCategories: {
      type: [
        {
          type: String,
          enum: queueSpecialCategoryValues,
        },
      ],
      required: true,
      default: [],
      validate: {
        validator(
          values: readonly string[],
        ): boolean {
          return (
            values.length <= 10 &&
            new Set(values).size === values.length
          );
        },
        message:
          'Queue special categories must be unique',
      },
    },
    assignedProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    assignedCounterId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    activeEntryKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
      select: false,
    },
    queuedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    calledAt: {
      type: Date,
      default: null,
    },
    servingAt: {
      type: Date,
      default: null,
    },
    skippedAt: {
      type: Date,
      default: null,
    },
    transferredAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    noShowAt: {
      type: Date,
      default: null,
    },
    skipCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    recallCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    transferCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    estimatedWaitMinutes: {
      type: Number,
      default: null,
      min: 0,
      max: 100_000,
    },
    estimatedServiceAt: {
      type: Date,
      default: null,
    },
    transferredFromQueueTokenId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    transferredToQueueTokenId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    transferReason: {
      type: String,
      default: null,
      enum: queueTransferReasonValues,
    },
    statusReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    lastStatusChangedAt: {
      type: Date,
      required: true,
    },
    lastStatusChangedBy: {
      type: Schema.Types.ObjectId,
      required: true,
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
    collection: 'queueTokens',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

queueTokenSchema.pre(
  'validate',
  function validateQueueToken() {
    const expectedLabel =
      `${this.tokenPrefix}${this.tokenNumber}`;

    if (this.tokenLabel !== expectedLabel) {
      this.invalidate(
        'tokenLabel',
        'tokenLabel must equal tokenPrefix followed by tokenNumber',
      );
    }

    const active =
      activeQueueEntryStatusValues.includes(
        this.status as
          (typeof activeQueueEntryStatusValues)[number],
      );

    this.activeEntryKey =
      active
        ? objectIdText(this.opdVisitId)
        : null;

    if (
      this.emergencyOverride &&
      this.emergencyOverrideReason == null
    ) {
      this.invalidate(
        'emergencyOverrideReason',
        'Emergency override requires a documented reason',
      );
    }

    if (
      !this.emergencyOverride &&
      this.emergencyOverrideReason != null
    ) {
      this.invalidate(
        'emergencyOverrideReason',
        'Emergency override reason is only valid when override is enabled',
      );
    }

    if (
      this.calledAt != null &&
      this.calledAt < this.queuedAt
    ) {
      this.invalidate(
        'calledAt',
        'Call time cannot precede queue time',
      );
    }

    if (
      this.servingAt != null &&
      this.servingAt < this.queuedAt
    ) {
      this.invalidate(
        'servingAt',
        'Serving time cannot precede queue time',
      );
    }

    const requiredTimestampByStatus = {
      CALLED: this.calledAt,
      SERVING: this.servingAt,
      SKIPPED: this.skippedAt,
      TRANSFERRED: this.transferredAt,
      COMPLETED: this.completedAt,
      CANCELLED: this.cancelledAt,
      NO_SHOW: this.noShowAt,
    } as const;

    if (
      this.status !== 'WAITING' &&
      requiredTimestampByStatus[
        this.status as
          keyof typeof requiredTimestampByStatus
      ] == null
    ) {
      this.invalidate(
        'status',
        `${this.status} queue entries require their lifecycle timestamp`,
      );
    }

    if (this.status === 'TRANSFERRED') {
      if (
        this.transferredToQueueTokenId == null ||
        this.transferReason == null ||
        this.transferCount < 1
      ) {
        this.invalidate(
          'status',
          'Transferred queue entries require destination, reason, and transfer count',
        );
      }
    } else if (
      this.transferredToQueueTokenId != null
    ) {
      this.invalidate(
        'transferredToQueueTokenId',
        'Only transferred queue entries may reference a destination token',
      );
    }

    if (
      this.transferredFromQueueTokenId != null &&
      this.transferredFromQueueTokenId.equals(this._id)
    ) {
      this.invalidate(
        'transferredFromQueueTokenId',
        'A queue entry cannot transfer from itself',
      );
    }
  },
);

queueTokenSchema.index(
  {
    queueEntryId: 1,
  },
  {
    name: 'uq_queue_tokens_entry_id',
    unique: true,
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    serviceDate: 1,
    queueDefinitionId: 1,
    tokenNumber: 1,
  },
  {
    name: 'uq_queue_tokens_facility_date_queue_number',
    unique: true,
  },
);

queueTokenSchema.index(
  {
    transactionId: 1,
  },
  {
    name: 'uq_queue_tokens_transaction',
    unique: true,
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    activeEntryKey: 1,
  },
  {
    name: 'uq_queue_tokens_facility_active_visit',
    unique: true,
    partialFilterExpression: {
      activeEntryKey: {
        $type: 'string',
      },
    },
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    serviceDate: 1,
    queueDefinitionId: 1,
    status: 1,
    emergencyOverride: -1,
    priorityScore: -1,
    queuedAt: 1,
  },
  {
    name: 'ix_queue_tokens_live_queue_order',
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    assignedProviderId: 1,
    serviceDate: 1,
    status: 1,
    priorityScore: -1,
    queuedAt: 1,
  },
  {
    name: 'ix_queue_tokens_provider_queue',
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    assignedCounterId: 1,
    serviceDate: 1,
    status: 1,
    calledAt: -1,
  },
  {
    name: 'ix_queue_tokens_counter_status_call',
  },
);

queueTokenSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    serviceDate: -1,
    queuedAt: -1,
  },
  {
    name: 'ix_queue_tokens_patient_history',
  },
);

export const queueStatusHistorySchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    queueTokenId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    queueEntryId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 80,
    },
    opdVisitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
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
    fromStatus: {
      type: String,
      default: null,
      enum: queueEntryStatusValues,
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: queueEntryStatusValues,
      immutable: true,
    },
    queueDefinitionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    destinationQueueDefinitionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    destinationProviderId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    counterId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    destinationCounterId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    changeSource: {
      type: String,
      required: true,
      enum: queueStatusChangeSourceValues,
      immutable: true,
    },
    transferReason: {
      type: String,
      default: null,
      enum: queueTransferReasonValues,
      immutable: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      immutable: true,
      select: false,
    },
    occurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      required: true,
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
    collection: 'queueStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

queueStatusHistorySchema.pre(
  'validate',
  function validateQueueStatusHistory() {
    if (this.fromStatus === this.toStatus) {
      this.invalidate(
        'toStatus',
        'Queue history must record a status change',
      );
    }

    if (this.toStatus === 'TRANSFERRED') {
      if (
        this.destinationQueueDefinitionId == null ||
        this.transferReason == null
      ) {
        this.invalidate(
          'toStatus',
          'Transfer history requires destination queue and transfer reason',
        );
      }
    } else if (
      this.destinationQueueDefinitionId != null ||
      this.destinationProviderId != null ||
      this.destinationCounterId != null ||
      this.transferReason != null
    ) {
      this.invalidate(
        'toStatus',
        'Destination metadata is only valid for queue transfers',
      );
    }
  },
);

queueStatusHistorySchema.index(
  {
    facilityId: 1,
    queueTokenId: 1,
    sequence: 1,
  },
  {
    name: 'uq_queue_status_histories_token_sequence',
    unique: true,
  },
);

queueStatusHistorySchema.index(
  {
    transactionId: 1,
    sequence: 1,
  },
  {
    name: 'uq_queue_status_histories_transaction_sequence',
    unique: true,
  },
);

queueStatusHistorySchema.index(
  {
    facilityId: 1,
    opdVisitId: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_queue_status_histories_visit_time',
  },
);

queueStatusHistorySchema.index(
  {
    facilityId: 1,
    queueDefinitionId: 1,
    toStatus: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_queue_status_histories_queue_status_time',
  },
);

export type QueueDefinitionDocument =
  InferSchemaType<typeof queueDefinitionSchema>;

export type ServiceCounterDocument =
  InferSchemaType<typeof serviceCounterSchema>;

export type QueueTokenDocument =
  InferSchemaType<typeof queueTokenSchema>;

export type QueueStatusHistoryDocument =
  InferSchemaType<typeof queueStatusHistorySchema>;

export const QueueDefinitionModel =
  (mongoose.models['queueDefinitions'] as
    | Model<QueueDefinitionDocument>
    | undefined) ??
  mongoose.model<QueueDefinitionDocument>(
    'queueDefinitions',
    queueDefinitionSchema,
    'queueDefinitions',
  );

export const ServiceCounterModel =
  (mongoose.models['serviceCounters'] as
    | Model<ServiceCounterDocument>
    | undefined) ??
  mongoose.model<ServiceCounterDocument>(
    'serviceCounters',
    serviceCounterSchema,
    'serviceCounters',
  );

export const QueueTokenModel =
  (mongoose.models['queueTokens'] as
    | Model<QueueTokenDocument>
    | undefined) ??
  mongoose.model<QueueTokenDocument>(
    'queueTokens',
    queueTokenSchema,
    'queueTokens',
  );

export const QueueStatusHistoryModel =
  (mongoose.models['queueStatusHistories'] as
    | Model<QueueStatusHistoryDocument>
    | undefined) ??
  mongoose.model<QueueStatusHistoryDocument>(
    'queueStatusHistories',
    queueStatusHistorySchema,
    'queueStatusHistories',
  );