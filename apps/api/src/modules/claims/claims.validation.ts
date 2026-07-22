import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  CLAIM_MAX_ADJUDICATION_LINES,
  CLAIM_MAX_APPEAL_EVIDENCE,
  CLAIM_MAX_ATTACHMENTS,
  CLAIM_MAX_BATCH_SIZE,
  CLAIM_MAX_DIAGNOSES,
  CLAIM_MAX_LINES,
  CLAIM_MAX_PAGE_SIZE,
  CLAIM_MAX_REMITTANCE_LINES,
  claimAdjudicationDecisionValues,
  claimAgingBucketValues,
  claimAttachmentPurposeValues,
  claimDenialCategoryValues,
  claimDiagnosisTypeValues,
  claimPayerTypeValues,
  claimServiceCategoryValues,
  claimSortFieldValues,
  claimStatusValues,
  claimSubmissionChannelValues,
  claimVersionTypeValues,
  claimWorkQueueTypeValues,
} from './claims.constants.js';

export const claimObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/iu, 'Expected a valid MongoDB ObjectId');

export const claimExpectedVersionSchema = z.number().int().min(0);

export const claimIsoDateTimeSchema = z.string().datetime({
  offset: true,
});

export const claimReasonSchema = z.string().trim().min(5).max(4_000);

export const claimCodeSchema = z
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
      new Decimal(value).toDecimalPlaces(input.scale, Decimal.ROUND_HALF_UP).toFixed(input.scale),
    );
}

export const claimNonNegativeMoneySchema = decimalString({
  minimum: new Decimal(0),
  maximum: null,
  scale: 2,
});

export const claimPositiveMoneySchema = claimNonNegativeMoneySchema.refine(
  (value) => new Decimal(value).greaterThan(0),
  'Amount must be greater than zero',
);

export const claimPositiveQuantitySchema = decimalString({
  minimum: new Decimal(0),
  maximum: null,
  scale: 4,
}).refine(
  (value) => new Decimal(value).greaterThan(0),
  'Quantity must be greater than zero',
);

const optionalNullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

const claimDiagnosisSchema = z
  .object({
    diagnosisId: claimObjectIdSchema.nullable().optional(),
    codeSystem: claimCodeSchema,
    code: claimCodeSchema,
    description: z.string().trim().min(1).max(1_000),
    diagnosisType: z.enum(claimDiagnosisTypeValues),
    sequence: z.number().int().min(1).max(CLAIM_MAX_DIAGNOSES),
    presentOnAdmission: z.boolean().nullable().optional(),
  })
  .strict();

const claimLineCodingSchema = z
  .object({
    serviceCodeSystem: claimCodeSchema,
    serviceCode: claimCodeSchema,
    revenueCode: claimCodeSchema.nullable().optional(),
    modifiers: z.array(claimCodeSchema).max(10).optional(),
    units: claimPositiveQuantitySchema.nullable().optional(),
  })
  .strict();

const claimLineSelectionSchema = z
  .object({
    invoiceLineId: claimObjectIdSchema,
    coverageAllocationId: claimObjectIdSchema.nullable().optional(),
    serviceFrom: claimIsoDateTimeSchema.nullable().optional(),
    serviceThrough: claimIsoDateTimeSchema.nullable().optional(),
    providerId: claimObjectIdSchema.nullable().optional(),
    departmentId: claimObjectIdSchema.nullable().optional(),
    serviceCategory: z.enum(claimServiceCategoryValues).nullable().optional(),
    codingOverride: claimLineCodingSchema.nullable().optional(),
    diagnosisSequences: z
      .array(z.number().int().min(1).max(CLAIM_MAX_DIAGNOSES))
      .max(CLAIM_MAX_DIAGNOSES)
      .optional(),
    medicalNecessityNote: optionalNullableText(8_000),
    internalNote: optionalNullableText(4_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.serviceFrom != null &&
      value.serviceThrough != null &&
      new Date(value.serviceThrough) < new Date(value.serviceFrom)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['serviceThrough'],
        message: 'serviceThrough cannot be earlier than serviceFrom',
      });
    }

    const sequences = value.diagnosisSequences ?? [];
    if (new Set(sequences).size !== sequences.length) {
      context.addIssue({
        code: 'custom',
        path: ['diagnosisSequences'],
        message: 'diagnosisSequences cannot contain duplicates',
      });
    }
  });

const claimAttachmentSchema = z
  .object({
    attachmentId: claimObjectIdSchema,
    purpose: z.enum(claimAttachmentPurposeValues),
    lineInvoiceId: claimObjectIdSchema.nullable().optional(),
    description: optionalNullableText(2_000),
  })
  .strict();

function validateDiagnosesAndLines(
  value: Readonly<{
    diagnoses: readonly Readonly<{
      diagnosisType: string;
      sequence: number;
    }>[];
    lines: readonly Readonly<{
      invoiceLineId: string;
      diagnosisSequences?: readonly number[];
    }>[];
  }>,
  context: z.RefinementCtx,
): void {
  const primaryCount = value.diagnoses.filter(
    (diagnosis) => diagnosis.diagnosisType === 'PRIMARY',
  ).length;

  if (primaryCount !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['diagnoses'],
      message: 'A claim must contain exactly one primary diagnosis',
    });
  }

  const diagnosisSequences = value.diagnoses.map((diagnosis) => diagnosis.sequence);
  if (new Set(diagnosisSequences).size !== diagnosisSequences.length) {
    context.addIssue({
      code: 'custom',
      path: ['diagnoses'],
      message: 'Diagnosis sequence numbers must be unique',
    });
  }

  const invoiceLineIds = value.lines.map((line) => line.invoiceLineId);
  if (new Set(invoiceLineIds).size !== invoiceLineIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['lines'],
      message: 'An invoice line can appear only once in a claim version',
    });
  }

  const validSequences = new Set(diagnosisSequences);
  value.lines.forEach((line, lineIndex) => {
    for (const sequence of line.diagnosisSequences ?? []) {
      if (!validSequences.has(sequence)) {
        context.addIssue({
          code: 'custom',
          path: ['lines', lineIndex, 'diagnosisSequences'],
          message: `Diagnosis sequence ${sequence} is not present in the claim header`,
        });
      }
    }
  });
}

export const createClaimSchema = z
  .object({
    invoiceId: claimObjectIdSchema,
    coverageDeterminationId: claimObjectIdSchema,
    payerOrganizationId: claimObjectIdSchema,
    panelPlanId: claimObjectIdSchema,
    patientCoverageId: claimObjectIdSchema,
    claimVersionType: z.enum(claimVersionTypeValues),
    originalClaimId: claimObjectIdSchema.nullable().optional(),
    preauthorizationIds: z.array(claimObjectIdSchema).max(100).optional(),
    diagnoses: z.array(claimDiagnosisSchema).min(1).max(CLAIM_MAX_DIAGNOSES),
    lines: z.array(claimLineSelectionSchema).min(1).max(CLAIM_MAX_LINES),
    attachments: z.array(claimAttachmentSchema).max(CLAIM_MAX_ATTACHMENTS).optional(),
    internalNote: optionalNullableText(8_000),
    payerNote: optionalNullableText(8_000),
    medicalNecessitySummary: optionalNullableText(12_000),
    filingDeadline: claimIsoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.claimVersionType === 'ORIGINAL' && value.originalClaimId != null) {
      context.addIssue({
        code: 'custom',
        path: ['originalClaimId'],
        message: 'An original claim cannot reference another original claim',
      });
    }

    if (value.claimVersionType !== 'ORIGINAL' && value.originalClaimId == null) {
      context.addIssue({
        code: 'custom',
        path: ['originalClaimId'],
        message: 'Corrected and replacement claims require originalClaimId',
      });
    }

    validateDiagnosesAndLines(value, context);

    const attachmentKeys = (value.attachments ?? []).map(
      (attachment) => `${attachment.attachmentId}:${attachment.purpose}:${attachment.lineInvoiceId ?? ''}`,
    );
    if (new Set(attachmentKeys).size !== attachmentKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['attachments'],
        message: 'Duplicate claim attachment links are not allowed',
      });
    }
  });

export const updateDraftClaimSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    diagnoses: z.array(claimDiagnosisSchema).min(1).max(CLAIM_MAX_DIAGNOSES).optional(),
    lines: z.array(claimLineSelectionSchema).min(1).max(CLAIM_MAX_LINES).optional(),
    attachments: z.array(claimAttachmentSchema).max(CLAIM_MAX_ATTACHMENTS).optional(),
    preauthorizationIds: z.array(claimObjectIdSchema).max(100).optional(),
    internalNote: optionalNullableText(8_000),
    payerNote: optionalNullableText(8_000),
    medicalNecessitySummary: optionalNullableText(12_000),
    filingDeadline: claimIsoDateTimeSchema.nullable().optional(),
    reason: claimReasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.diagnoses !== undefined && value.lines !== undefined) {
      validateDiagnosesAndLines(
        {
          diagnoses: value.diagnoses,
          lines: value.lines,
        },
        context,
      );
    }
  });

export const validateClaimSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    asOf: claimIsoDateTimeSchema.optional(),
  })
  .strict();

export const markClaimReadySchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    validationSnapshotId: claimObjectIdSchema,
    reason: claimReasonSchema,
  })
  .strict();

function submissionChannelReferenceCheck(
  value: Readonly<{
    submissionChannel: string;
    destinationReference?: string | null;
    clearinghouseReference?: string | null;
  }>,
  context: z.RefinementCtx,
): void {
  if (
    value.submissionChannel === 'CLEARINGHOUSE' &&
    (value.clearinghouseReference == null || value.clearinghouseReference.trim().length === 0)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['clearinghouseReference'],
      message: 'clearinghouseReference is required for CLEARINGHOUSE submission',
    });
  }

  if (
    ['ELECTRONIC_DIRECT', 'PAYER_PORTAL', 'EMAIL', 'COURIER', 'MANUAL_HAND_DELIVERY'].includes(
      value.submissionChannel,
    ) &&
    (value.destinationReference == null || value.destinationReference.trim().length === 0)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['destinationReference'],
      message: 'destinationReference is required for the selected submission channel',
    });
  }
}

export const createClaimBatchSchema = z
  .object({
    payerOrganizationId: claimObjectIdSchema,
    panelPlanId: claimObjectIdSchema.nullable().optional(),
    submissionChannel: z.enum(claimSubmissionChannelValues),
    destinationReference: optionalNullableText(500),
    clearinghouseReference: optionalNullableText(500),
    claimIds: z.array(claimObjectIdSchema).min(1).max(CLAIM_MAX_BATCH_SIZE),
    notes: optionalNullableText(8_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.claimIds).size !== value.claimIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['claimIds'],
        message: 'A claim can appear only once in a submission batch',
      });
    }
    submissionChannelReferenceCheck(value, context);
  });

export const approveClaimBatchSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    approvalRequestId: claimObjectIdSchema,
    reason: claimReasonSchema,
  })
  .strict();

export const submitClaimBatchSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    approvalRequestId: claimObjectIdSchema,
    idempotencyKey: z.string().trim().min(8).max(240),
    submittedAt: claimIsoDateTimeSchema.optional(),
  })
  .strict();

export const recordSubmissionAcknowledgementSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    acknowledgementReference: z.string().trim().min(1).max(500),
    payerReferenceNumber: optionalNullableText(500),
    clearinghouseReference: optionalNullableText(500),
    acknowledgedAt: claimIsoDateTimeSchema,
    accepted: z.boolean(),
    rejectionCode: optionalNullableText(120),
    rejectionReason: optionalNullableText(4_000),
    rawAttachmentId: claimObjectIdSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.accepted && value.rejectionReason == null && value.rejectionCode == null) {
      context.addIssue({
        code: 'custom',
        path: ['rejectionReason'],
        message: 'Rejected acknowledgements require a rejection code or reason',
      });
    }
  });

const claimAdjudicationLineSchema = z
  .object({
    claimLineId: claimObjectIdSchema,
    decision: z.enum(claimAdjudicationDecisionValues),
    approvedAmount: claimNonNegativeMoneySchema,
    deniedAmount: claimNonNegativeMoneySchema,
    disallowedAmount: claimNonNegativeMoneySchema,
    returnedAmount: claimNonNegativeMoneySchema,
    contractualAdjustmentAmount: claimNonNegativeMoneySchema.optional(),
    payerLineReference: optionalNullableText(500),
    denialCategory: z.enum(claimDenialCategoryValues).nullable().optional(),
    reasonCode: optionalNullableText(120),
    reasonDescription: optionalNullableText(4_000),
  })
  .strict()
  .superRefine((value, context) => {
    const deniedDecision = ['DENIED', 'PARTIALLY_APPROVED', 'REJECTED', 'RETURNED'].includes(
      value.decision,
    );
    if (deniedDecision && value.reasonCode == null && value.reasonDescription == null) {
      context.addIssue({
        code: 'custom',
        path: ['reasonDescription'],
        message: 'Non-approved adjudication decisions require a payer reason',
      });
    }
  });

export const recordClaimAdjudicationSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    payerReferenceNumber: z.string().trim().min(1).max(500),
    adjudicatedAt: claimIsoDateTimeSchema,
    decisionReference: optionalNullableText(500),
    explanationOfBenefitsAttachmentId: claimObjectIdSchema.nullable().optional(),
    lines: z
      .array(claimAdjudicationLineSchema)
      .min(1)
      .max(CLAIM_MAX_ADJUDICATION_LINES),
    notes: optionalNullableText(8_000),
  })
  .strict()
  .superRefine((value, context) => {
    const lineIds = value.lines.map((line) => line.claimLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Each claim line may be adjudicated only once per adjudication record',
      });
    }
  });

const remittanceAllocationSchema = z
  .object({
    claimId: claimObjectIdSchema,
    claimLineId: claimObjectIdSchema.nullable().optional(),
    paidAmount: claimNonNegativeMoneySchema,
    contractualAdjustmentAmount: claimNonNegativeMoneySchema,
    disallowedAmount: claimNonNegativeMoneySchema,
    withholdingAmount: claimNonNegativeMoneySchema.optional(),
    payerClaimReference: optionalNullableText(500),
    payerLineReference: optionalNullableText(500),
  })
  .strict()
  .refine(
    (value) =>
      new Decimal(value.paidAmount)
        .plus(value.contractualAdjustmentAmount)
        .plus(value.disallowedAmount)
        .plus(value.withholdingAmount ?? '0')
        .greaterThan(0),
    {
      message: 'A remittance allocation must contain a non-zero financial amount',
    },
  );

export const importRemittanceSchema = z
  .object({
    payerOrganizationId: claimObjectIdSchema,
    remittanceReference: z.string().trim().min(1).max(500),
    remittanceDate: claimIsoDateTimeSchema,
    paymentId: claimObjectIdSchema.nullable().optional(),
    sponsorPaymentReference: optionalNullableText(500),
    totalPaymentAmount: claimNonNegativeMoneySchema,
    currency: z.literal('PKR').optional(),
    attachmentId: claimObjectIdSchema.nullable().optional(),
    allocations: z.array(remittanceAllocationSchema).min(1).max(CLAIM_MAX_REMITTANCE_LINES),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.allocations.map(
      (allocation) => `${allocation.claimId}:${allocation.claimLineId ?? ''}`,
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Duplicate remittance allocation targets are not allowed',
      });
    }
  });

export const postClaimPaymentSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    remittanceId: claimObjectIdSchema,
    sponsorPaymentId: claimObjectIdSchema,
    allocations: z
      .array(
        z
          .object({
            claimLineId: claimObjectIdSchema.nullable().optional(),
            amount: claimPositiveMoneySchema,
          })
          .strict(),
      )
      .min(1)
      .max(CLAIM_MAX_REMITTANCE_LINES),
    unappliedAmount: claimNonNegativeMoneySchema,
    reason: claimReasonSchema,
  })
  .strict();

export const requestClaimAdjustmentSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    claimLineId: claimObjectIdSchema.nullable().optional(),
    adjustmentType: z.enum([
      'CONTRACTUAL',
      'DISALLOWED',
      'PAYER_WITHHOLDING',
      'ROUNDING',
      'DEBIT_NOTE',
      'CREDIT_NOTE',
      'REFUND',
      'REPAYMENT',
    ]),
    amount: claimPositiveMoneySchema,
    reason: claimReasonSchema,
    supportingAttachmentIds: z.array(claimObjectIdSchema).max(CLAIM_MAX_ATTACHMENTS).optional(),
  })
  .strict();

export const requestClaimWriteOffSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    claimLineId: claimObjectIdSchema.nullable().optional(),
    amount: claimPositiveMoneySchema,
    reason: claimReasonSchema,
    approvalRequestId: claimObjectIdSchema,
  })
  .strict();

export const createClaimAppealSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    denialIds: z.array(claimObjectIdSchema).min(1).max(500),
    appealDeadline: claimIsoDateTimeSchema,
    grounds: z.string().trim().min(20).max(20_000),
    requestedAmount: claimPositiveMoneySchema,
    evidenceAttachmentIds: z
      .array(claimObjectIdSchema)
      .min(1)
      .max(CLAIM_MAX_APPEAL_EVIDENCE),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.denialIds).size !== value.denialIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['denialIds'],
        message: 'Duplicate denial references are not allowed',
      });
    }
    if (new Set(value.evidenceAttachmentIds).size !== value.evidenceAttachmentIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceAttachmentIds'],
        message: 'Duplicate appeal evidence references are not allowed',
      });
    }
  });

export const approveClaimAppealSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    approvalRequestId: claimObjectIdSchema,
    decisionReason: claimReasonSchema,
  })
  .strict();

export const submitClaimAppealSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    approvalRequestId: claimObjectIdSchema,
    submissionChannel: z.enum(claimSubmissionChannelValues),
    submissionReference: z.string().trim().min(1).max(500),
    submittedAt: claimIsoDateTimeSchema,
  })
  .strict();

export const recordClaimAppealDecisionSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    decision: z.enum(['UPHELD', 'OVERTURNED', 'PARTIALLY_OVERTURNED']),
    decidedAt: claimIsoDateTimeSchema,
    approvedAdditionalAmount: claimNonNegativeMoneySchema,
    payerDecisionReference: optionalNullableText(500),
    attachmentId: claimObjectIdSchema.nullable().optional(),
    reason: claimReasonSchema,
  })
  .strict();

export const assignClaimWorkItemSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    assignedToUserId: claimObjectIdSchema,
    followUpAt: claimIsoDateTimeSchema.nullable().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    reason: claimReasonSchema,
  })
  .strict();

export const escalateClaimWorkItemSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    escalatedToUserId: claimObjectIdSchema.nullable().optional(),
    followUpAt: claimIsoDateTimeSchema,
    reason: claimReasonSchema,
  })
  .strict();

export const sensitiveClaimActionSchema = z
  .object({
    expectedVersion: claimExpectedVersionSchema,
    approvalRequestId: claimObjectIdSchema,
    reason: claimReasonSchema,
  })
  .strict();

function commaSeparatedEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
      }
      return value;
    },
    z.array(z.enum(values)).optional(),
  );
}

export const claimsListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(CLAIM_MAX_PAGE_SIZE).optional(),
    from: claimIsoDateTimeSchema.optional(),
    to: claimIsoDateTimeSchema.optional(),
    payerOrganizationId: claimObjectIdSchema.optional(),
    panelPlanId: claimObjectIdSchema.optional(),
    patientId: claimObjectIdSchema.optional(),
    patientCoverageId: claimObjectIdSchema.optional(),
    invoiceId: claimObjectIdSchema.optional(),
    claimBatchId: claimObjectIdSchema.optional(),
    status: commaSeparatedEnum(claimStatusValues),
    payerType: commaSeparatedEnum(claimPayerTypeValues),
    serviceCategory: commaSeparatedEnum(claimServiceCategoryValues),
    agingBucket: commaSeparatedEnum(claimAgingBucketValues),
    assignedToUserId: claimObjectIdSchema.optional(),
    workQueueType: commaSeparatedEnum(claimWorkQueueTypeValues),
    followUpDueBefore: claimIsoDateTimeSchema.optional(),
    includeClosed: z.coerce.boolean().optional(),
    search: z.string().trim().min(1).max(240).optional(),
    sortBy: z.enum(claimSortFieldValues).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from !== undefined && value.to !== undefined && new Date(value.to) < new Date(value.from)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to cannot be earlier than from',
      });
    }
  });

export const claimIdParamsSchema = z
  .object({
    claimId: claimObjectIdSchema,
  })
  .strict();

export const claimBatchIdParamsSchema = z
  .object({
    claimBatchId: claimObjectIdSchema,
  })
  .strict();

export const claimAppealIdParamsSchema = z
  .object({
    appealId: claimObjectIdSchema,
  })
  .strict();

export const claimWorkItemIdParamsSchema = z
  .object({
    workItemId: claimObjectIdSchema,
  })
  .strict();

export const claimIdempotencyHeaderSchema = z
  .object({
    'idempotency-key': z.string().trim().min(8).max(240),
  })
  .passthrough();


export const claimsReportNameSchema = z.enum([
  'claim-register',
  'claim-status',
  'claim-aging',
  'denials',
  'appeals',
  'payer-performance',
  'outstanding-sponsor-balances',
  'remittance-reconciliation',
]);

export const claimsReportParamsSchema = z.object({
  reportName: claimsReportNameSchema,
}).strict();

export const claimsReportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1_000).default(50),
  from: claimIsoDateTimeSchema.optional(),
  to: claimIsoDateTimeSchema.optional(),
  payerOrganizationId: claimObjectIdSchema.optional(),
  panelPlanId: claimObjectIdSchema.optional(),
  departmentId: claimObjectIdSchema.optional(),
  status: z.union([
    z.enum(claimStatusValues),
    z.array(z.enum(claimStatusValues)),
  ]).optional().transform((value) => value === undefined
    ? undefined
    : Array.isArray(value) ? value : [value]),
  agingBucket: z.union([
    z.enum(claimAgingBucketValues),
    z.array(z.enum(claimAgingBucketValues)),
  ]).optional().transform((value) => value === undefined
    ? undefined
    : Array.isArray(value) ? value : [value]),
  denialCategory: z.union([
    z.enum(claimDenialCategoryValues),
    z.array(z.enum(claimDenialCategoryValues)),
  ]).optional().transform((value) => value === undefined
    ? undefined
    : Array.isArray(value) ? value : [value]),
  appealStatus: z.union([
    z.enum([
      'DRAFT',
      'EVIDENCE_PENDING',
      'APPROVAL_PENDING',
      'APPROVED_FOR_SUBMISSION',
      'SUBMITTED',
      'ACKNOWLEDGED',
      'UNDER_REVIEW',
      'UPHELD',
      'OVERTURNED',
      'PARTIALLY_OVERTURNED',
      'WITHDRAWN',
      'CLOSED',
      'CANCELLED',
    ]),
    z.array(z.enum([
      'DRAFT',
      'EVIDENCE_PENDING',
      'APPROVAL_PENDING',
      'APPROVED_FOR_SUBMISSION',
      'SUBMITTED',
      'ACKNOWLEDGED',
      'UNDER_REVIEW',
      'UPHELD',
      'OVERTURNED',
      'PARTIALLY_OVERTURNED',
      'WITHDRAWN',
      'CLOSED',
      'CANCELLED',
    ])),
  ]).optional().transform((value) => value === undefined
    ? undefined
    : Array.isArray(value) ? value : [value]),
}).strict().superRefine((value, context) => {
  if (
    value.from !== undefined &&
    value.to !== undefined &&
    new Date(value.to) < new Date(value.from)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'Report end date cannot be earlier than start date',
    });
  }
});

export const claimsRecoveryRunSchema = z.object({
  limit: z.coerce.number().int().min(1).max(5_000).default(100),
  staleAfterMinutes: z.coerce.number().int().min(1).max(1_440).default(5),
}).strict();