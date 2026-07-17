import {
  createHash,
} from 'node:crypto';

import {
  ConflictError,
  RequestValidationError,
} from '@hospital-mis/shared';

import {
  PATIENT_DUPLICATE_REASON,
  type PatientDuplicateReason,
} from './patient.constants.js';

import {
  MinorGuardianRequiredError,
  PatientDuplicateBlockedError,
  PatientIdentityConflictError,
  PatientMedicalRecordNumberConflictError,
} from './patient.errors.js';

import {
  buildLegalName,
  calculateAgeYears,
  normalizeCnic,
  normalizePatientIdentifier,
  normalizePakistanPhone,
  normalizeSearchText,
  parseNullableDate,
} from './patient.normalization.js';

import type {
  PatientContactInput,
  PatientDuplicateAssessment,
  PatientDuplicateCandidate,
  PatientIdentifierInput,
  PatientDuplicateCheckInput,
  RegisterPatientInput,
} from './patient.types.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  cause?: unknown;
}

function asMongoLikeError(
  error: unknown,
): MongoLikeError | null {
  return typeof error === 'object' &&
    error !== null
    ? error as MongoLikeError
    : null;
}

function duplicateKeyError(
  error: unknown,
  depth = 0,
): MongoLikeError | null {
  if (depth > 5) {
    return null;
  }

  const candidate =
    asMongoLikeError(error);

  if (candidate === null) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  return candidate.cause === undefined
    ? null
    : duplicateKeyError(
        candidate.cause,
        depth + 1,
      );
}

function hashedValue(
  value: string,
): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

export function sensitivePatientLockKey(
  namespace: string,
  normalizedValue: string,
): string {
  return `${namespace}:${hashedValue(normalizedValue)}`;
}

export function assertPatientRegistrationInput(
  input: RegisterPatientInput,
  now: Date,
): void {
  if (input.isMinor) {
    if (
      input.guardian === undefined ||
      input.guardianRelationship === undefined
    ) {
      throw new MinorGuardianRequiredError();
    }

    normalizeCnic(
      input.guardian.cnic,
      'body.guardian.cnic',
    );
  }

  const birthDate =
    parseNullableDate(
      input.birthDate.value,
      'body.birthDate.value',
    );

  if (
    birthDate !== null &&
    input.birthDate.precision === 'EXACT'
  ) {
    const calculatedMinor =
      calculateAgeYears(
        birthDate,
        now,
      ) < 18;

    if (calculatedMinor !== input.isMinor) {
      throw new RequestValidationError([
        {
          code: 'patient_age_classification_mismatch',
          message:
            'The minor classification does not match the exact date of birth',
          path: 'body.isMinor',
        },
      ]);
    }
  }

  if (
    !input.isMinor &&
    (input.identifiers ?? []).some(
      (identifier: PatientIdentifierInput) =>
        identifier.identifierType === 'B_FORM',
    )
  ) {
    throw new RequestValidationError([
      {
        code: 'adult_b_form_not_allowed',
        message:
          'B-Form identity is only valid for minor patients',
        path: 'body.identifiers',
      },
    ]);
  }
}

export function toPatientDuplicateCheckInput(
  facilityId: string,
  input: RegisterPatientInput,
): PatientDuplicateCheckInput {
  return {
    facilityId,
    firstName:
      input.firstName,
    middleName:
      input.middleName ?? null,
    lastName:
      input.lastName ?? null,
    birthDate:
      input.birthDate,
    isMinor:
      input.isMinor,
    identifiers:
      input.identifiers ?? [],
    phones:
      (input.contacts ?? [])
        .filter(
          (contact: PatientContactInput) =>
            contact.contactType === 'PHONE',
        )
        .map(
          (contact: PatientContactInput) =>
            contact.value,
        ),
    guardianCnic:
      input.guardian?.cnic ?? null,
  };
}

export function patientRegistrationLockKeys(
  facilityId: string,
  input: RegisterPatientInput,
): string[] {
  const keys = new Set<string>();

  for (const identifier of input.identifiers ?? []) {
    const normalized =
      normalizePatientIdentifier(
        identifier.identifierType,
        identifier.value,
      );

    keys.add(
      sensitivePatientLockKey(
        `patient:identity:${identifier.identifierType}`,
        normalized,
      ),
    );
  }

  for (const contact of input.contacts ?? []) {
    if (contact.contactType !== 'PHONE') {
      continue;
    }

    keys.add(
      sensitivePatientLockKey(
        'patient:phone',
        normalizePakistanPhone(
          contact.value,
          'body.contacts',
        ),
      ),
    );
  }

  if (input.guardian !== undefined) {
    keys.add(
      sensitivePatientLockKey(
        'patient:guardian-cnic',
        normalizeCnic(
          input.guardian.cnic,
          'body.guardian.cnic',
        ),
      ),
    );
  }

  const legalName =
    normalizeSearchText(
      buildLegalName({
        firstName:
          input.firstName,
        middleName:
          input.middleName ?? null,
        lastName:
          input.lastName ?? null,
      }),
    );

  const birthDateToken =
    input.birthDate.value ??
    `${input.birthDate.estimatedAgeYears ?? 'UNKNOWN'}:${input.birthDate.estimatedAsOfDate ?? 'UNKNOWN'}`;

  keys.add(
    sensitivePatientLockKey(
      `patient:demographic:${facilityId}`,
      `${legalName}:${birthDateToken}`,
    ),
  );

  return [...keys];
}

export function safePatientRegistrationJournalPayload(
  input: RegisterPatientInput,
): Record<string, unknown> {
  return {
    operation:
      'REGISTER_PATIENT',
    registrationSource:
      input.registrationSource ?? 'RECEPTION',
    identifierTypes:
      (input.identifiers ?? []).map(
        (identifier: PatientIdentifierInput) =>
          identifier.identifierType,
      ),
    contactTypes:
      (input.contacts ?? []).map(
        (contact: PatientContactInput) =>
          contact.contactType,
      ),
    addressCount:
      (input.addresses ?? []).length,
    hasGuardian:
      input.guardian !== undefined,
  };
}

export function duplicateAssessmentBlocksRegistration(
  assessment: PatientDuplicateAssessment,
): boolean {
  if (assessment.blocked) {
    return true;
  }

  return assessment.candidates.some(
    (candidate: PatientDuplicateCandidate) =>
      candidate.reasons.some(
        (reason: PatientDuplicateReason) =>
          reason === PATIENT_DUPLICATE_REASON.EXACT_CNIC ||
          reason === PATIENT_DUPLICATE_REASON.EXACT_B_FORM ||
          reason === PATIENT_DUPLICATE_REASON.EXACT_PASSPORT,
      ),
  );
}

export function assertDuplicateAssessmentAllowsRegistration(
  assessment: PatientDuplicateAssessment,
): void {
  if (
    duplicateAssessmentBlocksRegistration(
      assessment,
    )
  ) {
    throw new PatientDuplicateBlockedError();
  }
}

export function assertRelatedGuardianReferences(
  input: RegisterPatientInput,
  guardianId: string | null,
): void {
  for (const contact of input.contacts ?? []) {
    if (
      contact.relatedGuardianId === undefined ||
      contact.relatedGuardianId === null
    ) {
      continue;
    }

    if (
      guardianId === null ||
      contact.relatedGuardianId !== guardianId
    ) {
      throw new RequestValidationError([
        {
          code: 'invalid_related_guardian',
          message:
            'A patient contact may only reference the guardian resolved by this registration',
          path: 'body.contacts',
        },
      ]);
    }
  }
}

export function throwMappedPatientPersistenceError(
  error: unknown,
): never {
  const duplicate =
    duplicateKeyError(error);

  if (duplicate === null) {
    throw error;
  }

  const keyPattern =
    duplicate.keyPattern ?? {};

  const keyValue =
    duplicate.keyValue ?? {};

  if (
    'normalizedValue' in keyPattern &&
    'identifierType' in keyPattern
  ) {
    const type =
      typeof keyValue['identifierType'] === 'string'
        ? keyValue['identifierType']
        : 'OTHER';

    if (type === 'MRN') {
      throw new PatientMedicalRecordNumberConflictError();
    }

    if (
      type === 'CNIC' ||
      type === 'B_FORM' ||
      type === 'PASSPORT' ||
      type === 'OTHER'
    ) {
      throw new PatientIdentityConflictError(type);
    }
  }

  if ('cnicNormalized' in keyPattern) {
    throw new ConflictError(
      'A guardian with this CNIC already exists in the facility',
    );
  }

  if ('isPrimary' in keyPattern) {
    throw new ConflictError(
      'A primary patient relationship already exists for this record type',
    );
  }

  throw new ConflictError(
    'The patient registration conflicts with an existing record',
  );
}