import {
  createHash,
} from 'node:crypto';

import Decimal from 'decimal.js';

export function normalizeFormularyText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeFormularyCode(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._/-]+/gu, '_')
    .replaceAll(/_{2,}/gu, '_');
}

export function normalizeNullableFormularyText(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .trim()
    .replaceAll(/\s+/gu, ' ');

  return normalized.length === 0
    ? null
    : normalized;
}

export function normalizeOptionalSearchText(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeFormularyText(value);

  return normalized.length === 0
    ? undefined
    : normalized;
}

export function uniqueNormalizedStrings(
  values: readonly string[],
): string[] {
  const result = new Map<string, string>();

  for (const value of values) {
    const displayValue = value
      .normalize('NFKC')
      .trim()
      .replaceAll(/\s+/gu, ' ');

    if (displayValue.length === 0) {
      continue;
    }

    const normalizedValue = normalizeFormularyText(displayValue);

    if (!result.has(normalizedValue)) {
      result.set(
        normalizedValue,
        displayValue,
      );
    }
  }

  return [...result.values()];
}

export function uniqueObjectIdStrings(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.map((value) => value.toLowerCase()),
    ),
  ];
}

export function normalizeDecimalString(
  value: string,
  maximumDecimalPlaces = 6,
): string {
  const decimal = new Decimal(value);

  if (!decimal.isFinite()) {
    throw new Error('Decimal value must be finite');
  }

  return decimal
    .toDecimalPlaces(
      maximumDecimalPlaces,
      Decimal.ROUND_HALF_UP,
    )
    .toFixed();
}

export function isPositiveDecimalString(
  value: string,
): boolean {
  try {
    const decimal = new Decimal(value);

    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
}

export function isNonNegativeDecimalString(
  value: string,
): boolean {
  try {
    const decimal = new Decimal(value);

    return decimal.isFinite() && decimal.gte(0);
  } catch {
    return false;
  }
}

export function buildFormularySearchText(
  input: Readonly<{
    genericName: string;
    brandName?: string | null;
    medicineForm: string;
    strength: string;
    medicineCode?: string;
    formularyCode?: string;
    synonyms?: readonly string[];
  }>,
): string {
  return normalizeFormularyText(
    [
      input.genericName,
      input.brandName,
      input.medicineForm,
      input.strength,
      input.medicineCode,
      input.formularyCode,
      ...(input.synonyms ?? []),
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0,
      )
      .join(' '),
  );
}

export function buildActiveFormularySelectionKey(
  input: Readonly<{
    medicineId: string;
    medicineFormId: string;
    medicineStrengthId: string;
    brandName?: string | null;
  }>,
): string {
  return [
    input.medicineId.toLowerCase(),
    input.medicineFormId.toLowerCase(),
    input.medicineStrengthId.toLowerCase(),
    input.brandName == null
      ? '-'
      : normalizeFormularyText(input.brandName),
  ].join(':');
}

function stableValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) =>
          left.localeCompare(right),
        )
        .map(([key, nestedValue]) => [
          key,
          stableValue(nestedValue),
        ]),
    );
  }

  return value;
}

export function stableFormularyJson(
  value: unknown,
): string {
  return JSON.stringify(
    stableValue(value),
  );
}

export function buildPrescriptionWarningFingerprint(
  input: Readonly<{
    facilityId: string;
    prescriptionId: string;
    prescriptionItemId?: string | null;
    warningType: string;
    warningCode: string;
    patientAllergyId?: string | null;
    conflictingPrescriptionId?: string | null;
    conflictingPrescriptionItemId?: string | null;
    externalReferenceId?: string | null;
  }>,
): string {
  return createHash('sha256')
    .update(
      stableFormularyJson({
        facilityId: input.facilityId,
        prescriptionId: input.prescriptionId,
        prescriptionItemId: input.prescriptionItemId ?? null,
        warningType: input.warningType,
        warningCode: input.warningCode,
        patientAllergyId: input.patientAllergyId ?? null,
        conflictingPrescriptionId:
          input.conflictingPrescriptionId ?? null,
        conflictingPrescriptionItemId:
          input.conflictingPrescriptionItemId ?? null,
        externalReferenceId:
          input.externalReferenceId ?? null,
      }),
      'utf8',
    )
    .digest('hex');
}

export function prescriptionSnapshotAssociatedData(
  facilityId: string,
  prescriptionId: string,
  sequence: number,
): string {
  return [
    'hospital-mis',
    'formulary-prescriptions',
    'prescription-history',
    facilityId,
    prescriptionId,
    String(sequence),
  ].join(':');
}

export function prescriptionIdempotencyResultAssociatedData(
  facilityId: string,
  transactionType: string,
  idempotencyKey: string,
): string {
  return [
    'hospital-mis',
    'formulary-prescriptions',
    'idempotency-result',
    facilityId,
    transactionType,
    idempotencyKey,
  ].join(':');
}