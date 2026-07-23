import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  consultantAdjustmentStatusValues,
  consultantCalculationMethodValues,
  consultantCalculationRunStatusValues,
  consultantCalculationRunTypeValues,
  consultantParticipantAllocationMethodValues,
  consultantParticipantRoleValues,
  consultantRecognitionBasisValues,
  consultantRevenueDirectionValues,
  consultantRevenueEntryStatusValues,
  consultantRevenueEntryTypeValues,
  consultantReversalStatusValues,
  consultantServiceCategoryValues,
  consultantSharingCurrencyValues,
} from './consultant-sharing.types.js';

import {
  compareConsultantSharingDecimals,
  consultantSharingCommonFields,
  consultantSharingEncryptedText,
  consultantSharingHash,
  consultantSharingNonNegativeDecimal,
  consultantSharingNullableDecimal,
  consultantSharingObjectIdArray,
  consultantSharingSignedDecimal,
  consultantSharingTimestampedSchemaOptions,
  nullableConsultantSharingObjectId,
  requireConsultantSharingReason,
  validateConsultantSharingExpression,
  validateConsultantSharingImmutableHash,
  validateConsultantSharingMakerChecker,
  validateConsultantSharingMoneyFields,
  validateConsultantSharingPercentage,
  validateConsultantSharingSignedDecimal,
  validateDistinctConsultantSharingObjectIds,
} from './consultant-sharing-schema-helpers.js';

export const consultantCalculationRunSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    runType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantCalculationRunTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: consultantCalculationRunStatusValues,
      default: 'QUEUED',
    },
    sourceFinancialEventId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    sourceFinancialEventType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    sourceModule: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    sourceRecordId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoiceId: { ...nullableConsultantSharingObjectId, immutable: true },
    invoiceLineId: { ...nullableConsultantSharingObjectId, immutable: true },
    consultantId: { ...nullableConsultantSharingObjectId, immutable: true },
    agreementId: { ...nullableConsultantSharingObjectId, immutable: true },
    inputHash: consultantSharingHash,
    previousCalculationHash: {
      type: String,
      default: null,
      immutable: true,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    outputCalculationHash: {
      type: String,
      default: null,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    requestedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestedAt: { type: Date, required: true, immutable: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    attemptCount: { type: Number, required: true, min: 0, max: 100, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, max: 100, default: 10 },
    nextAttemptAt: { type: Date, default: null },
    leaseOwner: { type: String, default: null, trim: true, maxlength: 240 },
    leaseExpiresAt: { type: Date, default: null },
    processedEntryCount: { type: Number, required: true, min: 0, default: 0 },
    createdEntryCount: { type: Number, required: true, min: 0, default: 0 },
    adjustedEntryCount: { type: Number, required: true, min: 0, default: 0 },
    skippedEntryCount: { type: Number, required: true, min: 0, default: 0 },
    failedEntryCount: { type: Number, required: true, min: 0, default: 0 },
    errorCode: { type: String, default: null, trim: true, uppercase: true, maxlength: 120 },
    errorMessageSanitized: { type: String, default: null, trim: true, maxlength: 2_000 },
    deadLetterReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    recoveryOfRunId: { ...nullableConsultantSharingObjectId, immutable: true },
  },
  consultantSharingTimestampedSchemaOptions('consultantCalculationRuns'),
);

consultantCalculationRunSchema.pre('validate', function validateCalculationRun() {
  validateConsultantSharingImmutableHash(this, 'inputHash');
  if (this.attemptCount > this.maxAttempts) {
    this.invalidate('attemptCount', 'Attempt count cannot exceed the configured maximum');
  }
  if (this.status === 'RUNNING') {
    if (this.startedAt == null || this.leaseOwner == null || this.leaseExpiresAt == null) {
      this.invalidate('startedAt', 'Running calculations require an active recovery lease');
    }
  }
  if (['COMPLETED', 'PARTIALLY_COMPLETED'].includes(this.status)) {
    if (this.completedAt == null || this.outputCalculationHash == null) {
      this.invalidate(
        'completedAt',
        'Completed calculations require completion time and output hash',
      );
    }
  }
  if (['FAILED', 'DEAD_LETTERED'].includes(this.status)) {
    if (this.failedAt == null || this.errorCode == null || this.errorMessageSanitized == null) {
      this.invalidate('failedAt', 'Failed calculations require sanitized error metadata');
    }
  }
  if (this.status === 'DEAD_LETTERED') {
    requireConsultantSharingReason(this, 'deadLetterReason', this.deadLetterReason);
  }
});

consultantCalculationRunSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_calculation_runs_operation', unique: true },
);
consultantCalculationRunSchema.index(
  { facilityId: 1, inputHash: 1, runType: 1 },
  {
    name: 'uq_consultant_calculation_runs_input',
    unique: true,
    partialFilterExpression: {
      status: { $in: ['QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED'] },
    },
  },
);
consultantCalculationRunSchema.index(
  { facilityId: 1, status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 },
  { name: 'ix_consultant_calculation_runs_recovery' },
);
consultantCalculationRunSchema.index(
  { facilityId: 1, invoiceLineId: 1, requestedAt: -1 },
  { name: 'ix_consultant_calculation_runs_invoice_line' },
);

export const consultantRevenueEntrySchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    calculationRunId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantStaffId: { ...nullableConsultantSharingObjectId, immutable: true },
    consultantGroupId: { ...nullableConsultantSharingObjectId, immutable: true },
    agreementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    agreementVersion: { type: Number, required: true, immutable: true, min: 1 },
    agreementRuleId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    ruleVersion: { type: Number, required: true, immutable: true, min: 1 },
    patientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    encounterId: { ...nullableConsultantSharingObjectId, immutable: true },
    admissionId: { ...nullableConsultantSharingObjectId, immutable: true },
    invoiceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoiceLineId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    paymentAllocationId: { ...nullableConsultantSharingObjectId, immutable: true },
    refundId: { ...nullableConsultantSharingObjectId, immutable: true },
    creditNoteId: { ...nullableConsultantSharingObjectId, immutable: true },
    debitNoteId: { ...nullableConsultantSharingObjectId, immutable: true },
    claimId: { ...nullableConsultantSharingObjectId, immutable: true },
    packageId: { ...nullableConsultantSharingObjectId, immutable: true },
    payerOrganizationId: { ...nullableConsultantSharingObjectId, immutable: true },
    panelProgramId: { ...nullableConsultantSharingObjectId, immutable: true },
    departmentId: { ...nullableConsultantSharingObjectId, immutable: true },
    serviceId: { ...nullableConsultantSharingObjectId, immutable: true },
    serviceCategory: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantServiceCategoryValues,
    },
    chargeCatalogItemId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    procedureId: { ...nullableConsultantSharingObjectId, immutable: true },
    sourceFinancialEventId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      maxlength: 240,
    },
    sourceFinancialEventType: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    sourceLedgerEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
    sourceModule: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    sourceRecordId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    direction: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantRevenueDirectionValues,
      default: 'CREDIT',
    },
    entryType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantRevenueEntryTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: consultantRevenueEntryStatusValues,
      default: 'PENDING',
    },
    recognitionBasis: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantRecognitionBasisValues,
    },
    calculationMethod: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantCalculationMethodValues,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSharingCurrencyValues,
      default: 'PKR',
    },
    grossAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    discountAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    welfareZakatAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    panelSponsorAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    patientAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    packageAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    refundAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    creditNoteAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    debitNoteAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    writeOffAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    claimAdjustmentAmount: { ...consultantSharingSignedDecimal, immutable: true },
    nonShareableAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    costDeductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    consumableDeductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    otherEligibilityDeductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    eligibleRevenueBeforeRecognition: { ...consultantSharingNonNegativeDecimal, immutable: true },
    recognitionRatio: { ...consultantSharingNonNegativeDecimal, immutable: true },
    eligibleRevenue: { ...consultantSharingNonNegativeDecimal, immutable: true },
    pendingEligibleRevenue: { ...consultantSharingNonNegativeDecimal, immutable: true },
    percentage: { ...consultantSharingNullableDecimal, immutable: true },
    fixedAmount: { ...consultantSharingNullableDecimal, immutable: true },
    selectedTierCode: { type: String, default: null, immutable: true, trim: true, uppercase: true, maxlength: 80 },
    consultantShare: { ...consultantSharingNonNegativeDecimal, immutable: true },
    hospitalShare: { ...consultantSharingNonNegativeDecimal, immutable: true },
    otherParticipantShare: { ...consultantSharingNonNegativeDecimal, immutable: true },
    taxWithholdingAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    deductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    netPayableAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    settledAmount: consultantSharingNonNegativeDecimal,
    outstandingAmount: consultantSharingNonNegativeDecimal,
    settlementId: nullableConsultantSharingObjectId,
    inputHash: consultantSharingHash,
    calculationHash: consultantSharingHash,
    immutableHash: consultantSharingHash,
    matchReason: { type: String, required: true, immutable: true, trim: true, minlength: 5, maxlength: 2_000 },
    calculationTrace: { type: Schema.Types.Mixed, required: true, immutable: true },
    calculatedBy: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
      validate: {
        validator: (value: unknown) => value === 'SYSTEM' || mongoose.isObjectIdOrHexString(value),
        message: 'calculatedBy must be SYSTEM or a valid user identifier',
      },
    },
    calculatedAt: { type: Date, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    postedAt: { type: Date, default: null },
    heldAt: { type: Date, default: null },
    heldBy: nullableConsultantSharingObjectId,
    holdReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reversalOfEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
    reversedByEntryId: nullableConsultantSharingObjectId,
    adjustmentOfEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
    supersedesEntryId: { ...nullableConsultantSharingObjectId, immutable: true },
  },
  consultantSharingTimestampedSchemaOptions('consultantRevenueEntries'),
);

consultantRevenueEntrySchema.pre('validate', function validateRevenueEntry() {
  validateConsultantSharingMoneyFields(this, [
    'grossAmount',
    'discountAmount',
    'welfareZakatAmount',
    'panelSponsorAmount',
    'patientAmount',
    'packageAmount',
    'refundAmount',
    'creditNoteAmount',
    'debitNoteAmount',
    'writeOffAmount',
    'nonShareableAmount',
    'costDeductionAmount',
    'consumableDeductionAmount',
    'otherEligibilityDeductionAmount',
    'eligibleRevenueBeforeRecognition',
    'recognitionRatio',
    'eligibleRevenue',
    'pendingEligibleRevenue',
    'consultantShare',
    'hospitalShare',
    'otherParticipantShare',
    'taxWithholdingAmount',
    'deductionAmount',
    'netPayableAmount',
    'settledAmount',
    'outstandingAmount',
  ]);
  validateConsultantSharingSignedDecimal(this, 'claimAdjustmentAmount');
  if (compareConsultantSharingDecimals(this.recognitionRatio, '1') > 0) {
    this.invalidate(
      'recognitionRatio',
      'Recognition ratio cannot exceed 1',
    );
  }
  if (this.percentage != null) {
    validateConsultantSharingPercentage(this, 'percentage', true);
  }
  if (this.fixedAmount != null) {
    validateConsultantSharingMoneyFields(this, ['fixedAmount']);
  }
  validateConsultantSharingImmutableHash(this, 'inputHash');
  validateConsultantSharingImmutableHash(this, 'calculationHash');
  validateConsultantSharingImmutableHash(this, 'immutableHash');

  validateConsultantSharingExpression(
    this,
    'eligibleRevenueBeforeRecognition',
    ['eligibleRevenue', 'pendingEligibleRevenue'],
    [],
    'Recognized and pending eligible revenue must equal pre-recognition eligible revenue',
  );
  validateConsultantSharingExpression(
    this,
    'eligibleRevenue',
    ['consultantShare', 'hospitalShare'],
    [],
    'Consultant and hospital shares must equal eligible revenue',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableAmount',
    ['consultantShare'],
    ['taxWithholdingAmount', 'deductionAmount'],
    'Net payable must equal consultant share less withholding and deductions',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableAmount',
    ['settledAmount', 'outstandingAmount'],
    [],
    'Settled and outstanding amounts must equal net payable',
  );

  if (compareConsultantSharingDecimals(this.consultantShare, this.eligibleRevenue) > 0) {
    this.invalidate('consultantShare', 'Consultant share cannot exceed eligible revenue');
  }
  if (compareConsultantSharingDecimals(this.otherParticipantShare, this.consultantShare) > 0) {
    this.invalidate(
      'otherParticipantShare',
      'Other participant shares cannot exceed the consultant share pool',
    );
  }
  if (this.entryType === 'REVERSAL' || this.entryType === 'REFUND') {
    if (this.direction !== 'DEBIT' || this.reversalOfEntryId == null) {
      this.invalidate(
        'direction',
        'Reversal and refund entries must debit and reference the original entry',
      );
    }
  }
  if (this.direction === 'DEBIT' && this.reversalOfEntryId == null && this.adjustmentOfEntryId == null) {
    this.invalidate(
      'reversalOfEntryId',
      'Debit entries must identify the reversed or adjusted entry',
    );
  }
  if (this.status === 'POSTED' && this.postedAt == null) {
    this.invalidate('postedAt', 'Posted revenue entries require a posting timestamp');
  }
  if (this.status === 'HELD') {
    if (this.heldAt == null || this.heldBy == null) {
      this.invalidate('heldAt', 'Held revenue entries require actor and timestamp');
    }
    requireConsultantSharingReason(this, 'holdReason', this.holdReason);
  }
});

consultantRevenueEntrySchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_revenue_entries_operation', unique: true },
);
consultantRevenueEntrySchema.index(
  { facilityId: 1, calculationHash: 1 },
  { name: 'uq_consultant_revenue_entries_calculation_hash', unique: true },
);
consultantRevenueEntrySchema.index(
  {
    facilityId: 1,
    invoiceLineId: 1,
    consultantId: 1,
    agreementRuleId: 1,
    sourceFinancialEventId: 1,
    direction: 1,
  },
  { name: 'uq_consultant_revenue_entries_recognition', unique: true },
);
consultantRevenueEntrySchema.index(
  { facilityId: 1, consultantId: 1, status: 1, occurredAt: 1 },
  { name: 'ix_consultant_revenue_entries_consultant_ledger' },
);
consultantRevenueEntrySchema.index(
  { facilityId: 1, settlementId: 1, status: 1 },
  {
    name: 'ix_consultant_revenue_entries_settlement',
    sparse: true,
  },
);
consultantRevenueEntrySchema.index(
  { facilityId: 1, invoiceId: 1, invoiceLineId: 1, occurredAt: 1 },
  { name: 'ix_consultant_revenue_entries_invoice_trace' },
);
consultantRevenueEntrySchema.index(
  { facilityId: 1, sourceLedgerEntryId: 1 },
  { name: 'ix_consultant_revenue_entries_ledger_trace' },
);

export const consultantRevenueParticipantSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    revenueEntryId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    participantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    participantStaffId: { ...nullableConsultantSharingObjectId, immutable: true },
    participantGroupId: { ...nullableConsultantSharingObjectId, immutable: true },
    participantRole: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantParticipantRoleValues,
    },
    customRoleCode: { type: String, default: null, immutable: true, trim: true, uppercase: true, maxlength: 120 },
    allocationMethod: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantParticipantAllocationMethodValues,
    },
    percentage: { ...consultantSharingNullableDecimal, immutable: true },
    fixedAmount: { ...consultantSharingNullableDecimal, immutable: true },
    shareAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    priority: { type: Number, required: true, immutable: true, min: 0, max: 10_000 },
    residual: { type: Boolean, required: true, immutable: true, default: false },
    allocationHash: consultantSharingHash,
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: consultantSharingHash,
    reversalOfParticipantId: { ...nullableConsultantSharingObjectId, immutable: true },
  },
  consultantSharingTimestampedSchemaOptions('consultantRevenueParticipants'),
);

consultantRevenueParticipantSchema.pre('validate', function validateRevenueParticipant() {
  validateConsultantSharingMoneyFields(this, ['shareAmount']);
  if (this.percentage != null) {
    validateConsultantSharingPercentage(this, 'percentage', true);
  }
  if (this.fixedAmount != null) {
    validateConsultantSharingMoneyFields(this, ['fixedAmount']);
  }
  validateConsultantSharingImmutableHash(this, 'allocationHash');
  validateConsultantSharingImmutableHash(this, 'immutableHash');

  if (this.participantRole === 'CUSTOM') {
    if (this.customRoleCode == null || this.customRoleCode.trim().length === 0) {
      this.invalidate('customRoleCode', 'Custom participant roles require a code');
    } else {
      this.customRoleCode = this.customRoleCode.trim().toUpperCase();
    }
  } else if (this.customRoleCode != null) {
    this.invalidate(
      'customRoleCode',
      'Custom role code is only valid for CUSTOM participants',
    );
  }

  if (this.allocationMethod === 'PERCENTAGE') {
    if (this.percentage == null) {
      this.invalidate(
        'percentage',
        'Percentage participant allocations require a percentage',
      );
    }
    if (this.fixedAmount != null || this.residual) {
      this.invalidate(
        'allocationMethod',
        'Percentage participant allocations cannot include fixed or residual values',
      );
    }
  }
  if (this.allocationMethod === 'FIXED') {
    if (this.fixedAmount == null) {
      this.invalidate('fixedAmount', 'Fixed participant allocations require an amount');
    }
    if (this.percentage != null || this.residual) {
      this.invalidate(
        'allocationMethod',
        'Fixed participant allocations cannot include percentage or residual values',
      );
    }
  }
  if (this.allocationMethod === 'RESIDUAL') {
    if (!this.residual || this.percentage != null || this.fixedAmount != null) {
      this.invalidate(
        'allocationMethod',
        'Residual participant allocations cannot include percentage or fixed values',
      );
    }
  }
});

consultantRevenueParticipantSchema.index(
  { facilityId: 1, revenueEntryId: 1, participantId: 1, participantRole: 1 },
  { name: 'uq_consultant_revenue_participants_entry_role', unique: true },
);
consultantRevenueParticipantSchema.index(
  { facilityId: 1, allocationHash: 1 },
  { name: 'uq_consultant_revenue_participants_hash', unique: true },
);
consultantRevenueParticipantSchema.index(
  { facilityId: 1, participantId: 1, occurredAt: 1 },
  { name: 'ix_consultant_revenue_participants_ledger' },
);

export const consultantRevenueAdjustmentSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: { type: String, required: true, immutable: true, trim: true, minlength: 8, maxlength: 240 },
    adjustmentNumber: { type: String, required: true, immutable: true, trim: true, uppercase: true, minlength: 2, maxlength: 120 },
    revenueEntryId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    settlementId: { ...nullableConsultantSharingObjectId, immutable: true },
    disputeId: { ...nullableConsultantSharingObjectId, immutable: true },
    status: {
      type: String,
      required: true,
      enum: consultantAdjustmentStatusValues,
      default: 'REQUESTED',
    },
    eligibleRevenueDelta: { ...consultantSharingSignedDecimal, immutable: true },
    consultantShareDelta: { ...consultantSharingSignedDecimal, immutable: true },
    hospitalShareDelta: { ...consultantSharingSignedDecimal, immutable: true },
    taxWithholdingDelta: { ...consultantSharingSignedDecimal, immutable: true },
    deductionDelta: { ...consultantSharingSignedDecimal, immutable: true },
    netPayableDelta: { ...consultantSharingSignedDecimal, immutable: true },
    reasonCode: { type: String, required: true, immutable: true, trim: true, uppercase: true, maxlength: 120 },
    reason: { type: String, required: true, immutable: true, trim: true, minlength: 5, maxlength: 4_000 },
    supportingAttachmentIds: { ...consultantSharingObjectIdArray, immutable: true },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableConsultantSharingObjectId,
    approvalRequestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestedAt: { type: Date, required: true, immutable: true },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    postedRevenueEntryId: nullableConsultantSharingObjectId,
    immutableHash: consultantSharingHash,
    reversalOfAdjustmentId: { ...nullableConsultantSharingObjectId, immutable: true },
    reversedByAdjustmentId: nullableConsultantSharingObjectId,
  },
  consultantSharingTimestampedSchemaOptions('consultantRevenueAdjustments'),
);

consultantRevenueAdjustmentSchema.pre('validate', function validateRevenueAdjustment() {
  this.adjustmentNumber = this.adjustmentNumber.trim().toUpperCase();
  for (const path of [
    'eligibleRevenueDelta',
    'consultantShareDelta',
    'hospitalShareDelta',
    'taxWithholdingDelta',
    'deductionDelta',
    'netPayableDelta',
  ] as const) {
    validateConsultantSharingSignedDecimal(this, path);
  }
  validateConsultantSharingMakerChecker(this, 'makerUserId', ['checkerUserId']);
  validateDistinctConsultantSharingObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  validateConsultantSharingImmutableHash(this, 'immutableHash');
  validateConsultantSharingExpression(
    this,
    'eligibleRevenueDelta',
    ['consultantShareDelta', 'hospitalShareDelta'],
    [],
    'Consultant and hospital share deltas must equal eligible-revenue delta',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableDelta',
    ['consultantShareDelta'],
    ['taxWithholdingDelta', 'deductionDelta'],
    'Net-payable delta must equal consultant-share delta less withholding and deduction deltas',
  );
  if (['APPROVED', 'POSTED', 'REVERSED'].includes(this.status) && this.checkerUserId == null) {
    this.invalidate('checkerUserId', `${this.status} adjustments require an independent checker`);
  }
  if (this.status === 'POSTED' && (this.postedAt == null || this.postedRevenueEntryId == null)) {
    this.invalidate('postedAt', 'Posted adjustments require posting metadata and revenue entry');
  }
});

consultantRevenueAdjustmentSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_revenue_adjustments_operation', unique: true },
);
consultantRevenueAdjustmentSchema.index(
  { facilityId: 1, adjustmentNumber: 1 },
  { name: 'uq_consultant_revenue_adjustments_number', unique: true },
);
consultantRevenueAdjustmentSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_revenue_adjustments_hash', unique: true },
);
consultantRevenueAdjustmentSchema.index(
  { facilityId: 1, revenueEntryId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_consultant_revenue_adjustments_entry' },
);
consultantRevenueAdjustmentSchema.index(
  { facilityId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_consultant_revenue_adjustments_approval_queue' },
);

export const consultantRevenueReversalSchema = new Schema(
  {
    ...consultantSharingCommonFields,
    operationKey: { type: String, required: true, immutable: true, trim: true, minlength: 8, maxlength: 240 },
    reversalNumber: { type: String, required: true, immutable: true, trim: true, uppercase: true, minlength: 2, maxlength: 120 },
    revenueEntryId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    status: {
      type: String,
      required: true,
      enum: consultantReversalStatusValues,
      default: 'REQUESTED',
    },
    eligibleRevenueAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    consultantShareAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    hospitalShareAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    taxWithholdingAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    deductionAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    netPayableAmount: { ...consultantSharingNonNegativeDecimal, immutable: true },
    sourceFinancialEventId: { type: String, required: true, immutable: true, trim: true, maxlength: 240 },
    refundId: { ...nullableConsultantSharingObjectId, immutable: true },
    creditNoteId: { ...nullableConsultantSharingObjectId, immutable: true },
    claimAdjustmentId: { ...nullableConsultantSharingObjectId, immutable: true },
    welfareZakatReversalId: { ...nullableConsultantSharingObjectId, immutable: true },
    reasonCode: { type: String, required: true, immutable: true, trim: true, uppercase: true, maxlength: 120 },
    reason: { type: String, required: true, immutable: true, trim: true, minlength: 5, maxlength: 4_000 },
    supportingAttachmentIds: { ...consultantSharingObjectIdArray, immutable: true },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableConsultantSharingObjectId,
    approvalRequestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    requestedAt: { type: Date, required: true, immutable: true },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    reversalRevenueEntryId: nullableConsultantSharingObjectId,
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantRevenueReversals'),
);

consultantRevenueReversalSchema.pre('validate', function validateRevenueReversal() {
  this.reversalNumber = this.reversalNumber.trim().toUpperCase();
  validateConsultantSharingMoneyFields(this, [
    'eligibleRevenueAmount',
    'consultantShareAmount',
    'hospitalShareAmount',
    'taxWithholdingAmount',
    'deductionAmount',
    'netPayableAmount',
  ]);
  validateConsultantSharingExpression(
    this,
    'eligibleRevenueAmount',
    ['consultantShareAmount', 'hospitalShareAmount'],
    [],
    'Reversed consultant and hospital shares must equal reversed eligible revenue',
  );
  validateConsultantSharingExpression(
    this,
    'netPayableAmount',
    ['consultantShareAmount'],
    ['taxWithholdingAmount', 'deductionAmount'],
    'Reversed net payable must reconcile to share less withholding and deductions',
  );
  validateConsultantSharingMakerChecker(this, 'makerUserId', ['checkerUserId']);
  validateDistinctConsultantSharingObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );
  validateConsultantSharingImmutableHash(this, 'immutableHash');
  if (['APPROVED', 'POSTED', 'REVERSED'].includes(this.status) && this.checkerUserId == null) {
    this.invalidate('checkerUserId', `${this.status} reversals require an independent checker`);
  }
  if (this.status === 'POSTED' && (this.postedAt == null || this.reversalRevenueEntryId == null)) {
    this.invalidate('postedAt', 'Posted reversals require the reversing revenue entry');
  }
});

consultantRevenueReversalSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_revenue_reversals_operation', unique: true },
);
consultantRevenueReversalSchema.index(
  { facilityId: 1, reversalNumber: 1 },
  { name: 'uq_consultant_revenue_reversals_number', unique: true },
);
consultantRevenueReversalSchema.index(
  { facilityId: 1, revenueEntryId: 1, sourceFinancialEventId: 1 },
  {
    name: 'uq_consultant_revenue_reversals_source',
    unique: true,
    partialFilterExpression: { status: { $in: ['APPROVED', 'POSTED', 'REVERSED'] } },
  },
);
consultantRevenueReversalSchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_revenue_reversals_hash', unique: true },
);
consultantRevenueReversalSchema.index(
  { facilityId: 1, status: 1, requestedAt: 1 },
  { name: 'ix_consultant_revenue_reversals_approval_queue' },
);

export type ConsultantCalculationRun = InferSchemaType<typeof consultantCalculationRunSchema>;
export type ConsultantRevenueEntry = InferSchemaType<typeof consultantRevenueEntrySchema>;
export type ConsultantRevenueParticipant = InferSchemaType<typeof consultantRevenueParticipantSchema>;
export type ConsultantRevenueAdjustment = InferSchemaType<typeof consultantRevenueAdjustmentSchema>;
export type ConsultantRevenueReversal = InferSchemaType<typeof consultantRevenueReversalSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ConsultantCalculationRunModel = modelFor(
  'consultantCalculationRuns',
  consultantCalculationRunSchema,
);
export const ConsultantRevenueEntryModel = modelFor(
  'consultantRevenueEntries',
  consultantRevenueEntrySchema,
);
export const ConsultantRevenueParticipantModel = modelFor(
  'consultantRevenueParticipants',
  consultantRevenueParticipantSchema,
);
export const ConsultantRevenueAdjustmentModel = modelFor(
  'consultantRevenueAdjustments',
  consultantRevenueAdjustmentSchema,
);
export const ConsultantRevenueReversalModel = modelFor(
  'consultantRevenueReversals',
  consultantRevenueReversalSchema,
);