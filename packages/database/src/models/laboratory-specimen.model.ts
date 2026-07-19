import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  laboratorySpecimenCollectionMethodValues,
  laboratorySpecimenStatusChangeSourceValues,
  laboratorySpecimenStatusValues,
} from './laboratory.types.js';

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

const commonFields = {
  facilityId: {
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
} as const;

export const labSpecimenSchema = new Schema(
  {
    ...commonFields,
    accessionNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    specimenIdentifier: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 160,
    },
    labelCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 200,
      select: false,
    },
    labOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labOrderItemIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      immutable: true,
      validate: {
        validator(value: mongoose.Types.ObjectId[]): boolean {
          return value.length > 0;
        },
        message: 'Laboratory specimens require at least one order item',
      },
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
    requirementCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    specimenTypeCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    specimenTypeNameSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 300,
    },
    containerCodeSnapshot: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    containerNameSnapshot: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 300,
    },
    expectedMinimumVolume: {
      type: Schema.Types.Decimal128,
      default: null,
      immutable: true,
      min: 0,
    },
    expectedVolumeUnitCode: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    collectedVolume: {
      type: Schema.Types.Decimal128,
      default: null,
      min: 0,
    },
    collectedVolumeUnitCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    collectionMethod: {
      type: String,
      default: null,
      enum: [...laboratorySpecimenCollectionMethodValues, null],
    },
    collectionSite: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: laboratorySpecimenStatusValues,
      default: 'PLANNED',
    },
    labelPrintCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    labelPrintedAt: {
      type: Date,
      default: null,
    },
    labelPrintedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    collectedAt: {
      type: Date,
      default: null,
    },
    collectedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    collectorStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    receivedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingStartedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    rejectionReasonCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    recollectionRequestedAt: {
      type: Date,
      default: null,
    },
    recollectionRequestedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    recollectionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    recollectionOfSpecimenId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    replacementSpecimenId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    collectionAttempt: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
      max: 100,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
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
  },
  {
    collection: 'labSpecimens',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labSpecimenSchema.pre('validate', function validateLabSpecimen() {
  this.accessionNumber = normalizeCode(this.accessionNumber);
  this.specimenIdentifier = normalizeCode(this.specimenIdentifier);
  this.requirementCodeSnapshot = normalizeCode(this.requirementCodeSnapshot);
  this.specimenTypeCodeSnapshot = normalizeCode(this.specimenTypeCodeSnapshot);

  const uniqueItems = new Map(
    this.labOrderItemIds.map((id) => [id.toHexString(), id]),
  );

  this.labOrderItemIds = [...uniqueItems.values()];

  if (
    (this.expectedMinimumVolume == null) !==
    (this.expectedVolumeUnitCode == null)
  ) {
    this.invalidate(
      'expectedMinimumVolume',
      'Expected specimen volume and its unit must be provided together',
    );
  }

  if (
    (this.collectedVolume == null) !==
    (this.collectedVolumeUnitCode == null)
  ) {
    this.invalidate(
      'collectedVolume',
      'Collected specimen volume and its unit must be provided together',
    );
  }

  if (this.labelPrintCount === 0) {
    if (this.labelPrintedAt != null || this.labelPrintedBy != null) {
      this.invalidate(
        'labelPrintCount',
        'Unprinted specimen labels cannot retain print attribution',
      );
    }
  } else if (this.labelPrintedAt == null || this.labelPrintedBy == null) {
    this.invalidate(
      'labelPrintCount',
      'Printed specimen labels require print attribution',
    );
  }

  const collectionRequired = ![
    'PLANNED',
    'LABEL_PRINTED',
    'CANCELLED',
  ].includes(this.status);

  if (
    collectionRequired &&
    (this.collectedAt == null ||
      this.collectedBy == null ||
      this.collectorStaffId == null ||
      this.collectionMethod == null)
  ) {
    this.invalidate(
      'status',
      'Collected specimen states require collection time, actor, staff, and method',
    );
  }

  if (
    ['RECEIVED', 'PROCESSING', 'COMPLETED'].includes(this.status) &&
    (this.receivedAt == null || this.receivedBy == null)
  ) {
    this.invalidate(
      'receivedAt',
      'Received and later specimen states require receipt attribution',
    );
  }

  if (
    ['PROCESSING', 'COMPLETED'].includes(this.status) &&
    (this.processingStartedAt == null || this.processingStartedBy == null)
  ) {
    this.invalidate(
      'processingStartedAt',
      'Processing specimen states require processing attribution',
    );
  }

  if (
    this.status === 'COMPLETED' &&
    (this.completedAt == null || this.completedBy == null)
  ) {
    this.invalidate(
      'completedAt',
      'Completed specimens require completion attribution',
    );
  }

  const rejected =
    this.status === 'REJECTED' ||
    this.status === 'RECOLLECTION_REQUIRED';

  if (
    rejected &&
    (this.rejectedAt == null ||
      this.rejectedBy == null ||
      this.rejectionReasonCode == null ||
      this.rejectionReason == null)
  ) {
    this.invalidate(
      'status',
      'Rejected specimens require rejection attribution and reason',
    );
  } else if (
    !rejected &&
    (this.rejectedAt != null ||
      this.rejectedBy != null ||
      this.rejectionReasonCode != null ||
      this.rejectionReason != null)
  ) {
    this.invalidate(
      'status',
      'Non-rejected specimens cannot retain rejection metadata',
    );
  }

  if (this.status === 'RECOLLECTION_REQUIRED') {
    if (
      this.recollectionRequestedAt == null ||
      this.recollectionRequestedBy == null ||
      this.recollectionReason == null
    ) {
      this.invalidate(
        'status',
        'Recollection-required specimens require recollection attribution and reason',
      );
    }
  } else if (
    this.recollectionRequestedAt != null ||
    this.recollectionRequestedBy != null ||
    this.recollectionReason != null ||
    this.replacementSpecimenId != null
  ) {
    this.invalidate(
      'status',
      'Only recollection-required specimens may retain recollection workflow metadata',
    );
  }

  if (this.collectionAttempt > 1 && this.recollectionOfSpecimenId == null) {
    this.invalidate(
      'recollectionOfSpecimenId',
      'Subsequent specimen collection attempts require the prior specimen reference',
    );
  }

  if (this.collectionAttempt === 1 && this.recollectionOfSpecimenId != null) {
    this.invalidate(
      'collectionAttempt',
      'The first specimen collection attempt cannot reference a prior specimen',
    );
  }

  if (this.status === 'CANCELLED') {
    if (
      this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null
    ) {
      this.invalidate(
        'status',
        'Cancelled specimens require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active specimens cannot retain cancellation metadata',
    );
  }

  if (
    this.recollectionOfSpecimenId != null &&
    this.recollectionOfSpecimenId.equals(this._id)
  ) {
    this.invalidate(
      'recollectionOfSpecimenId',
      'A specimen cannot be a recollection of itself',
    );
  }

  if (
    this.replacementSpecimenId != null &&
    this.replacementSpecimenId.equals(this._id)
  ) {
    this.invalidate(
      'replacementSpecimenId',
      'A specimen cannot replace itself',
    );
  }
});

labSpecimenSchema.index(
  {
    facilityId: 1,
    accessionNumber: 1,
  },
  {
    name: 'uq_lab_specimens_facility_accession',
    unique: true,
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    specimenIdentifier: 1,
  },
  {
    name: 'uq_lab_specimens_facility_identifier',
    unique: true,
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    labelCode: 1,
  },
  {
    name: 'uq_lab_specimens_facility_label_code',
    unique: true,
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    labOrderId: 1,
    collectionAttempt: 1,
    createdAt: 1,
  },
  {
    name: 'ix_lab_specimens_order_attempt_created',
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    labOrderItemIds: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_lab_specimens_item_status_created',
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    collectedAt: -1,
  },
  {
    name: 'ix_lab_specimens_patient_collected',
  },
);

labSpecimenSchema.index(
  {
    facilityId: 1,
    status: 1,
    receivedAt: 1,
  },
  {
    name: 'ix_lab_specimens_worklist',
  },
);

export const labSpecimenStatusHistorySchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labSpecimenId: {
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
    fromStatus: {
      type: String,
      default: null,
      enum: [...laboratorySpecimenStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: laboratorySpecimenStatusValues,
      immutable: true,
    },
    changeSource: {
      type: String,
      required: true,
      enum: laboratorySpecimenStatusChangeSourceValues,
      immutable: true,
    },
    reasonCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
      immutable: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
    stateHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
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
    collection: 'labSpecimenStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labSpecimenStatusHistorySchema.pre(
  'validate',
  function validateLabSpecimenStatusHistory() {
    if (this.fromStatus === this.toStatus) {
      this.invalidate(
        'toStatus',
        'Laboratory specimen history must represent a state change',
      );
    }
  },
);

labSpecimenStatusHistorySchema.index(
  {
    facilityId: 1,
    labSpecimenId: 1,
    sequence: 1,
  },
  {
    name: 'uq_lab_specimen_status_history_sequence',
    unique: true,
  },
);

labSpecimenStatusHistorySchema.index(
  {
    facilityId: 1,
    labOrderId: 1,
    occurredAt: 1,
  },
  {
    name: 'ix_lab_specimen_status_history_order_time',
  },
);

export type LabSpecimen = InferSchemaType<typeof labSpecimenSchema>;

export type LabSpecimenStatusHistory = InferSchemaType<
  typeof labSpecimenStatusHistorySchema
>;

export const LabSpecimenModel =
  (mongoose.models['labSpecimens'] as Model<LabSpecimen> | undefined) ??
  mongoose.model<LabSpecimen>(
    'labSpecimens',
    labSpecimenSchema,
    'labSpecimens',
  );

export const LabSpecimenStatusHistoryModel =
  (mongoose.models['labSpecimenStatusHistories'] as
    | Model<LabSpecimenStatusHistory>
    | undefined) ??
  mongoose.model<LabSpecimenStatusHistory>(
    'labSpecimenStatusHistories',
    labSpecimenStatusHistorySchema,
    'labSpecimenStatusHistories',
  );