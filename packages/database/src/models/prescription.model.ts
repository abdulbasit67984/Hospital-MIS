import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  providerSignatureMethodValues,
} from './clinical-emr.types.js';

import {
  medicineInteractionCheckStatusValues,
  prescriptionChangeTypeValues,
  prescriptionDurationUnitValues,
  prescriptionItemStatusValues,
  prescriptionStatusChangeSourceValues,
  prescriptionStatusValues,
  prescriptionWarningSeverityValues,
  prescriptionWarningStatusValues,
  prescriptionWarningTypeValues,
} from './formulary-prescription.types.js';

function decimalNumber(value: mongoose.Types.Decimal128): number {
  return Number(value.toString());
}

const encryptedPrescriptionSnapshotSchema = new Schema(
  {
    algorithm: {
      type: String,
      required: true,
      immutable: true,
      enum: ['AES-256-GCM'],
    },
    keyVersion: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    initializationVector: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    authenticationTag: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 16,
      maxlength: 256,
    },
    ciphertext: {
      type: String,
      required: true,
      immutable: true,
      minlength: 1,
      maxlength: 5_000_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

export const prescriptionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    prescriptionNumber: {
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
    prescriberProviderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: prescriptionStatusValues,
      default: 'DRAFT',
    },
    revisionNumber: {
      type: Number,
      required: true,
      immutable: true,
      default: 1,
      min: 1,
    },
    rootPrescriptionId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    supersedesPrescriptionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    supersededByPrescriptionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    replacementReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    draftedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    signatureMethod: {
      type: String,
      default: null,
      enum: [...providerSignatureMethodValues, null],
    },
    signatureDigest: {
      type: String,
      default: null,
      trim: true,
      minlength: 32,
      maxlength: 256,
      select: false,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    issuedSnapshotHash: {
      type: String,
      default: null,
      trim: true,
      minlength: 64,
      maxlength: 128,
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
    interactionCheckStatus: {
      type: String,
      required: true,
      enum: medicineInteractionCheckStatusValues,
      default: 'NOT_REQUESTED',
    },
    interactionCheckProvider: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    interactionCheckedAt: {
      type: Date,
      default: null,
    },
    itemCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    activeItemCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    dispensedItemCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    safetyWarningCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    unresolvedBlockingWarningCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    printRevision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastPrintedAt: {
      type: Date,
      default: null,
    },
    lastPrintedBy: {
      type: Schema.Types.ObjectId,
      default: null,
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
    collection: 'prescriptions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

prescriptionSchema.pre('validate', function validatePrescription() {
  this.canonicalRedirected = !this.patientId.equals(this.requestedPatientId);

  if (this.opdVisitId != null && this.registrationId == null) {
    this.invalidate(
      'registrationId',
      'OPD-linked prescriptions require a registrationId',
    );
  }

  if (this.rootPrescriptionId == null) {
    this.rootPrescriptionId = this._id;
  }

  if (this.revisionNumber === 1 && this.supersedesPrescriptionId != null) {
    this.invalidate(
      'revisionNumber',
      'The first prescription revision cannot supersede another prescription',
    );
  }

  if (this.revisionNumber > 1 && this.supersedesPrescriptionId == null) {
    this.invalidate(
      'supersedesPrescriptionId',
      'Replacement prescriptions must reference the superseded prescription',
    );
  }

  if (this.supersedesPrescriptionId != null && this.replacementReason == null) {
    this.invalidate(
      'replacementReason',
      'Replacement prescriptions require a correction or amendment reason',
    );
  }

  const requiresIssuanceMetadata =
    this.status !== 'DRAFT' &&
    !(this.status === 'CANCELLED' && this.issuedAt == null);

  if (requiresIssuanceMetadata) {
    if (
      this.issuedAt == null ||
      this.expiresAt == null ||
      this.signedBy == null ||
      this.signatureMethod == null ||
      this.signatureDigest == null ||
      this.lockedAt == null ||
      this.lockedBy == null ||
      this.issuedSnapshotHash == null
    ) {
      this.invalidate(
        'status',
        'Issued prescription states require signature, lock, expiry, and immutable snapshot attribution',
      );
    }

    if (this.activeItemCount < 1) {
      this.invalidate('activeItemCount', 'Issued prescriptions require an active item');
    }
  } else if (
    this.issuedAt != null ||
    this.signedBy != null ||
    this.signatureMethod != null ||
    this.signatureDigest != null ||
    this.lockedAt != null ||
    this.lockedBy != null ||
    this.issuedSnapshotHash != null
  ) {
    this.invalidate(
      'status',
      'Draft prescriptions cannot retain issuance or signature metadata',
    );
  }

  if (this.issuedAt != null && this.expiresAt != null && this.expiresAt <= this.issuedAt) {
    this.invalidate('expiresAt', 'Prescription expiry must be after issuance');
  }

  if (this.status === 'CANCELLED') {
    if (
      this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null
    ) {
      this.invalidate(
        'status',
        'Cancelled prescriptions require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Non-cancelled prescriptions cannot retain cancellation metadata',
    );
  }

  if (this.dispensedItemCount > this.activeItemCount) {
    this.invalidate(
      'dispensedItemCount',
      'Dispensed item count cannot exceed active item count',
    );
  }

  if (this.activeItemCount > this.itemCount) {
    this.invalidate('activeItemCount', 'Active item count cannot exceed item count');
  }

  if (
    this.interactionCheckStatus === 'COMPLETED' &&
    (this.interactionCheckProvider == null || this.interactionCheckedAt == null)
  ) {
    this.invalidate(
      'interactionCheckStatus',
      'Completed interaction checks require provider and timestamp attribution',
    );
  }
});

prescriptionSchema.index(
  {
    facilityId: 1,
    prescriptionNumber: 1,
  },
  {
    name: 'uq_prescriptions_facility_number',
    unique: true,
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_prescriptions_encounter_status_created',
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    issuedAt: -1,
  },
  {
    name: 'ix_prescriptions_patient_issued',
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    prescriberProviderId: 1,
    status: 1,
    draftedAt: -1,
  },
  {
    name: 'ix_prescriptions_provider_status_drafted',
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    rootPrescriptionId: 1,
    revisionNumber: 1,
  },
  {
    name: 'uq_prescriptions_root_revision',
    unique: true,
  },
);

prescriptionSchema.index(
  {
    facilityId: 1,
    expiresAt: 1,
    status: 1,
  },
  {
    name: 'ix_prescriptions_expiry_status',
    partialFilterExpression: {
      expiresAt: {
        $type: 'date',
      },
    },
  },
);

export const prescriptionItemSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
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
    formularyItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineFormId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    medicineStrengthId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    selectedBrandName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      immutable: true,
    },
    genericNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
      immutable: true,
    },
    medicineFormSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
      immutable: true,
    },
    medicineStrengthSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
      immutable: true,
    },
    dose: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    doseUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    doseUnitSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
      immutable: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    routeSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
      immutable: true,
    },
    frequencyId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    frequencySnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
      immutable: true,
    },
    durationValue: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    durationUnit: {
      type: String,
      required: true,
      enum: prescriptionDurationUnitValues,
    },
    quantity: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    quantityUnitId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    quantityUnitSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
      immutable: true,
    },
    instructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    asNeeded: {
      type: Boolean,
      required: true,
      default: false,
    },
    asNeededReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1_000,
      select: false,
    },
    startDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    endDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/u,
    },
    status: {
      type: String,
      required: true,
      enum: prescriptionItemStatusValues,
      default: 'ACTIVE',
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
    dispensedQuantity: {
      type: Schema.Types.Decimal128,
      required: true,
      default: '0',
    },
    lastDispensedAt: {
      type: Date,
      default: null,
    },
    lastDispensationId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    collection: 'prescriptionItems',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

prescriptionItemSchema.pre('validate', function validatePrescriptionItem() {
  const dose = decimalNumber(this.dose);
  const quantity = decimalNumber(this.quantity);
  const dispensedQuantity = decimalNumber(this.dispensedQuantity);

  if (!Number.isFinite(dose) || dose <= 0) {
    this.invalidate('dose', 'Prescription dose must be positive');
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    this.invalidate('quantity', 'Prescription quantity must be positive');
  }

  if (
    !Number.isFinite(dispensedQuantity) ||
    dispensedQuantity < 0 ||
    dispensedQuantity > quantity
  ) {
    this.invalidate(
      'dispensedQuantity',
      'Dispensed quantity must be between zero and the prescribed quantity',
    );
  }

  const requiresDurationValue = ![
    'UNTIL_FINISHED',
    'AS_NEEDED',
  ].includes(this.durationUnit);

  if (requiresDurationValue && this.durationValue == null) {
    this.invalidate(
      'durationValue',
      'The selected duration unit requires a positive duration value',
    );
  }

  if (this.durationValue != null) {
    const duration = decimalNumber(this.durationValue);
    if (!Number.isFinite(duration) || duration <= 0) {
      this.invalidate('durationValue', 'Duration value must be positive');
    }
  }

  if (this.asNeeded && this.asNeededReason == null) {
    this.invalidate(
      'asNeededReason',
      'As-needed prescriptions require a clinical reason',
    );
  }

  if (!this.asNeeded && this.asNeededReason != null) {
    this.invalidate(
      'asNeededReason',
      'Scheduled prescription items cannot retain an as-needed reason',
    );
  }

  if (this.endDate != null && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Prescription end date cannot precede start date');
  }

  if (this.status !== 'ACTIVE') {
    if (
      this.cancelledAt == null ||
      this.cancelledBy == null ||
      this.cancellationReason == null
    ) {
      this.invalidate(
        'status',
        'Cancelled or replaced items require attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active prescription items cannot retain cancellation metadata',
    );
  }

  const hasDispensationAttribution =
    this.lastDispensedAt != null && this.lastDispensationId != null;
  const hasNoDispensationAttribution =
    this.lastDispensedAt == null && this.lastDispensationId == null;

  if (!hasDispensationAttribution && !hasNoDispensationAttribution) {
    this.invalidate(
      'lastDispensationId',
      'Dispensation timestamp and identifier must be updated together',
    );
  }

  if (dispensedQuantity > 0 && !hasDispensationAttribution) {
    this.invalidate(
      'dispensedQuantity',
      'Positive dispensed quantity requires traceable dispensation attribution',
    );
  }
});

prescriptionItemSchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    sequence: 1,
  },
  {
    name: 'uq_prescription_items_sequence',
    unique: true,
  },
);

prescriptionItemSchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    status: 1,
  },
  {
    name: 'ix_prescription_items_prescription_status',
  },
);

prescriptionItemSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    medicineId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: 'ix_prescription_items_patient_medicine_status',
  },
);

prescriptionItemSchema.index(
  {
    facilityId: 1,
    formularyItemId: 1,
    createdAt: -1,
  },
  {
    name: 'ix_prescription_items_formulary_created',
  },
);

export const prescriptionStatusHistorySchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
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
    sequence: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    fromStatus: {
      type: String,
      default: null,
      enum: [...prescriptionStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: prescriptionStatusValues,
      immutable: true,
    },
    changeType: {
      type: String,
      required: true,
      enum: prescriptionChangeTypeValues,
      immutable: true,
    },
    changeSource: {
      type: String,
      required: true,
      enum: prescriptionStatusChangeSourceValues,
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
    encryptedSnapshot: {
      type: encryptedPrescriptionSnapshotSchema,
      required: true,
      immutable: true,
      select: false,
    },
    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 64,
      maxlength: 128,
      select: false,
    },
    signedBy: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    signatureMethod: {
      type: String,
      default: null,
      enum: [...providerSignatureMethodValues, null],
      immutable: true,
    },
    signatureDigest: {
      type: String,
      default: null,
      trim: true,
      minlength: 32,
      maxlength: 256,
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
    collection: 'prescriptionStatusHistories',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

prescriptionStatusHistorySchema.pre(
  'validate',
  function validatePrescriptionStatusHistory() {
    const signatureFields = [
      this.signedBy,
      this.signatureMethod,
      this.signatureDigest,
    ];

    const signatureComplete = signatureFields.every((value) => value != null);
    const signatureAbsent = signatureFields.every((value) => value == null);

    if (!signatureComplete && !signatureAbsent) {
      this.invalidate(
        'signatureMethod',
        'Prescription history signature fields must be all present or all absent',
      );
    }

    if (this.toStatus === 'ISSUED' && !signatureComplete) {
      this.invalidate(
        'signedBy',
        'Prescription issuance history requires provider signature attribution',
      );
    }
  },
);

prescriptionStatusHistorySchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    sequence: 1,
  },
  {
    name: 'uq_prescription_status_histories_sequence',
    unique: true,
  },
);

prescriptionStatusHistorySchema.index(
  {
    facilityId: 1,
    patientId: 1,
    occurredAt: -1,
  },
  {
    name: 'ix_prescription_status_histories_patient_occurred',
  },
);

prescriptionStatusHistorySchema.index(
  {
    facilityId: 1,
    transactionId: 1,
  },
  {
    name: 'ix_prescription_status_histories_transaction',
  },
);

export const prescriptionSafetyWarningSchema = new Schema(
  {
    facilityId: {
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
      default: null,
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
    warningFingerprint: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
      select: false,
    },
    warningType: {
      type: String,
      required: true,
      enum: prescriptionWarningTypeValues,
      immutable: true,
    },
    severity: {
      type: String,
      required: true,
      enum: prescriptionWarningSeverityValues,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: prescriptionWarningStatusValues,
      default: 'OPEN',
    },
    warningCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 2,
      maxlength: 5_000,
      select: false,
    },
    patientAllergyId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    conflictingPrescriptionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    conflictingPrescriptionItemId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    externalReferenceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
      immutable: true,
      select: false,
    },
    detectedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    detectedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    acknowledgementReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    overriddenAt: {
      type: Date,
      default: null,
    },
    overriddenBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    overrideReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    resolutionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
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
    collection: 'prescriptionSafetyWarnings',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

prescriptionSafetyWarningSchema.pre(
  'validate',
  function validatePrescriptionSafetyWarning() {
    const acknowledgementComplete =
      this.acknowledgedAt != null &&
      this.acknowledgedBy != null &&
      this.acknowledgementReason != null;
    const acknowledgementAbsent =
      this.acknowledgedAt == null &&
      this.acknowledgedBy == null &&
      this.acknowledgementReason == null;
    const overrideComplete =
      this.overriddenAt != null &&
      this.overriddenBy != null &&
      this.overrideReason != null;
    const overrideAbsent =
      this.overriddenAt == null &&
      this.overriddenBy == null &&
      this.overrideReason == null;
    const resolutionComplete =
      this.resolvedAt != null &&
      this.resolvedBy != null &&
      this.resolutionReason != null;
    const resolutionAbsent =
      this.resolvedAt == null &&
      this.resolvedBy == null &&
      this.resolutionReason == null;

    if (!acknowledgementComplete && !acknowledgementAbsent) {
      this.invalidate(
        'acknowledgedAt',
        'Warning acknowledgement fields must be updated together',
      );
    }

    if (!overrideComplete && !overrideAbsent) {
      this.invalidate(
        'overriddenAt',
        'Warning override fields must be updated together',
      );
    }

    if (!resolutionComplete && !resolutionAbsent) {
      this.invalidate(
        'resolvedAt',
        'Warning resolution fields must be updated together',
      );
    }

    if (this.status === 'OPEN' && !acknowledgementAbsent) {
      this.invalidate('status', 'Open warnings cannot retain acknowledgement data');
    }

    if (this.status === 'ACKNOWLEDGED' && !acknowledgementComplete) {
      this.invalidate(
        'status',
        'Acknowledged warnings require acknowledgement attribution',
      );
    }

    if (this.status === 'OVERRIDDEN' && !overrideComplete) {
      this.invalidate('status', 'Overridden warnings require override attribution');
    }

    if (this.status === 'RESOLVED' && !resolutionComplete) {
      this.invalidate('status', 'Resolved warnings require resolution attribution');
    }

    if (this.warningType === 'ALLERGY' && this.patientAllergyId == null) {
      this.invalidate(
        'patientAllergyId',
        'Allergy warnings require a patient allergy reference',
      );
    }

    if (
      this.warningType === 'DUPLICATE_ACTIVE_MEDICINE' &&
      (this.conflictingPrescriptionId == null ||
        this.conflictingPrescriptionItemId == null)
    ) {
      this.invalidate(
        'conflictingPrescriptionId',
        'Duplicate medicine warnings require conflicting prescription traceability',
      );
    }
  },
);

prescriptionSafetyWarningSchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    warningFingerprint: 1,
  },
  {
    name: 'uq_prescription_warnings_fingerprint',
    unique: true,
  },
);

prescriptionSafetyWarningSchema.index(
  {
    facilityId: 1,
    prescriptionId: 1,
    status: 1,
    severity: 1,
  },
  {
    name: 'ix_prescription_warnings_status_severity',
  },
);

prescriptionSafetyWarningSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    warningType: 1,
    detectedAt: -1,
  },
  {
    name: 'ix_prescription_warnings_patient_type_detected',
  },
);

export type Prescription = InferSchemaType<typeof prescriptionSchema>;
export type PrescriptionItem = InferSchemaType<typeof prescriptionItemSchema>;
export type PrescriptionStatusHistory = InferSchemaType<
  typeof prescriptionStatusHistorySchema
>;
export type PrescriptionSafetyWarning = InferSchemaType<
  typeof prescriptionSafetyWarningSchema
>;

export const PrescriptionModel =
  (mongoose.models['prescriptions'] as Model<Prescription> | undefined) ??
  mongoose.model<Prescription>(
    'prescriptions',
    prescriptionSchema,
    'prescriptions',
  );

export const PrescriptionItemModel =
  (mongoose.models['prescriptionItems'] as Model<PrescriptionItem> | undefined) ??
  mongoose.model<PrescriptionItem>(
    'prescriptionItems',
    prescriptionItemSchema,
    'prescriptionItems',
  );

export const PrescriptionStatusHistoryModel =
  (mongoose.models['prescriptionStatusHistories'] as
    | Model<PrescriptionStatusHistory>
    | undefined) ??
  mongoose.model<PrescriptionStatusHistory>(
    'prescriptionStatusHistories',
    prescriptionStatusHistorySchema,
    'prescriptionStatusHistories',
  );

export const PrescriptionSafetyWarningModel =
  (mongoose.models['prescriptionSafetyWarnings'] as
    | Model<PrescriptionSafetyWarning>
    | undefined) ??
  mongoose.model<PrescriptionSafetyWarning>(
    'prescriptionSafetyWarnings',
    prescriptionSafetyWarningSchema,
    'prescriptionSafetyWarnings',
  );