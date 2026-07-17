import type {
  PatientAlertSeverity,
} from '@hospital-mis/database';

import type {
  CanonicalPatientResolution,
} from './patient.merge.js';

import type {
  GuardianProfileDto,
  GuardianProfileRecords,
  GuardianSearchCandidateRecord,
  GuardianSearchItemDto,
  PatientAddressDto,
  PatientAlertDto,
  PatientBirthSummaryDto,
  PatientContactDto,
  PatientGuardianDto,
  PatientIdentifierDto,
  PatientProfileDto,
  PatientProfileRecords,
  PatientQueryAccessLevel,
  PatientSearchCandidateRecord,
  PatientSearchItemDto,
} from './patient.query.types.js';

import type {
  GuardianRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
} from './patient.types.js';

const severityRank:
  Readonly<Record<PatientAlertSeverity, number>> = {
    INFO:
      1,
    WARNING:
      2,
    CRITICAL:
      3,
  };

function calculateAgeYears(
  birthDate: Date,
  at: Date,
): number {
  let age =
    at.getUTCFullYear() -
    birthDate.getUTCFullYear();

  const monthDifference =
    at.getUTCMonth() -
    birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      at.getUTCDate() <
        birthDate.getUTCDate()
    )
  ) {
    age -= 1;
  }

  return Math.max(
    0,
    age,
  );
}

function birthSummary(
  input: Readonly<{
    value: Date | null;
    precision: PatientBirthSummaryDto['precision'];
    isApproximate: boolean;
    estimatedAgeYears: number | null;
  }>,
  accessLevel: PatientQueryAccessLevel,
  now: Date,
): PatientBirthSummaryDto {
  return {
    value:
      accessLevel === 'SENSITIVE'
        ? input.value?.toISOString() ??
          null
        : null,

    year:
      input.value?.getUTCFullYear() ??
      (
        input.estimatedAgeYears === null
          ? null
          : now.getUTCFullYear() -
            input.estimatedAgeYears
      ),

    precision:
      input.precision,

    isApproximate:
      input.isApproximate,

    estimatedAgeYears:
      input.estimatedAgeYears,

    ageYears:
      input.value === null
        ? input.estimatedAgeYears
        : calculateAgeYears(
            input.value,
            now,
          ),
  };
}

function guardianById(
  guardians:
    readonly GuardianRecord[],
): Map<string, GuardianRecord> {
  return new Map(
    guardians.map(
      (guardian) => [
        guardian._id.toHexString(),
        guardian,
      ],
    ),
  );
}

function primaryMrn(
  identifiers:
    readonly PatientIdentifierRecord[],
): PatientIdentifierRecord {
  const mrn =
    identifiers.find(
      (identifier) =>
        identifier.identifierType ===
          'MRN' &&
        identifier.isPrimaryMrn &&
        identifier.status ===
          'ACTIVE',
    );

  if (mrn === undefined) {
    throw new Error(
      'Patient profile has no active primary medical record number',
    );
  }

  return mrn;
}

export function highestAlertSeverity(
  severities:
    readonly PatientAlertSeverity[],
): PatientAlertSeverity | null {
  return severities.reduce<
    PatientAlertSeverity | null
  >(
    (highest, severity) =>
      highest === null ||
      severityRank[severity] >
        severityRank[highest]
        ? severity
        : highest,
    null,
  );
}

export function toPatientSearchItemDto(
  candidate:
    PatientSearchCandidateRecord,
  input: Readonly<{
    accessLevel: PatientQueryAccessLevel;
    now: Date;
    redirectedFromPatientIds?: readonly string[];
  }>,
): PatientSearchItemDto {
  const patient =
    candidate.patient;

  return {
    id:
      patient._id.toHexString(),

    enterprisePatientId:
      patient.enterprisePatientId,

    mrn:
      candidate.primaryMrn.displayValue,

    displayName:
      patient.displayName,

    preferredName:
      patient.preferredName,

    birth:
      birthSummary(
        {
          value:
            patient.birthDate.value,
          precision:
            patient.birthDate.precision,
          isApproximate:
            patient.birthDate.isApproximate,
          estimatedAgeYears:
            patient.birthDate.estimatedAgeYears,
        },
        input.accessLevel,
        input.now,
      ),

    sexAtBirth:
      patient.sexAtBirth,

    genderIdentity:
      patient.genderIdentity,

    isMinor:
      patient.isMinor,

    guardianRequirement:
      patient.guardianRequirement,

    status:
      patient.status,

    mergeState:
      patient.mergeState,

    duplicateReviewRequired:
      patient.duplicateReviewRequired,

    primaryContact:
      candidate.primaryContact === null
        ? null
        : input.accessLevel ===
            'SENSITIVE'
          ? candidate.primaryContact
              .normalizedValue
          : candidate.primaryContact
              .displayValue,

    activeAlertCount:
      candidate.activeAlertCount,

    highestAlertSeverity:
      candidate.highestAlertSeverity,

    matchedBy: [
      ...candidate.matchedBy,
    ],

    redirectedFromPatientIds: [
      ...(input.redirectedFromPatientIds ??
        []),
    ],
  };
}

function toIdentifierDto(
  identifier:
    PatientIdentifierRecord,
  accessLevel:
    PatientQueryAccessLevel,
): PatientIdentifierDto {
  return {
    id:
      identifier._id.toHexString(),

    identifierType:
      identifier.identifierType,

    value:
      accessLevel === 'SENSITIVE'
        ? identifier.normalizedValue
        : identifier.displayValue,

    displayValue:
      identifier.displayValue,

    verificationStatus:
      identifier.verificationStatus,

    status:
      identifier.status,

    isPrimaryIdentity:
      identifier.isPrimaryIdentity,

    isPrimaryMrn:
      identifier.isPrimaryMrn,

    validFrom:
      identifier.validFrom?.toISOString() ??
      null,

    expiresAt:
      identifier.expiresAt?.toISOString() ??
      null,
  };
}

function toContactDto(
  contact:
    PatientProfileRecords['contacts'][number],
  accessLevel:
    PatientQueryAccessLevel,
): PatientContactDto {
  return {
    id:
      contact._id.toHexString(),

    contactType:
      contact.contactType,

    purpose:
      contact.purpose,

    value:
      accessLevel === 'SENSITIVE'
        ? contact.normalizedValue
        : contact.displayValue,

    displayValue:
      contact.displayValue,

    contactName:
      contact.contactName,

    relationshipToPatient:
      contact.relationshipToPatient,

    relatedGuardianId:
      contact.relatedGuardianId
        ?.toHexString() ??
      null,

    isPrimary:
      contact.isPrimary,

    isEmergencyContact:
      contact.isEmergencyContact,

    consentToContact:
      contact.consentToContact,

    isVerified:
      contact.isVerified,

    status:
      contact.status,
  };
}

function toAddressDto(
  address:
    PatientProfileRecords['addresses'][number],
  accessLevel:
    PatientQueryAccessLevel,
): PatientAddressDto {
  const sensitive =
    accessLevel === 'SENSITIVE';

  return {
    id:
      address._id.toHexString(),

    addressType:
      address.addressType,

    line1:
      sensitive
        ? address.line1
        : null,

    line2:
      sensitive
        ? address.line2
        : null,

    landmark:
      sensitive
        ? address.landmark
        : null,

    city:
      address.city,

    district:
      address.district,

    province:
      address.province,

    postalCode:
      sensitive
        ? address.postalCode
        : null,

    countryCode:
      address.countryCode,

    isPrimary:
      address.isPrimary,

    validFrom:
      address.validFrom?.toISOString() ??
      null,

    validTo:
      address.validTo?.toISOString() ??
      null,

    status:
      address.status,
  };
}

function toGuardianDto(
  relationship:
    PatientGuardianRecord,
  guardian:
    GuardianRecord,
  accessLevel:
    PatientQueryAccessLevel,
): PatientGuardianDto {
  const sensitive =
    accessLevel === 'SENSITIVE';

  return {
    relationshipId:
      relationship._id.toHexString(),

    guardianId:
      guardian._id.toHexString(),

    displayName:
      guardian.displayName,

    relationshipType:
      relationship.relationshipType,

    relationshipDescription:
      sensitive
        ? relationship.relationshipDescription
        : null,

    cnic:
      sensitive
        ? guardian.cnicNormalized
        : guardian.cnicDisplayValue,

    cnicDisplayValue:
      guardian.cnicDisplayValue,

    phone:
      sensitive
        ? guardian.phoneNormalized
        : guardian.phoneDisplayValue,

    phoneDisplayValue:
      guardian.phoneDisplayValue,

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

    verificationStatus:
      relationship.verificationStatus,

    canConsentToTreatment:
      relationship.canConsentToTreatment,

    canConsentToDisclosure:
      relationship.canConsentToDisclosure,

    canReceiveClinicalInformation:
      relationship.canReceiveClinicalInformation,

    authorityEffectiveFrom:
      relationship.authorityEffectiveFrom
        ?.toISOString() ??
      null,

    authorityEffectiveTo:
      relationship.authorityEffectiveTo
        ?.toISOString() ??
      null,

    isActive:
      relationship.isActive,
  };
}

function toAlertDto(
  alert:
    PatientProfileRecords['alerts'][number],
  accessLevel:
    PatientQueryAccessLevel,
): PatientAlertDto | null {
  if (
    alert.visibility === 'RESTRICTED' &&
    accessLevel !== 'SENSITIVE'
  ) {
    return null;
  }

  return {
    id:
      alert._id.toHexString(),

    alertType:
      alert.alertType,

    severity:
      alert.severity,

    visibility:
      alert.visibility,

    title:
      alert.title,

    details:
      accessLevel === 'SENSITIVE'
        ? alert.details
        : null,

    effectiveFrom:
      alert.effectiveFrom.toISOString(),

    effectiveTo:
      alert.effectiveTo?.toISOString() ??
      null,

    status:
      alert.status,

    resolvedAt:
      alert.resolvedAt?.toISOString() ??
      null,
  };
}

export function toPatientProfileDto(
  records:
    PatientProfileRecords,
  input: Readonly<{
    accessLevel: PatientQueryAccessLevel;
    canonicalization: CanonicalPatientResolution;
    now: Date;
  }>,
): PatientProfileDto {
  const patient =
    records.patient;

  const guardians =
    guardianById(
      records.guardians,
    );

  const alertDtos =
    records.alerts
      .map(
        (alert) =>
          toAlertDto(
            alert,
            input.accessLevel,
          ),
      )
      .filter(
        (
          alert,
        ): alert is PatientAlertDto =>
          alert !== null,
      );

  return {
    canonicalization:
      input.canonicalization,

    patient: {
      id:
        patient._id.toHexString(),

      enterprisePatientId:
        patient.enterprisePatientId,

      mrn:
        primaryMrn(
          records.identifiers,
        ).displayValue,

      displayName:
        patient.displayName,

      preferredName:
        patient.preferredName,

      firstName:
        patient.firstName,

      middleName:
        patient.middleName,

      lastName:
        patient.lastName,

      birth:
        birthSummary(
          {
            value:
              patient.birthDate.value,
            precision:
              patient.birthDate.precision,
            isApproximate:
              patient.birthDate.isApproximate,
            estimatedAgeYears:
              patient.birthDate.estimatedAgeYears,
          },
          input.accessLevel,
          input.now,
        ),

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

      isMinor:
        patient.isMinor,

      guardianRequirement:
        patient.guardianRequirement,

      status:
        patient.status,

      mergeState:
        patient.mergeState,

      identityReviewRequired:
        patient.identityReviewRequired,

      duplicateReviewRequired:
        patient.duplicateReviewRequired,

      registrationSource:
        patient.registrationSource,

      registeredAt:
        patient.registeredAt.toISOString(),

      version:
        patient.version,
    },

    identifiers:
      records.identifiers.map(
        (identifier) =>
          toIdentifierDto(
            identifier,
            input.accessLevel,
          ),
      ),

    contacts:
      records.contacts.map(
        (contact) =>
          toContactDto(
            contact,
            input.accessLevel,
          ),
      ),

    addresses:
      records.addresses.map(
        (address) =>
          toAddressDto(
            address,
            input.accessLevel,
          ),
      ),

    guardians:
      records.guardianRelationships
        .map(
          (relationship) => {
            const guardian =
              guardians.get(
                relationship.guardianId
                  .toHexString(),
              );

            return guardian ===
              undefined
              ? null
              : toGuardianDto(
                  relationship,
                  guardian,
                  input.accessLevel,
                );
          },
        )
        .filter(
          (
            guardian,
          ): guardian is PatientGuardianDto =>
            guardian !== null,
        ),

    alerts:
      alertDtos,
  };
}

export function toGuardianSearchItemDto(
  candidate:
    GuardianSearchCandidateRecord,
): GuardianSearchItemDto {
  return {
    id:
      candidate.guardian._id
        .toHexString(),

    enterpriseGuardianId:
      candidate.guardian
        .enterpriseGuardianId,

    displayName:
      candidate.guardian.displayName,

    cnicDisplayValue:
      candidate.guardian.cnicDisplayValue,

    phoneDisplayValue:
      candidate.guardian.phoneDisplayValue,

    status:
      candidate.guardian.status,

    activeRelationshipCount:
      candidate.activeRelationshipCount,

    minorPatientCount:
      candidate.minorPatientCount,

    version:
      candidate.guardian.version,
  };
}

export function toGuardianProfileDto(
  records:
    GuardianProfileRecords,
  accessLevel:
    PatientQueryAccessLevel,
): GuardianProfileDto {
  const guardian =
    records.guardian;

  const patientById =
    new Map(
      records.patients.map(
        (patient) => [
          patient._id.toHexString(),
          patient,
        ],
      ),
    );

  const mrnByPatientId =
    new Map(
      records.primaryMrns.map(
        (identifier) => [
          identifier.patientId
            .toHexString(),
          identifier.displayValue,
        ],
      ),
    );

  const sensitive =
    accessLevel === 'SENSITIVE';

  return {
    guardian: {
      id:
        guardian._id.toHexString(),

      enterpriseGuardianId:
        guardian.enterpriseGuardianId,

      displayName:
        guardian.displayName,

      firstName:
        guardian.firstName,

      middleName:
        guardian.middleName,

      lastName:
        guardian.lastName,

      cnic:
        sensitive
          ? guardian.cnicNormalized
          : guardian.cnicDisplayValue,

      cnicDisplayValue:
        guardian.cnicDisplayValue,

      phone:
        sensitive
          ? guardian.phoneNormalized
          : guardian.phoneDisplayValue,

      phoneDisplayValue:
        guardian.phoneDisplayValue,

      email:
        sensitive
          ? guardian.emailNormalized
          : null,

      dateOfBirth:
        sensitive
          ? guardian.dateOfBirth
              ?.toISOString() ??
            null
          : null,

      sexAtBirth:
        guardian.sexAtBirth,

      genderIdentity:
        guardian.genderIdentity,

      preferredLocale:
        guardian.preferredLocale,

      address: {
        line1:
          sensitive
            ? guardian.address.line1
            : null,

        line2:
          sensitive
            ? guardian.address.line2
            : null,

        city:
          guardian.address.city,

        district:
          guardian.address.district,

        province:
          guardian.address.province,

        postalCode:
          sensitive
            ? guardian.address.postalCode
            : null,

        countryCode:
          guardian.address.countryCode,
      },

      status:
        guardian.status,

      version:
        guardian.version,
    },

    patients:
      records.relationships
        .map(
          (relationship) => {
            const patient =
              patientById.get(
                relationship.patientId
                  .toHexString(),
              );

            if (patient === undefined) {
              return null;
            }

            return {
              relationshipId:
                relationship._id
                  .toHexString(),

              patientId:
                patient._id
                  .toHexString(),

              mrn:
                mrnByPatientId.get(
                  patient._id
                    .toHexString(),
                ) ??
                'UNAVAILABLE',

              displayName:
                patient.displayName,

              relationshipType:
                relationship.relationshipType,

              isPrimary:
                relationship.isPrimary,

              legalAuthorityStatus:
                relationship.legalAuthorityStatus,

              verificationStatus:
                relationship.verificationStatus,

              isActive:
                relationship.isActive,

              patientStatus:
                patient.status,

              isMinor:
                patient.isMinor,
            };
          },
        )
        .filter(
          (
            patient,
          ): patient is GuardianProfileDto['patients'][number] =>
            patient !== null,
        ),
  };
}