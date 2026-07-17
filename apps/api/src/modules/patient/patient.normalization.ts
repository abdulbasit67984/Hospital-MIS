import {
  RequestValidationError,
} from '@hospital-mis/shared';

import type {
  PatientIdentifierType,
} from '@hospital-mis/database';

import type {
  PatientBirthDateInput,
} from './patient.types.js';

function validationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code: 'invalid_patient_value',
      message,
      path,
    },
  ]);
}

export function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ');

  return normalized.length > 0
    ? normalized
    : null;
}

export function normalizeHumanName(
  value: string,
  path = 'body.firstName',
): string {
  const normalized =
    normalizeOptionalText(value);

  if (normalized === null) {
    throw validationError(
      path,
      'A non-empty name is required',
    );
  }

  return normalized;
}

export function buildPatientDisplayName(
  input: Readonly<{
    firstName: string;
    middleName?: string | null;
    lastName?: string | null;
    preferredName?: string | null;
  }>,
): string {
  const legalName = [
    normalizeHumanName(
      input.firstName,
      'body.firstName',
    ),
    normalizeOptionalText(
      input.middleName,
    ),
    normalizeOptionalText(
      input.lastName,
    ),
  ]
    .filter(
      (part): part is string =>
        part !== null,
    )
    .join(' ');

  return (
    normalizeOptionalText(
      input.preferredName,
    ) ?? legalName
  );
}

export function buildLegalName(
  input: Readonly<{
    firstName: string;
    middleName?: string | null;
    lastName?: string | null;
  }>,
): string {
  return [
    normalizeHumanName(
      input.firstName,
      'body.firstName',
    ),
    normalizeOptionalText(
      input.middleName,
    ),
    normalizeOptionalText(
      input.lastName,
    ),
  ]
    .filter(
      (part): part is string =>
        part !== null,
    )
    .join(' ');
}

export function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function buildNameSearchTokens(
  value: string,
): string[] {
  return [
    ...new Set(
      normalizeSearchText(value)
        .split(' ')
        .filter(Boolean),
    ),
  ].slice(0, 40);
}

function normalizeThirteenDigitIdentity(
  value: string,
  path: string,
  label: string,
): string {
  const digits = value
    .normalize('NFKC')
    .replace(/\D/gu, '');

  if (!/^\d{13}$/u.test(digits)) {
    throw validationError(
      path,
      `${label} must contain exactly 13 digits`,
    );
  }

  return digits;
}

export function normalizeCnic(
  value: string,
  path = 'body.identifiers',
): string {
  return normalizeThirteenDigitIdentity(
    value,
    path,
    'CNIC',
  );
}

export function normalizeBForm(
  value: string,
  path = 'body.identifiers',
): string {
  return normalizeThirteenDigitIdentity(
    value,
    path,
    'B-Form',
  );
}

export function normalizePassport(
  value: string,
  path = 'body.identifiers',
): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US')
    .replace(/\s+/gu, '');

  if (!/^[A-Z0-9]{3,20}$/u.test(normalized)) {
    throw validationError(
      path,
      'Passport number must contain 3 to 20 letters or digits',
    );
  }

  return normalized;
}

export function normalizeMedicalRecordNumber(
  value: string,
  path = 'mrn',
): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US')
    .replace(/\s+/gu, '')
    .replace(/[^A-Z0-9_-]/gu, '');

  if (
    normalized.length < 3 ||
    normalized.length > 80
  ) {
    throw validationError(
      path,
      'Medical record number format is invalid',
    );
  }

  return normalized;
}

export function normalizePatientIdentifier(
  identifierType: PatientIdentifierType,
  value: string,
  path = 'body.identifiers',
): string {
  switch (identifierType) {
    case 'CNIC':
      return normalizeCnic(value, path);

    case 'B_FORM':
      return normalizeBForm(value, path);

    case 'PASSPORT':
      return normalizePassport(value, path);

    case 'MRN':
      return normalizeMedicalRecordNumber(
        value,
        path,
      );

    case 'OTHER': {
      const normalized = value
        .normalize('NFKC')
        .trim()
        .toLocaleUpperCase('en-US');

      if (
        normalized.length < 1 ||
        normalized.length > 160
      ) {
        throw validationError(
          path,
          'Identifier value is invalid',
        );
      }

      return normalized;
    }

    default:
      throw validationError(
        path,
        'Unsupported patient identifier type',
      );
  }
}

export function maskPatientIdentifier(
  identifierType: PatientIdentifierType,
  normalizedValue: string,
): string {
  if (identifierType === 'MRN') {
    return normalizedValue;
  }

  if (normalizedValue.length <= 4) {
    return '*'.repeat(
      normalizedValue.length,
    );
  }

  return `${'*'.repeat(
    Math.max(
      4,
      normalizedValue.length - 4,
    ),
  )}${normalizedValue.slice(-4)}`;
}

export function normalizePakistanPhone(
  value: string,
  path = 'body.contacts',
): string {
  const compact = value
    .normalize('NFKC')
    .trim()
    .replace(/[\s()-]/gu, '');

  let normalized = compact;

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('0')) {
    normalized = `+92${normalized.slice(1)}`;
  } else if (normalized.startsWith('92')) {
    normalized = `+${normalized}`;
  } else if (
    !normalized.startsWith('+') &&
    /^3\d{9}$/u.test(normalized)
  ) {
    normalized = `+92${normalized}`;
  }

  if (!/^\+\d{7,15}$/u.test(normalized)) {
    throw validationError(
      path,
      'Phone number must be a valid international or Pakistan number',
    );
  }

  return normalized;
}

export function maskPhoneNumber(
  normalizedValue: string,
): string {
  const visible =
    normalizedValue.slice(-4);

  return `${'*'.repeat(
    Math.max(
      3,
      normalizedValue.length - 4,
    ),
  )}${visible}`;
}

export function normalizeEmailAddress(
  value: string,
  path = 'body.contacts',
): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');

  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(
      normalized,
    )
  ) {
    throw validationError(
      path,
      'Email address is invalid',
    );
  }

  return normalized;
}

export function maskEmailAddress(
  normalizedValue: string,
): string {
  const separator =
    normalizedValue.indexOf('@');

  if (separator <= 0) {
    return '***';
  }

  const local =
    normalizedValue.slice(0, separator);

  const domain =
    normalizedValue.slice(separator);

  return `${local.slice(0, 2)}***${domain}`;
}

export function normalizeCountryCode(
  value: string,
  path = 'body.nationalityCountryCode',
): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('en-US');

  if (!/^[A-Z]{2}$/u.test(normalized)) {
    throw validationError(
      path,
      'Country code must contain two letters',
    );
  }

  return normalized;
}

export function normalizeLocale(
  value: string,
  path = 'body.preferredLocale',
): string {
  const normalized = value
    .normalize('NFKC')
    .trim();

  if (
    normalized.length < 2 ||
    normalized.length > 35 ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(
      normalized,
    )
  ) {
    throw validationError(
      path,
      'Locale format is invalid',
    );
  }

  return normalized;
}

export function parseNullableDate(
  value: string | null | undefined,
  path: string,
): Date | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw validationError(
      path,
      'Expected a valid ISO date or date-time',
    );
  }

  return parsed;
}

export function toPatientBirthDateRecord(
  input: PatientBirthDateInput,
): {
  value: Date | null;
  precision: PatientBirthDateInput['precision'];
  isApproximate: boolean;
  estimatedAgeYears: number | null;
  estimatedAsOfDate: Date | null;
} {
  return {
    value:
      parseNullableDate(
        input.value,
        'body.birthDate.value',
      ),
    precision:
      input.precision,
    isApproximate:
      input.isApproximate,
    estimatedAgeYears:
      input.estimatedAgeYears,
    estimatedAsOfDate:
      parseNullableDate(
        input.estimatedAsOfDate,
        'body.birthDate.estimatedAsOfDate',
      ),
  };
}

export function calculateAgeYears(
  birthDate: Date,
  asOfDate: Date,
): number {
  let age =
    asOfDate.getUTCFullYear() -
    birthDate.getUTCFullYear();

  const hasNotReachedBirthday =
    asOfDate.getUTCMonth() <
      birthDate.getUTCMonth() ||
    (
      asOfDate.getUTCMonth() ===
        birthDate.getUTCMonth() &&
      asOfDate.getUTCDate() <
        birthDate.getUTCDate()
    );

  if (hasNotReachedBirthday) {
    age -= 1;
  }

  return Math.max(0, age);
}

export function isMinorOnDate(
  birthDate: Date,
  asOfDate: Date,
): boolean {
  return calculateAgeYears(
    birthDate,
    asOfDate,
  ) < 18;
}