import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  laboratoryBillingStatusValues,
  laboratoryOrderItemStatusValues,
  laboratoryOrderPriorityValues,
  laboratoryOrderStatusChangeSourceValues,
  laboratoryOrderStatusValues,
  laboratoryResultValueTypeValues,
} from './laboratory.types.js';

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

const orderCommonFields = {
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

const specimenRequirementSnapshotSchema = new Schema(
  {
    requirementCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    specimenTypeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    specimenTypeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    containerCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    containerName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    minimumVolume: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    volumeUnitCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    fastingRequired: {
      type: Boolean,
      required: true,
      default: false,
    },
    collectionInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    handlingInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    maximumTransportMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 43_200,
    },
    preferred: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const resultComponentSnapshotSchema = new Schema(
  {
    componentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    valueType: {
      type: String,
      required: true,
      enum: laboratoryResultValueTypeValues,
    },
    unitCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    unitName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    decimalScale: {
      type: Number,
      required: true,
      min: 0,
      max: 12,
      default: 2,
    },
    required: {
      type: Boolean,
      required: true,
      default: true,
    },
    displayOrder: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    referenceRangesSnapshot: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
      select: false,
    },
    structuredSchemaKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const labOrderSchema = new Schema(
  {
    ...orderCommonFields,
    orderNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    requestedPatientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    canonicalRedirected: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    registrationId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    opdVisitId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    queueTokenId: {
      type: Schema.Types.ObjectId,
      default: null,
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
      immutable: true,
    },
    servicePointId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    orderingProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    priority: {
      type: String,
      required: true,
      enum: laboratoryOrderPriorityValues,
      default: 'ROUTINE',
    },
    status: {
      type: String,
      required: true,
      enum: laboratoryOrderStatusValues,
      default: 'ORDERED',
    },
    clinicalIndication: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    orderingNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 10_000,
      select: false,
    },
    orderedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    collectionCompletedAt: {
      type: Date,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
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
    itemCount: {
      type: Number,
      required: true,
      min: 1,
    },
    activeItemCount: {
      type: Number,
      required: true,
      min: 0,
    },
    collectedItemCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    completedItemCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    verifiedItemCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    rejectedItemCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    criticalResultCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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
    collection: 'labOrders',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labOrderSchema.pre('validate', function validateLabOrder() {
  this.orderNumber = normalizeCode(this.orderNumber);
  this.canonicalRedirected = !this.patientId.equals(this.requestedPatientId);

  if (this.opdVisitId != null && this.registrationId == null) {
    this.invalidate(
      'registrationId',
      'OPD-linked laboratory orders require a registration reference',
    );
  }

  if (this.activeItemCount > this.itemCount) {
    this.invalidate(
      'activeItemCount',
      'Active laboratory order item count cannot exceed total item count',
    );
  }

  for (const [path, count] of [
    ['collectedItemCount', this.collectedItemCount],
    ['completedItemCount', this.completedItemCount],
    ['verifiedItemCount', this.verifiedItemCount],
    ['rejectedItemCount', this.rejectedItemCount],
  ] as const) {
    if (count > this.itemCount) {
      this.invalidate(
        path,
        'Laboratory order aggregate counts cannot exceed item count',
      );
    }
  }

  if (
    this.status === 'ORDERED' &&
    (this.acceptedAt != null || this.acceptedBy != null)
  ) {
    this.invalidate(
      'status',
      'New laboratory orders cannot retain acceptance attribution',
    );
  }

  if (this.status !== 'ORDERED' && this.status !== 'CANCELLED') {
    if (this.acceptedAt == null || this.acceptedBy == null) {
      this.invalidate(
        'status',
        'Accepted laboratory order states require laboratory staff attribution',
      );
    }
  }

  if (this.status === 'CANCELLED') {
    if (
      this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null
    ) {
      this.invalidate(
        'status',
        'Cancelled laboratory orders require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active laboratory orders cannot retain cancellation metadata',
    );
  }

  if (
    this.status === 'SAMPLE_COLLECTED' &&
    this.collectionCompletedAt == null
  ) {
    this.invalidate(
      'collectionCompletedAt',
      'Sample-collected laboratory orders require a collection completion time',
    );
  }

  if (this.status === 'IN_PROGRESS' && this.processingStartedAt == null) {
    this.invalidate(
      'processingStartedAt',
      'In-progress laboratory orders require a processing start time',
    );
  }

  if (
    (this.status === 'COMPLETED' || this.status === 'VERIFIED') &&
    this.completedAt == null
  ) {
    this.invalidate(
      'completedAt',
      'Completed laboratory orders require a completion time',
    );
  }

  if (this.status === 'VERIFIED' && this.verifiedAt == null) {
    this.invalidate(
      'verifiedAt',
      'Verified laboratory orders require a verification time',
    );
  }
});

labOrderSchema.index(
  {
    facilityId: 1,
    orderNumber: 1,
  },
  {
    name: 'uq_lab_orders_facility_number',
    unique: true,
  },
);

labOrderSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_lab_orders_patient_ordered',
  },
);

labOrderSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_lab_orders_encounter_ordered',
  },
);

labOrderSchema.index(
  {
    facilityId: 1,
    departmentId: 1,
    status: 1,
    priority: 1,
    orderedAt: 1,
  },
  {
    name: 'ix_lab_orders_worklist',
  },
);

labOrderSchema.index(
  {
    facilityId: 1,
    orderingProviderId: 1,
    status: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_lab_orders_provider_status',
  },
);

export const labOrderItemSchema = new Schema(
  {
    ...orderCommonFields,
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
    labTestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    testCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    testNameSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 500,
    },
    categoryCodeSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    categoryNameSnapshot: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 300,
    },
    methodCodeSnapshot: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    methodNameSnapshot: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 500,
    },
    requiresSpecimen: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    specimenRequirementsSnapshot: {
      type: [specimenRequirementSnapshotSchema],
      required: true,
      immutable: true,
      default: [],
    },
    resultComponentsSnapshot: {
      type: [resultComponentSnapshotSchema],
      required: true,
      immutable: true,
      default: [],
      select: false,
    },
    testDefinitionHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 64,
      maxlength: 128,
      select: false,
    },
    turnaroundMinutes: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 43_200,
    },
    dueAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: laboratoryOrderItemStatusValues,
      default: 'ORDERED',
    },
    activeSpecimenId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    specimenCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    recollectionCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    resultId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
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
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    accountChargeId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    billingStatus: {
      type: String,
      required: true,
      enum: laboratoryBillingStatusValues,
      default: 'NOT_REQUESTED',
    },
    billingFailureCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
  },
  {
    collection: 'labOrderItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labOrderItemSchema.pre('validate', function validateLabOrderItem() {
  this.testCodeSnapshot = normalizeCode(this.testCodeSnapshot);
  this.categoryCodeSnapshot = normalizeCode(this.categoryCodeSnapshot);

  if (
    this.requiresSpecimen &&
    this.specimenRequirementsSnapshot.length < 1
  ) {
    this.invalidate(
      'specimenRequirementsSnapshot',
      'Specimen-based laboratory order items require a specimen requirement snapshot',
    );
  }

  if (
    !this.requiresSpecimen &&
    this.specimenRequirementsSnapshot.length > 0
  ) {
    this.invalidate(
      'specimenRequirementsSnapshot',
      'Non-specimen laboratory order items cannot retain specimen requirements',
    );
  }

  if (this.resultComponentsSnapshot.length < 1) {
    this.invalidate(
      'resultComponentsSnapshot',
      'Laboratory order items require a result definition snapshot',
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
        'Cancelled laboratory order items require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active laboratory order items cannot retain cancellation metadata',
    );
  }

  const rejected =
    this.status === 'REJECTED' ||
    this.status === 'RECOLLECTION_REQUIRED';

  if (rejected) {
    if (
      this.rejectedAt == null ||
      this.rejectedBy == null ||
      this.rejectionReasonCode == null ||
      this.rejectionReason == null
    ) {
      this.invalidate(
        'status',
        'Rejected or recollection-required order items require rejection attribution and reason',
      );
    }
  } else if (
    this.rejectedAt != null ||
    this.rejectedBy != null ||
    this.rejectionReasonCode != null ||
    this.rejectionReason != null
  ) {
    this.invalidate(
      'status',
      'Non-rejected laboratory order items cannot retain rejection metadata',
    );
  }

  if (
    this.status === 'VERIFIED' &&
    (this.resultId == null || this.verifiedAt == null)
  ) {
    this.invalidate(
      'status',
      'Verified laboratory order items require a verified result reference',
    );
  }

  if (this.billingStatus === 'CHARGED' && this.accountChargeId == null) {
    this.invalidate(
      'billingStatus',
      'Charged laboratory order items require an account charge reference',
    );
  }

  if (this.billingStatus === 'FAILED' && this.billingFailureCode == null) {
    this.invalidate(
      'billingFailureCode',
      'Failed laboratory billing attempts require a safe failure code',
    );
  }
});

labOrderItemSchema.index(
  {
    facilityId: 1,
    labOrderId: 1,
    sequence: 1,
  },
  {
    name: 'uq_lab_order_items_sequence',
    unique: true,
  },
);

labOrderItemSchema.index(
  {
    facilityId: 1,
    labOrderId: 1,
    labTestId: 1,
  },
  {
    name: 'uq_lab_order_items_test',
    unique: true,
  },
);

labOrderItemSchema.index(
  {
    facilityId: 1,
    status: 1,
    dueAt: 1,
  },
  {
    name: 'ix_lab_order_items_status_due',
  },
);

labOrderItemSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    labTestId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_lab_order_items_patient_test_history',
  },
);

labOrderItemSchema.index(
  {
    facilityId: 1,
    activeSpecimenId: 1,
  },
  {
    name: 'ix_lab_order_items_active_specimen',
    partialFilterExpression: {
      activeSpecimenId: {
        $type: 'objectId',
      },
    },
  },
);

labOrderItemSchema.index(
  {
    facilityId: 1,
    billingStatus: 1,
    createdAt: 1,
  },
  {
    name: 'ix_lab_order_items_billing_status',
  },
);

export const labOrderStatusHistorySchema = new Schema(
  {
    facilityId: {
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
      enum: [...laboratoryOrderStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: laboratoryOrderStatusValues,
      immutable: true,
    },
    changeSource: {
      type: String,
      required: true,
      enum: laboratoryOrderStatusChangeSourceValues,
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
    collection: 'labOrderStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labOrderStatusHistorySchema.pre(
  'validate',
  function validateLabOrderStatusHistory() {
    if (this.fromStatus === this.toStatus) {
      this.invalidate(
        'toStatus',
        'Laboratory order status history must represent a state change',
      );
    }
  },
);

labOrderStatusHistorySchema.index(
  {
    facilityId: 1,
    labOrderId: 1,
    sequence: 1,
  },
  {
    name: 'uq_lab_order_status_histories_sequence',
    unique: true,
  },
);

labOrderStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_lab_order_status_histories_patient_time',
  },
);

export type LabOrder = InferSchemaType<typeof labOrderSchema>;
export type LabOrderItem = InferSchemaType<typeof labOrderItemSchema>;
export type LabOrderStatusHistory = InferSchemaType<
  typeof labOrderStatusHistorySchema
>;

export const LabOrderModel =
  (mongoose.models['labOrders'] as Model<LabOrder> | undefined) ??
  mongoose.model<LabOrder>('labOrders', labOrderSchema, 'labOrders');

export const LabOrderItemModel =
  (mongoose.models['labOrderItems'] as Model<LabOrderItem> | undefined) ??
  mongoose.model<LabOrderItem>(
    'labOrderItems',
    labOrderItemSchema,
    'labOrderItems',
  );

export const LabOrderStatusHistoryModel =
  (mongoose.models['labOrderStatusHistories'] as
    | Model<LabOrderStatusHistory>
    | undefined) ??
  mongoose.model<LabOrderStatusHistory>(
    'labOrderStatusHistories',
    labOrderStatusHistorySchema,
    'labOrderStatusHistories',
  );