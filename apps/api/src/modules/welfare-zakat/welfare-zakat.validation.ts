import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  WELFARE_ZAKAT_MAX_ATTACHMENTS,
  WELFARE_ZAKAT_MAX_DEPENDANTS,
  WELFARE_ZAKAT_MAX_ELIGIBILITY_RULES,
  WELFARE_ZAKAT_MAX_HOUSEHOLD_MEMBERS,
  WELFARE_ZAKAT_MAX_INVOICE_LINES,
  WELFARE_ZAKAT_MAX_PAGE_SIZE,
  assistanceAllocationStatusValues,
  assistanceApplicationStatusValues,
  assistanceApplicationTypeValues,
  assistanceApprovalStatusValues,
  assistanceAttachmentPurposeValues,
  assistanceFundRestrictionValues,
  assistanceFundStatusValues,
  assistanceFundTypeValues,
  assistanceLimitScopeValues,
  assistancePeriodTypeValues,
  assistanceReviewTypeValues,
  assistanceServiceCategoryValues,
  assistanceSortFieldValues,
  assistanceWorkQueueTypeValues,
  eligibilityOutcomeValues,
  eligibilityRuleEffectValues,
  eligibilityRuleOperatorValues,
} from './welfare-zakat.constants.js';

export const welfareZakatObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/iu, 'Expected a valid MongoDB ObjectId');

export const welfareZakatExpectedVersionSchema = z.number().int().min(0);

export const welfareZakatIsoDateTimeSchema = z.string().datetime({
  offset: true,
});

export const welfareZakatReasonSchema = z.string().trim().min(5).max(4_000);

export const welfareZakatCodeSchema = z
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

export const welfareZakatNonNegativeMoneySchema = decimalString({
  minimum: new Decimal(0),
  maximum: null,
  scale: 2,
});

export const welfareZakatPositiveMoneySchema =
  welfareZakatNonNegativeMoneySchema.refine(
    (value) => new Decimal(value).greaterThan(0),
    'Amount must be greater than zero',
  );

export const welfareZakatPercentageSchema = decimalString({
  minimum: new Decimal(0),
  maximum: new Decimal(100),
  scale: 4,
});

const optionalNullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

const objectIdArray = (maximum: number) =>
  z.array(welfareZakatObjectIdSchema).max(maximum).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate identifiers are not allowed',
      });
    }
  });

const assistanceAttachmentSchema = z
  .object({
    attachmentId: welfareZakatObjectIdSchema,
    purpose: z.enum(assistanceAttachmentPurposeValues),
    description: optionalNullableText(1_000),
  })
  .strict();

const eligibilityScalarSchema = z.union([
  z.string().trim().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const eligibilityRuleSchema = z
  .object({
    ruleCode: welfareZakatCodeSchema,
    description: z.string().trim().min(3).max(1_000),
    field: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z][A-Za-z0-9_.]*$/u, 'Invalid eligibility field path'),
    operator: z.enum(eligibilityRuleOperatorValues),
    effect: z.enum(eligibilityRuleEffectValues),
    value: eligibilityScalarSchema.optional(),
    values: z.array(eligibilityScalarSchema).max(100).optional(),
    minimum: welfareZakatNonNegativeMoneySchema.optional(),
    maximum: welfareZakatNonNegativeMoneySchema.optional(),
    priority: z.number().int().min(0).max(10_000),
    active: z.boolean(),
    failureCode: welfareZakatCodeSchema.optional(),
    failureMessage: z.string().trim().min(3).max(1_000).optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    const singleValueOperators = new Set([
      'EQUALS',
      'NOT_EQUALS',
      'GREATER_THAN',
      'GREATER_THAN_OR_EQUAL',
      'LESS_THAN',
      'LESS_THAN_OR_EQUAL',
    ]);
    const listOperators = new Set([
      'IN',
      'NOT_IN',
      'CONTAINS_ANY',
      'CONTAINS_ALL',
    ]);

    if (singleValueOperators.has(rule.operator) && rule.value === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: `${rule.operator} requires value`,
      });
    }

    if (
      listOperators.has(rule.operator) &&
      (rule.values === undefined || rule.values.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['values'],
        message: `${rule.operator} requires at least one value`,
      });
    }

    if (
      rule.operator === 'BETWEEN' &&
      (rule.minimum === undefined || rule.maximum === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'BETWEEN requires minimum and maximum',
      });
    }

    if (
      rule.minimum !== undefined &&
      rule.maximum !== undefined &&
      new Decimal(rule.minimum).greaterThan(rule.maximum)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximum'],
        message: 'Maximum must be greater than or equal to minimum',
      });
    }
  });

const assistanceLimitSchema = z
  .object({
    scope: z.enum(assistanceLimitScopeValues),
    amount: welfareZakatPositiveMoneySchema,
    periodType: z.enum(assistancePeriodTypeValues),
    rollingDays: z.number().int().min(1).max(3_650).nullable().optional(),
    serviceCategory: z.enum(assistanceServiceCategoryValues).nullable().optional(),
    serviceCode: welfareZakatCodeSchema.nullable().optional(),
    appliesPerPatient: z.boolean(),
  })
  .strict()
  .superRefine((limit, context) => {
    if (limit.periodType === 'ROLLING_DAYS' && limit.rollingDays == null) {
      context.addIssue({
        code: 'custom',
        path: ['rollingDays'],
        message: 'ROLLING_DAYS requires rollingDays',
      });
    }

    if (limit.periodType !== 'ROLLING_DAYS' && limit.rollingDays != null) {
      context.addIssue({
        code: 'custom',
        path: ['rollingDays'],
        message: 'rollingDays is only valid for ROLLING_DAYS limits',
      });
    }

    if (
      limit.scope === 'SERVICE' &&
      limit.serviceCategory == null &&
      limit.serviceCode == null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'SERVICE limits require a service category or service code',
      });
    }
  });

const eligibilityPolicySchema = z
  .object({
    defaultOutcome: z.enum(eligibilityOutcomeValues),
    rules: z.array(eligibilityRuleSchema).max(WELFARE_ZAKAT_MAX_ELIGIBILITY_RULES),
    allowedDepartmentIds: objectIdArray(500).optional(),
    excludedDepartmentIds: objectIdArray(500).optional(),
    allowedServiceCategories: z
      .array(z.enum(assistanceServiceCategoryValues))
      .max(100)
      .optional(),
    excludedServiceCategories: z
      .array(z.enum(assistanceServiceCategoryValues))
      .max(100)
      .optional(),
    allowedServiceCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    excludedServiceCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    allowedPatientCategoryCodes: z
      .array(welfareZakatCodeSchema)
      .max(500)
      .optional(),
    excludedPatientCategoryCodes: z
      .array(welfareZakatCodeSchema)
      .max(500)
      .optional(),
    allowedDiagnosisCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    excludedDiagnosisCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    limits: z.array(assistanceLimitSchema).max(250).optional(),
    requiresZakatDeclaration: z.boolean().optional(),
    requiresSocialWelfareReview: z.boolean().optional(),
    requiresClinicalReview: z.boolean().optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    const codes = policy.rules.map((rule) => rule.ruleCode);
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: 'custom',
        path: ['rules'],
        message: 'Eligibility rule codes must be unique',
      });
    }

    const intersection = (
      left: readonly string[] | undefined,
      right: readonly string[] | undefined,
    ) => {
      if (left === undefined || right === undefined) {
        return false;
      }
      const rightSet = new Set(right);
      return left.some((value) => rightSet.has(value));
    };

    if (
      intersection(policy.allowedDepartmentIds, policy.excludedDepartmentIds) ||
      intersection(policy.allowedServiceCategories, policy.excludedServiceCategories) ||
      intersection(policy.allowedServiceCodes, policy.excludedServiceCodes) ||
      intersection(
        policy.allowedPatientCategoryCodes,
        policy.excludedPatientCategoryCodes,
      ) ||
      intersection(policy.allowedDiagnosisCodes, policy.excludedDiagnosisCodes)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Allowed and excluded fund restrictions cannot overlap',
      });
    }
  });

const fundRestrictionSchema = z
  .object({
    restriction: z.enum(assistanceFundRestrictionValues),
    fundingSourceReference: optionalNullableText(300),
    donorReference: optionalNullableText(300),
    donationReference: optionalNullableText(300),
    grantReference: optionalNullableText(300),
    restrictionNarrative: optionalNullableText(4_000),
  })
  .strict()
  .superRefine((restriction, context) => {
    if (
      restriction.restriction === 'RESTRICTED' &&
      restriction.restrictionNarrative == null &&
      restriction.fundingSourceReference == null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Restricted funds require a restriction narrative or funding-source reference',
      });
    }
  });

function validateEffectivePeriod(
  value: Readonly<{
    effectiveFrom: string;
    effectiveThrough?: string | null | undefined;
  }>,
  context: z.RefinementCtx,
) {
  if (
    value.effectiveThrough != null &&
    new Date(value.effectiveThrough).getTime() <= new Date(value.effectiveFrom).getTime()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['effectiveThrough'],
      message: 'effectiveThrough must be later than effectiveFrom',
    });
  }
}

export const createAssistanceFundSchema = z
  .object({
    fundCode: welfareZakatCodeSchema,
    name: z.string().trim().min(2).max(300),
    description: optionalNullableText(4_000),
    fundType: z.enum(assistanceFundTypeValues),
    categoryCode: welfareZakatCodeSchema,
    restriction: fundRestrictionSchema,
    effectiveFrom: welfareZakatIsoDateTimeSchema,
    effectiveThrough: welfareZakatIsoDateTimeSchema.nullable().optional(),
    openingBalance: welfareZakatNonNegativeMoneySchema,
    currency: z.literal('PKR').optional(),
    eligibilityPolicy: eligibilityPolicySchema,
    approvalMatrixCode: welfareZakatCodeSchema,
    facilitySpecific: z.boolean(),
    reason: welfareZakatReasonSchema,
  })
  .strict()
  .superRefine(validateEffectivePeriod);

export const updateAssistanceFundSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    name: z.string().trim().min(2).max(300).optional(),
    description: optionalNullableText(4_000),
    categoryCode: welfareZakatCodeSchema.optional(),
    restriction: fundRestrictionSchema.optional(),
    effectiveFrom: welfareZakatIsoDateTimeSchema.optional(),
    effectiveThrough: welfareZakatIsoDateTimeSchema.nullable().optional(),
    eligibilityPolicy: eligibilityPolicySchema.optional(),
    approvalMatrixCode: welfareZakatCodeSchema.optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const changeAssistanceFundStatusSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    toStatus: z.enum(assistanceFundStatusValues),
    approvalRequestId: welfareZakatObjectIdSchema.nullable().optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const recordFundInflowSchema = z
  .object({
    expectedFundVersion: welfareZakatExpectedVersionSchema,
    transactionType: z.enum(['DONATION', 'GRANT', 'OTHER_INFLOW']),
    amount: welfareZakatPositiveMoneySchema,
    receivedAt: welfareZakatIsoDateTimeSchema,
    donorReference: optionalNullableText(300),
    donationReference: optionalNullableText(300),
    receiptReference: optionalNullableText(300),
    fundingSourceReference: optionalNullableText(300),
    restrictionNarrative: optionalNullableText(4_000),
    attachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
    approvalRequestId: welfareZakatObjectIdSchema.nullable().optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.transactionType === 'DONATION' && input.donationReference == null) {
      context.addIssue({
        code: 'custom',
        path: ['donationReference'],
        message: 'Donations require a donation reference',
      });
    }
    if (input.transactionType === 'GRANT' && input.fundingSourceReference == null) {
      context.addIssue({
        code: 'custom',
        path: ['fundingSourceReference'],
        message: 'Grants require a funding-source reference',
      });
    }
  });

export const requestFundTransferSchema = z
  .object({
    expectedSourceFundVersion: welfareZakatExpectedVersionSchema,
    expectedDestinationFundVersion: welfareZakatExpectedVersionSchema,
    sourceFundId: welfareZakatObjectIdSchema,
    destinationFundId: welfareZakatObjectIdSchema,
    amount: welfareZakatPositiveMoneySchema,
    transferAt: welfareZakatIsoDateTimeSchema.optional(),
    approvalRequestId: welfareZakatObjectIdSchema,
    attachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.sourceFundId === input.destinationFundId) {
      context.addIssue({
        code: 'custom',
        path: ['destinationFundId'],
        message: 'Source and destination funds must be different',
      });
    }
  });

const applicantSchema = z
  .object({
    applicantRelationshipToPatient: z.string().trim().min(2).max(120),
    applicantName: z.string().trim().min(2).max(300),
    applicantPhone: optionalNullableText(30),
    applicantIdentifierReference: optionalNullableText(100),
    guardianId: welfareZakatObjectIdSchema.nullable().optional(),
  })
  .strict();

const householdMemberSchema = z
  .object({
    relationship: z.string().trim().min(2).max(120),
    ageYears: z.number().int().min(0).max(130).nullable().optional(),
    employed: z.boolean(),
    monthlyIncome: welfareZakatNonNegativeMoneySchema,
    dependant: z.boolean(),
  })
  .strict();

const employmentSchema = z
  .object({
    employmentStatus: welfareZakatCodeSchema,
    employerName: optionalNullableText(300),
    occupation: optionalNullableText(300),
    monthlyIncome: welfareZakatNonNegativeMoneySchema,
    otherMonthlyIncome: welfareZakatNonNegativeMoneySchema,
  })
  .strict();

const financialConditionSchema = z
  .object({
    monthlyHouseholdIncome: welfareZakatNonNegativeMoneySchema,
    monthlyHouseholdExpenses: welfareZakatNonNegativeMoneySchema,
    assetsEstimatedValue: welfareZakatNonNegativeMoneySchema,
    liabilitiesEstimatedValue: welfareZakatNonNegativeMoneySchema,
    medicalDebt: welfareZakatNonNegativeMoneySchema,
    otherFinancialSupport: welfareZakatNonNegativeMoneySchema,
    narrative: optionalNullableText(4_000),
  })
  .strict();

const zakatDeclarationSchema = z
  .object({
    declarationProvided: z.boolean(),
    declaresEligible: z.boolean().nullable(),
    declarationDate: welfareZakatIsoDateTimeSchema.nullable().optional(),
    declarationReference: optionalNullableText(300),
    disqualifyingReason: optionalNullableText(2_000),
  })
  .strict()
  .superRefine((declaration, context) => {
    if (
      declaration.declarationProvided &&
      (declaration.declaresEligible == null || declaration.declarationDate == null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A provided Zakat declaration requires eligibility and declaration date',
      });
    }
    if (declaration.declaresEligible === false && declaration.disqualifyingReason == null) {
      context.addIssue({
        code: 'custom',
        path: ['disqualifyingReason'],
        message: 'A negative Zakat declaration requires a reason',
      });
    }
  });

const requestedServiceSchema = z
  .object({
    invoiceLineId: welfareZakatObjectIdSchema.nullable().optional(),
    serviceCategory: z.enum(assistanceServiceCategoryValues),
    serviceCode: welfareZakatCodeSchema.nullable().optional(),
    requestedAmount: welfareZakatPositiveMoneySchema.nullable().optional(),
  })
  .strict();

const questionnaireSchema = z.record(
  z.string().trim().min(1).max(200),
  z.union([z.string().trim().max(2_000), z.number().finite(), z.boolean(), z.null()]),
);

export const createAssistanceApplicationSchema = z
  .object({
    applicationType: z.enum(assistanceApplicationTypeValues),
    patientId: welfareZakatObjectIdSchema,
    guardianId: welfareZakatObjectIdSchema.nullable().optional(),
    encounterId: welfareZakatObjectIdSchema.nullable().optional(),
    admissionId: welfareZakatObjectIdSchema.nullable().optional(),
    invoiceId: welfareZakatObjectIdSchema.nullable().optional(),
    claimId: welfareZakatObjectIdSchema.nullable().optional(),
    preferredFundId: welfareZakatObjectIdSchema.nullable().optional(),
    applicant: applicantSchema,
    householdMembers: z
      .array(householdMemberSchema)
      .min(1)
      .max(WELFARE_ZAKAT_MAX_HOUSEHOLD_MEMBERS),
    employment: employmentSchema,
    financialCondition: financialConditionSchema,
    zakatDeclaration: zakatDeclarationSchema.nullable().optional(),
    questionnaireAnswers: questionnaireSchema,
    requestedAmount: welfareZakatPositiveMoneySchema.nullable().optional(),
    requestedServices: z
      .array(requestedServiceSchema)
      .max(WELFARE_ZAKAT_MAX_INVOICE_LINES)
      .optional(),
    attachments: z
      .array(assistanceAttachmentSchema)
      .max(WELFARE_ZAKAT_MAX_ATTACHMENTS)
      .optional(),
    notes: optionalNullableText(4_000),
    financialYearCode: welfareZakatCodeSchema,
  })
  .strict()
  .superRefine((application, context) => {
    const dependantCount = application.householdMembers.filter(
      (member) => member.dependant,
    ).length;
    if (dependantCount > WELFARE_ZAKAT_MAX_DEPENDANTS) {
      context.addIssue({
        code: 'custom',
        path: ['householdMembers'],
        message: `No more than ${WELFARE_ZAKAT_MAX_DEPENDANTS} dependants are allowed`,
      });
    }

    if (
      application.applicationType === 'ZAKAT' &&
      (application.zakatDeclaration == null ||
        !application.zakatDeclaration.declarationProvided)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['zakatDeclaration'],
        message: 'Zakat applications require a declaration',
      });
    }

    const invoiceLineIds = (application.requestedServices ?? [])
      .map((service) => service.invoiceLineId)
      .filter((value): value is string => value != null);
    if (new Set(invoiceLineIds).size !== invoiceLineIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['requestedServices'],
        message: 'Duplicate invoice lines are not allowed',
      });
    }
  });

export const updateAssistanceApplicationSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    preferredFundId: welfareZakatObjectIdSchema.nullable().optional(),
    applicant: applicantSchema.optional(),
    householdMembers: z
      .array(householdMemberSchema)
      .min(1)
      .max(WELFARE_ZAKAT_MAX_HOUSEHOLD_MEMBERS)
      .optional(),
    employment: employmentSchema.optional(),
    financialCondition: financialConditionSchema.optional(),
    zakatDeclaration: zakatDeclarationSchema.nullable().optional(),
    questionnaireAnswers: questionnaireSchema.optional(),
    requestedAmount: welfareZakatPositiveMoneySchema.nullable().optional(),
    attachments: z
      .array(assistanceAttachmentSchema)
      .max(WELFARE_ZAKAT_MAX_ATTACHMENTS)
      .optional(),
    notes: optionalNullableText(4_000),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const submitAssistanceApplicationSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    completenessAttestation: z.literal(true),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const recordAssistanceReviewSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    reviewType: z.enum(assistanceReviewTypeValues),
    outcome: z.enum(eligibilityOutcomeValues),
    assessment: z.string().trim().min(10).max(10_000),
    findings: z.array(z.string().trim().min(3).max(2_000)).min(1).max(100),
    recommendedFundId: welfareZakatObjectIdSchema.nullable().optional(),
    recommendedAmount: welfareZakatPositiveMoneySchema.nullable().optional(),
    followUpAt: welfareZakatIsoDateTimeSchema.nullable().optional(),
    attachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict();

export const requestApplicationInformationSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    requestedItems: z.array(z.string().trim().min(3).max(1_000)).min(1).max(100),
    responseDueAt: welfareZakatIsoDateTimeSchema,
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const assignAssistanceWorkItemSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    assignedToUserId: welfareZakatObjectIdSchema,
    followUpAt: welfareZakatIsoDateTimeSchema.nullable().optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const escalateAssistanceWorkItemSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    escalatedToUserId: welfareZakatObjectIdSchema.nullable().optional(),
    escalationLevel: z.number().int().min(1).max(10),
    followUpAt: welfareZakatIsoDateTimeSchema.nullable().optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const requestAssistanceApprovalSchema = z
  .object({
    expectedApplicationVersion: welfareZakatExpectedVersionSchema,
    fundId: welfareZakatObjectIdSchema,
    requestedAmount: welfareZakatPositiveMoneySchema,
    approvedFrom: welfareZakatIsoDateTimeSchema,
    approvedThrough: welfareZakatIsoDateTimeSchema.nullable().optional(),
    approvedServiceCategories: z
      .array(z.enum(assistanceServiceCategoryValues))
      .max(100)
      .optional(),
    approvedServiceCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    approvedInvoiceLineIds: objectIdArray(WELFARE_ZAKAT_MAX_INVOICE_LINES).optional(),
    conditions: z.array(z.string().trim().min(3).max(2_000)).max(100).optional(),
    approvalMatrixCode: welfareZakatCodeSchema,
    reason: welfareZakatReasonSchema,
    attachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict()
  .superRefine((approval, context) => {
    validateEffectivePeriod(
      {
        effectiveFrom: approval.approvedFrom,
        effectiveThrough: approval.approvedThrough,
      },
      context,
    );
  });

export const decideAssistanceApprovalSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    decision: z.enum(['APPROVE', 'PARTIALLY_APPROVE', 'REJECT']),
    approvedAmount: welfareZakatPositiveMoneySchema.nullable().optional(),
    approvedFrom: welfareZakatIsoDateTimeSchema.nullable().optional(),
    approvedThrough: welfareZakatIsoDateTimeSchema.nullable().optional(),
    approvedServiceCategories: z
      .array(z.enum(assistanceServiceCategoryValues))
      .max(100)
      .optional(),
    approvedServiceCodes: z.array(welfareZakatCodeSchema).max(2_000).optional(),
    approvedInvoiceLineIds: objectIdArray(WELFARE_ZAKAT_MAX_INVOICE_LINES).optional(),
    conditions: z.array(z.string().trim().min(3).max(2_000)).max(100).optional(),
    decisionReason: welfareZakatReasonSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision !== 'REJECT' && decision.approvedAmount == null) {
      context.addIssue({
        code: 'custom',
        path: ['approvedAmount'],
        message: 'Approved decisions require an approved amount',
      });
    }
    if (decision.decision === 'REJECT' && decision.approvedAmount != null) {
      context.addIssue({
        code: 'custom',
        path: ['approvedAmount'],
        message: 'Rejected decisions cannot include an approved amount',
      });
    }
    if (
      decision.approvedFrom != null &&
      decision.approvedThrough != null &&
      new Date(decision.approvedThrough).getTime() <=
        new Date(decision.approvedFrom).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['approvedThrough'],
        message: 'approvedThrough must be later than approvedFrom',
      });
    }
  });

export const cancelOrReverseAssistanceApprovalSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    approvalRequestId: welfareZakatObjectIdSchema,
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const reserveAssistanceAllocationSchema = z
  .object({
    expectedFundVersion: welfareZakatExpectedVersionSchema,
    expectedApprovalVersion: welfareZakatExpectedVersionSchema,
    applicationId: welfareZakatObjectIdSchema,
    approvalId: welfareZakatObjectIdSchema,
    fundId: welfareZakatObjectIdSchema,
    patientId: welfareZakatObjectIdSchema,
    patientAccountId: welfareZakatObjectIdSchema,
    invoiceId: welfareZakatObjectIdSchema,
    amount: welfareZakatPositiveMoneySchema,
    expiresAt: welfareZakatIsoDateTimeSchema,
    priority: z.number().int().min(0).max(10_000),
    reason: welfareZakatReasonSchema,
  })
  .strict();

const allocationLineSchema = z
  .object({
    invoiceLineId: welfareZakatObjectIdSchema,
    amount: welfareZakatPositiveMoneySchema,
    reason: welfareZakatReasonSchema,
    supportingAttachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict();

export const createAssistanceAllocationSchema = z
  .object({
    expectedFundVersion: welfareZakatExpectedVersionSchema,
    expectedApprovalVersion: welfareZakatExpectedVersionSchema,
    applicationId: welfareZakatObjectIdSchema,
    approvalId: welfareZakatObjectIdSchema,
    reservationId: welfareZakatObjectIdSchema.nullable().optional(),
    fundId: welfareZakatObjectIdSchema,
    patientId: welfareZakatObjectIdSchema,
    patientAccountId: welfareZakatObjectIdSchema,
    invoiceId: welfareZakatObjectIdSchema,
    claimId: welfareZakatObjectIdSchema.nullable().optional(),
    priority: z.number().int().min(0).max(10_000),
    lines: z.array(allocationLineSchema).min(1).max(WELFARE_ZAKAT_MAX_INVOICE_LINES),
    reason: welfareZakatReasonSchema,
    supportingAttachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict()
  .superRefine((allocation, context) => {
    const lineIds = allocation.lines.map((line) => line.invoiceLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Duplicate invoice-line allocations are not allowed',
      });
    }
  });

export const confirmAssistanceAllocationSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    expectedFundVersion: welfareZakatExpectedVersionSchema,
    expectedApprovalVersion: welfareZakatExpectedVersionSchema,
    approvalRequestId: welfareZakatObjectIdSchema.nullable().optional(),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const reverseAssistanceAllocationSchema = z
  .object({
    expectedVersion: welfareZakatExpectedVersionSchema,
    amount: welfareZakatPositiveMoneySchema,
    invoiceLineId: welfareZakatObjectIdSchema.nullable().optional(),
    approvalRequestId: welfareZakatObjectIdSchema,
    reason: welfareZakatReasonSchema,
    supportingAttachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict();

export const returnFundsSchema = z
  .object({
    expectedAllocationVersion: welfareZakatExpectedVersionSchema,
    amount: welfareZakatPositiveMoneySchema,
    paymentId: welfareZakatObjectIdSchema.nullable().optional(),
    refundId: welfareZakatObjectIdSchema.nullable().optional(),
    creditNoteId: welfareZakatObjectIdSchema.nullable().optional(),
    debitNoteId: welfareZakatObjectIdSchema.nullable().optional(),
    claimAdjustmentId: welfareZakatObjectIdSchema.nullable().optional(),
    approvalRequestId: welfareZakatObjectIdSchema,
    reason: welfareZakatReasonSchema,
    supportingAttachmentIds: objectIdArray(WELFARE_ZAKAT_MAX_ATTACHMENTS).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      [
        input.paymentId,
        input.refundId,
        input.creditNoteId,
        input.debitNoteId,
        input.claimAdjustmentId,
      ].every((value) => value == null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A refund, repayment, or recovery must reference its authoritative financial source',
      });
    }
  });

export const welfareZakatListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(WELFARE_ZAKAT_MAX_PAGE_SIZE).optional(),
    from: welfareZakatIsoDateTimeSchema.optional(),
    to: welfareZakatIsoDateTimeSchema.optional(),
    fundId: welfareZakatObjectIdSchema.optional(),
    patientId: welfareZakatObjectIdSchema.optional(),
    applicationId: welfareZakatObjectIdSchema.optional(),
    approvalId: welfareZakatObjectIdSchema.optional(),
    invoiceId: welfareZakatObjectIdSchema.optional(),
    claimId: welfareZakatObjectIdSchema.optional(),
    fundType: z.array(z.enum(assistanceFundTypeValues)).optional(),
    fundStatus: z.array(z.enum(assistanceFundStatusValues)).optional(),
    applicationStatus: z.array(z.enum(assistanceApplicationStatusValues)).optional(),
    approvalStatus: z.array(z.enum(assistanceApprovalStatusValues)).optional(),
    allocationStatus: z.array(z.enum(assistanceAllocationStatusValues)).optional(),
    assignedToUserId: welfareZakatObjectIdSchema.optional(),
    workQueueType: z.array(z.enum(assistanceWorkQueueTypeValues)).optional(),
    followUpDueBefore: welfareZakatIsoDateTimeSchema.optional(),
    expiringBefore: welfareZakatIsoDateTimeSchema.optional(),
    includeClosed: z.coerce.boolean().optional(),
    search: z.string().trim().min(1).max(300).optional(),
    sortBy: z.enum(assistanceSortFieldValues).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const welfareZakatIdParamsSchema = z
  .object({
    id: welfareZakatObjectIdSchema,
  })
  .strict();

export const welfareZakatIdempotencyHeaderSchema = z
  .object({
    'idempotency-key': z.string().trim().min(8).max(240),
  })
  .passthrough();

export const welfareZakatRecoveryRunSchema = z
  .object({
    limit: z.number().int().min(1).max(1_000).default(100),
    staleAfterMinutes: z.number().int().min(1).max(10_080).default(30),
  })
  .strict();

export const welfareZakatReportNameValues = [
  'fund-register',
  'fund-balances',
  'fund-transactions',
  'donations-inflows',
  'application-register',
  'application-status',
  'eligibility',
  'approvals',
  'allocations',
  'utilization',
  'remaining-balances',
  'reversals',
  'patient-assistance',
  'department-service-utilization',
  'donor-utilization',
  'restricted-funds',
  'expiring-approvals',
  'fund-reconciliation',
  'invoice-allocation-reconciliation',
] as const;

export const welfareZakatReportParamsSchema = z
  .object({
    report: z.enum(welfareZakatReportNameValues),
  })
  .strict();

export const welfareZakatReportQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(1_000).optional(),
    from: welfareZakatIsoDateTimeSchema.optional(),
    to: welfareZakatIsoDateTimeSchema.optional(),
    fundId: welfareZakatObjectIdSchema.optional(),
    fundType: z.array(z.enum(assistanceFundTypeValues)).optional(),
    fundStatus: z.array(z.enum(assistanceFundStatusValues)).optional(),
    applicationStatus: z.array(z.enum(assistanceApplicationStatusValues)).optional(),
    approvalStatus: z.array(z.enum(assistanceApprovalStatusValues)).optional(),
    allocationStatus: z.array(z.enum(assistanceAllocationStatusValues)).optional(),
    patientId: welfareZakatObjectIdSchema.optional(),
    departmentId: welfareZakatObjectIdSchema.optional(),
    serviceCategory: z.array(z.enum(assistanceServiceCategoryValues)).optional(),
    donorReference: z.string().trim().min(3).max(300).optional(),
    financialYearCode: welfareZakatCodeSchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from != null &&
      query.to != null &&
      new Date(query.to) < new Date(query.from)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Report end date must not be earlier than its start date',
      });
    }
  });

export const decideFundTransferSchema = z
  .object({
    expectedTransferVersion: welfareZakatExpectedVersionSchema,
    expectedSourceFundVersion: welfareZakatExpectedVersionSchema,
    expectedDestinationFundVersion: welfareZakatExpectedVersionSchema,
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: welfareZakatReasonSchema,
  })
  .strict();

export const reverseFundTransferSchema = z
  .object({
    expectedTransferVersion: welfareZakatExpectedVersionSchema,
    expectedSourceFundVersion: welfareZakatExpectedVersionSchema,
    expectedDestinationFundVersion: welfareZakatExpectedVersionSchema,
    approvalRequestId: welfareZakatObjectIdSchema,
    reason: welfareZakatReasonSchema,
  })
  .strict();