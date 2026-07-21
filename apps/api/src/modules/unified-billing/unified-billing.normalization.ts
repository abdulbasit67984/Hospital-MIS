import Decimal from 'decimal.js';
import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  BillingChargeRuleViolationError,
  BillingPriceResolutionError,
} from './unified-billing.errors.js';

export function normalizeBillingCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._/-]+/gu, '_');
}

export function normalizeBillingText(
  value: string,
): string {
  return value.trim().replaceAll(/\s+/gu, ' ');
}

export function normalizeNullableBillingText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizeBillingText(value);
  return normalized.length === 0 ? null : normalized;
}

export function nullableBillingObjectId(
  value: string | null | undefined,
  path: string,
): Types.ObjectId | null {
  return value == null ? null : toObjectId(value, path);
}

export function billingDecimal128(
  value: string,
  path: string,
): Types.Decimal128 {
  try {
    const decimal = new Decimal(value);

    if (!decimal.isFinite()) {
      throw new Error('not finite');
    }

    return Types.Decimal128.fromString(decimal.toFixed());
  } catch (error) {
    throw new BillingPriceResolutionError(
      `${path} must be a valid exact decimal`,
    );
  }
}

export function nullableBillingDecimal128(
  value: string | null | undefined,
  path: string,
): Types.Decimal128 | null {
  return value == null ? null : billingDecimal128(value, path);
}

export function decimal128ToDecimal(
  value: Types.Decimal128,
): Decimal {
  return new Decimal(value.toString());
}

export function normalizeBillingDecimal(
  value: Decimal.Value,
): string {
  const decimal = new Decimal(value);

  if (!decimal.isFinite()) {
    throw new BillingPriceResolutionError(
      'Financial value must be a finite exact decimal',
    );
  }

  return decimal.toFixed();
}

export function requireNonNegativeBillingDecimal(
  value: Decimal.Value,
  path: string,
): Decimal {
  const decimal = new Decimal(value);

  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new BillingPriceResolutionError(
      `${path} must be a non-negative exact decimal`,
    );
  }

  return decimal;
}

export function requirePositiveBillingDecimal(
  value: Decimal.Value,
  path: string,
): Decimal {
  const decimal = requireNonNegativeBillingDecimal(value, path);

  if (decimal.isZero()) {
    throw new BillingPriceResolutionError(
      `${path} must be greater than zero`,
    );
  }

  return decimal;
}

export function isBillingRecordEffective(
  effectiveFrom: Date,
  effectiveThrough: Date | null,
  at: Date,
): boolean {
  return (
    effectiveFrom.getTime() <= at.getTime() &&
    (effectiveThrough == null || effectiveThrough.getTime() >= at.getTime())
  );
}

export function billingEffectiveFilter(
  at: Date,
): Readonly<Record<string, unknown>> {
  return {
    effectiveFrom: { $lte: at },
    $or: [
      { effectiveThrough: null },
      { effectiveThrough: { $gte: at } },
    ],
  };
}

export function billingPagination(
  page: number,
  pageSize: number,
): Readonly<{
  page: number;
  pageSize: number;
  skip: number;
}> {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

export function billingPage<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  totalItems: number,
): Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0
      ? 0
      : Math.ceil(totalItems / pageSize),
  };
}

export function escapeBillingRegex(
  value: string,
): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function unifiedBillingLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly string[]
): string {
  return [namespace, facilityId, ...parts]
    .map((part) => part.trim())
    .join(':');
}

export function deriveTreatmentPackageType(
  input: Readonly<{
    admissionPackage?: boolean;
    procedurePackage?: boolean;
    maternityPackage?: boolean;
    surgicalPackage?: boolean;
  }>,
): 'ADMISSION' | 'PROCEDURE' | 'SURGERY' | 'MATERNITY' | 'GENERAL' {
  const selected = [
    input.admissionPackage ? 'ADMISSION' : null,
    input.procedurePackage ? 'PROCEDURE' : null,
    input.maternityPackage ? 'MATERNITY' : null,
    input.surgicalPackage ? 'SURGERY' : null,
  ].filter((value): value is 'ADMISSION' | 'PROCEDURE' | 'MATERNITY' | 'SURGERY' => value !== null);

  if (selected.length > 1) {
    throw new BillingChargeRuleViolationError(
      'A treatment package can declare only one specialized package type',
    );
  }

  return selected[0] ?? 'GENERAL';
}

export function allocatePackageAmounts(
  fixedPriceValue: string,
  weightedItems: readonly Readonly<{
    weight: Decimal.Value;
  }>[],
  scale = 2,
): readonly string[] {
  const fixedPrice = requireNonNegativeBillingDecimal(
    fixedPriceValue,
    'fixedPrice',
  );

  if (weightedItems.length === 0) {
    return [];
  }

  const weights = weightedItems.map((item, index) =>
    requireNonNegativeBillingDecimal(item.weight, `items[${index}].weight`),
  );
  const totalWeight = weights.reduce(
    (total, value) => total.plus(value),
    new Decimal(0),
  );

  if (totalWeight.isZero()) {
    const equal = fixedPrice
      .div(weightedItems.length)
      .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    const allocations = weights.map(() => equal);
    const allocatedBeforeLast = allocations
      .slice(0, -1)
      .reduce((total, value) => total.plus(value), new Decimal(0));
    allocations[allocations.length - 1] = fixedPrice.minus(allocatedBeforeLast);
    return allocations.map(normalizeBillingDecimal);
  }

  const allocations = weights.map((weight) =>
    fixedPrice
      .times(weight)
      .div(totalWeight)
      .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP),
  );
  const allocatedBeforeLast = allocations
    .slice(0, -1)
    .reduce((total, value) => total.plus(value), new Decimal(0));
  allocations[allocations.length - 1] = fixedPrice.minus(allocatedBeforeLast);

  return allocations.map(normalizeBillingDecimal);
}

export function pricingSpecificityScore(
  candidate: Readonly<{
    payerOrganizationId: string | null;
    panelPlanId: string | null;
    patientCategoryCode: string | null;
    payerCategoryCode: string | null;
    departmentId: string | null;
    locationId: string | null;
    billingContext: string | null;
    afterHoursOnly: boolean;
  }>,
  request: Readonly<{
    payerOrganizationId?: string | null;
    panelPlanId?: string | null;
    patientCategoryCode?: string | null;
    payerCategoryCode?: string | null;
    departmentId: string | null;
    locationId: string | null;
    billingContext: string;
    afterHours: boolean;
  }>,
): number | null {
  const exactOrWildcard = (
    configured: string | null,
    actual: string | null | undefined,
    score: number,
  ): number | null => {
    if (configured == null) {
      return 0;
    }
    return configured === actual ? score : null;
  };

  const scores = [
    exactOrWildcard(candidate.payerOrganizationId, request.payerOrganizationId, 128),
    exactOrWildcard(candidate.panelPlanId, request.panelPlanId, 64),
    exactOrWildcard(candidate.patientCategoryCode, request.patientCategoryCode, 32),
    exactOrWildcard(candidate.payerCategoryCode, request.payerCategoryCode, 16),
    exactOrWildcard(candidate.departmentId, request.departmentId, 8),
    exactOrWildcard(candidate.locationId, request.locationId, 4),
    exactOrWildcard(candidate.billingContext, request.billingContext, 2),
  ];

  if (scores.some((value) => value === null)) {
    return null;
  }

  if (candidate.afterHoursOnly && !request.afterHours) {
    return null;
  }

  return scores.reduce<number>((total, value) => total + (value ?? 0), 0) +
    (candidate.afterHoursOnly ? 1 : 0);
}