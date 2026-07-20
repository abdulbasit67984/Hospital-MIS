import Decimal from 'decimal.js';

export function normalizeInventoryText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeInventoryDisplayText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeNullableInventoryText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = normalizeInventoryDisplayText(value);

  return normalized.length === 0
    ? null
    : normalized;
}

export function normalizeInventoryCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._/-]+/gu, '_')
    .replaceAll(/_{2,}/gu, '_');
}

export function normalizeInventoryCurrency(
  value: string,
): string {
  return value.trim().toUpperCase();
}

export function uniqueInventoryObjectIds(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.map((value) => value.toLowerCase()),
    ),
  ];
}

export function normalizeInventoryDecimal(
  value: string,
  decimalPlaces = 8,
): string {
  const decimal = new Decimal(value);

  if (!decimal.isFinite()) {
    throw new Error('Inventory decimal value must be finite');
  }

  return decimal
    .toDecimalPlaces(
      decimalPlaces,
      Decimal.ROUND_HALF_UP,
    )
    .toFixed();
}

export function decimal128String(
  value: unknown,
): string {
  if (
    value != null &&
    typeof value === 'object' &&
    'toString' in value
  ) {
    return String(value);
  }

  return String(value);
}

export function buildInventorySearchText(
  input: Readonly<{
    itemCode: string;
    name: string;
    barcode?: string | null;
    manufacturerName?: string | null;
  }>,
): string {
  return normalizeInventoryText(
    [
      input.itemCode,
      input.name,
      input.barcode ?? '',
      input.manufacturerName ?? '',
    ].join(' '),
  );
}

export function escapeInventoryRegex(
  value: string,
): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}