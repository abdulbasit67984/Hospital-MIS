import {
  RequestValidationError,
} from '@hospital-mis/shared';

import type {
  PatientEncryptedSnapshot,
  PatientMutationDependencies,
  PatientSensitiveSnapshotCryptoPort,
} from './patient.ports.js';

import type {
  GuardianRecord,
  PatientAddressRecord,
  PatientAlertRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  PatientRecord,
  UpdatePatientInput,
} from './patient.types.js';

import type {
  UpdatePatientAddressInput,
  UpdatePatientContactInput,
} from './patient-profile.mutation.types.js';

import {
  calculateAgeYears,
  normalizeCnic,
  normalizeEmailAddress,
  normalizePatientIdentifier,
  normalizePakistanPhone,
  parseNullableDate,
} from './patient.normalization.js';

import {
  sensitivePatientLockKey,
} from './patient.workflow-helpers.js';

export interface EncryptedRestorePayload {
  entityId: string;
  expectedPostVersion: number;
  associatedData: string;
  encryptedSnapshot: PatientEncryptedSnapshot;
  snapshotHash: string;
}

export interface PatientRestoreSnapshot {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  normalizedFullName: string;
  nameSearchTokens: string[];

  localizedNames: Array<{
    locale: string;
    fullName: string;
    normalizedFullName: string;
  }>;

  birthDate: {
    value: string | null;
    precision: PatientRecord['birthDate']['precision'];
    isApproximate: boolean;
    estimatedAgeYears: number | null;
    estimatedAsOfDate: string | null;
  };

  isMinor: boolean;
  guardianRequirement: PatientRecord['guardianRequirement'];
  sexAtBirth: PatientRecord['sexAtBirth'];
  genderIdentity: PatientRecord['genderIdentity'];
  genderDescription: string | null;
  preferredLocale: string;
  nationalityCountryCode: string;
  status: PatientRecord['status'];
  mergeState: PatientRecord['mergeState'];
  mergedIntoPatientId: string | null;
  mergedAt: string | null;
  mergedBy: string | null;
  mergeReason: string | null;
  deceasedAt: string | null;
  statusReason: string | null;
  identityReviewRequired: boolean;
  duplicateReviewRequired: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface GuardianRestoreSnapshot {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  displayName: string;
  normalizedFullName: string;

  localizedNames: Array<{
    locale: string;
    fullName: string;
    normalizedFullName: string;
  }>;

  cnicNormalized: string | null;
  cnicDisplayValue: string | null;
  dateOfBirth: string | null;
  sexAtBirth: GuardianRecord['sexAtBirth'];
  genderIdentity: GuardianRecord['genderIdentity'];
  phoneNormalized: string | null;
  phoneDisplayValue: string | null;
  emailNormalized: string | null;
  address: GuardianRecord['address'];
  preferredLocale: string;
  status: GuardianRecord['status'];
  mergedIntoGuardianId: string | null;
  mergedAt: string | null;
  mergedBy: string | null;
  statusReason: string | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PatientIdentifierRestoreSnapshot {
  issuingFacilityId: string | null;
  identifierType: PatientIdentifierRecord['identifierType'];
  scope: PatientIdentifierRecord['scope'];
  normalizedValue: string;
  displayValue: string;
  issuingCountryCode: string;
  issuingAuthority: string | null;
  isPrimaryIdentity: boolean;
  isPrimaryMrn: boolean;
  verificationStatus: PatientIdentifierRecord['verificationStatus'];
  verifiedAt: string | null;
  verifiedBy: string | null;
  validFrom: string | null;
  expiresAt: string | null;
  status: PatientIdentifierRecord['status'];
  replacedByIdentifierId: string | null;
  statusReason: string | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PatientGuardianRestoreSnapshot {
  relationshipType: PatientGuardianRecord['relationshipType'];
  relationshipDescription: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  livesWithPatient: boolean;
  isFinanciallyResponsible: boolean;
  legalAuthorityStatus: PatientGuardianRecord['legalAuthorityStatus'];
  canConsentToTreatment: boolean;
  canConsentToDisclosure: boolean;
  canReceiveClinicalInformation: boolean;
  authorityBasis: string | null;
  authorityEffectiveFrom: string | null;
  authorityEffectiveTo: string | null;
  verificationStatus: PatientGuardianRecord['verificationStatus'];
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  supportingAttachmentIds: string[];
  isActive: boolean;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PatientContactRestoreSnapshot {
  contactType: PatientContactRecord['contactType'];
  purpose: PatientContactRecord['purpose'];
  normalizedValue: string;
  displayValue: string;
  contactName: string | null;
  relationshipToPatient: string | null;
  relatedGuardianId: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  consentToContact: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  status: PatientContactRecord['status'];
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PatientAddressRestoreSnapshot {
  addressType: PatientAddressRecord['addressType'];
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  isPrimary: boolean;
  validFrom: string | null;
  validTo: string | null;
  status: PatientAddressRecord['status'];
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PatientAlertRestoreSnapshot {
  alertType: PatientAlertRecord['alertType'];
  severity: PatientAlertRecord['severity'];
  visibility: PatientAlertRecord['visibility'];
  title: string;
  details: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PatientAlertRecord['status'];
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ??
    null;
}

function objectIdString(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ??
    null;
}

export function requirePatientSnapshotCrypto(
  dependencies: PatientMutationDependencies,
): PatientSensitiveSnapshotCryptoPort {
  if (
    dependencies.snapshotCrypto ===
    undefined
  ) {
    throw new Error(
      'Patient sensitive snapshot encryption is not configured',
    );
  }

  return dependencies.snapshotCrypto;
}

export function protectedRestorePayload(
  input: Readonly<{
    crypto: PatientSensitiveSnapshotCryptoPort;
    transactionId: string;
    entityType:
      | 'patient'
      | 'guardian'
      | 'patient-identifier'
      | 'patient-guardian'
      | 'patient-contact'
      | 'patient-address'
      | 'patient-alert';
    entityId: string;
    expectedPostVersion: number;
    snapshot: unknown;
  }>,
): EncryptedRestorePayload {
  const associatedData = [
    'hospital-mis',
    'patient-compensation',
    input.transactionId,
    input.entityType,
    input.entityId,
    String(
      input.expectedPostVersion,
    ),
  ].join(':');

  const protectedSnapshot =
    input.crypto.protect(
      input.snapshot,
      associatedData,
    );

  return {
    entityId:
      input.entityId,
    expectedPostVersion:
      input.expectedPostVersion,
    associatedData,
    encryptedSnapshot:
      protectedSnapshot.encryptedValue,
    snapshotHash:
      protectedSnapshot.valueHash,
  };
}

export function patientRestoreSnapshot(
  patient: PatientRecord,
): PatientRestoreSnapshot {
  return {
    firstName:
      patient.firstName,
    middleName:
      patient.middleName,
    lastName:
      patient.lastName,
    preferredName:
      patient.preferredName,
    displayName:
      patient.displayName,
    normalizedFullName:
      patient.normalizedFullName,
    nameSearchTokens: [
      ...patient.nameSearchTokens,
    ],
    localizedNames:
      patient.localizedNames.map(
        (name) => ({
          ...name,
        }),
      ),
    birthDate: {
      value:
        dateString(
          patient.birthDate.value,
        ),
      precision:
        patient.birthDate.precision,
      isApproximate:
        patient.birthDate.isApproximate,
      estimatedAgeYears:
        patient.birthDate.estimatedAgeYears,
      estimatedAsOfDate:
        dateString(
          patient.birthDate
            .estimatedAsOfDate,
        ),
    },
    isMinor:
      patient.isMinor,
    guardianRequirement:
      patient.guardianRequirement,
    sexAtBirth:
      patient.sexAtBirth,
    genderIdentity:
      patient.genderIdentity,
    genderDescription:
      patient.genderDescription,
    preferredLocale:
      patient.preferredLocale,
    nationalityCountryCode:
      patient.nationalityCountryCode,
    status:
      patient.status,
    mergeState:
      patient.mergeState,
    mergedIntoPatientId:
      objectIdString(
        patient.mergedIntoPatientId,
      ),
    mergedAt:
      dateString(
        patient.mergedAt,
      ),
    mergedBy:
      objectIdString(
        patient.mergedBy,
      ),
    mergeReason:
      patient.mergeReason,
    deceasedAt:
      dateString(
        patient.deceasedAt,
      ),
    statusReason:
      patient.statusReason,
    identityReviewRequired:
      patient.identityReviewRequired,
    duplicateReviewRequired:
      patient.duplicateReviewRequired,
    version:
      patient.version,
    updatedBy:
      objectIdString(
        patient.updatedBy,
      ),
    updatedAt:
      patient.updatedAt.toISOString(),
  };
}

export function guardianRestoreSnapshot(
  guardian: GuardianRecord,
): GuardianRestoreSnapshot {
  return {
    firstName:
      guardian.firstName,
    middleName:
      guardian.middleName,
    lastName:
      guardian.lastName,
    displayName:
      guardian.displayName,
    normalizedFullName:
      guardian.normalizedFullName,
    localizedNames:
      guardian.localizedNames.map(
        (name) => ({
          ...name,
        }),
      ),
    cnicNormalized:
      guardian.cnicNormalized,
    cnicDisplayValue:
      guardian.cnicDisplayValue,
    dateOfBirth:
      dateString(
        guardian.dateOfBirth,
      ),
    sexAtBirth:
      guardian.sexAtBirth,
    genderIdentity:
      guardian.genderIdentity,
    phoneNormalized:
      guardian.phoneNormalized,
    phoneDisplayValue:
      guardian.phoneDisplayValue,
    emailNormalized:
      guardian.emailNormalized,
    address: {
      ...guardian.address,
    },
    preferredLocale:
      guardian.preferredLocale,
    status:
      guardian.status,
    mergedIntoGuardianId:
      objectIdString(
        guardian.mergedIntoGuardianId,
      ),
    mergedAt:
      dateString(
        guardian.mergedAt,
      ),
    mergedBy:
      objectIdString(
        guardian.mergedBy,
      ),
    statusReason:
      guardian.statusReason,
    version:
      guardian.version,
    updatedBy:
      objectIdString(
        guardian.updatedBy,
      ),
    updatedAt:
      guardian.updatedAt.toISOString(),
  };
}

export function patientIdentifierRestoreSnapshot(
  identifier: PatientIdentifierRecord,
): PatientIdentifierRestoreSnapshot {
  return {
    issuingFacilityId:
      objectIdString(
        identifier.issuingFacilityId,
      ),
    identifierType:
      identifier.identifierType,
    scope:
      identifier.scope,
    normalizedValue:
      identifier.normalizedValue,
    displayValue:
      identifier.displayValue,
    issuingCountryCode:
      identifier.issuingCountryCode,
    issuingAuthority:
      identifier.issuingAuthority,
    isPrimaryIdentity:
      identifier.isPrimaryIdentity,
    isPrimaryMrn:
      identifier.isPrimaryMrn,
    verificationStatus:
      identifier.verificationStatus,
    verifiedAt:
      dateString(
        identifier.verifiedAt,
      ),
    verifiedBy:
      objectIdString(
        identifier.verifiedBy,
      ),
    validFrom:
      dateString(
        identifier.validFrom,
      ),
    expiresAt:
      dateString(
        identifier.expiresAt,
      ),
    status:
      identifier.status,
    replacedByIdentifierId:
      objectIdString(
        identifier.replacedByIdentifierId,
      ),
    statusReason:
      identifier.statusReason,
    version:
      identifier.version,
    updatedBy:
      objectIdString(
        identifier.updatedBy,
      ),
    updatedAt:
      identifier.updatedAt.toISOString(),
  };
}

export function patientGuardianRestoreSnapshot(
  relationship: PatientGuardianRecord,
): PatientGuardianRestoreSnapshot {
  return {
    relationshipType:
      relationship.relationshipType,
    relationshipDescription:
      relationship.relationshipDescription,
    isPrimary:
      relationship.isPrimary,
    isEmergencyContact:
      relationship.isEmergencyContact,
    livesWithPatient:
      relationship.livesWithPatient,
    isFinanciallyResponsible:
      relationship.isFinanciallyResponsible,
    legalAuthorityStatus:
      relationship.legalAuthorityStatus,
    canConsentToTreatment:
      relationship.canConsentToTreatment,
    canConsentToDisclosure:
      relationship.canConsentToDisclosure,
    canReceiveClinicalInformation:
      relationship.canReceiveClinicalInformation,
    authorityBasis:
      relationship.authorityBasis,
    authorityEffectiveFrom:
      dateString(
        relationship.authorityEffectiveFrom,
      ),
    authorityEffectiveTo:
      dateString(
        relationship.authorityEffectiveTo,
      ),
    verificationStatus:
      relationship.verificationStatus,
    verifiedAt:
      dateString(
        relationship.verifiedAt,
      ),
    verifiedBy:
      objectIdString(
        relationship.verifiedBy,
      ),
    verificationNotes:
      relationship.verificationNotes,
    supportingAttachmentIds:
      relationship.supportingAttachmentIds.map(
        (attachmentId) =>
          attachmentId.toHexString(),
      ),
    isActive:
      relationship.isActive,
    endedAt:
      dateString(
        relationship.endedAt,
      ),
    endedBy:
      objectIdString(
        relationship.endedBy,
      ),
    endReason:
      relationship.endReason,
    version:
      relationship.version,
    updatedBy:
      objectIdString(
        relationship.updatedBy,
      ),
    updatedAt:
      relationship.updatedAt.toISOString(),
  };
}

export function patientContactRestoreSnapshot(
  contact: PatientContactRecord,
): PatientContactRestoreSnapshot {
  return {
    contactType:
      contact.contactType,
    purpose:
      contact.purpose,
    normalizedValue:
      contact.normalizedValue,
    displayValue:
      contact.displayValue,
    contactName:
      contact.contactName,
    relationshipToPatient:
      contact.relationshipToPatient,
    relatedGuardianId:
      objectIdString(
        contact.relatedGuardianId,
      ),
    isPrimary:
      contact.isPrimary,
    isEmergencyContact:
      contact.isEmergencyContact,
    consentToContact:
      contact.consentToContact,
    isVerified:
      contact.isVerified,
    verifiedAt:
      dateString(
        contact.verifiedAt,
      ),
    verifiedBy:
      objectIdString(
        contact.verifiedBy,
      ),
    status:
      contact.status,
    version:
      contact.version,
    updatedBy:
      objectIdString(
        contact.updatedBy,
      ),
    updatedAt:
      contact.updatedAt.toISOString(),
  };
}

export function patientAddressRestoreSnapshot(
  address: PatientAddressRecord,
): PatientAddressRestoreSnapshot {
  return {
    addressType:
      address.addressType,
    line1:
      address.line1,
    line2:
      address.line2,
    landmark:
      address.landmark,
    city:
      address.city,
    district:
      address.district,
    province:
      address.province,
    postalCode:
      address.postalCode,
    countryCode:
      address.countryCode,
    isPrimary:
      address.isPrimary,
    validFrom:
      dateString(
        address.validFrom,
      ),
    validTo:
      dateString(
        address.validTo,
      ),
    status:
      address.status,
    version:
      address.version,
    updatedBy:
      objectIdString(
        address.updatedBy,
      ),
    updatedAt:
      address.updatedAt.toISOString(),
  };
}

export function patientAlertRestoreSnapshot(
  alert: PatientAlertRecord,
): PatientAlertRestoreSnapshot {
  return {
    alertType:
      alert.alertType,
    severity:
      alert.severity,
    visibility:
      alert.visibility,
    title:
      alert.title,
    details:
      alert.details,
    effectiveFrom:
      alert.effectiveFrom.toISOString(),
    effectiveTo:
      dateString(
        alert.effectiveTo,
      ),
    status:
      alert.status,
    resolvedAt:
      dateString(
        alert.resolvedAt,
      ),
    resolvedBy:
      objectIdString(
        alert.resolvedBy,
      ),
    resolutionReason:
      alert.resolutionReason,
    version:
      alert.version,
    updatedBy:
      objectIdString(
        alert.updatedBy,
      ),
    updatedAt:
      alert.updatedAt.toISOString(),
  };
}

function changedFields(
  input: Record<string, unknown>,
): string[] {
  const ignored = new Set([
    'expectedVersion',
    'reason',
    'resolutionReason',
  ]);

  return Object.entries(input)
    .filter(
      ([key, value]) =>
        !ignored.has(key) &&
        value !== undefined,
    )
    .map(
      ([key]) =>
        key,
    )
    .sort();
}

export function patientChangedFields(
  input: UpdatePatientInput,
): string[] {
  return changedFields(
    input as unknown as Record<
      string,
      unknown
    >,
  );
}

export function guardianChangedFields(
  input: Record<string, unknown>,
): string[] {
  return changedFields(input);
}

export function patientContactChangedFields(
  input: UpdatePatientContactInput,
): string[] {
  return changedFields(
    input as unknown as Record<
      string,
      unknown
    >,
  );
}

export function patientAddressChangedFields(
  input: UpdatePatientAddressInput,
): string[] {
  return changedFields(
    input as unknown as Record<
      string,
      unknown
    >,
  );
}

export function assertPatientUpdateConsistency(
  input: UpdatePatientInput,
  current: PatientRecord,
  now: Date,
): void {
  const resultingBirthDate =
    input.birthDate === undefined
      ? current.birthDate.value
      : parseNullableDate(
          input.birthDate.value,
          'body.birthDate.value',
        );

  const resultingPrecision =
    input.birthDate?.precision ??
    current.birthDate.precision;

  const resultingMinor =
    input.isMinor ??
    current.isMinor;

  if (
    resultingBirthDate !== null &&
    resultingPrecision === 'EXACT'
  ) {
    const calculatedMinor =
      calculateAgeYears(
        resultingBirthDate,
        now,
      ) < 18;

    if (
      calculatedMinor !==
      resultingMinor
    ) {
      throw new RequestValidationError([
        {
          code:
            'patient_age_classification_mismatch',
          message:
            'The minor classification does not match the exact date of birth',
          path:
            'body.isMinor',
        },
      ]);
    }
  }

  const resultingRequirement =
    input.guardianRequirement ??
    (
      input.isMinor === undefined
        ? current.guardianRequirement
        : resultingMinor
          ? 'REQUIRED'
          : 'NOT_REQUIRED'
    );

  if (
    resultingMinor &&
    resultingRequirement !== 'REQUIRED'
  ) {
    throw new RequestValidationError([
      {
        code:
          'minor_guardian_requirement_invalid',
        message:
          'Minor patients require guardianRequirement REQUIRED',
        path:
          'body.guardianRequirement',
      },
    ]);
  }

  if (
    !resultingMinor &&
    resultingRequirement === 'REQUIRED'
  ) {
    throw new RequestValidationError([
      {
        code:
          'adult_guardian_requirement_invalid',
        message:
          'Adult patients cannot use the mandatory minor guardian requirement',
        path:
          'body.guardianRequirement',
      },
    ]);
  }
}

export function patientUpdateLockKeys(
  facilityId: string,
  patientId: string,
  input: UpdatePatientInput,
): string[] {
  const keys = new Set<string>([
    `patient:id:${patientId}`,
  ]);

  if (
    input.firstName !== undefined ||
    input.middleName !== undefined ||
    input.lastName !== undefined ||
    input.birthDate !== undefined
  ) {
    keys.add(
      `patient:demographic:${facilityId}:${patientId}`,
    );
  }

  return [
    ...keys,
  ];
}

export function guardianUpdateLockKeys(
  guardianId: string,
  cnic: string | null | undefined,
): string[] {
  const keys = new Set<string>([
    `guardian:id:${guardianId}`,
  ]);

  if (
    cnic !== undefined &&
    cnic !== null &&
    cnic.trim().length > 0
  ) {
    keys.add(
      sensitivePatientLockKey(
        'guardian:cnic',
        normalizeCnic(
          cnic,
          'body.cnic',
        ),
      ),
    );
  }

  return [
    ...keys,
  ];
}

export function patientIdentifierLockKeys(
  patientId: string,
  identifierType: string,
  value: string,
): string[] {
  const normalized =
    normalizePatientIdentifier(
      identifierType as Parameters<
        typeof normalizePatientIdentifier
      >[0],
      value,
    );

  return [
    `patient:id:${patientId}`,
    sensitivePatientLockKey(
      `patient:identity:${identifierType}`,
      normalized,
    ),
  ];
}

export function patientContactLockKeys(
  input: Readonly<{
    patientId: string;
    contactId?: string;
    contactType?: PatientContactRecord['contactType'];
    value?: string;
  }>,
): string[] {
  const keys = new Set<string>([
    `patient:id:${input.patientId}`,
  ]);

  if (
    input.contactId !== undefined
  ) {
    keys.add(
      `patient-contact:id:${input.contactId}`,
    );
  }

  if (
    input.contactType !== undefined &&
    input.value !== undefined
  ) {
    const normalized =
      input.contactType === 'PHONE'
        ? normalizePakistanPhone(
            input.value,
            'body.value',
          )
        : normalizeEmailAddress(
            input.value,
            'body.value',
          );

    keys.add(
      sensitivePatientLockKey(
        `patient:contact:${input.contactType}`,
        normalized,
      ),
    );
  }

  return [
    ...keys,
  ];
}

export function patientAddressLockKeys(
  patientId: string,
  addressId?: string,
): string[] {
  return [
    `patient:id:${patientId}`,

    ...(addressId === undefined
      ? []
      : [
          `patient-address:id:${addressId}`,
        ]),
  ];
}

export function patientAlertLockKeys(
  patientId: string,
  alertId?: string,
): string[] {
  return [
    `patient:id:${patientId}`,

    ...(alertId === undefined
      ? []
      : [
          `patient-alert:id:${alertId}`,
        ]),
  ];
}