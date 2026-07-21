import Decimal from 'decimal.js';

import {
  z,
} from 'zod';

import {
  approvalTypeValues,
  billingContextValues,
  chargeCatalogStatusValues,
  chargeCategoryStatusValues,
  chargeSourceModuleValues,
  chargeStatusValues,
  chargeTypeValues,
  discountScopeValues,
  discountTypeValues,
  invoiceStatusValues,
  invoiceTypeValues,
  patientAccountStatusValues,
  patientAccountTypeValues,
  paymentMethodValues,
  priceListStatusValues,
  priceListTypeValues,
  rateStatusValues,
  responsiblePartyTypeValues,
  roundingModeValues,
  taxCalculationModeValues,
} from '@hospital-mis/database';

import {
  DEFAULT_UNIFIED_BILLING_PAGE_SIZE,
  MAX_BILLING_BATCH_LINES,
  MAX_BILLING_PAYER_SNAPSHOTS,
  MAX_UNIFIED_BILLING_PAGE_SIZE,
  UNIFIED_BILLING_ACCOUNT_SORT_FIELDS,
  UNIFIED_BILLING_CATALOG_SORT_FIELDS,
  UNIFIED_BILLING_CHARGE_SORT_FIELDS,
  UNIFIED_BILLING_INVOICE_SORT_FIELDS,
} from './unified-billing.constants.js';

export const unifiedBillingObjectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

export const unifiedBillingExpectedVersionSchema =
  z
    .number()
    .int()
    .min(0);

export const unifiedBillingReasonSchema =
  z
    .string()
    .trim()
    .min(5)
    .max(2_000);

export const unifiedBillingIsoDateTimeSchema =
  z
    .string()
    .datetime({
      offset: true,
    });

export const unifiedBillingCodeSchema =
  z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(120)
    .regex(
      /^[A-Z0-9][A-Z0-9._/-]*$/u,
      'Code contains unsupported characters',
    );

export const unifiedBillingIdempotencyKeySchema =
  z
    .string()
    .trim()
    .min(8)
    .max(240)
    .regex(
      /^[A-Za-z0-9._:/-]+$/u,
      'Idempotency key contains unsupported characters',
    );

const decimalSyntax =
  /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function decimalString(
  minimum: Decimal | null,
  maximum: Decimal | null,
) {
  return z
    .string()
    .trim()
    .min(1)
    .max(96)
    .regex(
      decimalSyntax,
      'Expected a base-10 decimal value',
    )
    .superRefine((value, context) => {
      let decimal: Decimal;

      try {
        decimal = new Decimal(value);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Expected a valid decimal value',
        });
        return;
      }

      if (!decimal.isFinite()) {
        context.addIssue({
          code: 'custom',
          message: 'Decimal value must be finite',
        });
      }

      if (minimum !== null && decimal.lessThan(minimum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must be at least ${minimum.toString()}`,
        });
      }

      if (maximum !== null && decimal.greaterThan(maximum)) {
        context.addIssue({
          code: 'custom',
          message: `Decimal value must not exceed ${maximum.toString()}`,
        });
      }
    })
    .transform((value) => new Decimal(value).toFixed());
}

export const unifiedBillingNonNegativeDecimalSchema =
  decimalString(new Decimal(0), null);

export const unifiedBillingPositiveDecimalSchema =
  decimalString(new Decimal(0), null)
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      'Decimal value must be greater than zero',
    );

export const unifiedBillingPercentageSchema =
  decimalString(new Decimal(0), new Decimal(100));

const nullableText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .nullable()
    .optional();

const optionalText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(minimumLength)
    .max(maximumLength)
    .optional();

const queryBooleanSchema =
  z.preprocess(
    (value) => {
      if (
        value === true ||
        value === 'true' ||
        value === '1'
      ) {
        return true;
      }

      if (
        value === false ||
        value === 'false' ||
        value === '0'
      ) {
        return false;
      }

      return value;
    },
    z.boolean(),
  );

const pageSchema =
  z.coerce
    .number()
    .int()
    .min(1);

const pageSizeSchema =
  z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_UNIFIED_BILLING_PAGE_SIZE);

const stringArrayQuery = <T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }

      return value;
    },
    z.array(z.enum(values)).max(100),
  );

function validateDateWindow(
  effectiveFrom: string,
  effectiveThrough: string | null | undefined,
  context: z.RefinementCtx,
  throughPath: readonly PropertyKey[],
): void {
  if (
    effectiveThrough !== undefined &&
    effectiveThrough !== null &&
    Date.parse(effectiveThrough) <= Date.parse(effectiveFrom)
  ) {
    context.addIssue({
      code: 'custom',
      path: [...throughPath],
      message: 'End date must be later than start date',
    });
  }
}

function validateOptionalDecimalRange(
  minimum: string | null | undefined,
  maximum: string | null | undefined,
  context: z.RefinementCtx,
  maximumPath: readonly PropertyKey[],
): void {
  if (
    minimum !== undefined &&
    minimum !== null &&
    maximum !== undefined &&
    maximum !== null &&
    new Decimal(maximum).lessThan(new Decimal(minimum))
  ) {
    context.addIssue({
      code: 'custom',
      path: [...maximumPath],
      message: 'Maximum must be greater than or equal to minimum',
    });
  }
}

export const unifiedBillingMutationHeadersSchema =
  z
    .object({
      'idempotency-key': unifiedBillingIdempotencyKeySchema,
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const unifiedBillingReadHeadersSchema =
  z
    .object({
      'x-break-glass-reason':
        z
          .string()
          .trim()
          .min(10)
          .max(1_000)
          .optional(),
    })
    .strict();

export const unifiedBillingIdParamsSchema =
  z
    .object({
      id: unifiedBillingObjectIdSchema,
    })
    .strict();

export const createChargeCategoryBodySchema =
  z
    .object({
      code: unifiedBillingCodeSchema,
      parentCategoryId: unifiedBillingObjectIdSchema.nullable().optional(),
      name: z.string().trim().min(2).max(300),
      description: nullableText(1, 4_000),
      clinical: z.boolean().default(false),
      departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      serviceLineCode: unifiedBillingCodeSchema.nullable().optional(),
      revenueAccountCode: unifiedBillingCodeSchema.nullable().optional(),
    })
    .strict();

export const updateChargeCategoryBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      parentCategoryId: unifiedBillingObjectIdSchema.nullable().optional(),
      name: optionalText(2, 300),
      description: nullableText(1, 4_000),
      clinical: z.boolean().optional(),
      departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      serviceLineCode: unifiedBillingCodeSchema.nullable().optional(),
      revenueAccountCode: unifiedBillingCodeSchema.nullable().optional(),
    })
    .strict()
    .refine(
      (value) =>
        Object.keys(value).some(
          (key) => key !== 'expectedVersion',
        ),
      {
        message: 'At least one category field must be supplied',
      },
    );

export const changeChargeCategoryStatusBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      status: z.enum(chargeCategoryStatusValues),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

const chargeCatalogFields = {
  chargeCode: unifiedBillingCodeSchema,
  serviceCode: unifiedBillingCodeSchema,
  name: z.string().trim().min(2).max(300),
  description: nullableText(1, 4_000),
  categoryId: unifiedBillingObjectIdSchema,
  chargeType: z.enum(chargeTypeValues),
  clinical: z.boolean().default(false),
  departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
  serviceLineCode: unifiedBillingCodeSchema.nullable().optional(),
  revenueAccountCode: unifiedBillingCodeSchema.nullable().optional(),
  ledgerAccountId: unifiedBillingObjectIdSchema.nullable().optional(),
  taxCategoryId: unifiedBillingObjectIdSchema.nullable().optional(),
  unitOfMeasureId: unifiedBillingObjectIdSchema.nullable().optional(),
  defaultQuantity: unifiedBillingPositiveDecimalSchema.default('1'),
  minimumQuantity: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
  maximumQuantity: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
  minimumPrice: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
  maximumPrice: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
  costAmount: unifiedBillingNonNegativeDecimalSchema.default('0'),
  manualPostingAllowed: z.boolean().default(false),
  recurringChargeAllowed: z.boolean().default(false),
  timeBasedCharge: z.boolean().default(false),
  effectiveFrom: unifiedBillingIsoDateTimeSchema,
  effectiveThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
} as const;

function validateCatalogFields(
  value: {
    minimumQuantity?: string | null;
    maximumQuantity?: string | null;
    minimumPrice?: string | null;
    maximumPrice?: string | null;
    effectiveFrom: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  validateOptionalDecimalRange(
    value.minimumQuantity,
    value.maximumQuantity,
    context,
    ['maximumQuantity'],
  );
  validateOptionalDecimalRange(
    value.minimumPrice,
    value.maximumPrice,
    context,
    ['maximumPrice'],
  );
  validateDateWindow(
    value.effectiveFrom,
    value.effectiveThrough,
    context,
    ['effectiveThrough'],
  );
}

export const createChargeCatalogItemBodySchema =
  z
    .object(chargeCatalogFields)
    .strict()
    .superRefine(validateCatalogFields);

export const activateChargeCatalogVersionBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      ...chargeCatalogFields,
      changeReason: unifiedBillingReasonSchema,
    })
    .strict()
    .superRefine(validateCatalogFields);

export const changeChargeCatalogStatusBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      status: z.enum(chargeCatalogStatusValues),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const createTaxCategoryBodySchema =
  z
    .object({
      code: unifiedBillingCodeSchema,
      name: z.string().trim().min(2).max(300),
      calculationMode: z.enum(taxCalculationModeValues),
      ratePercentage: unifiedBillingPercentageSchema.default('0'),
      roundingMode: z.enum(roundingModeValues).default('HALF_UP'),
      roundingScale: z.number().int().min(0).max(6).default(2),
      exemptionReasonRequired: z.boolean().default(false),
      effectiveFrom: unifiedBillingIsoDateTimeSchema,
      effectiveThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
    })
    .strict()
    .superRefine((value, context) => {
      validateDateWindow(
        value.effectiveFrom,
        value.effectiveThrough,
        context,
        ['effectiveThrough'],
      );

      if (
        value.calculationMode === 'EXEMPT' &&
        !new Decimal(value.ratePercentage).isZero()
      ) {
        context.addIssue({
          code: 'custom',
          path: ['ratePercentage'],
          message: 'Exempt tax categories require a zero tax rate',
        });
      }
    });

const priceListFields = {
  code: unifiedBillingCodeSchema,
  name: z.string().trim().min(2).max(300),
  description: nullableText(1, 4_000),
  priceListType: z.enum(priceListTypeValues),
  patientCategoryCode: unifiedBillingCodeSchema.nullable().optional(),
  payerCategoryCode: unifiedBillingCodeSchema.nullable().optional(),
  payerOrganizationId: unifiedBillingObjectIdSchema.nullable().optional(),
  panelPlanId: unifiedBillingObjectIdSchema.nullable().optional(),
  departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
  locationId: unifiedBillingObjectIdSchema.nullable().optional(),
  billingContext: z.enum(billingContextValues).nullable().optional(),
  afterHoursOnly: z.boolean().default(false),
  effectiveFrom: unifiedBillingIsoDateTimeSchema,
  effectiveThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
  priority: z.number().int().min(0).max(100_000).default(100),
} as const;

function validatePriceListFields(
  value: {
    priceListType: string;
    payerOrganizationId?: string | null;
    panelPlanId?: string | null;
    effectiveFrom: string;
    effectiveThrough?: string | null;
  },
  context: z.RefinementCtx,
): void {
  validateDateWindow(
    value.effectiveFrom,
    value.effectiveThrough,
    context,
    ['effectiveThrough'],
  );

  if (
    ['PAYER', 'CORPORATE', 'GOVERNMENT'].includes(value.priceListType) &&
    value.payerOrganizationId == null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['payerOrganizationId'],
      message: 'Payer-linked price lists require a payer organization',
    });
  }

  if (
    value.panelPlanId != null &&
    value.payerOrganizationId == null
  ) {
    context.addIssue({
      code: 'custom',
      path: ['panelPlanId'],
      message: 'A panel plan requires a payer organization',
    });
  }
}

export const createPriceListBodySchema =
  z
    .object(priceListFields)
    .strict()
    .superRefine(validatePriceListFields);

export const activatePriceListVersionBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      ...priceListFields,
      changeReason: unifiedBillingReasonSchema,
    })
    .strict()
    .superRefine(validatePriceListFields);

export const changePriceListStatusBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      status: z.enum(priceListStatusValues),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const upsertServiceRateBodySchema =
  z
    .object({
      rateCode: unifiedBillingCodeSchema,
      chargeCatalogItemId: unifiedBillingObjectIdSchema,
      priceListId: unifiedBillingObjectIdSchema,
      amount: unifiedBillingNonNegativeDecimalSchema,
      minimumAmount: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
      maximumAmount: unifiedBillingNonNegativeDecimalSchema.nullable().optional(),
      taxCategoryId: unifiedBillingObjectIdSchema.nullable().optional(),
      billingContext: z.enum(billingContextValues).nullable().optional(),
      patientCategoryCode: unifiedBillingCodeSchema.nullable().optional(),
      payerCategoryCode: unifiedBillingCodeSchema.nullable().optional(),
      departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      locationId: unifiedBillingObjectIdSchema.nullable().optional(),
      afterHoursOnly: z.boolean().default(false),
      effectiveFrom: unifiedBillingIsoDateTimeSchema,
      effectiveThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
      status: z.enum(rateStatusValues).default('ACTIVE'),
      expectedVersion: unifiedBillingExpectedVersionSchema.optional(),
      changeReason: unifiedBillingReasonSchema,
    })
    .strict()
    .superRefine((value, context) => {
      validateOptionalDecimalRange(
        value.minimumAmount,
        value.maximumAmount,
        context,
        ['maximumAmount'],
      );
      validateDateWindow(
        value.effectiveFrom,
        value.effectiveThrough,
        context,
        ['effectiveThrough'],
      );

      if (
        value.minimumAmount != null &&
        new Decimal(value.amount).lessThan(value.minimumAmount)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Rate amount cannot be lower than the configured minimum',
        });
      }

      if (
        value.maximumAmount != null &&
        new Decimal(value.amount).greaterThan(value.maximumAmount)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Rate amount cannot exceed the configured maximum',
        });
      }
    });

const treatmentPackageItemSchema =
  z
    .object({
      chargeCatalogItemId: unifiedBillingObjectIdSchema,
      includedQuantity: unifiedBillingPositiveDecimalSchema,
      overageAllowed: z.boolean().default(true),
      overagePriceListId: unifiedBillingObjectIdSchema.nullable().optional(),
      sequence: z.number().int().min(1).max(10_000),
    })
    .strict();

export const createTreatmentPackageBodySchema =
  z
    .object({
      packageCode: unifiedBillingCodeSchema,
      name: z.string().trim().min(2).max(300),
      description: nullableText(1, 4_000),
      billingContext: z.enum(billingContextValues).nullable().optional(),
      priceListId: unifiedBillingObjectIdSchema,
      fixedPrice: unifiedBillingNonNegativeDecimalSchema,
      validityDays: z.number().int().min(1).max(3_650),
      admissionPackage: z.boolean().default(false),
      procedurePackage: z.boolean().default(false),
      maternityPackage: z.boolean().default(false),
      surgicalPackage: z.boolean().default(false),
      effectiveFrom: unifiedBillingIsoDateTimeSchema,
      effectiveThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
      items: z.array(treatmentPackageItemSchema).min(1).max(500),
    })
    .strict()
    .superRefine((value, context) => {
      validateDateWindow(
        value.effectiveFrom,
        value.effectiveThrough,
        context,
        ['effectiveThrough'],
      );

      const chargeIds = value.items.map(
        (item) => item.chargeCatalogItemId,
      );
      if (new Set(chargeIds).size !== chargeIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'A charge catalog item may appear only once in a package',
        });
      }

      const sequences = value.items.map((item) => item.sequence);
      if (new Set(sequences).size !== sequences.length) {
        context.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'Package item sequences must be unique',
        });
      }
    });

export const createPatientAccountBodySchema =
  z
    .object({
      sourceModule: z.enum(chargeSourceModuleValues),
      sourceRecordId: unifiedBillingObjectIdSchema,
      sourceLineId: unifiedBillingObjectIdSchema.nullable().optional(),
      accountType: z.enum(patientAccountTypeValues).optional(),
      responsiblePartyType: z.enum(responsiblePartyTypeValues).default('PATIENT'),
      guarantorId: unifiedBillingObjectIdSchema.nullable().optional(),
      payerCoverageIds: z
        .array(unifiedBillingObjectIdSchema)
        .max(MAX_BILLING_PAYER_SNAPSHOTS)
        .default([]),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.responsiblePartyType === 'GUARANTOR' &&
        value.guarantorId == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['guarantorId'],
          message: 'Guarantor-responsible accounts require a guarantor',
        });
      }

      if (
        new Set(value.payerCoverageIds).size !==
        value.payerCoverageIds.length
      ) {
        context.addIssue({
          code: 'custom',
          path: ['payerCoverageIds'],
          message: 'Payer coverage identifiers must be unique',
        });
      }
    });

export const changePatientAccountStatusBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      status: z.enum(patientAccountStatusValues),
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict();

export const postSourceChargeBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema.nullable().optional(),
      sourceModule: z.enum(chargeSourceModuleValues),
      sourceRecordId: unifiedBillingObjectIdSchema,
      sourceLineId: unifiedBillingObjectIdSchema.nullable().optional(),
      chargeCode: unifiedBillingCodeSchema,
      quantity: unifiedBillingPositiveDecimalSchema.optional(),
      serviceFrom: unifiedBillingIsoDateTimeSchema.optional(),
      serviceThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
      packageEnrollmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      payerCoverageId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.serviceFrom !== undefined
      ) {
        validateDateWindow(
          value.serviceFrom,
          value.serviceThrough,
          context,
          ['serviceThrough'],
        );
      } else if (value.serviceThrough != null) {
        context.addIssue({
          code: 'custom',
          path: ['serviceThrough'],
          message: 'serviceThrough requires serviceFrom',
        });
      }
    });

export const postManualChargeBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      chargeCode: unifiedBillingCodeSchema,
      quantity: unifiedBillingPositiveDecimalSchema.optional(),
      serviceFrom: unifiedBillingIsoDateTimeSchema,
      serviceThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
      departmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      locationId: unifiedBillingObjectIdSchema.nullable().optional(),
      reason: unifiedBillingReasonSchema,
    })
    .strict()
    .superRefine((value, context) => {
      validateDateWindow(
        value.serviceFrom,
        value.serviceThrough,
        context,
        ['serviceThrough'],
      );
    });

const postChargeBatchItemSchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema.nullable().optional(),
      sourceModule: z.enum(chargeSourceModuleValues),
      sourceRecordId: unifiedBillingObjectIdSchema,
      sourceLineId: unifiedBillingObjectIdSchema.nullable().optional(),
      chargeCode: unifiedBillingCodeSchema,
      quantity: unifiedBillingPositiveDecimalSchema.optional(),
      serviceFrom: unifiedBillingIsoDateTimeSchema.optional(),
      serviceThrough: unifiedBillingIsoDateTimeSchema.nullable().optional(),
      packageEnrollmentId: unifiedBillingObjectIdSchema.nullable().optional(),
      payerCoverageId: unifiedBillingObjectIdSchema.nullable().optional(),
      operationKey: unifiedBillingIdempotencyKeySchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.serviceFrom !== undefined) {
        validateDateWindow(
          value.serviceFrom,
          value.serviceThrough,
          context,
          ['serviceThrough'],
        );
      } else if (value.serviceThrough != null) {
        context.addIssue({
          code: 'custom',
          path: ['serviceThrough'],
          message: 'serviceThrough requires serviceFrom',
        });
      }
    });

export const postChargeBatchBodySchema =
  z
    .object({
      items: z
        .array(postChargeBatchItemSchema)
        .min(1)
        .max(MAX_BILLING_BATCH_LINES),
    })
    .strict()
    .refine(
      (value) =>
        new Set(
          value.items.map((item) => item.operationKey),
        ).size === value.items.length,
      {
        path: ['items'],
        message: 'Charge operation keys must be unique',
      },
    );

export const priceOverrideBodySchema =
  z
    .object({
      requestedUnitPrice: unifiedBillingNonNegativeDecimalSchema,
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict();

export const cancelChargeBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const reverseChargeBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      quantity: unifiedBillingPositiveDecimalSchema.optional(),
      amount: unifiedBillingPositiveDecimalSchema.optional(),
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.quantity !== undefined ||
        value.amount !== undefined,
      {
        message: 'A reversal requires quantity or amount',
      },
    );

export const adjustChargeBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      replacementQuantity: unifiedBillingPositiveDecimalSchema.optional(),
      replacementChargeCode: unifiedBillingCodeSchema.optional(),
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.replacementQuantity !== undefined ||
        value.replacementChargeCode !== undefined,
      {
        message: 'An adjustment requires replacement quantity or charge code',
      },
    );

export const transferChargeBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      targetPatientAccountId: unifiedBillingObjectIdSchema,
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict();

export const requestFinancialApprovalBodySchema =
  z
    .object({
      approvalType: z.enum(approvalTypeValues),
      patientAccountId: unifiedBillingObjectIdSchema.nullable().optional(),
      accountChargeId: unifiedBillingObjectIdSchema.nullable().optional(),
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      paymentId: unifiedBillingObjectIdSchema.nullable().optional(),
      requestedAmount: unifiedBillingPositiveDecimalSchema.nullable().optional(),
      requestedPercentage: unifiedBillingPercentageSchema.nullable().optional(),
      reason: unifiedBillingReasonSchema,
      expiresAt: unifiedBillingIsoDateTimeSchema.nullable().optional(),
    })
    .strict()
    .superRefine((value, context) => {
      const targets = [
        value.patientAccountId,
        value.accountChargeId,
        value.invoiceId,
        value.paymentId,
      ].filter((item) => item != null);

      if (targets.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['approvalType'],
          message: 'An approval request requires a financial target',
        });
      }

      if (
        value.requestedAmount == null &&
        value.requestedPercentage == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['requestedAmount'],
          message: 'An approval request requires an amount or percentage',
        });
      }
    });

export const decideFinancialApprovalBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      decision: z.enum(['APPROVE', 'REJECT']),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const createInvoiceBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      invoiceType: z.enum(invoiceTypeValues),
      chargeIds: z.array(unifiedBillingObjectIdSchema).min(1).max(500).optional(),
      invoiceDate: unifiedBillingIsoDateTimeSchema.optional(),
      dueDate: unifiedBillingIsoDateTimeSchema.nullable().optional(),
    })
    .strict()
    .refine(
      (value) =>
        value.chargeIds === undefined ||
        new Set(value.chargeIds).size === value.chargeIds.length,
      {
        path: ['chargeIds'],
        message: 'Invoice charge identifiers must be unique',
      },
    );

export const finalizeInvoiceBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const correctInvoiceBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      reason: unifiedBillingReasonSchema,
      replacementInvoiceType: z.enum(invoiceTypeValues).optional(),
    })
    .strict();

export const createDiscountBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      invoiceLineId: unifiedBillingObjectIdSchema.nullable().optional(),
      accountChargeId: unifiedBillingObjectIdSchema.nullable().optional(),
      discountType: z.enum(discountTypeValues),
      scope: z.enum(discountScopeValues),
      requestedValue: unifiedBillingPositiveDecimalSchema,
      reason: unifiedBillingReasonSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.discountType === 'PERCENTAGE' &&
        new Decimal(value.requestedValue).greaterThan(100)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['requestedValue'],
          message: 'Percentage discounts cannot exceed 100',
        });
      }

      if (
        value.scope === 'LINE' &&
        value.invoiceLineId == null &&
        value.accountChargeId == null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['scope'],
          message: 'Line discounts require an invoice line or account charge',
        });
      }
    });

export const createFinancialNoteBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      accountChargeIds: z.array(unifiedBillingObjectIdSchema).min(1).max(500),
      amount: unifiedBillingPositiveDecimalSchema,
      reason: unifiedBillingReasonSchema,
      approvalRequestId: unifiedBillingObjectIdSchema.nullable().optional(),
    })
    .strict()
    .refine(
      (value) =>
        new Set(value.accountChargeIds).size ===
        value.accountChargeIds.length,
      {
        path: ['accountChargeIds'],
        message: 'Financial note charge identifiers must be unique',
      },
    );

export const createPaymentIntentBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      amount: unifiedBillingPositiveDecimalSchema,
      paymentMethod: z.enum(paymentMethodValues),
      externalReference: nullableText(1, 300),
      expiresAt: unifiedBillingIsoDateTimeSchema.nullable().optional(),
    })
    .strict();

export const receivePaymentBodySchema =
  z
    .object({
      patientAccountId: unifiedBillingObjectIdSchema,
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      paymentIntentId: unifiedBillingObjectIdSchema.nullable().optional(),
      amount: unifiedBillingPositiveDecimalSchema,
      paymentMethod: z.enum(paymentMethodValues),
      externalReference: nullableText(1, 300),
      cashierStaffId: unifiedBillingObjectIdSchema.nullable().optional(),
      cashShiftId: unifiedBillingObjectIdSchema.nullable().optional(),
      counterId: unifiedBillingObjectIdSchema.nullable().optional(),
      receivedAt: unifiedBillingIsoDateTimeSchema.optional(),
    })
    .strict();

const paymentAllocationSchema =
  z
    .object({
      invoiceId: unifiedBillingObjectIdSchema.nullable().optional(),
      patientAccountId: unifiedBillingObjectIdSchema,
      amount: unifiedBillingPositiveDecimalSchema,
    })
    .strict();

export const allocatePaymentBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      allocations: z.array(paymentAllocationSchema).min(1).max(500),
    })
    .strict()
    .refine(
      (value) => {
        const keys = value.allocations.map(
          (allocation) =>
            `${allocation.patientAccountId}:${allocation.invoiceId ?? 'ACCOUNT'}`,
        );
        return new Set(keys).size === keys.length;
      },
      {
        path: ['allocations'],
        message: 'Payment allocation targets must be unique',
      },
    );

export const requestRefundBodySchema =
  z
    .object({
      paymentId: unifiedBillingObjectIdSchema,
      amount: unifiedBillingPositiveDecimalSchema,
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const processRefundBodySchema =
  z
    .object({
      expectedVersion: unifiedBillingExpectedVersionSchema,
      paymentMethod: z.enum(paymentMethodValues),
      externalReference: nullableText(1, 300),
      reason: unifiedBillingReasonSchema,
    })
    .strict();

export const unifiedBillingCatalogListQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_UNIFIED_BILLING_PAGE_SIZE),
      status: stringArrayQuery(chargeCatalogStatusValues).optional(),
      chargeType: stringArrayQuery(chargeTypeValues).optional(),
      categoryId: unifiedBillingObjectIdSchema.optional(),
      departmentId: unifiedBillingObjectIdSchema.optional(),
      effectiveAt: unifiedBillingIsoDateTimeSchema.optional(),
      search: z.string().trim().min(1).max(300).optional(),
      includeCost: queryBooleanSchema.default(false),
      sortBy: z.enum(UNIFIED_BILLING_CATALOG_SORT_FIELDS).default('chargeCode'),
      sortDirection: z.enum(['asc', 'desc']).default('asc'),
    })
    .strict();

export const unifiedBillingAccountListQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_UNIFIED_BILLING_PAGE_SIZE),
      patientId: unifiedBillingObjectIdSchema.optional(),
      status: stringArrayQuery(patientAccountStatusValues).optional(),
      accountType: stringArrayQuery(patientAccountTypeValues).optional(),
      billingContext: stringArrayQuery(billingContextValues).optional(),
      admissionId: unifiedBillingObjectIdSchema.optional(),
      outstandingOnly: queryBooleanSchema.default(false),
      search: z.string().trim().min(1).max(300).optional(),
      sortBy: z.enum(UNIFIED_BILLING_ACCOUNT_SORT_FIELDS).default('createdAt'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();

export const unifiedBillingChargeListQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_UNIFIED_BILLING_PAGE_SIZE),
      patientAccountId: unifiedBillingObjectIdSchema.optional(),
      patientId: unifiedBillingObjectIdSchema.optional(),
      status: stringArrayQuery(chargeStatusValues).optional(),
      sourceModule: stringArrayQuery(chargeSourceModuleValues).optional(),
      chargeType: stringArrayQuery(chargeTypeValues).optional(),
      departmentId: unifiedBillingObjectIdSchema.optional(),
      from: unifiedBillingIsoDateTimeSchema.optional(),
      to: unifiedBillingIsoDateTimeSchema.optional(),
      unbilledOnly: queryBooleanSchema.default(false),
      search: z.string().trim().min(1).max(300).optional(),
      sortBy: z.enum(UNIFIED_BILLING_CHARGE_SORT_FIELDS).default('serviceFrom'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();

export const unifiedBillingInvoiceListQuerySchema =
  z
    .object({
      page: pageSchema.default(1),
      pageSize: pageSizeSchema.default(DEFAULT_UNIFIED_BILLING_PAGE_SIZE),
      patientAccountId: unifiedBillingObjectIdSchema.optional(),
      patientId: unifiedBillingObjectIdSchema.optional(),
      status: stringArrayQuery(invoiceStatusValues).optional(),
      invoiceType: stringArrayQuery(invoiceTypeValues).optional(),
      from: unifiedBillingIsoDateTimeSchema.optional(),
      to: unifiedBillingIsoDateTimeSchema.optional(),
      outstandingOnly: queryBooleanSchema.default(false),
      search: z.string().trim().min(1).max(300).optional(),
      sortBy: z.enum(UNIFIED_BILLING_INVOICE_SORT_FIELDS).default('invoiceDate'),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();