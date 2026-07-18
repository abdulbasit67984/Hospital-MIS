import {
  createHash,
} from 'node:crypto';

import {
  DateTime,
} from 'luxon';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

import type {
  QueuePriorityClass,
  QueueSpecialCategory,
  TriagePriority,
} from '@hospital-mis/database';

import {
  EMERGENCY_OVERRIDE_SCORE,
  OPD_QUEUE_TOKEN_SEQUENCE_NAMESPACE,
  OPD_VISIT_NUMBER_SEQUENCE_NAMESPACE,
  QUEUE_PRIORITY_CLASS_SCORE,
  REGISTRATION_NUMBER_SEQUENCE_NAMESPACE,
  SPECIAL_CATEGORY_PRIORITY_SCORE,
  TRIAGE_PRIORITY_SCORE,
} from './registration-queue.constants.js';

function validationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code:
        'invalid_registration_queue_value',

      message,

      path,
    },
  ]);
}

export function normalizeRegistrationQueueCode(
  value: string,
  path = 'code',
): string {
  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .toLocaleUpperCase('en-US')
      .replace(/\s+/gu, '_');

  if (
    normalized.length < 2 ||
    normalized.length > 40 ||
    !/^[A-Z][A-Z0-9_-]*$/u.test(
      normalized,
    )
  ) {
    throw validationError(
      path,
      'Expected a 2 to 40 character code beginning with a letter',
    );
  }

  return normalized;
}

export function normalizeRegistrationQueueText(
  value: string,
  path = 'value',
  maximumLength = 1_000,
): string {
  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ');

  if (
    normalized.length === 0 ||
    normalized.length > maximumLength
  ) {
    throw validationError(
      path,
      `Expected a non-empty value no longer than ${maximumLength} characters`,
    );
  }

  return normalized;
}

export function normalizeOptionalRegistrationQueueText(
  value: string | null | undefined,
  path = 'value',
  maximumLength = 1_000,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ');

  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.length >
    maximumLength
  ) {
    throw validationError(
      path,
      `Expected a value no longer than ${maximumLength} characters`,
    );
  }

  return normalized;
}

export function normalizeTokenPrefix(
  value: string,
  path = 'tokenPrefix',
): string {
  const normalized =
    value
      .normalize('NFKC')
      .trim()
      .toLocaleUpperCase('en-US')
      .replace(/\s+/gu, '');

  if (
    normalized.length > 10 ||
    !/^[A-Z0-9]*$/u.test(
      normalized,
    )
  ) {
    throw validationError(
      path,
      'Token prefix may contain up to 10 uppercase letters or digits',
    );
  }

  return normalized;
}

export function normalizeServiceDate(
  value: string,
  path = 'serviceDate',
): string {
  const parsed =
    DateTime.fromISO(
      value,
      {
        zone:
          'utc',

        setZone:
          true,
      },
    );

  if (
    !parsed.isValid ||
    value.length !== 10 ||
    parsed.toFormat(
      'yyyy-MM-dd',
    ) !== value
  ) {
    throw validationError(
      path,
      'Expected a valid calendar date in YYYY-MM-DD format',
    );
  }

  return value;
}

export function parseRegistrationQueueDateTime(
  value: string,
  path = 'timestamp',
): Date {
  const parsed =
    DateTime.fromISO(
      value,
      {
        setZone:
          true,
      },
    );

  if (!parsed.isValid) {
    throw validationError(
      path,
      'Expected a valid ISO-8601 timestamp with an offset',
    );
  }

  return parsed
    .toUTC()
    .toJSDate();
}

export function serviceDateForTimestamp(
  timestamp: Date,
  timezone: string,
): string {
  const zoned =
    DateTime
      .fromJSDate(
        timestamp,
        {
          zone:
            'utc',
        },
      )
      .setZone(
        timezone,
      );

  if (!zoned.isValid) {
    throw validationError(
      'timezone',
      'Expected a valid IANA timezone',
    );
  }

  return zoned.toFormat(
    'yyyy-MM-dd',
  );
}

export function buildRegistrationNumberSequenceKey(
  serviceDate: string,
): string {
  return `${REGISTRATION_NUMBER_SEQUENCE_NAMESPACE}.${normalizeServiceDate(serviceDate)}`;
}

export function buildVisitNumberSequenceKey(
  serviceDate: string,
): string {
  return `${OPD_VISIT_NUMBER_SEQUENCE_NAMESPACE}.${normalizeServiceDate(serviceDate)}`;
}

export function buildQueueTokenSequenceKey(
  queueDefinitionId: string,
  serviceDate: string,
): string {
  return [
    OPD_QUEUE_TOKEN_SEQUENCE_NAMESPACE,
    queueDefinitionId,
    normalizeServiceDate(
      serviceDate,
    ),
  ].join('.');
}

export function formatRegistrationNumber(
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  return formatDatedNumber(
    'REG',
    facilityCode,
    serviceDate,
    sequenceValue,
    width,
  );
}

export function formatVisitNumber(
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  return formatDatedNumber(
    'OPD',
    facilityCode,
    serviceDate,
    sequenceValue,
    width,
  );
}

function formatDatedNumber(
  namespace: string,
  facilityCode: string,
  serviceDate: string,
  sequenceValue: number,
  width: number,
): string {
  const normalizedFacilityCode =
    normalizeRegistrationQueueCode(
      facilityCode,
      'facilityCode',
    ).replace(
      /[_-]/gu,
      '',
    );

  const normalizedServiceDate =
    normalizeServiceDate(
      serviceDate,
    );

  if (
    !Number.isSafeInteger(
      sequenceValue,
    ) ||
    sequenceValue < 1
  ) {
    throw validationError(
      'sequenceValue',
      'Sequence value must be a positive safe integer',
    );
  }

  if (
    !Number.isSafeInteger(
      width,
    ) ||
    width < 1 ||
    width > 12
  ) {
    throw validationError(
      'width',
      'Sequence width must be between 1 and 12',
    );
  }

  return [
    namespace,
    normalizedFacilityCode,
    normalizedServiceDate
      .replaceAll(
        '-',
        '',
      ),
    String(
      sequenceValue,
    ).padStart(
      width,
      '0',
    ),
  ].join('-');
}

export function buildQueueTokenLabel(
  tokenPrefix: string,
  tokenNumber: number,
): string {
  if (
    !Number.isSafeInteger(
      tokenNumber,
    ) ||
    tokenNumber < 1
  ) {
    throw validationError(
      'tokenNumber',
      'Token number must be a positive safe integer',
    );
  }

  const prefix =
    normalizeTokenPrefix(
      tokenPrefix,
    );

  return `${prefix}${tokenNumber}`;
}

export function buildActiveVisitKey(
  input: Readonly<{
    patientId: string;
    serviceDate: string;
    departmentId: string;
    clinicId?: string | null;
    servicePointId?: string | null;
  }>,
): string {
  return [
    input.patientId,
    normalizeServiceDate(
      input.serviceDate,
    ),
    input.departmentId,
    input.clinicId ?? '-',
    input.servicePointId ?? '-',
  ].join(':');
}

export function calculateQueuePriorityScore(
  input: Readonly<{
    priorityClass: QueuePriorityClass;
    triagePriority: TriagePriority;
    emergencyOverride: boolean;
    specialCategories: readonly QueueSpecialCategory[];
  }>,
): number {
  const uniqueCategories =
    new Set(
      input.specialCategories,
    );

  return (
    QUEUE_PRIORITY_CLASS_SCORE[
      input.priorityClass
    ] +
    TRIAGE_PRIORITY_SCORE[
      input.triagePriority
    ] +
    (
      input.emergencyOverride
        ? EMERGENCY_OVERRIDE_SCORE
        : 0
    ) +
    (
      uniqueCategories.size *
      SPECIAL_CATEGORY_PRIORITY_SCORE
    )
  );
}

export function registrationQueueLockKey(
  namespace: string,
  ...parts: readonly string[]
): string {
  const digest =
    createHash(
      'sha256',
    )
      .update(
        parts.join(
          '\u001f',
        ),
        'utf8',
      )
      .digest(
        'hex',
      );

  return `${namespace}:${digest}`;
}