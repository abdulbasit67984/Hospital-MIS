import {
  createHash,
} from 'node:crypto';

import {
  DEFAULT_INPATIENT_NUMBER_WIDTH,
} from './inpatient.constants.js';

export function normalizeInpatientCode(
  value:
    string,
): string {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(
      /[^A-Z0-9.-]+/gu,
      '_',
    );
}

export function normalizeInpatientText(
  value:
    string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(
      /\s+/gu,
      ' ',
    );
}

export function displayInpatientText(
  value:
    string,
): string {
  return value
    .trim()
    .replaceAll(
      /\s+/gu,
      ' ',
    );
}

export function nullableInpatientText(
  value:
    string |
    null |
    undefined,
): string | null {
  if (
    value == null
  ) {
    return null;
  }

  const normalized =
    displayInpatientText(
      value,
    );

  return normalized.length ===
    0
    ? null
    : normalized;
}

export function uniqueInpatientCodes(
  values:
    readonly string[],
): string[] {
  return [
    ...new Set(
      values.map(
        normalizeInpatientCode,
      ),
    ),
  ];
}

export function buildInpatientSequenceKey(
  namespace:
    string,

  occurredAt:
    Date,
): string {
  return [
    namespace,
    occurredAt.getUTCFullYear(),
  ].join(':');
}

export function formatInpatientNumber(
  prefix:
    string,

  occurredAt:
    Date,

  sequence:
    number,

  width =
    DEFAULT_INPATIENT_NUMBER_WIDTH,
): string {
  return [
    normalizeInpatientCode(
      prefix,
    ),

    occurredAt
      .getUTCFullYear()
      .toString(),

    sequence
      .toString()
      .padStart(
        width,
        '0',
      ),
  ].join('-');
}

export function buildBedRateScopeKey(
  scope:
    'WARD' |
    'ROOM' |
    'BED' |
    'BED_CATEGORY',

  scopeReferenceId:
    string |
    null,

  scopeCode:
    string |
    null,

  payerOrganizationId:
    string |
    null,

  panelPlanId:
    string |
    null,

  treatmentPackageId:
    string |
    null,
): string {
  const scopeValue =
    scope === 'BED_CATEGORY'
      ? normalizeInpatientCode(
          scopeCode ??
            '',
        )
      : (
          scopeReferenceId ??
          ''
        );

  return [
    scope,
    scopeValue,
    payerOrganizationId ??
      'DEFAULT_PAYER',
    panelPlanId ??
      'DEFAULT_PLAN',
    treatmentPackageId ??
      'DEFAULT_PACKAGE',
  ]
    .map(
      normalizeInpatientCode,
    )
    .join(':');
}

function stableValue(
  value:
    unknown,
): unknown {
  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
      'object' &&
    value !== null &&
    'toHexString' in value &&
    typeof value.toHexString ===
      'function'
  ) {
    return value.toHexString();
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      stableValue,
    );
  }

  if (
    typeof value ===
      'object' &&
    value !== null
  ) {
    return Object.fromEntries(
      Object.entries(
        value,
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
            [key, nestedValue],
          ) => [
            key,
            stableValue(
              nestedValue,
            ),
          ],
        ),
    );
  }

  return value;
}

export function inpatientContentHash(
  value:
    unknown,
): string {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        stableValue(
          value,
        ),
      ),
    )
    .digest(
      'hex',
    );
}

export function inpatientRestoreAssociatedData(
  facilityId:
    string,

  collection:
    string,

  entityId:
    string,

  expectedPostVersion:
    number,
): string {
  return [
    'inpatient-restore',
    facilityId,
    collection,
    entityId,
    expectedPostVersion,
  ].join(':');
}