import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  assistanceApprovalStatusValues,
  assistanceReservationStatusValues,
  assistanceServiceCategoryValues,
} from './welfare-zakat.types.js';

import {
  assistanceCommonFields,
  assistanceEncryptedText,
  assistanceHash,
  assistanceNonNegativeDecimal,
  assistanceObjectIdArray,
  assistancePositiveDecimal,
  assistanceStringArray,
  assistanceTimestampedSchemaOptions,
  compareAssistanceDecimals,
  normalizeAssistanceCode,
  nullableAssistanceObjectId,
  requireAssistanceReason,
  validateAssistanceDateRange,
  validateAssistanceExpression,
  validateAssistanceMoneyFields,
  validateAssistancePositiveDecimal,
  validateDistinctObjectIds,
  validateMakerChecker,
} from './welfare-zakat-schema-helpers.js';

export const assistanceApprovalSchema = new Schema(
  {
    ...assistanceCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    approvalNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    fundId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: assistanceApprovalStatusValues,
      default: 'DRAFT',
    },
    requestedAmount: assistancePositiveDecimal,
    approvedAmount: assistanceNonNegativeDecimal,
    reservedAmount: assistanceNonNegativeDecimal,
    committedAmount: assistanceNonNegativeDecimal,
    utilizedAmount: assistanceNonNegativeDecimal,
    reversedAmount: assistanceNonNegativeDecimal,
    releasedAmount: assistanceNonNegativeDecimal,
    remainingAmount: assistanceNonNegativeDecimal,
    approvedFrom: {
      type: Date,
      required: true,
    },
    approvedThrough: {
      type: Date,
      default: null,
    },
    approvedServiceCategories: {
      type: [String],
      required: true,
      default: [],
      enum: assistanceServiceCategoryValues,
    },
    approvedServiceCodes: assistanceStringArray,
    approvedInvoiceLineIds: assistanceObjectIdArray,
    conditionsEncrypted: assistanceEncryptedText,
    notesEncrypted: assistanceEncryptedText,
    approvalMatrixCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    makerUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    checkerUserIds: assistanceObjectIdArray,
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: nullableAssistanceObjectId,
    rejectionReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    expiresAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: nullableAssistanceObjectId,
    cancellationReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reversedAt: { type: Date, default: null },
    reversedBy: nullableAssistanceObjectId,
    reversalReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('assistanceApprovals'),
);

assistanceApprovalSchema.pre('validate', function () {
  this.approvalNumber = normalizeAssistanceCode(this.approvalNumber);
  this.approvalMatrixCode = normalizeAssistanceCode(this.approvalMatrixCode);
  this.approvedServiceCodes = this.approvedServiceCodes.map(normalizeAssistanceCode);

  validateAssistancePositiveDecimal(this, 'requestedAmount');
  validateAssistanceMoneyFields(this, [
    'approvedAmount',
    'reservedAmount',
    'committedAmount',
    'utilizedAmount',
    'reversedAmount',
    'releasedAmount',
    'remainingAmount',
  ]);
  validateAssistanceDateRange(this, 'approvedFrom', 'approvedThrough');
  validateMakerChecker(this, 'makerUserId', ['checkerUserIds']);
  validateDistinctObjectIds(this, 'checkerUserIds', this.checkerUserIds);
  validateDistinctObjectIds(this, 'approvedInvoiceLineIds', this.approvedInvoiceLineIds);

  validateAssistanceExpression(
    this,
    'remainingAmount',
    ['approvedAmount', 'reversedAmount', 'releasedAmount'],
    ['reservedAmount', 'committedAmount', 'utilizedAmount'],
    'Remaining amount does not reconcile with approval utilization',
  );

  if (compareAssistanceDecimals(this.approvedAmount, this.requestedAmount) > 0) {
    this.invalidate('approvedAmount', 'Approved amount cannot exceed requested amount');
  }
  if (
    ['PARTIALLY_APPROVED', 'APPROVED'].includes(this.status) &&
    this.checkerUserIds.length === 0
  ) {
    this.invalidate('checkerUserIds', 'Approved decisions require at least one independent checker');
  }
  if (
    this.status === 'APPROVED' &&
    compareAssistanceDecimals(this.approvedAmount, this.requestedAmount) !== 0
  ) {
    this.invalidate('approvedAmount', 'APPROVED status requires full requested amount approval');
  }
  if (
    this.status === 'PARTIALLY_APPROVED' &&
    (compareAssistanceDecimals(this.approvedAmount, '0') <= 0 ||
      compareAssistanceDecimals(this.approvedAmount, this.requestedAmount) >= 0)
  ) {
    this.invalidate(
      'approvedAmount',
      'PARTIALLY_APPROVED status requires an amount greater than zero and less than requested',
    );
  }
  if (this.status === 'REJECTED') {
    requireAssistanceReason(this, 'rejectionReason', this.rejectionReason);
  }
  if (this.status === 'CANCELLED') {
    requireAssistanceReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (this.status === 'REVERSED') {
    requireAssistanceReason(this, 'reversalReason', this.reversalReason);
    if (
      compareAssistanceDecimals(this.reservedAmount, '0') !== 0 ||
      compareAssistanceDecimals(this.committedAmount, '0') !== 0
    ) {
      this.invalidate('status', 'Approvals with active reservations or commitments cannot be reversed');
    }
  }
});

assistanceApprovalSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_assistance_approvals_operation', unique: true },
);
assistanceApprovalSchema.index(
  { facilityId: 1, approvalNumber: 1 },
  { name: 'uq_assistance_approvals_number', unique: true },
);
assistanceApprovalSchema.index(
  { facilityId: 1, applicationId: 1, status: 1, createdAt: -1 },
  { name: 'ix_assistance_approvals_application' },
);
assistanceApprovalSchema.index(
  { facilityId: 1, status: 1, expiresAt: 1 },
  { name: 'ix_assistance_approvals_expiry' },
);
assistanceApprovalSchema.index(
  { facilityId: 1, approvalRequestId: 1 },
  { name: 'uq_assistance_approvals_request', unique: true },
);

export const assistanceApprovalHistorySchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvalId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...assistanceApprovalStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: assistanceApprovalStatusValues,
    },
    requestedAmount: { ...assistancePositiveDecimal, immutable: true },
    approvedAmount: { ...assistanceNonNegativeDecimal, immutable: true },
    remainingAmount: { ...assistanceNonNegativeDecimal, immutable: true },
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    checkerUserId: nullableAssistanceObjectId,
    approvalRequestId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
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
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: assistanceHash,
  },
  assistanceTimestampedSchemaOptions('assistanceApprovalHistories'),
);

assistanceApprovalHistorySchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'requestedAmount');
  validateAssistanceMoneyFields(this, ['approvedAmount', 'remainingAmount']);
  validateMakerChecker(this, 'makerUserId', ['checkerUserId']);
  if (this.fromStatus === this.toStatus) {
    this.invalidate('toStatus', 'Approval history must change status');
  }
});
assistanceApprovalHistorySchema.index(
  { facilityId: 1, approvalId: 1, occurredAt: 1, _id: 1 },
  { name: 'ix_assistance_approval_histories_timeline' },
);
assistanceApprovalHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_assistance_approval_histories_hash', unique: true },
);

export const assistanceReservationSchema = new Schema(
  {
    ...assistanceCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvalId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fundId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    patientAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    invoiceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    status: {
      type: String,
      required: true,
      enum: assistanceReservationStatusValues,
      default: 'ACTIVE',
    },
    reservedAmount: assistancePositiveDecimal,
    consumedAmount: assistanceNonNegativeDecimal,
    releasedAmount: assistanceNonNegativeDecimal,
    remainingAmount: assistanceNonNegativeDecimal,
    priority: { type: Number, required: true, min: 0, max: 10_000 },
    expiresAt: { type: Date, required: true },
    reservedAt: { type: Date, required: true },
    reservedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    releasedAt: { type: Date, default: null },
    releasedBy: nullableAssistanceObjectId,
    releaseReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  assistanceTimestampedSchemaOptions('assistanceReservations'),
);

assistanceReservationSchema.pre('validate', function () {
  validateAssistancePositiveDecimal(this, 'reservedAmount');
  validateAssistanceMoneyFields(this, ['consumedAmount', 'releasedAmount', 'remainingAmount']);
  validateAssistanceExpression(
    this,
    'remainingAmount',
    ['reservedAmount'],
    ['consumedAmount', 'releasedAmount'],
    'Reservation remaining amount must equal reserved less consumed and released',
  );
  if (this.expiresAt <= this.reservedAt) {
    this.invalidate('expiresAt', 'Reservation expiry must be after reservation time');
  }
  if (
    ['RELEASED', 'EXPIRED', 'CANCELLED'].includes(this.status) &&
    (this.releasedAt == null || this.releasedBy == null)
  ) {
    this.invalidate('releasedAt', `${this.status} reservations require release metadata`);
  }
  if (['RELEASED', 'CANCELLED'].includes(this.status)) {
    requireAssistanceReason(this, 'releaseReason', this.releaseReason);
  }
  if (this.status === 'CONSUMED' && compareAssistanceDecimals(this.remainingAmount, '0') !== 0) {
    this.invalidate('remainingAmount', 'Consumed reservations must have zero remaining amount');
  }
});

assistanceReservationSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_assistance_reservations_operation', unique: true },
);
assistanceReservationSchema.index(
  { facilityId: 1, approvalId: 1, invoiceId: 1, status: 1 },
  { name: 'ix_assistance_reservations_approval_invoice' },
);
assistanceReservationSchema.index(
  { facilityId: 1, status: 1, expiresAt: 1 },
  { name: 'ix_assistance_reservations_expiry' },
);
assistanceReservationSchema.index(
  { facilityId: 1, fundId: 1, status: 1, expiresAt: 1 },
  { name: 'ix_assistance_reservations_fund' },
);

export type AssistanceApproval = InferSchemaType<typeof assistanceApprovalSchema>;
export type AssistanceApprovalHistory = InferSchemaType<
  typeof assistanceApprovalHistorySchema
>;
export type AssistanceReservation = InferSchemaType<typeof assistanceReservationSchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const AssistanceApprovalModel = modelFor(
  'assistanceApprovals',
  assistanceApprovalSchema,
);
export const AssistanceApprovalHistoryModel = modelFor(
  'assistanceApprovalHistories',
  assistanceApprovalHistorySchema,
);
export const AssistanceReservationModel = modelFor(
  'assistanceReservations',
  assistanceReservationSchema,
);