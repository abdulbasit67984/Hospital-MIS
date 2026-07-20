import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  bedAssignmentStatusValues,
  bedAssignmentTypeValues,
  bedChargeSegmentStatusValues,
  bedHoldStatusValues,
  bedHoldTypeValues,
  bedReleaseReasonValues,
  bedStatusChangeReasonValues,
  inpatientBedStatusValues,
} from './inpatient.types.js';

import {
  chargingPolicySchema,
  inpatientCommonFields,
  normalizeCode,
} from './inpatient-schema-helpers.js';

function decimalNumber(
  value: mongoose.Types.Decimal128,
): number {
  return Number(
    value.toString(),
  );
}

export const bedHoldSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      holdNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      bedId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      roomId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      wardId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      admissionRecommendationId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
        select: false,
      },

      holdType: {
        type: String,
        required: true,
        enum: bedHoldTypeValues,
      },

      status: {
        type: String,
        required: true,
        enum: bedHoldStatusValues,
        default: 'ACTIVE',
      },

      isActive: {
        type: Boolean,
        required: true,
        default: true,
      },

      heldAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      expiresAt: {
        type: Date,
        required: true,
      },

      heldBy: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      heldByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      reasonCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
      },

      reason: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 5_000,
        select: false,
      },

      consumedAt: {
        type: Date,
        default: null,
      },

      consumedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      admissionBedAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      endedAt: {
        type: Date,
        default: null,
      },

      endedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      endingReason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        select: false,
      },
    },
    {
      collection: 'bedHolds',
      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

bedHoldSchema.pre(
  'validate',
  function validateBedHold() {
    this.holdNumber =
      normalizeCode(
        this.holdNumber,
      );

    this.reasonCode =
      normalizeCode(
        this.reasonCode,
      );

    if (
      this.expiresAt <= this.heldAt
    ) {
      this.invalidate(
        'expiresAt',
        'Bed-hold expiry must follow hold creation time',
      );
    }

    if (
      this.admissionId == null &&
      this.admissionRecommendationId ==
        null
    ) {
      this.invalidate(
        'admissionId',
        'Bed holds require an admission or admission recommendation reference',
      );
    }

    const activeStatus =
      this.status === 'ACTIVE';

    if (
      this.isActive !== activeStatus
    ) {
      this.invalidate(
        'isActive',
        'Bed-hold activity projection must match status',
      );
    }

    if (
      this.status === 'CONSUMED' &&
      (
        this.consumedAt == null ||
        this.consumedBy == null ||
        this
          .admissionBedAssignmentId ==
          null
      )
    ) {
      this.invalidate(
        'status',
        'Consumed bed holds require assignment and consumption attribution',
      );
    }

    if (
      !activeStatus &&
      this.status !== 'CONSUMED' &&
      (
        this.endedAt == null ||
        this.endedBy == null ||
        this.endingReason == null
      )
    ) {
      this.invalidate(
        'status',
        'Ended bed holds require ending attribution and reason',
      );
    }
  },
);

bedHoldSchema.index(
  {
    facilityId: 1,
    holdNumber: 1,
  },
  {
    name:
      'uq_bed_holds_facility_number',
    unique: true,
  },
);

bedHoldSchema.index(
  {
    facilityId: 1,
    bedId: 1,
  },
  {
    name:
      'uq_bed_holds_active_bed',

    unique: true,

    partialFilterExpression: {
      isActive: true,
    },
  },
);

bedHoldSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    status: 1,
    heldAt: -1,
  },
  {
    name:
      'ix_bed_holds_admission_status',
  },
);

bedHoldSchema.index(
  {
    facilityId: 1,
    status: 1,
    expiresAt: 1,
  },
  {
    name:
      'ix_bed_holds_expiry_worklist',
  },
);

export const admissionBedAssignmentSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      assignmentNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
        select: false,
      },

      sequence: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      assignmentType: {
        type: String,
        required: true,
        enum: bedAssignmentTypeValues,
      },

      status: {
        type: String,
        required: true,
        enum:
          bedAssignmentStatusValues,
        default: 'ACTIVE',
      },

      isActive: {
        type: Boolean,
        required: true,
        default: true,
      },

      wardId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      roomId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      bedId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      wardCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      wardNameSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        maxlength: 300,
      },

      roomCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      roomNumberSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      bedCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      bedNumberSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      bedCategorySnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 80,
      },

      bedHoldId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      previousAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      assignedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      assignedBy: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      assignedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      releasedAt: {
        type: Date,
        default: null,
      },

      releasedBy: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      releasedByStaffId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      releaseReasonCode: {
        type: String,
        default: null,
        enum: bedReleaseReasonValues,
      },

      releaseReason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        select: false,
      },

      nextAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      turnaroundRequired: {
        type: Boolean,
        required: true,
        default: true,
      },

      bedChargeSegmentId: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },
    {
      collection:
        'admissionBedAssignments',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

admissionBedAssignmentSchema.pre(
  'validate',
  function validateAdmissionBedAssignment() {
    this.assignmentNumber =
      normalizeCode(
        this.assignmentNumber,
      );

    this.wardCodeSnapshot =
      normalizeCode(
        this.wardCodeSnapshot,
      );

    this.roomCodeSnapshot =
      normalizeCode(
        this.roomCodeSnapshot,
      );

    this.roomNumberSnapshot =
      normalizeCode(
        this.roomNumberSnapshot,
      );

    this.bedCodeSnapshot =
      normalizeCode(
        this.bedCodeSnapshot,
      );

    this.bedNumberSnapshot =
      normalizeCode(
        this.bedNumberSnapshot,
      );

    this.bedCategorySnapshot =
      normalizeCode(
        this.bedCategorySnapshot,
      );

    const activeStatus =
      this.status === 'ACTIVE';

    if (
      this.isActive !== activeStatus
    ) {
      this.invalidate(
        'isActive',
        'Bed-assignment activity projection must match status',
      );
    }

    if (activeStatus) {
      if (
        this.releasedAt != null ||
        this.releasedBy != null ||
        this.releasedByStaffId != null ||
        this.releaseReasonCode != null ||
        this.nextAssignmentId != null
      ) {
        this.invalidate(
          'status',
          'Active bed assignments cannot retain release metadata',
        );
      }
    } else if (
      this.status === 'COMPLETED' &&
      (
        this.releasedAt == null ||
        this.releasedBy == null ||
        this.releasedByStaffId == null ||
        this.releaseReasonCode == null
      )
    ) {
      this.invalidate(
        'status',
        'Completed bed assignments require release attribution and reason',
      );
    }

    if (
      this.releasedAt != null &&
      this.releasedAt <=
        this.assignedAt
    ) {
      this.invalidate(
        'releasedAt',
        'Bed-assignment release time must follow assignment time',
      );
    }

    if (
      this.assignmentType !==
        'INITIAL' &&
      this.previousAssignmentId == null
    ) {
      this.invalidate(
        'previousAssignmentId',
        'Transfer and temporary assignments require the previous assignment reference',
      );
    }
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    assignmentNumber: 1,
  },
  {
    name:
      'uq_admission_bed_assignments_facility_number',

    unique: true,
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    sequence: 1,
  },
  {
    name:
      'uq_admission_bed_assignments_sequence',

    unique: true,
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    bedId: 1,
  },
  {
    name:
      'uq_admission_bed_assignments_active_bed',

    unique: true,

    partialFilterExpression: {
      isActive: true,
    },
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
  },
  {
    name:
      'uq_admission_bed_assignments_active_admission',

    unique: true,

    partialFilterExpression: {
      isActive: true,
    },
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    assignedAt: 1,
  },
  {
    name:
      'ix_admission_bed_assignments_timeline',
  },
);

admissionBedAssignmentSchema.index(
  {
    facilityId: 1,
    wardId: 1,
    status: 1,
    assignedAt: -1,
  },
  {
    name:
      'ix_admission_bed_assignments_ward_occupancy',
  },
);

export const bedStatusHistorySchema =
  new Schema(
    {
      ...inpatientCommonFields,

      bedId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      wardId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      roomId: {
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
        immutable: true,
        enum: inpatientBedStatusValues,
      },

      toStatus: {
        type: String,
        required: true,
        immutable: true,
        enum: inpatientBedStatusValues,
      },

      reasonCode: {
        type: String,
        required: true,
        immutable: true,
        enum:
          bedStatusChangeReasonValues,
      },

      reason: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        maxlength: 5_000,
        select: false,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      admissionBedAssignmentId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      bedHoldId: {
        type: Schema.Types.ObjectId,
        default: null,
        immutable: true,
      },

      maintenanceReference: {
        type: String,
        default: null,
        immutable: true,
        trim: true,
        maxlength: 200,
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

      performedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },
    },
    {
      collection:
        'bedStatusHistories',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

bedStatusHistorySchema.pre(
  'validate',
  function validateBedStatusHistory() {
    if (
      this.sequence === 1 &&
      this.fromStatus != null
    ) {
      this.invalidate(
        'fromStatus',
        'The first bed-status history entry cannot have a prior status',
      );
    }

    if (
      this.sequence > 1 &&
      this.fromStatus == null
    ) {
      this.invalidate(
        'fromStatus',
        'Subsequent bed-status history entries require a prior status',
      );
    }

    if (
      this.fromStatus ===
        this.toStatus &&
      ![
        'CORRECTION',
        'RECOVERY',
      ].includes(this.reasonCode)
    ) {
      this.invalidate(
        'toStatus',
        'Bed status may remain unchanged only for correction or recovery history',
      );
    }

    if (
      this.toStatus === 'OCCUPIED' &&
      (
        this.admissionId == null ||
        this
          .admissionBedAssignmentId ==
          null
      )
    ) {
      this.invalidate(
        'toStatus',
        'Occupied bed history requires admission and assignment references',
      );
    }

    if (
      this.toStatus === 'RESERVED' &&
      this.bedHoldId == null
    ) {
      this.invalidate(
        'bedHoldId',
        'Reserved bed history requires a hold reference',
      );
    }

    if (
      this.toStatus ===
        'MAINTENANCE' &&
      this.maintenanceReference == null
    ) {
      this.invalidate(
        'maintenanceReference',
        'Maintenance history requires a maintenance reference',
      );
    }
  },
);

bedStatusHistorySchema.index(
  {
    facilityId: 1,
    bedId: 1,
    sequence: 1,
  },
  {
    name:
      'uq_bed_status_histories_sequence',

    unique: true,
  },
);

bedStatusHistorySchema.index(
  {
    facilityId: 1,
    wardId: 1,
    occurredAt: -1,
  },
  {
    name:
      'ix_bed_status_histories_ward_time',
  },
);

bedStatusHistorySchema.index(
  {
    facilityId: 1,
    toStatus: 1,
    occurredAt: -1,
  },
  {
    name:
      'ix_bed_status_histories_status_time',
  },
);

export const bedChargeSegmentSchema =
  new Schema(
    {
      ...inpatientCommonFields,

      segmentNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      admissionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      admissionBedAssignmentId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
        select: false,
      },

      wardId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      roomId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      bedId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      bedRateId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      bedRateVersionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      bedRateVersionNumber: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      rateCodeSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
      },

      currencyCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      unitRate: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
        min: 0,
      },

      chargingPolicySnapshot: {
        type: chargingPolicySchema,
        required: true,
        immutable: true,
      },

      startedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      endedAt: {
        type: Date,
        default: null,
      },

      isOpen: {
        type: Boolean,
        required: true,
        default: true,
      },

      billableMinutes: {
        type: Number,
        default: null,
        min: 0,
        max: 52_560_000,
      },

      quantity: {
        type: Schema.Types.Decimal128,
        default: null,
        min: 0,
      },

      grossAmount: {
        type: Schema.Types.Decimal128,
        default: null,
        min: 0,
      },

      status: {
        type: String,
        required: true,
        enum:
          bedChargeSegmentStatusValues,
        default: 'OPEN',
      },

      billingRequestId: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      billingChargeReference: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      billedAt: {
        type: Date,
        default: null,
      },

      reversalRequestId: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      reversalReference: {
        type: String,
        default: null,
        trim: true,
        maxlength: 200,
      },

      reversedAt: {
        type: Date,
        default: null,
      },

      correctionReason: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5_000,
        select: false,
      },
    },
    {
      collection:
        'bedChargeSegments',

      strict: true,
      timestamps: true,
      versionKey: false,
    },
  );

bedChargeSegmentSchema.pre(
  'validate',
  function validateBedChargeSegment() {
    this.segmentNumber =
      normalizeCode(
        this.segmentNumber,
      );

    this.rateCodeSnapshot =
      normalizeCode(
        this.rateCodeSnapshot,
      );

    this.currencyCode =
      normalizeCode(
        this.currencyCode,
      );

    const unitRate = decimalNumber(
      this.unitRate,
    );

    if (
      !Number.isFinite(unitRate) ||
      unitRate < 0
    ) {
      this.invalidate(
        'unitRate',
        'Bed charge unit rate must be a non-negative finite decimal value',
      );
    }

    if (
      this.endedAt != null &&
      this.endedAt <= this.startedAt
    ) {
      this.invalidate(
        'endedAt',
        'Bed charge segment end time must follow start time',
      );
    }

    if (
      this.isOpen !==
      (this.status === 'OPEN')
    ) {
      this.invalidate(
        'isOpen',
        'Bed charge open projection must match status',
      );
    }

    if (
      this.status !== 'OPEN' &&
      (
        this.endedAt == null ||
        this.billableMinutes == null ||
        this.quantity == null ||
        this.grossAmount == null
      )
    ) {
      this.invalidate(
        'status',
        'Closed bed charge segments require end time and calculated charge values',
      );
    }

    if (
      this.quantity != null &&
      !Number.isFinite(
        decimalNumber(this.quantity),
      )
    ) {
      this.invalidate(
        'quantity',
        'Bed charge quantity must be a finite decimal value',
      );
    }

    if (
      this.grossAmount != null &&
      !Number.isFinite(
        decimalNumber(
          this.grossAmount,
        ),
      )
    ) {
      this.invalidate(
        'grossAmount',
        'Bed charge gross amount must be a finite decimal value',
      );
    }

    if (
      this.status === 'BILLED' &&
      (
        this.billingRequestId == null ||
        this
          .billingChargeReference ==
          null ||
        this.billedAt == null
      )
    ) {
      this.invalidate(
        'status',
        'Billed charge segments require billing boundary references',
      );
    }

    if (
      this.status === 'REVERSED' &&
      (
        this.reversalRequestId == null ||
        this.reversalReference == null ||
        this.reversedAt == null
      )
    ) {
      this.invalidate(
        'status',
        'Reversed charge segments require reversal boundary references',
      );
    }
  },
);

bedChargeSegmentSchema.index(
  {
    facilityId: 1,
    segmentNumber: 1,
  },
  {
    name:
      'uq_bed_charge_segments_facility_number',

    unique: true,
  },
);

bedChargeSegmentSchema.index(
  {
    facilityId: 1,
    admissionBedAssignmentId: 1,
  },
  {
    name:
      'uq_bed_charge_segments_open_assignment',

    unique: true,

    partialFilterExpression: {
      isOpen: true,
    },
  },
);

bedChargeSegmentSchema.index(
  {
    facilityId: 1,
    admissionId: 1,
    startedAt: 1,
  },
  {
    name:
      'ix_bed_charge_segments_admission_timeline',
  },
);

bedChargeSegmentSchema.index(
  {
    facilityId: 1,
    status: 1,
    endedAt: 1,
  },
  {
    name:
      'ix_bed_charge_segments_billing_worklist',
  },
);

bedChargeSegmentSchema.index(
  {
    facilityId: 1,
    billingRequestId: 1,
  },
  {
    name:
      'uq_bed_charge_segments_billing_request',

    unique: true,

    partialFilterExpression: {
      billingRequestId: {
        $type: 'string',
      },
    },
  },
);

export type BedHold =
  InferSchemaType<
    typeof bedHoldSchema
  >;

export type AdmissionBedAssignment =
  InferSchemaType<
    typeof admissionBedAssignmentSchema
  >;

export type BedStatusHistory =
  InferSchemaType<
    typeof bedStatusHistorySchema
  >;

export type BedChargeSegment =
  InferSchemaType<
    typeof bedChargeSegmentSchema
  >;

export const BedHoldModel =
  (
    mongoose.models[
      'bedHolds'
    ] as Model<BedHold> | undefined
  ) ??
  mongoose.model<BedHold>(
    'bedHolds',
    bedHoldSchema,
    'bedHolds',
  );

export const AdmissionBedAssignmentModel =
  (
    mongoose.models[
      'admissionBedAssignments'
    ] as
      | Model<AdmissionBedAssignment>
      | undefined
  ) ??
  mongoose.model<AdmissionBedAssignment>(
    'admissionBedAssignments',
    admissionBedAssignmentSchema,
    'admissionBedAssignments',
  );

export const BedStatusHistoryModel =
  (
    mongoose.models[
      'bedStatusHistories'
    ] as
      | Model<BedStatusHistory>
      | undefined
  ) ??
  mongoose.model<BedStatusHistory>(
    'bedStatusHistories',
    bedStatusHistorySchema,
    'bedStatusHistories',
  );

export const BedChargeSegmentModel =
  (
    mongoose.models[
      'bedChargeSegments'
    ] as
      | Model<BedChargeSegment>
      | undefined
  ) ??
  mongoose.model<BedChargeSegment>(
    'bedChargeSegments',
    bedChargeSegmentSchema,
    'bedChargeSegments',
  );