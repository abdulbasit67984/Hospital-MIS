import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  billingCommonFields,
  billingNonNegativeDecimal,
  billingNullableDecimal,
  billingTimestampedSchemaOptions,
  normalizeBillingCode,
  nullableBillingObjectId,
  validateEffectiveWindow,
} from './billing-schema-helpers.js';

import {
  compareInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export {
  billingCommonFields as ppcCommonFields,
  billingNonNegativeDecimal as ppcNonNegativeDecimal,
  billingNullableDecimal as ppcNullableDecimal,
  billingTimestampedSchemaOptions as ppcTimestampedSchemaOptions,
  normalizeBillingCode as normalizePpcCode,
  nullableBillingObjectId as nullablePpcObjectId,
  validateEffectiveWindow as validatePpcEffectiveWindow,
};

export const ppcPositiveDecimal = {
  type: Schema.Types.Decimal128,
  required: true,
} as const satisfies SchemaDefinition;

export const ppcStringArray = {
  type: [String],
  required: true,
  default: [],
} as const satisfies SchemaDefinition;

export const ppcObjectIdArray = {
  type: [Schema.Types.ObjectId],
  required: true,
  default: [],
} as const satisfies SchemaDefinition;

export function validatePpcNonNegativeDecimal(
  document: Readonly<{
    get(path: string): unknown;
    invalidate(path: string, message: string): void;
  }>,
  path: string,
  value: unknown,
): void {
  validateNonNegativeInventoryDecimal(document, path, value);
}

export function validatePpcPositiveDecimal(
  document: Readonly<{
    get(path: string): unknown;
    invalidate(path: string, message: string): void;
  }>,
  path: string,
  value: unknown,
): void {
  validatePositiveInventoryDecimal(document, path, value);
}

export function validatePpcPercentage(
  document: Readonly<{
    get(path: string): unknown;
    invalidate(path: string, message: string): void;
  }>,
  path: string,
  value: unknown,
): void {
  validateNonNegativeInventoryDecimal(document, path, value);

  if (compareInventoryDecimals(value, '100') > 0) {
    document.invalidate(path, `${path} cannot exceed 100`);
  }
}

export function requirePpcReason(
  document: Readonly<{
    invalidate(path: string, message: string): void;
  }>,
  path: string,
  value: string | null | undefined,
): void {
  if (value == null || value.trim().length < 5) {
    document.invalidate(path, `${path} must contain at least 5 characters`);
  }
}