import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

import {
  nullablePharmacyObjectId,
  pharmacyCommonFields,
  pharmacyNonNegativeDecimal,
  pharmacyObjectIdArray,
  pharmacyTimestampedSchemaOptions,
  validateAllOrNone,
  validatePharmacyMoneyBreakdown,
} from './pharmacy-dispensing-schema-helpers.js';

import {
  dispensationReversalStatusValues,
  patientReturnDispositionValues,
  patientReturnItemStatusValues,
  patientReturnStatusValues,
  pharmacyFinalizationStateValues,
  returnedMedicineIntegrityValues,
  returnedMedicineSealStatusValues,
} from './pharmacy-dispensing.types.js';

const nullableString = {
  type: String,
  default: null,
  trim: true,
} as const;

export const patientReturnSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      returnNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      operationKey: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 8,
        maxlength: 500,
      },

      originalDispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      admissionId:
        nullablePharmacyObjectId,
      wardId:
        nullablePharmacyObjectId,

      pharmacyLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      receivingStockLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        required: true,
        enum: patientReturnStatusValues,
        default: 'DRAFT',
      },

      lineCount: {
        type: Number,
        required: true,
        min: 1,
        max: 500,
      },

      totalReturnedQuantity: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      controlledMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      witnessRequired: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      witnessStaffId:
        nullablePharmacyObjectId,

      witnessedAt: {
        type: Date,
        default: null,
      },

      requestedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      requestedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      receivedByStaffId:
        nullablePharmacyObjectId,

      receivedAt: {
        type: Date,
        default: null,
      },

      reviewedByStaffId:
        nullablePharmacyObjectId,

      reviewedAt: {
        type: Date,
        default: null,
      },

      approvedByStaffId:
        nullablePharmacyObjectId,

      approvedAt: {
        type: Date,
        default: null,
      },

      postedByStaffId:
        nullablePharmacyObjectId,

      postedAt: {
        type: Date,
        default: null,
      },

      rejectedByStaffId:
        nullablePharmacyObjectId,

      rejectedAt: {
        type: Date,
        default: null,
      },

      cancelledByStaffId:
        nullablePharmacyObjectId,

      cancelledAt: {
        type: Date,
        default: null,
      },

      reason: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      decisionReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      currency: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      grossAmount:
        pharmacyNonNegativeDecimal,
      discountAmount:
        pharmacyNonNegativeDecimal,
      taxAmount:
        pharmacyNonNegativeDecimal,
      netAmount:
        pharmacyNonNegativeDecimal,

      billingAdjustmentOperationKey: {
        ...nullableString,
        minlength: 8,
        maxlength: 500,
      },

      billingAdjustmentRecordId:
        nullablePharmacyObjectId,

      finalizationState: {
        type: String,
        required: true,
        enum: pharmacyFinalizationStateValues,
        default: 'NOT_STARTED',
      },

      finalizationAttemptCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      finalizationUpdatedAt: {
        type: Date,
        default: null,
      },

      recoveryReason: {
        ...nullableString,
        maxlength: 2_000,
        select: false,
      },

      attachmentIds:
        pharmacyObjectIdArray,
    },
    pharmacyTimestampedSchemaOptions(
      'patientReturns',
    ),
  );

patientReturnSchema.pre(
  'validate',
  function validatePatientReturn() {
    validatePositiveInventoryDecimal(
      this,
      'totalReturnedQuantity',
      this.get('totalReturnedQuantity'),
    );
    validatePharmacyMoneyBreakdown(this);

    validateAllOrNone(
      this,
      ['witnessStaffId', 'witnessedAt'],
      'Controlled-medicine return witness requires staff and timestamp',
    );

    if (
      this.get('witnessRequired') === true &&
      this.get('witnessStaffId') == null
    ) {
      this.invalidate(
        'witnessStaffId',
        'Witness-required returns require witness attribution',
      );
    }

    if (
      this.get('witnessStaffId') != null &&
      String(this.get('witnessStaffId')) ===
        String(this.get('requestedByStaffId'))
    ) {
      this.invalidate(
        'witnessStaffId',
        'Return requester and controlled-medicine witness must be different staff members',
      );
    }

    const status = String(this.get('status'));

    if (
      [
        'PENDING_REVIEW',
        'APPROVED',
        'PARTIALLY_POSTED',
        'POSTED',
      ].includes(status) &&
      (
        this.get('receivedByStaffId') == null ||
        this.get('receivedAt') == null
      )
    ) {
      this.invalidate(
        'status',
        'Received return states require receiving staff and timestamp',
      );
    }

    if (
      [
        'APPROVED',
        'PARTIALLY_POSTED',
        'POSTED',
      ].includes(status) &&
      (
        this.get('approvedByStaffId') == null ||
        this.get('approvedAt') == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved return states require approver and timestamp',
      );
    }

    if (
      status === 'POSTED' &&
      (
        this.get('postedByStaffId') == null ||
        this.get('postedAt') == null ||
        this.get('finalizationState') !== 'COMPLETED' ||
        this.get('billingAdjustmentOperationKey') == null
      )
    ) {
      this.invalidate(
        'status',
        'Posted returns require stock, billing, actor, and finalization attribution',
      );
    }

    if (
      status === 'REJECTED' &&
      (
        this.get('rejectedByStaffId') == null ||
        this.get('rejectedAt') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected returns require actor, timestamp, and reason',
      );
    }

    if (
      status === 'CANCELLED' &&
      (
        this.get('cancelledByStaffId') == null ||
        this.get('cancelledAt') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled returns require actor, timestamp, and reason',
      );
    }

    if (
      this.get('finalizationState') ===
        'RECOVERY_REQUIRED' &&
      this.get('recoveryReason') == null
    ) {
      this.invalidate(
        'recoveryReason',
        'Recovery-required returns must persist a recovery reason',
      );
    }
  },
);

patientReturnSchema.index(
  {
    facilityId: 1,
    returnNumber: 1,
  },
  {
    name: 'uq_patient_returns_number',
    unique: true,
  },
);

patientReturnSchema.index(
  {
    facilityId: 1,
    operationKey: 1,
  },
  {
    name: 'uq_patient_returns_operation_key',
    unique: true,
  },
);

patientReturnSchema.index(
  {
    facilityId: 1,
    originalDispensationId: 1,
    requestedAt: -1,
  },
  {
    name: 'ix_patient_returns_dispensation',
  },
);

patientReturnSchema.index(
  {
    facilityId: 1,
    pharmacyLocationId: 1,
    status: 1,
    requestedAt: 1,
  },
  {
    name: 'ix_patient_returns_worklist',
  },
);

export const patientReturnItemSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      patientReturnId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      originalDispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      originalDispensationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      originalAllocationId:
        nullablePharmacyObjectId,

      lineNumber: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
        max: 500,
      },

      inventoryItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      inventoryBatchId:
        nullablePharmacyObjectId,

      batchNumberSnapshot: {
        ...nullableString,
        uppercase: true,
        maxlength: 200,
        immutable: true,
      },

      expiryDateSnapshot: {
        type: Date,
        default: null,
        immutable: true,
      },

      stockUnitId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      quantity: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      controlledMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      sealStatus: {
        type: String,
        required: true,
        immutable: true,
        enum: returnedMedicineSealStatusValues,
      },

      storageIntegrity: {
        type: String,
        required: true,
        immutable: true,
        enum: returnedMedicineIntegrityValues,
      },

      coldChainIntegrity: {
        type: String,
        required: true,
        immutable: true,
        enum: returnedMedicineIntegrityValues,
      },

      contaminationRisk: {
        type: String,
        required: true,
        immutable: true,
        enum: [
          'NONE_IDENTIFIED',
          'POSSIBLE',
          'CONFIRMED',
          'UNKNOWN',
        ],
      },

      restockEligible: {
        type: Boolean,
        required: true,
        immutable: true,
      },

      disposition: {
        type: String,
        required: true,
        immutable: true,
        enum: patientReturnDispositionValues,
      },

      dispositionLocationId:
        nullablePharmacyObjectId,

      eligibilityPolicyCode: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
      },

      eligibilityPolicyVersion: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      eligibilityReason: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      status: {
        type: String,
        required: true,
        enum: patientReturnItemStatusValues,
        default: 'PENDING_REVIEW',
      },

      stockMovementIds:
        pharmacyObjectIdArray,

      grossAmount:
        pharmacyNonNegativeDecimal,
      discountAmount:
        pharmacyNonNegativeDecimal,
      taxAmount:
        pharmacyNonNegativeDecimal,
      netAmount:
        pharmacyNonNegativeDecimal,

      reviewedByStaffId:
        nullablePharmacyObjectId,

      reviewedAt: {
        type: Date,
        default: null,
      },

      postedByStaffId:
        nullablePharmacyObjectId,

      postedAt: {
        type: Date,
        default: null,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'patientReturnItems',
    ),
  );

patientReturnItemSchema.pre(
  'validate',
  function validatePatientReturnItem() {
    validatePositiveInventoryDecimal(
      this,
      'quantity',
      this.get('quantity'),
    );
    validatePharmacyMoneyBreakdown(this);

    if (
      this.get('restockEligible') === true &&
      this.get('disposition') !==
        'RESTOCK_AVAILABLE'
    ) {
      this.invalidate(
        'disposition',
        'Restock-eligible returns must use RESTOCK_AVAILABLE disposition',
      );
    }

    if (
      this.get('restockEligible') !== true &&
      this.get('disposition') ===
        'RESTOCK_AVAILABLE'
    ) {
      this.invalidate(
        'restockEligible',
        'RESTOCK_AVAILABLE disposition requires restock eligibility',
      );
    }

    if (
      this.get('disposition') !==
        'NOT_ACCEPTED' &&
      this.get('dispositionLocationId') == null
    ) {
      this.invalidate(
        'dispositionLocationId',
        'Accepted returned medicine requires an explicit inventory disposition location',
      );
    }

    if (
      this.get('controlledMedicine') === true &&
      this.get('restockEligible') === true
    ) {
      this.invalidate(
        'restockEligible',
        'Controlled-medicine patient returns cannot be automatically returned to available stock',
      );
    }

    if (
      this.get('coldChainIntegrity') ===
        'COMPROMISED' &&
      this.get('restockEligible') === true
    ) {
      this.invalidate(
        'coldChainIntegrity',
        'Cold-chain-compromised medicine is not eligible for restocking',
      );
    }

    if (
      [
        'POSSIBLE',
        'CONFIRMED',
        'UNKNOWN',
      ].includes(
        String(this.get('contaminationRisk')),
      ) &&
      this.get('restockEligible') === true
    ) {
      this.invalidate(
        'contaminationRisk',
        'Medicine with contamination risk is not eligible for restocking',
      );
    }

    validateAllOrNone(
      this,
      ['reviewedByStaffId', 'reviewedAt'],
      'Return-item review requires actor and timestamp',
    );

    validateAllOrNone(
      this,
      ['postedByStaffId', 'postedAt'],
      'Return-item posting requires actor and timestamp',
    );

    if (
      this.get('status') === 'POSTED' &&
      (
        this.get('postedAt') == null ||
        (
          this.get('stockMovementIds') as unknown[]
        ).length === 0
      )
    ) {
      this.invalidate(
        'status',
        'Posted return items require stock movement traceability',
      );
    }
  },
);

patientReturnItemSchema.index(
  {
    facilityId: 1,
    patientReturnId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_patient_return_items_line',
    unique: true,
  },
);

patientReturnItemSchema.index(
  {
    facilityId: 1,
    patientReturnId: 1,
    originalDispensationItemId: 1,
    originalAllocationId: 1,
  },
  {
    name: 'uq_patient_return_items_source',
    unique: true,
  },
);

patientReturnItemSchema.index(
  {
    facilityId: 1,
    inventoryItemId: 1,
    inventoryBatchId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_patient_return_items_batch_traceability',
  },
);

const dispensationReversalLineSchema =
  new Schema(
    {
      originalDispensationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      originalAllocationId:
        nullablePharmacyObjectId,

      stockUnitId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      quantity: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      originalStockMovementIds:
        pharmacyObjectIdArray,

      reversalStockMovementIds:
        pharmacyObjectIdArray,

      grossAmount:
        pharmacyNonNegativeDecimal,
      discountAmount:
        pharmacyNonNegativeDecimal,
      taxAmount:
        pharmacyNonNegativeDecimal,
      netAmount:
        pharmacyNonNegativeDecimal,
    },
    {
      _id: true,
      strict: true,
    },
  );

dispensationReversalLineSchema.pre(
  'validate',
  function validateDispensationReversalLine() {
    validatePositiveInventoryDecimal(
      this,
      'quantity',
      this.get('quantity'),
    );
    validatePharmacyMoneyBreakdown(this);

    if (
      (
        this.get(
          'originalStockMovementIds',
        ) as unknown[]
      ).length === 0
    ) {
      this.invalidate(
        'originalStockMovementIds',
        'Reversal lines require original stock movement traceability',
      );
    }
  },
);

export const dispensationReversalSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      reversalNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      operationKey: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 8,
        maxlength: 500,
      },

      originalDispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      pharmacyLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        required: true,
        enum: dispensationReversalStatusValues,
        default: 'REQUESTED',
      },

      lineCount: {
        type: Number,
        required: true,
        min: 1,
        max: 500,
      },

      lines: {
        type: [dispensationReversalLineSchema],
        required: true,
        default: [],
      },

      controlledMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      witnessRequired: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      witnessStaffId:
        nullablePharmacyObjectId,

      witnessedAt: {
        type: Date,
        default: null,
      },

      requestedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      requestedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      approvedByStaffId:
        nullablePharmacyObjectId,

      approvedAt: {
        type: Date,
        default: null,
      },

      postedByStaffId:
        nullablePharmacyObjectId,

      postedAt: {
        type: Date,
        default: null,
      },

      rejectedByStaffId:
        nullablePharmacyObjectId,

      rejectedAt: {
        type: Date,
        default: null,
      },

      failedAt: {
        type: Date,
        default: null,
      },

      failureCode: {
        ...nullableString,
        uppercase: true,
        maxlength: 100,
        select: false,
      },

      reason: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      decisionReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      currency: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      grossAmount:
        pharmacyNonNegativeDecimal,
      discountAmount:
        pharmacyNonNegativeDecimal,
      taxAmount:
        pharmacyNonNegativeDecimal,
      netAmount:
        pharmacyNonNegativeDecimal,

      stockReversalOperationKey: {
        ...nullableString,
        minlength: 8,
        maxlength: 500,
      },

      billingReversalOperationKey: {
        ...nullableString,
        minlength: 8,
        maxlength: 500,
      },

      billingAdjustmentRecordId:
        nullablePharmacyObjectId,

      finalizationState: {
        type: String,
        required: true,
        enum: pharmacyFinalizationStateValues,
        default: 'NOT_STARTED',
      },

      finalizationAttemptCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      finalizationUpdatedAt: {
        type: Date,
        default: null,
      },

      recoveryReason: {
        ...nullableString,
        maxlength: 2_000,
        select: false,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'dispensationReversals',
    ),
  );

dispensationReversalSchema.pre(
  'validate',
  function validateDispensationReversal() {
    validatePharmacyMoneyBreakdown(this);

    const lines = this.get('lines') as unknown[];

    if (
      lines.length !== Number(this.get('lineCount'))
    ) {
      this.invalidate(
        'lineCount',
        'Reversal line count must match reversal lines',
      );
    }

    validateAllOrNone(
      this,
      ['witnessStaffId', 'witnessedAt'],
      'Controlled-medicine reversal witness requires staff and timestamp',
    );

    if (
      this.get('witnessRequired') === true &&
      this.get('witnessStaffId') == null
    ) {
      this.invalidate(
        'witnessStaffId',
        'Witness-required reversals require witness attribution',
      );
    }

    if (
      this.get('witnessStaffId') != null &&
      String(this.get('witnessStaffId')) ===
        String(this.get('requestedByStaffId'))
    ) {
      this.invalidate(
        'witnessStaffId',
        'Reversal requester and controlled-medicine witness must be different staff members',
      );
    }

    const status = String(this.get('status'));

    if (
      [
        'APPROVED',
        'POSTED',
      ].includes(status) &&
      (
        this.get('approvedByStaffId') == null ||
        this.get('approvedAt') == null
      )
    ) {
      this.invalidate(
        'status',
        'Approved reversal states require approver and timestamp',
      );
    }

    if (
      status === 'POSTED' &&
      (
        this.get('postedByStaffId') == null ||
        this.get('postedAt') == null ||
        this.get('stockReversalOperationKey') == null ||
        this.get('billingReversalOperationKey') == null ||
        this.get('finalizationState') !== 'COMPLETED'
      )
    ) {
      this.invalidate(
        'status',
        'Posted reversals require stock, billing, actor, and finalization attribution',
      );
    }

    if (
      status === 'REJECTED' &&
      (
        this.get('rejectedByStaffId') == null ||
        this.get('rejectedAt') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected reversals require actor, timestamp, and reason',
      );
    }

    if (
      status === 'FAILED' &&
      (
        this.get('failedAt') == null ||
        this.get('failureCode') == null
      )
    ) {
      this.invalidate(
        'status',
        'Failed reversals require failure timestamp and code',
      );
    }

    if (
      this.get('finalizationState') ===
        'RECOVERY_REQUIRED' &&
      this.get('recoveryReason') == null
    ) {
      this.invalidate(
        'recoveryReason',
        'Recovery-required reversals must persist a recovery reason',
      );
    }

    if (
      status === 'POSTED' &&
      lines.some((line) => {
        const candidate = line as {
          reversalStockMovementIds?: unknown[];
        };
        return (
          candidate.reversalStockMovementIds == null ||
          candidate.reversalStockMovementIds.length === 0
        );
      })
    ) {
      this.invalidate(
        'lines',
        'Posted reversal lines require reversal stock movement traceability',
      );
    }
  },
);

dispensationReversalSchema.index(
  {
    facilityId: 1,
    reversalNumber: 1,
  },
  {
    name: 'uq_dispensation_reversals_number',
    unique: true,
  },
);

dispensationReversalSchema.index(
  {
    facilityId: 1,
    operationKey: 1,
  },
  {
    name: 'uq_dispensation_reversals_operation',
    unique: true,
  },
);

dispensationReversalSchema.index(
  {
    facilityId: 1,
    originalDispensationId: 1,
  },
  {
    name: 'uq_dispensation_reversals_active_source',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'REQUESTED',
          'APPROVED',
          'POSTED',
        ],
      },
    },
  },
);

dispensationReversalSchema.index(
  {
    facilityId: 1,
    pharmacyLocationId: 1,
    status: 1,
    requestedAt: 1,
  },
  {
    name: 'ix_dispensation_reversals_worklist',
  },
);

export type PatientReturn =
  InferSchemaType<typeof patientReturnSchema>;
export type PatientReturnItem =
  InferSchemaType<
    typeof patientReturnItemSchema
  >;
export type DispensationReversal =
  InferSchemaType<
    typeof dispensationReversalSchema
  >;

export const PatientReturnModel =
  (mongoose.models[
    'PatientReturn'
  ] as Model<PatientReturn> | undefined) ??
  mongoose.model<PatientReturn>(
    'PatientReturn',
    patientReturnSchema,
    'patientReturns',
  );

export const PatientReturnItemModel =
  (mongoose.models[
    'PatientReturnItem'
  ] as Model<PatientReturnItem> | undefined) ??
  mongoose.model<PatientReturnItem>(
    'PatientReturnItem',
    patientReturnItemSchema,
    'patientReturnItems',
  );

export const DispensationReversalModel =
  (mongoose.models[
    'DispensationReversal'
  ] as Model<DispensationReversal> | undefined) ??
  mongoose.model<DispensationReversal>(
    'DispensationReversal',
    dispensationReversalSchema,
    'dispensationReversals',
  );