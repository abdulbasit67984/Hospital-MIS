import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  coverageLimitPeriodValues,
  coveragePriorityValues,
  coverageRuleEffectValues,
  packagePricingModeValues,
  packageStatusValues,
  packageTypeValues,
  panelStatusValues,
  panelTypeValues,
  payerOrganizationTypeValues,
  MAX_COORDINATED_COVERAGES,
  MAX_COVERAGE_RULES,
  MAX_PACKAGE_ITEMS,
  MAX_PANEL_ITEMS,
} from './panels-packages-coverage.constants.js';

export const ppcObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/iu, 'Expected a valid MongoDB ObjectId');

export const ppcExpectedVersionSchema = z.number().int().min(0);

export const ppcIsoDateTimeSchema = z.string().datetime({
  offset: true,
});

export const ppcReasonSchema = z.string().trim().min(5).max(2_000);

export const ppcCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(120)
  .regex(
    /^[A-Z0-9][A-Z0-9._/-]*$/u,
    'Code contains unsupported characters',
  );

const decimalSyntax = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function decimalString(
  minimum: Decimal | null,
  maximum: Decimal | null,
) {
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

      if (minimum !== null && amount.lessThan(minimum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must be at least ${minimum.toString()}`,
        });
      }

      if (maximum !== null && amount.greaterThan(maximum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must not exceed ${maximum.toString()}`,
        });
      }
    })
    .transform((value) => new Decimal(value).toFixed());
}

export const ppcNonNegativeDecimalSchema = decimalString(
  new Decimal(0),
  null,
);

export const ppcPositiveDecimalSchema = ppcNonNegativeDecimalSchema.refine(
  (value) => new Decimal(value).greaterThan(0),
  'Decimal value must be greater than zero',
);

export const ppcPercentageSchema = decimalString(
  new Decimal(0),
  new Decimal(100),
);

const effectivePeriodSchema = z
  .object({
    effectiveFrom: ppcIsoDateTimeSchema,
    effectiveThrough: ppcIsoDateTimeSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.effectiveThrough !== null &&
      new Date(value.effectiveThrough) <= new Date(value.effectiveFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveThrough'],
        message: 'effectiveThrough must be later than effectiveFrom',
      });
    }
  });

export const createPanelSchema = effectivePeriodSchema.extend({
  code: ppcCodeSchema,
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4_000).nullable().optional(),
  panelType: z.enum(panelTypeValues),
  fixedPrice: ppcNonNegativeDecimalSchema.nullable().optional(),
  changeReason: ppcReasonSchema,
  items: z
    .array(
      z.object({
        chargeCatalogItemId: ppcObjectIdSchema,
        quantity: ppcPositiveDecimalSchema,
        required: z.boolean(),
        displayOrder: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(MAX_PANEL_ITEMS),
});

export const changePanelStatusSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  status: z.enum(panelStatusValues),
  reason: ppcReasonSchema,
});

const packageEligibilitySchema = z
  .object({
    patientCategoryCodes: z.array(ppcCodeSchema).max(100).optional(),
    minimumAgeYears: z.number().int().min(0).max(150).nullable().optional(),
    maximumAgeYears: z.number().int().min(0).max(150).nullable().optional(),
    genderCodes: z.array(ppcCodeSchema).max(20).optional(),
    admissionRequired: z.boolean().optional(),
    departmentIds: z.array(ppcObjectIdSchema).max(100).optional(),
    payerOrganizationIds: z.array(ppcObjectIdSchema).max(100).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.minimumAgeYears != null &&
      value.maximumAgeYears != null &&
      value.maximumAgeYears < value.minimumAgeYears
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumAgeYears'],
        message: 'maximumAgeYears cannot be less than minimumAgeYears',
      });
    }
  });

export const createTreatmentPackageSchema = effectivePeriodSchema
  .extend({
    code: ppcCodeSchema,
    name: z.string().trim().min(2).max(240),
    description: z.string().trim().max(4_000).nullable().optional(),
    packageType: z.enum(packageTypeValues),
    pricingMode: z.enum(packagePricingModeValues),
    fixedPrice: ppcNonNegativeDecimalSchema.nullable(),
    discountPercentage: ppcPercentageSchema.nullable(),
    usageLimit: ppcPositiveDecimalSchema.nullable(),
    eligibility: packageEligibilitySchema,
    changeReason: ppcReasonSchema,
    items: z
      .array(
        z.object({
          chargeCatalogItemId: ppcObjectIdSchema,
          included: z.boolean(),
          quantityLimit: ppcPositiveDecimalSchema.nullable(),
          amountLimit: ppcNonNegativeDecimalSchema.nullable(),
          discountPercentage: ppcPercentageSchema.nullable(),
          requiresAuthorization: z.boolean(),
          displayOrder: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(MAX_PACKAGE_ITEMS),
  })
  .superRefine((value, context) => {
    if (value.pricingMode === 'FIXED_PRICE' && value.fixedPrice === null) {
      context.addIssue({
        code: 'custom',
        path: ['fixedPrice'],
        message: 'fixedPrice is required for FIXED_PRICE packages',
      });
    }

    if (
      value.pricingMode === 'DISCOUNTED' &&
      value.discountPercentage === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['discountPercentage'],
        message: 'discountPercentage is required for DISCOUNTED packages',
      });
    }
  });

export const changePackageStatusSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  status: z.enum(packageStatusValues),
  reason: ppcReasonSchema,
});

export const enrollPatientPackageSchema = z.object({
  patientId: ppcObjectIdSchema,
  packageId: ppcObjectIdSchema,
  accountId: ppcObjectIdSchema.nullable(),
  invoiceId: ppcObjectIdSchema.nullable(),
  startsAt: ppcIsoDateTimeSchema,
  expiresAt: ppcIsoDateTimeSchema.nullable(),
  enrollmentPrice: ppcNonNegativeDecimalSchema,
  authorizationReference: z.string().trim().max(240).nullable().optional(),
  reason: ppcReasonSchema,
});

export const reservePackageUtilizationSchema = z.object({
  enrollmentId: ppcObjectIdSchema,
  invoiceId: ppcObjectIdSchema,
  invoiceLineId: ppcObjectIdSchema,
  chargeCatalogItemId: ppcObjectIdSchema,
  quantity: ppcPositiveDecimalSchema,
  grossAmount: ppcNonNegativeDecimalSchema,
  idempotencyKey: z.string().trim().min(8).max(240),
});

export const createPayerOrganizationSchema = z.object({
  code: ppcCodeSchema,
  name: z.string().trim().min(2).max(240),
  organizationType: z.enum(payerOrganizationTypeValues),
  registrationReference: z.string().trim().max(240).nullable().optional(),
  contactEmail: z.string().email().max(320).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
});

export const createCoveragePlanSchema = effectivePeriodSchema.extend({
  payerOrganizationId: ppcObjectIdSchema,
  code: ppcCodeSchema,
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4_000).nullable().optional(),
  terms: z.object({
    deductibleAmount: ppcNonNegativeDecimalSchema,
    copaymentAmount: ppcNonNegativeDecimalSchema,
    coinsurancePercentage: ppcPercentageSchema,
    coveragePercentage: ppcPercentageSchema,
    annualLimit: ppcNonNegativeDecimalSchema.nullable(),
    lifetimeLimit: ppcNonNegativeDecimalSchema.nullable(),
  }),
  changeReason: ppcReasonSchema,
  rules: z
    .array(
      z.object({
        code: ppcCodeSchema,
        effect: z.enum(coverageRuleEffectValues),
        chargeCatalogItemId: ppcObjectIdSchema.nullable(),
        chargeCategoryId: ppcObjectIdSchema.nullable(),
        departmentId: ppcObjectIdSchema.nullable(),
        limitPeriod: z.enum(coverageLimitPeriodValues).nullable(),
        limitQuantity: ppcPositiveDecimalSchema.nullable(),
        limitAmount: ppcNonNegativeDecimalSchema.nullable(),
        waitingPeriodDays: z.number().int().min(0).max(36_500),
        networkCode: ppcCodeSchema.nullable(),
        preauthorizationRequired: z.boolean(),
        priority: z.number().int().min(0),
      }),
    )
    .max(MAX_COVERAGE_RULES),
});

export const enrollPatientCoverageSchema = z.object({
  patientId: ppcObjectIdSchema,
  coveragePlanId: ppcObjectIdSchema,
  priority: z.enum(coveragePriorityValues),
  policyReference: z.string().trim().max(240).nullable(),
  membershipReference: z.string().trim().max(240).nullable(),
  authorizationReference: z.string().trim().max(240).nullable(),
  eligibleFrom: ppcIsoDateTimeSchema,
  eligibleThrough: ppcIsoDateTimeSchema.nullable(),
  employerReference: z.string().trim().max(240).nullable(),
  reason: ppcReasonSchema,
});

export const estimateCoverageSchema = z.object({
  patientId: ppcObjectIdSchema,
  invoiceId: ppcObjectIdSchema,
  coverageIds: z
    .array(ppcObjectIdSchema)
    .min(1)
    .max(MAX_COORDINATED_COVERAGES),
  asOf: ppcIsoDateTimeSchema,
  charges: z
    .array(
      z.object({
        invoiceLineId: ppcObjectIdSchema,
        chargeCatalogItemId: ppcObjectIdSchema,
        serviceDate: ppcIsoDateTimeSchema,
        quantity: ppcPositiveDecimalSchema,
        grossAmount: ppcNonNegativeDecimalSchema,
        packageAllocationAmount: ppcNonNegativeDecimalSchema,
      }),
    )
    .min(1)
    .max(1_000),
});