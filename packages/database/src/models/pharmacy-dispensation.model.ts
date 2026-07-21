import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  compareInventoryDecimals,
  decimalPartsEqual,
  inventoryDecimalParts,
  sumInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

import {
  nullablePharmacyObjectId,
  pharmacyCommonFields,
  pharmacyDecimalProductEquals,
  pharmacyNonNegativeDecimal,
  pharmacyObjectIdArray,
  pharmacyTimestampedSchemaOptions,
  validateAllOrNone,
  validatePharmacyMoneyBreakdown,
} from './pharmacy-dispensing-schema-helpers.js';

import {
  dispensationAllocationStatusValues,
  dispensationContextValues,
  dispensationItemStatusValues,
  dispensationPriorityValues,
  dispensationStatusChangeSourceValues,
  dispensationStatusValues,
  dispensationSubstitutionStatusValues,
  dispensationSubstitutionTypeValues,
  pharmacyFinalizationStateValues,
  pharmacyReviewActionValues,
  pharmacyReviewOutcomeValues,
  pharmacyReviewScopeValues,
  pharmacySafetyAlertDispositionValues,
  pharmacySafetyAlertSeverityValues,
  pharmacySafetyAlertTypeValues,
  pharmacySpecialHandlingValues,
} from './pharmacy-dispensing.types.js';

const nullableString = {
  type: String,
  default: null,
  trim: true,
} as const;

const pharmacySafetyAlertSnapshotSchema =
  new Schema(
    {
      alertFingerprint: {
        type: String,
        required: true,
        trim: true,
        minlength: 16,
        maxlength: 256,
      },

      alertType: {
        type: String,
        required: true,
        enum: pharmacySafetyAlertTypeValues,
      },

      severity: {
        type: String,
        required: true,
        enum: pharmacySafetyAlertSeverityValues,
      },

      disposition: {
        type: String,
        required: true,
        enum: pharmacySafetyAlertDispositionValues,
      },

      code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
      },

      message: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 5_000,
        select: false,
      },

      sourceEntityType: {
        type: String,
        default: null,
        trim: true,
        maxlength: 100,
      },

      sourceEntityId: nullablePharmacyObjectId,

      detectedAt: {
        type: Date,
        required: true,
      },

      acknowledgedByStaffId:
        nullablePharmacyObjectId,

      acknowledgedAt: {
        type: Date,
        default: null,
      },

      acknowledgementReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },
    },
    {
      _id: true,
      strict: true,
    },
  );

pharmacySafetyAlertSnapshotSchema.pre(
  'validate',
  function validateSafetyAlertSnapshot() {
    validateAllOrNone(
      this,
      [
        'acknowledgedByStaffId',
        'acknowledgedAt',
        'acknowledgementReason',
      ],
      'Safety-alert acknowledgement requires actor, timestamp, and reason',
    );

    if (
      this.get('disposition') ===
        'ACKNOWLEDGED' &&
      this.get('acknowledgedAt') == null
    ) {
      this.invalidate(
        'disposition',
        'Acknowledged safety alerts require acknowledgement attribution',
      );
    }
  },
);

const dispensationAllocationSchema =
  new Schema(
    {
      stockReservationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      stockReservationAllocationId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      inventoryBatchId:
        nullablePharmacyObjectId,

      batchNumberSnapshot: {
        ...nullableString,
        uppercase: true,
        maxlength: 200,
      },

      expiryDateSnapshot: {
        type: Date,
        default: null,
      },

      stockUnitId: {
        type: Schema.Types.ObjectId,
        required: true,
      },

      reservedStockQuantity: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      consumedStockQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      releasedStockQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      returnedStockQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      status: {
        type: String,
        required: true,
        enum: dispensationAllocationStatusValues,
        default: 'RESERVED',
      },

      stockMovementIds:
        pharmacyObjectIdArray,

      reversalStockMovementIds:
        pharmacyObjectIdArray,
    },
    {
      _id: true,
      strict: true,
    },
  );

dispensationAllocationSchema.pre(
  'validate',
  function validateDispensationAllocation() {
    validatePositiveInventoryDecimal(
      this,
      'reservedStockQuantity',
      this.get('reservedStockQuantity'),
    );

    for (
      const field of [
        'consumedStockQuantity',
        'releasedStockQuantity',
        'returnedStockQuantity',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    try {
      const settled =
        sumInventoryDecimals([
          this.get(
            'consumedStockQuantity',
          ),
          this.get(
            'releasedStockQuantity',
          ),
        ]);

      const reserved =
        inventoryDecimalParts(
          this.get(
            'reservedStockQuantity',
          ),
          'reservedStockQuantity',
        );

      const scale = Math.max(
        settled.scale,
        reserved.scale,
      );
      const alignedSettled =
        settled.coefficient *
        10n **
          BigInt(scale - settled.scale);
      const alignedReserved =
        reserved.coefficient *
        10n **
          BigInt(scale - reserved.scale);

      if (
        alignedSettled > alignedReserved
      ) {
        this.invalidate(
          'consumedStockQuantity',
          'Consumed and released allocation quantities cannot exceed the reserved quantity',
        );
      }

      if (
        compareInventoryDecimals(
          this.get(
            'returnedStockQuantity',
          ),
          this.get(
            'consumedStockQuantity',
          ),
        ) > 0
      ) {
        this.invalidate(
          'returnedStockQuantity',
          'Returned allocation quantity cannot exceed consumed quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'reservedStockQuantity',
        error instanceof Error
          ? error.message
          : 'Allocation quantities must be valid decimal values',
      );
    }

    if (
      this.get('inventoryBatchId') ==
        null &&
      (
        this.get(
          'batchNumberSnapshot',
        ) != null ||
        this.get(
          'expiryDateSnapshot',
        ) != null
      )
    ) {
      this.invalidate(
        'inventoryBatchId',
        'Batch snapshots require an inventory batch identifier',
      );
    }
  },
);

export const dispensationSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationNumber: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      creationOperationKey: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 8,
        maxlength: 500,
      },

      prescriptionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionNumberSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 120,
      },

      prescriptionRevisionNumber: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
      },

      prescriptionVersion: {
        type: Number,
        required: true,
        immutable: true,
        min: 0,
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

      encounterId:
        nullablePharmacyObjectId,
      registrationId:
        nullablePharmacyObjectId,
      opdVisitId:
        nullablePharmacyObjectId,
      admissionId:
        nullablePharmacyObjectId,
      wardId:
        nullablePharmacyObjectId,
      departmentId:
        nullablePharmacyObjectId,
      servicePointId:
        nullablePharmacyObjectId,

      prescriberProviderId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      pharmacyLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      sourceStockLocationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      context: {
        type: String,
        required: true,
        immutable: true,
        enum: dispensationContextValues,
      },

      priority: {
        type: String,
        required: true,
        enum: dispensationPriorityValues,
        default: 'ROUTINE',
      },

      status: {
        type: String,
        required: true,
        enum: dispensationStatusValues,
        default: 'PENDING_REVIEW',
      },

      lineCount: {
        type: Number,
        required: true,
        min: 1,
        max: 500,
      },

      verifiedLineCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 500,
      },

      completedLineCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 500,
      },

      controlledMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      highAlertMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      secondCheckRequired: {
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

      stockReservationId:
        nullablePharmacyObjectId,

      queuedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      reviewStartedAt: {
        type: Date,
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      verifiedByStaffId:
        nullablePharmacyObjectId,

      secondCheckedAt: {
        type: Date,
        default: null,
      },

      secondCheckedByStaffId:
        nullablePharmacyObjectId,

      firstDispensedAt: {
        type: Date,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
      },

      dispensedByStaffId:
        nullablePharmacyObjectId,

      heldAt: {
        type: Date,
        default: null,
      },

      heldByStaffId:
        nullablePharmacyObjectId,

      holdReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      rejectedAt: {
        type: Date,
        default: null,
      },

      rejectedByStaffId:
        nullablePharmacyObjectId,

      rejectionReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      cancelledByStaffId:
        nullablePharmacyObjectId,

      cancellationReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      enteredInErrorAt: {
        type: Date,
        default: null,
      },

      enteredInErrorByStaffId:
        nullablePharmacyObjectId,

      enteredInErrorReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      expiredAt: {
        type: Date,
        default: null,
      },

      expiresAt: {
        type: Date,
        required: true,
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

      billingOperationKey: {
        ...nullableString,
        minlength: 8,
        maxlength: 500,
      },

      billingSourceRecordId:
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

      lastFailureCode: {
        ...nullableString,
        uppercase: true,
        maxlength: 100,
        select: false,
      },

      attachmentIds:
        pharmacyObjectIdArray,
    },
    pharmacyTimestampedSchemaOptions(
      'dispensations',
    ),
  );

dispensationSchema.pre(
  'validate',
  function validateDispensation() {
    validatePharmacyMoneyBreakdown(this);

    if (
      String(this.get('patientId')) !==
      String(this.get('requestedPatientId'))
    ) {
      this.invalidate(
        'requestedPatientId',
        'Requested patient must match the authoritative prescription patient',
      );
    }

    if (
      this.get('expiresAt') != null &&
      this.get('queuedAt') != null &&
      (this.get('expiresAt') as Date) <=
        (this.get('queuedAt') as Date)
    ) {
      this.invalidate(
        'expiresAt',
        'Dispensation expiry must be later than queue time',
      );
    }

    const lineCount = Number(
      this.get('lineCount'),
    );
    const verifiedLineCount = Number(
      this.get('verifiedLineCount'),
    );
    const completedLineCount = Number(
      this.get('completedLineCount'),
    );

    if (
      verifiedLineCount > lineCount ||
      completedLineCount > lineCount
    ) {
      this.invalidate(
        'lineCount',
        'Verified and completed line counts cannot exceed line count',
      );
    }

    const context = String(
      this.get('context'),
    );

    if (
      [
        'INPATIENT',
        'DISCHARGE',
        'WARD_SUPPLY',
      ].includes(context) &&
      this.get('admissionId') == null
    ) {
      this.invalidate(
        'admissionId',
        'Inpatient, discharge, and ward-supply dispensing require an admission',
      );
    }

    if (
      context === 'WARD_SUPPLY' &&
      this.get('wardId') == null
    ) {
      this.invalidate(
        'wardId',
        'Ward-supply dispensing requires a ward',
      );
    }

    if (
      this.get('secondCheckRequired') ===
        true &&
      [
        'VERIFIED',
        'PARTIALLY_RESERVED',
        'RESERVED',
        'IN_PROGRESS',
        'PARTIALLY_DISPENSED',
        'COMPLETED',
        'PARTIALLY_RETURNED',
        'RETURNED',
        'REVERSAL_PENDING',
        'REVERSED',
      ].includes(String(this.get('status'))) &&
      this.get('secondCheckedByStaffId') ==
        null
    ) {
      this.invalidate(
        'secondCheckedByStaffId',
        'Second-check-required dispensing cannot progress without second-person verification',
      );
    }

    if (
      this.get('verifiedByStaffId') != null &&
      this.get('secondCheckedByStaffId') != null &&
      String(this.get('verifiedByStaffId')) ===
        String(this.get('secondCheckedByStaffId'))
    ) {
      this.invalidate(
        'secondCheckedByStaffId',
        'Pharmacist verifier and second checker must be different staff members',
      );
    }

    if (
      this.get('witnessRequired') ===
        true &&
      this.get('controlledMedicine') !==
        true
    ) {
      this.invalidate(
        'witnessRequired',
        'Witness requirements are only valid for controlled-medicine dispensing',
      );
    }

    validateAllOrNone(
      this,
      [
        'verifiedAt',
        'verifiedByStaffId',
      ],
      'Pharmacist verification requires actor and timestamp',
    );

    validateAllOrNone(
      this,
      [
        'secondCheckedAt',
        'secondCheckedByStaffId',
      ],
      'Second-person verification requires actor and timestamp',
    );

    const status = String(
      this.get('status'),
    );

    if (
      status === 'HELD' &&
      (
        this.get('heldAt') == null ||
        this.get('heldByStaffId') == null ||
        this.get('holdReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Held dispensations require actor, timestamp, and reason',
      );
    }

    if (
      status === 'REJECTED' &&
      (
        this.get('rejectedAt') == null ||
        this.get('rejectedByStaffId') ==
          null ||
        this.get('rejectionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected dispensations require actor, timestamp, and reason',
      );
    }

    if (
      status === 'CANCELLED' &&
      (
        this.get('cancelledAt') == null ||
        this.get('cancelledByStaffId') ==
          null ||
        this.get('cancellationReason') ==
          null
      )
    ) {
      this.invalidate(
        'status',
        'Cancelled dispensations require actor, timestamp, and reason',
      );
    }

    if (
      status === 'ENTERED_IN_ERROR' &&
      (
        this.get('enteredInErrorAt') ==
          null ||
        this.get(
          'enteredInErrorByStaffId',
        ) == null ||
        this.get(
          'enteredInErrorReason',
        ) == null
      )
    ) {
      this.invalidate(
        'status',
        'Entered-in-error dispensations require actor, timestamp, and reason',
      );
    }

    if (
      status === 'EXPIRED' &&
      this.get('expiredAt') == null
    ) {
      this.invalidate(
        'expiredAt',
        'Expired dispensations require an expiry timestamp',
      );
    }

    if (
      [
        'PARTIALLY_RESERVED',
        'RESERVED',
        'IN_PROGRESS',
        'PARTIALLY_DISPENSED',
        'COMPLETED',
      ].includes(status) &&
      this.get('stockReservationId') == null
    ) {
      this.invalidate(
        'stockReservationId',
        'Reserved and dispensed states require a stock reservation',
      );
    }

    if (
      [
        'PARTIALLY_DISPENSED',
        'COMPLETED',
        'PARTIALLY_RETURNED',
        'RETURNED',
        'REVERSAL_PENDING',
        'REVERSED',
      ].includes(status) &&
      (
        this.get('firstDispensedAt') ==
          null ||
        this.get('dispensedByStaffId') ==
          null
      )
    ) {
      this.invalidate(
        'status',
        'Dispensed lifecycle states require pharmacist and timestamp attribution',
      );
    }

    if (
      status === 'COMPLETED' &&
      (
        this.get('completedAt') == null ||
        this.get('finalizationState') !==
          'COMPLETED' ||
        this.get('billingOperationKey') ==
          null
      )
    ) {
      this.invalidate(
        'status',
        'Completed dispensing requires completed stock, billing, and finalization attribution',
      );
    }

    if (
      status === 'RECOVERY_REQUIRED' &&
      (
        this.get('finalizationState') !==
          'RECOVERY_REQUIRED' ||
        this.get('recoveryReason') == null
      )
    ) {
      this.invalidate(
        'finalizationState',
        'Recovery-required dispensing must persist a recovery reason',
      );
    }
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    dispensationNumber: 1,
  },
  {
    name: 'uq_dispensations_facility_number',
    unique: true,
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    creationOperationKey: 1,
  },
  {
    name: 'uq_dispensations_creation_operation',
    unique: true,
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    status: 1,
    queuedAt: -1,
  },
  {
    name: 'ix_dispensations_prescription_status',
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    pharmacyLocationId: 1,
    status: 1,
    priority: -1,
    queuedAt: 1,
  },
  {
    name: 'ix_dispensations_pharmacy_worklist',
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    completedAt: -1,
  },
  {
    name: 'ix_dispensations_patient_history',
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    stockReservationId: 1,
  },
  {
    name: 'uq_dispensations_stock_reservation',
    unique: true,
    partialFilterExpression: {
      stockReservationId: {
        $type: 'objectId',
      },
    },
  },
);

dispensationSchema.index(
  {
    facilityId: 1,
    finalizationState: 1,
    finalizationUpdatedAt: 1,
  },
  {
    name: 'ix_dispensations_recovery_worklist',
  },
);

export const dispensationItemSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      lineNumber: {
        type: Number,
        required: true,
        immutable: true,
        min: 1,
        max: 500,
      },

      prescribedFormularyItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedMedicineId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedMedicineFormId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedMedicineStrengthId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedRouteId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedFrequencyId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedMedicineSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 500,
      },

      prescribedStrengthSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 150,
      },

      prescribedFormSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      prescribedRouteSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 150,
      },

      prescribedFrequencySnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
      },

      prescribedInstructionsSnapshot: {
        ...nullableString,
        maxlength: 5_000,
        select: false,
      },

      prescribedQuantity: {
        type: Schema.Types.Decimal128,
        required: true,
        immutable: true,
      },

      prescribedQuantityUnitId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      requestedQuantity: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      approvedQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      reservedQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      dispensedQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      returnedQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      reversedQuantity: {
        ...pharmacyNonNegativeDecimal,
      },

      dispensedQuantityUnitId:
        nullablePharmacyObjectId,

      actualFormularyItemId:
        nullablePharmacyObjectId,
      actualMedicineId:
        nullablePharmacyObjectId,
      actualMedicineFormId:
        nullablePharmacyObjectId,
      actualMedicineStrengthId:
        nullablePharmacyObjectId,
      actualInventoryItemId:
        nullablePharmacyObjectId,

      actualMedicineSnapshot: {
        ...nullableString,
        maxlength: 500,
      },

      actualStrengthSnapshot: {
        ...nullableString,
        maxlength: 150,
      },

      actualFormSnapshot: {
        ...nullableString,
        maxlength: 200,
      },

      substitutionId:
        nullablePharmacyObjectId,

      substitutionApplied: {
        type: Boolean,
        required: true,
        default: false,
      },

      quantityRoundingApplied: {
        type: Boolean,
        required: true,
        default: false,
      },

      quantityRoundingReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      specialHandling: {
        type: [String],
        required: true,
        enum: pharmacySpecialHandlingValues,
        default: [],
      },

      controlledMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      highAlertMedicine: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      safetyAlerts: {
        type: [
          pharmacySafetyAlertSnapshotSchema,
        ],
        required: true,
        default: [],
      },

      blockingAlertCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      allocations: {
        type: [dispensationAllocationSchema],
        required: true,
        default: [],
      },

      unitSellingPrice:
        pharmacyNonNegativeDecimal,
      grossAmount:
        pharmacyNonNegativeDecimal,
      discountAmount:
        pharmacyNonNegativeDecimal,
      taxAmount:
        pharmacyNonNegativeDecimal,
      netAmount:
        pharmacyNonNegativeDecimal,

      pricingSource: {
        ...nullableString,
        uppercase: true,
        maxlength: 100,
      },

      priceOverrideApplied: {
        type: Boolean,
        required: true,
        default: false,
      },

      priceOverrideReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      priceOverrideApprovedByStaffId:
        nullablePharmacyObjectId,

      status: {
        type: String,
        required: true,
        enum: dispensationItemStatusValues,
        default: 'PENDING_REVIEW',
      },

      verifiedByStaffId:
        nullablePharmacyObjectId,

      verifiedAt: {
        type: Date,
        default: null,
      },

      dispensedByStaffId:
        nullablePharmacyObjectId,

      dispensedAt: {
        type: Date,
        default: null,
      },

      holdReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },

      rejectionReason: {
        ...nullableString,
        minlength: 5,
        maxlength: 2_000,
        select: false,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'dispensationItems',
    ),
  );

dispensationItemSchema.pre(
  'validate',
  function validateDispensationItem() {
    validatePositiveInventoryDecimal(
      this,
      'prescribedQuantity',
      this.get('prescribedQuantity'),
    );
    validatePositiveInventoryDecimal(
      this,
      'requestedQuantity',
      this.get('requestedQuantity'),
    );

    for (
      const field of [
        'approvedQuantity',
        'reservedQuantity',
        'dispensedQuantity',
        'returnedQuantity',
        'reversedQuantity',
        'unitSellingPrice',
      ] as const
    ) {
      validateNonNegativeInventoryDecimal(
        this,
        field,
        this.get(field),
      );
    }

    validatePharmacyMoneyBreakdown(this);

    try {
      if (
        !pharmacyDecimalProductEquals(
          this.get('dispensedQuantity'),
          this.get('unitSellingPrice'),
          this.get('grossAmount'),
        )
      ) {
        this.invalidate(
          'grossAmount',
          'Gross amount must equal dispensed quantity multiplied by unit selling price',
        );
      }
    } catch (error) {
      this.invalidate(
        'grossAmount',
        error instanceof Error
          ? error.message
          : 'Dispensing price values must be valid decimals',
      );
    }

    try {
      for (
        const [left, right, message] of [
          [
            'requestedQuantity',
            'prescribedQuantity',
            'Requested quantity cannot exceed prescribed quantity',
          ],
          [
            'approvedQuantity',
            'requestedQuantity',
            'Approved quantity cannot exceed requested quantity',
          ],
          [
            'reservedQuantity',
            'approvedQuantity',
            'Reserved quantity cannot exceed approved quantity',
          ],
          [
            'dispensedQuantity',
            'reservedQuantity',
            'Dispensed quantity cannot exceed reserved quantity',
          ],
          [
            'returnedQuantity',
            'dispensedQuantity',
            'Returned quantity cannot exceed dispensed quantity',
          ],
          [
            'reversedQuantity',
            'dispensedQuantity',
            'Reversed quantity cannot exceed dispensed quantity',
          ],
        ] as const
      ) {
        if (
          compareInventoryDecimals(
            this.get(left),
            this.get(right),
          ) > 0
        ) {
          this.invalidate(left, message);
        }
      }

      const allocations = this.get(
        'allocations',
      ) as Array<{
        reservedStockQuantity: unknown;
        consumedStockQuantity: unknown;
        returnedStockQuantity: unknown;
      }>;

      const reserved =
        sumInventoryDecimals(
          allocations.map(
            (allocation) =>
              allocation.reservedStockQuantity,
          ),
        );
      const consumed =
        sumInventoryDecimals(
          allocations.map(
            (allocation) =>
              allocation.consumedStockQuantity,
          ),
        );
      const returned =
        sumInventoryDecimals(
          allocations.map(
            (allocation) =>
              allocation.returnedStockQuantity,
          ),
        );

      if (
        !decimalPartsEqual(
          reserved,
          inventoryDecimalParts(
            this.get('reservedQuantity'),
            'reservedQuantity',
          ),
        )
      ) {
        this.invalidate(
          'allocations',
          'Allocation reservations must reconcile exactly to reserved quantity',
        );
      }

      if (
        !decimalPartsEqual(
          consumed,
          inventoryDecimalParts(
            this.get('dispensedQuantity'),
            'dispensedQuantity',
          ),
        )
      ) {
        this.invalidate(
          'allocations',
          'Allocation consumption must reconcile exactly to dispensed quantity',
        );
      }

      if (
        !decimalPartsEqual(
          returned,
          inventoryDecimalParts(
            this.get('returnedQuantity'),
            'returnedQuantity',
          ),
        )
      ) {
        this.invalidate(
          'allocations',
          'Allocation returns must reconcile exactly to returned quantity',
        );
      }
    } catch (error) {
      this.invalidate(
        'requestedQuantity',
        error instanceof Error
          ? error.message
          : 'Dispensing quantities must be valid decimal values',
      );
    }

    const alerts = this.get(
      'safetyAlerts',
    ) as Array<{
      disposition: string;
    }>;
    const blockingAlerts = alerts.filter(
      (alert) =>
        alert.disposition === 'BLOCKING',
    ).length;

    if (
      blockingAlerts !==
      Number(
        this.get('blockingAlertCount'),
      )
    ) {
      this.invalidate(
        'blockingAlertCount',
        'Blocking alert count must match safety-alert snapshots',
      );
    }

    if (
      this.get('substitutionApplied') ===
        true &&
      this.get('substitutionId') == null
    ) {
      this.invalidate(
        'substitutionId',
        'Applied substitutions require an authorized substitution record',
      );
    }

    if (
      this.get('substitutionApplied') !==
        true &&
      this.get('substitutionId') != null
    ) {
      this.invalidate(
        'substitutionApplied',
        'Substitution records cannot be linked unless the substitution is applied',
      );
    }

    if (
      this.get(
        'quantityRoundingApplied',
      ) === true &&
      this.get(
        'quantityRoundingReason',
      ) == null
    ) {
      this.invalidate(
        'quantityRoundingReason',
        'Quantity rounding requires an attributable reason',
      );
    }

    if (
      this.get('priceOverrideApplied') ===
        true &&
      (
        this.get('priceOverrideReason') ==
          null ||
        this.get(
          'priceOverrideApprovedByStaffId',
        ) == null
      )
    ) {
      this.invalidate(
        'priceOverrideReason',
        'Price overrides require approval and reason',
      );
    }

    validateAllOrNone(
      this,
      [
        'verifiedByStaffId',
        'verifiedAt',
      ],
      'Item verification requires actor and timestamp',
    );

    validateAllOrNone(
      this,
      [
        'dispensedByStaffId',
        'dispensedAt',
      ],
      'Item dispensing requires actor and timestamp',
    );

    validateAllOrNone(
      this,
      [
        'dispensedQuantityUnitId',
        'actualFormularyItemId',
        'actualMedicineId',
        'actualMedicineFormId',
        'actualMedicineStrengthId',
        'actualInventoryItemId',
        'actualMedicineSnapshot',
        'actualStrengthSnapshot',
        'actualFormSnapshot',
      ],
      'Actual dispensed medicine attribution must be complete',
    );

    const status = String(
      this.get('status'),
    );

    if (
      [
        'PARTIALLY_DISPENSED',
        'DISPENSED',
        'PARTIALLY_RETURNED',
        'RETURNED',
        'REVERSED',
      ].includes(status)
    ) {
      validatePositiveInventoryDecimal(
        this,
        'dispensedQuantity',
        this.get('dispensedQuantity'),
      );
    }

    if (status === 'DISPENSED') {
      try {
        if (
          compareInventoryDecimals(
            this.get('dispensedQuantity'),
            this.get('approvedQuantity'),
          ) !== 0
        ) {
          this.invalidate(
            'dispensedQuantity',
            'Fully dispensed items must equal the approved quantity',
          );
        }
      } catch (error) {
        this.invalidate(
          'dispensedQuantity',
          error instanceof Error
            ? error.message
            : 'Dispensed quantity must be a valid decimal value',
        );
      }
    }

    if (
      [
        'PARTIALLY_DISPENSED',
        'DISPENSED',
        'PARTIALLY_RETURNED',
        'RETURNED',
        'REVERSED',
      ].includes(status) &&
      (
        this.get('actualFormularyItemId') == null ||
        this.get('actualMedicineId') == null ||
        this.get('actualMedicineFormId') == null ||
        this.get('actualMedicineStrengthId') == null ||
        this.get('actualInventoryItemId') == null ||
        this.get('actualMedicineSnapshot') == null ||
        this.get('actualStrengthSnapshot') == null ||
        this.get('actualFormSnapshot') == null ||
        this.get('dispensedQuantityUnitId') == null ||
        this.get('dispensedAt') == null
      )
    ) {
      this.invalidate(
        'status',
        'Dispensed item states require actual inventory, unit, and pharmacist attribution',
      );
    }

    if (
      status === 'HELD' &&
      this.get('holdReason') == null
    ) {
      this.invalidate(
        'holdReason',
        'Held dispensing items require a reason',
      );
    }

    if (
      status === 'REJECTED' &&
      this.get('rejectionReason') == null
    ) {
      this.invalidate(
        'rejectionReason',
        'Rejected dispensing items require a reason',
      );
    }
  },
);

dispensationItemSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    lineNumber: 1,
  },
  {
    name: 'uq_dispensation_items_line',
    unique: true,
  },
);

dispensationItemSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    prescriptionItemId: 1,
  },
  {
    name: 'uq_dispensation_items_prescription_item',
    unique: true,
  },
);

dispensationItemSchema.index(
  {
    facilityId: 1,
    prescriptionItemId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_dispensation_items_fulfilment',
  },
);

dispensationItemSchema.index(
  {
    facilityId: 1,
    actualInventoryItemId: 1,
    'allocations.inventoryBatchId': 1,
    dispensedAt: -1,
  },
  {
    name: 'ix_dispensation_items_batch_traceability',
  },
);

export const dispensationStatusHistorySchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemId: {
        ...nullablePharmacyObjectId,
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
        enum: [
          ...dispensationStatusValues,
          ...dispensationItemStatusValues,
          null,
        ],
        immutable: true,
      },

      toStatus: {
        type: String,
        required: true,
        enum: [
          ...dispensationStatusValues,
          ...dispensationItemStatusValues,
        ],
        immutable: true,
      },

      changeSource: {
        type: String,
        required: true,
        enum: dispensationStatusChangeSourceValues,
        immutable: true,
      },

      actorStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      reason: {
        ...nullableString,
        immutable: true,
        maxlength: 2_000,
        select: false,
      },

      snapshotHash: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 32,
        maxlength: 256,
        select: false,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'dispensationStatusHistories',
    ),
  );

dispensationStatusHistorySchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    sequence: 1,
  },
  {
    name: 'uq_dispensation_status_history_sequence',
    unique: true,
  },
);

dispensationStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_dispensation_status_history_patient',
  },
);

export const pharmacyReviewEventSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemId: {
        ...nullablePharmacyObjectId,
        immutable: true,
      },

      prescriptionId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      patientId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      scope: {
        type: String,
        required: true,
        enum: pharmacyReviewScopeValues,
        immutable: true,
      },

      action: {
        type: String,
        required: true,
        enum: pharmacyReviewActionValues,
        immutable: true,
      },

      outcome: {
        type: String,
        required: true,
        enum: pharmacyReviewOutcomeValues,
        immutable: true,
      },

      reviewerStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      checkerStaffId: {
        ...nullablePharmacyObjectId,
        immutable: true,
      },

      reason: {
        ...nullableString,
        immutable: true,
        maxlength: 2_000,
        select: false,
      },

      safetyAlerts: {
        type: [
          pharmacySafetyAlertSnapshotSchema,
        ],
        required: true,
        default: [],
        immutable: true,
      },

      blockingAlertCount: {
        type: Number,
        required: true,
        immutable: true,
        default: 0,
        min: 0,
      },

      occurredAt: {
        type: Date,
        required: true,
        immutable: true,
      },
    },
    pharmacyTimestampedSchemaOptions(
      'pharmacyReviewEvents',
    ),
  );

pharmacyReviewEventSchema.pre(
  'validate',
  function validatePharmacyReviewEvent() {
    if (
      this.get('scope') === 'ITEM' &&
      this.get('dispensationItemId') == null
    ) {
      this.invalidate(
        'dispensationItemId',
        'Item-level pharmacy reviews require a dispensing item',
      );
    }

    const action = String(
      this.get('action'),
    );

    if (
      [
        'HELD',
        'RELEASED',
        'REJECTED',
        'SECOND_CHECK_REJECTED',
      ].includes(action) &&
      this.get('reason') == null
    ) {
      this.invalidate(
        'reason',
        'This pharmacy review action requires a reason',
      );
    }

    if (
      [
        'SECOND_CHECK_APPROVED',
        'SECOND_CHECK_REJECTED',
      ].includes(action) &&
      this.get('checkerStaffId') == null
    ) {
      this.invalidate(
        'checkerStaffId',
        'Second-check actions require checker attribution',
      );
    }

    if (
      this.get('checkerStaffId') != null &&
      String(this.get('checkerStaffId')) ===
        String(this.get('reviewerStaffId'))
    ) {
      this.invalidate(
        'checkerStaffId',
        'Maker and checker must be different staff members',
      );
    }

    const alerts = this.get(
      'safetyAlerts',
    ) as Array<{
      disposition: string;
    }>;
    const blockingAlerts = alerts.filter(
      (alert) =>
        alert.disposition === 'BLOCKING',
    ).length;

    if (
      blockingAlerts !==
      Number(this.get('blockingAlertCount'))
    ) {
      this.invalidate(
        'blockingAlertCount',
        'Blocking alert count must match safety-alert snapshots',
      );
    }
  },
);

pharmacyReviewEventSchema.index(
  {
    facilityId: 1,
    dispensationId: 1,
    occurredAt: 1,
    action: 1,
  },
  {
    name: 'ix_pharmacy_review_events_timeline',
  },
);

pharmacyReviewEventSchema.index(
  {
    facilityId: 1,
    transactionId: 1,
    action: 1,
    dispensationItemId: 1,
  },
  {
    name: 'uq_pharmacy_review_events_transaction_action',
    unique: true,
  },
);

export const dispensationSubstitutionSchema =
  new Schema(
    {
      ...pharmacyCommonFields,

      dispensationId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      dispensationItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescriptionItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      substitutionType: {
        type: String,
        required: true,
        immutable: true,
        enum: dispensationSubstitutionTypeValues,
      },

      status: {
        type: String,
        required: true,
        enum: dispensationSubstitutionStatusValues,
        default: 'PROPOSED',
      },

      prescribedFormularyItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedMedicineId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      proposedFormularyItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      proposedMedicineId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      proposedInventoryItemId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      prescribedSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 500,
      },

      proposedSnapshot: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 2,
        maxlength: 500,
      },

      formularyRuleId:
        nullablePharmacyObjectId,

      prescriberAuthorizationRequired: {
        type: Boolean,
        required: true,
        immutable: true,
        default: false,
      },

      prescriberAuthorizedByProviderId:
        nullablePharmacyObjectId,

      prescriberAuthorizedAt: {
        type: Date,
        default: null,
      },

      proposedByStaffId: {
        type: Schema.Types.ObjectId,
        required: true,
        immutable: true,
      },

      proposedAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      authorizedByStaffId:
        nullablePharmacyObjectId,

      authorizedAt: {
        type: Date,
        default: null,
      },

      rejectedByStaffId:
        nullablePharmacyObjectId,

      rejectedAt: {
        type: Date,
        default: null,
      },

      appliedAt: {
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
    },
    pharmacyTimestampedSchemaOptions(
      'dispensationSubstitutions',
    ),
  );

dispensationSubstitutionSchema.pre(
  'validate',
  function validateDispensationSubstitution() {
    validateAllOrNone(
      this,
      [
        'prescriberAuthorizedByProviderId',
        'prescriberAuthorizedAt',
      ],
      'Prescriber substitution authorization requires provider and timestamp',
    );

    if (
      this.get(
        'prescriberAuthorizationRequired',
      ) === true &&
      [
        'AUTHORIZED',
        'APPLIED',
      ].includes(String(this.get('status'))) &&
      this.get(
        'prescriberAuthorizedByProviderId',
      ) == null
    ) {
      this.invalidate(
        'prescriberAuthorizedByProviderId',
        'This substitution requires prescriber authorization',
      );
    }

    const status = String(
      this.get('status'),
    );

    if (
      [
        'AUTHORIZED',
        'APPLIED',
      ].includes(status) &&
      (
        this.get('authorizedByStaffId') ==
          null ||
        this.get('authorizedAt') == null
      )
    ) {
      this.invalidate(
        'status',
        'Authorized substitutions require pharmacist authorization',
      );
    }

    if (
      status === 'REJECTED' &&
      (
        this.get('rejectedByStaffId') ==
          null ||
        this.get('rejectedAt') == null ||
        this.get('decisionReason') == null
      )
    ) {
      this.invalidate(
        'status',
        'Rejected substitutions require actor, timestamp, and reason',
      );
    }

    if (
      status === 'APPLIED' &&
      this.get('appliedAt') == null
    ) {
      this.invalidate(
        'appliedAt',
        'Applied substitutions require an application timestamp',
      );
    }
  },
);

dispensationSubstitutionSchema.index(
  {
    facilityId: 1,
    dispensationItemId: 1,
  },
  {
    name: 'uq_dispensation_substitutions_active_item',
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          'PROPOSED',
          'AUTHORIZED',
          'APPLIED',
        ],
      },
    },
  },
);

dispensationSubstitutionSchema.index(
  {
    facilityId: 1,
    prescriptionItemId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_dispensation_substitutions_prescription_item',
  },
);

export type Dispensation =
  InferSchemaType<
    typeof dispensationSchema
  >;
export type DispensationItem =
  InferSchemaType<
    typeof dispensationItemSchema
  >;
export type DispensationStatusHistory =
  InferSchemaType<
    typeof dispensationStatusHistorySchema
  >;
export type PharmacyReviewEvent =
  InferSchemaType<
    typeof pharmacyReviewEventSchema
  >;
export type DispensationSubstitution =
  InferSchemaType<
    typeof dispensationSubstitutionSchema
  >;

export const DispensationModel =
  (mongoose.models[
    'Dispensation'
  ] as Model<Dispensation> | undefined) ??
  mongoose.model<Dispensation>(
    'Dispensation',
    dispensationSchema,
    'dispensations',
  );

export const DispensationItemModel =
  (mongoose.models[
    'DispensationItem'
  ] as Model<DispensationItem> | undefined) ??
  mongoose.model<DispensationItem>(
    'DispensationItem',
    dispensationItemSchema,
    'dispensationItems',
  );

export const DispensationStatusHistoryModel =
  (mongoose.models[
    'DispensationStatusHistory'
  ] as
    | Model<DispensationStatusHistory>
    | undefined) ??
  mongoose.model<DispensationStatusHistory>(
    'DispensationStatusHistory',
    dispensationStatusHistorySchema,
    'dispensationStatusHistories',
  );

export const PharmacyReviewEventModel =
  (mongoose.models[
    'PharmacyReviewEvent'
  ] as Model<PharmacyReviewEvent> | undefined) ??
  mongoose.model<PharmacyReviewEvent>(
    'PharmacyReviewEvent',
    pharmacyReviewEventSchema,
    'pharmacyReviewEvents',
  );

export const DispensationSubstitutionModel =
  (mongoose.models[
    'DispensationSubstitution'
  ] as
    | Model<DispensationSubstitution>
    | undefined) ??
  mongoose.model<DispensationSubstitution>(
    'DispensationSubstitution',
    dispensationSubstitutionSchema,
    'dispensationSubstitutions',
  );