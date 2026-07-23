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
  billingCommonFields as consultantSharingCommonFields,
  billingNonNegativeDecimal as consultantSharingNonNegativeDecimal,
  billingObjectIdArray as consultantSharingObjectIdArray,
  billingPositiveDecimal as consultantSharingPositiveDecimal,
  billingStringArray as consultantSharingStringArray,
  billingTimestampedSchemaOptions as consultantSharingTimestampedSchemaOptions,
  compareInventoryDecimals as compareConsultantSharingDecimals,
  normalizeBillingCode as normalizeConsultantSharingCode,
  nullableBillingObjectId as nullableConsultantSharingObjectId,
  validateEffectiveWindow as validateConsultantSharingEffectiveWindow,
};

export const consultantSharingNullableDecimal = {
  type: Schema.Types.Decimal128,
  default: null,
} as const satisfies SchemaDefinition;

export const consultantSharingSignedDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
  default: '0',
} as const satisfies SchemaDefinition;

export const consultantSharingHash = {
  type: String,
  required: true,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
} as const;

export const nullableConsultantSharingHash = {
  type: String,
  default: null,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
  select: false,
} as const;

export const consultantSharingEncryptedText = {
  type: String,
  default: null,
  select: false,
  maxlength: 64_000,
} as const;

export const consultantSharingRequiredEncryptedText = {
  type: String,
  required: true,
  select: false,
  minlength: 16,
  maxlength: 64_000,
} as const;

export const consultantSharingMaskedReference = {
  type: String,
  default: null,
  trim: true,
  maxlength: 120,
} as const;

export interface ConsultantSharingValidatableDocument {
  get(path: string): unknown;
  invalidate(path: string, message: string): void;
}

function alignConsultantSharingDecimal(
  value: Readonly<{ coefficient: bigint; scale: number }>,
  scale: number,
): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

export function consultantSharingDecimalExpressionEquals(
  positiveValues: readonly unknown[],
  negativeValues: readonly unknown[],
  expected: unknown,
): boolean {
  return billingDecimalExpressionEquals(
    positiveValues,
    negativeValues,
    expected,
  );
}

export function compareConsultantSharingDecimalSum(
  values: readonly unknown[],
  expected: unknown,
): number {
  const parts = [...values, expected].map((value, index) =>
    inventoryDecimalParts(
      value,
      `consultantSharingDecimalSum[${index}]`,
    ),
  );
  const scale = parts.reduce(
    (current, value) => Math.max(current, value.scale),
    0,
  );
  const total = parts
    .slice(0, -1)
    .reduce(
      (sum, value) =>
        sum + alignConsultantSharingDecimal(value, scale),
      0n,
    );
  const expectedValue = alignConsultantSharingDecimal(
    parts.at(-1)!,
    scale,
  );

  return total < expectedValue ? -1 : total > expectedValue ? 1 : 0;
}

export function validateConsultantSharingMoneyFields(
  document: ConsultantSharingValidatableDocument,
  paths: readonly string[],
): void {
  for (const path of paths) {
    validateNonNegativeInventoryDecimal(
      document,
      path,
      document.get(path),
    );
  }
}

export function validateConsultantSharingPositiveDecimal(
  document: ConsultantSharingValidatableDocument,
  path: string,
): void {
  validatePositiveInventoryDecimal(
    document,
    path,
    document.get(path),
  );
}

export function validateConsultantSharingSignedDecimal(
  document: ConsultantSharingValidatableDocument,
  path: string,
): void {
  try {
    inventoryDecimalParts(document.get(path), path);
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error
        ? error.message
        : `${path} must be a valid decimal value`,
    );
  }
}

export function validateConsultantSharingPercentage(
  document: ConsultantSharingValidatableDocument,
  path: string,
  nullable = false,
): void {
  const value = document.get(path);
  if (nullable && value == null) {
    return;
  }

  try {
    if (
      compareInventoryDecimals(value, '0') < 0 ||
      compareInventoryDecimals(value, '100') > 0
    ) {
      document.invalidate(path, `${path} must be between 0 and 100`);
    }
  } catch (error) {
    document.invalidate(
      path,
      error instanceof Error
        ? error.message
        : `${path} must be a valid percentage`,
    );
  }
}

export function validateConsultantSharingExpression(
  document: ConsultantSharingValidatableDocument,
  expectedPath: string,
  positivePaths: readonly string[],
  negativePaths: readonly string[],
  message: string,
): void {
  try {
    const valid = consultantSharingDecimalExpressionEquals(
      positivePaths.map((path) => document.get(path)),
      negativePaths.map((path) => document.get(path)),
      document.get(expectedPath),
    );
    if (!valid) {
      document.invalidate(expectedPath, message);
    }
  } catch (error) {
    document.invalidate(
      expectedPath,
      error instanceof Error
        ? error.message
        : `${expectedPath} contains invalid decimal values`,
    );
  }
}

export function validateDistinctConsultantSharingObjectIds(
  document: ConsultantSharingValidatableDocument,
  path: string,
  values: readonly unknown[],
): void {
  const normalized = values.map((value) => String(value));
  if (new Set(normalized).size !== normalized.length) {
    document.invalidate(path, `${path} cannot contain duplicate identifiers`);
  }
}

export function validateConsultantSharingMakerChecker(
  document: ConsultantSharingValidatableDocument,
  makerPath: string,
  checkerPaths: readonly string[],
): void {
  const maker = document.get(makerPath);
  if (maker == null) {
    return;
  }

  for (const checkerPath of checkerPaths) {
    const checker = document.get(checkerPath);
    const checkerValues = Array.isArray(checker) ? checker : [checker];
    if (
      checkerValues.some(
        (value) => value != null && String(value) === String(maker),
      )
    ) {
      document.invalidate(
        checkerPath,
        'Maker and checker must be different users',
      );
    }
  }
}

export function requireConsultantSharingReason(
  document: ConsultantSharingValidatableDocument,
  path: string,
  value: string | null | undefined,
): void {
  if (value == null || value.trim().length < 5) {
    document.invalidate(path, `${path} must contain a meaningful reason`);
  }
}

export function validateConsultantSharingEffectiveDates(
  document: ConsultantSharingValidatableDocument,
  fromPath = 'effectiveFrom',
  throughPath = 'effectiveThrough',
): void {
  validateEffectiveWindow(document, fromPath, throughPath);
}

export function validateConsultantSharingImmutableHash(
  document: ConsultantSharingValidatableDocument,
  path = 'immutableHash',
): void {
  const value = document.get(path);
  if (typeof value !== 'string' || !/^[a-f0-9]{64,128}$/u.test(value)) {
    document.invalidate(
      path,
      `${path} must be a lowercase hexadecimal SHA-256 or stronger hash`,
    );
  }
}