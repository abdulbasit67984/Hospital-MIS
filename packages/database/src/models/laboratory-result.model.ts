import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  laboratoryResultFlagValues,
  laboratoryResultPublicationStatusValues,
  laboratoryResultStatusValues,
  laboratoryResultValueTypeValues,
  laboratoryResultVersionChangeTypeValues,
} from './laboratory.types.js';

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

const encryptedLaboratorySnapshotSchema = new Schema(
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
      maxlength: 20_000_000,
      select: false,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const codedResultValueSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    display: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },
    codingSystem: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const referenceRangeSnapshotSchema = new Schema(
  {
    rangeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    displayText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_000,
    },
    lowerBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    upperBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    criticalLowerBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    criticalUpperBound: {
      type: Schema.Types.Decimal128,
      default: null,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const resultComponentSchema = new Schema(
  {
    componentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    componentNameSnapshot: {
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
    numericValue: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    textValue: {
      type: String,
      default: null,
      maxlength: 100_000,
      select: false,
    },
    codedValue: {
      type: codedResultValueSchema,
      default: null,
    },
    qualitativeValue: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    structuredValue: {
      type: Schema.Types.Mixed,
      default: null,
      select: false,
    },
    unitCodeSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    unitNameSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    referenceRangeSnapshot: {
      type: referenceRangeSnapshotSchema,
      default: null,
    },
    flag: {
      type: String,
      required: true,
      enum: laboratoryResultFlagValues,
      default: 'NOT_APPLICABLE',
    },
    interpretation: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5_000,
      select: false,
    },
    displayOrder: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

resultComponentSchema.pre('validate', function validateResultComponent() {
  this.componentCode = normalizeCode(this.componentCode);

  const populatedValueCount = [
    this.numericValue,
    this.textValue,
    this.codedValue,
    this.qualitativeValue,
    this.structuredValue,
  ].filter((value) => value != null).length;

  if (populatedValueCount !== 1) {
    this.invalidate(
      'valueType',
      'Each laboratory result component requires exactly one typed value',
    );

    return;
  }

  const valueMatchesType =
    (this.valueType === 'NUMERIC' && this.numericValue != null) ||
    (this.valueType === 'TEXT' && this.textValue != null) ||
    (this.valueType === 'CODED' && this.codedValue != null) ||
    (this.valueType === 'QUALITATIVE' &&
      this.qualitativeValue != null) ||
    (this.valueType === 'STRUCTURED' &&
      this.structuredValue != null);

  if (!valueMatchesType) {
    this.invalidate(
      'valueType',
      'Laboratory result value does not match the standardized component value type',
    );
  }

  if (
    this.valueType === 'NUMERIC' &&
    (this.unitCodeSnapshot == null || this.unitNameSnapshot == null)
  ) {
    this.invalidate(
      'unitCodeSnapshot',
      'Numeric laboratory results require unit code and name snapshots',
    );
  }
});

export const labResultSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    resultNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 120,
    },
    labOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labOrderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labTestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    specimenId: {
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
    status: {
      type: String,
      required: true,
      enum: laboratoryResultStatusValues,
      default: 'DRAFT',
    },
    components: {
      type: [resultComponentSchema],
      required: true,
      default: [],
      select: false,
    },
    overallFlag: {
      type: String,
      required: true,
      enum: laboratoryResultFlagValues,
      default: 'NOT_APPLICABLE',
    },
    criticalComponentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    unresolvedCriticalComponentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    conclusion: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20_000,
      select: false,
    },
    technicalNotes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20_000,
      select: false,
    },
    enteredAt: {
      type: Date,
      default: null,
    },
    enteredBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    technicianStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    validatedAt: {
      type: Date,
      default: null,
    },
    validatedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    validatorStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    verifierStaffId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    currentVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    latestVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    correctedAt: {
      type: Date,
      default: null,
    },
    correctedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    correctionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      select: false,
    },
    supersedesResultVersionId: {
      type: Schema.Types.ObjectId,
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
    publicationStatus: {
      type: String,
      required: true,
      enum: laboratoryResultPublicationStatusValues,
      default: 'NOT_PUBLISHED',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    withdrawnBy: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    withdrawalReason: {
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
    collection: 'labResults',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labResultSchema.pre('validate', function validateLabResult() {
  this.resultNumber = normalizeCode(this.resultNumber);
  this.testCodeSnapshot = normalizeCode(this.testCodeSnapshot);

  if (this.components.length < 1) {
    this.invalidate(
      'components',
      'Laboratory results require at least one standardized result component',
    );
  }

  const componentCodes = new Set<string>();
  let criticalCount = 0;

  for (const component of this.components) {
    if (componentCodes.has(component.componentCode)) {
      this.invalidate(
        'components',
        'Laboratory results cannot contain duplicate component codes',
      );
    }

    componentCodes.add(component.componentCode);

    if (
      ['CRITICAL', 'CRITICAL_HIGH', 'CRITICAL_LOW'].includes(
        component.flag,
      )
    ) {
      criticalCount += 1;
    }
  }

  if (this.criticalComponentCount !== criticalCount) {
    this.invalidate(
      'criticalComponentCount',
      'Critical component count must match the result components',
    );
  }

  if (this.unresolvedCriticalComponentCount > this.criticalComponentCount) {
    this.invalidate(
      'unresolvedCriticalComponentCount',
      'Unresolved critical count cannot exceed total critical count',
    );
  }

  if (this.status === 'DRAFT') {
    if (
      this.enteredAt != null ||
      this.enteredBy != null ||
      this.technicianStaffId != null ||
      this.validatedAt != null ||
      this.validatedBy != null ||
      this.verifiedAt != null ||
      this.verifiedBy != null ||
      this.latestVersionId != null ||
      this.currentVersion !== 0
    ) {
      this.invalidate(
        'status',
        'Draft laboratory results cannot retain entry, validation, or verification attribution',
      );
    }
  } else if (
    this.enteredAt == null ||
    this.enteredBy == null ||
    this.technicianStaffId == null
  ) {
    this.invalidate(
      'status',
      'Entered laboratory results require technician attribution',
    );
  }

  if (
    ['VALIDATED', 'VERIFIED', 'CORRECTED'].includes(this.status) &&
    (this.validatedAt == null ||
      this.validatedBy == null ||
      this.validatorStaffId == null)
  ) {
    this.invalidate(
      'validatedAt',
      'Validated laboratory result states require validator attribution',
    );
  }

  if (['VERIFIED', 'CORRECTED'].includes(this.status)) {
    if (
      this.verifiedAt == null ||
      this.verifiedBy == null ||
      this.verifierStaffId == null ||
      this.latestVersionId == null ||
      this.currentVersion < 1
    ) {
      this.invalidate(
        'status',
        'Verified laboratory results require verifier attribution and an immutable version snapshot',
      );
    }
  }

  if (this.status === 'CORRECTED') {
    if (
      this.correctedAt == null ||
      this.correctedBy == null ||
      this.correctionReason == null ||
      this.supersedesResultVersionId == null ||
      this.currentVersion < 2
    ) {
      this.invalidate(
        'status',
        'Corrected laboratory results require correction attribution and prior version traceability',
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
        'Cancelled laboratory results require cancellation attribution and reason',
      );
    }
  } else if (
    this.cancelledAt != null ||
    this.cancelledBy != null ||
    this.cancellationReason != null
  ) {
    this.invalidate(
      'status',
      'Active laboratory results cannot retain cancellation metadata',
    );
  }

  if (this.publicationStatus === 'PUBLISHED') {
    if (
      this.publishedAt == null ||
      this.publishedBy == null ||
      !['VERIFIED', 'CORRECTED'].includes(this.status)
    ) {
      this.invalidate(
        'publicationStatus',
        'Only verified or corrected laboratory results may be published with attribution',
      );
    }
  }

  if (this.publicationStatus === 'WITHDRAWN') {
    if (
      this.withdrawnAt == null ||
      this.withdrawnBy == null ||
      this.withdrawalReason == null
    ) {
      this.invalidate(
        'publicationStatus',
        'Withdrawn laboratory results require withdrawal attribution and reason',
      );
    }
  } else if (
    this.withdrawnAt != null ||
    this.withdrawnBy != null ||
    this.withdrawalReason != null
  ) {
    this.invalidate(
      'publicationStatus',
      'Non-withdrawn laboratory results cannot retain withdrawal metadata',
    );
  }
});

labResultSchema.index(
  {
    facilityId: 1,
    resultNumber: 1,
  },
  {
    name: 'uq_lab_results_facility_number',
    unique: true,
  },
);

labResultSchema.index(
  {
    facilityId: 1,
    labOrderItemId: 1,
  },
  {
    name: 'uq_lab_results_order_item',
    unique: true,
  },
);

labResultSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    verifiedAt: -1,
  },
  {
    name: 'ix_lab_results_patient_verified',
  },
);

labResultSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    publicationStatus: 1,
    verifiedAt: -1,
  },
  {
    name: 'ix_lab_results_encounter_visibility',
  },
);

labResultSchema.index(
  {
    facilityId: 1,
    status: 1,
    unresolvedCriticalComponentCount: 1,
    updatedAt: 1,
  },
  {
    name: 'ix_lab_results_critical_worklist',
  },
);

export const labResultVersionSchema = new Schema(
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
    labOrderId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    labOrderItemId: {
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
    versionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    changeType: {
      type: String,
      required: true,
      enum: laboratoryResultVersionChangeTypeValues,
      immutable: true,
    },
    statusSnapshot: {
      type: String,
      required: true,
      enum: laboratoryResultStatusValues,
      immutable: true,
    },
    overallFlagSnapshot: {
      type: String,
      required: true,
      enum: laboratoryResultFlagValues,
      immutable: true,
    },
    criticalComponentCountSnapshot: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    encryptedSnapshot: {
      type: encryptedLaboratorySnapshotSchema,
      required: true,
      immutable: true,
      select: false,
    },
    snapshotHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
    },
    contentHash: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 32,
      maxlength: 256,
    },
    changeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      immutable: true,
      select: false,
    },
    technicianStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    validatorStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    verifierStaffId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    recordedBy: {
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
    collection: 'labResultVersions',
    strict: true,
    timestamps: true,
    versionKey: false,
  },
);

labResultVersionSchema.pre(
  'validate',
  function validateLabResultVersion() {
    if (this.versionNumber === 1 && this.previousVersionId != null) {
      this.invalidate(
        'previousVersionId',
        'The first laboratory result version cannot reference a previous version',
      );
    }

    if (this.versionNumber > 1 && this.previousVersionId == null) {
      this.invalidate(
        'previousVersionId',
        'Subsequent laboratory result versions require previous-version traceability',
      );
    }

    if (
      this.changeType === 'INITIAL_VERIFICATION' &&
      this.versionNumber !== 1
    ) {
      this.invalidate(
        'changeType',
        'Initial verification must create the first laboratory result version',
      );
    }

    if (
      ['CORRECTION', 'CANCELLATION', 'RECOVERY'].includes(
        this.changeType,
      ) &&
      this.changeReason == null
    ) {
      this.invalidate(
        'changeReason',
        `${this.changeType} laboratory result versions require a reason`,
      );
    }
  },
);

labResultVersionSchema.index(
  {
    facilityId: 1,
    labResultId: 1,
    versionNumber: 1,
  },
  {
    name: 'uq_lab_result_versions_result_version',
    unique: true,
  },
);

labResultVersionSchema.index(
  {
    facilityId: 1,
    patientId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_lab_result_versions_patient_recorded',
  },
);

labResultVersionSchema.index(
  {
    facilityId: 1,
    encounterId: 1,
    recordedAt: -1,
  },
  {
    name: 'ix_lab_result_versions_encounter_recorded',
  },
);

export type LabResult = InferSchemaType<typeof labResultSchema>;

export type LabResultVersion = InferSchemaType<
  typeof labResultVersionSchema
>;

export const LabResultModel =
  (mongoose.models['labResults'] as Model<LabResult> | undefined) ??
  mongoose.model<LabResult>(
    'labResults',
    labResultSchema,
    'labResults',
  );

export const LabResultVersionModel =
  (mongoose.models['labResultVersions'] as
    | Model<LabResultVersion>
    | undefined) ??
  mongoose.model<LabResultVersion>(
    'labResultVersions',
    labResultVersionSchema,
    'labResultVersions',
  );