import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  billingDecimalExpressionEquals,
  normalizeBillingCode,
} from './billing-schema-helpers.js';

import {
  claimAgingBucketValues,
  claimAttachmentPurposeValues,
  claimCurrencyValues,
  claimDiagnosisTypeValues,
  claimDenialCategoryValues,
  claimLineStatusValues,
  claimPayerTypeValues,
  claimReadinessIssueScopeValues,
  claimReadinessIssueSeverityValues,
  claimServiceCategoryValues,
  claimStatusValues,
  claimVersionTypeValues,
} from './claims.types.js';

import {
  claimCommonFields,
  claimEncryptedText,
  claimHash,
  claimNonNegativeDecimal,
  claimObjectIdArray,
  claimPositiveDecimal,
  claimStringArray,
  claimTimestampedSchemaOptions,
  compareClaimDecimals,
  nullableClaimHash,
  nullableClaimObjectId,
  nullableMaskedClaimReference,
  requireClaimReason,
  validateClaimDateRange,
  validateClaimMoneyFields,
  validateClaimPositiveDecimal,
} from './claims-schema-helpers.js';

const claimDiagnosisSchema = new Schema(
  {
    diagnosisId: nullableClaimObjectId,
    codeSystem: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1_000,
    },
    diagnosisType: {
      type: String,
      required: true,
      enum: claimDiagnosisTypeValues,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
    },
    presentOnAdmission: {
      type: Boolean,
      default: null,
    },
  },
  {
    _id: true,
    strict: true,
  },
);

const claimReadinessIssueSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    severity: {
      type: String,
      required: true,
      enum: claimReadinessIssueSeverityValues,
    },
    scope: {
      type: String,
      required: true,
      enum: claimReadinessIssueScopeValues,
    },
    claimLineId: nullableClaimObjectId,
    field: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2_000,
    },
  },
  {
    _id: false,
    strict: true,
  },
);

const claimFinancialFields = [
  'grossAmount',
  'packageAmount',
  'deductibleAmount',
  'copaymentAmount',
  'coinsuranceAmount',
  'excludedAmount',
  'patientOtherAmount',
  'patientResponsibilityAmount',
  'claimedAmount',
  'approvedAmount',
  'deniedAmount',
  'disallowedAmount',
  'returnedAmount',
  'contractualAdjustmentAmount',
  'writeOffAmount',
  'payerWithholdingAmount',
  'debitNoteAmount',
  'creditNoteAmount',
  'refundAmount',
  'repaymentAmount',
  'paidAmount',
  'unappliedPaymentAmount',
  'outstandingAmount',
  'overpaymentAmount',
] as const;

export const claimSchema = new Schema(
  {
    ...claimCommonFields,
    operationKey: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 8,
      maxlength: 240,
    },
    duplicateKey: claimHash,
    claimNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    claimVersionNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    claimVersionType: {
      type: String,
      required: true,
      immutable: true,
      enum: claimVersionTypeValues,
    },
    originalClaimId: nullableClaimObjectId,
    priorClaimVersionId: nullableClaimObjectId,
    patientId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    encounterId: nullableClaimObjectId,
    admissionId: nullableClaimObjectId,
    invoiceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    coverageDeterminationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    payerOrganizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    payerType: {
      type: String,
      required: true,
      immutable: true,
      enum: claimPayerTypeValues,
    },
    panelPlanId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    patientCoverageId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    policyReferenceHash: nullableClaimHash,
    policyReferenceMasked: nullableMaskedClaimReference,
    membershipReferenceHash: nullableClaimHash,
    membershipReferenceMasked: nullableMaskedClaimReference,
    employerReferenceHash: nullableClaimHash,
    authorizationReferenceHash: nullableClaimHash,
    preauthorizationIds: claimObjectIdArray,
    status: {
      type: String,
      required: true,
      enum: claimStatusValues,
      default: 'DRAFT',
    },
    serviceFrom: {
      type: Date,
      required: true,
      immutable: true,
    },
    serviceThrough: {
      type: Date,
      required: true,
      immutable: true,
    },
    filingDeadline: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: claimCurrencyValues,
      default: 'PKR',
    },
    grossAmount: claimNonNegativeDecimal,
    packageAmount: claimNonNegativeDecimal,
    deductibleAmount: claimNonNegativeDecimal,
    copaymentAmount: claimNonNegativeDecimal,
    coinsuranceAmount: claimNonNegativeDecimal,
    excludedAmount: claimNonNegativeDecimal,
    patientOtherAmount: claimNonNegativeDecimal,
    patientResponsibilityAmount: claimNonNegativeDecimal,
    claimedAmount: claimNonNegativeDecimal,
    approvedAmount: claimNonNegativeDecimal,
    deniedAmount: claimNonNegativeDecimal,
    disallowedAmount: claimNonNegativeDecimal,
    returnedAmount: claimNonNegativeDecimal,
    contractualAdjustmentAmount: claimNonNegativeDecimal,
    writeOffAmount: claimNonNegativeDecimal,
    payerWithholdingAmount: claimNonNegativeDecimal,
    debitNoteAmount: claimNonNegativeDecimal,
    creditNoteAmount: claimNonNegativeDecimal,
    refundAmount: claimNonNegativeDecimal,
    repaymentAmount: claimNonNegativeDecimal,
    paidAmount: claimNonNegativeDecimal,
    unappliedPaymentAmount: claimNonNegativeDecimal,
    outstandingAmount: claimNonNegativeDecimal,
    overpaymentAmount: claimNonNegativeDecimal,
    diagnoses: {
      type: [claimDiagnosisSchema],
      required: true,
      default: [],
      validate: {
        validator: (values: readonly unknown[]) =>
          values.length >= 1 && values.length <= 50,
        message: 'Claims require between 1 and 50 diagnoses',
      },
    },
    readinessSnapshotId: nullableClaimObjectId,
    readinessIssues: {
      type: [claimReadinessIssueSchema],
      required: true,
      default: [],
    },
    readinessCheckedAt: {
      type: Date,
      default: null,
    },
    readinessCheckedBy: nullableClaimObjectId,
    payerReferenceNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    clearinghouseReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    assignedToUserId: nullableClaimObjectId,
    followUpAt: {
      type: Date,
      default: null,
    },
    agingAnchorAt: {
      type: Date,
      required: true,
    },
    agingDays: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    agingBucket: {
      type: String,
      required: true,
      enum: claimAgingBucketValues,
      default: 'CURRENT',
    },
    internalNoteEncrypted: claimEncryptedText,
    payerNoteEncrypted: claimEncryptedText,
    medicalNecessitySummaryEncrypted: claimEncryptedText,
    submittedAt: {
      type: Date,
      default: null,
    },
    submittedBy: nullableClaimObjectId,
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    adjudicatedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: nullableClaimObjectId,
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: nullableClaimObjectId,
    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    voidedBy: nullableClaimObjectId,
    voidReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
  },
  claimTimestampedSchemaOptions('claims'),
);

claimSchema.pre('validate', function validateClaim() {
  this.claimNumber = normalizeBillingCode(this.claimNumber);
  validateClaimDateRange(this, 'serviceFrom', 'serviceThrough');
  validateClaimMoneyFields(this, claimFinancialFields);

  const diagnoses = this.diagnoses ?? [];
  const primaryCount = diagnoses.filter(
    (diagnosis) => diagnosis.diagnosisType === 'PRIMARY',
  ).length;

  if (primaryCount !== 1) {
    this.invalidate(
      'diagnoses',
      'A claim must contain exactly one primary diagnosis',
    );
  }

  const diagnosisSequences = diagnoses.map(
    (diagnosis) => diagnosis.sequence,
  );

  if (new Set(diagnosisSequences).size !== diagnosisSequences.length) {
    this.invalidate(
      'diagnoses',
      'Claim diagnosis sequence numbers must be unique',
    );
  }

  if (
    this.claimVersionType !== 'ORIGINAL' &&
    this.originalClaimId == null
  ) {
    this.invalidate(
      'originalClaimId',
      'Corrected and replacement claims require an original claim reference',
    );
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          this.deductibleAmount,
          this.copaymentAmount,
          this.coinsuranceAmount,
          this.excludedAmount,
          this.patientOtherAmount,
        ],
        [],
        this.patientResponsibilityAmount,
      )
    ) {
      this.invalidate(
        'patientResponsibilityAmount',
        'Patient responsibility must equal its authoritative allocation components',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        [
          this.packageAmount,
          this.patientResponsibilityAmount,
          this.claimedAmount,
        ],
        [],
        this.grossAmount,
      )
    ) {
      this.invalidate(
        'grossAmount',
        'Gross amount must equal package, patient, and sponsor allocations',
      );
    }

    if (
      [
        'APPROVED',
        'PARTIALLY_APPROVED',
        'DENIED',
        'REJECTED',
        'RETURNED',
        'PAID',
        'CLOSED',
      ].includes(this.status) &&
      !billingDecimalExpressionEquals(
        [
          this.approvedAmount,
          this.deniedAmount,
          this.disallowedAmount,
          this.returnedAmount,
        ],
        [],
        this.claimedAmount,
      )
    ) {
      this.invalidate(
        'approvedAmount',
        'Adjudicated claim amounts must reconcile to the claimed amount',
      );
    }

    if (
      compareClaimDecimals(this.outstandingAmount, '0') > 0 &&
      compareClaimDecimals(this.overpaymentAmount, '0') > 0
    ) {
      this.invalidate(
        'overpaymentAmount',
        'A claim cannot have both an outstanding balance and an overpayment',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        [
          this.approvedAmount,
          this.debitNoteAmount,
          this.refundAmount,
          this.overpaymentAmount,
        ],
        [
          this.creditNoteAmount,
          this.repaymentAmount,
          this.paidAmount,
          this.contractualAdjustmentAmount,
          this.writeOffAmount,
          this.payerWithholdingAmount,
        ],
        this.outstandingAmount,
      )
    ) {
      this.invalidate(
        'outstandingAmount',
        'Outstanding and overpayment amounts must reconcile with approved receivables and settlements',
      );
    }
  } catch (error) {
    this.invalidate(
      'claimedAmount',
      error instanceof Error
        ? error.message
        : 'Claim financial values must be valid decimals',
    );
  }

  if (this.status === 'CANCELLED') {
    requireClaimReason(this, 'cancellationReason', this.cancellationReason);
  }

  if (this.status === 'REVERSED') {
    requireClaimReason(this, 'reversalReason', this.reversalReason);
  }

  if (this.status === 'VOIDED') {
    requireClaimReason(this, 'voidReason', this.voidReason);
  }
});

claimSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_claims_operation', unique: true },
);
claimSchema.index(
  { facilityId: 1, claimNumber: 1 },
  { name: 'uq_claims_number', unique: true },
);
claimSchema.index(
  { facilityId: 1, duplicateKey: 1, status: 1 },
  { name: 'ix_claims_duplicate_status' },
);
claimSchema.index(
  {
    facilityId: 1,
    invoiceId: 1,
    payerOrganizationId: 1,
    claimVersionNumber: -1,
  },
  { name: 'ix_claims_invoice_payer_version' },
);
claimSchema.index(
  {
    facilityId: 1,
    payerOrganizationId: 1,
    status: 1,
    agingBucket: 1,
    agingAnchorAt: 1,
  },
  { name: 'ix_claims_payer_status_aging' },
);
claimSchema.index(
  {
    facilityId: 1,
    assignedToUserId: 1,
    followUpAt: 1,
    status: 1,
  },
  { name: 'ix_claims_assignment_follow_up' },
);
claimSchema.index(
  { facilityId: 1, filingDeadline: 1, status: 1 },
  { name: 'ix_claims_filing_deadline' },
);

const claimLineFinancialFields = [
  'grossAmount',
  'packageAmount',
  'deductibleAmount',
  'copaymentAmount',
  'coinsuranceAmount',
  'excludedAmount',
  'patientOtherAmount',
  'patientResponsibilityAmount',
  'claimedAmount',
  'approvedAmount',
  'deniedAmount',
  'disallowedAmount',
  'returnedAmount',
  'contractualAdjustmentAmount',
  'writeOffAmount',
  'payerWithholdingAmount',
  'paidAmount',
  'outstandingAmount',
] as const;

export const claimLineSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    duplicateKey: claimHash,
    lineNumber: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: 2_000,
    },
    invoiceLineId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    coverageAllocationId: nullableClaimObjectId,
    chargeCatalogItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    sourceModule: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },
    sourceRecordId: nullableClaimObjectId,
    encounterId: nullableClaimObjectId,
    admissionId: nullableClaimObjectId,
    procedureId: nullableClaimObjectId,
    laboratoryOrderId: nullableClaimObjectId,
    radiologyOrderId: nullableClaimObjectId,
    dispensationId: nullableClaimObjectId,
    packageEnrollmentId: nullableClaimObjectId,
    serviceCategory: {
      type: String,
      required: true,
      immutable: true,
      enum: claimServiceCategoryValues,
    },
    serviceFrom: {
      type: Date,
      required: true,
      immutable: true,
    },
    serviceThrough: {
      type: Date,
      default: null,
      immutable: true,
    },
    providerId: nullableClaimObjectId,
    departmentId: nullableClaimObjectId,
    chargeCatalogCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    serviceCodeSystem: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    serviceCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    revenueCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    modifiers: claimStringArray,
    units: claimPositiveDecimal,
    diagnosisSequences: {
      type: [Number],
      required: true,
      default: [],
    },
    preauthorizationId: nullableClaimObjectId,
    status: {
      type: String,
      required: true,
      enum: claimLineStatusValues,
      default: 'DRAFT',
    },
    grossAmount: claimNonNegativeDecimal,
    packageAmount: claimNonNegativeDecimal,
    deductibleAmount: claimNonNegativeDecimal,
    copaymentAmount: claimNonNegativeDecimal,
    coinsuranceAmount: claimNonNegativeDecimal,
    excludedAmount: claimNonNegativeDecimal,
    patientOtherAmount: claimNonNegativeDecimal,
    patientResponsibilityAmount: claimNonNegativeDecimal,
    claimedAmount: claimNonNegativeDecimal,
    approvedAmount: claimNonNegativeDecimal,
    deniedAmount: claimNonNegativeDecimal,
    disallowedAmount: claimNonNegativeDecimal,
    returnedAmount: claimNonNegativeDecimal,
    contractualAdjustmentAmount: claimNonNegativeDecimal,
    writeOffAmount: claimNonNegativeDecimal,
    payerWithholdingAmount: claimNonNegativeDecimal,
    paidAmount: claimNonNegativeDecimal,
    outstandingAmount: claimNonNegativeDecimal,
    medicalNecessityNoteEncrypted: claimEncryptedText,
    internalNoteEncrypted: claimEncryptedText,
    payerLineReference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
    denialCategory: {
      type: String,
      default: null,
      enum: [...claimDenialCategoryValues, null],
    },
    denialReasonCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    denialReasonDescription: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
  },
  claimTimestampedSchemaOptions('claimLines'),
);

claimLineSchema.pre('validate', function validateClaimLine() {
  this.chargeCatalogCode = normalizeBillingCode(this.chargeCatalogCode);
  this.serviceCodeSystem = normalizeBillingCode(this.serviceCodeSystem);
  this.serviceCode = normalizeBillingCode(this.serviceCode);
  if (this.revenueCode != null) {
    this.revenueCode = normalizeBillingCode(this.revenueCode);
  }

  validateClaimDateRange(this, 'serviceFrom', 'serviceThrough');
  validateClaimPositiveDecimal(this, 'units');
  validateClaimMoneyFields(this, claimLineFinancialFields);

  if (
    new Set(this.diagnosisSequences).size !==
    this.diagnosisSequences.length
  ) {
    this.invalidate(
      'diagnosisSequences',
      'Claim-line diagnosis sequences cannot contain duplicates',
    );
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          this.deductibleAmount,
          this.copaymentAmount,
          this.coinsuranceAmount,
          this.excludedAmount,
          this.patientOtherAmount,
        ],
        [],
        this.patientResponsibilityAmount,
      )
    ) {
      this.invalidate(
        'patientResponsibilityAmount',
        'Line patient responsibility must equal its authoritative allocation components',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        [
          this.packageAmount,
          this.patientResponsibilityAmount,
          this.claimedAmount,
        ],
        [],
        this.grossAmount,
      )
    ) {
      this.invalidate(
        'grossAmount',
        'Line gross amount must equal package, patient, and sponsor allocations',
      );
    }

    if (
      [
        'APPROVED',
        'PARTIALLY_APPROVED',
        'DENIED',
        'REJECTED',
        'RETURNED',
        'PAID',
        'CLOSED',
      ].includes(this.status) &&
      !billingDecimalExpressionEquals(
        [
          this.approvedAmount,
          this.deniedAmount,
          this.disallowedAmount,
          this.returnedAmount,
        ],
        [],
        this.claimedAmount,
      )
    ) {
      this.invalidate(
        'approvedAmount',
        'Adjudicated line amounts must reconcile to the claimed amount',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        [this.approvedAmount],
        [
          this.paidAmount,
          this.contractualAdjustmentAmount,
          this.writeOffAmount,
          this.payerWithholdingAmount,
        ],
        this.outstandingAmount,
      )
    ) {
      this.invalidate(
        'outstandingAmount',
        'Line outstanding amount must reconcile with approved amount and settlements',
      );
    }
  } catch (error) {
    this.invalidate(
      'claimedAmount',
      error instanceof Error
        ? error.message
        : 'Claim-line financial values must be valid decimals',
    );
  }
});

claimLineSchema.index(
  { facilityId: 1, claimId: 1, lineNumber: 1 },
  { name: 'uq_claim_lines_number', unique: true },
);
claimLineSchema.index(
  { facilityId: 1, claimId: 1, invoiceLineId: 1 },
  { name: 'uq_claim_lines_invoice_line', unique: true },
);
claimLineSchema.index(
  { facilityId: 1, claimId: 1, duplicateKey: 1 },
  { name: 'uq_claim_lines_duplicate', unique: true },
);
claimLineSchema.index(
  { facilityId: 1, status: 1, serviceFrom: 1 },
  { name: 'ix_claim_lines_status_service_date' },
);
claimLineSchema.index(
  { facilityId: 1, sourceModule: 1, sourceRecordId: 1 },
  { name: 'ix_claim_lines_source' },
);

export const claimDocumentSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimLineId: nullableClaimObjectId,
    attachmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: claimAttachmentPurposeValues,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2_000,
    },
    required: {
      type: Boolean,
      required: true,
      default: false,
    },
    includedInLatestSubmission: {
      type: Boolean,
      required: true,
      default: false,
    },
    immutableSnapshotHash: claimHash,
  },
  claimTimestampedSchemaOptions('claimDocuments'),
);

claimDocumentSchema.index(
  {
    facilityId: 1,
    claimId: 1,
    attachmentId: 1,
    purpose: 1,
  },
  { name: 'uq_claim_documents_attachment', unique: true },
);
claimDocumentSchema.index(
  { facilityId: 1, claimId: 1, required: 1 },
  { name: 'ix_claim_documents_required' },
);

export const claimValidationSnapshotSchema = new Schema(
  {
    ...claimCommonFields,
    claimId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    claimVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
    },
    checkedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    checkedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    complete: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    eligible: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    duplicateFree: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    scrubbed: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    submissionReady: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    authoritativePayloadHash: claimHash,
    issues: {
      type: [claimReadinessIssueSchema],
      required: true,
      immutable: true,
      default: [],
    },
  },
  claimTimestampedSchemaOptions('claimValidationSnapshots'),
);

claimValidationSnapshotSchema.index(
  {
    facilityId: 1,
    claimId: 1,
    claimVersion: 1,
    authoritativePayloadHash: 1,
  },
  { name: 'uq_claim_validation_snapshots_payload', unique: true },
);
claimValidationSnapshotSchema.index(
  { facilityId: 1, claimId: 1, checkedAt: -1 },
  { name: 'ix_claim_validation_snapshots_claim' },
);

export type Claim = InferSchemaType<typeof claimSchema>;
export type ClaimLine = InferSchemaType<typeof claimLineSchema>;
export type ClaimDocument = InferSchemaType<typeof claimDocumentSchema>;
export type ClaimValidationSnapshot = InferSchemaType<
  typeof claimValidationSnapshotSchema
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

export const ClaimModel = modelFor('claims', claimSchema);
export const ClaimLineModel = modelFor('claimLines', claimLineSchema);
export const ClaimDocumentModel = modelFor(
  'claimDocuments',
  claimDocumentSchema,
);
export const ClaimValidationSnapshotModel = modelFor(
  'claimValidationSnapshots',
  claimValidationSnapshotSchema,
);