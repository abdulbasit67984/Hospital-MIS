import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingCommonFields,
  billingDecimalExpressionEquals,
  billingMoneyFields,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateBillingMoney,
  validateEffectiveWindow,
  validateNonNegativeInventoryDecimal,
  validateQuantityPriceGross,
} from './billing-schema-helpers.js';

import {
  billingContextValues,
  chargeHistoryActionValues,
  chargeSourceModuleValues,
  chargeStatusValues,
  patientAccountStatusValues,
  patientAccountTypeValues,
  responsiblePartyTypeValues,
} from './billing.types.js';

const payerSnapshotSchema = new Schema(
  {
    sequence: {
      type: Number,
      required: true,
      min: 1,
      max: 2,
    },
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    panelPlanId: nullableBillingObjectId,
    patientCoverageId: nullableBillingObjectId,
    payerNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 300,
    },
    planNameSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    membershipNumberSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },
    authorizationReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },
    coverageLimitSnapshot: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    copaySnapshot: billingNonNegativeDecimal,
    coinsurancePercentageSnapshot: billingNonNegativeDecimal,
    deductibleSnapshot: billingNonNegativeDecimal,
    coverageEffectiveFrom: {
      type: Date,
      default: null,
    },
    coverageEffectiveThrough: {
      type: Date,
      default: null,
    },
  },
  { _id: true, strict: true },
);

const accountTotalsFields = {
  grossCharges: billingNonNegativeDecimal,
  discountTotal: billingNonNegativeDecimal,
  taxTotal: billingNonNegativeDecimal,
  welfareTotal: billingNonNegativeDecimal,
  payerResponsibilityTotal: billingNonNegativeDecimal,
  patientResponsibilityTotal: billingNonNegativeDecimal,
  paymentsAppliedTotal: billingNonNegativeDecimal,
  creditsTotal: billingNonNegativeDecimal,
  writeOffTotal: billingNonNegativeDecimal,
  outstandingBalance: billingNonNegativeDecimal,
  refundableBalance: billingNonNegativeDecimal,
} as const;

export const patientAccountSchema = new Schema(
  {
    ...billingCommonFields,
    accountNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    accountType: {
      type: String,
      required: true,
      enum: patientAccountTypeValues,
    },
    billingContext: {
      type: String,
      required: true,
      enum: billingContextValues,
    },
    registrationId: nullableBillingObjectId,
    opdVisitId: nullableBillingObjectId,
    encounterId: nullableBillingObjectId,
    admissionId: nullableBillingObjectId,
    emergencyVisitId: nullableBillingObjectId,
    responsiblePartyType: {
      type: String,
      required: true,
      enum: responsiblePartyTypeValues,
      default: 'PATIENT',
    },
    guarantorId: nullableBillingObjectId,
    guarantorNameSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },
    payerSnapshots: {
      type: [payerSnapshotSchema],
      required: true,
      default: [],
      validate: {
        validator: (
          values: readonly { sequence: number }[],
        ) => {
          const sequences = values.map(
            (value) => value.sequence,
          );
          return (
            sequences.length <= 2 &&
            new Set(sequences).size === sequences.length
          );
        },
        message:
          'Patient accounts may have at most one primary and one secondary payer',
      },
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'PKR',
    },
    ...accountTotalsFields,
    status: {
      type: String,
      required: true,
      enum: patientAccountStatusValues,
      default: 'OPEN',
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: nullableBillingObjectId,
    lockReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: nullableBillingObjectId,
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: nullableBillingObjectId,
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    closedPeriodCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
  },
  billingTimestampedSchemaOptions('patientAccounts'),
);

patientAccountSchema.pre('validate', function () {
  this.accountNumber = normalizeBillingCode(this.accountNumber);
  this.currency = normalizeBillingCode(this.currency);

  for (const field of Object.keys(accountTotalsFields)) {
    validateNonNegativeInventoryDecimal(
      this,
      field,
      this.get(field),
    );
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          this.patientResponsibilityTotal,
          this.refundableBalance,
        ],
        [
          this.paymentsAppliedTotal,
          this.creditsTotal,
        ],
        this.outstandingBalance,
      )
    ) {
      this.invalidate(
        'outstandingBalance',
        'Patient responsibility plus refundable balance must equal payments, credits, and outstanding balance',
      );
    }
  } catch (error) {
    this.invalidate(
      'outstandingBalance',
      error instanceof Error
        ? error.message
        : 'Account totals must contain valid decimal values',
    );
  }

  if (
    this.responsiblePartyType === 'GUARANTOR' &&
    this.guarantorId == null
  ) {
    this.invalidate(
      'guarantorId',
      'Guarantor-responsible accounts require a guarantor reference',
    );
  }

  if (this.status === 'FINALIZED') {
    if (
      this.lockedAt == null ||
      this.lockedBy == null ||
      this.lockReason == null ||
      this.finalizedAt == null ||
      this.finalizedBy == null
    ) {
      this.invalidate(
        'status',
        'Finalized accounts require lock and finalization attribution',
      );
    }
  }

  if (
    this.status === 'SUSPENDED' &&
    (this.suspendedAt == null ||
      this.suspendedBy == null ||
      this.suspensionReason == null)
  ) {
    this.invalidate(
      'status',
      'Suspended accounts require suspension attribution and reason',
    );
  }
});

patientAccountSchema.index(
  { facilityId: 1, accountNumber: 1 },
  {
    name: 'uq_patient_accounts_facility_number',
    unique: true,
  },
);
patientAccountSchema.index(
  { facilityId: 1, patientId: 1, status: 1, createdAt: -1 },
  { name: 'ix_patient_accounts_patient_status' },
);
patientAccountSchema.index(
  { facilityId: 1, admissionId: 1, status: 1 },
  {
    name: 'uq_patient_accounts_active_admission',
    unique: true,
    partialFilterExpression: {
      admissionId: { $type: 'objectId' },
      status: { $in: ['OPEN', 'SUSPENDED'] },
    },
  },
);
patientAccountSchema.index(
  { facilityId: 1, outstandingBalance: 1, status: 1 },
  { name: 'ix_patient_accounts_receivable' },
);

export const patientAccountStatusHistorySchema = new Schema(
  {
    ...billingCommonFields,
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      enum: [...patientAccountStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: patientAccountStatusValues,
      immutable: true,
    },
    accountVersion: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      immutable: true,
    },
    changedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    approvalRequestId: nullableBillingObjectId,
  },
  billingTimestampedSchemaOptions(
    'patientAccountStatusHistories',
  ),
);

patientAccountStatusHistorySchema.index(
  { facilityId: 1, patientAccountId: 1, accountVersion: 1 },
  {
    name: 'uq_patient_account_status_history_version',
    unique: true,
  },
);
patientAccountStatusHistorySchema.index(
  { facilityId: 1, changedAt: -1 },
  { name: 'ix_patient_account_status_history_changed' },
);

const sourceSnapshotSchema = new Schema(
  {
    sourceModule: {
      type: String,
      required: true,
      enum: chargeSourceModuleValues,
      immutable: true,
    },
    sourceRecordType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
      immutable: true,
    },
    sourceRecordId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceLineId: nullableBillingObjectId,
    sourceOccurredAt: {
      type: Date,
      required: true,
      immutable: true,
    },
  },
  { _id: false, strict: true },
);

const chargeSnapshotFields = {
  chargeCatalogItemId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  chargeCatalogVersionId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  serviceRateId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  priceListId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  priceListVersionId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  chargeCodeSnapshot: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 100,
    immutable: true,
  },
  serviceCodeSnapshot: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 100,
    immutable: true,
  },
  chargeNameSnapshot: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 300,
    immutable: true,
  },
  categoryCodeSnapshot: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 100,
    immutable: true,
  },
  departmentId: nullableBillingObjectId,
  serviceLineCodeSnapshot: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  revenueAccountCodeSnapshot: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  taxCategoryId: nullableBillingObjectId,
  taxCategoryCodeSnapshot: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  unitOfMeasureId: nullableBillingObjectId,
  unitOfMeasureCodeSnapshot: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 100,
  },
  quantity: {
    type: Schema.Types.Decimal128,
    required: true,
  },
  originalUnitPrice: billingNonNegativeDecimal,
  authoritativeUnitPrice: billingNonNegativeDecimal,
  costAmountSnapshot: {
    ...billingNonNegativeDecimal,
    select: false,
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
    default: 'PKR',
  },
  ...billingMoneyFields,
} as const;

export const accountChargeSchema = new Schema(
  {
    ...billingCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    deterministicChargeKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 300,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    registrationId: nullableBillingObjectId,
    opdVisitId: nullableBillingObjectId,
    encounterId: nullableBillingObjectId,
    admissionId: nullableBillingObjectId,
    source: {
      type: sourceSnapshotSchema,
      required: true,
    },
    ...chargeSnapshotFields,
    status: {
      type: String,
      required: true,
      enum: chargeStatusValues,
      default: 'PENDING',
    },
    packageEnrollmentId: nullableBillingObjectId,
    treatmentPackageItemId: nullableBillingObjectId,
    packageIncludedQuantity: billingNonNegativeDecimal,
    packageOverageQuantity: billingNonNegativeDecimal,
    payerOrganizationId: nullableBillingObjectId,
    panelPlanId: nullableBillingObjectId,
    patientCoverageId: nullableBillingObjectId,
    preauthorizationId: nullableBillingObjectId,
    authorizationReferenceSnapshot: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
      select: false,
    },
    excludedFromCoverage: {
      type: Boolean,
      required: true,
      default: false,
    },
    coverageExclusionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
      select: false,
    },
    originalChargeId: nullableBillingObjectId,
    replacementChargeId: nullableBillingObjectId,
    transferredFromAccountId: nullableBillingObjectId,
    transferredToAccountId: nullableBillingObjectId,
    approvalRequestIds: billingObjectIdArray,
    postedAt: {
      type: Date,
      default: null,
    },
    postedBy: nullableBillingObjectId,
    lifecycleReason: {
      type: String,
      default: null,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
    },
    serviceFrom: {
      type: Date,
      required: true,
    },
    serviceThrough: {
      type: Date,
      default: null,
    },
  },
  billingTimestampedSchemaOptions('accountCharges'),
);

accountChargeSchema.pre('validate', function () {
  this.chargeCodeSnapshot = normalizeBillingCode(
    this.chargeCodeSnapshot,
  );
  this.serviceCodeSnapshot = normalizeBillingCode(
    this.serviceCodeSnapshot,
  );
  this.categoryCodeSnapshot = normalizeBillingCode(
    this.categoryCodeSnapshot,
  );
  this.currency = normalizeBillingCode(this.currency);
  this.source.sourceRecordType = normalizeBillingCode(
    this.source.sourceRecordType,
  );

  validateQuantityPriceGross(
    this,
    'quantity',
    'authoritativeUnitPrice',
    'grossAmount',
  );
  validateNonNegativeInventoryDecimal(
    this,
    'originalUnitPrice',
    this.originalUnitPrice,
  );
  validateNonNegativeInventoryDecimal(
    this,
    'costAmountSnapshot',
    this.costAmountSnapshot,
  );
  validateBillingMoney(this);
  validateEffectiveWindow(this, 'serviceFrom', 'serviceThrough');

  if (
    this.excludedFromCoverage &&
    this.coverageExclusionReason == null
  ) {
    this.invalidate(
      'coverageExclusionReason',
      'Excluded charges require a coverage exclusion reason',
    );
  }

  if (this.status === 'POSTED') {
    if (this.postedAt == null || this.postedBy == null) {
      this.invalidate(
        'status',
        'Posted charges require posting attribution',
      );
    }
  } else if (
    !['DRAFT', 'PENDING'].includes(this.status) &&
    this.lifecycleReason == null
  ) {
    this.invalidate(
      'lifecycleReason',
      'Charge corrections, reversals, credits, transfers, and write-offs require a reason',
    );
  }

  if (
    ['REVERSED', 'CREDITED', 'ADJUSTED', 'CORRECTED'].includes(
      this.status,
    ) &&
    this.originalChargeId == null
  ) {
    this.invalidate(
      'originalChargeId',
      'Corrective financial charges require an original charge reference',
    );
  }
});

accountChargeSchema.index(
  { facilityId: 1, operationKey: 1 },
  {
    name: 'uq_account_charges_operation',
    unique: true,
  },
);
accountChargeSchema.index(
  { facilityId: 1, deterministicChargeKey: 1 },
  {
    name: 'uq_account_charges_deterministic_key',
    unique: true,
  },
);
accountChargeSchema.index(
  {
    facilityId: 1,
    'source.sourceModule': 1,
    'source.sourceRecordId': 1,
    'source.sourceLineId': 1,
    status: 1,
  },
  { name: 'ix_account_charges_source' },
);
accountChargeSchema.index(
  {
    facilityId: 1,
    patientAccountId: 1,
    status: 1,
    serviceFrom: 1,
  },
  { name: 'ix_account_charges_account_status_service' },
);
accountChargeSchema.index(
  {
    facilityId: 1,
    chargeCatalogItemId: 1,
    departmentId: 1,
    postedAt: -1,
  },
  { name: 'ix_account_charges_revenue_reporting' },
);

export const accountChargeHistorySchema = new Schema(
  {
    ...billingCommonFields,
    accountChargeId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      required: true,
      enum: chargeHistoryActionValues,
      immutable: true,
    },
    fromStatus: {
      type: String,
      default: null,
      enum: [...chargeStatusValues, null],
      immutable: true,
    },
    toStatus: {
      type: String,
      required: true,
      enum: chargeStatusValues,
      immutable: true,
    },
    chargeVersion: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    originalChargeId: nullableBillingObjectId,
    replacementChargeId: nullableBillingObjectId,
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2_000,
      immutable: true,
    },
    approvalRequestId: nullableBillingObjectId,
    changedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    amountSnapshot: {
      ...billingMoneyFields,
    },
  },
  billingTimestampedSchemaOptions('accountChargeHistories'),
);

accountChargeHistorySchema.pre('validate', function () {
  validateBillingMoney(this, 'amountSnapshot');
});

accountChargeHistorySchema.index(
  { facilityId: 1, accountChargeId: 1, chargeVersion: 1 },
  {
    name: 'uq_account_charge_history_version',
    unique: true,
  },
);
accountChargeHistorySchema.index(
  { facilityId: 1, changedAt: -1, action: 1 },
  { name: 'ix_account_charge_history_action_time' },
);

export type PatientAccount = InferSchemaType<
  typeof patientAccountSchema
>;
export type PatientAccountStatusHistory = InferSchemaType<
  typeof patientAccountStatusHistorySchema
>;
export type AccountCharge = InferSchemaType<
  typeof accountChargeSchema
>;
export type AccountChargeHistory = InferSchemaType<
  typeof accountChargeHistorySchema
>;

function modelFor<T>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const PatientAccountModel = modelFor(
  'patientAccounts',
  patientAccountSchema,
);
export const PatientAccountStatusHistoryModel = modelFor(
  'patientAccountStatusHistories',
  patientAccountStatusHistorySchema,
);
export const AccountChargeModel = modelFor(
  'accountCharges',
  accountChargeSchema,
);
export const AccountChargeHistoryModel = modelFor(
  'accountChargeHistories',
  accountChargeHistorySchema,
);