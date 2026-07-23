import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  consultantAgreementHistoryTypeValues,
  consultantAgreementRuleStatusValues,
  consultantAgreementStatusValues,
  consultantCalculationMethodValues,
  consultantDiscountTreatmentValues,
  consultantEncounterTypeValues,
  consultantEngagementTypeValues,
  consultantParticipantAllocationMethodValues,
  consultantParticipantRoleValues,
  consultantPatientTypeValues,
  consultantRecognitionBasisValues,
  consultantResponsibilityTreatmentValues,
  consultantServiceCategoryValues,
  consultantSharingCurrencyValues,
} from './consultant-sharing.types.js';

import {
  compareConsultantSharingDecimals,
  compareConsultantSharingDecimalSum,
  consultantSharingCommonFields,
  consultantSharingEncryptedText,
  consultantSharingHash,
  consultantSharingNonNegativeDecimal,
  consultantSharingNullableDecimal,
  consultantSharingObjectIdArray,
  consultantSharingStringArray,
  consultantSharingTimestampedSchemaOptions,
  normalizeConsultantSharingCode,
  nullableConsultantSharingObjectId,
  requireConsultantSharingReason,
  validateConsultantSharingEffectiveDates,
  validateConsultantSharingImmutableHash,
  validateConsultantSharingMakerChecker,
  validateConsultantSharingMoneyFields,
  validateConsultantSharingPercentage,
  validateDistinctConsultantSharingObjectIds,
} from './consultant-sharing-schema-helpers.js';

const consultantAgreementTierSchema = new Schema(
  {
    tierCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 80,
    },
    fromInclusive: {
      ...consultantSharingNonNegativeDecimal,
      immutable: true,
    },
    toInclusive: {
      ...consultantSharingNullableDecimal,
      immutable: true,
    },
    percentage: {
      ...consultantSharingNullableDecimal,
      immutable: true,
    },
    fixedAmount: {
      ...consultantSharingNullableDecimal,
      immutable: true,
    },
    priority: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      max: 10_000,
    },
  },
  { _id: true, strict: true },
);

consultantAgreementTierSchema.pre('validate', function validateTier() {
  this.tierCode = normalizeConsultantSharingCode(this.tierCode);
  validateConsultantSharingMoneyFields(this, ['fromInclusive']);

  if (this.toInclusive != null) {
    validateConsultantSharingMoneyFields(this, ['toInclusive']);
    if (compareConsultantSharingDecimals(this.toInclusive, this.fromInclusive) <= 0) {
      this.invalidate('toInclusive', 'Tier upper bound must be above its lower bound');
    }
  }

  if (this.percentage == null && this.fixedAmount == null) {
    this.invalidate(
      'percentage',
      'Every tier requires a percentage or fixed amount',
    );
  }
  if (this.percentage != null) {
    validateConsultantSharingPercentage(this, 'percentage', true);
  }
  if (this.fixedAmount != null) {
    validateConsultantSharingMoneyFields(this, ['fixedAmount']);
  }
});

const consultantAgreementParticipantRuleSchema = new Schema(
  {
    participantId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    participantStaffId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    participantGroupId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    participantRole: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantParticipantRoleValues,
    },
    customRoleCode: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    allocationMethod: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantParticipantAllocationMethodValues,
    },
    percentage: {
      ...consultantSharingNullableDecimal,
      immutable: true,
    },
    fixedAmount: {
      ...consultantSharingNullableDecimal,
      immutable: true,
    },
    priority: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      max: 10_000,
    },
    receivesResidual: {
      type: Boolean,
      required: true,
      immutable: true,
      default: false,
    },
  },
  { _id: true, strict: true },
);

consultantAgreementParticipantRuleSchema.pre(
  'validate',
  function validateParticipantRule() {
    if (this.participantRole === 'CUSTOM') {
      if (this.customRoleCode == null || this.customRoleCode.trim().length === 0) {
        this.invalidate('customRoleCode', 'Custom participant roles require a code');
      } else {
        this.customRoleCode = normalizeConsultantSharingCode(this.customRoleCode);
      }
    } else if (this.customRoleCode != null) {
      this.invalidate(
        'customRoleCode',
        'Custom role code is only valid for CUSTOM participants',
      );
    }

    if (this.allocationMethod === 'PERCENTAGE') {
      if (this.percentage == null) {
        this.invalidate('percentage', 'Percentage allocation requires a percentage');
      } else {
        validateConsultantSharingPercentage(this, 'percentage', true);
      }
      if (this.fixedAmount != null || this.receivesResidual) {
        this.invalidate(
          'allocationMethod',
          'Percentage allocation cannot include fixed or residual values',
        );
      }
    }

    if (this.allocationMethod === 'FIXED') {
      if (this.fixedAmount == null) {
        this.invalidate('fixedAmount', 'Fixed allocation requires an amount');
      } else {
        validateConsultantSharingMoneyFields(this, ['fixedAmount']);
      }
      if (this.percentage != null || this.receivesResidual) {
        this.invalidate(
          'allocationMethod',
          'Fixed allocation cannot include percentage or residual values',
        );
      }
    }

    if (this.allocationMethod === 'RESIDUAL') {
      if (!this.receivesResidual || this.percentage != null || this.fixedAmount != null) {
        this.invalidate(
          'allocationMethod',
          'Residual allocation must be the designated residual participant only',
        );
      }
    }
  },
);

const consultantRevenueEligibilityPolicySchema = new Schema(
  {
    discountTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantDiscountTreatmentValues,
      default: 'DEDUCT_FROM_ELIGIBLE',
    },
    patientResponsibilityTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'INCLUDE',
    },
    sponsorResponsibilityTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'INCLUDE',
    },
    packageResponsibilityTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'INCLUDE',
    },
    welfareZakatTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'EXCLUDE',
    },
    taxTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'EXCLUDE',
    },
    serviceChargeTreatment: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantResponsibilityTreatmentValues,
      default: 'EXCLUDE',
    },
    deductRefunds: { type: Boolean, required: true, immutable: true, default: true },
    deductCreditNotes: { type: Boolean, required: true, immutable: true, default: true },
    includeDebitNotes: { type: Boolean, required: true, immutable: true, default: true },
    deductWriteOffs: { type: Boolean, required: true, immutable: true, default: true },
    applyClaimAdjustments: { type: Boolean, required: true, immutable: true, default: true },
    deductNonShareableCharges: { type: Boolean, required: true, immutable: true, default: true },
    deductCosts: { type: Boolean, required: true, immutable: true, default: false },
    deductConsumables: { type: Boolean, required: true, immutable: true, default: false },
    deductOtherApprovedDeductions: { type: Boolean, required: true, immutable: true, default: true },
  },
  { _id: false, strict: true },
);

export const consultantAgreementSchema = new Schema(
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
    agreementNumber: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    agreementName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 300,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 4_000,
    },
    consultantId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    consultantStaffId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    consultantUserId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    consultantGroupId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    engagementType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantEngagementTypeValues,
    },
    status: {
      type: String,
      required: true,
      enum: consultantAgreementStatusValues,
      default: 'DRAFT',
    },
    priority: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
      default: 100,
    },
    effectiveFrom: { type: Date, required: true },
    effectiveThrough: { type: Date, default: null },
    agreementVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      default: 1,
    },
    supersedesAgreementId: {
      ...nullableConsultantSharingObjectId,
      immutable: true,
    },
    supersededByAgreementId: nullableConsultantSharingObjectId,
    departmentIds: consultantSharingObjectIdArray,
    serviceIds: consultantSharingObjectIdArray,
    serviceCategories: {
      type: [String],
      required: true,
      default: [],
      enum: consultantServiceCategoryValues,
    },
    supportingAttachmentIds: consultantSharingObjectIdArray,
    internalNotesEncrypted: consultantSharingEncryptedText,
    approvalNotesEncrypted: consultantSharingEncryptedText,
    taxProfileReferenceHash: {
      type: String,
      default: null,
      select: false,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    payoutProfileReferenceHash: {
      type: String,
      default: null,
      select: false,
      lowercase: true,
      minlength: 64,
      maxlength: 128,
    },
    payoutProfileReferenceMasked: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    approvalMatrixCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 120,
    },
    approvalRequestId: nullableConsultantSharingObjectId,
    makerUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    submittedBy: nullableConsultantSharingObjectId,
    reviewedBy: nullableConsultantSharingObjectId,
    approvedBy: nullableConsultantSharingObjectId,
    activatedBy: nullableConsultantSharingObjectId,
    suspendedBy: nullableConsultantSharingObjectId,
    terminatedBy: nullableConsultantSharingObjectId,
    cancelledBy: nullableConsultantSharingObjectId,
    reopenedBy: nullableConsultantSharingObjectId,
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    terminatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    terminationReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 2_000 },
    reopenReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  consultantSharingTimestampedSchemaOptions('consultantAgreements'),
);

consultantAgreementSchema.pre('validate', function validateAgreement() {
  this.agreementNumber = normalizeConsultantSharingCode(this.agreementNumber);
  this.approvalMatrixCode = normalizeConsultantSharingCode(this.approvalMatrixCode);
  validateConsultantSharingEffectiveDates(this);
  validateDistinctConsultantSharingObjectIds(this, 'departmentIds', this.departmentIds);
  validateDistinctConsultantSharingObjectIds(this, 'serviceIds', this.serviceIds);
  validateDistinctConsultantSharingObjectIds(
    this,
    'supportingAttachmentIds',
    this.supportingAttachmentIds,
  );

  if (this.engagementType === 'GROUP' && this.consultantGroupId == null) {
    this.invalidate('consultantGroupId', 'Group agreements require a consultant group');
  }
  if (this.engagementType !== 'GROUP' && this.consultantGroupId != null) {
    this.invalidate('consultantGroupId', 'Only group agreements may reference a group');
  }

  validateConsultantSharingMakerChecker(this, 'makerUserId', [
    'reviewedBy',
    'approvedBy',
    'activatedBy',
    'suspendedBy',
    'terminatedBy',
  ]);

  const requiredLifecycleMetadata: Readonly<
    Partial<Record<string, readonly [string, string]>>
  > = {
    SUBMITTED: ['submittedBy', 'submittedAt'],
    UNDER_REVIEW: ['reviewedBy', 'reviewedAt'],
    APPROVED: ['approvedBy', 'approvedAt'],
    ACTIVE: ['activatedBy', 'activatedAt'],
    SUSPENDED: ['suspendedBy', 'suspendedAt'],
    TERMINATED: ['terminatedBy', 'terminatedAt'],
    CANCELLED: ['cancelledBy', 'cancelledAt'],
    REOPENED: ['reopenedBy', 'reopenedAt'],
  };
  const metadata = requiredLifecycleMetadata[this.status];
  if (metadata != null) {
    for (const path of metadata) {
      if (this.get(path) == null) {
        this.invalidate(path, `${this.status} agreements require ${path}`);
      }
    }
  }

  if (
    ['APPROVED', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'SUPERSEDED'].includes(
      this.status,
    ) &&
    (this.approvedBy == null ||
      this.approvedAt == null ||
      this.approvalRequestId == null)
  ) {
    this.invalidate(
      'approvedBy',
      `${this.status} agreements require independent approval metadata`,
    );
  }

  if (this.status === 'SUSPENDED') {
    requireConsultantSharingReason(this, 'suspensionReason', this.suspensionReason);
  }
  if (this.status === 'TERMINATED') {
    requireConsultantSharingReason(this, 'terminationReason', this.terminationReason);
  }
  if (this.status === 'CANCELLED') {
    requireConsultantSharingReason(this, 'cancellationReason', this.cancellationReason);
  }
  if (this.status === 'REOPENED') {
    requireConsultantSharingReason(this, 'reopenReason', this.reopenReason);
  }
  if (this.status === 'SUPERSEDED' && this.supersededByAgreementId == null) {
    this.invalidate(
      'supersededByAgreementId',
      'Superseded agreements require the replacement agreement reference',
    );
  }
});

consultantAgreementSchema.index(
  { facilityId: 1, agreementNumber: 1 },
  { name: 'uq_consultant_agreements_number', unique: true },
);
consultantAgreementSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_agreements_operation', unique: true },
);
consultantAgreementSchema.index(
  {
    facilityId: 1,
    consultantId: 1,
    status: 1,
    effectiveFrom: 1,
    effectiveThrough: 1,
    priority: -1,
  },
  { name: 'ix_consultant_agreements_matching' },
);
consultantAgreementSchema.index(
  { facilityId: 1, status: 1, effectiveThrough: 1 },
  { name: 'ix_consultant_agreements_expiry' },
);
consultantAgreementSchema.index(
  { facilityId: 1, supersedesAgreementId: 1, agreementVersion: 1 },
  {
    name: 'uq_consultant_agreements_version_lineage',
    unique: true,
    partialFilterExpression: { supersedesAgreementId: { $type: 'objectId' } },
  },
);

export const consultantAgreementRuleSchema = new Schema(
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
    agreementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    agreementVersion: { type: Number, required: true, immutable: true, min: 1 },
    ruleVersion: { type: Number, required: true, immutable: true, min: 1 },
    ruleCode: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 120,
    },
    ruleName: { type: String, required: true, trim: true, minlength: 3, maxlength: 300 },
    status: {
      type: String,
      required: true,
      enum: consultantAgreementRuleStatusValues,
      default: 'DRAFT',
    },
    priority: { type: Number, required: true, min: 0, max: 10_000, default: 100 },
    specificityRank: { type: Number, required: true, min: 0, max: 10_000, default: 0 },
    isFallback: { type: Boolean, required: true, default: false },
    effectiveFrom: { type: Date, required: true },
    effectiveThrough: { type: Date, default: null },
    consultantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    consultantGroupId: { ...nullableConsultantSharingObjectId, immutable: true },
    departmentId: { ...nullableConsultantSharingObjectId, immutable: true },
    serviceId: { ...nullableConsultantSharingObjectId, immutable: true },
    serviceCategory: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantServiceCategoryValues, null],
    },
    chargeCatalogItemId: { ...nullableConsultantSharingObjectId, immutable: true },
    procedureId: { ...nullableConsultantSharingObjectId, immutable: true },
    patientType: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantPatientTypeValues, null],
    },
    encounterType: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantEncounterTypeValues, null],
    },
    admissionType: { type: String, default: null, immutable: true, trim: true, maxlength: 120 },
    payerOrganizationId: { ...nullableConsultantSharingObjectId, immutable: true },
    panelProgramId: { ...nullableConsultantSharingObjectId, immutable: true },
    packageId: { ...nullableConsultantSharingObjectId, immutable: true },
    claimType: { type: String, default: null, immutable: true, trim: true, maxlength: 120 },
    calculationMethod: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantCalculationMethodValues,
    },
    recognitionBasis: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantRecognitionBasisValues,
    },
    percentage: { ...consultantSharingNullableDecimal, immutable: true },
    fixedAmount: { ...consultantSharingNullableDecimal, immutable: true },
    minimumShare: { ...consultantSharingNullableDecimal, immutable: true },
    maximumShare: { ...consultantSharingNullableDecimal, immutable: true },
    perServiceCap: { ...consultantSharingNullableDecimal, immutable: true },
    perCaseCap: { ...consultantSharingNullableDecimal, immutable: true },
    periodCap: { ...consultantSharingNullableDecimal, immutable: true },
    guaranteedAmount: { ...consultantSharingNullableDecimal, immutable: true },
    thresholdAmount: { ...consultantSharingNullableDecimal, immutable: true },
    tiers: {
      type: [consultantAgreementTierSchema],
      required: true,
      immutable: true,
      default: [],
    },
    participants: {
      type: [consultantAgreementParticipantRuleSchema],
      required: true,
      immutable: true,
      default: [],
    },
    eligibilityPolicy: {
      type: consultantRevenueEligibilityPolicySchema,
      required: true,
      immutable: true,
    },
    excludedDepartmentIds: {
      ...consultantSharingObjectIdArray,
      immutable: true,
    },
    excludedServiceIds: {
      ...consultantSharingObjectIdArray,
      immutable: true,
    },
    excludedPayerOrganizationIds: {
      ...consultantSharingObjectIdArray,
      immutable: true,
    },
    excludedPackageIds: {
      ...consultantSharingObjectIdArray,
      immutable: true,
    },
    excludedInvoiceLineTypes: {
      ...consultantSharingStringArray,
      immutable: true,
    },
    currency: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantSharingCurrencyValues,
      default: 'PKR',
    },
    calculationFingerprint: consultantSharingHash,
    makerUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvedBy: nullableConsultantSharingObjectId,
    approvalRequestId: nullableConsultantSharingObjectId,
    approvedAt: { type: Date, default: null },
    supersedesRuleId: { ...nullableConsultantSharingObjectId, immutable: true },
    supersededByRuleId: nullableConsultantSharingObjectId,
    inactiveReason: { type: String, default: null, trim: true, maxlength: 2_000 },
  },
  consultantSharingTimestampedSchemaOptions('consultantAgreementRules'),
);

consultantAgreementRuleSchema.pre('validate', function validateRule() {
  this.ruleCode = normalizeConsultantSharingCode(this.ruleCode);
  validateConsultantSharingEffectiveDates(this);
  validateConsultantSharingImmutableHash(this, 'calculationFingerprint');
  validateConsultantSharingMakerChecker(this, 'makerUserId', ['approvedBy']);

  for (const path of [
    'minimumShare',
    'maximumShare',
    'perServiceCap',
    'perCaseCap',
    'periodCap',
    'guaranteedAmount',
    'thresholdAmount',
  ] as const) {
    if (this.get(path) != null) {
      validateConsultantSharingMoneyFields(this, [path]);
    }
  }
  if (this.percentage != null) {
    validateConsultantSharingPercentage(this, 'percentage', true);
  }
  if (this.fixedAmount != null) {
    validateConsultantSharingMoneyFields(this, ['fixedAmount']);
  }

  const percentageMethods = new Set([
    'PERCENTAGE_OF_ELIGIBLE_REVENUE',
    'PERCENTAGE_PLUS_FIXED',
  ]);
  const fixedMethods = new Set([
    'FIXED_PER_SERVICE',
    'FIXED_PER_PROCEDURE',
    'FIXED_PER_INVOICE_LINE',
    'FIXED_PER_CASE',
    'PERCENTAGE_PLUS_FIXED',
  ]);
  const tierMethods = new Set([
    'TIERED_PERCENTAGE',
    'SLAB_BASED',
    'PROGRESSIVE_TIERS',
  ]);

  if (percentageMethods.has(this.calculationMethod) && this.percentage == null) {
    this.invalidate('percentage', `${this.calculationMethod} requires a percentage`);
  }
  if (fixedMethods.has(this.calculationMethod) && this.fixedAmount == null) {
    this.invalidate('fixedAmount', `${this.calculationMethod} requires a fixed amount`);
  }
  if (tierMethods.has(this.calculationMethod) && this.tiers.length === 0) {
    this.invalidate('tiers', `${this.calculationMethod} requires at least one tier`);
  }
  if (this.calculationMethod === 'THRESHOLD_BASED') {
    if (this.thresholdAmount == null) {
      this.invalidate(
        'thresholdAmount',
        'Threshold calculation requires a threshold amount',
      );
    }
    if (this.percentage == null && this.fixedAmount == null) {
      this.invalidate(
        'calculationMethod',
        'Threshold calculation requires a percentage or fixed amount',
      );
    }
  }

  const tierCodes = this.tiers.map((tier) => tier.tierCode);
  if (new Set(tierCodes).size !== tierCodes.length) {
    this.invalidate('tiers', 'Tier codes must be unique within a rule');
  }
  const orderedTiers = [...this.tiers].sort((left, right) =>
    compareConsultantSharingDecimals(left.fromInclusive, right.fromInclusive),
  );
  for (let index = 1; index < orderedTiers.length; index += 1) {
    const previous = orderedTiers[index - 1]!;
    const current = orderedTiers[index]!;
    if (
      previous.toInclusive == null ||
      compareConsultantSharingDecimals(current.fromInclusive, previous.toInclusive) <= 0
    ) {
      this.invalidate('tiers', 'Tier boundaries must be ordered and non-overlapping');
      break;
    }
  }

  const participantKeys = this.participants.map(
    (participant) => `${String(participant.participantId)}:${participant.participantRole}:${participant.customRoleCode ?? ''}`,
  );
  if (new Set(participantKeys).size !== participantKeys.length) {
    this.invalidate('participants', 'Participant allocation rules cannot be duplicated');
  }
  const residualCount = this.participants.filter(
    (participant) => participant.allocationMethod === 'RESIDUAL',
  ).length;
  if (residualCount > 1) {
    this.invalidate('participants', 'Only one participant may receive residual allocation');
  }
  const percentageValues = this.participants
    .filter((participant) => participant.allocationMethod === 'PERCENTAGE')
    .map((participant) => participant.percentage ?? '0');
  try {
    if (compareConsultantSharingDecimalSum(percentageValues, '100') > 0) {
      this.invalidate('participants', 'Participant percentage allocations cannot exceed 100');
    }
  } catch (error) {
    this.invalidate(
      'participants',
      error instanceof Error
        ? error.message
        : 'Participant percentages contain invalid decimal values',
    );
  }

  validateDistinctConsultantSharingObjectIds(
    this,
    'excludedDepartmentIds',
    this.excludedDepartmentIds,
  );
  validateDistinctConsultantSharingObjectIds(this, 'excludedServiceIds', this.excludedServiceIds);
  validateDistinctConsultantSharingObjectIds(
    this,
    'excludedPayerOrganizationIds',
    this.excludedPayerOrganizationIds,
  );
  validateDistinctConsultantSharingObjectIds(this, 'excludedPackageIds', this.excludedPackageIds);

  if (this.isFallback) {
    const scopedFields = [
      this.departmentId,
      this.serviceId,
      this.serviceCategory,
      this.chargeCatalogItemId,
      this.procedureId,
      this.patientType,
      this.encounterType,
      this.admissionType,
      this.payerOrganizationId,
      this.panelProgramId,
      this.packageId,
      this.claimType,
    ];
    if (scopedFields.some((value) => value != null)) {
      this.invalidate('isFallback', 'Fallback rules cannot include specificity dimensions');
    }
  }

  if (this.status === 'ACTIVE') {
    if (this.approvedBy == null || this.approvalRequestId == null || this.approvedAt == null) {
      this.invalidate('approvedBy', 'Active rules require independent approval metadata');
    }
  }
  if (this.status === 'INACTIVE') {
    requireConsultantSharingReason(this, 'inactiveReason', this.inactiveReason);
  }
  if (this.status === 'SUPERSEDED' && this.supersededByRuleId == null) {
    this.invalidate('supersededByRuleId', 'Superseded rules require a replacement rule');
  }
});

consultantAgreementRuleSchema.index(
  { facilityId: 1, operationKey: 1 },
  { name: 'uq_consultant_agreement_rules_operation', unique: true },
);
consultantAgreementRuleSchema.index(
  { facilityId: 1, agreementId: 1, agreementVersion: 1, ruleCode: 1, ruleVersion: 1 },
  { name: 'uq_consultant_agreement_rules_version', unique: true },
);
consultantAgreementRuleSchema.index(
  { facilityId: 1, calculationFingerprint: 1 },
  { name: 'uq_consultant_agreement_rules_fingerprint', unique: true },
);
consultantAgreementRuleSchema.index(
  {
    facilityId: 1,
    consultantId: 1,
    status: 1,
    effectiveFrom: 1,
    effectiveThrough: 1,
    priority: -1,
    specificityRank: -1,
  },
  { name: 'ix_consultant_agreement_rules_matching' },
);
consultantAgreementRuleSchema.index(
  {
    facilityId: 1,
    agreementId: 1,
    status: 1,
    isFallback: 1,
  },
  {
    name: 'uq_consultant_agreement_rules_active_fallback',
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', isFallback: true },
  },
);

export const consultantAgreementHistorySchema = new Schema(
  {
    ...consultantSharingCommonFields,
    agreementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    agreementNumber: { type: String, required: true, immutable: true, trim: true, uppercase: true },
    agreementVersion: { type: Number, required: true, immutable: true, min: 1 },
    historySequence: { type: Number, required: true, immutable: true, min: 1 },
    historyType: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantAgreementHistoryTypeValues,
    },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantAgreementStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantAgreementStatusValues,
    },
    snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
    snapshotHash: consultantSharingHash,
    reason: { type: String, required: true, immutable: true, trim: true, minlength: 5, maxlength: 4_000 },
    attachmentIds: { ...consultantSharingObjectIdArray, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    makerUserId: { ...nullableConsultantSharingObjectId, immutable: true },
    checkerUserId: { ...nullableConsultantSharingObjectId, immutable: true },
    approvalRequestId: { ...nullableConsultantSharingObjectId, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantAgreementHistories'),
);

consultantAgreementHistorySchema.pre('validate', function validateAgreementHistory() {
  this.agreementNumber = normalizeConsultantSharingCode(this.agreementNumber);
  validateConsultantSharingMakerChecker(this, 'makerUserId', ['checkerUserId']);
  validateConsultantSharingImmutableHash(this, 'snapshotHash');
  validateConsultantSharingImmutableHash(this, 'immutableHash');
  validateDistinctConsultantSharingObjectIds(this, 'attachmentIds', this.attachmentIds);
  if (this.fromStatus === this.toStatus && this.historyType !== 'AMENDED') {
    this.invalidate('toStatus', 'Agreement history must change status unless it is an amendment');
  }
});

consultantAgreementHistorySchema.index(
  { facilityId: 1, agreementId: 1, historySequence: 1 },
  { name: 'uq_consultant_agreement_histories_sequence', unique: true },
);
consultantAgreementHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_agreement_histories_hash', unique: true },
);
consultantAgreementHistorySchema.index(
  { facilityId: 1, agreementId: 1, occurredAt: 1 },
  { name: 'ix_consultant_agreement_histories_timeline' },
);

export const consultantAgreementRuleHistorySchema = new Schema(
  {
    ...consultantSharingCommonFields,
    agreementId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    ruleId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    agreementVersion: { type: Number, required: true, immutable: true, min: 1 },
    ruleVersion: { type: Number, required: true, immutable: true, min: 1 },
    historySequence: { type: Number, required: true, immutable: true, min: 1 },
    fromStatus: {
      type: String,
      default: null,
      immutable: true,
      enum: [...consultantAgreementRuleStatusValues, null],
    },
    toStatus: {
      type: String,
      required: true,
      immutable: true,
      enum: consultantAgreementRuleStatusValues,
    },
    snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
    snapshotHash: consultantSharingHash,
    reason: { type: String, required: true, immutable: true, trim: true, minlength: 5, maxlength: 4_000 },
    actorUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    approvalRequestId: { ...nullableConsultantSharingObjectId, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    immutableHash: consultantSharingHash,
  },
  consultantSharingTimestampedSchemaOptions('consultantAgreementRuleHistories'),
);

consultantAgreementRuleHistorySchema.pre('validate', function validateRuleHistory() {
  validateConsultantSharingImmutableHash(this, 'snapshotHash');
  validateConsultantSharingImmutableHash(this, 'immutableHash');
});

consultantAgreementRuleHistorySchema.index(
  { facilityId: 1, ruleId: 1, historySequence: 1 },
  { name: 'uq_consultant_agreement_rule_histories_sequence', unique: true },
);
consultantAgreementRuleHistorySchema.index(
  { facilityId: 1, immutableHash: 1 },
  { name: 'uq_consultant_agreement_rule_histories_hash', unique: true },
);

export type ConsultantAgreement = InferSchemaType<typeof consultantAgreementSchema>;
export type ConsultantAgreementRule = InferSchemaType<typeof consultantAgreementRuleSchema>;
export type ConsultantAgreementHistory = InferSchemaType<typeof consultantAgreementHistorySchema>;
export type ConsultantAgreementRuleHistory = InferSchemaType<typeof consultantAgreementRuleHistorySchema>;

function modelFor<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema, name)
  );
}

export const ConsultantAgreementModel = modelFor(
  'consultantAgreements',
  consultantAgreementSchema,
);
export const ConsultantAgreementRuleModel = modelFor(
  'consultantAgreementRules',
  consultantAgreementRuleSchema,
);
export const ConsultantAgreementHistoryModel = modelFor(
  'consultantAgreementHistories',
  consultantAgreementHistorySchema,
);
export const ConsultantAgreementRuleHistoryModel = modelFor(
  'consultantAgreementRuleHistories',
  consultantAgreementRuleHistorySchema,
);