import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  compareInventoryDecimals,
  decimalPartsEqual,
  inventoryDecimalParts,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export function normalizeBillingCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._/-]+/gu, '_');
}

export const billingCommonFields = {
  facilityId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  transactionId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  correlationId: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  schemaVersion: {
    type: Number,
    required: true,
    immutable: true,
    default: 1,
    min: 1,
  },
  version: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    required: true,
  },
} as const satisfies SchemaDefinition;

export const nullableBillingObjectId = {
  type: Schema.Types.ObjectId,
  default: null,
} as const;

export const billingObjectIdArray = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const;

export const billingStringArray = {
  type: [String],
  required: true,
  default: [],
} as const;

export const billingNonNegativeDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const;

export const billingPositiveDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
} as const;

export const billingNullableDecimal = {
  type: Schema.Types.Decimal128,
  default: null,
} as const;

export const billingMoneyFields = {
  grossAmount: billingNonNegativeDecimal,
  discountAmount: billingNonNegativeDecimal,
  taxAmount: billingNonNegativeDecimal,
  welfareAmount: billingNonNegativeDecimal,
  payerAmount: billingNonNegativeDecimal,
  patientAmount: billingNonNegativeDecimal,
  netAmount: billingNonNegativeDecimal,
} as const satisfies SchemaDefinition;

export const billingTimestampedSchemaOptions = (
  collection: string,
) =>
  ({
    collection,
    strict: true,
    timestamps: true,
    versionKey: false,
  }) as const;

export interface BillingValidatableDocument {
  get(path: string): unknown;
  invalidate(
    path: string,
    message: string,
  ): void;
}

function alignDecimal(
  value: Readonly<{
    coefficient: bigint;
    scale: number;
  }>,
  scale: number,
): bigint {
  return (
    value.coefficient *
    10n ** BigInt(scale - value.scale)
  );
}

export function billingDecimalExpressionEquals(
  positiveValues: readonly unknown[],
  negativeValues: readonly unknown[],
  expected: unknown,
): boolean {
  const parts = [
    ...positiveValues,
    ...negativeValues,
    expected,
  ].map((value, index) =>
    inventoryDecimalParts(
      value,
      `billingDecimalExpression[${index}]`,
    ),
  );
  const scale = parts.reduce(
    (current, value) =>
      Math.max(current, value.scale),
    0,
  );
  const positiveTotal = positiveValues.reduce(
    (total, _value, index) =>
      total + alignDecimal(parts[index]!, scale),
    0n,
  );
  const negativeStart = positiveValues.length;
  const negativeTotal = negativeValues.reduce(
    (total, _value, index) =>
      total +
      alignDecimal(
        parts[negativeStart + index]!,
        scale,
      ),
    0n,
  );

  return (
    positiveTotal - negativeTotal ===
    alignDecimal(parts.at(-1)!, scale)
  );
}

export function billingDecimalProductEquals(
  left: unknown,
  right: unknown,
  expected: unknown,
): boolean {
  const leftParts = inventoryDecimalParts(
    left,
    'billingProduct.left',
  );
  const rightParts = inventoryDecimalParts(
    right,
    'billingProduct.right',
  );
  const expectedParts = inventoryDecimalParts(
    expected,
    'billingProduct.expected',
  );
  const product = {
    coefficient:
      leftParts.coefficient *
      rightParts.coefficient,
    scale: leftParts.scale + rightParts.scale,
  };

  return decimalPartsEqual(
    product,
    expectedParts,
  );
}

export function validateBillingMoney(
  document: BillingValidatableDocument,
  prefix = '',
): void {
  const path = (field: string) =>
    prefix.length === 0
      ? field
      : `${prefix}.${field}`;

  for (
    const field of [
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'welfareAmount',
      'payerAmount',
      'patientAmount',
      'netAmount',
    ] as const
  ) {
    validateNonNegativeInventoryDecimal(
      document,
      path(field),
      document.get(path(field)),
    );
  }

  try {
    if (
      !billingDecimalExpressionEquals(
        [
          document.get(path('grossAmount')),
          document.get(path('taxAmount')),
        ],
        [document.get(path('discountAmount'))],
        document.get(path('netAmount')),
      )
    ) {
      document.invalidate(
        path('netAmount'),
        'Net amount must equal gross amount plus tax less discount',
      );
    }

    if (
      !billingDecimalExpressionEquals(
        [
          document.get(path('patientAmount')),
          document.get(path('payerAmount')),
          document.get(path('welfareAmount')),
        ],
        [],
        document.get(path('netAmount')),
      )
    ) {
      document.invalidate(
        path('patientAmount'),
        'Patient, payer, and welfare responsibility must equal net amount',
      );
    }
  } catch (error) {
    document.invalidate(
      path('netAmount'),
      error instanceof Error
        ? error.message
        : 'Money fields must contain valid decimal values',
    );
  }
}

export function validateQuantityPriceGross(
  document: BillingValidatableDocument,
  quantityPath: string,
  pricePath: string,
  grossPath: string,
): void {
  validatePositiveInventoryDecimal(
    document,
    quantityPath,
    document.get(quantityPath),
  );
  validateNonNegativeInventoryDecimal(
    document,
    pricePath,
    document.get(pricePath),
  );

  try {
    if (
      !billingDecimalProductEquals(
        document.get(quantityPath),
        document.get(pricePath),
        document.get(grossPath),
      )
    ) {
      document.invalidate(
        grossPath,
        `${grossPath} must equal ${quantityPath} multiplied by ${pricePath}`,
      );
    }
  } catch (error) {
    document.invalidate(
      grossPath,
      error instanceof Error
        ? error.message
        : 'Quantity and price must be valid decimal values',
    );
  }
}

export function validateEffectiveWindow(
  document: BillingValidatableDocument,
  fromPath: string,
  throughPath: string,
): void {
  const from = document.get(fromPath);
  const through = document.get(throughPath);

  if (
    from instanceof Date &&
    through instanceof Date &&
    through <= from
  ) {
    document.invalidate(
      throughPath,
      `${throughPath} must be after ${fromPath}`,
    );
  }
}

export function validatePercentage(
  document: BillingValidatableDocument,
  path: string,
  value: unknown,
): void {
  validateNonNegativeInventoryDecimal(
    document,
    path,
    value,
  );

  try {
    if (compareInventoryDecimals(value, '100') > 0) {
      document.invalidate(
        path,
        `${path} cannot exceed 100`,
      );
    }
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error
        ? error.message
        : `${path} must be a valid decimal value`,
    );
  }
}

export function validateAllOrNone(
  document: BillingValidatableDocument,
  paths: readonly string[],
  message: string,
): void {
  const populated = paths.filter(
    (path) => document.get(path) != null,
  ).length;

  if (populated !== 0 && populated !== paths.length) {
    document.invalidate(paths[0]!, message);
  }
}

export {
  compareInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';