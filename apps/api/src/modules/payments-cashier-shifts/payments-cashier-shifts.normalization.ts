import {
  createHash,
} from 'node:crypto';

import Decimal from 'decimal.js';

import {
  Decimal128,
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

import {
  MAX_PAYMENT_CASHIER_PAGE_SIZE,
} from './payments-cashier-shifts.constants.js';

import type {
  PaymentCashierPage,
} from './payments-cashier-shifts.contracts.js';

export function normalizePaymentCashierCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/\s+/gu, '_');
}

export function normalizePaymentCashierText(
  value: string,
): string {
  return value.trim().replaceAll(/\s+/gu, ' ');
}

export function normalizeNullablePaymentCashierText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizePaymentCashierText(value);
  return normalized.length === 0 ? null : normalized;
}

export function paymentCashierObjectId(
  value: string,
  path: string,
): DatabaseObjectId {
  return toObjectId(value, path);
}

export function nullablePaymentCashierObjectId(
  value: string | null | undefined,
  path: string,
): DatabaseObjectId | null {
  return value == null ? null : toObjectId(value, path);
}

export function paymentCashierDecimal(
  value: string,
  path = 'amount',
): Decimal {
  let amount: Decimal;

  try {
    amount = new Decimal(value);
  } catch {
    throw new Error(`${path} must be a valid base-10 decimal value`);
  }

  if (!amount.isFinite()) {
    throw new Error(`${path} must be finite`);
  }

  return amount;
}

export function paymentCashierNonNegativeDecimal(
  value: string,
  path = 'amount',
): Decimal {
  const amount = paymentCashierDecimal(value, path);

  if (amount.isNegative()) {
    throw new Error(`${path} cannot be negative`);
  }

  return amount;
}

export function paymentCashierPositiveDecimal(
  value: string,
  path = 'amount',
): Decimal {
  const amount = paymentCashierDecimal(value, path);

  if (!amount.isPositive()) {
    throw new Error(`${path} must be greater than zero`);
  }

  return amount;
}

export function normalizePaymentCashierDecimal(
  value: Decimal.Value,
): string {
  return new Decimal(value).toFixed();
}

export function paymentCashierDecimal128(
  value: string,
  path = 'amount',
): Decimal128 {
  return Decimal128.fromString(
    normalizePaymentCashierDecimal(
      paymentCashierDecimal(value, path),
    ),
  );
}

export function comparePaymentCashierDecimals(
  left: Decimal.Value,
  right: Decimal.Value,
): number {
  return new Decimal(left).comparedTo(new Decimal(right));
}

export function sumPaymentCashierDecimals(
  values: readonly Decimal.Value[],
): string {
  return normalizePaymentCashierDecimal(
    values.reduce(
      (total, value) => total.plus(value),
      new Decimal(0),
    ),
  );
}

export function paymentCashierPagination(
  pageValue: number,
  pageSizeValue: number,
): Readonly<{
  page: number;
  pageSize: number;
  skip: number;
}> {
  const page = Math.max(1, Math.trunc(pageValue));
  const pageSize = Math.min(
    MAX_PAYMENT_CASHIER_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSizeValue)),
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function paymentCashierPage<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  totalItems: number,
): PaymentCashierPage<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

export function escapePaymentCashierRegex(
  value: string,
): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }

  return value;
}

export function paymentCashierRequestHash(
  value: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

export function paymentCashierSnapshotHash(
  value: unknown,
): string {
  return paymentCashierRequestHash(value);
}

export function paymentCashierLockKey(
  namespace: string,
  ...parts: readonly string[]
): string {
  return [namespace, ...parts.map((part) => part.trim())].join(':');
}

export function paymentCashierOperationKey(
  operation: string,
  facilityId: string,
  idempotencyKey: string,
): string {
  return `${operation}:${facilityId}:${paymentCashierRequestHash(idempotencyKey)}`;
}

export function paymentCashierDate(
  value: string | Date,
  path: string,
): Date {
  const result = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(result.getTime())) {
    throw new Error(`${path} must be a valid timestamp`);
  }

  return result;
}