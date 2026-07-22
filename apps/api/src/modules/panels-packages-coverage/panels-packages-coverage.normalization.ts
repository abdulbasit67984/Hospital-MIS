import {
  createHash,
} from 'node:crypto';

import Decimal from 'decimal.js';

import {
  Decimal128,
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

export function normalizePpcCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/gu, '_');
}

export function normalizePpcText(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ');
}

export function normalizeNullablePpcText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizePpcText(value);
  return normalized.length === 0 ? null : normalized;
}

export function ppcObjectId(
  value: string,
  path: string,
): DatabaseObjectId {
  return toObjectId(value, path);
}

export function ppcDecimal(
  value: string,
  path: string,
): Decimal {
  let decimal: Decimal;

  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`${path} must be a valid base-10 decimal value`);
  }

  if (!decimal.isFinite()) {
    throw new Error(`${path} must be finite`);
  }

  return decimal;
}

export function ppcNonNegativeDecimal(
  value: string,
  path: string,
): Decimal {
  const decimal = ppcDecimal(value, path);

  if (decimal.isNegative()) {
    throw new Error(`${path} cannot be negative`);
  }

  return decimal;
}

export function ppcPercentage(
  value: string,
  path: string,
): Decimal {
  const decimal = ppcNonNegativeDecimal(value, path);

  if (decimal.greaterThan(100)) {
    throw new Error(`${path} cannot exceed 100`);
  }

  return decimal;
}

export function normalizePpcDecimal(
  value: Decimal.Value,
): string {
  return new Decimal(value).toFixed();
}

export function ppcDecimal128(
  value: string,
  path: string,
): Decimal128 {
  return Decimal128.fromString(
    normalizePpcDecimal(ppcDecimal(value, path)),
  );
}

export function ppcHashSensitiveReference(
  facilityId: string,
  normalizedReference: string,
): string {
  return createHash('sha256')
    .update(`${facilityId}:${normalizedReference.trim().toUpperCase()}`)
    .digest('hex');
}

export function assertEffectivePeriod(
  effectiveFrom: string,
  effectiveThrough: string | null | undefined,
): void {
  const from = new Date(effectiveFrom);

  if (Number.isNaN(from.getTime())) {
    throw new Error('effectiveFrom must be a valid date-time');
  }

  if (effectiveThrough == null) {
    return;
  }

  const through = new Date(effectiveThrough);

  if (Number.isNaN(through.getTime())) {
    throw new Error('effectiveThrough must be a valid date-time');
  }

  if (through <= from) {
    throw new Error('effectiveThrough must be later than effectiveFrom');
  }
}