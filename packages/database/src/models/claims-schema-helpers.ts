import {
  Schema,
  type SchemaDefinition,
} from 'mongoose';

import {
  billingCommonFields,
  billingNonNegativeDecimal,
  billingObjectIdArray,
  billingPositiveDecimal,
  billingStringArray,
  billingTimestampedSchemaOptions,
  nullableBillingObjectId,
} from './billing-schema-helpers.js';

import {
  compareInventoryDecimals,
  validateNonNegativeInventoryDecimal,
  validatePositiveInventoryDecimal,
} from './inventory-schema-helpers.js';

export {
  billingCommonFields as claimCommonFields,
  billingNonNegativeDecimal as claimNonNegativeDecimal,
  billingObjectIdArray as claimObjectIdArray,
  billingPositiveDecimal as claimPositiveDecimal,
  billingStringArray as claimStringArray,
  billingTimestampedSchemaOptions as claimTimestampedSchemaOptions,
  nullableBillingObjectId as nullableClaimObjectId,
};

export const claimNullableDecimal = {
  type: Schema.Types.Decimal128,
  default: null,
} as const satisfies SchemaDefinition;

export const claimEncryptedText = {
  type: String,
  default: null,
  select: false,
  maxlength: 64_000,
} as const;

export const claimHash = {
  type: String,
  required: true,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
} as const;

export const nullableClaimHash = {
  type: String,
  default: null,
  immutable: true,
  trim: true,
  lowercase: true,
  minlength: 64,
  maxlength: 128,
  select: false,
} as const;

export const nullableMaskedClaimReference = {
  type: String,
  default: null,
  immutable: true,
  trim: true,
  maxlength: 64,
} as const;

export interface ClaimValidatableDocument {
  get(path: string): unknown;
  invalidate(path: string, message: string): void;
}

export function validateClaimNonNegativeDecimal(
  document: ClaimValidatableDocument,
  path: string,
): void {
  validateNonNegativeInventoryDecimal(
    document,
    path,
    document.get(path),
  );
}

export function validateClaimPositiveDecimal(
  document: ClaimValidatableDocument,
  path: string,
): void {
  validatePositiveInventoryDecimal(
    document,
    path,
    document.get(path),
  );
}

export function validateClaimMoneyFields(
  document: ClaimValidatableDocument,
  fields: readonly string[],
): void {
  for (const field of fields) {
    validateClaimNonNegativeDecimal(document, field);
  }
}

export function compareClaimDecimals(
  left: unknown,
  right: unknown,
): number {
  return compareInventoryDecimals(left, right);
}

export function requireClaimReason(
  document: Readonly<{
    invalidate(path: string, message: string): void;
  }>,
  path: string,
  value: string | null | undefined,
): void {
  if (value == null || value.trim().length < 5) {
    document.invalidate(
      path,
      `${path} must contain at least 5 characters`,
    );
  }
}

export function validateClaimDateRange(
  document: ClaimValidatableDocument,
  fromPath: string,
  throughPath: string,
): void {
  const from = document.get(fromPath);
  const through = document.get(throughPath);

  if (
    from instanceof Date &&
    through instanceof Date &&
    through.getTime() < from.getTime()
  ) {
    document.invalidate(
      throughPath,
      `${throughPath} cannot be earlier than ${fromPath}`,
    );
  }
}