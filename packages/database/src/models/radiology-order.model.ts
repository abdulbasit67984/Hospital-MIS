import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  radiologyBillingStatusValues,
  radiologyContrastRequirementValues,
  radiologyContrastRouteValues,
  radiologyLateralityRequirementValues,
  radiologyLateralityValues,
  radiologyModalityTypeValues,
  radiologyOrderItemStatusValues,
  radiologyOrderPriorityValues,
  radiologyOrderStatusChangeSourceValues,
  radiologyOrderStatusValues,
  radiologyPreparationStatusValues,
  radiologySafetyRequirementValues,
  radiologySafetyScreeningStatusValues,
} from './radiology.types.js';

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

const bodyRegionSnapshotSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const radiologyProcedureDefinitionSnapshotSchema = new Schema(
  {
    procedureId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    procedureVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    procedureCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    procedureName: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      maxlength: 10_000,
    },
    modalityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    modalityCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    modalityName: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 300,
    },
    modalityType: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyModalityTypeValues,
    },
    dicomModalityCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 16,
    },
    bodyRegions: {
      type: [bodyRegionSnapshotSchema],
      required: true,
      immutable: true,
      default: [],
    },
    lateralityRequirement: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyLateralityRequirementValues,
    },
    permittedLateralities: {
      type: [String],
      required: true,
      immutable: true,
      enum: radiologyLateralityValues,
      default: [],
    },
    contrastRequirement: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyContrastRequirementValues,
    },
    permittedContrastRoutes: {
      type: [String],
      required: true,
      immutable: true,
      enum: radiologyContrastRouteValues,
      default: [],
    },
    preparationInstructions: {
      type: [String],
      required: true,
      immutable: true,
      default: [],
    },
    contraindications: {
      type: [String],
      required: true,
      immutable: true,
      default: [],
    },
    safetyScreeningRequirements: {
      type: [String],
      required: true,
      immutable: true,
      enum: radiologySafetyRequirementValues,
      default: [],
    },
    expectedDurationMinutes: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 1_440,
    },
    routineTurnaroundMinutes: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 43_200,
    },
    urgentTurnaroundMinutes: {
      type: Number,
      default: null,
      immutable: true,
      min: 1,
      max: 43_200,
    },
    statTurnaroundMinutes: {
      type: Number,
      default: null,
      immutable: true,
      min: 1,
      max: 43_200,
    },
    availableDepartmentIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      immutable: true,
      default: [],
    },
    schedulingRequired: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    requiresTechnician: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    requiresRadiologist: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      immutable: true,
    },
    effectiveThrough: {
      type: Date,
      default: null,
      immutable: true,
    },
    capturedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

radiologyProcedureDefinitionSnapshotSchema.pre(
  'validate',
  function validateRadiologyProcedureDefinitionSnapshot() {
    this.procedureCode = normalizeCode(this.procedureCode);
    this.modalityCode = normalizeCode(this.modalityCode);
    this.dicomModalityCode = normalizeCode(this.dicomModalityCode);

    for (const bodyRegion of this.bodyRegions) {
      bodyRegion.code = normalizeCode(bodyRegion.code);
    }

    if (this.bodyRegions.length < 1) {
      this.invalidate(
        'bodyRegions',
        'Radiology procedure snapshots require at least one body region',
      );
    }

    if (
      this.effectiveThrough != null &&
      this.effectiveThrough < this.effectiveFrom
    ) {
      this.invalidate(
        'effectiveThrough',
        'Snapshot effective-through time cannot precede effective-from time',
      );
    }
  },
);

export const radiologyOrderSchema = new Schema(
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
      enum: radiologyOrderPriorityValues,
      default: 'ROUTINE',
    },
    status: {
      type: String,
      required: true,
      enum: radiologyOrderStatusValues,
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
    scheduledAt: {
      type: Date,
      default: null,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    examinationStartedAt: {
      type: Date,
      default: null,
    },
    examinationCompletedAt: {
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
    scheduledItemCount: {
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
    reportedItemCount: {
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
    collection: 'radiologyOrders',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyOrderSchema.pre('validate', function validateRadiologyOrder() {
  this.orderNumber = normalizeCode(this.orderNumber);
  this.canonicalRedirected = !this.patientId.equals(this.requestedPatientId);

  if (this.opdVisitId != null && this.registrationId == null) {
    this.invalidate(
      'registrationId',
      'OPD-linked radiology orders require a registration reference',
    );
  }

  for (const [path, count] of [
    ['activeItemCount', this.activeItemCount],
    ['scheduledItemCount', this.scheduledItemCount],
    ['completedItemCount', this.completedItemCount],
    ['reportedItemCount', this.reportedItemCount],
    ['verifiedItemCount', this.verifiedItemCount],
    ['rejectedItemCount', this.rejectedItemCount],
  ] as const) {
    if (count > this.itemCount) {
      this.invalidate(
        path,
        'Radiology order aggregate counts cannot exceed item count',
      );
    }
  }

  if (this.status === 'ORDERED') {
    if (this.acceptedAt != null || this.acceptedBy != null) {
      this.invalidate(
        'status',
        'New radiology orders cannot retain acceptance attribution',
      );
    }
  } else if (!['REJECTED', 'CANCELLED'].includes(this.status)) {
    if (this.acceptedAt == null || this.acceptedBy == null) {
      this.invalidate(
        'status',
        'Accepted radiology order states require radiology staff attribution',
      );
    }
  }

  if (this.status === 'REJECTED') {
    if (
      this.rejectedAt == null ||
      this.rejectedBy == null ||
      this.rejectionReasonCode == null ||
      this.rejectionReason == null
    ) {
      this.invalidate(
        'status',
        'Rejected radiology orders require rejection attribution and reason',
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
      'Non-rejected radiology orders cannot retain rejection metadata',
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
        'Cancelled radiology orders require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active radiology orders cannot retain cancellation metadata',
    );
  }
});

radiologyOrderSchema.index(
  {
    facilityId: 1,
    orderNumber: 1,
  },
  {
    name: 'uq_radiology_orders_facility_number',
    unique: true,
  },
);

radiologyOrderSchema.index(
  {
    facilityId: 1,
    status: 1,
    priority: 1,
    orderedAt: 1,
  },
  {
    name: 'ix_radiology_orders_worklist',
  },
);

radiologyOrderSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_radiology_orders_patient_ordered',
  },
);

radiologyOrderSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_radiology_orders_encounter_ordered',
  },
);

radiologyOrderSchema.index(
  {
    facilityId: 1,
    orderingProviderId: 1,
    orderedAt: -1,
  },
  {
    name: 'ix_radiology_orders_provider_ordered',
  },
);

export const radiologyOrderItemSchema = new Schema(
  {
    ...orderCommonFields,
    radiologyOrderId: {
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
    radiologyProcedureId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    procedureDefinitionSnapshot: {
      type: radiologyProcedureDefinitionSnapshotSchema,
      required: true,
      immutable: true,
    },
    procedureDefinitionHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/u,
    },
    requestedLaterality: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyLateralityValues,
    },
    contrastRequested: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },
    requestedContrastRoute: {
      type: String,
      default: null,
      immutable: true,
      enum: [...radiologyContrastRouteValues, null],
    },
    specialInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    priority: {
      type: String,
      required: true,
      enum: radiologyOrderPriorityValues,
      default: 'ROUTINE',
    },
    status: {
      type: String,
      required: true,
      enum: radiologyOrderItemStatusValues,
      default: 'ORDERED',
    },
    orderedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    preparationStatus: {
      type: String,
      required: true,
      enum: radiologyPreparationStatusValues,
      default: 'PENDING',
    },
    safetyScreeningStatus: {
      type: String,
      required: true,
      enum: radiologySafetyScreeningStatusValues,
      default: 'PENDING',
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    imagingStudyId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    reportId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    accessionNumber: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    externalStudyIdentifier: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    acceptedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    examinationStartedAt: {
      type: Date,
      default: null,
    },
    examinationCompletedAt: {
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
      enum: radiologyBillingStatusValues,
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
    collection: 'radiologyOrderItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyOrderItemSchema.pre('validate', function validateRadiologyOrderItem() {
  if (this.accessionNumber != null) {
    this.accessionNumber = normalizeCode(this.accessionNumber);
  }

  if (
    !this.radiologyProcedureId.equals(
      this.procedureDefinitionSnapshot.procedureId,
    )
  ) {
    this.invalidate(
      'procedureDefinitionSnapshot.procedureId',
      'Radiology order-item procedure reference must match its immutable snapshot',
    );
  }

  const snapshot = this.procedureDefinitionSnapshot;

  if (snapshot.lateralityRequirement === 'NOT_APPLICABLE') {
    if (this.requestedLaterality !== 'NOT_APPLICABLE') {
      this.invalidate(
        'requestedLaterality',
        'Non-lateral radiology procedures require NOT_APPLICABLE laterality',
      );
    }
  } else {
    if (!snapshot.permittedLateralities.includes(this.requestedLaterality)) {
      this.invalidate(
        'requestedLaterality',
        'Requested laterality is not permitted by the procedure definition snapshot',
      );
    }

    if (
      snapshot.lateralityRequirement === 'REQUIRED' &&
      this.requestedLaterality === 'UNSPECIFIED'
    ) {
      this.invalidate(
        'requestedLaterality',
        'Required-laterality radiology procedures cannot use UNSPECIFIED',
      );
    }
  }

  if (snapshot.contrastRequirement === 'NONE' && this.contrastRequested) {
    this.invalidate(
      'contrastRequested',
      'Non-contrast radiology procedures cannot request contrast',
    );
  }

  if (snapshot.contrastRequirement === 'REQUIRED' && !this.contrastRequested) {
    this.invalidate(
      'contrastRequested',
      'Required-contrast radiology procedures must request contrast',
    );
  }

  if (this.contrastRequested) {
    if (this.requestedContrastRoute == null) {
      this.invalidate(
        'requestedContrastRoute',
        'Contrast requests require a route',
      );
    } else if (
      !snapshot.permittedContrastRoutes.includes(this.requestedContrastRoute)
    ) {
      this.invalidate(
        'requestedContrastRoute',
        'Requested contrast route is not permitted by the procedure definition snapshot',
      );
    }
  } else if (this.requestedContrastRoute != null) {
    this.invalidate(
      'requestedContrastRoute',
      'Non-contrast radiology order items cannot retain a contrast route',
    );
  }

  if (this.dueAt < this.orderedAt) {
    this.invalidate(
      'dueAt',
      'Radiology order-item due time cannot precede its order time',
    );
  }

  const screeningRequired = snapshot.safetyScreeningRequirements.length > 0;
  if (!screeningRequired && this.safetyScreeningStatus !== 'NOT_REQUIRED') {
    this.invalidate(
      'safetyScreeningStatus',
      'Procedures without safety requirements must use NOT_REQUIRED screening status',
    );
  }

  if (screeningRequired && this.safetyScreeningStatus === 'NOT_REQUIRED') {
    this.invalidate(
      'safetyScreeningStatus',
      'Procedures with safety requirements cannot bypass screening',
    );
  }

  const preparationRequired = snapshot.preparationInstructions.length > 0;
  if (!preparationRequired && this.preparationStatus !== 'NOT_REQUIRED') {
    this.invalidate(
      'preparationStatus',
      'Procedures without preparation instructions must use NOT_REQUIRED preparation status',
    );
  }

  if (preparationRequired && this.preparationStatus === 'NOT_REQUIRED') {
    this.invalidate(
      'preparationStatus',
      'Procedures with preparation instructions cannot bypass preparation confirmation',
    );
  }

  if (this.status === 'ORDERED') {
    if (this.acceptedAt != null || this.acceptedBy != null) {
      this.invalidate(
        'status',
        'New radiology order items cannot retain acceptance attribution',
      );
    }
  } else if (!['REJECTED', 'CANCELLED'].includes(this.status)) {
    if (this.acceptedAt == null || this.acceptedBy == null) {
      this.invalidate(
        'status',
        'Accepted radiology order-item states require radiology staff attribution',
      );
    }
  }

  if (this.status === 'REJECTED') {
    if (
      this.rejectedAt == null ||
      this.rejectedBy == null ||
      this.rejectionReasonCode == null ||
      this.rejectionReason == null
    ) {
      this.invalidate(
        'status',
        'Rejected radiology order items require rejection attribution and reason',
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
      'Non-rejected radiology order items cannot retain rejection metadata',
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
        'Cancelled radiology order items require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active radiology order items cannot retain cancellation metadata',
    );
  }

  if (this.status === 'VERIFIED') {
    if (this.reportId == null || this.verifiedAt == null) {
      this.invalidate(
        'status',
        'Verified radiology order items require a report reference and verification time',
      );
    }
  }

  if (this.billingStatus === 'CHARGED' && this.accountChargeId == null) {
    this.invalidate(
      'billingStatus',
      'Charged radiology order items require an account charge reference',
    );
  }

  if (this.billingStatus === 'FAILED' && this.billingFailureCode == null) {
    this.invalidate(
      'billingFailureCode',
      'Failed radiology billing attempts require a safe failure code',
    );
  }
});

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    radiologyOrderId: 1,
    sequence: 1,
  },
  {
    name: 'uq_radiology_order_items_sequence',
    unique: true,
  },
);

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    accessionNumber: 1,
  },
  {
    name: 'uq_radiology_order_items_facility_accession',
    unique: true,
    partialFilterExpression: {
      accessionNumber: {
        $type: 'string',
      },
    },
  },
);

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    status: 1,
    priority: 1,
    dueAt: 1,
  },
  {
    name: 'ix_radiology_order_items_worklist',
  },
);

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    radiologyProcedureId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_radiology_order_items_patient_procedure_history',
  },
);

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    radiologyOrderId: 1,
    radiologyProcedureId: 1,
  },
  {
    name: 'ix_radiology_order_items_order_procedure',
  },
);

radiologyOrderItemSchema.index(
  {
    facilityId: 1,
    billingStatus: 1,
    createdAt: 1,
  },
  {
    name: 'ix_radiology_order_items_billing_status',
  },
);

const statusHistoryCommonFields = {
  facilityId: {
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
  changeSource: {
    type: String,
    required: true,
    immutable: true,
    enum: radiologyOrderStatusChangeSourceValues,
  },
  reasonCode: {
    type: String,
    default: null,
    immutable: true,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  reason: {
    type: String,
    default: null,
    immutable: true,
    trim: true,
    maxlength: 2_000,
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
} as const;

export const radiologyOrderStatusHistorySchema = new Schema(
  {
    ...statusHistoryCommonFields,
    radiologyOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...radiologyOrderStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyOrderStatusValues,
    },
  },
  {
    collection: 'radiologyOrderStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyOrderStatusHistorySchema.pre(
  'validate',
  function validateRadiologyOrderStatusHistory() {
    if (this.fromStatus === this.toStatus) {
      this.invalidate(
        'toStatus',
        'Radiology order status history must represent a state change',
      );
    }
  },
);

radiologyOrderStatusHistorySchema.index(
  {
    facilityId: 1,
    radiologyOrderId: 1,
    sequence: 1,
  },
  {
    name: 'uq_radiology_order_status_histories_sequence',
    unique: true,
  },
);

radiologyOrderStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_radiology_order_status_histories_patient_time',
  },
);

export const radiologyOrderItemStatusHistorySchema = new Schema(
  {
    ...statusHistoryCommonFields,
    radiologyOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    radiologyOrderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...radiologyOrderItemStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: radiologyOrderItemStatusValues,
    },
  },
  {
    collection: 'radiologyOrderItemStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

radiologyOrderItemStatusHistorySchema.pre(
  'validate',
  function validateRadiologyOrderItemStatusHistory() {
    if (this.fromStatus === this.toStatus) {
      this.invalidate(
        'toStatus',
        'Radiology order-item status history must represent a state change',
      );
    }
  },
);

radiologyOrderItemStatusHistorySchema.index(
  {
    facilityId: 1,
    radiologyOrderItemId: 1,
    sequence: 1,
  },
  {
    name: 'uq_radiology_order_item_status_histories_sequence',
    unique: true,
  },
);

radiologyOrderItemStatusHistorySchema.index(
  {
    facilityId: 1,
    radiologyOrderId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_radiology_order_item_status_histories_order_time',
  },
);

export type RadiologyProcedureDefinitionSnapshot = InferSchemaType<
  typeof radiologyProcedureDefinitionSnapshotSchema
>;
export type RadiologyOrder = InferSchemaType<typeof radiologyOrderSchema>;
export type RadiologyOrderItem = InferSchemaType<
  typeof radiologyOrderItemSchema
>;
export type RadiologyOrderStatusHistory = InferSchemaType<
  typeof radiologyOrderStatusHistorySchema
>;
export type RadiologyOrderItemStatusHistory = InferSchemaType<
  typeof radiologyOrderItemStatusHistorySchema
>;

export const RadiologyOrderModel =
  (mongoose.models['radiologyOrders'] as Model<RadiologyOrder> | undefined) ??
  mongoose.model<RadiologyOrder>(
    'radiologyOrders',
    radiologyOrderSchema,
    'radiologyOrders',
  );

export const RadiologyOrderItemModel =
  (mongoose.models['radiologyOrderItems'] as
    | Model<RadiologyOrderItem>
    | undefined) ??
  mongoose.model<RadiologyOrderItem>(
    'radiologyOrderItems',
    radiologyOrderItemSchema,
    'radiologyOrderItems',
  );

export const RadiologyOrderStatusHistoryModel =
  (mongoose.models['radiologyOrderStatusHistories'] as
    | Model<RadiologyOrderStatusHistory>
    | undefined) ??
  mongoose.model<RadiologyOrderStatusHistory>(
    'radiologyOrderStatusHistories',
    radiologyOrderStatusHistorySchema,
    'radiologyOrderStatusHistories',
  );

export const RadiologyOrderItemStatusHistoryModel =
  (mongoose.models['radiologyOrderItemStatusHistories'] as
    | Model<RadiologyOrderItemStatusHistory>
    | undefined) ??
  mongoose.model<RadiologyOrderItemStatusHistory>(
    'radiologyOrderItemStatusHistories',
    radiologyOrderItemStatusHistorySchema,
    'radiologyOrderItemStatusHistories',
  );