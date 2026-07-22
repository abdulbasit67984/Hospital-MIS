import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  billingCommonFields,
  billingDecimalExpressionEquals,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingPositiveDecimal,
  billingStringArray,
  billingTimestampedSchemaOptions,
  compareInventoryDecimals,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateEffectiveWindow,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './billing-schema-helpers.js';

import {
  inventoryDecimalParts,
} from './inventory-schema-helpers.js';

export {
  billingCommonFields as assistanceCommonFields,
  billingNonNegativeDecimal as assistanceNonNegativeDecimal,
  billingObjectIdArray as assistanceObjectIdArray,
  billingPositiveDecimal as assistancePositiveDecimal,
  billingStringArray as assistanceStringArray,
  billingTimestampedSchemaOptions as assistanceTimestampedSchemaOptions,
  billingDecimalExpressionEquals as assistanceDecimalExpressionEquals,
  compareInventoryDecimals as compareAssistanceDecimals,
  normalizeBillingCode as normalizeAssistanceCode,
  nullableBillingObjectId as nullableAssistanceObjectId,
};

export const assistanceNullableDecimal = {
  type: Schema.Types.Decimal128,
  default: null,
} as const satisfies SchemaDefinition;


export const assistanceSignedDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const satisfies SchemaDefinition;

export const assistanceEncryptedText = {
  type: String,
  default: null,
  select: false,
  maxlength: 64_000,
} as const;

export const assistanceRequiredEncryptedText = {
  type: String,
  required: true,
  select: false,
  minlength: 16,
  maxlength: 64_000,
} as const;

export const assistanceHash = {
  type: String,
  required: true,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
} as const;

export const nullableAssistanceHash = {
  type: String,
  default: null,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
  select: false,
} as const;

export const nullableMaskedAssistanceReference = {
  type: String,
  default: null,
  immutable: true,
  trim: true,
  maxlength: 64,
} as const;

export interface AssistanceValidatableDocument {
  get(path: string): unknown;
  invalidate(path: string, message: string): void;
}


function alignAssistanceDecimal(
  value: Readonly<{ coefficient: bigint; scale: number }>,
  scale: number,
): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

export function compareAssistanceDecimalSum(
  values: readonly unknown[],
  expected: unknown,
): number {
  const parts = [...values, expected].map((value, index) =>
    inventoryDecimalParts(value, `assistanceDecimalSum[${index}]`),
  );
  const scale = parts.reduce(
    (current, value) => Math.max(current, value.scale),
    0,
  );
  const total = parts
    .slice(0, -1)
    .reduce(
      (sum, value) => sum + alignAssistanceDecimal(value, scale),
      0n,
    );
  const expectedValue = alignAssistanceDecimal(parts.at(-1)!, scale);
  return total < expectedValue ? -1 : total > expectedValue ? 1 : 0;
}

export function validateAssistanceMoneyFields(
  document: AssistanceValidatableDocument,
  paths: readonly string[],
): void {
  for (const path of paths) {
    validateNonNegativeInventoryDecimal(document, path, document.get(path));
  }
}

export function validateAssistancePositiveDecimal(
  document: AssistanceValidatableDocument,
  path: string,
): void {
  validatePositiveInventoryDecimal(document, path, document.get(path));
}

export function requireAssistanceReason(
  document: AssistanceValidatableDocument,
  path: string,
  value: string | null | undefined,
): void {
  if (value == null || value.trim().length < 5) {
    document.invalidate(path, `${path} must contain at least 5 characters`);
  }
}

export function validateAssistanceDateRange(
  document: AssistanceValidatableDocument,
  fromPath: string,
  throughPath: string,
): void {
  validateEffectiveWindow(document, fromPath, throughPath);
}

export function validateAssistanceExpression(
  document: AssistanceValidatableDocument,
  path: string,
  positivePaths: readonly string[],
  negativePaths: readonly string[],
  message: string,
): void {
  try {
    if (
      !billingDecimalExpressionEquals(
        positivePaths.map((candidate) => document.get(candidate)),
        negativePaths.map((candidate) => document.get(candidate)),
        document.get(path),
      )
    ) {
      document.invalidate(path, message);
    }
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error ? error.message : `${path} must be a valid decimal`,
    );
  }
}

export function validateDistinctObjectIds(
  document: AssistanceValidatableDocument,
  path: string,
  values: readonly unknown[],
): void {
  const normalized = values.map((value) => String(value));
  if (new Set(normalized).size !== normalized.length) {
    document.invalidate(path, `${path} cannot contain duplicate identifiers`);
  }
}

export function validateMakerChecker(
  document: AssistanceValidatableDocument,
  makerPath: string,
  checkerPaths: readonly string[],
): void {
  const maker = document.get(makerPath);
  if (maker == null) {
    return;
  }

  const makerId = String(maker);
  for (const checkerPath of checkerPaths) {
    const checker = document.get(checkerPath);
    const checkerValues = Array.isArray(checker) ? checker : [checker];

    if (
      checkerValues.some(
        (value) => value != null && String(value) === makerId,
      )
    ) {
      document.invalidate(
        checkerPath,
        'Maker and checker must be different users',
      );
    }
  }
}