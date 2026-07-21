import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  compareInventoryDecimals,
  inventoryCommonFields,
  inventoryDecimalParts,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export const pharmacyCommonFields =
  inventoryCommonFields;

export const nullablePharmacyObjectId = {
  type: Schema.Types.ObjectId,
  default: null,
} as const;

export const pharmacyObjectIdArray = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const;

export const pharmacyStringArray = {
  type: [String],
  required: true,
  default: [],
} as const;

export const pharmacyNonNegativeDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const;

export const pharmacyNullableDecimal = {
  type: Schema.Types.Decimal128,
  default: null,
} as const;

export interface PharmacyValidatableDocument {
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

export function pharmacyDecimalExpressionEquals(
  positiveValues: readonly unknown[],
  negativeValues: readonly unknown[],
  expected: unknown,
): boolean {
  const all = [
    ...positiveValues,
    ...negativeValues,
    expected,
  ].map((value, index) =>
    inventoryDecimalParts(
      value,
      `decimalExpression[${index}]`,
    ),
  );

  const scale = all.reduce(
    (current, value) =>
      Math.max(current, value.scale),
    0,
  );

  const positiveTotal = positiveValues.reduce(
    (total, _value, index) =>
      total + alignDecimal(all[index]!, scale),
    0n,
  );

  const negativeStart = positiveValues.length;
  const negativeTotal = negativeValues.reduce(
    (total, _value, index) =>
      total +
      alignDecimal(
        all[negativeStart + index]!,
        scale,
      ),
    0n,
  );

  return (
    positiveTotal - negativeTotal ===
    alignDecimal(all.at(-1)!, scale)
  );
}

export function pharmacyDecimalProductEquals(
  left: unknown,
  right: unknown,
  expected: unknown,
): boolean {
  const leftParts = inventoryDecimalParts(
    left,
    'decimalProduct.left',
  );
  const rightParts = inventoryDecimalParts(
    right,
    'decimalProduct.right',
  );
  const expectedParts = inventoryDecimalParts(
    expected,
    'decimalProduct.expected',
  );
  const product = {
    coefficient:
      leftParts.coefficient *
      rightParts.coefficient,
    scale:
      leftParts.scale + rightParts.scale,
  };
  const scale = Math.max(
    product.scale,
    expectedParts.scale,
  );

  return (
    alignDecimal(product, scale) ===
    alignDecimal(expectedParts, scale)
  );
}

export function validatePharmacyMoneyBreakdown(
  document: PharmacyValidatableDocument,
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
      !pharmacyDecimalExpressionEquals(
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
  } catch (error) {
    document.invalidate(
      path('netAmount'),
      error instanceof Error
        ? error.message
        : 'Money values must be valid decimals',
    );
  }
}

export function validatePharmacyQuantityChain(
  document: PharmacyValidatableDocument,
  quantities: readonly {
    path: string;
    positive?: boolean;
  }[],
): void {
  for (const quantity of quantities) {
    const value = document.get(quantity.path);

    if (quantity.positive === true) {
      validatePositiveInventoryDecimal(
        document,
        quantity.path,
        value,
      );
    } else {
      validateNonNegativeInventoryDecimal(
        document,
        quantity.path,
        value,
      );
    }
  }

  for (
    let index = 1;
    index < quantities.length;
    index += 1
  ) {
    const previous = quantities[index - 1]!;
    const current = quantities[index]!;

    try {
      if (
        compareInventoryDecimals(
          document.get(current.path),
          document.get(previous.path),
        ) > 0
      ) {
        document.invalidate(
          current.path,
          `${current.path} cannot exceed ${previous.path}`,
        );
      }
    } catch (error) {
      document.invalidate(
        current.path,
        error instanceof Error
          ? error.message
          : `${current.path} must be a valid decimal value`,
      );
    }
  }
}

export function validateAllOrNone(
  document: PharmacyValidatableDocument,
  paths: readonly string[],
  message: string,
): void {
  const populated = paths.filter(
    (path) => document.get(path) != null,
  ).length;

  if (
    populated !== 0 &&
    populated !== paths.length
  ) {
    document.invalidate(paths[0]!, message);
  }
}

export const pharmacyTimestampedSchemaOptions = (
  collection: string,
) =>
  ({
    collection,
    strict: true,
    timestamps: true,
    versionKey: false,
  }) as const;

export const pharmacyImmutableAttributionFields = {
  actorStaffId: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
  },

  occurredAt: {
    type: Date,
    required: true,
    immutable: true,
  },
} as const satisfies SchemaDefinition;