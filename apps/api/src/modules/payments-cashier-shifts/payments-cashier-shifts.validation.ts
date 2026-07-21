import Decimal from 'decimal.js';

import {
  z,
} from 'zod';

import {
  activeShiftPolicyValues,
  cashCounterTypeValues,
  cashMovementTypeValues,
  paymentMethodCodeValues,
  paymentMethodKindValues,
  paymentSettlementModeValues,
  receiptCopyTypeValues,
} from '@hospital-mis/database';

import {
  DEFAULT_PAYMENT_CASHIER_PAGE_SIZE,
  MAX_COUNTER_ASSIGNEES,
  MAX_COUNTER_PAYMENT_METHODS,
  MAX_PAYMENT_ALLOCATIONS,
  MAX_PAYMENT_CASHIER_PAGE_SIZE,
  MAX_PAYMENT_INTENT_TTL_MINUTES,
  MAX_SPLIT_TENDERS,
  PAYMENT_CASHIER_CURRENCY,
  PAYMENT_CASHIER_SORT_FIELDS,
} from './payments-cashier-shifts.constants.js';

export const paymentCashierObjectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

export const paymentCashierExpectedVersionSchema = z
  .number()
  .int()
  .min(0);

export const paymentCashierReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(2_000);

export const paymentCashierIsoDateTimeSchema = z
  .string()
  .datetime({
    offset: true,
  });

export const paymentCashierCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(120)
  .regex(
    /^[A-Z0-9][A-Z0-9._/-]*$/u,
    'Code contains unsupported characters',
  );

export const paymentCashierIdempotencyKeySchema = z
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
    .superRefine(
      (
        value,
        context,
      ) => {
        let amount: Decimal;

        try {
          amount =
            new Decimal(
              value,
            );
        } catch {
          context.addIssue({
            code:
              'custom',

            message:
              'Expected a valid decimal value',
          });

          return;
        }

        if (!amount.isFinite()) {
          context.addIssue({
            code:
              'custom',

            message:
              'Decimal value must be finite',
          });
        }

        if (
          minimum !== null &&
          amount.lessThan(
            minimum,
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              `Decimal value must be at least ${minimum.toString()}`,
          });
        }

        if (
          maximum !== null &&
          amount.greaterThan(
            maximum,
          )
        ) {
          context.addIssue({
            code:
              'custom',

            message:
              `Decimal value must not exceed ${maximum.toString()}`,
          });
        }
      },
    )
    .transform(
      (value) =>
        new Decimal(
          value,
        ).toFixed(),
    );
}

export const paymentCashierNonNegativeDecimalSchema =
  decimalString(
    new Decimal(0),
    null,
  );

export const paymentCashierPositiveDecimalSchema =
  decimalString(
    new Decimal(0),
    null,
  ).refine(
    (value) =>
      new Decimal(
        value,
      ).greaterThan(0),

    'Decimal value must be greater than zero',
  );

export const paymentCashierSignedDecimalSchema =
  decimalString(
    null,
    null,
  );

const optionalText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(
      minimumLength,
    )
    .max(
      maximumLength,
    )
    .optional();

const nullableText = (
  minimumLength: number,
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .min(
      minimumLength,
    )
    .max(
      maximumLength,
    )
    .nullable()
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

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(
    MAX_PAYMENT_CASHIER_PAGE_SIZE,
  )
  .default(
    DEFAULT_PAYMENT_CASHIER_PAGE_SIZE,
  );

export const paymentCashierIdParamsSchema = z
  .object({
    id:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const paymentCashierShiftParamsSchema = z
  .object({
    shiftId:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const paymentCashierPaymentParamsSchema = z
  .object({
    paymentId:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const paymentCashierReceiptParamsSchema = z
  .object({
    receiptId:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const paymentCashierListQuerySchema = z
  .object({
    page:
      pageSchema,

    pageSize:
      pageSizeSchema,

    from:
      paymentCashierIsoDateTimeSchema
        .optional(),

    to:
      paymentCashierIsoDateTimeSchema
        .optional(),

    status:
      z
        .union([
          z.string(),
          z.array(
            z.string(),
          ),
        ])
        .transform(
          (value) =>
            Array.isArray(
              value,
            )
              ? value
              : [value],
        )
        .optional(),

    counterId:
      paymentCashierObjectIdSchema
        .optional(),

    cashierUserId:
      paymentCashierObjectIdSchema
        .optional(),

    paymentMethodConfigurationId:
      paymentCashierObjectIdSchema
        .optional(),

    patientId:
      paymentCashierObjectIdSchema
        .optional(),

    patientAccountId:
      paymentCashierObjectIdSchema
        .optional(),

    invoiceId:
      paymentCashierObjectIdSchema
        .optional(),

    search:
      optionalText(
        2,
        200,
      ),

    sortBy:
      z
        .enum(
          PAYMENT_CASHIER_SORT_FIELDS,
        )
        .default(
          'createdAt',
        ),

    sortDirection:
      z
        .enum([
          'asc',
          'desc',
        ])
        .default(
          'desc',
        ),

    active:
      queryBooleanSchema
        .optional(),
  })
  .strict()
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        value.from !== undefined &&
        value.to !== undefined &&
        Date.parse(
          value.to,
        ) <
          Date.parse(
            value.from,
          )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['to'],

          message:
            'The end timestamp cannot precede the start timestamp',
        });
      }
    },
  );

export const paymentCashierIdempotencyHeadersSchema = z
  .object({
    'idempotency-key':
      paymentCashierIdempotencyKeySchema,

    'x-break-glass-reason':
      z
        .string()
        .trim()
        .min(10)
        .max(1_000)
        .optional(),
  })
  .passthrough();

export const paymentCashierOptionalBreakGlassHeadersSchema = z
  .object({
    'x-break-glass-reason':
      z
        .string()
        .trim()
        .min(10)
        .max(1_000)
        .optional(),
  })
  .passthrough();

const paymentMethodConfigurationFields = {
  code:
    paymentCashierCodeSchema,

  name:
    z
      .string()
      .trim()
      .min(2)
      .max(200),

  description:
    nullableText(
      2,
      2_000,
    ),

  methodCode:
    z.enum(
      paymentMethodCodeValues,
    ),

  methodKind:
    z.enum(
      paymentMethodKindValues,
    ),

  effectiveFrom:
    paymentCashierIsoDateTimeSchema,

  effectiveThrough:
    paymentCashierIsoDateTimeSchema
      .nullable()
      .optional(),

  allowedCurrencies:
    z
      .array(
        z.literal(
          PAYMENT_CASHIER_CURRENCY,
        ),
      )
      .min(1)
      .max(10)
      .refine(
        (values) =>
          new Set(
            values,
          ).size === values.length,

        {
          message:
            'Allowed currencies must be unique',
        },
      ),

  externalReferenceRequired:
    z
      .boolean()
      .default(false),

  bankReferenceRequired:
    z
      .boolean()
      .default(false),

  cardReferenceRequired:
    z
      .boolean()
      .default(false),

  cashEquivalent:
    z
      .boolean()
      .default(false),

  refundEligible:
    z
      .boolean()
      .default(true),

  reversalEligible:
    z
      .boolean()
      .default(true),

  settlementMode:
    z
      .enum(
        paymentSettlementModeValues,
      )
      .default(
        'IMMEDIATE',
      ),

  settlementDelayHours:
    z
      .number()
      .int()
      .min(1)
      .max(8_760)
      .nullable()
      .optional(),

  permissionCodes:
    z
      .array(
        z
          .string()
          .trim()
          .min(3)
          .max(160),
      )
      .max(50)
      .default([]),

  cashLedgerAccountId:
    paymentCashierObjectIdSchema
      .nullable()
      .optional(),

  clearingLedgerAccountId:
    paymentCashierObjectIdSchema
      .nullable()
      .optional(),

  receivableLedgerAccountId:
    paymentCashierObjectIdSchema
      .nullable()
      .optional(),

  externalProviderCode:
    nullableText(
      2,
      100,
    ),

  requiresOpenCashierShift:
    z
      .boolean()
      .default(true),
} as const;

function validatePaymentMethodConfiguration(
  value:
    Readonly<{
      effectiveFrom?: string;
      effectiveThrough?: string | null;
      settlementMode?: string;
      settlementDelayHours?: number | null;
      methodKind?: string;
      cashEquivalent?: boolean;
      cardReferenceRequired?: boolean;
      bankReferenceRequired?: boolean;
    }>,

  context:
    z.RefinementCtx,
): void {
  if (
    value.effectiveFrom !== undefined &&
    value.effectiveThrough !== undefined &&
    value.effectiveThrough !== null &&
    Date.parse(
      value.effectiveThrough,
    ) <
      Date.parse(
        value.effectiveFrom,
      )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['effectiveThrough'],

      message:
        'Effective-through cannot precede effective-from',
    });
  }

  if (
    value.settlementMode === 'DELAYED' &&
    value.settlementDelayHours == null
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['settlementDelayHours'],

      message:
        'Delayed settlement requires a settlement delay',
    });
  }

  if (
    value.settlementMode !== undefined &&
    value.settlementMode !== 'DELAYED' &&
    value.settlementDelayHours != null
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['settlementDelayHours'],

      message:
        'Settlement delay is only valid for delayed settlement',
    });
  }

  if (
    value.methodKind === 'CASH' &&
    (
      value.cashEquivalent !== true ||
      value.settlementMode !== 'IMMEDIATE'
    )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['cashEquivalent'],

      message:
        'Cash methods must be cash-equivalent and settle immediately',
    });
  }

  if (
    value.cardReferenceRequired === true &&
    value.methodKind !== 'CARD'
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['cardReferenceRequired'],

      message:
        'Card-reference requirements are limited to card methods',
    });
  }

  if (
    value.bankReferenceRequired === true &&
    value.methodKind !== 'BANK'
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['bankReferenceRequired'],

      message:
        'Bank-reference requirements are limited to bank methods',
    });
  }
}

export const createPaymentMethodConfigurationSchema = z
  .object(
    paymentMethodConfigurationFields,
  )
  .strict()
  .superRefine(
    validatePaymentMethodConfiguration,
  );

export const updatePaymentMethodConfigurationSchema = z
  .object(
    paymentMethodConfigurationFields,
  )
  .omit({
    code: true,
    methodCode: true,
  })
  .partial()
  .extend({
    expectedVersion:
      paymentCashierExpectedVersionSchema,
  })
  .strict()
  .superRefine(
    validatePaymentMethodConfiguration,
  );

export const changePaymentMethodStatusSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    active:
      z.boolean(),

    reason:
      paymentCashierReasonSchema,
  })
  .strict();

const cashCounterFields = {
  counterCode:
    paymentCashierCodeSchema,

  name:
    z
      .string()
      .trim()
      .min(2)
      .max(200),

  location:
    z
      .string()
      .trim()
      .min(2)
      .max(300),

  departmentId:
    paymentCashierObjectIdSchema
      .nullable()
      .optional(),

  counterType:
    z.enum(
      cashCounterTypeValues,
    ),

  assignedUserIds:
    z
      .array(
        paymentCashierObjectIdSchema,
      )
      .max(
        MAX_COUNTER_ASSIGNEES,
      )
      .default([]),

  allowedPaymentMethodConfigurationIds:
    z
      .array(
        paymentCashierObjectIdSchema,
      )
      .min(1)
      .max(
        MAX_COUNTER_PAYMENT_METHODS,
      ),

  currency:
    z
      .literal(
        PAYMENT_CASHIER_CURRENCY,
      )
      .default(
        PAYMENT_CASHIER_CURRENCY,
      ),

  cashHoldingLimit:
    paymentCashierNonNegativeDecimalSchema,

  openingFloatRequired:
    z
      .boolean()
      .default(true),

  minimumOpeningFloat:
    paymentCashierNonNegativeDecimalSchema
      .default('0'),

  maximumOpeningFloat:
    paymentCashierNonNegativeDecimalSchema
      .default('0'),

  activeShiftPolicy:
    z
      .enum(
        activeShiftPolicyValues,
      )
      .default(
        'CASHIER_AND_COUNTER',
      ),

  supervisorApprovalRequiredForClose:
    z
      .boolean()
      .default(true),

  negativeExpectedCashAllowed:
    z
      .boolean()
      .default(false),
} as const;

function validateCashCounter(
  value:
    Readonly<{
      assignedUserIds?:
        readonly string[];

      allowedPaymentMethodConfigurationIds?:
        readonly string[];

      openingFloatRequired?:
        boolean;

      minimumOpeningFloat?:
        string;

      maximumOpeningFloat?:
        string;
    }>,

  context:
    z.RefinementCtx,
): void {
  if (
    value.assignedUserIds !== undefined &&
    new Set(
      value.assignedUserIds,
    ).size !==
      value.assignedUserIds.length
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['assignedUserIds'],

      message:
        'Assigned users must be unique',
    });
  }

  if (
    value
      .allowedPaymentMethodConfigurationIds !==
      undefined &&
    new Set(
      value
        .allowedPaymentMethodConfigurationIds,
    ).size !==
      value
        .allowedPaymentMethodConfigurationIds
        .length
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        [
          'allowedPaymentMethodConfigurationIds',
        ],

      message:
        'Allowed payment methods must be unique',
    });
  }

  if (
    value.maximumOpeningFloat !== undefined &&
    value.minimumOpeningFloat !== undefined &&
    new Decimal(
      value.maximumOpeningFloat,
    ).lessThan(
      value.minimumOpeningFloat,
    )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['maximumOpeningFloat'],

      message:
        'Maximum opening float cannot be below minimum opening float',
    });
  }

  if (
    value.openingFloatRequired === false &&
    (
      (
        value.minimumOpeningFloat !== undefined &&
        !new Decimal(
          value.minimumOpeningFloat,
        ).isZero()
      ) ||
      (
        value.maximumOpeningFloat !== undefined &&
        !new Decimal(
          value.maximumOpeningFloat,
        ).isZero()
      )
    )
  ) {
    context.addIssue({
      code:
        'custom',

      path:
        ['openingFloatRequired'],

      message:
        'Counters without opening floats must use zero float limits',
    });
  }
}

export const createCashCounterSchema = z
  .object(
    cashCounterFields,
  )
  .strict()
  .superRefine(
    validateCashCounter,
  );

export const updateCashCounterSchema = z
  .object(
    cashCounterFields,
  )
  .omit({
    counterCode: true,
  })
  .partial()
  .extend({
    expectedVersion:
      paymentCashierExpectedVersionSchema,
  })
  .strict()
  .superRefine(
    validateCashCounter,
  );

export const changeCashCounterStatusSchema =
  changePaymentMethodStatusSchema;

export const assignCashCounterUsersSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    assignedUserIds:
      z
        .array(
          paymentCashierObjectIdSchema,
        )
        .max(
          MAX_COUNTER_ASSIGNEES,
        ),

    reason:
      paymentCashierReasonSchema,
  })
  .strict()
  .refine(
    (value) =>
      new Set(
        value.assignedUserIds,
      ).size ===
      value.assignedUserIds.length,

    {
      path:
        ['assignedUserIds'],

      message:
        'Assigned users must be unique',
    },
  );

export const openCashierShiftSchema = z
  .object({
    cashCounterId:
      paymentCashierObjectIdSchema,

    openingFloat:
      paymentCashierNonNegativeDecimalSchema,

    currency:
      z
        .literal(
          PAYMENT_CASHIER_CURRENCY,
        )
        .default(
          PAYMENT_CASHIER_CURRENCY,
        ),

    supervisorUserId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    notes:
      nullableText(
        2,
        4_000,
      ),
  })
  .strict();

export const suspendCashierShiftSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    reason:
      paymentCashierReasonSchema,
  })
  .strict();

export const resumeCashierShiftSchema =
  suspendCashierShiftSchema;

export const handoverCashierShiftSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    handoverToUserId:
      paymentCashierObjectIdSchema,

    notes:
      z
        .string()
        .trim()
        .min(5)
        .max(4_000),
  })
  .strict();

export const beginShiftClosingSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    declaredCash:
      paymentCashierNonNegativeDecimalSchema,

    paymentMethodDeclarations:
      z
        .array(
          z
            .object({
              paymentMethodConfigurationId:
                paymentCashierObjectIdSchema,

              declaredAmount:
                paymentCashierNonNegativeDecimalSchema,
            })
            .strict(),
        )
        .max(
          MAX_COUNTER_PAYMENT_METHODS,
        )
        .default([]),

    varianceReason:
      nullableText(
        5,
        2_000,
      ),

    notes:
      nullableText(
        2,
        4_000,
      ),
  })
  .strict();

export const approveShiftVarianceSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema,

    decisionReason:
      paymentCashierReasonSchema,
  })
  .strict();

export const closeCashierShiftSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    reconciliationId:
      paymentCashierObjectIdSchema,

    closingApprovalRequestId:
      paymentCashierObjectIdSchema,

    overrideApprovalRequestId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    reason:
      nullableText(
        5,
        2_000,
      ),
  })
  .strict();

export const reopenCashierShiftSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema,

    reason:
      paymentCashierReasonSchema,
  })
  .strict();

export const createPaymentIntentSchema = z
  .object({
    patientAccountId:
      paymentCashierObjectIdSchema,

    invoiceId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    purpose:
      z.enum([
        'ACCOUNT_PAYMENT',
        'INVOICE_PAYMENT',
        'PATIENT_DEPOSIT',
        'ADMISSION_DEPOSIT',
        'PROCEDURE_DEPOSIT',
        'GENERAL_ADVANCE',
        'REFUND',
      ]),

    amount:
      paymentCashierPositiveDecimalSchema,

    currency:
      z
        .literal(
          PAYMENT_CASHIER_CURRENCY,
        )
        .default(
          PAYMENT_CASHIER_CURRENCY,
        ),

    paymentMethodConfigurationId:
      paymentCashierObjectIdSchema,

    cashCounterId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    cashShiftId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    externalReference:
      nullableText(
        2,
        240,
      ),

    expiresInMinutes:
      z
        .number()
        .int()
        .min(1)
        .max(
          MAX_PAYMENT_INTENT_TTL_MINUTES,
        )
        .optional(),

    payerName:
      nullableText(
        2,
        300,
      ),

    responsiblePartyType:
      nullableText(
        2,
        80,
      ),
  })
  .strict()
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        value.purpose === 'INVOICE_PAYMENT' &&
        value.invoiceId == null
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['invoiceId'],

          message:
            'Invoice payment intents require an invoice',
        });
      }

      if (
        (
          value.cashCounterId == null
        ) !==
        (
          value.cashShiftId == null
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['cashShiftId'],

          message:
            'Counter and shift references must be supplied together',
        });
      }
    },
  );

export const cancelPaymentIntentSchema =
  suspendCashierShiftSchema;

export const authorizePaymentIntentSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    externalReference:
      z
        .string()
        .trim()
        .min(2)
        .max(240),

    authorizedAt:
      paymentCashierIsoDateTimeSchema,
  })
  .strict();

export const paymentTenderSchema = z
  .object({
    paymentMethodConfigurationId:
      paymentCashierObjectIdSchema,

    amount:
      paymentCashierPositiveDecimalSchema,

    externalReference:
      nullableText(
        2,
        240,
      ),

    maskedReference:
      nullableText(
        2,
        120,
      ),

    referenceType:
      z
        .enum([
          'CARD_AUTHORIZATION',
          'BANK_REFERENCE',
          'CHEQUE_REFERENCE',
          'WALLET_REFERENCE',
          'ONLINE_REFERENCE',
          'OTHER',
        ])
        .optional(),
  })
  .strict();

export const paymentAllocationSchema = z
  .object({
    invoiceId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    accountChargeId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    amount:
      paymentCashierPositiveDecimalSchema,
  })
  .strict()
  .refine(
    (value) =>
      (
        value.invoiceId == null
      ) !==
      (
        value.accountChargeId == null
      ),

    {
      path:
        ['invoiceId'],

      message:
        'Each allocation requires exactly one invoice or account-charge target',
    },
  );

export const collectPaymentSchema = z
  .object({
    patientAccountId:
      paymentCashierObjectIdSchema,

    invoiceId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    paymentIntentId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    cashCounterId:
      paymentCashierObjectIdSchema,

    cashShiftId:
      paymentCashierObjectIdSchema,

    totalAmount:
      paymentCashierPositiveDecimalSchema,

    currency:
      z
        .literal(
          PAYMENT_CASHIER_CURRENCY,
        )
        .default(
          PAYMENT_CASHIER_CURRENCY,
        ),

    tenders:
      z
        .array(
          paymentTenderSchema,
        )
        .min(1)
        .max(
          MAX_SPLIT_TENDERS,
        ),

    allocations:
      z
        .array(
          paymentAllocationSchema,
        )
        .max(
          MAX_PAYMENT_ALLOCATIONS,
        )
        .default([]),

    payerName:
      nullableText(
        2,
        300,
      ),

    responsiblePartyType:
      nullableText(
        2,
        80,
      ),

    receivedAt:
      paymentCashierIsoDateTimeSchema
        .optional(),

    manualPayment:
      z
        .boolean()
        .default(false),

    notes:
      nullableText(
        2,
        4_000,
      ),
  })
  .strict()
  .superRefine(
    (
      value,
      context,
    ) => {
      const total =
        new Decimal(
          value.totalAmount,
        );

      const tenderTotal =
        value.tenders.reduce(
          (
            sum,
            tender,
          ) =>
            sum.plus(
              tender.amount,
            ),

          new Decimal(0),
        );

      const allocationTotal =
        value.allocations.reduce(
          (
            sum,
            allocation,
          ) =>
            sum.plus(
              allocation.amount,
            ),

          new Decimal(0),
        );

      if (
        !tenderTotal.equals(
          total,
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['tenders'],

          message:
            'Tender amounts must equal the payment total exactly',
        });
      }

      if (
        allocationTotal.greaterThan(
          total,
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['allocations'],

          message:
            'Allocation total cannot exceed the payment total',
        });
      }

      const tenderKeys =
        value.tenders.map(
          (tender) =>
            `${tender.paymentMethodConfigurationId}:${tender.externalReference ?? ''}`,
        );

      if (
        new Set(
          tenderKeys,
        ).size !==
        tenderKeys.length
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['tenders'],

          message:
            'Duplicate tender references are not permitted',
        });
      }
    },
  );

export const allocatePaymentSchema = z
  .object({
    expectedPaymentVersion:
      paymentCashierExpectedVersionSchema,

    allocations:
      z
        .array(
          paymentAllocationSchema,
        )
        .min(1)
        .max(
          MAX_PAYMENT_ALLOCATIONS,
        ),
  })
  .strict();

export const reversePaymentAllocationSchema = z
  .object({
    expectedPaymentVersion:
      paymentCashierExpectedVersionSchema,

    allocationIds:
      z
        .array(
          paymentCashierObjectIdSchema,
        )
        .min(1)
        .max(
          MAX_PAYMENT_ALLOCATIONS,
        ),

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(
        value.allocationIds,
      ).size ===
      value.allocationIds.length,

    {
      path:
        ['allocationIds'],

      message:
        'Allocation references must be unique',
    },
  );

export const createDepositSchema = z
  .object({
    paymentId:
      paymentCashierObjectIdSchema,

    patientAccountId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    depositType:
      z.enum([
        'PATIENT',
        'ADMISSION',
        'PROCEDURE',
        'GENERAL_ADVANCE',
      ]),

    admissionId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    procedureReferenceId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    expiresAt:
      paymentCashierIsoDateTimeSchema
        .nullable()
        .optional(),
  })
  .strict()
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        value.depositType === 'ADMISSION' &&
        value.admissionId == null
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['admissionId'],

          message:
            'Admission deposits require an admission reference',
        });
      }

      if (
        value.depositType === 'PROCEDURE' &&
        value.procedureReferenceId == null
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['procedureReferenceId'],

          message:
            'Procedure deposits require a procedure reference',
        });
      }
    },
  );

export const applyDepositSchema = z
  .object({
    expectedDepositVersion:
      paymentCashierExpectedVersionSchema,

    targetPatientAccountId:
      paymentCashierObjectIdSchema,

    targetInvoiceId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    amount:
      paymentCashierPositiveDecimalSchema,
  })
  .strict();

export const transferDepositSchema = z
  .object({
    expectedDepositVersion:
      paymentCashierExpectedVersionSchema,

    destinationPatientId:
      paymentCashierObjectIdSchema,

    destinationPatientAccountId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    amount:
      paymentCashierPositiveDecimalSchema,

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const releaseDepositSchema = z
  .object({
    expectedDepositVersion:
      paymentCashierExpectedVersionSchema,

    amount:
      paymentCashierPositiveDecimalSchema,

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),
  })
  .strict();

export const reprintReceiptSchema = z
  .object({
    copyType:
      z.enum(
        receiptCopyTypeValues,
      ),

    outputFormat:
      z.enum([
        'PRINT',
        'PDF',
      ]),

    reason:
      paymentCashierReasonSchema,
  })
  .strict();

export const createRefundRequestSchema = z
  .object({
    patientAccountId:
      paymentCashierObjectIdSchema,

    paymentId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    depositId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    creditNoteId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    amount:
      paymentCashierPositiveDecimalSchema,

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    supportingReference:
      nullableText(
        2,
        240,
      ),
  })
  .strict()
  .refine(
    (value) =>
      [
        value.paymentId,
        value.depositId,
        value.creditNoteId,
      ].filter(
        (candidate) =>
          candidate != null,
      ).length === 1,

    {
      path:
        ['paymentId'],

      message:
        'Refund requests require exactly one source payment, deposit, or credit note',
    },
  );

export const decideRefundRequestSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    decision:
      z.enum([
        'APPROVE',
        'REJECT',
      ]),

    decisionReason:
      paymentCashierReasonSchema,
  })
  .strict();

export const processRefundSchema = z
  .object({
    expectedRequestVersion:
      paymentCashierExpectedVersionSchema,

    paymentMethodConfigurationId:
      paymentCashierObjectIdSchema,

    cashCounterId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    cashShiftId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    externalReference:
      nullableText(
        2,
        240,
      ),
  })
  .strict()
  .refine(
    (value) =>
      (
        value.cashCounterId == null
      ) ===
      (
        value.cashShiftId == null
      ),

    {
      path:
        ['cashShiftId'],

      message:
        'Counter and shift references must be supplied together',
    },
  );

export const reverseRefundSchema = z
  .object({
    expectedRefundVersion:
      paymentCashierExpectedVersionSchema,

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    approvalRequestId:
      paymentCashierObjectIdSchema,
  })
  .strict();

export const createPaymentReversalSchema = z
  .object({
    paymentId:
      paymentCashierObjectIdSchema,

    amount:
      paymentCashierPositiveDecimalSchema,

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,

    replacementPaymentId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),
  })
  .strict();

export const decidePaymentReversalSchema =
  decideRefundRequestSchema;

export const postPaymentReversalSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    cashCounterId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    cashShiftId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (
        value.cashCounterId == null
      ) ===
      (
        value.cashShiftId == null
      ),

    {
      path:
        ['cashShiftId'],

      message:
        'Counter and shift references must be supplied together',
    },
  );

export const createCashMovementSchema = z
  .object({
    movementType:
      z.enum(
        cashMovementTypeValues,
      ),

    amount:
      paymentCashierPositiveDecimalSchema,

    currency:
      z
        .literal(
          PAYMENT_CASHIER_CURRENCY,
        )
        .default(
          PAYMENT_CASHIER_CURRENCY,
        ),

    sourceCounterId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    sourceShiftId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    destinationCounterId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    destinationShiftId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    destinationSafeReference:
      nullableText(
        2,
        200,
      ),

    sourceDocumentType:
      nullableText(
        2,
        100,
      ),

    sourceDocumentId:
      paymentCashierObjectIdSchema
        .nullable()
        .optional(),

    reasonCode:
      paymentCashierCodeSchema,

    reason:
      paymentCashierReasonSchema,
  })
  .strict()
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        [
          'OPENING_FLOAT',
          'CASH_COLLECTION',
          'CASH_REFUND',
          'CASH_PAID_OUT',
          'CASH_DROP',
          'SAFE_DEPOSIT',
        ].includes(
          value.movementType,
        ) &&
        (
          value.sourceCounterId == null ||
          value.sourceShiftId == null
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['sourceShiftId'],

          message:
            'The cash movement requires a source counter and shift',
        });
      }

      if (
        [
          'COUNTER_TRANSFER',
          'SHIFT_TRANSFER',
        ].includes(
          value.movementType,
        ) &&
        (
          value.sourceCounterId == null ||
          value.destinationCounterId == null
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['destinationCounterId'],

          message:
            'Cash transfers require source and destination counters',
        });
      }

      if (
        value.movementType === 'SHIFT_TRANSFER' &&
        (
          value.sourceShiftId == null ||
          value.destinationShiftId == null
        )
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['destinationShiftId'],

          message:
            'Shift transfers require source and destination shifts',
        });
      }

      if (
        value.movementType === 'SAFE_DEPOSIT' &&
        value.destinationSafeReference == null
      ) {
        context.addIssue({
          code:
            'custom',

          path:
            ['destinationSafeReference'],

          message:
            'Safe deposits require a destination-safe reference',
        });
      }
    },
  );

export const decideCashMovementSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,

    decision:
      z.enum([
        'APPROVE',
        'REJECT',
      ]),

    decisionReason:
      paymentCashierReasonSchema,
  })
  .strict();

export const postCashMovementSchema = z
  .object({
    expectedVersion:
      paymentCashierExpectedVersionSchema,
  })
  .strict();