import {
  DateTime,
} from 'luxon';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

import {
  CLINICAL_NOTE_NUMBER_SEQUENCE_NAMESPACE,
  ENCOUNTER_NUMBER_SEQUENCE_NAMESPACE,
  PATIENT_PROBLEM_NUMBER_SEQUENCE_NAMESPACE,
} from './clinical-emr.constants.js';

function validationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code: 'invalid_clinical_emr_value',
      message,
      path,
    },
  ]);
}

export function normalizeClinicalText(
  value: string,
  path = 'value',
): string {
  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .replaceAll(/\s+/gu, ' ');

  if (normalized.length === 0) {
    throw validationError(
      path,
      'Expected a non-empty clinical text value',
    );
  }

  return normalized;
}

export function normalizeOptionalClinicalText(
  value: string | null | undefined,
  path = 'value',
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return normalizeClinicalText(
    value,
    path,
  );
}

export function normalizeClinicalCode(
  value: string,
  path = 'code',
): string {
  return normalizeClinicalText(
    value,
    path,
  ).toLocaleUpperCase('en-US');
}

export function normalizeClinicalDisplay(
  value: string,
  path = 'display',
): string {
  return normalizeClinicalText(
    value,
    path,
  );
}

export function normalizeClinicalSearchText(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll(/\s+/gu, ' ');
}

export function normalizeClinicalSynonyms(
  values: readonly string[] | undefined,
): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) =>
          normalizeClinicalDisplay(
            value,
            'synonyms',
          ),
        )
        .filter(Boolean),
    ),
  ];
}

export function normalizeClinicalServiceDate(
  value: string,
  path = 'serviceDate',
): string {
  const parsed =
    DateTime.fromFormat(
      value,
      'yyyy-MM-dd',
      {
        zone: 'utc',
        locale: 'en',
      },
    );

  if (
    !parsed.isValid ||
    parsed.toFormat('yyyy-MM-dd') !== value
  ) {
    throw validationError(
      path,
      'Expected a valid calendar date in YYYY-MM-DD format',
    );
  }

  return value;
}

export function parseClinicalDateTime(
  value: string,
  path = 'dateTime',
): Date {
  const parsed =
    DateTime.fromISO(
      value,
      {
        setZone: true,
      },
    );

  if (!parsed.isValid) {
    throw validationError(
      path,
      'Expected a valid ISO-8601 date-time with an explicit offset',
    );
  }

  return parsed.toUTC().toJSDate();
}

export function normalizeFacilityCodeForClinicalNumber(
  value: string,
): string {
  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .toLocaleUpperCase('en-US')
      .replaceAll(/[^A-Z0-9]/gu, '');

  if (normalized.length === 0) {
    throw validationError(
      'facility.code',
      'Facility code cannot be normalized for clinical numbering',
    );
  }

  return normalized;
}

function normalizeNumberWidth(
  width: number,
): number {
  if (
    !Number.isInteger(width) ||
    width < 4 ||
    width > 12
  ) {
    throw validationError(
      'width',
      'Clinical document number width must be an integer between 4 and 12',
    );
  }

  return width;
}

function formatClinicalNumber(
  prefix: string,
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  if (
    !Number.isSafeInteger(sequenceValue) ||
    sequenceValue < 1
  ) {
    throw validationError(
      'sequenceValue',
      'Clinical sequence value must be a positive safe integer',
    );
  }

  const normalizedDate =
    normalizeClinicalServiceDate(serviceDate);

  const year =
    normalizedDate.slice(0, 4);

  return [
    prefix,
    normalizeFacilityCodeForClinicalNumber(facilityCode),
    year,
    String(sequenceValue).padStart(
      normalizeNumberWidth(width),
      '0',
    ),
  ].join('-');
}

export function buildEncounterNumberSequenceKey(
  serviceDate: string,
): string {
  const normalizedDate =
    normalizeClinicalServiceDate(serviceDate);

  return `${ENCOUNTER_NUMBER_SEQUENCE_NAMESPACE}.${normalizedDate.slice(0, 4)}`;
}

export function buildClinicalNoteNumberSequenceKey(
  serviceDate: string,
): string {
  const normalizedDate =
    normalizeClinicalServiceDate(serviceDate);

  return `${CLINICAL_NOTE_NUMBER_SEQUENCE_NAMESPACE}.${normalizedDate.slice(0, 4)}`;
}

export function buildPatientProblemNumberSequenceKey(
  serviceDate: string,
): string {
  const normalizedDate =
    normalizeClinicalServiceDate(serviceDate);

  return `${PATIENT_PROBLEM_NUMBER_SEQUENCE_NAMESPACE}.${normalizedDate.slice(0, 4)}`;
}

export function formatEncounterNumber(
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  return formatClinicalNumber(
    'ENC',
    facilityCode,
    serviceDate,
    sequenceValue,
    width,
  );
}

export function formatClinicalNoteNumber(
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  return formatClinicalNumber(
    'CLN',
    facilityCode,
    serviceDate,
    sequenceValue,
    width,
  );
}

export function formatPatientProblemNumber(
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  return formatClinicalNumber(
    'PRB',
    facilityCode,
    serviceDate,
    sequenceValue,
    width,
  );
}

export function clinicalEmrLockKey(
  namespace: string,
  facilityId: string,
  ...parts: readonly (string | number | null | undefined)[]
): string {
  const normalizedParts =
    parts.map((part) =>
      part === null ||
      part === undefined
        ? '-'
        : String(part)
            .normalize('NFKC')
            .trim()
            .toLocaleLowerCase('en-US'),
    );

  return [
    namespace,
    facilityId.trim().toLocaleLowerCase('en-US'),
    ...normalizedParts,
  ].join(':');
}

export function buildActiveClinicalCodeKey(
  codeSystem: string,
  code: string,
): string {
  return [
    normalizeClinicalCode(
      codeSystem,
      'codeSystem',
    ),
    normalizeClinicalCode(
      code,
      'code',
    ),
  ].join(':');
}

export function buildActiveAllergyKey(
  recordType: string,
  category: string,
  allergenText: string,
): string {
  return [
    normalizeClinicalCode(
      recordType,
      'recordType',
    ),
    normalizeClinicalCode(
      category,
      'category',
    ),
    normalizeClinicalSearchText(
      normalizeClinicalText(
        allergenText,
        'allergenText',
      ),
    ),
  ].join(':');
}