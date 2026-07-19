import {
  createHash,
} from 'node:crypto';

import {
  Types,
} from 'mongoose';

export function normalizeLaboratoryCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9.-]+/gu, '_');
}

export function normalizeLaboratoryText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeNullableLaboratoryText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized =
    value
      .normalize('NFKC')
      .trim();

  return normalized.length === 0
    ? null
    : normalized;
}

export function uniqueLaboratoryStrings(
  values: readonly string[],
): string[] {
  const unique =
    new Map<string, string>();

  for (const value of values) {
    const display =
      value
        .normalize('NFKC')
        .trim();

    if (display.length > 0) {
      unique.set(
        normalizeLaboratoryText(display),
        display,
      );
    }
  }

  return [
    ...unique.values(),
  ];
}

export function uniqueLaboratoryObjectIdStrings(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.map(
        (value) =>
          value.toLowerCase(),
      ),
    ),
  ];
}

export function laboratoryDecimal128(
  value: string,
): Types.Decimal128 {
  return Types.Decimal128.fromString(
    value,
  );
}

export function nullableLaboratoryDecimal128(
  value: string | null | undefined,
): Types.Decimal128 | null {
  return value == null
    ? null
    : laboratoryDecimal128(
        value,
      );
}

function canonicalValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value instanceof
      Types.ObjectId
  ) {
    return value.toHexString();
  }

  if (
    value instanceof
      Types.Decimal128
  ) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(
      canonicalValue,
    );
  }

  if (
    typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )
        .sort(
          (
            [left],
            [right],
          ) =>
            left.localeCompare(
              right,
            ),
        )
        .map(
          (
            [
              key,
              nested,
            ],
          ) => [
            key,
            canonicalValue(
              nested,
            ),
          ],
        ),
    );
  }

  return value;
}

export function laboratoryContentHash(
  value: unknown,
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        canonicalValue(
          value,
        ),
      ),
    )
    .digest('hex');
}

export function laboratoryRestoreAssociatedData(
  facilityId: string,
  collection: string,
  entityId: string,
  expectedPostVersion: number,
): string {
  return [
    'hospital-mis',
    'laboratory',
    'restore',
    facilityId,
    collection,
    entityId,
    String(
      expectedPostVersion,
    ),
  ].join(':');
}