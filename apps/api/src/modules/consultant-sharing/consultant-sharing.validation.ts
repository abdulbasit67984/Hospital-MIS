import Decimal from 'decimal.js';
import { z } from 'zod';

import {
  CONSULTANT_SHARING_MAX_ATTACHMENTS,
  CONSULTANT_SHARING_MAX_PAGE_SIZE,
  CONSULTANT_SHARING_MAX_PARTICIPANTS,
  CONSULTANT_SHARING_MAX_RULES,
  CONSULTANT_SHARING_MAX_TIERS,
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
  consultantSettlementPeriodTypeValues,
  consultantSortFieldValues,
} from './consultant-sharing.constants.js';
import { CONSULTANT_SHARING_REPORT_NAMES } from './consultant-sharing.reporting.contracts.js';

export const consultantSharingObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/iu, 'Expected a valid MongoDB ObjectId');

export const consultantSharingExpectedVersionSchema = z.number().int().min(0);

export const consultantSharingIsoDateTimeSchema = z.string().datetime({
  offset: true,
});

export const consultantSharingReasonSchema = z.string().trim().min(5).max(4_000);

export const consultantSharingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(120)
  .regex(/^[A-Z0-9][A-Z0-9._/-]*$/u, 'Code contains unsupported characters');

const decimalSyntax = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function decimalString(input: Readonly<{
  minimum: Decimal | null;
  maximum: Decimal | null;
  scale: number;
}>) {
  return z
    .string()
    .trim()
    .min(1)
    .max(96)
    .regex(decimalSyntax, 'Expected a base-10 decimal value')
    .superRefine((value, context) => {
      let amount: Decimal;

      try {
        amount = new Decimal(value);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Expected a valid decimal value',
        });
        return;
      }

      if (!amount.isFinite()) {
        context.addIssue({
          code: 'custom',
          message: 'Decimal value must be finite',
        });
      }

      if (amount.decimalPlaces() > input.scale) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must have at most ${input.scale} decimal places`,
        });
      }

      if (input.minimum !== null && amount.lessThan(input.minimum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must be at least ${input.minimum.toString()}`,
        });
      }

      if (input.maximum !== null && amount.greaterThan(input.maximum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must not exceed ${input.maximum.toString()}`,
        });
      }
    })
    .transform((value) =>
      new Decimal(value)
        .toDecimalPlaces(input.scale, Decimal.ROUND_HALF_UP)
        .toFixed(input.scale),
    );
}

export const consultantSharingNonNegativeMoneySchema = decimalString({
  minimum: new Decimal(0),
  maximum: null,
  scale: 2,
});

export const consultantSharingSignedMoneySchema = decimalString({
  minimum: null,
  maximum: null,
  scale: 2,
});

export const consultantSharingPositiveMoneySchema =
  consultantSharingNonNegativeMoneySchema.refine(
    (value) => new Decimal(value).greaterThan(0),
    'Amount must be greater than zero',
  );

export const consultantSharingPercentageSchema = decimalString({
  minimum: new Decimal(0),
  maximum: new Decimal(100),
  scale: 6,
});

export const consultantSharingPositiveQuantitySchema = decimalString({
  minimum: new Decimal('0.00000001'),
  maximum: null,
  scale: 8,
});

const optionalNullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

const objectIdArray = (maximum: number) =>
  z
    .array(consultantSharingObjectIdSchema)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate identifiers are not allowed',
        });
      }
    });

export const consultantAgreementTierSchema = z
  .object({
    tierCode: consultantSharingCodeSchema,
    fromInclusive: consultantSharingNonNegativeMoneySchema,
    toInclusive: consultantSharingNonNegativeMoneySchema.nullable(),
    percentage: consultantSharingPercentageSchema.nullable(),
    fixedAmount: consultantSharingNonNegativeMoneySchema.nullable(),
    priority: z.number().int().min(0).max(100_000),
  })
  .strict()
  .superRefine((tier, context) => {
    if (tier.percentage === null && tier.fixedAmount === null) {
      context.addIssue({
        code: 'custom',
        message: 'A tier requires a percentage, a fixed amount, or both',
      });
    }

    if (
      tier.toInclusive !== null &&
      new Decimal(tier.toInclusive).lessThan(tier.fromInclusive)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toInclusive'],
        message: 'Tier upper bound must not be below its lower bound',
      });
    }
  });

export const consultantParticipantRuleSchema = z
  .object({
    participantId: consultantSharingObjectIdSchema,
    participantRole: z.enum(consultantParticipantRoleValues),
    customRoleCode: consultantSharingCodeSchema.nullable().optional(),
    allocationMethod: z.enum(consultantParticipantAllocationMethodValues),
    percentage: consultantSharingPercentageSchema.nullable().optional(),
    fixedAmount: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    priority: z.number().int().min(0).max(100_000),
    receivesResidual: z.boolean().optional(),
  })
  .strict()
  .superRefine((participant, context) => {
    if (
      participant.participantRole === 'CUSTOM' &&
      participant.customRoleCode == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customRoleCode'],
        message: 'Custom participant roles require customRoleCode',
      });
    }

    if (
      participant.allocationMethod === 'PERCENTAGE' &&
      participant.percentage == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['percentage'],
        message: 'Percentage allocation requires percentage',
      });
    }

    if (
      participant.allocationMethod === 'FIXED' &&
      participant.fixedAmount == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['fixedAmount'],
        message: 'Fixed allocation requires fixedAmount',
      });
    }

    if (
      participant.allocationMethod === 'RESIDUAL' &&
      participant.receivesResidual !== true
    ) {
      context.addIssue({
        code: 'custom',
        path: ['receivesResidual'],
        message: 'Residual allocation requires receivesResidual=true',
      });
    }
  });

export const consultantRevenueEligibilityPolicySchema = z
  .object({
    discountTreatment: z.enum(consultantDiscountTreatmentValues),
    patientResponsibilityTreatment: z.enum(
      consultantResponsibilityTreatmentValues,
    ),
    sponsorResponsibilityTreatment: z.enum(
      consultantResponsibilityTreatmentValues,
    ),
    packageResponsibilityTreatment: z.enum(
      consultantResponsibilityTreatmentValues,
    ),
    welfareZakatTreatment: z.enum(consultantResponsibilityTreatmentValues),
    taxTreatment: z.enum(consultantResponsibilityTreatmentValues),
    serviceChargeTreatment: z.enum(consultantResponsibilityTreatmentValues),
    deductRefunds: z.boolean(),
    deductCreditNotes: z.boolean(),
    includeDebitNotes: z.boolean(),
    deductWriteOffs: z.boolean(),
    applyClaimAdjustments: z.boolean(),
    deductNonShareableCharges: z.boolean(),
    deductCosts: z.boolean(),
    deductConsumables: z.boolean(),
    deductOtherApprovedDeductions: z.boolean(),
  })
  .strict();

export const consultantAgreementRuleInputSchema = z
  .object({
    ruleCode: consultantSharingCodeSchema,
    ruleName: z.string().trim().min(3).max(250),
    priority: z.number().int().min(0).max(100_000),
    isFallback: z.boolean(),
    effectiveFrom: consultantSharingIsoDateTimeSchema,
    effectiveThrough: consultantSharingIsoDateTimeSchema.nullable().optional(),
    departmentId: consultantSharingObjectIdSchema.nullable().optional(),
    serviceId: consultantSharingObjectIdSchema.nullable().optional(),
    serviceCategory: z.enum(consultantServiceCategoryValues).nullable().optional(),
    chargeCatalogItemId: consultantSharingObjectIdSchema.nullable().optional(),
    procedureId: consultantSharingObjectIdSchema.nullable().optional(),
    patientType: z.enum(consultantPatientTypeValues).nullable().optional(),
    encounterType: z.enum(consultantEncounterTypeValues).nullable().optional(),
    admissionType: optionalNullableText(120),
    payerOrganizationId: consultantSharingObjectIdSchema.nullable().optional(),
    panelProgramId: consultantSharingObjectIdSchema.nullable().optional(),
    packageId: consultantSharingObjectIdSchema.nullable().optional(),
    claimType: optionalNullableText(120),
    calculationMethod: z.enum(consultantCalculationMethodValues),
    recognitionBasis: z.enum(consultantRecognitionBasisValues),
    percentage: consultantSharingPercentageSchema.nullable().optional(),
    fixedAmount: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    minimumShare: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    maximumShare: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    perServiceCap: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    perCaseCap: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    periodCap: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    guaranteedAmount:
      consultantSharingNonNegativeMoneySchema.nullable().optional(),
    thresholdAmount:
      consultantSharingNonNegativeMoneySchema.nullable().optional(),
    tiers: z.array(consultantAgreementTierSchema).max(CONSULTANT_SHARING_MAX_TIERS),
    participants: z
      .array(consultantParticipantRuleSchema)
      .max(CONSULTANT_SHARING_MAX_PARTICIPANTS),
    eligibilityPolicy: consultantRevenueEligibilityPolicySchema,
  })
  .strict()
  .superRefine((rule, context) => {
    const from = Date.parse(rule.effectiveFrom);
    const through =
      rule.effectiveThrough == null ? null : Date.parse(rule.effectiveThrough);

    if (through !== null && through < from) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveThrough'],
        message: 'Rule effectiveThrough must not precede effectiveFrom',
      });
    }

    const requiresPercentage = new Set([
      'PERCENTAGE_OF_ELIGIBLE_REVENUE',
      'PERCENTAGE_PLUS_FIXED',
    ]);
    const requiresFixed = new Set([
      'FIXED_PER_SERVICE',
      'FIXED_PER_PROCEDURE',
      'FIXED_PER_INVOICE_LINE',
      'FIXED_PER_CASE',
      'PERCENTAGE_PLUS_FIXED',
    ]);
    const requiresTiers = new Set([
      'TIERED_PERCENTAGE',
      'SLAB_BASED',
      'PROGRESSIVE_TIERS',
    ]);

    if (requiresPercentage.has(rule.calculationMethod) && rule.percentage == null) {
      context.addIssue({
        code: 'custom',
        path: ['percentage'],
        message: `${rule.calculationMethod} requires percentage`,
      });
    }

    if (requiresFixed.has(rule.calculationMethod) && rule.fixedAmount == null) {
      context.addIssue({
        code: 'custom',
        path: ['fixedAmount'],
        message: `${rule.calculationMethod} requires fixedAmount`,
      });
    }

    if (requiresTiers.has(rule.calculationMethod) && rule.tiers.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['tiers'],
        message: `${rule.calculationMethod} requires at least one tier`,
      });
    }

    if (
      rule.calculationMethod === 'THRESHOLD_BASED' &&
      rule.thresholdAmount == null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['thresholdAmount'],
        message: 'THRESHOLD_BASED requires thresholdAmount',
      });
    }

    if (
      rule.minimumShare != null &&
      rule.maximumShare != null &&
      new Decimal(rule.minimumShare).greaterThan(rule.maximumShare)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumShare'],
        message: 'maximumShare must not be below minimumShare',
      });
    }

    const participantKeys = rule.participants.map(
      (participant) =>
        `${participant.participantId}:${participant.participantRole}:${participant.customRoleCode ?? ''}`,
    );
    if (new Set(participantKeys).size !== participantKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Duplicate participant allocations are not allowed',
      });
    }

    if (
      rule.participants.filter(
        (participant) => participant.allocationMethod === 'RESIDUAL',
      ).length > 1
    ) {
      context.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Only one residual participant allocation is allowed',
      });
    }
  });

export const createConsultantAgreementSchema = z
  .object({
    agreementName: z.string().trim().min(3).max(250),
    description: optionalNullableText(4_000),
    consultantId: consultantSharingObjectIdSchema,
    consultantStaffId: consultantSharingObjectIdSchema.nullable().optional(),
    consultantGroupId: consultantSharingObjectIdSchema.nullable().optional(),
    engagementType: z.enum(consultantEngagementTypeValues),
    priority: z.number().int().min(0).max(100_000),
    departmentIds: objectIdArray(500).optional(),
    serviceIds: objectIdArray(1_000).optional(),
    serviceCategories: z
      .array(z.enum(consultantServiceCategoryValues))
      .max(consultantServiceCategoryValues.length)
      .superRefine((values, context) => {
        if (new Set(values).size !== values.length) {
          context.addIssue({
            code: 'custom',
            message: 'Duplicate service categories are not allowed',
          });
        }
      })
      .optional(),
    approvalMatrixCode: consultantSharingCodeSchema.optional(),
    effectiveFrom: consultantSharingIsoDateTimeSchema,
    effectiveThrough: consultantSharingIsoDateTimeSchema.nullable().optional(),
    supportingAttachmentIds: objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS),
    internalNotes: optionalNullableText(4_000),
    rules: z
      .array(consultantAgreementRuleInputSchema)
      .min(1)
      .max(CONSULTANT_SHARING_MAX_RULES),
  })
  .strict()
  .superRefine((agreement, context) => {
    if (
      agreement.effectiveThrough != null &&
      Date.parse(agreement.effectiveThrough) < Date.parse(agreement.effectiveFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveThrough'],
        message: 'Agreement effectiveThrough must not precede effectiveFrom',
      });
    }

    const codes = agreement.rules.map((rule) => rule.ruleCode);
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: 'custom',
        path: ['rules'],
        message: 'Agreement rule codes must be unique within an agreement version',
      });
    }
  });

export const updateConsultantAgreementSchema = z
  .object({
    expectedVersion: consultantSharingExpectedVersionSchema,
    agreementName: z.string().trim().min(3).max(250).optional(),
    description: optionalNullableText(4_000),
    priority: z.number().int().min(0).max(100_000).optional(),
    effectiveFrom: consultantSharingIsoDateTimeSchema.optional(),
    effectiveThrough: consultantSharingIsoDateTimeSchema.nullable().optional(),
    supportingAttachmentIds: objectIdArray(
      CONSULTANT_SHARING_MAX_ATTACHMENTS,
    ).optional(),
    internalNotes: optionalNullableText(4_000),
    reason: consultantSharingReasonSchema,
  })
  .strict();

export const consultantAgreementStatusActionSchema = z
  .object({
    expectedVersion: consultantSharingExpectedVersionSchema,
    targetStatus: z.enum(consultantAgreementStatusValues),
    reason: consultantSharingReasonSchema,
    approvalRequestId: consultantSharingObjectIdSchema.nullable().optional(),
    attachmentIds: objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional(),
  })
  .strict();

export const consultantAgreementTransitionBodySchema =
  consultantAgreementStatusActionSchema.omit({ targetStatus: true });

export const consultantShareCalculationSchema = z
  .object({
    eligibleRevenue: consultantSharingNonNegativeMoneySchema,
    method: z.enum(consultantCalculationMethodValues),
    percentage: consultantSharingPercentageSchema.nullable().optional(),
    fixedAmount: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    unitQuantity: consultantSharingPositiveQuantitySchema.optional(),
    thresholdAmount:
      consultantSharingNonNegativeMoneySchema.nullable().optional(),
    minimumShare: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    maximumShare: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    perServiceCap: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    perCaseCap: consultantSharingNonNegativeMoneySchema.nullable().optional(),
    periodRemainingCap:
      consultantSharingNonNegativeMoneySchema.nullable().optional(),
    guaranteedAmount:
      consultantSharingNonNegativeMoneySchema.nullable().optional(),
    tiers: z.array(consultantAgreementTierSchema).max(CONSULTANT_SHARING_MAX_TIERS),
    participantRules: z
      .array(consultantParticipantRuleSchema)
      .max(CONSULTANT_SHARING_MAX_PARTICIPANTS),
  })
  .strict();

export const consultantAgreementMatchContextSchema = z
  .object({
    facilityId: consultantSharingObjectIdSchema,
    consultantId: consultantSharingObjectIdSchema,
    consultantGroupId: consultantSharingObjectIdSchema.nullable().optional(),
    financialEventAt: consultantSharingIsoDateTimeSchema,
    departmentId: consultantSharingObjectIdSchema.nullable().optional(),
    serviceId: consultantSharingObjectIdSchema.nullable().optional(),
    serviceCategory: z.enum(consultantServiceCategoryValues).nullable().optional(),
    chargeCatalogItemId: consultantSharingObjectIdSchema.nullable().optional(),
    procedureId: consultantSharingObjectIdSchema.nullable().optional(),
    patientType: z.enum(consultantPatientTypeValues).nullable().optional(),
    encounterType: z.enum(consultantEncounterTypeValues).nullable().optional(),
    admissionType: optionalNullableText(120),
    payerOrganizationId: consultantSharingObjectIdSchema.nullable().optional(),
    panelProgramId: consultantSharingObjectIdSchema.nullable().optional(),
    packageId: consultantSharingObjectIdSchema.nullable().optional(),
    claimType: optionalNullableText(120),
  })
  .strict();

export const consultantSettlementPeriodSchema = z
  .object({
    periodType: z.enum(consultantSettlementPeriodTypeValues),
    periodFrom: consultantSharingIsoDateTimeSchema,
    periodThrough: consultantSharingIsoDateTimeSchema,
  })
  .strict()
  .superRefine((period, context) => {
    if (Date.parse(period.periodThrough) < Date.parse(period.periodFrom)) {
      context.addIssue({
        code: 'custom',
        path: ['periodThrough'],
        message: 'Settlement periodThrough must not precede periodFrom',
      });
    }
  });

export const consultantSharingListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(CONSULTANT_SHARING_MAX_PAGE_SIZE)
      .default(50),
    from: consultantSharingIsoDateTimeSchema.optional(),
    to: consultantSharingIsoDateTimeSchema.optional(),
    consultantId: consultantSharingObjectIdSchema.optional(),
    departmentId: consultantSharingObjectIdSchema.optional(),
    serviceId: consultantSharingObjectIdSchema.optional(),
    agreementId: consultantSharingObjectIdSchema.optional(),
    settlementId: consultantSharingObjectIdSchema.optional(),
    payerOrganizationId: consultantSharingObjectIdSchema.optional(),
    panelProgramId: consultantSharingObjectIdSchema.optional(),
    packageId: consultantSharingObjectIdSchema.optional(),
    claimId: consultantSharingObjectIdSchema.optional(),
    status: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    sortBy: z.enum(consultantSortFieldValues).default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();


export const consultantSharingIdParamsSchema = z.object({ id: consultantSharingObjectIdSchema }).strict();
export const consultantSharingIdempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().trim().min(16).max(200) }).passthrough();
export const consultantSharingEmptyBodySchema = z.object({}).strict();
export const amendConsultantAgreementSchema = z.object({ expectedVersion: consultantSharingExpectedVersionSchema, effectiveFrom: consultantSharingIsoDateTimeSchema, reason: consultantSharingReasonSchema }).strict();
export const calculateConsultantRevenueSchema = z.object({ sourceFinancialEventId: z.string().trim().min(1).max(200), invoiceLineId: consultantSharingObjectIdSchema, consultantId: consultantSharingObjectIdSchema, runType: z.enum(['INITIAL_RECOGNITION','RECALCULATION','REFUND_RECALCULATION','CLAIM_RECALCULATION','PACKAGE_RECALCULATION','WELFARE_ZAKAT_RECALCULATION','MANUAL_RECOVERY']).optional(), reason: consultantSharingReasonSchema.optional() }).strict();
export const consultantRevenueStatusSchema = z.object({ expectedVersion: consultantSharingExpectedVersionSchema, reason: consultantSharingReasonSchema }).strict();
const financialChangeSchema=z.object({ kind:z.enum(['REFUND','CREDIT_NOTE','DEBIT_NOTE','CLAIM_ADJUSTMENT','PACKAGE_ADJUSTMENT','WELFARE_ZAKAT_ADJUSTMENT','PAYMENT_REVERSAL','INVOICE_CANCELLATION','WRITE_OFF','SERVICE_CANCELLATION','MANUAL_CORRECTION']), sourceModule:z.string().trim().min(1).max(120), sourceRecordId:z.string().trim().min(1).max(200), sourceFinancialEventId:z.string().trim().min(1).max(200), occurredAt:consultantSharingIsoDateTimeSchema, reason:consultantSharingReasonSchema }).strict();
export const requestConsultantAdjustmentSchema=z.object({revenueEntryId:consultantSharingObjectIdSchema,settlementId:consultantSharingObjectIdSchema.nullable().optional(),disputeId:consultantSharingObjectIdSchema.nullable().optional(),eligibleRevenueDelta:consultantSharingSignedMoneySchema,consultantShareDelta:consultantSharingSignedMoneySchema,hospitalShareDelta:consultantSharingSignedMoneySchema,taxWithholdingDelta:consultantSharingSignedMoneySchema.optional(),deductionDelta:consultantSharingSignedMoneySchema.optional(),reasonCode:consultantSharingCodeSchema,reason:consultantSharingReasonSchema,attachmentIds:objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional(),approvalRequestId:consultantSharingObjectIdSchema}).strict();
export const requestConsultantReversalSchema=z.object({revenueEntryId:consultantSharingObjectIdSchema,source:financialChangeSchema,attachmentIds:objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional(),approvalRequestId:consultantSharingObjectIdSchema}).strict();
export const recalculateConsultantRevenueSchema=z.object({source:financialChangeSchema,approvalRequestId:consultantSharingObjectIdSchema,attachmentIds:objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional()}).strict();
export const createConsultantSettlementSchema=z.object({consultantId:consultantSharingObjectIdSchema,periodType:z.enum(consultantSettlementPeriodTypeValues),periodFrom:consultantSharingIsoDateTimeSchema.transform(v=>new Date(v)),periodThrough:consultantSharingIsoDateTimeSchema.transform(v=>new Date(v)),openingBalance:consultantSharingNonNegativeMoneySchema.optional(),broughtForwardBalance:consultantSharingNonNegativeMoneySchema.optional(),adjustmentAmount:consultantSharingSignedMoneySchema.optional(),taxWithholding:consultantSharingNonNegativeMoneySchema.optional(),otherDeductions:consultantSharingNonNegativeMoneySchema.optional(),advanceRecovery:consultantSharingNonNegativeMoneySchema.optional(),overpaymentRecovery:consultantSharingNonNegativeMoneySchema.optional()}).strict();
export const transitionConsultantSettlementSchema = z.object({
  expectedVersion: consultantSharingExpectedVersionSchema,
  toStatus: z.enum([
    'DRAFT',
    'CALCULATED',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PARTIALLY_PAID',
    'PAID',
    'DISPUTED',
    'CANCELLED',
    'REVERSED',
    'CLOSED',
  ]),
  reason: consultantSharingReasonSchema,
  approvalRequestId: consultantSharingObjectIdSchema.nullable().optional(),
}).strict();
export const consultantSettlementTransitionBodySchema =
  transitionConsultantSettlementSchema.omit({ toStatus: true });
export const requestConsultantPayoutSchema=z.object({paymentMethod:z.enum(['BANK','CASH','DIGITAL','CHEQUE','OTHER']),paymentMethodId:consultantSharingObjectIdSchema,amount:consultantSharingPositiveMoneySchema,taxWithholdingAmount:consultantSharingNonNegativeMoneySchema.optional(),advanceRecoveryAmount:consultantSharingNonNegativeMoneySchema.optional(),overpaymentRecoveryAmount:consultantSharingNonNegativeMoneySchema.optional(),otherDeductionAmount:consultantSharingNonNegativeMoneySchema.optional(),paymentReference:z.string().trim().min(3).max(250),payoutProfileReference:z.string().trim().max(250).nullable().optional(),cashShiftId:consultantSharingObjectIdSchema.nullable().optional(),cashCounterId:consultantSharingObjectIdSchema.nullable().optional(),approvalRequestId:consultantSharingObjectIdSchema}).strict();
export const executeConsultantPayoutSchema=z.object({paymentMethodId:consultantSharingObjectIdSchema,paymentReference:z.string().trim().min(3).max(250),cashierShiftId:consultantSharingObjectIdSchema.nullable().optional()}).strict();
export const reverseConsultantPayoutSchema=z.object({expectedSettlementVersion:consultantSharingExpectedVersionSchema,makerUserId:consultantSharingObjectIdSchema,approvalRequestId:consultantSharingObjectIdSchema,reason:consultantSharingReasonSchema}).strict();
export const openConsultantDisputeSchema=z.object({consultantId:consultantSharingObjectIdSchema,settlementId:consultantSharingObjectIdSchema.nullable().optional(),revenueEntryId:consultantSharingObjectIdSchema.nullable().optional(),reasonCode:consultantSharingCodeSchema,reason:consultantSharingReasonSchema,evidence:z.string().trim().max(8000).nullable().optional(),requestedAdjustmentAmount:consultantSharingNonNegativeMoneySchema.optional(),attachmentIds:objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional(),assignedToUserId:consultantSharingObjectIdSchema.nullable().optional(),followUpAt:consultantSharingIsoDateTimeSchema.transform(v=>new Date(v)).nullable().optional(),reviewDeadlineAt:consultantSharingIsoDateTimeSchema.transform(v=>new Date(v)).nullable().optional(),resolutionDeadlineAt:consultantSharingIsoDateTimeSchema.transform(v=>new Date(v)).nullable().optional()}).strict().refine(v=>(v.settlementId==null)!==(v.revenueEntryId==null),{message:'Exactly one dispute target is required'});
export const transitionConsultantDisputeSchema = z.object({
  expectedVersion: consultantSharingExpectedVersionSchema,
  toStatus: z.enum([
    'OPEN',
    'UNDER_REVIEW',
    'INFORMATION_REQUESTED',
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'RESOLVED',
    'CANCELLED',
  ]),
  reason: consultantSharingReasonSchema,
  approvedAdjustmentAmount: consultantSharingNonNegativeMoneySchema.optional(),
  approvalRequestId: consultantSharingObjectIdSchema.nullable().optional(),
  adjustmentApprovalRequestId:
    consultantSharingObjectIdSchema.nullable().optional(),
  attachmentIds: objectIdArray(CONSULTANT_SHARING_MAX_ATTACHMENTS).optional(),
}).strict();
export const consultantDisputeTransitionBodySchema =
  transitionConsultantDisputeSchema.omit({ toStatus: true });
const workTarget=z.object({agreementId:consultantSharingObjectIdSchema.nullable().optional(),agreementRuleId:consultantSharingObjectIdSchema.nullable().optional(),revenueEntryId:consultantSharingObjectIdSchema.nullable().optional(),adjustmentId:consultantSharingObjectIdSchema.nullable().optional(),reversalId:consultantSharingObjectIdSchema.nullable().optional(),settlementId:consultantSharingObjectIdSchema.nullable().optional(),settlementPaymentId:consultantSharingObjectIdSchema.nullable().optional(),disputeId:consultantSharingObjectIdSchema.nullable().optional()}).strict().refine(v=>Object.values(v).filter(Boolean).length===1,{message:'Exactly one work-item target is required'});
export const createConsultantWorkItemSchema=z.object({target:workTarget,workQueueType:consultantSharingCodeSchema,assignedToUserId:consultantSharingObjectIdSchema.nullable().optional(),priority:z.number().int().min(0).max(100000).optional(),followUpAt:consultantSharingIsoDateTimeSchema.nullable().optional(),deadlineAt:consultantSharingIsoDateTimeSchema.nullable().optional(),reason:consultantSharingReasonSchema}).strict();
export const assignConsultantWorkItemSchema=z.object({expectedVersion:consultantSharingExpectedVersionSchema,assignedToUserId:consultantSharingObjectIdSchema,followUpAt:consultantSharingIsoDateTimeSchema.nullable()}).strict();
export const escalateConsultantWorkItemSchema=z.object({expectedVersion:consultantSharingExpectedVersionSchema,escalatedToUserId:consultantSharingObjectIdSchema,reason:consultantSharingReasonSchema}).strict();
export const consultantReconciliationSchema=z.object({from:consultantSharingIsoDateTimeSchema,through:consultantSharingIsoDateTimeSchema}).strict().refine(v=>Date.parse(v.through)>=Date.parse(v.from),{path:['through'],message:'through must not precede from'});

export const consultantSharingReportParamsSchema = z.object({
  report: z.enum(CONSULTANT_SHARING_REPORT_NAMES),
}).strict();

const consultantSharingReportArray = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  maximumItems: number,
) => z.preprocess(
  (value) => typeof value === 'string' ? [value] : value,
  z.array(schema).max(maximumItems),
);

export const consultantSharingReportQuerySchema = consultantSharingListQuerySchema
  .extend({
    status: consultantSharingReportArray(
      z.string().trim().min(1).max(100),
      50,
    ).optional(),
    expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    agingBucket: consultantSharingReportArray(
      z.enum(['0-30', '31-60', '61-90', '90+']),
      4,
    ).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.from !== undefined
      && value.to !== undefined
      && Date.parse(value.to) < Date.parse(value.from)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must not precede from',
      });
    }
  });

export const consultantSharingRecoveryRunSchema = z.object({
  asOf: consultantSharingIsoDateTimeSchema.optional(),
  limit: z.number().int().min(1).max(1_000).optional(),
  facilityId: consultantSharingObjectIdSchema.optional(),
  includeAgreementExpiry: z.boolean().optional(),
  includeCalculationRecovery: z.boolean().optional(),
  includeSettlementReconciliation: z.boolean().optional(),
  includeLedgerReconciliation: z.boolean().optional(),
}).strict();