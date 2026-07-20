export function normalizeNursingCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]+/gu,
      '_',
    )
    .replace(
      /^_+|_+$/gu,
      '',
    );
}

export function normalizeNursingText(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/gu,
      ' ',
    );
}

export function nullableNursingText(
  value: string | null | undefined,
): string | null {
  if (
    value == null
  ) {
    return null;
  }

  const normalized =
    normalizeNursingText(
      value,
    );

  return normalized.length === 0
    ? null
    : normalized;
}

export function nursingLockKey(
  ...parts: readonly string[]
): string {
  return parts
    .map(
      (part) =>
        part
          .trim()
          .toLowerCase(),
    )
    .join(':');
}

export function buildNursingSequenceKey(
  namespace: string,
  occurredAt: Date,
): string {
  return [
    namespace,
    occurredAt
      .getUTCFullYear()
      .toString(),
  ].join(':');
}

export function formatNursingNumber(
  prefix: string,
  occurredAt: Date,
  value: number,
  width = 7,
): string {
  return [
    normalizeNursingCode(
      prefix,
    ),
    occurredAt
      .getUTCFullYear()
      .toString(),
    value
      .toString()
      .padStart(
        width,
        '0',
      ),
  ].join('-');
}

export function nursingRestoreAssociatedData(
  facilityId: string,
  collection: string,
  entityId: string,
  expectedPostVersion: number | null,
): string {
  return [
    'hospital-mis',
    'nursing-medication',
    'compensation',
    facilityId,
    collection,
    entityId,
    expectedPostVersion === null
      ? 'immutable'
      : expectedPostVersion.toString(),
  ].join(':');
}